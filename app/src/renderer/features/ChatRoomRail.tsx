import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { MenuIcon, PinIcon, PresentationIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Lab, Team } from '@shared/types'
import type { ChatRoomInfo } from '@shared/chatRooms'
import { roomInitial } from '@shared/chatRoomLayout'
import { t } from '@shared/i18n'
import { ChatSide } from './ChatSide'
import { roomArrowKeys, unreadText, useMeetingEntry, useRoomEntries, type RoomEntry } from './chatRoomHooks'

/** 말풍선이 뜨기까지 */
const TIP_DELAY = 300

/**
 * 데스크톱 단체방 왼쪽 56px 띠 (방 목록을 접은 모습): ≡ · 방 머리 글자 아이콘(안 읽은 수·결재 점) · 회의실.
 * ≡를 누르면 방 목록(ChatSide)을 띠 위에 겹쳐 펼치고(대화는 밀리지 않음), 그 안 📌로 펼친 채 고정한다
 */
export function ChatRoomRail({ room, onPin }: { room: ChatRoomInfo<Team, Lab> | undefined; onPin: () => void }) {
  const meeting = useMeetingEntry()
  const entries = useRoomEntries(room?.room, t('chat.room.allName'))
  const [isPeekOpen, setIsPeekOpen] = useState(false)
  const [tip, setTip] = useState<{ entry: RoomEntry; rect: DOMRect } | null>(null)
  const tipTimer = useRef<number | undefined>(undefined)
  const ref = useRef<HTMLDivElement>(null)
  // 겹쳐 펼친 목록은 바깥을 누르거나 Esc로 닫는다
  useEffect(() => {
    if (!isPeekOpen) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setIsPeekOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsPeekOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [isPeekOpen])
  useEffect(() => () => window.clearTimeout(tipTimer.current), [])
  const showTip = (entry: RoomEntry, el: HTMLElement) => {
    window.clearTimeout(tipTimer.current)
    tipTimer.current = window.setTimeout(() => setTip({ entry, rect: el.getBoundingClientRect() }), TIP_DELAY)
  }
  const hideTip = () => {
    window.clearTimeout(tipTimer.current)
    setTip(null)
  }
  const icon = (e: RoomEntry) => {
    const label = [e.label, e.unread > 0 && t('chat.unread.count', { count: e.unread }), e.hasApproval && t('chat.unread.approval')].filter(Boolean).join(' · ')
    return (
      <button
        key={e.key}
        type="button"
        data-room-item
        aria-label={label}
        aria-current={e.isActive ? 'true' : undefined}
        onClick={() => {
          hideTip()
          e.select()
        }}
        onMouseEnter={(ev) => showTip(e, ev.currentTarget)}
        onMouseLeave={hideTip}
        onFocus={(ev) => showTip(e, ev.currentTarget)}
        onBlur={hideTip}
        style={e.color ? ({ '--room': e.color } as CSSProperties) : undefined}
        className={cn(
          'text-foreground relative flex size-9 shrink-0 items-center justify-center text-[13px] font-semibold',
          e.group === 'lab' ? 'rounded-full' : 'rounded-[10px]',
          e.color ? 'bg-[color-mix(in_srgb,var(--room)_18%,transparent)] dark:bg-[color-mix(in_srgb,var(--room)_28%,transparent)]' : 'bg-primary/15',
          e.isActive && 'ring-primary ring-2',
        )}
      >
        {roomInitial(e.label)}
        {e.unread > 0 && (
          <span className="bg-status-error dark:text-background absolute -top-1 -right-1 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold text-white ring-2 ring-(--surface-chrome)">{unreadText(e.unread)}</span>
        )}
        {e.hasApproval && <span className="bg-status-waiting absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-(--surface-chrome)" />}
      </button>
    )
  }
  // 묶음(전체 ↔ 팀 ↔ 랩) 사이는 제목 대신 얇은 선
  const icons = (['all', 'team', 'lab'] as const).flatMap((g, i) => {
    const list = entries.filter((e) => e.group === g)
    if (list.length === 0) return []
    return [
      ...(i > 0 ? [<span key={`sep:${g}`} className="bg-border my-1 h-px w-6 shrink-0" />] : []),
      ...list.map((e) => (
        <div key={e.key} className="relative flex w-full shrink-0 justify-center">
          {e.isActive && <span className="bg-primary absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full" />}
          {icon(e)}
        </div>
      )),
    ]
  })
  return (
    <div ref={ref} className="relative flex shrink-0">
      <nav aria-label={t('chat.rooms')} onScroll={hideTip} onKeyDown={roomArrowKeys} className="bg-(--surface-chrome) flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r py-2">
        <Button variant="ghost" className="size-9 shrink-0 p-0" onClick={() => setIsPeekOpen((v) => !v)} aria-expanded={isPeekOpen} title={t('chat.side.expand')} aria-label={t('chat.side.expand')}>
          <MenuIcon className="size-4" />
        </Button>
        {icons}
        {/* 회의실: 회의실 화면이면 방 아이콘처럼 왼쪽 막대·링, 답 기다리는 회의 결정 수는 노란 숫자 */}
        <div className="relative mt-auto flex w-full shrink-0 justify-center">
          {meeting.isActive && <span className="bg-primary absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full" />}
          <Button
            variant="ghost"
            data-room-item
            data-tour="nav-meeting"
            aria-current={meeting.isActive ? 'true' : undefined}
            className={cn('relative size-9 shrink-0 p-0', meeting.isActive && 'bg-accent ring-primary ring-2')}
            onClick={() => {
              hideTip()
              meeting.select()
            }}
            title={t('nav.meeting')}
            aria-label={[t('nav.meeting'), meeting.pending > 0 && t('chat.side.meetingPending', { count: meeting.pending })].filter(Boolean).join(' · ')}
          >
            <PresentationIcon className="size-4" />
            {meeting.pending > 0 && (
              <span className="bg-status-waiting text-background absolute -top-1 -right-1 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold ring-2 ring-(--surface-chrome)">{unreadText(meeting.pending)}</span>
            )}
          </Button>
        </div>
      </nav>
      {isPeekOpen && (
        <ChatSide
          room={room}
          isDoingShown={false}
          onPicked={() => setIsPeekOpen(false)}
          className="absolute inset-y-0 left-0 z-30 flex shadow-lg"
          headAction={
            <Button variant="ghost" className="size-7 p-0" onClick={onPin} title={t('chat.side.pin')} aria-label={t('chat.side.pin')}>
              <PinIcon className="size-4" />
            </Button>
          }
        />
      )}
      {tip && !isPeekOpen && createPortal(<RailTip entry={tip.entry} rect={tip.rect} />, document.body)}
    </div>
  )
}

/** 띠 아이콘에 마우스·키보드 초점이 가면 오른쪽에 뜨는 말풍선: 방 이름 · 안 읽은 글 N / 결재·질문 기다림 */
function RailTip({ entry: e, rect }: { entry: RoomEntry; rect: DOMRect }) {
  return (
    <div role="tooltip" className="bg-popover text-popover-foreground pointer-events-none fixed z-50 max-w-60 -translate-y-1/2 rounded-lg border px-2.5 py-1.5 text-xs shadow-lg" style={{ left: rect.right + 8, top: rect.top + rect.height / 2 }}>
      <div>
        <span className="font-medium">{e.label}</span>
        {e.unread > 0 && <span className="text-muted-foreground"> · {t('chat.side.tipUnread', { count: unreadText(e.unread) })}</span>}
      </div>
      {e.hasApproval && <div className="text-status-waiting">{t('chat.unread.approval')}</div>}
    </div>
  )
}
