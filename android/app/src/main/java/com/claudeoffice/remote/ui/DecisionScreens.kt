// 대기 결정 목록 (디자인 3-4) · 질문 답하기·기획 확인 (3-5)
// "모두 승인"은 두지 않는다. 승인 버튼은 엄지 쪽(오른쪽)

package com.claudeoffice.remote.ui

import com.claudeoffice.remote.R
import com.claudeoffice.remote.S

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.claudeoffice.remote.data.ActionResult
import com.claudeoffice.remote.data.OfficeState
import com.claudeoffice.remote.net.ApiError
import com.claudeoffice.remote.net.Decision
import com.claudeoffice.remote.net.DecisionKind
import com.claudeoffice.remote.net.Question
import com.claudeoffice.remote.ui.theme.Office
import com.claudeoffice.remote.ui.theme.Radius
import com.claudeoffice.remote.ui.theme.Space
import com.claudeoffice.remote.ui.theme.Type
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** 잘린 결정 안내 (규격 5-2 isTruncated). 잘린 결재는 휴대폰에서 승인하지 않는다 — 400 review_on_pc (대표 결정·한리뷰 H1) */
val REVIEW_ON_PC_TEXT: String get() = S.get(R.string.decision_review_on_pc)

/** 승인을 막을지: 서버가 잘렸다고 알렸거나(isTruncated), 승인을 review_on_pc로 거부한 결재. 반려는 막지 않는다 */
fun isApproveBlocked(d: Decision, rejectedByServer: Collection<String>) =
    d.kind == DecisionKind.APPROVAL && (d.isTruncated || d.id in rejectedByServer)

/** 결정 응답 실패를 사용자에게 알리는 공통 문구 (디자인 6절) */
fun actionErrorMessage(e: ApiError): String? = when (e) {
    ApiError.ReviewOnPc -> REVIEW_ON_PC_TEXT
    ApiError.AlreadyDecided -> null // 카드 자리에 S.get(R.string.already_handled)
    ApiError.InvalidAction -> S.get(R.string.err_decision_changed)
    ApiError.InvalidRequest -> S.get(R.string.err_invalid_request)
    ApiError.PayloadTooLarge -> S.get(R.string.err_payload_too_large)
    is ApiError.RateLimited -> S.get(R.string.err_rate_limited)
    // 상태 화면으로 넘어가는 오류는 따로 알리지 않는다
    ApiError.TokenRevoked, ApiError.Unauthorized, is ApiError.Locked, ApiError.PinMismatch,
    ApiError.NeedsAppUpdate, ApiError.NeedsPcUpdate, is ApiError.AppBug, is ApiError.BadResponse -> null
    else -> S.get(R.string.err_send_failed)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DecisionsTab(
    state: OfficeState,
    onRefresh: suspend () -> Unit,
    onOpen: (Decision) -> Unit,
    approve: suspend (Decision) -> ActionResult,
    reject: suspend (Decision) -> ActionResult,
    showMessage: (String) -> Unit,
    showDelayBanner: Boolean,
    onDismissDelayBanner: () -> Unit,
) {
    val c = Office.colors
    val pull = rememberPullToRefreshState()
    if (pull.isRefreshing) {
        LaunchedEffect(true) {
            onRefresh()
            pull.endRefresh()
        }
    }
    val busy = remember { mutableStateMapOf<String, String>() } // id → "approve" | "reject"
    val gone = remember { mutableStateListOf<String>() }          // S.get(R.string.already_handled) 표시 중
    val approveBlocked = remember { mutableStateListOf<String>() } // 서버가 승인을 거부한 결재 (목록을 새로 받기 전까지)
    val scope = rememberCoroutineScope()
    val data = state.decisions

    fun run(d: Decision, action: String, call: suspend (Decision) -> ActionResult) {
        busy[d.id] = action
        scope.launch {
            when (val r = call(d)) {
                is ActionResult.Done -> showMessage(if (action == "approve") S.get(R.string.msg_approved) else S.get(R.string.msg_rejected))
                is ActionResult.Failed -> {
                    if (r.error == ApiError.AlreadyDecided) {
                        gone.add(d.id)
                        delay(1500)
                        gone.remove(d.id)
                    } else {
                        if (r.error == ApiError.ReviewOnPc) approveBlocked.add(d.id)
                        actionErrorMessage(r.error)?.let(showMessage)
                    }
                }
            }
            busy.remove(d.id)
        }
    }

    Column(Modifier.fillMaxSize()) {
        ScreenTitle(S.get(R.string.title_pending_decisions)) { if (data != null) MutedText(S.get(R.string.count_items, data.total)) else RefreshMark(state) }
        Box(Modifier.weight(1f).clipToBounds().nestedScroll(pull.nestedScrollConnection)) {
            LazyColumn(
                Modifier.fillMaxSize().padding(horizontal = Space.s4),
                verticalArrangement = Arrangement.spacedBy(Space.s3),
            ) {
                if (showDelayBanner) item {
                    Box(Modifier.clickable(onClick = onDismissDelayBanner)) { DelayNoticeCard() }
                }
                when {
                    data == null -> items(2) { Box(Modifier.fillMaxWidth().height(120.dp).background(c.surfaceMuted, Radius.xl)) }
                    data.decisions.isEmpty() -> item {
                        Column(Modifier.fillMaxWidth().padding(top = Space.s6), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("✓", style = Type.titleLarge, color = c.statusWorking)
                            Spacer(Modifier.height(Space.s3))
                            Text(S.get(R.string.empty_decisions), style = Type.titleMedium, color = c.onSurface)
                            Spacer(Modifier.height(Space.s2))
                            MutedText(S.get(R.string.empty_decisions_hint))
                        }
                    }
                    else -> {
                        items(data.decisions, key = { it.id }) { d ->
                            if (d.id in gone) {
                                OfficeCard { MutedText(S.get(R.string.already_handled)) }
                            } else {
                                DecisionCard(
                                    d, state, busy[d.id], isApproveBlocked = d.id in approveBlocked,
                                    onApprove = { run(d, "approve", approve) },
                                    onReject = { run(d, "reject", reject) },
                                    onOpen = { onOpen(d) },
                                )
                            }
                        }
                        if (data.total > data.decisions.size) item {
                            MutedText(S.get(R.string.more_on_pc, data.total - data.decisions.size), Modifier.padding(vertical = Space.s3))
                        }
                    }
                }
                item { Spacer(Modifier.height(Space.s4)) }
            }
            PullToRefreshContainer(pull, Modifier.align(Alignment.TopCenter), containerColor = c.surface, contentColor = c.primary)
        }
    }
}

@Composable
private fun DecisionCard(d: Decision, state: OfficeState, busy: String?, isApproveBlocked: Boolean, onApprove: () -> Unit, onReject: () -> Unit, onOpen: () -> Unit) {
    val c = Office.colors
    var expanded by rememberSaveable(d.id) { mutableStateOf(false) }
    val known = DecisionKind.isKnown(d)
    val (badge, badgeColor) = when {
        !known -> S.get(R.string.needs_check) to c.onSurfaceMuted
        d.kind == DecisionKind.APPROVAL -> S.get(R.string.kind_approval) to c.statusWaiting
        d.kind == DecisionKind.QUESTION -> S.get(R.string.kind_question) to c.statusWaiting
        else -> S.get(R.string.kind_plan) to c.statusWaiting
    }
    OfficeCard {
        Column(Modifier.alpha(if (state.canAct) 1f else 0.6f), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialCircle(d.staffName, 28)
                Spacer(Modifier.width(Space.s2))
                Text(d.staffName, style = Type.titleMedium, color = c.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.width(Space.s2))
                StatusBadge(badge, badgeColor)
                Spacer(Modifier.weight(1f))
                MutedText(elapsedText(d.createdAt, state.serverNow))
            }
            val body = when {
                !known -> S.get(R.string.check_on_pc)
                d.kind == DecisionKind.APPROVAL -> listOf(d.toolName, d.summary).filter { it.isNotBlank() }.joinToString(" · ")
                d.kind == DecisionKind.QUESTION -> d.questions.first().question
                else -> S.get(R.string.plan_with_subtasks, d.title, d.subtasks.size)
            }
            var overflow by remember { mutableStateOf(false) }
            Text(
                body,
                style = Type.bodySmall,
                color = c.onSurface,
                maxLines = if (expanded) Int.MAX_VALUE else 3,
                overflow = TextOverflow.Ellipsis,
                onTextLayout = { if (!expanded) overflow = it.hasVisualOverflow },
            )
            if (overflow || expanded) {
                Text(
                    if (expanded) S.get(R.string.collapse) else S.get(R.string.show_more),
                    style = Type.label,
                    color = c.primary,
                    modifier = Modifier.clickable { expanded = !expanded }.padding(vertical = Space.s1),
                )
            }
            // 결재 요약이 잘린 경우: 보이지 않는 내용을 휴대폰에서 승인하지 않게 승인을 막는다 (반려는 된다).
            // 질문도 요약이 잘리면 같은 안내만 보인다 (답하기는 서버가 받는다)
            val isClipped = isApproveBlocked(d, if (isApproveBlocked) listOf(d.id) else emptyList())
            if (isClipped || (d.kind == DecisionKind.QUESTION && d.isTruncated)) {
                Text(REVIEW_ON_PC_TEXT, style = Type.bodySmall, color = c.statusWaiting)
            }

            if (!known) return@Column
            if (!state.canAct) {
                MutedText(S.get(R.string.needs_pc_connection))
                return@Column
            }
            when (d.kind) {
                DecisionKind.APPROVAL -> Row(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                    OutlineButton(if (busy == "reject") S.get(R.string.btn_processing) else S.get(R.string.btn_reject), onReject, Modifier.weight(1f), enabled = busy == null)
                    PrimaryButton(if (busy == "approve") S.get(R.string.btn_processing) else S.get(R.string.btn_approve), onApprove, Modifier.weight(1f), enabled = busy == null && !isClipped)
                }
                DecisionKind.QUESTION -> OutlineButton(S.get(R.string.btn_answer_arrow), onOpen, Modifier.fillMaxWidth())
                DecisionKind.PLAN -> OutlineButton(S.get(R.string.btn_view_plan), onOpen, Modifier.fillMaxWidth())
            }
        }
    }
}

// ── 질문 답하기 ────────────────────────────────────────

private const val CUSTOM = "\u0000custom"

/** 질문 하나에 대한 답 문자열 (여러 개면 쉼표로 잇는다). 비어 있으면 null */
fun answerText(q: Question, picked: Set<String>, custom: String): String? {
    val parts = q.options.map { it.label }.filter { it in picked }.toMutableList()
    if (CUSTOM in picked && custom.isNotBlank()) parts += custom.trim()
    return parts.takeIf { it.isNotEmpty() }?.joinToString(", ")
}

@Composable
fun QuestionScreen(
    d: Decision,
    state: OfficeState,
    onBack: () -> Unit,
    answer: suspend (Decision, Map<String, String>) -> ActionResult,
    skip: suspend (Decision) -> ActionResult,
    showMessage: (String) -> Unit,
) {
    val c = Office.colors
    val picks = remember(d.id) { mutableStateMapOf<String, Set<String>>() }
    val customs = remember(d.id) { mutableStateMapOf<String, String>() }
    var sending by remember { mutableStateOf(false) }
    var confirmSkip by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val answers = d.questions.associate { q -> q.question to answerText(q, picks[q.question].orEmpty(), customs[q.question].orEmpty()) }
    val isComplete = answers.values.all { it != null && it.length <= 1000 }

    fun finish(r: ActionResult, done: String) {
        when (r) {
            is ActionResult.Done -> {
                showMessage(done)
                onBack()
            }
            is ActionResult.Failed -> if (r.error == ApiError.AlreadyDecided) {
                showMessage(S.get(R.string.already_handled))
                onBack()
            } else {
                actionErrorMessage(r.error)?.let { error = it }
            }
        }
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        BackTitle(S.get(R.string.question_from, d.staffName), onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.s4),
            verticalArrangement = Arrangement.spacedBy(Space.s3),
        ) {
            if (d.isTruncated) Text(REVIEW_ON_PC_TEXT, style = Type.bodySmall, color = c.statusWaiting)
            d.questions.forEach { q ->
                if (q.header.isNotBlank()) StatusBadge(q.header, c.onSurfaceMuted)
                Text(q.question, style = Type.titleMedium, color = c.onSurface)
                val picked = picks[q.question].orEmpty()
                fun toggle(key: String) {
                    picks[q.question] = if (q.multiSelect) (if (key in picked) picked - key else picked + key) else setOf(key)
                    error = null
                }
                q.options.forEach { o -> ChoiceCard(o.label, o.description, o.label in picked, q.multiSelect) { toggle(o.label) } }
                ChoiceCard(S.get(R.string.choice_custom), "", CUSTOM in picked, q.multiSelect) { toggle(CUSTOM) }
                AnimatedVisibility(CUSTOM in picked) {
                    val custom = customs[q.question].orEmpty()
                    OutlinedTextField(
                        value = custom,
                        onValueChange = { if (it.length <= 1000) customs[q.question] = it },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 96.dp),
                        placeholder = { Text(S.get(R.string.hint_answer), style = Type.bodyLarge) },
                        supportingText = { Text("${custom.length} / 1000", style = Type.label) },
                        textStyle = Type.bodyLarge,
                        shape = Radius.lg,
                        colors = fieldColors(),
                    )
                }
                Spacer(Modifier.height(Space.s2))
            }
            error?.let { Text(it, style = Type.bodySmall, color = c.statusError) }
        }
        Column(Modifier.fillMaxWidth().padding(Space.s4)) {
            if (!state.canAct) MutedText(S.get(R.string.needs_pc_connection))
            PrimaryButton(
                if (sending) S.get(R.string.btn_sending) else S.get(R.string.btn_answer),
                {
                    sending = true
                    scope.launch {
                        finish(answer(d, answers.mapValues { it.value!! }), S.get(R.string.msg_answered))
                        sending = false
                    }
                },
                Modifier.fillMaxWidth(),
                enabled = state.canAct && isComplete && !sending,
            )
            PlainTextButton(S.get(R.string.btn_skip_question), { confirmSkip = true }, Modifier.fillMaxWidth(), color = c.onSurfaceMuted, enabled = state.canAct && !sending)
        }
    }
    if (confirmSkip) {
        AlertDialog(
            onDismissRequest = { confirmSkip = false },
            title = { Text(S.get(R.string.dlg_skip_title), style = Type.titleMedium) },
            text = { Text(S.get(R.string.skip_note, d.staffName), style = Type.bodyLarge) },
            confirmButton = {
                PlainTextButton(S.get(R.string.btn_skip), {
                    confirmSkip = false
                    sending = true
                    scope.launch {
                        finish(skip(d), S.get(R.string.msg_skipped))
                        sending = false
                    }
                })
            },
            dismissButton = { PlainTextButton(S.get(R.string.btn_cancel), { confirmSkip = false }, color = c.onSurfaceMuted) },
            containerColor = c.surface,
        )
    }
}

@Composable
private fun ChoiceCard(label: String, description: String, selected: Boolean, isMulti: Boolean, onClick: () -> Unit) {
    val c = Office.colors
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .background(if (selected) c.surfaceSelected else c.surface, Radius.xl)
            .border(1.dp, if (selected) c.primary else c.outline, Radius.xl)
            .clickable(onClick = onClick)
            .padding(horizontal = Space.s3, vertical = Space.s2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isMulti) {
            Checkbox(selected, { onClick() }, colors = CheckboxDefaults.colors(checkedColor = c.primary, checkmarkColor = c.onPrimary))
        } else {
            RadioButton(selected, onClick, colors = RadioButtonDefaults.colors(selectedColor = c.primary))
        }
        Spacer(Modifier.width(Space.s2))
        Column(Modifier.weight(1f)) {
            Text(label, style = Type.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = c.onSurface)
            if (description.isNotBlank()) MutedText(description)
        }
    }
}

@Composable
fun fieldColors() = Office.colors.let { c ->
    OutlinedTextFieldDefaults.colors(
        focusedBorderColor = c.primary, unfocusedBorderColor = c.outlineInput,
        focusedContainerColor = c.surface, unfocusedContainerColor = c.surface, disabledContainerColor = c.surface,
    )
}

// ── 기획 확인 ─────────────────────────────────────────

@Composable
fun PlanScreen(
    d: Decision,
    state: OfficeState,
    onBack: () -> Unit,
    review: suspend (Decision, Boolean, String) -> ActionResult,
    showMessage: (String) -> Unit,
) {
    val c = Office.colors
    var feedback by rememberSaveable(d.id) { mutableStateOf("") }
    var sending by remember { mutableStateOf<Boolean?>(null) } // true=승인 중, false=반려 중
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun send(isApproved: Boolean) {
        sending = isApproved
        scope.launch {
            when (val r = review(d, isApproved, feedback)) {
                is ActionResult.Done -> {
                    showMessage(if (isApproved) S.get(R.string.msg_approved) else S.get(R.string.msg_rejected))
                    onBack()
                }
                is ActionResult.Failed -> if (r.error == ApiError.AlreadyDecided) {
                    showMessage(S.get(R.string.already_handled))
                    onBack()
                } else {
                    actionErrorMessage(r.error)?.let { error = it }
                }
            }
            sending = null
        }
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        BackTitle(S.get(R.string.kind_plan), onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.s4),
            verticalArrangement = Arrangement.spacedBy(Space.s3),
        ) {
            MutedText("${d.staffName} · ${elapsedText(d.createdAt, state.serverNow, ago = true)}")
            Text(d.title, style = Type.titleMedium, color = c.onSurface)
            OfficeCard {
                Column(verticalArrangement = Arrangement.spacedBy(Space.s1)) {
                    SimpleMarkdown(d.spec)
                    if (d.subtasks.isNotEmpty()) {
                        Spacer(Modifier.height(Space.s2))
                        Text(S.get(R.string.subtasks), style = Type.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = c.onSurface)
                        d.subtasks.forEachIndexed { i, st ->
                            Text(
                                "${i + 1}. ${st.title}" + if (st.assigneeName.isNotBlank()) " — ${st.assigneeName}" else "",
                                style = Type.bodySmall,
                                color = c.onSurface,
                            )
                        }
                    }
                }
            }
            if (d.isTruncated) MutedText(S.get(R.string.plan_truncated))
            OutlinedTextField(
                value = feedback,
                onValueChange = { if (it.length <= 2000) feedback = it },
                modifier = Modifier.fillMaxWidth().heightIn(min = 96.dp),
                placeholder = { Text(S.get(R.string.hint_plan_comment), style = Type.bodySmall) },
                supportingText = { Text(error ?: "${feedback.length} / 2000", style = Type.label, color = if (error != null) c.statusError else c.onSurfaceMuted) },
                textStyle = Type.bodyLarge,
                shape = Radius.lg,
                colors = fieldColors(),
                enabled = state.canAct && sending == null,
            )
        }
        Column(Modifier.fillMaxWidth().padding(Space.s4)) {
            if (!state.canAct) MutedText(S.get(R.string.needs_pc_connection))
            Row(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                OutlineButton(if (sending == false) S.get(R.string.btn_processing) else S.get(R.string.btn_reject), { send(false) }, Modifier.weight(1f), enabled = state.canAct && sending == null)
                PrimaryButton(if (sending == true) S.get(R.string.btn_processing) else S.get(R.string.btn_approve_proceed), { send(true) }, Modifier.weight(1f), enabled = state.canAct && sending == null)
            }
        }
    }
}

/** 마크다운을 단순 서식으로 (제목 줄은 굵게, 목록은 점) */
@Composable
private fun SimpleMarkdown(text: String) {
    val c = Office.colors
    text.lines().forEach { raw ->
        val line = raw.trimEnd()
        when {
            line.isBlank() -> Spacer(Modifier.height(Space.s1))
            line.startsWith("#") -> Text(line.trimStart('#').trim(), style = Type.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = c.onSurface)
            line.trimStart().startsWith("- ") || line.trimStart().startsWith("* ") ->
                Text("• " + line.trimStart().drop(2).replace("**", ""), style = Type.bodySmall, color = c.onSurface)
            else -> Text(line.replace("**", "").replace("`", ""), style = Type.bodySmall, color = c.onSurface)
        }
    }
}
