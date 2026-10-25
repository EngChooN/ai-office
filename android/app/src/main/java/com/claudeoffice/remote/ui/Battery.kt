// 배터리 최적화 예외 안내 (디자인 4절). 허용을 바로 묻는 창은 쓰지 않고 시스템 목록 화면으로 보낸다

package com.claudeoffice.remote.ui

import com.claudeoffice.remote.R
import com.claudeoffice.remote.S

import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import com.claudeoffice.remote.ui.theme.Office
import com.claudeoffice.remote.ui.theme.Space
import com.claudeoffice.remote.ui.theme.Type

fun isBatteryExempt(context: Context): Boolean =
    context.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(context.packageName) == true

fun openBatterySettings(context: Context) {
    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(intent)
    } catch (_: Exception) {
        context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

/** S.get(R.string.battery_title) 카드 */
@Composable
fun DelayNoticeCard() {
    val c = Office.colors
    OfficeCard {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
            Text(S.get(R.string.battery_title), style = Type.titleMedium, color = c.onSurface)
            Text(
                buildAnnotatedString {
                    append(S.get(R.string.battery_a))
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = c.onSurface)) { append(S.get(R.string.battery_b)) }
                    append(S.get(R.string.battery_c))
                },
                style = Type.bodySmall,
                color = c.onSurfaceMuted,
            )
            Text(S.get(R.string.battery_d), style = Type.bodySmall, color = c.onSurfaceMuted)
        }
    }
}
