import { useState } from 'react'
import { HourglassIcon, InfoIcon, PlayIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { fmtDate, t, type TKey } from '@shared/i18n'
import { PLAN_WINDOW_LABEL, type PlanUsage } from '@shared/types'

const ORDER = Object.keys(PLAN_WINDOW_LABEL)
/** 선택자가 매번 새 배열을 돌려주면 zustand가 무한 렌더에 빠진다 — 빈 값은 늘 같은 배열로 */
const NO_USAGE: PlanUsage[] = []
/** 한도 종류 이름 — 모르는 종류는 받은 값 그대로 */
const typeLabel = (type: string) => (type in PLAN_WINDOW_LABEL ? t(`planUsage.window.${type}` as TKey) : type)
/** 대시보드(compact)에선 기본 한도 두 줄만 */
const COMPACT_TYPES = new Set(['five_hour', 'seven_day'])
const WARN_PERCENT = 80
const MINUTE_MS = 60_000

/** "2시간 10분 뒤" 같은 남은 시간 */
function untilText(at: number) {
  const ms = at - Date.now()
  if (ms <= 0) return t('planUsage.resetDone')
  // 분을 먼저 반올림해야 59.5분이 '1시간 60분'이 되지 않고 다음 시간으로 넘어간다
  const totalMin = Math.round(ms / MINUTE_MS)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h >= 24) return t('planUsage.inDaysHours', { d: Math.floor(h / 24), h: h % 24 })
  return h ? t('planUsage.inHoursMinutes', { h, m }) : t('planUsage.inMinutes', { m })
}

function resetText(at: number) {
  const d = new Date(at)
  const isToday = d.toDateString() === new Date().toDateString()
  const time = fmtDate(d, isToday ? { hour: 'numeric', minute: '2-digit' } : { month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' })
  return `${t('planUsage.resetAt', { time })} · ${untilText(at)}`
}

function Row({ usage, isCompact }: { usage: PlanUsage; isCompact: boolean }) {
  const pct = usage.percent
  const isOver = usage.status === 'rejected'
  const isWarn = !isOver && (usage.status === 'allowed_warning' || (pct ?? 0) >= WARN_PERCENT)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2 text-xs">
        <span className={cn('shrink-0 font-medium', isCompact ? 'w-14' : 'w-28')}>{typeLabel(usage.type)}</span>
        <span className={cn('font-semibold tabular-nums', isOver ? 'text-status-error' : isWarn ? 'text-status-waiting' : '')}>{pct === null ? '—' : `${pct}%`}</span>
        {isOver && <span className="text-status-error">{t('planUsage.limitReached')}</span>}
        <span className={cn('text-muted-foreground ml-auto', isCompact && 'min-w-0 truncate')}>{usage.resetsAt ? resetText(usage.resetsAt) : t('planUsage.resetUnknown')}</span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div className={cn('h-full rounded-full', isOver ? 'bg-status-error' : isWarn ? 'bg-status-waiting' : 'bg-primary')} style={{ width: `${Math.min(100, isOver ? 100 : (pct ?? 0))}%` }} />
      </div>
    </div>
  )
}

/** 플랜 한도가 높아 보류 중인 일 — 회복 시각과 [바로 시작]. 보류 중이 아니면 숨긴다 (상황판) */
export function PlanHoldBanner({ className }: { className?: string }) {
  const hold = useOffice((s) => s.planHold)
  if (!hold?.isHeld) return null
  const names = hold.items.slice(0, 3).map((i) => i.label).join(', ')
  return (
    <section className={cn('border-status-waiting/40 bg-status-waiting/10 flex flex-col gap-2 rounded-xl border p-3', className)}>
      <div className="flex items-center gap-2 text-xs font-semibold">
        <HourglassIcon className="size-3.5" /> {t('planHold.title', { percent: Math.round(hold.percent ?? 100) })}
      </div>
      <p className="text-muted-foreground text-xs">
        {hold.resumeAt ? t('planHold.resume', { time: resetText(hold.resumeAt) }) : t('planHold.resumeUnknown')}
        {hold.items.length > 0 && ` · ${t('planHold.items', { n: hold.items.length })}: ${names}${hold.items.length > 3 ? '…' : ''}`}
      </p>
      {hold.items.length > 0 && (
        <Button size="sm" variant="secondary" className="h-7 self-start text-xs" onClick={() => void window.office.releasePlanHold()}>
          <PlayIcon className="size-3.5" /> {t('planHold.startNow')}
        </Button>
      )}
    </section>
  )
}

/** 엔진(Claude·Codex) 플랜 사용률(참고) — 엔진이 토큰 수 대신 사용률과 리셋 시각만 알려 주므로 그대로 보여 준다. compact = 대시보드 칸 (5시간·7일만, 바깥 간격은 부모가 준다) */
export function PlanUsageCard({ isCompact = false }: { isCompact?: boolean }) {
  const list = useOffice((s) => s.planUsage).filter((u) => !isCompact || COMPACT_TYPES.has(u.type))
  const sorted = [...list].sort((a, b) => (ORDER.indexOf(a.type) + 1 || 99) - (ORDER.indexOf(b.type) + 1 || 99))
  const updatedAt = Math.max(0, ...list.map((u) => u.updatedAt))
  const codex = useOffice((s) => s.codexUsage ?? NO_USAGE).filter((u) => !isCompact || COMPACT_TYPES.has(u.type) || u.type === 'thirty_day')
  const sortedCodex = [...codex].sort((a, b) => (ORDER.indexOf(a.type) + 1 || 99) - (ORDER.indexOf(b.type) + 1 || 99))
  // Codex만 연결된 사람에겐 빈 Claude 칸이 쓸모없다 — Claude 값이 없고 Codex 값이 있으면 숨긴다
  const isClaudeShown = sorted.length > 0 || sortedCodex.length === 0
  const [isChecking, setIsChecking] = useState(false)
  const note = t('planUsage.note')
  const handleRefresh = async () => {
    setIsChecking(true)
    try {
      await window.office.refreshPlanUsage()
    } finally {
      setIsChecking(false)
    }
  }
  return (
    <section className={cn('bg-card flex flex-col gap-3 rounded-xl border p-4', !isCompact && 'mb-6 max-w-3xl')}>
      <header className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{t('planUsage.title')}</h2>
        {isCompact ? (
          <InfoIcon className="text-muted-foreground size-3.5 self-center" aria-label={note}>
            <title>{note}</title>
          </InfoIcon>
        ) : (
          <span className="text-muted-foreground text-xs">{t('planUsage.forReference')}</span>
        )}
        {updatedAt > 0 && (
          <span className="text-muted-foreground ml-auto text-[11px]">
            {t('planUsage.asOf', { time: fmtDate(updatedAt, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) })}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className={cn('h-7 text-xs', updatedAt === 0 && 'ml-auto')}
          onClick={() => void handleRefresh()}
          disabled={isChecking}
          title={t('planUsage.refreshTitle')}
        >
          <RefreshCwIcon className={cn('size-3.5', isChecking && 'animate-spin')} />
          {!isCompact && ` ${t('planUsage.refresh')}`}
        </Button>
      </header>
      {isClaudeShown && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{t('planUsage.titleClaude')}</h3>
          {sorted.length === 0 ? (
            <p className="text-muted-foreground text-xs">{t(isCompact ? 'planUsage.emptyCompact' : 'planUsage.empty')}</p>
          ) : (
            sorted.map((u) => <Row key={u.type} usage={u} isCompact={isCompact} />)
          )}
        </div>
      )}
      {/* Codex(GPT)에 로그인한 사람만 — 무료 플랜은 30일 창 하나, 유료는 5시간·주간 */}
      {sortedCodex.length > 0 && (
        <div className={cn('flex flex-col gap-3', isClaudeShown && 'border-t pt-3')}>
          <h3 className="text-sm font-semibold">{t('planUsage.titleCodex')}</h3>
          {sortedCodex.map((u) => (
            <Row key={`codex-${u.type}`} usage={u} isCompact={isCompact} />
          ))}
        </div>
      )}
      {!isCompact && <p className="text-muted-foreground text-[11px]">{note}</p>}
    </section>
  )
}

/** 상단 바: 기본 한도(5시간·7일) 사용률 한 줄. 누르면 급여 명세서로. 아직 값이 없으면 숨긴다 */
export function PlanUsageChip({ usage, onOpen }: { usage: PlanUsage[]; onOpen: () => void }) {
  const shown = usage.filter((u) => COMPACT_TYPES.has(u.type) && u.percent !== null).sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
  if (shown.length === 0) return null
  return (
    <button type="button" onClick={onOpen} title={t('planUsage.chipTitle')} className="text-muted-foreground text-xs tabular-nums [-webkit-app-region:no-drag] hover:underline">
      {t('planUsage.chip')}{' '}
      {shown.map((u, i) => (
        <span key={u.type} className={cn((u.percent ?? 0) >= WARN_PERCENT && 'text-status-waiting', (u.percent ?? 0) >= 100 && 'text-status-error')}>
          {i > 0 && ' · '}
          {typeLabel(u.type)} {Math.round(u.percent ?? 0)}%
        </span>
      ))}
    </button>
  )
}
