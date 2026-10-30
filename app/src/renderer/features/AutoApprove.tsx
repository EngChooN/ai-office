import { useEffect, useRef, useState } from 'react'
import { BotIcon, CheckCheckIcon, CheckIcon, MessageCircleQuestionIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { AUTO_DAILY_DEFAULT, AUTO_HOURS, formatRemaining, type AutoApprovePlan } from '@shared/autoApprove'
import { ruleLabel, type ApprovalRule } from '@shared/approvalRules'
import { maskSecrets } from '@shared/redact'
import type { Approval, AutoHandled } from '@shared/types'
import { useNow } from './status'
import { fmtDate, t, trOr } from '@shared/i18n'
import { toolDisplayName } from '@shared/computerTools'
import { IS_MOBILE_SHELL } from '@/shell'

// 자동결재(대표 부재 중) 화면 3곳: 설정 칸 · 상단 바 표시 · 결재함 "자동 처리됨" 목록
// + "앞으로 항상 승인" 규칙: 결재 승인 옆 버튼 · 설정의 규칙 목록 (approveAlways·approvalRules·deleteApprovalRule)
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
  // '완전 자율' 단계면 그 이름으로 보인다
  const activeLabel = config.isFull ? t('autonomy.fullActive') : t('autoApprove.active')
  const text = isActive
    ? activeLabel + (endsAt ? ` · ${t('autoApprove.remaining', { time: formatRemaining(endsAt - now) })}` : '')
    : config.mode === 'daily'
      ? t('autoApprove.daily', { start: config.start, end: config.end }) + (startsAt ? ` · ${t('autoApprove.startsAt', { time: hhmm(startsAt) })}` : '')
      : t('autoApprove.off')
  return { auto, text, activeLabel, remaining: isActive && endsAt ? formatRemaining(endsAt - now) : null }
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
  const [fullError, setFullError] = useState<string | null>(null)
  const isFull = Boolean(config.isFull)
  // 단계 바꾸기: '완전 자율' 켜기·끄기 (기간은 그대로). 휴대폰에서는 끄기만
  const handleFull = async (next: boolean) => {
    try {
      await window.office.setAutoFull(next)
      setFullError(null)
    } catch (e) {
      setFullError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : t('autonomy.pcOnly'))
    }
  }
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
      <div className="flex flex-col gap-1">
        <label className={cn('flex w-fit items-center gap-1.5 text-xs', IS_MOBILE_SHELL && !isFull ? 'opacity-60' : 'cursor-pointer')}>
          <input type="checkbox" checked={isFull} disabled={IS_MOBILE_SHELL && !isFull} onChange={(e) => void handleFull(e.target.checked)} />
          <BotIcon className={cn('size-3.5', isFull && 'text-status-working')} />
          <span className={cn('font-medium', isFull && 'text-status-working')}>{t('autonomy.full')}</span>
          <span className="text-muted-foreground">· {t('autonomy.hint')}</span>
        </label>
        <p className="text-muted-foreground pl-5 text-xs">{IS_MOBILE_SHELL && !isFull ? t('autonomy.pcOnly') : t('autonomy.fullHint')}</p>
        {fullError && (
          <p role="alert" className="text-status-error pl-5 text-xs">
            {fullError}
          </p>
        )}
      </div>
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
  const { auto, remaining, activeLabel } = useAutoStatus()
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
      <Button size="sm" variant="outline" className="border-status-working/60 text-status-working shrink-0 px-2" onClick={() => setIsOpen((v) => !v)} aria-label={activeLabel}>
        <BotIcon />
        {isCompact ? remaining : activeLabel + (remaining ? ` · ${remaining}` : '')}
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
  // waited: 자율 진행에서 건너뛴 작업도 목록에 남는다
  const total = counts.edit + counts.command + counts.other + counts.answered + counts.waited
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
                  {t('autoApprove.answered')} · {maskSecrets(trOr(h.summaryI18n, h.summary))}
                </>
              ) : (
                <>
                  {/* 자율 진행: 건너뛴 위험 작업 · 자동 승인한 기획안 */}
                  {h.kind === 'skipped' && <span className="text-status-waiting mr-1 font-medium">{t('autonomy.skipped')}</span>}
                  {h.kind === 'plan' && <span className="text-status-working mr-1 font-medium">{t('autonomy.planApproved')}</span>}
                  <span className="text-muted-foreground">{toolDisplayName(h.toolName)}</span> {maskSecrets(trOr(h.summaryI18n, h.summary))}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}

/** 결재 승인 옆 "앞으로 자동 승인" — 이 직원의 같은 종류 요청을 규칙으로 넘긴다. 위험 명령·질문이면 버튼이 없다 */
export function AlwaysApproveButton({ approval, staffName }: { approval: Approval; staffName: string }) {
  const [isBusy, setIsBusy] = useState(false)
  if (!approval.alwaysRule) return null
  const rule = ruleLabel(approval.alwaysRule)
  const handleClick = async () => {
    if (!window.confirm(t('rule.confirm', { name: staffName, rule }))) return
    setIsBusy(true)
    await window.office.approveAlways(approval.id)
    setIsBusy(false)
  }
  return (
    <Button size="sm" variant="ghost" className="text-xs" disabled={isBusy} title={t('rule.buttonHint', { name: staffName, rule })} onClick={() => void handleClick()}>
      <CheckCheckIcon /> {t('rule.button')}
    </Button>
  )
}

/** 설정 › 자동결재 아래: 만들어 둔 "앞으로 항상 승인" 규칙 보기·지우기 */
export function ApprovalRulesList() {
  const staff = useOffice((s) => s.staff)
  const [rules, setRules] = useState<ApprovalRule[]>([])
  const refresh = () => void window.office.approvalRules().then(setRules)
  useEffect(refresh, [])
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? '—'
  const handleDelete = async (r: ApprovalRule) => {
    if (!window.confirm(t('rule.confirmDelete', { name: nameOf(r.staffId), rule: ruleLabel(r) }))) return
    await window.office.deleteApprovalRule(r.id)
    refresh()
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-muted-foreground text-xs">{t('rule.listHelp')}</p>
      {rules.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('rule.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border text-xs">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="w-20 shrink-0 truncate font-medium">{nameOf(r.staffId)}</span>
              <span className="min-w-0 flex-1 font-mono break-all">{ruleLabel(r)}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">{fmtDate(r.createdAt, { month: 'numeric', day: 'numeric' })}</span>
              <Button size="icon" variant="ghost" className="size-7" aria-label={t('rule.delete')} onClick={() => void handleDelete(r)}>
                <Trash2Icon className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
