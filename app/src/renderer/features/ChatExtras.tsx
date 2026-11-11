// 대화방 메신저 기능 부품: 처리 상태 줄 · 답장 인용 · 보고 빠른 버튼 · 기획안 카드 · 예약 보내기 · 대화 찾기
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDownIcon, ChevronUpIcon, CopyIcon, ReplyIcon, SearchIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { fmtDate, t } from '@shared/i18n'
import { findRoom } from '@shared/chatRooms'
import type { ChatDelivery, ChatMessage, ChatReservation, ChatReservationInput, ChatSearchHit, Staff } from '@shared/types'
import { DuoIcon, IconText } from '@/components/duo-icon'

const TIME_FMT: Intl.DateTimeFormatOptions = { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }

/** 말풍선으로 가기: 화면에 없으면(예전 대화) 앞뒤 대화를 불러와 끼운 뒤 간다 */
export async function goToMessage(id: number, room?: string | null) {
  const st = useOffice.getState()
  if (room !== undefined && (st.chatRoom ?? null) !== (room ?? null)) st.openChatRoom(room ?? null)
  if (!st.chat.some((m) => m.id === id)) st.mergeChat(await window.office.chatAround(id))
  useOffice.getState().focusChat(id)
}

// ── 1. 처리 상태 ─────────────────────────────────────────

type ShownState = 'received' | 'queued' | 'working' | 'approval' | 'waiting' | 'done' | 'error' | 'stopped' | 'canceled'

/** 저장된 상태(받음·대기·완료…)에 직원의 지금 상태를 겹쳐 본다: 받은 지시를 지금 하는 중이면 '작업 중'·'결재 대기' */
function shownState(d: ChatDelivery, chatId: number, s: Staff | undefined): ShownState {
  if (d.state !== 'received' || !s?.progress) return d.state
  if (s.progress.chatId === chatId) return s.progress.state === 'approval' || s.status === 'waiting' ? 'approval' : s.status === 'working' ? 'working' : 'received'
  return s.progress.chatIds?.includes(chatId) ? 'queued' : 'received'
}

const STATE_KEY = {
  received: 'chat.delivery.received',
  queued: 'chat.delivery.queued',
  working: 'chat.delivery.working',
  approval: 'chat.delivery.approval',
  waiting: 'chat.delivery.waiting',
  done: 'chat.delivery.done',
  error: 'chat.delivery.error',
  stopped: 'chat.delivery.stopped',
  canceled: 'chat.delivery.canceled',
} as const

function StateMark({ state }: { state: ShownState }) {
  if (state === 'done') return <DuoIcon name="done" size={12} className="text-status-working" />
  if (state === 'received') return <DuoIcon name="done" size={12} className="text-status-working/70" />
  if (state === 'error') return <DuoIcon name="warn" size={12} className="text-status-error" />
  const color = state === 'working' ? 'bg-status-working animate-pulse' : state === 'approval' || state === 'waiting' || state === 'queued' ? 'bg-status-waiting' : 'bg-muted-foreground'
  return <span className={cn('inline-block size-1.5 shrink-0 rounded-full', color)} />
}

/** 내 메시지 아래: 받은 직원마다 어디까지 갔는지. 여러 명이면 묶어 보여 주고 누르면 펼친다 */
export function DeliveryLine({ message: m }: { message: ChatMessage }) {
  const staff = useOffice((s) => s.staff)
  const tasks = useOffice((s) => s.tasks)
  const [isOpen, setIsOpen] = useState(false)
  const list = m.deliveries ?? []
  if (list.length === 0) return null
  const rows = list.map((d) => {
    const s = staff.find((x) => x.id === d.staffId)
    return { d, s, name: s?.name ?? t('common.formerStaff'), state: shownState(d, m.id, s) }
  })
  const cardId = list.find((d) => d.taskId && tasks.some((x) => x.id === d.taskId))?.taskId
  const card = cardId ? tasks.find((x) => x.id === cardId) : undefined
  const cardLink = card && (
    <button type="button" onClick={() => useOffice.getState().setView('board')} title={t('chat.delivery.cardTitle')} className="hover:text-foreground max-w-48 truncate underline-offset-2 hover:underline">
      <DuoIcon name="meeting" size={14} className="mr-1" />{card.title}
    </button>
  )
  if (rows.length === 1) return <div className="text-muted-foreground flex flex-wrap items-center justify-end gap-x-2 text-[11px]"><DeliveryRow row={rows[0]} m={m} />{cardLink}</div>
  const count = (states: ShownState[]) => rows.filter((r) => states.includes(r.state)).length
  const done = count(['done'])
  const working = count(['working'])
  const waiting = count(['queued', 'waiting', 'received'])
  const attention = count(['approval', 'error'])
  return (
    <div className="text-muted-foreground flex flex-col items-end gap-0.5 text-[11px]">
      <button type="button" aria-expanded={isOpen} onClick={() => setIsOpen((v) => !v)} className="hover:text-foreground flex flex-wrap items-center justify-end gap-x-2">
        <span className="flex items-center gap-1"><DuoIcon name="done" size={12} className="text-status-working" />{t('chat.delivery.summaryDone', { total: rows.length, count: done })}</span>
        {working > 0 && <span className="flex items-center gap-1"><StateMark state="working" />{t('chat.delivery.summaryWorking', { count: working })}</span>}
        {waiting > 0 && <span className="flex items-center gap-1"><StateMark state="waiting" />{t('chat.delivery.summaryWaiting', { count: waiting })}</span>}
        {attention > 0 && <span className="text-status-waiting flex items-center gap-1">{t('chat.delivery.summaryAttention', { count: attention })}</span>}
        <ChevronDownIcon className={cn('size-3 transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && rows.map((r) => <DeliveryRow key={r.d.staffId} row={r} m={m} />)}
      {cardLink}
    </div>
  )
}

function DeliveryRow({ row, m }: { row: { d: ChatDelivery; s: Staff | undefined; name: string; state: ShownState }; m: ChatMessage }) {
  const { d, s, name, state } = row
  const minutes = state === 'working' && s ? Math.floor((Date.now() - s.statusSince) / 60_000) : 0
  const link = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="text-primary underline-offset-2 hover:underline">
      {label}
    </button>
  )
  return (
    <span className={cn('flex items-center gap-1', state === 'error' && 'text-status-error', state === 'approval' && 'text-status-waiting')}>
      <StateMark state={state} />
      {t(STATE_KEY[state], { name })}
      {minutes > 0 && <span>· {t('chat.delivery.minutes', { count: minutes })}</span>}
      {state === 'done' && d.reportId && link(t('chat.delivery.viewReport'), () => void goToMessage(d.reportId!))}
      {state === 'approval' && s && link(t('chat.delivery.approve'), () => useOffice.getState().select(s.id))}
      {(state === 'error' || state === 'stopped') && link(t('chat.delivery.retry'), () => useOffice.getState().setChatDraft(m.text))}
    </span>
  )
}

// ── 2. 답장 ──────────────────────────────────────────────

export const senderName = (from: string, staff: readonly Staff[]) => (from === 'me' ? t('chat.reply.me') : (staff.find((s) => s.id === from)?.name ?? t('common.formerStaff')))

/** 말풍선 위 인용: 누르면 원래 메시지로 */
export function ReplyQuote({ reply, isMe }: { reply: NonNullable<ChatMessage['replyTo']>; isMe: boolean }) {
  const staff = useOffice((s) => s.staff)
  return (
    <button
      type="button"
      onClick={() => void goToMessage(reply.id)}
      title={t('chat.reply.jump')}
      className={cn('mb-1 block w-full truncate rounded-md border-l-[3px] px-2 py-0.5 text-left text-[11px]', isMe ? 'border-primary-foreground/60 bg-primary-foreground/15' : 'border-primary bg-muted text-muted-foreground')}
    >
      ↩ {senderName(reply.from, staff)} · {reply.text}
    </button>
  )
}

/** 말풍선에 마우스를 올리면 뜨는 작은 메뉴: 답장 · 복사 */
export function BubbleMenu({ message: m, isMe }: { message: ChatMessage; isMe: boolean }) {
  const [isCopied, setIsCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(m.text).then(() => {
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 1200)
    })
  }
  return (
    <div className={cn('bg-popover absolute -top-3 z-10 hidden gap-0.5 rounded-md border p-0.5 shadow-md group-hover:flex group-focus-within:flex', isMe ? 'left-0 -translate-x-2' : 'right-0 translate-x-2')}>
      <button type="button" onClick={() => useOffice.getState().setChatReply({ id: m.id, mode: 'reply' })} className="hover:bg-accent text-foreground flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]">
        <ReplyIcon className="size-3" /> {t('chat.reply.action')}
      </button>
      <button type="button" onClick={copy} className="hover:bg-accent text-foreground flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]">
        <CopyIcon className="size-3" /> {isCopied ? t('chat.copied') : t('chat.copy')}
      </button>
    </div>
  )
}

/** 입력칸 위 답장 줄 */
export function ReplyBar({ reply, onCancel }: { reply: { id: number; mode: 'reply' | 'redo' }; onCancel: () => void }) {
  const staff = useOffice((s) => s.staff)
  const m = useOffice((s) => s.chat.find((x) => x.id === reply.id))
  if (!m) return null
  const name = senderName(m.from, staff)
  return (
    <div className="border-primary bg-muted mb-2 flex items-center gap-2 rounded-md border-l-[3px] px-2 py-1 text-xs">
      <ReplyIcon className="text-primary size-3.5 shrink-0" />
      <span className="shrink-0 font-medium">{t(reply.mode === 'redo' ? 'chat.reply.redoTo' : 'chat.reply.to', { name })}</span>
      <span className="text-muted-foreground min-w-0 truncate">· {m.text.replace(/\s+/g, ' ')}</span>
      <button type="button" onClick={onCancel} aria-label={t('chat.reply.cancel')} className="text-muted-foreground hover:text-foreground ml-auto shrink-0">
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}

// ── 3. 완료 보고 빠른 버튼 ───────────────────────────────

export function ReportActions({ message: m }: { message: ChatMessage }) {
  const hasCard = useOffice((s) => Boolean(m.taskId && s.tasks.some((x) => x.id === m.taskId)))
  const chip = 'bg-background hover:bg-accent rounded-full border px-2.5 py-0.5 text-[11px]'
  if (m.reaction?.kind === 'like')
    return (
      <div className="mt-1 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => void window.office.reactChat(m.id, 'none')} title={t('chat.quick.unlike')} className={cn(chip, 'border-status-working/50 text-status-working')}>
          <IconText text={t('chat.quick.liked', { time: fmtDate(m.reaction.at, { hour: '2-digit', minute: '2-digit' }) })} size={13} />
        </button>
        {hasCard && <CardChip className={chip} />}
      </div>
    )
  const redo = () => {
    const st = useOffice.getState()
    st.setChatReply({ id: m.id, mode: 'redo' })
    st.setChatDraft(t('chat.quick.redoPrefix'))
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      <button type="button" onClick={() => void window.office.reactChat(m.id, 'like')} title={t('chat.quick.likeTitle')} className={chip}>
        <IconText text={t('chat.quick.like')} size={13} />
      </button>
      <button type="button" onClick={redo} className={chip}>
        <IconText text={t('chat.quick.redo')} size={13} />
      </button>
      <button type="button" onClick={() => void window.office.sendChat(t('chat.quick.moreText'), [], m.room, 'wait', m.id)} className={chip}>
        {t('chat.quick.more')}
      </button>
      {hasCard && <CardChip className={chip} />}
    </div>
  )
}

function CardChip({ className }: { className: string }) {
  return (
    <button type="button" onClick={() => useOffice.getState().setView('board')} title={t('chat.delivery.cardTitle')} className={className}>
      <IconText text={t('chat.quick.openCard')} size={13} />
    </button>
  )
}

// ── 기획안 확인 카드 ─────────────────────────────────────

const NAMES_SHOWN = 3

export function PlanNotice({ plan }: { plan: NonNullable<ChatMessage['plan']> }) {
  const task = useOffice((s) => s.tasks.find((x) => x.id === plan.taskId))
  const cur = task?.plan
  const status = !cur ? 'closed' : cur.proposedAt !== plan.proposedAt ? 'replaced' : cur.status === 'waiting' ? 'waiting' : cur.status === 'approved' ? 'approved' : 'revise'
  const isWaiting = status === 'waiting'
  const names = [...new Set((cur && cur.proposedAt === plan.proposedAt ? cur.subtasks : []).map((st) => st.assigneeName).filter(Boolean))]
  const namesText = names.length > NAMES_SHOWN ? t('chat.plan.namesMore', { names: names.slice(0, NAMES_SHOWN).join(', '), count: names.length - NAMES_SHOWN }) : names.join(', ')
  const pill = { waiting: 'bg-status-waiting/20 text-status-waiting', approved: 'bg-status-working/15 text-status-working', revise: 'bg-muted text-muted-foreground', replaced: 'bg-muted text-muted-foreground', closed: 'bg-muted text-muted-foreground' }[status]
  return (
    <div className={cn('bg-card mt-1 flex w-80 max-w-full flex-col gap-1.5 rounded-xl border p-3', isWaiting && 'border-primary/50')}>
      <div className="text-primary flex items-center gap-1.5 text-[11px] font-bold">
        <IconText text={t(isWaiting ? 'chat.plan.title' : 'chat.plan.titleDone')} size={16} />
        <span className={cn('rounded-full px-2 text-[10px]', pill)}>{t(`chat.plan.${status}`)}</span>
      </div>
      <div className="text-sm font-semibold break-words">{task?.title ?? ''}</div>
      {names.length > 0 && <div className="text-muted-foreground text-[11px]">{t('chat.plan.meta', { count: cur?.subtasks.length ?? 0, names: namesText })}</div>}
      {status === 'revise' && cur?.feedback && <div className="text-muted-foreground text-[11px] break-words">{t('chat.plan.feedback', { text: cur.feedback })}</div>}
      {isWaiting && (
        <Button size="sm" className="mt-0.5 w-fit" onClick={() => useOffice.getState().openPlanInInbox(plan.taskId)}>
          {t('chat.plan.open')}
        </Button>
      )}
      {status === 'approved' && (
        <button type="button" onClick={() => useOffice.getState().setView('board')} className="text-primary w-fit text-[11px] underline-offset-2 hover:underline">
          {t('chat.plan.board')}
        </button>
      )}
    </div>
  )
}

// ── 6. 예약·반복 보내기 ──────────────────────────────────

const at = (base: Date, dayOffset: number, hour: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hour, 0).getTime()
const nextMonday9 = (now: Date) => at(now, ((8 - now.getDay()) % 7) || 7, 9)
const dayNames = () => t('chat.reserve.dayNames').split(',')

export function repeatLabel(r: Pick<ChatReservation, 'weekdays' | 'time'>) {
  const days = [...(r.weekdays ?? [])].sort()
  const label = days.length === 7 ? t('chat.reserve.everyDay') : days.join(',') === '1,2,3,4,5' ? t('chat.reserve.weekdays') : t('chat.reserve.every', { days: days.map((d) => dayNames()[d]).join('·') })
  return t('chat.reserve.repeatWhen', { days: label, time: r.time ?? '' })
}

type ReservePick = { kind: 'once'; at: number } | { kind: 'repeat'; time: string; weekdays: number[] }

/** 보내기 옆 ▾ 메뉴: 지금 보내기 · 예약 시각 버튼 · 반복 버튼 · 직접 고르기 */
export function ReserveMenu({ onPick, onSendNow, onClose }: { onPick: (p: ReservePick) => void; onSendNow: () => void; onClose: () => void }) {
  const now = new Date()
  const [custom, setCustom] = useState<'once' | 'repeat' | null>(null)
  const [when, setWhen] = useState(() => {
    const d = new Date(at(now, 1, 9))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T09:00`
  })
  const [time, setTime] = useState('09:00')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const pill = 'hover:bg-accent rounded-full border px-2 py-0.5 text-[11px]'
  const today18 = at(now, 0, 18)
  const save = () => {
    if (custom === 'once') {
      const ms = new Date(when).getTime()
      if (!Number.isFinite(ms) || ms <= Date.now()) return setError(t('chat.reserve.past'))
      return onPick({ kind: 'once', at: ms })
    }
    if (days.length === 0) return setError(t('chat.reserve.noDays'))
    onPick({ kind: 'repeat', time, weekdays: days })
  }
  return (
    <div ref={ref} role="menu" className="bg-popover absolute right-4 bottom-full z-20 mb-1 flex w-72 flex-col gap-1 rounded-lg border p-1.5 text-sm shadow-lg">
      <button type="button" onClick={onSendNow} className="hover:bg-accent flex justify-between rounded px-2 py-1 text-left">
        <span>➤ {t('chat.reserve.sendNow')}</span>
        <span className="text-muted-foreground text-[11px]">Enter</span>
      </button>
      <span className="text-muted-foreground px-2 pt-1 text-[10px]"><IconText text={t('chat.reserve.onceGroup')} size={11} /></span>
      <div className="flex flex-wrap gap-1 px-2 pb-1">
        {today18 > Date.now() && (
          <button type="button" className={pill} onClick={() => onPick({ kind: 'once', at: today18 })}>
            {t('chat.reserve.today18')}
          </button>
        )}
        <button type="button" className={pill} onClick={() => onPick({ kind: 'once', at: at(now, 1, 9) })}>
          {t('chat.reserve.tomorrow9')}
        </button>
        <button type="button" className={pill} onClick={() => onPick({ kind: 'once', at: nextMonday9(now) })}>
          {t('chat.reserve.monday9')}
        </button>
        <button type="button" className={cn(pill, custom === 'once' && 'bg-accent')} onClick={() => setCustom('once')}>
          {t('chat.reserve.custom')}
        </button>
      </div>
      <span className="text-muted-foreground px-2 text-[10px]"><IconText text={t('chat.reserve.repeatGroup')} size={11} /></span>
      <div className="flex flex-wrap gap-1 px-2 pb-1">
        <button type="button" className={pill} onClick={() => onPick({ kind: 'repeat', time: '09:00', weekdays: [0, 1, 2, 3, 4, 5, 6] })}>
          {t('chat.reserve.daily9')}
        </button>
        <button type="button" className={pill} onClick={() => onPick({ kind: 'repeat', time: '09:00', weekdays: [1, 2, 3, 4, 5] })}>
          {t('chat.reserve.weekdays9')}
        </button>
        <button type="button" className={pill} onClick={() => onPick({ kind: 'repeat', time: '09:00', weekdays: [1] })}>
          {t('chat.reserve.monday9Weekly')}
        </button>
        <button type="button" className={cn(pill, custom === 'repeat' && 'bg-accent')} onClick={() => setCustom('repeat')}>
          {t('chat.reserve.customRepeat')}
        </button>
      </div>
      {custom && (
        <div className="flex flex-col gap-2 border-t px-2 pt-2 pb-1">
          <span className="text-xs font-medium">{t(custom === 'once' ? 'chat.reserve.pickTitle' : 'chat.reserve.repeatTitle')}</span>
          {custom === 'once' ? (
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="bg-background rounded-md border px-2 py-1 text-xs" />
          ) : (
            <>
              <div className="flex gap-1">
                {dayNames().map((name, d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={days.includes(d)}
                    onClick={() => setDays((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d]))}
                    className={cn('size-7 rounded-full border text-[11px]', days.includes(d) && 'bg-primary text-primary-foreground border-primary')}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="bg-background w-28 rounded-md border px-2 py-1 text-xs" />
            </>
          )}
          {error && <span className="text-status-error text-[11px]">{error}</span>}
          <div className="flex gap-1">
            <Button size="sm" className="h-7 text-xs" onClick={save}>
              {t('chat.reserve.save')}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCustom(null)}>
              {t('chat.reserve.close')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function reservationInput(pick: ReservePick, text: string, room: string | null, attachments: ChatReservationInput['attachments']): ChatReservationInput {
  return { id: crypto.randomUUID(), text, room, enabled: true, ...(attachments?.length ? { attachments } : {}), ...pick }
}

/** 입력칸 위: 이 방의 예약·반복 카드 (놓친 예약은 보낼지 묻는다) */
export function ReservationCards({ room }: { room: string | undefined }) {
  const list = useOffice((s) => s.chatReservations)
  const items = useMemo(() => (list ?? []).filter((r) => (r.room ?? null) === (room ?? null)), [list, room])
  if (items.length === 0) return null
  const act = (id: string, action: Parameters<typeof window.office.chatReservationAction>[1]) => void window.office.chatReservationAction(id, action)
  const edit = (r: ChatReservation) => {
    useOffice.getState().setChatDraft(r.text)
    act(r.id, 'cancel')
  }
  const btn = 'rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground shrink-0'
  const primary = 'bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-2 py-0.5 text-[11px] font-medium shrink-0'
  return (
    <div className="mx-auto mb-2 flex max-w-3xl flex-col gap-1.5">
      {items.map((r) => {
        const when = r.kind === 'once' ? fmtDate(r.at ?? 0, { ...TIME_FMT, weekday: 'short' }) : repeatLabel(r)
        if (r.isMissed)
          return (
            <div key={r.id} className="border-status-waiting/50 bg-status-waiting/10 flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
              <span className="text-status-waiting shrink-0 text-[11px] font-semibold"><IconText text={t('chat.reserve.missed', { when: fmtDate(r.missedAt ?? r.at ?? 0, TIME_FMT) })} size={12} /></span>
              <span className="min-w-0 flex-1 truncate">{r.text}</span>
              <span className="text-muted-foreground basis-full text-[11px]">{t('chat.reserve.missedAsk')}</span>
              <button type="button" className={primary} onClick={() => act(r.id, 'send')}>{t('chat.reserve.sendNow')}</button>
              <button type="button" className={btn} onClick={() => act(r.id, 'skip')}>{t('chat.reserve.skip')}</button>
            </div>
          )
        return (
          <div key={r.id} className={cn('border-primary/45 bg-primary/5 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs', !r.enabled && 'opacity-60')}>
            <span className="text-primary shrink-0 text-[11px] font-semibold">
              <DuoIcon name={r.kind === 'once' ? 'schedule' : 'repeat'} size={13} className="mr-1" />{when}
              {!r.enabled && ` · ${t('chat.reserve.paused')}`}
              {r.kind === 'repeat' && r.sentCount > 0 && ` · ${t('chat.reserve.sentCount', { count: r.sentCount })}`}
            </span>
            <span className="min-w-0 flex-1 truncate">{r.text}</span>
            {r.kind === 'once' && <button type="button" className={primary} onClick={() => act(r.id, 'send')}>{t('chat.reserve.sendNow')}</button>}
            {r.kind === 'repeat' && <button type="button" className={btn} onClick={() => act(r.id, r.enabled ? 'pause' : 'resume')}>{t(r.enabled ? 'chat.reserve.pause' : 'chat.reserve.resume')}</button>}
            <button type="button" className={btn} title={t('chat.reserve.editTitle')} onClick={() => edit(r)}>{t('chat.reserve.edit')}</button>
            <button type="button" className={btn} onClick={() => act(r.id, 'cancel')}>{t('chat.reserve.cancel')}</button>
          </div>
        )
      })}
    </div>
  )
}

// ── 8. 대화 찾기 ─────────────────────────────────────────

const SEARCH_DEBOUNCE_MS = 250

/** 방 제목 아래 찾기 줄: 이 방(↑↓로 하나씩 이동) · 모든 방(결과 목록) */
export function ChatSearch({ room, onClose, onQuery }: { room: string | undefined; onClose: () => void; onQuery: (q: string) => void }) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'room' | 'all'>('room')
  const [hits, setHits] = useState<ChatSearchHit[]>([])
  const [index, setIndex] = useState(0)
  const teams = useOffice((s) => s.teams)
  const labs = useOffice((s) => s.labs)
  const staff = useOffice((s) => s.staff)
  useEffect(() => {
    const q = query.trim()
    onQuery(q)
    if (!q) return setHits([])
    const timer = setTimeout(() => {
      void window.office.searchChat(q, scope === 'all' ? undefined : (room ?? null)).then((list) => {
        setHits(list)
        setIndex(0)
        if (scope === 'room' && list[0]) void goToMessage(list[0].message.id)
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 찾는 말·범위·방이 바뀔 때만
  }, [query, scope, room])
  useEffect(() => () => onQuery(''), [onQuery])
  const move = (step: number) => {
    if (hits.length === 0) return
    const next = (index + step + hits.length) % hits.length
    setIndex(next)
    void goToMessage(hits[next].message.id)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') return onClose()
    if (e.key === 'Enter' && scope === 'room') {
      e.preventDefault()
      move(e.shiftKey ? -1 : 1)
    }
  }
  const roomName = (r: string | undefined) => findRoom(r, teams, labs)?.name ?? t('chat.room.allName')
  const scopeBtn = (value: 'room' | 'all', label: string) => (
    <button type="button" aria-pressed={scope === value} onClick={() => setScope(value)} className={cn('rounded-full border px-2 py-0.5 text-[11px]', scope === value ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:bg-accent')}>
      {label}
    </button>
  )
  return (
    <div className="relative mt-2">
      <div className="focus-within:ring-ring/50 flex items-center gap-2 rounded-md border px-2 py-1 text-sm focus-within:ring-2">
        <SearchIcon className="text-muted-foreground size-4 shrink-0" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} placeholder={t('chat.search.placeholder')} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        {query.trim() && scope === 'room' && (
          <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">{hits.length ? t('chat.search.count', { total: hits.length, index: index + 1 }) : t('chat.search.none')}</span>
        )}
        {scope === 'room' && (
          <>
            <button type="button" onClick={() => move(-1)} title={t('chat.search.prev')} className="text-muted-foreground hover:text-foreground"><ChevronUpIcon className="size-4" /></button>
            <button type="button" onClick={() => move(1)} title={t('chat.search.next')} className="text-muted-foreground hover:text-foreground"><ChevronDownIcon className="size-4" /></button>
          </>
        )}
        {scopeBtn('room', t('chat.search.thisRoom'))}
        {scopeBtn('all', t('chat.search.allRooms'))}
        <button type="button" onClick={onClose} title={t('chat.search.close')} className="text-muted-foreground hover:text-foreground"><XIcon className="size-4" /></button>
      </div>
      {scope === 'all' && query.trim() && (
        <div className="bg-popover absolute inset-x-0 top-full z-20 mt-1 flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg border p-1 shadow-lg">
          {hits.length === 0 && <span className="text-muted-foreground px-2 py-1 text-xs">{t('chat.search.none')}</span>}
          {hits.map((h) => (
            <button key={h.message.id} type="button" onClick={() => void goToMessage(h.message.id, h.message.room ?? null)} className="hover:bg-accent flex flex-col rounded-md px-2 py-1 text-left">
              <span className="truncate text-xs"><Highlighted text={h.message.text} query={query.trim()} /></span>
              <span className="text-muted-foreground text-[10.5px]">
                {roomName(h.message.room)} · {senderName(h.message.from, staff)} · {fmtDate(h.message.ts, TIME_FMT)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const one = text.replace(/\s+/g, ' ')
  const i = one.toLowerCase().indexOf(query.toLowerCase())
  if (i < 0) return <>{one}</>
  const start = Math.max(0, i - 30)
  return (
    <>
      {start > 0 && '…'}
      {one.slice(start, i)}
      <mark className="bg-status-waiting/35 text-foreground rounded-sm">{one.slice(i, i + query.length)}</mark>
      {one.slice(i + query.length)}
    </>
  )
}

/** 찾는 말을 메시지 목록 안에 표시한다 (CSS Custom Highlight — 말풍선 내용을 다시 그리지 않는다) */
export function useSearchHighlight(container: HTMLElement | null, query: string, deps: unknown) {
  useEffect(() => {
    const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
    if (!registry || !HighlightCtor) return
    registry.delete('chat-search')
    const q = query.toLowerCase()
    if (!container || !q) return
    const ranges: Range[] = []
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.toLowerCase() ?? ''
      for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) {
        const range = document.createRange()
        range.setStart(node, i)
        range.setEnd(node, i + q.length)
        ranges.push(range)
      }
    }
    registry.set('chat-search', new HighlightCtor(...ranges))
    return () => void registry.delete('chat-search')
  }, [container, query, deps])
}
