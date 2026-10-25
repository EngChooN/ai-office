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
import kotlinx.coroutines.delay
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
                        delay(e.retryAfterSec * 1000L)
                        continue
                    }
                    else -> sink.onState("reconnecting", e::class.simpleName)
                }
            }
            delay(reconnectDelayMs(attempt++, Random.nextDouble()))
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
