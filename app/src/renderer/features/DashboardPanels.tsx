import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { AlertCircleIcon, ArrowUpRightIcon, CheckCircle2Icon, CheckIcon, ClipboardCheckIcon, GaugeIcon, MessageCircleQuestionIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { BUDGET_WARN_RATIO, FEED_TYPES, formatAgo, formatElapsed, usageRatio, type AttentionItem, type AttentionKind, type SummaryKey } from '@shared/dashboard'
import type { BudgetPeriod, LogEntry, Payslip, Staff } from '@shared/types'
import { t, fmtNumber, type TKey } from '@shared/i18n'
import { PlanHoldBanner, PlanUsageCard } from './PlanUsageCard'
import { Avatar } from './StaffCard'
import { formatTokens, STATUS_META, useNow } from './status'

const NOW_TICK_MS = 60_000
const ATTENTION_VISIBLE = 3
const FEED_VISIBLE = 5
const FEED_MAX = 10
/** 목록 순서가 바뀐 직후 엉뚱한 항목을 누르지 않게 버튼을 잠깐 막는다 */
const REORDER_GUARD_MS = 300
/** 이보다 긴(또는 여러 줄) 결재 내용은 잘린 채 승인하지 않도록 결재함으로 보낸다 */
const INLINE_APPROVAL_MAX = 120
const PERIOD_LABEL: Record<BudgetPeriod, TKey> = { day: 'dashboardPanels.period.day', week: 'dashboardPanels.period.week', month: 'dashboardPanels.period.month' }

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const startOfDay = (ms: number) => new Date(new Date(ms).setHours(0, 0, 0, 0)).getTime()

/** 오늘 0시. 계속 띄워 두는 화면이라 자정이 지나면 바뀐다 */
function useToday() {
  return startOfDay(useNow(NOW_TICK_MS))
}
// 80% 미만 기본, 80~99% 경고, 100% 이상 초과 (급여 명세서·플랜 사용률과 같은 기준)
const ratioTone = (ratio: number | null) => (ratio === null || ratio < BUDGET_WARN_RATIO ? 'normal' : ratio < 1 ? 'warn' : 'over')
const TONE_TEXT = { normal: 'text-muted-foreground', warn: 'text-status-waiting', over: 'text-status-error' } as const
const TONE_BAR = { normal: 'bg-primary', warn: 'bg-status-waiting', over: 'bg-status-error' } as const

/** 이번 달 급여 명세서(기간별 토큰·직원별 비용). 비용이 바뀌거나 날짜가 바뀌면 다시 읽는다 */
export function usePayslip() {
  const monthCost = useOffice((s) => s.monthCostUsd)
  const today = useToday()
  const [slip, setSlip] = useState<Payslip | null>(null)
  useEffect(() => {
    void window.office.payslip(monthKey(new Date(today))).then(setSlip)
  }, [monthCost, today])
  return slip
}

// ── 요약 줄 ─────────────────────────────────────────────

function Tile({
  label,
  value,
  sub,
  dot,
  tone,
  isPressed,
  isLink,
  title,
  onClick,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  dot?: string
  tone?: 'waiting' | 'error'
  isPressed?: boolean
  isLink?: boolean
  title?: string
  onClick: () => void
}) {
  const isZero = value === 0
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={isLink ? undefined : Boolean(isPressed)}
      className={cn(
        'bg-card hover:bg-accent relative flex min-w-0 flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors',
        !isZero && tone === 'waiting' && 'border-status-waiting/70',
        !isZero && tone === 'error' && 'border-status-error/70',
        isPressed && 'border-primary bg-accent',
      )}
    >
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {dot && <span className={cn('size-2 shrink-0 rounded-full', dot, isZero && 'opacity-40')} />}
        {label}
      </span>
      <span className={cn('text-2xl font-semibold tabular-nums', isZero ? 'text-muted-foreground' : tone === 'waiting' ? 'text-status-waiting' : tone === 'error' ? 'text-status-error' : '')}>
        {value}
      </span>
      {sub}
      {isLink && <ArrowUpRightIcon className="text-muted-foreground absolute top-2 right-2 size-3" />}
    </button>
  )
}

/** 상태 4칸(누르면 직원 격자 필터) + 지표 2칸(누르면 해당 화면) */
export function SummaryRow({
  counts,
  todayDone,
  slip,
  filter,
  onFilter,
}: {
  counts: Record<SummaryKey, number>
  todayDone: number
  slip: Payslip | null
  filter: SummaryKey | null
  onFilter: (key: SummaryKey | null) => void
}) {
  const setView = useOffice((s) => s.setView)
  const secretaryTokens = useOffice((s) => s.secretary?.usageTodayTokens ?? 0)
  const day = slip?.periods.find((p) => p.period === 'day')
  const month = slip?.periods.find((p) => p.period === 'month')
  const monthRatio = month ? usageRatio(month.usedTokens, month.limitTokens) : null
  const tone = ratioTone(monthRatio)
  const statusTiles: { key: SummaryKey; tone?: 'waiting' | 'error'; title?: string }[] = [
    { key: 'working' },
    { key: 'waiting', tone: 'waiting' },
    { key: 'error', tone: 'error' },
    { key: 'idle', title: t('dashboardPanels.idleTitle') },
  ]
  return (
    <div className="grid grid-cols-3 gap-3 @xl:grid-cols-6">
      {statusTiles.map(({ key, tone: tileTone, title }) => {
        const meta = STATUS_META[key]
        return (
          <Tile
            key={key}
            label={meta.label}
            value={counts[key]}
            dot={cn(meta.dot, key === 'working' && counts.working > 0 && 'animate-pulse')}
            tone={tileTone}
            title={title}
            isPressed={filter === key}
            onClick={() => onFilter(filter === key ? null : key)}
          />
        )
      })}
      <Tile
        label={
          <>
            <CheckIcon className="size-3.5" /> {t('dashboardPanels.todayDone')}
          </>
        }
        value={todayDone}
        isLink
        onClick={() => setView('board')}
      />
      <Tile
        label={t('dashboardPanels.todayTokens')}
        value={day ? formatTokens(day.usedTokens) : '—'}
        sub={
          <span className={cn('text-[11px]', TONE_TEXT[tone])}>
            {monthRatio === null ? t('dashboardPanels.noLimit') : t('dashboardPanels.monthBudget', { percent: fmtNumber(Math.round(monthRatio * 100)) })}
            {/* 비서 사용량도 같은 계정 사용량이라 합계에 들고, 따로 한 줄 */}
            {secretaryTokens > 0 && <span className="text-muted-foreground block">{t('dashboardPanels.secretaryShare', { tokens: formatTokens(secretaryTokens) })}</span>}
          </span>
        }
        isLink
        onClick={() => setView('payroll')}
      />
    </div>
  )
}

// ── 확인 필요 ───────────────────────────────────────────

const KIND_META: Record<AttentionKind, { label: TKey; icon: typeof AlertCircleIcon; tone: 'waiting' | 'error' }> = {
  approval: { label: 'dashboardPanels.kind.approval', icon: ClipboardCheckIcon, tone: 'waiting' },
  question: { label: 'dashboardPanels.kind.question', icon: MessageCircleQuestionIcon, tone: 'waiting' },
  error: { label: 'dashboardPanels.kind.error', icon: AlertCircleIcon, tone: 'error' },
  budget: { label: 'dashboardPanels.kind.budget', icon: GaugeIcon, tone: 'waiting' },
}

function KindBadge({ kind, ratio }: { kind: AttentionKind; ratio?: number }) {
  const meta = KIND_META[kind]
  const isOver = kind === 'error' || (ratio !== undefined && ratio >= 1)
  const Icon = meta.icon
  return (
    <Badge variant="outline" className={cn('h-5 shrink-0 gap-1 px-1.5 text-[10px]', isOver ? 'border-status-error/50 text-status-error' : 'border-status-waiting/50 text-status-waiting')}>
      <Icon className="size-3" />
      {kind === 'budget' && ratio !== undefined ? t('dashboardPanels.kind.budgetPercent', { percent: fmtNumber(Math.round(ratio * 100)) }) : t(meta.label)}
    </Badge>
  )
}

function ApprovalActions({ approvalId, staffName, isGuarded }: { approvalId: string; staffName: string; isGuarded: boolean }) {
  const [pending, setPending] = useState<'allow' | 'deny' | null>(null)
  const [isFailed, setIsFailed] = useState(false)
  const handleDecide = async (allow: boolean) => {
    setPending(allow ? 'allow' : 'deny')
    setIsFailed(false)
    try {
      // 성공하면 결재가 스토어에서 빠지며 이 줄도 같이 사라진다
      await window.office.decide(approvalId, allow)
    } catch {
      setIsFailed(true)
    } finally {
      setPending(null)
    }
  }
  const isDisabled = pending !== null || isGuarded
  return (
    <>
      {isFailed && <span className="text-status-error mr-auto text-xs">{t('dashboardPanels.decideFailed')}</span>}
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={isDisabled} aria-label={t('dashboardPanels.rejectAria', { name: staffName })} onClick={() => void handleDecide(false)}>
        {pending === 'deny' ? t('dashboardPanels.processing') : t('dashboardPanels.reject')}
      </Button>
      <Button size="sm" className="h-7 text-xs" disabled={isDisabled} aria-label={t('dashboardPanels.approveAria', { name: staffName })} onClick={() => void handleDecide(true)}>
        <CheckIcon /> {pending === 'allow' ? t('dashboardPanels.processing') : t('dashboardPanels.approve')}
      </Button>
    </>
  )
}

function AttentionRow({ item, staff, now, isGuarded }: { item: AttentionItem; staff: Staff | undefined; now: number; isGuarded: boolean }) {
  const select = useOffice((s) => s.select)
  const setView = useOffice((s) => s.setView)
  const teamName = useOffice((s) => s.teams.find((tm) => tm.id === staff?.teamId)?.name)
  const isGlobalBudget = !staff
  const open = () => (staff ? select(staff.id) : setView('payroll'))
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      open()
    }
  }
  const summary = item.approval?.summary ?? ''
  const isLongApproval = item.kind === 'approval' && (summary.length > INLINE_APPROVAL_MAX || summary.includes('\n'))
  const isInlineApproval = item.kind === 'approval' && !isLongApproval
  const body =
    item.kind === 'approval'
      ? `${item.approval?.toolName ?? ''} · ${summary}`
      : item.kind === 'question'
        ? item.approval?.questions?.[0]?.question
        : item.kind === 'error'
          ? staff?.activity
          : isGlobalBudget
            ? t('dashboardPanels.budget.globalNear')
            : t('dashboardPanels.budget.staffNear')
  return (
    <div role="button" tabIndex={0} onClick={open} onKeyDown={handleKeyDown} className="hover:bg-accent/60 flex cursor-pointer flex-col gap-1.5 border-t px-4 py-3 first:border-t-0">
      <div className="flex min-w-0 items-center gap-2">
        {staff ? <Avatar avatar={staff.avatar} name={staff.name} teamId={staff.teamId} className="size-6" /> : <GaugeIcon className="text-muted-foreground size-6 shrink-0" />}
        <span className="truncate text-sm font-medium">{staff?.name ?? t('dashboardPanels.budget.globalName')}</span>
        {teamName && <span className="text-muted-foreground truncate text-xs">{teamName}</span>}
        <KindBadge kind={item.kind} ratio={item.ratio} />
        {item.createdAt > 0 && <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">{formatElapsed(Math.max(0, now - item.createdAt))}</span>}
      </div>
      {body && (
        // 바로 승인할 결재는 자르지 않고 전부 보여 준다 (120자 이하라 몇 줄 안 된다)
        <p className={cn('text-muted-foreground selectable text-xs break-all', !isInlineApproval && 'line-clamp-2')} title={body}>
          {body}
        </p>
      )}
      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
        {isLongApproval ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setView('inbox')}>
            {t('dashboardPanels.reviewInInbox')}
          </Button>
        ) : item.kind === 'approval' && item.approval ? (
          <ApprovalActions approvalId={item.approval.id} staffName={staff?.name ?? ''} isGuarded={isGuarded} />
        ) : item.kind === 'question' ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={open}>
            {t('dashboardPanels.answer')}
          </Button>
        ) : item.kind === 'error' ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={open}>
            {t('dashboardPanels.check')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setView('payroll')}>
            {t('dashboardPanels.viewPayslip')}
          </Button>
        )}
      </div>
    </div>
  )
}

/** 결재·질문·오류·예산 경고를 모아 보여 준다. 결재는 여기서 바로 승인·반려 */
export function AttentionCard({ items, staffById }: { items: AttentionItem[]; staffById: Map<string, Staff> }) {
  const setView = useOffice((s) => s.setView)
  const now = useNow(NOW_TICK_MS)
  const [isExpanded, setIsExpanded] = useState(false)
  // 맨 위 항목이 바뀌면(오류가 새로 올라오는 등) 잠깐 버튼을 막는다
  const order = items.map((i) => i.key).join('|')
  const [isGuarded, setIsGuarded] = useState(false)
  useEffect(() => {
    setIsGuarded(true)
    const timer = setTimeout(() => setIsGuarded(false), REORDER_GUARD_MS)
    return () => clearTimeout(timer)
  }, [order])
  const counts = useMemo(() => {
    const c: Record<AttentionKind, number> = { approval: 0, question: 0, error: 0, budget: 0 }
    for (const i of items) c[i.kind]++
    return c
  }, [items])
  const shown = isExpanded ? items : items.slice(0, ATTENTION_VISIBLE)
  return (
    <section className="bg-card flex min-w-0 flex-col rounded-xl border">
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <h2 className="text-sm font-semibold">{t('dashboardPanels.attentionTitle')}</h2>
        {items.length > 0 && (
          <span className="bg-status-waiting rounded-full px-1.5 text-[10px] font-semibold text-black" aria-live="polite">
            {items.length}
          </span>
        )}
        <span className="text-muted-foreground truncate text-xs">
          {(Object.keys(counts) as AttentionKind[])
            .filter((k) => counts[k] > 0)
            .map((k) => `${t(KIND_META[k].label)} ${fmtNumber(counts[k])}`)
            .join(' · ')}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto h-7 shrink-0 text-xs" onClick={() => setView('inbox')}>
          {t('dashboardPanels.openInbox')}
        </Button>
      </header>
      {items.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 px-4 pb-3 text-sm">
          <CheckCircle2Icon className="text-status-working size-4" /> {t('dashboardPanels.attentionEmpty')}
        </p>
      ) : (
        <>
          <div className="flex flex-col">
            {shown.map((item) => (
              <AttentionRow key={item.key} item={item} staff={staffById.get(item.staffId)} now={now} isGuarded={isGuarded} />
            ))}
          </div>
          {items.length > ATTENTION_VISIBLE && (
            <Button variant="ghost" size="sm" className="m-1 h-7 self-center text-xs" onClick={() => setIsExpanded((v) => !v)}>
              {isExpanded ? t('dashboardPanels.collapse') : t('dashboardPanels.showMoreCount', { count: fmtNumber(items.length - ATTENTION_VISIBLE) })}
            </Button>
          )}
        </>
      )}
    </section>
  )
}

// ── 사용량·한도 ─────────────────────────────────────────

/** Claude 플랜 사용률(실제 한도) + 쓴 토큰(오늘·이번 주·이번 달) */
export function UsageCard({ slip }: { slip: Payslip | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section className="bg-card flex flex-col gap-2 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">{t('dashboardPanels.usedTokens')}</h2>
        {slip ? (
          slip.periods.map((p) => (
            <div key={p.period} className="flex items-baseline text-xs">
              <span className="text-muted-foreground">{t(PERIOD_LABEL[p.period])}</span>
              <span className="ml-auto font-semibold tabular-nums">{formatTokens(p.usedTokens)}</span>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground text-xs">{t('dashboardPanels.loading')}</p>
        )}
      </section>
      <PlanHoldBanner />
      <PlanUsageCard isCompact />
    </div>
  )
}

// ── 최근 활동 ───────────────────────────────────────────

/** 오늘 기록을 한 번 읽고, 이후엔 실시간 기록을 이어 붙인다 */
function useTodayFeed() {
  const liveLogs = useOffice((s) => s.liveLogs)
  const today = useToday()
  const [base, setBase] = useState<LogEntry[]>([])
  useEffect(() => {
    void window.office.timeline(today).then(setBase)
  }, [today])
  return useMemo(() => {
    const seen = new Set(base.map((l) => l.id))
    return [...base, ...liveLogs.filter((l) => !seen.has(l.id))]
      .filter((l) => l.ts >= today && FEED_TYPES.has(l.type))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, FEED_MAX)
  }, [base, liveLogs, today])
}

export function ActivityFeed({ staffById }: { staffById: Map<string, Staff> }) {
  const select = useOffice((s) => s.select)
  const setView = useOffice((s) => s.setView)
  const now = useNow(NOW_TICK_MS)
  const logs = useTodayFeed()
  const [isExpanded, setIsExpanded] = useState(false)
  const shown = isExpanded ? logs : logs.slice(0, FEED_VISIBLE)
  return (
    <section className="bg-card flex min-w-0 flex-col gap-1 rounded-xl border p-3 @3xl:col-span-2 @6xl:col-span-1">
      <header className="flex items-center gap-2 px-1 pb-1">
        <h2 className="text-sm font-semibold">{t('dashboardPanels.activityTitle')}</h2>
        <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => setView('report')}>
          {t('dashboardPanels.viewAll')}
        </Button>
      </header>
      {logs.length === 0 ? (
        <p className="text-muted-foreground px-1 text-xs">{t('dashboardPanels.activityEmpty')}</p>
      ) : (
        shown.map((l) => {
          const s = staffById.get(l.staffId)
          return (
            <button key={`${l.id}-${l.ts}`} type="button" onClick={() => s && select(s.id)} className="hover:bg-accent flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs">
              {s ? <Avatar avatar={s.avatar} name={s.name} teamId={s.teamId} className="size-5" /> : <span className="bg-muted size-5 shrink-0 rounded-full" />}
              <span className="shrink-0 font-medium">{s?.name ?? t('common.formerStaff')}</span>
              <span className={cn('min-w-0 flex-1 truncate', l.type === 'error' ? 'text-status-error' : 'text-muted-foreground')}>{l.text.replace(/\s+/g, ' ')}</span>
              <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">{formatAgo(l.ts, now)}</span>
            </button>
          )
        })
      )}
      {logs.length > FEED_VISIBLE && (
        <Button variant="ghost" size="sm" className="h-7 self-center text-xs" onClick={() => setIsExpanded((v) => !v)}>
          {isExpanded ? t('dashboardPanels.collapse') : t('dashboardPanels.showMore')}
        </Button>
      )}
    </section>
  )
}
