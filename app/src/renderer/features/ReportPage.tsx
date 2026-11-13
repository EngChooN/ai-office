import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, CopyIcon, EllipsisIcon, MessageSquareIcon, WrenchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/select'
import { PopMenu, PopMenuItem } from '@/components/pop-menu'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import type { LogEntry, LogType, Staff } from '@shared/types'
import { fmtDate, fmtNumber, t, trOr, type TKey } from '@shared/i18n'
import { appendLive, filterDay, groupByStaff, oneLine, recordKind, RECORD_FILTERS, shiftDay, startOfDay, summarizeDay, type RecordFilter, type RecordKind, type StaffGroup } from '@shared/recordDay'
import { roleLabel } from '@shared/roleLabel'
import { Avatar } from './StaffCard'
import { Markdown } from '@/components/markdown'
import { AttachmentView } from '@/components/attachments'

/** 한 묶음에 처음 보이는 줄 수 */
const GROUP_PREVIEW = 3

const LOG_LABEL: Record<LogType, TKey> = {
  instruction: 'recordDay.filter.instruction',
  reply: 'report.log.reply',
  tool: 'report.log.tool',
  approval: 'report.log.approval',
  status: 'report.log.status',
  result: 'recordDay.filter.done',
  error: 'recordDay.filter.error',
  delegate: 'report.log.delegate',
  commit: 'report.log.commit',
}
const KIND_TONE: Record<RecordKind, string> = {
  done: 'bg-status-working/15 text-status-working',
  instruction: 'bg-accent text-primary',
  approval: 'bg-status-waiting/15 text-status-waiting',
  error: 'bg-status-error/15 text-status-error',
  other: 'bg-muted text-muted-foreground',
  tool: 'bg-muted text-muted-foreground',
}

const toDateInput = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 보고서: 하루치 기록 — 오늘 요약 4칸 → 걸러보기 → 직원별 묶음(또는 시간순), 줄을 누르면 펼친다. 일일 보고서는 복사 버튼으로 */
export function ReportPage() {
  const staff = useOffice((s) => s.staff)
  const liveLogs = useOffice((s) => s.liveLogs)
  const [dayStart, setDayStart] = useState(() => startOfDay(Date.now()))
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isLoadFailed, setIsLoadFailed] = useState(false)
  const [isCopyFailed, setIsCopyFailed] = useState(false)
  const [filter, setFilter] = useState<RecordFilter>('all')
  const [staffId, setStaffId] = useState<string | null>(null)
  const [isByTime, setIsByTime] = useState(false)
  const [isToolsShown, setIsToolsShown] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)
  const nextDay = shiftDay(dayStart, 1)
  const today = startOfDay(Date.now())

  // 날짜를 빠르게 넘기면 늦게 온 앞 응답을 버린다
  const loadSeq = useRef(0)
  const load = useCallback(() => {
    const my = ++loadSeq.current
    setIsLoadFailed(false)
    // 응답 전까지 전날 기록이 비치지 않게 비운다
    setLogs([])
    window.office.timeline(dayStart, nextDay).then(
      (got) => {
        if (my !== loadSeq.current) return
        // 받는 사이 들어온 새 기록도 놓치지 않게 붙인다
        setLogs(appendLive(got, useOffice.getState().liveLogs, dayStart, nextDay))
      },
      () => {
        if (my !== loadSeq.current) return
        setLogs([])
        setIsLoadFailed(true)
      },
    )
  }, [dayStart, nextDay])
  useEffect(load, [load])
  // 새 기록은 다시 읽지 않고 이날 것만 뒤에 붙인다 (liveLogs는 500개로 잘리므로 길이 대신 마지막 기록을 본다)
  const lastLiveId = liveLogs.at(-1)?.id
  useEffect(() => {
    if (lastLiveId === undefined) return
    setLogs((cur) => appendLive(cur, useOffice.getState().liveLogs, dayStart, nextDay))
  }, [lastLiveId, dayStart, nextDay])

  const summary = useMemo(() => summarizeDay(logs), [logs])
  const shown = useMemo(() => filterDay(logs, { filter, staffId, isToolsShown }), [logs, filter, staffId, isToolsShown])
  const groups = useMemo(() => (isByTime ? [] : groupByStaff(shown)), [shown, isByTime])
  // 직원 고르기: 이날 기록이 있는 직원만 (지금 고른 직원은 늘 남긴다)
  const dayStaffIds = useMemo(() => [...new Set(logs.map((l) => l.staffId))], [logs])
  const staffOf = (id: string) => staff.find((s) => s.id === id)

  const dateText = fmtDate(dayStart, { month: 'long', day: 'numeric', weekday: 'short' })
  const dayTitle = dayStart === today ? t('recordDay.today', { date: dateText }) : dayStart === shiftDay(today, -1) ? t('recordDay.yesterday', { date: dateText }) : dateText

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(await window.office.dailyReport(dayStart))
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 1500)
    } catch {
      setIsCopyFailed(true)
      setTimeout(() => setIsCopyFailed(false), 2500)
    }
  }
  const pickFilter = (f: RecordFilter) => setFilter((cur) => (cur === f && f !== 'all' ? 'all' : f))
  const isFiltered = filter !== 'all' || staffId !== null

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-6 py-4">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="size-7" aria-label={t('recordDay.prev')} title={t('recordDay.prev')} onClick={() => setDayStart(shiftDay(dayStart, -1))}>
            <ChevronLeftIcon />
          </Button>
          {/* 날짜를 누르면 달력 — 숨긴 날짜 칸의 달력을 띄운다 */}
          <button type="button" title={t('recordDay.pickDate')} className="focus-ring relative rounded px-1 text-lg font-bold whitespace-nowrap hover:underline" onClick={() => dateRef.current?.showPicker?.()}>
            {dayTitle}
            <input
              ref={dateRef}
              type="date"
              tabIndex={-1}
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0"
              value={toDateInput(dayStart)}
              max={toDateInput(today)}
              onChange={(e) => e.target.value && setDayStart(new Date(`${e.target.value}T00:00:00`).getTime())}
            />
          </button>
          <Button size="icon" variant="outline" className="size-7" aria-label={t('recordDay.next')} title={t('recordDay.next')} disabled={dayStart >= today} onClick={() => setDayStart(nextDay)}>
            <ChevronRightIcon />
          </Button>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => void copyReport()}>
            {isCopied ? <CheckIcon /> : <CopyIcon />} {isCopied ? t('recordDay.copied') : isCopyFailed ? t('recordDay.copyFailed') : t('recordDay.copy')}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SumCard value={summary.done} label={t('recordDay.sum.done')} isOn={filter === 'done'} onClick={() => pickFilter('done')} />
          <SumCard value={summary.instruction} label={t('recordDay.sum.instruction')} isOn={filter === 'instruction'} onClick={() => pickFilter('instruction')} />
          <SumCard
            value={summary.approval.total}
            label={t('recordDay.sum.approval')}
            detail={summary.approval.total > 0 ? t('recordDay.sum.approvalDetail', { a: summary.approval.approved, r: summary.approval.rejected, auto: summary.approval.auto }) : undefined}
            isOn={filter === 'approval'}
            onClick={() => pickFilter('approval')}
          />
          <SumCard value={summary.error} label={t('recordDay.sum.error')} tone={summary.error > 0 ? 'text-status-error' : undefined} isOn={filter === 'error'} onClick={() => pickFilter('error')} />
        </div>
        {summary.artifacts > 0 && <p className="text-muted-foreground -mt-1 text-xs">{t('recordDay.sum.artifacts', { n: fmtNumber(summary.artifacts) })}</p>}

        <div className="flex flex-wrap items-center gap-1.5">
          {RECORD_FILTERS.map((f) => (
            <Chip key={f} isOn={filter === f} onClick={() => setFilter(f)}>
              {t(`recordDay.filter.${f}`)}
            </Chip>
          ))}
          <NativeSelect aria-label={t('recordDay.allStaff')} className="h-7 rounded-full pl-3 text-xs" value={staffId ?? ''} onChange={(e) => setStaffId(e.target.value || null)}>
            <option value="">{t('recordDay.allStaff')}</option>
            {[...new Set([...dayStaffIds, ...(staffId ? [staffId] : [])])].map((id) => (
              <option key={id} value={id}>
                {staffOf(id)?.name ?? t('common.formerStaff')}
              </option>
            ))}
          </NativeSelect>
          <span className="flex-1" />
          <Chip isOn={!isByTime} onClick={() => setIsByTime(false)}>
            {t('recordDay.byStaff')}
          </Chip>
          <Chip isOn={isByTime} onClick={() => setIsByTime(true)}>
            {t('recordDay.byTime')}
          </Chip>
          <PopMenu icon={<EllipsisIcon />} label={t('recordDay.moreMenu')} opens="down" hasDot={isToolsShown}>
            {(close) => (
              <PopMenuItem
                icon={<WrenchIcon />}
                onClick={() => {
                  setIsToolsShown((v) => !v)
                  close()
                }}
              >
                {isToolsShown ? t('recordDay.hideTools') : t('recordDay.showTools')}
              </PopMenuItem>
            )}
          </PopMenu>
        </div>

        {isLoadFailed ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm">
            <span className="text-muted-foreground">{t('recordDay.loadFailed')}</span>
            <Button size="sm" variant="outline" onClick={load}>
              {t('approvalTab.retry')}
            </Button>
          </div>
        ) : shown.length === 0 && <p className="text-muted-foreground py-6 text-center text-sm">{logs.length === 0 || !isFiltered ? t('recordDay.empty') : t('recordDay.emptyFilter')}</p>}
        {isByTime
          ? shown.length > 0 && (
              <div className="bg-card overflow-hidden rounded-xl border">
                {shown.map((l, i) => (
                  <RecordRow key={l.id} log={l} who={staffOf(l.staffId)} isFirst={i === 0} />
                ))}
              </div>
            )
          : groups.map((g) => <GroupCard key={g.staffId} group={g} who={staffOf(g.staffId)} />)}
      </div>
    </div>
  )
}

function SumCard({ value, label, detail, tone, isOn, onClick }: { value: number; label: string; detail?: string; tone?: string; isOn: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={isOn}
      title={t('recordDay.sum.filterHint')}
      onClick={onClick}
      className={cn('focus-ring bg-card hover:bg-accent/50 flex flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left', isOn && 'border-primary ring-primary/30 ring-2')}
    >
      <b className={cn('text-xl leading-tight tabular-nums', tone)}>{fmtNumber(value)}</b>
      <span className="text-muted-foreground text-xs">
        {label}
        {detail && <span className="block text-[11px]">{detail}</span>}
      </span>
    </button>
  )
}

function Chip({ isOn, onClick, children }: { isOn: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={isOn}
      onClick={onClick}
      className={cn('focus-ring h-7 rounded-full border px-3 text-xs font-medium whitespace-nowrap', isOn ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent')}
    >
      {children}
    </button>
  )
}

/** 직원별 묶음 — 머리(얼굴 28px·이름·종류별 수) + 3줄, 나머지는 'n건 더 보기' */
function GroupCard({ group, who }: { group: StaffGroup; who?: Staff }) {
  const [isAll, setIsAll] = useState(false)
  const { counts, items } = group
  const rest = items.length - GROUP_PREVIEW
  const visible = isAll ? items : items.slice(0, GROUP_PREVIEW)
  return (
    <section className="bg-card overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar avatar={who?.avatar ?? 0} name={who?.name} teamId={who?.teamId} className="size-7" />
        <b className="text-sm">{who?.name ?? t('common.formerStaff')}</b>
        <span className="text-muted-foreground min-w-0 truncate text-xs">
          {counts.error > 0 && <span className="text-status-error font-semibold">{t('recordDay.groupError', { n: counts.error })} · </span>}
          {t('recordDay.groupCount', { done: counts.done, ins: counts.instruction, ap: counts.approval })}
        </span>
        {who && <span className="text-muted-foreground ml-auto hidden shrink-0 text-xs sm:inline">{roleLabel(who.role)}</span>}
      </div>
      {visible.map((l) => (
        <RecordRow key={l.id} log={l} />
      ))}
      {rest > 0 && (
        <button type="button" className="focus-ring text-primary w-full border-t px-3 py-2 text-left text-xs font-semibold hover:underline" onClick={() => setIsAll((v) => !v)}>
          {isAll ? t('recordDay.showLess') : t('recordDay.showMore', { n: fmtNumber(rest) })}
        </button>
      )}
    </section>
  )
}

/** 한 줄: 시각 · 종류 꼬리표 · (시간순이면 얼굴·이름) · 한 줄 글 · ›. 누르면 전체 글·첨부·[대화로 가기] */
function RecordRow({ log, who, isFirst }: { log: LogEntry; who?: Staff; isFirst?: boolean }) {
  const select = useOffice((s) => s.select)
  const [isOpen, setIsOpen] = useState(false)
  const text = trOr(log.textI18n, log.text)
  const kind = recordKind(log.type)
  return (
    <div className={cn('text-[13px]', !isFirst && 'border-t', isOpen && 'bg-primary/5')}>
      <button type="button" aria-expanded={isOpen} onClick={() => setIsOpen((v) => !v)} className="focus-ring grid min-h-[38px] w-full grid-cols-[44px_58px_1fr_16px] items-center gap-2.5 px-3 py-2 text-left">
        <span className="text-muted-foreground text-xs tabular-nums">{fmtDate(log.ts, { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
        <span className={cn('truncate rounded-md px-1 py-0.5 text-center text-[11px] font-bold', KIND_TONE[kind])}>{t(LOG_LABEL[log.type])}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          {who && (
            <>
              <Avatar avatar={who.avatar} name={who.name} teamId={who.teamId} className="size-4 shrink-0" />
              <span className="shrink-0 font-medium">{who.name}</span>
            </>
          )}
          <span className={cn('min-w-0', isOpen ? 'hidden' : 'truncate')}>{oneLine(text)}</span>
        </span>
        <span className="text-muted-foreground">{isOpen ? <ChevronUpIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}</span>
      </button>
      {isOpen && (
        <div className="flex flex-col gap-2 px-3 pb-3 sm:pl-[124px]">
          <Markdown className="selectable text-[13px] break-words">{text}</Markdown>
          <AttachmentView attachments={log.attachments} size="sm" />
          <Button size="sm" variant="outline" className="self-start" onClick={() => select(log.staffId)}>
            <MessageSquareIcon /> {t('recordDay.goChat')}
          </Button>
        </div>
      )}
    </div>
  )
}
