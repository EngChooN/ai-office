import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2Icon, CircleAlertIcon, CircleXIcon, CopyIcon, ExternalLinkIcon, FolderOpenIcon, Loader2Icon, LogInIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IS_WINDOWS, osText } from '@/lib/platform'
import { useOffice } from '@/store'
import type { AiProvider, ClaudeStatus } from '@shared/types'
import { Avatar } from './StaffCard'
import { shortPath } from './status'
import { isAnyReady, ProviderCards, RecheckButton, useProviders } from './ProviderCards'
import { fmtDate, t, trOr, type TKey } from '@shared/i18n'
import { type FirstTaskExample, type FirstTaskFail, useFirstTask } from './useFirstTask'

// 공식 설치 명령: 맥은 터미널, 윈도우는 PowerShell에 붙여 넣는다
const INSTALL_COMMAND = osText('curl -fsSL https://claude.ai/install.sh | bash', 'irm https://claude.ai/install.ps1 | iex')
const DOCS_URL = 'https://docs.claude.com/en/docs/claude-code/setup'
const WELCOME_AVATARS = [1, 13, 5, 18, 2, 22]
// 준비 점검은 설치 → 로그인 → 작업 폴더를 한 단계씩 (막히면 그 자리의 버튼으로 해결)
// 마지막 점검(firstTask)은 직원 1명에게 예제 업무를 실제로 맡겨 본다 — 고르기·일하는 중·실패는 그 안의 상태
const STEPS = ['welcome', 'install', 'login', 'folder', 'firstTask', 'ready'] as const
type Step = (typeof STEPS)[number]
const CHECK_STEPS: Step[] = ['install', 'login', 'folder', 'firstTask']
const ACCOUNT_NAME: Record<AiProvider, string> = { claude: 'Claude', codex: 'ChatGPT' }
const FAIL_TEXT: Record<FirstTaskFail, TKey> = {
  login: 'onboarding.firstTask.fail.login',
  limit: 'onboarding.firstTask.fail.limit',
  timeout: 'onboarding.firstTask.fail.timeout',
  network: 'onboarding.firstTask.fail.network',
  unknown: 'onboarding.firstTask.fail.unknown',
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

function CheckRow({ isOk, isLoading, isError, title, children }: { isOk: boolean; isLoading?: boolean; isError?: boolean; title: string; children?: React.ReactNode }) {
  return (
    <div className={cn('flex gap-3 rounded-xl border p-4', isError ? 'border-destructive/60' : !isOk && !isLoading && 'border-status-waiting/60')}>
      {isLoading ? (
        <Loader2Icon className="text-muted-foreground mt-0.5 size-5 shrink-0 animate-spin" />
      ) : isError ? (
        <CircleXIcon className="text-destructive mt-0.5 size-5 shrink-0" />
      ) : isOk ? (
        <CheckCircle2Icon className="text-status-working mt-0.5 size-5 shrink-0" />
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

/** 점검 단계 머리말 — "1/3 설치 확인" */
function CheckHeader({ step, title, desc }: { step: Step; title: string; desc: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs tabular-nums">{t('onboarding.checkStep', { n: CHECK_STEPS.indexOf(step) + 1, total: CHECK_STEPS.length })}</span>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-muted-foreground text-sm">{desc}</p>
    </div>
  )
}

/** 점검 단계 아래: 이전 / 다음 (아직 안 됐으면 "나중에 할게요"로 넘어간다) */
function CheckFooter({ step, isOk, isBlocked, onMove }: { step: Step; isOk: boolean; isBlocked?: boolean; onMove: (step: Step) => void }) {
  const i = STEPS.indexOf(step)
  return (
    <div className="flex items-center justify-between">
      <StepDots step={step} />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => onMove(STEPS[i - 1])}>
          {t('onboarding.prev')}
        </Button>
        {/* 공급자가 하나도 준비되지 않으면 직원을 만들 수 없어 "나중에"를 두지 않는다 */}
        <Button variant={isOk ? 'default' : 'outline'} onClick={() => onMove(STEPS[i + 1])} disabled={isBlocked}>
          {isOk || isBlocked ? t('onboarding.next') : t('onboarding.later')}
        </Button>
      </div>
    </div>
  )
}

/** 첫 실행 안내: 앱 소개 → 준비 점검 마법사(설치·로그인·작업 폴더) → 둘러보기(코치마크) */
export function Onboarding({ onStartTour }: { onStartTour: () => void }) {
  const isOnboarded = useOffice((s) => s.settings.isOnboarded)
  const isLoaded = useOffice((s) => s.isLoaded)
  const [step, setStep] = useState<Step>('welcome')
  const [status, setStatus] = useState<ClaudeStatus | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const defaultCwd = useOffice((s) => s.settings.defaultCwd)
  // Claude가 준비돼 있으면 Codex는 묻지 않는다 (Claude만 쓰는 사용자의 화면은 그대로)
  const isClaudeOut = step === 'login' && status?.isLoggedIn === false
  const isTerminalMissing = step === 'install' && status?.hasTerminalClaude === false
  const providers = useProviders(isClaudeOut || isTerminalMissing || (step === 'firstTask' && !status?.isLoggedIn))
  const isProviderReady = isAnyReady(providers.status)
  // GPT(Codex)가 이미 준비됐으면 터미널용 Claude Code는 정말 선택 — 설치를 기다리지 않고 넘어간다
  const isCodexReady = providers.status?.codex.state === 'ready'
  const isInstallOk = Boolean(status?.hasTerminalClaude) || isCodexReady
  // 첫 업무 직원: Claude 로그인이 돼 있으면 Claude, 아니면 GPT만 준비된 사용자도 막히지 않게 GPT
  const taskProvider: AiProvider | null = status?.isLoggedIn ? 'claude' : isCodexReady ? 'codex' : null
  const firstTask = useFirstTask()
  const [example, setExample] = useState<FirstTaskExample | null>(null)
  // 직원은 온보딩을 마치면 내보내므로 보고 전문은 직원 화면이 아니라 여기서 펼쳐 본다
  const [isReportOpen, setIsReportOpen] = useState(false)
  const pickedExample = example ?? (defaultCwd ? 'folder' : 'ideas')

  const check = useCallback(async () => {
    setIsChecking(true)
    setStatus(await window.office.claudeStatus())
    setIsChecking(false)
  }, [])

  useEffect(() => {
    if ((step === 'install' || step === 'login' || step === 'firstTask') && !status) void check()
  }, [step, status, check])

  // 첫 업무가 끝나면 완료 화면(ready)으로 넘어간다
  useEffect(() => {
    if (firstTask.phase === 'done') setStep('ready')
  }, [firstTask.phase])

  // 설치 명령을 붙여 넣거나 로그인 창을 띄운 뒤에는 될 때까지 조용히 다시 확인한다
  const isWaitingFix = (isTerminalMissing && !isCodexReady) || (step === 'login' && status?.isLoggedIn === false)
  useEffect(() => {
    if (!isWaitingFix) return
    const timer = setInterval(() => void window.office.claudeStatus().then(setStatus), 4000)
    return () => clearInterval(timer)
  }, [isWaitingFix])

  if (!isLoaded || isOnboarded) return null

  const finish = () => {
    firstTask.dismiss()
    void window.office.updateSettings({ isOnboarded: true })
  }
  const handleMarket = () => {
    finish()
    useOffice.getState().openMarket()
  }
  const handleCopy = () => {
    void navigator.clipboard.writeText(INSTALL_COMMAND)
    setIsCopied(true)
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
  const handleRecheckLogin = () => {
    firstTask.reset()
    setStatus(null)
    setStep('login')
  }
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
                { icon: '🧭', title: t('onboarding.card.team.title'), body: t('onboarding.card.team.body') },
                { icon: '📘', title: t('onboarding.card.manual.title'), body: t('onboarding.card.manual.body') },
                { icon: '📈', title: t('onboarding.card.growth.title'), body: t('onboarding.card.growth.body') },
              ].map((c) => (
                <div key={c.title} className="bg-card flex flex-col gap-1 rounded-xl border p-4">
                  <span className="text-2xl">{c.icon}</span>
                  <span className="font-semibold">{c.title}</span>
                  <span className="text-muted-foreground text-xs">{c.body}</span>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground text-center text-xs">{t('onboarding.welcome.footer')}</p>
            <div className="flex items-center justify-between">
              <StepDots step={step} />
              <div className="flex gap-2">
                <Button variant="ghost" onClick={finish}>
                  {t('onboarding.skip')}
                </Button>
                <Button onClick={() => setStep('install')}>{t('onboarding.start')}</Button>
              </div>
            </div>
          </>
        )}

        {step === 'install' && (
          <>
            <CheckHeader step={step} title={t('onboarding.install.title')} desc={t('onboarding.install.desc')} />
            <CheckRow isOk title={t('onboarding.engine.title')}>
              <span className="text-muted-foreground text-xs">{t('onboarding.engine.desc')}</span>
            </CheckRow>
            <CheckRow isOk={isInstallOk} isLoading={isChecking && !status} title={status?.hasTerminalClaude ? t('onboarding.terminal.installed') : t('onboarding.terminal.title')}>
              <span className="text-muted-foreground text-xs">{t('onboarding.terminal.desc')}</span>
              {isTerminalMissing && isCodexReady && <span className="text-muted-foreground text-xs">{t('onboarding.terminal.codexReady')}</span>}
              {status && !status.hasTerminalClaude && (
                <div className="flex flex-wrap items-center gap-2">
                  {IS_WINDOWS && <span className="text-muted-foreground w-full text-xs">{t('onboarding.terminal.winHint')}</span>}
                  <code className="bg-muted rounded px-2 py-1 text-xs">{INSTALL_COMMAND}</code>
                  <Button size="sm" variant="outline" onClick={handleCopy}>
                    <CopyIcon /> {isCopied ? t('onboarding.copied') : t('onboarding.copy')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => window.open(DOCS_URL)}>
                    <ExternalLinkIcon /> {t('onboarding.installGuide')}
                  </Button>
                </div>
              )}
            </CheckRow>
            <CheckFooter step={step} isOk={isInstallOk} onMove={setStep} />
          </>
        )}

        {step === 'login' && isClaudeOut && (
          <>
            <CheckHeader step={step} title={t('onboarding.provider.title')} desc={isProviderReady ? t('onboarding.provider.passDesc') : t('onboarding.provider.gateDesc')} />
            <ProviderCards
              status={providers.status}
              isChecking={providers.isChecking}
              onRecheck={() => void providers.check()}
              claudeExtra={
                <ol className="text-muted-foreground list-decimal space-y-0.5 pl-4 text-xs">
                  <li>{t('onboarding.login.step1', { window: osText(t('onboarding.login.window.mac'), t('onboarding.login.window.win')) })}</li>
                  <li>{t('onboarding.login.step2')}</li>
                  <li>{t('onboarding.login.step3')}</li>
                </ol>
              }
            />
            <RecheckButton
              isChecking={isChecking || providers.isChecking}
              onCheck={() => {
                void check()
                void providers.check()
              }}
            />
            <CheckFooter step={step} isOk={isProviderReady} isBlocked={Boolean(providers.status) && !isProviderReady} onMove={setStep} />
          </>
        )}

        {step === 'login' && !isClaudeOut && (
          <>
            <CheckHeader step={step} title={t('onboarding.loginStep.title')} desc={t('onboarding.loginStep.desc')} />
            <CheckRow isOk={Boolean(status?.isLoggedIn)} isLoading={isChecking && !status} title={status?.isLoggedIn ? t('onboarding.login.done', { email: status.email ?? '' }) : t('onboarding.login.needed')}>
              {status && !status.isLoggedIn && (
                <>
                  <span className="text-muted-foreground text-xs">{t('onboarding.login.desc')}</span>
                  <ol className="text-muted-foreground list-decimal space-y-0.5 pl-4 text-xs">
                    <li>{t('onboarding.login.step1', { window: osText(t('onboarding.login.window.mac'), t('onboarding.login.window.win')) })}</li>
                    <li>{t('onboarding.login.step2')}</li>
                    <li>{t('onboarding.login.step3')}</li>
                  </ol>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void window.office.openClaudeLogin()}>
                      <LogInIcon /> {t('onboarding.login.open')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void check()} disabled={isChecking}>
                      <RefreshCwIcon /> {t('onboarding.login.recheck')}
                    </Button>
                  </div>
                </>
              )}
            </CheckRow>
            <CheckFooter step={step} isOk={Boolean(status?.isLoggedIn)} onMove={setStep} />
          </>
        )}

        {step === 'folder' && (
          <>
            <CheckHeader step={step} title={t('onboarding.folder.title')} desc={t('onboarding.folder.desc')} />
            <CheckRow isOk={Boolean(defaultCwd)} title={defaultCwd ? t('onboarding.folder.done', { path: shortPath(defaultCwd) }) : t('onboarding.folder.none')}>
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
            </CheckRow>
            <CheckFooter step={step} isOk={false} onMove={setStep} />
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

        {step === 'firstTask' && firstTask.phase === 'failed' && firstTask.fail && (
          <>
            <CheckHeader step={step} title={t('onboarding.firstTask.failTitle')} desc={t('onboarding.firstTask.failDesc')} />
            <CheckRow isOk={false} isError title={failText(firstTask.fail)} />
            <div className="flex items-center justify-between">
              <StepDots step={step} />
              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleSkipTask}>
                  {t('onboarding.firstTask.skip')}
                </Button>
                <Button variant={firstTask.fail === 'login' ? 'default' : 'outline'} onClick={handleRecheckLogin}>
                  {t('onboarding.firstTask.recheckLogin')}
                </Button>
                {firstTask.fail !== 'login' && firstTask.fail !== 'limit' && <Button onClick={handleRunTask}>{t('onboarding.firstTask.retry')}</Button>}
              </div>
            </div>
          </>
        )}

        {step === 'ready' && firstTask.phase === 'done' && (
          <>
            <div className="flex flex-col gap-2 text-center">
              <span className="text-5xl">🎉</span>
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
            <p className="text-muted-foreground text-center text-xs">{t('onboarding.firstTask.keepNote', { name: staffName })}</p>
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
                <Button variant="outline" onClick={handleMarket}>
                  {t('market.bring')}
                </Button>
                <Button variant="ghost" onClick={finish}>
                  {t('onboarding.startNow')}
                </Button>
                <Button onClick={handleTour}>{t('onboarding.tour')}</Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
