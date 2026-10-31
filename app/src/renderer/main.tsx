import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { watchSystemMode } from '@/lib/uiTheme'

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
  void import('./App').then(({ default: App }) =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
}
