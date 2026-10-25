// 설정 (디자인 3-7): 연결된 PC · 알림 지연 안내와 배터리 최적화 · 연결 끊기(기기에서 열쇠 지우기)

package com.claudeoffice.remote.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import com.claudeoffice.remote.Lang
import com.claudeoffice.remote.R
import com.claudeoffice.remote.S

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.claudeoffice.remote.BuildConfig
import com.claudeoffice.remote.data.OfficeState
import com.claudeoffice.remote.data.Reach
import com.claudeoffice.remote.net.PROTOCOL_VERSION
import com.claudeoffice.remote.ui.theme.Office
import com.claudeoffice.remote.ui.theme.Space
import com.claudeoffice.remote.ui.theme.Type

@Composable
fun SettingsTab(state: OfficeState, onForget: () -> Unit, onBack: (() -> Unit)? = null) {
    val c = Office.colors
    val context = LocalContext.current
    var exempt by remember { mutableStateOf(isBatteryExempt(context)) }
    var confirm by remember { mutableStateOf(false) }
    ResumeEffect { exempt = isBatteryExempt(context) }

    Column(Modifier.fillMaxSize()) {
        if (onBack != null) BackTitle(S.get(R.string.cd_settings), onBack) else ScreenTitle(S.get(R.string.cd_settings))
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.s4),
            verticalArrangement = Arrangement.spacedBy(Space.s3),
        ) {
            LanguageCard()
            OfficeCard {
                Column(verticalArrangement = Arrangement.spacedBy(Space.s1)) {
                    MutedText(S.get(R.string.settings_connected_pc))
                    Text(state.address.ifBlank { "—" }, style = Type.titleMedium, color = c.onSurface)
                    when (state.route) {
                        com.claudeoffice.remote.net.Route.LAN -> MutedText(S.get(R.string.settings_route_lan))
                        com.claudeoffice.remote.net.Route.EXTERNAL -> MutedText(S.get(R.string.settings_route_ext))
                        null -> Unit
                    }
                    val (dot, label) = when {
                        state.gate != null -> c.statusWaiting to S.get(R.string.settings_conn_paused)
                        state.reach == Reach.OK && state.lastSuccessAt > 0 -> c.statusWorking to S.get(R.string.settings_conn_ok, clock(state.lastSuccessAt))
                        state.lastSuccessAt > 0 -> c.statusIdle to S.get(R.string.settings_conn_unreach, clock(state.lastSuccessAt))
                        else -> c.statusIdle to S.get(R.string.settings_conn_unchecked)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StatusDot(dot)
                        Spacer(Modifier.width(Space.s1))
                        Text(label, style = Type.label, color = dot)
                    }
                    MutedText(S.get(R.string.settings_versions, state.serverVersion.ifBlank { "—" }, BuildConfig.VERSION_NAME, PROTOCOL_VERSION))
                }
            }
            OfficeCard {
                Column(verticalArrangement = Arrangement.spacedBy(Space.s2)) {
                    Text(S.get(R.string.settings_notifications), style = Type.titleMedium, color = c.onSurface)
                    MutedText(S.get(R.string.settings_notifications_hint))
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { openBatterySettings(context) },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(S.get(R.string.settings_battery_opt), style = Type.bodyLarge, color = c.onSurface, modifier = Modifier.weight(1f))
                        if (exempt) Text(S.get(R.string.settings_off), style = Type.label, color = c.statusWorking)
                        else Text(S.get(R.string.settings_on_arrow), style = Type.label, color = c.statusWaiting)
                    }
                }
            }
            DangerOutlineButton(S.get(R.string.btn_disconnect_pc), { confirm = true }, Modifier.fillMaxWidth())
            MutedText(S.get(R.string.settings_disconnect_hint))
            Spacer(Modifier.heightIn(min = Space.s5))
        }
    }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text(S.get(R.string.dlg_disconnect_title), style = Type.titleMedium) },
            text = { Text(S.get(R.string.dlg_disconnect_body), style = Type.bodyLarge) },
            confirmButton = {
                PlainTextButton(S.get(R.string.btn_disconnect), {
                    confirm = false
                    onForget()
                }, color = c.statusError)
            },
            dismissButton = { PlainTextButton(S.get(R.string.btn_cancel), { confirm = false }, color = c.onSurfaceMuted) },
            containerColor = c.surface,
        )
    }
}

/** 앱 언어 고르기 — 고르면 저장하고 바로 새 언어로 다시 그린다. 언어 이름은 그 언어의 글자로 보인다 */
@Composable
private fun LanguageCard() {
    val c = Office.colors
    val activity = LocalContext.current.findActivity() ?: return
    val saved = Lang.saved(activity)
    OfficeCard {
        Column(verticalArrangement = Arrangement.spacedBy(Space.s1)) {
            Text(S.get(R.string.settings_language), style = Type.titleMedium, color = c.onSurface)
            Lang.CODES.forEach { code ->
                val label = when (code) {
                    "ko" -> "한국어"
                    "en" -> "English"
                    "ja" -> "日本語"
                    "zh" -> "中文(简体)"
                    else -> S.get(R.string.lang_auto)
                }
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { if (code != saved) Lang.set(activity, code) },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(label, style = Type.bodyLarge, color = c.onSurface, modifier = Modifier.weight(1f))
                    if (code == saved) Text("✓", style = Type.bodyLarge, color = c.primary)
                }
            }
        }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
