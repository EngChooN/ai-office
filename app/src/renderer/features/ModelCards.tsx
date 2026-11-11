import type { ClaudeModel } from '@shared/types'
import { t } from '@shared/i18n'
import { cn } from '@/lib/utils'
import { CLAUDE_MODEL_ROWS, USAGE_DOTS } from './modelOptions'

/** 사용량 점 5칸 — 채운 칸이 많을수록 한도가 빨리 찬다 */
function UsageDots({ dots }: { dots: number }) {
  if (dots <= 0) return null
  return (
    <span className="flex shrink-0 gap-[3px]" aria-hidden>
      {Array.from({ length: USAGE_DOTS }, (_, i) => (
        <span key={i} className={cn('size-[7px] rounded-full', i < dots ? 'bg-primary' : 'bg-border')} />
      ))}
    </span>
  )
}

/** 고용 창의 Claude 모델 고르기 — 세로 라디오 카드 목록 (기본 → Fable → Opus → Sonnet → Haiku) */
export function ModelCards({ value, onChange }: { value: string; onChange: (v: ClaudeModel) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label={t('hire.model')} className="flex flex-col gap-1.5">
        {CLAUDE_MODEL_ROWS.map((r) => (
          <label
            key={r.value}
            className="border-border has-[:checked]:border-primary has-[:focus-visible]:border-primary flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[14px] border px-3 py-1.5 has-[:checked]:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_22%,transparent)]"
          >
            <input type="radio" name="hire-model" value={r.value} checked={value === r.value} onChange={() => onChange(r.value)} className="accent-primary size-4 shrink-0" />
            <span className="flex w-[92px] shrink-0 items-center gap-1.5 text-sm font-semibold">
              {r.name ?? t('hire.model.default')}
              {r.isNew && <span className="text-primary rounded-full bg-[color-mix(in_oklab,var(--ring)_18%,transparent)] px-1.5 text-[9.5px] leading-4 font-bold">NEW</span>}
            </span>
            <span className="text-muted-foreground min-w-0 flex-1 text-xs">{t(r.hintKey)}</span>
            <UsageDots dots={r.dots} />
          </label>
        ))}
      </div>
      <span className="text-muted-foreground self-end text-[11px]">{t('hire.model.usageLegend')}</span>
    </div>
  )
}
