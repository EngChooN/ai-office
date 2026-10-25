package com.claudeoffice.remote

import com.claudeoffice.remote.net.QrParse
import com.claudeoffice.remote.net.parseQr
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class QrPayloadTest {
    private val token = "A".repeat(42) + "b"
    private val spki = "sha256/" + "x".repeat(43) + "="

    private fun qr(extra: String = "", v: String = "1", host: String = "\"203.0.113.10\"", port: String = "47900") =
        """{"v":$v,"host":$host,"port":$port,"token":"$token","spki":"$spki"$extra}"""

    @Test fun parsesRequiredFields() {
        val r = parseQr(qr()) as QrParse.Ok
        assertEquals("203.0.113.10", r.payload.host)
        assertEquals(47900, r.payload.port)
        assertEquals(token, r.payload.token)
        assertEquals(spki, r.payload.spki)
        assertNull(r.payload.firebase)
    }

    @Test fun ignoresUnknownFields() {
        assertTrue(parseQr(qr(""","future":{"a":1},"note":"x"""")) is QrParse.Ok)
    }

    @Test fun readsFirebaseOnlyWhenAllStrings() {
        val ok = parseQr(qr(""","firebase":{"projectId":"p","appId":"a","senderId":"s"}""")) as QrParse.Ok
        assertEquals("p", ok.payload.firebase?.projectId)
        val partial = parseQr(qr(""","firebase":{"projectId":"p","appId":1,"senderId":"s"}""")) as QrParse.Ok
        assertNull(partial.payload.firebase)
    }

    @Test fun newerVersionAsksForUpdateWithoutConnecting() {
        assertEquals(QrParse.NeedsAppUpdate, parseQr(qr(v = "2")))
    }

    @Test fun rejectsWrongShapes() {
        listOf(
            "not json",
            "[1,2]",
            qr(v = "\"1\""),
            qr(v = "0"),
            qr(port = "80"),
            qr(port = "70000"),
            qr(port = "47900.5"),
            qr(host = "\"\""),
            qr(host = "\"evil.com/path\""),
            qr(host = "\"a b\""),
            qr(host = "\"host:1234\""),
            """{"v":1,"host":"h","port":47900,"token":"short","spki":"$spki"}""",
            """{"v":1,"host":"h","port":47900,"token":"$token","spki":"md5/abc"}""",
            """{"v":1,"host":"h","port":47900,"token":"$token"}""",
        ).forEach { assertEquals(it, QrParse.NotOurs, parseQr(it)) }
    }

    @Test fun acceptsIpv6AndDdnsNames() {
        assertTrue(parseQr(qr(host = "\"2001:db8::1\"")) is QrParse.Ok)
        assertTrue(parseQr(qr(host = "\"myoffice.iptime.org\"")) is QrParse.Ok)
    }
}
