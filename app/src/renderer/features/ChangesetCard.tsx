import { useEffect, useState } from 'react'
import { CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SHELL } from '@/shell'
import { t } from '@shared/i18n'
import { syncErrorCode, type ApplyChoice, type ApplyResult, type CardFile, type PeerChangesCard, type SyncErrorCode } from '@shared/peerSync'
import type { Hunk } from '@shared/textDiff'
import type { Approval } from '@shared/types'

// 다른 PC 직원이 바꾼 파일 묶음 결재 (toolName 'PeerChanges', docs/design/multi-pc 06 · 결재함)
// 스냅샷 카드에는 목록만 있다 — 열면 peerChangesetDetail로 지금 이 PC 파일 기준 충돌과 줄 비교를 다시 받는다
// 충돌이 있으면 "전체 반영"을 막고 "충돌 없는 것만"을 보조로, 실행·설정 파일은 따로 체크해야 반영된다

/** 바뀌지 않은 줄이 이보다 많으면 접어서 "같은 줄 n개"로 */
const SAME_FOLD = 4

export function ChangesetCard({ approval, staffName }: { approval: Approval; staffName: string }) {
  // 휴대폰에서는 다루지 않는다 (PC에서 열기)
  if (SHELL === 'mobile' || !approval.peerChanges) return null
  return <ChangesetCardBody light={approval.peerChanges} staffName={staffName} />
}

function ChangesetCardBody({ light, staffName }: { light: PeerChangesCard; staffName: string }) {
  const id = light.changesetId
  const [detail, setDetail] = useState<PeerChangesCard | null>(null)
  const [loadError, setLoadError] = useState<SyncErrorCode | 'unknown' | null>(null)
  const [openPaths, setOpenPaths] = useState<Set<string>>(() => new Set())
  const [sensitiveOk, setSensitiveOk] = useState<Set<string>>(() => new Set())
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = () =>
    window.office.peerChangesetDetail(id).then(
      (d) => {
        setDetail(d)
        setLoadError(null)
      },
      (e: unknown) => setLoadError(syncErrorCode(e) ?? 'unknown'),
    )
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const card = detail ?? light
  const hasConflict = card.counts.conflict > 0
  const sensitiveFiles = card.files.filter((f) => f.isSensitive && f.verdict === 'apply')
  const heldSensitive = sensitiveFiles.filter((f) => !sensitiveOk.has(f.path)).length

  const toggle = (set: Set<string>, path: string) => {
    const next = new Set(set)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    return next
  }

  const apply = async (mode: ApplyChoice['mode']) => {
    setIsBusy(true)
    setMessage(null)
    try {
      const r = await window.office.peerApplyChanges(id, { mode, sensitiveOk: [...sensitiveOk] })
      setMessage(resultText(r))
      // 막혔거나 되돌린 경우는 카드가 남는다 — 지금 파일로 다시 판정
      if (r.status === 'blocked' || r.status === 'failed') await load()
    } catch (e) {
      setMessage(t(`peerSync.error.${syncErrorCode(e) ?? 'apply_failed'}`))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', hasConflict ? 'bg-status-waiting/15 text-status-waiting' : 'bg-primary/10 text-primary')}>
          {t(hasConflict ? 'peerSync.card.conflictBadge' : 'peerSync.card.badge')}
        </span>
        <span className="font-medium">{t('peerSync.card.title', { name: staffName, n: card.files.length })}</span>
      </div>
      <span className="text-muted-foreground text-xs break-all">{t('peerSync.card.folder', { name: card.rootName })}</span>

      {loadError ? (
        <p role="alert" className="text-status-error text-xs">
          {t(`peerSync.error.${loadError === 'unknown' ? 'apply_failed' : loadError}`)}
        </p>
      ) : (
        <p className={cn('rounded-md px-2 py-1.5 text-xs', hasConflict ? 'bg-status-waiting/10 text-status-waiting' : 'bg-background text-muted-foreground')}>
          {hasConflict ? t('peerSync.conflict.summary', { n: card.counts.conflict }) : t('peerSync.card.notice')}
        </p>
      )}

      {!loadError && (
        <ul className="flex flex-col gap-1">
          {card.files.map((f) => (
            <FileRow
              key={f.path}
              file={f}
              isOpen={openPaths.has(f.path)}
              isLoaded={!!detail}
              onToggleOpen={() => setOpenPaths((s) => toggle(s, f.path))}
              isSensitiveChecked={sensitiveOk.has(f.path)}
              onToggleSensitive={() => setSensitiveOk((s) => toggle(s, f.path))}
            />
          ))}
        </ul>
      )}

      {card.skipped.length > 0 && (
        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer">{t('peerSync.card.skipped', { n: card.skipped.length })}</summary>
          <ul className="mt-1 flex flex-col gap-0.5 pl-3">
            {card.skipped.map((s) => (
              <li key={s.path} className="break-all">
                <span className="font-mono">{s.path}</span> <span className="text-muted-foreground">— {t(`peerSync.skipped.${s.reason}`)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!loadError && hasConflict && <p className="text-muted-foreground text-xs">{t('peerSync.card.allBlocked')}</p>}
      {!loadError && heldSensitive > 0 && <p className="text-muted-foreground text-xs">{t('peerSync.card.sensitiveHeld', { n: heldSensitive })}</p>}
      {message && (
        <p role="status" className="text-xs font-medium">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!loadError && (
          <Button size="sm" disabled={isBusy || hasConflict} aria-disabled={hasConflict} onClick={() => void apply('all')}>
            <CheckIcon /> {t('peerSync.action.all')}
          </Button>
        )}
        {!loadError && hasConflict && (
          <Button size="sm" variant="secondary" disabled={isBusy} onClick={() => void apply('safe')}>
            {t('peerSync.action.safe')}
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={isBusy} onClick={() => void apply('reject')}>
          {t('peerSync.action.reject')}
        </Button>
      </div>
    </div>
  )
}

function FileRow({
  file,
  isOpen,
  isLoaded,
  onToggleOpen,
  isSensitiveChecked,
  onToggleSensitive,
}: {
  file: CardFile
  isOpen: boolean
  isLoaded: boolean
  onToggleOpen: () => void
  isSensitiveChecked: boolean
  onToggleSensitive: () => void
}) {
  const canCompare = file.verdict !== 'same'
  return (
    <li className="bg-background flex flex-col gap-1 rounded-md px-2 py-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 font-mono break-all">{file.path}</span>
        <span className="text-muted-foreground shrink-0">{t(`peerSync.op.${file.op}`)}</span>
        {canCompare && (
          <button type="button" aria-expanded={isOpen} onClick={onToggleOpen} className="text-primary shrink-0 hover:underline">
            {t(isOpen ? 'peerSync.card.hideDiff' : 'peerSync.card.showDiff')}
          </button>
        )}
      </div>
      {file.verdict === 'conflict' && file.conflict && <span className="text-status-waiting font-medium">⚠ {t(`peerSync.conflict.${file.conflict}`)}</span>}
      {file.verdict === 'same' && <span className="text-muted-foreground">{t('peerSync.verdict.same')}</span>}
      {file.isSensitive && file.verdict === 'apply' && (
        <label className="flex items-start gap-1.5">
          <input type="checkbox" checked={isSensitiveChecked} onChange={onToggleSensitive} className="mt-0.5 shrink-0" />
          <span>
            <span className="text-status-waiting">{t('peerSync.sensitive')}</span> · {t('peerSync.card.sensitiveCheck')}
          </span>
        </label>
      )}
      {isOpen && (isLoaded ? <DiffView diff={file.diff} /> : <span className="text-muted-foreground">{t('peerSync.card.loading')}</span>)}
    </li>
  )
}

/** 줄 비교 — 지운 줄 −, 더한 줄 + (색만으로 구분하지 않는다) */
function DiffView({ diff }: { diff: CardFile['diff'] }) {
  if (diff === 'binary') return <span className="text-muted-foreground">{t('peerSync.diff.binary')}</span>
  if (diff === 'too_large') return <span className="text-muted-foreground">{t('peerSync.diff.tooLarge')}</span>
  if (!diff?.some((h) => h.kind === 'change')) return <span className="text-muted-foreground">{t('peerSync.diff.empty')}</span>
  return (
    <div className="bg-muted selectable max-h-72 overflow-auto rounded p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap">
      {diff.map((h, i) => (
        <HunkLines key={i} hunk={h} />
      ))}
    </div>
  )
}

function HunkLines({ hunk }: { hunk: Hunk }) {
  if (hunk.kind === 'same') {
    if (hunk.lines.length > SAME_FOLD) return <div className="text-muted-foreground py-0.5 italic">⋯ {t('peerSync.diff.sameLines', { n: hunk.lines.length })}</div>
    return (
      <>
        {hunk.lines.map((l, i) => (
          <div key={i} className="text-muted-foreground">
            {'  '}
            {l}
          </div>
        ))}
      </>
    )
  }
  return (
    <>
      {hunk.del.map((l, i) => (
        <div key={`d${i}`} className="bg-status-error/10 text-status-error">
          {'− '}
          {l}
        </div>
      ))}
      {hunk.add.map((l, i) => (
        <div key={`a${i}`} className="bg-status-working/10 text-status-working">
          {'+ '}
          {l}
        </div>
      ))}
    </>
  )
}

function resultText(r: ApplyResult): string {
  if (r.status === 'applied') return t('peerSync.result.applied', { n: r.applied.length })
  if (r.status === 'partial') return t('peerSync.result.partial', { n: r.applied.length, m: r.held.length + r.conflicts.length })
  if (r.status === 'blocked') return t('peerSync.conflict.blocked')
  if (r.status === 'failed') return t('peerSync.result.failed')
  return r.error ? t(`peerSync.error.${r.error}`) : t('peerSync.result.rejected')
}
