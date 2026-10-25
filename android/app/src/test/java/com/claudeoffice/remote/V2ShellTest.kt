package com.claudeoffice.remote

import com.claudeoffice.remote.data.OfficeRepository
import com.claudeoffice.remote.data.V2Mode
import com.claudeoffice.remote.net.ApiError
import com.claudeoffice.remote.net.ApiResult
import com.claudeoffice.remote.net.Connection
import com.claudeoffice.remote.net.StatusResponse
import com.claudeoffice.remote.net.mapV2Error
import com.claudeoffice.remote.net.RemoteClient
import com.claudeoffice.remote.net.spkiPin
import com.claudeoffice.remote.web.BridgeOut
import com.claudeoffice.remote.web.BridgeRequest
import com.claudeoffice.remote.web.CSP
import com.claudeoffice.remote.web.EventSink
import com.claudeoffice.remote.web.EventStream
import com.claudeoffice.remote.web.SseParser
import com.claudeoffice.remote.web.capabilitiesOf
import com.claudeoffice.remote.web.mimeOf
import com.claudeoffice.remote.web.parseBridge
import com.claudeoffice.remote.web.reconnectDelayMs
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
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

/** 안드로이드 1.1: v2 호출·이벤트 스트림·브리지 계약 */
class V2ShellTest {
    init { TestStrings.install() }

    // ── SSE 해석 (규격 8-2) ──────────────────────────────

    @Test fun sseParsesEventsCommentsAndIds() {
        val p = SseParser()
        val lines = listOf(
            ": keep-alive", "",
            "event: hello", """data: {"resync":true}""", "",
            "retry: 3000",
            "id: 7f3a9c:42", "event: log", "data: {\"a\":", "data: 1}", "",
        )
        val out = lines.mapNotNull(p::feed)
        assertEquals(listOf("hello", "log"), out.map { it.event })
        assertEquals("{\"a\":\n1}", out[1].data)
        assertEquals("7f3a9c:42", p.lastEventId)
        assertEquals(3000L, p.retryMs)
        // id 없는 hello는 재연결 기준을 바꾸지 않는다
        assertNull(out[0].id)
    }

    @Test fun reconnectBackoffGrowsToThirtySecondsWithJitter() {
        assertEquals(listOf(1000L, 2000L, 4000L, 8000L, 16000L, 30000L, 30000L), (0..6).map { reconnectDelayMs(it, 0.5) })
        assertEquals(800L, reconnectDelayMs(0, 0.0))
        assertEquals(1200L, reconnectDelayMs(0, 1.0))
    }

    // ── 브리지 계약 ──────────────────────────────────────

    @Test fun bridgeAcceptsOnlyWellFormedMessages() {
        assertEquals(BridgeRequest.Ready(), parseBridge("""{"type":"ready"}"""))
        // 화면이 키보드를 직접 처리한다고 알리면 셸은 WebView를 줄이지 않는다 (한쪽만 올린다)
        assertEquals(BridgeRequest.Ready(setOf("ime")), parseBridge("""{"type":"ready","features":["ime",3,null]}"""))
        assertEquals(BridgeRequest.Ready(), parseBridge("""{"type":"ready","features":"ime"}"""))
        assertEquals("""{"type":"insets","ime":312}""", BridgeOut.insets(312))
        val call = parseBridge("""{"type":"call","id":"c1","method":"instruct","args":["kim","하이"],"confirm":true}""") as BridgeRequest.Call
        assertEquals("instruct", call.method)
        assertEquals(2, call.args.size)
        assertTrue(call.confirm)
        assertEquals(JsonArray(emptyList()), (parseBridge("""{"type":"call","id":"c2","method":"snapshot"}""") as BridgeRequest.Call).args)
        // 메서드 이름에 경로·점 같은 것은 받지 않는다
        assertTrue(parseBridge("""{"type":"call","id":"c3","method":"../v1/status"}""") is BridgeRequest.Invalid)
        assertTrue(parseBridge("""{"type":"call","id":"c4","method":"x","args":"no"}""") is BridgeRequest.Invalid)
        assertTrue(parseBridge("""{"type":"download","id":"d1","fileId":"../../etc/passwd"}""") is BridgeRequest.Invalid)
        assertTrue(parseBridge("not json") is BridgeRequest.Invalid)
        assertTrue(parseBridge("""{"type":"evil"}""") is BridgeRequest.Invalid)
    }

    @Test fun bridgeResultsCarryServerErrorsForTheScreen() {
        val pcOnly = ApiError.Remote(422, "pc_only", "PC에서 열어 주세요", """{"error":"pc_only","alternative":"enter_path"}""")
        val o = kotlinx.serialization.json.Json.parseToJsonElement(BridgeOut.fail("c1", pcOnly)) as JsonObject
        val err = o["error"] as JsonObject
        assertEquals("422", err["status"].toString())
        assertEquals("\"enter_path\"", err["alternative"].toString())
        // 깨진 이벤트 데이터는 화면에 보내지 않는다
        assertNull(BridgeOut.event("log", "{broken"))
        assertTrue(BridgeOut.event("log", """{"x":1}""")!!.contains(""""data":{"x":1}"""))
    }

    @Test fun screenCapabilitiesAndBlockedReasonPassThrough() {
        // 화면이 알린 것 중 아는 능력만 PC에 넘긴다 (office-iso-tech.md 4-3절)
        val ready = parseBridge("""{"type":"ready","features":["ime","iso-office","future-x"]}""") as BridgeRequest.Ready
        assertEquals(setOf("iso-office"), capabilitiesOf(ready.features))
        assertEquals(emptySet<String>(), capabilitiesOf(setOf("ime")))
        // 칸 배치가 막히면 이유(reason)를 화면에 그대로
        val blocked = ApiError.Remote(422, "blocked", "길을 막아요", """{"protocolVersion":2,"error":"blocked","reason":"blocks_path","message":"길을 막아요"}""")
        val err = (kotlinx.serialization.json.Json.parseToJsonElement(BridgeOut.fail("c1", blocked)) as JsonObject)["error"] as JsonObject
        assertEquals("\"blocks_path\"", err["reason"].toString())
        assertEquals("\"blocked\"", err["code"].toString())
        assertNull(err["alternative"])
    }

    @Test fun assetsAreServedWithStrictPolicy() {
        assertTrue(CSP.contains("connect-src 'self'"))
        assertTrue(CSP.contains("frame-src 'none'"))
        assertEquals("text/javascript", mimeOf("assets/index-abc.js"))
        assertEquals("text/html", mimeOf("mobile.html"))
    }

    // ── v2 모드 판단 (규격 2-1) ──────────────────────────

    @Test fun v2ModeFollowsSupportedProtocolsOnly() {
        // 대표 결정: "모든 기능 쓰기" 스위치 없음 — v2를 아는 PC면 바로 전체 화면 (예전 fullAccess 필드가 와도 무시)
        fun s(supported: List<Int>) = StatusResponse(protocolVersion = 1, supportedProtocols = supported)
        assertEquals(V2Mode.NEED_PC_UPDATE, OfficeRepository.v2ModeOf(s(listOf(1))))
        assertEquals(V2Mode.ACTIVE, OfficeRepository.v2ModeOf(s(listOf(1, 2))))
        val withOldSwitch = com.claudeoffice.remote.net.protocolJson.decodeFromString(StatusResponse.serializer(), """{"protocolVersion":1,"supportedProtocols":[1,2],"fullAccess":false}""")
        assertEquals(V2Mode.ACTIVE, OfficeRepository.v2ModeOf(withOldSwitch))
        // 필드가 없는 0.8.x PC
        val old = com.claudeoffice.remote.net.protocolJson.decodeFromString(StatusResponse.serializer(), """{"protocolVersion":1}""")
        assertEquals(V2Mode.NEED_PC_UPDATE, OfficeRepository.v2ModeOf(old))
    }

    @Test fun v2ErrorsSplitIntoAppStateAndScreenErrors() {
        fun body(code: String) = """{"protocolVersion":2,"error":"$code","message":"m"}"""
        assertEquals(ApiError.NeedsPcUpdate, mapV2Error(426, """{"protocolVersion":1,"error":"protocol_unsupported","supported":[1]}"""))
        assertEquals(ApiError.TokenRevoked, mapV2Error(401, body("token_revoked")))
        assertEquals(ApiError.Remote(400, "confirm_required", "m", body("confirm_required")), mapV2Error(400, body("confirm_required")))
        assertTrue(mapV2Error(500, body("call_failed")) is ApiError.Remote)
    }

    // ── 실제 TLS로 v2 호출·이벤트 스트림 ───────────────────

    private val pcCert = HeldCertificate.Builder().commonName("Claude Office").ecdsa256().build()
    private lateinit var server: MockWebServer
    private val token = "T".repeat(43)

    @Before fun setUp() {
        server = MockWebServer()
        server.useHttps(HandshakeCertificates.Builder().heldCertificate(pcCert).build().sslSocketFactory(), false)
        server.start()
    }

    @After fun tearDown() = server.shutdown()

    private fun client(pin: String = spkiPin(pcCert.certificate)) =
        RemoteClient(Connection("127.0.0.1", server.port, token, pin), isPhoneOnline = { true })

    @Test fun v2CallSendsMethodArgsAndIdempotencyKey() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"protocolVersion":2,"serverTime":5,"ok":true,"result":{"staff":[]}}"""))
        val r = client().v2Call("snapshot", JsonArray(emptyList()), confirm = false, idempotencyKey = "k-1") as ApiResult.Ok
        assertEquals("""{"staff":[]}""", r.value.toString())
        val req = server.takeRequest()
        assertEquals("/v2/call", req.path)
        assertEquals("k-1", req.getHeader("Idempotency-Key"))
        assertEquals("Bearer $token", req.getHeader("Authorization"))
        assertEquals("""{"method":"snapshot","args":[]}""", req.body.readUtf8())
    }

    @Test fun v2CallCarriesScreenCapabilitiesOnlyWhenAnnounced() = runBlocking {
        repeat(2) { server.enqueue(MockResponse().setBody("""{"protocolVersion":2,"serverTime":5,"ok":true,"result":null}""")) }
        client().v2Call("snapshot", JsonArray(emptyList()), false, "k-1", setOf("iso-office"))
        client().v2Call("snapshot", JsonArray(emptyList()), false, "k-2")
        assertEquals("iso-office", server.takeRequest().getHeader("X-Office-Capabilities"))
        // 알리지 않은 화면(예전 번들)은 헤더 없음 → PC가 레벨을 10으로 줄여 보낸다
        assertNull(server.takeRequest().getHeader("X-Office-Capabilities"))
    }

    @Test fun v2IsPinnedLikeV1() = runBlocking {
        val other = HeldCertificate.Builder().ecdsa256().build()
        server.enqueue(MockResponse().setBody("{}"))
        val r = client(spkiPin(other.certificate)).v2Call("snapshot", JsonArray(emptyList()), false, "k") as ApiResult.Fail
        assertEquals(ApiError.PinMismatch, r.error)
        assertEquals(0, server.requestCount)
    }

    @Test fun uploadSendsBytesWithEncodedName() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(201).setBody("""{"protocolVersion":2,"serverTime":1,"attachment":{"id":"11111111-2222-4333-8444-555555555555","name":"화면.png","mime":"image/png","size":3}}"""))
        val r = client().v2Upload("화면 1.png", "image/png", byteArrayOf(1, 2, 3)) as ApiResult.Ok
        assertEquals("\"화면.png\"", (r.value as JsonObject)["name"].toString())
        val req = server.takeRequest()
        assertEquals("/v2/attachments", req.path)
        assertEquals("%ED%99%94%EB%A9%B4%201.png", req.getHeader("X-File-Name"))
        assertEquals("3", req.getHeader("Content-Length"))
    }

    @Test fun eventStreamDeliversEventsAndStopsOnTokenRevoked() = runBlocking {
        val sse = listOf(
            "event: hello", """data: {"protocolVersion":2,"resync":true}""", "",
            "id: e1:1", "event: snapshot", """data: {"staff":[{"id":"kim"}]}""", "",
            ": keep-alive", "",
            "id: e1:2", "event: log", """data: {"text":"hi"}""", "",
            "event: bye", """data: {"reason":"token_revoked"}""", "",
        ).joinToString("\n", postfix = "\n")
        server.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody(sse))
        val events = CopyOnWriteArrayList<String>()
        var fatal: ApiError? = null
        var resync = false
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val c = client()
        val stream = EventStream({ c }, object : EventSink {
            override fun onEvent(name: String, data: String) { events += name }
            override fun onHello(isResync: Boolean) { resync = isResync }
            override fun onState(state: String, reason: String?) {}
            override fun onFatal(error: ApiError) { fatal = error }
        }, scope)
        stream.start()
        withTimeout(10_000) { while (fatal == null) delay(20) }
        assertEquals(listOf("snapshot", "log"), events)
        assertTrue(resync)
        assertEquals(ApiError.TokenRevoked, fatal)
        val req = server.takeRequest()
        assertEquals("/v2/events", req.path)
        assertEquals("text/event-stream", req.getHeader("Accept"))
        assertEquals(1, server.requestCount) // 폐기되면 다시 붙지 않는다
        scope.cancel()
    }

    @Test fun eventStreamReconnectsWithLastEventIdAndSurvivesRemoteOff() = runBlocking {
        // 끊김 → 다시 붙을 때 Last-Event-ID, PC에서 원격을 끄면(bye remote_disabled) 멈추지 않고 계속 붙어 본다 (QA 1.1 버그)
        server.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody("id: ep:7\nevent: chat\ndata: {}\n\n"))
        server.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody("event: bye\ndata: {\"reason\":\"remote_disabled\"}\n\n"))
        server.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody("event: bye\ndata: {\"reason\":\"token_revoked\"}\n\n"))
        var fatal: ApiError? = null
        val states = CopyOnWriteArrayList<String>()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val c = client()
        EventStream({ c }, object : EventSink {
            override fun onEvent(name: String, data: String) {}
            override fun onHello(resync: Boolean) {}
            override fun onState(state: String, reason: String?) { states += "$state:${reason ?: ""}" }
            override fun onFatal(error: ApiError) { fatal = error }
        }, scope).start()
        withTimeout(15_000) { while (fatal == null) delay(20) }
        assertNull(server.takeRequest().getHeader("Last-Event-ID"))
        assertEquals("ep:7", server.takeRequest().getHeader("Last-Event-ID"))
        server.takeRequest()
        assertEquals(3, server.requestCount)
        assertTrue(states.toString(), "reconnecting:remote_disabled" in states)
        assertEquals(3, states.count { it.startsWith("open") })
        assertEquals(ApiError.TokenRevoked, fatal)
        scope.cancel()
    }

    @Test fun eventStreamCarriesCapabilitiesOnEveryReconnect() = runBlocking {
        // 이벤트 스트림은 연결 단위로 판정하므로 다시 붙을 때도 헤더를 싣는다
        server.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody("id: ep:1\nevent: chat\ndata: {}\n\n"))
        server.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody("event: bye\ndata: {\"reason\":\"token_revoked\"}\n\n"))
        var fatal: ApiError? = null
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val c = client()
        EventStream({ c }, object : EventSink {
            override fun onEvent(name: String, data: String) {}
            override fun onHello(resync: Boolean) {}
            override fun onState(state: String, reason: String?) {}
            override fun onFatal(error: ApiError) { fatal = error }
        }, scope, capabilities = { setOf("iso-office") }).start()
        withTimeout(15_000) { while (fatal == null) delay(20) }
        assertEquals("iso-office", server.takeRequest().getHeader("X-Office-Capabilities"))
        val again = server.takeRequest()
        assertEquals("ep:1", again.getHeader("Last-Event-ID"))
        assertEquals("iso-office", again.getHeader("X-Office-Capabilities"))
        scope.cancel()
    }

    @Test fun atMostFiveV2CallsRunAtOnce() = runBlocking {
        // 서버는 주소당 연결 8개, SSE가 2개 → 호출은 5개까지 (한리뷰 권고)
        val inFlight = java.util.concurrent.atomic.AtomicInteger()
        val peak = java.util.concurrent.atomic.AtomicInteger()
        server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
            override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest): MockResponse {
                val now = inFlight.incrementAndGet()
                peak.accumulateAndGet(now) { a, b -> maxOf(a, b) }
                Thread.sleep(300)
                inFlight.decrementAndGet()
                return MockResponse().setBody("""{"protocolVersion":2,"serverTime":1,"ok":true,"result":null}""")
            }
        }
        val c = client()
        val jobs = (1..12).map { i ->
            async(Dispatchers.IO) { c.v2Call("snapshot", JsonArray(emptyList()), false, "k$i") }
        }
        jobs.forEach { assertTrue(it.await() is ApiResult.Ok) }
        assertTrue("동시 ${peak.get()}개", peak.get() in 2..5)
    }
}
