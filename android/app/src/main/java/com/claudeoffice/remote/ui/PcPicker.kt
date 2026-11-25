// PC 고르기: 위쪽 줄에 "지금 PC 이름 ▾" 칩, 누르면 바텀시트에 연결된 PC 목록과 "PC 추가".
// PC가 1대여도 칩을 보여 준다(추가 길이 눈에 띄게). 앱(네이티브) 쪽 줄이라 PC 화면(웹) 안쪽은 건드리지 않는다

package com.claudeoffice.remote.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Badge
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.claudeoffice.remote.R
import com.claudeoffice.remote.S
import com.claudeoffice.remote.data.PcInfo
import com.claudeoffice.remote.data.PcListState
import com.claudeoffice.remote.ui.theme.Office
import com.claudeoffice.remote.ui.theme.Radius
import com.claudeoffice.remote.ui.theme.Space
import com.claudeoffice.remote.ui.theme.Type

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PcBar(pcs: PcListState, onSwitch: (String) -> Unit, onAdd: () -> Unit, onFull: () -> Unit, modifier: Modifier = Modifier, onSettings: (() -> Unit)? = null, compact: Boolean = false, onChipWidth: (Int) -> Unit = {}) {
    val current = pcs.current ?: return
    val c = Office.colors
    var open by remember { mutableStateOf(false) }
    // 칩은 화면 폭의 60%까지, 이름은 한 줄 말줄임 (320~360폭에서도 잘리지 않게)
    val maxChip = (LocalConfiguration.current.screenWidthDp * 0.6f).dp
    val others = pcs.items.filter { it.id != current.id }.sumOf { it.pending }

    if (compact) {
        // 제목 줄 안에 얹는 작은 칩: 보이는 높이 32dp, 누르는 곳은 줄 높이 48dp 전체. 폭은 화면의 30%까지
        val maxCompact = (LocalConfiguration.current.screenWidthDp * 0.3f).dp
        val density = androidx.compose.ui.platform.LocalDensity.current
        Box(
            modifier
                .height(48.dp)
                .onSizeChanged { onChipWidth(with(density) { it.width.toDp().value.toInt() }) }
                .clickable { open = true }
                .semantics { contentDescription = S.get(R.string.pc_switch_cd) + ", " + current.name }
                .padding(start = Space.s3),
            contentAlignment = Alignment.CenterStart,
        ) {
            Row(
                Modifier
                    .widthIn(max = maxCompact)
                    .height(32.dp)
                    .background(c.surface, Radius.lg)
                    .border(1.dp, c.outline, Radius.lg)
                    .padding(start = Space.s2, end = 0.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                StatusDot(dotColor(current))
                Spacer(Modifier.width(Space.s1))
                Text(current.name, style = Type.label, color = c.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                Icon(Icons.Filled.ArrowDropDown, contentDescription = null, tint = c.onSurfaceMuted, modifier = Modifier.size(20.dp))
            }
            // 다른 PC에 결재 대기가 있으면 칩 오른쪽 위에 작은 점 (숫자는 PC 목록에서)
            if (others > 0) Box(Modifier.align(Alignment.CenterEnd).offset(x = 2.dp, y = (-12).dp).size(8.dp).background(c.statusWaitingFill, androidx.compose.foundation.shape.CircleShape))
        }
    } else Row(modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = Space.s4), verticalAlignment = Alignment.CenterVertically) {
        Row(
            Modifier
                .widthIn(max = maxChip)
                .heightIn(min = 40.dp)
                .background(c.surface, Radius.lg)
                .border(1.dp, c.outline, Radius.lg)
                .clickable { open = true }
                .semantics { contentDescription = S.get(R.string.pc_switch_cd) + ", " + current.name }
                .padding(start = Space.s3, end = Space.s1),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            StatusDot(dotColor(current))
            Spacer(Modifier.width(Space.s2))
            Text(current.name, style = Type.label, color = c.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null, tint = c.onSurfaceMuted)
        }
        // 다른 PC에 결재 대기가 있으면 칩 옆에 작은 배지
        if (others > 0) {
            Spacer(Modifier.width(Space.s2))
            Badge(containerColor = c.statusWaitingFill, contentColor = c.onStatusWaitingFill) { Text("$others", style = Type.labelTiny) }
        }
    }

    if (open) {
        ModalBottomSheet(onDismissRequest = { open = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.surface) {
            Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = Space.s4).padding(bottom = Space.s4)) {
                Text(S.get(R.string.pc_sheet_title), style = Type.titleMedium, color = c.onSurface, modifier = Modifier.padding(bottom = Space.s2))
                pcs.items.forEach { pc ->
                    PcRow(pc, isCurrent = pc.id == current.id) {
                        open = false
                        if (pc.id != current.id) onSwitch(pc.id)
                    }
                }
                // 3대가 차면 흐리게 두고, 누르면 안내 창
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp).alpha(if (pcs.isFull) 0.5f else 1f)
                        .clickable { open = false; if (pcs.isFull) onFull() else onAdd() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Space.s2),
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null, tint = c.primary)
                    Text(S.get(R.string.pc_add), style = Type.bodyLarge, color = c.primary)
                }
                // PC 화면(웹)에는 설정 탭이 없다 — 연결 끊기·이름 바꾸기는 여기서 연다
                if (onSettings != null) Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable { open = false; onSettings() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Space.s2),
                ) {
                    Icon(Icons.Filled.Settings, contentDescription = null, tint = c.onSurfaceMuted)
                    Text(S.get(R.string.cd_settings), style = Type.bodyLarge, color = c.onSurface)
                }
            }
        }
    }
}

@Composable
private fun PcRow(pc: PcInfo, isCurrent: Boolean, onClick: () -> Unit) {
    val c = Office.colors
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(onClick = onClick)
            .semantics { if (isCurrent) contentDescription = S.get(R.string.pc_current_cd) + ", " + pc.name },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.s3),
    ) {
        StatusDot(dotColor(pc))
        Column(Modifier.weight(1f).padding(vertical = Space.s2)) {
            Text(pc.name, style = Type.bodyLarge, color = c.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
            MutedText(pc.address, maxLines = 2)
        }
        if (pc.pending > 0) Badge(containerColor = c.statusWaitingFill, contentColor = c.onStatusWaitingFill) { Text("${pc.pending}", style = Type.labelTiny) }
        if (isCurrent) Icon(Icons.Filled.Check, contentDescription = null, tint = c.primary)
    }
}

@Composable
private fun dotColor(pc: PcInfo) = if (pc.paused) Office.colors.statusWaiting else Office.colors.statusWorking
