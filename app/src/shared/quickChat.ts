import type { Staff } from './types'

// 빠른 대화: 직무 없는 간단한 일을 임시 직원 한 명과 주고받는 대화방 (docs/specs/quick-chat-design.md)
// 임시 직원은 고용 직원과 같은 구조(세션·결재·사용량)를 쓰지만 인원·책상·수당·회의·위임에서는 빠진다

type QuickLike = Pick<Staff, 'isPractice' | 'isQuick'>

/** 회사 인원으로 세는 직원인지 — 튜토리얼 연습 직원·빠른 대화 임시 직원이 아니면 true. 인원·책상·레벨·회의·위임·직원 목록은 이 함수로 거른다 */
export const countsAsStaff = (s: QuickLike): boolean => !s.isPractice && !s.isQuick

/** 빠른 대화 room 값 머리 — 팀 id(무작위 UUID)와 겹치지 않는다 */
export const QUICK_ROOM_PREFIX = 'quick:'

/** 임시 직원 id → 빠른 대화 room 값 */
export const quickRoomId = (staffId: string) => `${QUICK_ROOM_PREFIX}${staffId}`

/** 빠른 대화 room 값이면 임시 직원 id (아니면 null) */
export function quickStaffIdOf(room: string | null | undefined): string | null {
  if (!room?.startsWith(QUICK_ROOM_PREFIX)) return null
  return room.slice(QUICK_ROOM_PREFIX.length) || null
}

/** 빠른 대화 제목 최대 길이 — 첫 지시 앞부분 */
export const QUICK_TITLE_MAX = 30

/** 첫 지시에서 제목을 뽑는다: 첫 줄 앞부분, 길면 … */
export function quickTitleFrom(text: string): string {
  const line = text.trim().split('\n')[0]?.trim() ?? ''
  return line.length > QUICK_TITLE_MAX ? `${line.slice(0, QUICK_TITLE_MAX - 1)}…` : line
}

/** 빠른 대화 목록 순서: 진행 중 먼저, 그 안에서는 최근 것 먼저 (닫은 것은 닫은 시각, 진행 중은 시작 시각) */
export function sortQuickChats<S extends Pick<Staff, 'isQuick' | 'quickClosedAt' | 'hiredAt'>>(staff: S[]): S[] {
  return staff
    .filter((s) => s.isQuick)
    .sort((a, b) => Number(Boolean(a.quickClosedAt)) - Number(Boolean(b.quickClosedAt)) || (b.quickClosedAt ?? b.hiredAt) - (a.quickClosedAt ?? a.hiredAt))
}
