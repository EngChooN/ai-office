import { useEffect, useRef, useState } from 'react'
import { ShieldAlertIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useOffice } from '@/store'
import { t } from '@shared/i18n'

// 0.9.0 업데이트 안내 (한 번만): 휴대폰 연결이 이제 PC 전체 조작이 됐다 — 이미 연결해 쓰던 사람의 휴대폰 권한이 커지므로 확인받는다
// 원격이 켜져 있고 휴대폰이 붙은 적이 있을 때만. 원격을 안 쓰던 사람은 띄우지 않고 본 것으로 둔다 (나중에 켜면 연결 가이드가 같은 내용을 알린다)

export function RemoteUpgradeNotice() {
  const isLoaded = useOffice((s) => s.isLoaded)
  const isSeen = useOffice((s) => s.settings.isFullAccessNoticeSeen)
  const setView = useOffice((s) => s.setView)
  const [isOpen, setIsOpen] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const isChecked = useRef(false)

  useEffect(() => {
    if (!isLoaded || isChecked.current) return
    isChecked.current = true
    if (isSeen) return
    void window.office.remoteStatus().then((s) => {
      if (s.isEnabled && s.isTokenUsed) setIsOpen(true)
      else void window.office.updateSettings({ isFullAccessNoticeSeen: true })
    })
  }, [isLoaded, isSeen])

  const close = () => {
    setIsOpen(false)
    void window.office.updateSettings({ isFullAccessNoticeSeen: true })
  }
  const handleRegenerate = async () => {
    setIsBusy(true)
    await window.office.regenerateRemoteQr()
    setIsBusy(false)
    close()
    // 새 QR은 설정 › 휴대폰 연결의 "QR 보기"에서
    setView('settings')
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlertIcon className="text-status-waiting size-4" /> {t('remoteUpgrade.title')}
          </DialogTitle>
          <DialogDescription className="text-foreground">{t('remoteUpgrade.body')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="border-destructive/60" disabled={isBusy} onClick={() => void handleRegenerate()}>
            {t('remote.regenerateQr')}
          </Button>
          <Button onClick={close}>{t('common.confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 0.13.0 같은 네트워크 전용 모드 안내 (한 번만): 예전 사용자는 지금처럼 밖에서도 붙으므로 새 옵션을 알리고 켜기를 권한다
// 원격이 꺼져 있으면 띄우지 않고 본 것으로 둔다 (설정 › 휴대폰 연결의 토글 설명이 같은 내용을 알린다). 위 안내가 먼저 닫힌 뒤에 띄운다
export function RemoteLanNotice() {
  const isLoaded = useOffice((s) => s.isLoaded)
  const isUpgradeSeen = useOffice((s) => s.settings.isFullAccessNoticeSeen)
  const [isOpen, setIsOpen] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const isChecked = useRef(false)

  useEffect(() => {
    if (!isLoaded || !isUpgradeSeen || isChecked.current) return
    isChecked.current = true
    void window.office.remoteStatus().then((s) => {
      if (!s.isLanNoticePending) return
      if (s.isEnabled) setIsOpen(true)
      else void window.office.dismissRemoteLanNotice()
    })
  }, [isLoaded, isUpgradeSeen])

  const close = () => {
    setIsOpen(false)
    void window.office.dismissRemoteLanNotice()
  }
  const handleTurnOn = async () => {
    setIsBusy(true)
    // 켜면 main이 안내도 본 것으로 저장한다
    await window.office.setRemoteLanOnly(true)
    setIsBusy(false)
    setIsOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlertIcon className="text-status-waiting size-4" /> {t('remoteLan.title')}
          </DialogTitle>
          <DialogDescription className="text-foreground">{t('remoteLan.body')}</DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-xs">{t('remote.lanMode.changed')}</p>
        <DialogFooter>
          <Button variant="outline" disabled={isBusy} onClick={close}>
            {t('remoteLan.later')}
          </Button>
          <Button disabled={isBusy} onClick={() => void handleTurnOn()}>
            {t('remoteLan.turnOn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
