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
import com.claudeoffice.remote.store.MAX_PCS
import com.claudeoffice.remote.store.PcAdd
import com.claudeoffice.remote.store.PcBook
import com.claudeoffice.remote.store.BookGate
import com.claudeoffice.remote.store.PcBooks
import com.claudeoffice.remote.store.PcEntry
import com.claudeoffice.remote.store.SecureStore
import com.claudeoffice.remote.store.StopReason
import com.claudeoffice.remote.work.Notifier
import com.claudeoffice.remote.work.pinNotice
import com.claudeoffice.remote.work.PollWorker
import com.claudeoffice.remote.work.reconnectNotice
import com.claudeoffice.remote.work.forPc
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
    /** refreshed: 이미 저장된 같은 PC라 새 항목 없이 연결 정보만 새로 고쳤다 */
    data class Ok(val name: String, val refreshed: Boolean) : ConnectResult
    /** 새 PC를 넣으려는데 이미 3대 */
    data object Full : ConnectResult
    data class Failed(val error: ApiError, val tried: List<Endpoint> = emptyList()) : ConnectResult
}

sealed interface ActionResult {
    data class Done(val result: String) : ActionResult
    data class Failed(val error: ApiError) : ActionResult
}

/** PC 선택 목록의 한 줄 */
data class PcInfo(val id: String, val name: String, val alias: String, val address: String, val paused: Boolean, val pending: Int)

data class PcListState(val items: List<PcInfo> = emptyList(), val currentId: String? = null) {
    val isFull get() = items.size >= MAX_PCS
    val current get() = items.firstOrNull { it.id == currentId }
}

/** 연결 끊기 결과: 끊은 PC 이름과, 남은 PC가 있으면 이어서 보는 PC 이름 */
data class ForgetOutcome(val forgotten: String, val next: String?)

/** 기본 네트워크를 잃은 뒤 이만큼 기다려도 다른 망이 없으면 오프라인 표시 */
const val OFFLINE_GRACE_MS = 3000L

class OfficeRepository(private val context: Context) {
    private val secure = SecureStore(context)
    private val prefs = AppPrefs(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    /** 전환하면 새 자물쇠로 바꾼다 — 이전 PC의 느린 조회가 새 PC 조회를 붙잡지 않게 */
    private var refreshLock = Mutex()
    private val connectivity = context.getSystemService(ConnectivityManager::class.java)
    /** 저장된 PC 목록(최대 3대). 옛 버전의 1대 저장은 여기서 1번 PC로 옮긴다 */
    private val gate = BookGate()
    private var book: PcBook = secure.loadBook().also(::migrateLegacy)
    // conn·client는 "지금 화면에 붙은 PC" 하나. 다른 PC는 백그라운드 조회만 한다
    private var conn: Connection? = book.current?.conn
    private var client: RemoteClient? = book.current?.takeIf { it.conn.token.isNotEmpty() }?.let(::newClient)
    /** 429·503 뒤 자동 갱신을 미루는 시각 (휴대폰 시계) */
    private var pauseUntil = 0L
    /** 기본 네트워크가 (다시) 잡혔다는 신호 — 이벤트 스트림이 옛 소켓을 버리고 바로 다시 붙는다 */
    private val _networkAvailable = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val networkAvailable: SharedFlow<Unit> = _networkAvailable.asSharedFlow()
    private var offlineJob: Job? = null

    private val _state = MutableStateFlow(initialState())
    val state: StateFlow<OfficeState> = _state.asStateFlow()

    private val _pcs = MutableStateFlow(buildPcs())
    val pcs: StateFlow<PcListState> = _pcs.asStateFlow()

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
        if (book.entries.isNotEmpty()) PollWorker.schedule(context)
    }

    // 화면 갱신과 백그라운드 조회가 같은 "기억한 길"을 쓴다 (AppPrefs). 클라이언트마다 그 PC 전용 값에 묶어
    // 전환 중인 이전 PC의 늦은 응답이 새 PC 값에 섞이지 않게 한다
    // 기억한 길은 응답이 오는 시점에 그 PC가 아직 같은 연결일 때만 적는다 (끊은 PC의 값이 되살아나지 않게)
    private fun newClient(e: PcEntry): RemoteClient {
        val mem = AppPrefs(context, e.id).routeMemory
        val guarded = object : com.claudeoffice.remote.net.RouteMemory {
            override var preferred: com.claudeoffice.remote.net.Route?
                get() = mem.preferred
                set(v) { gate.locked { if (PcBooks.isLive(book, e)) mem.preferred = v } }
        }
        return RemoteClient(e.conn, ::isPhoneOnline, guarded)
    }

    private fun migrateLegacy(b: PcBook) {
        val first = b.entries.firstOrNull() ?: return
        prefs.pcId = b.currentId.orEmpty()
        if (prefs.migrateLegacy(first.id)) Notifier.cancelLegacy(context)
        // 웹 저장 공간은 지금까지 이 PC 하나만 썼다 — 주인으로 적어 둔다 (안 그러면 첫 실행 때 비워진다)
        if (b.entries.size == 1 && prefs.webStoragePc.isEmpty()) prefs.webStoragePc = first.id
    }

    private fun buildPcs(): PcListState {
        val now = System.currentTimeMillis()
        val items = book.entries.map { e ->
            val isCurrent = e.id == book.currentId
            val p = if (isCurrent) prefs else AppPrefs(context, e.id)
            val s = _state.value.takeIf { isCurrent }
            PcInfo(
                id = e.id,
                name = PcBooks.name(e),
                alias = e.alias,
                address = displayAddress(e.conn),
                paused = if (s != null) s.gate != null else p.stopReason != null || p.lockRetryAt > now + p.clockOffset,
                pending = s?.decisions?.total ?: p.pendingCount,
            )
        }
        return PcListState(items, book.currentId)
    }

    private fun publishPcs() {
        _pcs.value = buildPcs()
    }

    /** 이 PC가 이제 화면에 붙는 PC다 — 진행 중이던 이전 PC의 조회는 결과가 버려진다(client 비교) */
    private fun activate(e: PcEntry) {
        prefs.pcId = e.id
        conn = e.conn
        client = e.takeIf { it.conn.token.isNotEmpty() }?.let(::newClient)
        refreshLock = Mutex()
        pauseUntil = 0
        offlineJob?.cancel()
    }

    /** 끊은 PC의 보관 글을 지금 지운다 — 웹 화면이 열려 있지 않아도 같은 출처의 보이지 않는 WebView로 지운다 (다음 실행에 미루지 않음) */
    @android.annotation.SuppressLint("SetJavaScriptEnabled")
    private fun purgeWebDraft(pcId: String) {
        runCatching {
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                runCatching {
                    val wv = android.webkit.WebView(context)
                    wv.settings.javaScriptEnabled = true
                    wv.settings.domStorageEnabled = true
                    wv.webViewClient = object : android.webkit.WebViewClient() {
                        override fun onPageFinished(view: android.webkit.WebView, url: String?) {
                            view.evaluateJavascript(PcBooks.purgeDraftScript(pcId)) {
                                android.webkit.CookieManager.getInstance().flush()
                                view.destroy()
                            }
                        }
                    }
                    wv.loadDataWithBaseURL("https://${com.claudeoffice.remote.web.ASSET_HOST}/app/", "<html></html>", "text/html", "utf-8", null)
                }
            }
        }
    }

    private fun clearWebStorage() {
        runCatching { android.webkit.WebStorage.getInstance().deleteAllData() }
        prefs.webStoragePc = ""
    }

    /**
     * 웹 화면 저장 공간(localStorage)은 PC가 달라도 같은 출처다. 전환할 때 통째로 비우지 않는다 —
     * 화면이 주소의 pc 값을 보고 다른 PC의 설정만 지우고 글은 PC별로 남긴다 (web/lib/webOwner.ts)
     */
    fun webQuery(): String = PcBooks.webQuery(book)

    fun prepareWebStorage() {
        prefs.webStoragePc = book.currentId ?: return
    }

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
        if (conn == null) return Gate.NotConnected
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

    /** 스캔한 QR로 연결을 시도한다. GET /v1/status가 성공해야 저장한다. 같은 PC(인증서 확인값)면 갱신, 새 PC가 4번째면 거부 */
    suspend fun connect(qr: QrPayload): ConnectResult {
        val candidate = Connection(qr.host, qr.port, qr.token, qr.spki, qr.lan, qr.isLanOnly, qr.isTailscale)
        if (book.find(candidate.spki) == null && book.isFull) return ConnectResult.Full
        // 저장 전이라 기억한 길은 임시로 두고, 성공하면 prefs에 옮긴다
        val firstRoute = InMemoryRoute()
        val c = RemoteClient(candidate, ::isPhoneOnline, firstRoute)
        return when (val r = c.status()) {
            is ApiResult.Ok -> {
                val added = adopt(candidate) ?: return ConnectResult.Full
                prefs.routeMemory.preferred = firstRoute.preferred
                prefs.displayAddress = displayAddress(candidate)
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
                publishPcs()
                refreshDecisions()
                ConnectResult.Ok(PcBooks.name(added.first), added.second)
            }
            is ApiResult.Fail -> {
                // 잠김은 토큰이 맞을 수 있으니 저장해 두고 풀리면 이어서 붙는다
                if (r.error is ApiError.Locked) {
                    adopt(candidate) ?: return ConnectResult.Full
                    prefs.displayAddress = displayAddress(candidate)
                    _state.value = initialState()
                    publishPcs()
                    applyError(r.error, r.tried)
                }
                ConnectResult.Failed(r.error, r.tried)
            }
        }
    }

    /** 목록에 넣고(같은 PC면 갱신) 그 PC를 현재로 만든다. 그 PC의 옛 상태(멈춤·잠금)는 지워 다시 시작한다. 가득 차면 null */
    private fun adopt(candidate: Connection): Pair<PcEntry, Boolean>? = gate.locked { adoptLocked(candidate) }

    private fun adoptLocked(candidate: Connection): Pair<PcEntry, Boolean>? {
        val (nb, entry, refreshed) = when (val r = PcBooks.add(book, candidate, System.currentTimeMillis())) {
            PcAdd.Full -> return null
            is PcAdd.Added -> Triple(r.book, r.entry, false)
            is PcAdd.Updated -> Triple(r.book, r.entry, true)
        }
        secure.saveBook(nb)
        book = nb
        prefs.clearPc(entry.id)
        activate(entry)
        return entry to refreshed
    }

    /** "이 PC 연결 끊기" — 현재 PC의 열쇠·연결 정보·상태·알림만 지우고, 남은 PC가 있으면 첫 번째로 이어 간다. 없으면 처음 화면 */
    fun forget(): ForgetOutcome? = gate.locked { forgetLocked() }

    private fun forgetLocked(): ForgetOutcome? {
        val e = book.current ?: return null
        val nb = PcBooks.remove(book, e.id)
        // 새 목록을 먼저 저장하고 나서 지운다
        if (nb.entries.isEmpty()) secure.clear() else secure.saveBook(nb)
        book = nb
        prefs.clearPc(e.id)
        Notifier.cancelFor(context, e.slot)
        val next = nb.current
        if (next == null) {
            PollWorker.cancel(context)
            // 웹 저장소(보관 글 포함)와 주인 표시도 정리 — 안 그러면 다음에 연결하는 다른 PC에 이전 PC 글이 섞인다
            clearWebStorage()
            prefs.pcId = ""
            conn = null
            client = null
            refreshLock = Mutex()
            _state.value = OfficeState(gate = Gate.NotConnected)
        } else {
            purgeWebDraft(e.id)
            activate(next)
            _state.value = initialState()
            if (_state.value.gate == null) scope.launch { refresh() }
        }
        publishPcs()
        return ForgetOutcome(PcBooks.name(e), next?.let(PcBooks::name))
    }

    /** PC 바꾸기 — 이전 PC의 화면 값은 버리고 새 PC 값으로 다시 시작한다 (섞임 방지). 새 값이 오기 전에는 로딩 */
    fun switchTo(id: String) = gate.locked { switchToLocked(id) }

    private fun switchToLocked(id: String) {
        val e = book.find(id) ?: return
        if (id == book.currentId) return
        val nb = PcBooks.select(book, id)
        secure.saveBook(nb)
        book = nb
        activate(e)
        _state.value = initialState()
        publishPcs()
        if (_state.value.gate == null) scope.launch { refresh() }
    }

    /** 별칭 바꾸기 (20자까지, 비우면 기본 이름 "PC n") */
    fun rename(id: String, alias: String) {
        if (book.find(id) == null) return
        gate.locked { book = PcBooks.rename(book, id, alias) }
        secure.saveBook(book)
        publishPcs()
    }

    // ── 조회 ────────────────────────────────────────────

    /** 화면 갱신. 막는 상태(Gate)에서는 요청하지 않는다 — 다시 시도는 retry()로 */
    suspend fun refresh() {
        val c = client ?: return
        if (_state.value.gate != null) return
        if (System.currentTimeMillis() < pauseUntil) return
        // 기다리거나 응답을 받는 사이 PC가 바뀌었으면(client가 다르면) 이전 PC 결과는 버린다
        refreshLock.withLock {
            if (client !== c) return
            val wasDown = _state.value.reach != Reach.OK
            _state.update { it.copy(isLoading = true) }
            val s = c.status()
            if (client !== c) return
            if (s is ApiResult.Fail) {
                _state.update { it.copy(isLoading = false) }
                applyError(s.error, s.tried)
                return
            }
            onStatus((s as ApiResult.Ok).value)
            val d = c.decisions()
            if (client !== c) return
            if (d is ApiResult.Fail) {
                _state.update { it.copy(isLoading = false) }
                applyError(d.error, d.tried)
                return
            }
            onDecisions((d as ApiResult.Ok).value)
            _state.update { it.copy(isLoading = false, reach = Reach.OK, justRecovered = wasDown) }
        }
        if (_state.value.justRecovered && client === c) {
            delay(1500)
            _state.update { it.copy(justRecovered = false) }
        }
    }

    private suspend fun refreshDecisions() {
        val c = client ?: return
        val d0 = c.decisions()
        if (client !== c) return
        when (val d = d0) {
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
        prefs.pendingCount = d.total
        _state.update { it.copy(decisions = d) }
        publishPcs()
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
        val r0 = send(c)
        // 보내는 사이 PC를 바꿨으면 결과는 보낸 PC의 것이다 — 지금 화면 상태에는 손대지 않는다
        if (client !== c) return when (r0) {
            is ApiResult.Ok -> ActionResult.Done(r0.value.result)
            is ApiResult.Fail -> ActionResult.Failed(r0.error)
        }
        return when (val r = r0) {
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
        val r0 = c.instruct(staffId, text)
        if (client !== c) return when (r0) {
            is ApiResult.Ok -> ActionResult.Done("accepted")
            is ApiResult.Fail -> ActionResult.Failed(r0.error)
        }
        return when (val r = r0) {
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
                revoke(book.currentId)
                setGate(Gate.Revoked)
            }
            ApiError.Unauthorized -> {
                // 계속 시도하면 스스로 잠금을 부르므로 자동 조회를 멈춘다 (토큰은 새 QR을 찍을 때 바뀐다)
                recordStop(prefs, e)
                setGate(Gate.Unauthorized)
            }
            is ApiError.Locked -> {
                recordStop(prefs, e)
                setGate(Gate.Locked(e.retryAt))
            }
            ApiError.PinMismatch -> {
                recordStop(prefs, e)
                setGate(Gate.PinMismatch)
            }
            ApiError.NeedsAppUpdate -> {
                recordStop(prefs, e)
                setGate(Gate.NeedsAppUpdate)
            }
            ApiError.NeedsPcUpdate -> {
                recordStop(prefs, e)
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

    /** 자동 조회를 멈춰야 하는 오류를 그 PC의 값에 적는다 (현재 PC든 백그라운드로 본 다른 PC든 같은 규칙) */
    private fun recordStop(p: AppPrefs, e: ApiError) {
        when (e) {
            ApiError.TokenRevoked -> p.stopReason = StopReason.REVOKED
            ApiError.Unauthorized -> p.stopReason = StopReason.UNAUTHORIZED
            is ApiError.Locked -> p.lockRetryAt = e.retryAt
            ApiError.PinMismatch -> p.stopReason = StopReason.PIN_MISMATCH
            ApiError.NeedsAppUpdate -> p.stopReason = StopReason.NEEDS_APP_UPDATE
            ApiError.NeedsPcUpdate -> p.stopReason = StopReason.NEEDS_PC_UPDATE
            else -> Unit
        }
    }

    /** 토큰이 폐기된 PC: 저장된 열쇠를 지우고(이름·주소는 둔다) 그 PC의 자동 조회를 멈춘다 (규격 9절). 같은 QR을 다시 찍으면 그 항목이 갱신된다 */
    private fun revoke(id: String?) = gate.locked { revokeLocked(id) }

    private fun revokeLocked(id: String?) {
        id ?: return
        if (book.find(id) == null) return
        book = PcBooks.withoutToken(book, id)
        secure.saveBook(book)
        recordStop(AppPrefs(context, id), ApiError.TokenRevoked)
        if (id == book.currentId) {
            prefs.stopReason = StopReason.REVOKED
            conn = book.current?.conn
            client = null
        }
    }

    private fun setGate(g: Gate) {
        _state.update { it.copy(gate = g, isLoading = false) }
        publishPcs()
    }
    private fun setReach(r: Reach) = _state.update { it.copy(reach = r, isLoading = false) }

    // ── 백그라운드 조회 (PollWorker) ─────────────────────────

    /** 저장된 PC를 차례로 조회한다. 앱이 열려 있으면 현재 PC는 화면이 직접 갱신하므로 건너뛴다. 한 PC 실패가 다른 PC를 막지 않는다 */
    suspend fun backgroundPoll() {
        val isForeground = ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
        for (entry in book.entries.toList()) {
            val isCurrent = entry.id == book.currentId
            if (isCurrent && isForeground) continue
            try {
                pollOne(entry, isCurrent)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (_: Exception) {
            }
        }
        publishPcs()
    }

    private suspend fun pollOne(entry: PcEntry, isCurrent: Boolean) {
        if (entry.conn.token.isEmpty()) return
        // 조회 내내 이 PC 값에 묶인 저장소를 쓴다 — 현재 PC용 prefs는 전환 때 pcId가 바뀌어, 늦게 온 응답이 다른 PC 값을 덮을 수 있다
        val p = AppPrefs(context, entry.id)
        if (p.stopReason != null) return
        val serverNow = System.currentTimeMillis() + p.clockOffset
        if (p.lockRetryAt > serverNow) return
        val c = if (isCurrent) client ?: return else newClient(entry)
        val prefix = PcBooks.noticePrefix(book, entry)

        val r = c.decisions()
        // 검사와 알림·저장을 한 잠금으로 — 그 사이 연결 해제가 끼어들지 못한다. 끊겼거나 열쇠가 바뀐 PC의 결과는 버린다
        gate.locked { if (PcBooks.isLive(book, entry)) applyPoll(entry, isCurrent, c, p, prefix, r) }
    }

    private fun applyPoll(entry: PcEntry, isCurrent: Boolean, c: RemoteClient, p: AppPrefs, prefix: String?, r: ApiResult<DecisionsResponse>) {
        // 조회하는 사이 화면 PC가 바뀐 경우 화면 상태에는 손대지 않는다 (값은 그 PC의 prefs에만 적는다)
        val onScreen = isCurrent && client === c
        when (r) {
            is ApiResult.Ok -> {
                p.clockOffset = r.serverTime - System.currentTimeMillis()
                p.lastSuccessAt = System.currentTimeMillis()
                p.lockRetryAt = 0
                val fresh = newDecisions(r.value.decisions, p.notifiedIds)
                decisionNotice(fresh)?.let {
                    Notifier.showDecisions(context, it.forPc(prefix), entry)
                    if (!prefs.delayBannerDone) prefs.delayBannerPending = true
                }
                p.notifiedIds = r.value.decisions.map { it.id }.toSet()
                p.pendingCount = r.value.total
                if (onScreen) _state.update { it.copy(decisions = r.value, reach = Reach.OK, clockOffset = p.clockOffset, lastSuccessAt = p.lastSuccessAt) }
            }
            is ApiResult.Fail -> {
                val e = r.error
                if (onScreen) applyError(e, r.tried)
                else if (e == ApiError.TokenRevoked) revoke(entry.id)
                else recordStop(p, e)
                when (e) {
                    ApiError.TokenRevoked, ApiError.Unauthorized -> Notifier.showConnection(context, reconnectNotice().forPc(prefix), entry)
                    ApiError.PinMismatch -> Notifier.showConnection(context, pinNotice().forPc(prefix), entry)
                    is ApiError.Locked -> if (p.lockNotifiedFor != e.retryAt) {
                        p.lockNotifiedFor = e.retryAt
                        Notifier.showConnection(context, lockNotice(clockText(e.retryAt - p.clockOffset)).forPc(prefix), entry)
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

    /** 이벤트 스트림처럼 늦게 도착하는 신호: 그 신호를 낸 PC(client)가 아직 화면 PC일 때만 반영한다 (다른 PC의 키 폐기가 지금 PC 키를 지우지 않게) */
    fun applyV2ErrorFrom(from: RemoteClient?, e: ApiError, tried: List<Endpoint> = emptyList()) {
        if (from == null || client !== from) return
        applyV2Error(e, tried)
    }

    fun markReachableFrom(from: RemoteClient?) {
        if (from == null || client !== from) return
        markReachable()
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
            if (client !== c) return@also // 호출하는 사이 PC를 바꿨다 — 이전 PC의 결과로 지금 상태를 바꾸지 않는다
            if (it is ApiResult.Fail) applyV2Error(it.error, it.tried) else markReachable()
            if (method == "hello" && it is ApiResult.Ok) applyHello(it.value)
        }
    }

    /** hello가 알려 준 전용 모드·내부 주소로 저장값을 갱신한다 (QR 재스캔 없이 따라간다) */
    private fun applyHello(result: kotlinx.serialization.json.JsonElement) = gate.locked { applyHelloLocked(result) }

    private fun applyHelloLocked(result: kotlinx.serialization.json.JsonElement) {
        val updated = conn?.refreshedFromHello(result) ?: return
        val entry = (PcBooks.add(book, updated, 0) as? PcAdd.Updated) ?: return
        secure.saveBook(entry.book)
        book = entry.book
        conn = updated
        client = newClient(entry.entry)
        prefs.displayAddress = displayAddress(updated)
        _state.update { it.copy(address = prefs.displayAddress, isLanOnly = updated.isLanOnly, isTailscale = updated.isTailscale) }
    }

    suspend fun v2Upload(name: String, mime: String, bytes: ByteArray): ApiResult<kotlinx.serialization.json.JsonElement> {
        val c = client ?: return ApiResult.Fail(ApiError.Unauthorized)
        return c.v2Upload(name, mime, bytes).also {
            if (client !== c) return@also
            if (it is ApiResult.Fail) applyV2Error(it.error, it.tried) else markReachable()
        }
    }

    suspend fun v2File(id: String): ApiResult<com.claudeoffice.remote.net.FileBytes> {
        val c = client ?: return ApiResult.Fail(ApiError.Unauthorized)
        return c.v2File(id)
    }

    suspend fun v2Artifact(id: String, version: Int?): ApiResult<com.claudeoffice.remote.net.FileBytes> {
        val c = client ?: return ApiResult.Fail(ApiError.Unauthorized)
        return c.v2Artifact(id, version)
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
