// 빠른 대화(임시 직원): 휴대폰 v2 화면에는 보이지만(시작·대화·닫기·삭제), 옛 v1 상태 응답의 직원 목록에서는 계속 뺀다
// 인원·책상·수당에서 빠지는 것은 shared/quickChat.ts의 countsAsStaff가 앱 화면과 같이 처리한다

import type { Staff } from '../../shared/types'

/** v1 상태 응답(옛 안드로이드 직원 목록)에 보여 줄 직원인지 — 빠른 대화 임시 직원이 아니면 true */
export const isRemoteVisibleStaff = (s: Pick<Staff, 'isQuick'>) => !s.isQuick
