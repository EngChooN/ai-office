// 이벤트 스트림(SSE) 줄 해석 — v2 규격 8-2절. 한 줄씩 넣으면 빈 줄에서 이벤트 하나를 돌려준다

package com.claudeoffice.remote.web

data class SseEvent(val id: String?, val event: String, val data: String)

class SseParser {
    private var id: String? = null
    private var event: String? = null
    private val data = StringBuilder()
    private var hasData = false

    /** 서버가 보낸 retry: 값 (밀리초) */
    var retryMs: Long? = null
        private set

    /** 마지막으로 받은 이벤트 id (재연결 때 Last-Event-ID). hello처럼 id 없는 이벤트는 바꾸지 않는다 */
    var lastEventId: String? = null
        private set

    fun feed(line: String): SseEvent? {
        if (line.isEmpty()) return dispatch()
        if (line.startsWith(":")) return null // 주석 (keep-alive)
        val colon = line.indexOf(':')
        val field = if (colon < 0) line else line.substring(0, colon)
        var value = if (colon < 0) "" else line.substring(colon + 1)
        if (value.startsWith(" ")) value = value.substring(1)
        when (field) {
            "id" -> if ('\u0000' !in value) id = value
            "event" -> event = value
            "data" -> {
                if (hasData) data.append('\n')
                data.append(value)
                hasData = true
            }
            "retry" -> value.toLongOrNull()?.let { retryMs = it }
        }
        return null
    }

    private fun dispatch(): SseEvent? {
        val out = if (hasData) SseEvent(id, event ?: "message", data.toString()) else null
        if (out?.id != null) lastEventId = out.id
        id = null
        event = null
        data.setLength(0)
        hasData = false
        return out
    }
}

/**
 * 다시 연결할 때까지 기다릴 시간 (8-4절): 1·2·4·8·16·30초(최대)에 ±20% 흔들기.
 * attempt는 0부터. random은 0..1
 */
fun reconnectDelayMs(attempt: Int, random: Double): Long {
    val base = listOf(1, 2, 4, 8, 16, 30).getOrElse(attempt) { 30 } * 1000L
    val jitter = 1.0 + (random * 0.4 - 0.2)
    return (base * jitter).toLong()
}

/** 60초 이상 이어졌던 연결이 끊기면 지연을 처음으로 되돌린다 */
const val SSE_STABLE_MS = 60_000L
