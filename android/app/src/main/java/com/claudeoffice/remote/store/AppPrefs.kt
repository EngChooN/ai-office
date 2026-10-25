// 비밀이 아닌 앱 상태 (멈춤 이유·잠금 시각·마지막으로 알린 결정 id 등). 토큰·요약은 여기 넣지 않는다

package com.claudeoffice.remote.store

import android.content.Context
import com.claudeoffice.remote.net.Route
import com.claudeoffice.remote.net.RouteMemory

/** 자동 조회를 멈춘 이유 — 다시 QR을 찍거나(잠김은 시간이 지나면) 풀린다 */
enum class StopReason { REVOKED, UNAUTHORIZED, PIN_MISMATCH, NEEDS_APP_UPDATE, NEEDS_PC_UPDATE }

class AppPrefs(context: Context) {
    private val prefs = context.getSharedPreferences("state", Context.MODE_PRIVATE)

    var stopReason: StopReason?
        get() = prefs.getString("stopReason", null)?.let { runCatching { StopReason.valueOf(it) }.getOrNull() }
        set(v) = prefs.edit().apply { if (v == null) remove("stopReason") else putString("stopReason", v.name) }.apply()

    /** 잠금이 풀리는 시각 (PC 시계 기준 retryAt). 0이면 잠김 없음 */
    var lockRetryAt: Long
        get() = prefs.getLong("lockRetryAt", 0)
        set(v) = prefs.edit().putLong("lockRetryAt", v).apply()

    /** 잠김 알림을 이미 보낸 retryAt (같은 잠금에 알림 1회) */
    var lockNotifiedFor: Long
        get() = prefs.getLong("lockNotifiedFor", 0)
        set(v) = prefs.edit().putLong("lockNotifiedFor", v).apply()

    /** PC 시계 - 휴대폰 시계 (밀리초). "N분째"·잠김 카운트다운 보정 */
    var clockOffset: Long
        get() = prefs.getLong("clockOffset", 0)
        set(v) = prefs.edit().putLong("clockOffset", v).apply()

    var lastSuccessAt: Long
        get() = prefs.getLong("lastSuccessAt", 0)
        set(v) = prefs.edit().putLong("lastSuccessAt", v).apply()

    var serverVersion: String
        get() = prefs.getString("serverVersion", "") ?: ""
        set(v) = prefs.edit().putString("serverVersion", v).apply()

    /** 표시용 주소 (토큰과 달리 비밀이 아니지만, 연결이 지워지면 같이 지운다) */
    var displayAddress: String
        get() = prefs.getString("displayAddress", "") ?: ""
        set(v) = prefs.edit().putString("displayAddress", v).apply()

    /** 이미 보여 줬거나 알린 결정 id (백그라운드 알림 중복 방지) */
    var notifiedIds: Set<String>
        get() = prefs.getStringSet("notifiedIds", emptySet()) ?: emptySet()
        set(v) = prefs.edit().putStringSet("notifiedIds", v.toSet()).apply()

    /** 첫 백그라운드 알림 뒤 앱을 열면 지연 안내 배너를 1회 보인다 */
    var delayBannerPending: Boolean
        get() = prefs.getBoolean("delayBannerPending", false)
        set(v) = prefs.edit().putBoolean("delayBannerPending", v).apply()

    var delayBannerDone: Boolean
        get() = prefs.getBoolean("delayBannerDone", false)
        set(v) = prefs.edit().putBoolean("delayBannerDone", v).apply()

    /** 마지막으로 닿은 길 (같은 와이파이 / 외부). 화면 갱신과 백그라운드 조회가 함께 쓴다 */
    val routeMemory = object : RouteMemory {
        override var preferred: Route?
            get() = prefs.getString("preferredRoute", null)?.let { runCatching { Route.valueOf(it) }.getOrNull() }
            set(v) = prefs.edit().apply { if (v == null) remove("preferredRoute") else putString("preferredRoute", v.name) }.apply()
    }

    fun clear() = prefs.edit().clear().commit()
}
