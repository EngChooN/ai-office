// 주소(IP)+연결 코드로 연결 (설계서 8절). PC가 쓰는 /v2/pair/hello·confirm과 같은 교환이다
// 코드는 HMAC의 열쇠로만 쓰고 네트워크에 보내지 않는다. 이 한 번만 인증서를 검증하지 않고 붙되,
// 실제로 본 지문(spkiSeen)을 코드로 묶어서 중간자를 막는다. 결과 QrPayload는 QR로 얻은 것과 같은 모양이다

package com.claudeoffice.remote.net

import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.Base64
import java.util.concurrent.TimeUnit
import javax.crypto.Mac
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put
import okhttp3.ConnectionSpec
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

const val DEFAULT_PORT = 47900
const val PAIR_CODE_LENGTH = 12
const val PBKDF2_ITERATIONS = 200_000
private const val CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

enum class PairError { BAD_HOST, BAD_PORT, BAD_CODE, UNREACHABLE, CLOSED, SPKI_MISMATCH, SERVER_PROOF_MISMATCH, WRONG_CODE, FULL, FAILED }

class PairFailure(val error: PairError, val remaining: Int? = null) : Exception(error.name)

private val TS_NET = Regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\\.ts\\.net$")

/** Tailscale 100.64/10 · 사설 IPv4 · *.ts.net 만 (PC의 isPeerHostAllowed와 같은 규칙). 공인 IP·그 밖의 이름은 코드를 보내지 않는다 */
fun isPairHostAllowed(raw: String): Boolean {
    val host = raw.trim().lowercase()
    if (host.isEmpty() || host.length > 255) return false
    if (isTailscaleIpv4(host) || isPrivateIpv4(host)) return true
    return TS_NET.matches(host)
}

/** 입력 정규화 (설계서 1-4): 공백·하이픈 제거 → 대문자 → O→0, I·L→1. 12글자 Crockford base32가 아니면 null */
fun normalizePairCode(raw: String): String? {
    val c = raw.filter { it != '-' && !it.isWhitespace() }.uppercase()
        .replace('O', '0').replace('I', '1').replace('L', '1')
    return c.takeIf { it.length == PAIR_CODE_LENGTH && it.all { ch -> ch in CROCKFORD } }
}

fun isPairCode(s: String) = normalizePairCode(s) != null

private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

private fun hexToBytes(h: String) = ByteArray(h.length / 2) { h.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

private fun hmac(key: ByteArray, vararg parts: ByteArray): ByteArray {
    val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }
    parts.forEach { mac.update(it) }
    return mac.doFinal()
}

/** salt = nonceA(16B) ‖ nonceB(16B) ‖ SPKI SHA-256(32B) */
fun pairSalt(nonceA: ByteArray, nonceB: ByteArray, spkiDigest: ByteArray) = nonceA + nonceB + spkiDigest

/** K = PBKDF2-HMAC-SHA256(code12, salt, 200000, 32B). 느리다(수백 ms) → 메인 스레드에서 부르지 않는다 */
fun pairKey(code12: String, salt: ByteArray): ByteArray {
    val spec = PBEKeySpec(code12.toCharArray(), salt, PBKDF2_ITERATIONS, 256)
    return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
}

/** clientProof = HMAC(K, "client" ‖ salt) (소문자 hex) */
fun clientProofHex(k: ByteArray, salt: ByteArray) = hex(hmac(k, "client".toByteArray(Charsets.UTF_8), salt))

/** serverProof = HMAC(K, "server" ‖ salt ‖ clientProof(32B)) (소문자 hex) */
fun serverProofHex(k: ByteArray, salt: ByteArray, clientProof: ByteArray) =
    hex(hmac(k, "server".toByteArray(Charsets.UTF_8), salt, clientProof))

/** 눈으로 확인할 지문 앞 8자리 ("sha256/" 뒤) */
fun fingerprintShort(spki: String) = spki.removePrefix("sha256/").take(8)

data class PairHttp(val status: Int, val body: JsonObject)

/** 접속 통로. 테스트가 가짜를 넣는다 */
interface PairTransport {
    /** 이 연결에서 실제로 본 서버 인증서 지문 (첫 요청 뒤에 안다) */
    fun seenSpki(): String?
    fun post(path: String, body: JsonObject): PairHttp
}

/** 지문 확인 없이 붙되 본 지문을 기록하는 실제 통로 (이 용도 한 번뿐) */
class RecordingTransport(private val host: String, private val port: Int) : PairTransport {
    @Volatile private var seen: String? = null

    private val client: OkHttpClient by lazy {
        val tm = object : X509TrustManager {
            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                seen = chain?.firstOrNull()?.let { spkiPin(it) }
            }
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) =
                throw java.security.cert.CertificateException("client certificates are not accepted")
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
        }
        val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(tm), null) }
        OkHttpClient.Builder()
            .sslSocketFactory(ssl.socketFactory, tm)
            // 자체 서명 인증서라 이름이 없다. 신뢰는 코드로 묶은 지문 비교가 한다
            .hostnameVerifier { _, _ -> true }
            .connectionSpecs(listOf(ConnectionSpec.MODERN_TLS))
            .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
            .cache(null)
            .connectTimeout(10, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).callTimeout(25, TimeUnit.SECONDS)
            .build()
    }

    override fun seenSpki() = seen

    override fun post(path: String, body: JsonObject): PairHttp {
        val h = if (':' in host) "[$host]" else host
        val req = Request.Builder().url("https://$h:$port$path")
            .post(body.toString().toRequestBody("application/json".toMediaType())).build()
        client.newCall(req).execute().use { r ->
            val text = r.body?.string().orEmpty()
            val obj = try { protocolJson.parseToJsonElement(text) as? JsonObject } catch (_: Exception) { null }
            return PairHttp(r.code, obj ?: JsonObject(emptyMap()))
        }
    }
}

data class PairResult(val token: String, val spki: String, val fingerprint: String)

private fun JsonObject.str(k: String) = (this[k] as? JsonPrimitive)?.takeIf { it.isString }?.content
private fun JsonObject.int(k: String) = (this[k] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull

private val NONCE_RE = Regex("^[A-Za-z0-9_-]{22}$")
private val TOKEN_RE = Regex("^[A-Za-z0-9_-]{43}$")

/** 입력 검사. 연결을 시도하기 전에 한다 */
fun checkPairInput(host: String, port: Int, code: String) {
    if (!isPairHostAllowed(host)) throw PairFailure(PairError.BAD_HOST)
    if (port !in 1024..65535) throw PairFailure(PairError.BAD_PORT)
    if (!isPairCode(code)) throw PairFailure(PairError.BAD_CODE)
}

/** hello → 지문 대조 → confirm. 블로킹 호출이라 IO 스레드에서 부른다 */
fun pairWithHost(
    transport: PairTransport,
    code: String,
    clientName: String,
    random: SecureRandom = SecureRandom(),
): PairResult {
    val nonceABytes = ByteArray(16).also { random.nextBytes(it) }
    val nonceA = Base64.getUrlEncoder().withoutPadding().encodeToString(nonceABytes)
    val hello = try {
        transport.post("/v2/pair/hello", buildJsonObject { put("clientName", clientName); put("nonceA", nonceA) })
    } catch (_: Exception) {
        throw PairFailure(PairError.UNREACHABLE)
    }
    if (hello.status == 410) throw PairFailure(PairError.CLOSED)
    val nonceB = hello.body.str("nonceB")
    val claimed = hello.body.str("spki")
    if (hello.status != 200 || nonceB == null || claimed == null || !NONCE_RE.matches(nonceB)) throw PairFailure(PairError.FAILED)
    // PC가 아는 자기 지문 == 이 연결에서 실제로 본 지문이어야 한다 (다르면 중간자)
    val seen = transport.seenSpki()
    if (seen == null || seen != claimed || !SPKI_PATTERN.matches(seen)) throw PairFailure(PairError.SPKI_MISMATCH)
    val code12 = normalizePairCode(code) ?: throw PairFailure(PairError.BAD_CODE)
    val spkiDigest = Base64.getDecoder().decode(seen.removePrefix("sha256/"))
    val salt = pairSalt(nonceABytes, Base64.getUrlDecoder().decode(nonceB), spkiDigest)
    val k = pairKey(code12, salt)
    val clientProof = clientProofHex(k, salt)
    val done = try {
        transport.post("/v2/pair/confirm", buildJsonObject {
            put("nonceA", nonceA); put("nonceB", nonceB); put("clientProof", clientProof)
            put("peerLabel", clientName); put("clientId", ""); put("kind", "phone")
        })
    } catch (_: Exception) {
        throw PairFailure(PairError.UNREACHABLE)
    }
    if (done.status == 410) throw PairFailure(PairError.CLOSED)
    if (done.status == 401) throw PairFailure(PairError.WRONG_CODE, done.body.int("remaining"))
    val token = done.body.str("token")?.takeIf { TOKEN_RE.matches(it) }
    if (done.status != 200 || token == null) throw PairFailure(if (done.body.str("error") == "full") PairError.FULL else PairError.FAILED)
    // 서버도 코드를 안다는 증명. 틀리면 가짜 서버 → 토큰을 저장하지 않고 중단
    val serverProof = done.body.str("serverProof")
    val expected = serverProofHex(k, salt, hexToBytes(clientProof))
    if (serverProof == null || !MessageDigest.isEqual(serverProof.lowercase().toByteArray(), expected.toByteArray())) {
        throw PairFailure(PairError.SERVER_PROOF_MISMATCH)
    }
    return PairResult(token, seen, fingerprintShort(seen))
}

/** 교환이 끝나면 QR로 읽은 것과 같은 값이 된다 → 이후 연결·인증서 고정·토큰 저장 경로는 그대로 쓴다 */
fun PairResult.toPayload(host: String, port: Int): QrPayload {
    val h = host.trim().lowercase()
    return QrPayload(
        v = PROTOCOL_VERSION, host = h, port = port, token = token, spki = spki,
        lan = null, pv = null, firebase = null, isLanOnly = false, isTailscale = isTailscaleIpv4(h),
    )
}
