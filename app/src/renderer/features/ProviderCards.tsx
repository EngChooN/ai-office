import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2Icon, CircleAlertIcon, Loader2Icon, LogInIcon, RefreshCwIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AiProvider, ProvidersStatus, ProviderStatus } from '@shared/types'
import { t, type TKey } from '@shared/i18n'
import { isProviderStale } from '@/lib/providerRecheck'
import { useOffice } from '@/store'

// 공급자(Claude·Codex) 설치·로그인 상태 카드 — 설정 화면과 첫 실행 온보딩 게이트가 함께 쓴다

export const PROVIDERS: AiProvider[] = ['claude', 'codex']
/** 설정 화면 'AI 공급자' 칸 — 안내 띠가 여기로 스크롤한다 */
export const PROVIDER_SECTION_ID = 'settings-providers'
export const PROVIDER_NAME: Record<AiProvider, string> = { claude: 'Claude', codex: 'Codex' }
const STATE_KEY: Record<ProviderStatus['state'], TKey> = { missing: 'provider.state.missing', broken: 'provider.state.broken', loggedOut: 'provider.state.loggedOut', ready: 'provider.state.ready', unknown: 'provider.state.unknown' }
const DESC_KEY: Record<AiProvider, Record<ProviderStatus['state'], TKey>> = {
  claude: { missing: 'provider.claude.missing', broken: 'provider.claude.broken', loggedOut: 'provider.claude.loggedOut', ready: 'provider.claude.ready', unknown: 'provider.claude.unknown' },
  codex: { missing: 'provider.codex.missing', broken: 'provider.codex.broken', loggedOut: 'provider.codex.loggedOut', ready: 'provider.codex.ready', unknown: 'provider.codex.unknown' },
}

/** 둘 중 하나라도 준비됐는지 — 온보딩 게이트의 통과 조건 */
export const isAnyReady = (s: ProvidersStatus | null) => Boolean(s && PROVIDERS.some((p) => s[p].state === 'ready'))

/** 두 공급자 상태를 함께 조회한다 (Codex는 잠깐 실행해 묻기 때문에 몇 초 걸릴 수 있다) */
// 마지막 조회 결과는 화면끼리 함께 쓴다 — 고용 창·프로필을 열 때마다 Codex를 다시 띄우지 않게 (30분 지나면 새로)
let cached: { status: ProvidersStatus; at: number } | null = null

export function useProviders(isEnabled = true) {
  const [status, setStatus] = useState<ProvidersStatus | null>(() => cached?.status ?? null)
  const [isChecking, setIsChecking] = useState(false)
  const lastCheckedAt = useRef(cached?.at ?? 0)
  const isInFlight = useRef(false)
  const check = useCallback(async () => {
    setIsChecking(true)
    isInFlight.current = true
    try {
      const s = await window.office.providerStatus()
      lastCheckedAt.current = Date.now()
      cached = { status: s, at: lastCheckedAt.current }
      setStatus(s)
    } finally {
      isInFlight.current = false
      setIsChecking(false)
    }
  }, [])
  useEffect(() => {
    if (isEnabled && (!status || isProviderStale(lastCheckedAt.current, Date.now()))) void check()
  }, [isEnabled, status, check])
  // 창으로 돌아왔을 때 마지막 조회 후 30분이 지났으면 조용히 다시 본다
  useEffect(() => {
    if (!isEnabled) return
    const onFocus = () => {
      if (!isInFlight.current && isProviderStale(lastCheckedAt.current, Date.now())) void check()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [isEnabled, check])
  return { status, isChecking, check }
}

/** 계정 · 플랜 한 줄 (플랜을 모르면 계정만) */
function accountLine(s: ProviderStatus) {
  const plan = s.plan ? s.plan.charAt(0).toUpperCase() + s.plan.slice(1) : ''
  return [s.account, plan].filter(Boolean).join(' · ')
}

/** Codex 로그인: 브라우저가 열리고 인증이 끝나면 상태를 다시 조회한다 */
function CodexLogin({ disabled, onDone }: { disabled: boolean; onDone?: () => void }) {
  const [isWaiting, setIsWaiting] = useState(false)
  const [error, setError] = useState('')
  const start = async () => {
    setIsWaiting(true)
    setError('')
    try {
      setError(await window.office.openCodexLogin())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsWaiting(false)
      onDone?.()
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" variant="outline" className="w-fit" onClick={() => void start()} disabled={disabled || isWaiting}>
        {isWaiting ? <Loader2Icon className="animate-spin" /> : <LogInIcon />} {t(isWaiting ? 'provider.codex.loginWaiting' : 'provider.codex.login')}
      </Button>
      {error && <span className="text-status-waiting text-[11px]">{t('provider.codex.loginFailed', { error })}</span>}
    </div>
  )
}

export function ProviderCard({ provider, status, isChecking, onRecheck, children }: { provider: AiProvider; status: ProviderStatus | null; isChecking: boolean; onRecheck?: () => void; children?: React.ReactNode }) {
  const state = status?.state
  const isReady = state === 'ready'
  return (
    <div className={cn('bg-card flex min-w-0 flex-col gap-2 rounded-xl border p-4 text-sm', state && !isReady && 'border-status-waiting/60')}>
      <div className="flex items-center gap-2">
        <span className="font-semibold">{PROVIDER_NAME[provider]}</span>
        {provider === 'codex' && (
          <Badge variant="outline" className="text-muted-foreground">
            {t('provider.beta')}
          </Badge>
        )}
        <span className={cn('ml-auto flex items-center gap-1 text-xs', isReady ? 'text-status-working' : state ? 'text-status-waiting' : 'text-muted-foreground')}>
          {!status ? <Loader2Icon className="size-3.5 animate-spin" /> : isReady ? <CheckCircle2Icon className="size-3.5" /> : <CircleAlertIcon className="size-3.5" />}
          {status ? t(STATE_KEY[status.state]) : t('provider.state.checking')}
        </span>
      </div>
      {status && (
        <>
          <span className="text-muted-foreground text-xs">{t(DESC_KEY[provider][status.state])}</span>
          {isReady && accountLine(status) && <span className="truncate text-xs">{accountLine(status)}</span>}
        </>
      )}
      {children}
      {status && !isReady && provider === 'claude' && status.state === 'loggedOut' && (
        <Button size="sm" className="w-fit" onClick={() => void window.office.openClaudeLogin()} disabled={isChecking}>
          <LogInIcon /> {t('onboarding.login.open')}
        </Button>
      )}
      {status && status.state === 'loggedOut' && provider === 'codex' && <CodexLogin disabled={isChecking} onDone={onRecheck} />}
    </div>
  )
}

/** 두 카드를 나란히 */
export function ProviderCards({ status, isChecking, onRecheck, claudeExtra }: { status: ProvidersStatus | null; isChecking: boolean; onRecheck?: () => void; claudeExtra?: React.ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PROVIDERS.map((p) => (
        <ProviderCard key={p} provider={p} status={status?.[p] ?? null} isChecking={isChecking} onRecheck={onRecheck}>
          {p === 'claude' && status?.claude.state === 'loggedOut' && claudeExtra}
        </ProviderCard>
      ))}
    </div>
  )
}

export function RecheckButton({ isChecking, onCheck }: { isChecking: boolean; onCheck: () => void }) {
  return (
    <Button size="sm" variant="outline" className="w-fit" onClick={onCheck} disabled={isChecking}>
      <RefreshCwIcon className={cn(isChecking && 'animate-spin')} /> {t('onboarding.login.recheck')}
    </Button>
  )
}

/** 앱 내부 AI(비서·요약 등) 공급자 고르기 — 준비 안 된 쪽은 못 누른다 ('auto'는 Claude로 보인다. main도 Claude 우선) */
function InternalAiPicker({ status }: { status: ProvidersStatus | null }) {
  const internalAi = useOffice((s) => s.settings.internalAi)
  const selected: AiProvider = internalAi === 'codex' ? 'codex' : 'claude'
  // main(aiSelect)과 같은 기준: Claude는 '확인 못 함'도 쓸 수 있는 것으로 본다
  const isUsable = (p: AiProvider) => (status ? status[p].state === 'ready' || (p === 'claude' && status[p].state === 'unknown') : p === 'claude')
  return (
    <div className="flex flex-col gap-1.5 border-t pt-3">
      <span className="text-sm font-medium">{t('provider.internalAi.title')}</span>
      <div className="flex gap-2" role="radiogroup" aria-label={t('provider.internalAi.title')}>
        {PROVIDERS.map((p) => (
          <Button
            key={p}
            size="sm"
            role="radio"
            aria-checked={selected === p}
            variant={selected === p ? 'default' : 'outline'}
            disabled={selected !== p && !isUsable(p)}
            onClick={() => void window.office.updateSettings({ internalAi: p })}
          >
            {PROVIDER_NAME[p]}
          </Button>
        ))}
      </div>
      <span className="text-muted-foreground text-xs">{t('provider.internalAi.hint')}</span>
    </div>
  )
}

/** 설정 화면: AI 공급자 카드 두 장 + 다시 확인 (로그인 창을 연 뒤엔 준비될 때까지 조용히 다시 본다) */
export function ProviderSection() {
  const { status, isChecking, check } = useProviders()
  const isClaudeWaiting = status?.claude.state === 'loggedOut'
  useEffect(() => {
    if (!isClaudeWaiting) return
    const onFocus = () => void check()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [isClaudeWaiting, check])
  return (
    <>
      <ProviderCards status={status} isChecking={isChecking} onRecheck={() => void check()} />
      <RecheckButton isChecking={isChecking} onCheck={() => void check()} />
      <InternalAiPicker status={status} />
    </>
  )
}
