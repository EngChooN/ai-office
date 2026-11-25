import { useEffect } from 'react'
import { create } from 'zustand'
import { useOffice } from '@/store'
import { IS_REMOTE_SCREEN } from '@/shell'
import { lastChatId, matchedPending, type PendingSend } from '@shared/pendingSend'

/** 보낸 글이 대화에 안 돌아와도 이 시간 뒤엔 '보내는 중'을 치운다 (보내기는 성공했는데 글이 다르게 저장된 경우 등) */
const SETTLE_MS = 10_000

export type SendInput = Pick<PendingSend, 'room' | 'text' | 'attachments' | 'mode' | 'replyTo'>

/** 휴대폰·원격 화면의 '보내는 중' 말풍선 — PC 대화 목록에 돌아올 때까지 내 글을 맨 아래에 덧그린다.
 * 대화 데이터(store)와 섞지 않고 따로 들고 있다. 대화 페이지 밖에 두어, 보내는 중·실패한 뒤 다른 페이지에 갔다 와도 말풍선과 '다시 보내기'가 남는다.
 * 같은 PC 창은 PC가 바로 그려 주므로 쓰지 않고 그대로 보낸다 */
const usePending = create<PendingSend[]>(() => [])
const setPending = (fn: (cur: PendingSend[]) => PendingSend[]) => usePending.setState((cur) => fn(cur), true)
let seq = 0

async function run(p: PendingSend) {
  let isOk: boolean
  try {
    isOk = (await window.office.sendChat(p.text, p.attachments, p.room, p.mode, p.replyTo)) !== (false as unknown)
  } catch {
    isOk = false
  }
  if (!isOk) return setPending((cur) => cur.map((x) => (x.tempId === p.tempId ? { ...x, status: 'failed' } : x)))
  setTimeout(() => setPending((cur) => cur.filter((x) => x.tempId !== p.tempId)), SETTLE_MS)
}

/** 보냈으면 true. PC 창은 실패하면 false (입력창이 쓴 글을 되돌린다) · 휴대폰·원격은 실패해도 '다시 보내기' 말풍선으로 남으니 true */
export async function sendPending(input: SendInput, isRemote = IS_REMOTE_SCREEN): Promise<boolean> {
  if (!isRemote) {
    try {
      return (await window.office.sendChat(input.text, input.attachments, input.room, input.mode, input.replyTo)) !== (false as unknown)
    } catch {
      return false
    }
  }
  const p: PendingSend = { ...input, tempId: `pending-${++seq}`, afterId: lastChatId(useOffice.getState().chat), status: 'sending' }
  setPending((cur) => [...cur, p])
  void run(p)
  return true
}

export function retryPending(tempId: string) {
  const p = usePending.getState().find((x) => x.tempId === tempId && x.status === 'failed')
  if (!p) return
  const again: PendingSend = { ...p, afterId: lastChatId(useOffice.getState().chat), status: 'sending' }
  setPending((cur) => cur.map((x) => (x.tempId === tempId ? again : x)))
  void run(again)
}

export function usePendingSends() {
  const items = usePending()
  const chat = useOffice((s) => s.chat)
  useEffect(() => {
    const ids = matchedPending(items, chat)
    if (ids.length) setPending((cur) => cur.filter((p) => !ids.includes(p.tempId)))
  }, [chat, items])
  return { items, send: sendPending, retry: retryPending }
}
