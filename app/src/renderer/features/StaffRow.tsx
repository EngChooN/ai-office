import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { currentTask } from '@shared/dashboard'
import type { Staff } from '@shared/types'
import { t, tr } from '@shared/i18n'
import { nowLine } from '@shared/staffCard'
import { isAwaitingTeam } from '@shared/delegation'
import { Avatar, Elapsed, LeadMark, PracticeBadge, StatusDot, UnreadBadge } from './StaffCard'
import { roleLabel } from '@shared/roleLabel'

interface Props {
  staff: Staff
  isLead?: boolean
  /** 랩 묶음에서 보일 때 — 리더 표시를 '랩장'으로 */
  isLab?: boolean
  isSelected: boolean
  onSelect: (id: string) => void
}

/** 목록 보기의 행 바탕 — 카드와 같은 상태색을 옅게만 */
const ROW_TONE: Record<Staff['status'], string> = {
  working: 'hover:bg-accent',
  waiting: 'bg-status-waiting/10 hover:bg-status-waiting/15',
  error: 'bg-status-error/10 hover:bg-status-error/15',
  netWait: 'hover:bg-accent',
  idle: 'hover:bg-accent',
  offline: 'opacity-60 hover:bg-accent hover:opacity-100',
}

/** 대시보드 목록 보기의 한 줄 — 직원이 많을 때 훑어 찾기 위한 것. 누르면 카드와 같은 onSelect */
export function StaffRow({ staff, isLead = false, isLab = false, isSelected, onSelect }: Props) {
  const tasks = useOffice((s) => s.tasks)
  const task = useMemo(() => (staff.kind === 'hired' ? currentTask(tasks, staff.id) : null), [tasks, staff.kind, staff.id])
  // 지금 하는 일: 카드와 같은 쉬운 말 문장 (도구 이름·오류 원문은 패널에서)
  const summary = tr(nowLine(staff, task))
  // 팀원 기다리는 리더는 카드처럼 일하는 줄로 본다
  const tone = isAwaitingTeam(staff) ? 'working' : staff.status
  return (
    <button
      type="button"
      onClick={() => onSelect(staff.id)}
      className={cn('focus-ring-inset flex w-full first:rounded-t-[calc(var(--radius-xl)-1px)] last:rounded-b-[calc(var(--radius-xl)-1px)] min-w-0 items-center gap-3 px-3 py-2 text-left transition-colors', ROW_TONE[tone], isSelected && 'ring-primary ring-2 ring-inset')}
    >
      <Avatar avatar={staff.avatar} name={staff.name} teamId={staff.teamId} className="size-8" />
      <div className="flex w-40 min-w-0 shrink-0 flex-col">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          {isLead && <LeadMark isLab={isLab} />}
          <span className="min-w-0 truncate">{staff.name}</span>
          {staff.isPractice && <PracticeBadge />}
          <UnreadBadge staff={staff} />
        </div>
        <div className="text-muted-foreground truncate text-xs">{roleLabel(staff.role)}</div>
      </div>
      <div className="flex w-28 shrink-0 flex-col items-start gap-0.5">
        <StatusDot staff={staff} />
        <Elapsed staff={staff} />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1 text-xs" title={summary}>
        <span className={cn('truncate', tone !== 'working' && tone !== 'waiting' && 'text-muted-foreground')}>{summary}</span>
      </div>
      {staff.approvals.length > 0 && <Badge className="bg-status-waiting shrink-0 text-background">{t('staffCard.approvals', { n: staff.approvals.length })}</Badge>}
      {staff.kind === 'external' && (
        <Badge variant="outline" className="shrink-0">
          {t('staffCard.external')}
        </Badge>
      )}
    </button>
  )
}
