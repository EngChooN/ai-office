// 데모데이 발표장 장면 (docs/specs/demo-stage-art.md · 이디자 그림). 사무실 맵과 따로 도는 작은 장면이다.
// 장면이 맡는 것: 무대·객석 그림, 직원 걷기(자리 ↔ 연단), 객석 어둡게·조명, 박수·별·하트·트로피·왕관·꽃가루, 마지막 단체 인사.
// 화면(React)이 맡는 것: 스크린 슬라이드·말풍선·반응 버튼·전환 막 — 슬라이드는 첨부 사진이 캔버스를 더럽히지 않게 DOM으로 캔버스 뒤에 깐다
// (배경의 스크린 자리를 뚫어 두었다). 연출은 모두 이 화면 안에서만 돌고 AI를 부르지 않는다
import * as Phaser from 'phaser'
import { PIXEL, toWorld, type Origin } from '@shared/iso/grid'
import { depthOrder, type IsoBox } from '@shared/iso/depth'
import type { DemoPhase, DemoReaction } from '@shared/gallery'
import { isReducedMotion } from '@/lib/reducedMotion'
import { isoLook } from '../IsoOfficeScene'
import {
  artHallRow,
  artPerson,
  artPersonShadow,
  artStageClap,
  artStageCrown,
  artStageHall,
  artStageHeart,
  artStagePieces,
  artStageSpot,
  artStageStar,
  artStageTrophy,
  hallRowKey,
  stageScreenQuad,
  stageSeats,
  STAGE,
  STAGE_COLORS,
  STAGE_CONFETTI,
  toCanvas,
  type ArtBox,
  type Cv,
  type PersonDir,
  type PersonPose,
} from './isoArt'

/** 무대에 서는 사람 (객석 순서 = 배열 순서) */
export interface StageCastMember {
  id: string
  avatar: number
}

/** 화면이 스냅샷마다 넘기는 진행 상태 */
export interface StageState {
  cast: StageCastMember[]
  presenterId: string | null
  phase: DemoPhase
  mvpId: string | null
  isDone: boolean
}

/** 화면이 DOM을 겹칠 자리 (캔버스 CSS px): 스크린 네 꼭짓점(왼위·오위·오아래·왼아래)과 발표자 머리 위 */
export interface StageLayout {
  quad: { x: number; y: number }[]
  head: { x: number; y: number }
}

interface Spot {
  gx: number
  gy: number
  z: number
}

interface Actor {
  id: string
  avatar: number
  img: Phaser.GameObjects.Image
  shadow: Phaser.GameObjects.Image
  seat: Spot & { isSeated: boolean }
  at: Spot
  path: Spot[]
  dir: PersonDir
  /** 단체 인사 때 내려가는 깊이 (세계 px) */
  bow: number
}

const STEP_S = 0.28
const WALK_FRAME_S = 0.18
const PERSON_H = 30
const HEAD_Z = 34
const DIM_ALPHA = 0.35
const SPOT_ALPHA = 0.9
const FX_DEPTH = 55_000
const BOW_GAP = 0.75
const FINALE_MS = 3_200
const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color

export class DemoStageScene extends Phaser.Scene {
  private o: Origin = { x: 0, y: 0 }
  private worldW = 0
  private worldH = 0
  private readonly actors = new Map<string, Actor>()
  private statics: { obj: Phaser.GameObjects.Image; box: IsoBox }[] = []
  private dim!: Phaser.GameObjects.Graphics
  private spot!: Phaser.GameObjects.Image
  private crown!: Phaser.GameObjects.Image
  private state: StageState | null = null
  private prev: StageState | null = null
  private readonly presented = new Set<string>()
  private confetti: { obj: Phaser.GameObjects.Rectangle; x0: number; v: number; t: number }[] = []
  /** MVP 트로피가 날아가는 동안은 왕관을 숨긴다 */
  private crownAt = 0
  private walkClock = 0
  private isReady = false

  constructor(
    private readonly onLayout: (layout: StageLayout) => void,
    private readonly onFinale: () => void,
  ) {
    super('demo-stage')
  }

  // ── 화면이 부르는 것 ─────────────────────────────────

  sync(next: StageState) {
    this.state = next
    if (this.isReady) this.apply()
  }

  /** 대표 반응 연출 (서버 저장은 화면이 이미 했다) */
  react(kind: DemoReaction) {
    const who = this.presenter()
    if (!who) return
    if (kind === 'clap') {
      this.audienceClap()
      this.stars(who, 5, 60)
      this.rain(20)
    } else if (kind === 'mvp') {
      this.trophy(who)
      this.audienceClap()
    } else this.hearts(who)
  }

  // ── 만들기 ───────────────────────────────────────────

  create() {
    const hall = artStageHall()
    const hallCanvas = toCanvas(hall.cv)
    punchScreen(hallCanvas)
    this.addArt('stage-hall', hallCanvas)
    this.worldW = hallCanvas.width
    this.worldH = hallCanvas.height
    this.o = { x: hall.o[0] * PIXEL, y: hall.o[1] * PIXEL }
    this.add.image(0, 0, 'stage-hall').setOrigin(0, 0).setDepth(0)

    for (const p of artStagePieces()) this.addStatic(`stage-${p.key}`, p.cv, p.o, p.box, p.at)
    for (const gy of STAGE.seatRows)
      for (const role of ['seat', 'back'] as const) {
        const row = artHallRow(role, STAGE.seatsPerRow)
        this.addStatic(`${hallRowKey(role, STAGE.seatsPerRow)}-${gy}`, row.cv, row.o, row.box, { gx: STAGE.seatX, gy })
      }

    // 객석만 어둡게 (무대 앞단보다 아래)
    const front = this.world({ gx: 0, gy: STAGE.platform.d, z: 0 }).y
    this.dim = this.add.graphics().setDepth(2).setAlpha(0)
    this.dim.fillStyle(hex(STAGE_COLORS.dim), 1).fillRect(0, front, this.worldW, this.worldH - front)

    const spot = artStageSpot()
    this.addArt('stage-spot', toCanvas(spot.cv))
    this.spot = this.add.image(0, 0, 'stage-spot').setOrigin(spot.o[0] / spot.cv.w, spot.o[1] / spot.cv.h).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0)
    this.tweens.add({ targets: this.spot, scaleX: 1.02, duration: 1_200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    this.addArt('stage-shadow', toCanvas(artPersonShadow()))
    this.addArt('stage-fx-clap0', toCanvas(artStageClap(0)))
    this.addArt('stage-fx-clap1', toCanvas(artStageClap(1)))
    this.addArt('stage-fx-star', toCanvas(artStageStar()))
    this.addArt('stage-fx-heart', toCanvas(artStageHeart()))
    this.addArt('stage-fx-trophy', toCanvas(artStageTrophy()))
    this.addArt('stage-fx-crown', toCanvas(artStageCrown()))
    this.crown = this.add.image(0, 0, 'stage-fx-crown').setOrigin(0.5, 1).setDepth(FX_DEPTH).setVisible(false)

    this.fit()
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fit())
    this.isReady = true
    if (this.state) this.apply()
  }

  private addArt(key: string, canvas: HTMLCanvasElement) {
    if (!this.textures.exists(key)) this.textures.addImage(key, canvas as unknown as HTMLImageElement)
  }

  private addStatic(key: string, cv: Cv, o: [number, number], box: ArtBox, at: { gx: number; gy: number }) {
    this.addArt(key, toCanvas(cv))
    const p = this.world({ ...at, z: 0 })
    const obj = this.add.image(p.x, p.y, key).setOrigin(o[0] / cv.w, o[1] / cv.h)
    this.statics.push({ obj, box: { ...box, x: box.x + at.gx, y: box.y + at.gy } })
  }

  /** 무대 전체가 보이게 맞추고, 화면에 DOM 겹칠 자리를 알린다 */
  private fit() {
    const cam = this.cameras.main
    const zoom = Math.min(cam.width / this.worldW, cam.height / this.worldH) * 0.96
    const cx = this.worldW / 2
    const cy = this.worldH / 2
    cam.setZoom(zoom).centerOn(cx, cy)
    const toScreen = (x: number, y: number) => ({ x: (x - cx) * zoom + cam.width / 2, y: (y - cy) * zoom + cam.height / 2 })
    const head = this.world({ ...STAGE.speaker, z: STAGE.platform.h + HEAD_Z })
    this.onLayout({ quad: stageScreenQuad().map(([x, y]) => toScreen(x * PIXEL, y * PIXEL)), head: toScreen(head.x, head.y) })
  }

  private world(s: Spot) {
    return toWorld(this.o, s.gx, s.gy, s.z * PIXEL)
  }

  // ── 진행 상태 반영 ───────────────────────────────────

  private apply() {
    const next = this.state!
    const prev = this.prev
    this.prev = next
    this.ensureCast(next.cast)
    if (next.presenterId) this.presented.add(next.presenterId)

    if (prev?.presenterId !== next.presenterId) {
      if (prev?.presenterId) this.walk(prev.presenterId, toSeat(this.actors.get(prev.presenterId)?.seat))
      // 막 열었을 때 이미 발표 중이면 걸어 나오지 않고 연단에 세운다
      if (next.presenterId) this.walk(next.presenterId, toStage(this.actors.get(next.presenterId)?.seat), !prev && next.phase !== 'enter')
    }
    if (prev && prev.phase === 'present' && next.phase === 'clap') {
      this.audienceClap()
      this.stageStars()
    }
    const isLit = !next.isDone && (next.phase === 'present' || next.phase === 'remark')
    this.tweens.add({ targets: this.dim, alpha: isLit ? DIM_ALPHA : 0, duration: isLit ? 400 : 300 })
    this.tweens.add({ targets: this.spot, alpha: isLit ? SPOT_ALPHA : 0, duration: 300 })
    if (next.isDone && !prev?.isDone) this.finale()
  }

  private ensureCast(cast: StageCastMember[]) {
    const seats = stageSeats(Math.max(cast.length, this.actors.size))
    cast.forEach((m, i) => {
      if (this.actors.has(m.id)) return
      const seat = seats[i] ?? stageSeats(i + 1)[i]
      const img = this.add.image(0, 0, this.personKey(m.avatar, 'sit', 'back')).setOrigin(0.5, 1)
      const shadow = this.add.image(0, 0, 'stage-shadow')
      this.actors.set(m.id, { id: m.id, avatar: m.avatar, img, shadow, seat, at: { ...seat }, path: [], dir: 'back', bow: 0 })
    })
  }

  private presenter() {
    const id = this.state?.presenterId
    return id ? (this.actors.get(id) ?? null) : null
  }

  private personKey(avatar: number, pose: PersonPose, dir: PersonDir) {
    const key = `stage-p${avatar}-${pose}-${dir}`
    if (!this.textures.exists(key)) this.addArt(key, toCanvas(artPerson(pose, dir, isoLook(avatar))))
    return key
  }

  private walk(id: string, path: Spot[], isInstant = false) {
    const a = this.actors.get(id)
    if (!a || !path.length) return
    if (isInstant) {
      a.at = { ...path[path.length - 1] }
      a.path = []
    } else a.path = [...path]
  }

  // ── 매 프레임 ────────────────────────────────────────

  update(_time: number, deltaMs: number) {
    const dt = Math.min(0.1, deltaMs / 1000)
    this.walkClock += dt
    for (const a of this.actors.values()) this.stepActor(a, dt)
    this.sortDepth()
    this.placeSpotAndCrown()
    this.stepConfetti(dt)
  }

  private stepActor(a: Actor, dt: number) {
    let budget = dt / STEP_S
    while (budget > 0 && a.path.length) {
      const to = a.path[0]
      const dist = Math.hypot(to.gx - a.at.gx, to.gy - a.at.gy) || 0.001
      const u = Math.min(1, budget / dist)
      if (to.gx + to.gy !== a.at.gx + a.at.gy) a.dir = to.gx + to.gy < a.at.gx + a.at.gy ? 'back' : 'front'
      a.at = { gx: a.at.gx + (to.gx - a.at.gx) * u, gy: a.at.gy + (to.gy - a.at.gy) * u, z: a.at.z + (to.z - a.at.z) * u }
      budget -= dist * u
      if (u >= 1) a.path.shift()
    }
    const isWalking = a.path.length > 0
    const isHome = !isWalking && near(a.at, a.seat)
    // 자리에선 무대를 보고(등), 무대 위에선 객석을 본다(앞)
    if (!isWalking) a.dir = isHome ? 'back' : 'front'
    const pose: PersonPose = isWalking ? (Math.floor(this.walkClock / WALK_FRAME_S) % 2 ? 'walk2' : 'walk1') : isHome && a.seat.isSeated ? 'sit' : 'stand'
    const foot = this.world(a.at)
    a.img.setTexture(this.personKey(a.avatar, pose, a.dir)).setPosition(foot.x, foot.y + a.bow)
    a.shadow.setPosition(foot.x, foot.y)
  }

  private sortDepth() {
    const items = [
      ...this.statics,
      ...[...this.actors.values()].map((a) => ({ obj: a.img, box: { x: a.at.gx - 0.2, y: a.at.gy - 0.2, w: 0.4, d: 0.4, z: a.at.z, h: PERSON_H } })),
    ]
    depthOrder(items.map((it) => ({ ...it.box, it }))).forEach(({ it }, i) => it.obj.setDepth(10 + i * 2))
    for (const a of this.actors.values()) a.shadow.setDepth(a.img.depth - 1)
  }

  private placeSpotAndCrown() {
    const who = this.presenter()
    if (who) {
      const foot = this.world(who.at)
      this.spot.setPosition(foot.x, foot.y).setDepth(who.img.depth + 0.5)
    }
    const mvp = this.state?.mvpId ? this.actors.get(this.state.mvpId) : null
    const isCrownShown = !!mvp && this.time.now >= this.crownAt
    this.crown.setVisible(isCrownShown)
    if (mvp && isCrownShown) {
      const head = this.world({ ...mvp.at, z: mvp.at.z + (near(mvp.at, mvp.seat) && mvp.seat.isSeated ? HEAD_Z - 8 : HEAD_Z) })
      this.crown.setPosition(head.x, head.y + mvp.bow)
    }
  }

  // ── 이펙트 ───────────────────────────────────────────

  private headOf(a: Actor, lift = 0) {
    const isSitting = near(a.at, a.seat) && a.seat.isSeated
    return this.world({ ...a.at, z: a.at.z + (isSitting ? HEAD_Z - 8 : HEAD_Z) + lift })
  }

  /** 객석 머리 위 박수 손 — 직원마다 조금씩 늦게, 손을 번갈아 바꾸며 떠올라 사라진다 */
  private audienceClap() {
    const isStill = isReducedMotion()
    let i = 0
    for (const a of this.actors.values()) {
      if (a.id === this.state?.presenterId || a.path.length) continue
      const p = this.headOf(a, -8)
      const hand = this.add.image(p.x, p.y, 'stage-fx-clap0').setOrigin(0.5, 1).setDepth(FX_DEPTH).setAlpha(0)
      const flip = this.time.addEvent({ delay: 120, loop: true, callback: () => hand.setTexture(hand.texture.key === 'stage-fx-clap0' ? 'stage-fx-clap1' : 'stage-fx-clap0') })
      const delay = (i++ * 70) % 300
      this.tweens.add({ targets: hand, alpha: 1, duration: 150, delay })
      this.tweens.add({
        targets: hand,
        alpha: 0,
        y: isStill ? p.y : p.y - 6 * PIXEL,
        duration: 400,
        delay: delay + 1_200,
        onComplete: () => {
          flip.remove()
          hand.destroy()
        },
      })
    }
  }

  /** 박수 단계: 무대 앞에서 별 3개가 튄다 */
  private stageStars() {
    if (isReducedMotion()) return
    for (const gx of [3, 5, 7]) {
      const p = this.world({ gx, gy: STAGE.platform.d, z: STAGE.platform.h })
      const star = this.add.image(p.x, p.y, 'stage-fx-star').setOrigin(0.5, 1).setDepth(FX_DEPTH)
      this.tweens.add({ targets: star, y: p.y - 14 * PIXEL, duration: 350, yoyo: true, ease: 'Quad.easeOut', delay: gx * 40, onComplete: () => star.destroy() })
    }
  }

  /** 발표자 머리 위에서 별이 부채꼴(±spread°)로 튀어 오른다 */
  private stars(who: Actor, n: number, spread: number) {
    if (isReducedMotion()) return
    const p = this.headOf(who)
    for (let i = 0; i < n; i++) {
      const rad = Phaser.Math.DegToRad(-90 - spread + (2 * spread * i) / Math.max(1, n - 1))
      const star = this.add.image(p.x, p.y, 'stage-fx-star').setDepth(FX_DEPTH)
      this.tweens.add({ targets: star, x: p.x + Math.cos(rad) * 18 * PIXEL, y: p.y + Math.sin(rad) * 18 * PIXEL, duration: 400, ease: 'Quad.easeOut' })
      this.tweens.add({ targets: star, alpha: 0, duration: 300, delay: 500, onComplete: () => star.destroy() })
    }
  }

  /** 한마디: 하트 3개가 차례로 떠오르며 사라진다 */
  private hearts(who: Actor) {
    const isStill = isReducedMotion()
    const p = this.headOf(who)
    for (let i = 0; i < 3; i++) {
      const heart = this.add.image(p.x + (i - 1) * 8 * PIXEL, p.y, 'stage-fx-heart').setOrigin(0.5, 1).setDepth(FX_DEPTH).setAlpha(0)
      this.tweens.add({ targets: heart, alpha: 1, duration: 150, delay: i * 150 })
      this.tweens.add({ targets: heart, y: isStill ? p.y : p.y - 24 * PIXEL, alpha: 0, duration: 900, delay: i * 150 + 150, onComplete: () => heart.destroy() })
    }
  }

  /** MVP: 트로피가 스크린 앞에 커지며 나타났다가 발표자 머리로 날아가 왕관이 된다 */
  private trophy(who: Actor) {
    const isStill = isReducedMotion()
    const at = this.world({ gx: 5, gy: 0.8, z: 30 })
    const cup = this.add.image(at.x, at.y, 'stage-fx-trophy').setOrigin(0.5, 1).setDepth(FX_DEPTH).setScale(isStill ? 1.2 : 0).setAlpha(isStill ? 0 : 1)
    this.crownAt = this.time.now + (isStill ? 2_000 : 2_600)
    const flyAway = () => {
      const head = this.headOf(who)
      this.tweens.add({
        targets: cup,
        ...(isStill ? { alpha: 0 } : { x: head.x, y: head.y, scale: 0.3 }),
        duration: isStill ? 300 : 600,
        delay: 1_500,
        ease: 'Quad.easeIn',
        onComplete: () => cup.destroy(),
      })
    }
    this.tweens.add({ targets: cup, ...(isStill ? { alpha: 1 } : { scale: 1.2 }), duration: 500, ease: isStill ? 'Linear' : 'Back.easeOut', onComplete: flyAway })
    this.rain(60)
  }

  /** 꽃가루 n개를 화면 위에서 뿌린다 (2초에 걸쳐 내리게 시작 높이를 흩는다) */
  private rain(n: number) {
    if (isReducedMotion()) return
    const view = this.cameras.main.worldView
    for (let i = 0; i < n; i++) {
      const isWide = i % 2 === 0
      const v = (40 + Math.random() * 30) * PIXEL
      const x0 = view.x + Math.random() * view.width
      const y = view.y - Math.random() * v * 2
      const color = hex(STAGE_CONFETTI[i % STAGE_CONFETTI.length])
      const obj = this.add.rectangle(x0, y, (isWide ? 2 : 1) * PIXEL, (isWide ? 1 : 2) * PIXEL, color).setDepth(FX_DEPTH)
      this.confetti.push({ obj, x0, v, t: Math.random() * 6 })
    }
  }

  private stepConfetti(dt: number) {
    if (!this.confetti.length) return
    const bottom = this.cameras.main.worldView.bottom
    this.confetti = this.confetti.filter((c) => {
      c.t += dt
      c.obj.y += c.v * dt
      c.obj.x = c.x0 + Math.sin(c.t * 3) * 10 * PIXEL
      c.obj.rotation += Math.PI * 2 * dt
      if (c.obj.y < bottom) return true
      c.obj.destroy()
      return false
    })
  }

  /** 마지막 단체 인사: 발표한 사람이 대기 자리부터 한 줄로 서서 두 번 인사하고, 객석 박수·꽃가루 뒤 화면에 끝을 알린다 */
  private finale() {
    const line = [...this.presented].filter((id) => this.actors.has(id))
    line.forEach((id, i) => {
      const a = this.actors.get(id)!
      const spot = { gx: STAGE.waiting.gx + i * BOW_GAP, gy: STAGE.waiting.gy, z: STAGE.platform.h }
      this.walk(id, isOnStage(a.at) ? [spot] : [...toStage(a.seat).slice(0, -2), spot])
    })
    const walkMs = 2_000
    if (!isReducedMotion())
      for (const id of line) this.tweens.add({ targets: this.actors.get(id)!, bow: 2 * PIXEL, duration: 250, yoyo: true, repeat: 1, delay: walkMs, ease: 'Sine.easeInOut' })
    this.time.delayedCall(walkMs + 600, () => {
      this.audienceClap()
      this.rain(30)
    })
    this.time.delayedCall(walkMs + FINALE_MS - 2_000, () => this.onFinale())
  }
}

// ── 길 (발표장 칸) ──────────────────────────────────────

const AISLE_GX = 1.5
const near = (a: Spot, b: Spot) => Math.abs(a.gx - b.gx) < 0.01 && Math.abs(a.gy - b.gy) < 0.01
const isOnStage = (s: Spot) => s.z >= STAGE.platform.h - 0.01

/** 자리 → 통로 → 계단 → 대기 자리 → 발표자 자리 */
function toStage(seat: Spot | undefined): Spot[] {
  if (!seat) return []
  const stage = STAGE.platform.h
  return [{ gx: AISLE_GX, gy: seat.gy, z: 0 }, ...STAGE.stairs, { ...STAGE.waiting, z: stage }, { ...STAGE.speaker, z: stage }]
}

/** 같은 길을 거꾸로 */
function toSeat(seat: Spot | undefined): Spot[] {
  if (!seat) return []
  return [...toStage(seat).reverse().slice(1), seat]
}

/** 배경의 스크린 자리를 뚫는다 — 그 뒤에 깔린 DOM 슬라이드가 보이게 */
function punchScreen(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  stageScreenQuad().forEach(([x, y], i) => (i ? ctx.lineTo(x * PIXEL, y * PIXEL) : ctx.moveTo(x * PIXEL, y * PIXEL)))
  ctx.closePath()
  ctx.fill()
}
