import { useState } from 'react'
import { Loader2Icon, MonitorIcon, SmartphoneIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PcOnlyState } from '@/components/pc-only-state'
import { IS_REMOTE_SCREEN } from '@/shell'
import { t } from '@shared/i18n'
import { ipcErrorText } from '@shared/ipcError'
import type { RemoteStatus } from '@shared/types'
import { devicesOf, seenAgo, type ConnectDevice } from '@shared/connectModel'
import { Banner, RecentAccess, RemoteGuide, timeText, upnpText } from '../RemoteSection'
import { canAddWorkspace, canOpenWindow, cleanWorkspaceName, nextFreeColor, WORKSPACE_MAX, type WorkspaceView } from '@shared/workspace'
import { ColorPicker, WorkspaceWizard } from '../workspace/WorkspaceWizard'
import { MODES, ModePicker, useConnectActions } from './ConnectParts'
import { useConnectData } from './useConnectData'

// 설정 › 연결 › 다른 기기 연결 (카드 하나): 문제 알림 띠 → 연결 켜짐/꺼짐 한 줄 → 연결된 기기 목록 → [＋ 기기 추가] → 고급 설정 → 휴대폰 모두 끊기.
// 휴대폰·다른 PC 보기·이 PC 보여 주기는 모두 기기 추가 창(WorkspaceWizard)에서 ①어디 → ②준비물(Tailscale 안내·링크) → ③연결로 한다.
// 1.3.2: '휴대폰·PC 연결'·'연결한 PC' 두 카드를 합쳤다 (같은 PC는 목록에 한 줄). 휴대폰 열쇠는 하나 — 새 휴대폰을 연결하면 지금 휴대폰이 끊긴다

const ON_TEXT = { lan: 'connect.on.lan', tailscale: 'connect.on.tailscale', router: 'connect.on.router' } as const

export function ConnectSection() {
  const data = useConnectData({ isTsPolling: false })
  const { status, setStatus } = data
  const actions = useConnectActions(status, setStatus)
  // 포트가 이미 쓰일 때 바로 번호를 바꾸도록 공유기 안내 창의 포트 단계(1)를 연다
  const [isPortGuideOpen, setIsPortGuideOpen] = useState(false)
  const [portGuideStep, setPortGuideStep] = useState(1)
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  if (!status) return null

  // 휴대폰에서 PC 설정을 볼 때: 상태 한 줄만 (바꾸기는 PC에서)
  if (IS_REMOTE_SCREEN)
    return (
      <>
        <StatusLine status={status} />
        <PcOnlyState />
      </>
    )

  const devices = devicesOf({ status, slots: data.slots, peers: data.peers, workspaces: data.workspaces, now: data.now })
  const handleTurnOff = async () => {
    if (!window.confirm(t('connect.offConfirm'))) return
    setStatus(await window.office.setRemoteEnabled(false))
  }
  const handleDisconnectPhones = async () => {
    if (!window.confirm(t('connect.dropAll.confirm'))) return
    setStatus(await window.office.regenerateRemoteQr())
  }
  const handleTsNotice = async (isSwitch: boolean) => {
    if (isSwitch) await actions.changeMode('tailscale')
    setStatus(await window.office.dismissRemoteTsNotice())
  }
  const openPortGuide = () => {
    setPortGuideStep(1)
    setIsPortGuideOpen(true)
  }

  return (
    <>
      {status.isTsNoticePending && status.mode !== 'tailscale' && (
        <Banner tone="ok">
          <p>{t('remote.ts.notice')}</p>
          <div className="mt-1.5 flex gap-2">
            <Button size="sm" onClick={() => void handleTsNotice(true)}>
              {t('remote.ts.notice.switch')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleTsNotice(false)}>
              {t('remote.ts.notice.keep')}
            </Button>
          </div>
        </Banner>
      )}
      <Problems status={status} isModeChanged={actions.isModeChanged} onChangePort={openPortGuide} />
      <RemoteGuide status={status} setStatus={setStatus} isOpen={isPortGuideOpen} onOpenChange={setIsPortGuideOpen} step={portGuideStep} setStep={setPortGuideStep} />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusLine status={status} />
        <span className="flex-1" />
        {status.isEnabled ? (
          <Button size="sm" variant="outline" onClick={() => void handleTurnOff()}>
            {t('connect.off')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={actions.isBusy} onClick={() => (status.mode === 'router' ? openPortGuide() : void actions.turnOn())}>
            {actions.isBusy && <Loader2Icon className="animate-spin" />} {t('connect.turnOnShort')}
          </Button>
        )}
      </div>
      {status.isEnabled && <p className="text-muted-foreground -mt-2 text-xs">{t('connect.on.hint')}</p>}
      {devices.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2.5 rounded-lg border border-dashed p-4 text-center text-xs">
          {t('connect.devices.none')}
          <Button onClick={() => setIsWizardOpen(true)}>{t('connect.addDevice')}</Button>
        </div>
      ) : (
        <>
          <DeviceList devices={devices} workspaces={data.workspaces} now={data.now} onSlotsChanged={data.loadSlots} onPeersChanged={data.loadPeers} />
          <Button size="sm" className="w-fit" onClick={() => setIsWizardOpen(true)}>
            {t('connect.addDevice')}
          </Button>
        </>
      )}
      <Advanced status={status} setStatus={setStatus} onMode={(m) => void actions.changeMode(m)} />
      {status.isTokenUsed && (
        <details className="border-destructive/40 rounded-lg border p-2.5 text-xs">
          <summary className="text-status-error cursor-pointer font-medium">
            {t('connect.dropAll.title')} <span className="text-muted-foreground font-normal">· {t('connect.dropAll.summary')}</span>
          </summary>
          <p className="text-muted-foreground mt-2">{t('connect.dropAll.desc')}</p>
          <Button size="sm" variant="destructive" className="mt-2" onClick={() => void handleDisconnectPhones()}>
            {t('connect.dropAll.button')}
          </Button>
        </details>
      )}
      {isWizardOpen && (
        <WorkspaceWizard
          list={data.workspaces}
          onClose={() => {
            setIsWizardOpen(false)
            data.loadPeers()
            data.loadSlots()
          }}
        />
      )}
    </>
  )
}

/** '연결 켜짐 · 밖에서도 쓸 수 있어요' / '연결 꺼짐 · …' / 켰는데 안 열림 */
function StatusLine({ status }: { status: RemoteStatus }) {
  if (!status.isEnabled)
    return (
      <p className="text-sm">
        <span className="text-muted-foreground font-medium">● {t('connect.offLine')}</span> <span className="text-muted-foreground text-xs">· {t('connect.offLineDesc')}</span>
      </p>
    )
  if (!status.isListening)
    return (
      <p className="text-sm">
        <span className="text-status-error font-medium">● {t('remote.notOpen')}</span>
      </p>
    )
  return (
    <p className="text-sm">
      <span className="text-status-working font-medium">● {t('connect.onLine')}</span> <span className="text-muted-foreground text-xs">· {t(ON_TEXT[status.mode])}</span>
    </p>
  )
}

/** 켜기 실패·잠금·열쇠 재발급·방식 바꿈 알림 */
function Problems({ status, isModeChanged, onChangePort }: { status: RemoteStatus; isModeChanged: boolean; onChangePort: () => void }) {
  return (
    <>
      {isModeChanged && <Banner tone="warning">{t('remote.mode.changed')}</Banner>}
      {status.error === 'port_in_use' && (
        <Banner tone="error">
          <p>{t('remote.error.portInUse', { port: status.port })}</p>
          <Button size="sm" variant="outline" className="mt-1.5" onClick={onChangePort}>
            {t('connect.changePort')}
          </Button>
        </Banner>
      )}
      {status.error === 'start_failed' && <Banner tone="error">{t('remote.error.startFailed')}</Banner>}
      {status.error === 'no_network' && <Banner tone="warning">{status.mode === 'tailscale' ? t('remote.ts.error.waiting') : t('remote.error.noNetwork')}</Banner>}
      {status.isKeyRegenerated && <Banner tone="warning">{t('remote.keyRegenerated')}</Banner>}
      {status.lockedUntil && <Banner tone="warning">{t('remote.locked', { time: timeText(status.lockedUntil) })}</Banner>}
    </>
  )
}

/** 연결된 기기 N대 — 휴대폰 · 이 PC가 보는 PC(짝 + PC 목록 항목을 한 줄로) · 이 PC를 보는 PC. 둘째 줄은 상태 하나만 */
function DeviceList({ devices, workspaces, now, onSlotsChanged, onPeersChanged }: { devices: ConnectDevice[]; workspaces: WorkspaceView[]; now: number; onSlotsChanged: () => void; onPeersChanged: () => void }) {
  const [editId, setEditId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const seenText = (isOnline: boolean, at: number | null) => {
    if (isOnline) return <span className="text-status-working">{t('connect.seen.online')}</span>
    const s = seenAgo(at, now)
    return <span className="text-muted-foreground">{t(s.key, { n: s.n ?? 0, month: s.month ?? 0, day: s.day ?? 0 })}</span>
  }
  const revoke = async (d: Extract<ConnectDevice, { kind: 'to' }>) => {
    if (!window.confirm(t('connect.revokeConfirm', { name: d.name }))) return
    setError(null)
    setBusyId(d.id)
    try {
      await window.office.peerRevokeSlot(d.id)
    } catch (e) {
      setError(ipcErrorText(e, t('peer.error.failed')))
    } finally {
      setBusyId(null)
    }
    onSlotsChanged()
  }
  // 해제는 한 가지 뜻: 짝을 끊고(저쪽에도 알림) PC 목록에서도 뺀다. 짝이 이미 없으면 목록에서만
  const disconnect = async (d: Extract<ConnectDevice, { kind: 'pc' }>) => {
    if (!window.confirm(t('connect.unpairConfirm', { name: d.name }))) return
    setError(null)
    setBusyId(d.id)
    try {
      // 짝이 이미 없으면(다른 창에서 끊음 등) 목록에서만 뺀다
      const peerId = d.peer?.id
      if (peerId)
        await window.office.peerUnpair(peerId).catch(async (e: unknown) => {
          if ((await window.office.peerList()).some((p) => p.id === peerId)) throw e
        })
      if (d.workspace) await window.officeWorkspaces?.remove?.(d.workspace.id)
    } catch (e) {
      setError(ipcErrorText(e, t('peer.error.failed')))
    } finally {
      setBusyId(null)
    }
    onPeersChanged()
  }
  // 1.3.1까지 짝만 지어 둔 PC: 이름·색을 붙여 PC 목록에 올린다
  const addToList = async (d: Extract<ConnectDevice, { kind: 'pc' }>) => {
    setError(null)
    const r = await window.officeWorkspaces?.add?.({ peerId: d.id, name: cleanWorkspaceName(d.name, d.name), color: nextFreeColor(workspaces) })
    if (r && !r.ok) setError(t(`workspace.error.${r.code}`))
    onPeersChanged()
  }
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium">{t('connect.devices', { n: devices.length })}</h3>
      {error && <p className="text-status-error text-xs">{error}</p>}
      <ul className="flex flex-col gap-1.5 text-xs">
        {devices.map((d) => (
          <li key={`${d.kind}:${d.id}`} className="flex flex-col gap-2 rounded-lg border px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {d.kind === 'phone' ? <SmartphoneIcon className="size-4 shrink-0" /> : <MonitorIcon className="size-4 shrink-0" style={d.kind === 'pc' && d.workspace ? { color: `var(--ws-${d.workspace.color})` } : undefined} />}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">
                  {d.kind === 'phone' ? t('connect.device.phone') : d.name}
                  {d.kind === 'pc' && <span className="text-muted-foreground font-normal"> · {t('connect.device.from')}</span>}
                  {d.kind === 'to' && <span className="text-muted-foreground font-normal"> · {t('connect.device.to')}</span>}
                </span>
                {d.kind === 'pc' ? <span className={d.isOnline ? 'text-status-working' : 'text-muted-foreground'}>{pcStateText(d)}</span> : seenText(d.isOnline, d.seenAt)}
              </div>
              {d.kind === 'pc' && (
                <span className="flex flex-wrap gap-1">
                  {d.workspace && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={!canOpenWindow(d.workspace.status)} onClick={() => void window.officeWorkspaces?.switchTo(d.workspace!.id)}>
                      {t('workspace.manage.open')}
                    </Button>
                  )}
                  {d.workspace && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setEditId(editId === d.id ? null : d.id)}>
                      {t('workspace.manage.edit')}
                    </Button>
                  )}
                  {!d.workspace && d.peer && d.peer.state !== 'unpaired' && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={!canAddWorkspace(workspaces)} onClick={() => void addToList(d)}>
                      {t('connect.device.addToList')}
                    </Button>
                  )}
                  {d.peer?.state === 'offline' && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => void window.office.peerReconnect(d.peer!.id).then(onPeersChanged)}>
                      {t('peer.client.reconnect')}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={busyId === d.id} onClick={() => void disconnect(d)}>
                    {t('connect.unpair')}
                  </Button>
                </span>
              )}
              {d.kind === 'to' && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={busyId === d.id} onClick={() => void revoke(d)}>
                  {t('connect.unpair')}
                </Button>
              )}
            </div>
            {/* 꽉 차서 '목록에 추가'가 눌리지 않을 때 이유 (꺼진 버튼은 말풍선이 안 떠서 글로) */}
            {d.kind === 'pc' && !d.workspace && d.peer && d.peer.state !== 'unpaired' && !canAddWorkspace(workspaces) && <p className="text-muted-foreground">{t('connect.device.listFull', { n: WORKSPACE_MAX })}</p>}
            {d.kind === 'pc' && d.workspace && editId === d.id && <PcEdit w={d.workspace} onDone={() => setEditId(null)} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 이 PC가 보는 PC의 상태 한 줄: PC 목록에 있으면 화면 보기 상태, 짝만 있으면 연결 상태 + '목록에 없음' */
function pcStateText(d: Extract<ConnectDevice, { kind: 'pc' }>) {
  if (d.workspace) return t(`workspace.status.${d.workspace.status}`)
  if (!d.peer) return t('workspace.status.unpaired')
  return `${t(`peer.state.${d.peer.state}`)} · ${t('connect.device.notListed')}`
}

/** PC 목록 항목의 이름·색 바꾸기 (줄 안에서 펼침) */
function PcEdit({ w, onDone }: { w: WorkspaceView; onDone: () => void }) {
  const [name, setName] = useState(w.name)
  const [color, setColor] = useState(w.color)
  const save = async () => {
    await window.officeWorkspaces?.update?.(w.id, { name, color })
    onDone()
  }
  return (
    <div className="flex flex-col gap-2 border-t pt-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">{t('workspace.field.name')}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 max-w-xs" />
      </label>
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex gap-1">
        <Button size="sm" onClick={() => void save()} disabled={!name.trim()}>
          {t('workspace.manage.save')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t('dialog.cancel')}
        </Button>
      </div>
    </div>
  )
}

/** ▸ 고급 설정: 연결 번호·주소·공유기 결과 · 공유기 직접 설정 안내 · 보안 확인 글자 · 최근 접속 */
function Advanced({ status, setStatus, onMode }: { status: RemoteStatus; setStatus: (s: RemoteStatus) => void; onMode: (m: RemoteStatus['mode']) => void }) {
  const [isGuideOpen, setIsGuideOpen] = useState(false)
  const [guideStep, setGuideStep] = useState(0)
  const [isModeOpen, setIsModeOpen] = useState(false)
  const mode = MODES.find((m) => m.mode === status.mode) ?? MODES[0]
  return (
    <details className="rounded-lg border p-2.5 text-xs">
      <summary className="cursor-pointer font-medium">
        {t('connect.advanced')} <span className="text-muted-foreground font-normal">· {t(mode.short)} · {t('connect.advanced.summary', { port: status.port })}</span>
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-1.5">
          <span>{t('connect.advanced.mode', { mode: t(mode.short) })}</span>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setIsModeOpen(!isModeOpen)}>
            {t('connect.change')}
          </Button>
        </div>
        {isModeOpen && (
          <ModePicker
            status={status}
            onPick={(m) => {
              onMode(m)
              setIsModeOpen(false)
            }}
          />
        )}
        <p className="flex flex-wrap items-center gap-x-1.5">
          <span>{t('connect.advanced.port', { port: status.port })}</span>
          {status.connectHost && (
            <span className="text-muted-foreground">
              · {status.mode === 'tailscale' ? t('remote.tsAddress') : status.isLanOnly ? t('remote.lanAddress') : t('remote.externalAddress')} <span className="selectable font-mono">{status.connectHost}:{status.port}</span>
            </span>
          )}
          {upnpText(status) && <span className={status.upnp.state === 'failed' ? 'text-status-waiting' : 'text-muted-foreground'}>· {upnpText(status)}</span>}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          onClick={() => {
            setGuideStep(status.mode === 'router' && status.isEnabled ? 1 : 0)
            setIsGuideOpen(true)
          }}
        >
          {t('connect.advanced.router')}
        </Button>
        {status.fingerprint && (
          <p className="text-muted-foreground text-[11px]">
            {t('remote.fingerprint')} <span className="selectable font-mono break-all">{status.fingerprint}</span>
          </p>
        )}
        {status.recentAccess.length > 0 && <RecentAccess entries={status.recentAccess} />}
      </div>
      <RemoteGuide status={status} setStatus={setStatus} isOpen={isGuideOpen} onOpenChange={setIsGuideOpen} step={guideStep} setStep={setGuideStep} />
    </details>
  )
}
