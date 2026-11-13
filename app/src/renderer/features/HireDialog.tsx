import { useEffect, useState, type FormEvent } from 'react'
import { FileUpIcon, FolderOpenIcon, StoreIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { MoreToggle } from '@/components/more-toggle'
import { encodeLook, randomLook, roleLook, type Look } from '@shared/look'
import { AvatarEditor } from './AvatarEditor'
import { useShallow } from 'zustand/react/shallow'
import { useOffice, useWorkMode } from '@/store'
import { NativeSelect } from '@/components/ui/select'
import { hireDefaults } from '@shared/tokenSaving'
import { newStaffApprovalMode, ROLE_PRESETS, type AgentTemplate, type ApprovalMode, type HireInput, type ModelChoice } from '@shared/types'
import { PROVIDER_NAME, PROVIDERS, useProviders } from './ProviderCards'
import { engineReason, isBothReady, ProviderPicker } from './ProviderPicker'
import { defaultProvider } from '@shared/engineModel'
import { shortPath } from './status'
import { StaffMarketDialog } from './StaffMarketDialog'
import { ModelCards } from './ModelCards'
import { showToast } from '@/lib/toast'
import { t, type TKey } from '@shared/i18n'
import { roleLabel } from '@shared/roleLabel'
import { HIRE_LAST_STEP, hireStepValid, roleInfo, type HireStep } from '@shared/staffCard'
import { PcOnlyState } from '@/components/pc-only-state'
import { IS_REMOTE_SCREEN } from '@/shell'
import { DuoIcon } from '@/components/duo-icon'

// 화면 문구가 들어 있어 렌더할 때 만든다 (언어 바뀜 반영)
const approvalModes = (): {
  value: ApprovalMode
  label: string
  hint: string
}[] => [
  {
    value: 'ask',
    label: t('hire.approval.ask'),
    hint: t('hire.approval.ask.hint'),
  },
  {
    value: 'acceptEdits',
    label: t('hire.approval.acceptEdits'),
    hint: t('hire.approval.acceptEdits.hint'),
  },
]

const STEP_TITLE: Record<HireStep, TKey> = {
  0: 'hire.step.role',
  1: 'hire.step.who',
  2: 'hire.step.where',
}

const emptyForm = (): HireInput => ({
  name: '',
  role: ROLE_PRESETS[0],
  avatar: 0,
  provider: 'claude',
  model: 'default',
  cwd: '',
  systemPrompt: '',
  approvalMode: newStaffApprovalMode(IS_REMOTE_SCREEN),
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
          className={cn('focus-ring rounded-md px-3 py-1 text-xs font-medium', value === o.value ? 'bg-background shadow-sm' : 'text-muted-foreground')}
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
  const isSaverOn = useOffice((s) => s.settings.tokenSaverMode)
  const [form, setForm] = useState<HireInput>(emptyForm)
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [isCustomRole, setIsCustomRole] = useState(false)
  // 직무 고르기 → 이름·얼굴 → 일할 곳. 나머지(팀·랩·AI·성능 등급·결재 방식·지침)는 3단계의 '자세히 설정'에 접는다
  const [step, setStep] = useState<HireStep>(0)
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  // 생김새를 직접 고치거나 🎲를 누르기 전까지는 무작위 바탕에 고른 직무의 기본 옷·소품을 입힌다
  const [baseLook, setBaseLook] = useState<Look>(() => randomLook())
  const [isLookEdited, setIsLookEdited] = useState(false)
  const avatar = isLookEdited ? form.avatar : encodeLook({ ...baseLook, ...roleLook(form.role) })
  // 직원 마켓은 어디서나(원격 v2로도), 파일 가져오기는 파일 대화상자가 있는 PC 앱에서만 (모바일 빌드에는 officePack이 없다)
  const canImportFile = typeof window.officePack !== 'undefined'
  const isMarketOpen = useOffice((s) => s.isMarketOpen)
  const setMarketOpen = useOffice((s) => s.setMarketOpen)
  const providers = useProviders(isOpen)
  const provider = form.provider ?? 'claude'
  const isCodex = provider === 'codex'
  const codex = providers.status?.codex
  // 고른 공급자가 준비 안 됐으면 고용하지 않는다 (상태를 아직 모르면 지금처럼 Claude로 고용)
  const isProviderReady = providers.status ? providers.status[provider].state === 'ready' : provider === 'claude'
  const notReady = PROVIDERS.filter((p) => providers.status && providers.status[p].state !== 'ready')

  useEffect(() => {
    if (isOpen) {
      // 첫 실행 마법사에서 고른 기본 작업 폴더로 시작한다
      const { settings } = useOffice.getState()
      const provider = defaultProvider(providers.status)
      // 토큰 절약 모드면 Haiku + 기억 짧게로 시작한다 (Codex는 기억만)
      setForm({
        ...emptyForm(),
        provider,
        ...hireDefaults(settings.tokenSaverMode, provider),
        cwd: settings.defaultCwd,
      })
      setIsCustomRole(false)
      setStep(0)
      setIsMoreOpen(false)
      setTemplates([])
      setBaseLook(randomLook())
      setIsLookEdited(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 열 때 한 번만 (상태가 나중에 오면 아래에서 맞춘다)
  }, [isOpen])

  // 창을 연 뒤 상태가 도착했는데 고른 공급자가 준비 안 됐으면 준비된 쪽으로
  useEffect(() => {
    const s = providers.status
    if (!isOpen || !s || s[form.provider ?? 'claude'].state === 'ready') return
    const next = defaultProvider(s)
    if (s[next].state === 'ready')
      setForm((f) => ({
        ...f,
        provider: next,
        model: 'default',
        ...hireDefaults(useOffice.getState().settings.tokenSaverMode, next),
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, providers.status])

  useEffect(() => {
    if (form.cwd) void window.office.listAgentTemplates(form.cwd).then(setTemplates)
  }, [form.cwd])

  const update = (patch: Partial<HireInput>) => setForm((f) => ({ ...f, ...patch }))
  const isStepValid = hireStepValid(step, form, isProviderReady)
  const isLastStep = step === HIRE_LAST_STEP

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
    // 에이전트 정의의 모델은 Claude 별칭이라 Codex 직원에게는 옮기지 않는다
    update({
      role: tpl.name,
      systemPrompt: tpl.prompt,
      ...(isCodex ? {} : { model: tpl.model }),
    })
  }
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isStepValid) return
    // 앞 단계에서 Enter·'다음'은 다음 단계로
    if (!isLastStep) {
      setStep((step + 1) as HireStep)
      return
    }
    const staff = await window.office.hire({
      ...form,
      avatar,
      name: form.name.trim(),
      role: form.role.trim(),
    })
    setHireOpen(false)
    select(staff.id)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setHireOpen}>
      <DialogContent className="max-w-xl">
        <StaffMarketDialog
          open={isMarketOpen}
          onOpenChange={setMarketOpen}
          onHired={(id) => {
            setHireOpen(false)
            select(id)
          }}
        />
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle className="flex items-baseline gap-2">
              {t('hire.title')}
              <span className="text-muted-foreground text-xs font-normal tabular-nums">{t('hire.stepCount', { n: step + 1 })}</span>
            </DialogTitle>
            <DialogDescription>{t('hire.desc')}</DialogDescription>
          </DialogHeader>

          <h3 className="-mb-2 text-sm font-semibold">{t(STEP_TITLE[step])}</h3>

          {/* ① 직무 고르기 — 카드마다 무슨 일을 하는 사람인지 한 줄 */}
          {step === 0 && (
            <>
              <div className="grid max-h-[46vh] gap-2 overflow-y-auto sm:grid-cols-2">
                {ROLE_PRESETS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={!isCustomRole && form.role === r}
                    onClick={() => {
                      setIsCustomRole(false)
                      update({ role: r })
                    }}
                    className={cn('focus-ring hover:bg-accent/50 flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left', !isCustomRole && form.role === r && 'border-primary bg-accent')}
                  >
                    <span className="text-sm font-semibold">{roleLabel(r)}</span>
                    <span className="text-muted-foreground text-xs leading-snug">{t(roleInfo(r).descKey)}</span>
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={isCustomRole}
                  onClick={() => {
                    setIsCustomRole(true)
                    update({ role: '' })
                  }}
                  className={cn('focus-ring hover:bg-accent/50 rounded-lg border border-dashed px-3 py-2 text-left text-sm font-semibold', isCustomRole && 'border-primary bg-accent')}
                >
                  {t('hire.role.custom')}
                </button>
              </div>
              {isCustomRole && <Input value={form.role} maxLength={40} onChange={(e) => update({ role: e.target.value })} placeholder={t('hire.role.placeholder')} autoFocus />}

              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setMarketOpen(true)}>
                    <StoreIcon /> {t('pack.hire.market')}
                  </Button>
                  {canImportFile && (
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleImport()}>
                      <FileUpIcon /> {t('pack.hire.import')}
                    </Button>
                  )}
                </div>
                {canImportFile && <span className="text-muted-foreground text-xs">{t('pack.hire.hint')}</span>}
              </div>
            </>
          )}

          {/* ② 이름·얼굴 */}
          {step === 1 && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="hire-name">{t('hire.name')}</Label>
                <Input id="hire-name" value={form.name} onChange={(e) => update({ name: e.target.value })} placeholder={t('hire.name.placeholder')} autoFocus />
              </div>
              {/* 업무 모드에선 아바타가 이니셜 원이라 고르지 않는다 (직무 소품을 얹은 무작위 모습으로 추가) */}
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
            </>
          )}

          {/* ③ 일할 곳 + 자세히 설정 */}
          {step === 2 && (
            <>
              <div className="flex flex-col gap-2">
                {/* 휴대폰에서 추가하면 작업 폴더는 기본 폴더로 정해진다 (PC가 다시 채운다) — 고르는 버튼 대신 안내 */}
                {IS_REMOTE_SCREEN ? (
                  <>
                    <span className="text-muted-foreground truncate text-xs">{form.cwd ? shortPath(form.cwd) : t('hire.where.any')}</span>
                    <PcOnlyState />
                  </>
                ) : (
                  <>
                    <Segmented
                      options={[
                        { value: 'any', label: t('hire.where.any') },
                        { value: 'folder', label: t('hire.where.folder') },
                      ]}
                      value={form.cwd ? 'folder' : 'any'}
                      onChange={(v) => (v === 'any' ? update({ cwd: '' }) : void handlePickFolder())}
                    />
                    {form.cwd ? (
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs" title={form.cwd}>
                          {shortPath(form.cwd)}
                        </span>
                        <Button type="button" variant="outline" size="sm" onClick={handlePickFolder}>
                          <FolderOpenIcon /> {t('hire.folder.pick')}
                        </Button>
                      </div>
                    ) : null}
                    <span className="text-muted-foreground text-xs">{form.cwd ? t('hire.where.folderHint') : t('hire.where.anyHint')}</span>
                  </>
                )}
              </div>

              {/* 직원 상태를 아직 모르거나 고른 AI가 준비 안 됐으면 이유가 보이게 접지 않는다 */}
              {!isProviderReady && (
                <div className="flex flex-col gap-2">
                  <Label>{t('hire.provider')}</Label>
                  <ProviderPicker
                    status={providers.status}
                    value={provider}
                    onChange={(p) =>
                      p !== provider &&
                      update({
                        provider: p,
                        model: 'default',
                        ...hireDefaults(isSaverOn, p),
                      })
                    }
                    role={isBothReady(providers.status) ? form.role : undefined}
                  />
                  {isBothReady(providers.status) && engineReason(form.role) && <span className="text-muted-foreground text-xs">{engineReason(form.role)}</span>}
                  <span className="text-muted-foreground text-xs">
                    {providers.isChecking && !providers.status
                      ? t('hire.provider.checking')
                      : [
                          t('hire.provider.locked'),
                          ...notReady.map((p) =>
                            t('hire.provider.notReady', {
                              name: PROVIDER_NAME[p],
                            }),
                          ),
                        ].join(' ')}
                  </span>
                </div>
              )}

              <MoreToggle open={isMoreOpen} onToggle={() => setIsMoreOpen((v) => !v)} hint={t('guideHint.hire.moreDesc')} />

              {isMoreOpen && (
                <>
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
                              onClick={() =>
                                update({
                                  labIds: isOn ? form.labIds?.filter((x) => x !== l.id) : [...(form.labIds ?? []), l.id],
                                })
                              }
                              className={cn('rounded-md border px-2 py-1 text-xs', isOn && 'border-primary bg-accent')}
                            >
                              <DuoIcon name="lab" size={13} className="mr-1" />
                              {l.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

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

                  {isProviderReady && (
                    <div className="flex flex-col gap-2">
                      <Label>{t('hire.provider')}</Label>
                      <ProviderPicker
                        status={providers.status}
                        value={provider}
                        onChange={(p) =>
                          p !== provider &&
                          update({
                            provider: p,
                            model: 'default',
                            ...hireDefaults(isSaverOn, p),
                          })
                        }
                        role={isBothReady(providers.status) ? form.role : undefined}
                      />
                      {isBothReady(providers.status) && engineReason(form.role) && <span className="text-muted-foreground text-xs">{engineReason(form.role)}</span>}
                      <span className="text-muted-foreground text-xs">
                        {providers.isChecking && !providers.status
                          ? t('hire.provider.checking')
                          : [
                              t('hire.provider.locked'),
                              ...notReady.map((p) =>
                                t('hire.provider.notReady', {
                                  name: PROVIDER_NAME[p],
                                }),
                              ),
                            ].join(' ')}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label>{t('hire.model')}</Label>
                      {isCodex ? (
                        <NativeSelect value={form.model} onChange={(e) => update({ model: e.target.value as ModelChoice })} className="w-48">
                          <option value="default">
                            {codex?.defaultModel
                              ? t('hire.model.codexDefault', {
                                  model: codex.defaultModel,
                                })
                              : t('hire.model.default')}
                          </option>
                          {(codex?.models ?? []).map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </NativeSelect>
                      ) : (
                        <ModelCards value={form.model} onChange={(model) => update({ model })} />
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>{t('hire.approval')}</Label>
                      {/* 휴대폰에서 채용하면 늘 '매번 묻기' (파일 수정 자동 승인은 PC에서만) */}
                      {IS_REMOTE_SCREEN ? (
                        <>
                          <span className="text-xs">{t('hire.approval.ask')}</span>
                          <PcOnlyState />
                        </>
                      ) : (
                        <>
                          <Segmented options={approvalModes()} value={form.approvalMode} onChange={(approvalMode) => update({ approvalMode })} />
                          <span className="text-muted-foreground text-xs">{approvalModes().find((m) => m.value === form.approvalMode)?.hint}</span>
                        </>
                      )}
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
                </>
              )}
            </>
          )}

          <DialogFooter>
            {step === 0 ? (
              <Button type="button" variant="ghost" onClick={() => setHireOpen(false)}>
                {t('common.cancel')}
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setStep((step - 1) as HireStep)}>
                {t('hire.back')}
              </Button>
            )}
            <Button type="submit" disabled={!isStepValid}>
              {isLastStep ? t('hire.submit') : t('hire.next')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
