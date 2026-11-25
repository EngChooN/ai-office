import { useState, type ReactNode } from 'react'
import { CheckIcon, ClipboardCheckIcon, FileTextIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Markdown } from '@/components/markdown'
import { cn } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { useOffice } from '@/store'
import { minutesMarkdown, parseActionItems } from '@shared/meetingOutcome'
import type { ArtifactKind, Meeting, MeetingOutcomeChoice } from '@shared/types'
import { t } from '@shared/i18n'
import { useMeetingChairId } from './MeetingLive'

/** 회의가 끝난 뒤 결과 고르기: 결재 올리기 · 결과물 내기(정리 문서/HTML) · 건너뛰기. 그냥 닫으면 고르기 전 그대로 (지난 회의 카드에서 다시 연다) */
export function MeetingOutcomeDialog({ meeting: m, onClose }: { meeting: Meeting; onClose: () => void }) {
  const [pick, setPick] = useState<'plan' | 'artifact'>('plan')
  const [format, setFormat] = useState<ArtifactKind>('md')
  const [isFull, setIsFull] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const chairId = useMeetingChairId(m)
  const chairName = useOffice((s) => s.staff.find((x) => x.id === chairId)?.name)
  const todoCount = parseActionItems(m.summary).length

  const resolve = async (choice: MeetingOutcomeChoice) => {
    setIsSending(true)
    try {
      if (!(await window.office.resolveMeetingOutcome(m.id, choice))) throw new Error('not resolved')
      onClose()
    } catch {
      showToast(t('meeting.outcome.failed'))
    } finally {
      setIsSending(false)
    }
  }
  const submit = () => void resolve(pick === 'plan' ? { kind: 'plan' } : { kind: 'artifact', format })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-w-xl flex-col gap-4">
        <div className="flex flex-col gap-1 pr-6">
          <DialogDescription className="text-xs">
            {m.topic}
            {chairName && ` · ${t('meeting.live.chair', { name: chairName })}`}
          </DialogDescription>
          <DialogTitle className="text-base font-semibold">{t('meeting.outcome.title')}</DialogTitle>
        </div>

        <div className="bg-muted rounded-lg p-3 text-sm">
          <div className="mb-1.5 flex items-center gap-2 text-xs">
            <span className="font-semibold">{t('meeting.minutes')}</span>
            {todoCount > 0 && <span className="bg-primary/15 text-primary rounded px-1.5 font-medium">{t('meeting.outcome.todoCount', { n: todoCount })}</span>}
            <button type="button" onClick={() => setIsFull((v) => !v)} aria-expanded={isFull} className="text-primary ml-auto hover:underline">
              {isFull ? t('meeting.question.collapse') : t('meeting.outcome.fullMinutes')}
            </button>
          </div>
          <div className={cn(isFull ? 'max-h-72 overflow-y-auto' : 'line-clamp-4')}>
            <Markdown>{minutesMarkdown(m.summary)}</Markdown>
          </div>
        </div>

        <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('meeting.outcome.title')}>
          <Choice isOn={pick === 'plan'} onPick={() => setPick('plan')} icon={<ClipboardCheckIcon />} title={t('meeting.outcome.plan')} desc={t('meeting.outcome.planDesc')} />
          <Choice isOn={pick === 'artifact'} onPick={() => setPick('artifact')} icon={<FileTextIcon />} title={t('meeting.outcome.artifact')} desc={t('meeting.outcome.artifactDesc')}>
            {pick === 'artifact' && (
              <div className="mt-2 flex flex-wrap gap-2">
                {(['html', 'md'] as const).map((f) => (
                  <Button key={f} type="button" size="sm" variant="outline" aria-pressed={format === f} onClick={() => setFormat(f)} className={cn('h-7 text-xs', format === f && 'border-primary bg-accent')}>
                    {format === f && <CheckIcon />}
                    {t(f === 'html' ? 'meeting.outcome.formatHtml' : 'meeting.outcome.formatMd')}
                  </Button>
                ))}
              </div>
            )}
          </Choice>
        </div>

        <div className="flex flex-col gap-2 border-t pt-3">
          <div className="flex items-center gap-2 phone:flex-col-reverse phone:items-stretch">
            <Button type="button" variant="ghost" size="sm" disabled={isSending} onClick={() => void resolve({ kind: 'skip' })}>
              {t('meeting.outcome.skip')}
            </Button>
            <Button type="button" className="ml-auto phone:ml-0" disabled={isSending} onClick={submit}>
              {t(pick === 'plan' ? 'meeting.outcome.submitPlan' : 'meeting.outcome.submitArtifact')}
            </Button>
          </div>
          <p className="text-muted-foreground text-[11px] phone:text-center">{t('meeting.outcome.closeNote')}</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Choice({ isOn, onPick, icon, title, desc, children }: { isOn: boolean; onPick: () => void; icon: ReactNode; title: string; desc: string; children?: ReactNode }) {
  return (
    <div className={cn('rounded-lg border p-3', isOn && 'border-primary bg-accent/40')}>
      <button type="button" role="radio" aria-checked={isOn} onClick={onPick} className="flex w-full items-start gap-3 text-left">
        <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border', isOn && 'border-primary')}>{isOn && <span className="bg-primary size-2 rounded-full" />}</span>
        <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4">{icon}</span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{title}</span>
          <span className="text-muted-foreground block text-xs">{desc}</span>
        </span>
      </button>
      {children && <div className="pl-[4.25rem]">{children}</div>}
    </div>
  )
}
