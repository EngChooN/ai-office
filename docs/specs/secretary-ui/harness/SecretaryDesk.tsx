// 데스크톱 시안 틀: App header·Sidebar와 같은 클래스에 "비서" 메뉴 하나와 상단 바 "비서 ⌘K" 버튼만 더한다 (목업용)
import { useEffect } from 'react'
import { BanknoteIcon, BellIcon, BookOpenIcon, CalendarClockIcon, ClipboardCheckIcon, FileTextIcon, KanbanIcon, LayoutGridIcon, MapIcon, MegaphoneIcon, MessagesSquareIcon, NetworkIcon, PresentationIcon, SettingsIcon, SparklesIcon, StoreIcon, UserPlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/changelog'
import { connectOffice, useOffice } from '@/store'
import { formatWon } from '@shared/economy'
import { formatCost } from '@/features/status'
import { Dashboard } from '@/features/Dashboard'
import { QuickSecretary, SecretaryPage } from './SecretaryMock'

const ITEMS = [
  { key: 'secretary', label: '비서', icon: SparklesIcon },
  { key: 'map', label: '사무실', icon: MapIcon },
  { key: 'dashboard', label: '대시보드', icon: LayoutGridIcon },
  { key: 'org', label: '조직도', icon: NetworkIcon },
  { key: 'board', label: '업무 보드', icon: KanbanIcon, badge: 1 },
  { key: 'inbox', label: '결재함', icon: ClipboardCheckIcon, badge: 3 },
  { key: 'chat', label: '단체방', icon: MessagesSquareIcon },
  { key: 'meeting', label: '회의실', icon: PresentationIcon },
  { key: 'manuals', label: '매뉴얼실', icon: BookOpenIcon },
  { key: 'schedule', label: '예약 업무', icon: CalendarClockIcon },
  { key: 'report', label: '보고서', icon: FileTextIcon },
  { key: 'payroll', label: '급여 명세서', icon: BanknoteIcon },
  { key: 'shop', label: '상점', icon: StoreIcon, badge: 2 },
  { key: 'settings', label: '설정·꾸미기', icon: SettingsIcon },
]

export function SecretaryDesk({ scene, quick }: { scene: string; quick: boolean }) {
  useEffect(() => connectOffice(), [])
  const funds = useOffice((s) => s.funds)
  const monthCost = useOffice((s) => s.monthCostUsd)
  const active = quick ? 'dashboard' : 'secretary'
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b pr-3 pl-20">
        <span className="font-semibold">Claude Office</span>
        <span className="bg-accent rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums">💰 {formatWon(funds)}</span>
        <span className="text-muted-foreground text-xs">이번 달 {formatCost(monthCost)} / $50.00</span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline">
            <SparklesIcon /> 비서 <kbd className="text-muted-foreground text-[10px]">⌘K</kbd>
          </Button>
          <Button size="sm" variant="outline" className="border-status-waiting text-status-waiting">
            <BellIcon /> 확인 필요 2
          </Button>
          <Button size="sm">
            <UserPlusIcon /> 직원 고용
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r p-2">
          {ITEMS.map(({ key, label, icon: Icon, badge }) => (
            <button key={key} type="button" className={cn('flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm', active === key ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground')}>
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
              {badge && <span className="bg-status-waiting rounded-full px-1.5 text-[10px] font-semibold text-black">{badge}</span>}
            </button>
          ))}
          <button type="button" className="text-muted-foreground mt-auto flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs">
            <MegaphoneIcon className="size-3.5" />
            <span className="flex-1">업데이트 소식</span>
            <span className="tabular-nums">v{APP_VERSION}</span>
          </button>
        </nav>
        <main className="min-h-0 min-w-0 flex-1">{quick ? <Dashboard /> : <SecretaryPage scene={scene as never} />}</main>
      </div>
      {quick && <QuickSecretary />}
    </div>
  )
}
