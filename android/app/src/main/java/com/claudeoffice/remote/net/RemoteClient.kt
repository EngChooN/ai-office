// PC 원격 API 4종 호출. 결과는 화면이 바로 고를 수 있는 오류 종류(ApiError)로 바꿔 돌려준다
// 앱 로직은 error 값(없으면 HTTP 상태)으로만 분기한다 (규격 3-2). 토큰은 헤더에만 싣는다

package com.claudeoffice.remote.net

import android.util.Log
import java.io.IOException
import java.io.InterruptedIOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException
import javax.net.ssl.SSLPeerUnverifiedException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.RequestBody.Companion.toRequestBody

/** 연결 정보 (QR에서 온 값). 토큰은 SecureStore가 Keystore로 암호화해 보관한다. lan은 같은 와이파이용 사설 IPv4(선택) */
data class Connection(val host: String, val port: Int, val token: String, val spki: String, val lan: String? = null, val isLanOnly: Boolean = false)

/** PC에 닿는 길: 같은 와이파이 주소(QR lan) 또는 외부 주소(QR host). 둘 다 같은 지문으로 고정한다 */
enum class Route { LAN, EXTERNAL }

data class Endpoint(val route: Route, val host: String, val port: Int) {
    /** 화면용 "192.168.0.24:47900" (토큰은 넣지 않는다) */
    val label get() = if (':' in host) "[$host]:$port" else "$host:$port"
}

/** 전용 모드면 외부 주소는 후보에서 뺀다 (PC가 바깥 접속을 닫아 둔다). 내부 주소는 lan, 없으면 host */
fun Connection.endpoints(): List<Endpoint> =
    if (isLanOnly) listOf(Endpoint(Route.LAN, lan ?: host, port))
    else listOfNotNull(
        lan?.takeIf { it != host }?.let { Endpoint(Route.LAN, it, port) },
        Endpoint(Route.EXTERNAL, host, port),
    )

/** 마지막으로 성공한 길을 기억한다 (다음 조회·백그라운드 조회도 그 길부터) */
interface RouteMemory {
    var preferred: Route?
}

class InMemoryRoute(override var preferred: Route? = null) : RouteMemory

/** 같은 와이파이 주소는 짧게만 기다린다 — 밖에 있으면 금방 포기하고 외부 주소로 간다 */
const val LAN_CONNECT_TIMEOUT_SEC = 2L

/** 전용 모드는 내부 주소가 유일한 길이다 — VPN처럼 느린 길도 기다린다 */
const val LAN_ONLY_CONNECT_TIMEOUT_SEC = 5L

fun Connection.lanConnectTimeoutSec(): Long = if (isLanOnly) LAN_ONLY_CONNECT_TIMEOUT_SEC else LAN_CONNECT_TIMEOUT_SEC

/** v2 호출은 PC에서 최대 120초 (4-5절) */
const val V2_CALL_READ_SEC = 130L
const val V2_CALL_TOTAL_SEC = 140L

/** 이벤트 스트림: 35초 동안 아무것도 못 받으면 끊긴 것으로 본다 (keep-alive 15초를 두 번 놓치고 여유 5초, 8-4절) */
const val SSE_SILENCE_SEC = 35L

/** v2 호출(call·첨부·파일)을 동시에 몇 개까지 — 서버 주소당 8개 중 SSE 2개를 빼고 여유 1 */
const val V2_MAX_CONCURRENT = 5

class FileBytes(val mime: String, val disposition: String?, val bytes: ByteArray)

/** v2 오류 코드 중 앱 전체 상태를 바꾸는 것(인증·잠금·버전·스위치)은 v1처럼, 나머지는 화면에 그대로 넘긴다 */
private val V2_SHARED_CODES = setOf(
    "unauthorized", "token_revoked", "auth_locked", "protocol_unsupported",
    "rate_limited", "office_unavailable", "internal_error",
)

fun mapV2Error(status: Int, bodyText: String?): ApiError {
    val body = try {
        bodyText?.let { protocolJson.decodeFromString(ErrorBody.serializer(), it) }
    } catch (_: Exception) {
        null
    }
    val code = body?.error
    return when {
        // 426: 이 PC는 v2를 모른다 → PC 업데이트 안내 (v2 규격 2-1)
        code == "protocol_unsupported" || status == 426 -> ApiError.NeedsPcUpdate
        code in V2_SHARED_CODES || status == 401 -> mapHttpError(status, bodyText)
        else -> ApiError.Remote(status, code ?: "http_$status", body?.message.orEmpty(), bodyText)
    }
}

sealed interface ApiError {
    // 응답 없음 (규격 7절 마지막 줄, 디자인 6절 제안 2)
    data object PhoneOffline : ApiError       // C 끊김
    data object RemoteOff : ApiError          // A 원격 꺼짐 (연결 거부)
    data object Unreachable : ApiError        // B 절전·PC 응답 없음 (시간 초과 등)
    data object PinMismatch : ApiError        // G 인증서 불일치

    // 401
    data object TokenRevoked : ApiError       // D
    data object Unauthorized : ApiError       // E
    data class Locked(val retryAt: Long) : ApiError // F

    // 버전
    data object NeedsAppUpdate : ApiError     // H (앱)
    data object NeedsPcUpdate : ApiError      // H (PC)

    // 일시적
    data class RateLimited(val retryAfterSec: Int) : ApiError
    data class Unavailable(val retryAfterSec: Int) : ApiError // 503
    data object ServerError : ApiError        // 500, 모르는 5xx → K

    // 동작별
    data object InvalidRequest : ApiError
    data object InvalidAction : ApiError
    /** 결재 요약이 잘려 휴대폰에서는 승인할 수 없음 (400 review_on_pc). 반려는 된다 */
    data object ReviewOnPc : ApiError
    data object StaffNotFound : ApiError
    data object AlreadyDecided : ApiError
    data object PayloadTooLarge : ApiError

    /** 404 not_found·405·415·모르는 4xx → L 앱 오류 */
    data class AppBug(val code: String) : ApiError

    /** v2: 화면이 처리할 오류 (pc_only·call_failed·confirm_required 등). 본문을 그대로 화면에 넘긴다 */
    data class Remote(val status: Int, val code: String, val message: String, val body: String?) : ApiError

    /** 200은 왔는데 응답을 읽지 못함 (PC와 앱이 기대하는 모양이 다름). path는 실패한 JSON 위치 */
    data class BadResponse(val path: String) : ApiError
}

sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T, val serverTime: Long) : ApiResult<T>
    /** tried: 응답을 받지 못하고 시도한 주소들 (연결 실패 화면에 보인다) */
    data class Fail(val error: ApiError, val tried: List<Endpoint> = emptyList()) : ApiResult<Nothing>
}

/** HTTP 오류 응답 → ApiError. 모르는 error 값은 HTTP 상태로 처리한다 (규격 2-3) */
fun mapHttpError(status: Int, bodyText: String?): ApiError {
    val body = try {
        bodyText?.let { protocolJson.decodeFromString(ErrorBody.serializer(), it) }
    } catch (_: Exception) {
        null
    }
    return when (body?.error) {
        "invalid_request" -> ApiError.InvalidRequest
        "invalid_action" -> ApiError.InvalidAction
        "review_on_pc" -> ApiError.ReviewOnPc
        "unauthorized" -> ApiError.Unauthorized
        "token_revoked" -> ApiError.TokenRevoked
        // retryAt 없는 잠금은 규격 위반 — 보수적으로 15분 뒤로 본다
        "auth_locked" -> ApiError.Locked(body.retryAt ?: (System.currentTimeMillis() + 15 * 60_000L))
        "staff_not_found" -> ApiError.StaffNotFound
        "already_decided" -> ApiError.AlreadyDecided
        "payload_too_large" -> ApiError.PayloadTooLarge
        "protocol_unsupported" -> versionError(body.supported)
        "rate_limited" -> ApiError.RateLimited(body.retryAfterSec ?: 60)
        "office_unavailable" -> ApiError.Unavailable(body.retryAfterSec ?: 5)
        "internal_error" -> ApiError.ServerError
        "not_found", "method_not_allowed", "unsupported_media_type" -> ApiError.AppBug(body.error)
        else -> when (status) {
            401 -> ApiError.Unauthorized
            409 -> ApiError.AlreadyDecided
            426 -> versionError(body?.supported.orEmpty())
            429 -> ApiError.RateLimited(body?.retryAfterSec ?: 60)
            503 -> ApiError.Unavailable(body?.retryAfterSec ?: 5)
            in 500..599 -> ApiError.ServerError
            else -> ApiError.AppBug("http_$status")
        }
    }
}

/** supported에 앱보다 큰 버전만 있으면 앱 업데이트, 작은 것만 있으면 PC 업데이트 */
private fun versionError(supported: List<Int>): ApiError = when {
    supported.isNotEmpty() && supported.all { it < PROTOCOL_VERSION } -> ApiError.NeedsPcUpdate
    else -> ApiError.NeedsAppUpdate
}

private fun Throwable.causes() = generateSequence(this) { it.cause }

/** 네트워크 예외 → 화면 종류. 휴대폰이 오프라인이면 다른 원인보다 먼저 C */
fun mapIoError(e: Throwable, isPhoneOnline: Boolean): ApiError {
    if (e.causes().any { it is PinMismatchException }) return ApiError.PinMismatch
    // 호스트 이름 확인(=지문 재확인) 실패도 지문 불일치다
    if (e is SSLPeerUnverifiedException) return ApiError.PinMismatch
    if (!isPhoneOnline) return ApiError.PhoneOffline
    return when {
        e.causes().any { it is ConnectException && it !is NoRouteToHostException } -> ApiError.RemoteOff
        e.causes().any { it is SocketTimeoutException || it is InterruptedIOException } -> ApiError.Unreachable
        e is UnknownHostException -> ApiError.Unreachable
        // TLS가 아닌 것이 그 문을 쓰고 있음 등 — 연결하지 않았고 토큰도 보내지 않았다
        e is SSLException -> ApiError.Unreachable
        else -> ApiError.Unreachable
    }
}

/**
 * 응답을 못 받았을 때 다른 주소로 다시 보내도 되는지.
 * 조회(GET)는 늘 된다. 결정·지시(POST)는 요청이 PC에 닿지 않은 게 확실할 때만 — 같은 지시가 두 번 가지 않게
 */
internal fun canTryNextAddress(e: Throwable, isPost: Boolean): Boolean {
    if (!isPost) return true
    return e.causes().any {
        it is PinMismatchException || it is ConnectException || it is NoRouteToHostException || it is UnknownHostException ||
            it is javax.net.ssl.SSLHandshakeException || it is SSLPeerUnverifiedException ||
            (it is SocketTimeoutException && it.message.orEmpty().contains("connect", ignoreCase = true))
    }
}

/** 모든 주소가 실패했을 때 보일 오류: 지문 불일치 > 연결 거부(원격 꺼짐) > 그 밖 */
internal fun pickError(errors: List<ApiError>): ApiError = when {
    ApiError.PinMismatch in errors -> ApiError.PinMismatch
    ApiError.PhoneOffline in errors -> ApiError.PhoneOffline
    ApiError.RemoteOff in errors -> ApiError.RemoteOff
    else -> errors.lastOrNull() ?: ApiError.Unreachable
}

class RemoteClient(
    private val conn: Connection,
    private val isPhoneOnline: () -> Boolean,
    private val memory: RouteMemory = InMemoryRoute(),
    /** 테스트용: 주소 목록을 직접 준다 (기본은 QR의 lan → host) */
    endpoints: List<Endpoint> = conn.endpoints(),
) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val all = endpoints
    // 두 클라이언트 모두 같은 지문으로 고정한다 — 연결 시간 제한만 다르다
    private val lanHttp by lazy { pinnedClient(conn.spki, conn.lanConnectTimeoutSec()) }
    private val externalHttp by lazy { pinnedClient(conn.spki) }

    private fun http(e: Endpoint) = if (e.route == Route.LAN) lanHttp else externalHttp

    // v2: 오래 걸리는 호출(최대 120초)과 끊기지 않는 이벤트 스트림용. 같은 지문 고정 설정에 시간 제한만 바꾼다
    // 서버는 주소당 연결 8개까지 받고 SSE가 2개를 쓴다 → 호출은 동시에 5개까지 (한리뷰 권고).
    // 비동기(enqueue)는 Dispatcher가, 지금 쓰는 동기 execute()는 아래 v2Slots가 막는다 (Dispatcher는 동기 호출을 세지 않는다)
    private val callDispatcher = okhttp3.Dispatcher().apply { maxRequestsPerHost = V2_MAX_CONCURRENT; maxRequests = V2_MAX_CONCURRENT }
    private val v2Slots = kotlinx.coroutines.sync.Semaphore(V2_MAX_CONCURRENT)
    private val lanCallHttp by lazy {
        pinnedClient(conn.spki, conn.lanConnectTimeoutSec(), V2_CALL_READ_SEC, V2_CALL_TOTAL_SEC).newBuilder().dispatcher(callDispatcher).build()
    }
    private val externalCallHttp by lazy {
        pinnedClient(conn.spki, readTimeoutSec = V2_CALL_READ_SEC, callTimeoutSec = V2_CALL_TOTAL_SEC).newBuilder().dispatcher(callDispatcher).build()
    }
    private val lanStreamHttp by lazy { pinnedClient(conn.spki, conn.lanConnectTimeoutSec(), SSE_SILENCE_SEC, 0) }
    private val externalStreamHttp by lazy { pinnedClient(conn.spki, readTimeoutSec = SSE_SILENCE_SEC, callTimeoutSec = 0) }
    private fun callHttp(e: Endpoint) = if (e.route == Route.LAN) lanCallHttp else externalCallHttp
    private fun streamHttp(e: Endpoint) = if (e.route == Route.LAN) lanStreamHttp else externalStreamHttp

    /** 기억한 길이 먼저, 나머지는 QR 순서(lan → host) */
    private fun ordered(): List<Endpoint> {
        val first = memory.preferred
        return all.sortedBy { if (it.route == first) 0 else 1 }
    }

    private fun url(e: Endpoint, vararg segments: String): HttpUrl = HttpUrl.Builder()
        .scheme("https")
        .host(e.host)
        .port(e.port)
        .addPathSegment("v$PROTOCOL_VERSION")
        .apply { segments.forEach { addPathSegment(it) } }
        .build()

    suspend fun status() = call({ get(url(it, "status")) }, StatusResponse.serializer()) { it.serverTime }

    suspend fun decisions() = call({ get(url(it, "decisions")) }, DecisionsResponse.serializer()) { it.serverTime }

    suspend fun approve(id: String) = decide(id, buildJsonObject { put("action", "approve") })
    suspend fun reject(id: String) = decide(id, buildJsonObject { put("action", "reject") })
    suspend fun skip(id: String) = decide(id, buildJsonObject { put("action", "skip") })

    suspend fun answer(id: String, answers: Map<String, String>) = decide(id, buildJsonObject {
        put("action", "answer")
        put("answers", JsonObject(answers.mapValues { JsonPrimitive(it.value) }))
    })

    suspend fun reviewPlan(id: String, isApproved: Boolean, feedback: String) = decide(id, buildJsonObject {
        put("action", if (isApproved) "approve" else "reject")
        if (feedback.isNotBlank()) put("feedback", feedback)
    })

    suspend fun instruct(staffId: String, text: String): ApiResult<InstructionResponse> {
        val body = buildJsonObject {
            put("staffId", staffId)
            put("text", text)
        }
        return call({ post(url(it, "instructions"), body) }, InstructionResponse.serializer()) { it.serverTime }
    }

    private suspend fun decide(id: String, body: JsonObject) =
        call({ post(url(it, "decisions", id), body) }, DecideResponse.serializer()) { it.serverTime }

    private fun get(url: HttpUrl) = request(url).get().build()
    private fun post(url: HttpUrl, body: JsonObject) =
        request(url).post(body.toString().toRequestBody(jsonType)).build()

    /** 연결 단위로 판정하므로 이벤트 스트림은 다시 붙을 때마다 싣는다 (web/BridgeProtocol.kt SCREEN_CAPABILITIES) */
    private fun Request.Builder.capabilities(caps: Set<String>) =
        if (caps.isEmpty()) this else header(com.claudeoffice.remote.web.CAPABILITIES_HEADER, caps.sorted().joinToString(","))

    private fun request(url: HttpUrl) = Request.Builder()
        .url(url)
        .header("Authorization", "Bearer ${conn.token}")
        .header("Accept", "application/json")

    private suspend fun <T> call(build: (Endpoint) -> Request, serializer: KSerializer<T>, serverTime: (T) -> Long): ApiResult<T> =
        exchange(::http, build) { res -> send(res, serializer, serverTime) }

    /**
     * 주소를 차례로 시도한다. 어떤 HTTP 응답이든 받으면 그 주소에 닿은 것이라 기억하고 거기서 끝낸다.
     * handle이 응답을 닫는다 (이벤트 스트림은 열어 둔 채 넘긴다)
     */
    private suspend fun <T> exchange(client: (Endpoint) -> OkHttpClient, build: (Endpoint) -> Request, handle: (Response) -> ApiResult<T>): ApiResult<T> =
        withContext(Dispatchers.IO) {
            val tried = mutableListOf<Endpoint>()
            val errors = mutableListOf<ApiError>()
            for (e in ordered()) {
                val req = build(e)
                try {
                    val response = client(e).newCall(req).execute()
                    memory.preferred = e.route
                    val result = handle(response)
                    return@withContext result
                } catch (ex: IOException) {
                    tried += e
                    errors += mapIoError(ex, isPhoneOnline())
                    if (errors.last() == ApiError.PhoneOffline || !canTryNextAddress(ex, req.method == "POST")) break
                }
            }
            ApiResult.Fail(pickError(errors), tried)
        }

    // ── v2 (docs/specs/remote-protocol-v2.md) ─────────────────

    /**
     * POST /v2/call — OfficeApi 메서드 하나. 결과(result)는 해석하지 않고 JSON 그대로 화면에 넘긴다.
     * idempotencyKey: 같은 호출을 다시 보낼 때 PC가 한 번만 처리하게 (4-6절)
     */
    /** capabilities: 화면이 알린 능력 → 헤더 X-Office-Capabilities (PC가 요청마다 응답 모양을 정한다) */
    suspend fun v2Call(method: String, args: JsonArray, confirm: Boolean, idempotencyKey: String, capabilities: Set<String> = emptySet()): ApiResult<JsonElement> {
        val body = buildJsonObject {
            put("method", method)
            put("args", args)
            if (confirm) put("confirm", true)
        }.toString().toRequestBody(jsonType)
        return v2Slots.withPermit {
            exchange(::callHttp, { e ->
                request(urlV2(e, "call")).header("Idempotency-Key", idempotencyKey).capabilities(capabilities).post(body).build()
            }) { res -> res.use { readV2(it) { o -> o["result"] ?: JsonNull } } }
        }
    }

    /** POST /v2/attachments — 파일 하나를 바이트 그대로 올린다. 결과는 {id,name,mime,size} */
    suspend fun v2Upload(name: String, mime: String, bytes: ByteArray): ApiResult<JsonElement> {
        val body = bytes.toRequestBody(mime.ifBlank { "application/octet-stream" }.toMediaType())
        return v2Slots.withPermit { exchange(::callHttp, { e ->
            request(urlV2(e, "attachments"))
                .header("X-File-Name", java.net.URLEncoder.encode(name, "UTF-8").replace("+", "%20"))
                .post(body).build()
        }) { res -> res.use { readV2(it) { o -> o["attachment"] ?: JsonNull } } } }
    }

    /** GET /v2/files/{id} — 사무실 파일 바이트 (WebView의 office-file 주소를 대신 받는다) */
    suspend fun v2File(id: String): ApiResult<FileBytes> = v2Slots.withPermit { exchange(::callHttp, { e ->
        request(urlV2(e, "files", id)).get().build()
    }) { res ->
        res.use {
            if (!it.isSuccessful) return@use ApiResult.Fail(mapV2Error(it.code, it.body?.string()))
            val bytes = it.body?.bytes() ?: ByteArray(0)
            ApiResult.Ok(FileBytes(it.header("Content-Type") ?: "application/octet-stream", it.header("Content-Disposition"), bytes), 0L)
        }
    } }

    /** GET /v2/events — 열린 응답을 넘긴다 (읽는 쪽이 닫는다). 오류면 닫고 ApiError */
    suspend fun v2Events(lastEventId: String?, capabilities: Set<String> = emptySet()): ApiResult<Response> = exchange(::streamHttp, { e ->
        request(urlV2(e, "events")).header("Accept", "text/event-stream").capabilities(capabilities)
            .apply { if (lastEventId != null) header("Last-Event-ID", lastEventId) }
            .get().build()
    }) { res ->
        if (res.isSuccessful) ApiResult.Ok(res, 0L)
        else res.use { ApiResult.Fail(mapV2Error(it.code, it.body?.string())) }
    }

    private fun urlV2(e: Endpoint, vararg segments: String): HttpUrl = HttpUrl.Builder()
        .scheme("https").host(e.host).port(e.port)
        .addPathSegment("v2")
        .apply { segments.forEach { addPathSegment(it) } }
        .build()

    private fun readV2(res: Response, pick: (JsonObject) -> JsonElement): ApiResult<JsonElement> {
        val text = res.body?.string()
        if (!res.isSuccessful) return ApiResult.Fail(mapV2Error(res.code, text))
        val obj = try {
            protocolJson.parseToJsonElement(text ?: "") as? JsonObject
        } catch (_: Exception) {
            null
        } ?: return ApiResult.Fail(ApiError.BadResponse("$"))
        val time = (obj["serverTime"] as? JsonPrimitive)?.longOrNull ?: 0L
        return ApiResult.Ok(pick(obj), time)
    }

    private fun <T> send(response: Response, serializer: KSerializer<T>, serverTime: (T) -> Long): ApiResult<T> {
        val req = response.request
        response.use { res ->
            val text = res.body?.string()
            if (!res.isSuccessful) return ApiResult.Fail(mapHttpError(res.code, text))
            return when (val parsed = parseSuccess(text, serializer)) {
                is Parsed.Ok -> ApiResult.Ok(parsed.value, serverTime(parsed.value))
                Parsed.Newer -> ApiResult.Fail(ApiError.NeedsAppUpdate)
                is Parsed.Bad -> {
                    // 어느 필드에서 실패했는지만 남긴다 (값·본문은 직원이 쓴 글이 섞일 수 있어 남기지 않는다)
                    Log.w(TAG, "응답 해석 실패: ${req.url.encodedPath} at ${parsed.path}")
                    ApiResult.Fail(ApiError.BadResponse(parsed.path))
                }
            }
        }
    }
}

/** 응답의 protocolVersion이 앱보다 크면 응답을 쓰지 않는다 (규격 2-4) */
internal fun newerProtocol(text: String?): Boolean = try {
    val v = (protocolJson.parseToJsonElement(text ?: "") as? JsonObject)?.get("protocolVersion") as? JsonPrimitive
    v != null && !v.isString && v.int > PROTOCOL_VERSION
} catch (_: Exception) {
    false
}

internal sealed interface Parsed<out T> {
    data class Ok<T>(val value: T) : Parsed<T>
    data object Newer : Parsed<Nothing>
    /** path: 실패한 JSON 위치(예: "$.staff[3].avatar"). 알 수 없으면 "$" */
    data class Bad(val path: String) : Parsed<Nothing>
}

private val JSON_PATH = Regex("""at path: (\$[^\s]*)""")

/** 실패 메시지에서 JSON 위치만 꺼낸다 (메시지에 붙는 입력 일부는 버린다) */
internal fun failedPath(e: Throwable): String =
    e.message?.let { JSON_PATH.find(it)?.groupValues?.get(1) }
        ?: (e as? kotlinx.serialization.MissingFieldException)?.missingFields?.joinToString(prefix = "필드 없음: ")
        ?: "$"

internal fun <T> parseSuccess(text: String?, serializer: KSerializer<T>): Parsed<T> {
    if (text == null) return Parsed.Bad("본문 없음")
    if (newerProtocol(text)) return Parsed.Newer
    return try {
        Parsed.Ok(protocolJson.decodeFromString(serializer, text))
    } catch (e: Exception) {
        Parsed.Bad(failedPath(e))
    }
}

private const val TAG = "ClaudeOfficeRemote"
