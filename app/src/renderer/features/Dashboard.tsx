import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CircleDashedIcon, FlaskConicalIcon, FolderIcon, LayoutGridIcon, ListIcon, SearchIcon, UserPlusIcon, UsersIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useOffice, useWorkMode } from '@/store'
import { countByStatus, matchesStaffFilter, type SummaryKey } from '@shared/dashboard'
import type { LogEntry, Staff } from '@shared/types'
import { fmtNumber, t } from '@shared/i18n'
import { summaryParts, type SummaryPartKind } from '@shared/staffCard'
import { AlertBar } from './AlertBar'
import { AddStaffCard, StaffCard } from './StaffCard'
import { StaffRow } from './StaffRow'
import { useStaffView } from './staffView'
import { STATUS_META, useNow } from './status'
import { isAwaitingTeam } from '@shared/delegation'
import { IconText } from '@/components/duo-icon'

const STATUS_ORDER: Record<Staff['status'], number> = { waiting: 0, error: 1, netWait: 2, working: 2, idle: 3, offline: 4 }
// 급한 순: 확인 기다림 → 문제 → 일하는 중(팀원 일 기다리는 리더 포함) → 쉬는 중 → 퇴근
const urgencyOf = (s: Staff) => (isAwaitingTeam(s) ? STATUS_ORDER.working : STATUS_ORDER[s.status])
const byUrgency = (a: Staff, b: Staff) => urgencyOf(a) - urgencyOf(b)

const SUMMARY_TONE: Record<SummaryPartKind, string> = { working: 'text-status-working', waiting: 'text-status-waiting', error: 'text-status-error', idle: '', offline: '' }

/** 한 문장 요약 — 굵은 조각을 누르면 그 상태만 보기(다시 누르면 전체). 퇴근은 필터가 없어 글자만 */
function SummarySentence({ staff, filter, onFilter, action }: { staff: Staff[]; filter: SummaryKey | null; onFilter: (key: SummaryKey | null) => void; action: ReactNode }) {
  const { total, parts } = summaryParts(staff)
  const doneToday = useTodayDoneCount()
  const setView = useOffice((s) => s.setView)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="min-w-0 flex-1 text-sm leading-relaxed">
        {t('staffCard.summary.total', { n: total })}{' '}
        {parts.map(({ kind, count }, i) => (
          <span key={kind}>
            {i > 0 && <span className="text-muted-foreground"> · </span>}
            {kind === 'offline' ? (
              <span className="text-muted-foreground">{t('staffCard.summary.offline', { n: count })}</span>
            ) : (
              <button
                type="button"
                aria-pressed={filter === kind}
                title={t('staffCard.summary.filterHint')}
                onClick={() => onFilter(filter === kind ? null : kind)}
                className={cn('focus-ring rounded font-semibold underline-offset-4 hover:underline', SUMMARY_TONE[kind], filter === kind && 'underline')}
              >
                {t(`staffCard.summary.${kind}`, { n: count })}
              </button>
            )}
          </span>
        ))}
        {doneToday > 0 && (
          <>
            <span className="text-muted-foreground"> · </span>
            <button type="button" onClick={() => setView('report')} className="focus-ring text-primary rounded font-semibold underline-offset-4 hover:underline">
              {t('alertBar.doneToday', { n: fmtNumber(doneToday) })} ›
            </button>
          </>
        )}
      </p>
      {action}
    </div>
  )
}

const startOfToday = (now: number) => new Date(new Date(now).setHours(0, 0, 0, 0)).getTime()

/** 오늘 끝낸 일(결과 보고) 수 — 오늘 기록을 한 번 읽고 실시간 기록을 더한다. 자정이 지나면 다시 센다 */
function useTodayDoneCount() {
  const liveLogs = useOffice((s) => s.liveLogs)
  const today = startOfToday(useNow(60_000))
  const [base, setBase] = useState<LogEntry[]>([])
  useEffect(() => {
    void window.office.timeline(today).then(setBase)
  }, [today])
  return useMemo(() => {
    const ids = new Set(base.filter((l) => l.type === 'result').map((l) => l.id))
    for (const l of liveLogs) if (l.type === 'result' && l.ts >= today) ids.add(l.id)
    return ids.size
  }, [base, liveLogs, today])
}

type GroupKind = 'team' | 'lab' | 'project' | 'none'
const GROUP_ICON = { team: UsersIcon, lab: FlaskConicalIcon, project: FolderIcon, none: CircleDashedIcon } as const
const GROUP_EMOJI: Record<GroupKind, string> = { team: '', lab: '🧪 ', project: '📁 ', none: '' }
/** 직원 목록 상태 필터 — 급한 순 (문제는 문제가 있을 때만 붙는다) */
const STATUS_FILTERS: SummaryKey[] = ['waiting', 'working', 'idle']

/** 직원 목록(A안): 위 알림 줄(문제·요금제, 있을 때만) → 한 문장 요약 → 팀별 명함 카드를 급한 순으로 + '＋ 직원 추가' */
export function Dashboard() {
  const staff = useOffice((s) => s.staff)
  const teams = useOffice((s) => s.teams)
  const selectedId = useOffice((s) => s.selectedId)
  const select = useOffice((s) => s.select)
  const setHireOpen = useOffice((s) => s.setHireOpen)
  const labs = useOffice((s) => s.labs)
  const isWorkMode = useWorkMode()
  const [groupBy, setGroupBy] = useState<'team' | 'lab'>('team')
  const [filter, setFilter] = useState<SummaryKey | null>(null)
  const [query, setQuery] = useState('')
  const [staffView, setStaffView] = useStaffView()

  const counts = useMemo(() => countByStatus(staff), [staff])

  type Group = { key: string; kind: GroupKind; label: string; color: string | null; leadId: string | null; members: Staff[] }
  const byTeam: Group[] = [
    ...teams.filter((tm) => tm.kind === 'hired').map((tm): Group => ({ key: tm.id, kind: 'team', label: tm.name, color: tm.color, leadId: tm.leadId, members: staff.filter((s) => s.teamId === tm.id) })),
    { key: 'none', kind: 'none', label: t('dashboard.group.noTeam'), color: null, leadId: null, members: staff.filter((s) => s.kind === 'hired' && !teams.some((tm) => tm.id === s.teamId)) },
    ...teams.filter((tm) => tm.kind === 'project').map((tm): Group => ({ key: tm.id, kind: 'project', label: tm.name, color: tm.color, leadId: null, members: staff.filter((s) => s.teamId === tm.id) })),
  ]
  // 랩 보기: 한 사람이 여러 랩에 나올 수 있다
  const byLab: Group[] = [
    ...labs.map((l): Group => ({ key: l.id, kind: 'lab', label: l.name, color: l.color, leadId: l.leadId, members: staff.filter((s) => l.memberIds.includes(s.id)) })),
    { key: 'none', kind: 'none', label: t('dashboard.group.noLab'), color: null, leadId: null, members: staff.filter((s) => s.kind === 'hired' && s.labIds.length === 0) },
  ]
  // 이름 검색·상태 필터(요약 줄·알림 줄에서 골라도 같다)는 직원 격자에만 적용한다
  const groups = (groupBy === 'team' ? byTeam : byLab).map((g) => ({ ...g, members: g.members.filter((s) => matchesStaffFilter(s, query, filter)) })).filter((g) => g.members.length > 0)
  const isFiltered = filter !== null || query.trim() !== ''
  const clearFilter = () => {
    setFilter(null)
    setQuery('')
  }
  const statusFilters: SummaryKey[] = counts.error > 0 || filter === 'error' ? ['waiting', 'error', 'working', 'idle'] : STATUS_FILTERS
  const hasHired = staff.some((s) => s.kind === 'hired')

  return (
    <div className="@container phone:p-4 h-full overflow-y-auto p-6">
      <div className="flex min-w-0 flex-col gap-6">
        {!hasHired && (
          <div className="text-muted-foreground flex flex-col items-start gap-3 rounded-xl border border-dashed p-6 text-sm">
            {t('dashboard.empty.noStaff')}
            <Button size="sm" onClick={() => setHireOpen(true)}>
              <UserPlusIcon /> {t('dashboard.hireStaff')}
            </Button>
          </div>
        )}

        {hasHired && <AlertBar staff={staff} onShowErrors={() => setFilter('error')} />}

        {hasHired && (
          <SummarySentence
            staff={staff}
            filter={filter}
            onFilter={setFilter}
            action={
              <Button size="sm" onClick={() => setHireOpen(true)}>
                <UserPlusIcon /> {t('staffCard.add.title')}
              </Button>
            }
          />
        )}

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{t('dashboard.staffTitle')}</h2>
            <div className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('dashboard.searchName')} aria-label={t('dashboard.searchName')} className="h-7 w-40 pl-7 text-xs" />
            </div>
            <div className="bg-muted flex w-fit rounded-lg p-0.5">
              {[null, ...statusFilters].map((st) => (
                <button
                  key={st ?? 'all'}
                  type="button"
                  aria-pressed={filter === st}
                  onClick={() => setFilter(st)}
                  className={cn('focus-ring rounded-md px-2.5 py-1 text-xs font-medium', filter === st ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                >
                  {st ? STATUS_META[st].label : t('dashboard.filterAll')} <span className="tabular-nums opacity-70">{st ? counts[st] : staff.length}</span>
                </button>
              ))}
            </div>
            <div className="bg-muted ml-auto flex w-fit rounded-lg p-0.5">
              {(['team', 'lab'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroupBy(g)}
                  className={cn('focus-ring rounded-md px-3 py-1 text-xs font-medium', groupBy === g ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                >
                  {g === 'team' ? t('dashboard.groupBy.team') : t('dashboard.groupBy.lab')}
                </button>
              ))}
            </div>
            {/* 카드 / 목록 보기 — 폰은 카드만 (전환 버튼을 숨기므로 그 기기에는 목록이 저장되지 않는다) */}
            <div className="bg-muted phone:hidden flex w-fit rounded-lg p-0.5">
              {(['cards', 'list'] as const).map((v) => {
                const Icon = v === 'cards' ? LayoutGridIcon : ListIcon
                const label = v === 'cards' ? t('dashboard.view.cards') : t('dashboard.view.list')
                return (
                  <button
                    key={v}
                    type="button"
                    aria-label={label}
                    aria-pressed={staffView === v}
                    title={label}
                    onClick={() => setStaffView(v)}
                    className={cn('focus-ring rounded-md px-2 py-1', staffView === v ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                  >
                    <Icon className="size-3.5" />
                  </button>
                )
              })}
            </div>
          </div>
          {isFiltered && groups.length === 0 && (
            <div className="text-muted-foreground flex flex-col items-start gap-3 rounded-xl border border-dashed p-6 text-sm">
              {t('dashboard.empty.noMatch')}
              <Button size="sm" variant="outline" onClick={clearFilter}>
                {t('dashboard.clearFilter')}
              </Button>
            </div>
          )}
          {groups.map((g, gi) => {
            const isLastGroup = gi === groups.length - 1
            const Icon = GROUP_ICON[g.kind]
            return (
              <section key={g.key} className="flex flex-col gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  {isWorkMode ? (
                    <Icon className={cn('size-4 shrink-0', !g.color && 'text-muted-foreground')} style={g.color ? { color: g.color } : undefined} />
                  ) : (
                    <span className={cn('size-2.5 rounded-full', !g.color && 'bg-muted-foreground')} style={g.color ? { background: g.color } : undefined} />
                  )}
                  {!isWorkMode && <IconText text={GROUP_EMOJI[g.kind]} size={14} />}{g.label}
                  <span className="text-muted-foreground font-normal">{g.members.length}</span>
                </h3>
                {staffView === 'list' ? (
                  <div className="bg-card flex flex-col divide-y overflow-hidden rounded-xl border">
                    {[...g.members].sort(byUrgency).map((s) => (
                      <StaffRow key={s.id} staff={s} isLead={g.leadId === s.id} isLab={g.kind === 'lab'} isSelected={s.id === selectedId} onSelect={select} />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                    {[...g.members].sort(byUrgency).map((s) => (
                      <StaffCard key={s.id} staff={s} isLead={g.leadId === s.id} isLab={g.kind === 'lab'} isSelected={s.id === selectedId} onSelect={select} />
                    ))}
                    {isLastGroup && !isFiltered && <AddStaffCard onClick={() => setHireOpen(true)} />}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
