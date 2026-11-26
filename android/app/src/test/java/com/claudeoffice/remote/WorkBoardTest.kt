package com.claudeoffice.remote

import com.claudeoffice.remote.net.StatusResponse
import com.claudeoffice.remote.net.awaitingWorks
import com.claudeoffice.remote.net.needsReReview
import com.claudeoffice.remote.net.protocolJson
import com.claudeoffice.remote.net.waitMinutes
import com.claudeoffice.remote.net.workStateOf
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
}
