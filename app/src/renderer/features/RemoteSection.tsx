import { useEffect, useState } from 'react'
import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon, ShieldAlertIcon, SmartphoneIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { fmtDate, t } from '@shared/i18n'
import { ipcErrorText } from '@shared/ipcError'
import { formatPairCode, type PairWindowView } from '@shared/peerProtocol'
import type { AccessEntry, RemoteQr, RemoteStatus } from '@shared/types'
import { DuoIcon } from '@/components/duo-icon'

// 설정 › 휴대폰·PC 연결의 조각들: 공유기 직접 설정 안내 창(켜기 → 포트 → 공유기 → 주소 → QR), QR 판(QrPanel), 코드로 연결(PhoneCode), 알림 띠, 최근 접속 기록.
// 단계 화면 본체는 connect/ConnectSection.tsx
// 화면에는 토큰 원문·해시가 오지 않는다. QR 그림만 받아 보여 주고, 휴대폰이 붙으면(또는 QR을 다시 만들면) 거둔다 — 시간 제한은 없다

const STEP_KEYS = ['remote.step.on', 'remote.step.port', 'remote.step.router', 'remote.step.address', 'remote.step.qr'] as const
const RECENT_SHOWN = 5
const COPIED_MS = 1500
export const TAILSCALE_DOWNLOAD_URL = 'https://tailscale.com/download'
export const timeText = (ms: number) => fmtDate(ms, { hour: '2-digit', minute: '2-digit' })
/** 공유기 자동 설정 결과 한 줄 */
export function upnpText(s: RemoteStatus) {
  if (s.upnp.state === 'trying') return t('remote.upnp.trying')
  if (s.upnp.state === 'ok') return t('remote.upnp.ok')
  if (s.upnp.state === 'failed') return t('remote.upnp.failed')
  return ''
}

/** 휴대폰용 연결 코드(12자) — QR을 못 찍는 안드로이드가 주소+코드를 직접 입력할 때.
 *  시간 제한 없이 연결되거나(코드 1회용) 코드를 3번 틀리거나 다른 창을 열어 휴대폰용 창이 닫히면 화면에서 지운다 */
export function PhoneCode({ pairOpen }: { pairOpen: RemoteStatus['pairOpen'] }) {
  const [win, setWin] = useState<PairWindowView | null>(null)
  const [error, setError] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  useEffect(() => {
    if (win && pairOpen !== 'phone') setWin(null)
  }, [win, pairOpen])
  // 1회용 코드만 복사한다 — QR 주소·열쇠는 클립보드에 남기지 않는다
  const copy = async () => {
    if (!win) return
    await navigator.clipboard.writeText(formatPairCode(win.code))
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), COPIED_MS)
  }
  const show = async () => {
    setError('')
    try {
      setWin(await window.office.peerPairStart('phone'))
    } catch (e) {
      setError(ipcErrorText(e))
    }
  }
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <span className="text-muted-foreground">{t('remote.phoneCode')}</span>
      {win ? (
        <p>
          <span className="selectable font-mono text-base font-semibold tracking-wider">{formatPairCode(win.code)}</span>
          <span className="text-muted-foreground selectable ml-2 font-mono">
            {win.host}:{win.port}
          </span>
          <Button size="sm" variant="outline" className="ml-2 h-6 px-2 text-[11px]" onClick={() => void copy()}>
            {isCopied ? t('connect.copied') : t('connect.copy')}
          </Button>
          <span className="text-muted-foreground ml-2">{t('peer.host.untilUsed')}</span>
        </p>
      ) : (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => void show()}>
          {t('remote.phoneCode.show')}
        </Button>
      )}
      {error && <p className="text-status-error">{error}</p>}
    </div>
  )
}

export function Banner({ tone, children }: { tone: 'warning' | 'error' | 'ok'; children: React.ReactNode }) {
  const Icon = tone === 'ok' ? CheckCircle2Icon : AlertTriangleIcon
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border p-2.5 text-xs',
        tone === 'warning' && 'border-status-waiting/50 bg-status-waiting/10',
        tone === 'error' && 'border-status-error/50 bg-status-error/10',
        tone === 'ok' && 'border-status-working/50 bg-status-working/10',
      )}
    >
      <Icon className={cn('mt-0.5 size-3.5 shrink-0', tone === 'warning' && 'text-status-waiting', tone === 'error' && 'text-status-error', tone === 'ok' && 'text-status-working')} />
      <div>{children}</div>
    </div>
  )
}

/** 최근 접속 기록 (언제·어디서·무엇을·결과) — 토큰은 남기지 않는다 */
export function RecentAccess({ entries }: { entries: AccessEntry[] }) {
  return (
    <details className="text-xs">
      <summary className="text-muted-foreground cursor-pointer">{t('remote.recentAccess', { count: entries.length })}</summary>
      <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[11px]">
        {entries.slice(0, RECENT_SHOWN).map((e) => (
          <li key={`${e.at}-${e.ip}-${e.path}`} className={cn(e.status >= 400 ? 'text-status-waiting' : 'text-muted-foreground')}>
            {timeText(e.at)} · {e.ip} · {e.method} {e.path} · {e.status}
            {e.error ? ` ${e.error}` : ''}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** 첫 연결 가이드 (docs/specs/android-design.md 2절) */
export function RemoteGuide({
  status,
  setStatus,
  isOpen,
  onOpenChange,
  step,
  setStep,
}: {
  status: RemoteStatus
  setStatus: (s: RemoteStatus) => void
  isOpen: boolean
  onOpenChange: (v: boolean) => void
  step: number
  setStep: (n: number) => void
}) {
  const [isAcknowledged, setIsAcknowledged] = useState(false)
  const [port, setPort] = useState(String(status.port))
  const [host, setHost] = useState(status.host)
  const [isBusy, setIsBusy] = useState(false)
  useEffect(() => {
    if (!isOpen) return
    setPort(String(status.port))
    setHost(status.host)
  }, [isOpen])

  const handleOpenPort = async () => {
    // 켜져 있는 채로 포트를 바꾸면 연결된 휴대폰이 끊긴다
    if (status.isEnabled && Number(port) !== status.port && !window.confirm(t('remote.portConfirm'))) return
    setIsBusy(true)
    const next = await window.office.setRemoteEnabled(true, Number(port))
    setStatus(next)
    setIsBusy(false)
    // 이 가이드에서 "모두 조작할 수 있어요"를 읽고 켰으니 업데이트 안내(RemoteUpgradeNotice)는 띄우지 않는다
    if (next.isEnabled) void window.office.updateSettings({ isFullAccessNoticeSeen: true })
    // Tailscale·전용 모드는 공유기 포트를 열지 않고 주소도 내부 주소만 쓰므로 공유기·주소 단계를 건너뛴다
    if (next.isListening) setStep(status.mode === 'router' ? 2 : 4)
  }
  const handleHost = async (value: string) => {
    setStatus(await window.office.setRemoteHost(value))
    setStep(4)
  }
  const portNumber = Number(port)
  const isPortValid = Number.isInteger(portNumber) && portNumber >= 1024 && portNumber <= 65535

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SmartphoneIcon className="size-4" /> {t('remote.guide.title')}
          </DialogTitle>
          <DialogDescription>{t('remote.guide.desc')}</DialogDescription>
        </DialogHeader>
        <ol className="flex flex-wrap gap-1.5 text-[11px]">
          {STEP_KEYS.map((key, i) => (
            <li key={key} className={cn('rounded-full border px-2 py-0.5', i < step && 'border-status-working/60 text-status-working', i === step && 'border-primary')}>
              {i < step ? <DuoIcon name="done" size={13} /> : i + 1} {t(key)}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground text-xs">{t('remote.guide.canDo')}</p>
            <Banner tone="warning">
              <b>{t('remote.guide.readFirst')}</b>
              <br />
              {t('remote.guide.warnQr')}
              <br />· {status.mode === 'lan' ? t('remote.lanMode.on') : status.mode === 'tailscale' ? t('remote.mode.tailscale.desc') : t('remote.guide.warnPort')}
            </Banner>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isAcknowledged} onChange={(e) => setIsAcknowledged(e.target.checked)} /> {t('remote.guide.ack')}
            </label>
            <DialogFooter>
              <span className="text-muted-foreground mr-auto self-center text-xs">{t('remote.guide.offByDefault')}</span>
              <Button onClick={() => setStep(1)} disabled={!isAcknowledged && !status.isEnabled}>
                {t('remote.guide.turnOn')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-3 text-sm">
            <label className="flex items-center gap-2">
              {t('remote.guide.portNumber')}
              <Input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" className="h-8 w-28" />
              <span className="text-muted-foreground text-xs">1024~65535</span>
            </label>
            <p className="text-xs">
              {status.isEnabled ? t('remote.guide.currentPort') : t('remote.guide.savedPort')} <b className="font-mono tabular-nums">{status.port}</b>
              {status.isEnabled && portNumber !== status.port && isPortValid && <span className="text-status-waiting"> → {t('remote.guide.changeTo', { port: portNumber })}</span>}
            </p>
            {status.error === 'port_in_use' && (
              <Banner tone="error">
                {t('remote.guide.portInUse', { port: status.port, next: status.port + 1 })}
              </Banner>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(0)}>
                {t('remote.guide.prev')}
              </Button>
              <Button onClick={() => void handleOpenPort()} disabled={!isPortValid || isBusy}>
                {isBusy && <Loader2Icon className="animate-spin" />} {status.mode === 'router' ? t('remote.guide.tryRouter') : t('remote.guide.open')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3 text-sm">
            {status.upnp.state === 'trying' && (
              <p className="text-muted-foreground flex items-center gap-2 text-xs">
                <Loader2Icon className="size-3.5 animate-spin" /> {t('remote.guide.upnpTrying')}
              </p>
            )}
            {status.upnp.state === 'ok' && (
              <>
                <Banner tone="ok">
                  {t('remote.guide.upnpOk', { address: status.upnp.externalAddress ?? t('remote.guide.unknown'), port: status.port })}
                </Banner>
                {status.upnp.isCarrierShared && <Banner tone="warning">{t('remote.guide.carrierShared')}</Banner>}
                {status.upnp.isDoubleNat && <Banner tone="warning">{t('remote.guide.doubleNat')}</Banner>}
              </>
            )}
            {(status.upnp.state === 'failed' || status.upnp.state === 'off') && (
              <>
                <Banner tone="warning">{t('remote.guide.upnpFailed')}</Banner>
                <ol className="text-muted-foreground list-decimal space-y-0.5 pl-4 text-xs">
                  <li>{t('remote.guide.manual1')}</li>
                  <li>{t('remote.guide.manual2')}</li>
                  <li>{t('remote.guide.manual3')}</li>
                </ol>
                <table className="w-fit text-xs">
                  <tbody className="[&_td]:px-2 [&_td]:py-0.5">
                    <tr>
                      <td className="text-muted-foreground">{t('remote.guide.externalPort')}</td>
                      <td className="font-mono">{status.port}</td>
                    </tr>
                    <tr>
                      <td className="text-muted-foreground">{t('remote.guide.internalIp')}</td>
                      <td className="font-mono">{status.isLanOnly ? status.connectHost : t('remote.guide.thisPcAddress')}</td>
                    </tr>
                    <tr>
                      <td className="text-muted-foreground">{t('remote.guide.internalPort')}</td>
                      <td className="font-mono">{status.port}</td>
                    </tr>
                    <tr>
                      <td className="text-muted-foreground">{t('remote.guide.protocol')}</td>
                      <td className="font-mono">TCP</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>
                {t('remote.guide.prev')}
              </Button>
              {status.upnp.state === 'failed' && (
                <Button variant="outline" onClick={() => void window.office.setRemoteEnabled(true, status.port).then(setStatus)}>
                  {t('remote.guide.recheck')}
                </Button>
              )}
              <Button onClick={() => setStep(3)} disabled={status.upnp.state === 'trying'}>
                {status.upnp.state === 'ok' ? t('remote.guide.next') : t('remote.guide.doneNext')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground text-xs">
              {t('remote.guide.ddnsHelp')}
            </p>
            <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder={status.connectHost ? t('remote.guide.hostPlaceholderWith', { host: status.connectHost }) : t('remote.guide.hostPlaceholder')} className="h-8" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(2)}>
                {t('remote.guide.prev')}
              </Button>
              <Button variant="ghost" onClick={() => void handleHost('')}>
                {t('remote.guide.skip')}
              </Button>
              <Button onClick={() => void handleHost(host)}>{t('remote.guide.next')}</Button>
            </DialogFooter>
          </div>
        )}

        {step === 4 && <QrStep status={status} setStatus={setStatus} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

/** QR 판: 휴대폰이 처음 상태 조회에 성공하면 "연결됐어요" — 단계 화면 ③과 공유기 안내 창 마지막 단계가 같이 쓴다 */
export function QrPanel({ status }: { status: RemoteStatus }) {
  const [qr, setQr] = useState<RemoteQr | null>(null)
  const [shownAt] = useState(() => Date.now())
  // 휴대폰이 붙으면 isQrReady가 false로 바뀌어 QR을 거둔다 (시간 제한은 없다)
  useEffect(() => {
    void window.office.remoteQr().then(setQr)
  }, [status.isQrReady, status.connectHost, status.port])
  // 휴대폰 열쇠로 접속한 시각이 있으면 그것으로, 없으면(예전 PC 앱) 접속 기록으로 판단
  const isConnected = status.phoneSeenAt !== null && status.phoneSeenAt !== undefined ? status.phoneSeenAt >= shownAt : status.recentAccess.some((e) => e.at >= shownAt && e.path === '/v1/status' && e.status === 200)
  const isVisible = Boolean(qr && status.isQrReady)
  return (
    <div className="flex flex-col gap-3 text-sm">
      {isVisible && qr ? (
        <div className="flex gap-4">
          <img src={qr.image} alt={t('remote.qr.alt')} className="size-[180px] shrink-0 rounded bg-white p-1" />
          <div className="flex flex-col gap-2 text-xs">
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>{t('remote.qr.step1')}</li>
              <li>{t('remote.qr.step2')}</li>
              <li>{t('remote.qr.step3')}</li>
            </ol>
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Loader2Icon className="size-3 animate-spin" /> {t('connect.qr.waiting')}
            </span>
            {qr.lan ? (
              <span className="text-muted-foreground flex flex-col font-mono">
                <span>
                  {t('remote.qr.lan', { address: `${qr.lan}:${qr.port}` })}
                </span>
                <span>
                  {t('remote.qr.outside', { address: `${qr.host}:${qr.port}` })}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground font-mono">
                {qr.host}:{qr.port}
              </span>
            )}
            <span className="text-muted-foreground">{t('remote.qr.untilUsed')}</span>
          </div>
        </div>
      ) : isConnected ? (
        <span className="text-status-working flex items-center gap-1">
          <CheckCircle2Icon className="size-3.5" /> {t('remote.qr.connected')}
        </span>
      ) : (
        <Banner tone="warning">
          {status.isTokenUsed
            ? t('remote.qr.tokenUsed')
            : t('remote.qr.hidden')}
        </Banner>
      )}
      {!status.connectHost && <Banner tone="error">{t('remote.qr.noHost')}</Banner>}
      {status.isLanOnly && status.mode === 'router' && <Banner tone="warning">{t('remote.qr.lanOnly')}</Banner>}
    </div>
  )
}

/** 공유기 안내 창 마지막 단계: QR 판 + 열쇠 경고 + 휴대폰 모두 끊기·닫기 */
function QrStep({ status, setStatus, onClose }: { status: RemoteStatus; setStatus: (s: RemoteStatus) => void; onClose: () => void }) {
  const handleRegenerate = async () => {
    if (!window.confirm(t('remote.regenerateConfirm'))) return
    setStatus(await window.office.regenerateRemoteQr())
  }
  return (
    <div className="flex flex-col gap-3 text-sm">
      <QrPanel status={status} />
      <div className="text-muted-foreground flex items-start gap-2 text-xs">
        <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" />
        {t('remote.qr.keyWarning')}
      </div>
      <DialogFooter>
        <Button variant="outline" className="border-destructive/60" onClick={() => void handleRegenerate()}>
          {t('remote.regenerateQr')}
        </Button>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogFooter>
    </div>
  )
}
