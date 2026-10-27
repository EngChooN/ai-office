import { useMemo, useState } from 'react'
import { CircleDashedIcon, FlaskConicalIcon, FolderIcon, LayoutGridIcon, ListIcon, SearchIcon, UserPlusIcon, UsersIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useOffice, useWorkMode } from '@/store'
import { attentionItems, BUDGET_WARN_RATIO, countByStatus, matchesStaffFilter, type SummaryKey } from '@shared/dashboard'
import type { Staff } from '@shared/types'
import { t } from '@shared/i18n'
import { ActivityFeed, AttentionCard, SummaryRow, UsageCard, usePayslip } from './DashboardPanels'
import { StaffCard } from './StaffCard'
import { StaffRow } from './StaffRow'
import { useStaffView } from './staffView'
import { STATUS_META } from './status'

const STATUS_ORDER: Record<Staff['status'], number> = { waiting: 0, error: 1, working: 2, idle: 3, offline: 4 }
const byUrgency = (a: Staff, b: Staff) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]

type GroupKind = 'team' | 'lab' | 'project' | 'none'
const GROUP_ICON = { team: UsersIcon, lab: FlaskConicalIcon, project: FolderIcon, none: CircleDashedIcon } as const
const GROUP_EMOJI: Record<GroupKind, string> = { team: '', lab: '🧪 ', project: '📁 ', none: '' }
/** 직원 목록 상태 필터 (오류는 오류가 있을 때만 붙는다) */
const STATUS_FILTERS: SummaryKey[] = ['waiting', 'working', 'idle']

/** 위에 상황판(요약 줄·확인 필요·사용량·최근 활동), 아래에 팀(외부 직원은 프로젝트)별 직원 카드를 긴급한 순으로 */
export function Dashboard() {
  const staff = useOffice((s) => s.staff)
  const teams = useOffice((s) => s.teams)
  const selectedId = useOffice((s) => s.selectedId)
  const select = useOffice((s) => s.select)
  const setHireOpen = useOffice((s) => s.setHireOpen)
  const labs = useOffice((s) => s.labs)
  const isWorkMode = useWorkMode()
  const slip = usePayslip()
  const planUsage = useOffice((s) => s.planUsage)
  const [groupBy, setGroupBy] = useState<'team' | 'lab'>('team')
  const [filter, setFilter] = useState<SummaryKey | null>(null)
  const [query, setQuery] = useState('')
  const [staffView, setStaffView] = useStaffView()

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  const counts = useMemo(() => countByStatus(staff), [staff])
  const todayDone = staff.reduce((n, s) => n + (s.kind === 'hired' ? (s.todayDone ?? 0) : 0), 0)
  const attention = useMemo(() => {
    // 앱이 정하던 예산·토큰 한도는 없앴다 — 실제 한도(플랜 사용률)가 80%를 넘으면 확인 필요에 올린다
    const items = attentionItems(staff, new Map())
    const plan = Math.max(0, ...planUsage.filter((p) => p.percent !== null).map((p) => p.percent!))
    if (plan >= BUDGET_WARN_RATIO * 100) items.push({ key: 'budget:plan', kind: 'budget', staffId: '', createdAt: 0, ratio: plan / 100 })
    return items
  }, [staff, planUsage])

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
  // 이름 검색·상태 필터(요약 줄에서 골라도 같다)는 직원 격자에만 적용한다 — 상황판은 그대로
  const groups = (groupBy === 'team' ? byTeam : byLab).map((g) => ({ ...g, members: g.members.filter((s) => matchesStaffFilter(s, query, filter)) })).filter((g) => g.members.length > 0)
  const isFiltered = filter !== null || query.trim() !== ''
  const clearFilter = () => {
    setFilter(null)
    setQuery('')
  }
  const statusFilters = counts.error > 0 || filter === 'error' ? [...STATUS_FILTERS, 'error' as const] : STATUS_FILTERS
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

        <SummaryRow counts={counts} todayDone={todayDone} slip={slip} filter={filter} onFilter={setFilter} />

        <div className="grid min-w-0 items-start gap-3 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @6xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <AttentionCard items={attention} staffById={staffById} />
          <UsageCard slip={slip} />
          <ActivityFeed staffById={staffById} />
        </div>

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
                  className={cn('rounded-md px-2.5 py-1 text-xs font-medium', filter === st ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                >
                  {st ? STATUS_META[st].label : t('dashboard.filterAll')}
                </button>
              ))}
            </div>
            <div className="bg-muted ml-auto flex w-fit rounded-lg p-0.5">
              {(['team', 'lab'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroupBy(g)}
                  className={cn('rounded-md px-3 py-1 text-xs font-medium', groupBy === g ? 'bg-background shadow-sm' : 'text-muted-foreground')}
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
                    className={cn('rounded-md px-2 py-1', staffView === v ? 'bg-background shadow-sm' : 'text-muted-foreground')}
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
          {groups.map((g) => {
            const Icon = GROUP_ICON[g.kind]
            return (
              <section key={g.key} className="flex flex-col gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  {isWorkMode ? (
                    <Icon className={cn('size-4 shrink-0', !g.color && 'text-muted-foreground')} style={g.color ? { color: g.color } : undefined} />
                  ) : (
                    <span className={cn('size-2.5 rounded-full', !g.color && 'bg-muted-foreground')} style={g.color ? { background: g.color } : undefined} />
                  )}
                  {isWorkMode ? g.label : `${GROUP_EMOJI[g.kind]}${g.label}`}
                  <span className="text-muted-foreground font-normal">{g.members.length}</span>
                </h3>
                {staffView === 'list' ? (
                  <div className="bg-card flex flex-col divide-y overflow-hidden rounded-xl border">
                    {[...g.members].sort(byUrgency).map((s) => (
                      <StaffRow key={s.id} staff={s} isLead={g.leadId === s.id} isSelected={s.id === selectedId} onSelect={select} />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
                    {[...g.members].sort(byUrgency).map((s) => (
                      <StaffCard key={s.id} staff={s} isLead={g.leadId === s.id} isSelected={s.id === selectedId} onSelect={select} />
                    ))}
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
