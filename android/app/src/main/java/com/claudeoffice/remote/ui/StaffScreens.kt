// 직원 상태 목록 (디자인 3-3) · 직원 상세와 지시 (3-6)

package com.claudeoffice.remote.ui

import com.claudeoffice.remote.R
import com.claudeoffice.remote.S

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.claudeoffice.remote.data.ActionResult
import com.claudeoffice.remote.data.OfficeState
import com.claudeoffice.remote.net.ApiError
import com.claudeoffice.remote.net.RemoteStaff
import com.claudeoffice.remote.ui.theme.Office
import com.claudeoffice.remote.ui.theme.Radius
import com.claudeoffice.remote.ui.theme.Space
import com.claudeoffice.remote.ui.theme.Type
import kotlinx.coroutines.launch

@Composable
fun ScreenTitle(title: String, trailing: @Composable () -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Space.s4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = Type.titleLarge, color = Office.colors.onSurface, modifier = Modifier.weight(1f))
        trailing()
    }
}

@Composable
fun BackTitle(title: String, onBack: () -> Unit) {
    Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Space.s1), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = S.get(R.string.cd_back), tint = Office.colors.onSurface)
        }
        Text(title, style = Type.titleLarge, color = Office.colors.onSurface, modifier = Modifier.weight(1f), textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.width(48.dp))
    }
}

/** "● 방금 갱신" / "10:35 갱신" / S.get(R.string.loading) */
@Composable
fun RefreshMark(state: OfficeState) {
    val c = Office.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        when {
            state.isLoading && state.status == null -> MutedText(S.get(R.string.loading))
            state.lastSuccessAt > 0 -> {
                val isFresh = System.currentTimeMillis() - state.lastSuccessAt < 60_000
                if (isFresh && state.canAct) {
                    StatusDot(c.statusWorking, 6)
                    Spacer(Modifier.width(Space.s1))
                }
                MutedText(if (isFresh) S.get(R.string.updated_just_now) else S.get(R.string.updated_at, clock(state.lastSuccessAt)))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StaffTab(state: OfficeState, onRefresh: suspend () -> Unit, onOpen: (String) -> Unit, detail: (@Composable (String) -> Unit)?, selectedId: String?) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val isWide = maxWidth >= 840.dp
        if (isWide && detail != null) {
            Row(Modifier.fillMaxSize()) {
                Box(Modifier.width(360.dp).fillMaxHeight()) { StaffList(state, onRefresh, onOpen) }
                Box(Modifier.width(1.dp).fillMaxHeight().background(Office.colors.outline))
                Box(Modifier.weight(1f).fillMaxHeight()) {
                    if (selectedId != null) detail(selectedId)
                    else Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { MutedText(S.get(R.string.pick_staff)) }
                }
            }
        } else {
            StaffList(state, onRefresh, onOpen)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StaffList(state: OfficeState, onRefresh: suspend () -> Unit, onOpen: (String) -> Unit) {
    val c = Office.colors
    var filter by rememberSaveable { mutableStateOf<String?>(null) }
    val pull = rememberPullToRefreshState()
    if (pull.isRefreshing) {
        LaunchedEffect(true) {
            onRefresh()
            pull.endRefresh()
        }
    }
    val status = state.status
    Column(Modifier.fillMaxSize()) {
        ScreenTitle(S.get(R.string.title_staff)) { RefreshMark(state) }
        Box(Modifier.weight(1f).clipToBounds().nestedScroll(pull.nestedScrollConnection)) {
            LazyColumn(Modifier.fillMaxSize().padding(horizontal = Space.s4)) {
                item {
                    if (status == null) SkeletonTiles() else SummaryTiles(status.summary, filter) { filter = if (filter == it) null else it }
                    Spacer(Modifier.height(Space.s3))
                }
                when {
                    status == null -> items(3) { SkeletonRow() }
                    status.staff.isEmpty() -> item {
                        Column(Modifier.fillMaxWidth().padding(top = Space.s6), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(S.get(R.string.empty_staff), style = Type.titleMedium, color = c.onSurface)
                            Spacer(Modifier.height(Space.s2))
                            MutedText(S.get(R.string.empty_staff_hint))
                        }
                    }
                    else -> {
                        val list = status.staff
                            .filter { filter == null || it.status == filter }
                            .sortedBy { statusOrder(it.status) }
                        items(list, key = { it.id }) { s ->
                            StaffRow(s, state.serverNow) { onOpen(s.id) }
                            HorizontalDivider(color = c.outline)
                        }
                    }
                }
            }
            PullToRefreshContainer(pull, Modifier.align(Alignment.TopCenter), containerColor = c.surface, contentColor = c.primary)
        }
    }
}

@Composable
private fun SummaryTiles(summary: com.claudeoffice.remote.net.StatusSummary, filter: String?, onTap: (String) -> Unit) {
    val c = Office.colors
    val tiles = listOf(
        Triple("working", S.get(R.string.status_working), summary.working) to c.statusWorking,
        Triple("waiting", S.get(R.string.needs_check), summary.waiting) to c.statusWaiting,
        Triple("error", S.get(R.string.status_error), summary.error) to c.statusError,
        Triple("idle", S.get(R.string.status_idle), summary.idle) to c.statusIdle,
    )
    val isCompact = LocalConfiguration.current.screenHeightDp < 480
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
        tiles.forEach { (t, color) ->
            val (key, label, n) = t
            val isSelected = filter == key
            val border = when {
                isSelected -> c.primary
                key == "waiting" && n > 0 -> c.statusWaiting.copy(alpha = 0.7f)
                else -> c.outline
            }
            val tile = Modifier
                .weight(1f)
                .heightIn(min = if (isCompact) 48.dp else 64.dp)
                .background(if (isSelected) c.surfaceSelected else c.surface, Radius.xl)
                .border(1.dp, border, Radius.xl)
                .clickable { onTap(key) }
                .padding(horizontal = Space.s2, vertical = if (isCompact) Space.s1 else Space.s2)
            val numberColor = if (n == 0) c.onSurfaceMuted else if (key == "waiting") c.statusWaiting else c.onSurface
            if (isCompact) {
                // 가로 화면: 라벨과 숫자를 한 줄에 (QA 버그 3 — 칸이 커서 목록이 두 줄만 보이던 문제)
                Row(tile, verticalAlignment = Alignment.CenterVertically) {
                    StatusDot(color, 6)
                    Spacer(Modifier.width(Space.s1))
                    Text(label, style = Type.label, color = c.onSurfaceMuted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text("$n", style = Type.titleMedium, color = numberColor)
                }
            } else {
                Column(tile) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StatusDot(color, 6)
                        Spacer(Modifier.width(Space.s1))
                        Text(label, style = Type.labelTiny, color = c.onSurfaceMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text("$n", style = Type.numeral, color = numberColor)
                }
            }
        }
    }
}

@Composable
private fun SkeletonTiles() {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
        repeat(4) { Box(Modifier.weight(1f).height(64.dp).background(Office.colors.surfaceMuted, Radius.xl)) }
    }
}

@Composable
private fun SkeletonRow() {
    Row(Modifier.fillMaxWidth().height(72.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(40.dp).background(Office.colors.surfaceMuted, androidx.compose.foundation.shape.CircleShape))
        Spacer(Modifier.width(Space.s3))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.width(120.dp).height(14.dp).background(Office.colors.surfaceMuted, Radius.sm))
            Box(Modifier.fillMaxWidth(0.7f).height(12.dp).background(Office.colors.surfaceMuted, Radius.sm))
        }
    }
}

@Composable
private fun StaffRow(s: RemoteStaff, serverNow: Long, onClick: () -> Unit) {
    val c = Office.colors
    val look = statusLook(s.status)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable(onClick = onClick).padding(vertical = Space.s3),
        verticalAlignment = Alignment.Top,
    ) {
        InitialCircle(s.name, 40)
        Spacer(Modifier.width(Space.s3))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(s.name, style = Type.titleMedium, color = if (s.status == "offline") c.onSurfaceMuted else c.onSurface, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                StatusDot(look.color)
                Spacer(Modifier.width(Space.s1))
                val elapsed = elapsedText(s.statusSince, serverNow)
                Text(if (elapsed.isEmpty()) look.label else "${look.label} · $elapsed", style = Type.label, color = look.color)
            }
            val role = if (s.pendingDecisions > 0) S.get(R.string.role_pending, s.role, s.pendingDecisions) else s.role
            MutedText(role, maxLines = 1)
            if (s.activity.isNotBlank()) {
                Text(s.activity, style = Type.bodySmall, color = c.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** 직원 상세 + 지시 (디자인 3-6). 지시 입력칸은 키보드와 함께 올라간다 */
@Composable
fun StaffDetailScreen(
    state: OfficeState,
    staffId: String,
    onBack: (() -> Unit)?,
    onOpenDecisions: () -> Unit,
    instruct: suspend (String, String) -> ActionResult,
    showMessage: (String) -> Unit,
) {
    val c = Office.colors
    val s = state.status?.staff?.firstOrNull { it.id == staffId }
    var text by rememberSaveable(staffId) { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var inputError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(Modifier.fillMaxSize().imePadding()) {
        if (onBack != null) BackTitle(s?.name ?: S.get(R.string.title_staff), onBack) else ScreenTitle(s?.name ?: S.get(R.string.title_staff))
        if (s == null) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { MutedText(S.get(R.string.staff_not_found)) }
            return@Column
        }
        val look = statusLook(s.status)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.s4).alpha(if (state.canAct) 1f else 0.6f),
            verticalArrangement = Arrangement.spacedBy(Space.s3),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialCircle(s.name, 56)
                Spacer(Modifier.width(Space.s3))
                Column {
                    Text(s.name, style = Type.titleMedium, color = c.onSurface)
                    MutedText(s.role)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StatusDot(look.color)
                        Spacer(Modifier.width(Space.s1))
                        val elapsed = elapsedText(s.statusSince, state.serverNow)
                        Text(if (elapsed.isEmpty()) look.label else "${look.label} · $elapsed", style = Type.label, color = look.color)
                    }
                }
            }
            OfficeCard {
                Column {
                    MutedText(S.get(R.string.current_work))
                    Spacer(Modifier.height(Space.s1))
                    Text(s.activity.ifBlank { "—" }, style = Type.bodyLarge, color = c.onSurface)
                }
            }
            if (s.pendingDecisions > 0) {
                Box(Modifier.clickable(onClick = onOpenDecisions)) {
                    OfficeCard(border = c.statusWaiting.copy(alpha = 0.5f)) {
                        Text(S.get(R.string.pending_arrow, s.pendingDecisions), style = Type.titleMedium, color = c.statusWaiting)
                    }
                }
            }
            if (s.status == "working") InfoBanner(S.get(R.string.banner_busy_note))
        }
        // 아래 고정: 지시 입력
        Column(Modifier.fillMaxWidth().background(c.background).padding(Space.s4), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
            if (!state.canAct) {
                MutedText(S.get(R.string.needs_pc_connection))
            }
            OutlinedTextField(
                value = text,
                onValueChange = {
                    if (it.length <= 4000) text = it
                    inputError = null
                },
                enabled = state.canAct && !sending,
                placeholder = { Text(S.get(R.string.instruct_hint, s.name), style = Type.bodyLarge) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 96.dp, max = 200.dp),
                textStyle = Type.bodyLarge,
                shape = Radius.lg,
                isError = inputError != null,
                supportingText = {
                    Row(Modifier.fillMaxWidth()) {
                        Text(inputError ?: "", style = Type.label, color = c.statusError, modifier = Modifier.weight(1f))
                        Text("${text.length} / 4000", style = Type.label, color = c.onSurfaceMuted)
                    }
                },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = c.primary, unfocusedBorderColor = c.outlineInput,
                    focusedContainerColor = c.surface, unfocusedContainerColor = c.surface, disabledContainerColor = c.surface,
                ),
            )
            PrimaryButton(
                if (sending) S.get(R.string.btn_sending) else S.get(R.string.btn_send_instruction),
                {
                    sending = true
                    scope.launch {
                        when (val r = instruct(s.id, text)) {
                            is ActionResult.Done -> {
                                text = ""
                                showMessage(S.get(R.string.instruct_sent, s.name))
                            }
                            is ActionResult.Failed -> when (r.error) {
                                ApiError.InvalidRequest -> inputError = S.get(R.string.err_invalid_request)
                                ApiError.PayloadTooLarge -> inputError = S.get(R.string.err_payload_too_large)
                                ApiError.StaffNotFound -> {
                                    showMessage(S.get(R.string.staff_not_found_refreshed))
                                    onBack?.invoke()
                                }
                                is ApiError.RateLimited -> showMessage(S.get(R.string.err_rate_limited))
                                else -> showMessage(S.get(R.string.err_send_failed))
                            }
                        }
                        sending = false
                    }
                },
                Modifier.fillMaxWidth(),
                enabled = state.canAct && !sending && text.isNotBlank(),
            )
        }
    }
}
