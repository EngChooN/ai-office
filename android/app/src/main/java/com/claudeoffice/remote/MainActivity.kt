package com.claudeoffice.remote

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.claudeoffice.remote.ui.AppRoot
import com.claudeoffice.remote.ui.LaunchRequest
import com.claudeoffice.remote.ui.theme.OfficeTheme
import com.claudeoffice.remote.work.Notifier

class MainActivity : ComponentActivity() {
    private var launchRequest by mutableStateOf<LaunchRequest?>(null)

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(Lang.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // 상태바·내비게이션 바를 투명하게 하고 앱 배경이 그 아래까지 이어지게 한다. 아이콘 밝기는 시스템 다크/라이트를 따른다 (앱 테마도 같은 기준).
        // 3버튼 내비게이션의 반투명 막(흰색)은 끈다
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
        )
        if (android.os.Build.VERSION.SDK_INT >= 29) window.isNavigationBarContrastEnforced = false
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) launchRequest = requestFrom(intent)
        val repo = (application as RemoteApp).repository
        setContent {
            OfficeTheme {
                AppRoot(repo, launchRequest) { launchRequest = null }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        launchRequest = requestFrom(intent)
    }

    private fun requestFrom(intent: Intent?): LaunchRequest? {
        intent ?: return null
        val openDecisions = intent.getStringExtra(Notifier.EXTRA_OPEN) == Notifier.OPEN_DECISIONS
        // 디버그 빌드에서만 값이 있다 (src/debug). 릴리스에는 이 입력 경로 자체가 없다
        val qr = DebugHooks.qrFrom(intent)
        val web = DebugHooks.webEntryFrom(intent)
        return if (openDecisions || qr != null || web != null) LaunchRequest(openDecisions, qr, web) else null
    }
}
