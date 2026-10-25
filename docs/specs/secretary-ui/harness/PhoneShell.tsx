// 제안 미리보기: 기존 화면·컴포넌트를 그대로 쓰고, 틀(상단 바·아래 탭·더보기·시트)만 폰 배치로 바꿔 끼운다
// 이 파일은 설계 목업용이다. 실제 구현은 최가독(PhoneShell)이 앱 안에 만든다.
import { useEffect } from 'react'
import { BanknoteIcon, BellIcon, BookOpenIcon, CalendarClockIcon, ClipboardCheckIcon, EllipsisIcon, FileTextIcon, KanbanIcon, LayoutGridIcon, MapIcon, MegaphoneIcon, MessagesSquareIcon, NetworkIcon, PresentationIcon, RefreshCwIcon, SettingsIcon, SparklesIcon, StoreIcon, UserPlusIcon, WifiOffIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/changelog'
import { connectOffice, useOffice, useWorkMode, type View } from '@/store'
import { formatWon } from '@shared/economy'
import { BoardPage } from '@/features/BoardPage'
import { ChatPage } from '@/features/ChatPage'
import { Dashboard } from '@/features/Dashboard'
import { HireDialog } from '@/features/HireDialog'
import { InboxPage } from '@/features/InboxPage'
import { ManualsPage } from '@/features/ManualsPage'
import { MeetingPage } from '@/features/MeetingPage'
import { OrgPage } from '@/features/OrgPage'
import { PayrollPage } from '@/features/PayrollPage'
import { ReportPage } from '@/features/ReportPage'
import { SchedulePage } from '@/features/SchedulePage'
import { SettingsPage } from '@/features/SettingsPage'
import { ShopPage } from '@/features/ShopPage'
import { StaffPanel } from '@/features/StaffPanel'
import { UpdatesPage } from '@/features/UpdatesPage'
import { OfficeMap } from '@/map/OfficeMap'

const PAGES: Record<View, () => React.JSX.Element> = { map: OfficeMap, dashboard: Dashboard, org: OrgPage, board: BoardPage, updates: UpdatesPage, shop: ShopPage, inbox: InboxPage, chat: ChatPage, meeting: MeetingPage, manuals: ManualsPage, schedule: SchedulePage, report: ReportPage, payroll: PayrollPage, settings: SettingsPage }

// 사이드바 ITEMS와 같은 이름·아이콘·순서
const ITEMS: { view: View; label: string; icon: typeof MapIcon }[] = [
  { view: 'map', label: '사무실', icon: MapIcon },
  { view: 'dashboard', label: '대시보드', icon: LayoutGridIcon },
  { view: 'org', label: '조직도', icon: NetworkIcon },
  { view: 'board', label: '업무 보드', icon: KanbanIcon },
  { view: 'inbox', label: '결재함', icon: ClipboardCheckIcon },
  { view: 'chat', label: '단체방', icon: MessagesSquareIcon },
  { view: 'meeting', label: '회의실', icon: PresentationIcon },
  { view: 'manuals', label: '매뉴얼실', icon: BookOpenIcon },
  { view: 'schedule', label: '예약 업무', icon: CalendarClockIcon },
  { view: 'report', label: '보고서', icon: FileTextIcon },
  { view: 'payroll', label: '급여 명세서', icon: BanknoteIcon },
  { view: 'shop', label: '상점', icon: StoreIcon },
  { view: 'settings', label: '설정·꾸미기', icon: SettingsIcon },
]
const TAB_VIEWS: View[] = ['map', 'chat', 'board', 'inbox']

function useBadges() {
  const staff = useOffice((s) => s.staff)
  const tasks = useOffice((s) => s.tasks)
  const claimable = useOffice((s) => s.claimable)
  const meetings = useOffice((s) => s.meetings)
  const runs = useOffice((s) => s.runs)
  const pending = meetings.reduce((n, m) => n + (m.decisions ?? []).filter((d) => d.answer === null).length, 0)
  return {
    inbox: staff.reduce((n, s) => n + s.approvals.length, 0) + pending + runs.filter((r) => r.status === 'checking').length + tasks.filter((t) => t.plan?.status === 'waiting').length,
    meeting: pending,
    board: tasks.filter((t) => t.status === 'review').length,
    shop: claimable,
  } as Partial<Record<View, number>>
}

const Badge = ({ n }: { n?: number }) => (n ? <span className="bg-status-waiting rounded-full px-1.5 text-[10px] font-semibold text-black">{n}</span> : null)

export function PhoneShell({ showMore, banner, frame, override, overrideTitle }: { showMore: boolean; banner: string | null; frame: boolean; override?: () => React.JSX.Element; overrideTitle?: string }) {
  useEffect(() => connectOffice(), [])
  const view = useOffice((s) => s.view)
  const setView = useOffice((s) => s.setView)
  const staff = useOffice((s) => s.staff)
  const funds = useOffice((s) => s.funds)
  const selectedId = useOffice((s) => s.selectedId)
  const setHireOpen = useOffice((s) => s.setHireOpen)
  const isWorkMode = useWorkMode()
  const badges = useBadges()
  const Page = override ?? PAGES[view]
  const waiting = staff.filter((s) => s.status === 'waiting').length
  // 업무 모드면 첫 탭은 사무실 대신 대시보드
  const tabs = TAB_VIEWS.map((v) => (v === 'map' && isWorkMode ? 'dashboard' : v))
  const more = ITEMS.filter((i) => !tabs.includes(i.view) && !(isWorkMode && (i.view === 'map' || i.view === 'shop')))
  const isMoreActive = !tabs.includes(view)
  const moreBadge = more.reduce((n, i) => n + (badges[i.view] ?? 0), 0)
  const title = overrideTitle ?? ITEMS.find((i) => i.view === view)?.label ?? '업데이트 소식'

  return (
    <div className="phone-shell bg-background flex h-full flex-col">
      {frame && <div className="text-muted-foreground flex h-6 shrink-0 items-center justify-between px-5 text-[11px]"><span>10:30</span><span>상태 표시줄 (안전 영역)</span></div>}
      {/* 상단 바: PC header와 같은 요소를 줄여 담는다 */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
        {!isWorkMode && (
          <button type="button" onClick={() => setView('shop')} className="bg-accent rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums">
            💰 {formatWon(funds)}
          </button>
        )}
        {override && (
          <Button size="icon" variant="outline" className="border-primary text-primary size-8" aria-label="비서">
            <SparklesIcon />
          </Button>
        )}
        {waiting > 0 && (
          <Button size="sm" variant="outline" className="border-status-waiting text-status-waiting px-2" onClick={() => setView('inbox')} aria-label={`확인 필요 ${waiting}`}>
            <BellIcon /> {waiting}
          </Button>
        )}
        <Button size="icon" className="size-8" onClick={() => setHireOpen(true)} aria-label="직원 고용">
          <UserPlusIcon />
        </Button>
      </header>
      {banner && (
        <div className="border-status-waiting/40 bg-status-waiting/10 flex shrink-0 items-center gap-2 border-b px-3 py-2 text-xs">
          <WifiOffIcon className="text-status-waiting size-4 shrink-0" />
          <span className="min-w-0 flex-1">{banner === 'reconnecting' ? 'PC와 연결이 끊겼어요. 다시 연결하는 중… · 10:24에 마지막으로 받은 화면이에요' : 'PC에 닿지 않아요. PC가 잠자기 중이거나 Claude Office가 꺼져 있을 수 있어요.'}</span>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs"><RefreshCwIcon className="size-3.5" />다시</Button>
        </div>
      )}
      <main className={cn('phone-main min-h-0 flex-1 overflow-hidden', banner && 'pointer-events-none')}>
        <Page />
      </main>
      {/* 아래 탭: 사이드바와 같은 아이콘·배지. 고른 탭은 사이드바 선택 모양(bg-accent) */}
      <nav className="grid h-16 shrink-0 grid-cols-5 border-t px-1">
        {tabs.map((v) => {
          const it = ITEMS.find((i) => i.view === v)!
          const Icon = it.icon
          return (
            <button key={v} type="button" onClick={() => setView(v)} className={cn('relative m-1 flex flex-col items-center justify-center gap-0.5 rounded-md text-[11px]', view === v && !override ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground')}>
              <Icon className="size-5" />
              {it.label}
              <span className="absolute top-1 right-2"><Badge n={badges[v]} /></span>
            </button>
          )
        })}
        <button type="button" className={cn('relative m-1 flex flex-col items-center justify-center gap-0.5 rounded-md text-[11px]', (isMoreActive && !override) || showMore ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground')}>
          <EllipsisIcon className="size-5" />
          더보기
          <span className="absolute top-1 right-2"><Badge n={moreBadge} /></span>
        </button>
      </nav>
      {frame && <div className="flex h-4 shrink-0 items-center justify-center"><span className="bg-muted-foreground/40 h-1 w-28 rounded-full" /></div>}

      {/* 더보기: 사이드바 나머지 메뉴를 같은 순서·아이콘·줄 모양으로 */}
      {showMore && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/60">
          <div className="bg-background rounded-t-xl border-t p-2 pb-20">
            <div className="flex items-center px-2.5 py-2"><span className="flex-1 text-sm font-semibold">더보기</span><XIcon className="text-muted-foreground size-4" /></div>
            {more.map(({ view: v, label, icon: Icon }) => (
              <button key={v} type="button" className={cn('flex min-h-12 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm', view === v ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground')}>
                <Icon className="size-4" />
                <span className="flex-1">{label}</span>
                <Badge n={badges[v]} />
              </button>
            ))}
            <button type="button" className="text-muted-foreground mt-1 flex min-h-12 w-full items-center gap-2 rounded-md border-t px-2.5 text-left text-xs">
              <MegaphoneIcon className="size-3.5" />
              <span className="flex-1">업데이트 소식</span>
              <span className="tabular-nums">v{APP_VERSION}</span>
            </button>
          </div>
        </div>
      )}

      {/* 직원 패널: 오른쪽 패널을 전체 화면 시트로 (너비 조절 손잡이는 숨김) */}
      {selectedId && (
        <div className="phone-sheet bg-background fixed inset-0 z-30 flex flex-col">
          {frame && <div className="h-6 shrink-0" />}
          <StaffPanel />
        </div>
      )}
      <HireDialog />
    </div>
  )
}
