package com.claudeoffice.remote

import com.claudeoffice.remote.web.GraceReporter
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.Assert.assertEquals

@OptIn(ExperimentalCoroutinesApi::class)
class GraceReporterTest {
    private fun TestScope.make(out: MutableList<String>) = GraceReporter(this, 8_000) { s, r -> out += if (r == null) s else "$s:$r" }

    @Test
    fun `짧은 끊김은 알리지 않는다`() = runTest {
        val out = mutableListOf<String>()
        val g = make(out)
        g.report("connecting"); g.report("open")
        g.report("reconnecting"); advanceTimeBy(3_000); g.report("connecting"); g.report("open")
        advanceTimeBy(20_000)
        assertEquals(listOf("connecting", "open", "open"), out)
    }

    @Test
    fun `유예를 넘기면 한 번 알린다`() = runTest {
        val out = mutableListOf<String>()
        val g = make(out)
        g.report("open"); g.report("reconnecting"); advanceTimeBy(9_000)
        g.report("connecting"); g.report("reconnecting")
        assertEquals(listOf("open", "reconnecting", "connecting", "reconnecting"), out)
    }

    @Test
    fun `앱이 멈춘 closed는 알리지 않고 사유 있는 closed는 바로`() = runTest {
        val out = mutableListOf<String>()
        val g = make(out)
        g.report("open"); g.report("closed"); g.report("connecting"); advanceTimeBy(2_000)
        g.report("closed", "token_revoked")
        assertEquals(listOf("open", "closed:token_revoked"), out)
    }

    @Test
    fun `처음 붙는 중이면 바로 알린다`() = runTest {
        val out = mutableListOf<String>()
        make(out).report("connecting")
        assertEquals(listOf("connecting"), out)
    }
}
