import { useEffect, useState } from 'react'
import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon, QrCodeIcon, ShieldAlertIcon, SmartphoneIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PcOnlyState } from '@/components/pc-only-state'
import { IS_MOBILE_SHELL } from '@/shell'
import { fmtDate, t } from '@shared/i18n'
import { ipcErrorText } from '@shared/ipcError'
import { formatPairCode, type PairWindowView } from '@shared/peerProtocol'
import { OPEN_REMOTE_GUIDE_EVENT } from './PeerSection'
import type { AccessEntry, RemoteMode, RemoteQr, RemoteStatus } from '@shared/types'
import { DuoIcon } from '@/components/duo-icon'

// 설정 › 휴대폰 연결: 켜기·끄기, 연결 방식(Tailscale·같은 네트워크 전용·고급 공유기 포트), Tailscale 단계 안내, 첫 연결 가이드(켜기 → 포트 → 공유기 → 주소 → QR), QR 다시 만들기, 지문, 최근 접속 기록
// 화면에는 토큰 원문·해시가 오지 않는다. QR 그림만 받아 보여 주고, 휴대폰이 붙으면(또는 QR을 다시 만들면) 거둔다 — 시간 제한은 없다

const STEP_KEYS = ['remote.step.on', 'remote.step.port', 'remote.step.router', 'remote.step.address', 'remote.step.qr'] as const
const RECENT_SHOWN = 5
const TAILSCALE_DOWNLOAD_URL = 'https://tailscale.com/download'
const TS_POLL_MS = 3000
const timeText = (ms: number) => fmtDate(ms, { hour: '2-digit', minute: '2-digit' })
const MODES: { mode: RemoteMode; label: string; desc?: string }[] = [
  { mode: 'tailscale', label: 'remote.mode.tailscale', desc: 'remote.mode.tailscale.desc' },
  { mode: 'lan', label: 'remote.mode.lan', desc: 'remote.lanMode.on' },
  { mode: 'router', label: 'remote.mode.router', desc: 'remote.mode.router.desc' },
]

function useRemoteStatus() {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  useEffect(() => {
    void window.office.remoteStatus().then(setStatus)
    return window.office.onRemoteStatus(setStatus)
  }, [])
  // Tailscale 방식이 열려 있는 동안 3초마다 상태를 다시 읽는다 (사용자가 로그인을 마치면 자동으로 다음 단계로).
  // 휴대폰은 PC의 Tailscale을 다시 확인할 수 없다(pc_only) — 바뀐 상태는 onRemoteStatus로 받는다
  const mode = status?.mode
  useEffect(() => {
    if (mode !== 'tailscale' || IS_MOBILE_SHELL) return
    const read = () => void window.office.refreshRemoteTailscale().then(setStatus)
    read()
    const timer = setInterval(read, TS_POLL_MS)
    return () => clearInterval(timer)
  }, [mode])
  return [status, setStatus] as const
}

/** 공유기 자동 설정 결과 한 줄 */
function upnpText(s: RemoteStatus) {
  if (s.upnp.state === 'trying') return t('remote.upnp.trying')
  if (s.upnp.state === 'ok') return t('remote.upnp.ok')
  if (s.upnp.state === 'failed') return t('remote.upnp.failed')
  return ''
}

export function RemoteSection() {
  const [status, setStatus] = useRemoteStatus()
  const [isGuideOpen, setIsGuideOpen] = useState(false)
  const [guideStep, setGuideStep] = useState(0)
  const [isLanModeChanged, setIsLanModeChanged] = useState(false)
  // 다른 PC 연결의 [원격 켜기]가 보내는 신호: 켜기 안내를 처음부터 연다
  useEffect(() => {
    const open = () => {
      setGuideStep(0)
      setIsGuideOpen(true)
    }
    window.addEventListener(OPEN_REMOTE_GUIDE_EVENT, open)
    return () => window.removeEventListener(OPEN_REMOTE_GUIDE_EVENT, open)
  }, [])
  if (!status) return null

  const openGuide = (step = 0) => {
    setGuideStep(step)
    setIsGuideOpen(true)
  }
  const handleToggle = async (isOn: boolean) => {
    if (isOn) return openGuide(0)
    setStatus(await window.office.setRemoteEnabled(false))
  }
  const handleRegenerate = async () => {
    if (!window.confirm(t('remote.regenerateConfirm'))) return
    setStatus(await window.office.regenerateRemoteQr())
    openGuide(4)
  }
  const handleMode = async (mode: RemoteMode) => {
    if (mode === status.mode) return
    setStatus(await window.office.setRemoteMode(mode))
    // 주소가 바뀌므로 이미 연결해 둔 휴대폰은 QR을 다시 찍어야 할 수 있다
    if (status.isEnabled) setIsLanModeChanged(true)
  }
  const handleTsNotice = async (isSwitch: boolean) => {
    if (isSwitch) await handleMode('tailscale')
    setStatus(await window.office.dismissRemoteTsNotice())
  }

  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={status.isEnabled} onChange={(e) => void handleToggle(e.target.checked)} /> {t('remote.enable')}
      </label>
      {status.isTsNoticePending && status.mode !== 'tailscale' && !IS_MOBILE_SHELL && (
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
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1 text-xs font-medium">{t('remote.mode')}</legend>
        {MODES.map((m) => (
          <label key={m.mode} className="flex items-start gap-2">
            <input type="radio" name="remote-mode" className="mt-1" checked={status.mode === m.mode} disabled={IS_MOBILE_SHELL} onChange={() => void handleMode(m.mode)} />
            <span>
              {t(m.label as 'remote.mode')}
              {status.mode === m.mode && m.desc && <span className="text-muted-foreground block text-xs">{t(m.desc as 'remote.mode')}</span>}
            </span>
          </label>
        ))}
        {IS_MOBILE_SHELL && <PcOnlyState />}
      </fieldset>
      {isLanModeChanged && <Banner tone="warning">{t('remote.mode.changed')}</Banner>}
      {status.mode === 'tailscale' && <TailscaleSteps status={status} setStatus={setStatus} />}
      {status.isEnabled && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
          <span className={status.isListening ? 'text-status-working' : 'text-status-error'}>● {status.isListening ? t('remote.on') : t('remote.notOpen')}</span>
          {status.connectHost && (
            <span className="text-muted-foreground">
              · {status.mode === 'tailscale' ? t('remote.tsAddress') : status.isLanOnly ? t('remote.lanAddress') : t('remote.externalAddress')} {status.connectHost}:{status.port}
            </span>
          )}
          {!status.connectHost && <span className="text-muted-foreground">· {t('remote.portLabel', { port: status.port })}</span>}
          {upnpText(status) && <span className={status.upnp.state === 'failed' ? 'text-status-waiting' : 'text-muted-foreground'}>· {upnpText(status)}</span>}
        </p>
      )}
      {status.error === 'port_in_use' && <Banner tone="error">{t('remote.error.portInUse', { port: status.port })}</Banner>}
      {status.error === 'start_failed' && <Banner tone="error">{t('remote.error.startFailed')}</Banner>}
      {status.error === 'no_network' && <Banner tone="warning">{status.mode === 'tailscale' ? t('remote.ts.error.waiting') : t('remote.error.noNetwork')}</Banner>}
      {status.isKeyRegenerated && <Banner tone="warning">{t('remote.keyRegenerated')}</Banner>}
      {status.lockedUntil && (
        <Banner tone="warning">{t('remote.locked', { time: timeText(status.lockedUntil) })}</Banner>
      )}
      <div className="flex flex-wrap gap-2">
        {status.isEnabled && status.isQrReady && (
          <Button size="sm" variant="outline" onClick={() => openGuide(4)}>
            <QrCodeIcon /> {t('remote.showQr')}
          </Button>
        )}
        {status.isEnabled && (
          <Button size="sm" variant="outline" className="border-destructive/60" onClick={() => void handleRegenerate()}>
            {t('remote.regenerateQr')}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => openGuide(0)}>
          {status.isEnabled ? t('remote.reopenGuide') : t('remote.start')}
        </Button>
      </div>
      {status.isEnabled && !IS_MOBILE_SHELL && <PhoneCode pairOpen={status.pairOpen} />}
      {status.fingerprint && (
        <p className="text-muted-foreground text-[11px]">
          {t('remote.fingerprint')} <span className="selectable font-mono break-all">{status.fingerprint}</span>
        </p>
      )}
      {status.recentAccess.length > 0 && <RecentAccess entries={status.recentAccess} />}
      <RemoteGuide status={status} setStatus={setStatus} isOpen={isGuideOpen} onOpenChange={setIsGuideOpen} step={guideStep} setStep={setGuideStep} />
    </>
  )
}

/** 휴대폰용 연결 코드(12자) — QR을 못 찍는 안드로이드가 주소+코드를 직접 입력할 때.
 *  시간 제한 없이 연결되거나(코드 1회용) 코드를 3번 틀리거나 다른 창을 열어 휴대폰용 창이 닫히면 화면에서 지운다 */
function PhoneCode({ pairOpen }: { pairOpen: RemoteStatus['pairOpen'] }) {
  const [win, setWin] = useState<PairWindowView | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (win && pairOpen !== 'phone') setWin(null)
  }, [win, pairOpen])
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

/** Tailscale 방식 단계 안내: 상태 줄 + ① PC 설치·로그인 ② 휴대폰 ③ QR. Tailscale을 대신 설치하지는 않는다 */
function TailscaleSteps({ status, setStatus }: { status: RemoteStatus; setStatus: (s: RemoteStatus) => void }) {
  const isRunning = status.tsState === 'running'
  const stateText = isRunning ? t('remote.ts.state.running', { address: status.tsAddress ?? '' }) : t(`remote.ts.state.${status.tsState}`)
  const stepClass = (isCurrent: boolean, isDone: boolean) => cn(isCurrent && 'text-foreground font-medium', isDone && 'text-status-working', !isCurrent && !isDone && 'text-muted-foreground')
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2.5 text-xs">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={isRunning ? 'text-status-working' : 'text-status-waiting'}>● {stateText}</span>
        {!isRunning && status.tsState === 'notInstalled' && (
          <Button size="sm" variant="outline" onClick={() => window.open(TAILSCALE_DOWNLOAD_URL)}>
            {t('remote.ts.download')}
          </Button>
        )}
        {!IS_MOBILE_SHELL && (
          <Button size="sm" variant="ghost" onClick={() => void window.office.refreshRemoteTailscale().then(setStatus)}>
            {t('remote.ts.recheck')}
          </Button>
        )}
      </p>
      <ol className="flex flex-col gap-0.5">
        <li className={stepClass(!isRunning, isRunning)}>
          {isRunning && <DuoIcon name="done" size={13} className="mr-1" />}
          {t('remote.ts.step1')}
        </li>
        <li className={stepClass(isRunning, false)}>{t('remote.ts.step2')}</li>
        <li className={stepClass(false, false)}>{t('remote.ts.step3')}</li>
      </ol>
      <p className="text-muted-foreground">{t('remote.ts.corp')}</p>
    </div>
  )
}

function Banner({ tone, children }: { tone: 'warning' | 'error' | 'ok'; children: React.ReactNode }) {
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
function RecentAccess({ entries }: { entries: AccessEntry[] }) {
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
function RemoteGuide({
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

/** QR 단계: 휴대폰이 처음 상태 조회에 성공하면 "연결됐어요" */
function QrStep({ status, setStatus, onClose }: { status: RemoteStatus; setStatus: (s: RemoteStatus) => void; onClose: () => void }) {
  const [qr, setQr] = useState<RemoteQr | null>(null)
  const [shownAt] = useState(() => Date.now())
  // 휴대폰이 붙으면 isQrReady가 false로 바뀌어 QR을 거둔다 (시간 제한은 없다)
  useEffect(() => {
    void window.office.remoteQr().then(setQr)
  }, [status.isQrReady, status.connectHost, status.port])
  const isConnected = status.recentAccess.some((e) => e.at >= shownAt && e.path === '/v1/status' && e.status === 200)
  const isVisible = Boolean(qr && status.isQrReady)

  const handleRegenerate = async () => {
    if (!window.confirm(t('remote.regenerateConfirm'))) return
    setStatus(await window.office.regenerateRemoteQr())
  }

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
