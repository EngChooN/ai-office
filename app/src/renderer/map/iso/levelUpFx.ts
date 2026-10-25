// 레벨업 순간의 사무실 연출 (기술 설계 1-2절 깊이 55000 층 · 이디자 C3)
// 1) 새로 생긴 칸이 뒤에서 앞으로 반짝이며 깔린다  2) 재질 단계가 바뀌면 빛 띠가 벽 위에서 바닥 앞까지 훑고 지나가며
//    예전 바닥·벽(위에 덮어 둔 예전 그림)을 걷어 낸다  3) 방 위에 "Lv.N" 이름표가 떠올랐다 사라진다
// 장면(IsoOfficeScene)은 바닥을 새로 구운 뒤 playLevelUpFx만 부른다. 시간 t의 모습은 seek(t)로 언제든 다시 그린다(캡처용)
import * as Phaser from 'phaser'
import { PIXEL, TILE_H, TILE_W, WALL_H, SLAB, toWorld, type Origin, type Room } from '@shared/iso/grid'

export const LEVEL_UP_FX_S = 2.8

const POP_START = 0.1
const POP_SPREAD = 0.55
const POP_LEN = 0.7
const SWEEP_START = 0.3
const SWEEP_LEN = 1.3
const BADGE_IN = 0.15
const BADGE_OUT = 2.3
const GOLD = 0xffd76a
const WHITE = 0xffffff
const FONT = '-apple-system, "Apple SD Gothic Neo", "Segoe UI", "Malgun Gothic", sans-serif'

export interface LevelUpFxInput {
  level: number
  /** 새 방의 (0,0) 칸 위 꼭짓점 (세계 px) */
  o: Origin
  from: Room
  to: Room
  /** 재질이 바뀌었으면 예전 방 텍스처(이미 만들어 둔 것)와 앵커 — 빛 띠가 이것을 걷어 낸다 */
  oldFloor?: { texKey: string; anchor: { x: number; y: number } }
  /** 연출 층 (55000) · 바닥 층 (예전 바닥 그림은 바닥 바로 위) */
  depth: number
  floorDepth: number
  /** 이름표 아래 줄 (넓어진 칸·새 층·새 재질) */
  lines: string[]
}

const easeOutBack = (u: number) => 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2
const clamp01 = (u: number) => Math.max(0, Math.min(1, u))
/** 결정적 난수 (반짝이 위치가 매번 같게) */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export class LevelUpFx {
  private readonly pops: { gx: number; gy: number; delay: number }[] = []
  private readonly fill: Phaser.GameObjects.Graphics
  private readonly glow: Phaser.GameObjects.Graphics
  private readonly oldImg?: Phaser.GameObjects.Image
  private readonly badge: Phaser.GameObjects.Container
  private readonly badgeY: number
  /** 방 실루엣의 위(벽 꼭대기)·아래(바닥 앞) 세계 y (gx+gy 합 단위가 아니라 px) */
  private readonly top: number
  private readonly bottom: number
  private t = 0
  private isDone = false

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly input: LevelUpFxInput,
  ) {
    const { from, to, o, depth } = input
    // 새 칸: 새 방 안이면서 예전 방 밖. 뒤(gx+gy 작음)에서 앞으로 퍼진다
    const fresh: { gx: number; gy: number }[] = []
    for (let gy = 0; gy < to.rows; gy++) for (let gx = 0; gx < to.cols; gx++) if (gx >= from.cols || gy >= from.rows) fresh.push({ gx, gy })
    const sums = fresh.map((c) => c.gx + c.gy)
    const lo = Math.min(...sums)
    const span = Math.max(1, Math.max(...sums) - lo)
    for (const c of fresh) this.pops.push({ ...c, delay: POP_START + ((c.gx + c.gy - lo) / span) * POP_SPREAD })

    this.top = o.y - WALL_H * PIXEL
    this.bottom = o.y + (to.cols + to.rows) * (TILE_H / 2) + SLAB * PIXEL
    if (input.oldFloor) {
      this.oldImg = scene.add
        .image(o.x - input.oldFloor.anchor.x, o.y - input.oldFloor.anchor.y, input.oldFloor.texKey)
        .setOrigin(0, 0)
        .setDepth(input.floorDepth + 1)
    }
    this.fill = scene.add.graphics().setDepth(depth)
    this.glow = scene.add.graphics().setDepth(depth + 1).setBlendMode(Phaser.BlendModes.ADD)

    // 이름표: 방 뒤쪽 모서리(벽 꼭대기) 위
    const title = scene.add.text(0, 0, `Lv.${input.level}`, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#2e2a40' }).setOrigin(0.5, 0).setResolution(3)
    const sub = scene.add.text(0, 30, input.lines.join('\n'), { fontFamily: FONT, fontSize: '12px', color: '#4a4f80', align: 'center', lineSpacing: 3 }).setOrigin(0.5, 0).setResolution(3)
    const w = Math.max(title.width, sub.width) + 32
    const h = 30 + (input.lines.length ? sub.height + 10 : 4)
    const bg = scene.add.graphics()
    bg.fillStyle(0x4a4f80, 0.25).fillRoundedRect(-w / 2 + 2, -6 + 4, w, h + 8, 10)
    bg.fillStyle(0xfff8ea, 0.96).fillRoundedRect(-w / 2, -6, w, h + 8, 10)
    bg.lineStyle(2, 0xf0834e, 1).strokeRoundedRect(-w / 2, -6, w, h + 8, 10)
    bg.fillStyle(0xf0834e, 1).fillRoundedRect(-w / 2, -6, w, 5, { tl: 10, tr: 10, bl: 0, br: 0 })
    const peak = toWorld(o, 0, 0)
    const mid = toWorld(o, to.cols / 2, to.rows / 2)
    this.badgeY = peak.y - WALL_H * PIXEL - h - 18
    this.badge = scene.add.container(mid.x, this.badgeY, [bg, title, sub]).setDepth(depth + 2)
    this.seek(0)
  }

  get done() {
    return this.isDone
  }

  /** 시작 뒤 t초의 모습으로 다시 그린다 */
  seek(t: number) {
    this.t = t
    this.fill.clear()
    this.glow.clear()
    this.drawFlash(t)
    this.drawPops(t)
    this.drawSweep(t)
    this.drawBadge(t)
  }

  step(dtS: number) {
    if (this.isDone) return
    if (this.t + dtS >= LEVEL_UP_FX_S) return this.destroy()
    this.seek(this.t + dtS)
  }

  destroy() {
    if (this.isDone) return
    this.isDone = true
    for (const o of [this.fill, this.glow, this.oldImg, this.badge]) o?.destroy()
  }

  // ── 그리기 ───────────────────────────────────────────

  private diamond(gx: number, gy: number, scale: number) {
    const c = toWorld(this.input.o, gx + 0.5, gy + 0.5)
    const hw = (TILE_W / 2) * scale
    const hh = (TILE_H / 2) * scale
    return [new Phaser.Math.Vector2(c.x, c.y - hh), new Phaser.Math.Vector2(c.x + hw, c.y), new Phaser.Math.Vector2(c.x, c.y + hh), new Phaser.Math.Vector2(c.x - hw, c.y)]
  }

  /** 시작 순간 방 전체가 한 번 환해진다 */
  private drawFlash(t: number) {
    const a = 0.35 * (1 - clamp01(t / 0.4))
    if (a <= 0) return
    this.silhouette((x, y0, y1) => {
      this.glow.fillStyle(0xfff0c8, a)
      this.glow.fillRect(x, y0, 4, y1 - y0)
    })
  }

  /** 새 칸: 작게 나타나 커지며 금색으로 빛났다 사라진다 */
  private drawPops(t: number) {
    for (const p of this.pops) {
      const u = (t - p.delay) / POP_LEN
      if (u <= 0 || u >= 1) continue
      const scale = 0.35 + 0.65 * easeOutBack(clamp01(u * 1.6))
      const a = u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75
      const pts = this.diamond(p.gx, p.gy, scale)
      this.fill.fillStyle(GOLD, 0.7 * a)
      this.fill.fillPoints(pts, true)
      this.glow.fillStyle(0xfff0b0, 0.35 * a)
      this.glow.fillPoints(pts, true)
      this.glow.lineStyle(3, WHITE, a)
      this.glow.strokePoints(pts, true)
      // 칸 가운데 작은 반짝이
      if (u > 0.15 && u < 0.7) {
        const c = toWorld(this.input.o, p.gx + 0.5, p.gy + 0.5)
        this.star(c.x, c.y - 6 - 10 * u, 5 * (1 - Math.abs(u - 0.42) / 0.3), a)
      }
    }
  }

  /** 재질 바뀜: 빛 띠가 위(벽 꼭대기)에서 아래(바닥 앞)로 훑고, 그 위쪽은 예전 그림이 걷혀 새 재질이 드러난다 */
  private drawSweep(t: number) {
    if (!this.oldImg) return
    const u = clamp01((t - SWEEP_START) / SWEEP_LEN)
    const ease = u * u * (3 - 2 * u)
    const lineY = this.top - 20 + (this.bottom - this.top + 40) * ease
    const img = this.oldImg
    const cut = Math.max(0, Math.min(img.height, lineY - img.y))
    if (cut >= img.height) img.setVisible(false)
    else img.setVisible(true).setCrop(0, cut, img.width, img.height - cut)
    if (u <= 0 || u >= 1) return
    // 띠: 방 실루엣 안에서만 (뒤로 길게 흐려지는 꼬리 + 밝은 앞선)
    const band: [number, number, number][] = [
      [-56, -28, 0.06],
      [-28, -10, 0.14],
      [-10, -2, 0.3],
      [-2, 3, 0.45],
    ]
    this.silhouette((x, y0, y1) => {
      for (const [a, b, alpha] of band) {
        const top = Math.max(y0, lineY + a)
        const bot = Math.min(y1, lineY + b)
        if (bot <= top) continue
        this.glow.fillStyle(0xfff4d0, alpha)
        this.glow.fillRect(x, top, 4, bot - top)
      }
    })
    // 띠를 따라 반짝이
    for (let k = 0; k < 22; k++) {
      const x = this.xMin() + hash(k + Math.floor(u * 6) * 31) * (this.xMax() - this.xMin())
      const span = this.spanAt(x)
      const y = lineY - 6 + (hash(k * 7 + 3) - 0.5) * 16
      if (!span || y < span[0] || y > span[1]) continue
      this.star(x, y, 3 + 4 * hash(k * 13 + Math.floor(u * 10)), 0.9)
    }
  }

  private drawBadge(t: number) {
    const u = clamp01((t - BADGE_IN) / 0.35)
    const out = clamp01((t - BADGE_OUT) / (LEVEL_UP_FX_S - BADGE_OUT))
    this.badge.setAlpha(u * (1 - out))
    this.badge.setY(this.badgeY + 14 * (1 - easeOutBack(u)) - 10 * out)
    this.badge.setScale(0.9 + 0.1 * clamp01(u * 1.4))
  }

  private star(x: number, y: number, r: number, a: number) {
    if (r <= 0 || a <= 0) return
    this.glow.fillStyle(WHITE, a)
    this.glow.fillPoints([new Phaser.Math.Vector2(x, y - r), new Phaser.Math.Vector2(x + r * 0.28, y - r * 0.28), new Phaser.Math.Vector2(x + r, y), new Phaser.Math.Vector2(x + r * 0.28, y + r * 0.28), new Phaser.Math.Vector2(x, y + r), new Phaser.Math.Vector2(x - r * 0.28, y + r * 0.28), new Phaser.Math.Vector2(x - r, y), new Phaser.Math.Vector2(x - r * 0.28, y - r * 0.28)], true)
    this.glow.fillStyle(GOLD, a * 0.5)
    this.glow.fillCircle(x, y, r * 0.35)
  }

  // ── 방 실루엣 (뒤쪽 벽 꼭대기 ~ 바닥판 앞) ────────────

  private xMin() {
    return this.input.o.x - (this.input.to.rows * TILE_W) / 2
  }
  private xMax() {
    return this.input.o.x + (this.input.to.cols * TILE_W) / 2
  }

  /** 세계 x에서 방이 차지한 세로 범위 */
  private spanAt(x: number): [number, number] | null {
    const { o, to } = this.input
    const u = (x - o.x) / (TILE_W / 2) // gx - gy
    if (u < -to.rows || u > to.cols) return null
    const back = Math.abs(u)
    const front = Math.min(2 * to.cols - u, 2 * to.rows + u)
    return [o.y + (back * TILE_H) / 2 - WALL_H * PIXEL, o.y + (front * TILE_H) / 2 + SLAB * PIXEL]
  }

  /** 4px 폭 세로 띠로 실루엣을 훑는다 */
  private silhouette(draw: (x: number, y0: number, y1: number) => void) {
    for (let x = this.xMin(); x < this.xMax(); x += 4) {
      const span = this.spanAt(x + 2)
      if (span) draw(x, span[0], span[1])
    }
  }
}

/** 연출을 시작하고 장면 update에 붙인다. 움직임 줄이기를 켰으면 하지 않는다 */
export function playLevelUpFx(scene: Phaser.Scene, input: LevelUpFxInput): LevelUpFx | null {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null
  const fx = new LevelUpFx(scene, input)
  const onUpdate = (_time: number, deltaMs: number) => {
    fx.step(Math.min(0.1, deltaMs / 1000))
    if (fx.done) scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate)
  }
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => fx.destroy())
  return fx
}
