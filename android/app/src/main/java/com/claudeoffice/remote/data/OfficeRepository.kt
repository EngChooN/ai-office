// 연결 계층: 화면은 state(Flow) 하나만 보고, connect·refresh·결정·지시·forget 함수만 부른다 (기획 6절)
// 오류는 여기서 "막는 화면(Gate)"과 "닿지 않음(Reach)"으로 나누고, 멈춰야 하는 오류는 백그라운드 조회도 멈춘다

package com.claudeoffice.remote.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import com.claudeoffice.remote.net.ApiError
import com.claudeoffice.remote.net.ApiResult
import com.claudeoffice.remote.net.Connection
import com.claudeoffice.remote.net.Decision
import com.claudeoffice.remote.net.Endpoint
import com.claudeoffice.remote.net.InMemoryRoute
import com.claudeoffice.remote.net.Route
import com.claudeoffice.remote.net.DecisionsResponse
import com.claudeoffice.remote.net.QrPayload
import com.claudeoffice.remote.net.RemoteClient
import com.claudeoffice.remote.net.refreshedFromHello
import com.claudeoffice.remote.net.StatusResponse
import com.claudeoffice.remote.store.AppPrefs
import com.claudeoffice.remote.store.SecureStore
import com.claudeoffice.remote.store.StopReason
import com.claudeoffice.remote.work.Notifier
import com.claudeoffice.remote.work.pinNotice
import com.claudeoffice.remote.work.PollWorker
import com.claudeoffice.remote.work.reconnectNotice
import com.claudeoffice.remote.work.decisionNotice
import com.claudeoffice.remote.work.lockNotice
import com.claudeoffice.remote.work.newDecisions
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** 화면 전체를 막는 상태 (하단 탭 숨김) */
sealed interface Gate {
    data object NotConnected : Gate
    data object Revoked : Gate                 // D
    data object Unauthorized : Gate            // E
    data class Locked(val retryAt: Long) : Gate // F (PC 시계 기준)
    data object PinMismatch : Gate             // G
    data object NeedsAppUpdate : Gate          // H
    data object NeedsPcUpdate : Gate           // H
    data class AppBug(val code: String) : Gate // L
    data class BadResponse(val path: String) : Gate // L' 응답 해석 실패 (원인 위치를 보인다)
}

/**
 * 전체 기능(v2) 상태 — v2 규격 2-1절 표.
 * ACTIVE면 PC 화면 모바일 빌드(WebView)를, 나머지는 기존 네이티브 화면(v1)과 안내를 보인다
 */
enum class V2Mode { UNKNOWN, NEED_PC_UPDATE, ACTIVE }

/** PC에 닿는지 (Gate가 없을 때만 의미 있음) */
enum class Reach { OK, REMOTE_OFF, UNREACHABLE, PHONE_OFFLINE, SERVER_ERROR, UNAVAILABLE }

data class OfficeState(
    val gate: Gate? = Gate.NotConnected,
    val reach: Reach = Reach.OK,
    val status: StatusResponse? = null,
    val decisions: DecisionsResponse? = null,
    val isLoading: Boolean = false,
    val lastSuccessAt: Long = 0,
    val clockOffset: Long = 0,
    val address: String = "",
    val serverVersion: String = "",
    /** 끊겼다가 회복된 직후 (초록 배너 1.5초) */
    val justRecovered: Boolean = false,
    /** 마지막 실패 때 시도한 주소들 (닿지 않음 화면에 보인다) */
    val tried: List<Endpoint> = emptyList(),
    /** 지금 쓰는 길 (같은 와이파이 / 외부) */
    val route: Route? = null,
    val v2: V2Mode = V2Mode.UNKNOWN,
    /** 같은 네트워크 전용 모드로 연결돼 있다 (닿지 않을 때 문구가 달라진다) */
    val isLanOnly: Boolean = false,
    val isTailscale: Boolean = false,
) {
    val serverNow get() = System.currentTimeMillis() + clockOffset
    val canAct get() = gate == null && reach == Reach.OK
}

sealed interface ConnectResult {
    data object Ok : ConnectResult
    data class Failed(val error: ApiError, val tried: List<Endpoint> = emptyList()) : ConnectResult
}

sealed interface ActionResult {
    data class Done(val result: String) : ActionResult
    data class Failed(val error: ApiError) : ActionResult
}

/** 기본 네트워크를 잃은 뒤 이만큼 기다려도 다른 망이 없으면 오프라인 표시 */
const val OFFLINE_GRACE_MS = 3000L

class OfficeRepository(private val context: Context) {
    private val secure = SecureStore(context)
    private val prefs = AppPrefs(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val refreshLock = Mutex()
    private val connectivity = context.getSystemService(ConnectivityManager::class.java)
    private var conn: Connection? = secure.load()
    private var client: RemoteClient? = conn?.let(::newClient)
    /** 429·503 뒤 자동 갱신을 미루는 시각 (휴대폰 시계) */
    private var pauseUntil = 0L
    /** 기본 네트워크가 (다시) 잡혔다는 신호 — 이벤트 스트림이 옛 소켓을 버리고 바로 다시 붙는다 */
    private val _networkAvailable = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val networkAvailable: SharedFlow<Unit> = _networkAvailable.asSharedFlow()
    private var offlineJob: Job? = null

    private val _state = MutableStateFlow(initialState())
    val state: StateFlow<OfficeState> = _state.asStateFlow()

    init {
        connectivity?.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                scope.launch {
                    offlineJob?.cancel()
                    _networkAvailable.tryEmit(Unit)
                    if (_state.value.reach == Reach.PHONE_OFFLINE) refresh()
                }
            }

            // 기본 네트워크를 잃었다 = 지금 쓸 수 있는 네트워크가 없다 (다른 망이 이어받으면 onAvailable이 뒤따른다).
            // 이 순간 activeNetwork는 아직 잃은 망을 돌려줄 수 있어 isPhoneOnline()으로 다시 확인하지 않는다
            // 와이파이↔LTE 전환은 잃자마자 다른 망이 이어받는다 — 잠깐은 기다렸다가 그래도 없을 때만 오프라인으로 본다
            override fun onLost(network: Network) {
                offlineJob?.cancel()
                offlineJob = scope.launch {
                    delay(OFFLINE_GRACE_MS)
                    if (_state.value.gate == null && !isPhoneOnline()) _state.update { it.copy(reach = Reach.PHONE_OFFLINE) }
                }
            }
        })
        if (conn != null && prefs.stopReason == null) PollWorker.schedule(context)
    }

    // 화면 갱신과 백그라운드 조회가 같은 "기억한 길"을 쓴다 (AppPrefs)
    private fun newClient(c: Connection) = RemoteClient(c, ::isPhoneOnline, prefs.routeMemory)

    fun isPhoneOnline(): Boolean {
        val cm = connectivity ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun initialState(): OfficeState {
        val offset = prefs.clockOffset
        val base = OfficeState(
            lastSuccessAt = prefs.lastSuccessAt,
            clockOffset = offset,
            address = prefs.displayAddress,
            serverVersion = prefs.serverVersion,
            v2 = if (prefs.v2Active) V2Mode.ACTIVE else V2Mode.UNKNOWN,
            isLanOnly = conn?.isLanOnly == true,
            isTailscale = conn?.isTailscale == true,
        )
        return base.copy(gate = gateFromPrefs(System.currentTimeMillis() + offset))
    }

    private fun gateFromPrefs(serverNow: Long): Gate? {
        val stop = prefs.stopReason
        if (conn == null) return if (stop == StopReason.REVOKED) Gate.Revoked else Gate.NotConnected
        return when (stop) {
            StopReason.REVOKED -> Gate.Revoked
            StopReason.UNAUTHORIZED -> Gate.Unauthorized
            StopReason.PIN_MISMATCH -> Gate.PinMismatch
            StopReason.NEEDS_APP_UPDATE -> Gate.NeedsAppUpdate
            StopReason.NEEDS_PC_UPDATE -> Gate.NeedsPcUpdate
            null -> prefs.lockRetryAt.takeIf { it > serverNow }?.let { Gate.Locked(it) }
        }
    }

    // ── 연결 ────────────────────────────────────────────

    /** 스캔한 QR로 연결을 시도한다. GET /v1/status가 성공해야 저장한다 */
    suspend fun connect(qr: QrPayload): ConnectResult {
        val candidate = Connection(qr.host, qr.port, qr.token, qr.spki, qr.lan, qr.isLanOnly, qr.isTailscale)
        // 저장 전이라 기억한 길은 임시로 두고, 성공하면 prefs에 옮긴다 (prefs.clear() 뒤에)
        val firstRoute = InMemoryRoute()
        val c = RemoteClient(candidate, ::isPhoneOnline, firstRoute)
        return when (val r = c.status()) {
            is ApiResult.Ok -> {
                secure.save(candidate)
                conn = candidate
                prefs.clear()
                prefs.routeMemory.preferred = firstRoute.preferred
                client = newClient(candidate)
                prefs.displayAddress = displayAddress(candidate)
                pauseUntil = 0
                onStatus(r.value)
                _state.value = OfficeState(
                    gate = null,
                    status = r.value,
                    lastSuccessAt = prefs.lastSuccessAt,
                    clockOffset = prefs.clockOffset,
                    address = prefs.displayAddress,
                    serverVersion = prefs.serverVersion,
                    isLanOnly = candidate.isLanOnly,
                    isTailscale = candidate.isTailscale,
                )
                PollWorker.schedule(context)
                refreshDecisions()
                ConnectResult.Ok
            }
            is ApiResult.Fail -> {
                // 잠김은 토큰이 맞을 수 있으니 저장해 두고 풀리면 이어서 붙는다
                if (r.error is ApiError.Locked) {
                    secure.save(candidate)
                    conn = candidate
                    prefs.clear()
                    client = newClient(candidate)
                    prefs.displayAddress = displayAddress(candidate)
                    _state.update { it.copy(address = prefs.displayAddress, isLanOnly = candidate.isLanOnly, isTailscale = candidate.isTailscale) }
                    applyError(r.error, r.tried)
                }
                ConnectResult.Failed(r.error, r.tried)
            }
        }
    }

    /** "이 PC와 연결 끊기" — 기기에서 열쇠(토큰)와 연결 정보를 지우고 자동 확인을 멈춘다 */
    fun forget() {
        PollWorker.cancel(context)
        secure.clear()
        prefs.clear()
        Notifier.cancelAll(context)
        conn = null
        client = null
        _state.value = OfficeState(gate = Gate.NotConnected)
    }

    // ── 조회 ────────────────────────────────────────────

    /** 화면 갱신. 막는 상태(Gate)에서는 요청하지 않는다 — 다시 시도는 retry()로 */
    suspend fun refresh() {
        val c = client ?: return
        if (_state.value.gate != null) return
        if (System.currentTimeMillis() < pauseUntil) return
        refreshLock.withLock {
            val wasDown = _state.value.reach != Reach.OK
            _state.update { it.copy(isLoading = true) }
            val s = c.status()
            if (s is ApiResult.Fail) {
                _state.update { it.copy(isLoading = false) }
                applyError(s.error, s.tried)
                return
            }
            onStatus((s as ApiResult.Ok).value)
            val d = c.decisions()
            if (d is ApiResult.Fail) {
                _state.update { it.copy(isLoading = false) }
                applyError(d.error, d.tried)
                return
            }
            onDecisions((d as ApiResult.Ok).value)
            _state.update { it.copy(isLoading = false, reach = Reach.OK, justRecovered = wasDown) }
        }
        if (_state.value.justRecovered) {
            delay(1500)
            _state.update { it.copy(justRecovered = false) }
        }
    }

    private suspend fun refreshDecisions() {
        val c = client ?: return
        when (val d = c.decisions()) {
            is ApiResult.Ok -> onDecisions(d.value)
            is ApiResult.Fail -> applyError(d.error, d.tried)
        }
    }

    /** 상태 화면의 "다시 시도": 잠김이 풀렸거나, 버전·앱 오류·닿지 않음 화면에서 */
    suspend fun retry() {
        val gate = _state.value.gate
        when (gate) {
            is Gate.Locked -> if (gate.retryAt > _state.value.serverNow) return else prefs.lockRetryAt = 0
            Gate.NeedsAppUpdate, Gate.NeedsPcUpdate -> prefs.stopReason = null
            is Gate.AppBug, is Gate.BadResponse -> Unit
            null -> Unit
            // 토큰 폐기·인증 실패·인증서 불일치는 새 QR로만 풀린다
            else -> return
        }
        pauseUntil = 0
        _state.update { it.copy(gate = if (conn == null) Gate.NotConnected else null, reach = Reach.OK) }
        if (conn != null) {
            PollWorker.schedule(context)
            refresh()
        }
    }

    private fun onStatus(s: StatusResponse) {
        val offset = s.serverTime - System.currentTimeMillis()
        prefs.clockOffset = offset
        prefs.lastSuccessAt = System.currentTimeMillis()
        prefs.serverVersion = s.serverVersion
        _state.update {
            it.copy(
                status = s, clockOffset = offset, lastSuccessAt = prefs.lastSuccessAt, serverVersion = s.serverVersion,
                reach = Reach.OK, tried = emptyList(), route = prefs.routeMemory.preferred, v2 = v2ModeOf(s).also { prefs.v2Active = it == V2Mode.ACTIVE },
            )
        }
    }

    private fun onDecisions(d: DecisionsResponse) {
        // 화면에 보인 결정은 알린 것으로 친다 (백그라운드 알림 중복 방지)
        prefs.notifiedIds = d.decisions.map { it.id }.toSet()
        _state.update { it.copy(decisions = d) }
    }

    // ── 결정·지시 ───────────────────────────────────────

    suspend fun approve(d: Decision) = act(d.id) { it.approve(d.id) }
    suspend fun reject(d: Decision) = act(d.id) { it.reject(d.id) }
    suspend fun skip(d: Decision) = act(d.id) { it.skip(d.id) }
    suspend fun answer(d: Decision, answers: Map<String, String>) = act(d.id) { it.answer(d.id, answers) }
    suspend fun reviewPlan(d: Decision, isApproved: Boolean, feedback: String) =
        act(d.id) { it.reviewPlan(d.id, isApproved, feedback) }

    private suspend fun act(id: String, send: suspend (RemoteClient) -> ApiResult<com.claudeoffice.remote.net.DecideResponse>): ActionResult {
        val c = client ?: return ActionResult.Failed(ApiError.Unauthorized)
        return when (val r = send(c)) {
            is ApiResult.Ok -> {
                removeDecision(id)
                scope.launch { refresh() }
                ActionResult.Done(r.value.result)
            }
            is ApiResult.Fail -> {
                // 승인 거부(review_on_pc)도 목록을 새로 읽어 isTruncated가 붙은 카드로 바꾼다
                if (r.error == ApiError.AlreadyDecided || r.error == ApiError.InvalidAction || r.error == ApiError.ReviewOnPc) scope.launch {
                    if (r.error == ApiError.AlreadyDecided) delay(1500)
                    refresh()
                }
                applyError(r.error, r.tried)
                ActionResult.Failed(r.error)
            }
        }
    }

    suspend fun instruct(staffId: String, text: String): ActionResult {
        val c = client ?: return ActionResult.Failed(ApiError.Unauthorized)
        return when (val r = c.instruct(staffId, text)) {
            is ApiResult.Ok -> {
                scope.launch { refresh() }
                ActionResult.Done("accepted")
            }
            is ApiResult.Fail -> {
                if (r.error == ApiError.StaffNotFound) scope.launch { refresh() }
                applyError(r.error, r.tried)
                ActionResult.Failed(r.error)
            }
        }
    }

    private fun removeDecision(id: String) = _state.update { s ->
        val d = s.decisions ?: return@update s
        s.copy(decisions = d.copy(decisions = d.decisions.filterNot { it.id == id }, total = (d.total - 1).coerceAtLeast(0)))
    }

    // ── 오류 처리 (규격 7절 ↔ 디자인 6절) ───────────────────

    private fun applyError(e: ApiError, tried: List<Endpoint> = emptyList()) {
        if (tried.isNotEmpty()) _state.update { it.copy(tried = tried) }
        when (e) {
            ApiError.TokenRevoked -> {
                // 저장된 토큰 삭제, 재시도·백그라운드 조회 중단 (규격 9절)
                secure.clear()
                conn = null
                client = null
                PollWorker.cancel(context)
                prefs.stopReason = StopReason.REVOKED
                setGate(Gate.Revoked)
            }
            ApiError.Unauthorized -> {
                // 계속 시도하면 스스로 잠금을 부르므로 자동 조회를 멈춘다 (토큰은 새 QR을 찍을 때 바뀐다)
                prefs.stopReason = StopReason.UNAUTHORIZED
                setGate(Gate.Unauthorized)
            }
            is ApiError.Locked -> {
                prefs.lockRetryAt = e.retryAt
                setGate(Gate.Locked(e.retryAt))
            }
            ApiError.PinMismatch -> {
                prefs.stopReason = StopReason.PIN_MISMATCH
                setGate(Gate.PinMismatch)
            }
            ApiError.NeedsAppUpdate -> {
                prefs.stopReason = StopReason.NEEDS_APP_UPDATE
                setGate(Gate.NeedsAppUpdate)
            }
            ApiError.NeedsPcUpdate -> {
                prefs.stopReason = StopReason.NEEDS_PC_UPDATE
                setGate(Gate.NeedsPcUpdate)
            }
            is ApiError.AppBug -> setGate(Gate.AppBug(e.code))
            is ApiError.BadResponse -> setGate(Gate.BadResponse(e.path))
            ApiError.PhoneOffline, ApiError.RemoteOff, ApiError.Unreachable, ApiError.ServerError ->
                setReach(reachAfterError(_state.value.reach, e))
            is ApiError.Unavailable -> {
                pauseUntil = System.currentTimeMillis() + e.retryAfterSec * 1000L
                setReach(reachAfterError(_state.value.reach, e))
            }
            is ApiError.RateLimited -> pauseUntil = System.currentTimeMillis() + e.retryAfterSec * 1000L
            // 입력·결정 단위 오류는 화면이 메시지로 처리한다
            // v2 경로의 오류는 applyV2Error가 먼저 거른다. 여기 오면 v1 화면 안내만 바꾼다
            is ApiError.Remote -> Unit
            ApiError.InvalidRequest, ApiError.InvalidAction, ApiError.ReviewOnPc, ApiError.StaffNotFound,
            ApiError.AlreadyDecided, ApiError.PayloadTooLarge -> Unit
        }
    }

    private fun setGate(g: Gate) = _state.update { it.copy(gate = g, isLoading = false) }
    private fun setReach(r: Reach) = _state.update { it.copy(reach = r, isLoading = false) }

    // ── 백그라운드 조회 (PollWorker) ─────────────────────────

    suspend fun backgroundPoll() {
        val c = client ?: return
        if (prefs.stopReason != null) return
        val serverNow = System.currentTimeMillis() + prefs.clockOffset
        if (prefs.lockRetryAt > serverNow) return
        val isForeground = ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
        if (isForeground) return // 앱이 열려 있으면 화면이 직접 갱신한다

        when (val r = c.decisions()) {
            is ApiResult.Ok -> {
                prefs.clockOffset = r.serverTime - System.currentTimeMillis()
                prefs.lastSuccessAt = System.currentTimeMillis()
                prefs.lockRetryAt = 0
                val fresh = newDecisions(r.value.decisions, prefs.notifiedIds)
                decisionNotice(fresh)?.let {
                    Notifier.showDecisions(context, it)
                    if (!prefs.delayBannerDone) prefs.delayBannerPending = true
                }
                prefs.notifiedIds = r.value.decisions.map { it.id }.toSet()
                _state.update { it.copy(decisions = r.value, reach = Reach.OK, clockOffset = prefs.clockOffset, lastSuccessAt = prefs.lastSuccessAt) }
            }
            is ApiResult.Fail -> {
                val e = r.error
                applyError(e, r.tried)
                when (e) {
                    ApiError.TokenRevoked, ApiError.Unauthorized -> Notifier.showConnection(context, reconnectNotice())
                    ApiError.PinMismatch -> Notifier.showConnection(context, pinNotice())
                    is ApiError.Locked -> if (prefs.lockNotifiedFor != e.retryAt) {
                        prefs.lockNotifiedFor = e.retryAt
                        Notifier.showConnection(context, lockNotice(clockText(e.retryAt - prefs.clockOffset)))
                    }
                    else -> Unit
                }
            }
        }
    }

    // ── 지연 안내 배너 (첫 백그라운드 알림 뒤 1회) ─────────────

    fun takeDelayBanner(): Boolean {
        if (!prefs.delayBannerPending || prefs.delayBannerDone) return false
        prefs.delayBannerPending = false
        prefs.delayBannerDone = true
        return true
    }

    // ── v2: PC 화면 전체 (WebView 셸이 부른다) ────────────────

    fun currentClient(): RemoteClient? = client

    /** v2 오류 중 앱 상태를 바꾸는 것만 반영하고, 나머지는 화면에 그대로 돌려준다 */
    fun applyV2Error(e: ApiError, tried: List<Endpoint> = emptyList()) {
        when (e) {
            // v2만 모르는 PC (v1 화면은 계속 쓸 수 있다) — "PC 앱을 0.9.0으로 업데이트" 안내
            ApiError.NeedsPcUpdate -> _state.update { it.copy(v2 = V2Mode.NEED_PC_UPDATE) }
            is ApiError.Remote, is ApiError.RateLimited -> Unit
            else -> applyError(e, tried)
        }
    }

    /**
     * PC에 닿았다 (v2 호출 성공·이벤트 스트림 열림). 웹 화면 모드에서는 v1 30초 조회가 돌지 않으므로
     * 여기서 "닿지 않음"을 지워야 한다 — 안 지우면 다시 연결돼도 끊김 배너가 남는다
     */
    fun markReachable() {
        if (_state.value.reach == Reach.OK) return
        _state.update { it.copy(reach = reachAfterSuccess(it.reach), tried = emptyList(), lastSuccessAt = System.currentTimeMillis()) }
    }

    suspend fun v2Call(method: String, args: kotlinx.serialization.json.JsonArray, confirm: Boolean, key: String, capabilities: Set<String> = emptySet()): ApiResult<kotlinx.serialization.json.JsonElement> {
        val c = client ?: return ApiResult.Fail(ApiError.Unauthorized)
        return c.v2Call(method, args, confirm, key, capabilities).also {
            if (it is ApiResult.Fail) applyV2Error(it.error, it.tried) else markReachable()
            if (method == "hello" && it is ApiResult.Ok) applyHello(it.value)
        }
    }

    /** hello가 알려 준 전용 모드·내부 주소로 저장값을 갱신한다 (QR 재스캔 없이 따라간다) */
    @Synchronized
    private fun applyHello(result: kotlinx.serialization.json.JsonElement) {
        val updated = conn?.refreshedFromHello(result) ?: return
        secure.save(updated)
        conn = updated
        client = newClient(updated)
        prefs.displayAddress = displayAddress(updated)
        _state.update { it.copy(address = prefs.displayAddress, isLanOnly = updated.isLanOnly, isTailscale = updated.isTailscale) }
    }

    suspend fun v2Upload(name: String, mime: String, bytes: ByteArray): ApiResult<kotlinx.serialization.json.JsonElement> {
        val c = client ?: return ApiResult.Fail(ApiError.Unauthorized)
        return c.v2Upload(name, mime, bytes).also { if (it is ApiResult.Fail) applyV2Error(it.error, it.tried) else markReachable() }
    }

    suspend fun v2File(id: String): ApiResult<com.claudeoffice.remote.net.FileBytes> {
        val c = client ?: return ApiResult.Fail(ApiError.Unauthorized)
        return c.v2File(id)
    }

    companion object {
        /**
         * v2 규격 2-1절: supportedProtocols가 권위. 없으면 [1].
         * "휴대폰에서 모든 기능 쓰기" 스위치는 대표 결정으로 없어졌다 — v2를 아는 PC면 바로 전체 화면
         */
        fun v2ModeOf(s: StatusResponse): V2Mode = when {
            2 !in s.supportedProtocols -> V2Mode.NEED_PC_UPDATE
            else -> V2Mode.ACTIVE
        }

        fun displayAddress(c: Connection) = if (':' in c.host) "[${c.host}]:${c.port}" else "${c.host}:${c.port}"
        fun clockText(localMillis: Long): String = SimpleDateFormat("HH:mm", Locale.US).format(Date(localMillis))
    }
}
