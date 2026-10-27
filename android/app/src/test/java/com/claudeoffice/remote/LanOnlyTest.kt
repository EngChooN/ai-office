package com.claudeoffice.remote

import com.claudeoffice.remote.net.Connection
import com.claudeoffice.remote.net.LAN_CONNECT_TIMEOUT_SEC
import com.claudeoffice.remote.net.LAN_ONLY_CONNECT_TIMEOUT_SEC
import com.claudeoffice.remote.net.QrParse
import com.claudeoffice.remote.net.Route
import com.claudeoffice.remote.net.endpoints
import com.claudeoffice.remote.net.lanConnectTimeoutSec
import com.claudeoffice.remote.net.parseQr
import com.claudeoffice.remote.net.refreshedFromHello
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** 같은 네트워크 전용 모드(QR lo): 외부 주소 제외, 5초 대기, hello 갱신, 문구에 포트 열기 안내 없음 */
class LanOnlyTest {
    private val token = "A".repeat(42) + "b"
    private val spki = "sha256/" + "x".repeat(43) + "="
    private fun qr(extra: String) = """{"v":1,"host":"192.168.0.24","port":47900,"token":"$token","spki":"$spki"$extra}"""
    private fun hello(s: String) = Json.parseToJsonElement(s)

    @Test fun qrReadsLoOnlyWhenBoolean() {
        assertTrue((parseQr(qr(""","lo":true""")) as QrParse.Ok).payload.isLanOnly)
        assertFalse((parseQr(qr(""","lo":false""")) as QrParse.Ok).payload.isLanOnly)
        assertFalse((parseQr(qr("")) as QrParse.Ok).payload.isLanOnly)
        assertFalse((parseQr(qr(""","lo":"true"""")) as QrParse.Ok).payload.isLanOnly)
    }

    @Test fun lanOnlyDropsExternalEndpoint() {
        val c = Connection("192.168.0.24", 47900, token, spki, lan = "192.168.0.24", isLanOnly = true)
        assertEquals(listOf(Route.LAN), c.endpoints().map { it.route })
        assertEquals("192.168.0.24", c.endpoints().single().host)
        // lan이 없으면 host를 내부 주소로 쓴다
        assertEquals(Route.LAN, Connection("10.0.0.5", 47900, token, spki, isLanOnly = true).endpoints().single().route)
        // 전용 모드가 아니면 그대로 lan → 외부
        val normal = Connection("203.0.113.10", 47900, token, spki, lan = "192.168.0.24")
        assertEquals(listOf(Route.LAN, Route.EXTERNAL), normal.endpoints().map { it.route })
    }

    @Test fun lanOnlyWaitsFiveSeconds() {
        assertEquals(LAN_ONLY_CONNECT_TIMEOUT_SEC, Connection("10.0.0.5", 1, token, spki, isLanOnly = true).lanConnectTimeoutSec())
        assertEquals(5L, LAN_ONLY_CONNECT_TIMEOUT_SEC)
        assertEquals(LAN_CONNECT_TIMEOUT_SEC, Connection("10.0.0.5", 1, token, spki).lanConnectTimeoutSec())
    }

    @Test fun helloUpdatesAddressAndMode() {
        val c = Connection("192.168.0.24", 47900, token, spki, lan = "192.168.0.24", isLanOnly = true)
        val moved = c.refreshedFromHello(hello("""{"lo":true,"lan":"192.168.0.77","capabilities":[]}"""))!!
        assertEquals("192.168.0.77", moved.host)
        assertEquals("192.168.0.77", moved.lan)
        assertTrue(moved.isLanOnly)
        assertEquals(token, moved.token)
        assertEquals(spki, moved.spki)
        // 외부 모드로 바뀌면 전용 플래그만 내린다 (외부 주소는 hello가 모른다)
        val ext = c.refreshedFromHello(hello("""{"lo":false,"lan":"192.168.0.24"}"""))!!
        assertFalse(ext.isLanOnly)
        assertEquals("192.168.0.24", ext.host)
        // 외부 모드 저장값이 전용 모드로 바뀌면 내부 주소로 옮긴다
        val toLo = Connection("203.0.113.10", 47900, token, spki, lan = "192.168.0.24")
            .refreshedFromHello(hello("""{"lo":true,"lan":"192.168.0.24"}"""))!!
        assertTrue(toLo.isLanOnly)
        assertEquals("192.168.0.24", toLo.host)
    }

    @Test fun helloIgnoresUnknownOrBadValues() {
        val c = Connection("192.168.0.24", 47900, token, spki, lan = "192.168.0.24", isLanOnly = true)
        assertNull(c.refreshedFromHello(hello("""{"capabilities":["iso-office"]}""")))        // 예전 PC
        assertNull(c.refreshedFromHello(hello("""{"lo":true,"lan":"192.168.0.24"}""")))        // 같은 값
        assertNull(c.refreshedFromHello(hello("""{"lan":"203.0.113.9"}""")))                   // 공인 주소는 무시
        assertNull(c.refreshedFromHello(hello("""{"lo":"yes","lan":5}""")))                   // 모양이 틀림
        assertNull(c.refreshedFromHello(hello("""null""")))
        assertNull(c.refreshedFromHello(null))
    }

    private fun load(dir: String): Map<String, String> {
        val nodes = DocumentBuilderFactory.newInstance().newDocumentBuilder()
            .parse(File("src/main/res/$dir/strings.xml")).getElementsByTagName("string")
        return (0 until nodes.length).associate { nodes.item(it).attributes.getNamedItem("name").nodeValue to nodes.item(it).textContent }
    }

    @Test fun loStringsNeverMentionPortOrRouter() {
        val banned = listOf("문 번호", "공유기", "포트", "router", "port", "ルーター", "ポート", "路由器", "端口")
        for (dir in listOf("values", "values-en", "values-ja", "values-zh-rCN")) {
            val m = load(dir)
            for (k in listOf("state_connfail_unreach_lo", "state_unreach_body_lo", "qr_unreach_default_lo", "tried_lan")) {
                val v = m.getValue(k)
                assertTrue("$dir $k 없음", v.isNotBlank())
                assertTrue("$dir $k 에 금지 문구", banned.none { v.contains(it, ignoreCase = true) })
            }
            assertTrue("$dir tried_lan에 VPN 없음", m.getValue("tried_lan").contains("VPN"))
        }
        assertTrue(load("values").getValue("state_connfail_unreach_lo").startsWith("같은 와이파이나 회사 VPN에 연결된 상태에서만 접속할 수 있어요"))
    }
}
