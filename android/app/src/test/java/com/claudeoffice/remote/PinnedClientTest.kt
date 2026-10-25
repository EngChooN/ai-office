package com.claudeoffice.remote

import com.claudeoffice.remote.net.ApiError
import com.claudeoffice.remote.net.ApiResult
import com.claudeoffice.remote.net.Connection
import com.claudeoffice.remote.net.RemoteClient
import com.claudeoffice.remote.net.spkiPin
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** 실제 TLS로 지문 고정을 확인한다 (자체 서명 ECDSA P-256 — PC 서버와 같은 종류) */
class PinnedClientTest {
    private val serverCert = HeldCertificate.Builder().commonName("Claude Office").ecdsa256().build()
    private val otherCert = HeldCertificate.Builder().commonName("Claude Office").ecdsa256().build()
    private lateinit var server: MockWebServer
    private val token = "T".repeat(43)

    @Before fun setUp() {
        server = MockWebServer()
        server.useHttps(HandshakeCertificates.Builder().heldCertificate(serverCert).build().sslSocketFactory(), false)
        server.start()
    }

    @After fun tearDown() = server.shutdown()

    private fun client(pin: String) = RemoteClient(Connection(server.hostName, server.port, token, pin), isPhoneOnline = { true })

    private val statusJson = """{"protocolVersion":1,"serverTime":1790000000000,"serverVersion":"0.8.0",
        "staff":[{"id":"kim","name":"김기획","role":"기획자","avatar":3,"status":"waiting","activity":"a","statusSince":1,"pendingDecisions":1,"newField":true}],
        "summary":{"working":0,"waiting":1,"error":0,"idle":0,"offline":0},"extra":{"x":1}}"""

    @Test fun connectsWhenPinMatchesAndSendsBearerHeader() = runBlocking {
        server.enqueue(MockResponse().setBody(statusJson))
        val r = client(spkiPin(serverCert.certificate)).status()
        assertTrue(r is ApiResult.Ok)
        val ok = r as ApiResult.Ok
        assertEquals("김기획", ok.value.staff.single().name)
        assertEquals(1790000000000, ok.serverTime)
        val req = server.takeRequest()
        assertEquals("/v1/status", req.path)
        assertEquals("Bearer $token", req.getHeader("Authorization"))
    }

    @Test fun refusesWhenPinDiffersAndNeverSendsTheToken() = runBlocking {
        server.enqueue(MockResponse().setBody(statusJson))
        val r = client(spkiPin(otherCert.certificate)).status()
        assertEquals(ApiError.PinMismatch, (r as ApiResult.Fail).error)
        assertEquals(0, server.requestCount)
    }

    @Test fun decisionIdIsSentAsOneOpaquePathSegment() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"protocolVersion":1,"serverTime":1,"decisionId":"a.kim:ap1","result":"approved"}"""))
        val r = client(spkiPin(serverCert.certificate)).approve("a.kim:ap1/x")
        assertTrue(r is ApiResult.Ok)
        val req = server.takeRequest()
        assertEquals("/v1/decisions/a.kim:ap1%2Fx", req.path)
        assertEquals("""{"action":"approve"}""", req.body.readUtf8())
        assertTrue(req.getHeader("Content-Type")!!.startsWith("application/json"))
    }

    @Test fun newerProtocolInResponseIsNotUsed() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"protocolVersion":2,"serverTime":1,"staff":"changed"}"""))
        assertEquals(ApiResult.Fail(ApiError.NeedsAppUpdate), client(spkiPin(serverCert.certificate)).status())
    }

    @Test fun lockedResponseCarriesRetryAt() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"protocolVersion":1,"error":"auth_locked","message":"m","retryAt":1790000900000}"""))
        assertEquals(ApiResult.Fail(ApiError.Locked(1790000900000)), client(spkiPin(serverCert.certificate)).decisions())
    }

    @Test fun closedPortIsRemoteOff() = runBlocking {
        val port = server.port
        server.shutdown()
        val r = RemoteClient(Connection("127.0.0.1", port, token, spkiPin(serverCert.certificate)), isPhoneOnline = { true }).status()
        assertEquals(ApiError.RemoteOff, (r as ApiResult.Fail).error)
        server = MockWebServer().also { it.start() } // tearDown용
    }
}
