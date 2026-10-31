import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import type { OfficeSnapshot } from '../shared/types'
import { clampToArea, defaultPetBounds, InFlight, petDecide, placePanel, PET_SIZE, type PetOpenTarget, type Rect } from '../shared/deskPet'

// 바탕화면 비서(맥 1차): 캐릭터 창 + 펼침 창 두 개. 설정(isDeskPetOn)을 켜면 뜨고 끄면 창·IPC·화면 이벤트를 모두 정리한다
// 결재는 앱 화면과 같은 처리 함수(officeHandlers.decide)로만 처리하고, 질문·이미 끝난 결재는 거른다 (shared/deskPet.ts petDecide)
// 앱 종료 판단(window-all-closed)에는 끼지 않는다 — 맥은 원래 창을 닫아도 앱이 남는다

export interface PetDeps {
  snapshot(): OfficeSnapshot
  /** 앱 화면·휴대폰과 같은 결재 처리 함수 */
  decide(approvalId: string, allow: boolean): boolean
  openApp(target: PetOpenTarget): void
  /** 창에 화면을 불러온다 (?view=pet|panel) */
  load(win: BrowserWindow, view: 'pet' | 'panel'): void
  preloadPath: string
  background(): string
}

const POS_FILE = () => path.join(app.getPath('userData'), 'desk-pet.json')

function loadPos(): { x: number; y: number } | null {
  try {
    const p = JSON.parse(fs.readFileSync(POS_FILE(), 'utf8')) as { x?: unknown; y?: unknown }
    return typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : null
  } catch {
    return null
  }
}

function savePos(b: Rect) {
  try {
    fs.writeFileSync(POS_FILE(), JSON.stringify({ x: b.x, y: b.y }))
  } catch {
    // 위치 저장 실패는 다음에 기본 위치로 뜰 뿐이다
  }
}

const areaOf = (b: Rect): Rect => screen.getDisplayMatching(b).workArea

export class PetWindows {
  private pet: BrowserWindow | null = null
  private panel: BrowserWindow | null = null
  private dragFrom: Rect | null = null
  private inFlight = new InFlight()
  private isRegistered = false

  constructor(private deps: PetDeps) {}

  /** 스냅샷마다: 설정에 맞춰 띄우거나 정리한다 (맥만) */
  update(snap: OfficeSnapshot) {
    const isOn = process.platform === 'darwin' && snap.settings.isDeskPetOn
    if (isOn && !this.pet) this.open()
    else if (!isOn && this.pet) this.close()
  }

  /** 스냅샷을 받을 창들 (broadcast) */
  windows(): BrowserWindow[] {
    return [this.pet, this.panel].filter((w): w is BrowserWindow => !!w && !w.isDestroyed())
  }

  close() {
    this.panel?.destroy()
    this.pet?.destroy()
    this.panel = null
    this.pet = null
    this.dragFrom = null
    this.unregister()
  }

  private open() {
    this.register()
    const saved = loadPos()
    const start = saved ? { ...PET_SIZE, ...saved } : defaultPetBounds(screen.getPrimaryDisplay().workArea)
    const bounds = clampToArea(start, areaOf(start))
    const pet = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      // 눌러도 다른 앱에서 포커스를 빼앗지 않는다 (입력은 펼침 창에서)
      focusable: false,
      show: false,
      title: 'AI Office',
      webPreferences: { preload: this.deps.preloadPath, backgroundThrottling: false },
    })
    this.floatAbove(pet)
    // 투명한 곳은 클릭이 뒤 창으로 지나간다 — 캐릭터·말풍선 위에서만 화면이 다시 켠다 (pet:interactive)
    pet.setIgnoreMouseEvents(true, { forward: true })
    pet.once('ready-to-show', () => pet.showInactive())
    pet.on('closed', () => {
      if (this.pet === pet) this.pet = null
    })
    this.deps.load(pet, 'pet')
    this.pet = pet
  }

  /** 다른 창 위·모든 데스크톱·전체 화면 앱 위에 띄운다. skipTransformProcessType: Dock 아이콘이 사라지지 않게 */
  private floatAbove(win: BrowserWindow) {
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  }

  private ensurePanel(): BrowserWindow {
    if (this.panel && !this.panel.isDestroyed()) return this.panel
    const panel = new BrowserWindow({
      width: 340,
      height: 520,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      title: 'AI Office',
      backgroundColor: this.deps.background(),
      roundedCorners: true,
      webPreferences: { preload: this.deps.preloadPath, backgroundThrottling: false },
    })
    this.floatAbove(panel)
    panel.on('closed', () => {
      if (this.panel === panel) this.panel = null
    })
    this.deps.load(panel, 'panel')
    this.panel = panel
    return panel
  }

  private showPanel() {
    if (!this.pet) return
    const panel = this.ensurePanel()
    panel.setBounds(placePanel(this.pet.getBounds(), areaOf(this.pet.getBounds())))
    const reveal = () => {
      panel.show()
      panel.focus()
      panel.webContents.send('pet:panelShown')
    }
    if (panel.webContents.isLoading()) panel.webContents.once('did-finish-load', reveal)
    else reveal()
  }

  private hidePanel() {
    if (this.panel?.isVisible()) this.panel.hide()
  }

  /** 모니터를 빼거나 해상도가 바뀌면 화면 안으로 되돌린다 */
  private refit = () => {
    if (!this.pet) return
    const b = clampToArea(this.pet.getBounds(), areaOf(this.pet.getBounds()))
    this.pet.setBounds(b)
    if (this.panel?.isVisible()) this.panel.setBounds(placePanel(b, areaOf(b)))
  }

  /** 보낸 창이 캐릭터·펼침 창일 때만 받는다 (앱 창·다른 창이 pet:* 를 부르지 못하게) */
  private isMine(e: IpcMainEvent | IpcMainInvokeEvent) {
    return this.windows().some((w) => w.webContents === e.sender)
  }

  private on(channel: string, fn: (...args: unknown[]) => void) {
    ipcMain.on(channel, (e, ...args) => {
      if (this.isMine(e)) fn(...args)
    })
  }

  private register() {
    if (this.isRegistered) return
    this.isRegistered = true
    this.on('pet:interactive', (isOn) => this.pet?.setIgnoreMouseEvents(!isOn, { forward: true }))
    this.on('pet:dragStart', () => {
      this.dragFrom = this.pet?.getBounds() ?? null
      this.hidePanel()
    })
    this.on('pet:dragMove', (dx, dy) => {
      if (!this.pet || !this.dragFrom || typeof dx !== 'number' || typeof dy !== 'number') return
      this.pet.setBounds({ ...this.dragFrom, x: Math.round(this.dragFrom.x + dx), y: Math.round(this.dragFrom.y + dy) })
    })
    this.on('pet:dragEnd', () => {
      this.dragFrom = null
      if (!this.pet) return
      const b = clampToArea(this.pet.getBounds(), areaOf(this.pet.getBounds()))
      this.pet.setBounds(b)
      savePos(b)
    })
    this.on('pet:togglePanel', () => (this.panel?.isVisible() ? this.hidePanel() : this.showPanel()))
    this.on('pet:closePanel', () => this.hidePanel())
    this.on('pet:openApp', (target) => {
      this.hidePanel()
      this.deps.openApp(target as PetOpenTarget)
    })
    ipcMain.handle('pet:decide', (e, approvalId: unknown, allow: unknown) => {
      if (!this.isMine(e) || typeof approvalId !== 'string' || typeof allow !== 'boolean') return 'already'
      return petDecide({ staff: () => this.deps.snapshot().staff, decide: this.deps.decide, inFlight: this.inFlight }, approvalId, allow)
    })
    screen.on('display-removed', this.refit)
    screen.on('display-metrics-changed', this.refit)
  }

  private unregister() {
    if (!this.isRegistered) return
    this.isRegistered = false
    for (const ch of ['pet:interactive', 'pet:dragStart', 'pet:dragMove', 'pet:dragEnd', 'pet:togglePanel', 'pet:closePanel', 'pet:openApp']) ipcMain.removeAllListeners(ch)
    ipcMain.removeHandler('pet:decide')
    screen.off('display-removed', this.refit)
    screen.off('display-metrics-changed', this.refit)
  }
}
