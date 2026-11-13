import { useState } from 'react'
import { CheckIcon, CircleAlertIcon, CopyIcon, ExternalLinkIcon, Loader2Icon, LockIcon, MonitorIcon, RefreshCwIcon, SmartphoneIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { t } from '@shared/i18n'
import type { RemoteMode, RemoteStatus } from '@shared/types'
import { phoneAddAction, readinessOf } from '@shared/connectModel'
import { Banner, PhoneCode, QrPanel, RemoteGuide, TAILSCALE_DOWNLOAD_URL } from '../RemoteSection'
import { HostPart } from '../workspace/PairParts'

// 기기 추가 창(WorkspaceWizard)이 휴대폰·이 PC 보여 주기·다른 PC 보기 갈래에서 같이 쓰는 조각:
// 연결 방식 고르기 · Tailscale 준비물 안내(설치 링크) · 연결 켜기 · 휴대폰 QR · 이 PC 연결 코드. 상태는 설정 카드와 같은 useConnectData

/** Tailscale 공식 다운로드 페이지만 연다 (설치 파일을 대신 배포하지 않는다) */
export const TAILSCALE_LINKS = { pc: TAILSCALE_DOWNLOAD_URL, ios: `${TAILSCALE_DOWNLOAD_URL}/ios`, android: `${TAILSCALE_DOWNLOAD_URL}/android` } as const

export const MODES: { mode: RemoteMode; label: 'connect.mode.lan' | 'connect.mode.tailscale' | 'connect.mode.router'; desc: 'connect.mode.lanDesc' | 'connect.mode.tailscaleDesc' | 'connect.mode.routerDesc'; short: 'connect.mode.lanShort' | 'connect.mode.tailscaleShort' | 'connect.mode.routerShort' }[] = [
  { mode: 'tailscale', label: 'connect.mode.tailscale', desc: 'connect.mode.tailscaleDesc', short: 'connect.mode.tailscaleShort' },
  { mode: 'lan', label: 'connect.mode.lan', desc: 'connect.mode.lanDesc', short: 'connect.mode.lanShort' },
  { mode: 'router', label: 'connect.mode.router', desc: 'connect.mode.routerDesc', short: 'connect.mode.routerShort' },
]

/** 연결 방식 바꾸기·켜기 — 설정 카드와 기기 추가 창이 같은 규칙을 쓴다 */
export function useConnectActions(status: RemoteStatus | null, setStatus: (s: RemoteStatus) => void) {
  const [isBusy, setIsBusy] = useState(false)
  const [isModeChanged, setIsModeChanged] = useState(false)
  const changeMode = async (mode: RemoteMode) => {
    if (!status || mode === status.mode) return
    if (status.isEnabled && status.isTokenUsed && !window.confirm(t('connect.mode.changeConfirm'))) return
    setStatus(await window.office.setRemoteMode(mode))
    // 주소가 바뀌므로 이미 연결해 둔 휴대폰은 QR을 다시 찍어야 할 수 있다
    if (status.isEnabled) setIsModeChanged(true)
  }
  // 켜기: 기기 추가 창의 안전 한 줄을 읽고 누른 것이므로 업데이트 안내(RemoteUpgradeNotice)는 띄우지 않는다
  const turnOn = async () => {
    if (!status) return
    setIsBusy(true)
    try {
      const next = await window.office.setRemoteEnabled(true, status.port)
      setStatus(next)
      if (next.isEnabled) void window.office.updateSettings({ isFullAccessNoticeSeen: true })
    } finally {
      setIsBusy(false)
    }
  }
  return { isBusy, isModeChanged, changeMode, turnOn }
}

/** 연결 방식 세 갈래 (추천이 맨 위) */
export function ModePicker({ status, onPick }: { status: RemoteStatus; onPick: (m: RemoteMode) => void }) {
  return (
    <div className="grid gap-2">
      {MODES.map((m) => (
        <button key={m.mode} type="button" aria-pressed={status.mode === m.mode} onClick={() => onPick(m.mode)} className={cn('hover:bg-accent flex flex-col gap-1 rounded-lg border p-3 text-left', status.mode === m.mode && 'border-primary bg-accent')}>
          <span className="text-sm font-medium">{t(m.label)}</span>
          <span className="text-muted-foreground text-xs">{t(m.desc)}</span>
        </button>
      ))}
      <p className="text-muted-foreground text-xs">{t('connect.mode.unsure')}</p>
    </div>
  )
}

const LinkButton = ({ href, label, variant = 'outline' }: { href: string; label: string; variant?: 'outline' | 'default' }) => (
  <Button size="sm" variant={variant} onClick={() => window.open(href)}>
    {label} <ExternalLinkIcon />
  </Button>
)

/**
 * 준비물: Tailscale이 무엇인지 · 이 PC 상태(✓·! + 설치 링크·다시 확인) · 상대 기기(휴대폰은 iPhone·Android 링크, PC는 그 PC에서 할 일 — pc = 이 PC가 볼 PC, viewer = 이 PC를 볼 PC).
 * 같은 와이파이·공유기 방식(휴대폰·이 PC 보여 주기)이나 같은 와이파이(다른 PC 보기)면 Tailscale 없이 짧은 안내만
 */
export function TailscaleGuide({ status, setStatus, other, isTailscale }: { status: RemoteStatus; setStatus: (s: RemoteStatus) => void; other: 'phone' | 'pc' | 'viewer'; isTailscale: boolean }) {
  const [isCopied, setIsCopied] = useState(false)
  if (!isTailscale) return <p className="text-muted-foreground text-sm">{t(other === 'phone' ? 'connect.guide.sameWifiPhone' : 'connect.guide.sameWifiPc')}</p>
  const pc = status.tsState === 'running' ? 'ok' : status.tsState
  const copyAddress = () => {
    void navigator.clipboard.writeText(TAILSCALE_LINKS.pc)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 1500)
  }
  return (
    <div className="flex flex-col gap-2.5 text-xs">
      <div className="bg-accent rounded-lg p-3">
        <p className="text-sm font-medium">{t('connect.guide.what')}</p>
        <p className="text-muted-foreground mt-0.5">{t(other === 'phone' ? 'connect.guide.whatPhone' : 'connect.guide.whatPc')}</p>
      </div>
      <div className="flex flex-wrap items-start gap-2 rounded-lg border p-2.5">
        <MonitorIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t('connect.guide.thisPc')}</p>
          {pc === 'ok' ? (
            <p className="text-status-working flex items-center gap-1">
              <CheckIcon className="size-3.5" /> {t('connect.guide.ready')}
            </p>
          ) : (
            <p className="text-status-waiting flex items-center gap-1">
              <CircleAlertIcon className="size-3.5" /> {t(`connect.ts.${pc}`)} · <span className="text-muted-foreground">{t(`connect.ts.${pc}Desc`)}</span>
            </p>
          )}
        </div>
        {pc !== 'ok' && (
          <span className="flex gap-1">
            {pc === 'notInstalled' && <LinkButton href={TAILSCALE_LINKS.pc} label={t('connect.guide.pcDownload')} variant="default" />}
            <Button size="sm" variant="ghost" onClick={() => void window.office.refreshRemoteTailscale().then(setStatus)}>
              {t('remote.ts.recheck')}
            </Button>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-2 rounded-lg border p-2.5">
        {other === 'phone' ? <SmartphoneIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" /> : <MonitorIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t(other === 'phone' ? 'connect.guide.phone' : 'connect.guide.otherPc')}</p>
          <p className="text-muted-foreground">{t(other === 'phone' ? 'connect.guide.phoneDesc' : 'connect.guide.otherPcDesc')}</p>
          {other !== 'phone' && <p className="text-muted-foreground mt-1">{t(other === 'pc' ? 'connect.guide.otherPcApp' : 'connect.guide.viewerApp')}</p>}
        </div>
        <span className="flex flex-wrap gap-1">
          {other === 'phone' ? (
            <>
              <LinkButton href={TAILSCALE_LINKS.ios} label="iPhone" />
              <LinkButton href={TAILSCALE_LINKS.android} label="Android" />
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={copyAddress}>
              <CopyIcon /> {t(isCopied ? 'peer.host.copied' : 'connect.guide.copyLink')}
            </Button>
          )}
        </span>
      </div>
      <p className="text-muted-foreground flex items-center gap-1.5">
        <RefreshCwIcon className="size-3" /> {t('connect.ready.auto')}
      </p>
      <p className="text-muted-foreground">
        {t('remote.ts.corp')} {t('connect.guide.official')}
      </p>
    </div>
  )
}

/** 이 PC 연결이 꺼져 있으면 켜기 한 줄 (공유기 방식은 5단계 안내 창이 켠다) */
export function TurnOnRow({ status, setStatus, isBusy, onTurnOn, hint }: { status: RemoteStatus; setStatus: (s: RemoteStatus) => void; isBusy: boolean; onTurnOn: () => void; hint: string }) {
  const [isGuideOpen, setIsGuideOpen] = useState(false)
  const [guideStep, setGuideStep] = useState(0)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <LockIcon className="mt-0.5 size-3.5 shrink-0" /> {t('connect.safety')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={isBusy}
          onClick={() => {
            if (status.mode !== 'router') return onTurnOn()
            setGuideStep(0)
            setIsGuideOpen(true)
          }}
        >
          {isBusy && <Loader2Icon className="animate-spin" />} {t('connect.turnOn')}
        </Button>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </div>
      <RemoteGuide status={status} setStatus={setStatus} isOpen={isGuideOpen} onOpenChange={setIsGuideOpen} step={guideStep} setStep={setGuideStep} />
    </div>
  )
}

/** 휴대폰 연결: 켜기 → (이미 휴대폰이 있으면 바꾸기 확인) → QR·코드 */
export function PhoneConnect({ status, setStatus, isBusy, onTurnOn }: { status: RemoteStatus; setStatus: (s: RemoteStatus) => void; isBusy: boolean; onTurnOn: () => void }) {
  const [isReplaceOk, setIsReplaceOk] = useState(false)
  if (!status.isEnabled || !status.isListening) return <TurnOnRow status={status} setStatus={setStatus} isBusy={isBusy} onTurnOn={onTurnOn} hint={t('connect.turnOnHint')} />
  if (phoneAddAction(status) === 'replace' && !isReplaceOk)
    return (
      <Banner tone="warning">
        <p>{t('connect.replace.desc')}</p>
        <Button
          size="sm"
          className="mt-1.5"
          onClick={async () => {
            setStatus(await window.office.regenerateRemoteQr())
            setIsReplaceOk(true)
          }}
        >
          {t('connect.replace.go')}
        </Button>
      </Banner>
    )
  return (
    <div className="flex flex-col gap-3">
      <QrPanel status={status} />
      <PhoneCode pairOpen={status.pairOpen} />
      <p className="text-muted-foreground text-xs">{t('connect.qr.oneTime')}</p>
    </div>
  )
}

/** 이 PC 보여 주기: 켜기 → 연결 코드 */
export function HostConnect({ status, setStatus, isBusy, onTurnOn }: { status: RemoteStatus; setStatus: (s: RemoteStatus) => void; isBusy: boolean; onTurnOn: () => void }) {
  if (!status.isEnabled || !status.isListening) return <TurnOnRow status={status} setStatus={setStatus} isBusy={isBusy} onTurnOn={onTurnOn} hint={t('connect.turnOnHintPc')} />
  return (
    <div className="rounded-lg border p-3">
      <HostPart onSlotsChanged={() => {}} />
    </div>
  )
}

/** 휴대폰·이 PC 보여 주기의 준비물 장을 넘어갈 수 있는지 (이 PC Tailscale) */
export const isThisPcReady = (status: RemoteStatus | null) => Boolean(status && readinessOf(status).isReady)
