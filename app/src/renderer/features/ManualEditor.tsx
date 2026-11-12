import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MoreToggle } from '@/components/more-toggle'
import { IconText } from '@/components/duo-icon'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { IS_REMOTE_SCREEN } from '@/shell'
import { isDirty, manualProblems, stepHasExtras, type ManualField } from '@shared/manualForm'
import type { Manual, ManualInput, ManualKind, ProcessStep } from '@shared/types'
import { t, type TKey } from '@shared/i18n'
import { shortPath } from './status'

export const KIND_LABEL: Record<ManualKind, TKey> = { personal: 'manuals.kind.personal', process: 'manuals.kind.process' }
const DEFAULT_MAX_LOOPS = 2

export const newStep = (i: number): ProcessStep => ({ id: `s${Date.now().toString(36)}${i}`, title: '', role: '', instruction: '', needsMyCheck: false, onRevise: null, maxLoops: DEFAULT_MAX_LOOPS })
/** 빈 새 매뉴얼 양식 — 파일 이름은 저장할 때 자동으로 정한다 */
export const emptyInput = (kind: ManualKind, projectDir: string | null): ManualInput => ({
  name: '',
  autoName: true,
  title: '',
  description: '',
  kind,
  scope: projectDir ? 'project' : 'user',
  projectDir,
  body: '',
  steps: kind === 'process' ? [newStep(0)] : [],
})

const BAD = 'border-status-error focus-visible:border-status-error'

/** 매뉴얼 편집 창: 기본은 이름·언제 쓰나요·절차(또는 단계), 저장 위치·파일 이름·공통 안내는 '자세히 설정' 안에 */
export function ManualEditor({ initial, previousPath, projectDirs, onClose, onSaved }: { initial: ManualInput; previousPath?: string; projectDirs: string[]; onClose: () => void; onSaved: (saved: Manual) => void }) {
  const staff = useOffice(useShallow((s) => s.staff.filter((x) => x.kind === 'hired')))
  const [form, setForm] = useState<ManualInput>(initial)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  // 저장을 한 번 누른 뒤부터 이유를 보여 주고, 입력할 때마다 다시 계산한다
  const [showProblems, setShowProblems] = useState(false)
  const problems = useMemo(() => manualProblems(form), [form])
  const isNameLocked = !!previousPath
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const roles = useMemo(() => [...new Set(staff.map((s) => s.role))], [staff])
  const update = (patch: Partial<ManualInput>) => setForm((f) => ({ ...f, ...patch }))
  const updateStep = (i: number, patch: Partial<ProcessStep>) => setForm((f) => ({ ...f, steps: f.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }))
  const moveStep = (i: number, d: -1 | 1) => {
    const steps = [...form.steps]
    const j = i + d
    if (j < 0 || j >= steps.length) return
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
    update({ steps })
  }
  const bad = (field: ManualField) => showProblems && problems.some((p) => p.field === field)

  const handleClose = () => {
    if (isDirty(form, initial) && !window.confirm(t('manuals.editor.confirmClose'))) return
    onClose()
  }
  const handleSave = async () => {
    setError('')
    if (problems.length) {
      setShowProblems(true)
      // 파일 이름 문제는 접힌 칸 안에 있으니 펼친다
      if (problems.some((p) => p.field === 'name')) setIsMoreOpen(true)
      return
    }
    setIsSaving(true)
    try {
      onSaved(await window.office.saveManual(form, previousPath))
    } catch (e) {
      setError(String(e).replace(/^Error: (Error invoking remote method '[^']+': )?(Error: )?/, ''))
    }
    setIsSaving(false)
  }
  const handlePickFolder = async () => {
    const dir = await window.office.pickFolder()
    if (dir) update({ projectDir: dir, scope: 'project' })
  }

  const shown = problems.slice(0, 3).map((p) => t(p.key, p.vars)).join(' · ') + (problems.length > 3 ? ` ${t('manuals.problem.more', { n: problems.length - 3 })}` : '')

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {previousPath ? t('manuals.editor.editTitle') : t('manuals.editor.newTitle')} · {t(KIND_LABEL[form.kind])}
          </DialogTitle>
          <DialogDescription>{form.kind === 'process' ? t('manuals.editor.descProcess') : t('manuals.editor.descPersonal')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          <Label htmlFor="manual-title">{t('manuals.editor.titleLabel')}</Label>
          <Input id="manual-title" value={form.title ?? ''} onChange={(e) => update({ title: e.target.value })} placeholder={t('manuals.editor.titlePlaceholder')} aria-invalid={bad('title')} className={cn(bad('title') && BAD)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="manual-desc">{t('manuals.editor.descriptionLabel')}</Label>
          <Input id="manual-desc" value={form.description} onChange={(e) => update({ description: e.target.value })} placeholder={t('manuals.editor.descriptionPlaceholder')} aria-invalid={bad('description')} className={cn(bad('description') && BAD)} />
        </div>
        {form.kind === 'personal' && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="manual-body">{t('manuals.editor.bodyPersonal')}</Label>
            <Textarea id="manual-body" value={form.body} onChange={(e) => update({ body: e.target.value })} className={cn('min-h-28 text-xs', bad('body') && BAD)} placeholder={'1. …\n2. …'} aria-invalid={bad('body')} />
          </div>
        )}

        {form.kind === 'process' && (
          <div className="flex flex-col gap-2">
            <Label>{t('manuals.editor.steps')}</Label>
            <datalist id="manual-roles">
              {roles.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            {form.steps.map((step, i) => (
              <StepCard key={step.id} step={step} index={i} steps={form.steps} bad={bad} onChange={(patch) => updateStep(i, patch)} onMove={(d) => moveStep(i, d)} onRemove={() => update({ steps: form.steps.filter((_, idx) => idx !== i) })} />
            ))}
            <Button size="sm" variant="outline" className={cn('w-fit', bad('steps') && BAD)} onClick={() => update({ steps: [...form.steps, newStep(form.steps.length)] })}>
              <PlusIcon /> {t('manuals.editor.addStep')}
            </Button>
          </div>
        )}

        <MoreToggle open={isMoreOpen} onToggle={() => setIsMoreOpen((v) => !v)} hint={form.kind === 'process' ? t('manuals.editor.moreDesc') : t('manuals.editor.moreDescPersonal')} />
        {isMoreOpen && (
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label>{t('manuals.editor.location')}</Label>
                <div className="flex gap-2">
                  <NativeSelect
                    value={form.scope === 'user' ? '__user__' : (form.projectDir ?? '')}
                    onChange={(e) => (e.target.value === '__user__' ? update({ scope: 'user', projectDir: null }) : update({ scope: 'project', projectDir: e.target.value }))}
                    className="min-w-0 flex-1"
                  >
                    <option value="__user__" disabled={IS_REMOTE_SCREEN}>
                      {t('manuals.editor.locationUser')}
                    </option>
                    {[...new Set([...projectDirs, ...(form.projectDir ? [form.projectDir] : [])])].map((d) => (
                      <option key={d} value={d}>
                        {t('manuals.editor.locationProject', { path: shortPath(d) })}
                      </option>
                    ))}
                  </NativeSelect>
                  {!IS_REMOTE_SCREEN && (
                    <Button type="button" size="sm" variant="outline" onClick={() => void handlePickFolder()}>
                      {t('manuals.editor.pickFolder')}
                    </Button>
                  )}
                </div>
                {/* 휴대폰에서는 랩 폴더 매뉴얼만 (전역은 PC에서만) */}
                {IS_REMOTE_SCREEN && form.scope === 'user' && <p className="text-muted-foreground text-xs">{t('manuals.userPcOnly')}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="manual-name">{t('manuals.editor.nameLabel')}</Label>
                <Input
                  id="manual-name"
                  value={form.name}
                  readOnly={isNameLocked}
                  // 직접 고친 이름은 그대로 쓰고(겹치면 오류), 비우면 저장할 때 자동으로 정한다
                  onChange={(e) => {
                    const name = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
                    update({ name, autoName: !name })
                  }}
                  placeholder="weekly-report"
                  aria-invalid={bad('name')}
                  className={cn('font-mono', isNameLocked && 'bg-muted text-muted-foreground', bad('name') && BAD)}
                />
                <p className="text-muted-foreground text-xs">{isNameLocked ? t('manuals.editor.fileNameLocked') : t('manuals.editor.fileNameAuto')}</p>
              </div>
            </div>
            {form.kind === 'process' && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="manual-common">{t('manuals.editor.bodyProcess')}</Label>
                <Textarea id="manual-common" value={form.body} onChange={(e) => update({ body: e.target.value })} className="min-h-20 text-xs" />
              </div>
            )}
          </div>
        )}

        {showProblems && problems.length > 0 && (
          <p role="alert" className="text-status-error text-xs">
            {t('manuals.problem.header', { list: shown })}
          </p>
        )}
        {error && <p className="text-status-error text-xs">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaving}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 단계 카드: 이름·담당·지시는 늘 보이고, 내 확인·되돌리기는 접어 둔다 (켜져 있으면 처음부터 펼침) */
function StepCard({ step, index: i, steps, bad, onChange, onMove, onRemove }: { step: ProcessStep; index: number; steps: ProcessStep[]; bad: (f: ManualField) => boolean; onChange: (patch: Partial<ProcessStep>) => void; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  const [isOpen, setIsOpen] = useState(() => stepHasExtras(step))
  return (
    <div className="bg-card flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-5 text-xs font-semibold">{i + 1}</span>
        <Input value={step.title} onChange={(e) => onChange({ title: e.target.value })} placeholder={t('manuals.editor.stepTitlePlaceholder')} aria-invalid={bad(`step.${i}.title`)} className={cn('h-8 flex-1 text-xs', bad(`step.${i}.title`) && BAD)} />
        <Input value={step.role} onChange={(e) => onChange({ role: e.target.value })} list="manual-roles" placeholder={t('manuals.editor.stepRolePlaceholder')} aria-invalid={bad(`step.${i}.role`)} className={cn('h-8 w-44 text-xs', bad(`step.${i}.role`) && BAD)} />
        <Button size="icon" variant="ghost" className="size-7" onClick={() => onMove(-1)} aria-label={t('manuals.editor.moveUp')}>
          <ArrowUpIcon className="size-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => onMove(1)} aria-label={t('manuals.editor.moveDown')}>
          <ArrowDownIcon className="size-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="size-7" onClick={onRemove} aria-label={t('manuals.editor.removeStep')}>
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
      <Textarea value={step.instruction} onChange={(e) => onChange({ instruction: e.target.value })} placeholder={t('manuals.editor.instructionPlaceholder')} aria-invalid={bad(`step.${i}.instruction`)} className={cn('min-h-14 text-xs', bad(`step.${i}.instruction`) && BAD)} />
      <MoreToggle open={isOpen} onToggle={() => setIsOpen((v) => !v)} hint={i === 0 ? undefined : t('manuals.editor.stepMoreDesc')} size="xs" />
      {isOpen && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={step.needsMyCheck} onChange={(e) => onChange({ needsMyCheck: e.target.checked })} /> <IconText text={t('manuals.editor.needsMyCheck')} size={13} />
          </label>
          {/* 첫 단계는 되돌릴 앞 단계가 없다 */}
          {i > 0 && (
            <label className="flex items-center gap-1">
              {t('manuals.editor.onRevise')}
              <NativeSelect value={step.onRevise ?? ''} onChange={(e) => onChange({ onRevise: e.target.value || null })} className="h-7 text-xs">
                <option value="">{t('manuals.editor.noRevise')}</option>
                {steps.slice(0, i).map((s, j) => (
                  <option key={s.id} value={s.id}>
                    {t('manuals.editor.reviseTo', { n: j + 1, title: s.title || t('manuals.editor.untitled') })}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
          {i > 0 && step.onRevise && (
            <label className="flex items-center gap-1">
              {t('manuals.editor.maxLoopsBefore')}
              <Input type="number" min={1} max={5} value={step.maxLoops} onChange={(e) => onChange({ maxLoops: Number(e.target.value) || 1 })} className="h-7 w-14 text-xs" />
              {t('manuals.editor.maxLoopsAfter')}
            </label>
          )}
        </div>
      )}
    </div>
  )
}
