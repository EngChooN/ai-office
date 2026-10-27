import { useMemo, useState } from 'react'
import { CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useNow } from '@/features/status'
import { CARD_TTL_MS } from '@shared/secretaryTools'
import { applyHunks, changeCount, diffHunks, type Hunk } from '@shared/textDiff'
import type { SecretaryCard } from '@shared/types'
import { Words } from './CompareView'
import { requestSecretaryDraft } from './draft'
import { t } from '@shared/i18n'

// 첨삭 비교 (secretary-ui.md 4-4): 원문·다듬은 안을 나란히(좁으면 위아래). 지운 말은 취소선, 더한 말은 밑줄 — 색만으로 구분하지 않는다
// [적용]·[일부 적용]은 확인 카드와 같은 길(secretaryRun)로, 그사이 원문이 바뀌었으면 main이 멈춘다

type Change = Extract<Hunk, { kind: 'change' }>

function Column({ title, hunks, side, isChangesOnly, chosen, onToggle }: { title: string; hunks: Hunk[]; side: 'del' | 'add'; isChangesOnly: boolean; chosen?: Set<number>; onToggle?: (id: number) => void }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-semibold">{title}</span>
      <div className="bg-muted selectable flex max-h-96 flex-col gap-1 overflow-y-auto rounded-lg p-3 text-xs whitespace-pre-wrap">
        {hunks.map((h, i) => {
          if (h.kind === 'same') return isChangesOnly ? null : <div key={i}>{h.lines.join('\n')}</div>
          const c = h as Change
          const text = side === 'del' ? c.del.join('\n') : c.add.join('\n')
          const isOff = chosen ? !chosen.has(c.id) : false
          return (
            <div key={i} className={cn('flex gap-1.5', isOff && 'opacity-50')}>
              {onToggle && (
                <input type="checkbox" checked={!isOff} onChange={() => onToggle(c.id)} aria-label={t('secretary.diff.applyPart')} className="mt-0.5 shrink-0" />
              )}
              <div className="min-w-0 flex-1">{text ? <Words before={c.del.join('\n')} after={c.add.join('\n')} side={side} /> : <span className="text-muted-foreground">{side === 'del' ? t('secretary.diff.none') : t('secretary.diff.removed')}</span>}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function EditCompareCard({ card }: { card: SecretaryCard }) {
  const now = useNow(30_000)
  const edit = card.edit!
  const hunks = useMemo(() => diffHunks(edit.original, edit.revised), [edit.original, edit.revised])
  const ids = useMemo(() => hunks.flatMap((h) => (h.kind === 'change' ? [h.id] : [])), [hunks])
  const [isChangesOnly, setIsChangesOnly] = useState(false)
  const [isPartial, setIsPartial] = useState(false)
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(ids))
  const [isSending, setIsSending] = useState(false)
  const isPending = card.status === 'pending'
  const isExpired = card.status === 'expired' || (isPending && now - card.createdAt > CARD_TTL_MS)

  const apply = async (revised?: string) => {
    setIsSending(true)
    try {
      await window.office.secretaryRun(card.id, revised !== undefined ? { revised } : undefined)
    } finally {
      setIsSending(false)
    }
  }
  const toggle = (id: number) =>
    setChosen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (card.status === 'done')
    return (
      <div className="bg-card flex flex-col gap-2 rounded-xl border p-4 text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <CheckIcon className="text-status-working size-4" /> {t('secretary.diff.applied', { target: edit.targetLabel })}
        </span>
        <details>
          <summary className="text-muted-foreground cursor-pointer text-xs">{t('secretary.diff.showOriginal')}</summary>
          <pre className="bg-muted selectable mt-1 max-h-60 overflow-y-auto rounded-lg p-3 text-xs whitespace-pre-wrap">{edit.appliedOriginal ?? edit.original}</pre>
        </details>
      </div>
    )

  return (
    <div className={cn('bg-card @container flex flex-col gap-3 rounded-xl border p-4 text-sm', (card.status === 'cancelled' || card.status === 'replaced') && 'opacity-60')}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-semibold">{card.title}</span>
        {isExpired && <span className="text-status-waiting text-xs">{t('secretary.expired')}</span>}
        {card.status === 'cancelled' && <span className="text-muted-foreground text-xs">{t('secretary.cancelled')}</span>}
      </div>
      {edit.reasons.length > 0 && (
        <div className="bg-muted rounded-lg p-3 text-xs">
          <span className="font-semibold">{t('secretary.diff.reason')}</span>
          <ul className="mt-1 list-disc pl-4">
            {edit.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground mr-auto">{t('secretary.diff.changeCount', { n: changeCount(hunks) })}</span>
        <label className="text-muted-foreground flex items-center gap-1">
          <input type="checkbox" checked={isChangesOnly} onChange={(e) => setIsChangesOnly(e.target.checked)} /> {t('secretary.diff.changesOnly')}
        </label>
      </div>
      <div className="flex flex-col gap-3 @2xl:flex-row">
        <Column title={t('secretary.diff.current')} hunks={hunks} side="del" isChangesOnly={isChangesOnly} />
        <Column title={t('secretary.diff.proposed')} hunks={hunks} side="add" isChangesOnly={isChangesOnly} chosen={isPartial ? chosen : undefined} onToggle={isPartial ? toggle : undefined} />
      </div>
      {card.status === 'stale' && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-status-waiting mr-auto text-xs">{t('secretary.diff.stale')}</span>
          <Button size="sm" variant="outline" onClick={() => void window.office.secretaryAsk(t('secretary.ask.refine', { target: edit.targetLabel }))}>
            {t('secretary.diff.recompare')}
          </Button>
        </div>
      )}
      {card.status === 'failed' && <p className="text-status-error text-xs">{card.steps[0]?.error ?? t('secretary.diff.applyFailed')}</p>}
      {isPending && !isExpired && !isPartial && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button size="sm" variant="ghost" className="mr-auto" disabled={isSending} onClick={() => void window.office.secretaryCancel(card.id)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" variant="outline" disabled={isSending} onClick={() => requestSecretaryDraft(t('secretary.diff.morePrefill'))}>
            {t('secretary.diff.refine')}
          </Button>
          {ids.length > 1 && (
            <Button size="sm" variant="outline" disabled={isSending} onClick={() => setIsPartial(true)}>
              {t('secretary.diff.applySome')}
            </Button>
          )}
          <Button size="sm" disabled={isSending} onClick={() => void apply()}>
            <CheckIcon /> {isSending ? t('secretary.diff.applying') : t('secretary.diff.apply')}
          </Button>
        </div>
      )}
      {isPending && !isExpired && isPartial && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-muted-foreground mr-auto text-xs">
            {t('secretary.diff.chosen', { total: ids.length, n: chosen.size })}
          </span>
          <Button size="sm" variant="outline" disabled={isSending} onClick={() => setIsPartial(false)}>
            {t('secretary.diff.back')}
          </Button>
          <Button size="sm" disabled={isSending || chosen.size === 0} onClick={() => void apply(applyHunks(hunks, chosen))}>
            <CheckIcon /> {t('secretary.diff.applyThis')}
          </Button>
        </div>
      )}
      {isExpired && (
        <div className="flex justify-end border-t pt-3">
          <Button size="sm" variant="outline" onClick={() => void window.office.secretaryAsk(t('secretary.ask.refine', { target: edit.targetLabel }))}>
            {t('secretary.recheck')}
          </Button>
        </div>
      )}
    </div>
  )
}
