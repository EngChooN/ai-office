import { useEffect, useRef, useState } from 'react'
import { BotIcon, CheckIcon, MessageCircleQuestionIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { AUTO_DAILY_DEFAULT, AUTO_HOURS, formatRemaining, type AutoApprovePlan } from '@shared/autoApprove'
import { maskSecrets } from '@shared/redact'
import type { AutoHandled } from '@shared/types'
import { useNow } from './status'
import { fmtDate, t } from '@shared/i18n'

// 자동결재(대표 부재 중) 화면 3곳: 설정 칸 · 상단 바 표시 · 결재함 "자동 처리됨" 목록
// 상태는 스냅샷 autoApprove, 목록은 autoApproveLog(), 켜고 끄기는 setAutoApprove(plan) — 휴대폰 앱도 같은 컴포넌트

/**
 * 자동결재 범위 안내 — 판정이 모든 변형을 막는다고 확인되기 전까지는 한계를 함께 적는다 (한리뷰 확인)
 * 파일 수정은 경로를 가리지 않고 승인한다는 점도 숨기지 않는다
 */
export const autoScopeText = () => t('autoApprove.scope')

const hhmm = (ts: number) => fmtDate(ts, { hour: '2-digit', minute: '2-digit', hour12: false })

/** 지금 상태 한 줄 */
function useAutoStatus() {
  const auto = useOffice((s) => s.autoApprove)
  const now = useNow(30_000)
  const { config, isActive, endsAt, startsAt } = auto
  const text = isActive
    ? t('autoApprove.active') + (endsAt ? ` · ${t('autoApprove.remaining', { time: formatRemaining(endsAt - now) })}` : '')
    : config.mode === 'daily'
      ? t('autoApprove.daily', { start: config.start, end: config.end }) + (startsAt ? ` · ${t('autoApprove.startsAt', { time: hhmm(startsAt) })}` : '')
      : t('autoApprove.off')
  return { auto, text, remaining: isActive && endsAt ? formatRemaining(endsAt - now) : null }
}

/** 켜기·끄기 — 실패하면 화면에 알린다 (실패 문구를 돌려준다) */
async function applyPlan(plan: AutoApprovePlan): Promise<string | null> {
  try {
    await window.office.setAutoApprove(plan)
    return null
  } catch (e) {
    const message = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : ''
    const reason = message ? `: ${message}` : ''
    return plan.mode === 'off' ? t('autoApprove.error.off', { reason }) : t('autoApprove.error.on', { reason })
  }
}

function usePlan() {
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const run = async (plan: AutoApprovePlan) => {
    setIsBusy(true)
    setError(await applyPlan(plan))
    setIsBusy(false)
  }
  return { error, isBusy, run }
}

/** 설정 › 자동결재 칸 */
export function AutoApproveSection() {
  const { auto, text } = useAutoStatus()
  const config = auto.config
  const [start, setStart] = useState(config.mode === 'daily' ? config.start : AUTO_DAILY_DEFAULT.start)
  const [end, setEnd] = useState(config.mode === 'daily' ? config.end : AUTO_DAILY_DEFAULT.end)
  const c = auto.counts
  const handled = c.edit + c.command + c.other
  const { error, isBusy, run: setPlan } = usePlan()
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 text-xs">
        <span className={auto.isActive ? 'text-status-working font-medium' : 'text-muted-foreground'}>🤖 {text}</span>
        {(auto.isActive || handled > 0 || c.answered > 0) && (
          <span className="text-muted-foreground">
            · {t('autoApprove.handledCount', { n: handled })}
            {c.answered ? ` · ${t('autoApprove.answeredCount', { n: c.answered })}` : ''}
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground w-16 text-xs">{t('autoApprove.fromNow')}</span>
        {AUTO_HOURS.map((h) => (
          <Button key={h} size="sm" variant="outline" className="h-7 px-2.5 text-xs" disabled={isBusy} onClick={() => void setPlan({ mode: 'hours', hours: h })}>
            {t('autoApprove.hours', { n: h })}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground w-16 text-xs">{t('autoApprove.everyDay')}</span>
        <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="phone:w-32 h-7 w-28 text-xs" aria-label={t('autoApprove.start')} />
        <span className="text-muted-foreground text-xs">~</span>
        <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="phone:w-32 h-7 w-28 text-xs" aria-label={t('autoApprove.end')} />
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" disabled={isBusy || !start || !end || start === end} onClick={() => void setPlan({ mode: 'daily', start, end })}>
          {config.mode === 'daily' && config.start === start && config.end === end ? <CheckIcon /> : null} {t('autoApprove.applyRange')}
        </Button>
      </div>
      {config.mode !== 'off' && (
        <Button size="sm" variant="outline" className="border-destructive/60 w-fit" disabled={isBusy} onClick={() => void setPlan({ mode: 'off' })}>
          {t('autoApprove.turnOff')}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-status-error text-xs">
          {error}
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        {t('autoApprove.help', { scope: autoScopeText() })}
      </p>
    </div>
  )
}

/** 상단 바: 켜져 있을 때만 "🤖 자동결재 중 · 남은 시간", 누르면 끄기·설정 */
export function AutoApproveBadge({ isCompact = false }: { isCompact?: boolean }) {
  const { auto, remaining } = useAutoStatus()
  const setView = useOffice((s) => s.setView)
  const [isOpen, setIsOpen] = useState(false)
  const { error, isBusy, run: setPlan } = usePlan()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isOpen) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setIsOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [isOpen])
  if (!auto.isActive) return null
  return (
    <div ref={ref} className="relative [-webkit-app-region:no-drag]">
      <Button size="sm" variant="outline" className="border-status-working/60 text-status-working shrink-0 px-2" onClick={() => setIsOpen((v) => !v)} aria-label={t('autoApprove.active')}>
        <BotIcon />
        {isCompact ? remaining : t('autoApprove.active') + (remaining ? ` · ${remaining}` : '')}
      </Button>
      {isOpen && (
        <div className="bg-popover absolute top-full right-0 z-50 mt-1 flex w-56 flex-col gap-1 rounded-lg border p-2 text-xs shadow-lg">
          <p className="text-muted-foreground px-1 pb-1">{autoScopeText()}</p>
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/60 justify-start"
            disabled={isBusy}
            onClick={() => void setPlan({ mode: 'off' })}
          >
            {t('autoApprove.turnOff')}
          </Button>
          {error && (
            <p role="alert" className="text-status-error px-1">
              {error}
            </p>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="justify-start"
            onClick={() => {
              setView('settings')
              setIsOpen(false)
            }}
          >
            {t('autoApprove.changeInSettings')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** 결재함 "자동 처리됨": 대표 대신 승인한 것·대신 답한 질문 (최근 순) */
export function AutoHandledList() {
  const counts = useOffice((s) => s.autoApprove.counts)
  const isActive = useOffice((s) => s.autoApprove.isActive)
  const [items, setItems] = useState<AutoHandled[]>([])
  const total = counts.edit + counts.command + counts.other + counts.answered
  useEffect(() => {
    void window.office.autoApproveLog().then((log) => setItems([...log].sort((a, b) => b.at - a.at)))
  }, [total, isActive])
  if (items.length === 0) return null
  return (
    <details className="mb-6 max-w-3xl" open={isActive}>
      <summary className="text-muted-foreground cursor-pointer text-sm font-semibold">🤖 {t('autoApprove.handledList', { n: items.length })}</summary>
      <ul className="mt-2 flex flex-col divide-y rounded-lg border text-xs">
        {items.map((h) => (
          <li key={h.id} className="flex items-start gap-2 px-3 py-2">
            <span className="text-muted-foreground w-[4.2em] shrink-0 tabular-nums">{fmtDate(h.at, { month: 'numeric', day: 'numeric' })}</span>
            <span className="text-muted-foreground w-[3em] shrink-0 tabular-nums">{hhmm(h.at)}</span>
            <span className="w-16 shrink-0 truncate font-medium">{h.staffName}</span>
            <span className={cn('min-w-0 flex-1 break-words', h.kind === 'answer' && 'text-primary')}>
              {h.kind === 'answer' ? (
                <>
                  <MessageCircleQuestionIcon className="mr-1 inline size-3.5" />
                  {t('autoApprove.answered')} · {maskSecrets(h.summary)}
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">{h.toolName}</span> {maskSecrets(h.summary)}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}
