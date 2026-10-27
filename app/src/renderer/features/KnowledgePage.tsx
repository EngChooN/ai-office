import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileTextIcon, LibraryIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Page } from '@/components/ui/page'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { KNOWLEDGE_BODY_MAX, KNOWLEDGE_KINDS, KNOWLEDGE_TITLE_MAX, knowledgeKindLabel, terms, type KnowledgeEntry, type KnowledgeInput, type KnowledgeKind } from '@shared/knowledge'
import { fmtDate, t } from '@shared/i18n'
import { shortPath } from './status'

const KIND_TONE: Record<KnowledgeKind, string> = {
  learning: 'border-status-working/50 text-status-working',
  feedback: 'border-status-waiting/60 text-status-waiting',
  decision: 'border-primary/50 text-primary',
}

const emptyInput = (): KnowledgeInput => ({ kind: 'learning', title: '', body: '', tags: [], docPath: null })

/** 처리 함수 오류에서 사람이 읽을 부분만 */
const errorText = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : '')

/** 지식 창고 목록 — 화면을 열 때와 고친 뒤에 다시 받는다 (직원이 남긴 것은 다시 열면 보인다) */
function useKnowledge() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const refresh = useCallback(async () => setEntries(await window.office.knowledgeList()), [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  return { entries, refresh }
}

/** 연결할 수 있는 참고 문서: 직원·팀·랩에 이미 등록한 문서 */
function useRegisteredDocs() {
  const staff = useOffice((s) => s.staff)
  const teams = useOffice((s) => s.teams)
  const labs = useOffice((s) => s.labs)
  return useMemo(() => [...new Set([...staff, ...teams, ...labs].flatMap((x) => x.refDocs ?? []))], [staff, teams, labs])
}

/** 회사 지식 창고: 직원이 배운 점 · 대표 피드백 · 결정. 일을 시작할 때 관련 있는 몇 개만 짧게 붙는다 */
export function KnowledgePage() {
  const { entries, refresh } = useKnowledge()
  const [kind, setKind] = useState<KnowledgeKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<KnowledgeInput | null>(null)

  const shown = useMemo(() => {
    const q = [...terms(query)]
    return entries.filter((e) => (kind === 'all' || e.kind === kind) && (q.length === 0 || q.every((w) => terms(`${e.title} ${e.body} ${e.tags.join(' ')}`).has(w))))
  }, [entries, kind, query])

  const handleDelete = async (e: KnowledgeEntry) => {
    if (!window.confirm(t('knowledge.confirmDelete', { title: e.title }))) return
    await window.office.deleteKnowledge(e.id)
    void refresh()
  }

  return (
    <Page
      title={t('knowledge.title')}
      description={t('knowledge.description')}
      actions={
        <Button size="sm" onClick={() => setEditing(emptyInput())}>
          <PlusIcon /> {t('knowledge.add')}
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="bg-muted flex w-fit rounded-lg p-0.5">
          {(['all', ...KNOWLEDGE_KINDS] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cn('rounded-md px-3 py-1 text-xs font-medium', kind === k ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
              {k === 'all' ? t('knowledge.kind.all') : knowledgeKindLabel(k)}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-56">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('knowledge.search')} aria-label={t('knowledge.search')} className="h-8 pl-7 text-xs" />
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-start gap-2 rounded-xl border border-dashed p-6 text-sm">
          <LibraryIcon className="size-5" />
          {entries.length === 0 ? t('knowledge.empty') : t('knowledge.noMatch')}
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {shown.map((e) => (
            <KnowledgeCard key={e.id} entry={e} onEdit={() => setEditing({ id: e.id, kind: e.kind, title: e.title, body: e.body, tags: e.tags, docPath: e.docPath })} onDelete={() => void handleDelete(e)} />
          ))}
        </ul>
      )}
      {editing && <KnowledgeEditor initial={editing} onClose={() => (setEditing(null), void refresh())} />}
    </Page>
  )
}

function KnowledgeCard({ entry: e, onEdit, onDelete }: { entry: KnowledgeEntry; onEdit: () => void; onDelete: () => void }) {
  return (
    <li className="bg-card flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn('shrink-0', KIND_TONE[e.kind])}>
          {knowledgeKindLabel(e.kind)}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={e.title}>
          {e.title}
        </span>
      </div>
      <p className="text-muted-foreground line-clamp-4 text-xs whitespace-pre-wrap">{e.body}</p>
      {e.tags.length > 0 && <p className="text-muted-foreground text-[11px]">{e.tags.map((g) => `#${g}`).join(' ')}</p>}
      {e.docPath && (
        <p className="text-muted-foreground flex min-w-0 items-center gap-1 text-[11px]" title={e.docPath}>
          <FileTextIcon className="size-3 shrink-0" />
          <span className="truncate">{shortPath(e.docPath)}</span>
        </p>
      )}
      <div className="mt-auto flex items-center gap-1">
        <span className="text-muted-foreground text-[11px]">
          {e.staffName || t('knowledge.byMe')} · {fmtDate(e.updatedAt, { month: 'numeric', day: 'numeric' })}
        </span>
        <Button size="icon" variant="ghost" className="ml-auto size-8" onClick={onEdit} aria-label={t('knowledge.edit')}>
          <PencilIcon className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" className="size-8" onClick={onDelete} aria-label={t('knowledge.delete')}>
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </li>
  )
}

function KnowledgeEditor({ initial, onClose }: { initial: KnowledgeInput; onClose: () => void }) {
  const docs = useRegisteredDocs()
  const [form, setForm] = useState(initial)
  const [tagText, setTagText] = useState((initial.tags ?? []).join(', '))
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const update = (patch: Partial<KnowledgeInput>) => setForm((f) => ({ ...f, ...patch }))
  const isValid = form.title.trim() !== '' && form.body.trim() !== ''

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await window.office.saveKnowledge({ ...form, tags: tagText.split(/[,，、\s]+/).filter(Boolean), docPath: form.docPath?.trim() || null })
      onClose()
    } catch (e) {
      setError(errorText(e) || t('knowledge.error.save'))
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial.id ? t('knowledge.edit') : t('knowledge.add')}</DialogTitle>
          <DialogDescription>{t('knowledge.editor.desc')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{t('knowledge.editor.kind')}</Label>
            <NativeSelect value={form.kind} onChange={(e) => update({ kind: e.target.value as KnowledgeKind })} className="w-40">
              {KNOWLEDGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {knowledgeKindLabel(k)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('knowledge.editor.title')}</Label>
            <Input value={form.title} maxLength={KNOWLEDGE_TITLE_MAX} onChange={(e) => update({ title: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('knowledge.editor.body')}</Label>
            <Textarea value={form.body} maxLength={KNOWLEDGE_BODY_MAX} rows={5} onChange={(e) => update({ body: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('knowledge.editor.tags')}</Label>
            <Input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder={t('knowledge.editor.tagsHint')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('knowledge.editor.doc')}</Label>
            <Input value={form.docPath ?? ''} onChange={(e) => update({ docPath: e.target.value })} list="knowledge-ref-docs" placeholder={t('knowledge.editor.docHint')} />
            <datalist id="knowledge-ref-docs">
              {docs.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
          {error && (
            <p role="alert" className="text-status-error text-xs">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!isValid || isSaving} onClick={() => void handleSave()}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
