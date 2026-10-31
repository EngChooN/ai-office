import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, ipcMain, powerMonitor, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import type { OfficeSnapshot } from '../shared/types'
import {
  clampToArea,
  defaultPetBounds,
  InFlight,
  listenAll,
  petAlignFor,
  petCharRect,
  petDecide,
  petLayout,
  petOpacity,
  petSize,
  PET_SIZE_RANGE,
  placePanel,
  REFIT_EVENTS,
  resizePet,
  settlePet,
  type EventSource,
  type PetAlign,
  type PetOpenTarget,
  type Rect,
} from '../shared/deskPet'

// 바탕화면 비서(맥 1차): 캐릭터 창 + 펼침 창 두 개. 설정(isDeskPetOn)을 켜면 뜨고 끄면(숨기기 포함) 창·IPC·화면/전원 이벤트를 모두 정리한다
// 결재는 앱 화면과 같은 처리 함수(officeHandlers.decide)로만 처리하고, 질문·이미 끝난 결재는 거른다 (shared/deskPet.ts petDecide)
// 앱 종료 판단(window-all-closed)에는 끼지 않는다 — 맥은 원래 창을 닫아도 앱이 남는다

export interface PetDeps {
  snapshot(): OfficeSnapshot
  /** 앱 화면·휴대폰과 같은 결재 처리 함수 */
  decide(approvalId: string, allow: boolean): boolean
  openApp(target: PetOpenTarget): void
  /** 설정의 "바탕화면 비서 캐릭터 보이기"를 바꾼다 (숨기기·다시 불러오기) */
  setOn(isOn: boolean): void
  /** 창에 화면을 불러온다 (?view=pet|panel) */
  load(win: BrowserWindow, view: 'pet' | 'panel'): void
  preloadPath: string
  background(): string
}

const POS_FILE = () => path.join(app.getPath('userData'), 'desk-pet.json')

function loadPos(): (Rect & { align?: PetAlign }) | null {
  try {
    const p = JSON.parse(fs.readFileSync(POS_FILE(), 'utf8')) as Partial<Record<keyof Rect | 'align', unknown>>
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return null
    // 크기 없이 저장된 예전 기록은 지금 크기로 본다 (open에서 resizePet이 다시 잰다)
    const { window } = petLayout(PET_SIZE_RANGE.default)
    const align = p.align === 'left' || p.align === 'right' ? p.align : undefined
    return { x: p.x, y: p.y, width: typeof p.width === 'number' ? p.width : window.width, height: typeof p.height === 'number' ? p.height : window.height, align }
  } catch {
    return null
  }
}

/** 서는 쪽도 함께 기억한다 — 같은 창 위치라도 서는 쪽에 따라 캐릭터 자리가 달라서 */
function savePos(b: Rect, align: PetAlign) {
  try {
    fs.writeFileSync(POS_FILE(), JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, align }))
  } catch {
    // 위치 저장 실패는 다음에 기본 위치로 뜰 뿐이다
  }
}

const areaOf = (b: Rect): Rect => screen.getDisplayMatching(b).workArea
/** 잠자기·모니터 변경 직후에는 화면 정보가 늦게 바뀌는 일이 있어 한 번 더 맞춘다 */
const REFIT_AGAIN_MS = 800
const PET_CHANNELS = ['pet:interactive', 'pet:dragStart', 'pet:dragMove', 'pet:dragEnd', 'pet:togglePanel', 'pet:closePanel', 'pet:openApp', 'pet:hide']

export class PetWindows {
  private pet: BrowserWindow | null = null
  private panel: BrowserWindow | null = null
  /** 펼침 창을 보여 줘야 하는지 — 화면을 불러오는 중에 열고 닫아도 다 불러온 뒤 이 값대로만 보인다 */
  private isPanelWanted = false
  private dragFrom: Rect | null = null
  private align: PetAlign = 'right'
  private size = petSize(undefined)
  private opacity = petOpacity(undefined)
  /** 다음에 띄울 때 기본 위치(오른쪽 아래)로 — 트레이·설정의 다시 불러오기 */
  private isResetNext = false
  private inFlight = new InFlight()
  private unlisten: (() => void) | null = null
  private refitTimer: NodeJS.Timeout | null = null

  constructor(private deps: PetDeps) {}

  /** 스냅샷마다: 설정에 맞춰 띄우거나 정리하고, 크기·투명도를 바로 반영한다 (맥만) */
  update(snap: OfficeSnapshot) {
    const isOn = process.platform === 'darwin' && snap.settings.isDeskPetOn
    const size = petSize(snap.settings.deskPetSize)
    const opacity = petOpacity(snap.settings.deskPetOpacity)
    if (!isOn) {
      if (this.pet) this.close()
      return
    }
    if (!this.pet) {
      this.size = size
      this.opacity = opacity
      return this.open()
    }
    if (size !== this.size) this.resize(size)
    if (opacity !== this.opacity) {
      this.opacity = opacity
      this.pet.setOpacity(opacity / 100)
    }
  }

  /** 트레이·설정의 "다시 불러오기": 꺼져 있으면 켜고, 숨었거나 엉뚱한 곳에 있으면 오른쪽 아래로 */
  summon() {
    if (process.platform !== 'darwin') return
    if (!this.pet) {
      this.isResetNext = true
      this.deps.setOn(true)
      return
    }
    this.place(defaultPetBounds(screen.getPrimaryDisplay().workArea, this.size), 'right')
    this.pet.showInactive()
  }

  /** 스냅샷을 받을 창들 (broadcast) */
  windows(): BrowserWindow[] {
    return [this.pet, this.panel].filter((w): w is BrowserWindow => !!w && !w.isDestroyed())
  }

  /** 두 창·IPC·화면/전원 이벤트·타이머를 모두 정리한다 (설정 끔·숨기기·앱 종료·캐릭터 창이 닫힘) */
  close() {
    const { pet, panel } = this
    this.pet = null
    this.panel = null
    this.isPanelWanted = false
    this.dragFrom = null
    this.unregister()
    if (panel && !panel.isDestroyed()) panel.destroy()
    if (pet && !pet.isDestroyed()) pet.destroy()
  }

  private open() {
    this.register()
    const saved = this.isResetNext ? null : loadPos()
    this.isResetNext = false
    // 다시 불러오기(기본 위치)는 오른쪽 아래라 오른쪽에 선다
    this.align = saved ? (saved.align ?? petAlignFor(saved, areaOf(saved))) : 'right'
    const start = saved ? resizePet(saved, areaOf(saved), this.size, this.align) : defaultPetBounds(screen.getPrimaryDisplay().workArea, this.size)
    const bounds = clampToArea(start, areaOf(start))
    // 보정·다시 불러오기로 바뀐 위치를 기억한다 (다음에 켤 때 예전 위치로 돌아가지 않게)
    savePos(bounds, this.align)
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
      opacity: this.opacity / 100,
      title: 'AI Office',
      webPreferences: { preload: this.deps.preloadPath, backgroundThrottling: false },
    })
    this.floatAbove(pet)
    // 투명한 곳은 클릭이 뒤 창으로 지나간다 — 캐릭터·말풍선 위에서만 화면이 다시 켠다 (pet:interactive)
    pet.setIgnoreMouseEvents(true, { forward: true })
    pet.once('ready-to-show', () => pet.showInactive())
    // 다시 불러와도(새로 고침) 캐릭터가 설 쪽을 알려 준다
    pet.webContents.on('did-finish-load', () => this.sendAlign())
    // 어떤 이유로든 캐릭터 창이 닫히면 펼침 창·IPC·이벤트까지 함께 정리한다
    pet.on('closed', () => {
      if (this.pet === pet) this.close()
    })
    this.deps.load(pet, 'pet')
    this.pet = pet
  }

  /** 다른 창 위·모든 데스크톱·전체 화면 앱 위에 띄운다. skipTransformProcessType: Dock 아이콘이 사라지지 않게 */
  private floatAbove(win: BrowserWindow) {
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  }

  /** 캐릭터 창을 옮기고 위치·서는 쪽을 기억한다. 펼침 창이 열려 있으면 따라간다 (서는 쪽은 창 위치에서 다시 재지 않는다 — settlePet 참고) */
  private place(bounds: Rect, align: PetAlign) {
    if (!this.pet) return
    this.pet.setBounds(bounds)
    savePos(bounds, align)
    if (align !== this.align) {
      this.align = align
      this.sendAlign()
    }
    if (this.isPanelWanted && this.panel) this.panel.setBounds(this.panelBounds())
  }

  /** 놓은 뒤·화면 변경 뒤: 화면 안으로 넣고 가장자리에 붙이며, 서는 쪽은 settlePet이 정한 대로 */
  private placeSettled(b: Rect) {
    const { bounds, align } = settlePet(b, areaOf(b), this.size, this.align)
    this.place(bounds, align)
  }

  private sendAlign() {
    if (this.pet && !this.pet.isDestroyed()) this.pet.webContents.send('pet:align', this.align)
  }

  /** 크기 설정이 바뀌면: 캐릭터가 선 쪽 가장자리·아래쪽을 그대로 두고 창을 다시 잰다 */
  private resize(size: number) {
    if (!this.pet) return
    this.size = size
    const b = this.pet.getBounds()
    this.place(resizePet(b, areaOf(b), size, this.align), this.align)
  }

  private panelBounds(): Rect {
    const b = this.pet!.getBounds()
    return placePanel(petCharRect(b, this.size, this.align), areaOf(b))
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
    // 불러오는 동안 여러 번 열고 닫아도 콜백은 이것 하나 — 다 불러온 때의 의도(isPanelWanted)대로만 보인다
    panel.webContents.on('did-finish-load', () => {
      if (this.panel === panel && this.isPanelWanted) this.revealPanel()
    })
    panel.on('closed', () => {
      if (this.panel !== panel) return
      this.panel = null
      this.isPanelWanted = false
    })
    this.deps.load(panel, 'panel')
    this.panel = panel
    return panel
  }

  private revealPanel() {
    const panel = this.panel
    if (!panel || !this.pet) return
    panel.setBounds(this.panelBounds())
    panel.show()
    panel.focus()
    panel.webContents.send('pet:panelShown')
  }

  private showPanel() {
    if (!this.pet) return
    this.isPanelWanted = true
    const panel = this.ensurePanel()
    if (!panel.webContents.isLoading()) this.revealPanel()
  }

  private hidePanel() {
    this.isPanelWanted = false
    if (this.panel?.isVisible()) this.panel.hide()
  }

  /** 모니터 연결·분리, 해상도·배율 변경, 잠자기·잠금에서 돌아오면 화면 안으로 되돌린다 (한 번 더 늦게 확인) */
  private refit = () => {
    this.refitNow()
    if (this.refitTimer) clearTimeout(this.refitTimer)
    this.refitTimer = setTimeout(() => {
      this.refitTimer = null
      this.refitNow()
    }, REFIT_AGAIN_MS)
  }

  private refitNow() {
    if (!this.pet || this.dragFrom) return
    const b = this.pet.getBounds()
    this.placeSettled(b)
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
    if (this.unlisten) return
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
      // 화면 안으로 넣고, 가장자리 가까이 놓았으면 붙인다
      const b = this.pet.getBounds()
      this.placeSettled(b)
    })
    this.on('pet:togglePanel', () => (this.isPanelWanted ? this.hidePanel() : this.showPanel()))
    this.on('pet:closePanel', () => this.hidePanel())
    this.on('pet:openApp', (target) => {
      this.hidePanel()
      this.deps.openApp(target as PetOpenTarget)
    })
    // 숨기기 = 설정 끔 (트레이 "바탕화면 비서 불러오기"·설정에서 다시 켠다). 정리는 다음 스냅샷의 update가 한다
    this.on('pet:hide', () => this.deps.setOn(false))
    ipcMain.handle('pet:decide', (e, approvalId: unknown, allow: unknown) => {
      if (!this.isMine(e) || typeof approvalId !== 'string' || typeof allow !== 'boolean') return 'already'
      return petDecide({ staff: () => this.deps.snapshot().staff, decide: this.deps.decide, inFlight: this.inFlight }, approvalId, allow)
    })
    const off = listenAll(
      [
        [screen as unknown as EventSource, REFIT_EVENTS.screen],
        [powerMonitor as unknown as EventSource, REFIT_EVENTS.power],
      ],
      this.refit,
    )
    this.unlisten = () => {
      for (const ch of PET_CHANNELS) ipcMain.removeAllListeners(ch)
      ipcMain.removeHandler('pet:decide')
      off()
    }
  }

  private unregister() {
    this.unlisten?.()
    this.unlisten = null
    if (this.refitTimer) clearTimeout(this.refitTimer)
    this.refitTimer = null
  }
}
