import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2Icon, CircleAlertIcon, CircleDashedIcon, CircleXIcon, FolderOpenIcon, InboxIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { osText } from '@/lib/platform'
import { showToast } from '@/lib/toast'
import { FAIL_ACTIONS, type FirstTaskAction, loginGate, showsErrorDetail } from '@/lib/firstTaskFlow'
import { createLatestRequest } from '@/lib/latestRequest'
import { useOffice } from '@/store'
import type { AiProvider, ClaudeStatus } from '@shared/types'
import { Avatar } from './StaffCard'
import { shortPath } from './status'
import { ProviderCards, RecheckButton, useProviders } from './ProviderCards'
import { fmtDate, t, trOr, type TKey } from '@shared/i18n'
import { type FirstTaskExample, type FirstTaskFail, useFirstTask } from './useFirstTask'
import { DuoIcon, IconText } from '@/components/duo-icon'

const WELCOME_AVATARS = [1, 13, 5, 18, 2, 22]
// 준비 점검은 로그인 → 작업 폴더를 한 단계씩 (막히면 그 자리의 버튼으로 해결). 터미널용 Claude Code 설치는 선택이라 점검에서 뺐다
// 마지막 점검(firstTask)은 직원 1명에게 예제 업무를 실제로 맡겨 본다 — 고르기·일하는 중·실패는 그 안의 상태
const STEPS = ['welcome', 'login', 'folder', 'firstTask', 'ready'] as const
type Step = (typeof STEPS)[number]
const CHECK_STEPS: Step[] = ['login', 'folder', 'firstTask']
const ACCOUNT_NAME: Record<AiProvider, string> = { claude: 'Claude', codex: 'ChatGPT' }
const FAIL_TEXT: Record<FirstTaskFail, TKey> = {
  login: 'onboarding.firstTask.fail.login',
  limit: 'onboarding.firstTask.fail.limit',
  timeout: 'onboarding.firstTask.fail.timeout',
  network: 'onboarding.firstTask.fail.network',
  unknown: 'onboarding.firstTask.fail.unknown',
}
const ACTION_TEXT: Record<FirstTaskAction, TKey> = {
  toLogin: 'onboarding.firstTask.recheckLogin',
  retry: 'onboarding.firstTask.retry',
  openStaff: 'onboarding.firstTask.continueInOffice',
  practice: 'onboarding.firstTask.practice',
}

const fmtSeconds = (ms: number) => t('onboarding.firstTask.seconds', { n: Math.round(ms / 1000) })

function StepDots({ step }: { step: Step }) {
  return (
    <div className="flex gap-1.5">
      {STEPS.map((s) => (
        <span key={s} className={cn('h-1.5 rounded-full transition-all', s === step ? 'bg-primary w-6' : 'bg-muted w-1.5')} />
      ))}
    </div>
  )
}

/** isOptional: 없어도 되는 항목 — 안 돼 있어도 경고 색 대신 중립 색으로 */
function CheckRow({
  isOk,
  isLoading,
  isError,
  isOptional,
  title,
  children,
}: {
  isOk: boolean
  isLoading?: boolean
  isError?: boolean
  isOptional?: boolean
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn('flex gap-3 rounded-xl border p-4', isError ? 'border-destructive/60' : !isOk && !isLoading && !isOptional && 'border-status-waiting/60')}>
      {isLoading ? (
        <Loader2Icon className="text-muted-foreground mt-0.5 size-5 shrink-0 animate-spin" />
      ) : isError ? (
        <CircleXIcon className="text-destructive mt-0.5 size-5 shrink-0" />
      ) : isOk ? (
        <CheckCircle2Icon className="text-status-working mt-0.5 size-5 shrink-0" />
      ) : isOptional ? (
        <CircleDashedIcon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
      ) : (
        <CircleAlertIcon className="text-status-waiting mt-0.5 size-5 shrink-0" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
        <div className="font-semibold">{title}</div>
        {children}
      </div>
    </div>
  )
}

/** 점검 단계 머리말 — "1/3 AI 계정 연결" */
function CheckHeader({ step, title, desc }: { step: Step; title: string; desc: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs tabular-nums">{t('onboarding.checkStep', { n: CHECK_STEPS.indexOf(step) + 1, total: CHECK_STEPS.length })}</span>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-muted-foreground text-sm">{desc}</p>
    </div>
  )
}

/**
 * 점검 단계 아래: 이전 / 다음 (아직 안 됐으면 "나중에 할게요"로 넘어간다).
 * onSkipToTour: 막혀서 다음으로 못 갈 때 남은 점검을 건너뛰고 둘러보기로 가는 길
 * isChecking: 상태를 확인하는 동안은(이미 받은 결과가 있어도 다시 확인 중이면) 다음·건너뛰기를 막고 '확인 중…'을 보인다
 */
function CheckFooter({
  step,
  isOk,
  isBlocked,
  isChecking,
  onMove,
  onSkipToTour,
}: {
  step: Step
  isOk: boolean
  isBlocked?: boolean
  isChecking?: boolean
  onMove: (step: Step) => void
  onSkipToTour?: () => void
}) {
  const i = STEPS.indexOf(step)
  return (
    <div className="flex items-center justify-between">
      <StepDots step={step} />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => onMove(STEPS[i - 1])}>
          {t('onboarding.prev')}
        </Button>
        {/* 공급자가 하나도 준비되지 않으면 첫 업무를 할 수 없어 "나중에" 대신 둘러보기로 보낸다 (계정은 나중에 설정 › 연결에서) */}
        {isBlocked && onSkipToTour && (
          <Button variant="outline" onClick={onSkipToTour} disabled={isChecking}>
            {t('onboarding.provider.laterTour')}
          </Button>
        )}
        <Button variant={isOk ? 'default' : 'outline'} onClick={() => onMove(STEPS[i + 1])} disabled={isBlocked || isChecking}>
          {isChecking ? (
            <>
              <Loader2Icon className="animate-spin" /> {t('onboarding.checking')}
            </>
          ) : isOk || isBlocked ? (
            t('onboarding.next')
          ) : (
            t('onboarding.later')
          )}
        </Button>
      </div>
    </div>
  )
}

/** 첫 실행 안내: 앱 소개 → 준비 점검 마법사(로그인·작업 폴더·첫 업무) → 둘러보기(코치마크) */
export function Onboarding({ onStartTour }: { onStartTour: () => void }) {
  const isOnboarded = useOffice((s) => s.settings.isOnboarded)
  const isLoaded = useOffice((s) => s.isLoaded)
  const [step, setStep] = useState<Step>('welcome')
  const [status, setStatus] = useState<ClaudeStatus | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const defaultCwd = useOffice((s) => s.settings.defaultCwd)
  // 로그인 단계는 아래에서 Claude·Codex를 직접 함께 확인한다. 첫 업무 단계는 Claude가 안 될 때만 Codex를 본다
  const providers = useProviders(step === 'firstTask' && !status?.isLoggedIn)
  const checkProviders = providers.check
  // 둘 중 하나만 준비돼도 통과 — 둘 다 결과가 올 때까지는 확인 중
  const gate = loginGate(status ? status.isLoggedIn : null, providers.status)
  const isBothReady = gate.isBothReady
  // 첫 업무 직원: 통과 판단과 같은 기준으로 Claude가 되면 Claude, 아니면 GPT만 준비된 사용자도 막히지 않게 GPT
  const taskProvider: AiProvider | null = gate.taskProvider
  const firstTask = useFirstTask()
  const [example, setExample] = useState<FirstTaskExample | null>(null)
  // 보고 전문은 직원 화면으로 가지 않고 여기서 펼쳐 본다
  const [isReportOpen, setIsReportOpen] = useState(false)
  // 첫 업무를 마친 직원을 사무실에 계속 둘지 (완료 화면에서 묻는다, 기본은 남기기)
  const [isKeepStaff, setIsKeepStaff] = useState(true)
  const pickedExample = example ?? (defaultCwd ? 'folder' : 'ideas')

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

  useEffect(() => {
    if (step === 'firstTask' && !status) void check()
  }, [step, status, check])

  // 로그인 단계에 들어올 때마다 두 공급자를 함께 새로 확인한다 (지난 결과를 그대로 믿지 않는다)
  useEffect(() => {
    if (step !== 'login') return
    void check()
    void checkProviders()
  }, [step, check, checkProviders])

  // 설정 › 안내에서 다시 열면 지난번 화면(완료·오래 걸리는 중)이 아니라 처음부터
  useEffect(() => {
    if (isOnboarded) return
    setStep('welcome')
    setIsReportOpen(false)
    firstTask.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 안내가 다시 열릴 때만
  }, [isOnboarded])

  // 첫 업무가 끝나면 완료 화면(ready)으로 넘어간다
  useEffect(() => {
    if (firstTask.phase === 'done') setStep('ready')
  }, [firstTask.phase])

  // 로그인 창을 띄운 뒤에는 둘 다 준비될 때까지 두 공급자를 조용히 다시 확인한다 (하나만 돼도 통과지만, 나머지도 되면 ✓로 보이게)
  const isWaitingFix = step === 'login' && !gate.isChecking && !isBothReady
  useEffect(() => {
    if (!isWaitingFix) return
    const timer = setInterval(() => {
      void check({ isSilent: true })
      void checkProviders({ isSilent: true })
    }, 4000)
    return () => clearInterval(timer)
  }, [isWaitingFix, check, checkProviders])

  if (!isLoaded || isOnboarded) return null

  // 첫 업무 직원: 끝까지 해냈으면 고른 대로, 시간이 오래 걸리는 중이면 계속 일하게 남기고, 그 밖(실패·건너뛰기)이면 내보낸다
  const isTimedOut = firstTask.phase === 'failed' && firstTask.fail === 'timeout'
  const finish = () => {
    if ((firstTask.phase === 'done' && isKeepStaff) || isTimedOut) firstTask.keep()
    else firstTask.dismiss()
    void window.office.updateSettings({ isOnboarded: true })
  }
  // 소개에서 건너뛰면 다시 보는 곳을 알려 준다
  const handleSkip = () => {
    finish()
    showToast(t('guideHint.replayToast'))
  }
  const handleMarket = () => {
    finish()
    useOffice.getState().openMarket()
  }
  // 첫 업무 직원(남겨 둔 경우)의 패널을 연다 — 보고를 다시 보고 다음 일을 맡기는 곳
  const openTaskStaff = () => {
    const s = useOffice.getState()
    s.setView('map')
    if (firstTask.staffId && s.staff.some((x) => x.id === firstTask.staffId)) s.select(firstTask.staffId)
  }
  const handleStartNow = () => {
    finish()
    openTaskStaff()
  }
  const handleInbox = () => {
    finish()
    useOffice.getState().setView('inbox')
  }
  const handlePickFolder = async () => {
    const dir = await window.office.pickFolder()
    if (dir) void window.office.updateSettings({ defaultCwd: dir })
  }
  const handleTour = () => {
    finish()
    onStartTour()
  }
  const handleRunTask = () => {
    if (taskProvider) void firstTask.run(pickedExample, taskProvider, defaultCwd)
  }
  // 첫 업무를 건너뛰면 사용량을 쓰지 않는 연습 튜토리얼로 안내한다
  const handleSkipTask = () => {
    finish()
    void window.office.tutorialStart('task')
  }
  // 시간 초과: 직원은 사무실에 남아 계속 일하고, 그 직원 패널을 열어 이어 본다 (연습은 고를 때만)
  const handleContinueInOffice = () => {
    finish()
    openTaskStaff()
  }
  const handlePractice = () => {
    finish()
    void window.office.tutorialStart('task')
  }
  const handleRecheckLogin = () => {
    firstTask.reset()
    setStatus(null)
    setStep('login')
  }
  const ACTION_HANDLER: Record<FirstTaskAction, () => void> = {
    toLogin: handleRecheckLogin,
    retry: handleRunTask,
    openStaff: handleContinueInOffice,
    practice: handlePractice,
  }
  /** 실패 종류에 맞는 버튼만 (첫 버튼이 추천) */
  const failButtons = (fail: FirstTaskFail) =>
    FAIL_ACTIONS[fail].map((a, i) => (
      <Button key={a} variant={i === 0 ? 'default' : 'outline'} onClick={ACTION_HANDLER[a]}>
        {t(ACTION_TEXT[a])}
      </Button>
    ))
  const failText = (fail: FirstTaskFail) =>
    fail === 'limit' && firstTask.limitAt ? t('onboarding.firstTask.fail.limitAt', { time: fmtDate(firstTask.limitAt, { timeStyle: 'short' }) }) : t(FAIL_TEXT[fail])
  const staffName = firstTask.staff?.name ?? t('onboarding.firstTask.staffName')

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-6">
      <div className="bg-background flex max-h-full w-full max-w-2xl flex-col gap-6 overflow-y-auto rounded-2xl border p-8 shadow-2xl">
        {step === 'welcome' && (
          <>
            <div className="flex justify-center gap-2">
              {WELCOME_AVATARS.map((a, i) => (
                <Avatar key={a} avatar={a} className={cn('size-14', i % 2 === 1 && 'translate-y-2')} />
              ))}
            </div>
            <div className="flex flex-col gap-2 text-center">
              <h1 className="text-2xl font-bold">{t('onboarding.welcome.title')}</h1>
              <p className="text-muted-foreground">
                {t('onboarding.welcome.introBefore')}
                <b className="text-foreground">{t('onboarding.welcome.introBold')}</b>
                {t('onboarding.welcome.introAfter')}
                <br />
                {t('onboarding.welcome.introLine2')}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {[
                { icon: '🧑‍💼', title: t('onboarding.card.hire.title'), body: t('onboarding.card.hire.body') },
                { icon: '💬', title: t('onboarding.card.instruct.title'), body: t('onboarding.card.instruct.body') },
                { icon: '✅', title: t('onboarding.card.approve.title'), body: t('onboarding.card.approve.body') },
              ].map((c) => (
                <div key={c.title} className="bg-card flex flex-col gap-1 rounded-xl border p-4">
                  <span className="text-2xl"><IconText text={c.icon} size={26} /></span>
                  <span className="font-semibold">{c.title}</span>
                  <span className="text-muted-foreground text-xs">{c.body}</span>
                </div>
              ))}
            </div>
            {/* 유료 계정이 필요하다는 사실을 로그인 단계 전에 알린다 */}
            <p className="bg-muted rounded-lg px-3 py-2 text-center text-sm">{t('onboarding.welcome.needs')}</p>
            <p className="text-muted-foreground text-center text-xs">{t('onboarding.welcome.footer')}</p>
            <div className="flex items-center justify-between">
              <StepDots step={step} />
              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleSkip}>
                  {t('onboarding.skip')}
                </Button>
                <Button onClick={() => setStep('login')}>{t('onboarding.start')}</Button>
              </div>
            </div>
          </>
        )}

        {step === 'login' && (
          <>
            <CheckHeader
              step={step}
              title={t('onboarding.provider.title')}
              desc={t(gate.isChecking ? 'onboarding.provider.checkingDesc' : isBothReady ? 'onboarding.provider.bothDesc' : gate.isOk ? 'onboarding.provider.passDesc' : 'onboarding.provider.gateDesc')}
            />
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
            <CheckFooter
              step={step}
              isOk={gate.isOk}
              isBlocked={gate.isBlocked}
              isChecking={isChecking || providers.isChecking || gate.isChecking}
              onMove={setStep}
              onSkipToTour={handleTour}
            />
          </>
        )}

        {step === 'folder' && (
          <>
            <CheckHeader step={step} title={t('onboarding.folder.title')} desc={t('onboarding.folder.desc')} />
            <CheckRow isOk={Boolean(defaultCwd)} title={defaultCwd ? t('onboarding.folder.done', { path: shortPath(defaultCwd) }) : t('onboarding.folder.none')}>
              <ul className="text-muted-foreground list-disc space-y-0.5 pl-4 text-xs">
                <li>{t('onboarding.folder.example', { example: osText('~/Documents/report', 'C:\\Users\\me\\Documents\\report') })}</li>
                <li>{t('onboarding.folder.permission')}</li>
                <li>{t('onboarding.folder.optional')}</li>
              </ul>
              <Button size="sm" variant={defaultCwd ? 'outline' : 'default'} onClick={() => void handlePickFolder()} className="w-fit">
                <FolderOpenIcon /> {defaultCwd ? t('onboarding.folder.change') : t('onboarding.folder.pick')}
              </Button>
            </CheckRow>
            <CheckFooter step={step} isOk={Boolean(defaultCwd)} onMove={setStep} />
          </>
        )}

        {step === 'firstTask' && !taskProvider && (
          <>
            <CheckHeader step={step} title={t('onboarding.firstTask.title')} desc={t('onboarding.firstTask.desc')} />
            <CheckRow isOk={false} isLoading={isChecking || providers.isChecking} title={t('onboarding.firstTask.unavailable')}>
              <span className="text-muted-foreground text-xs">{t('onboarding.firstTask.unavailableDesc')}</span>
              {/* 다음에 할 일을 고르게: 로그인 단계로 돌아가거나, 사용량 없이 연습 */}
              {!(isChecking || providers.isChecking) && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={handleRecheckLogin}>
                    {t('onboarding.firstTask.recheckLogin')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handlePractice}>
                    {t('onboarding.firstTask.practice')}
                  </Button>
                </div>
              )}
            </CheckRow>
            <CheckFooter step={step} isOk={false} isChecking={isChecking || providers.isChecking} onMove={setStep} />
          </>
        )}

        {step === 'firstTask' && taskProvider && firstTask.phase === 'pick' && (
          <>
            <CheckHeader step={step} title={t('onboarding.firstTask.title')} desc={t('onboarding.firstTask.desc')} />
            <div className="text-muted-foreground text-xs">{t('onboarding.firstTask.staffLine', { name: staffName, role: t('onboarding.firstTask.staffRole') })}</div>
            <div className="flex flex-col gap-2">
              {(['folder', 'ideas'] as const).map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setExample(ex)}
                  disabled={ex === 'folder' && !defaultCwd}
                  className={cn('flex flex-col gap-1 rounded-xl border p-4 text-left text-sm disabled:opacity-50', pickedExample === ex && 'border-primary')}
                >
                  <span className="font-semibold">
                    {ex === 'folder' ? t('onboarding.firstTask.taskFolder') : t('onboarding.firstTask.taskIdeas')}
                    {ex === 'folder' && <span className="text-primary ml-2 text-xs">{t('onboarding.firstTask.recommended')}</span>}
                  </span>
                  <span className="text-muted-foreground text-xs">{ex === 'folder' ? t('onboarding.firstTask.taskFolderNote') : t('onboarding.firstTask.taskIdeasNote')}</span>
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">{t('onboarding.firstTask.costNote', { provider: ACCOUNT_NAME[taskProvider] })}</p>
            <div className="flex items-center justify-between">
              <StepDots step={step} />
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep('folder')}>
                  {t('onboarding.prev')}
                </Button>
                <Button variant="outline" onClick={handleSkipTask}>
                  {t('onboarding.firstTask.skip')}
                </Button>
                <Button onClick={handleRunTask}>{t('onboarding.firstTask.run')}</Button>
              </div>
            </div>
          </>
        )}

        {step === 'firstTask' && firstTask.phase === 'running' && (
          <>
            <CheckHeader step={step} title={t('onboarding.firstTask.working', { name: staffName })} desc={t('onboarding.firstTask.workingDesc')} />
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div className="bg-primary h-full w-full animate-pulse" />
            </div>
            <div className="text-muted-foreground flex flex-col gap-0.5 text-xs">
              <span className="tabular-nums">{fmtSeconds(firstTask.elapsedMs)}</span>
              {firstTask.progress.map((line, i) => (
                <span key={i} className="truncate">
                  {line}
                </span>
              ))}
            </div>
            {/* 예제는 결재 0건이 목표지만, 뜨면 결재함으로 보내지 않고 여기서 바로 고른다 */}
            {firstTask.approvals.map((a) => (
              <CheckRow key={a.id} isOk={false} title={trOr(a.summaryI18n, a.summary)}>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void window.office.decide(a.id, true)}>
                    {t('onboarding.firstTask.allow')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void window.office.decide(a.id, false)}>
                    {t('onboarding.firstTask.deny')}
                  </Button>
                </div>
              </CheckRow>
            ))}
            <div className="flex items-center justify-between">
              <StepDots step={step} />
              <Button variant="outline" onClick={firstTask.stop}>
                {t('onboarding.firstTask.stop')}
              </Button>
            </div>
          </>
        )}

        {/* 시간 초과: 실패가 아니라 오래 걸리는 중 — 직원은 사무실에 남아 계속 일한다 (늦게라도 끝나면 완료 화면으로 바뀐다) */}
        {step === 'firstTask' && isTimedOut && (
          <>
            <CheckHeader step={step} title={t('onboarding.firstTask.slowTitle', { name: staffName })} desc={t('onboarding.firstTask.fail.timeout')} />
            <div className="flex items-center justify-between">
              <StepDots step={step} />
              <div className="flex gap-2">{failButtons('timeout')}</div>
            </div>
          </>
        )}

        {step === 'firstTask' && firstTask.phase === 'failed' && firstTask.fail && !isTimedOut && (
          <>
            <CheckHeader step={step} title={t('onboarding.firstTask.failTitle')} desc={t('onboarding.firstTask.failDesc')} />
            <CheckRow isOk={false} isError title={failText(firstTask.fail)}>
              {/* 원인을 이름 붙이지 못한 실패는 오류 원문을 접어 둔다 */}
              {showsErrorDetail(firstTask.fail) && firstTask.errorText && (
                <details className="text-muted-foreground text-xs">
                  <summary className="cursor-pointer">{t('onboarding.firstTask.errorDetail')}</summary>
                  <pre className="bg-muted mt-1 max-h-40 overflow-auto rounded p-2 whitespace-pre-wrap">{firstTask.errorText}</pre>
                </details>
              )}
            </CheckRow>
            <div className="flex items-center justify-between">
              <StepDots step={step} />
              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleSkipTask}>
                  {t('onboarding.firstTask.skip')}
                </Button>
                {failButtons(firstTask.fail)}
              </div>
            </div>
          </>
        )}

        {step === 'ready' && firstTask.phase === 'done' && (
          <>
            <div className="flex flex-col gap-2 text-center">
              <DuoIcon name="party" size={48} />
              <h1 className="text-2xl font-bold">{t('onboarding.firstTask.done')}</h1>
              <p className="text-muted-foreground">{t('onboarding.firstTask.doneDesc', { name: staffName })}</p>
            </div>
            <div className="bg-card flex flex-col gap-2 rounded-xl border p-4 text-sm">
              <p className={cn('whitespace-pre-wrap', isReportOpen ? 'max-h-80 overflow-y-auto' : 'line-clamp-6')}>{firstTask.report}</p>
              <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                <span className="tabular-nums">{t('onboarding.firstTask.meta', { time: fmtSeconds(firstTask.tookMs), n: firstTask.approvalCount })}</span>
                <button type="button" className="text-primary shrink-0 hover:underline" onClick={() => setIsReportOpen((v) => !v)}>
                  {isReportOpen ? t('onboarding.firstTask.collapse') : t('onboarding.firstTask.viewFull')}
                </button>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={isKeepStaff} onChange={(e) => setIsKeepStaff(e.target.checked)} />
              <span className="flex flex-col gap-0.5">
                <span>{t('onboarding.firstTask.keepStaff', { name: staffName })}</span>
                <span className="text-muted-foreground text-xs">{t('onboarding.firstTask.keepStaffNote')}</span>
              </span>
            </label>
            {/* 보고·결재를 다시 보는 곳 */}
            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
              <span>{t('onboarding.ready.where')}</span>
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleInbox}>
                <InboxIcon /> {t('onboarding.ready.toInbox')}
              </Button>
            </div>
          </>
        )}

        {step === 'ready' && firstTask.phase !== 'done' && (
          <div className="flex flex-col gap-2 text-center">
            <span className="text-5xl">🏢</span>
            <h1 className="text-2xl font-bold">{t('onboarding.ready.title')}</h1>
            <p className="text-muted-foreground">{t('onboarding.ready.desc')}</p>
          </div>
        )}

        {step === 'ready' && (
          <>
            <div className="flex items-center justify-between">
              <StepDots step={step} />
              <div className="flex gap-2">
                {/* 추천은 하나만 강조: 첫 업무를 해 봤으면 바로 일 맡기기, 아니면 둘러보기 */}
                <Button variant="ghost" onClick={handleMarket}>
                  {t('market.bring')}
                </Button>
                <Button variant={firstTask.phase === 'done' ? 'default' : 'outline'} onClick={handleStartNow}>
                  {t('onboarding.startNow')}
                </Button>
                <Button variant={firstTask.phase === 'done' ? 'outline' : 'default'} onClick={handleTour}>
                  {t('onboarding.tour')}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
