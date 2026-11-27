import { useState } from 'react'
import { ChevronRightIcon, CircleAlertIcon, RotateCwIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { t } from '@shared/i18n'
import { waitLabel, waitTime, workStateLabel, workStateOf } from '@shared/workWait'
import type { ReReview, Task, WorkState } from '@shared/types'
import { useNow } from './status'

// 상태 보드 (docs/design/status-board/decision.md): 카드 상태 칩 · '재검토 필요' 칩 · 보드 맨 위 대표 응답 대기 띠

/** 칩 점·테두리·바탕 (할 일 회색, 진행 중·완료 초록 점, 대표 응답 대기 연한 노랑, 검토 중 primary) */
const STATE_LOOK: Record<WorkState, { dot: string; chip: string }> = {
  queued: { dot: 'bg-status-idle', chip: 'border-border' },
  working: { dot: 'bg-status-working', chip: 'border-border' },
  awaitingUser: { dot: 'bg-status-waiting', chip: 'border-status-waiting/60 bg-status-waiting/15' },
  review: { dot: 'bg-primary', chip: 'border-border' },
  done: { dot: 'bg-status-working', chip: 'border-border' },
}

export function WorkStateChip({ state, className }: { state: WorkState; className?: string }) {
  const look = STATE_LOOK[state]
  return (
    <span className={cn('inline-flex h-5 w-fit max-w-full shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-bold whitespace-nowrap', look.chip, className)}>
      <span className={cn('size-[7px] shrink-0 rounded-full', look.dot)} />
      <span className="truncate">{workStateLabel(state)}</span>
    </span>
  )
}

/** 서버가 '필요'라고 할 때만. '아님'·'판단 불가'는 아무것도 붙이지 않는다 */
export function ReReviewChip({ value, className }: { value: ReReview | undefined; className?: string }) {
  if (value !== 'needed') return null
  return (
    <span
      title={t('workStatus.reReviewTitle')}
      className={cn('border-status-rereview bg-status-rereview/10 text-status-rereview inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full border-[1.5px] px-2 text-[11px] font-bold whitespace-nowrap', className)}
    >
      <RotateCwIcon className="size-[11px]" strokeWidth={2.5} />
      {t('workStatus.reReview')}
    </span>
  )
}

/** 담당 직원이 오류로 못 끝내 할 일로 돌아온 카드 — 이유는 마우스를 올리면 */
export function FailedChip({ task, className }: { task: Task; className?: string }) {
  if (!task.failure || task.status !== 'todo') return null
  const reason = task.failure.reason
  return (
    <span
      title={reason ? t('workStatus.failedTitle', { reason }) : t('workStatus.failedTitleNoReason')}
      className={cn('border-status-error bg-status-error/10 text-status-error inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full border-[1.5px] px-2 text-[11px] font-bold whitespace-nowrap', className)}
    >
      <CircleAlertIcon className="size-[11px]" strokeWidth={2.5} />
      {t('workStatus.failed')}
    </span>
  )
}

/** '42분' — 대기 시작 시각을 모르면 아무것도 */
export function WaitText({ since, now, className }: { since: number | null | undefined; now: number; className?: string }) {
  const w = waitTime(since, now)
  if (!w) return null
  return <span className={cn('text-status-waiting text-[11px] font-bold whitespace-nowrap tabular-nums', className)}>{t('workStatus.waitedFor', { time: waitLabel(w) })}</span>
}

/** 카드 한 장의 대기 시간 — 1분마다 새로 그린다 (대기 중인 카드에만 붙여 시계가 카드마다 돌지 않게) */
export function LiveWaitText({ since, className }: { since: number | null | undefined; className?: string }) {
  const now = useNow(60_000)
  return <WaitText since={since} now={now} className={className} />
}

/** 카드·상세 창의 상태 줄: 상태 칩 (+ 대기 시간) (+ 실패) (+ 재검토 필요) */
export function WorkStatusRow({ task, reReview, className }: { task: Task; reReview: ReReview | undefined; className?: string }) {
  const state = workStateOf(task)
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <WorkStateChip state={state} />
      {state === 'awaitingUser' && <LiveWaitText since={task.work?.waitingSince} />}
      <FailedChip task={task} />
      <ReReviewChip value={reReview} />
    </div>
  )
}

/**
 * 보드 맨 위 노란 띠 한 줄: "! 대표 응답 대기 N건 · [일 · 대기 시간] … +N건 · 모두 보기 ›". 0건이면 숨긴다.
 * tasks는 오래 기다린 순(awaitingTasks). 일을 누르면 onOpen
 */
export function AwaitingBand({ tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void }) {
  const now = useNow(60_000)
  const [isListOpen, setIsListOpen] = useState(false)
  if (tasks.length === 0) return null
  const shown = tasks.slice(0, 3)
  const rest = tasks.length - shown.length
  return (
    <div className="border-status-waiting/60 bg-status-waiting/10 flex min-h-9 shrink-0 items-center gap-2 overflow-hidden rounded-[10px] border px-2 py-1 text-xs">
      <span className="bg-status-waiting text-background grid size-5 shrink-0 place-items-center rounded-full text-[12px] font-black">!</span>
      <b className="shrink-0 whitespace-nowrap">{t('workStatus.band.title', { n: tasks.length })}</b>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {shown.map((tk) => (
          <button
            key={tk.id}
            type="button"
            onClick={() => onOpen(tk)}
            className="bg-card hover:bg-accent flex h-6 max-w-64 min-w-0 shrink items-center gap-1.5 rounded-full border px-2 text-[11px]"
          >
            <span className="min-w-0 truncate">{tk.title}</span>
            <WaitText since={tk.work?.waitingSince} now={now} className="shrink-0" />
          </button>
        ))}
        {rest > 0 && <span className="text-muted-foreground shrink-0 text-[11px] font-semibold">{t('workStatus.band.more', { n: rest })}</span>}
      </div>
      <button type="button" onClick={() => setIsListOpen(true)} className="text-foreground flex shrink-0 items-center text-[11px] font-semibold whitespace-nowrap hover:underline">
        {t('workStatus.band.viewAll')}
        <ChevronRightIcon className="size-3.5" />
      </button>
      <AwaitingList tasks={tasks} now={now} isOpen={isListOpen} onOpenChange={setIsListOpen} onOpen={onOpen} />
    </div>
  )
}

function AwaitingList({ tasks, now, isOpen, onOpenChange, onOpen }: { tasks: Task[]; now: number; isOpen: boolean; onOpenChange: (v: boolean) => void; onOpen: (task: Task) => void }) {
  const staff = useOffice((s) => s.staff)
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('workStatus.band.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('workStatus.band.dialogDesc')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {tasks.map((tk) => (
            <button
              key={tk.id}
              type="button"
              onClick={() => {
                onOpenChange(false)
                onOpen(tk)
              }}
              className="hover:bg-accent flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{tk.title}</span>
              <span className="text-muted-foreground shrink-0">{staff.find((x) => x.id === tk.assigneeId)?.name ?? t('board.detail.unassigned')}</span>
              <WaitText since={tk.work?.waitingSince} now={now} className="shrink-0" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
