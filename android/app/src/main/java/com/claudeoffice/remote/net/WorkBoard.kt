// 상태 보드 계산 — 화면과 단위 테스트가 같이 쓴다 (규칙은 데스크톱 shared/workWait.ts와 같다)

package com.claudeoffice.remote.net

/** 목록에 놓이는 순서 — 대표 응답 대기 → 진행 중 → 검토 중 → 할 일 → 완료 (decision.md ②) */
val WORK_STATES = listOf("awaitingUser", "working", "review", "queued", "done")

/** 모르는 상태 문자열은 할 일로 */
fun workStateOf(w: RemoteWork): String = if (w.state in WORK_STATES) w.state else "queued"

/** 대표 응답 대기 — 오래 기다린 것부터 (시작 시각을 모르면 맨 뒤) */
fun awaitingWorks(works: List<RemoteWork>): List<RemoteWork> =
    works.filter { workStateOf(it) == "awaitingUser" }.sortedBy { if (it.waitingSince > 0) it.waitingSince else Long.MAX_VALUE }

/** 대기 분. 시계가 어긋나 음수면 0. 시작 시각을 모르면 null */
fun waitMinutes(since: Long, serverNow: Long): Long? = if (since <= 0) null else ((serverNow - since) / 60_000).coerceAtLeast(0)

fun worksOfState(works: List<RemoteWork>, state: String): List<RemoteWork> = works.filter { workStateOf(it) == state }

fun needsReReview(w: RemoteWork): Boolean = w.reReview == "needed"

// ── 이전 완료 더 보기 (GET /v1/status?doneLimit=N, PC가 20~500으로 맞춘다) ──

const val DONE_LIMIT_DEFAULT = 20
const val DONE_LIMIT_STEP = 20
const val DONE_LIMIT_MAX = 500

/** "더 보기" 한 번 누른 뒤의 완료 건수 — +20, 500에서 멈춘다 */
fun nextDoneLimit(current: Int): Int = (current.coerceAtLeast(DONE_LIMIT_DEFAULT) + DONE_LIMIT_STEP).coerceAtMost(DONE_LIMIT_MAX)

/** 빠진 완료가 있고 아직 500에 닿지 않았으면 휴대폰에서 더 불러올 수 있다 (닿았으면 "PC에서 볼 수 있어요") */
fun canLoadMoreDone(doneLimit: Int, doneOmitted: Int): Boolean = doneOmitted > 0 && doneLimit < DONE_LIMIT_MAX

/**
 * "더 보기" 요청이 끝난 뒤의 완료 건수. 받은 응답으로만 판단한다.
 * 실패·중단(응답 없음)이면 누르기 전 값으로 되돌려 다시 누를 수 있게 하고,
 * 성공했는데 빠진 개수가 줄지 않았으면 더 보기를 모르는 옛 PC — 500으로 올려 "PC에서 볼 수 있어요"로 바꾼다
 */
fun doneLimitAfterLoadMore(before: Int, requested: Int, omittedBefore: Int, omittedAfter: Int?): Int = when {
    omittedAfter == null -> before
    omittedAfter > 0 && omittedAfter >= omittedBefore -> DONE_LIMIT_MAX
    else -> requested
}
