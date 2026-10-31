// 모바일 빌드 진입 준비: window.office를 원격 어댑터로 채우고, 셸 메시지(연결·뒤로 가기·resync)를 화면 상태에 잇는다
// main.tsx보다 먼저 실행돼야 한다 (mobile/main.tsx가 이 파일을 먼저 import)

import { loadChatHistory, useOffice } from '@/store'
import { isPhoneLayout } from '@/layout/useLayout'
import { createLayoutTracker, setLayoutState } from '@/layout/layoutState'
import { createBridge } from './bridge'
import { createRemoteOffice, SCREEN_CAPABILITIES } from './remoteOffice'
import { useMobileUi } from './ui'

const port = window.OfficeBridge
if (!port) {
  // 휴대폰 앱 밖(일반 브라우저)에서 열면 PC와 이어질 길이 없다
  document.body.textContent = '이 화면은 AI Office 휴대폰 앱 안에서만 열려요.'
  throw new Error('OfficeBridge가 없어요')
}

const bridge = createBridge(port)
const session = createRemoteOffice(bridge, {
  enterPath: (kind) => useMobileUi.getState().requestPath(kind),
  notice: (text) => useMobileUi.getState().showNotice(text),
  // 셸이 onJsConfirm으로 네이티브 확인창을 띄운다 (android-bridge.md 4절)
  confirm: (message) => window.confirm(message),
  shouldDeliverFocus: () => !isPhoneLayout(),
  // 이벤트 스트림이 hello보다 먼저 열려 첫 스냅샷이 Lv.10으로 줄어 왔을 수 있다 → 새 PC로 확인되면 다시 읽어 덮어쓴다
  pcChecked: (isoOffice) => {
    useMobileUi.setState({ isPcOutdated: !isoOffice })
    if (isoOffice) void window.office.snapshot().then(useOffice.getState().setSnapshot)
  },
})
window.office = session.office
document.documentElement.dataset.shell = 'mobile'

// 놓친 이벤트: 스냅샷·단체방·최근 기록을 다시 읽는다
session.onResync(() => {
  const { setSnapshot, liveLogs } = useOffice.getState()
  void window.office.snapshot().then(setSnapshot)
  loadChatHistory()
  const since = liveLogs.at(-1)?.ts ?? Date.now() - 60 * 60_000
  void window.office.timeline(since).then((logs) => {
    const seen = new Set(useOffice.getState().liveLogs.map((l) => l.id))
    const fresh = logs.filter((l) => !seen.has(l.id))
    if (fresh.length) useOffice.setState((s) => ({ liveLogs: [...s.liveLogs, ...fresh].sort((a, b) => a.ts - b.ts).slice(-500) }))
  })
})

bridge.on((msg) => {
  if (msg.type === 'event') useMobileUi.setState({ lastEventAt: Date.now() })
  if (msg.type === 'connection') {
    const s = useMobileUi.getState()
    const isBack = msg.state === 'open' && s.wasOpen && s.connection !== 'open'
    useMobileUi.setState({ connection: msg.state, wasOpen: s.wasOpen || msg.state === 'open', ...(isBack ? { reconnectedAt: Date.now() } : {}) })
  }
  if (msg.type === 'back') bridge.notify({ type: 'backResult', handled: handleBack() })
})

/** 안드로이드 뒤로 가기: 열린 대화상자·시트 → 직원 패널 → 직전 탭. 닫을 게 없으면 false (셸이 앱을 뒤로 보낸다) */
export function handleBack(): boolean {
  // 대화상자·아래 시트(더보기·경로 입력 포함)는 모두 Radix Dialog — Esc와 같은 길로 닫는다
  const dialogs = document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')
  const top = dialogs[dialogs.length - 1]
  if (top) {
    top.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
    return true
  }
  const office = useOffice.getState()
  if (office.selectedId) {
    office.select(null)
    return true
  }
  const { history } = useMobileUi.getState()
  const prev = history.at(-1)
  if (!prev) return false
  isGoingBack = true
  useMobileUi.setState({ history: history.slice(0, -1) })
  office.setView(prev)
  isGoingBack = false
  return true
}

// 화면을 옮길 때마다 지난 화면을 기록한다 (뒤로 가기로 돌아갈 때는 기록하지 않는다)
let isGoingBack = false
const HISTORY_MAX = 20
useOffice.subscribe((s, prev) => {
  if (s.view === prev.view || isGoingBack) return
  useMobileUi.setState((u) => ({ history: [...u.history.filter((v) => v !== prev.view), prev.view].slice(-HISTORY_MAX) }))
})

// 폰·태블릿 배치와 키보드: 판정은 layoutState.ts (키보드를 뺀 높이로 — 입력 중에 배치가 바뀌어 입력칸이 다시 만들어지지 않게)
// 결과는 <html data-layout="phone" data-short>(CSS phone:·short:)와 useLayout(틀 고르기)이 같이 본다
const tracker = createLayoutTracker({ width: window.innerWidth, height: window.innerHeight })
let ime = 0
const isTyping = () => {
  const el = document.activeElement
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'file', 'range', 'color', 'submit', 'reset'].includes(el.type)) || (el as HTMLElement | null)?.isContentEditable === true
}
const applyLayout = () => {
  const next = tracker.update({ width: window.innerWidth, height: window.innerHeight, ime, isTyping: isTyping() })
  const root = document.documentElement
  if (next.isPhone) root.dataset.layout = 'phone'
  else delete root.dataset.layout
  if (next.isShort) root.dataset.short = ''
  else delete root.dataset.short
  if (next.isKeyboardOpen) root.dataset.keyboard = ''
  else delete root.dataset.keyboard
  setLayoutState(next)
  if (next.isKeyboardOpen !== useMobileUi.getState().isKeyboardOpen) useMobileUi.setState({ isKeyboardOpen: next.isKeyboardOpen })
}
applyLayout()
window.addEventListener('resize', applyLayout)
// 포커스가 옮겨진 뒤 키보드가 올라오고 내려가는 시간을 기다린다
document.addEventListener('focusin', () => setTimeout(applyLayout, 300))
document.addEventListener('focusout', () => setTimeout(applyLayout, 100))
bridge.on((msg) => {
  if (msg.type !== 'insets') return
  // 셸도 <html>에 같은 --ime를 넣어 주지만, 메시지만 와도 되도록 여기서도 맞춘다
  ime = msg.ime
  document.documentElement.style.setProperty('--ime', `${msg.ime}px`)
  applyLayout()
})
// 시트 안 입력칸은 키보드에 가리지 않게 보이는 곳으로 (아래에 붙은 입력칸은 이미 키보드 위에 있다)
document.addEventListener('focusin', (e) => {
  const el = e.target as HTMLElement
  if (el.closest('[role="dialog"]')) setTimeout(() => el.scrollIntoView({ block: 'nearest' }), 350)
})

// features:['ime'] = 키보드는 화면이 --ime로 비킨다 → 셸은 WebView 크기를 줄이지 않는다 (android-bridge.md "키보드")
// 'iso-office' = 회사 레벨 11 이상을 그릴 수 있다 → 셸이 /v2/call·/v2/events 헤더 X-Office-Capabilities로 PC에 알린다 (없으면 PC가 Lv.10으로 줄여 보냄)
bridge.notify({ type: 'ready', features: ['ime', ...SCREEN_CAPABILITIES] })
