package com.claudeoffice.remote

import com.claudeoffice.remote.net.Decision
import com.claudeoffice.remote.net.Question
import com.claudeoffice.remote.net.QuestionOption
import com.claudeoffice.remote.ui.answerText
import com.claudeoffice.remote.work.decisionNotice
import com.claudeoffice.remote.work.newDecisions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class NoticesTest {
    init { TestStrings.install() }

    private fun d(id: String, name: String) = Decision(id = id, kind = "approval", staffName = name, summary = "rm -rf /secret/path", toolName = "Bash")

    @Test fun notifiesOnlyNewDecisions() {
        val list = listOf(d("a.1", "이디자"), d("a.2", "한리뷰"))
        assertEquals(listOf("a.2"), newDecisions(list, setOf("a.1")).map { it.id })
        assertNull(decisionNotice(newDecisions(list, setOf("a.1", "a.2"))))
    }

    @Test fun defaultNoticeShowsCountOnly() {
        val one = decisionNotice(listOf(d("a.1", "이디자")))!!
        assertEquals("확인할 결정이 있어요", one.title)
        assertEquals("결정 1건이 기다려요", one.body)
        val many = decisionNotice(listOf(d("a.1", "이디자"), d("a.2", "한리뷰"), d("a.3", "정리드")))!!
        assertEquals("확인할 결정 3건", many.title)
        assertEquals("결정 3건이 기다려요", many.body)
        listOf(one, many).forEach {
            val all = it.title + it.body
            listOf("이디자", "한리뷰", "정리드", "rm -rf", "Bash", "/secret").forEach { word -> assertFalse(word, all.contains(word)) }
        }
    }

    @Test fun namesOnlyWhenSwitchedOn() {
        val many = decisionNotice(listOf(d("a.1", "이디자"), d("a.2", "한리뷰")), showNames = true)!!
        assertEquals("이디자 님 외 1명이 기다리고 있어요", many.body)
    }

    @Test fun answersJoinWithCommaAndIncludeCustomText() {
        val q = Question("어떤 색?", options = listOf(QuestionOption("파랑"), QuestionOption("주황")), multiSelect = true)
        assertEquals("파랑, 주황", answerText(q, setOf("주황", "파랑"), ""))
        assertNull(answerText(q, emptySet(), ""))
    }
}
