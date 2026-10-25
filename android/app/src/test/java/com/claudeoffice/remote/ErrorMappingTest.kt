package com.claudeoffice.remote

import com.claudeoffice.remote.net.ApiError
import com.claudeoffice.remote.net.PinMismatchException
import com.claudeoffice.remote.net.mapHttpError
import com.claudeoffice.remote.net.mapIoError
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLHandshakeException
import org.junit.Assert.assertEquals
import org.junit.Test

class ErrorMappingTest {
    private fun body(error: String, extra: String = "") = """{"protocolVersion":1,"error":"$error","message":"m"$extra}"""

    @Test fun splits401ByErrorCode() {
        assertEquals(ApiError.TokenRevoked, mapHttpError(401, body("token_revoked")))
        assertEquals(ApiError.Unauthorized, mapHttpError(401, body("unauthorized")))
        assertEquals(ApiError.Locked(1790000000000), mapHttpError(401, body("auth_locked", ",\"retryAt\":1790000000000")))
    }

    @Test fun unknownErrorFallsBackToHttpStatus() {
        assertEquals(ApiError.Unauthorized, mapHttpError(401, body("something_new")))
        assertEquals(ApiError.ServerError, mapHttpError(502, body("something_new")))
        assertEquals(ApiError.AppBug("http_418"), mapHttpError(418, body("something_new")))
        assertEquals(ApiError.ServerError, mapHttpError(500, "not json"))
    }

    @Test fun mapsTheRestOfTheTable() {
        assertEquals(ApiError.InvalidRequest, mapHttpError(400, body("invalid_request")))
        assertEquals(ApiError.InvalidAction, mapHttpError(400, body("invalid_action")))
        assertEquals(ApiError.ReviewOnPc, mapHttpError(400, body("review_on_pc")))
        assertEquals(ApiError.AppBug("not_found"), mapHttpError(404, body("not_found")))
        assertEquals(ApiError.StaffNotFound, mapHttpError(404, body("staff_not_found")))
        assertEquals(ApiError.AppBug("method_not_allowed"), mapHttpError(405, body("method_not_allowed")))
        assertEquals(ApiError.AlreadyDecided, mapHttpError(409, body("already_decided")))
        assertEquals(ApiError.PayloadTooLarge, mapHttpError(413, body("payload_too_large")))
        assertEquals(ApiError.AppBug("unsupported_media_type"), mapHttpError(415, body("unsupported_media_type")))
        assertEquals(ApiError.RateLimited(7), mapHttpError(429, body("rate_limited", ",\"retryAfterSec\":7")))
        assertEquals(ApiError.ServerError, mapHttpError(500, body("internal_error")))
        assertEquals(ApiError.Unavailable(5), mapHttpError(503, body("office_unavailable", ",\"retryAfterSec\":5")))
    }

    @Test fun protocolUnsupportedPicksWhoShouldUpdate() {
        assertEquals(ApiError.NeedsAppUpdate, mapHttpError(426, body("protocol_unsupported", ",\"supported\":[2]")))
        assertEquals(ApiError.NeedsPcUpdate, mapHttpError(426, body("protocol_unsupported", ",\"supported\":[0]")))
    }

    @Test fun noResponseCases() {
        assertEquals(ApiError.PhoneOffline, mapIoError(UnknownHostException(), isPhoneOnline = false))
        assertEquals(ApiError.RemoteOff, mapIoError(ConnectException("refused"), isPhoneOnline = true))
        assertEquals(ApiError.Unreachable, mapIoError(SocketTimeoutException(), isPhoneOnline = true))
        assertEquals(ApiError.Unreachable, mapIoError(UnknownHostException(), isPhoneOnline = true))
    }

    @Test fun pinMismatchWinsEvenWhenOffline() {
        val e = SSLHandshakeException("x").apply { initCause(PinMismatchException()) }
        assertEquals(ApiError.PinMismatch, mapIoError(e, isPhoneOnline = true))
        assertEquals(ApiError.PinMismatch, mapIoError(e, isPhoneOnline = false))
    }
}
