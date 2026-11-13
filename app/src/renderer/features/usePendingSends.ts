import { useCallback, useEffect, useRef, useState } from 'react'
import { useOffice } from '@/store'
import { IS_REMOTE_SCREEN } from '@/shell'
import { lastChatId, matchedPending, type PendingSend } from '@shared/pendingSend'

/** 보낸 글이 대화에 안 돌아와도 이 시간 뒤엔 '보내는 중'을 치운다 (보내기는 성공했는데 글이 다르게 저장된 경우 등) */
const SETTLE_MS = 10_000

export type SendInput = Pick<PendingSend, 'room' | 'text' | 'attachments' | 'mode' | 'replyTo'>

/** 휴대폰·원격 화면의 '보내는 중' 말풍선 상태 — PC 대화 목록에 돌아올 때까지 내 글을 맨 아래에 덧그린다.
 * store가 아니라 ChatPage 로컬 상태 (대화 데이터와 섞이지 않게). 같은 PC 창은 PC가 바로 그려 주므로 쓰지 않고 그대로 보낸다 */
export function usePendingSends() {
  const [items, setItems] = useState<PendingSend[]>([])
  const chat = useOffice((s) => s.chat)
  const seq = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useEffect(() => {
    const ids = matchedPending(items, chat)
    if (ids.length) setItems((cur) => cur.filter((p) => !ids.includes(p.tempId)))
  }, [chat, items])

  const run = useCallback(async (p: PendingSend) => {
    let isOk: boolean
    try {
      isOk = (await window.office.sendChat(p.text, p.attachments, p.room, p.mode, p.replyTo)) !== (false as unknown)
    } catch {
      isOk = false
    }
    if (!isOk) return setItems((cur) => cur.map((x) => (x.tempId === p.tempId ? { ...x, status: 'failed' } : x)))
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      setItems((cur) => cur.filter((x) => x.tempId !== p.tempId))
    }, SETTLE_MS)
    timers.current.add(timer)
  }, [])

  const send = useCallback(
    (input: SendInput) => {
      if (!IS_REMOTE_SCREEN) return void window.office.sendChat(input.text, input.attachments, input.room, input.mode, input.replyTo)
      const p: PendingSend = { ...input, tempId: `pending-${++seq.current}`, afterId: lastChatId(useOffice.getState().chat), status: 'sending' }
      setItems((cur) => [...cur, p])
      void run(p)
    },
    [run],
  )

  const retry = useCallback(
    (tempId: string) => {
      const p = items.find((x) => x.tempId === tempId && x.status === 'failed')
      if (!p) return
      const again: PendingSend = { ...p, afterId: lastChatId(useOffice.getState().chat), status: 'sending' }
      setItems((cur) => cur.map((x) => (x.tempId === tempId ? again : x)))
      void run(again)
    },
    [items, run],
  )

  return { items, send, retry }
}
