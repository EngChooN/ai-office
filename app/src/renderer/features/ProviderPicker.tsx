import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AiProvider, ProvidersStatus } from '@shared/types'
import { recommendedEngine } from '@shared/roleEngine'
import { t, type TKey } from '@shared/i18n'
import { PROVIDER_NAME, PROVIDERS } from './ProviderCards'

/** 두 엔진이 다 준비됐는지 — 이때만 엔진을 고르게 한다 */
export const isBothReady = (s: ProvidersStatus | null) => s?.claude.state === 'ready' && s.codex.state === 'ready'

/** 공급자 고르기 — 준비된 쪽만 누를 수 있다. Codex에는 베타, 직무 추천 엔진에는 추천 표시 (고용 창·직원 마켓이 같이 쓴다) */
export function ProviderPicker({ status, value, onChange, role }: { status: ProvidersStatus | null; value: AiProvider; onChange: (p: AiProvider) => void; role?: string }) {
  const recommended = role ? recommendedEngine(role)?.provider : undefined
  return (
    <div className="bg-muted flex w-fit rounded-lg p-0.5">
      {PROVIDERS.map((p) => {
        const isReady = status?.[p].state === 'ready'
        return (
          <button
            key={p}
            type="button"
            disabled={!isReady}
            onClick={() => onChange(p)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50',
              value === p ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {PROVIDER_NAME[p]}
            {p === 'codex' && (
              <Badge variant="outline" className="text-muted-foreground px-1 py-0 text-[10px]">
                {t('provider.beta')}
              </Badge>
            )}
            {p === recommended && (
              <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                {t('engine.recommended')}
              </Badge>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** 직무 추천 엔진의 이유 한 줄 (추천이 없는 직무면 빈 문자열) */
export function engineReason(role: string): string {
  const r = recommendedEngine(role)
  return r ? `${t('engine.recommended')} ${PROVIDER_NAME[r.provider]} · ${t(`engine.reason.${r.slug}` as TKey)}` : ''
}
