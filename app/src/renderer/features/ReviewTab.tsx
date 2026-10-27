import { useCallback, useEffect, useState } from 'react'
import { GitCommitIcon, GitPullRequestIcon, RefreshCwIcon, SparklesIcon, Undo2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { NotOnWindows } from '@/components/not-on-windows'
import type { Staff, WorkChanges, WorkRevertInfo } from '@shared/types'
import { t, type TKey } from '@shared/i18n'
import { shortPath } from './status'

const STATUS_LABEL: Record<string, TKey> = { M: 'review.file.modified', A: 'review.file.added', D: 'review.file.deleted', R: 'review.file.renamed', '??': 'review.file.new', '?': 'review.file.changed' }

/** diff 한 줄에 색을 입힌다 */
function DiffLine({ line }: { line: string }) {
  const color = line.startsWith('+') && !line.startsWith('+++') ? 'text-emerald-400 bg-emerald-500/10' : line.startsWith('-') && !line.startsWith('---') ? 'text-rose-400 bg-rose-500/10' : line.startsWith('@@') ? 'text-sky-400' : line.startsWith('diff --git') ? 'text-foreground font-semibold mt-2' : 'text-muted-foreground'
  return <div className={cn('px-2 whitespace-pre', color)}>{line || ' '}</div>
}

/** 작업 결과 검토: 직원이 바꾼 파일과 diff를 보고, 결재하면 커밋 → 푸시·PR */
export function ReviewTab({ staff }: { staff: Staff }) {
  const [changes, setChanges] = useState<WorkChanges | null>(null)
  const [message, setMessage] = useState('')
  const [prTitle, setPrTitle] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [output, setOutput] = useState('')
  const [revert, setRevert] = useState<WorkRevertInfo | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const isHired = staff.kind === 'hired'

  const load = useCallback(() => {
    void window.office.workChanges(staff.id).then(setChanges)
    if (isHired) void window.office.workRevertInfo(staff.id).then(setRevert)
  }, [staff.id, isHired])
  useEffect(load, [load, staff.status])

  const run = async (job: () => Promise<{ ok: boolean; output: string }>) => {
    setIsBusy(true)
    const r = await job()
    setOutput(`${r.ok ? '✅' : '⚠️'} ${r.output}`)
    setIsBusy(false)
    load()
  }
  const handleRevert = async () => {
    setIsConfirming(false)
    setIsBusy(true)
    const r = await window.office.revertWork(staff.id)
    setOutput(`${r.ok ? '✅' : '⚠️'} ${r.output}`)
    setIsBusy(false)
    load()
  }
  const handleSuggest = async () => {
    setIsBusy(true)
    const text = await window.office.suggestCommitMessage(staff.id)
    if (text) setMessage(text)
    setIsBusy(false)
  }
  const handleCommit = () =>
    run(async () => {
      const r = await window.office.commitChanges(staff.id, message.trim())
      if (r.ok) {
        setPrTitle(message.trim().split('\n')[0])
        setMessage('')
      }
      return r
    })
  const handlePr = () => run(() => window.office.pushAndCreatePr(staff.id, prTitle.trim(), t('review.prBody', { name: staff.name, role: staff.role })))

  if (!changes) return <p className="text-muted-foreground p-4 text-xs">{t('review.loading')}</p>
  if (!staff.ownCwd && staff.kind === 'hired') return <p className="text-muted-foreground p-4 text-xs">{t('review.noOwnCwd')}</p>
  if (!changes.isGit) return <p className="text-muted-foreground p-4 text-xs">{t('review.notGit', { path: shortPath(staff.cwd) })}</p>

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-2 empty:hidden">
        <NotOnWindows reason={t('review.windowsNote')} />
      </div>
      <div className="flex items-center gap-2 border-b px-4 py-2 text-xs">
        <span className="font-mono">{changes.branch || t('review.detachedHead')}</span>
        <span className="text-muted-foreground">
          {t('review.changeCount', { n: changes.files.length })}
          {changes.ahead ? ` · ${t('review.aheadCount', { n: changes.ahead })}` : ''}
        </span>
        <Button size="icon" variant="ghost" className="ml-auto size-7" onClick={load} aria-label={t('review.refresh')}>
          <RefreshCwIcon className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {isHired && revert && (
          <div className="flex flex-col gap-2 border-b px-4 py-2 text-xs">
            {!revert.available ? (
              <p className="text-muted-foreground">{t(revert.stale ? 'review.revert.stale' : 'review.revert.noBase')}</p>
            ) : revert.files.length === 0 && revert.skipped.length === 0 ? (
              <p className="text-muted-foreground">{t('review.revert.none')}</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">{t('review.revert.summary', { n: revert.files.length, add: revert.files.reduce((a, f) => a + f.additions, 0), del: revert.files.reduce((a, f) => a + f.deletions, 0) })}</span>
                  <Button size="sm" variant="outline" onClick={() => setIsConfirming(true)} disabled={isBusy || revert.files.length === 0 || staff.status === 'working' || staff.status === 'waiting'}>
                    <Undo2Icon /> {t('review.revert.button')}
                  </Button>
                </div>
                {revert.skipped.length > 0 && <p className="text-muted-foreground">{t('review.revert.skipped', { n: revert.skipped.length })}</p>}
              </>
            )}
          </div>
        )}
        {changes.files.length === 0 && <p className="text-muted-foreground p-4 text-xs">{t('review.noChanges')}</p>}
        {changes.files.length > 0 && (
          <ul className="border-b px-4 py-2 text-xs">
            {changes.files.map((f) => (
              <li key={f.path} className="flex gap-2 py-0.5">
                <span className="text-muted-foreground w-12 shrink-0">{STATUS_LABEL[f.status] ? t(STATUS_LABEL[f.status]) : f.status}</span>
                <span className="selectable min-w-0 flex-1 truncate font-mono">{f.path}</span>
                <span className="text-emerald-400">+{f.additions}</span>
                <span className="text-rose-400">-{f.deletions}</span>
              </li>
            ))}
          </ul>
        )}
        {changes.diff && <div className="selectable py-2 font-mono text-[11px] leading-4">{changes.diff.split('\n').map((l, i) => <DiffLine key={i} line={l} />)}</div>}
      </div>
      {isHired && (
        <footer className="flex flex-col gap-2 border-t p-4">
          {changes.files.length > 0 && (
            <>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('review.commitMessage')} className="max-h-28 min-h-14 font-mono text-xs" />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleSuggest} disabled={isBusy}>
                  <SparklesIcon /> {t('review.suggest')}
                </Button>
                <Button size="sm" onClick={handleCommit} disabled={isBusy || !message.trim()}>
                  <GitCommitIcon /> {t('review.commit')}
                </Button>
              </div>
            </>
          )}
          {changes.files.length === 0 && changes.ahead > 0 && changes.hasGh && (
            <div className="flex gap-2">
              <Input value={prTitle} onChange={(e) => setPrTitle(e.target.value)} placeholder={t('review.prTitle')} className="h-8 text-xs" />
              <Button size="sm" onClick={handlePr} disabled={isBusy || !prTitle.trim()}>
                <GitPullRequestIcon /> {t('review.pushPr')}
              </Button>
            </div>
          )}
          {changes.ahead > 0 && !changes.hasGh && <p className="text-muted-foreground text-xs">{t('review.needGh')}</p>}
          {output && <pre className="bg-muted selectable max-h-24 overflow-auto rounded p-2 text-[11px] whitespace-pre-wrap">{output}</pre>}
        </footer>
      )}
      <Dialog open={isConfirming} onOpenChange={setIsConfirming}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('review.revert.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('review.revert.confirmBody', { n: revert?.files.length ?? 0 })}</DialogDescription>
          </DialogHeader>
          <ul className="selectable max-h-48 overflow-auto rounded border p-2 font-mono text-[11px]">
            {revert?.files.map((f) => (
              <li key={f.path} className="truncate">
                {f.status} {f.path}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirming(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRevert}>
              {t('review.revert.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
