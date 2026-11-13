import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t } from '@shared/i18n'
import { ipcErrorText } from '@shared/ipcError'
import { formatPairCode, normalizePairCode, parsePeerInvite, type PairWindowView } from '@shared/peerProtocol'

// PC 추가 창(WorkspaceWizard)의 짝짓기 조각: 이 PC 보여 주기(연결 정보 만들기·복사) / 다른 PC 보기(붙여넣기 한 번으로 연결).
// PC 전용 — 휴대폰 화면에서는 그리지 않는다

const DEFAULT_PORT = 47900 // main/remote/service.ts DEFAULT_REMOTE_PORT와 같아야 함
const COPIED_MS = 1500
const errText = (e: unknown) => ipcErrorText(e, t('peer.error.failed'))
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

/** 입력 중 코드 보기 좋게: 허용 글자만 남기고 4자마다 하이픈 (O→0, I·L→1은 연결할 때 normalizePairCode가 한다) */
function autoFormat(raw: string) {
  const c = raw.replace(/[^0-9a-zA-Z]/g, '').toUpperCase().slice(0, 12)
  return c.replace(/(.{4})(?=.)/g, '$1-')
}
