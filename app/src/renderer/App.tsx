import { useEffect, useState } from 'react'
import { BellIcon, SparklesIcon, StoreIcon, UserPlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CoachTour } from '@/features/CoachTour'
import { Onboarding } from '@/features/Onboarding'
import { TutorialDone, TutorialGuide, TutorialPicker } from '@/features/Tutorial'
import { HireDialog } from '@/features/HireDialog'
import { Sidebar } from '@/features/Sidebar'
import { StaffPanel } from '@/features/StaffPanel'
import { LevelUp } from '@/features/LevelUp'
import { DemoStage } from '@/features/DemoStage'
import { WhatsNew } from '@/features/WhatsNew'
import { UpdateNotice } from '@/features/AppUpdate'
import { RemoteLanNotice, RemoteUpgradeNotice } from '@/features/RemoteUpgradeNotice'
import { QuickSecretary } from '@/features/secretary/QuickSecretary'
import { AutoApproveBadge } from '@/features/AutoApprove'
import { MOD_KEY } from '@/lib/platform'
import { IS_MOBILE_SHELL } from '@/shell'
import { PlanUsageChip } from '@/features/PlanUsageCard'
import { formatWon } from '@shared/economy'
import { PhoneShell } from '@/layout/PhoneShell'
import { PAGES } from '@/layout/pages'
import { useLayout } from '@/layout/useLayout'
import { useLang } from '@/lib/i18n'
import { connectOffice, useOffice, useWorkMode } from './store'
import { ToastHost } from '@/lib/toast'
import { t } from '@shared/i18n'

export default function App() {
  useEffect(() => connectOffice(), [])
  // 언어를 바꾸면 화면 전체를 다시 그려 모든 글자를 새 언어로 (저장 데이터는 store에 있어 그대로)
  const lang = useLang()
  return <AppBody key={lang} />
}

function AppBody() {
  const [isTourOpen, setIsTourOpen] = useState(false)
  // 코치마크를 끝까지 보면 "한 사이클 해 보기" 선택을 띄운다
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const tourRequest = useOffice((s) => s.tourRequest)
  useEffect(() => {
    if (tourRequest) setIsTourOpen(true)
  }, [tourRequest])
  // 폰(모바일 빌드 · 폭 840 미만)은 아래 탭 틀, 그 밖(PC·태블릿)은 지금 틀 그대로
  const isPhone = useLayout() === 'phone'
  // ⌘K(윈도우 Ctrl+K): 어느 화면에서나 비서 빠른 창 — 입력칸에 포커스가 있어도 먼저 받는다 (폰은 상단 바 버튼)
  useEffect(() => {
    if (isPhone) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      e.preventDefault()
      const s = useOffice.getState()
      s.setQuickSecretaryOpen(!s.isQuickSecretaryOpen)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [isPhone])
  const overlays = (
    <>
      <HireDialog />
      <Onboarding onStartTour={() => setIsTourOpen(true)} />
      <CoachTour
        isOpen={isTourOpen}
        onClose={(isFinished) => {
          setIsTourOpen(false)
          setIsPickerOpen(isFinished)
        }}
      />
      <TutorialPicker isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} />
      <TutorialGuide />
      <TutorialDone />
      <WhatsNew isBusy={isTourOpen || isPickerOpen} />
      <UpdateNotice />
      <LevelUp />
      {!isPhone && <QuickSecretary />}
      {/* PC 주인에게만 (휴대폰에서 QR을 다시 만들면 그 휴대폰이 끊긴다) */}
      {!IS_MOBILE_SHELL && <RemoteUpgradeNotice />}
      {!IS_MOBILE_SHELL && <RemoteLanNotice />}
      {/* 발표장 화면은 PC 전용 (휴대폰은 회의실 기록으로 본다) */}
      {!IS_MOBILE_SHELL && <DemoStage />}
    </>
  )
  if (!IS_MOBILE_SHELL) return <DesktopShell>{overlays}</DesktopShell>
  // 휴대폰 앱: 폰↔태블릿 배치가 바뀌어도(회전·폴드 펼침) 고용 창 같은 대화상자는 다시 만들지 않게 틀 밖 형제로 둔다 (모두 Portal·fixed라 자리는 같다)
  return (
    <>
      {isPhone ? <PhoneShell /> : <DesktopShell />}
      {overlays}
    </>
  )
}

function DesktopShell({ children }: { children?: React.ReactNode }) {
  const view = useOffice((s) => s.view)
  const setView = useOffice((s) => s.setView)
  const staff = useOffice((s) => s.staff)
  const isLoaded = useOffice((s) => s.isLoaded)
  const funds = useOffice((s) => s.funds)
  const isWorkMode = useWorkMode()
  const planUsage = useOffice((s) => s.planUsage)
  const setHireOpen = useOffice((s) => s.setHireOpen)

  const waitingCount = staff.filter((s) => s.status === 'waiting').length
  const Page = PAGES[view]

  return (
    <div className="flex h-full flex-col">
      {/* 상단 바를 창 드래그 영역으로 쓴다. 맥은 왼쪽 신호등 자리, 윈도우는 오른쪽 위 창 버튼(최소화·최대화·닫기) 자리를 비운다 */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b pr-3 pl-20 [-webkit-app-region:drag] win:pr-[144px] win:pl-3 android:pl-3">
        <span className="font-semibold">AI Office</span>
        {!isWorkMode && (
          <button
            type="button"
            onClick={() => setView('shop')}
            className="bg-accent rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums [-webkit-app-region:no-drag]"
            title={t('shell.funds.title')}
          >
            💰 {formatWon(funds)}
          </button>
        )}
        {/* 실제 한도는 Claude 플랜 사용률 (앱이 환산하던 $·예산 대신) */}
        <PlanUsageChip usage={planUsage} onOpen={() => setView('payroll')} />
        <div className="ml-auto flex items-center gap-1 [-webkit-app-region:no-drag]">
          <AutoApproveBadge />
          {waitingCount > 0 && (
            <Button size="sm" variant="outline" className="border-status-waiting text-status-waiting" onClick={() => setView('inbox')}>
              <BellIcon /> {t('shell.needsAttention', { n: waitingCount })}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => useOffice.getState().setQuickSecretaryOpen(true)}>
            <SparklesIcon /> {t('shell.secretary')} <span className="text-muted-foreground text-[11px]">{MOD_KEY}K</span>
          </Button>
          <Button size="sm" onClick={() => setHireOpen(true)} data-tour="hire">
            <UserPlusIcon /> {t('shell.hire')}
          </Button>
        </div>
      </header>
      {isLoaded && staff.length === 0 && <EmptyOfficeHint />}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-h-0 min-w-0 flex-1">
          <Page />
        </main>
        <StaffPanel />
      </div>
      {children}
      <ToastHost />
    </div>
  )
}

/** 사무실에 직원이 없을 때: 직원 마켓으로 안내 */
function EmptyOfficeHint() {
  const openMarket = useOffice((s) => s.openMarket)
  if (typeof window.officePack === 'undefined') return null
  return (
    <div className="bg-accent/50 flex shrink-0 items-center gap-3 border-b px-4 py-2 text-sm">
      <StoreIcon className="size-4 shrink-0" />
      <span>{t('market.empty.hint')}</span>
      <Button size="sm" className="ml-auto" onClick={openMarket}>
        {t('market.bring')}
      </Button>
    </div>
  )
}
