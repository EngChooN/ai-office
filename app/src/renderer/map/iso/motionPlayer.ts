// 소품 연출 재생기 (연출④-3 · docs/specs/furniture-motion-guide.md). 지도 장면(IsoOfficeScene)에만 붙는다 — 미니 뷰는 멈춘 그림.
// 무엇을 언제 움직일지는 shared/iso/propMotion(순수 규칙·상품 표)이 정하고, 여기는 Phaser 쪽 일만 한다:
//   시트 불러오기·해제(이 층에 놓인 상품 것만) · 가구 그림을 시트 프레임으로 바꿔 끼우기 · 동시 동작 상한 · 화면 밖·백그라운드 정지 ·
//   움직임 줄이기 · B 눌러서 켜고 끄기(저장은 setGridItemOn — 가구 배치와 같이 shop.grid) · 호버 반응 ·
//   E 지나가면(passBy)·F 행사(celebrate) 한 번 재생 — 시트에 클립이 없으면 그림 없이 살짝 들썩인다
import * as Phaser from 'phaser'
import { useOffice } from '@/store'
import { isReducedMotion } from '@/lib/reducedMotion'
import { PIXEL, type Cell } from '@shared/iso/grid'
import { isNightTime } from '@shared/dayNight'
import type { GridItem } from '@shared/iso/furniture'
import {
  clipLength,
  enterClipOf,
  isAnimated,
  isBeside,
  loopFrame,
  motionOf,
  originOf,
  phaseOf,
  pickNearest,
  sheetFrameOf,
  sheetsFor,
  stateOf,
  stillFrameOf,
  triggerFrame,
  TRIGGERS,
  type MotionKind,
  type MotionSheet,
  type PropMotion,
  type TriggerKind,
} from '@shared/iso/propMotion'
import manifest from './motion/manifest.json'

const SHEETS = Object.fromEntries(Object.entries(manifest).filter(([, v]) => typeof v === 'object')) as unknown as Record<string, MotionSheet>
const SHEET_SCALE = manifest.scale
/** 시트 그림 주소 — 처음 쓸 때 불러온다 (Vite가 motion/*.png를 묶는다) */
const sheetUrl = (file: string) => new URL(`./motion/${file}`, import.meta.url).href
const textureKey = (sheet: string) => `motion-${sheet}`
/** 안 쓰게 된 시트를 지우기 전 기다리는 시간 — 층을 오가며 바로 다시 쓰면 다시 받지 않게 */
const SHEET_KEEP_MS = 4000
/** 눌렀다 뗄 때 이만큼(화면 px) 움직였으면 화면 끌기로 본다 (꾸미기와 같은 값) */
const TAP_PX = 6
/** 호버 반응: 1 아트 px 들어 올린다 (가이드 1절 — 그림은 그대로) */
const HOVER_LIFT = PIXEL
const HOVER_KINDS: MotionKind[] = ['A', 'B']
/** E·F를 그림 없이 할 때 들썩이는 높이 */
const FX_HOP = 2 * PIXEL

/** 장면이 알려 주는 것 — 장면 안쪽 구조는 모른다 */
export interface MotionHost {
  /** 이 층 가구 그림 (uid → 부품). 연출은 첫 부품(본체)에만 */
  parts(): ReadonlyMap<string, readonly { img: Phaser.GameObjects.Image; item: GridItem }[]>
  /** C: 직원이 지금 이 가구를 쓰는 중 (도착해서 머무는 동안 — 기존 '쓰기' 장면 그대로) */
  isUsed(uid: string): boolean
  /** D: 이 가구의 일을 보는 직원이 일하는 중 */
  isWorking(item: GridItem): boolean
}

interface Binding {
  uid: string
  item: GridItem
  img: Phaser.GameObjects.Image
  motion: PropMotion
  /** 바꿔 끼운 시트 (불러오기 전이면 null — 원래 그림 그대로) */
  sheet: MotionSheet | null
  baseY: number
  state: string | null
  /** 상태가 바뀔 때 한 번 재생하는 클립 (켜는 순간 등) */
  enter: string | null
  /** 지금 상태가 시작된 재생기 시각 (ms) */
  stateAt: number
  /** 마지막으로 끼운 시트 칸 */
  shown: number
  /** 지금 겹쳐 재생하는 순간 종류(E·F) — 시트에 그 클립이 있을 때만 */
  trigger: { kind: TriggerKind; at: number } | null
  /** E가 마지막으로 반응한 재생기 시각 */
  reactAt: number
}

export class MotionPlayer {
  private readonly bindings = new Map<string, Binding>()
  private readonly loading = new Set<string>()
  /** 못 불러온 시트 — 이번 실행 동안 다시 받지 않고 멈춘 그림으로 둔다 */
  private readonly failed = new Set<string>()
  private readonly releaseTimers = new Map<string, Phaser.Time.TimerEvent>()
  /** 이 층 가구의 최신 배치 — 켜짐만 바뀌면 장면은 그림을 그대로 두어 부품의 item이 예전 값이라 여기서 읽는다 */
  private items = new Map<string, GridItem>()
  /** 눌러서 바꿨지만 아직 스냅샷에 오지 않은 켜짐 (uid → 켜짐) */
  private readonly pending = new Map<string, boolean>()
  /** 재생기 시각 — 백그라운드·정지 동안은 흐르지 않는다 */
  private clock = 0
  private isHidden = typeof document !== 'undefined' && document.hidden
  private isReduced = isReducedMotion()
  private isNight = false
  private hoverUid: string | null = null
  private press: { x: number; y: number } | null = null
  private readonly cleanups: (() => void)[] = []

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: MotionHost,
  ) {
    const onVisibility = () => (this.isHidden = document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility))
    scene.input.on('pointerdown', this.onDown, this)
    scene.input.on('pointerup', this.onUp, this)
    scene.input.on('pointermove', this.onMove, this)
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroy())
  }

  /** 가구 배치·켜짐이 바뀐 뒤 (장면 sync 끝). 이 층 상품의 시트만 올리고 나머지는 내린다 */
  sync(items: readonly GridItem[]) {
    this.items = new Map(items.map((it) => [it.uid, it]))
    const needed = sheetsFor(items.map((it) => it.itemId))
    for (const id of needed) this.ensureSheet(id)
    for (const id of Object.keys(SHEETS)) if (!needed.has(id)) this.scheduleRelease(id)
    for (const it of items) if (this.pending.get(it.uid) === Boolean(it.isOn)) this.pending.delete(it.uid)
    this.rebind()
  }

  update(deltaMs: number) {
    const cam = this.scene.cameras.main
    // 앱이 백그라운드거나 사무실 안이 안 보이면 멈춘다 (건물 밖 풍경은 이 장면 위를 덮을 뿐이라 장면은 계속 돈다)
    if (this.isHidden || !cam.visible || !useOffice.getState().isInside) return
    this.clock += deltaMs
    // 매 프레임 읽는다 — 설정을 바꾸면 바로 따른다 (change 이벤트가 오지 않는 환경도 있다)
    this.isReduced = isReducedMotion()
    this.isNight = isNightTime(useOffice.getState().settings)
    const view = cam.worldView
    // 움직일 후보: 반복 클립이고 화면 안. 넘치면 가운데에서 가까운 것부터 (상한 MOTION_CAP)
    const cands: { b: Binding; x: number; y: number }[] = []
    for (const b of this.bindings.values()) {
      this.advanceState(b)
      if (!b.sheet || this.isReduced || !b.img.visible || !isAnimated(this.clipOf(b))) continue
      const r = b.img.getBounds()
      if (Phaser.Geom.Rectangle.Overlaps(view, r)) cands.push({ b, x: r.centerX, y: r.centerY })
    }
    const playing = new Set(pickNearest(cands, cam.midPoint).map((c) => c.b))
    for (const b of this.bindings.values()) if (b.sheet) this.show(b, this.frameOf(b, playing.has(b)))
  }

  // ── 상태 ─────────────────────────────────────────────

  private isOnOf(b: Binding) {
    return this.pending.get(b.uid) ?? Boolean(b.item.isOn)
  }

  /** 신호 → 바탕 상태. 바뀌었으면 켜는 순간 같은 한 번짜리 클립을 건다 (움직임 줄이기면 생략) */
  private advanceState(b: Binding) {
    if (!b.sheet) return
    const has = (k: MotionKind) => b.motion.kinds.includes(k)
    const next = stateOf(b.motion.kinds, {
      isOn: this.isOnOf(b),
      isUsed: has('C') && this.host.isUsed(b.uid),
      isWorking: has('D') && this.host.isWorking(b.item),
      isNight: this.isNight,
    })
    if (next === b.state) return
    b.enter = next !== null && !this.isReduced ? enterClipOf(b.sheet, b.state, next) : null
    b.state = next
    b.stateAt = this.clock
    // 상한 밖이라 멈춰 있어도 새 상태의 첫 장으로는 바꿔 둔다
    b.shown = -1
  }

  private clipOf(b: Binding) {
    return b.state !== null ? b.sheet?.clips[b.state] : undefined
  }

  /** 이번 프레임에 보일 행 안 프레임 번호. 상한 밖이면 멈춘 채 지금 장 그대로 */
  private frameOf(b: Binding, isPlaying: boolean): number {
    const sheet = b.sheet!
    if (this.isReduced) return stillFrameOf(sheet, b.state)
    const trigger = b.trigger && sheet.clips[TRIGGERS[b.trigger.kind].clip]
    if (b.trigger && trigger) {
      const t = TRIGGERS[b.trigger.kind]
      const since = this.clock - b.trigger.at
      const f = triggerFrame(trigger, b.trigger.kind, since)
      if (f !== null) return f
      // 재생 사이·끝나면 바탕 상태 그림으로 (상한 밖이어도 한 번은 바꿔 둔다)
      if (since >= t.gapMs * (t.times - 1) + clipLength(trigger)) b.trigger = null
      b.shown = -1
    }
    const elapsed = this.clock - b.stateAt
    const enter = b.enter ? sheet.clips[b.enter] : undefined
    if (enter && elapsed < clipLength(enter)) return enter.frames[Math.floor(elapsed / enter.ms!)]
    const clip = this.clipOf(b)
    if (!clip) return stillFrameOf(sheet, b.state)
    if (!isAnimated(clip)) return clip.frames[0]
    if (!isPlaying) return b.shown >= 0 ? -1 : clip.frames[0]
    return loopFrame(clip, elapsed + phaseOf(b.uid, clipLength(clip)))
  }

  /** frame -1 = 그대로 둔다 */
  private show(b: Binding, frame: number) {
    if (frame < 0) return
    const cell = sheetFrameOf(b.sheet!, b.item.rot, frame)
    if (cell === b.shown) return
    b.img.setFrame(cell)
    b.shown = cell
  }

  // ── 그림 바꿔 끼우기 ─────────────────────────────────

  /** 장면이 다시 그린 부품과 맞춘다 (배치가 바뀌면 그림 객체가 새로 생긴다) */
  private rebind() {
    const seen = new Set<string>()
    for (const [uid, parts] of this.host.parts()) {
      const part = parts[0]
      const item = this.items.get(uid) ?? part?.item
      const motion = item && motionOf(item.itemId)
      if (!motion) continue
      seen.add(uid)
      const prev = this.bindings.get(uid)
      const b: Binding =
        prev && prev.img === part.img
          ? { ...prev, item }
          : { uid, item, img: part.img, motion, sheet: null, baseY: part.img.y, state: null, enter: null, stateAt: this.clock, shown: -1, trigger: null, reactAt: -Infinity }
      this.bindings.set(uid, b)
      if (!b.sheet) this.attach(b)
    }
    for (const uid of this.bindings.keys()) if (!seen.has(uid)) this.bindings.delete(uid)
  }

  /** 시트가 올라와 있으면 그림을 시트로 바꾼다 (칸 크기·기준점이 원래 그림과 같다) */
  private attach(b: Binding) {
    const sheet = SHEETS[b.motion.sheet]
    const key = textureKey(b.motion.sheet)
    if (!sheet || !this.scene.textures.exists(key)) return
    const o = originOf(sheet, b.item.rot)
    b.sheet = sheet
    b.shown = -1
    b.img.setTexture(key, sheetFrameOf(sheet, b.item.rot, stillFrameOf(sheet, null))).setOrigin(o.x, o.y)
  }

  private ensureSheet(id: string) {
    this.releaseTimers.get(id)?.remove()
    this.releaseTimers.delete(id)
    const sheet = SHEETS[id]
    const key = textureKey(id)
    if (!sheet || this.scene.textures.exists(key) || this.loading.has(id) || this.failed.has(id)) return
    this.loading.add(id)
    const size = { frameWidth: sheet.cell[0] * SHEET_SCALE, frameHeight: sheet.cell[1] * SHEET_SCALE }
    const done = () => {
      this.loading.delete(id)
      this.scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError)
      this.rebind()
    }
    // 못 불러오면 원래 멈춘 그림 그대로 둔다
    const onError = (file: Phaser.Loader.File) => {
      if (file.key !== key) return
      this.failed.add(id)
      done()
    }
    this.scene.load.once(`${Phaser.Loader.Events.FILE_KEY_COMPLETE}spritesheet-${key}`, done)
    this.scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError)
    this.scene.load.spritesheet(key, sheetUrl(sheet.file), size)
    this.scene.load.start()
  }

  /** 이 층에 그 상품이 없으면 잠시 뒤 시트를 내린다 (그 사이 다시 쓰면 취소) */
  private scheduleRelease(id: string) {
    const key = textureKey(id)
    if (!this.scene.textures.exists(key) || this.releaseTimers.has(id)) return
    const timer = this.scene.time.delayedCall(SHEET_KEEP_MS, () => {
      this.releaseTimers.delete(id)
      const isInUse = [...this.bindings.values()].some((b) => b.motion.sheet === id && b.img.active)
      if (!isInUse && this.scene.textures.exists(key)) this.scene.textures.remove(key)
    })
    this.releaseTimers.set(id, timer)
  }

  // ── 순간 종류 (E·F) ─────────────────────────────────

  /** E: 직원이 칸 at에 들어왔다 — 바로 옆 소품이 한 번 반응한다 */
  passBy(at: Cell) {
    for (const b of this.bindings.values()) {
      if (!b.motion.kinds.includes('E') || !isBeside(b.item, at) || this.clock - b.reactAt < TRIGGERS.E.cooldownMs) continue
      if (this.play(b, 'E')) b.reactAt = this.clock
    }
  }

  /** F: 레벨업·회의 시작 — 화면 안의 행사 소품이 다 함께 (상한 MOTION_CAP, 가운데에서 가까운 것부터) */
  celebrate() {
    const cam = this.scene.cameras.main
    const cands = [...this.bindings.values()].filter((b) => b.motion.kinds.includes('F')).map((b) => ({ b, x: b.img.getBounds().centerX, y: b.img.getBounds().centerY }))
    for (const { b } of pickNearest(cands, cam.midPoint)) this.play(b, 'F')
  }

  /** 한 번 재생. 움직임 줄이기·백그라운드·화면 밖이면 하지 않는다 */
  private play(b: Binding, kind: TriggerKind) {
    if (this.isReduced || this.isHidden || !b.img.active || !b.img.visible) return false
    if (!Phaser.Geom.Rectangle.Overlaps(this.scene.cameras.main.worldView, b.img.getBounds())) return false
    const t = TRIGGERS[kind]
    if (b.sheet && isAnimated(b.sheet.clips[t.clip])) {
      b.trigger = { kind, at: this.clock }
      return true
    }
    // 그림이 없으면 효과로: fxMs 동안 살짝 들썩 (F는 gapMs 간격으로 times번)
    this.scene.tweens.killTweensOf(b.img)
    b.img.setY(b.baseY)
    this.scene.tweens.add({
      targets: b.img,
      y: b.baseY - FX_HOP,
      duration: t.fxMs / 2,
      yoyo: true,
      repeat: t.times - 1,
      repeatDelay: Math.max(0, t.gapMs - t.fxMs),
      onComplete: () => b.img.active && b.img.setY(b.uid === this.hoverUid ? b.baseY - HOVER_LIFT : b.baseY),
    })
    return true
  }

  // ── 누르기·호버 ─────────────────────────────────────

  private isDecorating() {
    return useOffice.getState().isDecorating
  }

  /** 화면 위 점에 있는 연출 소품 (앞에 그려진 것 먼저) */
  private bindingAt(wx: number, wy: number, kinds: MotionKind[]) {
    let hit: Binding | null = null
    for (const b of this.bindings.values()) {
      if (!b.sheet || !b.img.visible || !b.motion.kinds.some((k) => kinds.includes(k))) continue
      if (!b.img.getBounds().contains(wx, wy)) continue
      // 투명한 칸 귀퉁이는 빼고 그림이 있는 곳만
      const local = b.img.getLocalPoint(wx, wy)
      const alpha = this.scene.textures.getPixelAlpha(local.x, local.y, b.img.texture.key, b.img.frame.name)
      if (!alpha) continue
      if (!hit || b.img.depth > hit.img.depth) hit = b
    }
    return hit
  }

  private onDown(p: Phaser.Input.Pointer, objs: unknown[]) {
    // 직원을 눌렀거나 꾸미기 중이면 그쪽 일
    this.press = objs.length === 0 && !this.isDecorating() ? { x: p.x, y: p.y } : null
  }

  private onUp(p: Phaser.Input.Pointer) {
    const pr = this.press
    this.press = null
    if (!pr || this.isDecorating() || Math.hypot(p.x - pr.x, p.y - pr.y) > TAP_PX * (window.devicePixelRatio || 1)) return
    const b = this.bindingAt(p.worldX, p.worldY, ['B'])
    if (b) this.toggle(b)
  }

  /** B: 바로 바꿔 보이고 저장한다. 저장이 거절되면(예전 PC 등) 되돌린다 */
  private toggle(b: Binding) {
    const next = !this.isOnOf(b)
    this.pending.set(b.uid, next)
    window.office.setGridItemOn(b.uid, next).catch(() => {
      if (this.pending.get(b.uid) === next) this.pending.delete(b.uid)
    })
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (p.wasTouch) return
    const b = this.isReduced || this.isDecorating() ? null : this.bindingAt(p.worldX, p.worldY, HOVER_KINDS)
    const uid = b?.uid ?? null
    if (uid === this.hoverUid) return
    const prev = this.hoverUid ? this.bindings.get(this.hoverUid) : undefined
    if (prev?.img.active) prev.img.setY(prev.baseY)
    this.hoverUid = uid
    if (b) b.img.setY(b.baseY - HOVER_LIFT)
  }

  destroy() {
    this.cleanups.forEach((c) => c())
    this.cleanups.length = 0
    for (const t of this.releaseTimers.values()) t.remove()
    this.releaseTimers.clear()
    this.scene.input?.off('pointerdown', this.onDown, this)
    this.scene.input?.off('pointerup', this.onUp, this)
    this.scene.input?.off('pointermove', this.onMove, this)
  }
}
