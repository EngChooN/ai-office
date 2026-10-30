import { useMemo, type CSSProperties } from 'react'
import { KanbanIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { avatarUrl } from '@/map/sprites'
import { useOffice, useWorkMode } from '@/store'
import { currentTask, formatElapsed, initials } from '@shared/dashboard'
import type { Staff } from '@shared/types'
import { LiveMiniView } from './LiveMiniView'
import { formatCost, formatTokens, STATUS_META, useNow } from './status'
import { t } from '@shared/i18n'
import { roleLabel } from '@shared/roleLabel'

interface Props {
  staff: Staff
  isLead?: boolean
  isSelected: boolean
  onSelect: (id: string) => void
}

const ELAPSED_TICK_MS = 60_000

// 이니셜 글자 크기는 원 크기(size-n)에 맞춘다
function initialTextClass(className = '') {
  const size = Number(className.match(/(?:^|\s)size-(\d+)/)?.[1] ?? 10)
  if (size >= 12) return 'text-base'
  if (size >= 10) return 'text-sm'
  if (size >= 8) return 'text-xs'
  if (size >= 6) return 'text-[11px]'
  return 'text-[10px]'
}

/** 업무 모드의 이니셜 원. 팀 색은 배경 대신 옅은 틴트와 테두리로 써서 글자 대비를 지킨다 */
function InitialAvatar({ name, teamId, className }: { name: string; teamId?: string | null; className?: string }) {
  const color = useOffice((s) => s.teams.find((tm) => tm.id === teamId)?.color)
  const style: CSSProperties | undefined = color ? { backgroundColor: `color-mix(in oklab, ${color} 22%, var(--card))`, borderColor: `color-mix(in oklab, ${color} 60%, transparent)` } : undefined
  return (
    <span
      aria-hidden
      title={name}
      style={style}
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-full border font-semibold',
        color ? 'text-foreground' : 'bg-muted text-muted-foreground',
        initialTextClass(className),
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

/** 직원 아바타. 업무 모드면 픽셀 캐릭터 대신 이니셜 원 (이름을 모르면 캐릭터 그대로) */
export function Avatar({ avatar, className, name, teamId }: { avatar: number; className?: string; name?: string; teamId?: string | null }) {
  const isWorkMode = useWorkMode()
  if (isWorkMode && name) return <InitialAvatar name={name} teamId={teamId} className={className} />
  return <img src={avatarUrl(avatar, true)} alt="" className={cn('size-10 shrink-0 object-contain [image-rendering:pixelated]', className)} />
}

/** 팀장·랩 리드 표시. 업무 모드면 ★ 대신 "리드" 글자 */
/** 튜토리얼 연습 데이터 꼬리표 (직원·카드·회의 공용) */
export function PracticeBadge({ className }: { className?: string }) {
  return <span className={cn('bg-status-waiting shrink-0 rounded px-1.5 text-[10px] font-semibold text-background', className)}>{t('tutorial.badge.practice')}</span>
}

export function LeadMark() {
  const isWorkMode = useWorkMode()
  if (!isWorkMode) return <span className="shrink-0 text-status-waiting">★</span>
  return (
    <Badge variant="outline" className="border-primary/40 text-primary h-4 shrink-0 px-1.5 text-[10px]">
      {t('staffCard.lead')}
    </Badge>
  )
}

export function StatusDot({ staff }: { staff: Staff }) {
  const meta = STATUS_META[staff.status]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap', meta.text)}>
      <span className={cn('size-2 shrink-0 rounded-full', meta.dot, staff.status === 'working' && 'animate-pulse')} />
      {meta.label}
    </span>
  )
}

/** 지금 상태가 이어진 시간 ("12분째"). 퇴근했거나 옛 main이라 시각을 모르면 숨긴다 */
export function Elapsed({ staff, className }: { staff: Staff; className?: string }) {
  const now = useNow(ELAPSED_TICK_MS)
  if (staff.status === 'offline' || !staff.statusSince) return null
  const tone = staff.status === 'waiting' || staff.status === 'error' ? STATUS_META[staff.status].text : 'text-muted-foreground'
  return <span className={cn('text-[11px] whitespace-nowrap tabular-nums', tone, className)}>{formatElapsed(Math.max(0, now - staff.statusSince))}</span>
}

/** 카드 테두리·바탕을 상태색으로 — 전체 보기에서 멀리서도 상태가 구분되게. 대기는 차분하게, 퇴근은 흐리게 */
const CARD_TONE: Record<Staff['status'], string> = {
  working: 'bg-card hover:bg-accent border-status-working/50',
  waiting: 'border-status-waiting bg-status-waiting/10 hover:bg-status-waiting/15',
  error: 'border-status-error bg-status-error/10 hover:bg-status-error/15',
  idle: 'bg-card hover:bg-accent',
  offline: 'bg-card hover:bg-accent opacity-60 hover:opacity-100',
}

export function StaffCard({ staff, isLead = false, isSelected, onSelect }: Props) {
  const isWorkMode = useWorkMode()
  const tasks = useOffice((s) => s.tasks)
  const task = useMemo(() => (staff.kind === 'hired' ? currentTask(tasks, staff.id) : null), [tasks, staff.kind, staff.id])
  const handleClick = () => onSelect(staff.id)
  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'focus-ring relative flex w-full flex-col gap-3 rounded-xl border p-4 text-left transition-colors',
        CARD_TONE[staff.status],
        isSelected && 'ring-primary ring-2',
      )}
    >
      {/* 작업 중: 테두리가 은은하게 숨 쉰다 (움직임 줄이기면 멈춤) */}
      {staff.status === 'working' && <span aria-hidden className="ring-status-working/60 pointer-events-none absolute -inset-px animate-pulse rounded-xl ring-2 motion-reduce:animate-none" />}
      {/* 사무실에서 지금 움직이는 모습 — 화면에 보이는 카드만 그린다 (업무 모드면 없음) */}
      <LiveMiniView staff={staff} className="h-24" isCompact />
      <div className="flex items-center gap-3">
        <Avatar avatar={staff.avatar} name={staff.name} teamId={staff.teamId} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-semibold">
            {isLead && <LeadMark />}
            <span className="min-w-0 truncate">{staff.name}</span>
            {staff.isPractice && <PracticeBadge />}
          </div>
          <div className="text-muted-foreground truncate text-xs">{roleLabel(staff.role)}</div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <StatusDot staff={staff} />
          <Elapsed staff={staff} />
        </div>
      </div>
      {staff.kind === 'hired' ? (
        // 맡은 보드 업무 한 줄 + 활동 한 줄 (카드 높이는 예전 두 줄과 같다)
        <div className="flex min-h-8 flex-col text-xs">
          {task ? (
            <div className="flex min-w-0 items-center gap-1 font-medium" title={task.title}>
              <KanbanIcon className="size-3 shrink-0" />
              <span className="truncate">{task.title}</span>
              {task.more > 0 && <span className="text-muted-foreground shrink-0 font-normal">+{task.more}</span>}
            </div>
          ) : (
            <div className="text-muted-foreground">{t('staffCard.noTask')}</div>
          )}
          <div className="text-muted-foreground line-clamp-1">{staff.activity || '—'}</div>
        </div>
      ) : (
        <div className="text-muted-foreground line-clamp-2 min-h-8 text-xs">{staff.activity || '—'}</div>
      )}
      <div className="flex items-center gap-2">
        {staff.approvals.length > 0 && <Badge className="bg-status-waiting text-background">{t('staffCard.approvals', { n: staff.approvals.length })}</Badge>}
        {/* 데모데이 칭찬 배지 (대표 박수·MVP 누적) */}
        {!!(staff.praise?.claps || staff.praise?.mvps) && (
          <Badge variant="outline" title={t('staffCard.praise', { claps: staff.praise.claps, mvps: staff.praise.mvps })}>
            {staff.praise.mvps > 0 && `🏆${staff.praise.mvps} `}👏{staff.praise.claps}
          </Badge>
        )}
        {staff.kind === 'external' ? (
          <Badge variant="outline">{t('staffCard.external')}</Badge>
        ) : (
          <span className="text-muted-foreground ml-auto text-xs">
            {isWorkMode ? t('staffCard.todayDone', { n: staff.todayDone ?? 0 }) : `Lv.${staff.stats.level}`} · {t('staffCard.tokens', { n: formatTokens(staff.tokensIn + staff.tokensOut) })} · {formatCost(staff.costUsd)}
          </span>
        )}
      </div>
    </button>
  )
}
