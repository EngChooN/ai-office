package com.claudeoffice.remote

import com.claudeoffice.remote.net.PairError
import com.claudeoffice.remote.net.PairFailure
import com.claudeoffice.remote.net.PairHttp
import com.claudeoffice.remote.net.PairTransport
import com.claudeoffice.remote.net.checkPairInput
import com.claudeoffice.remote.net.clientProofHex
import com.claudeoffice.remote.net.isPairCode
import com.claudeoffice.remote.net.isPairHostAllowed
import com.claudeoffice.remote.net.normalizePairCode
import com.claudeoffice.remote.net.pairKey
import com.claudeoffice.remote.net.pairSalt
import com.claudeoffice.remote.net.pairWithHost
import com.claudeoffice.remote.net.serverProofHex
import com.claudeoffice.remote.net.toPayload
import java.security.SecureRandom
import java.util.Base64
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ManualPairTest {
    // 설계서 docs/specs/multi-pc-protocol.md 1-4절 테스트 벡터
    private val code = "7M3Q-H9XK-2VTB"
    private val code12 = "7M3QH9XK2VTB"
    private val nonceA = ByteArray(16) { it.toByte() }
    private val nonceB = ByteArray(16) { (0x10 + it).toByte() }
    private val spkiBytes = ByteArray(32) { 0xab.toByte() }
    private val spki = "sha256/q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s="
    private val nonceBText = "EBESExQVFhcYGRobHB0eHw"
    private val token = "t".repeat(43)

    private fun hex(s: String) = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

    private val vecK = "eecc54457136acf3bc7f7dd3ab4f2b95ef43be799c31e8c5423e439bcf966238"
    private val vecClient = "1c1728fc7f1a6dc43cac178fcf2a35a51690be716a2ddf965b93704dfeb37e48"
    private val vecServer = "65767af5031f2c8c6dc71acaafe8a2c877d53cb7a557f02a5991c1e5cf4749e9"

    private val fixedRandom = object : SecureRandom() {
        override fun nextBytes(bytes: ByteArray) { nonceA.copyInto(bytes) }
    }

    /** serverProofOverride가 null이면 진짜 서버처럼 코드를 아는 쪽이 계산한 증명을 돌려준다 */
    private inner class Fake(
        private val seen: String? = spki,
        private val helloSpki: String = spki,
        private val confirmStatus: Int = 200,
        private val confirmBody: JsonObject? = null,
        private val helloStatus: Int = 200,
        private val serverCode12: String = code12,
        private val serverProofOverride: String? = null,
        private val omitServerProof: Boolean = false,
    ) : PairTransport {
        val calls = mutableListOf<Pair<String, JsonObject>>()
        override fun seenSpki() = seen
        override fun post(path: String, body: JsonObject): PairHttp {
            calls += path to body
            if (path.endsWith("hello")) {
                return PairHttp(helloStatus, buildJsonObject { put("nonceB", nonceBText); put("spki", helloSpki) })
            }
            confirmBody?.let { return PairHttp(confirmStatus, it) }
            val salt = pairSalt(nonceA, nonceB, spkiBytes)
            val k = pairKey(serverCode12, salt)
            val cp = (body["clientProof"] as JsonPrimitive).content
            val sp = serverProofOverride ?: serverProofHex(k, salt, hex(cp))
            return PairHttp(confirmStatus, buildJsonObject {
                put("token", token)
                if (!omitServerProof) put("serverProof", sp)
            })
        }
    }

    private fun fail(t: PairTransport, c: String = code): PairFailure =
        try { pairWithHost(t, c, "P", fixedRandom); throw AssertionError("성공하면 안 됨") } catch (x: PairFailure) { x }

    @Test
    fun matchesDesignDocVectors() {
        val salt = pairSalt(nonceA, nonceB, Base64.getDecoder().decode(spki.removePrefix("sha256/")))
        assertEquals(
            "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f" + "ab".repeat(32),
            salt.joinToString("") { "%02x".format(it) },
        )
        val k = pairKey(code12, salt)
        assertEquals(vecK, k.joinToString("") { "%02x".format(it) })
        assertEquals(vecClient, clientProofHex(k, salt))
        assertEquals(vecServer, serverProofHex(k, salt, hex(vecClient)))
    }

    @Test
    fun codeNormalization() {
        assertEquals(code12, normalizePairCode("7m3q-h9xk-2vtb"))
        assertEquals(code12, normalizePairCode("  7M3Q H9XK 2VTB "))
        // O→0, I→1, L→1
        assertEquals("010101010101", normalizePairCode("oilo-ilOI-L0i1"))
        assertNull(normalizePairCode("7M3QH9XK2VT"))
        assertNull(normalizePairCode("7M3QH9XK2VTBB"))
        assertNull(normalizePairCode("7M3QH9XK2VTU")) // U는 알파벳 밖
        assertNull(normalizePairCode("123456"))
        assertTrue(isPairCode(code))
        assertFalse(isPairCode("123456"))
    }

    @Test
    fun hostRules() {
        assertTrue(isPairHostAllowed("100.64.0.1"))
        assertTrue(isPairHostAllowed("100.127.255.254"))
        assertTrue(isPairHostAllowed("192.168.0.5"))
        assertTrue(isPairHostAllowed("My-Mac.tail1234.ts.net"))
        assertFalse(isPairHostAllowed("8.8.8.8"))
        assertFalse(isPairHostAllowed("100.128.0.1"))
        assertFalse(isPairHostAllowed("example.com"))
        assertFalse(isPairHostAllowed("evil.ts.net.example.com"))
        assertFalse(isPairHostAllowed(""))
    }

    @Test
    fun inputChecks() {
        for ((h, p, c, e) in listOf(
            listOf("8.8.8.8", 47900, code, PairError.BAD_HOST),
            listOf("100.64.0.1", 80, code, PairError.BAD_PORT),
            listOf("100.64.0.1", 47900, "123456", PairError.BAD_CODE),
            listOf("100.64.0.1", 47900, "7M3Q-H9XK", PairError.BAD_CODE),
        )) {
            try {
                checkPairInput(h as String, p as Int, c as String)
                fail("거절돼야 함")
            } catch (x: PairFailure) {
                assertEquals(e, x.error)
            }
        }
        checkPairInput("100.64.0.1", 47900, code)
        checkPairInput("100.64.0.1", 47900, "7m3qh9xk2vtb")
    }

    @Test
    fun successSendsClientProofAndKeepsCodeOffTheWire() {
        val t = Fake()
        val r = pairWithHost(t, code, "Pixel", fixedRandom)
        assertEquals(token, r.token)
        assertEquals(spki, r.spki)
        assertEquals("q6urq6ur", r.fingerprint)
        val confirm = t.calls[1].second
        assertEquals(JsonPrimitive(vecClient), confirm["clientProof"])
        assertNull(confirm["proof"])
        assertEquals(JsonPrimitive("phone"), confirm["kind"])
        // 코드는 네트워크로 나가지 않는다
        val wire = t.calls.joinToString { it.second.toString() }
        assertFalse(wire.contains(code12))
        assertFalse(wire.contains(code))
        val p = r.toPayload("100.64.0.1", 47900)
        assertTrue(p.isTailscale)
        assertEquals(spki, p.spki)
        assertNull(p.lan)
        assertFalse(r.toPayload("192.168.0.5", 47900).isTailscale)
    }

    @Test
    fun lowercaseAndHyphenlessInputWorks() {
        assertEquals(token, pairWithHost(Fake(), "7m3qh9xk2vtb", "P", fixedRandom).token)
    }

    @Test
    fun serverProofMismatchIsRejected() {
        // 가짜 서버: 코드를 몰라 다른 열쇠로 증명을 만든다
        assertEquals(PairError.SERVER_PROOF_MISMATCH, fail(Fake(serverCode12 = "0000000000AA")).error)
        // 엉뚱한 값
        assertEquals(PairError.SERVER_PROOF_MISMATCH, fail(Fake(serverProofOverride = "0".repeat(64))).error)
        // client 증명을 그대로 되돌려 보내기
        assertEquals(PairError.SERVER_PROOF_MISMATCH, fail(Fake(serverProofOverride = vecClient)).error)
        // 아예 없음
        assertEquals(PairError.SERVER_PROOF_MISMATCH, fail(Fake(omitServerProof = true)).error)
    }

    @Test
    fun spkiMismatchStopsBeforeConfirm() {
        val t = Fake(helloSpki = "sha256/" + "B".repeat(43) + "=")
        assertEquals(PairError.SPKI_MISMATCH, fail(t).error)
        assertEquals(1, t.calls.size)
    }

    @Test
    fun badCodeStopsBeforeConfirm() {
        val t = Fake()
        assertEquals(PairError.BAD_CODE, fail(t, "123456").error)
        assertEquals(1, t.calls.size)
    }

    @Test
    fun errorMapping() {
        assertEquals(PairError.CLOSED, fail(Fake(helloStatus = 410)).error)
        val wrong = fail(Fake(confirmStatus = 401, confirmBody = buildJsonObject { put("remaining", 2) }))
        assertEquals(PairError.WRONG_CODE, wrong.error)
        assertEquals(2, wrong.remaining)
        assertEquals(PairError.FULL, fail(Fake(confirmStatus = 409, confirmBody = buildJsonObject { put("error", "full") })).error)
        assertEquals(PairError.FAILED, fail(Fake(confirmBody = buildJsonObject { put("token", "short") })).error)
    }
}
