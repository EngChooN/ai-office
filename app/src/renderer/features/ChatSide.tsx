import type { ReactNode } from 'react'
import { PresentationIcon } from 'lucide-react'
import { useOffice } from '@/store'
import { cn } from '@/lib/utils'
import type { Lab, Team } from '@shared/types'
import { labRoomId, type ChatRoomInfo } from '@shared/chatRooms'
import { roomKey } from '@shared/chatUnread'
import { t } from '@shared/i18n'
import { Avatar } from './StaffCard'
import { STATUS_META } from './status'
import { doingOf, useRoomList, useRoomPeople } from './chatRoomHooks'

/**
 * 좌우 분할(폴드 와이드 커버 등) 대화방의 왼쪽 칸: 방 목록 → 회의실 → 지금 하는 일.
 * 가로 방 탭·구성원 상태 줄과 같은 계산(chatRoomHooks)을 세로 목록으로 그린다. 칸 안에서만 세로로 스크롤
 */
export function ChatSide({ room, footer, className }: { room: ChatRoomInfo<Team, Lab> | undefined; footer?: ReactNode; className?: string }) {
  const setChatRoom = useOffice((s) => s.setChatRoom)
  const setView = useOffice((s) => s.setView)
  const select = useOffice((s) => s.select)
  const { teamRooms, labRooms, unread, approvalRooms } = useRoomList()
  const people = useRoomPeople(room)
  const current = room?.room
  const row = (key: string, label: string, isActive: boolean, onClick: () => void, color?: string) => {
    const count = isActive ? 0 : (unread[roomKey(key === 'all' ? null : key)] ?? 0)
    return (
      <button
        key={key}
        type="button"
        aria-current={isActive ? 'true' : undefined}
        onClick={onClick}
        className={cn('flex min-h-8 items-center gap-2 rounded-[10px] px-2 text-left text-sm', isActive ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/60')}
      >
        <span className="size-2 shrink-0 rounded-full" style={{ background: color ?? 'var(--primary)' }} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {approvalRooms.has(roomKey(key === 'all' ? null : key)) && <span className="bg-status-waiting size-1.5 shrink-0 rounded-full" title={t('chat.unread.approval')} />}
        {count > 0 && (
          <span className="bg-status-error shrink-0 rounded-full px-1.5 text-[10px] leading-4 font-semibold text-white" aria-label={t('chat.unread.count', { count })}>
            {count}
          </span>
        )}
      </button>
    )
  }
  return (
    <aside className={cn('bg-(--surface-chrome) w-[200px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-2', className)} aria-label={t('chat.rooms')}>
      <span className="text-muted-foreground px-2 pt-1 pb-0.5 text-[11px] font-semibold">{t('chat.rooms')}</span>
      {row('all', t('chat.room.all'), !current, () => setChatRoom(null))}
      {teamRooms.map((tm) => row(tm.id, tm.name, current === tm.id, () => setChatRoom(tm.id), tm.color))}
      {labRooms.map((lb) => row(labRoomId(lb.id), lb.name, current === labRoomId(lb.id), () => setChatRoom(labRoomId(lb.id)), lb.color))}
      <button type="button" onClick={() => setView('meeting')} className="text-muted-foreground hover:bg-accent/60 flex min-h-8 items-center gap-2 rounded-[10px] px-2 text-left text-sm">
        <PresentationIcon className="size-3.5 shrink-0" />
        {t('nav.meeting')}
      </button>
      {people.length > 0 && (
        <>
          <span className="text-muted-foreground mt-3 px-2 pb-0.5 text-[11px] font-semibold">{t('chat.side.doing')}</span>
          {people.map((s) => {
            const meta = STATUS_META[s.status]
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
      {footer && <div className="mt-auto px-2 pt-3">{footer}</div>}
    </aside>
  )
}
