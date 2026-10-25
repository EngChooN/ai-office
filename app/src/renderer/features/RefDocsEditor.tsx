import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangleIcon, ChevronRightIcon, FilePlusIcon, FileTextIcon, SparklesIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { osText } from '@/lib/platform'
import type { RefDocTarget } from '@shared/types'
import { REF_DOC_REJECT_LABEL, REF_DOCS_PER_TARGET, splitRefDocPath, suggestRefDocs } from '@shared/refDocs'
import { shortPath } from './status'
import { t } from '@shared/i18n'

/** 목록·추천 후보 중 없는 파일 (스냅샷마다 새 배열이 와도 경로가 같으면 다시 묻지 않는다) */
function useMissingFiles(paths: string[]) {
  const [missing, setMissing] = useState<string[]>([])
  const key = paths.join('\n')
  useEffect(() => {
    let isCurrent = true
    void window.office.missingFiles(key ? key.split('\n') : []).then((m) => isCurrent && setMissing(m))
    return () => {
      isCurrent = false
    }
  }, [key])
  return missing
}

/**
 * 참고 문서 등록: 파일 선택·경로 입력으로 추가하고 항목별로 뺀다. 저장은 setRefDocs 하나로만 (검사·상한은 main이 최종 판단)
 * 팀·랩 카드에서는 접힌 요약 줄로 시작하고(isCollapsible), 랩은 프로젝트 폴더의 CLAUDE.md 등을 "추천 추가"로 넣는다(suggestFrom)
 */
export function RefDocsEditor({ target, docs, audience, isCollapsible = false, suggestFrom = null }: { target: RefDocTarget; docs: string[]; audience: string; isCollapsible?: boolean; suggestFrom?: string | null }) {
  const [isOpen, setIsOpen] = useState(!isCollapsible)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  // 추천 후보 경로도 shared 경로 규칙으로 만든다 (윈도우 폴더면 \로 잇는다)
  const candidates = suggestRefDocs(suggestFrom, [], () => true)
  const missing = useMissingFiles([...docs, ...candidates])
  const suggestions = suggestRefDocs(suggestFrom, docs, (p) => !missing.includes(p))
  const missingCount = docs.filter((d) => missing.includes(d)).length
  const isFull = docs.length >= REF_DOCS_PER_TARGET

  const save = async (next: string[]) => {
    const r = await window.office.setRefDocs(target, next)
    setError(r.rejected.map((x) => `${x.input.trim() || t('refDocs.emptyValue')}: ${REF_DOC_REJECT_LABEL[x.reason]}`).join('\n'))
    return r.rejected.length === 0
  }
  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    if (draft.trim() && (await save([...docs, draft]))) setDraft('')
  }
  const handlePick = async () => {
    const picked = await window.office.pickFiles()
    if (picked.length) await save([...docs, ...picked])
  }

  const summary = (
    <button type="button" onClick={() => setIsOpen((v) => !v)} aria-expanded={isOpen} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs">
      <ChevronRightIcon className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} />
      <FileTextIcon className="size-3.5" />
      {docs.length ? t('refDocs.count', { n: docs.length, max: REF_DOCS_PER_TARGET }) : t('refDocs.noneAdd')}
      {missingCount > 0 && (
        <span className="text-status-waiting flex items-center gap-1">
          <AlertTriangleIcon className="size-3.5" /> {t('refDocs.missingCount', { n: missingCount })}
        </span>
      )}
      {suggestions.length > 0 && !isFull && <span className="text-primary">· {t('refDocs.suggestCount', { n: suggestions.length })}</span>}
    </button>
  )

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex items-center gap-2">
        {isCollapsible ? summary : <span className="text-muted-foreground">{t('refDocs.title')}</span>}
        {isOpen && !isCollapsible && <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">{docs.length}/{REF_DOCS_PER_TARGET}</span>}
      </div>
      {isOpen && (
        <>
          {docs.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {docs.map((doc) => {
                const { name, dir } = splitRefDocPath(doc)
                const isMissing = missing.includes(doc)
                return (
                  <li
                    key={doc}
                    className={cn('flex items-start gap-2 px-2 py-1.5', isMissing && 'bg-status-waiting/10')}
                    title={isMissing ? t('refDocs.missingTitle') : doc}
                  >
                    {isMissing ? <AlertTriangleIcon className="text-status-waiting mt-0.5 size-3.5 shrink-0" /> : <FileTextIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{name}</span>
                        {isMissing && <span className="text-status-waiting shrink-0 text-[11px] font-medium">{t('refDocs.missing')}</span>}
                      </span>
                      <span className="selectable text-muted-foreground truncate font-mono text-[11px]">{shortPath(dir)}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => void save(docs.filter((d) => d !== doc))} aria-label={t('refDocs.remove', { name })}>
                      <XIcon className="size-3.5" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          {missingCount > 0 && <span className="text-status-waiting text-[11px]">{t('refDocs.missingNote', { n: missingCount })}</span>}
          {suggestions.length > 0 && !isFull && (
            <Button size="sm" variant="outline" className="h-7 w-fit text-xs" onClick={() => void save([...docs, ...suggestions.slice(0, REF_DOCS_PER_TARGET - docs.length)])}>
              <SparklesIcon /> {t('refDocs.addSuggested')} · {suggestions.slice(0, REF_DOCS_PER_TARGET - docs.length).map((p) => splitRefDocPath(p).name).join(', ')}
            </Button>
          )}
          <form onSubmit={handleAdd} className="flex gap-1.5">
            <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => void handlePick()} disabled={isFull}>
              <FilePlusIcon /> {t('refDocs.pickFile')}
            </Button>
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={osText(t('refDocs.pathPlaceholderMac'), t('refDocs.pathPlaceholderWin'))} className="h-7 min-w-0 flex-1 text-xs" disabled={isFull} />
            <Button type="submit" size="sm" className="h-7 shrink-0 text-xs" disabled={!draft.trim() || isFull}>
              {t('refDocs.add')}
            </Button>
          </form>
          {isFull && <span className="text-muted-foreground text-[11px]">{t('refDocs.full', { max: REF_DOCS_PER_TARGET })}</span>}
          {error && <span className="text-status-error text-[11px] whitespace-pre-line">{error}</span>}
          <span className="text-muted-foreground text-[11px]">{t('refDocs.hint', { audience })}</span>
        </>
      )}
    </div>
  )
}
