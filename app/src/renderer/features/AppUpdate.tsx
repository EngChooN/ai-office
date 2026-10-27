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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('update.install.confirmTitle', { version })}</DialogTitle>
          <DialogDescription>{t('update.install.confirmDesc')}</DialogDescription>
        </DialogHeader>
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

/** 앱 안 설치 진행 줄 — 내려받는 중 · 확인 중 · 실패 이유 */
function InstallProgress() {
  const install = useUpdateStore((s) => s.status?.install)
  if (!install || install.phase === 'idle') return null
  if (install.phase === 'preparing') return <p className="text-sm">{t('update.install.preparing')}</p>
  if (install.phase === 'downloading') {
    return <p className="text-sm">{install.progress === null ? t('update.install.downloadingNoPct') : t('update.install.downloading', { pct: install.progress })}</p>
  }
  const message =
    install.installError === 'download'
      ? t('update.install.failed.download')
      : install.installError === 'verify'
        ? t('update.install.failed.verify')
        : t('update.install.failed.prepare')
  return <p className="text-destructive text-sm">{message}</p>
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
        <InstallProgress />
        <DialogFooter>
          <Button variant="outline" onClick={() => updateActions.skip(version)}>
            {t('update.later')}
          </Button>
          <Button variant="outline" onClick={handleDownload}>
            {t('update.download')}
          </Button>
          {status.canInstall && <Button onClick={() => setIsConfirmOpen(true)}>{t('update.install')}</Button>}
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
  const isInstalling = status.install.phase === 'downloading' || status.install.phase === 'preparing'
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t('update.notice.title', { version: status.latest.version })}</p>
      <ReleaseSummary notes={status.latest.notes} />
      <InstallProgress />
      <div className="flex flex-wrap gap-2">
        {status.canInstall && (
          <Button size="sm" className="w-fit" onClick={() => setIsConfirmOpen(true)} disabled={isInstalling}>
            {t('update.install')}
          </Button>
        )}
        <Button size="sm" variant={status.canInstall ? 'outline' : 'default'} className="w-fit" onClick={updateActions.download}>
          {t('update.download')}
        </Button>
      </div>
      <InstallConfirm version={status.latest.version} open={isConfirmOpen} onOpenChange={setIsConfirmOpen} />
    </div>
  )
}
