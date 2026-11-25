// 저장된 PC 목록(최대 3대)과 현재 PC — 안드로이드 클래스에 의존하지 않는 순수 코드라 단위 테스트로 지킨다
// 같은 PC의 판단 기준은 인증서 확인값(spki). 주소가 바뀌어도 같은 PC면 새 항목을 만들지 않고 갱신한다

package com.claudeoffice.remote.store

import com.claudeoffice.remote.net.Connection
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

const val MAX_PCS = 3
const val MAX_ALIAS = 20

/** slot: 1~3 (기본 이름 "PC n"과 알림 번호에 쓴다, 빈 번호를 다시 쓴다). alias가 비면 기본 이름 */
data class PcEntry(val conn: Connection, val slot: Int, val alias: String = "", val addedAt: Long = 0) {
    val id get() = conn.spki
}

data class PcBook(val entries: List<PcEntry> = emptyList(), val currentId: String? = null) {
    val current get() = entries.firstOrNull { it.id == currentId }
    fun find(id: String?) = entries.firstOrNull { it.id == id }
    val isFull get() = entries.size >= MAX_PCS
}

sealed interface PcAdd {
    data class Added(val book: PcBook, val entry: PcEntry) : PcAdd
    data class Updated(val book: PcBook, val entry: PcEntry) : PcAdd
    data object Full : PcAdd
}

object PcBooks {
    /** 새 연결을 넣는다. 같은 PC면 갱신(별칭·순서 유지, 3대가 차 있어도 허용), 새 PC가 4번째면 거부. 결과 PC가 현재 PC가 된다 */
    fun add(book: PcBook, conn: Connection, now: Long): PcAdd {
        val existing = book.find(conn.spki)
        if (existing != null) {
            val updated = existing.copy(conn = conn)
            val entries = book.entries.map { if (it.id == existing.id) updated else it }
            return PcAdd.Updated(PcBook(entries, updated.id), updated)
        }
        if (book.isFull) return PcAdd.Full
        val slot = (1..MAX_PCS).first { s -> book.entries.none { it.slot == s } }
        val entry = PcEntry(conn, slot, "", now)
        return PcAdd.Added(PcBook(book.entries + entry, entry.id), entry)
    }

    /** 끊기. 현재 PC를 끊으면 남은 첫 번째(가장 먼저 연결한 PC)가 현재가 된다. 다른 PC를 끊으면 현재는 그대로 */
    fun remove(book: PcBook, id: String): PcBook {
        val entries = book.entries.filterNot { it.id == id }
        val current = if (book.currentId != id && entries.any { it.id == book.currentId }) book.currentId else entries.firstOrNull()?.id
        return PcBook(entries, current)
    }

    fun select(book: PcBook, id: String): PcBook = if (book.find(id) != null) book.copy(currentId = id) else book

    /** 별칭 바꾸기: 앞뒤 공백을 지우고 20자까지. 비우면 기본 이름으로 돌아간다 */
    fun rename(book: PcBook, id: String, alias: String): PcBook =
        book.copy(entries = book.entries.map { if (it.id == id) it.copy(alias = alias.trim().take(MAX_ALIAS)) else it })

    /** 토큰이 폐기된 PC: 열쇠만 지우고 이름·주소·순서는 둔다(같은 PC를 QR로 다시 연결하면 그 항목이 갱신된다) */
    fun withoutToken(book: PcBook, id: String): PcBook =
        book.copy(entries = book.entries.map { if (it.id == id) it.copy(conn = it.conn.copy(token = "")) else it })

    /** 조회를 시작할 때 본 PC 항목이 지금도 같은 연결인가 — 그새 끊겼거나(없음) 다시 연결돼 열쇠가 바뀌었으면 거짓. A→B→A로 오가기만 한 건 참 */
    fun isLive(book: PcBook, seen: PcEntry): Boolean {
        val now = book.find(seen.id) ?: return false
        return now.conn.token == seen.conn.token && now.conn.token.isNotEmpty()
    }

    /**
     * 옛 1대 저장 → 새 목록 이전. 새 목록을 저장하고 다시 읽어 같을 때만 옛 값을 지운다
     * (저장 실패·읽기 실패·내용 불일치면 옛 값을 남겨 다음 실행에서 다시 옮긴다). 지웠으면 true
     */
    fun migrateSafely(book: PcBook, save: (PcBook) -> Unit, readBack: () -> PcBook?, removeLegacy: () -> Unit): Boolean {
        val isSaved = runCatching { save(book) }.isSuccess && runCatching(readBack).getOrNull() == book
        if (isSaved) removeLegacy()
        return isSaved
    }

    fun name(e: PcEntry) = e.alias.ifBlank { "PC ${e.slot}" }

    /** 알림 제목 앞에 붙일 이름. PC가 1대면 붙이지 않아 지금과 똑같이 보인다 */
    fun noticePrefix(book: PcBook, e: PcEntry): String? = if (book.entries.size > 1) name(e) else null

    /** PC별 상태 값의 저장 키 접두 ("pc.<id>.") */
    fun key(id: String, name: String) = "pc.$id.$name"

    fun decisionNoticeId(slot: Int) = 100 + slot
    fun connectionNoticeId(slot: Int) = 200 + slot
}

// ── 저장 형식 ────────────────────────────────────────────────

@Serializable
internal data class StoredPc(
    val host: String, val port: Int, val token: String, val spki: String,
    val lan: String? = null, val lo: Boolean = false, val ts: Boolean = false,
    val slot: Int = 1, val alias: String = "", val addedAt: Long = 0,
)

@Serializable
internal data class StoredBook(val pcs: List<StoredPc> = emptyList(), val current: String? = null)

/** 옛 버전(1대 저장)의 한 덩어리 — 새 필드가 없다 */
@Serializable
internal data class StoredLegacy(val host: String, val port: Int, val token: String, val spki: String, val lan: String? = null, val lo: Boolean = false, val ts: Boolean = false)

object PcBookCodec {
    private val json = Json { ignoreUnknownKeys = true }

    fun encode(book: PcBook): String = json.encodeToString(
        StoredBook.serializer(),
        StoredBook(
            book.entries.map { StoredPc(it.conn.host, it.conn.port, it.conn.token, it.conn.spki, it.conn.lan, it.conn.isLanOnly, it.conn.isTailscale, it.slot, it.alias, it.addedAt) },
            book.currentId,
        ),
    )

    fun decode(text: String): PcBook {
        val s = json.decodeFromString(StoredBook.serializer(), text)
        val entries = s.pcs.take(MAX_PCS).map { PcEntry(Connection(it.host, it.port, it.token, it.spki, it.lan, it.lo, it.ts), it.slot, it.alias, it.addedAt) }
        return PcBook(entries, s.current?.takeIf { c -> entries.any { it.id == c } } ?: entries.firstOrNull()?.id)
    }

    /** 업데이트 전에 저장된 1대 연결을 1번 PC로 옮긴다 */
    fun fromLegacy(text: String): PcBook {
        val s = json.decodeFromString(StoredLegacy.serializer(), text)
        val entry = PcEntry(Connection(s.host, s.port, s.token, s.spki, s.lan, s.lo, s.ts), 1, "", 0)
        return PcBook(listOf(entry), entry.id)
    }
}
