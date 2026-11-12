// 워크스페이스 조립 (Electron): 저장·창 묶음·총괄을 만들고 workspace:*·ws:* 통로를 연다
// main/index.ts는 이 함수 하나만 부른다. main/peer·main/remote·office.ts는 이 폴더를 import하지 않는다 (scripts/workspace.test.mts가 확인)

import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, ipcMain, nativeTheme, webContents } from 'electron'
import { openLinksInBrowser } from '../externalLinks'
import { WORKSPACE_COLOR_HEX } from '../../shared/workspace.ts'
import { createWorkspaceStore } from './workspaceStore.ts'
import { createWindowHub, type HubWindow } from './workspaceWindows.ts'
import { createWorkspaceService, noLinks } from './workspaceService.ts'

export interface WorkspacesDeps {
  userDataDir: string
  /** 이 PC 창 */
  local(): BrowserWindow | null
  showLocal(): void
  /** 기존 짝 목록에서 그 PC 이름 (없는 PC면 null) */
  peerName(peerId: string): string | null
  /** 원격 창 화면(remote.html)을 불러온다 */
  load(win: BrowserWindow): void
  preloadPath: string
  background(): string
  isWindows: boolean
}

const wrap = (w: BrowserWindow): HubWindow => {
  const senderId = w.webContents.id
  return {
    senderId,
    show: () => w.show(),
    hide: () => w.hide(),
    focus: () => w.focus(),
    isDestroyed: () => w.isDestroyed(),
    isVisible: () => w.isVisible() && !w.isMinimized(),
    getBounds: () => w.getBounds(),
    setBounds: (b) => w.setBounds(b),
    send: (channel, payload) => w.webContents.send(channel, payload),
    destroy: () => w.destroy(),
  }
}

/** 같은 페이지(주소·경로가 같음)로의 이동인지 — 원격 창이 다른 페이지로 옮겨 가지 않게 */
export function isSamePage(next: string, current: string) {
  try {
    const a = new URL(next)
    const b = new URL(current)
    return a.origin === b.origin && a.pathname === b.pathname
  } catch {
    return false
  }
}

export function createWorkspaces(deps: WorkspacesDeps) {
  const file = path.join(deps.userDataDir, 'workspaces.json')
  const store = createWorkspaceStore({
    read: () => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null),
    write: (text) => fs.writeFileSync(file, text),
  })
  const hub = createWindowHub({
    local: () => {
      const w = deps.local()
      return w && !w.isDestroyed() ? wrap(w) : null
    },
    showLocal: deps.showLocal,
    create: (workspaceId, partition, onClosed) => {
      const color = WORKSPACE_COLOR_HEX[store.get(workspaceId)?.color ?? 'teal'][nativeTheme.shouldUseDarkColors ? 'dark' : 'light']
      const w = new BrowserWindow({
        width: 1360,
        height: 860,
        minWidth: 1024,
        minHeight: 680,
        title: store.get(workspaceId)?.name ?? 'AI Office',
        show: false,
        // 윈도우 창 버튼 영역도 그 PC 색으로 (이 PC 창과 구분)
        ...(deps.isWindows ? { titleBarStyle: 'hidden', titleBarOverlay: { color, symbolColor: '#ffffff', height: 44 } } : { titleBarStyle: 'hiddenInset' }),
        backgroundColor: deps.background(),
        // 숨은 원격 창은 그림을 멈춰 CPU를 아낀다 (이 PC 창은 사무실 애니메이션 때문에 끈다)
        webPreferences: { preload: deps.preloadPath, partition, backgroundThrottling: true, contextIsolation: true, sandbox: true },
      })
      openLinksInBrowser(w.webContents)
      // 원격 창은 그 PC 화면만 — 카메라·마이크·알림 같은 권한은 모두 거절하고 remote.html 밖으로 옮겨 가지 않는다
      w.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
      w.webContents.session.setPermissionCheckHandler(() => false)
      w.webContents.on('will-navigate', (e, url) => {
        if (!isSamePage(url, w.webContents.getURL())) e.preventDefault()
      })
      w.on('closed', onClosed)
      deps.load(w)
      return wrap(w)
    },
  })
  const service = createWorkspaceService({
    store,
    hub,
    links: noLinks,
    peerName: deps.peerName,
    emit: (senderId, state) => webContents.fromId(senderId)?.send('workspace:onChange', state),
  })

  ipcMain.handle('workspace:state', (e) => service.state(e.sender.id))
  ipcMain.handle('workspace:switchTo', (e, target: unknown) => service.switchTo(e.sender.id, target))
  ipcMain.handle('workspace:add', (e, input: { peerId?: unknown; name?: unknown; color?: unknown }) => service.add(e.sender.id, input ?? {}))
  ipcMain.handle('workspace:update', (e, id: unknown, patch: { name?: unknown; color?: unknown }) => service.update(e.sender.id, id, patch ?? {}))
  ipcMain.handle('workspace:remove', (e, id: unknown) => service.remove(e.sender.id, id))
  ipcMain.on('ws:post', (e, text: unknown) => void service.post(e.sender.id, text))

  return {
    /** 원격 창이 보낸 IPC인지 — 이 PC용 office:* 핸들러가 거른다 */
    isRemoteSender: (senderId: number) => hub.ownerOf(senderId) !== null,
    /** Dock·트레이로 다시 띄울 때 보던 원격 창이 있으면 그 창 */
    showCurrent: () => hub.showCurrent(),
    /** 이 PC 창을 띄웠다 — 보던 원격 창은 숨긴다 */
    localShown: () => hub.localShown(),
    /** 이 PC 창이 닫히면 원격 창도 닫는다 (원격 창만 남아 앱이 안 꺼지는 일이 없게) */
    closeAll: () => hub.closeAll(),
  }
}

export type Workspaces = ReturnType<typeof createWorkspaces>
