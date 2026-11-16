// 오른쪽 위 ? 도움말: 지금 화면 설명 · 연습(AI 사용량 없음) · 화면 둘러보기 · 처음 힌트 다시 보기 · 처음 안내 다시 보기 (handoff onboarding-shorten ②)
import { useEffect, useState } from 'react'
import { CheckIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { useOffice, useWorkMode } from '@/store'
import { hasDoneFirstTask } from '@/lib/firstTaskDone'
import type { TutorialScenario } from '@shared/tutorial'
import { t } from '@shared/i18n'
import { DuoIcon, IconText } from '@/components/duo-icon'
import { moreTourCount, screenHelp } from './CoachTour'
import { menuTitle } from './nav'
import { IS_REMOTE_SCREEN } from '@/shell'

const PRACTICE_MINUTES = 1
const NO_COMPLETED: TutorialScenario[] = []

/** 위 막대의 ? 버튼 + 서랍 (PC는 오른쪽, 폰은 아래에서 올라오는 시트) */
export function HelpButton({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title={t('helpMenu.open')}
        aria-label={t('helpMenu.open')}
        aria-expanded={isOpen}
        data-tour="help"
        className={cn('help-button border-border text-primary hover:bg-accent flex size-[26px] shrink-0 items-center justify-center rounded-full border text-sm font-bold [-webkit-app-region:no-drag]', className)}
      >
        ?
      </button>
      {isOpen && <HelpDrawer onClose={() => setIsOpen(false)} />}
    </>
  )
}

function HelpDrawer({ onClose }: { onClose: () => void }) {
  const isWorkMode = useWorkMode()
  const view = useOffice((s) => s.view)
  const completed = useOffice((s) => s.tutorial?.completed ?? NO_COMPLETED)
  const here = screenHelp(view)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }
  const practice = (scenario: TutorialScenario) => run(() => void window.office.tutorialStart(scenario))
  const isTried = (scenario: TutorialScenario) => completed.includes(scenario) || (scenario === 'task' && hasDoneFirstTask())
  const resetHints = run(() => {
    void window.office.updateSettings({ seenHints: [], isHintsOff: false })
    showToast(t('helpMenu.hintsResetToast'))
  })
  const row = 'hover:bg-accent flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm'
  const heading = 'text-muted-foreground px-2.5 pt-3 pb-1 text-[11px] font-semibold'

  return (
    <div className="fixed inset-0 z-[95]" onPointerDown={onClose}>
      <div className="bg-overlay absolute inset-0" />
      <div
        role="dialog"
        aria-modal
        aria-label={t('helpMenu.open')}
        data-help-drawer
        onPointerDown={(e) => e.stopPropagation()}
        // PC는 오른쪽 서랍, 폰은 아래에서 올라오는 시트
        className="bg-background phone:top-auto phone:left-0 phone:w-full phone:max-h-[80%] phone:rounded-t-2xl phone:pb-[max(12px,env(safe-area-inset-bottom))] absolute top-0 right-0 bottom-0 flex w-[300px] max-w-full flex-col overflow-y-auto border p-3 shadow-2xl"
      >
        <div className="flex items-center px-2.5 py-1">
          <span className="font-semibold">{t('helpMenu.open')}</span>
          <button type="button" onClick={onClose} aria-label={t('helpMenu.close')} className="text-muted-foreground hover:text-foreground ml-auto">
            <XIcon className="size-4" />
          </button>
        </div>
        {here && (
          <>
            <div className={heading}>{t('helpMenu.here', { view: menuTitle(view) })}</div>
            <p className="text-muted-foreground px-2.5 text-sm">{here}</p>
          </>
        )}
        {/* 연습은 PC에서만 — 휴대폰·원격 화면은 맨 아래에 한 줄로 알린다 */}
        {!IS_REMOTE_SCREEN && <div className={heading}>{t('helpMenu.practice')}</div>}
        {!IS_REMOTE_SCREEN && (['task', 'meeting'] as const).map((scenario) => (
          <button key={scenario} type="button" className={row} onClick={practice(scenario)}>
            {scenario === 'task' ? <IconText text="💬" size={16} /> : <DuoIcon name="meeting" size={16} />}
            <span className="min-w-0 flex-1">
              {t(scenario === 'task' ? 'tutorial.picker.task' : 'tutorial.picker.meeting')} · {t('helpMenu.min', { n: PRACTICE_MINUTES })}
            </span>
            {isTried(scenario) && (
              <span className="text-primary flex shrink-0 items-center gap-0.5 text-[11px] font-semibold">
                <CheckIcon className="size-3.5" /> {t('tutorial.picker.tried')}
              </span>
            )}
          </button>
        ))}
        <div className={heading}>{t('helpMenu.more')}</div>
        <button type="button" className={row} onClick={run(() => useOffice.getState().requestTour())}>
          <IconText text="🧭" size={16} /> {t('helpMenu.tour', { n: moreTourCount(isWorkMode) })}
        </button>
        <button type="button" className={row} onClick={resetHints}>
          <IconText text="💡" size={16} /> {t('helpMenu.hintsReset')}
        </button>
        {/* 처음 안내는 연습이 중심이라 PC에서만 다시 연다 */}
        {!IS_REMOTE_SCREEN && (
          <button type="button" className={row} onClick={run(() => void window.office.updateSettings({ isOnboarded: false }))}>
            <span className="w-4 text-center">↺</span> {t('settingsPage.guide.onboarding')}
          </button>
        )}
        {IS_REMOTE_SCREEN && <p className="text-muted-foreground px-2.5 pt-3 text-xs">{t('helpMenu.practicePcOnly')}</p>}
      </div>
    </div>
  )
}
