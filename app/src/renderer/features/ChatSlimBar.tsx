import { BellIcon, ChevronDownIcon, InfoIcon, SearchIcon, SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PopMenu } from '@/components/pop-menu'
import { useOffice } from '@/store'
import type { Lab, Team } from '@shared/types'
import type { ChatRoomInfo } from '@shared/chatRooms'
import { t } from '@shared/i18n'
import { AutoApproveBadge } from './AutoApprove'
import { ChatSide } from './ChatSide'
import { useRoomPeople } from './chatRoomHooks'
import { Avatar } from './StaffCard'

/** 한 줄 머리에 겹쳐 보여 주는 얼굴 수 */
const FACES_MAX = 3

/**
 * 세로 폰(slim:) 대화방 머리 46px 한 줄: [방 이름 ▾ · 일하는 직원 얼굴 · N 작업] · 결재 대기 · 🔍 · ⓘ · ✨.
 * ▾ 안은 분할 화면 왼쪽 칸(ChatSide: 방 목록 → 회의실 → 지금 하는 일)을 그대로 쓴다. 다른 배치에선 보이지 않는다 (hidden slim:flex).
 * 상단 앱 바(PhoneShell)는 세로 폰 대화방에서 숨기므로 결재 대기·비서 버튼을 여기로 옮긴다
 */
export function ChatSlimBar({ room, title, description, onSearch }: { room: ChatRoomInfo<Team, Lab> | undefined; title: string; description: string; onSearch: () => void }) {
  const setView = useOffice((s) => s.setView)
  const waitingCount = useOffice((s) => s.staff.filter((x) => x.status === 'waiting').length)
  const people = useRoomPeople(room)
  const working = people.filter((s) => s.status === 'working')
  const faces = (working.length > 0 ? working : people).slice(0, FACES_MAX)
  return (
    <div className="slim:flex hidden min-h-[46px] shrink-0 items-center gap-1 border-b px-2">
      <PopMenu
        opens="down"
        label={t('chat.slim.switch')}
        className="min-w-0 flex-1"
        buttonClassName="h-9 w-full min-w-0 justify-start gap-1.5 px-2"
        icon={
          <>
            <span className="min-w-0 shrink truncate text-base font-semibold">{title}</span>
            <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
            {faces.length > 0 && (
              <span className="ml-1 flex shrink-0 -space-x-1.5 max-[359px]:hidden">
                {faces.map((s) => (
                  <Avatar key={s.id} avatar={s.avatar} name={s.name} teamId={s.teamId} className="ring-background size-5 ring-2" />
                ))}
              </span>
            )}
            {working.length > 0 && <span className="text-status-working shrink-0 text-xs font-medium">{t('chat.slim.working', { count: working.length })}</span>}
          </>
        }
      >
        {(close) => (
          // 방·회의실·사람을 누르면 메뉴를 닫는다 (안의 버튼이 먼저 처리한다)
          <div onClick={close}>
            <ChatSide room={room} className="flex w-full border-0 bg-transparent p-0" />
          </div>
        )}
      </PopMenu>
      {/* 슬림 대화방은 앱 상단 바를 숨기므로 자동결재가 켜져 있다는 표시를 여기에 (켜졌을 때만 보인다) */}
      <AutoApproveBadge isCompact />
      {waitingCount > 0 && (
        <Button size="sm" variant="outline" className="border-status-waiting text-status-waiting shrink-0 px-2" onClick={() => setView('inbox')} aria-label={t('shell.needsAttention', { n: waitingCount })}>
          <BellIcon /> {waitingCount}
        </Button>
      )}
      <Button size="icon" variant="ghost" className="shrink-0" onClick={onSearch} aria-label={t('chat.search.open')}>
        <SearchIcon />
      </Button>
      <PopMenu opens="down" icon={<InfoIcon />} label={t('chat.slim.about')}>
        {() => <p className="text-muted-foreground p-1.5 text-xs">{description}</p>}
      </PopMenu>
      {/* 비서는 상단 앱 바에만 들어가는 곳이 있어 남긴다 (분할 화면과 같음) */}
      <Button size="icon" variant="ghost" className="shrink-0" onClick={() => setView('secretary')} aria-label={t('shell.secretary')}>
        <SparklesIcon />
      </Button>
    </div>
  )
}
