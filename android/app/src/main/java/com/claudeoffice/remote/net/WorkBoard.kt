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
