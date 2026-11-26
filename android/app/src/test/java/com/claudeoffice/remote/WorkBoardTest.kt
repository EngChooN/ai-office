package com.claudeoffice.remote

import com.claudeoffice.remote.net.StatusResponse
import com.claudeoffice.remote.net.WORK_STATES
import com.claudeoffice.remote.net.DONE_LIMIT_MAX
import com.claudeoffice.remote.net.awaitingWorks
import com.claudeoffice.remote.net.canLoadMoreDone
import com.claudeoffice.remote.net.nextDoneLimit
import com.claudeoffice.remote.net.needsReReview
import com.claudeoffice.remote.net.protocolJson
import com.claudeoffice.remote.net.waitMinutes
import com.claudeoffice.remote.net.workStateOf
import com.claudeoffice.remote.net.worksOfState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkBoardTest {
    private fun parse(works: String) =
        protocolJson.decodeFromString(StatusResponse.serializer(), """{"protocolVersion":1,"works":$works}""").works

    @Test
    fun oldServerWithoutWorksGivesEmptyList() {
        val r = protocolJson.decodeFromString(StatusResponse.serializer(), """{"protocolVersion":1}""")
        assertTrue(r.works.isEmpty())
        assertEquals(0, r.worksDoneOmitted)
    }

    @Test
    fun listOrderFollowsDecision() {
        // decision.md ②: 대기 → 진행 → 검토 → 할 일 → 완료
        assertEquals(listOf("awaitingUser", "working", "review", "queued", "done"), WORK_STATES)
        val w = parse("""[{"id":"d","state":"done"},{"id":"q","state":"queued"},{"id":"r","state":"review"},{"id":"k","state":"working"},{"id":"a","state":"awaitingUser"}]""")
        assertEquals(listOf("a", "k", "r", "q", "d"), WORK_STATES.flatMap { st -> worksOfState(w, st) }.map { it.id })
    }

    @Test
    fun doneOmittedAndReviewCommitParsed() {
        val r = protocolJson.decodeFromString(
            StatusResponse.serializer(),
            """{"protocolVersion":1,"worksDoneOmitted":7,"works":[{"id":"a","state":"done","reviewCommit":"abc123"},{"id":"b"}]}""",
        )
        assertEquals(7, r.worksDoneOmitted)
        assertEquals("abc123", r.works[0].reviewCommit)
        assertEquals("", r.works[1].reviewCommit)
    }

    @Test
    fun unknownFieldsIgnoredAndMissingValuesDefault() {
        val w = parse("""[{"id":"a","future":{"x":1}},{"id":"b","state":"zzz","title":"T"}]""")
        assertEquals("queued", workStateOf(w[0]))
        assertEquals("queued", workStateOf(w[1]))
        assertEquals(0L, w[0].waitingSince)
        assertFalse(needsReReview(w[0]))
    }

    @Test
    fun awaitingSortedOldestFirstAndUnknownTimeLast() {
        val w = parse("""[{"id":"x","state":"awaitingUser","waitingSince":300},{"id":"y","state":"awaitingUser"},{"id":"z","state":"awaitingUser","waitingSince":100},{"id":"q","state":"working"}]""")
        assertEquals(listOf("z", "x", "y"), awaitingWorks(w).map { it.id })
    }

    @Test
    fun reReviewOnlyWhenNeeded() {
        val w = parse("""[{"id":"a","reReview":"needed"},{"id":"b","reReview":"clear"},{"id":"c","reReview":"unknown"}]""")
        assertEquals(listOf(true, false, false), w.map { needsReReview(it) })
    }

    @Test
    fun waitMinutesClampsNegativeAndHandlesUnknown() {
        assertEquals(0L, waitMinutes(10_000_000, 5_000_000))
        assertEquals(42L, waitMinutes(1, 1 + 42 * 60_000L))
        assertEquals(null, waitMinutes(0, 5_000_000))
    }

    @Test
    fun nextDoneLimitAddsTwentyUpToFiveHundred() {
        assertEquals(40, nextDoneLimit(20))
        assertEquals(60, nextDoneLimit(40))
        assertEquals(500, nextDoneLimit(480))
        assertEquals(500, nextDoneLimit(490))
        assertEquals(500, nextDoneLimit(500))
        assertEquals(DONE_LIMIT_MAX, generateSequence(20, ::nextDoneLimit).take(100).last())
    }

    @Test
    fun loadMoreDoneOnlyWhileOmittedAndBelowCap() {
        assertTrue(canLoadMoreDone(20, 7))
        assertTrue(canLoadMoreDone(480, 1))
        assertFalse(canLoadMoreDone(20, 0))
        // 500에 닿았는데도 남으면 "PC에서 볼 수 있어요"
        assertFalse(canLoadMoreDone(500, 30))
    }
}
