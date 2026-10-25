// 알림 문구 (디자인 4절). 본문에는 직원 이름만 — summary·activity·spec·도구 이름은 넣지 않는다

package com.claudeoffice.remote.work

import com.claudeoffice.remote.R
import com.claudeoffice.remote.S

import com.claudeoffice.remote.net.Decision

data class Notice(val title: String, val body: String)

/** 아직 알리지 않은 결정 */
fun newDecisions(decisions: List<Decision>, notified: Set<String>) = decisions.filter { it.id !in notified }

/**
 * 알림 본문에 직원 이름을 넣을지. 대표 결정(2026-10-23): "앱 안에는 전부, 알림은 간단히" → 개수만 보인다.
 * 잠금 화면에는 앱 이름만 나온다 (Notifier의 VISIBILITY_PRIVATE + publicVersion)
 */
const val NOTICE_SHOWS_STAFF_NAME = false

fun decisionNotice(fresh: List<Decision>, showNames: Boolean = NOTICE_SHOWS_STAFF_NAME): Notice? {
    if (fresh.isEmpty()) return null
    val names = fresh.map { it.staffName.ifBlank { S.get(R.string.tab_staff) } }.distinct()
    val title = if (fresh.size == 1) S.get(R.string.notice_one_title) else S.get(R.string.notice_many_title, fresh.size)
    val body = when {
        !showNames -> S.get(R.string.notice_count_body, fresh.size)
        names.size == 1 -> S.get(R.string.notice_one_name, names[0])
        else -> S.get(R.string.notice_many_names, names[0], names.size - 1)
    }
    return Notice(title, body)
}

fun reconnectNotice() = Notice(S.get(R.string.notice_reconnect_title), S.get(R.string.notice_reconnect_body))
fun pinNotice() = Notice(S.get(R.string.notice_pin_title), S.get(R.string.notice_pin_body))
fun lockNotice(untilText: String) = Notice(S.get(R.string.notice_lock_title), S.get(R.string.notice_lock_body, untilText))
