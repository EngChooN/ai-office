// 화면(WebView 안의 PC 화면 모바일 빌드) ↔ 셸(Kotlin) 메시지. 계약은 docs/specs/android-bridge.md
// 화면 → 셸: OfficeBridge.postMessage(JSON 문자열)    셸 → 화면: OfficeBridge.onmessage (event.data = JSON 문자열)
// 메시지는 모두 한 줄 JSON이고, 요청 id마다 응답을 꼭 한 번 보낸다

package com.claudeoffice.remote.web

import com.claudeoffice.remote.R
import com.claudeoffice.remote.S

import com.claudeoffice.remote.net.ApiError
import com.claudeoffice.remote.net.protocolJson
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** 화면이 한 번에 보낼 수 있는 메시지 크기 (첨부 20MB를 base64로 담는 경우까지) */
const val BRIDGE_MESSAGE_MAX = 28 * 1024 * 1024

/** 메서드 이름: OfficeApi 이름 모양만 (서버가 목록과 대조한다) */
private val METHOD_NAME = Regex("^[A-Za-z][A-Za-z0-9]{0,63}$")
private val REQUEST_ID = Regex("^[A-Za-z0-9_.:-]{1,64}$")
private val FILE_ID = Regex("^[0-9a-fA-F-]{36}$")

/**
 * 화면이 ready features로 알린 것 중 PC에 그대로 알리는 능력 (헤더 X-Office-Capabilities, docs/specs/office-iso-tech.md 4-3절).
 * "iso-office" = 회사 레벨 11 이상을 그릴 수 있는 화면 — 없으면 PC가 레벨을 10으로 줄여 보낸다 (예전 번들이 빈 화면이 되지 않게).
 * 셸은 모르는 값을 넘기지 않는다
 */
val SCREEN_CAPABILITIES = setOf("iso-office")
const val CAPABILITIES_HEADER = "X-Office-Capabilities"

fun capabilitiesOf(features: Set<String>): Set<String> = features intersect SCREEN_CAPABILITIES

sealed interface BridgeRequest {
    /**
     * 화면이 준비됨 → 셸이 hello를 보내고 이벤트 스트림을 연다.
     * features: 화면이 스스로 하겠다고 알리는 것. "ime" = 키보드 높이를 insets 메시지·CSS --ime로 받아 화면이 직접 비킨다
     * (그러면 셸은 WebView 크기를 줄이지 않는다 — 두 쪽이 함께 올려 이중으로 뜨지 않게).
     * "iso-office" 등 SCREEN_CAPABILITIES에 있는 값은 /v2/call·/v2/events 요청 헤더로 PC에 알린다
     */
    data class Ready(val features: Set<String> = emptySet()) : BridgeRequest
    /** window.office.<method>(...args) — POST /v2/call */
    data class Call(val id: String, val method: String, val args: JsonArray, val confirm: Boolean) : BridgeRequest
    /** saveAttachments의 파일 하나 — POST /v2/attachments */
    data class Upload(val id: String, val name: String, val mime: String, val base64: String) : BridgeRequest
    /** 첨부를 휴대폰에 저장 (openAttachment 대신) — GET /v2/files/{id} */
    data class Download(val id: String, val fileId: String, val name: String) : BridgeRequest
    /** 셸이 보낸 back에 대한 답: 화면이 처리했는지 (시트 닫기·이전 화면 등) */
    data class BackResult(val handled: Boolean) : BridgeRequest
    /** 모양이 틀림 — id가 있으면 오류로 답한다 */
    data class Invalid(val id: String?, val reason: String) : BridgeRequest
}

private fun JsonObject.str(key: String) = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

fun parseBridge(text: String): BridgeRequest {
    if (text.length > BRIDGE_MESSAGE_MAX) return BridgeRequest.Invalid(null, "too_large")
    val o = try {
        protocolJson.parseToJsonElement(text) as? JsonObject
    } catch (_: Exception) {
        null
    } ?: return BridgeRequest.Invalid(null, "not_json")
    val id = o.str("id")?.takeIf { REQUEST_ID.matches(it) }
    return when (o.str("type")) {
        "ready" -> BridgeRequest.Ready(
            ((o["features"] as? JsonArray).orEmpty()).mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }.toSet(),
        )
        "call" -> {
            val method = o.str("method")?.takeIf { METHOD_NAME.matches(it) }
            val args = when (val a = o["args"]) {
                null, JsonNull -> JsonArray(emptyList())
                is JsonArray -> a
                else -> null
            }
            if (id == null || method == null || args == null) BridgeRequest.Invalid(id, "bad_call")
            else BridgeRequest.Call(id, method, args, (o["confirm"] as? JsonPrimitive)?.content == "true")
        }
        "upload" -> {
            val data = o.str("base64")
            if (id == null || data == null) BridgeRequest.Invalid(id, "bad_upload")
            else BridgeRequest.Upload(id, o.str("name").orEmpty().ifBlank { "file" }, o.str("mime").orEmpty(), data)
        }
        "download" -> {
            val fileId = o.str("fileId")?.takeIf { FILE_ID.matches(it) }
            if (id == null || fileId == null) BridgeRequest.Invalid(id, "bad_download")
            else BridgeRequest.Download(id, fileId, o.str("name").orEmpty())
        }
        "backResult" -> BridgeRequest.BackResult((o["handled"] as? JsonPrimitive)?.content == "true")
        else -> BridgeRequest.Invalid(id, "unknown_type")
    }
}

// ── 셸 → 화면 ─────────────────────────────────────────

object BridgeOut {
    fun hello(appVersion: String, isTablet: Boolean): String = buildJsonObject {
        put("type", "hello")
        put("platform", "android")
        put("appVersion", appVersion)
        put("protocol", 2)
        put("isTablet", isTablet)
    }.toString()

    fun ok(id: String, result: JsonElement): String = buildJsonObject {
        put("type", "result")
        put("id", id)
        put("ok", true)
        put("result", result)
    }.toString()

    /**
     * 실패: status·code·message는 서버 오류 본문 그대로(pc_only의 alternative, blocked의 reason 포함).
     * 응답을 못 받은 경우는 status 0, code는 앱이 붙인 이름(unreachable 등)
     */
    fun fail(id: String, status: Int, code: String, message: String, alternative: String? = null, reason: String? = null): String = buildJsonObject {
        put("type", "result")
        put("id", id)
        put("ok", false)
        put("error", buildJsonObject {
            put("status", status)
            put("code", code)
            put("message", message)
            if (alternative != null) put("alternative", alternative)
            if (reason != null) put("reason", reason)
        })
    }.toString()

    fun fail(id: String, e: ApiError): String = when (e) {
        is ApiError.Remote -> fail(id, e.status, e.code, e.message, bodyString(e.body, "alternative"), bodyString(e.body, "reason"))
        else -> fail(id, 0, appCode(e), appMessage(e))
    }

    /** data는 서버가 보낸 JSON 그대로 (한 번 해석해 깨진 값은 보내지 않는다) */
    fun event(name: String, data: String): String? {
        val parsed = try {
            protocolJson.parseToJsonElement(data)
        } catch (_: Exception) {
            return null
        }
        return buildJsonObject {
            put("type", "event")
            put("name", name)
            put("data", parsed)
        }.toString()
    }

    fun connection(state: String, reason: String? = null): String = buildJsonObject {
        put("type", "connection")
        put("state", state)
        if (reason != null) put("reason", reason)
    }.toString()

    /** 이벤트를 놓쳤다 — 화면이 chatHistory()·timeline()으로 빈 구간을 다시 읽는다 (v2 8-3절) */
    fun resync(): String = """{"type":"resync"}"""

    fun back(): String = """{"type":"back"}"""

    /** 키보드·시스템 바가 WebView를 가리는 높이 (CSS px). 화면이 features에 "ime"를 알렸을 때만 보낸다 */
    fun insets(ime: Int): String = buildJsonObject {
        put("type", "insets")
        put("ime", ime)
    }.toString()

    /** 오류 본문의 문자열 필드 하나 (pc_only의 alternative, blocked의 reason) */
    private fun bodyString(body: String?, key: String): String? = try {
        ((body?.let { protocolJson.parseToJsonElement(it) } as? JsonObject)?.get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content
    } catch (_: Exception) {
        null
    }
}

/** 응답을 못 받은 오류의 이름 (화면이 문구를 고른다) */
fun appCode(e: ApiError): String = when (e) {
    ApiError.PhoneOffline -> "phone_offline"
    ApiError.RemoteOff -> "remote_off"
    ApiError.Unreachable -> "unreachable"
    ApiError.PinMismatch -> "pin_mismatch"
    ApiError.TokenRevoked -> "token_revoked"
    ApiError.Unauthorized -> "unauthorized"
    is ApiError.Locked -> "auth_locked"
    ApiError.NeedsPcUpdate -> "protocol_unsupported"
    is ApiError.RateLimited -> "rate_limited"
    is ApiError.Unavailable -> "office_unavailable"
    ApiError.ServerError -> "internal_error"
    is ApiError.BadResponse -> "bad_response"
    else -> "app_error"
}

fun appMessage(e: ApiError): String = when (e) {
    ApiError.PhoneOffline -> S.get(R.string.state_offline_title)
    ApiError.RemoteOff, ApiError.Unreachable -> S.get(R.string.state_unreach_title)
    is ApiError.RateLimited -> S.get(R.string.bridge_rate)
    ApiError.ServerError -> S.get(R.string.bridge_server_error)
    else -> S.get(R.string.bridge_send_failed)
}
