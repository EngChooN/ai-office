// 아이소메트릭 칸 배치 시제품 장면 — 앱 사무실(IsoOfficeScene)과 분리. 저장하지 않고 메모리에만 둔다.
// 칸 계산은 shared/iso(순수 함수), 그림은 isoArt(시안 A 파스텔). 화면 바깥(React)은 events 'state'로 상태를 받고 메서드로 조작한다
import * as Phaser from 'phaser'
import { cellKey, PIXEL, toGrid, toWorld, type Room } from '@shared/iso/grid'
import { cellsOf, facingOf, sizeOf, specOf, type GridItem, type Rot } from '@shared/iso/furniture'
import { canPlace, fixedTiles, REASON_TEXT, type FixedTile, type FloorState } from '@shared/iso/place'

export { REASON_TEXT }
import { roomOf } from '@shared/iso/levels'
import { buildWalkMap, findPath, type WalkMap } from '@shared/iso/path'
import { seatsOf, type Seat } from '@shared/iso/seats'
import { depthOrder, type IsoBox } from '@shared/iso/depth'
import { drawItem, drawPersonSet, drawPersonShadow, personDirOf, drawRoom, finishOf, lookOf, roomTextureKey, STAGE_FINISH, type ArtBox, type Finish, type Material } from './isoArt'

/** 시제품 서랍 품목 (지금 그림이 있는 넷) */
export const KINDS = ['desk', 'chair', 'sofa-green', 'monstera'] as const
export type ProtoItem = (typeof KINDS)[number]
export const ITEM_NAME: Record<ProtoItem, string> = { desk: '책상', chair: '의자', 'sofa-green': '소파', monstera: '화분' }
/** 방 크기 → 그 칸 크기의 레벨 (레벨표: Lv.3 10×10, Lv.15 20×20) */
const LEVEL_OF_SIZE: Record<number, number> = { 10: 3, 20: 15 }
const FIXED_COLOR: Record<FixedTile['kind'], number> = { meeting: 0x6b8cce, meetingDoor: 0x9ab4ea, stairs: 0xb08a5a, entrance: 0xe0b84a }
const OK_COLOR = 0x3fc168 // status-working
const BAD_COLOR = 0xe5534b // status-error
const WALK_SPEED = 2.4 // 칸/초
const FRAME_SEC = 0.16

export interface Holding {
  itemId: ProtoItem
  rot: Rot
  gx: number
  gy: number
  ok: boolean
  reason: string | null
  /** 바닥에서 집었으면 원래 자리 (취소하면 돌아간다) */
  from: GridItem | null
}

export interface ProtoState {
  size: number
  /** 바닥·벽 재질 단계 (고르지 않았으면 레벨표의 단계) */
  material: Material
  isDecorating: boolean
  holding: Holding | null
  drawer: Record<ProtoItem, number>
  furniture: number
  staff: number
  seated: number
  fps: number
}

export interface PerfResult {
  furniture: number
  staff: number
  seconds: number
  avgFps: number
  p95FrameMs: number
  /** 직원 이동·길찾기·깊이 정렬 (프레임당 평균) */
  updateMs: number
  renderMs: number
}

interface Staff {
  n: number
  x: number
  y: number
  path: { gx: number; gy: number }[]
  seatId: string | null
  state: 'walk' | 'sit' | 'idle'
  timer: number
  facing: Rot
  frame: number
  sprite: Phaser.GameObjects.Image
  shadow: Phaser.GameObjects.Image
}

interface FurnSprite {
  images: { img: Phaser.GameObjects.Image; box: ArtBox }[]
}

// 시드 고정 난수 (캡처가 매번 같게)
const rng = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 2 ** 32
}

const startDrawer = (): Record<ProtoItem, number> => ({ desk: 2, chair: 3, 'sofa-green': 1, monstera: 3 })

export class IsoPrototypeScene extends Phaser.Scene {
  private room: Room = { cols: 10, rows: 10 }
  private level = 3
  /** 시험용 재질 단계 (null = 레벨표대로) */
  private material: Material | null = null
  private fixed: FixedTile[] = []
  /** (0,0) 칸 위 꼭짓점의 세계(화면) px */
  private o = { x: 0, y: 0 }
  private roomSize = { w: 0, h: 0 }
  private roomImg?: Phaser.GameObjects.Image
  private gridLines?: Phaser.GameObjects.Graphics
  private marks?: Phaser.GameObjects.Graphics
  /** 칸 테두리는 든 가구 위에 그려 가려지지 않게 */
  private markLines?: Phaser.GameObjects.Graphics
  private ghost?: Phaser.GameObjects.Image
  private placed: GridItem[] = []
  private sprites = new Map<string, FurnSprite>()
  private staff: Staff[] = []
  private walk!: WalkMap
  private seats: Seat[] = []
  private drawer = startDrawer()
  private holding: Holding | null = null
  private isDecorating = false
  private isTouch = false
  private rand = rng(7)
  private nextId = 1
  private roomArt = new Map<string, { anchor: { x: number; y: number }; w: number; h: number }>()
  private artMeta = new Map<string, ArtBox & { ax: number; ay: number }>()
  private press: { x: number; y: number; moved: boolean; camX: number; camY: number; wasTouch: boolean } | null = null
  private pinch: { dist: number; zoom: number; midX: number; midY: number } | null = null
  private fitZoom = 1
  private lastFps = 0
  private updateCost = 0
  private perf: { frames: number[]; update: number[]; render: number[]; t0: number; renderStart: number; done: (r: PerfResult) => void; seconds: number } | null = null

  constructor() {
    super('iso-prototype')
  }

  create() {
    this.textures.addCanvas('person-shadow', drawPersonShadow())
    this.marks = this.add.graphics().setDepth(3)
    this.markLines = this.add.graphics().setDepth(1e6 + 1)
    this.input.addPointer(1)
    this.input.mouse?.disableContextMenu()
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p))
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p))
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p))
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomAt(p.x, p.y, this.cameras.main.zoom * (dy > 0 ? 0.9 : 1.1)))
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e))
    this.scale.on('resize', () => this.fit())
    this.game.events.on(Phaser.Core.Events.PRE_RENDER, () => {
      if (this.perf) this.perf.renderStart = performance.now()
    })
    this.game.events.on(Phaser.Core.Events.POST_RENDER, () => {
      if (this.perf) this.perf.render.push(performance.now() - this.perf.renderStart)
    })
    this.setRoom(10)
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.emitState() })
    this.game.events.emit('iso-ready', this)
  }

  // ── 바깥(React)에서 부르는 것 ─────────────────────────

  setTouch(isTouch: boolean) {
    this.isTouch = isTouch
  }

  /** 바닥·벽 재질 단계를 고른다 (null = 레벨표대로). 방을 기본 배치로 다시 시작 */
  setMaterial(m: Material | null) {
    this.material = m
    this.setRoom(this.room.cols, this.staff.length)
  }

  /** 방 크기를 바꾸고 기본 배치로 새로 시작 */
  setRoom(size: number, staffCount = 2) {
    this.clearAll()
    this.level = LEVEL_OF_SIZE[size] ?? 3
    this.room = roomOf(this.level, 1)
    this.fixed = fixedTiles(this.level, 1)
    // 바닥·벽은 레벨표 마감(재질 단계 M1~M5). 시험용으로 단계를 고르면 그 대표 마감
    const finish: Finish = this.material ? STAGE_FINISH[this.material] : finishOf(this.level)
    const key = roomTextureKey(this.room.cols, this.room.rows, finish)
    // 방 그림은 크기·마감마다 한 번만 그린다 (20×20은 약 90ms)
    if (!this.roomArt.has(key)) {
      const art = drawRoom(this.room.cols, this.room.rows, finish)
      this.textures.addCanvas(key, art.canvas)
      this.roomArt.set(key, { anchor: art.anchor, w: art.canvas.width, h: art.canvas.height })
    }
    const art = this.roomArt.get(key)!
    this.roomImg?.destroy()
    this.roomImg = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0)
    this.o = art.anchor
    this.roomSize = { w: art.w, h: art.h }
    this.drawer = startDrawer()
    // 기본 배치: 업무 자리 두 개 + 화분·소파 (방이 크면 몇 벌 더). 고정 칸·길 막힘에 걸리는 것은 건너뛴다
    this.walk = buildWalkMap(this.room, [], this.fixed)
    const sets = size >= 20 ? 2 : 1
    for (let i = 0; i < sets; i++) {
      const bx = 1 + i * 6
      const by = size >= 20 ? 4 : 3
      this.tryAdd('desk', bx, by + 1, 0)
      this.tryAdd('chair', bx, by, 0)
      this.tryAdd('desk', bx + 3, by + 3, 1)
      this.tryAdd('chair', bx + 2, by + 3, 3)
    }
    this.tryAdd('monstera', 2, 0, 0)
    this.tryAdd('sofa-green', 0, size - 3, 3)
    this.tryAdd('monstera', size - 1, size - 1, 0)
    this.drawGrid()
    for (let i = 0; i < staffCount; i++) this.addStaff()
    this.onLayoutChanged()
    this.fit()
  }

  setDecorating(on: boolean) {
    if (!on && this.holding) this.cancel()
    this.isDecorating = on
    this.gridLines?.setVisible(on)
    this.fit()
    this.emitState()
  }

  /** 서랍에서 꺼내 든다 (놓기 전까지 화면 가운데·마우스 아래에서 따라다닌다) */
  take(itemId: ProtoItem) {
    if (this.drawer[itemId] <= 0) return
    if (this.holding) this.cancel()
    this.drawer[itemId]--
    const c = this.viewCenterCell()
    this.hold({ itemId, rot: 0, gx: c.gx, gy: c.gy, ok: false, reason: null, from: null })
  }

  rotate() {
    if (!this.holding) return
    this.hold({ ...this.holding, rot: ((this.holding.rot + 1) % 4) as Rot })
  }

  /** 놓을 수 있으면 확정 */
  confirm() {
    const h = this.holding
    if (!h || !h.ok) return false
    this.holding = null
    this.add2(h.itemId, h.gx, h.gy, h.rot, h.from?.uid)
    this.clearGhost()
    this.onLayoutChanged()
    return true
  }

  /** 들고 있는 가구를 서랍에 넣는다 */
  stow() {
    const h = this.holding
    if (!h) return
    this.holding = null
    this.drawer[h.itemId]++
    this.clearGhost()
    this.emitState()
  }

  /** 취소: 바닥에서 집었으면 제자리로, 서랍에서 꺼냈으면 서랍으로 */
  cancel() {
    const h = this.holding
    if (!h) return
    if (h.from) {
      this.holding = null
      this.add2(h.itemId, h.from.gx, h.from.gy, h.from.rot, h.from.uid)
      this.clearGhost()
      this.onLayoutChanged()
    } else this.stow()
  }

  /** 꾸미기 상태로 시작하는 캡처용: 든 가구를 칸에 옮긴다 */
  moveHoldingTo(gx: number, gy: number) {
    if (this.holding) this.hold({ ...this.holding, gx, gy })
  }

  /** 성능 시험: 방 20×20, 가구 n개, 직원 m명을 깔고 seconds 동안 프레임을 잰다 */
  runPerf(furniture = 60, staff = 20, seconds = 5): Promise<PerfResult> {
    this.setDecorating(false)
    this.setRoom(20, 0)
    // 기본 배치를 비우고 무작위로 n개
    for (const p of [...this.placed]) this.removePlaced(p.uid)
    const kinds: ProtoItem[] = ['desk', 'chair', 'chair', 'sofa-green', 'monstera']
    let tries = 0
    while (this.placed.length < furniture && tries++ < 5000) {
      const itemId = kinds[Math.floor(this.rand() * kinds.length)]
      const rot = Math.floor(this.rand() * 4) as Rot
      // 길 막힘 검사까지 통과하는 칸에만
      this.tryAdd(itemId, Math.floor(this.rand() * this.room.cols), Math.floor(this.rand() * this.room.rows), rot)
    }
    for (let i = 0; i < staff; i++) this.addStaff()
    this.onLayoutChanged()
    return new Promise((resolve) => {
      // 1초 데운 뒤 잰다
      this.time.delayedCall(1000, () => {
        this.perf = { frames: [], update: [], render: [], t0: performance.now(), renderStart: 0, seconds, done: resolve }
      })
    })
  }

  /** 칸 가운데의 페이지 좌표 (CSS px) — 캡처·입력 시험 스크립트용 */
  pageOf(gx: number, gy: number) {
    const cam = this.cameras.main
    const w = this.world(gx + 0.5, gy + 0.5)
    const rect = this.game.canvas.getBoundingClientRect()
    const k = rect.width / this.scale.width
    return { x: rect.left + (w.x - cam.worldView.x) * cam.zoom * k, y: rect.top + (w.y - cam.worldView.y) * cam.zoom * k }
  }

  /** 시험용: 놓인 가구 목록 */
  layout() {
    return this.placed.map((p) => ({ ...p }))
  }

  getState(): ProtoState {
    return {
      size: this.room.cols,
      material: this.material ?? finishOf(this.level).material,
      isDecorating: this.isDecorating,
      holding: this.holding,
      drawer: { ...this.drawer },
      furniture: this.placed.length,
      staff: this.staff.length,
      seated: this.staff.filter((s) => s.state === 'sit').length,
      fps: this.lastFps,
    }
  }

  // ── 그리기 ────────────────────────────────────────────

  /** 칸 좌표 → 세계 px (z는 아트 px) */
  private world(gx: number, gy: number, z = 0) {
    return toWorld(this.o, gx, gy, z * PIXEL)
  }

  private cellAt(wx: number, wy: number) {
    return toGrid(this.o, wx, wy)
  }

  private floorState(): FloorState {
    return { level: this.level, floor: 1, items: this.placed, room: this.room, fixed: this.fixed }
  }

  private itemKey(itemId: string, r: Rot, role?: 'seat' | 'back') {
    const key = `item-${itemId}-r${r}${role ? `-${role}` : ''}`
    if (!this.textures.exists(key)) {
      const art = drawItem(itemId, r, role)
      this.textures.addCanvas(key, art.canvas)
      this.artMeta.set(key, { ...art.box, ax: art.anchor.x / art.canvas.width, ay: art.anchor.y / art.canvas.height })
    }
    return key
  }

  private makeImage(itemId: string, gx: number, gy: number, r: Rot, role?: 'seat' | 'back') {
    const key = this.itemKey(itemId, r, role)
    const m = this.artMeta.get(key)!
    const p = this.world(gx, gy)
    return { img: this.add.image(p.x, p.y, key).setOrigin(m.ax, m.ay), box: { x: m.x, y: m.y, w: m.w, d: m.d, z: m.z, h: m.h } }
  }

  /** 가구를 바닥에 놓는다 (검사는 부르는 쪽에서). id를 주면 같은 가구를 다시 놓는 것 */
  private add2(itemId: ProtoItem, gx: number, gy: number, rot: Rot, uid?: string) {
    const p: GridItem = { uid: uid ?? `f${this.nextId++}`, itemId, floor: 1, gx, gy, rot }
    this.placed.push(p)
    // 의자는 좌석·등받이 두 장 — 앉은 직원을 그 사이에 끼운다
    const images = specOf(itemId).kind === 'chair' ? [this.makeImage(itemId, gx, gy, rot, 'seat'), this.makeImage(itemId, gx, gy, rot, 'back')] : [this.makeImage(itemId, gx, gy, rot)]
    this.sprites.set(p.uid, { images })
    return p
  }

  /** 놓기 검사를 통과하면 놓는다 (기본 배치·성능 시험용) */
  private tryAdd(itemId: ProtoItem, gx: number, gy: number, rot: Rot) {
    if (canPlace(this.floorState(), { itemId, gx, gy, rot }).ok) this.add2(itemId, gx, gy, rot)
  }

  private removePlaced(uid: string) {
    this.placed = this.placed.filter((p) => p.uid !== uid)
    for (const { img } of this.sprites.get(uid)?.images ?? []) img.destroy()
    this.sprites.delete(uid)
  }

  private clearAll() {
    for (const p of [...this.placed]) this.removePlaced(p.uid)
    for (const s of this.staff) {
      s.sprite.destroy()
      s.shadow.destroy()
    }
    this.staff = []
    this.holding = null
    this.clearGhost()
    this.perf = null
  }

  private drawGrid() {
    this.gridLines?.destroy()
    const g = this.add.graphics().setDepth(1).setVisible(this.isDecorating)
    // 고정 칸(회의실·문·계단·출입구)은 옅게 칠해 둔다
    for (const t of this.fixed) {
      g.fillStyle(FIXED_COLOR[t.kind], 0.28)
      g.fillPoints(this.diamond(t.gx, t.gy), true)
    }
    g.lineStyle(2, 0x2e2a40, 0.18)
    for (let i = 0; i <= this.room.cols; i++) {
      const a = this.world(i, 0)
      const b = this.world(i, this.room.rows)
      g.lineBetween(a.x, a.y, b.x, b.y)
    }
    for (let j = 0; j <= this.room.rows; j++) {
      const a = this.world(0, j)
      const b = this.world(this.room.cols, j)
      g.lineBetween(a.x, a.y, b.x, b.y)
    }
    this.gridLines = g
  }

  private diamond(gx: number, gy: number) {
    return [this.world(gx, gy), this.world(gx + 1, gy), this.world(gx + 1, gy + 1), this.world(gx, gy + 1)].map((q) => new Phaser.Math.Vector2(q.x, q.y))
  }

  private hold(h: Holding) {
    const pose = { itemId: h.itemId, gx: h.gx, gy: h.gy, rot: h.rot }
    const check = canPlace(this.floorState(), pose)
    this.holding = { ...h, ok: check.ok, reason: check.ok ? null : REASON_TEXT[check.reason] }
    const key = this.itemKey(h.itemId, h.rot)
    const m = this.artMeta.get(key)!
    const p = this.world(h.gx, h.gy)
    if (!this.ghost) this.ghost = this.add.image(0, 0, key).setDepth(1e6)
    this.ghost
      .setTexture(key)
      .setOrigin(m.ax, m.ay)
      .setPosition(p.x, p.y)
      .setAlpha(0.72)
      .setTint(check.ok ? 0xd8ffe4 : 0xffc8c4)
    // 놓을 칸: 초록(놓을 수 있음) / 빨강(걸린 칸) — 칸마다. 바닥에 칠하고 테두리는 가구 위에.
    // 길 막힘이면 걸린 칸은 닿지 못하게 되는 자리라 차지 칸 밖일 수 있다
    const g = this.marks!
    const line = this.markLines!
    g.clear()
    line.clear()
    const bad = new Set(check.ok ? [] : check.tiles.map(([x, y]) => `${x},${y}`))
    const cells = [...cellsOf(pose), ...(check.ok ? [] : check.tiles.map(([gx, gy]) => ({ gx, gy })))]
    const drawn = new Set<string>()
    for (const c of cells) {
      const k = `${c.gx},${c.gy}`
      if (drawn.has(k)) continue
      drawn.add(k)
      const color = bad.has(k) ? BAD_COLOR : OK_COLOR
      const pts = this.diamond(c.gx, c.gy)
      g.fillStyle(color, 0.45)
      g.fillPoints(pts, true)
      line.lineStyle(3, color, 1)
      line.strokePoints(pts, true)
    }
    this.emitState()
  }

  private clearGhost() {
    this.ghost?.destroy()
    this.ghost = undefined
    this.marks?.clear()
    this.markLines?.clear()
  }

  /** 방 전체가 보이게. 꾸미는 중이면 아래 버튼 자리(CSS 110px)를 비워 둔다 */
  private fit() {
    const cam = this.cameras.main
    const { width, height } = this.scale
    const k = width / Math.max(1, this.game.canvas.getBoundingClientRect().width)
    const reserve = this.isDecorating ? 110 * k : 0
    this.fitZoom = Math.min(width / this.roomSize.w, (height - reserve) / this.roomSize.h) * 0.94
    cam.setZoom(this.fitZoom)
    cam.centerOn(this.roomSize.w / 2, this.roomSize.h / 2 + reserve / 2 / this.fitZoom)
  }

  private zoomAt(sx: number, sy: number, zoom: number) {
    const cam = this.cameras.main
    const before = cam.getWorldPoint(sx, sy)
    cam.setZoom(Phaser.Math.Clamp(zoom, this.fitZoom * 0.6, this.fitZoom * 4))
    const after = cam.getWorldPoint(sx, sy)
    cam.scrollX += before.x - after.x
    cam.scrollY += before.y - after.y
  }

  private viewCenterCell() {
    const cam = this.cameras.main
    const c = this.cellAt(cam.midPoint.x, cam.midPoint.y)
    return { gx: Phaser.Math.Clamp(c.gx, 0, this.room.cols - 1), gy: Phaser.Math.Clamp(c.gy, 0, this.room.rows - 1) }
  }

  // ── 입력 ─────────────────────────────────────────────

  /** 가리킨 칸에 든 가구가 오도록 (긴 가구는 가운데 칸을 손가락·마우스 아래에) */
  private holdAt(wx: number, wy: number) {
    const h = this.holding
    if (!h) return
    const c = this.cellAt(wx, wy)
    const { w, d } = sizeOf(h.itemId, h.rot)
    const gx = c.gx - Math.floor((w - 1) / 2)
    const gy = c.gy - Math.floor((d - 1) / 2)
    if (gx !== h.gx || gy !== h.gy) this.hold({ ...h, gx, gy })
  }

  private onDown(p: Phaser.Input.Pointer) {
    const a = this.input.pointer1
    const b = this.input.pointer2
    if (a.isDown && b.isDown) {
      this.pinch = { dist: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), zoom: this.cameras.main.zoom, midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 }
      this.press = null
      return
    }
    if (p.rightButtonDown()) {
      this.rotate()
      return
    }
    const cam = this.cameras.main
    this.press = { x: p.x, y: p.y, moved: false, camX: cam.scrollX, camY: cam.scrollY, wasTouch: p.wasTouch || this.isTouch }
  }

  private onMove(p: Phaser.Input.Pointer) {
    const cam = this.cameras.main
    if (this.pinch) {
      const a = this.input.pointer1
      const b = this.input.pointer2
      if (!a.isDown || !b.isDown) return
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      this.zoomAt(mid.x, mid.y, (this.pinch.zoom * Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y)) / this.pinch.dist)
      cam.scrollX -= (mid.x - this.pinch.midX) / cam.zoom
      cam.scrollY -= (mid.y - this.pinch.midY) / cam.zoom
      this.pinch.midX = mid.x
      this.pinch.midY = mid.y
      return
    }
    const pr = this.press
    if (pr && Math.hypot(p.x - pr.x, p.y - pr.y) > 8 * (window.devicePixelRatio || 1)) pr.moved = true
    // 들고 있으면: 마우스는 따라다니고, 손가락은 끄는 동안만 따라온다
    if (this.holding && (pr || !this.isTouch)) {
      this.holdAt(p.worldX, p.worldY)
      return
    }
    // 들고 있지 않으면 끌어서 화면 이동
    if (pr?.moved) {
      cam.scrollX = pr.camX - (p.x - pr.x) / cam.zoom
      cam.scrollY = pr.camY - (p.y - pr.y) / cam.zoom
    }
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (this.pinch) {
      if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) this.pinch = null
      return
    }
    const pr = this.press
    this.press = null
    if (!pr || !this.isDecorating) return
    if (this.holding) {
      this.holdAt(p.worldX, p.worldY)
      // 마우스는 클릭(또는 끌어다 놓기)으로 확정. 손가락은 떼는 것만으로 확정하지 않는다(✓ 버튼)
      if (!pr.wasTouch) this.confirm()
      return
    }
    if (pr.moved) return
    // 놓인 가구를 눌러 다시 집는다
    const c = this.cellAt(p.worldX, p.worldY)
    const found = this.itemAt(c.gx, c.gy)
    if (!found) return
    this.removePlaced(found.uid)
    this.onLayoutChanged()
    this.hold({ itemId: found.itemId as ProtoItem, rot: found.rot, gx: found.gx, gy: found.gy, ok: false, reason: null, from: found })
  }

  /** 칸을 차지한 가구 (object 먼저 — 러그 위 가구를 고른다) */
  private itemAt(gx: number, gy: number) {
    const hits = this.placed.filter((p) => cellsOf(p).some((c) => c.gx === gx && c.gy === gy))
    return hits.find((p) => specOf(p.itemId).layer === 'object') ?? hits[0]
  }

  private onKey(e: KeyboardEvent) {
    if (!this.isDecorating || !this.holding) return
    if (e.key === 'r' || e.key === 'R' || e.key === 'ㄱ') this.rotate()
    else if (e.key === 'Enter') this.confirm()
    else if (e.key === 'Delete' || e.key === 'Backspace') this.stow()
    else if (e.key === 'Escape') this.cancel()
  }

  // ── 직원 ─────────────────────────────────────────────

  private staffTex(n: number) {
    if (!this.textures.exists(`stand-${n}-front`)) for (const [k, canvas] of Object.entries(drawPersonSet(lookOf(n)))) this.textures.addCanvas(k.replace('-', `-${n}-`), canvas)
  }

  private addStaff() {
    const n = this.staff.length
    this.staffTex(n)
    const free = this.freeCell()
    const s: Staff = {
      n,
      x: free.gx + 0.5,
      y: free.gy + 0.5,
      path: [],
      seatId: null,
      state: 'idle',
      timer: this.rand() * 1.5,
      facing: 0,
      frame: 0,
      sprite: this.add.image(0, 0, `stand-${n}-front`).setOrigin(0.5, 1),
      shadow: this.add.image(0, 0, 'person-shadow').setDepth(2),
    }
    this.staff.push(s)
  }

  private freeCell() {
    for (let i = 0; i < 200; i++) {
      const gx = Math.floor(this.rand() * this.room.cols)
      const gy = Math.floor(this.rand() * this.room.rows)
      if (!this.walk.blocked[cellKey(this.room, gx, gy)]) return { gx, gy }
    }
    return { gx: 0, gy: 0 }
  }

  /** 배치가 바뀌면: 막힌 칸을 다시 세고, 앉은 의자가 사라졌으면 일어나고, 길이 막혔으면 다시 찾는다 */
  private onLayoutChanged() {
    this.walk = buildWalkMap(this.room, this.placed, this.fixed)
    this.seats = seatsOf(this.placed)
    for (const s of this.staff) {
      const chair = s.seatId ? this.seats.find((p) => p.uid === s.seatId) : undefined
      if (s.seatId && !chair) {
        s.seatId = null
        s.path = []
        s.state = 'idle'
        s.timer = 0.3
        continue
      }
      if (s.state !== 'walk') continue
      const goal = s.path.at(-1)
      const isBlocked = s.path.some((c, i) => i < s.path.length - 1 && this.walk.blocked[cellKey(this.room, c.gx, c.gy)])
      const chairMoved = chair && goal && (chair.gx !== goal.gx || chair.gy !== goal.gy)
      const goalTaken = !chair && goal && this.walk.blocked[cellKey(this.room, goal.gx, goal.gy)]
      if (isBlocked || chairMoved || goalTaken) this.plan(s)
    }
    this.emitState()
  }

  /** 다음 할 일: 빈 의자가 있으면 가서 앉고(가까운 순), 없으면 빈 칸으로 거닌다 */
  private plan(s: Staff) {
    const from = { gx: Math.floor(s.x), gy: Math.floor(s.y) }
    s.seatId = null
    const taken = new Set(this.staff.filter((o) => o !== s && o.seatId).map((o) => o.seatId))
    const chairs = this.seats
      .filter((p) => !taken.has(p.uid))
      .sort((a, b) => Math.abs(a.gx - from.gx) + Math.abs(a.gy - from.gy) - (Math.abs(b.gx - from.gx) + Math.abs(b.gy - from.gy)))
    if (this.rand() < 0.7)
      for (const c of chairs.slice(0, 4)) {
        const path = findPath(this.walk, from, c)
        if (path) {
          s.seatId = c.uid
          s.path = path
          s.state = 'walk'
          return
        }
      }
    for (let i = 0; i < 8; i++) {
      const goal = this.freeCell()
      const path = findPath(this.walk, from, goal)
      if (path && path.length) {
        s.path = path
        s.state = 'walk'
        return
      }
    }
    s.state = 'idle'
    s.timer = 1
  }

  private stepStaff(s: Staff, dt: number) {
    if (s.state === 'sit' || s.state === 'idle') {
      s.timer -= dt
      if (s.timer > 0) return
      if (s.state === 'sit') {
        // 일어나 의자 앞 빈 칸으로 비켜선다
        s.seatId = null
        s.state = 'idle'
        s.timer = 0
      }
      this.plan(s)
      return
    }
    const next = s.path[0]
    if (!next) {
      s.state = 'idle'
      s.timer = 0.5 + this.rand() * 1.5
      return
    }
    const tx = next.gx + 0.5
    const ty = next.gy + 0.5
    const dx = tx - s.x
    const dy = ty - s.y
    const dist = Math.hypot(dx, dy)
    const step = WALK_SPEED * dt
    if (dist > 1e-3) s.facing = facingOf(dx, dy)
    s.frame += dt
    if (dist <= step) {
      s.x = tx
      s.y = ty
      s.path.shift()
      if (!s.path.length) {
        const chair = s.seatId ? this.seats.find((p) => p.uid === s.seatId) : undefined
        if (chair && chair.gx === next.gx && chair.gy === next.gy) {
          s.x = chair.gx + 0.5
          s.y = chair.gy + 0.5
          s.facing = chair.face
          s.state = 'sit'
          s.timer = 4 + this.rand() * 5
        } else {
          s.seatId = null
          s.state = 'idle'
          s.timer = 0.5 + this.rand() * 1.5
        }
      }
    } else {
      s.x += (dx / dist) * step
      s.y += (dy / dist) * step
    }
  }

  private drawStaff(s: Staff) {
    const isSit = s.state === 'sit'
    // 보는 방향: r0 ↙ · r1 ↖ · r2 ↗ · r3 ↘ — 방향마다 따로 그린 그림 (반전 없음)
    const dir = personDirOf(s.facing)
    const pose = isSit ? 'sit' : s.state === 'walk' ? (Math.floor(s.frame / FRAME_SEC) % 2 ? 'walk2' : 'walk1') : 'stand'
    const p = this.world(s.x, s.y, isSit ? 9 : 0)
    s.sprite
      .setTexture(`${pose}-${s.n}-${dir}`)
      .setPosition(p.x, p.y + PIXEL)
    const f = this.world(s.x, s.y)
    s.shadow.setPosition(f.x, f.y).setVisible(!isSit)
  }

  update(_t: number, deltaMs: number) {
    const t0 = performance.now()
    const dt = Math.min(deltaMs, 100) / 1000
    for (const s of this.staff) {
      this.stepStaff(s, dt)
      this.drawStaff(s)
    }
    this.sortDepth()
    this.updateCost = performance.now() - t0
    this.lastFps = Math.round(this.game.loop.actualFps)
    const pf = this.perf
    if (pf) {
      pf.frames.push(deltaMs)
      pf.update.push(this.updateCost)
      if (performance.now() - pf.t0 >= pf.seconds * 1000) {
        this.perf = null
        const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
        const sorted = [...pf.frames].sort((a, b) => a - b)
        pf.done({
          furniture: this.placed.length,
          staff: this.staff.length,
          seconds: pf.seconds,
          avgFps: Math.round((1000 / avg(pf.frames)) * 10) / 10,
          p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
          updateMs: Math.round(avg(pf.update) * 100) / 100,
          renderMs: Math.round(avg(pf.render) * 100) / 100,
        })
      }
    }
  }

  /** 가구 부품·직원을 한 번에 뒤 → 앞으로 정렬해 깊이를 매긴다 (매 프레임 — 직원이 움직이므로) */
  private sortDepth() {
    type D = IsoBox & { obj: Phaser.GameObjects.Image }
    const items: D[] = []
    for (const p of this.placed)
      for (const { img, box } of this.sprites.get(p.uid)?.images ?? []) items.push({ x: p.gx + box.x, y: p.gy + box.y, w: box.w, d: box.d, z: box.z, h: box.h, obj: img })
    for (const s of this.staff) items.push({ x: s.x - 0.18, y: s.y - 0.18, w: 0.36, d: 0.36, z: s.state === 'sit' ? 12 : 0, h: 24, obj: s.sprite })
    depthOrder(items).forEach((it, i) => it.obj.setDepth(10 + i))
  }

  private emitState() {
    this.events.emit('state', this.getState())
  }
}
