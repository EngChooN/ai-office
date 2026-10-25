// 새 버전 안내 배너: 화면 위에 떠서 변경 요약과 [다운로드]·[나중에]를 보인다

package com.claudeoffice.remote.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.claudeoffice.remote.R
import com.claudeoffice.remote.S
import com.claudeoffice.remote.ui.theme.Office
import com.claudeoffice.remote.ui.theme.Space
import com.claudeoffice.remote.ui.theme.Type
import com.claudeoffice.remote.update.UpdateManager

@Composable
fun UpdateBanner(modifier: Modifier = Modifier) {
    val ui by UpdateManager.ui.collectAsStateWithLifecycle()
    val info = ui.banner ?: return
    val context = LocalContext.current
    val c = Office.colors
    OfficeCard(modifier.statusBarsPadding().padding(Space.s3), border = c.primary) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.s2)) {
            Text(S.get(R.string.update_banner_title, info.version), style = Type.titleMedium, color = c.onSurface)
            if (info.notes.isNotEmpty()) Text(info.notes, style = Type.bodyLarge, color = c.onSurfaceMuted, maxLines = 6)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                PlainTextButton(S.get(R.string.update_later), { UpdateManager.skip(context, info.version) }, color = c.onSurfaceMuted)
                PrimaryButton(S.get(R.string.update_download), { UpdateManager.download(context, info) })
            }
        }
    }
}
