import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { watchSystemMode } from '@/lib/uiTheme'
import { loadPage } from '@/layout/pages'

// OS별 여백·문구를 CSS(win: 변형)와 화면에서 나눠 쓰도록 <html>에 표시해 둔다
document.documentElement.dataset.platform = window.office.platform
watchSystemMode()

// 바탕화면 비서 창(petPreload가 officePet을 준다)은 앱 화면을 불러오지 않고 비서 창 화면만 띄운다
const root = createRoot(document.getElementById('root')!)
if (window.officePet) {
  void import('./deskPet/PetRoot').then(({ PetRoot }) =>
    root.render(
      <StrictMode>
        <PetRoot />
      </StrictMode>,
    ),
  )
} else {
  // 첫 화면(store.ts의 처음 view = 사무실 지도)은 App과 동시에 받기 시작해, 둘 다 오면 그린다 — 틀만 뜨고 본문이 비는 순간이 없게.
  // 받지 못해도 앱은 띄우고 그 자리는 "다시 시도" 안내로 (LoadErrorBoundary)
  const firstPage = loadPage('map').catch(() => {})
  void Promise.all([import('./App'), firstPage]).then(([{ default: App }]) =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
}
