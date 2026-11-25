package com.claudeoffice.remote

import com.claudeoffice.remote.net.Connection
import com.claudeoffice.remote.store.MAX_PCS
import com.claudeoffice.remote.store.PcAdd
import com.claudeoffice.remote.store.PcBook
import com.claudeoffice.remote.store.PcBookCodec
import com.claudeoffice.remote.store.PcBooks
import com.claudeoffice.remote.work.Notice
import com.claudeoffice.remote.work.forPc
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PcBookTest {
    private fun conn(n: Int, host: String = "10.0.0.$n", token: String = "tok$n") = Connection(host, 47900, token, "sha256/pin$n=")

    private fun add(book: PcBook, c: Connection) = when (val r = PcBooks.add(book, c, 1000)) {
        is PcAdd.Added -> r.book
        is PcAdd.Updated -> r.book
        PcAdd.Full -> error("full")
    }

    private fun three() = add(add(add(PcBook(), conn(1)), conn(2)), conn(3))

    @Test fun addsUpToThreeThenRejectsFourth() {
        val book = three()
        assertEquals(MAX_PCS, book.entries.size)
        assertEquals(listOf("PC 1", "PC 2", "PC 3"), book.entries.map(PcBooks::name))
        assertEquals(PcAdd.Full, PcBooks.add(book, conn(4), 2000))
        // 거부해도 기존 목록은 그대로
        assertEquals(3, book.entries.size)
    }

    @Test fun newPcBecomesCurrent() {
        val book = add(add(PcBook(), conn(1)), conn(2))
        assertEquals(conn(2).spki, book.currentId)
    }

    @Test fun samePcUpdatesInsteadOfDuplicating_evenWhenFull() {
        val book = three()
        val r = PcBooks.add(book, conn(2, host = "192.168.9.9", token = "newtoken"), 5000)
        assertTrue(r is PcAdd.Updated)
        r as PcAdd.Updated
        assertEquals(3, r.book.entries.size)
        val e = r.book.find(conn(2).spki)!!
        assertEquals("192.168.9.9", e.conn.host)
        assertEquals("newtoken", e.conn.token)
        assertEquals(2, e.slot)            // 순서(칸)·시간 유지
        assertEquals(1000L, e.addedAt)
        assertEquals(conn(2).spki, r.book.currentId) // 갱신한 PC가 현재 PC
    }

    @Test fun updateKeepsAlias() {
        var book = PcBooks.rename(add(PcBook(), conn(1)), conn(1).spki, "  집 맥  ")
        book = add(book, conn(1, host = "1.2.3.4"))
        assertEquals("집 맥", PcBooks.name(book.entries[0]))
    }

    @Test fun removeKeepsOthersAndPicksFirstWhenCurrentRemoved() {
        val book = three() // 현재 = 3
        val afterCurrent = PcBooks.remove(book, conn(3).spki)
        assertEquals(listOf(conn(1).spki, conn(2).spki), afterCurrent.entries.map { it.id })
        assertEquals(conn(1).spki, afterCurrent.currentId) // 가장 먼저 연결한 PC
        val afterOther = PcBooks.remove(book, conn(1).spki)
        assertEquals(conn(3).spki, afterOther.currentId)   // 다른 PC를 끊으면 현재는 그대로
        val none = PcBooks.remove(PcBooks.remove(PcBooks.remove(book, conn(1).spki), conn(2).spki), conn(3).spki)
        assertTrue(none.entries.isEmpty()); assertNull(none.currentId)
    }

    @Test fun freedSlotNumberIsReused() {
        val book = PcBooks.remove(three(), conn(2).spki)
        val added = add(book, conn(4))
        assertEquals("PC 2", PcBooks.name(added.find(conn(4).spki)!!))
        assertEquals(3, added.entries.size)
    }

    @Test fun disconnectThenReconnectWorks() {
        val book = PcBooks.remove(add(PcBook(), conn(1)), conn(1).spki)
        val again = add(book, conn(1))
        assertEquals(1, again.entries.size)
        assertEquals(conn(1).spki, again.currentId)
    }

    @Test fun selectOnlyKnownPc() {
        val book = three()
        assertEquals(conn(1).spki, PcBooks.select(book, conn(1).spki).currentId)
        assertEquals(book.currentId, PcBooks.select(book, "sha256/unknown=").currentId)
    }

    @Test fun renameLimitsLengthAndEmptyGoesBackToDefault() {
        var book = PcBooks.rename(add(PcBook(), conn(1)), conn(1).spki, "가".repeat(40))
        assertEquals(20, PcBooks.name(book.entries[0]).length)
        book = PcBooks.rename(book, conn(1).spki, "   ")
        assertEquals("PC 1", PcBooks.name(book.entries[0]))
    }

    @Test fun revokedPcKeepsNameButLosesToken() {
        val book = PcBooks.withoutToken(three(), conn(2).spki)
        assertEquals("", book.find(conn(2).spki)!!.conn.token)
        assertEquals("tok1", book.find(conn(1).spki)!!.conn.token)
        assertEquals("PC 2", PcBooks.name(book.find(conn(2).spki)!!))
    }

    @Test fun perPcKeysDoNotCollide() {
        val a = PcBooks.key(conn(1).spki, "stopReason")
        val b = PcBooks.key(conn(2).spki, "stopReason")
        assertNotEquals(a, b)
        // 옛 키("stopReason")와도 겹치지 않아 이전 처리가 안전하다
        assertNotEquals("stopReason", a)
        assertTrue(a.startsWith(PcBooks.key(conn(1).spki, "")))
    }

    @Test fun noticeIdsAreSeparatePerPc() {
        val ids = (1..3).flatMap { listOf(PcBooks.decisionNoticeId(it), PcBooks.connectionNoticeId(it)) }
        assertEquals(6, ids.toSet().size)
        assertTrue(ids.none { it == 1 || it == 2 }) // 옛 고정 번호와 구분
    }

    @Test fun noticeNameOnlyWhenMoreThanOnePc() {
        val one = add(PcBook(), conn(1))
        assertNull(PcBooks.noticePrefix(one, one.entries[0]))
        val two = add(one, conn(2))
        val prefix = PcBooks.noticePrefix(two, two.entries[1])
        assertEquals("PC 2", prefix)
        assertEquals("[PC 2] 확인할 결정 3건", Notice("확인할 결정 3건", "x").forPc(prefix).title)
        assertEquals("확인할 결정 3건", Notice("확인할 결정 3건", "x").forPc(null).title) // 1대면 지금과 똑같이
    }

    @Test fun codecRoundTripKeepsEverything() {
        val book = PcBooks.rename(three(), conn(2).spki, "회사")
        val back = PcBookCodec.decode(PcBookCodec.encode(book))
        assertEquals(book, back)
    }

    @Test fun codecFixesDanglingCurrent() {
        val json = PcBookCodec.encode(three()).replace(conn(3).spki, "sha256/gone=").let { it }
        val back = PcBookCodec.decode(PcBookCodec.encode(PcBook(three().entries, "sha256/missing=")))
        assertEquals(conn(1).spki, back.currentId)
        assertTrue(json.isNotEmpty())
    }

    @Test fun legacySingleConnectionMigratesToPcOne() {
        // 업데이트 전 버전이 저장하던 한 덩어리 (새 필드 없음)
        val legacy = """{"host":"192.168.0.24","port":47900,"token":"abc","spki":"sha256/pinX=","lan":"192.168.0.24","lo":true,"ts":false}"""
        val book = PcBookCodec.fromLegacy(legacy)
        assertEquals(1, book.entries.size)
        val e = book.current!!
        assertEquals("sha256/pinX=", e.id)
        assertEquals("abc", e.conn.token)
        assertEquals("192.168.0.24", e.conn.lan)
        assertTrue(e.conn.isLanOnly)
        assertEquals("PC 1", PcBooks.name(e))
        // 옛 값을 새 형식으로 쓰고 다시 읽어도 그대로 (이전이 끝난 뒤의 상태)
        assertEquals(book, PcBookCodec.decode(PcBookCodec.encode(book)))
    }

    // ── 한리뷰 필수 수정 ──

    @Test fun migrationKeepsLegacyWhenSaveFails() {
        val book = add(PcBook(), conn(1))
        var removed = false
        val done = PcBooks.migrateSafely(book, save = { error("disk full") }, readBack = { book }, removeLegacy = { removed = true })
        assertTrue(!done && !removed)
    }

    @Test fun migrationKeepsLegacyWhenReadBackIsMissingOrDifferent() {
        val book = add(PcBook(), conn(1))
        var removed = 0
        assertTrue(!PcBooks.migrateSafely(book, save = {}, readBack = { null }, removeLegacy = { removed++ }))
        assertTrue(!PcBooks.migrateSafely(book, save = {}, readBack = { add(PcBook(), conn(2)) }, removeLegacy = { removed++ }))
        assertTrue(!PcBooks.migrateSafely(book, save = {}, readBack = { error("decrypt") }, removeLegacy = { removed++ }))
        assertEquals(0, removed)
    }

    @Test fun migrationRemovesLegacyOnlyAfterVerifiedReadBack() {
        val book = add(PcBook(), conn(1))
        val order = mutableListOf<String>()
        var stored: PcBook? = null
        assertTrue(PcBooks.migrateSafely(book, save = { stored = it; order += "save" }, readBack = { order += "read"; stored }, removeLegacy = { order += "remove" }))
        assertEquals(listOf("save", "read", "remove"), order)
    }

    @Test fun lateReplyFromForgottenPcIsDropped() {
        val book = three()
        val seenA = book.find(conn(1).spki)!!
        assertTrue(PcBooks.isLive(book, seenA))
        // 응답을 기다리는 사이 A를 끊음 → 늦은 응답은 알림·설정·열쇠 폐기를 못 한다
        assertTrue(!PcBooks.isLive(PcBooks.remove(book, seenA.id), seenA))
    }

    @Test fun lateReplyWithOldTokenIsDroppedAfterReconnect() {
        val book = three()
        val seenA = book.find(conn(1).spki)!!
        // 끊고 같은 PC를 새 열쇠로 다시 연결 → 옛 열쇠로 보낸 요청의 "폐기됨" 응답이 새 열쇠를 지우면 안 된다
        val reconnected = add(PcBooks.remove(book, seenA.id), conn(1, token = "newtok"))
        assertTrue(!PcBooks.isLive(reconnected, seenA))
        // 열쇠가 이미 지워진 항목도 조회 대상이 아니다
        assertTrue(!PcBooks.isLive(PcBooks.withoutToken(book, seenA.id), seenA))
    }

    @Test fun roundTripSwitchAtoBtoAKeepsStateSeparateAndLive() {
        var book = three()
        val a = book.find(conn(1).spki)!!
        val b = book.find(conn(2).spki)!!
        book = PcBooks.select(PcBooks.select(book, b.id), a.id)
        assertEquals(a.id, book.currentId)
        // 오가기만 해서는 A·B의 조회 결과가 버려지지 않는다
        assertTrue(PcBooks.isLive(book, a) && PcBooks.isLive(book, b))
        // 값 저장 키는 PC마다 다르다 — A 응답이 B 키에 쓰이지 않는다
        assertNotEquals(PcBooks.key(a.id, "lockRetryAt"), PcBooks.key(b.id, "lockRetryAt"))
    }

    @Test fun forgettingLastPcEmptiesBook() {
        val book = add(PcBook(), conn(1))
        val after = PcBooks.remove(book, book.entries[0].id)
        assertTrue(after.entries.isEmpty() && after.current == null)
    }
}
