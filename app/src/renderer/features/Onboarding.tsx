import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2Icon, CircleAlertIcon, CopyIcon, ExternalLinkIcon, FolderOpenIcon, Loader2Icon, LogInIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IS_WINDOWS, osText } from '@/lib/platform'
import { useOffice } from '@/store'
import type { ClaudeStatus } from '@shared/types'
import { Avatar } from './StaffCard'
import { shortPath } from './status'
import { isAnyReady, ProviderCards, RecheckButton, useProviders } from './ProviderCards'
import { t } from '@shared/i18n'

// 공식 설치 명령: 맥은 터미널, 윈도우는 PowerShell에 붙여 넣는다
const INSTALL_COMMAND = osText('curl -fsSL https://claude.ai/install.sh | bash', 'irm https://claude.ai/install.ps1 | iex')
const DOCS_URL = 'https://docs.claude.com/en/docs/claude-code/setup'
const WELCOME_AVATARS = [1, 13, 5, 18, 2, 22]
// 준비 점검은 설치 → 로그인 → 작업 폴더를 한 단계씩 (막히면 그 자리의 버튼으로 해결)
const STEPS = ['welcome', 'install', 'login', 'folder', 'ready'] as const
type Step = (typeof STEPS)[number]
const CHECK_STEPS: Step[] = ['install', 'login', 'folder']

function StepDots({ step }: { step: Step }) {
  return (
    <div className="flex gap-1.5">
      {STEPS.map((s) => (
        <span key={s} className={cn('h-1.5 rounded-full transition-all', s === step ? 'bg-primary w-6' : 'bg-muted w-1.5')} />
      ))}
    </div>
  )
}

function CheckRow({ isOk, isLoading, title, children }: { isOk: boolean; isLoading?: boolean; title: string; children?: React.ReactNode }) {
  return (
    <div className={cn('flex gap-3 rounded-xl border p-4', !isOk && !isLoading && 'border-status-waiting/60')}>
      {isLoading ? (
        <Loader2Icon className="text-muted-foreground mt-0.5 size-5 shrink-0 animate-spin" />
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
  // Claude가 로그인돼 있으면 Codex는 묻지 않는다 (Claude만 쓰는 사용자의 화면은 그대로)
  const isClaudeOut = step === 'login' && status?.isLoggedIn === false
  const providers = useProviders(isClaudeOut)
  const isProviderReady = isAnyReady(providers.status)

  const check = useCallback(async () => {
    setIsChecking(true)
    setStatus(await window.office.claudeStatus())
    setIsChecking(false)
  }, [])

  useEffect(() => {
    if ((step === 'install' || step === 'login') && !status) void check()
  }, [step, status, check])

  // 설치 명령을 붙여 넣거나 로그인 창을 띄운 뒤에는 될 때까지 조용히 다시 확인한다
  const isWaitingFix = (step === 'install' && status?.hasTerminalClaude === false) || (step === 'login' && status?.isLoggedIn === false)
  useEffect(() => {
    if (!isWaitingFix) return
    const timer = setInterval(() => void window.office.claudeStatus().then(setStatus), 4000)
    return () => clearInterval(timer)
  }, [isWaitingFix])

  if (!isLoaded || isOnboarded) return null

  const finish = () => void window.office.updateSettings({ isOnboarded: true })
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6">
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
            <CheckRow isOk={Boolean(status?.hasTerminalClaude)} isLoading={isChecking && !status} title={status?.hasTerminalClaude ? t('onboarding.terminal.installed') : t('onboarding.terminal.title')}>
              <span className="text-muted-foreground text-xs">{t('onboarding.terminal.desc')}</span>
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
            <CheckFooter step={step} isOk={Boolean(status?.hasTerminalClaude)} onMove={setStep} />
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

        {step === 'ready' && (
          <>
            <div className="flex flex-col gap-2 text-center">
              <span className="text-5xl">🏢</span>
              <h1 className="text-2xl font-bold">{t('onboarding.ready.title')}</h1>
              <p className="text-muted-foreground">{t('onboarding.ready.desc')}</p>
            </div>
            <div className="flex items-center justify-between">
              <StepDots step={step} />
              <div className="flex gap-2">
                {typeof window.officePack !== 'undefined' && (
                  <Button variant="outline" onClick={handleMarket}>
                    {t('market.bring')}
                  </Button>
                )}
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
