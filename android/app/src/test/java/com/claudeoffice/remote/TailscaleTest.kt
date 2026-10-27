package com.claudeoffice.remote

import com.claudeoffice.remote.net.Connection
import com.claudeoffice.remote.net.QrParse
import com.claudeoffice.remote.net.Route
import com.claudeoffice.remote.net.endpoints
import com.claudeoffice.remote.net.isTailscaleIpv4
import com.claudeoffice.remote.net.parseQr
import com.claudeoffice.remote.net.refreshedFromHello
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TailscaleTest {
    private val token = "A".repeat(43)
    private val spki = "sha256/" + "A".repeat(43) + "="
    private fun qr(host: String, extra: String) =
        """{"v":1,"host":"$host","port":47900,"token":"$token","spki":"$spki"$extra}"""

    @Test fun cgnatRange() {
        assertTrue(isTailscaleIpv4("100.64.0.1")); assertTrue(isTailscaleIpv4("100.127.255.254"))
        assertFalse(isTailscaleIpv4("100.63.0.1")); assertFalse(isTailscaleIpv4("100.128.0.1")); assertFalse(isTailscaleIpv4("192.168.0.1"))
    }

    @Test fun qrTsReadsAndDropsLan() {
        val p = (parseQr(qr("100.101.102.103", ""","ts":true,"lan":"192.168.0.5"""")) as QrParse.Ok).payload
        assertTrue(p.isTailscale); assertNull(p.lan)
        assertEquals(1, Connection(p.host, p.port, p.token, p.spki, p.lan, p.isLanOnly, p.isTailscale).endpoints().size)
        assertEquals(Route.EXTERNAL, Connection(p.host, p.port, p.token, p.spki, null, false, true).endpoints()[0].route)
    }

    @Test fun qrTsIgnoredWhenHostNotTailscaleOrOldQr() {
        assertFalse((parseQr(qr("203.0.113.10", ""","ts":true""")) as QrParse.Ok).payload.isTailscale)
        assertFalse((parseQr(qr("100.101.102.103", "")) as QrParse.Ok).payload.isTailscale)
    }

    @Test fun helloUpdatesTsHost() {
        val c = Connection("100.64.0.1", 47900, token, spki, null, false, true)
        val u = c.refreshedFromHello(Json.parseToJsonElement("""{"ts":true,"tsHost":"100.64.0.9"}"""))
        assertEquals("100.64.0.9", u?.host)
        assertNull(c.refreshedFromHello(Json.parseToJsonElement("""{"ts":true,"tsHost":"8.8.8.8"}""")))
        assertNull(c.refreshedFromHello(Json.parseToJsonElement("""{"ts":true,"tsHost":"100.64.0.1"}""")))
    }
}
