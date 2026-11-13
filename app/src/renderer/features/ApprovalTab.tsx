import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Approval, ApprovalHistoryFilter, ApprovalRecord, Staff } from '@shared/types'
import { approvalHeadline } from '@shared/approvalEffect'
import { APPROVAL_HISTORY_PAGE_SIZE, groupByDay, mergeNewer, prependRecord, shownResult } from '@shared/approvalHistory'
import { dayKey } from '@shared/recordLogs'
import { fmtDate, t, trOr, type TKey } from '@shared/i18n'
import { QuestionBox, StopWorkButton } from './QuestionBox'
import { WaitReasonLine } from './WaitReasonLine'
import { ApprovalSummary } from './ApprovalSummary'
import { useDecide } from './useDecide'

const DAY_LABEL: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', weekday: 'short' }

/** 날짜 머리 글 (오늘 · 11월 13일 (금) / 어제 · … / 11월 10일 (화), 올해가 아니면 연도도) */
export function dayLabel(ts: number) {
  const now = new Date()
  const date = fmtDate(ts, new Date(ts).getFullYear() === now.getFullYear() ? DAY_LABEL : { ...DAY_LABEL, year: 'numeric' })
  const key = dayKey(ts)
  if (key === dayKey(now.getTime())) return t('staffPanel.log.today', { date })
  if (key === dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime())) return t('staffPanel.log.yesterday', { date })
  return date
}

const FILTERS: ApprovalHistoryFilter[] = ['all', 'approved', 'rejected', 'answered', 'auto']
const RESULT_CLASS: Record<ReturnType<typeof shownResult>, string> = {
  approved: 'bg-status-working/15 text-status-working',
  rejected: 'bg-status-error/15 text-status-error',
  answered: 'bg-primary/15 text-primary',
  skipped: 'bg-muted text-muted-foreground',
  canceled: 'bg-muted text-muted-foreground',
  auto: 'bg-accent-b/15 text-accent-b',
}

/** 직원 패널 '결재' 탭: 위는 기다리는 결재·질문 카드, 아래는 그 직원에게 내가 내린 결재 기록 */
export function ApprovalTab({ staff }: { staff: Staff }) {
  const isHired = staff.kind === 'hired'
  return (
    <section className="split:pt-3 slim:pt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pt-3 pb-4">
      <h3 className={cn('text-xs font-semibold', staff.approvals.length ? 'text-status-waiting' : 'text-muted-foreground')}>
        {staff.approvals.length ? t('approvalTab.waiting', { n: staff.approvals.length }) : t('approvalTab.waitingNone')}
      </h3>
      {staff.approvals.map((a) => (
        <ApprovalCard key={a.id} approval={a} staffId={staff.id} isHired={isHired} />
      ))}
      <ApprovalHistory staffId={staff.id} pendingKey={staff.approvals.map((a) => a.id).join(',')} />
    </section>
  )
}

/** 기다리는 결재·질문 카드 하나 — 승인·반려는 누르자마자 '처리 중', 결과를 확인한 뒤에 카드를 치운다 */
function ApprovalCard({ approval: a, staffId, isHired }: { approval: Approval; staffId: string; isHired: boolean }) {
  const { isBusy, isDone, isFailed, decide } = useDecide(a.id)
  if (isDone) return null
  return (
    <div className="bg-muted flex flex-col gap-2 rounded-lg p-3">
      {a.requestedBy && <div className="text-muted-foreground text-xs">{t('approval.requestedBy', { name: a.requestedBy })}</div>}
      {a.questions && (
        <>
          <WaitReasonLine reason={a.waitReason} />
          {a.isRestored && <div className="text-muted-foreground text-xs">↻ {t('approval.restored')}</div>}
        </>
      )}
      {a.questions ? (
        <QuestionBox approval={a} />
      ) : (
        <>
          <ApprovalSummary approval={a} boxClassName="bg-card" />
          {isFailed && <div className="text-destructive text-xs">{t('secretary.approvals.failed')}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={isBusy} onClick={() => void decide(true)}>
              <CheckIcon /> {t('staffPanel.approvals.approve')}
            </Button>
            <Button size="sm" variant="outline" disabled={isBusy} onClick={() => void decide(false)}>
              {t('staffPanel.approvals.reject')}
            </Button>
            {isBusy && <span className="text-muted-foreground text-xs">{t('approval.processing')}</span>}
            {isHired && <StopWorkButton staffId={staffId} className="ml-auto" />}
          </div>
        </>
      )}
    </div>
  )
}

type Load = { state: 'loading' } | { state: 'failed'; isOldPc: boolean } | { state: 'ready'; records: readonly ApprovalRecord[]; hasMore: boolean; isMoreLoading?: boolean }

function ApprovalHistory({ staffId, pendingKey }: { staffId: string; pendingKey: string }) {
  const [filter, setFilter] = useState<ApprovalHistoryFilter>('all')
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  // 걸러보기를 빠르게 바꾸면 늦게 온 앞 응답을 버린다
  const seq = useRef(0)

  const fetchPage = useCallback(
    async (beforeId?: number) => {
      const my = ++seq.current
      if (beforeId === undefined) setLoad({ state: 'loading' })
      else setLoad((l) => (l.state === 'ready' ? { ...l, isMoreLoading: true } : l))
      try {
        const page = await window.office.approvalHistory(staffId, { beforeId, limit: APPROVAL_HISTORY_PAGE_SIZE, filter })
        if (my !== seq.current) return
        setLoad((l) => ({ state: 'ready', records: beforeId !== undefined && l.state === 'ready' ? [...l.records, ...page.records] : page.records, hasMore: page.hasMore }))
      } catch (e) {
        if (my !== seq.current) return
        // 휴대폰 화면에서 예전 PC는 이 기능을 모른다
        setLoad({ state: 'failed', isOldPc: (e as { code?: string }).code === 'unknown_method' })
      }
    },
    [staffId, filter],
  )

  useEffect(() => {
    void fetchPage()
  }, [fetchPage])

  // 새로 내린 결재는 다시 부르지 않고 맨 앞에 붙인다
  useEffect(
    () =>
      window.office.onApprovalRecord((rec) => {
        if (rec.staffId !== staffId) return
        setLoad((l) => (l.state === 'ready' ? { ...l, records: prependRecord(l.records, rec, filter) } : l))
      }),
    [staffId, filter],
  )

  // 기다리던 결재가 하나라도 끝나면 첫 쪽을 조용히 다시 받아 새 줄만 앞에 붙인다 — 휴대폰은 결재 기록 알림을 받지 않는다(원본 명령이 있어 스트림에 안 보냄)
  // 건수 대신 id를 본다: 한 건이 끝나는 순간 다른 건이 들어와 수가 같아도 놓치지 않게
  const prevPending = useRef(pendingKey)
  useEffect(() => {
    const now = new Set(pendingKey.split(','))
    const isClosed = prevPending.current !== '' && prevPending.current.split(',').some((id) => !now.has(id))
    prevPending.current = pendingKey
    if (!isClosed) return
    const my = seq.current
    void window.office
      .approvalHistory(staffId, { limit: APPROVAL_HISTORY_PAGE_SIZE, filter })
      .then((page) => {
        if (my !== seq.current) return
        setLoad((l) => (l.state === 'ready' ? { ...l, records: mergeNewer(l.records, page.records) } : l))
      })
      .catch(() => {})
  }, [pendingKey, staffId, filter])

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="mr-auto text-xs font-semibold">{t('approvalTab.history')}</h3>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'focus-ring phone:min-h-8 rounded-full border px-2 py-0.5 text-[11px]',
              filter === f ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {t(`approvalTab.filter.${f}`)}
          </button>
        ))}
      </div>
      {load.state === 'loading' ? (
        <p className="text-muted-foreground py-3 text-xs">{t('approvalTab.loading')}</p>
      ) : load.state === 'failed' ? (
        <div className="flex flex-wrap items-center gap-2 py-3 text-xs">
          <span className="text-muted-foreground">{t(load.isOldPc ? 'approvalTab.oldPc' : 'approvalTab.loadFailed')}</span>
          {!load.isOldPc && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => void fetchPage()}>
              {t('approvalTab.retry')}
            </Button>
          )}
        </div>
      ) : load.records.length === 0 ? (
        <p className="text-muted-foreground py-3 text-xs">{t(filter === 'all' ? 'approvalTab.empty' : 'approvalTab.emptyFilter')}</p>
      ) : (
        <>
          {groupByDay(load.records).map((g) => (
            <div key={g.key} className="flex flex-col">
              <div className="text-muted-foreground pt-1.5 pb-0.5 text-[11px] font-medium">{dayLabel(g.ts)}</div>
              {g.records.map((r) => (
                <HistoryRow key={r.id} record={r} />
              ))}
            </div>
          ))}
          {load.hasMore && (
            <button
              type="button"
              disabled={load.isMoreLoading}
              onClick={() => void fetchPage(load.records.at(-1)?.id)}
              className="text-primary self-start py-1.5 text-[11px] font-semibold disabled:opacity-50"
            >
              {load.isMoreLoading ? t('approvalTab.loading') : t('approvalTab.more')}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** 한 줄: 결과 · 쉬운 문장(답이면 → 답) · 시각 · 누가. 누르면 원래 명령이 펼쳐진다 */
function HistoryRow({ record: r }: { record: ApprovalRecord }) {
  const [isOpen, setIsOpen] = useState(false)
  const result = shownResult(r)
  const command = trOr(r.summaryI18n, r.summary)
  const headline = approvalHeadline(r)
  return (
    <div className="border-b last:border-b-0">
      <button type="button" aria-expanded={isOpen} onClick={() => setIsOpen((v) => !v)} className="hover:bg-accent/50 flex w-full items-start gap-2 rounded px-1 py-1.5 text-left text-xs">
        <span className={cn('mt-px shrink-0 rounded px-1.5 text-[10px] font-semibold', RESULT_CLASS[result])}>{t(`approvalTab.result.${result}` as TKey)}</span>
        <span className="min-w-0 flex-1">
          <span className={cn('block break-words', !isOpen && 'line-clamp-2')}>{headline}</span>
          {r.answer && <span className="text-muted-foreground block truncate">→ {r.answer}</span>}
        </span>
        <span className="text-muted-foreground shrink-0 text-right text-[10px] leading-tight tabular-nums">
          {fmtDate(r.decidedAt, { hour: '2-digit', minute: '2-digit' })}
          {r.actor && (
            <>
              <br />
              {t(`approvalTab.actor.${r.actor}`)}
            </>
          )}
        </span>
        <ChevronRightIcon className={cn('text-muted-foreground mt-0.5 size-3.5 shrink-0 transition-transform', isOpen && 'rotate-90')} />
      </button>
      {isOpen && (
        <div className="mb-1.5 ml-1 flex flex-col gap-1 text-[11px]">
          <span className="text-muted-foreground">
            {t('approvalTab.command')} · {r.toolName}
          </span>
          <pre className="bg-muted max-h-40 overflow-auto rounded p-2 font-mono break-all whitespace-pre-wrap">{command}</pre>
        </div>
      )}
    </div>
  )
}
