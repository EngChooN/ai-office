import { useEffect, useState } from 'react'
import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon, QrCodeIcon, ShieldAlertIcon, SmartphoneIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { fmtDate, t } from '@shared/i18n'
import type { AccessEntry, RemoteQr, RemoteStatus } from '@shared/types'

// 설정 › 휴대폰 연결: 켜기·끄기, 첫 연결 가이드(켜기 → 포트 → 공유기 → 주소 → QR), QR 다시 만들기, 지문, 최근 접속 기록
// 화면에는 토큰 원문·해시가 오지 않는다. QR 그림만 잠깐 받아 보여 주고 5분 뒤 가린다

const STEP_KEYS = ['remote.step.on', 'remote.step.port', 'remote.step.router', 'remote.step.address', 'remote.step.qr'] as const
const RECENT_SHOWN = 5
const timeText = (ms: number) => fmtDate(ms, { hour: '2-digit', minute: '2-digit' })

function useRemoteStatus() {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  useEffect(() => {
    void window.office.remoteStatus().then(setStatus)
    return window.office.onRemoteStatus(setStatus)
  }, [])
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

  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={status.isEnabled} onChange={(e) => void handleToggle(e.target.checked)} /> {t('remote.enable')}
      </label>
      {status.isEnabled && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
          <span className={status.isListening ? 'text-status-working' : 'text-status-error'}>● {status.isListening ? t('remote.on') : t('remote.notOpen')}</span>
          {status.connectHost && (
            <span className="text-muted-foreground">
              · {status.isLanOnly ? t('remote.lanAddress') : t('remote.externalAddress')} {status.connectHost}:{status.port}
            </span>
          )}
          {!status.connectHost && <span className="text-muted-foreground">· {t('remote.portLabel', { port: status.port })}</span>}
          {upnpText(status) && <span className={status.upnp.state === 'failed' ? 'text-status-waiting' : 'text-muted-foreground'}>· {upnpText(status)}</span>}
        </p>
      )}
      {status.error === 'port_in_use' && <Banner tone="error">{t('remote.error.portInUse', { port: status.port })}</Banner>}
      {status.error === 'start_failed' && <Banner tone="error">{t('remote.error.startFailed')}</Banner>}
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
    if (next.isListening) setStep(2)
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
              {i < step ? '✓' : i + 1} {t(key)}
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
              <br />· {t('remote.guide.warnPort')}
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
                {isBusy && <Loader2Icon className="animate-spin" />} {t('remote.guide.tryRouter')}
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
  const [now, setNow] = useState(() => Date.now())
  const [shownAt] = useState(() => Date.now())
  useEffect(() => {
    void window.office.remoteQr().then(setQr)
  }, [status.isQrReady, status.connectHost, status.port])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const isConnected = status.recentAccess.some((e) => e.at >= shownAt && e.path === '/v1/status' && e.status === 200)
  const left = qr ? Math.max(0, qr.until - now) : 0
  const isVisible = Boolean(qr && left > 0)

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
            <span className="text-status-waiting">
              {t('remote.qr.hideIn', { time: `${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')}` })}
            </span>
            {isConnected && (
              <span className="text-status-working flex items-center gap-1">
                <CheckCircle2Icon className="size-3.5" /> {t('remote.qr.connected')}
              </span>
            )}
          </div>
        </div>
      ) : (
        <Banner tone="warning">
          {status.isTokenUsed
            ? t('remote.qr.tokenUsed')
            : t('remote.qr.hidden')}
        </Banner>
      )}
      {!status.connectHost && <Banner tone="error">{t('remote.qr.noHost')}</Banner>}
      {status.isLanOnly && <Banner tone="warning">{t('remote.qr.lanOnly')}</Banner>}
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
