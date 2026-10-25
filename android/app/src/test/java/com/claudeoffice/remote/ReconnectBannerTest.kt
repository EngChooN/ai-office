package com.claudeoffice.remote

import com.claudeoffice.remote.data.Gate
import com.claudeoffice.remote.data.OfficeState
import com.claudeoffice.remote.data.Reach
import com.claudeoffice.remote.data.ShellBanner
import com.claudeoffice.remote.data.V2Mode
import com.claudeoffice.remote.data.reachAfterError
import com.claudeoffice.remote.data.reachAfterSuccess
import com.claudeoffice.remote.data.shellBanner
import com.claudeoffice.remote.net.ApiError
import org.junit.Assert.assertEquals
import org.junit.Test

/** QA 1.1 1-1: 끊김 → 재연결 → 배너 사라짐. 셸 배너와 화면 배너가 겹치지 않음 */
class ReconnectBannerTest {
    private val connected = OfficeState(gate = null, reach = Reach.OK, v2 = V2Mode.ACTIVE)

    @Test fun disconnectThenReconnectClearsTheBanner() {
        // 끊김: PC 원격 꺼짐(연결 거부)
        val down = connected.copy(reach = reachAfterError(connected.reach, ApiError.RemoteOff))
        assertEquals(Reach.REMOTE_OFF, down.reach)
        assertEquals(ShellBanner.UNREACHABLE, shellBanner(down, isWebMode = false, isDetail = true))
        // 재연결: 스트림 열림(hello) 또는 call 성공
        val up = down.copy(reach = reachAfterSuccess(down.reach))
        assertEquals(Reach.OK, up.reach)
        assertEquals(ShellBanner.NONE, shellBanner(up, isWebMode = false, isDetail = true))
    }

    @Test fun everyKindOfOutageIsClearedByOneSuccess() {
        listOf(ApiError.PhoneOffline, ApiError.RemoteOff, ApiError.Unreachable, ApiError.ServerError, ApiError.Unavailable(5)).forEach { e ->
            val down = reachAfterError(Reach.OK, e)
            assertEquals(e.toString(), Reach.OK, reachAfterSuccess(down))
        }
    }

    @Test fun nonConnectionErrorsDoNotTouchTheState() {
        // 입력·결정 오류는 연결 상태를 바꾸지 않는다 (끊긴 상태를 잘못 풀지도, 잘못 켜지도 않게)
        assertEquals(Reach.REMOTE_OFF, reachAfterError(Reach.REMOTE_OFF, ApiError.AlreadyDecided))
        assertEquals(Reach.OK, reachAfterError(Reach.OK, ApiError.Remote(422, "pc_only", "", null)))
    }

    @Test fun webModeNeverDrawsAShellBanner() {
        // 웹 화면은 connection 메시지로 자기 ConnectionBanner를 그린다 — 셸까지 그리면 두 개가 겹친다
        Reach.entries.forEach { r ->
            assertEquals(r.toString(), ShellBanner.NONE, shellBanner(connected.copy(reach = r), isWebMode = true, isDetail = true))
        }
        assertEquals(ShellBanner.NONE, shellBanner(connected.copy(reach = Reach.OK, justRecovered = true), isWebMode = true, isDetail = false))
    }

    @Test fun blockedStatesUseTheirOwnScreenNotABanner() {
        assertEquals(ShellBanner.NONE, shellBanner(connected.copy(gate = Gate.Revoked, reach = Reach.REMOTE_OFF), isWebMode = false, isDetail = true))
    }
}
