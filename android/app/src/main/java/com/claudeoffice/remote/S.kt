// 화면 글자 꺼내기. 화면·알림·오류 문구가 모두 이걸 거쳐 현재 앱 언어의 strings.xml에서 나온다.
// 단위 테스트는 안드로이드 Context가 없으므로 provider를 바꿔 끼운다

package com.claudeoffice.remote

import android.content.Context
import androidx.annotation.StringRes

object S {
    @Volatile
    var provider: (Int, Array<out Any>) -> String = { _, _ -> "" }

    fun get(@StringRes id: Int, vararg args: Any): String = provider(id, args)

    /** 앱 언어가 적용된 Context로 갈아 끼운다 (시작할 때, 언어를 바꿀 때) */
    fun install(context: Context) {
        val ctx = Lang.wrap(context)
        provider = { id, args -> if (args.isEmpty()) ctx.getString(id) else ctx.getString(id, *args) }
    }
}
