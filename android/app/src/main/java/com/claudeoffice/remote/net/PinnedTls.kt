// 인증서 고정: PC 서버 인증서의 공개키(SPKI) SHA-256이 QR의 spki와 같을 때만 연결한다
// 시스템 CA·사용자 설치 CA는 보지 않는다. 지문이 다르면 핸드셰이크에서 끊고, 끄거나 무시하는 길은 없다

package com.claudeoffice.remote.net

import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.Base64
import java.util.concurrent.TimeUnit
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager
import okhttp3.ConnectionPool
import okhttp3.ConnectionSpec
import okhttp3.OkHttpClient

/** 지문이 QR과 다를 때 (인증서 불일치 화면으로 보낸다) */
class PinMismatchException : CertificateException("server key does not match the pinned fingerprint")

/** "sha256/" + base64(SHA-256(SPKI DER)) — PC의 spkiFingerprint와 같은 계산 */
fun spkiPin(cert: X509Certificate): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(cert.publicKey.encoded)
    return "sha256/" + Base64.getEncoder().encodeToString(digest)
}

private fun samePin(a: String, b: String) =
    MessageDigest.isEqual(a.toByteArray(Charsets.US_ASCII), b.toByteArray(Charsets.US_ASCII))

class PinningTrustManager(private val pin: String) : X509TrustManager {
    init {
        require(SPKI_PATTERN.matches(pin)) { "invalid pin" }
    }

    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
        val leaf = chain?.firstOrNull() ?: throw PinMismatchException()
        if (!samePin(spkiPin(leaf), pin)) throw PinMismatchException()
    }

    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
        throw CertificateException("client certificates are not accepted")
    }

    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
}

/**
 * 자체 서명 인증서에는 주소 이름이 없으므로 호스트 이름 대신 같은 지문을 한 번 더 확인한다.
 * (신뢰 판단은 위 TrustManager가 이미 했다 — 여기서 true를 그냥 돌려주지 않는다)
 */
class PinningHostnameVerifier(private val pin: String) : HostnameVerifier {
    override fun verify(hostname: String?, session: javax.net.ssl.SSLSession?): Boolean {
        val leaf = try {
            session?.peerCertificates?.firstOrNull() as? X509Certificate
        } catch (_: Exception) {
            null
        } ?: return false
        return samePin(spkiPin(leaf), pin)
    }
}

/** 이 PC 하나에만 붙는 HTTPS 클라이언트. 평문·리다이렉트·캐시·쿠키 없음 */
fun pinnedClient(pin: String, connectTimeoutSec: Long = 10, readTimeoutSec: Long = 15, callTimeoutSec: Long = 25): OkHttpClient {
    val tm = PinningTrustManager(pin)
    val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(tm), null) }
    return OkHttpClient.Builder()
        .sslSocketFactory(ssl.socketFactory, tm)
        .hostnameVerifier(PinningHostnameVerifier(pin))
        .connectionSpecs(listOf(ConnectionSpec.MODERN_TLS))
        .followRedirects(false)
        .followSslRedirects(false)
        .retryOnConnectionFailure(false)
        // 연결을 재사용하지 않는다: PC 서버는 쉬는 연결을 몇 초 뒤 닫아서, 재사용하면 끊긴 연결로 실패한다.
        // 조회는 30초·15분 간격이라 매번 새로 맺어도 부담이 작고, 맺을 때마다 지문을 다시 확인한다
        .connectionPool(ConnectionPool(0, 1, TimeUnit.SECONDS))
        .cache(null)
        .connectTimeout(connectTimeoutSec, TimeUnit.SECONDS)
        .readTimeout(readTimeoutSec, TimeUnit.SECONDS)
        .callTimeout(callTimeoutSec, TimeUnit.SECONDS)
        .build()
}
