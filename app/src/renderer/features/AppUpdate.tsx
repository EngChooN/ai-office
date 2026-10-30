import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { notifiableVersion, updateActions, useUpdateStore } from '@/lib/update'
import { fmtDate, t } from '@shared/i18n'
import { useIsWhatsNewOpen } from './WhatsNew'

/** Release 설명 요약 (안내 창·설정이 같이 쓴다) */
function ReleaseSummary({ notes }: { notes: string }) {
  if (!notes) return null
  return <p className="bg-muted/40 max-h-56 overflow-y-auto rounded-md border p-3 text-xs leading-relaxed whitespace-pre-wrap">{notes}</p>
}

/** 앱 안 설치 확인 — 앱이 꺼진다는 것을 먼저 알린다 */
function InstallConfirm({ version, open, onOpenChange }: { version: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const isWinZip = useUpdateStore((s) => s.status?.isWinZip)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('update.install.confirmTitle', { version })}</DialogTitle>
          <DialogDescription>{t('update.install.confirmDesc')}</DialogDescription>
        </DialogHeader>
        {isWinZip && <p className="text-muted-foreground text-sm">{t('update.install.zipNotice')}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('update.install.cancel')}
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false)
              updateActions.install()
            }}
          >
            {t('update.install.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 앱 안 설치 실패 이유 — 내려받는 중·확인 중 표시는 설치 버튼이 맡는다 */
function InstallError() {
  const install = useUpdateStore((s) => s.status?.install)
  if (install?.phase !== 'failed') return null
  const message =
    install.installError === 'download'
      ? t('update.install.failed.download')
      : install.installError === 'verify'
        ? t('update.install.failed.verify')
        : t('update.install.failed.prepare')
  return <p className="text-destructive text-sm">{message}</p>
}

/** '지금 업데이트' 버튼 — 내려받는 동안 버튼 안에 진행률을 채우고 눌리지 않게 막는다 */
function InstallButton({ size, onClick }: { size?: 'sm'; onClick: () => void }) {
  const install = useUpdateStore((s) => s.status?.install)
  const phase = install?.phase
  const isBusy = phase === 'downloading' || phase === 'preparing'
  const pct = phase === 'downloading' ? install?.progress ?? null : null
  const label =
    phase === 'preparing'
      ? t('update.install.preparing')
      : phase === 'downloading'
        ? pct === null
          ? t('update.install.downloadingNoPct')
          : t('update.install.downloading', { pct })
        : t('update.install')
  return (
    <Button size={size} className="relative w-fit overflow-hidden" onClick={onClick} disabled={isBusy} aria-busy={isBusy}>
      {pct !== null && <span aria-hidden className="bg-primary-foreground/25 absolute inset-y-0 left-0 transition-[width]" style={{ width: `${pct}%` }} />}
      <span className="relative">{label}</span>
    </Button>
  )
}

/** 새 버전 안내 — 새 버전을 처음 받으면 한 번 뜨고, 사이드바 배지로 다시 연다 (업데이트 소식 창이 떠 있으면 그 창을 닫은 뒤에) */
export function UpdateNotice() {
  const status = useUpdateStore((s) => s.status)
  const isNoticeOpen = useUpdateStore((s) => s.isNoticeOpen)
  const isWhatsNewOpen = useIsWhatsNewOpen()
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const isOpen = isNoticeOpen && !isWhatsNewOpen
  const version = notifiableVersion(status)
  if (!status?.latest || !version) return null

  const handleDownload = () => {
    updateActions.download()
    updateActions.closeNotice()
  }
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && updateActions.closeNotice()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('update.notice.title', { version })}</DialogTitle>
          <DialogDescription>{t('update.notice.desc', { current: status.current })}</DialogDescription>
        </DialogHeader>
        <ReleaseSummary notes={status.latest.notes} />
        <InstallError />
        <DialogFooter>
          <Button variant="outline" onClick={() => updateActions.skip(version)}>
            {t('update.later')}
          </Button>
          <Button variant="outline" onClick={handleDownload}>
            {t('update.download')}
          </Button>
          {status.canInstall && <InstallButton onClick={() => setIsConfirmOpen(true)} />}
        </DialogFooter>
        <InstallConfirm version={version} open={isConfirmOpen} onOpenChange={setIsConfirmOpen} />
      </DialogContent>
    </Dialog>
  )
}

/** 사이드바 '업데이트 소식' 옆 배지 — 알릴 새 버전이 있을 때만 */
export function useUpdateBadge(): string | null {
  return notifiableVersion(useUpdateStore((s) => s.status))
}

/** 설정 '업데이트 확인': 현재 버전 · [지금 확인] · 결과 */
export function UpdateSection() {
  const status = useUpdateStore((s) => s.status)
  const [isChecking, setIsChecking] = useState(false)
  const isBusy = isChecking || status?.state === 'checking'

  const handleCheck = async () => {
    setIsChecking(true)
    try {
      await updateActions.check()
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>{t('update.section.current', { version: status?.current ?? '' })}</span>
        <Button size="sm" variant="outline" onClick={() => void handleCheck()} disabled={isBusy}>
          {isBusy ? t('update.section.checking') : t('update.section.checkNow')}
        </Button>
        {status?.checkedAt && <span className="text-muted-foreground text-xs">{t('update.section.checkedAt', { time: fmtDate(status.checkedAt) })}</span>}
      </div>
      {!isBusy && <UpdateResult />}
    </div>
  )
}

function UpdateResult() {
  const status = useUpdateStore((s) => s.status)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  if (status?.state === 'upToDate') return <p className="text-sm">{t('update.section.upToDate')}</p>
  if (status?.state === 'failed') return <p className="text-muted-foreground text-sm">{t('update.section.failed')}</p>
  if (status?.state !== 'available' || !status.latest) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t('update.notice.title', { version: status.latest.version })}</p>
      <ReleaseSummary notes={status.latest.notes} />
      <InstallError />
      <div className="flex flex-wrap gap-2">
        {status.canInstall && <InstallButton size="sm" onClick={() => setIsConfirmOpen(true)} />}
        <Button size="sm" variant={status.canInstall ? 'outline' : 'default'} className="w-fit" onClick={updateActions.download}>
          {t('update.download')}
        </Button>
      </div>
      <InstallConfirm version={status.latest.version} open={isConfirmOpen} onOpenChange={setIsConfirmOpen} />
    </div>
  )
}
