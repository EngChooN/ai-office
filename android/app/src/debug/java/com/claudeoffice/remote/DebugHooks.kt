// 디버그 빌드 전용: 에뮬레이터는 카메라로 QR을 찍기 어려워 adb로 QR 내용을 넣는다
//   adb shell am start -n com.claudeoffice.remote.debug/com.claudeoffice.remote.MainActivity --es qr '<QR JSON>'
// 넣은 값은 카메라로 읽은 값과 똑같이 parseQr → connect(지문 고정 포함)를 거친다. 릴리스 빌드에는 이 파일이 없다

package com.claudeoffice.remote

import android.content.Intent

object DebugHooks {
    fun qrFrom(intent: Intent): String? = intent.getStringExtra("qr")

    /**
     * PC 화면 모바일 빌드가 아직 없을 때 셸·브리지를 시험하는 페이지 (src/debug/assets/bridge-test/)
     *   adb shell am start -n com.claudeoffice.remote.debug/com.claudeoffice.remote.MainActivity --ez bridgeTest true
     */
    fun webEntryFrom(intent: Intent): com.claudeoffice.remote.web.WebEntry? =
        if (intent.getBooleanExtra("bridgeTest", false)) com.claudeoffice.remote.web.WebEntry("bridge-test", "index.html") else null
}
