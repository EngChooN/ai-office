import { useEffect, useState, type FormEvent } from 'react'
import { FileUpIcon, FolderOpenIcon, StoreIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { encodeLook, randomLook, roleLook, type Look } from '@shared/look'
import { AvatarEditor } from './AvatarEditor'
import { useShallow } from 'zustand/react/shallow'
import { useOffice, useWorkMode } from '@/store'
import { NativeSelect } from '@/components/ui/select'
import { ROLE_PRESETS, type AgentTemplate, type ApprovalMode, type HireInput, type ModelChoice } from '@shared/types'
import { shortPath } from './status'
import { StaffMarketDialog } from './StaffMarketDialog'
import { showToast } from '@/lib/toast'
import { t } from '@shared/i18n'

// 화면 문구가 들어 있어 렌더할 때 만든다 (언어 바뀜 반영)
const models = (): { value: ModelChoice; label: string }[] => [
  { value: 'default', label: t('hire.model.default') },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
]
const approvalModes = (): { value: ApprovalMode; label: string; hint: string }[] => [
  { value: 'ask', label: t('hire.approval.ask'), hint: t('hire.approval.ask.hint') },
  { value: 'acceptEdits', label: t('hire.approval.acceptEdits'), hint: t('hire.approval.acceptEdits.hint') },
]

const emptyForm = (): HireInput => ({
  name: '',
  role: ROLE_PRESETS[0],
  avatar: 0,
  model: 'default',
  cwd: '',
  systemPrompt: '',
  approvalMode: 'ask',
  teamId: null,
  labIds: [],
})

function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="bg-muted flex w-fit rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn('rounded-md px-3 py-1 text-xs font-medium', value === o.value ? 'bg-background shadow-sm' : 'text-muted-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function HireDialog() {
  const isOpen = useOffice((s) => s.hireOpen)
  const setHireOpen = useOffice((s) => s.setHireOpen)
  const select = useOffice((s) => s.select)
  const teams = useOffice(useShallow((s) => s.teams.filter((team) => team.kind === 'hired' && !team.isPractice)))
  const labs = useOffice((s) => s.labs)
  const isWorkMode = useWorkMode()
  const [form, setForm] = useState<HireInput>(emptyForm)
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [isCustomRole, setIsCustomRole] = useState(false)
  // 생김새를 직접 고치거나 🎲를 누르기 전까지는 무작위 바탕에 고른 직무의 기본 옷·소품을 입힌다
  const [baseLook, setBaseLook] = useState<Look>(() => randomLook())
  const [isLookEdited, setIsLookEdited] = useState(false)
  const avatar = isLookEdited ? form.avatar : encodeLook({ ...baseLook, ...roleLook(form.role) })
  // 직원 마켓·파일 가져오기는 PC 앱에서만 (모바일 빌드에는 없다)
  const hasPack = typeof window.officePack !== 'undefined'
  const isMarketOpen = useOffice((s) => s.isMarketOpen)
  const setMarketOpen = useOffice((s) => s.setMarketOpen)

  useEffect(() => {
    if (isOpen) {
      // 첫 실행 마법사에서 고른 기본 작업 폴더로 시작한다
      setForm({ ...emptyForm(), cwd: useOffice.getState().settings.defaultCwd })
      setIsCustomRole(false)
      setTemplates([])
      setBaseLook(randomLook())
      setIsLookEdited(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (form.cwd) void window.office.listAgentTemplates(form.cwd).then(setTemplates)
  }, [form.cwd])

  const update = (patch: Partial<HireInput>) => setForm((f) => ({ ...f, ...patch }))
  const isValid = form.name.trim() && form.role.trim()

  const handlePickFolder = async () => {
    const dir = await window.office.pickFolder()
    if (dir) update({ cwd: dir })
  }
  const handleImport = async () => {
    const pack = window.officePack
    if (!pack) return
    try {
      const r = await pack.importFile()
      if (!r) return // 파일 고르기를 취소했다
      if (r.ok) showToast(r.message)
      else window.alert(r.message)
      if (r.ok) {
        setHireOpen(false)
        if (r.staffIds[0]) select(r.staffIds[0])
      }
    } catch {
      window.alert(t('pack.err.hire'))
    }
  }
  const handleTemplate = (tpl: AgentTemplate) => {
    setIsCustomRole(true)
    update({ role: tpl.name, model: tpl.model, systemPrompt: tpl.prompt })
  }
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isValid) return
    const staff = await window.office.hire({ ...form, avatar, name: form.name.trim(), role: form.role.trim() })
    setHireOpen(false)
    select(staff.id)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setHireOpen}>
      <DialogContent className="max-w-xl">
        <StaffMarketDialog open={isMarketOpen} onOpenChange={setMarketOpen} onHired={(id) => {
          setHireOpen(false)
          select(id)
        }} />
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t('hire.title')}</DialogTitle>
            <DialogDescription>{t('hire.desc')}</DialogDescription>
          </DialogHeader>

          {hasPack && (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setMarketOpen(true)}>
                  <StoreIcon /> {t('pack.hire.market')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void handleImport()}>
                  <FileUpIcon /> {t('pack.hire.import')}
                </Button>
              </div>
              <span className="text-muted-foreground text-xs">{t('pack.hire.hint')}</span>
            </div>
          )}

          {/* 업무 모드에선 아바타가 이니셜 원이라 고르지 않는다 (직무 소품을 얹은 무작위 모습으로 고용) */}
          {!isWorkMode && (
            <div className="flex flex-col gap-2">
              <Label>{t('hire.look')}</Label>
              <AvatarEditor
                value={avatar}
                onChange={(next) => {
                  update({ avatar: next })
                  setIsLookEdited(true)
                }}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="hire-name">{t('hire.name')}</Label>
            <Input id="hire-name" value={form.name} onChange={(e) => update({ name: e.target.value })} placeholder={t('hire.name.placeholder')} autoFocus />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('hire.team')}</Label>
            <NativeSelect value={form.teamId ?? ''} onChange={(e) => update({ teamId: e.target.value || null })} className="w-48">
              <option value="">{t('hire.team.none')}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </NativeSelect>
            <span className="text-muted-foreground text-xs">{t('hire.team.leadHint')}</span>
          </div>

          {labs.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>{t('hire.labs')}</Label>
              <div className="flex flex-wrap gap-2">
                {labs.map((l) => {
                  const isOn = form.labIds?.includes(l.id) ?? false
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => update({ labIds: isOn ? form.labIds?.filter((x) => x !== l.id) : [...(form.labIds ?? []), l.id] })}
                      className={cn('rounded-md border px-2 py-1 text-xs', isOn && 'border-primary bg-accent')}
                    >
                      🧪 {l.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>{t('hire.folder')}</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handlePickFolder}>
                <FolderOpenIcon /> {t('hire.folder.pick')}
              </Button>
              <span className="text-muted-foreground truncate text-xs">{form.cwd ? shortPath(form.cwd) : t('hire.folder.none')}</span>
            </div>
          </div>

          {templates.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>{t('hire.templates')}</Label>
              <div className="flex flex-wrap gap-2">
                {templates.map((tpl) => (
                  <button
                    key={`${tpl.source}-${tpl.name}`}
                    type="button"
                    onClick={() => handleTemplate(tpl)}
                    title={tpl.description}
                    className={cn('rounded-md border px-2 py-1 text-xs', form.role === tpl.name && 'border-primary bg-accent')}
                  >
                    {tpl.name} <span className="text-muted-foreground">· {tpl.source}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>{t('hire.role')}</Label>
            <div className="flex flex-wrap gap-2">
              {ROLE_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setIsCustomRole(false)
                    update({ role: r })
                  }}
                  className={cn('rounded-md border px-2 py-1 text-xs', !isCustomRole && form.role === r && 'border-primary bg-accent')}
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setIsCustomRole(true)
                  update({ role: '' })
                }}
                className={cn('rounded-md border px-2 py-1 text-xs', isCustomRole && 'border-primary bg-accent')}
              >
                {t('hire.role.custom')}
              </button>
            </div>
            {isCustomRole && <Input value={form.role} onChange={(e) => update({ role: e.target.value })} placeholder={t('hire.role.placeholder')} />}
          </div>

          <div className="flex gap-6">
            <div className="flex flex-col gap-2">
              <Label>{t('hire.model')}</Label>
              <Segmented options={models()} value={form.model} onChange={(model) => update({ model })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t('hire.approval')}</Label>
              <Segmented options={approvalModes()} value={form.approvalMode} onChange={(approvalMode) => update({ approvalMode })} />
              <span className="text-muted-foreground text-xs">{approvalModes().find((m) => m.value === form.approvalMode)?.hint}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="hire-prompt">{t('hire.prompt')}</Label>
            <Textarea
              id="hire-prompt"
              value={form.systemPrompt}
              onChange={(e) => update({ systemPrompt: e.target.value })}
              placeholder={t('hire.prompt.placeholder')}
              className="max-h-48 min-h-20"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setHireOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!isValid}>
              {t('hire.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
