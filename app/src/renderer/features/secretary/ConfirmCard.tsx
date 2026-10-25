import { useState } from 'react'
import { AlertTriangleIcon, CheckIcon, MinusIcon, RotateCwIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useNow } from '@/features/status'
import { CARD_TTL_MS } from '@shared/secretaryTools'
import type { SecretaryCard, SecretaryStep } from '@shared/types'
import { t, type TKey } from '@shared/i18n'

// 확인 카드 (secretary-ui.md 4-1~4-3): 기획 카드 틀 + 하위 업무 줄. [실행]을 눌러야만 앱이 실행한다 (main secretaryCore)

/** 다시 하면 하나 더 생기는 일 — [이어서 하기] 전에 이미 됐는지 확인하라고 알린다 (한리뷰 낮음) */
const NOT_REPEATABLE = new Set(['hire', 'createTeam', 'createLab', 'createTask', 'sendChat', 'instruct', 'interrupt', 'forkExternal', 'startMeeting', 'startRun', 'saveSchedule', 'runScheduleNow', 'recruitExternal'])

/** 위험 카드의 동사 버튼 */
const DANGER_VERB: Record<string, TKey> = { fire: 'secretary.danger.fire', deleteTeam: 'secretary.danger.deleteTeam', deleteLab: 'secretary.danger.deleteLab', deleteManual: 'secretary.danger.deleteManual' }

function StepMark({ step, no }: { step: SecretaryStep; no: number }) {
  if (step.status === 'done') return <CheckIcon className="text-status-working size-5 shrink-0" aria-label={t('secretary.step.done')} />
  if (step.status === 'failed') return <XIcon className="text-status-error size-5 shrink-0" aria-label={t('secretary.step.failed')} />
  if (step.status === 'skipped') return <MinusIcon className="text-muted-foreground size-5 shrink-0" aria-label={t('secretary.step.skipped')} />
  return <span className={cn('bg-muted flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] tabular-nums', step.status === 'running' && 'bg-primary text-primary-foreground animate-pulse')}>{no}</span>
}

export function ConfirmCard({ card }: { card: SecretaryCard }) {
  const now = useNow(30_000)
  const [isEditing, setIsEditing] = useState(false)
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({})
  const [isSending, setIsSending] = useState(false)
  const isPending = card.status === 'pending'
  const isExpired = card.status === 'expired' || (isPending && now - card.createdAt > CARD_TTL_MS)
  const isDanger = card.risk === 'danger'
  const isResult = card.status === 'done' || card.status === 'failed' || card.status === 'running'
  const failedAt = card.steps.findIndex((s) => s.status === 'failed')
  const canEdit = !isDanger && card.steps.some((s) => s.editable)

  const run = async (fromStep?: number) => {
    setIsSending(true)
    try {
      await window.office.secretaryRun(card.id, fromStep ? { fromStep } : Object.keys(edits).length ? { edits } : undefined)
    } finally {
      setIsSending(false)
      setIsEditing(false)
    }
  }
  const setEdit = (no: number, name: string, value: string) => setEdits((e) => ({ ...e, [no]: { ...e[no], [name]: value } }))
  const dangerKey = card.steps.map((s) => DANGER_VERB[s.method]).find(Boolean)
  const dangerVerb = dangerKey ? t(dangerKey) : t('secretary.run')

  const summary =
    card.status === 'done'
      ? t('secretary.result.allDone')
      : card.status === 'failed'
        ? failedAt > 0
          ? t('secretary.result.stoppedAt', { done: failedAt, at: failedAt + 1 })
          : t('secretary.result.stoppedAtFirst')
        : card.status === 'running'
          ? t('secretary.running')
          : ''

  return (
    <div
      className={cn(
        'bg-card @container flex flex-col gap-3 rounded-xl border p-4 text-sm',
        isPending && !isExpired && (isDanger ? 'border-status-error' : 'border-status-waiting'),
        (card.status === 'cancelled' || card.status === 'replaced') && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-semibold">{isResult ? t('secretary.result.title') : card.title}</span>
        {isResult ? <span className="text-muted-foreground text-xs">{summary}</span> : card.steps.length > 1 && <span className="text-muted-foreground text-xs">{t('secretary.stepCount', { n: card.steps.length })}</span>}
        {isExpired && <span className="text-status-waiting text-xs">{t('secretary.expired')}</span>}
        {card.status === 'cancelled' && <span className="text-muted-foreground text-xs">{t('secretary.cancelled')}</span>}
        {card.status === 'replaced' && <span className="text-muted-foreground text-xs">{t('secretary.replaced')}</span>}
      </div>
      {isDanger && isPending && !isExpired && <p className="text-status-error text-xs font-medium">{t('secretary.dangerWarn')}</p>}
      <ol className="flex flex-col gap-1.5">
        {card.steps.map((s, i) => (
          <li key={i} className={cn('flex gap-2 rounded-lg border p-2', s.status === 'skipped' && 'opacity-60')}>
            <StepMark step={s} no={i + 1} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className={cn('text-xs font-medium break-words', s.risk === 'caution' && 'text-status-waiting', s.risk === 'danger' && 'text-status-error')}>{s.label}</span>
              {/* 앱이 실제 인자로 만든 내용 — 실행될 지시 문장·시간·폴더·권한 값을 줄이지 않고 보인다 */}
              {s.detail && <span className="selectable text-[11px] break-words whitespace-pre-wrap">{s.detail}</span>}
              {/* 비서(모델)가 붙인 설명은 보조로만 */}
              {s.note && <span className="text-muted-foreground text-[11px] break-words">{t('secretary.stepNote', { note: s.note })}</span>}
              {s.status === 'failed' && s.error && <span className="text-status-error text-[11px]">{s.error}</span>}
              {s.status === 'skipped' && <span className="text-muted-foreground text-[11px]">{t('secretary.step.skippedNote')}</span>}
              {isEditing && s.editable && (
                <div className="grid grid-cols-1 gap-1.5 @md:grid-cols-2">
                  {Object.entries(s.editable).map(([name, value]) => (
                    <label key={name} className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                      <span className="w-14 shrink-0">{name}</span>
                      <Input value={edits[i + 1]?.[name] ?? value} onChange={(e) => setEdit(i + 1, name, e.target.value)} placeholder={name === '작업 폴더' ? t('secretary.cwdEmpty') : undefined} className="h-7 text-xs" />
                    </label>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {card.notes && card.notes.length > 0 && isPending && (
        <p className="text-muted-foreground text-[11px]">{t('secretary.memo', { notes: card.notes.join(' · ') })}</p>
      )}
      {card.warnings.length > 0 && isPending && (
        <div className="flex flex-col gap-1">
          {card.warnings.map((w) => (
            <p key={w} className="text-status-waiting flex items-start gap-1.5 text-xs">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" /> {w}
            </p>
          ))}
        </div>
      )}
      {isPending && !isExpired && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-muted-foreground mr-auto text-[11px]">{t('secretary.ttlHint')}</span>
          <Button size="sm" variant="ghost" disabled={isSending} onClick={() => void window.office.secretaryCancel(card.id)}>
            {t('common.cancel')}
          </Button>
          {canEdit && (
            <Button size="sm" variant="outline" disabled={isSending} onClick={() => setIsEditing((v) => !v)}>
              {isEditing ? t('secretary.editClose') : t('secretary.edit')}
            </Button>
          )}
          <Button size="sm" variant={isDanger ? 'destructive' : 'default'} disabled={isSending} onClick={() => void run()}>
            {!isDanger && <CheckIcon />} {isSending ? t('secretary.running') : isDanger ? dangerVerb : t('secretary.run')}
          </Button>
        </div>
      )}
      {isExpired && (
        <div className="flex justify-end border-t pt-3">
          <Button size="sm" variant="outline" onClick={() => void window.office.secretaryAsk(t('secretary.ask.recheck'))}>
            {t('secretary.recheck')}
          </Button>
        </div>
      )}
      {card.status === 'failed' && failedAt >= 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button size="sm" disabled={isSending} onClick={() => void run(failedAt + 1)}>
            <RotateCwIcon /> {t('secretary.resumeFrom', { n: failedAt + 1 })}
          </Button>
          {failedAt > 0 && <span className="text-muted-foreground text-[11px]">{failedAt === 1 ? t('secretary.keepDoneOne') : t('secretary.keepDone', { n: failedAt })}</span>}
          {NOT_REPEATABLE.has(card.steps[failedAt].method) && (
            <span className="text-status-waiting w-full text-[11px]">{t('secretary.resumeWarn', { n: failedAt + 1 })}</span>
          )}
        </div>
      )}
    </div>
  )
}
