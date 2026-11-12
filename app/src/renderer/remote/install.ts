// 원격 창 진입 준비: window.office를 원격 어댑터로 채우고, 메인이 보낸 메시지(연결·resync)를 화면 상태에 잇는다
// 휴대폰(mobile/install.ts)과 같은 어댑터·통로를 쓰되 레이아웃·키보드·뒤로 가기는 없다 — mobile/install.ts는 고치지 않는다(휴대폰 회귀 0)
// main.tsx보다 먼저 실행돼야 한다 (remote/main.tsx가 이 파일을 먼저 import)

import { loadChatHistory, useOffice } from '@/store'
import { t } from '@shared/i18n'
import { createBridge, type BridgePort } from '../mobile/bridge'
import { createRemoteOffice, SCREEN_CAPABILITIES } from '../mobile/remoteOffice'
import { useRemoteUi } from './ui'

const raw = window.officeRemoteBridge
if (!raw) {
  document.body.textContent = 'This screen opens only inside AI Office.'
  throw new Error('officeRemoteBridge가 없어요')
}

// contextBridge 객체에는 onmessage를 대입할 수 없어 setOnMessage로 넘긴다
let onmessage: BridgePort['onmessage'] = null
const port: BridgePort = {
  postMessage: (text) => raw.postMessage(text),
  get onmessage() {
    return onmessage
  },
  set onmessage(fn) {
    onmessage = fn
    raw.setOnMessage(fn)
  },
}

const bridge = createBridge(port)
const session = createRemoteOffice(bridge, {
  // 원격에서는 그 PC의 폴더·파일을 고르지 않는다 (작업 폴더는 그 PC에서만 정한다)
  enterPath: async () => {
    useRemoteUi.getState().showNotice(t('workspace.remote.pcOnly'))
    return null
  },
  notice: (text) => useRemoteUi.getState().showNotice(text),
  confirm: (message) => window.confirm(message),
  pcChecked: (isoOffice) => {
    useRemoteUi.setState({ isPcOutdated: !isoOffice })
    if (isoOffice) void window.office.snapshot().then(useOffice.getState().setSnapshot)
  },
})
// 화면 틀(신호등·창 버튼 자리)은 이 PC의 OS를 따른다
window.office = { ...session.office, platform: window.officeRemoteShell?.platform ?? 'darwin' }

// 놓친 이벤트: 스냅샷·단체방·최근 기록을 다시 읽는다 (휴대폰과 같은 순서)
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
  if (msg.type === 'connection') useRemoteUi.setState({ connection: msg.state })
})

bridge.notify({ type: 'ready', features: [...SCREEN_CAPABILITIES] })
