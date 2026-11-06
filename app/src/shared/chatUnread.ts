import type { ChatMessage } from './types'
import { OFFICE_SENDER } from './mention.ts'

/**
 * 방마다 마지막으로 본 메시지 id. baseline = 처음 켰을 때의 마지막 id — 기록이 없는 방은 이 값부터 센다
 * (업데이트하자마자 지난 대화가 모두 '안 읽음'으로 뜨지 않게)
 */
export interface ChatSeen {
  baseline: number
  rooms: Record<string, number>
}

/** 방 키: 전체 방은 '' */
export const roomKey = (room: string | null | undefined) => room ?? ''

/** 안 읽은 것으로 세는 글: 직원이 쓴 글만 (내 글·앱 안내 줄은 빼고) */
const isCounted = (m: ChatMessage) => m.from !== 'me' && m.from !== OFFICE_SENDER

export const seenOf = (seen: ChatSeen, room: string | null | undefined) => seen.rooms[roomKey(room)] ?? seen.baseline

/** 방별 안 읽은 수 (0인 방은 빼고) */
export function unreadByRoom(chat: readonly ChatMessage[], seen: ChatSeen): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of chat) {
    if (!isCounted(m)) continue
    const key = roomKey(m.room)
    if (m.id <= seenOf(seen, key)) continue
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

/** 방에 들어갈 때의 '여기부터 새 메시지' 자리: 그 방에서 안 읽은 첫 글 id와 개수 (없으면 null) */
export function firstUnread(chat: readonly ChatMessage[], room: string | null | undefined, seenId: number): { id: number; count: number } | null {
  const key = roomKey(room)
  const list = chat.filter((m) => roomKey(m.room) === key && isCounted(m) && m.id > seenId)
  return list.length ? { id: list[0].id, count: list.length } : null
}

/** 다 읽음: 그 방의 마지막 글까지 (뒤로 가지 않는다) */
export function markSeen(seen: ChatSeen, room: string | null | undefined, lastId: number): ChatSeen {
  const key = roomKey(room)
  if (lastId <= seenOf(seen, key)) return seen
  return { ...seen, rooms: { ...seen.rooms, [key]: lastId } }
}

/** 결재·질문을 기다리는 말풍선이 있는 방 */
export function roomsWithPendingApproval(chat: readonly ChatMessage[], pendingIds: ReadonlySet<string>): Set<string> {
  return new Set(chat.filter((m) => m.approval && !m.approval.result && pendingIds.has(m.approval.id)).map((m) => roomKey(m.room)))
}
