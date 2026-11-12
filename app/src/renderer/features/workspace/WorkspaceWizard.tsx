import { useEffect, useReducer, useState } from 'react'
import { MonitorIcon, MonitorSmartphoneIcon, ShareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { fmtDate, t } from '@shared/i18n'
import type { PeerView } from '@shared/peerProtocol'
import { canAddWorkspace, leastRecentlyUsed, nextFreeColor, WORKSPACE_COLORS, WORKSPACE_MAX, type WorkspaceColor, type WorkspaceView } from '@shared/workspace'
import { ClientPart, HostPart } from '../PeerSection'
import { requestSettingsSection } from '../SettingsPage'
import { SECTION_ID } from '../settingsSections'
import { canFinish, canNext, initialWizard, WIZARD_STEPS, wizardReducer } from './wizard'

// PC 추가 마법사 4장: 무엇을 → 어디서 → 준비물 → 연결 + 이름·색. 꽉 찼으면(3대) 먼저 해제할 PC를 고른다
// 짝짓기는 기존 것(PeerSection의 코드 입력·보여 주기)을 그대로 쓰고, 끝에서 목록에 이름·색만 더한다

export function WorkspaceWizard({ list, onClose }: { list: WorkspaceView[]; onClose: () => void }) {
  const [isFull, setIsFull] = useState(!canAddWorkspace(list))
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">{isFull ? <FullPick list={list} onFreed={() => setIsFull(false)} onClose={onClose} /> : <WizardBody list={list} onClose={onClose} />}</DialogContent>
    </Dialog>
  )
}

/** 꽉 참: 'PC 추가' 대신 해제할 PC 고르기 (가장 오래 안 쓴 PC 표시). 해제는 목록에서만 — 그 PC 사무실은 그대로 */
function FullPick({ list, onFreed, onClose }: { list: WorkspaceView[]; onFreed: () => void; onClose: () => void }) {
  const oldest = leastRecentlyUsed(list)
  const [picked, setPicked] = useState(oldest?.id ?? '')
  const free = async () => {
    if (picked && (await window.officeWorkspaces?.remove?.(picked))) onFreed()
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('workspace.full.title', { n: WORKSPACE_MAX })}</DialogTitle>
        <DialogDescription>{t('workspace.full.desc')}</DialogDescription>
      </DialogHeader>
      <ul className="flex flex-col gap-1.5 text-sm">
        {list.map((w) => (
          <li key={w.id}>
            <label className={cn('flex cursor-pointer items-center gap-2 rounded-lg border p-2', picked === w.id && 'border-primary')}>
              <input type="radio" name="ws-free" checked={picked === w.id} onChange={() => setPicked(w.id)} />
              <MonitorIcon className="size-4" style={{ color: `var(--ws-${w.color})` }} />
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              <span className="text-muted-foreground text-xs">
                {w.id === oldest?.id ? `${t('workspace.full.oldest')} · ` : ''}
                {t('workspace.lastUsed', { when: fmtDate(w.lastUsedAt, { month: 'short', day: 'numeric' }) })}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t('dialog.cancel')}
        </Button>
        <Button disabled={!picked} onClick={() => void free()}>
          {t('workspace.full.free')}
        </Button>
      </DialogFooter>
    </>
  )
}

function WizardBody({ list, onClose }: { list: WorkspaceView[]; onClose: () => void }) {
  const [s, dispatch] = useReducer(wizardReducer, nextFreeColor(list), initialWizard)
  const [isBusy, setIsBusy] = useState(false)
  const stepNo = WIZARD_STEPS.indexOf(s.step) + 1

  const finish = async () => {
    if (!s.peerId) return
    setIsBusy(true)
    const r = await window.officeWorkspaces?.add?.({ peerId: s.peerId, name: s.name, color: s.color })
    setIsBusy(false)
    if (r?.ok) return onClose()
    dispatch({ type: 'fail', error: t(`workspace.error.${r?.code ?? 'unknown_peer'}`) })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('workspace.wizard.title')}</DialogTitle>
        <DialogDescription>{t('workspace.wizard.step', { n: stepNo, total: WIZARD_STEPS.length })} · {t(`workspace.wizard.${s.step}.title`)}</DialogDescription>
      </DialogHeader>
      <div className="flex min-h-48 flex-col gap-3 text-sm">
        {s.step === 'what' && <WhatStep what={s.what} onPick={(what) => dispatch({ type: 'pickWhat', what })} onClose={onClose} />}
        {s.step === 'where' && (
          <div className="grid gap-2 sm:grid-cols-2">
            {(['same', 'away'] as const).map((where) => (
              <ChoiceCard key={where} isOn={s.where === where} title={t(`workspace.wizard.where.${where}`)} desc={t(`workspace.wizard.where.${where}Desc`)} onClick={() => dispatch({ type: 'pickWhere', where })} />
            ))}
          </div>
        )}
        {s.step === 'prep' && (
          <ol className="text-muted-foreground flex list-decimal flex-col gap-1.5 pl-5">
            <li>{t('workspace.wizard.prep.version')}</li>
            <li>{t('workspace.wizard.prep.remoteOn')}</li>
            {s.where === 'away' && <li>{t('workspace.wizard.prep.away')}</li>}
            <li>{t('workspace.wizard.prep.code')}</li>
          </ol>
        )}
        {s.step === 'connect' && <ConnectStep peerId={s.peerId} name={s.name} color={s.color} list={list} dispatch={dispatch} />}
        {s.error && <p className="text-status-error text-xs">{s.error}</p>}
      </div>
      <DialogFooter>
        {stepNo > 1 && (
          <Button variant="outline" className="mr-auto" onClick={() => dispatch({ type: 'back' })}>
            {t('workspace.wizard.back')}
          </Button>
        )}
        {s.step === 'connect' ? (
          <Button disabled={!canFinish(s) || isBusy} onClick={() => void finish()}>
            {t('workspace.wizard.finish')}
          </Button>
        ) : (
          (s.step !== 'what' || s.what === 'pc' || s.what === null) && (
            <Button disabled={!canNext(s)} onClick={() => dispatch({ type: 'next' })}>
              {t('workspace.wizard.next')}
            </Button>
          )
        )}
      </DialogFooter>
    </>
  )
}

function ChoiceCard({ isOn, icon, title, desc, onClick }: { isOn: boolean; icon?: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={isOn} className={cn('hover:bg-accent flex flex-col gap-1 rounded-lg border p-3 text-left', isOn && 'border-primary bg-accent')}>
      <span className="flex items-center gap-1.5 font-medium [&_svg]:size-4">
        {icon}
        {title}
      </span>
      <span className="text-muted-foreground text-xs">{desc}</span>
    </button>
  )
}

/** 1장: 무엇을. 휴대폰·이 PC 보여 주기는 이 장에서 기존 화면으로 이어 준다 */
function WhatStep({ what, onPick, onClose }: { what: 'pc' | 'phone' | 'host' | null; onPick: (w: 'pc' | 'phone' | 'host') => void; onClose: () => void }) {
  return (
    <>
      <div className="grid gap-2">
        <ChoiceCard isOn={what === 'pc'} icon={<MonitorIcon />} title={t('workspace.wizard.what.pc')} desc={t('workspace.wizard.what.pcDesc')} onClick={() => onPick('pc')} />
        <ChoiceCard isOn={what === 'phone'} icon={<MonitorSmartphoneIcon />} title={t('workspace.wizard.what.phone')} desc={t('workspace.wizard.what.phoneDesc')} onClick={() => onPick('phone')} />
        <ChoiceCard isOn={what === 'host'} icon={<ShareIcon />} title={t('workspace.wizard.what.host')} desc={t('workspace.wizard.what.hostDesc')} onClick={() => onPick('host')} />
      </div>
      {what === 'phone' && (
        <Button
          variant="outline"
          className="w-fit"
          onClick={() => {
            onClose()
            useOffice.getState().setView('settings')
            requestSettingsSection(SECTION_ID.remote)
          }}
        >
          {t('workspace.wizard.what.phoneGo')}
        </Button>
      )}
      {what === 'host' && (
        <div className="rounded-lg border p-3">
          <HostPart onSlotsChanged={() => {}} />
        </div>
      )}
    </>
  )
}

/** 4장: 이미 짝지은 PC에서 고르거나 코드로 새로 짝짓고, 이름·색을 정한다 */
function ConnectStep({ peerId, name, color, list, dispatch }: { peerId: string | null; name: string; color: WorkspaceColor; list: WorkspaceView[]; dispatch: React.Dispatch<Parameters<typeof wizardReducer>[1]> }) {
  const [peers, setPeers] = useState<PeerView[]>([])
  useEffect(() => void window.office.peerList().then(setPeers), [])
  const taken = new Set(list.map((w) => w.peerId))
  const choices = peers.filter((p) => !taken.has(p.id) && p.state !== 'unpaired')
  const pick = (p: PeerView) => dispatch({ type: 'paired', peerId: p.id, name: p.name })
  const handleConnected = async (id: string) => {
    const fresh = await window.office.peerList()
    setPeers(fresh)
    const p = fresh.find((x) => x.id === id)
    if (p) pick(p)
  }
  if (peerId) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-status-working text-xs">{t('workspace.wizard.connect.paired')}</p>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">{t('workspace.field.name')}</span>
          <Input value={name} onChange={(e) => dispatch({ type: 'setName', name: e.target.value })} className="max-w-xs" />
        </label>
        <ColorPicker value={color} onChange={(c) => dispatch({ type: 'setColor', color: c })} />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {choices.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">{t('workspace.wizard.connect.existing')}</span>
          <div className="flex flex-wrap gap-1.5">
            {choices.map((p) => (
              <Button key={p.id} size="sm" variant="outline" onClick={() => pick(p)}>
                <MonitorIcon /> {p.name}
              </Button>
            ))}
          </div>
        </div>
      )}
      <ClientPart onConnected={(id) => void handleConnected(id)} />
    </div>
  )
}

export function ColorPicker({ value, onChange }: { value: WorkspaceColor; onChange: (c: WorkspaceColor) => void }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs font-medium">{t('workspace.field.color')}</legend>
      <div className="flex gap-2">
        {WORKSPACE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={value === c}
            aria-label={t(`workspace.color.${c}`)}
            title={t(`workspace.color.${c}`)}
            onClick={() => onChange(c)}
            className={cn('size-7 rounded-full border-2 border-transparent', value === c && 'ring-ring ring-2 ring-offset-2 ring-offset-[var(--background)]')}
            style={{ background: `var(--ws-${c})` }}
          />
        ))}
      </div>
    </fieldset>
  )
}
