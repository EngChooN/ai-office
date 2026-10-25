// 데스크톱 컴포넌트를 옮긴 모바일 컴포넌트 (디자인 1-6절)

package com.claudeoffice.remote.ui

import com.claudeoffice.remote.R
import com.claudeoffice.remote.S

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.claudeoffice.remote.ui.theme.Office
import com.claudeoffice.remote.ui.theme.Radius
import com.claudeoffice.remote.ui.theme.Space
import com.claudeoffice.remote.ui.theme.Type
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// ── 버튼 (높이 48) ─────────────────────────────────────

private val ButtonPadding = PaddingValues(horizontal = 16.dp)

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val c = Office.colors
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = 48.dp),
        shape = Radius.lg,
        contentPadding = ButtonPadding,
        colors = ButtonDefaults.buttonColors(
            containerColor = c.primary, contentColor = c.onPrimary,
            disabledContainerColor = c.primary.copy(alpha = 0.5f), disabledContentColor = c.onPrimary.copy(alpha = 0.7f),
        ),
    ) { Text(text, style = Type.button, textAlign = TextAlign.Center) }
}

@Composable
fun OutlineButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val c = Office.colors
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = 48.dp),
        shape = Radius.lg,
        contentPadding = ButtonPadding,
        border = BorderStroke(1.dp, if (enabled) c.outline else c.outline.copy(alpha = 0.5f)),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = c.background, contentColor = c.onSurface),
    ) { Text(text, style = Type.button, textAlign = TextAlign.Center) }
}

@Composable
fun DangerOutlineButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = Office.colors
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.heightIn(min = 48.dp),
        shape = Radius.lg,
        border = BorderStroke(1.dp, c.statusError),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = c.statusError),
    ) { Text(text, style = Type.button) }
}

@Composable
fun PlainTextButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, color: Color = Office.colors.primary, enabled: Boolean = true) {
    TextButton(onClick = onClick, enabled = enabled, modifier = modifier.heightIn(min = 48.dp)) {
        Text(text, style = Type.button, color = if (enabled) color else color.copy(alpha = 0.5f))
    }
}

// ── 카드·배지·점 ───────────────────────────────────────

@Composable
fun OfficeCard(modifier: Modifier = Modifier, border: Color = Office.colors.outline, content: @Composable () -> Unit) {
    Box(
        modifier
            .fillMaxWidth()
            .background(Office.colors.surface, Radius.xl)
            .border(1.dp, border, Radius.xl)
            .padding(Space.s4),
    ) { content() }
}

@Composable
fun StatusBadge(text: String, color: Color) {
    Text(
        text,
        style = Type.label,
        color = color,
        modifier = Modifier
            .border(1.dp, color.copy(alpha = 0.5f), Radius.sm)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
fun StatusDot(color: Color, size: Int = 8) {
    Box(Modifier.size(size.dp).background(color, CircleShape))
}

/** 이니셜 원: 이름 뒤 2글자. v1에는 팀 색이 없어 모두 statusIdle 22% 배경 */
@Composable
fun InitialCircle(name: String, size: Int) {
    val c = Office.colors
    Box(
        Modifier
            .size(size.dp)
            .background(c.statusIdle.copy(alpha = 0.22f), CircleShape)
            .border(1.dp, c.statusIdle.copy(alpha = 0.6f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials(name),
            color = c.onSurface,
            style = if (size >= 56) Type.titleMedium else if (size >= 40) Type.label else Type.labelTiny,
            maxLines = 1,
        )
    }
}

fun initials(name: String) = name.trim().let { if (it.length <= 2) it else it.takeLast(2) }

// ── 직원 상태 ─────────────────────────────────────────

data class StatusLook(val label: String, val color: Color, val order: Int)

@Composable
fun statusLook(status: String): StatusLook {
    val c = Office.colors
    return when (status) {
        "waiting" -> StatusLook(S.get(R.string.needs_check), c.statusWaiting, 0)
        "error" -> StatusLook(S.get(R.string.status_error), c.statusError, 1)
        "working" -> StatusLook(S.get(R.string.status_working), c.statusWorking, 2)
        "idle" -> StatusLook(S.get(R.string.status_idle), c.statusIdle, 3)
        "offline" -> StatusLook(S.get(R.string.status_offline), c.statusIdle, 4)
        else -> StatusLook(S.get(R.string.status_unknown), c.statusIdle, 5)
    }
}

fun statusOrder(status: String) = when (status) {
    "waiting" -> 0
    "error" -> 1
    "working" -> 2
    "idle" -> 3
    "offline" -> 4
    else -> 5
}

// ── 시간 표시 ─────────────────────────────────────────

/** "12분째" (serverNow로 계산 — PC 시계 기준) */
fun elapsedText(since: Long, serverNow: Long, ago: Boolean = false): String {
    if (since <= 0) return ""
    val min = ((serverNow - since) / 60_000).coerceAtLeast(0)
    return when {
        min < 1 -> S.get(R.string.elapsed_now)
        min < 60 -> S.get(if (ago) R.string.ago_min else R.string.elapsed_min, min)
        min < 60 * 24 -> S.get(if (ago) R.string.ago_hour else R.string.elapsed_hour, min / 60)
        else -> S.get(if (ago) R.string.ago_day else R.string.elapsed_day, min / 60 / 24)
    }
}

fun clock(localMillis: Long): String = SimpleDateFormat("HH:mm", Locale.US).format(Date(localMillis))

// ── 상태 화면 공용 틀 (디자인 5절) ─────────────────────────

@Composable
fun StateScreen(
    icon: ImageVector,
    iconColor: Color,
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    extra: (@Composable () -> Unit)? = null,
    note: String? = null,
    onSettings: (() -> Unit)? = null,
    buttons: @Composable () -> Unit = {},
) {
    val c = Office.colors
    Column(modifier.fillMaxSize().background(c.background)) {
        if (onSettings != null) {
            Row(Modifier.fillMaxWidth().height(56.dp), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onSettings, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Outlined.Settings, contentDescription = S.get(R.string.cd_settings), tint = c.onSurfaceMuted)
                }
            }
        }
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Space.s5),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(if (onSettings != null) Space.s5 else 72.dp))
            Box(
                Modifier.size(56.dp).background(iconColor.copy(alpha = 0.15f), CircleShape).border(1.dp, iconColor.copy(alpha = 0.4f), CircleShape),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(28.dp)) }
            Spacer(Modifier.height(Space.s5))
            Text(title, style = Type.titleLarge, color = c.onSurface, textAlign = TextAlign.Center)
            Spacer(Modifier.height(Space.s2))
            Text(body, style = Type.bodyLarge, color = c.onSurfaceMuted, textAlign = TextAlign.Center)
            if (extra != null) {
                Spacer(Modifier.height(Space.s4))
                extra()
            }
            if (note != null) {
                Spacer(Modifier.height(Space.s3))
                Text(note, style = Type.bodySmall, color = c.onSurfaceMuted, textAlign = TextAlign.Center)
            }
            Spacer(Modifier.height(Space.s5))
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.s2)) { buttons() }
            Spacer(Modifier.height(Space.s5))
        }
    }
}

/** 끊김·서버 오류 배너 */
@Composable
fun ConnectionBanner(text: String, color: Color, action: (@Composable () -> Unit)? = null) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = Space.s4, vertical = Space.s2)
            .background(color.copy(alpha = 0.14f), Radius.xl)
            .border(1.dp, color.copy(alpha = 0.4f), Radius.xl)
            .padding(horizontal = Space.s3, vertical = Space.s2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = Type.bodySmall, color = Office.colors.onSurface, modifier = Modifier.weight(1f))
        if (action != null) {
            Spacer(Modifier.width(Space.s2))
            action()
        }
    }
}

/** 정보 배너 (muted) */
@Composable
fun InfoBanner(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = Type.bodySmall,
        color = Office.colors.onSurfaceMuted,
        modifier = modifier
            .fillMaxWidth()
            .background(Office.colors.surfaceMuted, Radius.xl)
            .padding(Space.s3),
    )
}

@Composable
fun MutedText(text: String, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE) {
    Text(text, style = Type.bodySmall, color = Office.colors.onSurfaceMuted, modifier = modifier, maxLines = maxLines, overflow = TextOverflow.Ellipsis)
}
