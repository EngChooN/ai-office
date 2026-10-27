import { useEffect } from 'react'
import { create } from 'zustand'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { APP_VERSION, releasesFor } from '@/lib/changelog'
import { useLang } from '@/lib/i18n'
import { whatsNewAction } from '@/lib/whatsNew'
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

// 열림 여부를 밖에서도 본다 — 새 버전 안내 창이 이 창과 겹쳐 뜨지 않고 닫힌 뒤에 뜨도록
const useWhatsNewStore = create<{ isOpen: boolean }>(() => ({ isOpen: false }))
const setIsOpen = (isOpen: boolean) => useWhatsNewStore.setState({ isOpen })

/** 업데이트 소식 창이 지금 열려 있는지 */
export const useIsWhatsNewOpen = () => useWhatsNewStore((s) => s.isOpen)

/**
 * 업데이트 뒤 처음 켜면 이번 버전의 새로워진 점을 한 번 보여 준다 (처음 설치한 사람은 첫 실행 안내가 대신한다).
 * isBusy: 코치마크·튜토리얼 선택이 떠 있으면 닫힌 뒤로 미룬다 (튜토리얼 진행 중인지는 여기서 본다)
 */
export function WhatsNew({ isBusy }: { isBusy: boolean }) {
  const isLoaded = useOffice((s) => s.isLoaded)
  const isOnboarded = useOffice((s) => s.settings.isOnboarded)
  const isTutorialOn = useOffice((s) => Boolean(s.tutorial?.scenario))
  const setView = useOffice((s) => s.setView)
  const isOpen = useIsWhatsNewOpen()
  const lang = useLang()
  const release = releasesFor(lang).find((r) => r.version === APP_VERSION)

  useEffect(() => {
    if (isOpen) return
    const action = whatsNewAction({ isLoaded, isOnboarded, isBusy: isBusy || isTutorialOn, seen: readSeen(), version: APP_VERSION, hasRelease: Boolean(release) })
    if (action === 'open') setIsOpen(true)
    else if (action === 'markSeen') writeSeen()
  }, [isOpen, isLoaded, isOnboarded, isBusy, isTutorialOn, release])

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
