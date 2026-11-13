import { useMemo, type CSSProperties } from 'react'
import { PlusIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { avatarUrl } from '@/map/sprites'
import { useOffice, useWorkMode } from '@/store'
import { currentTask, formatElapsed, initials } from '@shared/dashboard'
import type { Staff } from '@shared/types'
import { STATUS_META, statusMetaOf, useNow } from './status'
import { t, tr } from '@shared/i18n'
import { roleLabel } from '@shared/roleLabel'
import { unreadLabel } from '@shared/unreadReports'
import { AutonomyBadge } from './Autonomy'
import { isAwaitingTeam } from '@shared/delegation'
import { cardAction, nowLine, roleInfo, type CardAction } from '@shared/staffCard'

interface Props {
  staff: Staff
  isLead?: boolean
  /** 랩 묶음에서 보일 때 — 리더 표시를 '랩장'으로 */
  isLab?: boolean
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
  const style: CSSProperties | undefined = color
    ? {
        backgroundColor: `color-mix(in oklab, ${color} 22%, var(--card))`,
        borderColor: `color-mix(in oklab, ${color} 60%, transparent)`,
      }
    : undefined
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

/** 안 읽은 보고 개수 배지 (대표가 직원 패널을 열면 사라진다). 0이면 그리지 않는다 */
export function UnreadBadge({ staff, className }: { staff: Staff; className?: string }) {
  const n = staff.unreadReports ?? 0
  const label = unreadLabel(n)
  if (!label) return null
  const title = t('staffCard.unread', { n })
  return (
    <span
      role="status"
      aria-label={title}
      title={title}
      className={cn('bg-primary text-primary-foreground inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums', className)}
    >
      {label}
    </span>
  )
}

/** isLab: 랩장 표시 (기본은 팀장) */
export function LeadMark({ isLab = false }: { isLab?: boolean }) {
  const isWorkMode = useWorkMode()
  if (!isWorkMode) return <span className="shrink-0 text-status-waiting">★</span>
  return (
    <Badge variant="outline" className="border-primary/40 text-primary h-4 shrink-0 px-1.5 text-[10px]">
      {t(isLab ? 'staffCard.labLead' : 'staffCard.lead')}
    </Badge>
  )
}

export function StatusDot({ staff }: { staff: Staff }) {
  const meta = statusMetaOf(staff)
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

/** 카드 왼쪽 띠·테두리를 상태색으로 — 멀리서도 상태가 구분되게. 퇴근은 흐리게 */
const CARD_TONE: Record<Staff['status'], string> = {
  working: 'shadow-[inset_3px_0_0_var(--status-working)]',
  waiting: 'border-status-waiting/60 shadow-[inset_3px_0_0_var(--status-waiting)]',
  error: 'border-status-error/60 shadow-[inset_3px_0_0_var(--status-error)]',
  netWait: 'border-status-waiting/40',
  idle: '',
  offline: 'opacity-60 hover:opacity-100',
}

const ACTION_CLASS: Record<Exclude<CardAction, 'none'>, string> = {
  confirm: 'bg-status-waiting text-background hover:bg-status-waiting/90',
  retry: 'bg-status-error text-white hover:bg-status-error/90',
  assign: '',
}

/** 직원 명함 카드(A안): 머리 · 상태 · 지금 하는 일(문장) · 시킬 수 있는 일 예시 3개 · 강조 버튼 1개 + '자세히 ›' */
export function StaffCard({ staff, isLead = false, isLab = false, isSelected, onSelect }: Props) {
  const tasks = useOffice((s) => s.tasks)
  const team = useOffice((s) => s.teams.find((tm) => tm.id === staff.teamId))
  const setStaffDraft = useOffice((s) => s.setStaffDraft)
  const openStaffApprovals = useOffice((s) => s.openStaffApprovals)
  const task = useMemo(() => (staff.kind === 'hired' ? currentTask(tasks, staff.id) : null), [tasks, staff.kind, staff.id])
  const action = cardAction(staff)
  const info = roleInfo(staff.role)
  const tone = isAwaitingTeam(staff) ? 'working' : staff.status
  const meta = statusMetaOf(staff)
  // 패널을 열고 지시창을 채운다(빈 글이면 열기만) — 보내기는 대표가
  const openWith = (text: string) => {
    onSelect(staff.id)
    setStaffDraft({ staffId: staff.id, text })
  }
  const handleAction = () => {
    // 결재·질문을 기다리면 결재 탭으로 바로 연다
    if (action === 'confirm') openStaffApprovals(staff.id)
    else if (action === 'retry') openWith(t('staffCard.retryDraft'))
    else openWith('')
  }
  return (
    <div
      className={cn(
        'bg-card relative flex w-full min-w-0 flex-col gap-2.5 rounded-xl border p-3.5 text-left',
        CARD_TONE[tone],
        isSelected && 'ring-primary ring-2',
      )}
    >
      <button type="button" onClick={() => onSelect(staff.id)} className="focus-ring -m-1 flex min-w-0 items-center gap-2.5 rounded-lg p-1 text-left">
        <Avatar avatar={staff.avatar} name={staff.name} teamId={staff.teamId} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-sm font-bold">
            <span className="min-w-0 truncate">{staff.name}</span>
            {isLead && <LeadMark isLab={isLab} />}
            {staff.isPractice && <PracticeBadge />}
            <UnreadBadge staff={staff} />
            {staff.isAutonomous && <AutonomyBadge className="shrink-0" />}
          </div>
          <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
            <span className="truncate">{roleLabel(staff.role)}</span>
            {team && (
              <span
                className="text-foreground shrink-0 truncate rounded px-1.5 text-[10px] font-semibold"
                style={{
                  background: `color-mix(in oklab, ${team.color} 18%, var(--card))`,
                }}
              >
                {team.name}
              </span>
            )}
            {staff.kind === 'external' && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                {t('staffCard.external')}
              </Badge>
            )}
          </div>
        </div>
      </button>
      <div className={cn('flex items-center gap-1.5 text-xs font-medium', meta.text)}>
        <span className={cn('size-2 shrink-0 rounded-full', meta.dot, tone === 'working' && 'animate-pulse motion-reduce:animate-none')} />
        {meta.label}
        <Elapsed staff={staff} className="font-normal" />
      </div>
      <div className="bg-background rounded-lg px-2.5 py-1.5 text-xs leading-relaxed">
        <span className="text-muted-foreground block text-[10px] font-bold">{t('staffCard.nowLabel')}</span>
        <span className="line-clamp-2 break-words">{tr(nowLine(staff, task))}</span>
      </div>
      {action !== 'none' && (
        <div>
          <span className="text-muted-foreground mb-1 block text-[10px] font-bold">{t('staffCard.canLabel')}</span>
          <div className="flex flex-wrap gap-1">
            {info.exampleKeys.map((k) => (
              <button
                key={k}
                type="button"
                title={t('staffCard.exampleTitle')}
                onClick={() => openWith(t(k))}
                className="focus-ring hover:bg-accent hover:text-foreground text-muted-foreground phone:min-h-9 phone:px-3 phone:text-xs rounded-full border px-2 py-0.5 text-[11px]"
              >
                {t(k)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-auto flex items-center gap-1.5">
        {action !== 'none' && (
          <Button size="sm" className={cn('phone:h-9 h-7 px-2.5 text-xs', ACTION_CLASS[action])} onClick={handleAction}>
            {t(`staffCard.action.${action}`)}
          </Button>
        )}
        {(action === 'confirm' || action === 'retry') && (
          <Button size="sm" variant="outline" className="phone:h-9 h-7 px-2.5 text-xs" onClick={() => openWith('')}>
            {t('staffCard.action.assign')}
          </Button>
        )}
        <button type="button" onClick={() => onSelect(staff.id)} className="focus-ring text-muted-foreground hover:text-foreground phone:min-h-9 ml-auto rounded px-1 text-xs">
          {t('staffCard.details')}
        </button>
      </div>
    </div>
  )
}

/** 마지막 칸 '＋ 직원 추가' 빈자리 */
export function AddStaffCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring text-muted-foreground hover:bg-accent/50 flex min-h-48 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-4 text-center text-xs"
    >
      <span className="bg-accent text-primary grid size-9 place-items-center rounded-full">
        <PlusIcon className="size-5" />
      </span>
      <b className="text-foreground text-sm">{t('staffCard.add.title')}</b>
      {t('staffCard.add.hint')}
      <span className="text-[11px]">{t('staffCard.add.roles')}</span>
    </button>
  )
}
