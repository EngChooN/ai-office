// QR 내용 해석 (규격 8절). 필수 5개 필드를 검사하고 모르는 필드는 무시한다

package com.claudeoffice.remote.net

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull

data class FirebaseConfig(val projectId: String, val appId: String, val senderId: String)

data class QrPayload(
    val v: Int,
    val host: String,
    val port: Int,
    val token: String,
    val spki: String,
    /** 같은 와이파이에서 쓰는 PC의 사설 IPv4 (선택). 공유기가 헤어핀 NAT를 못 하면 host로는 안에서 닿지 않는다 */
    val lan: String? = null,
    /** 이 PC가 아는 최대 프로토콜 (v2 규격 2-1, 힌트일 뿐 — 권위는 /v1/status의 supportedProtocols) */
    val pv: Int? = null,
    /** 예약 필드. 1.0.0은 읽기만 하고 쓰지 않는다 (푸시는 2단계) */
    val firebase: FirebaseConfig?,
    /** 같은 네트워크 전용 모드 (QR의 lo:true). 이때 host는 PC의 내부 주소이고 외부 주소는 쓰지 않는다 */
    val isLanOnly: Boolean = false,
    /** Tailscale 모드 (QR의 ts:true). 이때 host는 PC의 Tailscale 주소(100.64/10)이고 lan은 쓰지 않는다 */
    val isTailscale: Boolean = false,
)

sealed interface QrParse {
    data class Ok(val payload: QrPayload) : QrParse
    /** JSON이 아니거나 필수 필드가 없거나 틀림 → "Claude Office QR이 아니에요" */
    data object NotOurs : QrParse
    /** QR의 v가 앱이 아는 값보다 큼 → 연결 시도 없이 "앱 업데이트" */
    data object NeedsAppUpdate : QrParse
}

private val TOKEN = Regex("^[A-Za-z0-9_-]{43}$")
val SPKI_PATTERN = Regex("^sha256/[A-Za-z0-9+/]{43}=$")
private val IPV6 = Regex("^[0-9A-Fa-f:.]+$")
private val IPV4 = Regex("""^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$""")

/** 사설 IPv4만 (10/8, 172.16/12, 192.168/16). 공인·루프백·이름은 받지 않는다 */
fun isPrivateIpv4(s: String): Boolean {
    val parts = IPV4.matchEntire(s)?.groupValues?.drop(1)?.map { it.toInt() } ?: return false
    if (parts.any { it > 255 } || s.split('.').any { it.length > 1 && it.startsWith("0") }) return false
    val (a, b) = parts
    return a == 10 || (a == 172 && b in 16..31) || (a == 192 && b == 168)
}

/** Tailscale(CGNAT) 대역 100.64.0.0/10 IPv4 */
fun isTailscaleIpv4(s: String): Boolean {
    val parts = IPV4.matchEntire(s)?.groupValues?.drop(1)?.map { it.toInt() } ?: return false
    if (parts.any { it > 255 } || s.split('.').any { it.length > 1 && it.startsWith("0") }) return false
    return parts[0] == 100 && parts[1] in 64..127
}

/** 정수만 (문자열 "1"이나 1.5는 받지 않는다) */
private fun JsonElement?.strictInt(): Int? =
    (this as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull

private fun JsonElement?.strictString(): String? =
    (this as? JsonPrimitive)?.takeIf { it.isString }?.content

fun isValidHost(host: String): Boolean {
    if (host.isEmpty() || host.length > 255) return false
    if (host.any { it.isWhitespace() || it == '/' || it == '@' || it == '?' || it == '#' || it == '[' || it == ']' }) return false
    // ':'는 IPv6 숫자 주소에만
    if (':' in host) return IPV6.matches(host) && host.count { it == ':' } >= 2
    return true
}

fun parseQr(text: String): QrParse {
    val obj = try {
        protocolJson.parseToJsonElement(text.trim()) as? JsonObject
    } catch (_: Exception) {
        null
    } ?: return QrParse.NotOurs

    val v = obj["v"].strictInt() ?: return QrParse.NotOurs
    if (v > PROTOCOL_VERSION) return QrParse.NeedsAppUpdate
    if (v < 1) return QrParse.NotOurs

    val host = obj["host"].strictString()?.takeIf(::isValidHost) ?: return QrParse.NotOurs
    val port = obj["port"].strictInt()?.takeIf { it in 1024..65535 } ?: return QrParse.NotOurs
    val token = obj["token"].strictString()?.takeIf { TOKEN.matches(it) } ?: return QrParse.NotOurs
    val spki = obj["spki"].strictString()?.takeIf { SPKI_PATTERN.matches(it) } ?: return QrParse.NotOurs

    // firebase: 세 값이 모두 문자열일 때만 유효, 아니면 통째로 무시
    val firebase = (obj["firebase"] as? JsonObject)?.let { f ->
        val projectId = f["projectId"].strictString()
        val appId = f["appId"].strictString()
        val senderId = f["senderId"].strictString()
        if (projectId != null && appId != null && senderId != null) FirebaseConfig(projectId, appId, senderId) else null
    }
    // lan: 선택. 틀린 값이면 무시하고 host로만 연결한다
    // ts: true이고 host가 100.64/10일 때만 Tailscale 모드. 규격 위반(lan 동봉)이면 lan은 버린다
    val isTailscale = (obj["ts"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull == true && isTailscaleIpv4(host)
    val lan = obj["lan"].strictString()?.takeIf(::isPrivateIpv4)?.takeIf { !isTailscale }
    val pv = obj["pv"].strictInt()?.takeIf { it >= 1 }
    val isLanOnly = (obj["lo"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull == true
    return QrParse.Ok(QrPayload(v, host, port, token, spki, lan, pv, firebase, isLanOnly && !isTailscale, isTailscale))
}
