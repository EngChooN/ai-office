// 오류별 상태 화면 (디자인 5절 A~L). 인증서 불일치(G)에는 "무시하고 계속"이 없다

package com.claudeoffice.remote.ui

import com.claudeoffice.remote.R
import com.claudeoffice.remote.S

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.GppBad
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PowerSettingsNew
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.claudeoffice.remote.data.Gate
import com.claudeoffice.remote.data.Reach
import com.claudeoffice.remote.net.ApiError
import com.claudeoffice.remote.net.Endpoint
import com.claudeoffice.remote.net.Route
import com.claudeoffice.remote.ui.theme.Office
import com.claudeoffice.remote.ui.theme.Type
import kotlinx.coroutines.delay

/** 화면이 다시 보일 때마다 (설정 화면에서 돌아온 경우 등) */
@Composable
fun ResumeEffect(onResume: () -> Unit) {
    val owner = LocalLifecycleOwner.current
    val current by rememberUpdatedState(onResume)
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) current() }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
}

/** 탭을 숨기는 상태 화면 (D·E·F·G·H·L) */
@Composable
fun GateScreen(
    gate: Gate,
    clockOffset: Long,
    onScan: () -> Unit,
    onRetry: () -> Unit,
    onSettings: (() -> Unit)?,
) {
    val c = Office.colors
    when (gate) {
        Gate.Revoked -> StateScreen(
            icon = Icons.Outlined.Sync, iconColor = c.statusWaiting,
            title = S.get(R.string.state_revoked_title),
            body = S.get(R.string.state_revoked_body),
            note = S.get(R.string.state_revoked_note),
            onSettings = onSettings,
        ) { PrimaryButton(S.get(R.string.btn_scan_new_qr), onScan, Modifier.fillMaxWidth()) }

        Gate.Unauthorized -> StateScreen(
            icon = Icons.Outlined.Key, iconColor = c.statusWaiting,
            title = S.get(R.string.state_unauth_title),
            body = S.get(R.string.state_unauth_body),
            note = S.get(R.string.state_unauth_note),
            onSettings = onSettings,
        ) { PrimaryButton(S.get(R.string.btn_rescan_qr), onScan, Modifier.fillMaxWidth()) }

        is Gate.Locked -> LockedScreen(gate.retryAt, clockOffset, onRetry, onSettings)

        Gate.PinMismatch -> StateScreen(
            icon = Icons.Outlined.GppBad, iconColor = c.statusError,
            title = S.get(R.string.state_pin_title),
            body = S.get(R.string.state_pin_body),
            extra = {
                OfficeCard {
                    Column {
                        Text(S.get(R.string.state_pin_hint1), style = Type.bodySmall, color = c.onSurface)
                        Text(S.get(R.string.state_pin_hint2), style = Type.bodySmall, color = c.onSurface)
                    }
                }
            },
            onSettings = onSettings,
        ) { PrimaryButton(S.get(R.string.btn_scan_new_qr), onScan, Modifier.fillMaxWidth()) }

        Gate.NeedsAppUpdate -> StateScreen(
            icon = Icons.Outlined.SystemUpdate, iconColor = c.statusIdle,
            title = S.get(R.string.state_app_update_title),
            body = S.get(R.string.state_app_update_body),
            onSettings = onSettings,
        ) { OutlineButton(S.get(R.string.btn_retry), onRetry, Modifier.fillMaxWidth()) }

        Gate.NeedsPcUpdate -> StateScreen(
            icon = Icons.Outlined.SystemUpdate, iconColor = c.statusIdle,
            title = S.get(R.string.state_pc_update_title),
            body = S.get(R.string.state_pc_update_body),
            onSettings = onSettings,
        ) { OutlineButton(S.get(R.string.btn_retry), onRetry, Modifier.fillMaxWidth()) }

        is Gate.AppBug -> StateScreen(
            icon = Icons.Outlined.ErrorOutline, iconColor = c.statusError,
            title = S.get(R.string.state_appbug_title),
            body = S.get(R.string.state_appbug_body),
            onSettings = onSettings,
        ) { OutlineButton(S.get(R.string.btn_retry), onRetry, Modifier.fillMaxWidth()) }

        is Gate.BadResponse -> BadResponseScreen(gate.path, onRetry, onSettings)

        Gate.NotConnected -> Unit
    }
}

/** PC는 응답했는데 앱이 내용을 읽지 못함. "연결 못 함"과 구분해 원인 위치를 함께 보인다 (QA 2차 0번) */
@Composable
private fun BadResponseScreen(path: String, onRetry: () -> Unit, onSettings: (() -> Unit)?, extraButtons: @Composable () -> Unit = {}) {
    val c = Office.colors
    StateScreen(
        icon = Icons.Outlined.ErrorOutline, iconColor = c.statusError,
        title = S.get(R.string.state_badresp_title),
        body = S.get(R.string.state_badresp_body),
        note = S.get(R.string.bad_response_path, path),
        onSettings = onSettings,
    ) {
        OutlineButton(S.get(R.string.btn_retry), onRetry, Modifier.fillMaxWidth())
        extraButtons()
    }
}

/** F 잠김 카운트다운. retryAt(PC 시계) - 보정된 현재로 계산하고, 0이 되면 자동으로 한 번 다시 붙는다 */
@Composable
private fun LockedScreen(retryAt: Long, clockOffset: Long, onRetry: () -> Unit, onSettings: (() -> Unit)?) {
    val c = Office.colors
    var remaining by remember { mutableLongStateOf(retryAt - (System.currentTimeMillis() + clockOffset)) }
    LaunchedEffect(retryAt) {
        while (true) {
            remaining = retryAt - (System.currentTimeMillis() + clockOffset)
            if (remaining <= 0) {
                onRetry()
                break
            }
            delay(1000)
        }
    }
    val sec = (remaining.coerceAtLeast(0) + 999) / 1000
    StateScreen(
        icon = Icons.Outlined.Lock, iconColor = c.statusWaiting,
        title = S.get(R.string.state_locked_title),
        body = S.get(R.string.state_locked_body),
        extra = {
            Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                Text("%d:%02d".format(sec / 60, sec % 60), style = Type.display, color = c.onSurface)
                MutedText(S.get(R.string.unlock_at, clock(retryAt - clockOffset)))
            }
        },
        note = S.get(R.string.state_locked_note),
        onSettings = onSettings,
    ) {
        if (remaining > 0) OutlineButton(S.get(R.string.btn_retry_locked), {}, Modifier.fillMaxWidth(), enabled = false)
        else PrimaryButton(S.get(R.string.btn_retry), onRetry, Modifier.fillMaxWidth())
    }
}

/** A 원격 꺼짐 / B 절전·PC 응답 없음 (탭은 유지) */
@Composable
fun ReachScreen(reach: Reach, lastSuccessAt: Long, tried: List<Endpoint>, isLanOnly: Boolean = false, onRetry: () -> Unit) {
    val c = Office.colors
    val last = listOfNotNull(triedText(tried), if (lastSuccessAt > 0) S.get(R.string.last_connected, clock(lastSuccessAt)) else null)
        .joinToString("\n").ifEmpty { null }
    when (reach) {
        Reach.REMOTE_OFF -> StateScreen(
            icon = Icons.Outlined.PowerSettingsNew, iconColor = c.statusIdle,
            title = S.get(R.string.state_remoteoff_title),
            body = S.get(R.string.state_remoteoff_body),
            note = last,
        ) { OutlineButton(S.get(R.string.btn_retry), onRetry, Modifier.fillMaxWidth()) }

        else -> StateScreen(
            icon = Icons.Outlined.Bedtime, iconColor = c.statusIdle,
            title = S.get(R.string.state_unreach_title),
            body = S.get(if (isLanOnly) R.string.state_unreach_body_lo else R.string.state_unreach_body),
            note = listOfNotNull(last, S.get(R.string.state_unreach_next)).joinToString("\n"),
        ) { OutlineButton(S.get(R.string.btn_retry), onRetry, Modifier.fillMaxWidth()) }
    }
}

/**
 * 응답을 받지 못하고 시도한 주소들 (토큰은 넣지 않는다).
 * 예: "같은 와이파이 주소(192.168.0.24:47900)·외부 주소(203.0.113.10:47900) 모두 닿지 않았어요"
 */
fun triedText(tried: List<Endpoint>): String? {
    if (tried.isEmpty()) return null
    val parts = tried.distinct().map { e -> S.get(R.string.tried_route_fmt, S.get(if (e.route == Route.LAN) R.string.tried_lan else R.string.tried_ext), e.label) }
    return if (parts.size == 1) S.get(R.string.tried_one, parts[0]) else S.get(R.string.tried_many, parts.joinToString("·"))
}

/**
 * 새 QR로 연결이 실패했을 때 (아직 저장하지 않은 QR).
 * 이미 쓰던 연결이 있으면(onBackToPrevious) 그 연결은 그대로 두므로, 화면도 "이 QR만 실패"로 보여 준다 —
 * 예전에는 S.get(R.string.state_unauth_title)를 보이면서 뒤에서는 이전 토큰으로 계속 조회해 화면과 실제가 어긋났다 (QA 버그 2)
 */
@Composable
fun ConnectFailedScreen(
    error: ApiError,
    onRetry: () -> Unit,
    onScan: () -> Unit,
    onBackToPrevious: (() -> Unit)? = null,
    tried: List<Endpoint> = emptyList(),
    isLanOnly: Boolean = false,
) {
    val c = Office.colors
    val triedNote = triedText(tried)
    if (onBackToPrevious != null) {
        val reason = when (error) {
            ApiError.PinMismatch -> S.get(R.string.state_pin_qr)
            ApiError.TokenRevoked -> S.get(R.string.qr_revoked)
            ApiError.Unauthorized -> S.get(R.string.qr_unauthorized)
            is ApiError.BadResponse -> S.get(R.string.qr_bad_response, error.path)
            ApiError.NeedsAppUpdate -> S.get(R.string.qr_needs_app_update)
            ApiError.NeedsPcUpdate -> S.get(R.string.qr_needs_pc_update)
            ApiError.PhoneOffline -> S.get(R.string.phone_offline_short)
            else -> S.get(if (isLanOnly) R.string.qr_unreach_default_lo else R.string.qr_unreach_default)
        }
        StateScreen(
            icon = Icons.Outlined.ErrorOutline, iconColor = c.statusWaiting,
            title = S.get(R.string.qr_fail_title),
            body = reason,
            note = listOfNotNull(triedNote, S.get(R.string.qr_fail_note_prev)).joinToString("\n"),
        ) {
            PrimaryButton(S.get(R.string.btn_back_to_prev), onBackToPrevious, Modifier.fillMaxWidth())
            PlainTextButton(S.get(R.string.btn_rescan_qr), onScan, Modifier.fillMaxWidth())
        }
        return
    }
    when (error) {
        is ApiError.BadResponse -> BadResponseScreen(error.path, onRetry, null) {
            PlainTextButton(S.get(R.string.btn_rescan_qr), onScan, Modifier.fillMaxWidth())
        }
        ApiError.PinMismatch -> GateScreen(Gate.PinMismatch, 0, onScan, onRetry, null)
        ApiError.TokenRevoked -> GateScreen(Gate.Revoked, 0, onScan, onRetry, null)
        ApiError.Unauthorized -> GateScreen(Gate.Unauthorized, 0, onScan, onRetry, null)
        ApiError.NeedsAppUpdate -> GateScreen(Gate.NeedsAppUpdate, 0, onScan, onRetry, null)
        ApiError.NeedsPcUpdate -> GateScreen(Gate.NeedsPcUpdate, 0, onScan, onRetry, null)
        ApiError.PhoneOffline -> StateScreen(
            icon = Icons.Outlined.WifiOff, iconColor = c.statusWaiting,
            title = S.get(R.string.state_offline_title),
            body = S.get(R.string.state_offline_body),
            note = triedNote,
        ) {
            PrimaryButton(S.get(R.string.btn_retry), onRetry, Modifier.fillMaxWidth())
            PlainTextButton(S.get(R.string.btn_rescan_qr), onScan, Modifier.fillMaxWidth())
        }
        ApiError.RemoteOff, ApiError.Unreachable -> StateScreen(
            icon = if (error == ApiError.RemoteOff) Icons.Outlined.PowerSettingsNew else Icons.Outlined.Bedtime,
            iconColor = c.statusIdle,
            title = S.get(R.string.state_connfail_title),
            body = if (error == ApiError.RemoteOff) {
                S.get(R.string.state_connfail_remoteoff)
            } else {
                S.get(if (isLanOnly) R.string.state_connfail_unreach_lo else R.string.state_connfail_unreach)
            },
            note = triedNote,
        ) {
            PrimaryButton(S.get(R.string.btn_retry), onRetry, Modifier.fillMaxWidth())
            PlainTextButton(S.get(R.string.btn_rescan_qr), onScan, Modifier.fillMaxWidth())
        }
        else -> StateScreen(
            icon = Icons.Outlined.ErrorOutline, iconColor = c.statusError,
            title = S.get(R.string.state_connfail_title),
            body = S.get(R.string.state_connfail_retry_body),
            note = triedNote,
        ) {
            PrimaryButton(S.get(R.string.btn_retry), onRetry, Modifier.fillMaxWidth())
            PlainTextButton(S.get(R.string.btn_rescan_qr), onScan, Modifier.fillMaxWidth())
        }
    }
}
