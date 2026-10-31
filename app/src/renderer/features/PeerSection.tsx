import { useCallback, useEffect, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { useOffice } from '@/store'
import { IS_MOBILE_SHELL } from '@/shell'
import { fmtDate, t } from '@shared/i18n'
import { formatPairCode, normalizePairCode, type PairWindowView, type PeerSlotView, type PeerView, type RemoteStaffChoice } from '@shared/peerProtocol'

// 설정 › 다른 PC 연결: B컴 역할(짝짓기 창·연결된 PC), A컴 역할(주소+코드로 연결·목록·다시 연결·해제·직원 고르기)
// PC 전용 — 휴대폰 화면에서는 그리지 않는다

const DEFAULT_PORT = 47900 // main/remote/service.ts DEFAULT_REMOTE_PORT와 같아야 함
const COPIED_MS = 1500
const errText = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '') : t('peer.error.failed'))
const timeText = (ms: number) => fmtDate(ms, { hour: '2-digit', minute: '2-digit' })

/** "주소" 또는 "주소:포트"를 나눈다 (포트 없으면 기본값) */
function parseHost(raw: string): { host: string; port: number } | null {
  const m = raw.trim().match(/^([^\s:]+)(?::(\d{1,5}))?$/)
  if (!m) return null
  const port = m[2] ? Number(m[2]) : DEFAULT_PORT
  return port >= 1 && port <= 65535 ? { host: m[1], port } : null
}

export function PeerSection() {
  if (IS_MOBILE_SHELL) return null
  return (
    <div className="flex flex-col gap-5">
      <HostPart />
      <ClientPart />
    </div>
  )
}

/** B컴 역할: 짝짓기 창을 열어 코드·QR·지문을 보여 주고, 이 PC에 붙은 PC 목록을 관리 */
function HostPart() {
  const [win, setWin] = useState<PairWindowView | null>(null)
  const [slots, setSlots] = useState<PeerSlotView[]>([])
  const [error, setError] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  const loadSlots = useCallback(() => void window.office.peerSlots().then(setSlots), [])
  useEffect(loadSlots, [loadSlots])
  // 창이 열린 동안엔 연결이 생겼는지 3초마다 본다. 5분이 지나면 화면에서 코드를 지운다
  useEffect(() => {
    if (!win) return
    const poll = setInterval(loadSlots, 3000)
    const left = Math.max(0, win.until - Date.now())
    const expire = setTimeout(() => setWin(null), left)
    return () => {
      clearInterval(poll)
      clearTimeout(expire)
    }
  }, [win, loadSlots])

  const open = async () => {
    setError('')
    try {
      setWin(await window.office.peerPairStart('peer'))
    } catch (e) {
      setError(errText(e))
    }
  }
  const close = async () => {
    setWin(null)
    await window.office.peerPairClose()
  }
  const copy = async () => {
    if (!win) return
    await navigator.clipboard.writeText(win.copyText)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), COPIED_MS)
  }
  const revoke = async (id: string) => {
    if (!window.confirm(t('peer.host.revokeConfirm'))) return
    await window.office.peerRevokeSlot(id)
    loadSlots()
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{t('peer.host.title')}</h3>
      <p className="text-muted-foreground text-xs">{t('peer.host.desc')}</p>
      {error && <p className="text-status-error text-xs">{error}</p>}
      {win ? (
        <div className="flex flex-wrap items-start gap-4 rounded-lg border p-3">
          {win.qr && <img src={win.qr} alt={t('peer.host.qrAlt')} className="size-32 rounded bg-white p-1" />}
          <dl className="flex min-w-0 flex-col gap-1.5 text-xs">
            <div>
              <dt className="text-muted-foreground">{t('peer.host.code')}</dt>
              <dd className="selectable font-mono text-xl font-semibold tracking-wider">{formatPairCode(win.code)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('peer.host.address')}</dt>
              <dd className="selectable font-mono">
                {win.host}:{win.port}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('peer.host.fingerprint')}</dt>
              <dd className="selectable font-mono">{win.fingerprint}</dd>
            </div>
            <p className="text-muted-foreground">{t('peer.host.until', { time: timeText(win.until) })}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void copy()}>
                {isCopied ? t('peer.host.copied') : t('peer.host.copy')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void close()}>
                {t('peer.host.close')}
              </Button>
            </div>
          </dl>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => void open()}>
          {t('peer.host.open')}
        </Button>
      )}
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

/** A컴 역할: 주소+코드로 연결하고, 연결된 PC 목록에서 다시 연결·해제·직원 고르기 */
function ClientPart() {
  const [peers, setPeers] = useState<PeerView[]>([])
  const [host, setHost] = useState('')
  const [code, setCode] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState<{ isError: boolean; text: string } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const load = useCallback(() => void window.office.peerList().then(setPeers), [])
  useEffect(load, [load])
  // 연결 상태(online/offline)는 직원 목록(staff.remote)으로 내려오므로, 그 모양이 바뀌면 목록도 다시 읽는다
  const remoteKey = useOffice((s) => s.staff.map((x) => `${x.remote?.peerId}:${x.remote?.state}:${x.remote?.queued}`).join('|'))
  // eslint-disable-next-line react-hooks/exhaustive-deps -- remoteKey가 바뀔 때만 다시 읽는다
  useEffect(load, [remoteKey])

  const target = parseHost(host)
  const code12 = normalizePairCode(code)
  const handleConnect = async () => {
    if (!target) return setMessage({ isError: true, text: t('peer.client.badHost') })
    if (!code12) return setMessage({ isError: true, text: t('peer.error.bad_code') })
    setIsBusy(true)
    setMessage(null)
    try {
      const r = await window.office.peerPairConnect(target.host, target.port, code12)
      setMessage({ isError: false, text: t('peer.client.done', { name: r.name, fingerprint: r.fingerprint }) })
      setHost('')
      setCode('')
      load()
    } catch (e) {
      setMessage({ isError: true, text: errText(e) })
    } finally {
      setIsBusy(false)
    }
  }
  const handleUnpair = async (p: PeerView) => {
    if (!window.confirm(t('peer.client.unpairConfirm', { name: p.name }))) return
    await window.office.peerUnpair(p.id)
    load()
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{t('peer.client.title')}</h3>
      <p className="text-muted-foreground text-xs">{t('peer.client.desc')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder={t('peer.client.host')} aria-label={t('peer.client.host')} className="w-64" />
        {/* 붙여넣기 허용: 하이픈·공백·소문자는 normalizePairCode가 무시한다. 입력 중엔 보기 좋게 XXXX-XXXX-XXXX로 */}
        <Input
          value={code}
          onChange={(e) => setCode(autoFormat(e.target.value))}
          placeholder={t('peer.client.code')}
          aria-label={t('peer.client.code')}
          className="w-52 font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <Button size="sm" disabled={isBusy || !host.trim() || !code.trim()} onClick={() => void handleConnect()}>
          {isBusy && <Loader2Icon className="animate-spin" />} {isBusy ? t('peer.client.connecting') : t('peer.client.connect')}
        </Button>
      </div>
      {message && <p className={message.isError ? 'text-status-error text-xs' : 'text-status-working text-xs'}>{message.text}</p>}
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
                  · {p.host}:{p.port} · {t('peer.client.staffCount', { n: p.staffCount })}
                  {p.queued > 0 && ` · ${t('peer.queued', { n: p.queued })}`}
                </span>
                <span className="ml-auto flex gap-1">
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={p.state === 'unpaired'} onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                    {t('peer.client.pickStaff')}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={p.state === 'online' || p.state === 'connecting' || p.state === 'unpaired'} onClick={() => void window.office.peerReconnect(p.id).then(load)}>
                    {t('peer.client.reconnect')}
                  </Button>
                  <Button size="sm" variant="ghost" className="border-destructive/60 h-6 px-2 text-[11px]" onClick={() => void handleUnpair(p)}>
                    {t('peer.client.unpair')}
                  </Button>
                </span>
              </div>
              {openId === p.id && <RemoteStaffPicker peerId={p.id} onChanged={load} />}
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

/** B컴 직원 목록 → 랩에 추가/빼기. 목록은 열 때 한 번 가져온다 */
function RemoteStaffPicker({ peerId, onChanged }: { peerId: string; onChanged: () => void }) {
  const labs = useOffice((s) => s.labs.filter((l) => !l.isPractice))
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
