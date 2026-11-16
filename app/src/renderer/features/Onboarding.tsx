import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { osText } from '@/lib/platform'
import { showToast } from '@/lib/toast'
import { loginGate } from '@/lib/firstTaskFlow'
import { createLatestRequest } from '@/lib/latestRequest'
import { useOffice, useWorkMode } from '@/store'
import type { ClaudeStatus } from '@shared/types'
import { DONE_STEP } from '@shared/tutorial'
import { formatWon } from '@shared/economy'
import { Avatar } from './StaffCard'
import { ProviderCards, RecheckButton, useProviders } from './ProviderCards'
import { moreTourCount } from './CoachTour'
import { t } from '@shared/i18n'
import { DuoIcon, IconText } from '@/components/duo-icon'
import { IS_REMOTE_SCREEN } from '@/shell'

const WELCOME_AVATARS = [1, 13, 5, 18, 2, 22]
/** 환영 화면의 예상 시간(분) — 실제로 재 보면 맞춘다 */
const PRACTICE_MINUTES = 2
const MEETING_MINUTES = 1
// 첫 실행 안내: 환영 → AI 계정 확인 → 업무 연습(진짜 화면 위 안내 — 이 창은 숨는다) → 끝(첫 직원 추가)
// 작업 폴더는 직원을 추가할 때 고르고(고용 창 첫 힌트), 연습은 AI를 부르지 않는다 (handoff onboarding-shorten)
const DOT_STEPS = ['welcome', 'login', 'practice'] as const
type Step = (typeof DOT_STEPS)[number] | 'finish'

/** 언어를 바꿔 화면 틀을 새로 그려도 연습 중이던 안내가 처음으로 돌아가지 않게 단계를 모듈에 둔다 */
let keptStep: Step = 'welcome'

function StepDots({ step }: { step: Step }) {
  return (
    <div className="flex gap-1.5">
      {DOT_STEPS.map((s) => (
        <span key={s} className={cn('h-1.5 rounded-full transition-all', s === step ? 'bg-primary w-6' : 'bg-muted w-1.5')} />
      ))}
    </div>
  )
}

/** 첫 실행 안내 (isOnboarded가 false인 동안). 어디서 끝내든 isOnboarded: true를 저장한다 */
export function Onboarding() {
  const isOnboarded = useOffice((s) => s.settings.isOnboarded)
  const isLoaded = useOffice((s) => s.isLoaded)
  const tut = useOffice((s) => s.tutorial)
  const isWorkMode = useWorkMode()
  const [step, setStepState] = useState<Step>(keptStep)
  const setStep = useCallback((next: Step) => {
    keptStep = next
    setStepState(next)
  }, [])
  const [status, setStatus] = useState<ClaudeStatus | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const providers = useProviders(false)
  const checkProviders = providers.check
  // 둘 중 하나만 준비돼도 통과 — 둘 다 결과가 올 때까지는 확인 중
  const gate = loginGate(status ? status.isLoggedIn : null, providers.status)

  // Claude 조회도 겹치면 마지막에 보낸 것의 응답만 쓴다 (4초 조용한 조회·다시 확인이 겹칠 때)
  const claudeRequests = useRef(createLatestRequest()).current
  /** isSilent: 주기적으로 다시 볼 때 — 확인 중 표시 없이, 이미 묻는 중이면 건너뛴다 */
  const check = useCallback(
    async ({ isSilent = false }: { isSilent?: boolean } = {}) => {
      if (isSilent && claudeRequests.isPending) return
      if (!isSilent) setIsChecking(true)
      try {
        const { value, isLatest } = await claudeRequests.run(() => window.office.claudeStatus())
        if (isLatest) setStatus(value)
      } finally {
        if (!claudeRequests.isPending) setIsChecking(false)
      }
    },
    [claudeRequests],
  )

  // 로그인 단계에 들어올 때마다 두 공급자를 함께 새로 확인한다 (지난 결과를 그대로 믿지 않는다)
  useEffect(() => {
    if (step !== 'login') return
    void check()
    void checkProviders()
  }, [step, check, checkProviders])

  // 설정 › 안내·? 도움말에서 다시 열면 처음부터. 안내를 마치기 전에 끈 앱을 다시 켜도(연습 중이었어도) 환영부터 — 남은 연습 안내는 접는다
  const isRunningTutorial = Boolean(tut?.scenario && tut.step !== DONE_STEP)
  useEffect(() => {
    if (isOnboarded) {
      keptStep = 'welcome'
      return
    }
    if (keptStep === 'practice' || keptStep === 'finish') return
    setStep('welcome')
    if (isRunningTutorial) void window.office.tutorialAct({ type: 'end' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 안내가 다시 열릴 때·처음 그릴 때만
  }, [isOnboarded, isLoaded])

  // 연습이 끝나거나(축하 단계) 튜토리얼 끝내기·Esc로 접히면 끝 화면으로. 시작을 보낸 직후 아직 시작 전인 상태는 건너뛴다
  const hasPracticeStarted = useRef(false)
  useEffect(() => {
    if (step !== 'practice') {
      hasPracticeStarted.current = false
      return
    }
    if (isRunningTutorial) hasPracticeStarted.current = true
    else if (hasPracticeStarted.current || tut?.step === DONE_STEP) setStep('finish')
  }, [step, isRunningTutorial, tut?.step, setStep])

  // 로그인 창을 띄운 뒤에는 둘 다 준비될 때까지 두 공급자를 조용히 다시 확인한다 (하나만 돼도 통과지만, 나머지도 되면 ✓로 보이게)
  const isWaitingFix = step === 'login' && !gate.isChecking && !gate.isBothReady
  useEffect(() => {
    if (!isWaitingFix) return
    const timer = setInterval(() => {
      void check({ isSilent: true })
      void checkProviders({ isSilent: true })
    }, 4000)
    return () => clearInterval(timer)
  }, [isWaitingFix, check, checkProviders])

  // 휴대폰·원격 화면에는 띄우지 않는다 — 안내의 중심인 연습과 AI 계정 확인은 PC에서 한다 (휴대폰은 처음 힌트·? 도움말만)
  if (!isLoaded || isOnboarded || step === 'practice' || IS_REMOTE_SCREEN) return null

  const reward = tut?.step === DONE_STEP ? tut.reward : 0
  /** 안내를 마친다 — 축하 단계에 머문 연습은 접는다 (연습 회사는 첫 실제 고용 때 저절로 지워진다) */
  const finish = () => {
    if (tut?.scenario) void window.office.tutorialAct({ type: 'end' })
    keptStep = 'welcome'
    void window.office.updateSettings({ isOnboarded: true })
  }
  // 건너뛰기·나중에: 다시 보는 곳을 알려 준다
  const handleLater = () => {
    finish()
    useOffice.getState().setView('map')
    showToast(t('guideHint.replayToast'))
  }
  const handleHire = () => {
    finish()
    const s = useOffice.getState()
    s.setView('map')
    s.setHireOpen(true)
  }
  const handleMeeting = () => {
    finish()
    void window.office.tutorialStart('meeting')
  }
  const handleTour = () => {
    finish()
    useOffice.getState().requestTour()
  }
  const startPractice = () => {
    setStep('practice')
    useOffice.getState().setView('map')
    void window.office.tutorialStart('task')
  }
  const isBusy = isChecking || providers.isChecking || gate.isChecking

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-6">
      <div className={cn('bg-background flex max-h-full w-full flex-col gap-5 overflow-y-auto rounded-2xl border p-7 shadow-2xl', step === 'login' ? 'max-w-xl' : 'max-w-[440px]')}>
        {step === 'welcome' && (
          <>
            <div className="flex justify-center gap-2">
              {WELCOME_AVATARS.map((a, i) => (
                <Avatar key={a} avatar={a} className={cn('size-12', i % 2 === 1 && 'translate-y-2')} />
              ))}
            </div>
            <div className="flex flex-col gap-2 text-center">
              <h1 className="text-2xl font-bold">{t('onboarding.welcome.title')}</h1>
              <p className="text-muted-foreground text-sm">{t('onboarding.welcome.lead')}</p>
            </div>
            {/* 곧 해 볼 것: 일 시키기 → 결재하기 → 결과 받기 */}
            <div className="flex items-stretch justify-center gap-1.5 text-xs font-medium">
              {[
                { icon: '💬', label: t('onboarding.welcome.flow.task') },
                { icon: '✅', label: t('onboarding.welcome.flow.approve') },
                { icon: '📦', label: t('onboarding.welcome.flow.result') },
              ].map((c, i) => (
                <div key={c.icon} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-muted-foreground">→</span>}
                  <div className="bg-card flex min-w-0 flex-col items-center gap-1 rounded-xl border px-3 py-2 text-center">
                    <IconText text={c.icon} size={20} />
                    <span>{c.label}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* 유료 계정이 필요하다는 사실을 로그인 단계 전에 알린다 */}
            <p className="bg-muted rounded-lg px-3 py-2 text-center text-sm">{t('onboarding.welcome.needs')}</p>
            <p className="text-muted-foreground -mt-2 text-center text-xs">{t('onboarding.welcome.free')}</p>
            <div className="flex items-center justify-between gap-2">
              <StepDots step={step} />
              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleLater}>
                  {t('onboarding.skip')}
                </Button>
                <Button onClick={() => setStep('login')}>{t('onboarding.startTimed', { n: PRACTICE_MINUTES })}</Button>
              </div>
            </div>
          </>
        )}

        {step === 'login' && (
          <>
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-bold">{t('onboarding.provider.title')}</h1>
              <p className="text-muted-foreground text-sm">
                {t(gate.isChecking ? 'onboarding.provider.checkingDesc' : gate.isBothReady ? 'onboarding.provider.bothDesc' : gate.isOk ? 'onboarding.provider.passDesc' : 'onboarding.provider.gateDesc')}
              </p>
            </div>
            <ProviderCards
              status={providers.status}
              isChecking={isChecking || providers.isChecking}
              onRecheck={() => void checkProviders()}
              claudeExtra={
                <div className="text-muted-foreground flex flex-col gap-1 text-xs">
                  <span>{t('onboarding.login.desc')}</span>
                  <ol className="list-decimal space-y-0.5 pl-4">
                    <li>{t('onboarding.login.step1')}</li>
                    <li>{t('onboarding.login.step2')}</li>
                    <li>{t('onboarding.login.step3')}</li>
                  </ol>
                  {/* 브라우저를 못 열면 터미널 창으로 돌아간다 — 그때 할 일 */}
                  <span>{t('onboarding.login.terminalFallback', { window: osText(t('onboarding.login.window.mac'), t('onboarding.login.window.win')) })}</span>
                </div>
              }
            />
            <RecheckButton
              isChecking={isChecking || providers.isChecking}
              onCheck={() => {
                void check()
                void checkProviders()
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StepDots step={step} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setStep('welcome')}>
                  {t('onboarding.prev')}
                </Button>
                {/* 연습은 AI를 부르지 않아 계정이 없어도 할 수 있다 — 계정은 나중에 안내 띠·설정 › AI·업무에서 */}
                {gate.isBlocked && (
                  <Button variant="outline" onClick={startPractice}>
                    {t('onboarding.login.practiceAnyway')}
                  </Button>
                )}
                <Button onClick={startPractice} disabled={!gate.isOk || isBusy}>
                  {isBusy ? (
                    <>
                      <Loader2Icon className="animate-spin" /> {t('onboarding.checking')}
                    </>
                  ) : (
                    t('onboarding.login.toPractice')
                  )}
                </Button>
              </div>
            </div>
          </>
        )}

        {step === 'finish' && (
          <>
            <div className="flex flex-col gap-1.5 text-center">
              <h1 className="text-2xl font-bold">
                <IconText text={t('tutorial.done.title')} size={22} />
              </h1>
              <p className="text-muted-foreground text-sm">{t('tutorial.done.task')}</p>
              {reward > 0 && !isWorkMode && (
                <div className="bg-accent mx-auto mt-1 rounded-full px-3 py-1 text-sm font-semibold tabular-nums">
                  <DuoIcon name="money" size={14} className="mr-1" />
                  {t('tutorial.done.reward', { amount: formatWon(reward) })}
                </div>
              )}
            </div>
            <button type="button" onClick={handleHire} className="border-primary hover:bg-accent flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors">
              <IconText text="🧑‍💼" size={24} />
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{t('onboarding.finish.hire')}</span>
                <span className="text-muted-foreground text-xs">{t('onboarding.finish.hireDesc')}</span>
              </span>
            </button>
            <div className="flex flex-col gap-2">
              <span className="text-muted-foreground text-xs">{t('onboarding.finish.more')}</span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-full" onClick={handleMeeting}>
                  <IconText text="🗣️" size={14} /> {t('tutorial.picker.meeting')} · {t('helpMenu.min', { n: MEETING_MINUTES })}
                </Button>
                <Button size="sm" variant="outline" className="rounded-full" onClick={handleTour}>
                  <IconText text="🧭" size={14} /> {t('helpMenu.tour', { n: moreTourCount(isWorkMode) })}
                </Button>
              </div>
              <span className="text-muted-foreground text-xs">{t('onboarding.finish.cleanupNote')}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleLater}>
                {t('onboarding.later.short')}
              </Button>
              <Button onClick={handleHire}>{t('coachTour.hireStaff')}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
