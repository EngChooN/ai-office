// 업무 보드(읽기 전용) — 대표가 고른 안: 상태 개수 타일 + 위 고정 대기 줄 + 상태 순서 목록 (docs/design/status-board/decision.md)

package com.claudeoffice.remote.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.claudeoffice.remote.R
import com.claudeoffice.remote.S
import com.claudeoffice.remote.data.OfficeState
import com.claudeoffice.remote.net.RemoteWork
import com.claudeoffice.remote.net.WORK_STATES
import com.claudeoffice.remote.net.awaitingWorks
import com.claudeoffice.remote.net.needsReReview
import com.claudeoffice.remote.net.waitMinutes
import com.claudeoffice.remote.net.workStateOf
import com.claudeoffice.remote.net.worksOfState
import com.claudeoffice.remote.ui.theme.Office
import com.claudeoffice.remote.ui.theme.Radius
import com.claudeoffice.remote.ui.theme.Space
import com.claudeoffice.remote.ui.theme.Type

fun workStateLabel(state: String): String = S.get(
    when (state) {
        "working" -> R.string.work_working
        "awaitingUser" -> R.string.work_awaitingUser
        "review" -> R.string.work_review
        "done" -> R.string.work_done
        else -> R.string.work_queued
    },
)

@Composable
private fun workStateColor(state: String): Color {
    val c = Office.colors
    return when (state) {
        "working", "done" -> c.statusWorking
        "awaitingUser" -> c.statusWaiting
        "review" -> c.primary
        else -> c.statusIdle
    }
}

/** '1분 미만' · '42분' · '3시간 5분' · '2일 4시간' — 시작 시각을 모르면 빈 글 */
fun workWaitText(since: Long, serverNow: Long): String {
    val m = waitMinutes(since, serverNow) ?: return ""
    val d = m / 1440
    val h = m % 1440 / 60
    val mm = m % 60
    return when {
        m < 1 -> S.get(R.string.work_wait_under_min)
        d > 0 -> S.get(R.string.work_wait_day, d, h)
        h > 0 -> S.get(R.string.work_wait_hour, h, mm)
        else -> S.get(R.string.work_wait_min, mm)
    }
}

@Composable
fun BoardTab(state: OfficeState) {
    val c = Office.colors
    val works = state.status?.works.orEmpty()
    var filter by rememberSaveable { mutableStateOf<String?>(null) }
    var isListOpen by rememberSaveable { mutableStateOf(false) }
    val awaiting = awaitingWorks(works)
    Column(Modifier.fillMaxSize()) {
        ScreenTitle(S.get(R.string.title_board)) { RefreshMark(state) }
        if (works.isEmpty()) {
            Column(Modifier.fillMaxWidth().padding(top = Space.s6, start = Space.s4, end = Space.s4), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(S.get(R.string.work_empty), style = Type.titleMedium, color = c.onSurface)
                Spacer(Modifier.height(Space.s2))
                MutedText(S.get(R.string.work_empty_hint))
            }
            return@Column
        }
        // 개수 타일 + 대기 줄은 위에 고정, 목록만 스크롤
        Column(Modifier.padding(horizontal = Space.s4)) {
            WorkTiles(works, filter) { filter = if (filter == it) null else it }
            if (awaiting.isNotEmpty()) {
                Spacer(Modifier.height(Space.s2))
                AwaitBand(awaiting, state.serverNow) { isListOpen = true }
            }
            Spacer(Modifier.height(Space.s3))
        }
        LazyColumn(Modifier.weight(1f).padding(horizontal = Space.s4)) {
            for (st in WORK_STATES) {
                if (filter != null && filter != st) continue
                val rows = worksOfState(works, st)
                if (rows.isEmpty()) continue
                item(key = "h-$st") { WorkGroupHeader(st, rows.size) }
                items(rows, key = { it.id }) { w ->
                    WorkRow(w, state.serverNow)
                    HorizontalDivider(color = c.outline)
                }
            }
        }
    }
    if (isListOpen) AwaitDialog(awaiting, state.serverNow) { isListOpen = false }
}

@Composable
private fun WorkTiles(works: List<RemoteWork>, filter: String?, onTap: (String) -> Unit) {
    val c = Office.colors
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
        for (st in listOf("awaitingUser", "working", "review", "done")) {
            val n = works.count { workStateOf(it) == st }
            val isSelected = filter == st
            val border = when {
                isSelected -> c.primary
                st == "awaitingUser" && n > 0 -> c.statusWaiting.copy(alpha = 0.7f)
                else -> c.outline
            }
            Column(
                Modifier
                    .weight(1f)
                    .heightIn(min = 64.dp)
                    .background(if (isSelected) c.surfaceSelected else c.surface, Radius.xl)
                    .border(1.dp, border, Radius.xl)
                    .clickable { onTap(st) }
                    .padding(horizontal = Space.s2, vertical = Space.s2),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StatusDot(workStateColor(st), 6)
                    Spacer(Modifier.width(Space.s1))
                    Text(workStateLabel(st), style = Type.labelTiny, color = c.onSurfaceMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text("$n", style = Type.numeral, color = if (n == 0) c.onSurfaceMuted else if (st == "awaitingUser") c.statusWaiting else c.onSurface)
            }
        }
    }
}

/** 대표 응답 대기 줄 — 두 줄(건수 / 가장 오래된 일 · 대기 시간), 누르면 대기 목록 */
@Composable
private fun AwaitBand(awaiting: List<RemoteWork>, serverNow: Long, onClick: () -> Unit) {
    val c = Office.colors
    val oldest = awaiting.first()
    val wait = workWaitText(oldest.waitingSince, serverNow)
    Column(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .background(c.statusWaiting.copy(alpha = 0.12f), Radius.xl)
            .border(1.dp, c.statusWaiting.copy(alpha = 0.7f), Radius.xl)
            .clickable(onClick = onClick)
            .padding(horizontal = Space.s3, vertical = Space.s2),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(S.get(R.string.work_band_title, awaiting.size), style = Type.label, color = c.statusWaiting, fontWeight = FontWeight.Bold)
        Text(
            if (wait.isEmpty()) oldest.title else S.get(R.string.work_band_oldest, oldest.title, wait),
            style = Type.bodySmall, color = c.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun WorkGroupHeader(state: String, n: Int) {
    Row(Modifier.fillMaxWidth().padding(top = Space.s3, bottom = Space.s1), verticalAlignment = Alignment.CenterVertically) {
        StatusDot(workStateColor(state), 7)
        Spacer(Modifier.width(Space.s1))
        Text("${workStateLabel(state)} · $n", style = Type.label, color = Office.colors.onSurfaceMuted)
    }
}

@Composable
private fun WorkRow(w: RemoteWork, serverNow: Long) {
    val c = Office.colors
    val st = workStateOf(w)
    val isDone = st == "done"
    Column(Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(vertical = Space.s3), verticalArrangement = Arrangement.spacedBy(Space.s1)) {
        // 완료 카드는 제목·담당만 흐리게 — 상태 칩과 재검토 칩은 그대로
        Column(Modifier.alpha(if (isDone) 0.6f else 1f)) {
            Text(w.title, style = Type.titleMedium, color = c.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
            MutedText(w.assigneeName.ifEmpty { S.get(R.string.work_unassigned) }, maxLines = 1)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
            StatusBadge(workStateLabel(st), workStateColor(st))
            if (st == "awaitingUser") {
                val wait = workWaitText(w.waitingSince, serverNow)
                if (wait.isNotEmpty()) Text(S.get(R.string.work_waited, wait), style = Type.label, color = c.statusWaiting, fontWeight = FontWeight.Bold)
            }
            if (needsReReview(w)) {
                Text(
                    "↻ ${S.get(R.string.work_rereview)}",
                    style = Type.label, color = c.statusReReview,
                    modifier = Modifier
                        .background(c.statusReReview.copy(alpha = 0.12f), Radius.sm)
                        .border(1.5.dp, c.statusReReview, Radius.sm)
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun AwaitDialog(awaiting: List<RemoteWork>, serverNow: Long, onClose: () -> Unit) {
    val c = Office.colors
    AlertDialog(
        onDismissRequest = onClose,
        containerColor = c.surface,
        title = { Text(S.get(R.string.work_wait_list), style = Type.titleMedium, color = c.onSurface) },
        text = {
            LazyColumn {
                items(awaiting, key = { it.id }) { w ->
                    WorkRow(w, serverNow)
                    HorizontalDivider(color = c.outline)
                }
            }
        },
        confirmButton = { TextButton(onClose) { Text(S.get(R.string.work_wait_list_close), color = c.primary) } },
    )
}
