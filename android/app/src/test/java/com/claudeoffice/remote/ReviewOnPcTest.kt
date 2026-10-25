package com.claudeoffice.remote

import com.claudeoffice.remote.net.ApiError
import com.claudeoffice.remote.net.Decision
import com.claudeoffice.remote.net.mapHttpError
import com.claudeoffice.remote.ui.REVIEW_ON_PC_TEXT
import com.claudeoffice.remote.ui.actionErrorMessage
import com.claudeoffice.remote.ui.isApproveBlocked
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** 규격 5-3·7절: 잘린 결재는 휴대폰에서 승인할 수 없다 (400 review_on_pc), 반려는 된다 */
class ReviewOnPcTest {
    init { TestStrings.install() }

    private val body = """{"protocolVersion":1,"error":"review_on_pc","message":"PC에서 전체를 확인해 주세요"}"""

    @Test fun reviewOnPcIsNotAGeneric400() {
        val e = mapHttpError(400, body)
        assertEquals(ApiError.ReviewOnPc, e)
        assertEquals(REVIEW_ON_PC_TEXT, actionErrorMessage(e))
        // 일반 400(invalid_request)과 안내가 다르다
        assertTrue(actionErrorMessage(mapHttpError(400, """{"protocolVersion":1,"error":"invalid_request"}""")) != REVIEW_ON_PC_TEXT)
    }

    @Test fun approveIsBlockedForTruncatedOrServerRejectedApprovals() {
        val plain = Decision(id = "a.1", kind = "approval")
        val clipped = plain.copy(id = "a.2", isTruncated = true)
        assertFalse(isApproveBlocked(plain, emptyList()))
        assertTrue(isApproveBlocked(clipped, emptyList()))
        // 서버가 승인을 거부한 카드는 목록을 새로 받기 전에도 바로 막는다
        assertTrue(isApproveBlocked(plain, listOf("a.1")))
        // 질문·기획은 승인 버튼 막기 대상이 아니다
        assertFalse(isApproveBlocked(Decision(id = "a.3", kind = "question", isTruncated = true), emptyList()))
    }

    @Test fun noticeUsesSpecWording() {
        assertEquals("일부만 보여요 — PC에서 전체를 확인해 주세요", REVIEW_ON_PC_TEXT)
    }
}
