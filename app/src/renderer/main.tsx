import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { watchSystemMode } from '@/lib/uiTheme'
import { loadPage } from '@/layout/pages'

// OS별 여백·문구를 CSS(win: 변형)와 화면에서 나눠 쓰도록 <html>에 표시해 둔다
document.documentElement.dataset.platform = window.office.platform
watchSystemMode()

// 화면에서 난 오류를 피드백용 최근 오류 기록에 남긴다 (PC 앱 창만 officeErrors가 있다 — 메인이 가려서 넣는다)
if (window.officeErrors) {
  const report = window.officeErrors.report
  window.addEventListener('error', (e) => {
    if (/ResizeObserver loop/.test(e.message)) return // 화면 크기 바꿀 때 나는 무해한 경고
    report(e.error instanceof Error ? e.error.stack || e.message : e.message)
  })
  window.addEventListener('unhandledrejection', (e) => report(e.reason instanceof Error ? e.reason.stack || String(e.reason) : String(e.reason)))
}

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
