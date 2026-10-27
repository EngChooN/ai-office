// 꾸미기 컨트롤러 (기술 설계 1-4절 · 김기획 문서 6-3절 표, 작업 C1).
// 장면(IsoOfficeScene)은 그리기·카메라만 하고, 꾸미기 조작(꺼내기·돌리기·확정·넣기·고르기)은 여기서 받는다.
// 서랍 화면(DecorDrawer)은 useDecor로 상태를 읽고 decor()로 조작한다. 저장은 확정·돌리기·넣기마다 바로(window.office)
import * as Phaser from 'phaser'
import { create } from 'zustand'
import { useOffice, viewLevelOf } from '@/store'
import { drawerCount } from '@shared/economy'
import { cellsOf, sizeOf, specOf, type GridItem, type Rot, type SeatSetPart } from '@shared/iso/furniture'
import { isInside } from '@shared/iso/grid'
import { roomOf } from '@shared/iso/levels'
import { canPlace, REASON_TEXT, type FloorState } from '@shared/iso/place'
import { isAutoSeat, rotateSeatSet, seatSetOf, seatsOf } from '@shared/iso/seats'
import { setAutoOff, useSeatStatus } from './seatStatus'
import { isReducedMotion } from '@/lib/reducedMotion'
import type { IsoOfficeScene } from '../IsoOfficeScene'

/** 들고 있는 가구. uid가 있으면 놓여 있던 것을 옮기는 중 */
export interface DecorHold {
  itemId: string
  rot: Rot
  gx: number
  gy: number
  ok: boolean
  /** 빨강 이유 한 줄 */
  reason: string | null
  uid: string | null
  /** 책상 세트로 옮기는 중이면 함께 가는 의자 (itemId·uid는 책상). 책상 칸에서 dx·dy만큼 떨어져 따라간다 */
  partner?: { uid: string; itemId: string; dx: number; dy: number; rot: Rot } | null
}

interface DecorUi {
  hold: DecorHold | null
  /** 고른 놓인 가구 (작은 메뉴: 옮기기·돌리기·서랍에 넣기) */
  selected: GridItem | null
  /** 의자를 넣으면 자리가 모자랄 때 확인 */
  stowAsk: { uid: string; short: number } | null
  /** 막힌 이유·저장 실패 한 줄 (잠깐 보였다 사라진다) */
  message: string | null
  /** 의자가 모자라 장면이 깔아 둔 기본 자리 수 */
  autoSeats: number
  /** 전부 치우기 확인 창이 열려 있다 */
  clearAsk: boolean
  /** 방금 치운 가구 (되돌리기용 · 꾸미기를 나가면 사라진다) */
  undo: GridItem[] | null
  /** 상점 "꾸미기에서 놓기": 꾸미기가 열리면 이 품목을 든다 */
  pendingTake: string | null
}

export const useDecor = create<DecorUi>(() => ({ hold: null, selected: null, stowAsk: null, message: null, autoSeats: 0, clearAsk: false, undo: null, pendingTake: null }))

let active: DecorController | null = null
/** 지도 장면의 꾸미기 컨트롤러 (예전 장면이면 null) */
export const decor = () => active

const MESSAGE_MS = 2600
const LONG_PRESS_MS = 450
const DRAG_PX = 8
/** 들고 있는 가구·칸 표시 깊이 (기술 설계 1-2절) — 칸 표시는 놓인 가구에 가리지 않게 들고 있는 가구 바로 아래 */
const DEPTH = { grid: -9_500, marks: 39_980, lines: 39_990, ghost: 40_000 } as const

/** 테마 토큰(CSS 변수) → Phaser 색 숫자. oklch 등 어떤 색 표기든 1px 캔버스에 칠해 읽는다 */
function tokenColor(name: string) {
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return (r << 16) | (g << 8) | b
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

export class DecorController {
  private readonly scene: IsoOfficeScene
  private readonly gridG: Phaser.GameObjects.Graphics
  private readonly marks: Phaser.GameObjects.Graphics
  private readonly lines: Phaser.GameObjects.Graphics
  private ghost: Phaser.GameObjects.Image | null = null
  private ghost2: Phaser.GameObjects.Image | null = null
  private readonly color = { ok: tokenColor('--status-working'), bad: tokenColor('--status-error'), pick: tokenColor('--primary'), line: tokenColor('--muted-foreground') }
  private press: { x: number; y: number; isMoved: boolean; isTouch: boolean; uid: string | null; timer: number | null } | null = null
  private isBusy = false
  private autoOffBefore = false
  private wasDecorating = false
  private messageTimer = 0
  private gridKey = ''

  constructor(scene: IsoOfficeScene) {
    this.scene = scene
    this.gridG = scene.add.graphics().setDepth(DEPTH.grid).setVisible(false)
    this.marks = scene.add.graphics().setDepth(DEPTH.marks)
    this.lines = scene.add.graphics().setDepth(DEPTH.lines)
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p))
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p))
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p))
    const onKey = (e: KeyboardEvent) => this.onKey(e)
    window.addEventListener('keydown', onKey)
    scene.game.canvas.addEventListener('contextmenu', this.preventMenu)
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => {
      window.removeEventListener('keydown', onKey)
      scene.game.canvas.removeEventListener('contextmenu', this.preventMenu)
      if (active === this) active = null
    })
    active = this
  }

  /** 들고 있거나 가구를 눌러 끄는 중이면 장면은 화면을 옮기지 않는다 */
  get isCapturing() {
    return useDecor.getState().hold !== null || (this.press?.uid != null && !this.press.isTouch)
  }

  private get isOn() {
    const st = useOffice.getState()
    return st.isDecorating && st.view === 'map'
  }

  private readonly preventMenu = (e: Event) => {
    if (this.isOn) e.preventDefault()
  }

  /** 장면이 상태를 맞출 때마다 (층·방 크기·가구가 바뀌었을 수 있다) */
  refresh() {
    const ui = useDecor.getState()
    const isDecorating = useOffice.getState().isDecorating
    if (!isDecorating && this.wasDecorating) this.reset()
    this.wasDecorating = isDecorating
    this.gridG.setVisible(isDecorating)
    if (isDecorating) this.drawGrid()
    useDecor.setState({ autoSeats: this.scene.autoSeatCount })
    // 고른 가구가 없어졌으면(다른 기기에서 넣음 등) 고르기를 푼다
    if (ui.selected && !this.sceneItems().some((g) => g.uid === ui.selected!.uid)) this.select(null)
    if (ui.hold) this.hold(ui.hold)
    else this.drawSelected()
    if (isDecorating && ui.pendingTake) {
      useDecor.setState({ pendingTake: null })
      this.take(ui.pendingTake)
    }
  }

  // ── 조작 (서랍 화면·키보드·포인터가 부른다) ────────────────

  /** ① 서랍에서 꺼내 든다 — 화면 가운데에서 가장 가까운 놓을 수 있는 칸에 */
  take(itemId: string) {
    if (drawerCount(useOffice.getState().shop, itemId) <= 0) return this.flash(itemId)
    this.cancel()
    this.select(null)
    const c = this.nearestOk(itemId)
    this.hold({ itemId, rot: 0, gx: c.gx, gy: c.gy, ok: false, reason: null, uid: null })
    // 카드에 남은 포커스 때문에 Enter가 다시 꺼내기가 되지 않게
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  /** ⑥ 놓인 가구를 들어 옮기기 시작 */
  pickUp(uid: string) {
    const items = this.sceneItems()
    const it = items.find((g) => g.uid === uid)
    if (!it) return
    const set = seatSetOf(items, uid)
    // 기본 자리는 책상·의자 한 벌로만 옮길 수 있다
    if (isAutoSeat(uid) && set.length < 2) return this.say('이 자리는 옮길 수 없어요')
    this.select(null)
    if (set.length === 2) {
      const [desk, chair] = set
      this.scene.setItemHidden([desk.uid, chair.uid])
      return this.hold({ itemId: desk.itemId, rot: desk.rot, gx: desk.gx, gy: desk.gy, ok: false, reason: null, uid: desk.uid, partner: { uid: chair.uid, itemId: chair.itemId, dx: chair.gx - desk.gx, dy: chair.gy - desk.gy, rot: chair.rot } })
    }
    this.scene.setItemHidden(uid)
    this.hold({ itemId: it.itemId, rot: it.rot, gx: it.gx, gy: it.gy, ok: false, reason: null, uid })
  }

  /** ③ 돌리기 (dir 1 = 시계 방향). 고른 가구는 제자리에서 돌려 바로 저장 — 겹치면 원래 방향 그대로 */
  rotate(dir: 1 | -1 = 1) {
    const { hold, selected } = useDecor.getState()
    const turn = (r: Rot) => ((r + dir + 4) % 4) as Rot
    if (hold?.partner) {
      const p = hold.partner
      const [desk, chair] = rotateSeatSet(hold, { itemId: p.itemId, gx: hold.gx + p.dx, gy: hold.gy + p.dy, rot: p.rot }, dir)
      return this.hold({ ...desk, partner: { ...p, dx: chair.gx - desk.gx, dy: chair.gy - desk.gy, rot: chair.rot } })
    }
    if (hold) return this.hold({ ...hold, rot: turn(hold.rot) })
    if (!selected) return
    const set = seatSetOf(this.sceneItems(), selected.uid)
    if (set.length === 2) return this.rotateSet(set[0], set[1], dir)
    if (isAutoSeat(selected.uid)) return this.say('이 자리는 돌릴 수 없어요')
    const pose = { ...selected, rot: turn(selected.rot) }
    const r = canPlace(this.floorState(), pose, selected.uid)
    if (!r.ok) return this.say(REASON_TEXT[r.reason])
    void this.save(() => window.office.moveGridItem(selected.uid, selected.floor, pose.gx, pose.gy, pose.rot), () => this.select({ ...selected, rot: pose.rot }))
  }

  /** 고른 책상 세트를 제자리에서 돌려 바로 저장 — 기본 자리는 새 uid로 저장 가구가 되고, 앉은 직원은 새 의자로 따라간다 */
  private rotateSet(desk: GridItem, chair: GridItem, dir: 1 | -1) {
    if (this.isBusy) return
    const [d, c] = rotateSeatSet(desk, chair, dir)
    const base = this.floorState()
    const rest = base.items.filter((g) => g.uid !== desk.uid && g.uid !== chair.uid)
    const check = canPlace({ ...base, items: rest }, d)
    const r = check.ok ? canPlace({ ...base, items: [...rest, d] }, c) : check
    if (!r.ok) return this.say(REASON_TEXT[r.reason])
    const parts: SeatSetPart[] = [d, c].map((g) => ({ uid: g.uid, itemId: g.itemId, gx: g.gx, gy: g.gy, rot: g.rot, ...(isAutoSeat(g.uid) ? { toUid: crypto.randomUUID() } : {}) }))
    const [pd, pc] = parts
    if (pc.toUid) this.scene.moveSeatMemory(pc.uid, pc.toUid)
    void this.save(
      () => window.office.moveSeatSet(desk.floor, parts),
      () => this.select({ ...d, uid: pd.toUid ?? d.uid }),
      () => pc.toUid && this.scene.moveSeatMemory(pc.toUid, pc.uid),
    )
  }

  /** ② 방향키로 한 칸씩 */
  moveBy(dx: number, dy: number) {
    const { hold } = useDecor.getState()
    if (hold) this.hold({ ...hold, gx: hold.gx + dx, gy: hold.gy + dy })
  }

  /** ④ 확정 (초록일 때만). again이면 같은 가구가 남아 있을 때 하나 더 든다 */
  confirm(again = false) {
    const { hold } = useDecor.getState()
    if (!hold || this.isBusy) return
    if (!hold.ok) {
      this.shake()
      return this.say(hold.reason)
    }
    const floor = this.scene.currentFloor
    const left = drawerCount(useOffice.getState().shop, hold.itemId)
    if (hold.partner) return this.confirmSet(hold, floor)
    const call: () => Promise<unknown> = hold.uid ? () => window.office.moveGridItem(hold.uid!, floor, hold.gx, hold.gy, hold.rot) : () => window.office.placeGridItem(hold.itemId, floor, hold.gx, hold.gy, hold.rot)
    void this.save(call, () => {
      this.drop()
      if (again && !hold.uid && left > 1) this.take(hold.itemId)
    })
  }

  /** 책상 세트 확정 — 기본 자리는 새 uid로 저장 가구가 되고, 앉은 직원은 새 의자로 따라간다 */
  private confirmSet(hold: DecorHold, floor: number) {
    const p = hold.partner!
    const parts: SeatSetPart[] = [
      { uid: hold.uid!, itemId: hold.itemId, gx: hold.gx, gy: hold.gy, rot: hold.rot, ...(isAutoSeat(hold.uid!) ? { toUid: crypto.randomUUID() } : {}) },
      { uid: p.uid, itemId: p.itemId, gx: hold.gx + p.dx, gy: hold.gy + p.dy, rot: p.rot, ...(isAutoSeat(p.uid) ? { toUid: crypto.randomUUID() } : {}) },
    ]
    const chair = parts[1]
    if (chair.toUid) this.scene.moveSeatMemory(chair.uid, chair.toUid)
    void this.save(
      () => window.office.moveSeatSet(floor, parts),
      () => this.drop(),
      () => chair.toUid && this.scene.moveSeatMemory(chair.toUid, chair.uid),
    )
  }

  /** ⑤ 취소: 옮기던 가구는 제자리로, 꺼낸 가구는 서랍으로 (저장할 것 없음) */
  cancel() {
    if (useDecor.getState().hold) this.drop()
  }

  /** ⑦ 서랍에 넣기 — 고른 가구 또는 옮기던 가구. 의자를 넣어 자리가 모자라면 먼저 확인 */
  stow(isConfirmed = false) {
    const { hold, selected } = useDecor.getState()
    const uid = hold?.uid ?? selected?.uid
    if (!uid) return this.cancel()
    if (isAutoSeat(uid)) return this.say('기본 자리는 서랍에 넣을 수 없어요')
    const it = this.gridItems().find((g) => g.uid === uid)
    if (!it) return
    if (!isConfirmed && specOf(it.itemId).kind === 'chair') {
      const left = seatsOf(this.floorItems().filter((g) => g.uid !== uid)).length
      const short = this.scene.staffHere - left
      if (short > 0) return useDecor.setState({ stowAsk: { uid, short } })
    }
    useDecor.setState({ stowAsk: null })
    void this.save(
      () => window.office.storeItem(uid),
      () => {
        if (hold) this.drop()
        this.select(null)
      },
    )
  }

  /** 전부 치우기: 범위 안 가구를 한 번에 저장하고 서랍으로. 치우기 전 배치는 메모리에 두어 되돌릴 수 있다.
   *  직원 자리를 남기지 않으면 기본 자리 자동 놓기를 끈다(모자란 자리 수만 안내) */
  clearAll(scope: 'floor' | 'all', keepSeats: boolean) {
    if (this.isBusy) return
    const floor = scope === 'floor' ? this.scene.currentFloor : 0
    useDecor.setState({ clearAsk: false })
    this.cancel()
    this.select(null)
    const wasOff = useSeatStatus.getState().isAutoOff
    this.autoOffBefore = wasOff
    if (!keepSeats) setAutoOff(true)
    void this.save(
      () => window.office.stowAllGrid(floor, keepSeats),
      (stowed) => useDecor.setState({ undo: stowed.length ? stowed : null }),
      () => setAutoOff(wasOff),
    )
  }

  /** 되돌리기: 치우기 전 배치로 (기본 자리 자동 놓기도 원래대로) */
  undoClear() {
    const { undo } = useDecor.getState()
    if (!undo || this.isBusy) return
    void this.save(
      () => window.office.restoreGridItems(undo),
      () => {
        setAutoOff(this.autoOffBefore)
        useDecor.setState({ undo: null })
      },
    )
  }

  /** 남은 게 없는 카드: 놓인 자리를 깜빡여 보여 준다 (다른 층이면 그 층으로) */
  flash(itemId: string) {
    const items = this.gridItems().filter((g) => g.itemId === itemId)
    const it = items.find((g) => g.floor === this.scene.currentFloor) ?? items[0]
    if (!it) return
    if (it.floor !== this.scene.currentFloor) useOffice.getState().setViewFloor(it.floor)
    this.scene.flashItem(it.uid)
  }

  select(it: GridItem | null) {
    useDecor.setState({ selected: it, stowAsk: null })
    this.drawSelected()
  }

  // ── 포인터·키보드 ─────────────────────────────────────

  private onDown(p: Phaser.Input.Pointer) {
    if (!this.isOn) return
    const a = this.scene.input.pointer1
    const b = this.scene.input.pointer2
    if (a?.isDown && b?.isDown) return this.endPress()
    if (p.rightButtonDown()) return this.rotate(p.event.shiftKey ? -1 : 1)
    const isTouch = p.wasTouch
    const uid = useDecor.getState().hold ? null : (this.itemAt(p.worldX, p.worldY)?.uid ?? null)
    this.endPress()
    this.press = { x: p.x, y: p.y, isMoved: false, isTouch, uid, timer: null }
    // 폰: 길게 누른 뒤 끌면 옮기기 (짧은 끌기는 화면 이동)
    if (isTouch && uid) this.press.timer = window.setTimeout(() => this.press && !this.press.isMoved && this.pickUp(uid), LONG_PRESS_MS)
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!this.isOn) return
    const pr = this.press
    if (pr && Math.hypot(p.x - pr.x, p.y - pr.y) > DRAG_PX * (window.devicePixelRatio || 1)) pr.isMoved = true
    const { hold } = useDecor.getState()
    // 마우스는 늘 따라오고, 손가락은 끄는 동안만
    if (hold && (pr || !p.wasTouch)) return this.holdAt(p.worldX, p.worldY)
    // 마우스로 놓인 가구를 바로 끌면 옮기기
    if (pr?.uid && pr.isMoved && !pr.isTouch) {
      this.pickUp(pr.uid)
      pr.uid = null
    }
  }

  private onUp(p: Phaser.Input.Pointer) {
    const pr = this.press
    this.endPress()
    if (!pr || !this.isOn) return
    const { hold } = useDecor.getState()
    if (hold) {
      this.holdAt(p.worldX, p.worldY)
      // 마우스는 클릭(또는 끌어다 놓기)으로 확정, Shift+클릭은 하나 더. 손가락은 떼는 것만으로 확정하지 않는다(✓ 버튼)
      if (!pr.isTouch) this.confirm(p.event.shiftKey)
      return
    }
    if (pr.isMoved) return
    const it = this.itemAt(p.worldX, p.worldY)
    this.select(it ?? null)
  }

  private endPress() {
    if (this.press?.timer) window.clearTimeout(this.press.timer)
    this.press = null
  }

  private onKey(e: KeyboardEvent) {
    if (!this.isOn || isTyping(e.target) || this.scene.sys.isSleeping()) return
    const { hold, selected, stowAsk } = useDecor.getState()
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
    if (key === 'r' || key === 'ㄱ') this.rotate(e.shiftKey ? -1 : 1)
    else if (key === 'Enter' && hold) this.confirm(e.shiftKey)
    else if ((key === 'Delete' || key === 'Backspace') && (hold || selected)) this.stow()
    else if (key === 'Escape') {
      if (stowAsk) useDecor.setState({ stowAsk: null })
      else if (hold) this.cancel()
      else if (selected) this.select(null)
      else useOffice.getState().setDecorating(false)
    } else if (arrows[key] && hold) this.moveBy(...arrows[key])
    else return
    e.preventDefault()
  }

  // ── 그리기 ────────────────────────────────────────────

  /** 들고 있는 가구를 고쳐 두고 다시 판정해 그린다 */
  private hold(h: DecorHold) {
    const pose = { itemId: h.itemId, gx: h.gx, gy: h.gy, rot: h.rot }
    const check = canPlace(this.floorState(), pose, h.uid ?? undefined)
    if (h.partner) return this.holdSet(h)
    const next = { ...h, ok: check.ok, reason: check.ok ? null : REASON_TEXT[check.reason] }
    useDecor.setState({ hold: next })
    this.ghost2?.destroy()
    this.ghost2 = null

    const art = this.scene.itemArt(h.itemId, h.rot)
    const p = this.scene.worldOf(h.gx, h.gy)
    this.ghost ??= this.scene.add.image(0, 0, art.key).setDepth(DEPTH.ghost).setAlpha(0.72)
    this.ghost.setTexture(art.key).setOrigin(art.ax, art.ay).setPosition(p.x, p.y)
    // 차지할 칸은 초록, 걸린 칸은 빨강 (길 막힘이면 걸린 칸은 닿지 못하게 되는 자리라 차지 칸 밖일 수 있다)
    const bad = new Set(check.ok ? [] : check.tiles.map(([x, y]) => `${x},${y}`))
    const cells = [...cellsOf(pose), ...(check.ok ? [] : check.tiles.map(([gx, gy]) => ({ gx, gy })))]
    this.paint(cells, (k) => (bad.has(k) ? this.color.bad : this.color.ok))
  }

  /** 책상 세트를 들고 있을 때: 책상 → 의자 순으로 놓을 수 있는지 보고 둘 다 그린다 */
  private holdSet(h: DecorHold) {
    const p = h.partner!
    const desk = { itemId: h.itemId, gx: h.gx, gy: h.gy, rot: h.rot }
    const chair = { itemId: p.itemId, gx: h.gx + p.dx, gy: h.gy + p.dy, rot: p.rot }
    const base = this.floorState()
    const rest = base.items.filter((g) => g.uid !== h.uid && g.uid !== p.uid)
    const deskCheck = canPlace({ ...base, items: rest }, desk)
    const chairCheck = deskCheck.ok ? canPlace({ ...base, items: [...rest, { ...desk, uid: h.uid!, floor: base.floor }] }, chair) : deskCheck
    useDecor.setState({ hold: { ...h, ok: chairCheck.ok, reason: chairCheck.ok ? null : REASON_TEXT[chairCheck.reason] } })
    const draw = (pose: typeof desk, ghost: 'ghost' | 'ghost2') => {
      const art = this.scene.itemArt(pose.itemId, pose.rot)
      const w = this.scene.worldOf(pose.gx, pose.gy)
      const img = (this[ghost] ??= this.scene.add.image(0, 0, art.key).setDepth(DEPTH.ghost).setAlpha(0.72))
      img.setTexture(art.key).setOrigin(art.ax, art.ay).setPosition(w.x, w.y)
    }
    draw(desk, 'ghost')
    draw(chair, 'ghost2')
    const bad = new Set(chairCheck.ok ? [] : chairCheck.tiles.map(([x, y]) => `${x},${y}`))
    const cells = [...cellsOf(desk), ...cellsOf(chair), ...(chairCheck.ok ? [] : chairCheck.tiles.map(([gx, gy]) => ({ gx, gy })))]
    this.paint(cells, (k) => (bad.has(k) ? this.color.bad : this.color.ok))
  }

  private drawSelected() {
    const { hold, selected } = useDecor.getState()
    if (hold) return
    const set = selected ? seatSetOf(this.sceneItems(), selected.uid) : []
    const cells = selected && selected.floor === this.scene.currentFloor ? (set.length ? set : [selected]).flatMap(cellsOf) : []
    this.paint(cells, () => this.color.pick)
  }

  private paint(cells: { gx: number; gy: number }[], colorOf: (key: string) => number) {
    this.marks.clear()
    this.lines.clear()
    const drawn = new Set<string>()
    for (const c of cells) {
      const k = `${c.gx},${c.gy}`
      if (drawn.has(k)) continue
      drawn.add(k)
      const pts = this.diamond(c.gx, c.gy)
      this.marks.fillStyle(colorOf(k), 0.45).fillPoints(pts, true)
      this.lines.lineStyle(3, colorOf(k), 1).strokePoints(pts, true)
    }
  }

  /** 꾸미는 동안 칸 선 (방 크기·층이 바뀔 때만 다시) */
  private drawGrid() {
    const room = roomOf(viewLevelOf(useOffice.getState()), this.scene.currentFloor)
    const key = `${this.scene.currentFloor}:${room.cols}x${room.rows}:${this.scene.worldOf(0, 0).x}:${this.scene.worldOf(0, 0).y}`
    if (key === this.gridKey) return
    this.gridKey = key
    // 바닥 칸(isInside)에만 선을 긋는다 — 칸마다 뒤쪽(왼·위) 변은 이웃이 바닥이 아닐 때만, 앞쪽(오른·아래) 변은 늘
    const g = this.gridG.clear().lineStyle(1, this.color.line, 0.35)
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      const [a, b] = [this.scene.worldOf(x0, y0), this.scene.worldOf(x1, y1)]
      g.lineBetween(a.x, a.y, b.x, b.y)
    }
    for (let gy = 0; gy < room.rows; gy++)
      for (let gx = 0; gx < room.cols; gx++) {
        if (!isInside(room, gx, gy)) continue
        if (!isInside(room, gx - 1, gy)) line(gx, gy, gx, gy + 1)
        if (!isInside(room, gx, gy - 1)) line(gx, gy, gx + 1, gy)
        line(gx + 1, gy, gx + 1, gy + 1)
        line(gx, gy + 1, gx + 1, gy + 1)
      }
  }

  private diamond(gx: number, gy: number) {
    return [this.scene.worldOf(gx, gy), this.scene.worldOf(gx + 1, gy), this.scene.worldOf(gx + 1, gy + 1), this.scene.worldOf(gx, gy + 1)].map((q) => new Phaser.Math.Vector2(q.x, q.y))
  }

  /** 빨강에서 확정하면 살짝 흔든다 (움직임 줄이기면 생략) */
  private shake() {
    const g = this.ghost
    if (!g || isReducedMotion()) return
    this.scene.tweens.add({ targets: g, x: g.x + 6, duration: 50, yoyo: true, repeat: 2 })
  }

  // ── 상태·저장 ─────────────────────────────────────────

  /** 손에 든 것을 내려놓는다 (저장과 무관 — 그림만 정리) */
  private drop() {
    const { hold } = useDecor.getState()
    if (hold?.uid) this.scene.setItemHidden(null)
    useDecor.setState({ hold: null })
    this.ghost?.destroy()
    this.ghost = null
    this.ghost2?.destroy()
    this.ghost2 = null
    this.marks.clear()
    this.lines.clear()
  }

  private reset() {
    this.drop()
    this.endPress()
    useDecor.setState({ selected: null, stowAsk: null, message: null, clearAsk: false, undo: null })
  }

  private async save<T>(call: () => Promise<T>, onDone: (result: T) => void, onFail?: () => void) {
    this.isBusy = true
    try {
      onDone(await call())
    } catch {
      onFail?.()
      // 화면에서 미리 검사했으니 드물다 (다른 기기에서 먼저 놓은 경우 등)
      this.say('저장하지 못했어요. 다시 해 주세요')
    } finally {
      this.isBusy = false
    }
  }

  private say(text: string | null) {
    useDecor.setState({ message: text })
    window.clearTimeout(this.messageTimer)
    this.messageTimer = window.setTimeout(() => useDecor.setState((s) => (s.message === text ? { message: null } : {})), MESSAGE_MS)
  }

  private gridItems() {
    return useOffice.getState().shop.grid ?? []
  }

  /** 이 층에 보이는 가구 — 저장된 것 + 기본 자리(저장하지 않는 가상 책상·의자) */
  private sceneItems() {
    return this.scene.floorItemsShown
  }

  private floorItems() {
    return this.gridItems().filter((g) => g.floor === this.scene.currentFloor)
  }

  private floorState(): FloorState {
    return { level: viewLevelOf(useOffice.getState()), floor: this.scene.currentFloor, items: this.gridItems() }
  }

  /** 가리킨 칸에 든 가구가 오도록 (긴 가구는 가운데 칸이 마우스·손가락 아래) */
  private holdAt(wx: number, wy: number) {
    const { hold } = useDecor.getState()
    if (!hold) return
    const c = this.scene.cellAt(wx, wy)
    const { w, d } = sizeOf(hold.itemId, hold.rot)
    const gx = c.gx - Math.floor((w - 1) / 2)
    const gy = c.gy - Math.floor((d - 1) / 2)
    if (gx !== hold.gx || gy !== hold.gy) this.hold({ ...hold, gx, gy })
  }

  /** 눌린 가구 — 그림 먼저, 없으면 칸을 차지한 놓인 가구 (object 먼저 — 러그 위 가구를 고른다) */
  private itemAt(wx: number, wy: number) {
    // 가구 그림을 눌러도 고른다 (겹치면 앞쪽) — 못 맞히면 차지한 칸으로
    const art = this.scene.itemAtPoint(wx, wy)
    if (art) return art
    const { gx, gy } = this.scene.cellAt(wx, wy)
    const hits = this.sceneItems().filter((g) => cellsOf(g).some((c) => c.gx === gx && c.gy === gy))
    return hits.find((g) => specOf(g.itemId).layer === 'object') ?? hits[0]
  }

  /** 화면 가운데에서 가장 가까운 놓을 수 있는 칸 (없으면 가운데 — 빨강으로 보인다) */
  private nearestOk(itemId: string) {
    const room = roomOf(viewLevelOf(useOffice.getState()), this.scene.currentFloor)
    const mid = this.scene.cameras.main.midPoint
    const c = this.scene.cellAt(mid.x, mid.y)
    const center = { gx: Phaser.Math.Clamp(c.gx, 0, room.cols - 1), gy: Phaser.Math.Clamp(c.gy, 0, room.rows - 1) }
    const state = this.floorState()
    // 바닥 칸만 후보 — 깎인 평면에서 화면 가운데가 바닥 밖이어도 가장 가까운 바닥 칸으로
    const cells: { gx: number; gy: number }[] = []
    for (let gy = 0; gy < room.rows; gy++) for (let gx = 0; gx < room.cols; gx++) if (isInside(room, gx, gy)) cells.push({ gx, gy })
    cells.sort((a, b) => Math.abs(a.gx - center.gx) + Math.abs(a.gy - center.gy) - (Math.abs(b.gx - center.gx) + Math.abs(b.gy - center.gy)))
    return cells.find((p) => canPlace(state, { itemId, gx: p.gx, gy: p.gy, rot: 0 }).ok) ?? cells[0] ?? center
  }
}
