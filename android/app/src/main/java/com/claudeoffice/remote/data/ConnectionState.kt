// "PC에 닿는가"의 바뀜과 셸 배너를 정하는 규칙 — 저장소·화면이 같이 쓰고 단위 테스트로 지킨다
// QA 1.1 버그: 웹 화면 모드에서 끊김을 켜기만 하고 끄지 않아 재연결 뒤에도 배너가 남았다

package com.claudeoffice.remote.data

import com.claudeoffice.remote.net.ApiError

/** 오류가 "닿지 않음"을 바꾸면 새 값, 아니면 null (인증·입력 오류 등은 연결 상태와 상관없다) */
fun reachFor(e: ApiError): Reach? = when (e) {
    ApiError.PhoneOffline -> Reach.PHONE_OFFLINE
    ApiError.RemoteOff -> Reach.REMOTE_OFF
    ApiError.Unreachable -> Reach.UNREACHABLE
    ApiError.ServerError -> Reach.SERVER_ERROR
    is ApiError.Unavailable -> Reach.UNAVAILABLE
    else -> null
}

/** 닿았다(조회·v2 호출 성공, 이벤트 스트림 열림) — 어떤 끊김 상태였든 풀린다 */
fun reachAfterSuccess(@Suppress("UNUSED_PARAMETER") current: Reach): Reach = Reach.OK

fun reachAfterError(current: Reach, e: ApiError): Reach = reachFor(e) ?: current

enum class ShellBanner { NONE, RECOVERED, PHONE_OFFLINE, UNREACHABLE, SERVER_ERROR, UNAVAILABLE, NEED_PC_UPDATE }

/**
 * 셸(네이티브)이 그릴 연결 배너. 하나만 보인다.
 * - 웹 화면(PC 화면 모바일 빌드) 모드: 화면이 connection 메시지로 자기 ConnectionBanner를 그리므로 셸은 그리지 않는다
 * - 네이티브 탭: 원격 꺼짐·응답 없음은 전체 상태 화면(A·B)이 대신하므로 배너가 아니다. 상세 화면에서만 배너
 */
fun shellBanner(s: OfficeState, isWebMode: Boolean, isDetail: Boolean): ShellBanner = when {
    isWebMode || s.gate != null -> ShellBanner.NONE
    s.justRecovered -> ShellBanner.RECOVERED
    isDetail && (s.reach == Reach.REMOTE_OFF || s.reach == Reach.UNREACHABLE) -> ShellBanner.UNREACHABLE
    s.reach == Reach.PHONE_OFFLINE -> ShellBanner.PHONE_OFFLINE
    s.reach == Reach.SERVER_ERROR -> ShellBanner.SERVER_ERROR
    s.reach == Reach.UNAVAILABLE -> ShellBanner.UNAVAILABLE
    !isDetail && s.v2 == V2Mode.NEED_PC_UPDATE -> ShellBanner.NEED_PC_UPDATE
    else -> ShellBanner.NONE
}
