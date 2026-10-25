package com.claudeoffice.remote

import com.claudeoffice.remote.net.ApiError
import com.claudeoffice.remote.net.ApiResult
import com.claudeoffice.remote.net.Connection
import com.claudeoffice.remote.net.Endpoint
import com.claudeoffice.remote.net.InMemoryRoute
import com.claudeoffice.remote.net.QrParse
import com.claudeoffice.remote.net.RemoteClient
import com.claudeoffice.remote.net.Route
import com.claudeoffice.remote.net.canTryNextAddress
import com.claudeoffice.remote.net.endpoints
import com.claudeoffice.remote.net.parseQr
import com.claudeoffice.remote.net.spkiPin
import com.claudeoffice.remote.ui.triedText
import java.net.ConnectException
import java.net.ServerSocket
import java.net.SocketTimeoutException
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** QR lan(같은 와이파이 주소) → host(외부 주소) 순서로 시도하고, 닿은 길을 기억한다. 두 주소 모두 같은 지문으로 고정 */
class LanFallbackTest {
    init { TestStrings.install() }

    private val token = "A".repeat(42) + "b"
    private val spki = "sha256/" + "x".repeat(43) + "="

    // ── QR lan 파싱 ──────────────────────────────────────

    private fun qr(lan: String?) =
        """{"v":1,"host":"203.0.113.10","port":47900,"token":"$token","spki":"$spki"${if (lan != null) ""","lan":$lan""" else ""}}"""

    private fun lanOf(text: String) = ((parseQr(text) as QrParse.Ok).payload).lan

    @Test fun lanAcceptsPrivateIpv4Only() {
        assertEquals("192.168.0.24", lanOf(qr("\"192.168.0.24\"")))
        assertEquals("10.1.2.3", lanOf(qr("\"10.1.2.3\"")))
        assertEquals("172.16.0.9", lanOf(qr("\"172.16.0.9\"")))
        assertEquals("172.31.255.1", lanOf(qr("\"172.31.255.1\"")))
    }

    @Test fun badLanIsIgnoredButQrStillWorks() {
        listOf("\"203.0.113.5\"", "\"8.8.8.8\"", "\"172.32.0.1\"", "\"127.0.0.1\"", "\"192.168.0.256\"",
            "\"192.168.01.2\"", "\"myoffice.local\"", "\"fe80::1\"", "19216801", "null").forEach {
            assertNull(it, lanOf(qr(it)))
        }
    }

    @Test fun missingLanMeansExternalOnly() {
        assertNull(lanOf(qr(null)))
        val c = Connection("203.0.113.10", 47900, token, spki)
        assertEquals(listOf(Route.EXTERNAL), c.endpoints().map { it.route })
        assertEquals(listOf(Route.LAN, Route.EXTERNAL), c.copy(lan = "192.168.0.24").endpoints().map { it.route })
    }

    // ── 실제 TLS로 주소 넘어가기 ────────────────────────────

    private val pcCert = HeldCertificate.Builder().commonName("Claude Office").ecdsa256().build()
    private val strangerCert = HeldCertificate.Builder().commonName("Claude Office").ecdsa256().build()
    private lateinit var lanServer: MockWebServer
    private lateinit var externalServer: MockWebServer
    private val status = """{"protocolVersion":1,"serverTime":1790000000000,"serverVersion":"0.8.0","staff":[],"summary":{}}"""

    private fun https(cert: HeldCertificate) = MockWebServer().apply {
        useHttps(HandshakeCertificates.Builder().heldCertificate(cert).build().sslSocketFactory(), false)
        start()
    }

    @Before fun setUp() {
        lanServer = https(pcCert)
        externalServer = https(pcCert)
    }

    @After fun tearDown() {
        lanServer.shutdown()
        externalServer.shutdown()
    }

    private fun closedPort() = ServerSocket(0).use { it.localPort }

    private fun client(memory: InMemoryRoute, lanPort: Int, externalPort: Int) = RemoteClient(
        Connection("127.0.0.1", externalPort, token, spkiPin(pcCert.certificate), lan = "127.0.0.1"),
        isPhoneOnline = { true },
        memory = memory,
        endpoints = listOf(Endpoint(Route.LAN, "127.0.0.1", lanPort), Endpoint(Route.EXTERNAL, "127.0.0.1", externalPort)),
    )

    @Test fun triesLanFirstAndRemembersIt() = runBlocking {
        lanServer.enqueue(MockResponse().setBody(status))
        val memory = InMemoryRoute()
        assertTrue(client(memory, lanServer.port, externalServer.port).status() is ApiResult.Ok)
        assertEquals(Route.LAN, memory.preferred)
        assertEquals(1, lanServer.requestCount)
        assertEquals(0, externalServer.requestCount)
    }

    @Test fun fallsBackToExternalWhenLanFailsAndRemembersIt() = runBlocking {
        externalServer.enqueue(MockResponse().setBody(status))
        val memory = InMemoryRoute()
        assertTrue(client(memory, closedPort(), externalServer.port).status() is ApiResult.Ok)
        assertEquals(Route.EXTERNAL, memory.preferred)
    }

    @Test fun rememberedRouteGoesFirstThenSwitchesWhenItFails() = runBlocking {
        // 기억한 길(외부)이 먼저
        lanServer.enqueue(MockResponse().setBody(status))
        externalServer.enqueue(MockResponse().setBody(status))
        val memory = InMemoryRoute(Route.EXTERNAL)
        assertTrue(client(memory, lanServer.port, externalServer.port).status() is ApiResult.Ok)
        assertEquals(0, lanServer.requestCount)
        assertEquals(1, externalServer.requestCount)
        // 외부가 닿지 않게 되면 같은 와이파이 주소로 바꾸고 기억을 갈아 끼운다
        val deadExternal = closedPort()
        assertTrue(client(memory, lanServer.port, deadExternal).status() is ApiResult.Ok)
        assertEquals(Route.LAN, memory.preferred)
        assertEquals(1, lanServer.requestCount)
    }

    @Test fun bothAddressesAreReportedWhenNeitherAnswers() = runBlocking {
        val r = client(InMemoryRoute(), closedPort(), closedPort()).status() as ApiResult.Fail
        assertEquals(ApiError.RemoteOff, r.error)
        assertEquals(listOf(Route.LAN, Route.EXTERNAL), r.tried.map { it.route })
        val text = triedText(r.tried)!!
        assertTrue(text, text.startsWith("같은 와이파이 주소(127.0.0.1:") && text.contains("·외부 주소(") && text.endsWith("모두 닿지 않았어요"))
        assertFalse(text, text.contains(token))
    }

    @Test fun lanAddressIsPinnedTooAndNeverGetsTheToken() = runBlocking {
        // 같은 와이파이 주소에 다른 인증서를 쓰는 기기가 있으면 거부하고 외부 주소로 간다 (우회 없음)
        val stranger = https(strangerCert)
        try {
            externalServer.enqueue(MockResponse().setBody(status))
            stranger.enqueue(MockResponse().setBody(status))
            val memory = InMemoryRoute()
            assertTrue(client(memory, stranger.port, externalServer.port).status() is ApiResult.Ok)
            assertEquals(0, stranger.requestCount)
            assertEquals(Route.EXTERNAL, memory.preferred)
            // 외부도 닿지 않으면 지문 불일치로 보인다
            val r = client(InMemoryRoute(), stranger.port, closedPort()).status() as ApiResult.Fail
            assertEquals(ApiError.PinMismatch, r.error)
            assertEquals(0, stranger.requestCount)
        } finally {
            stranger.shutdown()
        }
    }

    @Test fun anyHttpAnswerStopsTheSearch() = runBlocking {
        // 같은 와이파이 주소에서 401을 받았으면 PC에 닿은 것 — 외부 주소로 다시 보내지 않는다
        lanServer.enqueue(MockResponse().setResponseCode(401).setBody("""{"protocolVersion":1,"error":"token_revoked"}"""))
        val r = client(InMemoryRoute(), lanServer.port, externalServer.port).status() as ApiResult.Fail
        assertEquals(ApiError.TokenRevoked, r.error)
        assertEquals(0, externalServer.requestCount)
    }

    @Test fun postIsResentOnlyWhenItSurelyNeverArrived() {
        assertTrue(canTryNextAddress(ConnectException("refused"), isPost = true))
        assertTrue(canTryNextAddress(SocketTimeoutException("connect timed out"), isPost = true))
        // 읽는 중 시간 초과는 PC가 이미 받았을 수 있다 → 지시가 두 번 가지 않게 다시 보내지 않는다
        assertFalse(canTryNextAddress(SocketTimeoutException("timeout"), isPost = true))
        assertTrue(canTryNextAddress(SocketTimeoutException("timeout"), isPost = false))
    }
}
