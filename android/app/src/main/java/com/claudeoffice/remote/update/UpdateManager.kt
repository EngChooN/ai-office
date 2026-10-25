// 업데이트 확인: 앱이 켜져 있는 동안 시작할 때 한 번, 이후 6시간마다 GitHub Release를 조회한다.
// 자동 확인의 실패(오프라인·조회 제한)는 조용히 무시하고, 설정의 [지금 확인]만 결과를 보여 준다. 자동 설치는 하지 않는다 (앱에 서명이 없다)

package com.claudeoffice.remote.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.claudeoffice.remote.BuildConfig
import com.claudeoffice.remote.Lang
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

enum class CheckState { IDLE, CHECKING, UP_TO_DATE, AVAILABLE, FAILED }

data class UpdateUi(
    val current: String,
    val state: CheckState = CheckState.IDLE,
    val latest: ReleaseInfo? = null,
    /** 안내 배너에 보일 새 버전 (건너뛴 버전이면 null) */
    val banner: ReleaseInfo? = null,
)

object UpdateManager {
    private val current = currentVersionOf(BuildConfig.VERSION_NAME)
    private val _ui = MutableStateFlow(UpdateUi(current))
    val ui: StateFlow<UpdateUi> = _ui

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var loop: Job? = null
    private val http = OkHttpClient.Builder().callTimeout(15, TimeUnit.SECONDS).build()

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences("update", Context.MODE_PRIVATE)

    /** 앱이 켜질 때 한 번 부른다. 이미 돌고 있으면 무시 */
    fun start(context: Context) {
        if (loop?.isActive == true) return
        val app = context.applicationContext
        loop = scope.launch {
            while (true) {
                check(app, manual = false)
                delay(CHECK_INTERVAL_MS)
            }
        }
    }

    /** 설정의 [지금 확인] */
    fun checkNow(context: Context) {
        val app = context.applicationContext
        scope.launch { check(app, manual = true) }
    }

    /** [나중에] — 그 버전은 다시 띄우지 않는다 (더 새 버전이 나오면 다시 알린다) */
    fun skip(context: Context, version: String) {
        prefs(context).edit().putString("skipped", version).apply()
        _ui.update { it.copy(banner = null) }
    }

    /** [다운로드] — APK 주소를 브라우저로 연다 */
    fun download(context: Context, info: ReleaseInfo) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(info.downloadUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    private suspend fun check(context: Context, manual: Boolean) {
        if (manual) _ui.update { it.copy(state = CheckState.CHECKING) }
        val info = withContext(Dispatchers.IO) { fetch(Lang.current(context).language) }
        if (info == null) {
            // 자동 확인의 실패는 조용히 무시한다
            if (manual) _ui.update { it.copy(state = CheckState.FAILED) }
            return
        }
        val skipped = prefs(context).getString("skipped", null)
        _ui.update {
            if (isNewerVersion(info.version, current)) {
                it.copy(state = CheckState.AVAILABLE, latest = info, banner = if (shouldNotify(info.version, current, skipped)) info else null)
            } else {
                it.copy(state = CheckState.UP_TO_DATE, latest = null, banner = null)
            }
        }
    }

    private fun fetch(lang: String): ReleaseInfo? = runCatching {
        val req = Request.Builder().url(RELEASE_API_URL).header("Accept", "application/vnd.github+json").build()
        http.newCall(req).execute().use { r -> if (r.isSuccessful) r.body?.string()?.let { parseRelease(it, lang) } else null }
    }.getOrNull()
}
