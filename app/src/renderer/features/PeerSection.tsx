import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { AlertTriangleIcon, CheckCircle2Icon, CircleIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useOffice } from '@/store'
import { IS_REMOTE_SCREEN } from '@/shell'
import { fmtDate, t } from '@shared/i18n'
import { ipcErrorText } from '@shared/ipcError'
import type { RemoteStatus } from '@shared/types'
import { SECTION_ID } from './settingsSections'
import { formatPairCode, normalizePairCode, parsePeerInvite, type PairWindowView, type PeerSlotView, type PeerView, type RemoteStaffChoice } from '@shared/peerProtocol'

// 설정 › 다른 PC 연결: 준비 확인(원격 켜짐·네트워크) → 역할 고르기 → 보내는 PC(연결 정보 만들기·복사) / 불러오는 PC(붙여넣기 한 번으로 연결 → 직원 고르기 자동 열림)
// 아래엔 늘 연결된 PC 목록(이 PC에 붙은 PC, 이 PC가 붙은 PC). PC 전용 — 휴대폰 화면에서는 그리지 않는다

const DEFAULT_PORT = 47900 // main/remote/service.ts DEFAULT_REMOTE_PORT와 같아야 함
const COPIED_MS = 1500
/** RemoteSection이 듣는 이벤트: 원격 켜기 안내를 연다 */
export const OPEN_REMOTE_GUIDE_EVENT = 'office:open-remote-guide'
const errText = (e: unknown) => ipcErrorText(e, t('peer.error.failed'))
const timeText = (ms: number) => fmtDate(ms, { hour: '2-digit', minute: '2-digit' })

type Role = 'host' | 'client'

export function PeerSection() {
  if (IS_REMOTE_SCREEN) return null
  return <PeerBody />
}

function PeerBody() {
  const remote = useRemoteStatus()
  const [role, setRole] = useState<Role | null>(null)
  const [slots, setSlots] = useState<PeerSlotView[]>([])
  const [peers, setPeers] = useState<PeerView[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const loadSlots = useCallback(() => void window.office.peerSlots().then(setSlots), [])
  const loadPeers = useCallback(() => void window.office.peerList().then(setPeers), [])
  useEffect(loadSlots, [loadSlots])
  useEffect(loadPeers, [loadPeers])
  // 연결 상태(online/offline)는 직원 목록(staff.remote)으로 내려오므로, 그 모양이 바뀌면 목록도 다시 읽는다
  const remoteKey = useOffice((s) => s.staff.map((x) => `${x.remote?.peerId}:${x.remote?.state}:${x.remote?.queued}`).join('|'))
  // eslint-disable-next-line react-hooks/exhaustive-deps -- remoteKey가 바뀔 때만 다시 읽는다
  useEffect(loadPeers, [remoteKey])
  // 원격이 꺼지거나 닫히면 고른 역할도 처음으로
  const isReady = !!remote?.isEnabled && remote.isListening
  useEffect(() => {
    if (remote && !isReady) setRole(null)
  }, [remote, isReady])

  if (!remote) return null
  const handleConnected = (peerId: string) => {
    loadPeers()
    setOpenId(peerId)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="bg-muted/30 text-muted-foreground flex items-start gap-1.5 rounded-lg p-2 text-xs">
        <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-status-waiting" />
        <span>{t('peer.section.accountNotice')}</span>
      </p>
      <Readiness remote={remote} />
      {role === null ? (
        <RolePicker isDisabled={!isReady} hint={remote.isEnabled ? '' : t('peer.ready.needOn')} onPick={setRole} />
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <button type="button" className="text-muted-foreground hover:text-foreground w-fit text-xs" onClick={() => setRole(null)}>
            {t('peer.role.back')}
          </button>
          {role === 'host' ? <HostPart onSlotsChanged={loadSlots} /> : <ClientPart onConnected={handleConnected} />}
        </div>
      )}
      <SlotList slots={slots} onChanged={loadSlots} />
      <PeerList peers={peers} openId={openId} onToggle={(id) => setOpenId(openId === id ? null : id)} onChanged={loadPeers} />
    </div>
  )
}

/** 원격 상태 (읽기 전엔 null) */
function useRemoteStatus() {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  useEffect(() => {
    void window.office.remoteStatus().then(setStatus)
    return window.office.onRemoteStatus(setStatus)
  }, [])
  return status
}

/** 켰는데 열리지 못한 이유 (휴대폰 연결 섹션과 같은 문구) */
function notOpenText(r: RemoteStatus) {
  if (r.error === 'port_in_use') return t('remote.error.portInUse', { port: r.port })
  if (r.error === 'start_failed') return t('remote.error.startFailed')
  if (r.error === 'no_network') return r.mode === 'tailscale' ? t('remote.ts.error.waiting') : t('remote.error.noNetwork')
  return t('peer.ready.notOpenDesc')
}

/** 준비 확인: ① 원격 기능(꺼짐·켰는데 안 열림·켜짐) ② 두 PC의 네트워크(자동 판별은 안 하고 안내만) */
function Readiness({ remote }: { remote: RemoteStatus }) {
  const goRemote = (isGuide: boolean) => {
    document.getElementById(SECTION_ID.remote)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (isGuide) window.dispatchEvent(new Event(OPEN_REMOTE_GUIDE_EVENT))
  }
  const state = !remote.isEnabled ? 'off' : remote.isListening ? 'on' : 'notOpen'
  return (
    <ul className="flex flex-col gap-2 text-xs">
      <li className="flex items-start gap-2">
        {state === 'on' ? (
          <CheckCircle2Icon className="text-status-working mt-0.5 size-4 shrink-0" />
        ) : state === 'notOpen' ? (
          <AlertTriangleIcon className="text-status-error mt-0.5 size-4 shrink-0" />
        ) : (
          <CircleIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{state === 'on' ? t('peer.ready.remoteOn') : state === 'notOpen' ? t('peer.ready.notOpen') : t('peer.ready.remoteOff')}</p>
          <p className={state === 'notOpen' ? 'text-status-error' : 'text-muted-foreground'}>
            {state === 'on' ? t('peer.ready.remoteOnDesc') : state === 'notOpen' ? notOpenText(remote) : t('peer.ready.remoteOffDesc')}
          </p>
        </div>
        {state !== 'on' && (
          <Button size="sm" className="shrink-0" onClick={() => goRemote(state === 'off')}>
            {state === 'off' ? t('peer.ready.turnOn') : t('peer.ready.check')}
          </Button>
        )}
      </li>
      <li className="flex items-start gap-2">
        <CircleIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t('peer.ready.network')}</p>
          <p className="text-muted-foreground">{t('peer.ready.networkDesc')}</p>
          <details className="mt-1">
            <summary className="text-primary w-fit cursor-pointer">{t('peer.ready.more')}</summary>
            <ul className="text-muted-foreground mt-1 list-disc pl-4">
              <li>{t('peer.ready.moreSame')}</li>
              <li>{t('peer.ready.moreFar')}</li>
            </ul>
          </details>
        </div>
      </li>
    </ul>
  )
}

/** 역할 카드 2장: 각자 1·2·3단계와 시작 버튼 */
function RolePicker({ isDisabled, hint, onPick }: { isDisabled: boolean; hint: string; onPick: (role: Role) => void }) {
  const cards: { role: Role; tag: string; title: string; steps: string[]; go: string }[] = [
    { role: 'host', tag: t('peer.role.hostTag'), title: t('peer.role.host'), steps: [t('peer.role.hostStep1'), t('peer.role.hostStep2'), t('peer.role.hostStep3')], go: t('peer.role.hostGo') },
    { role: 'client', tag: t('peer.role.clientTag'), title: t('peer.role.client'), steps: [t('peer.role.clientStep1'), t('peer.role.clientStep2'), t('peer.role.clientStep3')], go: t('peer.role.clientGo') },
  ]
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{t('peer.role.title')}</h3>
      {isDisabled && hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.role} className={cn('flex flex-col gap-2 rounded-lg border p-3 text-xs', isDisabled && 'opacity-50')}>
            <span className="text-muted-foreground">{c.tag}</span>
            <p className="text-sm font-medium">{c.title}</p>
            <ol className="text-muted-foreground flex list-decimal flex-col gap-0.5 pl-4">
              {c.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <Button size="sm" variant="outline" className="mt-auto w-fit" disabled={isDisabled} onClick={() => onPick(c.role)}>
              {c.go}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 보내는 PC: 들어오면 바로 연결 정보를 만들고, 코드·복사 버튼을 보여 준다(시간 제한 없음). 연결이 생기면 알린다 */
export function HostPart({ onSlotsChanged }: { onSlotsChanged: () => void }) {
  const [win, setWin] = useState<PairWindowView | null>(null)
  const [isClosed, setIsClosed] = useState(false)
  const [error, setError] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  const [newName, setNewName] = useState('')
  // 코드를 만들기 직전에 받아 둔 연결 목록 — 이것과 비교해야 기존 연결을 새 연결로 착각하지 않는다
  const knownIds = useRef<Set<string>>(new Set())
  // 늦게 끝난 이전 요청이 화면을 바꾸거나, 떠난 뒤에 연결 창을 다시 열지 못하게 한다
  const openSeq = useRef(0)
  const isMounted = useRef(false)

  const open = useCallback(async () => {
    const seq = ++openSeq.current
    const isStale = () => seq !== openSeq.current
    setError('')
    setIsClosed(false)
    setNewName('')
    try {
      const base = await window.office.peerSlots()
      if (isStale()) return
      knownIds.current = new Set(base.map((x) => x.id))
      const opened = await window.office.peerPairStart('peer')
      if (isStale()) {
        // 화면을 떠났으면 방금 연 창을 닫는다. 새 요청이 진행 중이면 그 요청이 창을 바꿔 연다
        if (!isMounted.current) void window.office.peerPairClose()
        return
      }
      setWin(opened)
    } catch (e) {
      if (!isStale()) setError(errText(e))
    }
  }, [])
  useEffect(() => {
    isMounted.current = true
    void open()
    // 역할을 바꾸거나 화면을 떠나면 창을 닫는다
    return () => {
      isMounted.current = false
      openSeq.current++
      void window.office.peerPairClose()
    }
  }, [open])
  // 창이 열린 동안 3초마다 새 연결과 창 상태를 본다 (시간 제한은 없다).
  // 창을 열 때 있던 PC 말고 새 PC가 붙으면 "연결됐어요" — 코드는 한 번 쓰면 끝이므로 코드 표시도 거둔다.
  // 새 연결 없이 창이 닫혔으면(코드 3번 틀림) 닫혔다고 알린다
  useEffect(() => {
    if (!win) return
    let isActive = true
    const poll = setInterval(() => {
      void Promise.all([window.office.peerSlots(), window.office.remoteStatus()]).then(([list, status]) => {
        if (!isActive) return
        onSlotsChanged()
        const added = list.find((x) => !knownIds.current.has(x.id))
        if (added) {
          setNewName(added.label)
          setWin(null)
        } else if (status.pairOpen !== 'peer') {
          setWin(null)
          setIsClosed(true)
        }
      })
    }, 3000)
    return () => {
      isActive = false
      clearInterval(poll)
    }
  }, [win, onSlotsChanged])

  const copy = async () => {
    if (!win) return
    await navigator.clipboard.writeText(win.copyText)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), COPIED_MS)
  }

  return (
    <div className="flex flex-col gap-2 text-xs">
      <h3 className="text-sm font-semibold">{t('peer.host.sendTitle')}</h3>
      <p className="text-muted-foreground">{t('peer.host.sendDesc')}</p>
      {error && <p className="text-status-error">{error}</p>}
      {newName && <p className="text-status-working">{t('peer.host.newSlot', { name: newName })}</p>}
      {win && (
        <div className="flex flex-wrap items-start gap-4">
          {win.qr && <img src={win.qr} alt={t('peer.host.qrAlt')} className="size-28 rounded bg-white p-1" />}
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-muted-foreground">{t('peer.host.code')}</span>
            <span className="selectable font-mono text-xl font-semibold tracking-wider">{formatPairCode(win.code)}</span>
            <span className="text-muted-foreground">{t('peer.host.untilUsed')}</span>
            <span className="text-muted-foreground">
              {t('peer.host.address')} · <span className="selectable font-mono">{win.host}:{win.port}</span>
            </span>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void copy()}>
                {isCopied ? t('peer.host.copied') : t('peer.host.copy')}
              </Button>
            </div>
            <details>
              <summary className="text-muted-foreground w-fit cursor-pointer">{t('peer.host.fingerprint')}</summary>
              <p className="text-muted-foreground mt-1">{t('peer.host.fingerprintDesc')}</p>
              <p className="selectable font-mono">{win.fingerprint}</p>
            </details>
          </div>
        </div>
      )}
      {!win && (isClosed || error || newName) && (
        <div className="flex items-center gap-2">
          {isClosed && <p className="text-muted-foreground">{t('peer.host.closed')}</p>}
          <Button size="sm" variant="outline" onClick={() => void open()}>
            {newName ? t('peer.host.another') : error ? t('peer.host.retry') : t('peer.host.renew')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** 불러오는 PC: 받은 연결 정보를 한 칸에 붙여 넣어 연결. 따로 입력하는 칸은 접어 둔다 */
export function ClientPart({ onConnected }: { onConnected: (peerId: string) => void }) {
  const [pasted, setPasted] = useState('')
  const [host, setHost] = useState('')
  const [code, setCode] = useState('')
  const [isManual, setIsManual] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState<{ isError: boolean; text: string; sub?: string } | null>(null)

  // 붙여넣기 칸이 우선. 직접 입력을 펼쳤으면 두 칸을 합쳐 같은 해석기로 읽는다
  const raw = isManual ? `${host} ${code}` : pasted
  const invite = parsePeerInvite(raw, DEFAULT_PORT)
  const hasInput = raw.trim() !== ''
  const handleConnect = async () => {
    if (!invite.host) return setMessage({ isError: true, text: isManual ? t('peer.client.badHost') : t('peer.client.needHost') })
    if (!invite.port) return setMessage({ isError: true, text: t('peer.client.badHost') })
    if (!invite.code) return setMessage({ isError: true, text: isManual ? t('peer.error.bad_code') : t('peer.client.needCode') })
    setIsBusy(true)
    setMessage(null)
    try {
      const r = await window.office.peerPairConnect(invite.host, invite.port, invite.code)
      setMessage({ isError: false, text: t('peer.client.done', { name: r.name }), sub: t('peer.client.doneFp', { fingerprint: r.fingerprint }) })
      setPasted('')
      setHost('')
      setCode('')
      onConnected(r.id)
    } catch (e) {
      setMessage({ isError: true, text: errText(e) })
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 text-xs">
      <h3 className="text-sm font-semibold">{t('peer.client.pasteTitle')}</h3>
      <p className="text-muted-foreground">{t('peer.client.pasteDesc')}</p>
      {!isManual && (
        <Input
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          // 한 줄 칸은 붙여 넣은 줄바꿈을 지워 주소와 코드가 붙어 버리므로, 줄바꿈을 띄어쓰기로 바꿔 넣는다
          onPaste={(e) => {
            e.preventDefault()
            setPasted(e.clipboardData.getData('text').replace(/\s+/g, ' ').trim())
          }}
          onKeyDown={(e) => e.key === 'Enter' && hasInput && !isBusy && void handleConnect()}
          placeholder={t('peer.client.paste')}
          aria-label={t('peer.client.paste')}
          className="max-w-md font-mono"
          autoComplete="off"
          spellCheck={false}
        />
      )}
      <details open={isManual} onToggle={(e) => setIsManual(e.currentTarget.open)}>
        <summary className="text-muted-foreground w-fit cursor-pointer">{t('peer.client.manual')}</summary>
        <p className="text-muted-foreground mt-1">{t('peer.client.manualDesc')}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder={t('peer.client.host')} aria-label={t('peer.client.host')} className="w-64" />
          {/* 하이픈·공백·소문자는 normalizePairCode가 무시한다. 입력 중엔 보기 좋게 XXXX-XXXX-XXXX로 */}
          <Input value={code} onChange={(e) => setCode(autoFormat(e.target.value))} placeholder={t('peer.client.code')} aria-label={t('peer.client.code')} className="w-52 font-mono" autoComplete="off" spellCheck={false} />
        </div>
      </details>
      <div className="flex items-center gap-2">
        <Button size="sm" className="w-fit" disabled={isBusy || !hasInput} onClick={() => void handleConnect()}>
          {isBusy && <Loader2Icon className="animate-spin" />} {isBusy ? t('peer.client.connecting') : t('peer.client.connect')}
        </Button>
        {!hasInput && !message && <span className="text-muted-foreground">{t('peer.client.pasteHint')}</span>}
      </div>
      {message && (
        <div className={message.isError ? 'text-status-error' : 'text-status-working'}>
          <p>{message.text}</p>
          {message.sub && <p className="text-muted-foreground">{message.sub}</p>}
        </div>
      )}
    </div>
  )
}

/** 이 PC에 붙은 PC (보내는 PC 쪽 목록) */
function SlotList({ slots, onChanged }: { slots: PeerSlotView[]; onChanged: () => void }) {
  const revoke = async (id: string) => {
    if (!window.confirm(t('peer.host.revokeConfirm'))) return
    await window.office.peerRevokeSlot(id)
    onChanged()
  }
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-medium">{t('peer.host.slots')}</h4>
      {slots.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('peer.host.slotNone')}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs">
          {slots.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded border px-2 py-1">
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              {s.lastSeenAt && <span className="text-muted-foreground tabular-nums">{timeText(s.lastSeenAt)}</span>}
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => void revoke(s.id)}>
                {t('peer.host.revoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 이 PC가 붙은 PC (불러오는 PC 쪽 목록): 다시 연결·해제·직원 고르기 */
function PeerList({ peers, openId, onToggle, onChanged }: { peers: PeerView[]; openId: string | null; onToggle: (id: string) => void; onChanged: () => void }) {
  const handleUnpair = async (p: PeerView) => {
    if (!window.confirm(t('peer.client.unpairConfirm', { name: p.name }))) return
    await window.office.peerUnpair(p.id)
    onChanged()
  }
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-medium">{t('peer.client.list')}</h4>
      {peers.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('peer.client.none')}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-xs">
          {peers.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-lg border p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={p.state === 'online' ? 'text-status-working' : p.state === 'connecting' ? 'text-status-waiting' : 'text-muted-foreground'}>●</span>
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">{t(`peer.state.${p.state}`)}</span>
                <span className="text-muted-foreground">
                  · {t('peer.client.staffCount', { n: p.staffCount })}
                  {p.queued > 0 && ` · ${t('peer.queued', { n: p.queued })}`}
                </span>
                <span className="ml-auto flex gap-1">
                  <Button size="sm" variant={openId === p.id ? 'default' : 'outline'} className="h-6 px-2 text-[11px]" disabled={p.state === 'unpaired'} onClick={() => onToggle(p.id)}>
                    {t('peer.client.pickStaff')}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={p.state === 'online' || p.state === 'connecting' || p.state === 'unpaired'} onClick={() => void window.office.peerReconnect(p.id).then(onChanged)}>
                    {t('peer.client.reconnect')}
                  </Button>
                  <Button size="sm" variant="ghost" className="border-destructive/60 h-6 px-2 text-[11px]" onClick={() => void handleUnpair(p)}>
                    {t('peer.client.unpair')}
                  </Button>
                </span>
              </div>
              {openId === p.id && <RemoteStaffPicker peerId={p.id} onChanged={onChanged} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 입력 중 코드 보기 좋게: 허용 글자만 남기고 4자마다 하이픈 (O→0, I·L→1은 연결할 때 normalizePairCode가 한다) */
function autoFormat(raw: string) {
  const c = raw.replace(/[^0-9a-zA-Z]/g, '').toUpperCase().slice(0, 12)
  return c.replace(/(.{4})(?=.)/g, '$1-')
}

/** B컴 직원 목록 → 이 PC로 불러오기/빼기 (랩은 골라 두면 함께 넣는다). 목록은 열 때 한 번 가져온다 */
function RemoteStaffPicker({ peerId, onChanged }: { peerId: string; onChanged: () => void }) {
  // 매번 새 배열을 돌려주면 무한히 다시 그려지므로 내용이 같으면 같은 값으로 본다
  const labs = useOffice(useShallow((s) => s.labs.filter((l) => !l.isPractice)))
  const [choices, setChoices] = useState<RemoteStaffChoice[] | null>(null)
  const [labId, setLabId] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setChoices(await window.office.peerRemoteStaff(peerId))
      setError('')
    } catch (e) {
      setChoices([])
      setError(errText(e))
    }
  }, [peerId])
  useEffect(() => void load(), [load])

  const toggle = async (c: RemoteStaffChoice) => {
    setBusyId(c.id)
    setError('')
    try {
      if (c.isAdded) await window.office.peerRemoveStaff(`p:${peerId}:${c.id}`)
      else await window.office.peerAddStaff(peerId, c.id, labId || undefined)
      await load()
      onChanged()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusyId(null)
    }
  }

  if (!choices) return <p className="text-muted-foreground flex items-center gap-1.5"><Loader2Icon className="size-3 animate-spin" /> {t('peer.picker.loading')}</p>
  return (
    <div className="bg-muted/30 flex flex-col gap-2 rounded-lg p-2">
      {labs.length > 0 && (
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground shrink-0">{t('peer.picker.lab')}</span>
          <NativeSelect value={labId} onChange={(e) => setLabId(e.target.value)} className="h-7 w-48 text-xs">
            <option value="">{t('peer.picker.noLab')}</option>
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      {error && <p className="text-status-error">{error}</p>}
      {choices.length === 0 && !error && <p className="text-muted-foreground">{t('peer.picker.empty')}</p>}
      <ul className="flex flex-col gap-1">
        {choices.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <span className="font-medium">{c.name}</span>
            <span className="text-muted-foreground min-w-0 flex-1 truncate">{c.role}</span>
            {c.isAutoEdit && !c.isAdded ? (
              <span className="text-status-waiting">{t('peer.picker.autoEdit')}</span>
            ) : (
              <Button size="sm" variant={c.isAdded ? 'ghost' : 'outline'} className="h-6 px-2 text-[11px]" disabled={busyId === c.id} onClick={() => void toggle(c)}>
                {c.isAdded ? t('peer.picker.remove') : t('peer.picker.add')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
