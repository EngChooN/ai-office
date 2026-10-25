package com.claudeoffice.remote

import android.content.Intent

/** 릴리스: QR은 카메라로만 받는다 */
object DebugHooks {
    @Suppress("UNUSED_PARAMETER")
    fun qrFrom(intent: Intent): String? = null

    @Suppress("UNUSED_PARAMETER")
    fun webEntryFrom(intent: Intent): com.claudeoffice.remote.web.WebEntry? = null
}
