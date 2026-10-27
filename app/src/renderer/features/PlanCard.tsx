import { useState } from 'react'
import { CheckIcon, RotateCcwIcon, SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Markdown } from '@/components/markdown'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { t } from '@shared/i18n'
import type { Task } from '@shared/types'
import { Avatar } from './StaffCard'
import { useTutorialTaskId } from './Tutorial'

/** 리드의 기획안: 기획서와 하위 업무 안을 보고 승인(배정)하거나 피드백과 함께 다시 */
export function PlanCard({ task, isCompact = false }: { task: Task; isCompact?: boolean }) {
  const staff = useOffice((s) => s.staff)
  const [feedback, setFeedback] = useState('')
  const [isReviseBlocked, setIsReviseBlocked] = useState(false)
  const isTutorialTask = useTutorialTaskId() === task.id
  const plan = task.plan
  if (!plan) return null
  const lead = staff.find((s) => s.id === task.assigneeId)
  const isWaiting = plan.status === 'waiting'

  const handleReview = (isApproved: boolean) => {
    // 연습 기획안은 대본에 [다시] 흐름이 없다 — 안내만 띄운다
    if (task.isPractice && !isApproved) return setIsReviseBlocked(true)
    void window.office.reviewPlan(task.id, isApproved, feedback.trim())
    setFeedback('')
  }

  return (
    <div className={cn('bg-card flex flex-col gap-3 rounded-xl border p-4 text-sm', isWaiting && 'border-status-waiting')}>
      {!isCompact && (
        <div className="flex items-center gap-2">
          {lead && <Avatar avatar={lead.avatar} name={lead.name} teamId={lead.teamId} className="size-6" />}
          <span className="font-semibold">🗂️ {task.title}</span>
          <span className="text-muted-foreground text-xs">{t('planCard.byLead', { name: lead?.name ?? '' })}</span>
        </div>
      )}
      <details open={!isCompact} className="group">
        <summary className="text-muted-foreground cursor-pointer text-xs font-semibold">{t('planCard.spec')}</summary>
        <Markdown className="bg-muted mt-1 max-h-80 overflow-y-auto rounded-lg p-3 text-xs">{plan.spec}</Markdown>
      </details>
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs font-semibold">{t('planCard.subtasks', { count: plan.subtasks.length })}</span>
        {plan.subtasks.map((st, i) => {
          const m = staff.find((s) => s.id === st.assigneeId)
          return (
            <div key={i} className="flex items-start gap-2 rounded-lg border p-2">
              {m && <Avatar avatar={m.avatar} name={m.name} teamId={m.teamId} className="size-6 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium break-words">
                  {st.title} <span className="text-muted-foreground font-normal">· {st.assigneeName}</span>
                </div>
                <div className="text-muted-foreground line-clamp-3 text-[11px] break-words">{st.detail}</div>
              </div>
            </div>
          )
        })}
      </div>
      {plan.status === 'revise' && <p className="text-muted-foreground text-xs">↩️ {t('planCard.revising')}{plan.feedback && `: ${plan.feedback}`}</p>}
      {isWaiting && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={t('planCard.feedbackPlaceholder')} className="min-h-12 text-xs" />
          {isReviseBlocked && <p className="text-muted-foreground text-xs">ℹ️ {t('tutorial.task.reviseBlocked')}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleReview(true)} data-tour={isTutorialTask ? 'tut-approve' : undefined}>
              <CheckIcon /> {t('planCard.approve')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleReview(false)}>
              <RotateCcwIcon /> {t('planCard.revise')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground ml-auto"
              onClick={() => window.confirm(t('planCard.stopConfirm')) && void window.office.stopTask(task.id)}
            >
              <SquareIcon /> {t('planCard.stop')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
