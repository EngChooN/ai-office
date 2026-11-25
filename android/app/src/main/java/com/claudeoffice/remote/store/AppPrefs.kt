// 비밀이 아닌 앱 상태 (멈춤 이유·잠금 시각·마지막으로 알린 결정 id 등). 토큰·요약은 여기 넣지 않는다

package com.claudeoffice.remote.store

import android.content.Context
import com.claudeoffice.remote.net.Route
import com.claudeoffice.remote.net.RouteMemory

/** 자동 조회를 멈춘 이유 — 다시 QR을 찍거나(잠김은 시간이 지나면) 풀린다 */
enum class StopReason { REVOKED, UNAUTHORIZED, PIN_MISMATCH, NEEDS_APP_UPDATE, NEEDS_PC_UPDATE }

/**
 * PC별 값(멈춤 이유·잠금·시계 차이·마지막 성공·표시 주소·알린 결정·기억한 길 …)은 키 앞에 PC id를 붙여 저장한다.
 * 앱 공통 값(지연 안내 배너·웹 저장소 주인)은 그대로. pcId는 현재 PC가 바뀔 때 저장소가 바꾼다
 */
class AppPrefs(context: Context, var pcId: String = "") {
    private val prefs = context.getSharedPreferences("state", Context.MODE_PRIVATE)
    private fun k(name: String) = PcBooks.key(pcId, name)

    var stopReason: StopReason?
        get() = prefs.getString(k("stopReason"), null)?.let { runCatching { StopReason.valueOf(it) }.getOrNull() }
        set(v) = prefs.edit().apply { if (v == null) remove(k("stopReason")) else putString(k("stopReason"), v.name) }.apply()

    /** 잠금이 풀리는 시각 (PC 시계 기준 retryAt). 0이면 잠김 없음 */
    var lockRetryAt: Long
        get() = prefs.getLong(k("lockRetryAt"), 0)
        set(v) = prefs.edit().putLong(k("lockRetryAt"), v).apply()

    /** 잠김 알림을 이미 보낸 retryAt (같은 잠금에 알림 1회) */
    var lockNotifiedFor: Long
        get() = prefs.getLong(k("lockNotifiedFor"), 0)
        set(v) = prefs.edit().putLong(k("lockNotifiedFor"), v).apply()

    /** PC 시계 - 휴대폰 시계 (밀리초). "N분째"·잠김 카운트다운 보정 */
    var clockOffset: Long
        get() = prefs.getLong(k("clockOffset"), 0)
        set(v) = prefs.edit().putLong(k("clockOffset"), v).apply()

    var lastSuccessAt: Long
        get() = prefs.getLong(k("lastSuccessAt"), 0)
        set(v) = prefs.edit().putLong(k("lastSuccessAt"), v).apply()

    /** 마지막으로 확인한 PC가 전체 화면(v2)을 지원했는가 — 앱이 다시 뜰 때 네이티브 화면을 거치지 않고 바로 PC 화면으로 */
    var v2Active: Boolean
        get() = prefs.getBoolean(k("v2Active"), false)
        set(v) = prefs.edit().putBoolean(k("v2Active"), v).apply()

    var serverVersion: String
        get() = prefs.getString(k("serverVersion"), "") ?: ""
        set(v) = prefs.edit().putString(k("serverVersion"), v).apply()

    /** 표시용 주소 (토큰과 달리 비밀이 아니지만, 연결이 지워지면 같이 지운다) */
    var displayAddress: String
        get() = prefs.getString(k("displayAddress"), "") ?: ""
        set(v) = prefs.edit().putString(k("displayAddress"), v).apply()

    /** 이미 보여 줬거나 알린 결정 id (백그라운드 알림 중복 방지) */
    var notifiedIds: Set<String>
        get() = prefs.getStringSet(k("notifiedIds"), emptySet()) ?: emptySet()
        set(v) = prefs.edit().putStringSet(k("notifiedIds"), v.toSet()).apply()

    /** 마지막으로 본 결재 대기 수 — PC 선택 목록의 배지 (현재 PC가 아닌 PC는 백그라운드 조회가 채운다) */
    var pendingCount: Int
        get() = prefs.getInt(k("pendingCount"), 0)
        set(v) = prefs.edit().putInt(k("pendingCount"), v).apply()

    /** 화면 엔진(웹)의 저장 공간이 어느 PC 것인가 — 출처가 PC마다 같아서, 다른 PC로 바뀌면 비운다 */
    var webStoragePc: String
        get() = prefs.getString("webStoragePc", "") ?: ""
        set(v) = prefs.edit().putString("webStoragePc", v).apply()

    /** 끊었지만 웹 저장소에서 글 삭제가 확인되지 않은 PC들 — 다음 실행 때 다시 지운다 */
    var pendingPurge: Set<String>
        get() = prefs.getStringSet("pendingPurge", emptySet())?.toSet() ?: emptySet()
        set(v) = prefs.edit().putStringSet("pendingPurge", v).apply()

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
            get() = prefs.getString(k("preferredRoute"), null)?.let { runCatching { Route.valueOf(it) }.getOrNull() }
            set(v) = prefs.edit().apply { if (v == null) remove(k("preferredRoute")) else putString(k("preferredRoute"), v.name) }.apply()
    }

    /** 이 PC의 값만 지운다 (다른 PC·앱 공통 값은 그대로) */
    fun clearPc() = clearPc(pcId)

    fun clearPc(id: String) {
        val prefix = PcBooks.key(id, "")
        val e = prefs.edit()
        prefs.all.keys.filter { it.startsWith(prefix) }.forEach { e.remove(it) }
        e.commit()
    }

    /**
     * 업데이트 전(1대 저장)의 PC 구분 없는 값을 이 PC 것으로 옮긴다. 이미 옮겼으면 아무 일도 하지 않는다 (여러 번 불러도 안전)
     * 옛 값은 새 값을 쓴 뒤에 지운다
     */
    fun migrateLegacy(id: String): Boolean {
        val legacy = prefs.all.filterKeys { it in LEGACY_KEYS }
        if (legacy.isEmpty()) return false
        val e = prefs.edit()
        for ((name, value) in legacy) {
            val key = PcBooks.key(id, name)
            if (!prefs.contains(key)) when (value) {
                is String -> e.putString(key, value)
                is Long -> e.putLong(key, value)
                is Boolean -> e.putBoolean(key, value)
                is Set<*> -> e.putStringSet(key, value.filterIsInstance<String>().toSet())
            }
        }
        if (webStoragePc.isEmpty()) e.putString("webStoragePc", id)
        e.commit()
        val cleanup = prefs.edit()
        legacy.keys.forEach { cleanup.remove(it) }
        cleanup.commit()
        return true
    }

    private companion object {
        val LEGACY_KEYS = setOf(
            "stopReason", "lockRetryAt", "lockNotifiedFor", "clockOffset", "lastSuccessAt", "v2Active",
            "serverVersion", "displayAddress", "notifiedIds", "preferredRoute",
        )
    }
}
