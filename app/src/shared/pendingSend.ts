// 휴대폰 '보내는 중' 말풍선 — 보낸 글이 PC 대화로 돌아오면 지운다 (scripts/pendingSend.test.mts)
// PC와 휴대폰 시계가 다를 수 있어 '보낸 시각' 대신 보낼 때 본 마지막 대화 id(afterId) 뒤에 온 글만 짝짓는다
import type { Attachment, ChatMessage, ChatSendMode } from './types.ts'
import { roomKey } from './chatUnread.ts'

export interface PendingSend {
  /** 화면 안에서만 쓰는 임시 id */
  tempId: string
  room: string | undefined
  text: string
  attachments: Attachment[]
  mode: ChatSendMode
  replyTo: number | undefined
  /** 보낼 때 이 방 대화의 마지막 id — 이보다 뒤에 온 글만 내 글로 본다 */
  afterId: number
  status: 'sending' | 'failed'
}

/** 대화에 돌아온 글과 짝지어진 임시 id들. 같은 글을 연달아 보냈으면 순서대로 하나씩만 짝짓는다 */
export function matchedPending(pending: readonly PendingSend[], chat: readonly ChatMessage[]): string[] {
  const used = new Set<number>()
  const out: string[] = []
  for (const p of pending) {
    if (p.status !== 'sending') continue
    const hit = chat.find((m) => m.id > p.afterId && !used.has(m.id) && m.from === 'me' && roomKey(m.room) === roomKey(p.room) && m.text.trim() === p.text)
    if (!hit) continue
    used.add(hit.id)
    out.push(p.tempId)
  }
  return out
}

/** 이 방 대화의 마지막 id (없으면 0) */
export const lastChatId = (chat: readonly ChatMessage[]) => chat.reduce((max, m) => Math.max(max, m.id), 0)
