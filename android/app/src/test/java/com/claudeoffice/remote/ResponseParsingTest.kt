package com.claudeoffice.remote

import com.claudeoffice.remote.net.DecisionsResponse
import com.claudeoffice.remote.net.Parsed
import com.claudeoffice.remote.net.StatusResponse
import com.claudeoffice.remote.net.parseSuccess
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** QA 2차 0번: 실제 PC의 응답 모양 그대로 해석되는지 */
class ResponseParsingTest {
    private fun staff(id: String, avatar: String) =
        """{"id":"$id","name":"이름$id","role":"직무","avatar":$avatar,"status":"working","activity":"a","statusSince":1790000000000,"pendingDecisions":0}"""

    @Test fun statusWithAvatarBeyondIntIsParsed() {
        val text = """{"protocolVersion":1,"serverTime":1790000000000,"serverVersion":"0.8.0",
            "staff":[${staff("a", "3")},${staff("b", "3730355052")},${staff("c", "9007199254740991")},${staff("d", "1.5")}],
            "summary":{"working":4,"waiting":0,"error":0,"idle":0,"offline":0}}"""
        val r = parseSuccess(text, StatusResponse.serializer())
        assertTrue(r.toString(), r is Parsed.Ok)
        assertEquals(listOf("a", "b", "c", "d"), (r as Parsed.Ok).value.staff.map { it.id })
    }

    @Test fun failureReportsTheJsonPath() {
        val text = """{"protocolVersion":1,"serverTime":1,"staff":[${staff("a", "3")},{"id":"b","name":"n","statusSince":"어제"}]}"""
        val r = parseSuccess(text, StatusResponse.serializer())
        assertEquals(Parsed.Bad("$.staff[1].statusSince"), r)
    }

    @Test fun failurePathNeverCarriesResponseText() {
        val secret = "/Users/me/secret-project"
        val text = """{"protocolVersion":1,"serverTime":1,"total":"$secret","decisions":[]}"""
        val r = parseSuccess(text, DecisionsResponse.serializer()) as Parsed.Bad
        assertTrue(r.path, !r.path.contains(secret))
    }

    @Test fun missingRequiredFieldIsNamed() {
        val r = parseSuccess("""{"protocolVersion":1,"serverTime":1,"staff":[{"name":"n"}]}""", StatusResponse.serializer())
        assertTrue(r.toString(), r is Parsed.Bad && (r.path.contains("id") || r.path.startsWith("$")))
    }

    @Test fun newerProtocolIsNotParsed() {
        assertEquals(Parsed.Newer, parseSuccess("""{"protocolVersion":2}""", StatusResponse.serializer()))
    }

    @Test fun truncatedApprovalFlagIsRead() {
        val text = """{"protocolVersion":1,"serverTime":1,"total":2,"decisions":[
            {"id":"a.1","kind":"approval","staffId":"s","staffName":"n","summary":"x","toolName":"Bash","createdAt":1,"isTruncated":true},
            {"id":"a.2","kind":"approval","staffId":"s","staffName":"n","summary":"y","toolName":"Edit","createdAt":2}]}"""
        val r = parseSuccess(text, DecisionsResponse.serializer()) as Parsed.Ok
        assertEquals(listOf(true, false), r.value.decisions.map { it.isTruncated })
    }
}
