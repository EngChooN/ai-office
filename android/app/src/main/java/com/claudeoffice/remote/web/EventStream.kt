// GET /v2/events를 붙잡고 있다가 끊기면 다시 붙는다 (v2 규격 8절). 지문 고정은 RemoteClient가 한다
// 화면이 보이는 동안만 연다 — 백그라운드 알림은 v1 15분 조회가 맡는다 (8-4절 마지막 줄)

package com.claudeoffice.remote.web

import com.claudeoffice.remote.net.ApiError
import com.claudeoffice.remote.net.ApiResult
import com.claudeoffice.remote.net.RemoteClient
import kotlin.random.Random
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

interface EventSink {
    /** snapshot·log·chat·focus·remoteStatus 그리고 모르는 이벤트 (화면이 무시) */
    fun onEvent(name: String, data: String)
    /** hello: resync가 true면 화면이 chatHistory·timeline으로 빈 구간을 다시 읽는다 */
    fun onHello(resync: Boolean)
    fun onState(state: String, reason: String? = null)
    /** 다시 붙지 말아야 하는 끝 (토큰 폐기·스위치 꺼짐·버전·잠금) */
    fun onFatal(error: ApiError)
}

class EventStream(
    private val client: () -> RemoteClient?,
    private val sink: EventSink,
    private val scope: CoroutineScope,
    private val now: () -> Long = System::currentTimeMillis,
    /** 화면이 알린 능력 — 붙을 때마다(재연결 포함) 헤더로 싣는다 */
    private val capabilities: () -> Set<String> = { emptySet() },
) {
    private var job: Job? = null
    private var lastEventId: String? = null
    /** 읽는 중인 스트림 — 멈출 때 닫아야 막혀 있던 읽기가 풀린다 */
    @Volatile private var current: okhttp3.Response? = null

    val isRunning: Boolean get() = job?.isActive == true

    /** 기다리는 중인 재연결을 깨우는 신호 (앱 복귀·네트워크 전환) */
    private val wake = Channel<Unit>(Channel.CONFLATED)
    @Volatile private var isKicked = false

    /**
     * 지금 바로 다시 붙는다 — 앱에 돌아왔거나 네트워크가 바뀌었을 때 (8-4절).
     * 기다리는 중이면 깨우고, 열려 있으면 닫는다(망이 바뀌면 옛 소켓은 조용히 죽어 45초 무소식까지 기다리게 된다). 지연은 처음으로
     */
    fun reconnectNow() {
        if (job?.isActive != true) return
        isKicked = true
        wake.trySend(Unit)
        runCatching { current?.close() }
    }

    fun start() {
        if (job?.isActive == true) return
        job = scope.launch { loop() }
    }

    fun stop() {
        job?.cancel()
        job = null
        runCatching { current?.close() }
        current = null
        sink.onState("closed")
    }

    private suspend fun loop() {
        var attempt = 0
        while (scope.isActive && job?.isActive != false) {
            val c = client() ?: return
            sink.onState("connecting")
            val opened = now()
            when (val r = c.v2Events(lastEventId, capabilities())) {
                is ApiResult.Ok -> {
                    sink.onState("open")
                    val bye = withContext(Dispatchers.IO) { read(r.value) }
                    // 오래 이어졌던 연결이면 지연을 처음으로
                    if (now() - opened >= SSE_STABLE_MS) attempt = 0
                    // 토큰 폐기만 끝. PC에서 원격을 껐다면(remote_disabled) 다시 켤 때까지 계속 붙어 본다
                    if (bye == "token_revoked") return sink.onFatal(ApiError.TokenRevoked)
                    sink.onState("reconnecting", bye)
                }
                is ApiResult.Fail -> when (val e = r.error) {
                    ApiError.TokenRevoked, ApiError.Unauthorized, ApiError.NeedsPcUpdate,
                    ApiError.NeedsAppUpdate, ApiError.PinMismatch, is ApiError.Locked -> return sink.onFatal(e)
                    is ApiError.RateLimited -> {
                        sink.onState("reconnecting", "rate_limited")
                        withTimeoutOrNull(e.retryAfterSec * 1000L) { wake.receive() }
                        continue
                    }
                    else -> sink.onState("reconnecting", e::class.simpleName)
                }
            }
            val wait = reconnectDelayMs(attempt++, Random.nextDouble())
            if (!isKicked) {
                wake.tryReceive() // 지난 신호가 남아 있으면 비운다
                withTimeoutOrNull(wait) { wake.receive() }
            }
            if (isKicked) {
                isKicked = false
                attempt = 0
            }
        }
    }

    /** 스트림을 끝까지 읽는다. bye 사유를 돌려준다 (그냥 끊기면 null) */
    private fun read(response: okhttp3.Response): String? = response.also { current = it }.use { res ->
        val source = res.body?.source() ?: return null
        val parser = SseParser()
        try {
            while (job?.isActive != false) {
                val line = source.readUtf8Line() ?: break
                val ev = parser.feed(line) ?: continue
                parser.lastEventId?.let { lastEventId = it }
                when (ev.event) {
                    "hello" -> sink.onHello(helloResync(ev.data))
                    "bye" -> return byeReason(ev.data)
                    else -> sink.onEvent(ev.event, ev.data)
                }
            }
        } catch (_: java.io.IOException) {
            // 45초 무소식(읽기 시간 초과)·네트워크 끊김 → 다시 연결
        }
        null
    }
}

internal fun helloResync(data: String): Boolean = try {
    val o = com.claudeoffice.remote.net.protocolJson.parseToJsonElement(data) as? JsonObject
    (o?.get("resync") as? JsonPrimitive)?.content == "true"
} catch (_: Exception) {
    true
}

internal fun byeReason(data: String): String = try {
    val o = com.claudeoffice.remote.net.protocolJson.parseToJsonElement(data) as? JsonObject
    (o?.get("reason") as? JsonPrimitive)?.content ?: "unknown"
} catch (_: Exception) {
    "unknown"
}

/** 끊김을 이만큼 이어서 못 붙으면 그때 화면에 알린다 — 그 안에 다시 붙으면 사용자는 끊긴 줄 모른다 */
const val DISCONNECT_GRACE_MS = 8_000L

/**
 * 스트림 상태를 화면(connection)에 알리는 길목. "open"은 바로, 끊김("connecting"·"reconnecting")은 유예 뒤에도 안 붙었을 때만.
 * 앱이 화면에서 멈춘 "closed"(사유 없음)는 끊김이 아니므로 알리지 않는다. 사유 있는 "closed"(토큰 폐기 등 끝)는 바로.
 * 한 번도 열리지 않은 첫 "connecting"은 바로 알린다 (화면의 기본값이라 표시가 없다)
 */
class GraceReporter(
    private val scope: CoroutineScope,
    private val graceMs: Long = DISCONNECT_GRACE_MS,
    private val emit: (state: String, reason: String?) -> Unit,
) {
    private var pending: Job? = null
    private var isOpen = false
    private var shown: String? = null

    /** 화면이 새로 떴다 (ready) — 화면은 "connecting"부터 다시 시작한다 */
    fun reset() {
        pending?.cancel(); pending = null
        isOpen = false
        shown = null
    }

    fun report(state: String, reason: String? = null) {
        when {
            state == "open" -> {
                pending?.cancel(); pending = null
                isOpen = true
                emit("open", null)
                shown = "open"
            }
            state == "closed" && reason == null -> { pending?.cancel(); pending = null }
            state == "closed" -> { pending?.cancel(); pending = null; isOpen = false; show(state, reason) }
            !isOpen -> show(state, reason)
            pending == null && shown == "open" -> {
                pending = scope.launch {
                    delay(graceMs)
                    pending = null
                    show(state, reason)
                }
            }
            shown != "open" -> show(state, reason)
        }
    }

    private fun show(state: String, reason: String?) {
        shown = state
        emit(state, reason)
    }
}
