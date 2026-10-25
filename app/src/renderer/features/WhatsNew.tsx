import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { APP_VERSION, releasesFor } from '@/lib/changelog'
import { useLang } from '@/lib/i18n'
import { useOffice } from '@/store'
import { t } from '@shared/i18n'
import { ReleaseNotes } from './UpdatesPage'

const SEEN_KEY = 'office:lastSeenVersion'

// 마지막으로 본 버전은 이 기기에서만 기억하면 충분하다 (못 읽으면 소식 창을 안 띄운다)
function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return APP_VERSION
  }
}

function writeSeen() {
  try {
    localStorage.setItem(SEEN_KEY, APP_VERSION)
  } catch {
    // 저장 못 해도 다음에 한 번 더 보일 뿐이다
  }
}

/** 업데이트 뒤 처음 켜면 이번 버전의 새로워진 점을 한 번 보여 준다 (처음 설치한 사람은 첫 실행 안내가 대신한다) */
export function WhatsNew() {
  const isOnboarded = useOffice((s) => s.isLoaded && s.settings.isOnboarded)
  const setView = useOffice((s) => s.setView)
  const [isOpen, setIsOpen] = useState(false)
  const lang = useLang()
  const release = releasesFor(lang).find((r) => r.version === APP_VERSION)

  useEffect(() => {
    if (!isOnboarded) return
    if (readSeen() !== APP_VERSION && release) setIsOpen(true)
    else writeSeen()
  }, [isOnboarded, release])

  const close = () => {
    writeSeen()
    setIsOpen(false)
  }
  const handleHistory = () => {
    close()
    setView('updates')
  }

  if (!release) return null
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>🎉 {t('whatsNew.title', { version: APP_VERSION })}</DialogTitle>
          <DialogDescription>{t('whatsNew.desc')}</DialogDescription>
        </DialogHeader>
        <ReleaseNotes release={release} />
        <DialogFooter>
          <Button variant="outline" onClick={handleHistory}>
            {t('whatsNew.history')}
          </Button>
          <Button onClick={close}>{t('common.confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
