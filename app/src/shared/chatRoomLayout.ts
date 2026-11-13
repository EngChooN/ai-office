// 데스크톱 단체방의 왼쪽 방 목록 모양(목록 / 56px 띠)과 상단 직원 줄 요약 — 화면 없이 시험할 수 있게 순수 함수로 둔다
import type { Staff } from './types.ts'
import { isAwaitingTeam } from './delegation.ts'

/** 사람이 고른 방 목록 모양: 자동(폭에 따라) / 펼친 채 고정 / 직접 접음 */
export type RoomListPref = 'auto' | 'open' | 'rail'
export type RoomListMode = 'list' | 'rail'

/** 펼친 방 목록 폭 */
export const ROOM_LIST_WIDTH = 200
/** 접힌 띠 폭 */
export const ROOM_RAIL_WIDTH = 56
/** 대화 칸이 이보다 좁아지면 방 목록을 띠로 접는다 */
export const CHAT_MIN_WIDTH = 640
/** 다시 펼 때 더 두는 여유 — 경계에서 1~2px 흔들려도 깜빡이지 않게 */
export const ROOM_LIST_SLACK = 16
/** 대화 칸이 이보다 좁으면 상단 직원 칩 대신 얼굴 겹침 */
export const CHIP_MIN_WIDTH = 560

/**
 * 방 목록 모양. rowWidth는 '방 목록 + 대화' 행 전체 폭 — 목록이 접혀도 이 값은 그대로라 접고 펴는 되먹임이 없다.
 * 사람이 고른 고정·직접 접음이 자동보다 우선. 자동일 때는 840 미만이면 띠, 띠에서 다시 펴려면 856 이상
 */
export function roomListMode(rowWidth: number, pref: RoomListPref, prev: RoomListMode): RoomListMode {
  if (pref === 'open') return 'list'
  if (pref === 'rail') return 'rail'
  const threshold = CHAT_MIN_WIDTH + ROOM_LIST_WIDTH + (prev === 'rail' ? ROOM_LIST_SLACK : 0)
  return rowWidth < threshold ? 'rail' : 'list'
}

/** 대화 칸 폭 = 행 폭 − 방 목록(또는 띠) 폭 */
export const chatWidthOf = (rowWidth: number, mode: RoomListMode) => rowWidth - (mode === 'list' ? ROOM_LIST_WIDTH : ROOM_RAIL_WIDTH)

/** 상단 직원 줄의 'N명 · M명 일하는 중' — people은 이미 방 규칙대로 거른 사람(전체 방은 일하는 중·확인 필요·오류만) */
export function summarizeRoomPeople(people: readonly Pick<Staff, 'status' | 'awaitingTeam'>[]) {
  // 팀원 일을 기다리는 리더도 일하는 중으로 센다 (대시보드 요약과 같은 기준)
  return { total: people.length, working: people.filter((p) => p.status === 'working' || isAwaitingTeam(p)).length }
}

/** 띠 아이콘의 머리 글자: 영문 대문자 2자로 시작하면 2자(PO·QA), 아니면 첫 글자 1자 */
export function roomInitial(name: string): string {
  const trimmed = name.trim()
  if (/^[A-Z]{2}/.test(trimmed)) return trimmed.slice(0, 2)
  return Array.from(trimmed)[0] ?? ''
}

/** 방 목록 ↑↓ 키: 다음에 초점을 줄 칸 (끝에서 멈추고 돌지 않는다). 그 밖의 키·빈 목록은 null */
export function nextFocusIndex(index: number, length: number, key: string): number | null {
  if (length <= 0) return null
  if (key === 'ArrowDown') return Math.min(index < 0 ? 0 : index + 1, length - 1)
  if (key === 'ArrowUp') return Math.max(index < 0 ? 0 : index - 1, 0)
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  return null
}
