import { Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOffice } from '@/store'
import type { Lab, Team } from '@shared/types'
import type { ChatRoomInfo } from '@shared/chatRooms'
import { t } from '@shared/i18n'

type GroupRoom = Extract<ChatRoomInfo<Team, Lab>, { kind: 'group' }>

/** 단체방 지우기 — 확인 창을 거친 뒤 지우고 전체 방으로 (대화 기록은 남는다) */
function useDeleteGroupRoom(room: GroupRoom) {
  const setChatRoom = useOffice((s) => s.setChatRoom)
  return async () => {
    if (!window.confirm(t('chat.group.confirmDelete', { name: room.name }))) return
    await window.office.deleteChatGroup(room.group.id)
    setChatRoom(null)
  }
}

/** 단체방 ⓘ 안 (데스크톱 머리·세로 폰 한 줄 머리 공통): 함께 있는 팀·프로젝트 · 지우기 */
export function GroupRoomAbout({ room }: { room: GroupRoom }) {
  const handleDelete = useDeleteGroupRoom(room)
  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t pt-2">
      <span className="text-muted-foreground text-[11px] font-medium">{t('chat.group.includes')}</span>
      <span className="flex flex-wrap gap-1">
        {[...room.teams, ...room.labs].map((g) => (
          <span key={g.id} className="flex items-center gap-1 rounded-full border px-1.5 text-[11px] leading-5">
            <span className="size-1.5 rounded-full" style={{ background: g.color }} />
            {g.name}
          </span>
        ))}
      </span>
      <Button size="sm" variant="ghost" className="text-status-error justify-start px-1.5" onClick={() => void handleDelete()}>
        {t('chat.group.delete')}
      </Button>
    </div>
  )
}

/** 데스크톱·가로 폰 머리의 🗑 — ⓘ를 열지 않아도 단체방을 지울 곳이 보이게 (세로 폰은 머리가 좁아 ⓘ 안에만) */
export function GroupRoomDeleteButton({ room }: { room: GroupRoom }) {
  const handleDelete = useDeleteGroupRoom(room)
  return (
    <Button size="sm" variant="ghost" className="hover:text-status-error text-muted-foreground size-8 p-0" onClick={() => void handleDelete()} title={t('chat.group.delete')} aria-label={t('chat.group.delete')}>
      <Trash2Icon />
    </Button>
  )
}
