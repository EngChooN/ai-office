import { toCanvas } from './iso/isoArt'
import { HH, HW } from '@shared/iso/grid'
import { artCar, artExteriorPreview, artGround, artNeighbors, artPin, artWalker, P, type ExteriorBoard, type Pt } from './iso/exteriorArt'
import type { DioramaLayout } from './exteriorLayout'
import { isReducedMotion } from '@/lib/reducedMotion'

// 새 사무실 외관 화면: 위에서 내려다본 도시 블록 한가운데의 내 사무실 부지 (docs/specs/office-iso-spaces.md 2-2절, 대표님 "땅에 붙이기"·"배경 없이 거리로"). 그림은 iso/exteriorArt.ts, 배치·누르기 판정은 exteriorLayout.ts
// 땅(화면 전체)·이웃 건물·부지는 크기·레벨·낮밤이 바뀔 때만 굽고, 매 프레임에는 걷는 사람·차·내 사무실 핀·마우스 올림 빛만 그린다. 좌표는 논리 px(아트 px), 시간은 초

const WALK_FRAME_S = 0.18
const CAR_COLORS = ['#f0834e', '#5aa8d8', '#8fd6c2', '#edb417', '#f2a7b8', '#e9ebf0', '#9b86d8']
/** 내 사무실 핀이 건물 위에서 오르내리는 폭(px)·주기(초) */
const PIN_BOB = 2
const PIN_PERIOD_S = 1.6

const boardCanvas = new WeakMap<ExteriorBoard, HTMLCanvasElement>()
const outlineCanvas = new WeakMap<ExteriorBoard, HTMLCanvasElement>()

/** 화면 전체 땅·부지 뒤 이웃 건물은 groundCanvas에, 부지 + 오른쪽 이웃 건물은 sceneCanvas(투명 바탕)에.
 * 거리 건너편 이웃 건물·가로등은 frontCanvas(투명 바탕)에 — 사람·차 위에 얹는다 */
export function paintDiorama(groundCanvas: HTMLCanvasElement, sceneCanvas: HTMLCanvasElement, frontCanvas: HTMLCanvasElement, layout: DioramaLayout, isNight: boolean) {
  const { board, ox, oy } = layout
  const W = sceneCanvas.width
  const H = sceneCanvas.height
  const O: Pt = [ox + board.o[0], oy + board.o[1]]
  groundCanvas.getContext('2d')!.drawImage(toCanvas(artGround(W, H, isNight, O, board), 1), 0, 0)
  let art = boardCanvas.get(board)
  if (!art) boardCanvas.set(board, (art = toCanvas(board.cv, 1)))
  const c = sceneCanvas.getContext('2d')!
  c.clearRect(0, 0, W, H)
  c.drawImage(art, ox, oy)
  c.drawImage(toCanvas(artNeighbors(W, H, isNight, O, board, 'side'), 1), 0, 0)
  const f = frontCanvas.getContext('2d')!
  f.clearRect(0, 0, W, H)
  f.drawImage(toCanvas(artNeighbors(W, H, isNight, O, board, 'front'), 1), 0, 0)
}

/** 다음 레벨 미리보기용 작은 그림 */
export const dioramaPreviewUrl = (level: number, isNight: boolean) => toCanvas(artExteriorPreview(level, isNight, 12), 1).toDataURL()

interface Walker {
  gx: number
  dir: 1 | -1
  speed: number
  look: number
  t: number
}
interface Car {
  gx: number
  dir: 1 | -1
  speed: number
  color: string
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]

/** 큰길을 지나가는 사람(인도)·차(차도 두 줄). 큰길은 부지 밖으로 이어지므로 화면 끝에서 화면 끝까지 다닌다.
 * 수와 움직임 줄이기 규칙을 따른다 */
export class DioramaStreet {
  private walkers: Walker[] = []
  private cars: Car[] = []
  private nextWalker = 0
  private nextCar = 0
  private readonly sprites = new Map<string, { img: HTMLCanvasElement; o: Pt }>()
  private readonly O: Pt
  /** 줄마다 화면에 보이는 gx 범위 [왼쪽 위 끝, 오른쪽 아래 끝] (화면 밖 조금까지) */
  private readonly walkSpan: [number, number]
  private readonly carSpan: [number, number]

  constructor(
    private readonly W: number,
    private readonly H: number,
    private readonly layout: DioramaLayout,
    private readonly isNight: boolean,
    private readonly isStill: boolean,
  ) {
    const { board, ox, oy } = layout
    this.O = [ox + board.o[0], oy + board.o[1]]
    this.walkSpan = this.spanOf(board.lanes.walk, 0)
    const far = this.spanOf(board.lanes.far, 2)
    const near = this.spanOf(board.lanes.near + 1, 2)
    this.carSpan = [Math.max(far[0], near[0]), Math.min(far[1], near[1])]
    const [w0, w1] = this.walkSpan
    const [c0, c1] = this.carSpan
    for (let k = 0; k < Math.max(3, Math.round((w1 - w0) / 3)); k++) this.walkers.push(this.newWalker(rnd(w0, w1)))
    if (!isStill) for (let k = 0; k < 3; k++) this.cars.push(this.newCar(rnd(c0, c1 - 2)))
  }

  /** 칸 y가 lane인 줄에서 화면 안에 드는 gx 범위 (len = 물체 길이). 양쪽 다 화면 끝에서 조금 더 */
  private spanOf(lane: number, len: number): [number, number] {
    const [Ox, Oy] = this.O
    const lo = Math.max((-40 - Oy) / HH - lane, (-24 - Ox) / HW + lane - len)
    const hi = Math.min((this.W + 24 - Ox) / HW + lane, (this.H + 40 - Oy) / HH - lane)
    return [lo, Math.max(lo + 1, hi)]
  }

  private newWalker(gx?: number): Walker {
    const dir = Math.random() < 0.5 ? 1 : -1
    const [lo, hi] = this.walkSpan
    return { gx: gx ?? (dir === 1 ? lo : hi), dir, speed: rnd(0.6, 0.95), look: Math.floor(Math.random() * 40), t: Math.random() }
  }

  private newCar(gx?: number): Car {
    const dir = Math.random() < 0.5 ? 1 : -1
    const [lo, hi] = this.carSpan
    return { gx: gx ?? (dir === 1 ? lo : hi - 2), dir, speed: rnd(1.9, 2.9), color: pick(CAR_COLORS) }
  }

  step(dt: number) {
    if (this.isStill) return
    this.nextWalker -= dt
    if (this.nextWalker <= 0) {
      this.walkers.push(this.newWalker())
      this.nextWalker = rnd(1.4, 3.6)
    }
    this.nextCar -= dt
    if (this.nextCar <= 0) {
      const car = this.newCar()
      // 같은 차선 앞차와 겹치지 않게
      if (!this.cars.some((c) => c.dir === car.dir && Math.abs(c.gx - car.gx) < 3)) this.cars.push(car)
      this.nextCar = rnd(2.2, 5.5)
    }
    for (const w of this.walkers) {
      w.gx += w.dir * w.speed * dt
      w.t += dt
    }
    for (const c of this.cars) c.gx += c.dir * c.speed * dt
    this.walkers = this.walkers.filter((w) => w.gx >= this.walkSpan[0] - 0.1 && w.gx <= this.walkSpan[1] + 0.1)
    this.cars = this.cars.filter((c) => c.gx >= this.carSpan[0] - 0.1 && c.gx <= this.carSpan[1] - 1.9)
  }

  private sprite(key: string, make: () => { img: HTMLCanvasElement; o: Pt }) {
    let s = this.sprites.get(key)
    if (!s) this.sprites.set(key, (s = make()))
    return s
  }

  /** 하늘을 없애 구름도 없다 — OfficeMap의 호출 자리만 남겨 둔다 (정리 때 호출과 함께 지워도 된다) */
  drawClouds(_c: CanvasRenderingContext2D) {}

  /** 사람(인도) → 먼 차선 → 가까운 차선 순서: 앞으로 올수록 나중에 */
  drawTraffic(c: CanvasRenderingContext2D) {
    const { lanes } = this.layout.board
    for (const w of this.walkers) {
      const pose = (['walk1', 'stand', 'walk2', 'stand'] as const)[Math.floor(w.t / WALK_FRAME_S) % 4]
      // +x(↘)로 가면 앞모습을 뒤집고, −x(↖)로 가면 뒷모습
      const dir = w.dir === 1 ? 'front' : 'back'
      const s = this.sprite(`w-${w.look}-${pose}-${dir}`, () => {
        const cv = artWalker(this.isStill ? 'stand' : pose, dir, w.look, this.isNight)
        return { img: toCanvas(cv, 1), o: [Math.round(cv.w / 2), cv.h - 1] }
      })
      const [x, y] = P(this.O, w.gx, lanes.walk, 0)
      c.fillStyle = 'rgba(42,46,80,0.18)'
      c.fillRect(Math.round(x) - 5, Math.round(y) - 1, 11, 2)
      if (w.dir === 1) {
        c.save()
        c.translate(Math.round(x) + s.o[0], Math.round(y) - s.o[1])
        c.scale(-1, 1)
        c.drawImage(s.img, 0, 0)
        c.restore()
      } else c.drawImage(s.img, Math.round(x) - s.o[0], Math.round(y) - s.o[1])
    }
    for (const car of [...this.cars].sort((a, b) => a.dir - b.dir)) {
      const lane = car.dir === -1 ? lanes.far : lanes.near
      const s = this.sprite(`car-${car.color}-${car.dir}`, () => {
        const sp = artCar(car.color, this.isNight, car.dir)
        return { img: toCanvas(sp.cv, 1), o: sp.o }
      })
      const [x, y] = P(this.O, car.gx, lane, 0)
      c.drawImage(s.img, Math.round(x - s.o[0]), Math.round(y - s.o[1]))
      if (this.isNight) {
        // 전조등 빛: 진행 방향 앞으로 번지는 타원
        const [hx, hy] = P(this.O, car.dir === 1 ? car.gx + 2.6 : car.gx - 0.6, lane + 0.5, 0)
        c.fillStyle = 'rgba(255,236,170,0.16)'
        c.beginPath()
        c.ellipse(hx, hy, 12, 5, 0, 0, Math.PI * 2)
        c.fill()
      }
    }
  }
}

let pinCanvas: HTMLCanvasElement | null = null

/** 내 사무실 표시 + 마우스 올림 빛 (매 프레임, 사람·차·건너편 건물 위에).
 * 늘: 건물 위에 둥실 오르내리는 주황 핀. strength > 0이면: 건물 외곽선이 노랗게 빛나고, 출입문에 불이 켜지며 문 앞 바닥으로 빛이 번진다 */
export function drawDioramaDoorGlow(c: CanvasRenderingContext2D, layout: DioramaLayout, strength: number) {
  const { pin } = layout
  pinCanvas ??= toCanvas(artPin(), 1)
  const bob = isReducedMotion() ? 0 : Math.round(Math.sin((performance.now() / 1000 / PIN_PERIOD_S) * Math.PI * 2) * PIN_BOB)
  c.drawImage(pinCanvas, Math.round(pin.x - pinCanvas.width / 2), pin.y - pinCanvas.height - 6 + bob)
  if (strength <= 0) return
  const b = layout.board.building
  let outline = outlineCanvas.get(layout.board)
  if (!outline) outlineCanvas.set(layout.board, (outline = toCanvas(layout.board.outline, 1)))
  c.globalAlpha = strength
  c.drawImage(outline, layout.ox + b.x, layout.oy + b.y)
  c.globalAlpha = 1
  const pts = layout.board.door.map(([x, y]) => [x + layout.ox, y + layout.oy] as Pt)
  c.fillStyle = `rgba(255,214,120,${0.7 * strength})`
  c.beginPath()
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)))
  c.closePath()
  c.fill()
  const [x0, y0] = pts[3]
  const [x1, y1] = pts[2]
  c.fillStyle = `rgba(255,214,130,${0.3 * strength})`
  c.beginPath()
  c.ellipse((x0 + x1) / 2, (y0 + y1) / 2 + 4, 14, 6, 0, 0, Math.PI * 2)
  c.fill()
}
