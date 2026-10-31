import { useEffect } from 'react'
import { useOffice } from '@/store'
import { useLang } from '@/lib/i18n'
import { PetCharacter } from './PetCharacter'
import { PetPanel } from './PetPanel'

// 바탕화면 비서 창의 뿌리: 스냅샷만 받아 store에 넣는다 (앱 창의 connectOffice보다 좁게 — 기록·단체방은 받지 않는다)

export function PetRoot() {
  useLang()
  const view = window.officePet!.view
  useEffect(() => {
    const { setSnapshot } = useOffice.getState()
    void window.office.snapshot().then(setSnapshot)
    return window.office.onSnapshot(setSnapshot)
  }, [])
  useEffect(() => {
    if (view !== 'pet') return
    // 캐릭터 창은 투명 — 앱 배경색을 지운다
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [view])
  return view === 'pet' ? <PetCharacter /> : <PetPanel />
}
