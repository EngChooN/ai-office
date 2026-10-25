import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ArrowDownIcon, ArrowUpIcon, BookOpenIcon, GraduationCapIcon, PencilIcon, PlusIcon, SparklesIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Page } from '@/components/ui/page'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import type { Manual, ManualInput, ManualKind, ProcessStep } from '@shared/types'
import { t, type TKey } from '@shared/i18n'
import { Avatar } from './StaffCard'
import { shortPath } from './status'

const NAME_RE = /^[a-z0-9][a-z0-9-]{1,62}$/
const KIND_LABEL: Record<ManualKind, TKey> = { personal: 'manuals.kind.personal', process: 'manuals.kind.process' }
const DEFAULT_MAX_LOOPS = 2

const newStep = (i: number): ProcessStep => ({ id: `s${Date.now().toString(36)}${i}`, title: '', role: '', instruction: '', needsMyCheck: false, onRevise: null, maxLoops: DEFAULT_MAX_LOOPS })
const emptyInput = (kind: ManualKind, projectDir: string | null): ManualInput => ({
  name: '',
  description: '',
  kind,
  scope: projectDir ? 'project' : 'user',
  projectDir,
  body: '',
  steps: kind === 'process' ? [newStep(0)] : [],
})

/** 매뉴얼실: 업무 매뉴얼(스킬)을 만들고·고치고·교육한다 */
export function ManualsPage() {
  const manuals = useOffice((s) => s.manuals)
  const refresh = useOffice((s) => s.refreshManuals)
  const staff = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const labs = useOffice((s) => s.labs)
  const teams = useOffice(useShallow((s) => s.teams.filter((tm) => tm.kind === 'hired')))
  const [editing, setEditing] = useState<{ input: ManualInput; previousPath?: string } | null>(null)
  const [training, setTraining] = useState<Manual | null>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const projectDirs = useMemo(() => [...new Set([...staff.map((s) => s.cwd), ...labs.flatMap((l) => (l.cwd ? [l.cwd] : []))])], [staff, labs])
  const trainedCount = (m: Manual) =>
    m.kind === 'personal'
      ? staff.filter((s) => s.equipment.skills === 'all' || s.equipment.skills.includes(m.name)).length
      : labs.filter((l) => l.manuals?.includes(m.name)).length + teams.filter((tm) => tm.manuals?.includes(m.name)).length

  const handleDelete = async (m: Manual) => {
    if (!window.confirm(t('manuals.confirmDelete', { name: m.name, path: shortPath(m.path) }))) return
    await window.office.deleteManual(m.path)
    void refresh()
  }

  return (
    <Page
      title={t('manuals.title')}
      description={t('manuals.description')}
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing({ input: emptyInput('personal', projectDirs[0] ?? null) })}>
            <PlusIcon /> {t('manuals.kind.personal')}
          </Button>
          <Button size="sm" onClick={() => setEditing({ input: emptyInput('process', projectDirs[0] ?? null) })}>
            <PlusIcon /> {t('manuals.kind.process')}
          </Button>
        </div>
      }
    >
      {(['process', 'personal'] as const).map((kind) => (
        <section key={kind} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">{kind === 'process' ? t('manuals.section.process') : t('manuals.section.personal')}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {manuals.filter((m) => m.kind === kind).length === 0 && <p className="text-muted-foreground text-sm">{t('manuals.empty')}</p>}
            {manuals
              .filter((m) => m.kind === kind)
              .map((m) => (
                <div key={m.path} className="bg-card flex flex-col gap-2 rounded-xl border p-4">
                  <div className="flex items-center gap-2">
                    <BookOpenIcon className="text-primary size-4" />
                    <span className="flex-1 truncate font-mono text-sm font-semibold">{m.name}</span>
                    <span className="text-muted-foreground rounded border px-1.5 text-[10px]">{m.scope === 'user' ? t('manuals.scopeUser') : shortPath(m.projectDir ?? '')}</span>
                  </div>
                  <p className="text-muted-foreground line-clamp-3 text-xs">{m.description || t('manuals.noDescription')}</p>
                  {kind === 'process' && <p className="text-muted-foreground text-xs">{m.steps.map((s) => s.title).join(' → ') || t('manuals.noSteps')}</p>}
                  <div className="mt-auto flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => setTraining(m)}>
                      <GraduationCapIcon /> {t('manuals.trainCount', { count: trainedCount(m) })}
                    </Button>
                    <Button size="icon" variant="ghost" className="ml-auto size-8" onClick={() => setEditing({ input: { ...m }, previousPath: m.path })} aria-label={t('manuals.edit')}>
                      <PencilIcon className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => void handleDelete(m)} aria-label={t('manuals.delete')}>
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ))}
      {editing && <ManualEditor initial={editing.input} previousPath={editing.previousPath} projectDirs={projectDirs} onClose={() => (setEditing(null), void refresh())} />}
      {training && <TrainDialog manual={training} onClose={() => setTraining(null)} />}
    </Page>
  )
}

function ManualEditor({ initial, previousPath, projectDirs, onClose }: { initial: ManualInput; previousPath?: string; projectDirs: string[]; onClose: () => void }) {
  const staff = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const [form, setForm] = useState<ManualInput>(initial)
  const [error, setError] = useState('')
  const [drafter, setDrafter] = useState(staff[0]?.id ?? '')
  const [request, setRequest] = useState('')
  const [isDrafting, setIsDrafting] = useState(false)
  const roles = useMemo(() => [...new Set(staff.map((s) => s.role))], [staff])
  const update = (patch: Partial<ManualInput>) => setForm((f) => ({ ...f, ...patch }))
  const updateStep = (i: number, patch: Partial<ProcessStep>) => update({ steps: form.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })
  const moveStep = (i: number, d: -1 | 1) => {
    const steps = [...form.steps]
    const j = i + d
    if (j < 0 || j >= steps.length) return
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
    update({ steps })
  }
  const isValid = NAME_RE.test(form.name) && form.description.trim() && (form.kind === 'personal' ? form.body.trim() : form.steps.length > 0 && form.steps.every((s) => s.title && s.role && s.instruction))

  const handleDraft = async () => {
    if (!drafter || !request.trim()) return
    setIsDrafting(true)
    setError('')
    try {
      const d = await window.office.draftManual(drafter, request.trim(), form.kind)
      update({ ...d, steps: d.steps.map((s, i) => ({ ...newStep(i), ...s })) })
    } catch (e) {
      setError(t('manuals.editor.draftFailed', { error: String(e) }))
    }
    setIsDrafting(false)
  }
  const handleSave = async () => {
    setError('')
    try {
      await window.office.saveManual(form, previousPath)
      onClose()
    } catch (e) {
      setError(String(e).replace(/^Error: (Error invoking remote method '[^']+': )?(Error: )?/, ''))
    }
  }
  const handlePickFolder = async () => {
    const dir = await window.office.pickFolder()
    if (dir) update({ projectDir: dir, scope: 'project' })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {previousPath ? t('manuals.editor.editTitle') : t('manuals.editor.newTitle')} · {t(KIND_LABEL[form.kind])}
          </DialogTitle>
          <DialogDescription>{form.kind === 'process' ? t('manuals.editor.descProcess') : t('manuals.editor.descPersonal')}</DialogDescription>
        </DialogHeader>

        {staff.length > 0 && (
          <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
            <Label className="text-xs">{t('manuals.editor.draftLabel')}</Label>
            <div className="flex gap-2">
              <NativeSelect value={drafter} onChange={(e) => setDrafter(e.target.value)} className="h-8 w-36 text-xs">
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
              <Input value={request} onChange={(e) => setRequest(e.target.value)} placeholder={form.kind === 'process' ? t('manuals.editor.draftPlaceholderProcess') : t('manuals.editor.draftPlaceholderPersonal')} className="h-8 text-xs" />
              <Button size="sm" onClick={() => void handleDraft()} disabled={isDrafting || !request.trim()}>
                <SparklesIcon /> {isDrafting ? t('manuals.editor.drafting') : t('manuals.editor.draft')}
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label>{t('manuals.editor.nameLabel')}</Label>
            <Input value={form.name} onChange={(e) => update({ name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="bug-report" className="font-mono" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>{t('manuals.editor.location')}</Label>
            <div className="flex gap-2">
              <NativeSelect
                value={form.scope === 'user' ? '__user__' : (form.projectDir ?? '')}
                onChange={(e) => (e.target.value === '__user__' ? update({ scope: 'user', projectDir: null }) : update({ scope: 'project', projectDir: e.target.value }))}
                className="min-w-0 flex-1"
              >
                <option value="__user__">{t('manuals.editor.locationUser')}</option>
                {[...new Set([...projectDirs, ...(form.projectDir ? [form.projectDir] : [])])].map((d) => (
                  <option key={d} value={d}>
                    {t('manuals.editor.locationProject', { path: shortPath(d) })}
                  </option>
                ))}
              </NativeSelect>
              <Button type="button" size="sm" variant="outline" onClick={() => void handlePickFolder()}>
                {t('manuals.editor.pickFolder')}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label>{t('manuals.editor.descriptionLabel')}</Label>
          <Input value={form.description} onChange={(e) => update({ description: e.target.value })} placeholder={t('manuals.editor.descriptionPlaceholder')} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>{form.kind === 'process' ? t('manuals.editor.bodyProcess') : t('manuals.editor.bodyPersonal')}</Label>
          <Textarea value={form.body} onChange={(e) => update({ body: e.target.value })} className="min-h-28 font-mono text-xs" placeholder={'1. …\n2. …'} />
        </div>

        {form.kind === 'process' && (
          <div className="flex flex-col gap-2">
            <Label>{t('manuals.editor.steps')}</Label>
            <datalist id="manual-roles">
              {roles.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            {form.steps.map((step, i) => (
              <div key={step.id} className="bg-card flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-5 text-xs font-semibold">{i + 1}</span>
                  <Input value={step.title} onChange={(e) => updateStep(i, { title: e.target.value })} placeholder={t('manuals.editor.stepTitlePlaceholder')} className="h-8 flex-1 text-xs" />
                  <Input value={step.role} onChange={(e) => updateStep(i, { role: e.target.value })} list="manual-roles" placeholder={t('manuals.editor.stepRolePlaceholder')} className="h-8 w-40 text-xs" />
                  <Button size="icon" variant="ghost" className="size-7" onClick={() => moveStep(i, -1)} aria-label={t('manuals.editor.moveUp')}>
                    <ArrowUpIcon className="size-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7" onClick={() => moveStep(i, 1)} aria-label={t('manuals.editor.moveDown')}>
                    <ArrowDownIcon className="size-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7" onClick={() => update({ steps: form.steps.filter((_, idx) => idx !== i) })} aria-label={t('manuals.editor.removeStep')}>
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
                <Textarea value={step.instruction} onChange={(e) => updateStep(i, { instruction: e.target.value })} placeholder={t('manuals.editor.instructionPlaceholder')} className="min-h-14 text-xs" />
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={step.needsMyCheck} onChange={(e) => updateStep(i, { needsMyCheck: e.target.checked })} /> {t('manuals.editor.needsMyCheck')}
                  </label>
                  <label className="flex items-center gap-1">
                    {t('manuals.editor.onRevise')}
                    <NativeSelect value={step.onRevise ?? ''} onChange={(e) => updateStep(i, { onRevise: e.target.value || null })} className="h-7 text-xs">
                      <option value="">{t('manuals.editor.noRevise')}</option>
                      {form.steps.slice(0, i).map((s, j) => (
                        <option key={s.id} value={s.id}>
                          {t('manuals.editor.reviseTo', { n: j + 1, title: s.title || t('manuals.editor.untitled') })}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                  {step.onRevise && (
                    <label className="flex items-center gap-1">
                      {t('manuals.editor.maxLoopsBefore')}
                      <Input type="number" min={1} max={5} value={step.maxLoops} onChange={(e) => updateStep(i, { maxLoops: Number(e.target.value) || 1 })} className="h-7 w-14 text-xs" />
                      {t('manuals.editor.maxLoopsAfter')}
                    </label>
                  )}
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-fit" onClick={() => update({ steps: [...form.steps, newStep(form.steps.length)] })}>
              <PlusIcon /> {t('manuals.editor.addStep')}
            </Button>
          </div>
        )}

        {error && <p className="text-status-error text-xs">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={!isValid}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 교육: 개인 매뉴얼은 직원에게, 프로세스 매뉴얼은 랩·팀에 */
function TrainDialog({ manual, onClose }: { manual: Manual; onClose: () => void }) {
  const staff = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const labs = useOffice((s) => s.labs)
  const teams = useOffice(useShallow((s) => s.teams.filter((tm) => tm.kind === 'hired')))
  const [staffIds, setStaffIds] = useState(() => staff.filter((s) => s.equipment.skills === 'all' || s.equipment.skills.includes(manual.name)).map((s) => s.id))
  const [labIds, setLabIds] = useState(() => labs.filter((l) => l.manuals?.includes(manual.name)).map((l) => l.id))
  const [teamIds, setTeamIds] = useState(() => teams.filter((tm) => tm.manuals?.includes(manual.name)).map((tm) => tm.id))
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const handleSave = async () => {
    if (manual.kind === 'personal') await window.office.trainStaff(manual.name, staffIds)
    else await window.office.trainGroups(manual.name, labIds, teamIds)
    onClose()
  }
  const chip = (isOn: boolean) => cn('flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-1 text-xs', isOn && 'border-primary bg-accent')

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('manuals.train.title', { name: manual.name })}</DialogTitle>
          <DialogDescription>{manual.kind === 'personal' ? t('manuals.train.descPersonal') : t('manuals.train.descProcess')}</DialogDescription>
        </DialogHeader>
        {manual.kind === 'personal' ? (
          <div className="flex flex-wrap gap-2">
            {staff.map((s) => (
              <button key={s.id} type="button" onClick={() => toggle(staffIds, setStaffIds, s.id)} className={chip(staffIds.includes(s.id))}>
                <Avatar avatar={s.avatar} name={s.name} teamId={s.teamId} className="size-5" /> {s.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {labs.map((l) => (
                <button key={l.id} type="button" onClick={() => toggle(labIds, setLabIds, l.id)} className={chip(labIds.includes(l.id))}>
                  🧪 {l.name}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {teams.map((tm) => (
                <button key={tm.id} type="button" onClick={() => toggle(teamIds, setTeamIds, tm.id)} className={chip(teamIds.includes(tm.id))}>
                  <span className="size-2 rounded-full" style={{ background: tm.color }} /> {tm.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleSave()}>{t('manuals.train.submit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
