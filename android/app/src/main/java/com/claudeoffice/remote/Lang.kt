// 앱 언어: 기본은 기기 언어를 따르고(ko·en·ja·zh), 지원하지 않는 기기 언어면 영어. 앱 안에서 고른 값은 따로 저장한다.
// AppPrefs.clear()(연결 끊기)에 지워지지 않도록 별도 파일에 둔다

package com.claudeoffice.remote

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import java.util.Locale

object Lang {
    const val AUTO = "auto"
    val CODES = listOf(AUTO, "ko", "en", "ja", "zh")

    private const val FILE = "lang"
    private const val KEY = "language"

    fun saved(context: Context): String =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, AUTO)?.takeIf { it in CODES } ?: AUTO

    /** 기기 언어(또는 고른 언어)를 지원 언어로 */
    fun resolve(pref: String, device: Locale): Locale = when (if (pref == AUTO) device.language else pref) {
        "ko" -> Locale.KOREAN
        "ja" -> Locale.JAPANESE
        "zh" -> Locale.SIMPLIFIED_CHINESE
        else -> Locale.ENGLISH
    }

    /** 이 Context의 글자·날짜가 앱 언어로 나오게 감싼다 */
    fun wrap(base: Context): Context {
        val locale = resolve(saved(base), device())
        val config = Configuration(base.resources.configuration)
        config.setLocale(locale)
        config.setLocales(android.os.LocaleList(locale))
        return base.createConfigurationContext(config)
    }

    private fun device(): Locale = android.content.res.Resources.getSystem().configuration.locales.get(0) ?: Locale.ENGLISH

    fun current(context: Context): Locale = resolve(saved(context), device())

    /** 저장하고 바로 적용 — 앱을 다시 켜지 않아도 화면이 새 언어로 다시 그려진다 */
    fun set(activity: Activity, code: String) {
        activity.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(KEY, code).apply()
        S.install(activity.applicationContext)
        activity.recreate()
    }
}
