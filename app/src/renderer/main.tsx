import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { watchSystemMode } from '@/lib/uiTheme'

// OS별 여백·문구를 CSS(win: 변형)와 화면에서 나눠 쓰도록 <html>에 표시해 둔다
document.documentElement.dataset.platform = window.office.platform
watchSystemMode()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
