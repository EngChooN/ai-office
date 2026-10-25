// 개발 미리보기 진입: 가짜 셸 → 모바일 진입(어댑터 설치 → 화면) 그대로 → 주소 쿼리로 보여 줄 화면을 고른다
import './fakeShell'
import '../main'
import { useOffice, type View } from '@/store'
import { useMobileUi } from '../ui'

const p = new URLSearchParams(location.search)
// 첫 스냅샷이 들어온 뒤
setTimeout(() => {
  const s = useOffice.getState()
  if (p.get('view')) s.setView(p.get('view') as View)
  if (p.get('inside') === '1') s.setInside(true)
  if (p.get('select')) s.select(p.get('select'))
  if (p.get('hire') === '1') s.setHireOpen(true)
  if (p.get('more') === '1') useMobileUi.getState().setMoreOpen(true)
  if (p.get('pconly')) void window.office.resumeInTerminal('s1').then(() => window.office.openClaudeLogin())
}, 400)
// click=글자1,글자2: 그 글자가 든 첫 버튼을 차례로 누른다 (회의 카드 열기·"더 보기" 같은 화면 안 상태 캡처용)
p.get('click')
  ?.split(',')
  .forEach((label, i) =>
    setTimeout(
      () => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(label))?.click(),
      1000 + i * 500,
    ),
  )
if (p.get('scroll') === 'bottom') setTimeout(() => document.querySelectorAll('main .overflow-y-auto').forEach((el) => el.scrollTo({ top: el.scrollHeight })), 1500)
// 대화상자 안의 "폴더 선택"처럼, 열린 대화상자 위에 경로 입력 시트를 띄운다
if (p.get('path') === '1') setTimeout(() => void window.office.pickFolder(), 1500)

// 0.9.0 업데이트 안내는 PC 화면에서만 뜬다 — 캡처용으로 따로 띄운다 (upgrade=1)
if (p.get('upgrade') === '1') {
  void Promise.all([import('react'), import('react-dom/client'), import('@/features/RemoteUpgradeNotice')]).then(([{ createElement }, { createRoot }, { RemoteUpgradeNotice }]) => {
    const host = document.body.appendChild(document.createElement('div'))
    createRoot(host).render(createElement(RemoteUpgradeNotice))
  })
}
