import type { ReactNode } from 'react'
import { PinIcon, PresentationIcon } from 'lucide-react'
import { useOffice } from '@/store'
import { cn } from '@/lib/utils'
import type { Lab, Team } from '@shared/types'
import type { ChatRoomInfo } from '@shared/chatRooms'
import { t } from '@shared/i18n'
import { Avatar } from './StaffCard'
import { statusMetaOf } from './status'
import { doingOf, roomArrowKeys, unreadText, useMeetingEntry, useRoomEntries, useRoomPeople, type RoomEntry } from './chatRoomHooks'

const GROUP_LABEL = { all: 'chat.room.all', team: 'chat.room.groupTeams', lab: 'chat.room.groupLabs' } as const

/**
 * 대화방 왼쪽 방 목록: 전체 / 팀 / 랩 묶음 → 회의실 → (지금 하는 일).
 * 데스크톱 단체방(펼친 목록·띠의 겹쳐 펼침)과 좌우 분할(폴드 와이드 커버 등)이 같이 쓴다. 칸 안에서만 세로로 스크롤
 */
export function ChatSide({
  room,
  className,
  isDoingShown = true,
  headAction,
  isPinned,
  onPicked,
}: {
  room: ChatRoomInfo<Team, Lab> | undefined
  className?: string
  /** '지금 하는 일' 목록 — 데스크톱은 상단 직원 줄이 같은 정보를 보여 주므로 끈다 */
  isDoingShown?: boolean
  /** 칸 머리 오른쪽 버튼(접기·📌 고정) */
  headAction?: ReactNode
  /** 펼친 채 고정 중이면 '대화방' 옆에 작은 핀 */
  isPinned?: boolean
  /** 방·회의실을 고른 뒤 (겹쳐 펼친 목록을 닫는다) */
  onPicked?: () => void
}) {
  const select = useOffice((s) => s.select)
  const meeting = useMeetingEntry()
  const entries = useRoomEntries(room?.room, t('chat.room.allName'))
  const roomPeople = useRoomPeople(room)
  const people = isDoingShown ? roomPeople : []
  const row = (e: RoomEntry) => (
    <button
      key={e.key}
      type="button"
      data-room-item
      aria-current={e.isActive ? 'true' : undefined}
      onClick={() => {
        e.select()
        onPicked?.()
      }}
      className={cn('flex min-h-8 items-center gap-2 rounded-[10px] px-2 text-left text-sm', e.isActive ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/60')}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: e.color ?? 'var(--primary)' }} />
      <span className="min-w-0 flex-1 truncate">{e.label}</span>
      {e.hasApproval && <span className="bg-status-waiting size-1.5 shrink-0 rounded-full" title={t('chat.unread.approval')} />}
      {e.unread > 0 && (
        <span className="bg-status-error dark:text-background min-w-4 shrink-0 rounded-full px-1.5 text-center text-[10px] leading-4 font-semibold text-white" aria-label={t('chat.unread.count', { count: e.unread })}>
          {unreadText(e.unread)}
        </span>
      )}
    </button>
  )
  // 묶음마다 제목 — 방이 없는 묶음은 제목도 그리지 않는다
  const groups = (['all', 'team', 'lab'] as const).flatMap((g) => {
    const list = entries.filter((e) => e.group === g)
    if (list.length === 0) return []
    return [
      <span key={`group:${g}`} className={cn('text-muted-foreground/70 px-2 pb-0.5 text-[11px] font-medium', g === 'all' ? 'pt-0.5' : 'pt-2')}>
        {t(GROUP_LABEL[g])}
      </span>,
      ...list.map(row),
    ]
  })
  return (
    <aside className={cn('bg-(--surface-chrome) w-[200px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-2', className)} aria-label={t('chat.rooms')} onKeyDown={roomArrowKeys}>
      <div className="flex min-h-7 items-center gap-1 px-2">
        <span className="text-muted-foreground flex-1 text-[11px] font-semibold">{t('chat.rooms')}</span>
        {isPinned && <PinIcon className="text-primary size-3 shrink-0" aria-hidden />}
        {headAction}
      </div>
      {groups}
      <div className="mt-2 border-t pt-2">
        {/* 회의실 줄: 회의실 화면이면 선택됨, 답 기다리는 회의 결정 수는 방 안 읽은 수(빨강)와 구분되게 노랑 */}
        <button
          type="button"
          data-room-item
          data-tour="nav-meeting"
          aria-current={meeting.isActive ? 'true' : undefined}
          onClick={() => {
            meeting.select()
            onPicked?.()
          }}
          className={cn('flex min-h-8 w-full items-center gap-2 rounded-[10px] px-2 text-left text-sm', meeting.isActive ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/60')}
        >
          <PresentationIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{t('nav.meeting')}</span>
          {meeting.pending > 0 && (
            <span className="bg-status-waiting text-background min-w-4 shrink-0 rounded-full px-1.5 text-center text-[10px] leading-4 font-semibold" aria-label={t('chat.side.meetingPending', { count: meeting.pending })}>
              {unreadText(meeting.pending)}
            </span>
          )}
        </button>
      </div>
      {people.length > 0 && (
        <>
          <span className="text-muted-foreground mt-3 px-2 pb-0.5 text-[11px] font-semibold">{t('chat.side.doing')}</span>
          {people.map((s) => {
            const meta = statusMetaOf(s)
            const doing = doingOf(s)
            return (
              <button key={s.id} type="button" onClick={() => select(s.id)} className="hover:bg-accent/60 flex items-center gap-2 rounded-[10px] px-2 py-1 text-left">
                <Avatar avatar={s.avatar} name={s.name} teamId={s.teamId} className="size-[22px]" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-medium">{s.name}</span>
                  <span className={cn('truncate text-[11px]', s.status === 'working' ? 'text-status-working' : s.status === 'waiting' || s.status === 'netWait' ? 'text-status-waiting' : s.status === 'error' ? 'text-status-error' : 'text-muted-foreground')}>
                    {doing || meta.label}
                  </span>
                </span>
              </button>
            )
          })}
        </>
      )}
    </aside>
  )
}
