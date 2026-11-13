import { useEffect, useReducer, useRef, useState } from 'react'
import { MonitorIcon, ShareIcon, SmartphoneIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { fmtDate, t } from '@shared/i18n'
import type { PeerView } from '@shared/peerProtocol'
import { canAddWorkspace, leastRecentlyUsed, nextFreeColor, WORKSPACE_COLORS, WORKSPACE_MAX, type WorkspaceColor, type WorkspaceView } from '@shared/workspace'
import { ClientPart } from './PairParts'
import { canFinish, canNext, initialWizard, WIZARD_STEPS, wizardReducer, type WizardState, type WizardWhat } from './wizard'
import { useConnectData } from '../connect/useConnectData'
import { HostConnect, isThisPcReady, ModePicker, PhoneConnect, TailscaleGuide, useConnectActions } from '../connect/ConnectParts'

// 기기 추가 창 4장: 무엇을 → 어디서 → 준비물 → 연결. 세 갈래(휴대폰 · 다른 PC 보기 · 이 PC 보여 주기)가 같은 장을 쓴다.
// 다른 PC 보기는 짝짓기(PairParts) 뒤 PC 목록에 이름·색을 더하고, 꽉 찼으면(3대) 먼저 해제할 PC를 고른다.
// 휴대폰·이 PC 보여 주기는 이 PC의 연결 방식·Tailscale·켜기를 거친다 (이미 켜져 준비됐으면 바로 연결 장)

export function WorkspaceWizard({ list, onClose, initialWhat }: { list: WorkspaceView[]; onClose: () => void; initialWhat?: WizardWhat }) {
  const [isFullPick, setIsFullPick] = useState(false)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">{isFullPick ? <FullPick list={list} onFreed={() => setIsFullPick(false)} onClose={onClose} /> : <WizardBody list={list} onClose={onClose} initialWhat={initialWhat} onFull={() => setIsFullPick(true)} />}</DialogContent>
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

/** 장 제목: 갈래마다 묻는 말이 다르다 */
function stepTitle(s: WizardState) {
  if (s.step === 'what') return t('workspace.wizard.what.title')
  if (s.step === 'where') return s.what === 'pc' ? t('workspace.wizard.where.title') : t('connect.step1')
  if (s.step === 'prep') return t('connect.step2')
  return t(s.what === 'phone' ? 'workspace.wizard.connect.phoneTitle' : s.what === 'host' ? 'workspace.wizard.connect.hostTitle' : 'workspace.wizard.connect.title')
}

function WizardBody({ list, onClose, initialWhat, onFull }: { list: WorkspaceView[]; onClose: () => void; initialWhat?: WizardWhat; onFull: () => void }) {
  const [s, dispatch] = useReducer(wizardReducer, nextFreeColor(list), (c) => (initialWhat ? wizardReducer(initialWizard(c), { type: 'pickWhat', what: initialWhat }) : initialWizard(c)))
  const [isBusy, setIsBusy] = useState(false)
  const { status, setStatus } = useConnectData({ isTsPolling: true })
  const actions = useConnectActions(status, setStatus)
  const stepNo = WIZARD_STEPS.indexOf(s.step) + 1
  const isReady = isThisPcReady(status)
  // 준비물 장: 보는 동안 Tailscale이 준비되면 저절로 다음 장으로 (휴대폰·이 PC 보여 주기). 처음부터 준비돼 있었으면 그대로 둔다(뒤로 오기 가능)
  const wasReady = useRef(isReady)
  useEffect(() => {
    if (s.step === 'prep' && s.what !== 'pc' && status?.mode === 'tailscale' && isReady && !wasReady.current) dispatch({ type: 'next', isThisPcReady: true })
    wasReady.current = isReady
  }, [s.step, s.what, status?.mode, isReady])

  const finish = async () => {
    if (!s.peerId) return
    setIsBusy(true)
    const r = await window.officeWorkspaces?.add?.({ peerId: s.peerId, name: s.name, color: s.color })
    setIsBusy(false)
    if (r?.ok) return onClose()
    dispatch({ type: 'fail', error: t(`workspace.error.${r?.code ?? 'unknown_peer'}`) })
  }
  const next = () => {
    if (s.step === 'what' && s.what === 'pc' && !canAddWorkspace(list)) return onFull()
    // 이미 켜져 준비가 끝난 PC는 휴대폰·이 PC 보여 주기에서 방식·준비물을 건너뛴다
    if (s.step === 'what' && s.what !== 'pc' && status?.isEnabled && status.isListening && isReady) return dispatch({ type: 'skipToConnect' })
    dispatch({ type: 'next', isThisPcReady: isReady })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('workspace.wizard.title')}</DialogTitle>
        <DialogDescription>
          {t('workspace.wizard.step', { n: stepNo, total: WIZARD_STEPS.length })} · {stepTitle(s)}
        </DialogDescription>
      </DialogHeader>
      <div className="flex min-h-48 flex-col gap-3 text-sm">
        {s.step === 'what' && <WhatStep what={s.what} onPick={(what) => dispatch({ type: 'pickWhat', what })} />}
        {s.step === 'where' &&
          (s.what === 'pc' ? (
            <div className="grid gap-2">
              {(['away', 'same'] as const).map((where) => (
                <ChoiceCard key={where} isOn={s.where === where} title={t(`workspace.wizard.where.${where}`)} desc={t(`workspace.wizard.where.${where}Desc`)} onClick={() => dispatch({ type: 'pickWhere', where })} />
              ))}
              <p className="text-muted-foreground text-xs">{t('workspace.wizard.where.unsure')}</p>
            </div>
          ) : (
            status && <ModePicker status={status} onPick={(m) => void actions.changeMode(m)} />
          ))}
        {s.step === 'prep' &&
          status &&
          (s.what !== 'pc' && status.mode === 'router' ? (
            <p className="text-muted-foreground">{t('connect.ready.routerDone', { port: status.port })}</p>
          ) : (
            <TailscaleGuide status={status} setStatus={setStatus} other={s.what === 'phone' ? 'phone' : s.what === 'host' ? 'viewer' : 'pc'} isTailscale={s.what === 'pc' ? s.where !== 'same' : status.mode === 'tailscale'} />
          ))}
        {s.step === 'connect' && s.what === 'pc' && <ConnectStep peerId={s.peerId} name={s.name} color={s.color} list={list} dispatch={dispatch} />}
        {s.step === 'connect' && s.what === 'phone' && status && <PhoneConnect status={status} setStatus={setStatus} isBusy={actions.isBusy} onTurnOn={() => void actions.turnOn()} />}
        {s.step === 'connect' && s.what === 'host' && status && <HostConnect status={status} setStatus={setStatus} isBusy={actions.isBusy} onTurnOn={() => void actions.turnOn()} />}
        {s.error && <p className="text-status-error text-xs">{s.error}</p>}
      </div>
      <DialogFooter>
        {stepNo > 1 && (
          <Button variant="outline" className="mr-auto" onClick={() => dispatch({ type: 'back' })}>
            {t('workspace.wizard.back')}
          </Button>
        )}
        {s.step !== 'connect' ? (
          <Button disabled={!canNext(s, isReady)} onClick={next}>
            {t('workspace.wizard.next')}
          </Button>
        ) : s.what === 'pc' ? (
          <Button disabled={!canFinish(s) || isBusy} onClick={() => void finish()}>
            {t('workspace.wizard.finish')}
          </Button>
        ) : (
          <Button onClick={onClose}>{t('workspace.wizard.done')}</Button>
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

/** 1장: 무엇을 연결할까요 */
function WhatStep({ what, onPick }: { what: WizardWhat | null; onPick: (w: WizardWhat) => void }) {
  return (
    <div className="grid gap-2">
      <ChoiceCard isOn={what === 'phone'} icon={<SmartphoneIcon />} title={t('workspace.wizard.what.phone')} desc={t('workspace.wizard.what.phoneDesc')} onClick={() => onPick('phone')} />
      <ChoiceCard isOn={what === 'pc'} icon={<MonitorIcon />} title={t('workspace.wizard.what.pc')} desc={t('workspace.wizard.what.pcDesc')} onClick={() => onPick('pc')} />
      <ChoiceCard isOn={what === 'host'} icon={<ShareIcon />} title={t('workspace.wizard.what.host')} desc={t('workspace.wizard.what.hostDesc')} onClick={() => onPick('host')} />
      <p className="text-muted-foreground text-xs">{t('workspace.wizard.what.note')}</p>
    </div>
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
