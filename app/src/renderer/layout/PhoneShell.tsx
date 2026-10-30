import { useEffect, useState } from 'react'
import { SparklesIcon, BellIcon, CheckCircle2Icon, EllipsisIcon, FolderIcon, LayoutGridIcon, UserPlusIcon, WifiOffIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NAV_GROUPS, NAV_ITEMS, useNavBadges, useOpenGroup, type NavGroup } from '@/features/nav'
import { NAV_GROUP_DEFS, groupBadge, groupOfView, visibleGroups, visibleTabs } from '@/features/navGroups'
import { NavTabs } from '@/features/NavTabs'
import { notifiableVersion, useUpdateStore } from '@/lib/update'
import { StaffPanel } from '@/features/StaffPanel'
import { AutoApproveBadge } from '@/features/AutoApprove'
import { cn } from '@/lib/utils'
import { recentFolders } from '@/mobile/recentFolders'
import { useMobileUi } from '@/mobile/ui'
import { useOffice, useWorkMode, type View } from '@/store'
import { formatWon } from '@shared/economy'
import { PAGES } from './pages'
import { fmtDate, t } from '@shared/i18n'

// 폰 틀 (docs/specs/android-pc-layout.md 2절): 상단 바 · 연결 배너 · 기존 화면 · 아래 탭 5칸 · 더보기 시트
// 화면 컴포넌트·색·아이콘·문구는 PC 것을 그대로 쓰고, 틀만 바꾼다. 직원 패널은 전체 화면 시트(StaffPanel의 phone: 클래스)

const PHONE_TABS: View[] = ['map', 'chat', 'board', 'inbox']
/** 업무 모드에선 첫 탭 사무실 자리에 대시보드 */
const WORK_TABS: View[] = ['dashboard', 'chat', 'board', 'inbox']
const NOTICE_MS = 4000
const RECONNECTED_MS = 1500

const labelOf = (view: View) => (view === 'updates' ? t('shell.updates') : (NAV_ITEMS.find((i) => i.view === view)?.label ?? ''))

export function PhoneShell({ children }: { children?: React.ReactNode }) {
  const view = useOffice((s) => s.view)
  const connection = useMobileUi((s) => s.connection)
  const wasOpen = useMobileUi((s) => s.wasOpen)
  // 끊긴 동안에는 결재·지시가 늦게 들어가 엉뚱하게 처리되지 않게 본문 조작을 막는다 (마지막 화면은 보인다)
  const isOffline = wasOpen && connection !== 'open'
  const Page = PAGES[view]

  return (
    // 가로 폰: 노치·카메라 구멍이 있는 좌우를 비운다
    <div className="flex h-full flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <PhoneTopBar />
      <ConnectionBanner />
      <main className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', isOffline && 'pointer-events-none opacity-60')}>
        {/* 묶음 화면 위쪽 탭 (PC와 같은 탭 줄) */}
        <NavTabs />
        <div className="min-h-0 flex-1">
          <Page />
        </div>
      </main>
      <NoticeBar />
      <PhoneTabBar />
      <StaffPanel />
      <MoreSheet />
      <PathInputSheet />
      {children}
    </div>
  )
}

function PhoneTopBar() {
  const view = useOffice((s) => s.view)
  const setView = useOffice((s) => s.setView)
  const funds = useOffice((s) => s.funds)
  const waitingCount = useOffice((s) => s.staff.filter((x) => x.status === 'waiting').length)
  const setHireOpen = useOffice((s) => s.setHireOpen)
  const isWorkMode = useWorkMode()
  const isAuto = useOffice((s) => s.autoApprove.isActive)
  return (
    // 가로 폰에서는 숨기고 같은 버튼을 아래 탭 줄 오른쪽에 둔다 (PhoneTabBar)
    <header className="short:hidden flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <span className="min-w-0 flex-1 truncate font-semibold">{labelOf(view)}</span>
      {/* 자동결재 표시가 뜨면 폭이 모자라 자금은 숨긴다 (상점·급여 명세서에 같은 값) */}
      {!isWorkMode && !isAuto && (
        <button type="button" onClick={() => setView('shop')} className="bg-accent shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums">
          💰 {formatWon(funds)}
        </button>
      )}
      <AutoApproveBadge isCompact />
      {waitingCount > 0 && (
        <Button size="sm" variant="outline" className="border-status-waiting text-status-waiting shrink-0 px-2" onClick={() => setView('inbox')} aria-label={t('shell.needsAttention', { n: waitingCount })}>
          <BellIcon /> {waitingCount}
        </Button>
      )}
      <Button size="icon" variant="outline" className={cn('shrink-0', view === 'secretary' && 'border-primary text-primary')} onClick={() => setView('secretary')} aria-label={t('shell.secretary')}>
        <SparklesIcon />
      </Button>
      <Button size="icon" className="shrink-0" onClick={() => setHireOpen(true)} aria-label={t('shell.hire')} data-tour="hire">
        <UserPlusIcon />
      </Button>
    </header>
  )
}

function ConnectionBanner() {
  const connection = useMobileUi((s) => s.connection)
  const wasOpen = useMobileUi((s) => s.wasOpen)
  const reconnectedAt = useMobileUi((s) => s.reconnectedAt)
  const lastEventAt = useMobileUi((s) => s.lastEventAt)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!reconnectedAt) return
    const t = setTimeout(() => setTick((n) => n + 1), RECONNECTED_MS)
    return () => clearTimeout(t)
  }, [reconnectedAt])

  if (wasOpen && connection !== 'open') {
    const at = lastEventAt ? fmtDate(lastEventAt, { hour: '2-digit', minute: '2-digit', hour12: false }) : null
    const text =
      connection === 'reconnecting' ? (at ? t('shell.conn.lostAt', { time: at }) : t('shell.conn.lost')) : t('shell.conn.unreachable')
    return (
      <div role="status" className="border-status-waiting/40 bg-status-waiting/10 flex shrink-0 items-center gap-2 border-b px-3 py-2 text-xs">
        <WifiOffIcon className="text-status-waiting size-4 shrink-0" />
        <span className="flex-1">{text}</span>
      </div>
    )
  }
  if (connection === 'open' && reconnectedAt && Date.now() - reconnectedAt < RECONNECTED_MS) {
    return (
      <div role="status" className="border-status-working/40 bg-status-working/10 flex shrink-0 items-center gap-2 border-b px-3 py-2 text-xs">
        <CheckCircle2Icon className="text-status-working size-4 shrink-0" /> {t('shell.conn.back')}
      </div>
    )
  }
  return null
}

/** PC 전용 동작 안내 등 한 줄 (몇 초 뒤 사라진다) */
function NoticeBar() {
  const notice = useMobileUi((s) => s.notice)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => useMobileUi.setState((s) => (s.notice === notice ? { notice: null } : {})), NOTICE_MS)
    return () => clearTimeout(t)
  }, [notice])
  if (!notice) return null
  return (
    // 직원 패널(전체 화면 시트)·대화상자 위에도 보이게 떠 있는 한 줄
    <div role="status" className="bg-card text-foreground short:bottom-[calc(3.5rem+var(--ime,0px))] fixed inset-x-3 bottom-[calc(5rem+var(--ime,0px))] z-[60] rounded-lg border px-3 py-2 text-xs shadow-lg">
      {notice.text}
    </div>
  )
}

function PhoneTabBar() {
  const view = useOffice((s) => s.view)
  const setView = useOffice((s) => s.setView)
  const isWorkMode = useWorkMode()
  const badges = useNavBadges()
  const isKeyboardOpen = useMobileUi((s) => s.isKeyboardOpen)
  const setMoreOpen = useMobileUi((s) => s.setMoreOpen)
  const setHireOpen = useOffice((s) => s.setHireOpen)
  const waitingCount = useOffice((s) => s.staff.filter((x) => x.status === 'waiting').length)
  const tabs = isWorkMode ? WORK_TABS : PHONE_TABS
  // 아래 탭에 이미 숫자가 보이는 화면(업무 보드 등)은 더보기 숫자에 다시 세지 않는다
  const moreViews = moreGroups(isWorkMode).flatMap((g) => visibleTabs(g, isWorkMode).map((x) => x.view)).filter((v) => !tabs.includes(v))
  const moreBadge = moreViews.reduce((n, v) => n + (badges[v] ?? 0), 0)
  // 비서 화면은 상단 바 버튼이 선택 모양 — 아래 탭은 하나도 고르지 않는다
  const isMoreSelected = !tabs.includes(view) && view !== 'secretary'
  // 키보드가 열리면 입력칸이 키보드 바로 위에 붙도록 탭을 숨긴다
  if (isKeyboardOpen) return null
  return (
    <nav className="short:h-11 flex h-16 shrink-0 border-t">
      {tabs.map((v) => {
        const item = NAV_ITEMS.find((i) => i.view === v)!
        const Icon = v === 'dashboard' ? LayoutGridIcon : item.icon
        return <Tab key={v} label={item.label} icon={<Icon className="size-5" />} isSelected={view === v} badge={badges[v]} onClick={() => setView(v)} tour={`nav-${v}`} />
      })}
      <Tab label={t('shell.more')} icon={<EllipsisIcon className="size-5" />} isSelected={isMoreSelected} badge={moreBadge} onClick={() => setMoreOpen(true)} tour="nav-more" />
      {/* 가로 폰: 숨긴 상단 바의 확인 필요·직원 고용 */}
      <div className="short:flex hidden shrink-0 items-center gap-1 border-l px-2">
        {waitingCount > 0 && (
          <Button size="sm" variant="outline" className="border-status-waiting text-status-waiting px-2" onClick={() => setView('inbox')} aria-label={t('shell.needsAttention', { n: waitingCount })}>
            <BellIcon /> {waitingCount}
          </Button>
        )}
        <Button size="icon" onClick={() => setHireOpen(true)} aria-label={t('shell.hire')}>
          <UserPlusIcon />
        </Button>
      </div>
    </nav>
  )
}

function Tab({ label, icon, isSelected, badge, onClick, tour }: { label: string; icon: React.ReactNode; isSelected: boolean; badge?: number; onClick: () => void; tour: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour={tour}
      aria-current={isSelected ? 'page' : undefined}
      className={cn('relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', isSelected ? 'text-foreground font-medium' : 'text-muted-foreground')}
    >
      <span className={cn('rounded-full px-4 py-0.5', isSelected && 'bg-accent')}>{icon}</span>
      {/* 가로 폰은 아이콘만 (이름은 읽어 주기용으로 남긴다) */}
      <span className="short:sr-only truncate">{label}</span>
      {Boolean(badge) && <span className="bg-status-waiting short:top-0.5 absolute top-1.5 left-1/2 ml-2 rounded-full px-1.5 text-[10px] font-semibold text-background">{badge}</span>}
    </button>
  )
}

/** 더보기 안 메뉴: 사이드바와 같은 묶음 중 아래 탭만으로 다 열 수 없는 것 (같은 순서). 비서는 상단 바 버튼 */
function moreGroups(isWorkMode: boolean): NavGroup[] {
  const tabs = isWorkMode ? WORK_TABS : PHONE_TABS
  return visibleGroups(NAV_GROUPS, isWorkMode).filter((g) => g.id !== 'secretary' && visibleTabs(g, isWorkMode).some((x) => !tabs.includes(x.view)))
}

function MoreSheet() {
  const isOpen = useMobileUi((s) => s.isMoreOpen)
  const setMoreOpen = useMobileUi((s) => s.setMoreOpen)
  const view = useOffice((s) => s.view)
  const isWorkMode = useWorkMode()
  const badges = useNavBadges()
  const openGroup = useOpenGroup()
  const newVersion = notifiableVersion(useUpdateStore((s) => s.status))
  const currentId = groupOfView(NAV_GROUP_DEFS, view)?.id
  // 묶음을 누르면 그 묶음에서 마지막으로 본 탭으로 (화면 위쪽 탭 줄로 옮겨 다닌다)
  const go = (g: NavGroup) => {
    openGroup(g)
    setMoreOpen(false)
  }
  return (
    <Dialog open={isOpen} onOpenChange={setMoreOpen}>
      {/* 첫 메뉴에 포커스 테두리가 생기지 않게 */}
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('shell.more')}</DialogTitle>
          <DialogDescription className="sr-only">{t('shell.moreDesc')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-0.5">
          {moreGroups(isWorkMode).map((g) => {
            const Icon = g.icon
            const badge = groupBadge(g, badges, isWorkMode)
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => go(g)}
                data-tour={`nav-${g.id}`}
                className={cn('flex min-h-12 items-center gap-2 rounded-md px-2.5 text-left text-sm', currentId === g.id ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground')}
              >
                <Icon className="size-4" />
                <span className="flex-1">{g.label}</span>
                {badge > 0 && <span className="bg-status-waiting rounded-full px-1.5 text-[10px] font-semibold text-background">{badge}</span>}
                {g.id === 'config' && newVersion && <span className="bg-status-waiting rounded-full px-1.5 text-[10px] font-semibold text-background">{t('update.badgeShort')}</span>}
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** pickFolder·pickFiles 대신: PC의 경로를 적거나 최근 폴더에서 고른다 (배치안 6절) */
function PathInputSheet() {
  const request = useMobileUi((s) => s.pathRequest)
  const finishPath = useMobileUi((s) => s.finishPath)
  const staff = useOffice((s) => s.staff)
  const labs = useOffice((s) => s.labs)
  const [value, setValue] = useState('')
  useEffect(() => setValue(''), [request])
  const isFiles = request?.kind === 'files'
  const recent = isFiles ? [] : recentFolders(staff, labs)
  const submit = () => {
    if (isFiles) return finishPath(value.split('\n').map((l) => l.trim()).filter(Boolean))
    finishPath(value.trim() || null)
  }
  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && finishPath(isFiles ? [] : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isFiles ? t('shell.pickFiles') : t('shell.pickFolder')}</DialogTitle>
          <DialogDescription>
            {isFiles ? t('shell.pickFilesDesc') : t('shell.pickFolderDesc')}
          </DialogDescription>
        </DialogHeader>
        {isFiles ? (
          <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('shell.filePathPlaceholder')} className="min-h-24 font-mono" />
        ) : (
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('shell.folderPathPlaceholder')} className="font-mono" />
        )}
        {recent.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">{t('shell.recentFolders')}</span>
            {recent.map((p) => (
              <button key={p} type="button" onClick={() => finishPath(p)} className="hover:bg-accent flex min-h-12 items-center gap-2 rounded-md border px-2.5 text-left font-mono text-xs break-all">
                <FolderIcon className="text-muted-foreground size-4 shrink-0" />
                {p}
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => finishPath(isFiles ? [] : null)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={!value.trim()}>
            {t('shell.choose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
