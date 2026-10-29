import { useState } from 'react'
import { CheckIcon, RotateCcwIcon, SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AttachmentView } from '@/components/attachments'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import type { ProcessRun, RunStatus } from '@shared/types'
import { t, type TKey } from '@shared/i18n'
import { Avatar } from './StaffCard'
import { Markdown } from '@/components/markdown'
import { roleLabel } from '@shared/roleLabel'

const STATUS: Record<RunStatus, { label: TKey; className: string }> = {
  running: { label: 'runCard.status.running', className: 'bg-primary text-primary-foreground animate-pulse' },
  checking: { label: 'runCard.status.checking', className: 'bg-status-waiting text-background animate-pulse' },
  done: { label: 'runCard.status.done', className: 'bg-status-working text-background' },
  failed: { label: 'runCard.status.failed', className: 'bg-status-error text-background' },
  stopped: { label: 'runCard.status.stopped', className: 'bg-muted' },
}
const PREVIEW_MAX = 6000

/** 프로세스 실행 카드: 단계 진행도, 지금 담당, 확인 단계면 승인·피드백 */
export function RunCard({ run, isCompact = false }: { run: ProcessRun; isCompact?: boolean }) {
  const staff = useOffice((s) => s.staff)
  const select = useOffice((s) => s.select)
  const [feedback, setFeedback] = useState('')
  const [isOpen, setIsOpen] = useState(!isCompact)
  const current = staff.find((s) => s.id === run.currentStaffId)
  const step = run.steps[run.stepIndex]
  const doneIds = new Set(run.history.map((h) => h.stepId))

  return (
    <div className={cn('bg-card flex flex-col gap-2 rounded-xl border p-3 text-sm', run.status === 'checking' && 'border-status-waiting')}>
      <button type="button" onClick={() => setIsOpen((v) => !v)} className="flex items-center gap-2 text-left">
        <span className={cn('rounded px-1.5 text-[10px] font-semibold', STATUS[run.status].className)}>{t(STATUS[run.status].label)}</span>
        <span className="flex-1 truncate font-medium">📘 {run.manualName}</span>
        <span className="text-muted-foreground text-xs">{run.scope.name}</span>
      </button>
      {/* 단계 진행도 */}
      <div className="flex flex-wrap items-center gap-1">
        {run.steps.map((s, i) => (
          <span
            key={s.id}
            title={`${s.title} · ${roleLabel(s.role)}`}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px]',
              i === run.stepIndex && run.status !== 'done' ? 'border-primary bg-primary/15 text-primary font-semibold' : doneIds.has(s.id) || run.status === 'done' ? 'bg-muted text-muted-foreground line-through' : 'text-muted-foreground',
            )}
          >
            {i + 1}. {s.title}
            {s.needsMyCheck && ' 🙋'}
          </span>
        ))}
      </div>
      {current && run.status !== 'done' && (
        <button type="button" onClick={() => select(current.id)} className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Avatar avatar={current.avatar} name={current.name} teamId={current.teamId} className="size-5" /> {t('runCard.assignee', { name: current.name })} · {step?.title}
        </button>
      )}
      {isOpen && run.input && <p className="text-muted-foreground selectable line-clamp-3 text-xs whitespace-pre-wrap">{t('runCard.input', { input: run.input })}</p>}
      {isOpen && <AttachmentView attachments={run.attachments} size="sm" />}
      {run.status === 'checking' && (
        <div className="flex flex-col gap-2 border-t pt-2">
          <div className="text-xs font-semibold">🙋 {t('runCard.pleaseCheck', { step: step?.title ?? '' })}</div>
          <Markdown className="bg-muted max-h-64 overflow-auto rounded p-2 text-xs">{run.pendingOutput.slice(0, PREVIEW_MAX)}</Markdown>
          <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={t('runCard.feedbackPlaceholder')} className="min-h-12 text-xs" />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void window.office.reviewRun(run.id, true, '')}>
              <CheckIcon /> {t('runCard.approve')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => (void window.office.reviewRun(run.id, false, feedback), setFeedback(''))}>
              <RotateCcwIcon /> {t('runCard.revise')}
            </Button>
          </div>
        </div>
      )}
      {isOpen && run.history.length > 0 && (
        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer">{t('runCard.history', { n: run.history.length })}</summary>
          <div className="mt-1 flex flex-col gap-1">
            {run.history.map((h, i) => (
              <div key={i} className="bg-muted/50 rounded p-2">
                <div className="font-medium">
                  {run.steps.find((s) => s.id === h.stepId)?.title} · {h.staffName} {h.verdict === 'revise' ? '↩️ revise' : h.verdict === 'approve' ? '✅' : ''}
                </div>
                <Markdown className="text-muted-foreground max-h-40 overflow-auto">{h.output}</Markdown>
              </div>
            ))}
          </div>
        </details>
      )}
      {(run.status === 'running' || run.status === 'checking') && (
        <Button size="sm" variant="ghost" className="text-muted-foreground w-fit" onClick={() => void window.office.stopRun(run.id)}>
          <SquareIcon /> {t('runCard.stop')}
        </Button>
      )}
    </div>
  )
}
