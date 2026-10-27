import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2Icon, CircleAlertIcon, Loader2Icon, LogInIcon, RefreshCwIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AiProvider, ProvidersStatus, ProviderStatus } from '@shared/types'
import { t, type TKey } from '@shared/i18n'

// 공급자(Claude·Codex) 설치·로그인 상태 카드 — 설정 화면과 첫 실행 온보딩 게이트가 함께 쓴다

export const PROVIDERS: AiProvider[] = ['claude', 'codex']
const NAME: Record<AiProvider, string> = { claude: 'Claude', codex: 'Codex' }
const STATE_KEY: Record<ProviderStatus['state'], TKey> = { missing: 'provider.state.missing', loggedOut: 'provider.state.loggedOut', ready: 'provider.state.ready' }
const DESC_KEY: Record<AiProvider, Record<ProviderStatus['state'], TKey>> = {
  claude: { missing: 'provider.claude.missing', loggedOut: 'provider.claude.loggedOut', ready: 'provider.claude.ready' },
  codex: { missing: 'provider.codex.missing', loggedOut: 'provider.codex.loggedOut', ready: 'provider.codex.ready' },
}

/** 둘 중 하나라도 준비됐는지 — 온보딩 게이트의 통과 조건 */
export const isAnyReady = (s: ProvidersStatus | null) => Boolean(s && PROVIDERS.some((p) => s[p].state === 'ready'))

/** 두 공급자 상태를 함께 조회한다 (Codex는 잠깐 실행해 묻기 때문에 몇 초 걸릴 수 있다) */
export function useProviders(isEnabled = true) {
  const [status, setStatus] = useState<ProvidersStatus | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const check = useCallback(async () => {
    setIsChecking(true)
    try {
      setStatus(await window.office.providerStatus())
    } finally {
      setIsChecking(false)
    }
  }, [])
  useEffect(() => {
    if (isEnabled && !status) void check()
  }, [isEnabled, status, check])
  return { status, isChecking, check }
}

/** 계정 · 플랜 한 줄 (플랜을 모르면 계정만) */
function accountLine(s: ProviderStatus) {
  const plan = s.plan ? s.plan.charAt(0).toUpperCase() + s.plan.slice(1) : ''
  return [s.account, plan].filter(Boolean).join(' · ')
}

export function ProviderCard({ provider, status, isChecking, children }: { provider: AiProvider; status: ProviderStatus | null; isChecking: boolean; children?: React.ReactNode }) {
  const state = status?.state
  const isReady = state === 'ready'
  return (
    <div className={cn('bg-card flex min-w-0 flex-col gap-2 rounded-xl border p-4 text-sm', state && !isReady && 'border-status-waiting/60')}>
      <div className="flex items-center gap-2">
        <span className="font-semibold">{NAME[provider]}</span>
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
      {/* Codex 로그인 흐름은 M2에서 붙인다 — 지금은 버튼 자리만 둔다 */}
      {status && !isReady && provider === 'codex' && (
        <div className="flex flex-col gap-1">
          <Button size="sm" variant="outline" className="w-fit" disabled>
            <LogInIcon /> {t('provider.codex.login')}
          </Button>
          <span className="text-muted-foreground text-[11px]">{t('provider.codex.loginSoon')}</span>
        </div>
      )}
    </div>
  )
}

/** 두 카드를 나란히 */
export function ProviderCards({ status, isChecking, claudeExtra }: { status: ProvidersStatus | null; isChecking: boolean; claudeExtra?: React.ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PROVIDERS.map((p) => (
        <ProviderCard key={p} provider={p} status={status?.[p] ?? null} isChecking={isChecking}>
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
      <ProviderCards status={status} isChecking={isChecking} />
      <RecheckButton isChecking={isChecking} onCheck={() => void check()} />
    </>
  )
}
