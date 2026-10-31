import './squirrelEvents' // Squirrel 설치·업데이트·제거 실행이면 바로가기만 처리하고 종료 — 다른 모듈보다 먼저 평가돼야 한다
import os from 'node:os'
import { acquireDataLock, quitForDataLock } from './dataLock'
import { cancelCodexLogin } from './ai/codexLogin'
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, Notification, shell } from 'electron'
import path from 'node:path'
import { loadRemoteConfig, openDb, saveRemoteConfig } from './db'
import { attachmentById, registerAttachmentScheme, saveUpload, serveAttachments } from './attachments'
import { Office } from './office'
import { OfficeTray } from './tray'
import { PetWindows } from './petWindow'
import { createOfficeHandlers, type OfficeHandlers } from './officeHandlers'
import { runAsRemote } from './remoteContext'
import { restrictRemoteArgs } from './remoteGuard'
import { IS_WINDOWS } from './platform'
import { RemoteService } from './remote/service.ts'
import { loadRemoteKeys, saveRemoteKeys } from './remote/keystore.ts'
import * as upnp from './remote/upnp.ts'
import { Secretary } from './secretary'
import { SECRETARY_FOCUS, SECRETARY_PAGE_FOCUS } from '../shared/types'
import { t } from '../shared/i18n/index.ts'
import { registerUpdates, type UpdateChecker } from './updates'
import { registerPack } from './staffPack'
import { registerSceneExport } from './sceneExport'
import { startedHidden, syncLoginItem } from './loginItem'
import { startLocalMcp, stopLocalMcp } from './mcp/localMcp'
import { configureAi } from './ai'
import { codexBinaryPath } from './ai/codex'
import { refreshCodexAssets } from './ai/codexAssets'
import { lastProviderStatus, providerStatus } from './setup'
import { WINDOW_BG, type UiMode } from '../shared/uiTheme'

registerAttachmentScheme()
const office = new Office()
let win: BrowserWindow | null = null

// 원격 접속(휴대폰): 기본 꺼짐. 설정에서 켤 때만 HTTPS 포트를 연다 (DB를 연 뒤에 만든다)
let remote: RemoteService | null = null
// PC 화면(IPC)과 원격 v2가 같은 처리 함수 표를 쓴다
let handlers: OfficeHandlers | null = null
// 비서: 처리 함수 표로 카드 단계를 실행하고, 자동결재 중 직원 질문에 대신 답한다 (DB를 연 뒤에 만든다)
let secretary: Secretary | null = null
// 업데이트 확인: 켤 때 한 번 + 6시간마다 (DB를 연 뒤에 만든다 — 건너뛴 버전을 읽는다)
let updates: UpdateChecker | null = null
function createRemote() {
  return new RemoteService({
    office: office.remotePort(),
    serverVersion: app.getVersion(),
    loadConfig: loadRemoteConfig,
    saveConfig: saveRemoteConfig,
    loadKeys: loadRemoteKeys,
    saveKeys: saveRemoteKeys,
    alert: (title, body) => new Notification({ title, body }).show(),
    changed: () => {
      if (remote) win?.webContents.send('office:onRemoteStatus', remote.status())
      tray.refresh()
    },
    upnp: { find: upnp.findGateway, add: upnp.addPortMapping, remove: upnp.deletePortMapping, external: upnp.externalAddress },
    v2: {
      // 원격 표시(📱 원격)를 단 채로 PC 화면과 같은 처리 함수를 부른다
      call: (method, args) => runAsRemote(() => (handlers![method] as (...a: unknown[]) => unknown)(...args)),
      restrict: (method, args) => restrictRemoteArgs(method, args, { defaultCwd: office.snapshot().settings.defaultCwd ?? '' }),
      attachment: attachmentById,
      saveUpload,
    },
  })
}
const remoteApi = () => {
  if (!remote) throw new Error('remote not ready')
  return remote
}
const QUICK_TASK_TITLE_MAX = 80
const QUICK_TASK_DETAIL_MAX = 4000
/** 앱 창을 띄우고(없으면 만들고) focus가 있으면 그 직원·비서를 연다 — 새로 연 창은 화면이 뜬 뒤에 보낸다 */
function showWindow(focus?: string) {
  const isNew = !win
  if (isNew) createWindow()
  win?.show()
  win?.focus()
  if (!focus) return
  if (isNew) win?.webContents.once('did-finish-load', () => win?.webContents.send('office:onFocus', focus))
  else win?.webContents.send('office:onFocus', focus)
}

const tray = new OfficeTray(
  {
    open: (staffId) => {
      showWindow(staffId)
      if (staffId) remote?.publish('focus', staffId)
    },
    decide: (approvalId, allow) => office.decide(approvalId, allow),
    setAutoApprove: (plan) => office.setAutoApprove(plan),
    setAutoFull: (isFull) => office.setAutoFull(isFull),
    stopAll: () => {
      const { stopped, autoWasOn } = office.stopAllWork()
      // 비상 정지는 자동결재도 함께 끈다 (M4) — 알림에 그 사실을 알린다
      const body = (stopped ? t('notify.stopped', { n: stopped }) : t('notify.nothingToStop')) + (autoWasOn ? t('notify.autoAlsoOff') : '')
      new Notification({ title: t('notify.stopAllTitle'), body }).show()
    },
    // 메뉴에서는 글을 받을 수 없어 클립보드 글로 만든다 (첫 줄 = 제목, 나머지 = 내용). 그대로 만들지 않고 확인 창을 띄운다 (M5)
    quickTask: async () => {
      const text = (await clipboard.readText()).trim()
      const [first = '', ...rest] = text.split('\n')
      if (!first.trim()) return void new Notification({ title: t('notify.addTaskTitle'), body: t('notify.copyFirst') }).show()
      const title = first.trim().slice(0, QUICK_TASK_TITLE_MAX)
      const detail = rest.join('\n').trim().slice(0, QUICK_TASK_DETAIL_MAX)
      const { response } = await dialog.showMessageBox({
        type: 'question',
        buttons: [t('dialog.add'), t('dialog.cancel')],
        defaultId: 0,
        cancelId: 1,
        message: t('dialog.clipboardTask'),
        detail: `${t('dialog.taskTitle', { title })}${detail ? `\n\n${detail.slice(0, 600)}${detail.length > 600 ? '…' : ''}` : ''}`,
      })
      if (response !== 0) return
      office.createTask({ title, detail, teamId: null })
      // 알림에는 내용을 넣지 않는다 (비밀번호·키가 클립보드에 있을 수 있음)
      new Notification({ title: t('notify.addTaskTitle'), body: t('notify.taskAdded') }).show()
    },
    setRemoteEnabled: (isOn) => {
      if (!isOn) return void remote?.disable()
      // 메뉴에서 바로 켜기 전에 한 번 확인 (설정의 안내를 건너뛰므로, L3)
      void dialog
        .showMessageBox({
          type: 'warning',
          buttons: [t('dialog.remoteOn'), t('dialog.cancel')],
          defaultId: 1,
          cancelId: 1,
          message: t('dialog.remoteAsk'),
          detail: t('dialog.remoteWarn'),
        })
        .then(({ response }) => {
          if (response === 0) void remote?.enable()
        })
    },
    // 메뉴바 "비서에게 말하기": 창을 띄우고 빠른 창(⌘K)을 연다
    talkToSecretary: () => showWindow(SECRETARY_FOCUS),
    // 숨겼거나 엉뚱한 곳에 있는 바탕화면 비서를 다시 불러온다 (맥)
    summonDeskPet: process.platform === 'darwin' ? () => pet.summon() : undefined,
  },
  () => {
    const r = remote?.status()
    return { today: office.todaySummary(), remote: r ? { isEnabled: r.isEnabled, isListening: r.isListening, port: r.port } : null }
  },
)

// 바탕화면 비서 캐릭터 (맥, 설정에서 켠다) — 결재는 앱 화면과 같은 처리 함수 표(handlers.decide)로
const pet = new PetWindows({
  snapshot: () => office.snapshot(),
  decide: (approvalId, allow) => (handlers!.decide as (id: string, allow: boolean) => boolean)(approvalId, allow),
  openApp: (target) => showWindow(target.kind === 'secretary' ? SECRETARY_PAGE_FOCUS : target.kind === 'staff' ? target.staffId : undefined),
  setOn: (isOn) => office.updateSettings({ isDeskPetOn: isOn }),
  load: (w, view) => {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) void w.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?view=${view}`)
    else void w.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), { query: { view } })
  },
  preloadPath: path.join(__dirname, 'petPreload.cjs'),
  background: () => windowColors().background,
})

/** 스냅샷처럼 앱 창과 비서 창이 함께 받는 이벤트 */
function broadcast(channel: string, payload: unknown) {
  for (const w of [win, ...pet.windows()]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
}

/** 바깥 UI 화면 모드를 nativeTheme에 맞춘다 — 화면의 prefers-color-scheme와 창 배경·윈도우 제목 표시줄 색이 같은 모드를 따른다 */
function syncNativeTheme(mode: UiMode) {
  if (nativeTheme.themeSource !== mode) nativeTheme.themeSource = mode
}

/** 지금 모드의 창 배경색 (첫 페인트 전·크기 바꿀 때 보이는 색) */
const windowColors = () => WINDOW_BG[nativeTheme.shouldUseDarkColors ? 'dark' : 'light']

function paintWindowChrome() {
  if (!win) return
  const c = windowColors()
  win.setBackgroundColor(c.background)
  if (IS_WINDOWS) win.setTitleBarOverlay({ color: c.background, symbolColor: c.symbol, height: 44 })
}

/** isHidden: 로그인 자동 실행으로 켜졌을 때 창을 띄우지 않는다 (Dock·트레이로 다시 연다) */
function createWindow(isHidden = false) {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: 'AI Office',
    show: !isHidden,
    // 맥은 신호등만 남기고, 윈도우는 오른쪽 위 창 버튼을 상단 바(h-11 = 44px) 위에 겹쳐 그린다 (색은 지금 모드의 --background, shared/uiTheme.ts WINDOW_BG)
    ...(IS_WINDOWS ? { titleBarStyle: 'hidden', titleBarOverlay: { color: windowColors().background, symbolColor: windowColors().symbol, height: 44 } } : { titleBarStyle: 'hiddenInset' }),
    backgroundColor: windowColors().background,
    // 다른 창에 가려져도 사무실 애니메이션·상태 갱신이 멈추지 않게 한다
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), backgroundThrottling: false },
  })
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  else win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  // 화면 안 외부 링크(설치 안내 등)는 기본 브라우저로 연다
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.on('closed', () => {
    win = null
    // 끝낼 때는 다음에 켤 때 settleStaleMeeting이 닫는다
    if (!isQuitting) office.endLiveDemos()
  })
  // 최소화·숨김 동안 화면이 사무실 그림(지도·미니 뷰)을 멈추게 알린다 — backgroundThrottling을 꺼서 화면은 스스로 알 수 없다
  // 이벤트 순간에는 isMinimized()·isVisible()이 아직 안 바뀌어 있을 수 있어 이벤트로 값을 정한다
  // 맥은 다른 창에 완전히 가려져도(occlusion) hide·show가 온다 — 가려진 동안도 멈춘다
  const sendShown = (isShown: boolean) => () => win?.webContents.send('window:shown', isShown)
  win.on('minimize', sendShown(false))
  win.on('hide', sendShown(false))
  win.on('restore', sendShown(true))
  win.on('show', sendShown(true))
}

/** renderer가 부르는 사무실 API — 채널 이름 = office:<메서드> */
function registerIpc() {
  handlers = createOfficeHandlers(office, remoteApi, () => secretary!)
  for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(`office:${name}`, (_e, ...args) => (fn as (...a: unknown[]) => unknown)(...args))
  // 화면을 다시 불러오면 지난 window:shown을 모른다 — 시작할 때 지금 값을 묻는다
  ipcMain.handle('window:isShown', () => Boolean(win?.isVisible() && !win.isMinimized()))
  // 설정 › 바탕화면 비서 "다시 불러오기" (앱 창에서만 — 원격 v2와 상관없어 OfficeApi 밖에 둔다)
  ipcMain.handle('pet:summon', (e) => {
    if (e.sender === win?.webContents) pet.summon()
  })

  office.on('snapshot', (s) => {
    syncNativeTheme(s.settings.uiMode)
    syncLoginItem(s.settings.launchAtLogin)
    broadcast('office:onSnapshot', s)
    tray.update(s)
    pet.update(s)
    remote?.publish('snapshot', s)
  })
  // 휴대폰(원격 v2 이벤트 스트림)에도 PC 화면이 받는 이벤트를 그대로 보낸다
  office.on('log', (entry) => {
    win?.webContents.send('office:onLog', entry)
    remote?.publish('log', entry)
  })
  office.on('chat', (m) => {
    win?.webContents.send('office:onChat', m)
    remote?.publish('chat', m)
  })
  // 결재 결과로 바뀐 단체방 메시지는 PC 화면만 갈아 끼운다 (같은 채널 — store가 id로 바꿔 넣는다)
  office.on('chatUpdate', (m) => win?.webContents.send('office:onChat', m))
  office.on('notify', ({ title, body, staffId }) => {
    const n = new Notification({ title, body })
    n.on('click', () => {
      win?.show()
      if (staffId) win?.webContents.send('office:onFocus', staffId)
      if (staffId) remote?.publish('focus', staffId)
    })
    n.show()
  })
}

// 윈도우 알림은 앱 ID가 있어야 이름과 함께 뜬다 (packagerConfig.appBundleId와 같게)
if (IS_WINDOWS) app.setAppUserModelId('com.joonyoung.claude-office')

app.whenReady().then(async () => {
  // 같은 데이터 폴더를 쓰는 다른 AI Office(설치본·개발 앱)가 켜져 있으면 DB를 열기 전에 멈춘다
  if (!acquireDataLock()) return quitForDataLock()
  // 개발 실행 때도 Dock에 앱 아이콘을 보여 준다 (설치본은 번들 아이콘을 쓴다)
  if (!app.isPackaged) app.dock?.setIcon(path.join(app.getAppPath(), 'build', 'icon.png'))
  openDb()
  await startLocalMcp() // office·secretary 도구 서버 (직원 세션이 열리기 전에)
  // 앱 내부 AI(비서·요약)는 설정과 마지막 감지 결과로 공급자를 고른다. 감지는 백그라운드로 한 번 돌려 둔다
  configureAi({ setting: () => office.snapshot().settings.internalAi, status: lastProviderStatus })
  void providerStatus()
    .then(() => Promise.all([refreshCodexAssets(codexBinaryPath(), [os.homedir()]), office.refreshCodexUsage()]))
    .catch(() => {})
  serveAttachments()
  secretary = new Secretary(office, () => handlers!)
  office.secretaryState = () => secretary?.state()
  office.answerWhileAway = (staff, questions) => secretary!.answerWhileAway(staff, questions)
  remote = createRemote()
  registerIpc()
  office.start()
  void remote.init()
  updates = registerUpdates(() => win)
  registerPack(() => office, () => win)
  registerSceneExport(() => win)
  // 로그인으로 켜졌으면 창을 띄우지 않는다 — 윈도우는 트레이를 끈 경우 보일 곳이 없어 띄운다
  const isHidden = startedHidden() && (process.platform === 'darwin' || office.snapshot().settings.isTrayOn)
  syncNativeTheme(office.snapshot().settings.uiMode)
  // 기기 모드가 바뀌거나 themeSource를 바꾸면 창 배경·제목 표시줄 색도 바꾼다
  nativeTheme.on('updated', paintWindowChrome)
  createWindow(isHidden)
  syncLoginItem(office.snapshot().settings.launchAtLogin)
  updates.start()
  // Dock 아이콘을 누르면 앱 창을 띄운다 — 앱 창을 닫고 바탕화면 비서 창만 남아 있어도 다시 만든다 (창 수가 아니라 win 기준)
  app.on('activate', () => showWindow())
})

let isQuitting = false
app.on('before-quit', (e) => {
  if (isQuitting) return
  isQuitting = true
  cancelCodexLogin()
  tray.destroy()
  pet.close()
  secretary?.stop()
  updates?.stop()
  office.stop()
  stopLocalMcp()
  if (!remote) return
  // 원격 포트와 공유기 매핑을 닫을 때까지 최대 3초 기다린 뒤 끝낸다 (매핑은 1시간 임대라 못 지워도 1시간 안에 사라진다)
  e.preventDefault()
  void remote.shutdown().finally(() => app.quit())
})
// 맥은 창을 닫아도 Dock에 남고, 윈도우는 트레이를 켜 두었으면 트레이에 남아 결재 알림을 계속 받는다
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !office.snapshot().settings.isTrayOn) app.quit()
})
