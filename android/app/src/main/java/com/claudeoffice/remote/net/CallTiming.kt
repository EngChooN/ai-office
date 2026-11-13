// 호출 한 번의 연결·첫 응답 시간을 디버그 로그로 남긴다 (연결이 재사용됐는지, 중계 경로처럼 느린지 가늠하는 용도)
// 주소·토큰·경로·헤더는 싣지 않는다 — 숫자(ms)와 재사용 여부만

package com.claudeoffice.remote.net

import android.util.Log
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Proxy
import okhttp3.Call
import okhttp3.EventListener
import okhttp3.Handshake
import okhttp3.Protocol

internal class CallTiming(private val label: String, private val sink: (String) -> Unit = { Log.d("CallTiming", it) }) : EventListener() {
    private var startNs = 0L
    private var connectStartNs = 0L
    private var connectMs = -1L
    private var tlsMs = -1L
    private var reused = true
    private var firstByteMs = -1L

    private fun ms(from: Long) = (System.nanoTime() - from) / 1_000_000

    override fun callStart(call: Call) { startNs = System.nanoTime() }

    override fun connectStart(call: Call, inetSocketAddress: InetSocketAddress, proxy: Proxy) {
        reused = false
        connectStartNs = System.nanoTime()
    }

    override fun secureConnectEnd(call: Call, handshake: Handshake?) {
        tlsMs = ms(connectStartNs)
    }

    override fun connectEnd(call: Call, inetSocketAddress: InetSocketAddress, proxy: Proxy, protocol: Protocol?) {
        connectMs = ms(connectStartNs)
    }

    override fun responseHeadersStart(call: Call) {
        if (firstByteMs < 0) firstByteMs = ms(startNs)
    }

    override fun callEnd(call: Call) = emit("ok")

    override fun callFailed(call: Call, ioe: IOException) = emit("fail:${ioe.javaClass.simpleName}")

    private fun emit(outcome: String) {
        try {
            sink("$label $outcome reused=$reused connect=${connectMs}ms tls=${tlsMs}ms firstByte=${firstByteMs}ms total=${ms(startNs)}ms")
        } catch (_: Throwable) {
            // 로그 때문에 호출이 깨지면 안 된다 (단위 시험의 Log 대역 등)
        }
    }
}
