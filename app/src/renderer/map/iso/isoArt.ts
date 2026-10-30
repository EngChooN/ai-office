// 아이소메트릭 픽셀아트 — 사무실 개편의 그림을 모두 여기서 그린다 (A 파스텔 · docs/specs/office-iso-art.md).
// 화면(Phaser 텍스처)과 시안 생성기(scripts/iso-art.mts → docs/specs/office-iso-art/)가 이 파일 하나를 같이 쓴다.
// 그리기는 DOM 없이 픽셀 배열(Cv)에 하고, 화면에서만 toCanvas()로 캔버스를 만든다 (생성기는 같은 픽셀로 PNG를 쓴다).
// 텍스처 키(나중에 그림 파일로 바꿀 때 같은 키로 PNG를 넣는다):
//   가구·소품 `item-{itemId}-r{0~3}` (의자류는 `-seat`·`-back` 두 장) — 소품 itemId는 `prop-{key}`, 품목 id·칸 크기는 shared/iso/furniture.ts
//   직원 `{stand|walk1|walk2|sit}-{n}-{front|back}` · 방 `room-{cols}x{rows}-{finishKey}` (칸 표 방은 `room-{cols}x{rows}-{칸 지문}-{finishKey}`)
//   경계 조각 `plan-{kind}-{side}-{gx}x{gy}` · 구역 바닥 `zone-floor-{종류}-{w}x{d}` · 회의실 테이블 `meet-*` (각 함수 옆 설명)
// 노드(생성기)에서도 읽도록 상대 경로 + .ts 확장자로 가져온다
import { levelRowOf, type Material } from '../../../shared/officeLevel.ts'
import { HH, HW, PIXEL, SLAB, WALL_H, WALL_T, type Room } from '../../../shared/iso/grid.ts'
import { CellKind, edgesOf, kindAt, type EdgeSide } from '../../../shared/iso/plan.ts'
import { edgeBox } from '../../../shared/iso/depth.ts'
import { specOf, type Rot } from '../../../shared/iso/furniture.ts'
import { decodeLook, FACE_ITEMS, HAIR_COLORS, HAIR_STYLES, HEAD_ITEMS, PANTS, SKINS, TOP_COLORS, TOPS } from '../../../shared/look.ts'
import { itemName } from '../../../shared/i18n/names.ts'
import { drawFigure, figureHex, type FigureDir, type FigurePose, type Grid } from './personArt.ts'

type RGBA = [number, number, number, number]
type Color = string | RGBA
/** null = 칠하지 않음(투명) — 둥근 러그처럼 상자 모양이 아닌 것 */
type Fill = Color | null

// 칠할 때마다 같은 색 문자열을 다시 풀지 않게 기억해 둔다 (돌려준 배열은 고치지 않는다)
const HEX = new Map<string, RGBA>()
const hex = (c: string): RGBA => {
  let v = HEX.get(c)
  if (!v) HEX.set(c, (v = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), c.length > 7 ? parseInt(c.slice(7, 9), 16) : 255]))
  return v
}
const C = (c: Color): RGBA => (typeof c === 'string' ? hex(c) : c)
const mix = (a: Color, b: Color, t: number): RGBA => {
  const x = C(a)
  const y = C(b)
  return [0, 1, 2].map((i) => Math.round(x[i] + (y[i] - x[i]) * t)).concat(x[3]) as RGBA
}
const WHITE = hex('#ffffff')
const noise = (x: number, y: number) => (((Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663)) >>> 0) % 997) / 997
const frac = (n: number) => n - Math.floor(n)
const n32 = (a: number, b: number) => noise(Math.round(a * 32), Math.round(b * 32))

/** 아트 px 캔버스 (빈 칸 = 알파 0). DOM이 없어도 된다 */
export class Cv {
  readonly w: number
  readonly h: number
  readonly px: Uint8ClampedArray
  constructor(w: number, h: number) {
    this.w = Math.max(1, Math.ceil(w))
    this.h = Math.max(1, Math.ceil(h))
    this.px = new Uint8ClampedArray(this.w * this.h * 4)
  }
  has(i: number) {
    return this.px[i * 4 + 3] > 0
  }
  read(i: number): RGBA {
    const p = this.px
    return [p[i * 4], p[i * 4 + 1], p[i * 4 + 2], p[i * 4 + 3]]
  }
  write(i: number, c: RGBA) {
    const p = this.px
    const j = i * 4
    p[j] = c[0]
    p[j + 1] = c[1]
    p[j + 2] = c[2]
    p[j + 3] = c[3]
  }
  set(x: number, y: number, c: RGBA | null) {
    x = Math.round(x)
    y = Math.round(y)
    if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const i = y * this.w + x
    // 반투명은 이미 칠한 색 위에 섞고, 빈 칸에는 반투명 그대로 둔다 (바닥 그림자)
    if (c[3] < 255 && this.has(i)) this.write(i, mix(this.read(i), c, c[3] / 255).slice(0, 3).concat(this.px[i * 4 + 3]) as RGBA)
    else this.write(i, c)
  }
  fill(c: Color) {
    const rgba = C(c)
    for (let i = 0; i < this.w * this.h; i++) this.write(i, rgba)
  }
  blit(src: Cv, dx: number, dy: number, flip = false) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const i = y * src.w + (flip ? src.w - 1 - x : x)
        if (src.has(i)) this.set(dx + x, dy + y, src.read(i))
      }
  }
  /** scale배 확대한 RGBA (가장 가까운 픽셀) — 화면 캔버스·PNG 둘 다 이것으로 */
  scaled(scale = PIXEL) {
    const W = this.w * scale
    const H = this.h * scale
    const out = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      const row = Math.floor(y / scale) * this.w
      for (let x = 0; x < W; x++) {
        const s = (row + Math.floor(x / scale)) * 4
        out.set(this.px.subarray(s, s + 4), (y * W + x) * 4)
      }
    }
    return { w: W, h: H, data: out }
  }
}

/** 화면 캔버스로 (브라우저 전용). 아트 px 그대로 한 장 찍고 브라우저가 가장 가까운 픽셀로 키운다 — 픽셀마다 JS로 키우면 폰에서 큰 방이 수백 ms */
export function toCanvas(cv: Cv, scale = PIXEL) {
  const src = document.createElement('canvas')
  src.width = cv.w
  src.height = cv.h
  src.getContext('2d')!.putImageData(new ImageData(cv.px as Uint8ClampedArray<ArrayBuffer>, cv.w, cv.h), 0, 0)
  if (scale === 1) return src
  const canvas = document.createElement('canvas')
  canvas.width = cv.w * scale
  canvas.height = cv.h * scale
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
  return canvas
}

// ── 빛·그림자·외곽선 (A 파스텔, 문서 2절 · 외곽선과 옆면 음영을 진하게) — 0.16: 남색 → 따뜻한 자두·밤색으로 옮겨 전체가 따뜻하게 ──
const S = {
  out: '#3a2a32',
  sh: '#5c4252', // 그림자색: 따뜻한 자두색 계열로 섞는다 (회색·검정을 섞지 않는다)
  shadeS: 0.16,
  shadeE: 0.36,
  hi: 0.4,
  floorShadow: [72, 46, 52, 48] as RGBA,
}

// ── 팔레트 — 앱 색(라벤더 primary, 초록 working, 노랑 waiting)에서 가져왔다. 주황은 따뜻한 포인트색 ──
const K = {
  white: '#faf5ec',
  paper: '#fffcf5',
  metal: '#665a66',
  metalL: '#c4b9b2',
  steel: '#ddd3c9',
  dark: '#41363f',
  navy: '#3a4a6a',
  wood: '#d6ae7a',
  woodL: '#e8c79a',
  woodD: '#a77d52',
  walnut: '#8a5a3c',
  walnutT: '#a06a46',
  deskTop: '#f3e3ca',
  deskSide: '#e2cbaa',
  screen: '#9fe3ff',
  keyboard: '#f3ede3',
  orange: '#f0834e',
  /** 앱 기본 테마(라벤더) --primary 계열 — 기본 의자 */
  accent: '#8f80e6',
  green: '#3fc168', // --status-working
  mint: '#8fd6c2',
  mintL: '#a8e2d2',
  yellow: '#edb417', // --status-waiting
  red: '#e85a4a',
  blue: '#5aa8d8',
  sky: '#a8dcf2',
  skyL: '#e6f7ff',
  purple: '#9b86d8',
  pink: '#f2a7b8',
  gold: '#d8b45a',
  pot: '#ec9a72',
  stone: '#e4ded4',
  stoneD: '#c9c0b2',
  leaf: ['#3f9a58', '#62bd6c', '#9ad87e'],
  fabric: '#9fb3c8',
}

/** 실루엣 외곽선 1px: 닿은 색을 외곽선색 쪽으로 86% 어둡게 */
function outline(cv: Cv) {
  const src = cv.px.slice()
  const solid = (i: number) => src[i * 4 + 3] === 255
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < cv.w; x++) {
      const i = y * cv.w + x
      if (src[i * 4 + 3] > 0) continue
      let n = -1
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const xx = x + dx
        const yy = y + dy
        // 반투명(바닥 그림자)에는 외곽선을 두르지 않는다
        if (xx >= 0 && yy >= 0 && xx < cv.w && yy < cv.h && solid(yy * cv.w + xx)) n = yy * cv.w + xx
      }
      if (n >= 0) cv.write(i, mix([src[n * 4], src[n * 4 + 1], src[n * 4 + 2], 255], S.out, 0.86))
    }
}

// ── 아이소 투영·상자 ─────────────────────────────────────
type Pt = [number, number]
const P = (o: Pt, gx: number, gy: number, z: number): Pt => [o[0] + (gx - gy) * HW, o[1] + (gx + gy) * HH - z]

function fillPoly(cv: Cv, pts: Pt[], colorAt: (px: number, py: number) => RGBA | null) {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x0 = Math.max(0, Math.floor(Math.min(...xs)))
  const x1 = Math.min(cv.w, Math.ceil(Math.max(...xs)))
  const y0 = Math.max(0, Math.floor(Math.min(...ys)))
  const y1 = Math.min(cv.h, Math.ceil(Math.max(...ys)))
  const hit: number[] = []
  for (let y = y0; y < y1; y++) {
    const py = y + 0.5
    // 이 줄에서 다각형이 걸치는 x 범위만 본다 (볼록 다각형 — 벽처럼 비스듬한 면은 감싸는 상자 대부분이 비어 있다). 안팎 판정은 아래 그대로
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[(i + 1) % pts.length]
      if (py < Math.min(ay, by) || py > Math.max(ay, by)) continue
      const xs2 = ay === by ? [ax, bx] : [ax + ((py - ay) * (bx - ax)) / (by - ay)]
      for (const v of xs2) {
        lo = Math.min(lo, v)
        hi = Math.max(hi, v)
      }
    }
    if (lo > hi) continue
    const xa = Math.max(x0, Math.floor(lo) - 1)
    const xb = Math.min(x1, Math.ceil(hi) + 1)
    for (let x = xa; x < xb; x++) {
      const px = x + 0.5
      let pos = false
      let neg = false
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i]
        const [bx, by] = pts[(i + 1) % pts.length]
        const cr = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
        if (cr > 1e-9) pos = true
        if (cr < -1e-9) neg = true
      }
      if (pos && neg) continue
      const c = colorAt(px, py)
      if (c) {
        cv.set(x, y, c)
        hit.push(y * cv.w + x)
      }
    }
  }
  return hit
}

/** 칠하는 점: u·v = 면 안 0~1 (옆면 v는 아래 0 → 위 1), gx·gy·z = 칸 좌표 */
interface Q {
  u: number
  v: number
  gx: number
  gy: number
  z: number
  face: 'S' | 'E' | 'top'
}
type Paint = Fill | ((q: Q) => Fill)
const paint = (c: Paint, q: Q): RGBA | null => {
  const f = typeof c === 'function' ? c(q) : c
  return f ? C(f) : null
}
const shaded = (c: RGBA | null, t: number) => (c ? mix(c, S.sh, t) : null)

interface Box {
  x: number
  y: number
  w: number
  d: number
  z: number
  h: number
  top: Paint
  S: Paint
  E: Paint
  /** 윗면 앞모서리 하이라이트를 넣지 않는다 (칸마다 이어 붙인 바닥판 — 칸 경계마다 줄이 생긴다) */
  noHi?: boolean
}

/** 상자 하나: 윗면 + 보이는 두 옆면(S = 화면 왼쪽 아래, E = 오른쪽 아래). 빛은 왼쪽 위. h = 0이면 윗면만(러그). 칠한 픽셀 번호를 돌려준다 */
function drawBox(cv: Cv, o: Pt, b: Box) {
  const { x, y, w, d, z, h } = b
  const z1 = z + h
  const side = new Set<number>()
  let sF: number[] = []
  let eF: number[] = []
  if (h > 0) {
    for (const i of (sF = fillPoly(cv, [P(o, x, y + d, z1), P(o, x + w, y + d, z1), P(o, x + w, y + d, z), P(o, x, y + d, z)], (px, py) => {
      const gy = y + d
      const gx = (px - o[0]) / HW + gy
      const zz = (gx + gy) * HH + o[1] - py
      return shaded(paint(b.S, { u: (gx - x) / w, v: (zz - z) / h, gx, gy, z: zz, face: 'S' }), S.shadeS)
    })))
      side.add(i)
    for (const i of (eF = fillPoly(cv, [P(o, x + w, y, z1), P(o, x + w, y + d, z1), P(o, x + w, y + d, z), P(o, x + w, y, z)], (px, py) => {
      const gx = x + w
      const gy = gx - (px - o[0]) / HW
      const zz = (gx + gy) * HH + o[1] - py
      return shaded(paint(b.E, { u: (gy - y) / d, v: (zz - z) / h, gx, gy, z: zz, face: 'E' }), S.shadeE)
    })))
      side.add(i)
  }
  const top = fillPoly(cv, [P(o, x, y, z1), P(o, x + w, y, z1), P(o, x + w, y + d, z1), P(o, x, y + d, z1)], (px, py) => {
    const a = (px - o[0]) / HW
    const s = (py - o[1] + z1) / HH
    const gx = (a + s) / 2
    const gy = (s - a) / 2
    return paint(b.top, { u: (gx - x) / w, v: (gy - y) / d, gx, gy, z: z1, face: 'top' })
  })
  // 윗면 앞모서리 하이라이트
  if (h > 0 && !b.noHi) for (const i of top) if (side.has(i + cv.w) && cv.has(i)) cv.write(i, mix(cv.read(i), WHITE, S.hi))
  // 입체 다듬기 (인물 화풍에 맞춰): 옆면 아래쪽은 바닥·아래 부품에 닿아 어둡게(AO), 앞 세로 모서리는 빛을 받아 밝게
  if (h >= 4 && !b.noHi) {
    const topSet = new Set(top)
    const sSet = new Set(sF)
    const eSet = new Set(eF)
    for (const i of side) {
      if (topSet.has(i) || !cv.has(i)) continue
      const isS = sSet.has(i)
      const fs = isS ? sSet : eSet
      // 맨 아래 줄 = 접지선, 그 위 한두 줄 = 옅은 AO
      if (!fs.has(i + cv.w)) cv.write(i, mix(cv.read(i), S.out, 0.22))
      else if (!fs.has(i + cv.w * 2) && h >= 8) cv.write(i, mix(cv.read(i), S.sh, 0.1))
      // S면 오른쪽 끝(앞 모서리) — 이웃이 E면이면 밝은 세로선
      else if (isS && eSet.has(i + 1)) cv.write(i, mix(cv.read(i), WHITE, 0.22))
    }
  }
  return { top, side }
}

/** 칸 위 상자 (x·y·w·d 칸, z·h 아트 px) — 그리는 순서·깊이 정렬용 */
export interface ArtBox {
  x: number
  y: number
  w: number
  d: number
  z: number
  h: number
}

/** 상자들의 그리는 순서 (뒤 → 앞): 한 축으로 떨어져 있으면 작은 쪽이 뒤, 위아래로 떨어져 있으면 아래가 뒤 */
function sortBoxes<T extends ArtBox>(items: T[]): T[] {
  const n = items.length
  const behind: number[][] = items.map(() => [])
  const sx = (b: ArtBox) => [b.x - (b.y + b.d), b.x + b.w - b.y]
  // 화면 세로 범위 (아트 px) — 화면에서 겹치지 않는 둘은 순서를 정하지 않는다 (안 그러면 순환이 생겨 네트가 상판 밑에 깔린다)
  const sy = (b: ArtBox) => [(b.x + b.y) * HH - (b.z + b.h), (b.x + b.w + b.y + b.d) * HH - b.z]
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const a = items[i]
      const b = items[j]
      const [a0, a1] = sx(a)
      const [b0, b1] = sx(b)
      if (a1 <= b0 || b1 <= a0) continue
      const [c0, c1] = sy(a)
      const [d0, d1] = sy(b)
      if (c1 <= d0 || d1 <= c0) continue
      if (a.x + a.w <= b.x + 1e-6 || a.y + a.d <= b.y + 1e-6 || (a.z + a.h <= b.z + 1e-6 && !(b.x + b.w <= a.x + 1e-6 || b.y + b.d <= a.y + 1e-6))) behind[j].push(i)
    }
  const done = new Set<number>()
  const out: T[] = []
  const visit = (i: number, stack: Set<number>) => {
    if (done.has(i) || stack.has(i)) return
    stack.add(i)
    for (const k of behind[i]) visit(k, stack)
    stack.delete(i)
    done.add(i)
    out.push(items[i])
  }
  const order = [...items.keys()].sort((i, j) => items[i].x + items[i].y + items[i].z / 100 - (items[j].x + items[j].y + items[j].z / 100))
  for (const i of order) visit(i, new Set())
  return out
}

// ── 가구: 칸 단위 상자(부품)를 쌓는다. 돌리기는 부품 좌표를 90°씩 돌린다 ──
// 로컬 좌표(r0): 사람이 +y(화면 왼쪽 아래)를 본다. 가구의 '앞'(쓰는 쪽)은 +y = S면, 등은 −y = N면(벽 쪽)
interface Part {
  x: number
  y: number
  w: number
  d: number
  z: number
  h: number
  c: Color
  top?: Paint
  N?: Paint
  E?: Paint
  S?: Paint
  W?: Paint
  /** 의자류: 좌석·등받이를 두 장으로 나눠 앉은 직원을 사이에 끼운다 */
  role?: 'seat' | 'back'
  /** 동물 부분: 가구 그림에서는 빼고(장면이 따로 그린다) 상점·서랍 미리보기에는 넣는다 */
  pet?: boolean
}
interface After {
  cv: Cv
  r: Rot
  /** r0 로컬 칸 좌표(x, y, z) → 돌린 뒤 텍스처 안 아트 px */
  at: (x: number, y: number, z: number) => Pt
}
interface ItemDef {
  name: string
  /** r0 기준 차지 칸 — shared/iso/furniture.ts의 size와 같아야 한다 (생성기가 검사) */
  W: number
  D: number
  parts: Part[]
  /** 부품 위로 더 그리는 높이(잎·물줄기) */
  extraH?: number
  after?: (a: After) => void
  /** 앉는 가구: 앉은 직원 엉덩이 높이(아트 px) */
  sitZ?: number
  /** 밟고 지나가는 것(러그) — 바닥 그림자 없음 */
  flat?: boolean
}

const SIDES = ['N', 'E', 'S', 'W'] as const
/** 윗면 무늬는 돌리기 전 좌표로 칠한다 (탁구대 네트 줄이 가구와 같이 돈다) */
const unrot = (q: Q, r: Rot): Q => {
  let { u, v } = q
  for (let i = 0; i < r; i++) [u, v] = [v, 1 - u]
  return { ...q, u, v }
}
function rotPart(p: Part, r: Rot, W: number, D: number): Box & { role?: Part['role'] } {
  let q = { x: p.x, y: p.y, w: p.w, d: p.d }
  let d = D
  let w = W
  for (let i = 0; i < r; i++) {
    q = { x: d - q.y - q.d, y: q.x, w: q.d, d: q.w }
    ;[w, d] = [d, w]
  }
  const side = (k: number) => p[SIDES[(k - r + 8) % 4]] ?? p.c
  const top = p.top ?? p.c
  return { ...q, z: p.z, h: p.h, top: typeof top === 'function' ? (qq) => top(unrot(qq, r)) : top, S: side(2), E: side(1), role: p.role }
}
function rotPt(x: number, y: number, r: Rot, W: number, D: number): [number, number] {
  let w = W
  let d = D
  for (let i = 0; i < r; i++) {
    ;[x, y] = [d - y, x]
    ;[w, d] = [d, w]
  }
  return [x, y]
}

// 부품 만들기 도우미
const b = (x: number, y: number, w: number, d: number, z: number, h: number, c: Color, more: Partial<Part> = {}): Part => ({ x, y, w, d, z, h, c, ...more })

/** 고정 계단: 올라가는 단(뒤쪽일수록 높다)과 오른쪽 난간. 폭 w칸 */
const stairsUp = (w: number): Part[] => [
  ...Array.from({ length: 8 }, (_, i) => b(0, 2 - (i + 1) * 0.25, w, 0.25, 0, (i + 1) * 6, K.stoneD, { top: K.stone })),
  ...Array.from({ length: 8 }, (_, i) => b(w, 2.06 - (i + 1) * 0.25, 0.06, 0.06, (i + 1) * 6, 12, K.metal)),
]

/** 고정 계단: 바닥에 뚫린 구멍 + 뒤로 내려가는 단(뒤쪽일수록 어둡다) + 양옆 난간. x에서 폭 w칸 */
const stairsDown = (x: number, w: number, tall = false): Part[] => {
  const rail = tall ? 14 : 12
  return [
    b(x, 0.05, w, 1.9, 0, 0, K.dark, {
      top: (q) => {
        if (q.u < 0.06 || q.u > 0.94 || q.v < 0.04) return K.metal
        const k = Math.min(7, Math.floor((1 - q.v) * 8))
        return k % 2 ? '#4a5068' : '#2b2f42'
      },
    }),
    ...[0.05, 1.7, 1.95].flatMap((y) => [b(x - 0.03, y - 0.03, 0.06, 0.06, 0, rail, K.metal), b(x + w - 0.03, y - 0.03, 0.06, 0.06, 0, rail, K.metal)]),
    b(x - 0.02, 0.02, 0.04, 1.96, rail, 2, K.metalL),
    b(x + w - 0.02, 0.02, 0.04, 1.96, rail, 2, K.metalL),
  ]
}

/** 네 다리: (x0,y0)~(x1,y1) 바깥 모서리 안쪽에 s칸 굵기 */
const legs = (x0: number, y0: number, x1: number, y1: number, s: number, h: number, c: Color) =>
  [
    [x0, y0],
    [x1 - s, y0],
    [x0, y1 - s],
    [x1 - s, y1 - s],
  ].map(([x, y]) => b(x, y, s, s, 0, h, c))
/** 앞면 그림: 사각형 (u0..u1, v0..v1) 안인지 */
const inRect = (q: Q, u0: number, u1: number, v0: number, v1: number) => q.u > u0 && q.u < u1 && q.v > v0 && q.v < v1
/** 모니터 화면: 어두운 베젤 → 창 하나(제목 줄 + 들여쓴 코드 줄) + 왼쪽 위 반사 */
const screenOf = (glow: string) => (q: Q): Fill => {
  if (!inRect(q, 0.07, 0.93, 0.1, 0.92)) return '#2e3246'
  const u = (q.u - 0.07) / 0.86
  const v = (0.92 - q.v) / 0.82 // 위 0 → 아래 1
  if (v < 0.16) return mix(glow, K.navy, 0.45)
  if (v < 0.22) return mix(glow, WHITE, 0.25)
  const row = Math.floor((v - 0.22) * 8)
  const f = frac((v - 0.22) * 8)
  const ind = (row % 3) * 0.08 + 0.06
  if (f > 0.3 && f < 0.75 && u > ind && u < ind + 0.2 + noise(row, 5) * 0.55) return [K.orange, K.green, '#ffffff', K.yellow, K.pink][Math.floor(noise(row, 9) * 5)]
  return u + (1 - v) * 0.6 > 1.05 && u + (1 - v) * 0.6 < 1.18 ? mix(glow, WHITE, 0.45) : mix(glow, K.navy, 0.12 + v * 0.18)
}
const screenFace = screenOf(K.screen)
/** 모니터 뒷면: 밝은 플라스틱 + 가운데 환기 홈 + 아래 그늘 */
const monitorBack = (base: string) => (q: Q): Fill => {
  if (q.v > 0.86) return mix(base, WHITE, 0.25)
  if (q.u > 0.3 && q.u < 0.7 && q.v > 0.45 && q.v < 0.75 && frac(q.v * 12) < 0.4) return mix(base, S.sh, 0.3)
  return base
}
/** 모니터 한 대: 받침판 · 목 · 화면(N면이 화면, S면이 뒷면) · 뒤 볼록 덮개. x = 왼쪽 끝, y = 화면 앞면, z = 책상 윗면 */
const monitor = (x: number, y: number, z: number, w: number, h: number, screen: string = K.screen, body = '#dfe3ea'): Part[] => [
  b(x + w / 2 - 0.16, y - 0.02, 0.32, 0.22, z, 1, '#c3c8d4', { top: mix('#c3c8d4', WHITE, 0.2) }),
  b(x + w / 2 - 0.04, y + 0.1, 0.08, 0.06, z + 1, 5, '#9aa0b4'),
  b(x, y, w, 0.08, z + 4, h, body, { N: screenOf(screen), S: monitorBack(body), top: mix(body, WHITE, 0.2) }),
  b(x + w * 0.25, y + 0.08, w * 0.5, 0.05, z + 6, Math.max(3, h - 6), body, { S: monitorBack(body) }),
]
/** 키보드 윗면: 키 줄 */
const keysTop = (q: Q): Fill => (q.u < 0.04 || q.u > 0.96 || q.v < 0.08 || q.v > 0.92 ? '#c9cedb' : frac(q.u * 14) < 0.25 || frac(q.v * 4) < 0.3 ? '#c9cedb' : K.keyboard)
/** 서류 더미 옆면: 종이 줄 */
const paperSide = (q: Q): Fill => (frac(q.v * 3) < 0.34 ? '#dfe3ea' : K.paper)
const glassFace = (frame: string) => (q: Q) => {
  if (q.u < 0.05 || q.u > 0.95 || q.v < 0.04 || q.v > 0.96) return frame
  const t = frac((q.u * 2 + q.v * 1.2) * 1.6)
  return t < 0.1 || (t > 0.18 && t < 0.22) ? K.skyL : K.sky
}
/** 문짝 n개 (손잡이 포함) */
const doors = (base: string, n: number) => (q: Q) => {
  if (q.v < 0.06) return mix(base, S.sh, 0.35)
  const f = frac(q.u * n)
  if (f < 0.04 || f > 0.96) return mix(base, S.sh, 0.25)
  if (Math.abs(f - 0.85) < 0.04 && q.v > 0.55 && q.v < 0.75) return K.metal
  return base
}
/** 서랍 n칸 */
const drawers = (base: string, n: number) => (q: Q) => {
  const f = frac(q.v * n)
  if (f < 0.07) return mix(base, S.sh, 0.3)
  if (Math.abs(q.u - 0.5) < 0.12 && f > 0.55 && f < 0.7) return K.metal
  return base
}
/** 책 줄: 선반 판 사이에 색 책을 세운다 */
const books = (frame: string, shelves: number) => (q: Q) => {
  if (q.u < 0.05 || q.u > 0.95) return frame
  const f = frac(q.v * shelves)
  if (f < 0.12) return frame
  const n = noise(Math.floor(q.u * 18), Math.floor(q.v * shelves))
  if (f > 0.55 + n * 0.4) return mix(frame, S.sh, 0.35) // 책 위 빈 칸
  const c = [K.orange, K.blue, K.mint, K.yellow, K.pink, K.purple, '#f4f1ea'][Math.floor(n * 7)]
  const fu = frac(q.u * 18)
  // 책 등: 왼쪽 밝은 줄 · 오른쪽 어두운 틈 · 가운데 띠 라벨
  return fu > 0.82 ? mix(c, S.sh, 0.4) : fu < 0.2 ? mix(c, WHITE, 0.3) : Math.abs(f - 0.3) < 0.04 ? mix(c, WHITE, 0.45) : c
}

/** 잎 덩어리: 원을 겹친다 — 왼쪽 위가 밝다. blobs = [화면 dx, dy, 반지름] */
function leaves(a: After, x: number, y: number, z: number, blobs: number[][], pal: readonly string[] = K.leaf) {
  const [cx, cy] = a.at(x, y, z)
  for (const [bx, by, br] of blobs)
    for (let yy = -br; yy <= br; yy++)
      for (let xx = -br; xx <= br; xx++) {
        if (xx * xx + yy * yy > br * br) continue
        // 빛(왼쪽 위) + 잎 결 흔들림 → 4단. 가장자리 오른쪽 아래는 한 단 더 어둡게
        const X = cx + bx + xx
        const Y = cy + by + yy
        const l = (xx + yy) / br + (noise(X >> 1, Y) - 0.5) * 0.7
        const edge = xx * xx + yy * yy > (br - 1) * (br - 1) && xx + yy > 0
        a.cv.set(X, Y, C(edge ? mix(pal[0], S.out, 0.3) : l < -0.75 ? mix(pal[2], WHITE, 0.25) : l < -0.2 ? pal[2] : l < 0.45 ? pal[1] : pal[0]))
      }
}
function line(cv: Cv, [x0, y0]: Pt, [x1, y1]: Pt, c: Color, thick = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    const y = y0 + ((y1 - y0) * i) / n
    for (let t = 0; t < thick; t++) cv.set(x, y + t, C(c))
  }
}

// 자주 쓰는 모양
const plant = (name: string, pot: { c: string; h: number; s: number }, blobs: number[][], opts: { pal?: readonly string[]; extraH?: number; dots?: [number, number, string][] } = {}): ItemDef => {
  const o = (1 - pot.s) / 2
  return {
    name,
    W: 1,
    D: 1,
    extraH: opts.extraH ?? 26,
    parts: [b(o, o, pot.s, pot.s, 0, pot.h, pot.c), b(o - 0.04, o - 0.04, pot.s + 0.08, pot.s + 0.08, pot.h, 2, mix(pot.c, WHITE, 0.25))],
    after: (a) => {
      leaves(a, 0.5, 0.5, pot.h + 2, blobs, opts.pal)
      const [cx, cy] = a.at(0.5, 0.5, pot.h + 2)
      for (const [x, y, c] of opts.dots ?? []) a.cv.set(cx + x, cy + y, C(c))
    },
  }
}
/** 소파: 나무 다리 · 몸통 · 높은 등판 + 기댄 등쿠션 · 둥근 팔걸이 · 앉는 방석(앞 0.88칸까지 — 앉은 직원 무릎이 방석 끝에 온다) */
const sofa = (name: string, W: number, c: string, cushion: string, more: Part[] = []): ItemDef => {
  const n = W
  const cw = (W - 0.52) / n
  return {
    name,
    W,
    D: 1,
    sitZ: 8,
    parts: [
      ...legs(0.08, 0.14, W - 0.08, 0.86, 0.08, 2, K.walnut),
      b(0.04, 0.1, W - 0.08, 0.8, 2, 6, c, { S: seamFace(c), E: seamFace(c) }),
      // 등판·등쿠션 = 'back' 장 (뒤를 보고 앉으면 직원 앞에 그린다). 앉은 직원 상자(가운데 ±0.18칸)와 겹치지 않게 0.32칸까지
      b(0.04, 0.1, W - 0.08, 0.14, 8, 18, c, { S: seamFace(c), N: seamFace(c), top: mix(c, WHITE, 0.18), role: 'back' }),
      ...Array.from({ length: n }, (_, i) => b(0.28 + i * cw, 0.24, cw - 0.03, 0.08, 10, 13, cushion, { S: pillowFace(cushion), top: mix(cushion, WHITE, 0.2), role: 'back' as const })),
      ...Array.from({ length: n }, (_, i) => b(0.28 + i * cw, 0.32, cw - 0.03, 0.56, 8, 3, cushion, { top: cushionTop(cushion), S: pillowFace(cushion) })),
      b(0.04, 0.1, 0.22, 0.8, 8, 9, c, { top: armTop(c), S: armFace(c) }),
      b(W - 0.26, 0.1, 0.22, 0.8, 8, 9, c, { top: armTop(c), S: armFace(c) }),
      ...more,
    ],
  }
}
const shelf = (name: string, W: number, h: number, frame: string): ItemDef => ({
  name,
  W,
  D: 1,
  parts: [b(0.04, 0.12, W - 0.08, 0.5, 0, h, frame, { S: books(frame, Math.round(h / 10)), top: mix(frame, WHITE, 0.15) })],
})
/** 상점 책상(gear): 배정된 자리의 책상에 입힌다. 차지 칸은 기본 책상과 같은 2×1 */
const deskGear = (name: string, o: { top: Paint; side: string; z?: number; metalLegs?: boolean; monitors?: 1 | 2 | 3; screen?: string; edge?: string; more?: Part[] }): ItemDef => {
  const z = o.z ?? 12
  const n = o.monitors ?? 1
  const mw = n === 1 ? 0.76 : n === 2 ? 0.56 : 0.46
  // 모니터 묶음은 의자 칸(로컬 x 0~1) 가운데 — 2·3대면 넘치는 만큼 오른쪽으로
  const x0 = Math.max(0.04, 0.5 - (n * mw + (n - 1) * 0.04) / 2)
  return {
    name,
    W: 2,
    D: 1,
    parts: [
      ...(o.metalLegs ? legs(0.1, 0.14, 1.9, 0.86, 0.06, z, K.metalL) : [b(0.08, 0.12, 0.14, 0.76, 0, z, o.side), b(1.78, 0.12, 0.14, 0.76, 0, z, o.side), b(0.22, 0.76, 1.56, 0.08, 4, z - 4, o.side)]),
      b(0.02, 0.06, 1.96, 0.88, z, 2, o.side, { top: o.top, S: o.edge ?? o.side }),
      ...Array.from({ length: n }, (_, i) => monitor(x0 + i * (mw + 0.04), 0.6, z + 2, mw, n === 1 ? 12 : 11, o.screen)).flat(),
      b(0.19, 0.2, 0.62, 0.17, z + 2, 1, '#c9cedb', { top: keysTop }),
      b(0.88, 0.24, 0.08, 0.11, z + 2, 1, '#dfe3ea'),
      b(1.6, 0.22, 0.13, 0.13, z + 2, 4, K.yellow, { top: '#6a4a34' }),
      ...(o.more ?? []),
    ],
  }
}
/** 상점 의자(gear): 좌석·등받이 두 장. 차지 칸 1×1 */
const chairGear = (name: string, o: { seat: string; back?: string; base?: string; backH?: number; wide?: boolean; woodLegs?: boolean; more?: Part[] }): ItemDef => {
  const base = o.base ?? K.metal
  const back = o.back ?? o.seat
  const s = o.wide ? 0.16 : 0.22
  return {
    name,
    W: 1,
    D: 1,
    sitZ: 9,
    parts: [
      ...(o.woodLegs ? legs(0.24, 0.28, 0.76, 0.8, 0.07, 9, base).map((p) => ({ ...p, role: 'seat' as const })) : [b(0.26, 0.26, 0.48, 0.48, 0, 2, base, { role: 'seat' }), b(0.45, 0.45, 0.1, 0.1, 2, 7, base, { role: 'seat' })]),
      b(s, 0.24, 1 - s * 2, 0.56, 9, 3, o.seat, { role: 'seat' }),
      b(s, 0.14, 1 - s * 2, 0.1, 12, o.backH ?? 13, back, { role: 'back' }),
      ...(o.more ?? []),
    ],
  }
}
const trophyCase = (name: string, h: number): ItemDef => ({
  name,
  W: 2,
  D: 1,
  parts: [
    b(0.05, 0.2, 1.9, 0.6, 0, h, K.walnutT, {
      S: (q) => {
        if (q.u < 0.05 || q.u > 0.95 || q.v < 0.06 || q.v > 0.94) return K.walnutT
        const rows = Math.round(h / 12)
        if (frac(q.v * rows) < 0.06) return K.walnut
        const row = frac(q.v * rows)
        if (Math.abs(frac(q.u * 4) - 0.5) < 0.12 && row > 0.1 && row < 0.55 + noise(Math.floor(q.u * 4), Math.floor(q.v * rows)) * 0.3) return row < 0.2 ? K.walnut : K.gold
        return K.sky
      },
    }),
    b(0, 0.15, 2, 0.7, h, 2, K.walnut),
  ],
})
/** 둥근 것(어항·지구본·풍선): 화면 원 + 왼쪽 위 하이라이트 */
function ball(a: After, x: number, y: number, z: number, r: number, c: string, fn?: (dx: number, dy: number) => string | null) {
  const [cx, cy] = a.at(x, y, z)
  for (let yy = -r; yy <= r; yy++)
    for (let xx = -r; xx <= r; xx++) {
      if (xx * xx + yy * yy > r * r) continue
      const hi = (xx + r * 0.4) ** 2 + (yy + r * 0.4) ** 2 < (r * 0.3) ** 2
      a.cv.set(cx + xx, cy + yy, C(hi ? mix(c, WHITE, 0.6) : (fn?.(xx / r, yy / r) ?? ((xx + yy) / r > 0.6 ? mix(c, S.sh, 0.2) : c))))
    }
}

/** 그림이 아직 없는 품목: 연보라 줄무늬 상자 (한눈에 임시인 게 보이게) */
/** 회색 천: 2px 짜임 + 아래 걸레받이 */
const fabricFace = (base: string) => (q: Q) => (q.v < 0.08 ? mix(base, S.sh, 0.3) : q.v > 0.9 ? mix(base, WHITE, 0.12) : n32(q.gx + q.gy, q.z / 32) < 0.22 ? mix(base, S.sh, 0.08) : base)
/** 유리 칸막이: 가구 유리처럼 불투명 하늘색 + 사선 반사 (바닥 그림자 위에 반투명을 칠하면 그림자 알파로 흐려진다) */
const glassPanel = (q: Q): Fill => {
  const t = frac(q.gx + q.gy + q.v * 0.8)
  return t < 0.06 || (t > 0.12 && t < 0.15) ? K.skyL : q.v > 0.85 ? mix(K.sky, WHITE, 0.35) : mix(K.sky, WHITE, 0.15)
}
/** 매트 흰 벽: 위아래 몰딩 줄 + 아래 걸레받이 */
const matteFace = (base: string, base2: string) => (q: Q) => (q.v < 0.07 ? base2 : Math.abs(q.v - 0.09) < 0.015 || q.v > 0.95 ? mix(base, S.sh, 0.12) : base)
/** 원목 세로 루버: 칸당 6줄 홈 + 결 */
const slatFace = (base: string) => (q: Q) => {
  if (q.v < 0.07) return mix(base, S.sh, 0.45)
  const a = (q.gx + q.gy) * 6
  if (frac(a) < 0.14) return mix(base, S.sh, 0.35)
  return n32(Math.floor(a), q.z / 20) < 0.25 ? K.walnutT : frac(a) > 0.82 ? mix(base, WHITE, 0.1) : base
}
/** 파티션·가벽 이음 (장면이 옆에 붙은 파티션을 보고 정한다 — partitionJoins).
 *  s·e = 시작(로컬 x 0)·끝(x L) 모양: '-' 그냥 끝, 'c' 칸 끝까지 이어 붙임(옆 파티션과 한 판), 'k' 그 칸 가운데에서 꺾임(ㄱ자 모서리).
 *  stubs = 칸 i 가운데에서 옆(n = 로컬 y 0 쪽, s = y 1 쪽)으로 칸 끝까지 나가는 팔 — 꺾인 파티션과 만난다 */
export interface PartJoin {
  s: '-' | 'c' | 'k'
  e: '-' | 'c' | 'k'
  stubs: [number, 'n' | 's'][]
}
const NO_JOIN: PartJoin = { s: '-', e: '-', stubs: [] }
/** 팔 하나의 y 범위 (칸 가운데 기둥·판 두께 밖에서 칸 끝까지) */
const stubY = (side: 'n' | 's', half: number): [number, number] => (side === 'n' ? [0, 0.5 - half] : [0.5 + half, 0.5 - half])
/** 낮은 파티션 L칸: 칸 경계마다 금속 기둥(받침 포함), 사이에 판 + 위 레일. lower = 아래 불투명 판 높이(유리 칸막이) */
const partition = (name: string, L: number, h: number, base: string, face: Paint, lower = 0) => (j: PartJoin = NO_JOIN): ItemDef => {
  const x0 = j.s === 'c' ? 0 : j.s === 'k' ? 0.47 : 0.02
  const x1 = j.e === 'c' ? L : j.e === 'k' ? L - 0.47 : L - 0.02
  // 기둥(폭 0.06) 시작 x — 이어 붙인 끝은 기둥 없이 옆 파티션 판과 바로 맞닿는다
  const at = new Map<number, number>()
  const post = (x: number) => at.set(Math.round(x * 100), x)
  if (j.s !== 'c') post(x0)
  for (let i = 1; i < L; i++) post(i - 0.03)
  if (j.e !== 'c') post(x1 - 0.06)
  for (const [i] of j.stubs) post(i + 0.47)
  const posts = [...at.values()].sort((a, b) => a - b)
  const panel = (px: number, w: number, py: number, d: number, sides: 'NS' | 'EW') => {
    const f = sides === 'NS' ? { S: face, N: face } : { E: face, W: face }
    return [
      ...(lower ? [b(px - (sides === 'NS' ? 0 : 0.01), py - (sides === 'NS' ? 0.01 : 0), w + (sides === 'NS' ? 0 : 0.02), d + (sides === 'NS' ? 0.02 : 0), 2, lower - 2, K.white, { top: K.metalL })] : []),
      b(px, py, w, d, lower || 2, h - (lower || 2), base, f),
      b(px - (sides === 'NS' ? 0 : 0.01), py - (sides === 'NS' ? 0.01 : 0), w + (sides === 'NS' ? 0 : 0.02), d + (sides === 'NS' ? 0.02 : 0), h, 1, K.metalL, { top: K.steel }),
    ]
  }
  const parts: Part[] = posts.flatMap((x) => [b(x, 0.32, 0.06, 0.36, 0, 2, K.metal), b(x, 0.43, 0.06, 0.14, 2, h + 1, K.metalL, { top: K.steel })])
  let cur = x0
  for (const p of [...posts, x1]) {
    if (p > cur + 0.001) parts.push(...panel(cur, Math.min(p, x1) - cur, 0.46, 0.08, 'NS'))
    cur = Math.max(cur, p + 0.06)
  }
  for (const [i, side] of j.stubs) {
    const [y, d] = stubY(side, 0.07)
    parts.push(...panel(i + 0.46, 0.08, y, d, 'EW'))
  }
  return { name, W: L, D: 1, parts }
}
/** 높은 가벽 L칸: 벽(WALL_T 두께)과 같은 얇은 통판 40px. 무늬는 앞뒤 두 면에 같이 */
const dividerWall = (name: string, L: number, side: string, cap: string, face: Paint) => (j: PartJoin = NO_JOIN): ItemDef => {
  const x0 = j.s === 'c' ? 0 : j.s === 'k' ? 0.41 : 0.02
  const x1 = j.e === 'c' ? L : j.e === 'k' ? L - 0.41 : L - 0.02
  const end = mix(side, S.sh, 0.08)
  return {
    name,
    W: L,
    D: 1,
    parts: [
      b(x0, 0.41, x1 - x0, 0.18, 0, 40, side, { top: cap, S: face, N: face, E: end, W: end }),
      ...j.stubs.map(([i, s]) => {
        const [y, d] = stubY(s, 0.09)
        return b(i + 0.41, y, 0.18, d, 0, 40, side, { top: cap, E: face, W: face, N: end, S: end })
      }),
    ],
  }
}

/** 벽돌: 4px 줄 · 반 장씩 엇갈림 · 줄눈 + 장마다 살짝 다른 색 */
const brickFace = (base: string, joint: string) => (q: Q): Fill => {
  const row = Math.floor(q.z / 4)
  const a = (q.gx + q.gy) * 3 + (row % 2) * 0.5
  if (q.z % 4 < 1 || frac(a) < 0.1) return joint
  const n = n32(Math.floor(a), row)
  return n < 0.2 ? mix(base, S.sh, 0.1) : n > 0.85 ? mix(base, WHITE, 0.1) : base
}
/** 식물 벽: 나무 틀 안에 잎 무늬 3톤 + 군데군데 꽃 */
const greenFace = (frame: string) => (q: Q): Fill => {
  if (q.v < 0.06 || q.v > 0.95) return frame
  const x = Math.floor((q.gx + q.gy) * 16)
  const y = Math.floor(q.z / 2)
  const n = n32(x, y)
  if (n > 0.97) return K.pink
  return n < 0.3 ? K.leaf[0] : n < 0.75 ? K.leaf[1] : K.leaf[2]
}
/** 높은 유리 가벽: 위아래 나무 띠 + 가운데 유리 */
const glassWallFace = (frame: string) => (q: Q): Fill => (q.v < 0.12 || q.v > 0.93 || Math.abs(q.v - 0.55) < 0.025 ? frame : glassPanel(q))

/** 파티션·가벽 그림 (이음 모양을 받아 그린다) — docs/specs/partition-items.md. 낮음은 22px(앉은 직원 머리 높이), 높음은 40px(서 있는 직원을 다 가린다 — 장면이 WALL_FADE로 비친다) */
const PARTITIONS: Record<string, (j?: PartJoin) => ItemDef> = {
  'partition-low-fabric': partition('낮은 패브릭 파티션', 2, 22, '#aaa9ad', fabricFace('#aaa9ad')),
  'partition-low-fabric-1': partition('낮은 패브릭 파티션 (1칸)', 1, 22, '#aaa9ad', fabricFace('#aaa9ad')),
  'partition-low-glass': partition('낮은 유리 파티션', 3, 22, '#eef1f5', glassPanel, 7),
  'partition-low-wood': partition('낮은 원목 파티션', 2, 20, K.wood, slatFace(K.wood)),
  'partition-wall-white': dividerWall('화이트 가벽', 1, '#eef0f4', '#ffffff', matteFace('#eef0f4', '#d8dce4')),
  'partition-wall-wood': dividerWall('원목 가벽', 3, K.walnut, K.walnutT, slatFace(K.walnut)),
  'partition-wall-wood-1': dividerWall('원목 가벽 (1칸)', 1, K.walnut, K.walnutT, slatFace(K.walnut)),
  'partition-wall-brick': dividerWall('벽돌 가벽', 2, '#c8735a', '#e0b49a', brickFace('#c8735a', '#ead8c6')),
  'partition-wall-green': dividerWall('식물 가벽', 2, K.woodD, K.wood, greenFace(K.woodD)),
  'partition-wall-glass': dividerWall('유리 가벽', 2, K.woodL, K.wood, glassWallFace(K.woodD)),
}
/** 파티션 이음 표시 — 장면이 `{id}~j{s}{e}{칸}{n|s}...` 이름으로 그린다 */
export const PART_JOIN = '~j'
const joinCode = (j: PartJoin) => `${PART_JOIN}${j.s}${j.e}${j.stubs.map(([i, s]) => `${i}${s}`).join('')}`
const parseJoin = (code: string): PartJoin => ({
  s: code[0] as PartJoin['s'],
  e: code[1] as PartJoin['e'],
  stubs: [...code.slice(2).matchAll(/(\d)([ns])/g)].map((m) => [+m[1], m[2] as 'n' | 's']),
})
const tallOf = (id: string) => id.startsWith('partition-wall')

/**
 * 붙어 있는 파티션끼리 한 판으로 이어 그리기 (같은 높이끼리만). 반환 = uid → 이음 표시(없으면 빠짐).
 * 일자로 붙으면 두 끝을 칸 끝까지 이어 붙이고, 직각으로 만나면(ㄱ·ㅜ) 만나는 칸에 옆 팔을 내고 꺾인 끝은 가운데에서 멈춘다
 */
export function partitionJoins(items: readonly { uid: string; itemId: string; gx: number; gy: number; rot: Rot }[]): Map<string, string> {
  type P = { uid: string; tall: boolean; L: number; cells: [number, number][]; ax: [number, number]; nv: [number, number] }
  const ps: P[] = []
  for (const it of items) {
    const gen = PARTITIONS[it.itemId]
    if (!gen) continue
    const L = gen().W
    const w = (x: number, y: number) => rotPt(x, y, it.rot, L, 1)
    const unit = (a: [number, number], b: [number, number]): [number, number] => [Math.round(b[0] - a[0]), Math.round(b[1] - a[1])]
    ps.push({
      uid: it.uid,
      tall: tallOf(it.itemId),
      L,
      cells: Array.from({ length: L }, (_, i) => {
        const [x, y] = w(i + 0.5, 0.5)
        return [Math.floor(it.gx + x), Math.floor(it.gy + y)]
      }),
      ax: unit(w(0, 0.5), w(1, 0.5)),
      nv: unit(w(0.5, 0.5), w(0.5, -0.5)),
    })
  }
  const at = new Map<string, { p: P; i: number }>()
  for (const p of ps) p.cells.forEach(([x, y], i) => at.set(`${x},${y}`, { p, i }))
  const other = (p: P, x: number, y: number) => {
    const o = at.get(`${x},${y}`)
    return o && o.p !== p && o.p.tall === p.tall ? o : null
  }
  const out = new Map<string, string>()
  for (const p of ps) {
    const j: PartJoin = { s: '-', e: '-', stubs: [] }
    p.cells.forEach(([x, y], i) => {
      for (const side of ['n', 's'] as const) {
        const d = side === 'n' ? p.nv : ([-p.nv[0], -p.nv[1]] as [number, number])
        const o = other(p, x + d[0], y + d[1])
        if (!o || Math.abs(o.p.ax[0] * d[0] + o.p.ax[1] * d[1]) !== 1) continue
        // 상대 칸이 상대 파티션의 끝이고, 그 끝이 이쪽을 바라볼 때만 (옆으로 나란히 지나가는 파티션은 아님)
        const out0 = o.i === 0 && o.p.ax[0] === d[0] && o.p.ax[1] === d[1]
        const out1 = o.i === o.p.L - 1 && o.p.ax[0] === -d[0] && o.p.ax[1] === -d[1]
        if (out0 || out1) j.stubs.push([i, side])
      }
    })
    const [sx, sy] = p.cells[0]
    const [ex, ey] = p.cells[p.L - 1]
    const hasS = !!other(p, sx - p.ax[0], sy - p.ax[1])
    const hasE = !!other(p, ex + p.ax[0], ey + p.ax[1])
    const stubAt = (i: number) => j.stubs.some(([k]) => k === i)
    // 꺾인 끝: 이어진 옆 파티션이 없고 그 칸에 옆 팔이 있을 때 — 1칸짜리는 반대쪽이 이어져 있어야 어느 쪽으로 꺾일지 정해진다
    j.s = hasS ? 'c' : stubAt(0) && (p.L > 1 || hasE) ? 'k' : '-'
    j.e = hasE ? 'c' : stubAt(p.L - 1) && (p.L > 1 || hasS) ? 'k' : '-'
    if (j.s !== '-' || j.e !== '-' || j.stubs.length) out.set(p.uid, joinCode(j))
  }
  return out
}

const placeholder = (W: number, D: number): ItemDef => {
  const stripe = (q: Q) => (frac((q.u * 3 + q.v * 2) * 1.5) < 0.5 ? '#ddd3f2' : '#cfc2ec')
  return { name: '임시', W, D, parts: [b(0.1, 0.1, W - 0.2, D - 0.2, 0, 14, '#e6def5', { S: stripe, E: stripe, W: stripe, N: stripe, top: (q) => (q.u < 0.06 || q.u > 0.94 || q.v < 0.06 || q.v > 0.94 ? '#cfc2ec' : '#efe9fa') })] }
}

/** 서랍·문 패널: 가장자리 한 줄 띄우고 안쪽에 밝은 위·왼쪽 / 어두운 아래·오른쪽 몰딩 */
const panelFace = (base: string) => (q: Q) => {
  if (q.u < 0.1 || q.u > 0.9 || q.v < 0.1 || q.v > 0.9) return base
  if (q.u < 0.18 || q.v > 0.82) return mix(base, WHITE, 0.18)
  if (q.u > 0.82 || q.v < 0.18) return mix(base, S.sh, 0.3)
  return mix(base, S.sh, 0.08)
}
/** 원목 상판: 긴 결 + 앞모서리 쪽 밝게 */
const grainTop = (base: string) => (q: Q) => {
  const g = frac(q.v * 7 + Math.sin(q.u * 9) * 0.15)
  if (g < 0.08) return mix(base, S.sh, 0.18)
  return q.v > 0.85 ? mix(base, WHITE, 0.12) : base
}
/** 가죽 방석: 가운데 볼록(밝음) · 가장자리 눌림 */
const cushionTop = (base: string) => (q: Q) => {
  const d = Math.max(Math.abs(q.u - 0.5), Math.abs(q.v - 0.5))
  return d > 0.4 ? mix(base, S.sh, 0.2) : d < 0.18 ? mix(base, WHITE, 0.16) : base
}
/** 천 옆면: 아래 박음선 한 줄 + 위 가장자리 밝게 */
const seamFace = (base: string) => (q: Q): Fill => (q.v > 0.86 ? mix(base, WHITE, 0.15) : q.v > 0.12 && q.v < 0.24 ? mix(base, S.sh, 0.16) : base)
/** 쿠션 앞면: 가운데 볼록 · 양끝 눌림 */
const pillowFace = (base: string) => (q: Q): Fill => (q.u < 0.08 || q.u > 0.92 || q.v < 0.15 ? mix(base, S.sh, 0.18) : q.v > 0.8 ? mix(base, WHITE, 0.2) : base)
/** 팔걸이 윗면: 둥글게 말린 앞쪽이 밝다 */
const armTop = (base: string) => (q: Q): Fill => (q.u < 0.3 ? mix(base, WHITE, 0.24) : q.u > 0.8 ? mix(base, S.sh, 0.1) : mix(base, WHITE, 0.1))
/** 팔걸이 앞면: 말린 둥근 끝(위 반원 밝게) */
const armFace = (base: string) => (q: Q): Fill => {
  const dx = q.u - 0.5
  const dz = q.v - 0.72
  if (dx * dx * 4 + dz * dz * 10 < 0.22) return dx * 4 + dz * 3 < 0.2 ? mix(base, WHITE, 0.2) : base
  return q.v > 0.5 ? mix(base, S.sh, 0.12) : base
}
/** 가죽 등받이: 버튼 터프팅 점 + 위 가장자리 하이라이트 */
const tuftFace = (base: string) => (q: Q) => {
  if (q.v > 0.9) return mix(base, WHITE, 0.2)
  const bu = frac(q.u * 3)
  const bv = frac(q.v * 2.5)
  if (Math.abs(bu - 0.5) < 0.12 && Math.abs(bv - 0.5) < 0.12) return mix(base, S.sh, 0.4)
  return base
}

// ── 품목 그림 ────────────────────────────────────────────
// 키 = itemId (shared/iso/furniture.ts FURNITURE·상점 SHOP_ITEMS와 같은 id). 칸 크기는 FURNITURE와 같다.
const ITEMS: Record<string, ItemDef> = {
  // 기본 자리
  desk: {
    name: '책상',
    W: 2,
    D: 1,
    parts: [
      // 왼쪽 옆판(앉는 칸 = 기본 자리 의자가 붙는 로컬 x 0~1, 무릎 들어갈 자리) · 오른쪽 서랍장(서랍은 앉는 쪽 N면)
      // 무릎 자리는 앞이 뚫려 있다(위 띠판만) — 앉은 직원의 정강이·신발이 책상 아래로 보인다
      b(0.06, 0.1, 0.14, 0.78, 0, 12, K.deskSide, { S: panelFace(K.deskSide), E: panelFace(K.deskSide) }),
      b(1.4, 0.1, 0.52, 0.78, 0, 12, K.deskSide, { N: drawers(K.deskSide, 3), S: panelFace(K.deskSide), E: panelFace(K.deskSide) }),
      b(0.2, 0.74, 1.2, 0.06, 9, 3, K.deskSide, { S: mix(K.deskSide, S.sh, 0.06) }),
      b(0.02, 0.06, 1.96, 0.88, 12, 2, K.deskSide, { top: grainTop(K.deskTop), S: mix(K.deskTop, S.sh, 0.05) }),
      // 모니터·키보드·마우스는 의자 바로 앞 — 앉은 직원이 화면을 마주 본다
      ...monitor(0.1, 0.6, 14, 0.8, 12),
      b(0.19, 0.2, 0.62, 0.17, 14, 1, '#c9cedb', { top: keysTop }),
      b(0.88, 0.24, 0.08, 0.11, 14, 1, '#dfe3ea'),
      b(1.18, 0.66, 0.13, 0.13, 14, 4, K.yellow, { top: '#6a4a34' }),
      b(1.48, 0.16, 0.32, 0.28, 14, 2, K.paper, { S: paperSide, E: paperSide }),
      b(1.64, 0.64, 0.14, 0.14, 14, 3, K.pot, { top: K.leaf[1] }),
    ],
  },
  chair: {
    name: '의자',
    W: 1,
    D: 1,
    sitZ: 9,
    parts: [
      // 다섯 발 받침(십자로) · 가스 기둥 · 두툼한 좌석 · 등받이 + 이음대
      b(0.18, 0.45, 0.64, 0.1, 0, 1, K.dark, { role: 'seat' }),
      b(0.45, 0.18, 0.1, 0.64, 0, 1, K.dark, { role: 'seat' }),
      ...[[0.16, 0.44], [0.76, 0.44], [0.44, 0.16], [0.44, 0.76]].map(([x, y]) => b(x, y, 0.1, 0.1, 0, 2, '#2e3246', { role: 'seat' as const })),
      b(0.46, 0.46, 0.08, 0.08, 1, 6, K.metalL, { role: 'seat' }),
      b(0.24, 0.26, 0.52, 0.52, 7, 1, K.dark, { role: 'seat' }),
      b(0.2, 0.24, 0.6, 0.56, 8, 4, K.accent, { role: 'seat', top: cushionTop(K.accent), S: seamFace(K.accent), E: seamFace(K.accent) }),
      b(0.44, 0.12, 0.12, 0.06, 9, 5, K.dark, { role: 'back' }),
      b(0.2, 0.12, 0.6, 0.11, 13, 14, K.accent, { role: 'back', S: tuftFace(K.accent), N: seamFace(K.accent), top: mix(K.accent, WHITE, 0.2) }),
    ],
  },
  /** 기본 화분 (prop-plant) */
  plant: plant('화분', { c: K.pot, h: 10, s: 0.4 }, [[0, -14, 9], [-7, -8, 7], [7, -9, 7], [-3, -22, 6], [5, -20, 6], [0, -4, 6]], { dots: [[-4, -18, K.leaf[2]], [3, -12, K.leaf[2]], [-9, -9, K.leaf[2]], [6, -24, K.leaf[2]], [9, -7, K.leaf[2]]] }),

  // ── 레벨 전용 가구 (김기획 2-3절, id는 furniture.ts의 임시 lv-*) ──
  // Lv.1
  'lv-folding-desk': {
    name: '접이식 책상',
    W: 2,
    D: 1,
    parts: [
      ...legs(0.12, 0.16, 1.88, 0.84, 0.06, 12, K.metalL),
      b(0.18, 0.46, 1.64, 0.06, 3, 1, K.metalL),
      b(0.04, 0.08, 1.92, 0.84, 12, 1, '#eceff3'),
      b(0.68, 0.24, 0.62, 0.36, 13, 1, '#c8ccd6'),
      b(0.68, 0.6, 0.62, 0.06, 13, 9, '#c8ccd6', { N: screenFace }),
      b(1.52, 0.3, 0.1, 0.1, 13, 3, K.paper),
    ],
  },
  'lv-folding-chair': {
    name: '접이식 의자',
    W: 1,
    D: 1,
    sitZ: 9,
    parts: [
      ...legs(0.24, 0.3, 0.76, 0.78, 0.06, 9, K.metalL).map((p) => ({ ...p, role: 'seat' as const })),
      b(0.22, 0.26, 0.56, 0.54, 9, 2, '#c8ccd6', { role: 'seat' }),
      b(0.22, 0.16, 0.56, 0.08, 11, 12, '#c8ccd6', { role: 'back' }),
    ],
  },
  // Lv.2
  'lv-kettle-shelf': {
    name: '커피포트 선반',
    W: 1,
    D: 1,
    parts: [
      b(0.1, 0.14, 0.8, 0.62, 0, 16, K.wood, { S: doors(K.wood, 2), top: K.woodL }),
      b(0.24, 0.28, 0.24, 0.24, 16, 6, '#e6e9ef'),
      b(0.29, 0.33, 0.14, 0.14, 22, 1, K.metal),
      b(0.6, 0.36, 0.1, 0.1, 16, 3, K.yellow),
      b(0.6, 0.54, 0.1, 0.1, 16, 3, K.orange),
    ],
  },
  'lv-tool-shelf': {
    name: '공구 벽선반',
    W: 2,
    D: 1,
    parts: [
      ...[0.04, 1.88].flatMap((x) => [b(x, 0.2, 0.08, 0.08, 0, 28, K.metal), b(x, 0.72, 0.08, 0.08, 0, 28, K.metal)]),
      ...[0, 9, 18, 27].map((z) => b(0.12, 0.2, 1.76, 0.6, z, 1, K.metalL)),
      b(0.2, 0.3, 0.4, 0.36, 1, 6, K.deskSide),
      b(1.1, 0.26, 0.5, 0.42, 1, 5, K.orange),
      b(0.3, 0.3, 0.3, 0.3, 10, 5, K.blue),
      b(1.3, 0.3, 0.4, 0.3, 10, 4, K.yellow),
      b(0.8, 0.3, 0.4, 0.3, 19, 6, K.leaf[2]),
    ],
  },
  // Lv.3
  'lv-studio-sofa': sofa('원룸 소파', 2, '#e9d8bf', '#f3e6d2', [b(0.3, 0.32, 0.3, 0.12, 11, 7, K.orange)]),
  'lv-hanger': {
    name: '행거',
    W: 1,
    D: 1,
    parts: [
      b(0.3, 0.3, 0.4, 0.4, 0, 2, K.metal),
      b(0.46, 0.46, 0.08, 0.08, 2, 30, K.metal),
      b(0.3, 0.46, 0.4, 0.08, 31, 1, K.metal),
      b(0.24, 0.6, 0.2, 0.22, 14, 15, K.blue),
      b(0.56, 0.6, 0.2, 0.22, 17, 12, K.red),
    ],
  },
  'lv-meeting-table': {
    name: '회의 테이블',
    W: 2,
    D: 2,
    extraH: 8,
    parts: [
      ...legs(0.16, 0.16, 1.84, 1.84, 0.14, 12, '#b3a088'),
      b(0.08, 0.08, 1.84, 1.84, 12, 2, '#fbf6ec'),
      b(0.3, 0.3, 0.36, 0.28, 14, 1, K.paper),
      b(1.3, 1.2, 0.36, 0.28, 14, 1, K.paper),
      b(1.32, 0.36, 0.4, 0.3, 14, 1, K.metal),
      b(0.86, 0.86, 0.28, 0.28, 14, 5, K.pot),
    ],
    after: (a) => leaves(a, 1, 1, 19, [[0, -3, 4], [-3, -1, 3], [3, -1, 3]]),
  },
  // Lv.4
  'lv-cubicle-desk': {
    name: '칸막이 책상',
    W: 2,
    D: 1,
    parts: [
      b(0.08, 0.12, 0.14, 0.7, 0, 12, K.deskSide),
      b(1.7, 0.12, 0.14, 0.7, 0, 12, K.deskSide),
      b(0.04, 0.08, 1.82, 0.76, 12, 2, K.deskTop),
      b(0.62, 0.56, 0.76, 0.1, 15, 12, K.metal, { N: screenFace }),
      b(0.86, 0.54, 0.28, 0.14, 14, 1, K.metal),
      b(0.66, 0.24, 0.62, 0.16, 14, 1, K.keyboard),
      b(0, 0.86, 2, 0.1, 0, 24, K.fabric, { top: K.metalL }),
      b(1.9, 0.04, 0.1, 0.82, 0, 24, K.fabric, { top: K.metalL }),
    ],
  },
  whiteboard: {
    name: '이동식 화이트보드',
    W: 2,
    D: 1,
    parts: [
      b(0.1, 0.2, 0.1, 0.6, 0, 2, K.metal),
      b(1.8, 0.2, 0.1, 0.6, 0, 2, K.metal),
      b(0.12, 0.46, 0.06, 0.08, 2, 32, K.metalL),
      b(1.82, 0.46, 0.06, 0.08, 2, 32, K.metalL),
      b(0.18, 0.44, 1.64, 0.08, 10, 22, K.paper, {
        S: (q) => {
          if (q.u < 0.03 || q.u > 0.97 || q.v < 0.06 || q.v > 0.94) return K.metalL
          const row = Math.floor(q.v * 7)
          if (frac(q.v * 7) < 0.3 && q.u > 0.1 && q.u < 0.25 + noise(row, 3) * 0.6) return row % 3 ? K.blue : K.red
          return K.paper
        },
      }),
    ],
  },
  // Lv.5
  'lv-glass-table': {
    name: '유리 회의 테이블',
    W: 3,
    D: 2,
    parts: [
      ...legs(0.2, 0.2, 2.8, 1.8, 0.08, 12, K.metalL),
      b(0.06, 0.06, 2.88, 1.88, 12, 1, K.sky, { top: (q) => (frac((q.u * 3 - q.v * 2) * 1.2) < 0.08 ? K.skyL : '#c4e8f6') }),
      b(0.5, 0.4, 0.5, 0.36, 13, 1, '#c8ccd6'),
      b(0.5, 0.36, 0.5, 0.05, 13, 8, '#c8ccd6'),
      b(1.9, 1.2, 0.5, 0.36, 13, 1, '#c8ccd6'),
      b(1.4, 0.8, 0.3, 0.3, 13, 1, K.paper),
    ],
  },
  'lv-projector': {
    name: '프로젝터',
    W: 1,
    D: 1,
    parts: [
      ...legs(0.24, 0.24, 0.76, 0.76, 0.06, 10, K.metal),
      b(0.2, 0.2, 0.6, 0.6, 10, 2, K.metalL),
      b(0.28, 0.3, 0.44, 0.4, 12, 5, K.white, { S: (q) => (Math.hypot((q.u - 0.3) * 2.2, q.v - 0.5) < 0.32 ? K.navy : K.white) }),
    ],
  },
  // Lv.6
  'lv-stair-plants': {
    name: '계단 앞 화분 세트',
    W: 1,
    D: 1,
    extraH: 14,
    parts: [b(0.08, 0.52, 0.32, 0.32, 0, 6, K.pot), b(0.56, 0.56, 0.32, 0.32, 0, 9, '#d8c7ae'), b(0.34, 0.1, 0.32, 0.32, 0, 13, '#c9a7d8')],
    after: (a) => {
      leaves(a, 0.5, 0.26, 13, [[0, -4, 4], [3, -3, 3]], ['#c25a7a', '#f2a7b8', '#fbd3dc'])
      leaves(a, 0.72, 0.72, 9, [[0, -3, 3], [2, -6, 3]])
      leaves(a, 0.24, 0.68, 6, [[0, -4, 4], [-3, -2, 3]])
    },
  },
  'lv-mailbox': {
    name: '우편함',
    W: 1,
    D: 1,
    parts: [b(0.44, 0.44, 0.12, 0.12, 0, 14, K.metal), b(0.28, 0.3, 0.44, 0.4, 14, 10, K.orange, { S: (q) => (q.v > 0.62 && q.v < 0.72 && q.u > 0.2 && q.u < 0.8 ? K.dark : K.orange) }), b(0.3, 0.32, 0.4, 0.36, 24, 2, mix(K.orange, WHITE, 0.3))],
  },
  // Lv.7
  'lv-fridge': {
    name: '냉장고',
    W: 1,
    D: 1,
    parts: [b(0.12, 0.16, 0.76, 0.68, 0, 34, '#eef2f6', { top: K.white, S: (q) => (Math.abs(q.v - 0.62) < 0.02 ? K.metalL : q.u > 0.8 && q.u < 0.88 && (Math.abs(q.v - 0.5) < 0.08 || Math.abs(q.v - 0.75) < 0.08) ? K.metal : '#eef2f6') })],
  },
  'lv-vending': {
    name: '자판기',
    W: 1,
    D: 1,
    parts: [
      b(0.1, 0.16, 0.8, 0.68, 0, 34, K.blue, {
        top: mix(K.blue, WHITE, 0.2),
        S: (q) => {
          if (inRect(q, 0.08, 0.66, 0.34, 0.92)) {
            if (frac((q.v - 0.34) * 9) < 0.25) return K.metalL
            return frac(q.u * 9) < 0.5 ? [K.red, K.yellow, K.green, K.orange][Math.floor((q.v - 0.34) * 9) % 4] : K.skyL
          }
          if (inRect(q, 0.74, 0.9, 0.55, 0.85)) return frac(q.v * 12) < 0.5 ? K.yellow : K.white
          if (inRect(q, 0.15, 0.6, 0.08, 0.2)) return K.dark
          return K.blue
        },
      }),
    ],
  },
  'beanbag-blue': {
    name: '빈백 (블루)',
    W: 1,
    D: 1,
    sitZ: 6,
    parts: [b(0.1, 0.12, 0.8, 0.78, 0, 5, '#7fa8e0'), b(0.18, 0.18, 0.64, 0.64, 5, 4, '#7fa8e0'), b(0.2, 0.16, 0.6, 0.22, 9, 6, '#7fa8e0'), b(0.3, 0.4, 0.4, 0.36, 9, 1, '#9dbde8')],
  },
  // Lv.8
  'lv-reception': {
    name: '리셉션 데스크',
    W: 3,
    D: 1,
    extraH: 10,
    parts: [
      b(0.05, 0.08, 2.9, 0.6, 0, 13, '#eef2f6'),
      b(0.05, 0.68, 2.9, 0.26, 0, 20, K.white, { top: K.stone, S: (q) => (q.v > 0.62 && q.v < 0.76 ? K.orange : Math.abs(q.u - 0.5) < 0.05 && q.v > 0.25 && q.v < 0.55 ? K.orange : K.white) }),
      b(1.2, 0.18, 0.5, 0.08, 13, 10, K.metal, { N: screenFace }),
      b(1.34, 0.26, 0.22, 0.1, 13, 1, K.metal),
      b(2.4, 0.24, 0.24, 0.24, 13, 5, K.pot),
    ],
    after: (a) => leaves(a, 2.52, 0.36, 18, [[0, -4, 4], [-3, -2, 3], [3, -2, 3]]),
  },
  'lv-waiting-sofa': sofa('대기 소파', 2, '#a9b9da', '#c3cfe8'),
  // Lv.9
  'lv-pingpong': {
    name: '탁구대',
    W: 3,
    D: 2,
    parts: [
      ...legs(0.2, 0.2, 2.8, 1.8, 0.1, 11, K.metal),
      b(0.04, 0.04, 2.92, 1.92, 11, 2, K.blue, { top: (q) => (q.u < 0.015 || q.u > 0.985 || q.v < 0.02 || q.v > 0.98 || Math.abs(q.v - 0.5) < 0.02 ? K.white : K.blue) }),
      b(1.47, -0.02, 0.06, 2.04, 13, 4, '#eef2f6', { top: K.metalL }),
      b(0.4, 0.6, 0.22, 0.18, 13, 1, K.red),
      b(2.4, 1.2, 0.22, 0.18, 13, 1, K.red),
    ],
  },
  arcade: {
    name: '오락기',
    W: 1,
    D: 1,
    parts: [
      b(0.15, 0.14, 0.7, 0.66, 0, 32, K.purple, {
        top: mix(K.purple, WHITE, 0.2),
        S: (q) => {
          if (q.v > 0.88) return K.orange
          if (inRect(q, 0.12, 0.88, 0.52, 0.82)) return frac(q.v * 10 + q.u * 3) < 0.15 ? K.skyL : K.navy
          if (inRect(q, 0.08, 0.92, 0.36, 0.46)) return Math.abs(q.u - 0.3) < 0.06 ? K.red : Math.abs(q.u - 0.65) < 0.05 || Math.abs(q.u - 0.78) < 0.05 ? K.yellow : K.dark
          return K.purple
        },
      }),
    ],
  },
  // Lv.10
  'lv-hall-bench': {
    name: '엘리베이터 홀 벤치',
    W: 2,
    D: 1,
    sitZ: 9,
    parts: [b(0.14, 0.26, 0.1, 0.48, 0, 8, K.metal), b(1.76, 0.26, 0.1, 0.48, 0, 8, K.metal), b(0.04, 0.24, 1.92, 0.52, 8, 2, K.wood, { top: (q) => (frac(q.v * 4) < 0.12 ? K.woodD : K.wood) })],
  },
  'lv-floor-sign': {
    name: '층 안내판',
    W: 1,
    D: 1,
    parts: [
      b(0.3, 0.36, 0.4, 0.28, 0, 2, K.metal),
      b(0.46, 0.46, 0.08, 0.08, 2, 10, K.metal),
      b(0.14, 0.44, 0.72, 0.08, 12, 20, K.navy, { S: (q) => (q.u < 0.05 || q.u > 0.95 || q.v < 0.05 || q.v > 0.95 ? K.metalL : frac(q.v * 5) < 0.45 ? (q.u < 0.22 ? K.orange : q.u > 0.3 && q.u < 0.3 + noise(Math.floor(q.v * 5), 1) * 0.55 ? K.skyL : K.navy) : K.navy) }),
    ],
  },
  // Lv.11
  'lv-sleep-pod': {
    name: '수면 캡슐',
    W: 1,
    D: 2,
    parts: [
      b(0.02, 0.02, 0.96, 1.96, 0, 3, K.metalL),
      b(0.05, 0.05, 0.9, 1.9, 3, 18, K.white, {
        top: '#ffffff',
        E: (q) => (inRect(q, 0.12, 0.88, 0.18, 0.82) ? (q.u > 0.7 && q.v < 0.5 ? K.paper : q.v < 0.4 ? '#7fa8e0' : K.navy) : K.white),
        W: (q) => (inRect(q, 0.12, 0.88, 0.18, 0.82) ? K.navy : K.white),
      }),
    ],
  },
  'lv-shower': {
    name: '샤워 부스',
    W: 1,
    D: 1,
    parts: [b(0.08, 0.08, 0.84, 0.84, 0, 2, '#eef2f6'), b(0.1, 0.1, 0.8, 0.8, 2, 36, K.sky, { S: glassFace(K.metalL), E: glassFace(K.metalL), N: glassFace(K.metalL), W: glassFace(K.metalL), top: K.steel })],
  },
  // Lv.12
  'lv-tall-bookshelf': shelf('키 큰 책장', 2, 42, K.woodD),
  'lv-reading-chair': {
    name: '독서 의자',
    W: 1,
    D: 1,
    sitZ: 9,
    parts: [
      b(0.12, 0.16, 0.76, 0.72, 0, 3, K.walnut, { role: 'seat' }),
      b(0.12, 0.16, 0.76, 0.72, 3, 6, '#f0b56a', { role: 'seat' }),
      b(0.26, 0.3, 0.48, 0.56, 9, 2, '#f6cb8e', { role: 'seat' }),
      b(0.12, 0.3, 0.14, 0.58, 9, 6, '#f0b56a', { role: 'seat' }),
      b(0.74, 0.3, 0.14, 0.58, 9, 6, '#f0b56a', { role: 'seat' }),
      b(0.12, 0.12, 0.76, 0.18, 9, 15, '#f0b56a', { role: 'back' }),
    ],
  },
  // Lv.13
  treadmill: {
    name: '러닝머신',
    W: 1,
    D: 2,
    parts: [
      b(0.1, 0.28, 0.8, 1.66, 0, 4, K.metalL, { top: (q) => (q.u < 0.14 || q.u > 0.86 || q.v > 0.96 ? K.steel : frac(q.v * 10) < 0.12 ? K.metal : K.dark) }),
      b(0.12, 0.1, 0.1, 0.18, 0, 26, K.metalL),
      b(0.78, 0.1, 0.1, 0.18, 0, 26, K.metalL),
      b(0.12, 0.04, 0.76, 0.3, 26, 3, K.metal, { top: (q) => (inRect(q, 0.25, 0.75, 0.2, 0.8) ? K.screen : K.metal) }),
    ],
  },
  'lv-dumbbell': {
    name: '덤벨 랙',
    W: 2,
    D: 1,
    parts: [
      b(0.08, 0.26, 0.08, 0.5, 0, 16, K.metal),
      b(1.84, 0.26, 0.08, 0.5, 0, 16, K.metal),
      b(0.16, 0.3, 1.68, 0.42, 6, 1, K.metalL),
      b(0.16, 0.3, 1.68, 0.3, 14, 1, K.metalL),
      ...[0, 1, 2, 3].map((i) => b(0.24 + i * 0.4, 0.4, 0.28, 0.2, 7, 4, [K.red, K.blue, K.yellow, K.green][i])),
      ...[0, 1, 2, 3].map((i) => b(0.26 + i * 0.4, 0.34, 0.24, 0.16, 15, 3, K.dark)),
    ],
  },
  // Lv.14
  'lv-espresso-bar': {
    name: '에스프레소 바',
    W: 3,
    D: 1,
    parts: [
      b(0.05, 0.1, 2.9, 0.8, 0, 16, K.walnutT, { S: (q) => (frac(q.u * 14) < 0.12 ? K.walnut : K.walnutT) }),
      b(0.02, 0.07, 2.96, 0.86, 16, 2, K.stone),
      b(0.3, 0.14, 0.7, 0.42, 18, 11, K.steel, { S: (q) => (inRect(q, 0.15, 0.85, 0.15, 0.45) ? K.dark : q.v > 0.7 && Math.abs(q.u - 0.5) < 0.1 ? K.orange : K.steel) }),
      b(0.4, 0.2, 0.1, 0.1, 29, 2, K.paper),
      b(0.6, 0.2, 0.1, 0.1, 29, 2, K.paper),
      b(1.2, 0.2, 0.2, 0.2, 18, 10, K.dark),
      b(1.7, 0.5, 0.1, 0.1, 18, 3, K.paper),
      b(1.9, 0.5, 0.1, 0.1, 18, 3, K.paper),
      b(2.3, 0.3, 0.4, 0.3, 18, 4, K.woodL),
    ],
  },
  'lv-bar-stool': {
    name: '바 의자',
    W: 1,
    D: 1,
    sitZ: 18,
    parts: [b(0.32, 0.32, 0.36, 0.36, 0, 1, K.metal, { role: 'seat' }), b(0.45, 0.45, 0.1, 0.1, 1, 14, K.metalL, { role: 'seat' }), b(0.28, 0.28, 0.44, 0.44, 15, 3, K.orange, { role: 'seat' })],
  },
  // Lv.15
  'lv-long-table': {
    name: '카페테리아 긴 테이블',
    W: 4,
    D: 2,
    parts: [
      ...legs(0.2, 0.2, 3.8, 1.8, 0.1, 12, '#b3a088'),
      b(1.95, 0.2, 0.1, 0.1, 0, 12, '#b3a088'),
      b(1.95, 1.7, 0.1, 0.1, 0, 12, '#b3a088'),
      b(0.06, 0.06, 3.88, 1.88, 12, 2, '#f6efe2'),
      ...[[0.4, 0.25], [1.5, 0.25], [2.6, 0.25], [0.9, 1.3], [2.0, 1.3], [3.1, 1.3]].map(([x, y]) => b(x, y, 0.5, 0.38, 14, 1, K.mint)),
      ...[[0.6, 0.35], [1.7, 0.35], [2.2, 1.4]].map(([x, y]) => b(x, y, 0.14, 0.14, 15, 2, K.orange)),
    ],
  },
  'lv-salad-bar': {
    name: '샐러드 바',
    W: 2,
    D: 1,
    parts: [
      b(0.05, 0.1, 1.9, 0.8, 0, 13, '#f4f1ea', { S: (q) => (q.v > 0.7 && q.v < 0.82 ? K.green : '#f4f1ea') }),
      b(0.05, 0.1, 1.9, 0.8, 13, 1, K.steel),
      ...[K.red, K.leaf[1], K.yellow, K.orange].map((c, i) => b(0.15 + i * 0.44, 0.4, 0.38, 0.4, 14, 2, c)),
      b(0.1, 0.16, 1.8, 0.06, 14, 10, K.sky, { S: glassFace(K.metalL), top: K.metalL }),
    ],
  },
  // Lv.16
  'lv-stage': {
    name: '강당 단상',
    W: 4,
    D: 2,
    parts: [
      b(0, 0, 4, 2, 0, 8, K.wood, { top: (q) => (frac(q.u * 10) < 0.05 ? K.woodD : K.wood), S: K.walnutT, E: K.walnutT }),
      b(1.7, 0.4, 0.6, 0.42, 8, 18, K.walnutT, { top: K.woodL, S: (q) => (Math.abs(q.u - 0.5) < 0.18 && q.v > 0.55 && q.v < 0.8 ? K.gold : K.walnutT) }),
      b(1.96, 0.5, 0.06, 0.06, 26, 6, K.metal),
    ],
  },
  'lv-hall-seats': {
    name: '강당 의자 줄',
    W: 4,
    D: 1,
    sitZ: 9,
    parts: [
      ...[0, 1, 2, 3].flatMap((i) => [
        b(i + 0.14, 0.32, 0.72, 0.5, 0, 8, K.metal, { role: 'seat' }),
        b(i + 0.14, 0.32, 0.72, 0.54, 8, 3, '#d0605a', { role: 'seat' }),
        b(i + 0.14, 0.12, 0.72, 0.18, 8, 16, '#d0605a', { role: 'back' }),
      ]),
      ...[0, 1, 2, 3, 4].map((i) => b(Math.min(i + 0.02, 3.92) - (i === 4 ? 0.02 : 0), 0.2, 0.08, 0.62, 0, 13, K.metal, { role: 'seat' })),
    ],
  },
  // Lv.17
  'lv-bbq': {
    name: '옥상 바비큐',
    W: 2,
    D: 1,
    parts: [
      ...legs(0.18, 0.24, 1.3, 0.76, 0.06, 10, K.metal),
      b(0.15, 0.2, 1.18, 0.6, 10, 7, K.dark, { top: (q) => (frac(q.u * 8) < 0.3 ? K.metal : frac(q.u * 8 + q.v) < 0.6 ? K.orange : K.red) }),
      b(0.15, 0.1, 1.18, 0.1, 17, 8, '#4a4f6a'),
      b(1.36, 0.26, 0.5, 0.5, 14, 2, K.wood),
      b(1.42, 0.36, 0.34, 0.08, 16, 1, K.red),
      b(1.42, 0.56, 0.34, 0.08, 16, 1, K.leaf[1]),
    ],
  },
  'lv-hammock': {
    name: '해먹',
    W: 2,
    D: 1,
    sitZ: 9,
    parts: [b(0.04, 0.42, 0.12, 0.16, 0, 26, K.woodD), b(1.84, 0.42, 0.12, 0.16, 0, 26, K.woodD), b(0.36, 0.24, 1.28, 0.52, 7, 3, '#f0a77a', { top: (q) => (frac(q.v * 4) < 0.5 ? '#f0a77a' : '#fbe0c8') })],
    after: (a) => {
      for (const [x0, x1] of [[0.1, 0.36], [1.9, 1.64]]) {
        line(a.cv, a.at(x0, 0.5, 24), a.at(x1, 0.3, 10), '#c49a6a')
        line(a.cv, a.at(x0, 0.5, 24), a.at(x1, 0.7, 10), '#c49a6a')
      }
    },
  },
  'lv-grass-pot': {
    name: '잔디 화분',
    W: 1,
    D: 1,
    extraH: 6,
    parts: [b(0.12, 0.12, 0.76, 0.76, 0, 8, '#d8c7ae', { top: (q) => (n32(q.gx, q.gy) > 0.7 ? K.leaf[2] : K.leaf[1]) })],
    after: (a) => {
      for (let i = 0; i < 16; i++) {
        const [x, y] = a.at(0.2 + noise(i, 1) * 0.6, 0.2 + noise(i, 2) * 0.6, 8)
        line(a.cv, [x, y], [x + (i % 3) - 1, y - 2 - Math.floor(noise(i, 3) * 3)], i % 2 ? K.leaf[0] : K.leaf[1])
      }
    },
  },
  // Lv.18
  'lv-lounge-sofa': {
    name: '스카이 라운지 소파',
    W: 3,
    D: 2,
    sitZ: 9,
    parts: [
      b(0.04, 0.08, 2.92, 0.86, 0, 2, K.metal),
      b(2.04, 0.94, 0.92, 1.02, 0, 2, K.metal),
      b(0.04, 0.08, 2.92, 0.86, 2, 7, '#b9a8e0'),
      b(2.04, 0.94, 0.92, 1.02, 2, 7, '#b9a8e0'),
      b(0.04, 0.08, 2.92, 0.26, 9, 11, '#b9a8e0'),
      b(0.04, 0.34, 0.24, 0.6, 9, 5, '#b9a8e0'),
      ...[0.3, 1.2].map((x) => b(x, 0.36, 0.84, 0.54, 9, 2, '#cdbff0')),
      b(2.08, 0.36, 0.84, 1.54, 9, 2, '#cdbff0'),
      b(0.4, 0.3, 0.3, 0.06, 11, 7, K.yellow),
    ],
  },
  'lv-telescope': {
    name: '망원경',
    W: 1,
    D: 1,
    extraH: 14,
    parts: [b(0.42, 0.42, 0.16, 0.16, 18, 4, K.metal)],
    after: (a) => {
      for (const [x, y] of [[0.15, 0.3], [0.85, 0.35], [0.5, 0.85]]) line(a.cv, a.at(0.5, 0.5, 18), a.at(x, y, 0), K.metal)
      line(a.cv, a.at(0.25, 0.7, 20), a.at(0.75, 0.25, 34), K.white, 3)
      line(a.cv, a.at(0.72, 0.28, 33), a.at(0.78, 0.22, 35), K.gold, 3)
    },
  },
  // Lv.19
  'lv-trophy-case': trophyCase('트로피 진열장', 36),
  'lv-hall-of-fame': {
    name: '명예의 전당 벽',
    W: 3,
    D: 1,
    parts: [
      b(0.1, 0.34, 2.8, 0.32, 0, 3, K.metal),
      b(0.1, 0.42, 2.8, 0.16, 3, 40, K.navy, {
        S: (q) => {
          const f = frac(q.u * 5)
          const g = frac(q.v * 2)
          if (f > 0.15 && f < 0.85 && g > 0.15 && g < 0.85) return f < 0.22 || f > 0.78 || g < 0.24 || g > 0.76 ? K.gold : [K.skyL, '#fbe9df', '#e6f5ec'][Math.floor(q.u * 5 + q.v * 2) % 3]
          return K.navy
        },
      }),
      b(0.1, 0.4, 2.8, 0.2, 43, 2, K.gold),
    ],
  },
  // Lv.20
  'lv-ceo-desk': {
    name: '대표 책상',
    W: 3,
    D: 2,
    parts: [
      b(0.1, 0.3, 0.6, 1.4, 0, 13, K.walnut, { S: drawers(K.walnut, 3) }),
      b(2.3, 0.3, 0.6, 1.4, 0, 13, K.walnut, { S: drawers(K.walnut, 3) }),
      b(0.7, 1.5, 1.6, 0.12, 3, 10, K.walnut),
      b(0.04, 0.2, 2.92, 1.6, 13, 2, K.walnutT, { top: (q) => (q.u < 0.01 || q.u > 0.99 || q.v < 0.02 || q.v > 0.98 ? K.gold : K.walnutT) }),
      b(0.9, 0.34, 1.2, 0.5, 15, 1, '#3a5a4e'),
      b(1.4, 1.2, 0.2, 0.14, 15, 1, K.metal),
      b(1.1, 1.22, 0.8, 0.1, 16, 13, K.metal, { N: screenFace }),
      b(2.5, 0.6, 0.16, 0.16, 15, 8, K.gold),
      b(2.42, 0.52, 0.32, 0.32, 23, 4, '#2e6b4f'),
      b(0.3, 1.48, 0.5, 0.1, 15, 2, K.gold),
    ],
  },
  'lv-fountain': {
    name: '분수 조형물',
    W: 2,
    D: 2,
    extraH: 12,
    parts: [
      ...[b(0.1, 0.3, 1.8, 1.4, 0, 6, K.stone), b(0.3, 0.1, 1.4, 1.8, 0, 6, K.stone)].map((p) => ({ ...p, top: (q: Q) => (Math.hypot(q.gx - 1, q.gy - 1) < 0.62 ? (n32(q.gx, q.gy) > 0.85 ? K.skyL : K.sky) : K.stone) })),
      b(0.86, 0.86, 0.28, 0.28, 6, 14, K.stoneD),
      b(0.78, 0.78, 0.44, 0.44, 20, 6, K.gold),
    ],
    after: (a) => {
      const [cx, cy] = a.at(1, 1, 30)
      for (const s of [-1, 1])
        for (let t = 0; t < 12; t++) a.cv.set(cx + s * t, cy + Math.round(((t - 4) * (t - 4)) / 3) - 5, C(t % 3 ? K.sky : K.skyL))
    },
  },

  // ── 기존 상점 가구 중 바로 그릴 수 있는 것 ──
  'sofa-green': sofa('그린 소파', 2, K.mint, K.mintL),
  'sofa-pink': sofa('핑크 소파', 2, K.pink, '#f8c4d0'),
  fern: plant('고사리', { c: '#d8c7ae', h: 8, s: 0.44 }, [[0, -6, 6], [-7, -3, 5], [7, -3, 5], [-4, -10, 4], [4, -10, 4]], { extraH: 16 }),
  cactus: {
    name: '선인장 3종',
    W: 1,
    D: 1,
    parts: [
      b(0.35, 0.12, 0.3, 0.3, 0, 6, '#d8c7ae'),
      b(0.43, 0.2, 0.14, 0.14, 6, 18, K.leaf[0]),
      b(0.1, 0.5, 0.3, 0.3, 0, 5, K.pot),
      b(0.18, 0.58, 0.14, 0.14, 5, 12, K.leaf[1]),
      b(0.55, 0.55, 0.3, 0.3, 0, 5, '#c9a7d8'),
      b(0.63, 0.63, 0.14, 0.14, 5, 7, K.leaf[2]),
    ],
  },
  'flower-pot': plant('꽃 화분', { c: '#e6a8c0', h: 7, s: 0.36 }, [[0, -5, 5], [-4, -3, 3], [4, -3, 3]], { extraH: 12, dots: [[-3, -8, K.red], [2, -9, K.yellow], [4, -5, K.pink], [-5, -4, K.paper], [0, -6, K.orange]] }),
  monstera: plant('몬스테라 화분', { c: '#f4f1ea', h: 11, s: 0.42 }, [[0, -12, 8], [-9, -8, 7], [9, -8, 7], [-5, -18, 6], [6, -17, 6]], { pal: ['#2f7a48', '#3f9a58', '#62bd6c'] }),
  'fig-tree': plant('떡갈고무나무', { c: K.pot, h: 10, s: 0.42 }, [[0, -26, 8], [-6, -20, 6], [6, -21, 6], [-2, -32, 5], [4, -14, 5]], { extraH: 40, pal: ['#2f7a48', '#4a9a5a', '#7cc46a'] }),
  bonsai: {
    name: '분재',
    W: 1,
    D: 1,
    extraH: 12,
    parts: [b(0.2, 0.3, 0.6, 0.4, 0, 4, K.navy), b(0.46, 0.46, 0.08, 0.08, 4, 5, K.woodD)],
    after: (a) => leaves(a, 0.5, 0.5, 9, [[-4, -2, 4], [4, -3, 4], [0, -5, 3]]),
  },
  'cherry-tree': plant('벚꽃 나무', { c: '#d8c7ae', h: 10, s: 0.46 }, [[0, -26, 9], [-8, -20, 7], [8, -21, 7], [-3, -33, 6], [5, -14, 5]], { extraH: 40, pal: ['#e88aa8', '#f6b8cc', '#fde0ea'] }),
  'xmas-tree': {
    name: '크리스마스 트리',
    W: 1,
    D: 1,
    extraH: 6,
    parts: [
      b(0.4, 0.4, 0.2, 0.2, 0, 5, K.woodD),
      ...[0, 1, 2, 3].map((i) => {
        const c = i % 2 ? K.leaf[1] : K.leaf[0]
        return b(0.1 + i * 0.1, 0.1 + i * 0.1, 0.8 - i * 0.2, 0.8 - i * 0.2, 5 + i * 8, 8, c, { S: (q: Q) => (noise(Math.floor(q.u * 6), i) > 0.7 && q.v > 0.4 && q.v < 0.6 ? [K.red, K.yellow, K.skyL][i % 3] : c) })
      }),
    ],
    after: (a) => {
      const [x, y] = a.at(0.5, 0.5, 39)
      for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [0, 0], [-2, -1], [2, -1]]) a.cv.set(x + dx, y + dy, C(K.yellow))
    },
  },
  bookshelf: shelf('책장', 2, 28, K.wood),
  'floor-lamp': {
    name: '스탠드 조명',
    W: 1,
    D: 1,
    parts: [b(0.36, 0.36, 0.28, 0.28, 0, 2, K.metal), b(0.47, 0.47, 0.06, 0.06, 2, 28, K.metal), b(0.3, 0.3, 0.4, 0.4, 30, 8, '#fbe9c8', { top: '#fff6e4' })],
  },
  'arc-lamp': {
    name: '아크 조명',
    W: 1,
    D: 1,
    extraH: 4,
    parts: [b(0.08, 0.1, 0.3, 0.3, 0, 4, '#e6e9ef'), b(0.58, 0.58, 0.3, 0.3, 26, 5, K.metal, { top: K.metalL })],
    after: (a) => {
      const pts = Array.from({ length: 9 }, (_, i) => {
        const t = i / 8
        return a.at(0.23 + t * 0.5, 0.25 + t * 0.48, 4 + Math.sin(t * Math.PI * 0.9) * 32 + t * 22)
      })
      for (let i = 0; i < 8; i++) line(a.cv, pts[i], pts[i + 1], K.metal)
    },
  },
  'rug-round': {
    name: '원형 러그',
    W: 2,
    D: 2,
    flat: true,
    parts: [
      b(0, 0, 2, 2, 0, 0, '#f0c9a8', {
        top: (q) => {
          const d = Math.hypot(q.u - 0.5, q.v - 0.5)
          return d > 0.48 ? null : d > 0.42 ? '#e2a07a' : d > 0.26 && d < 0.3 ? '#f6e0cc' : '#f0c9a8'
        },
      }),
    ],
  },
  'rug-persian': {
    name: '페르시안 러그',
    W: 3,
    D: 2,
    flat: true,
    parts: [
      b(0.05, 0.05, 2.9, 1.9, 0, 0, '#b8505a', {
        top: (q) => {
          const e = Math.min(q.u, 1 - q.u, (q.v * 2) / 3, ((1 - q.v) * 2) / 3)
          if (e < 0.03) return '#f4e6c8'
          if (e < 0.08) return '#2e4a7a'
          const m = Math.abs(q.u - 0.5) * 3 + Math.abs(q.v - 0.5) * 2
          return frac(m * 3) < 0.2 ? K.gold : '#b8505a'
        },
      }),
    ],
  },
  'coffee-machine': {
    name: '에스프레소 머신',
    W: 1,
    D: 1,
    parts: [
      b(0.1, 0.14, 0.8, 0.62, 0, 16, K.walnutT, { S: doors(K.walnutT, 1) }),
      b(0.2, 0.2, 0.54, 0.42, 16, 12, K.steel, { S: (q) => (inRect(q, 0.2, 0.8, 0.1, 0.45) ? K.dark : q.v > 0.75 && Math.abs(q.u - 0.5) < 0.1 ? K.orange : K.steel) }),
      b(0.36, 0.62, 0.1, 0.1, 16, 3, K.paper),
    ],
  },
  aquarium: {
    name: '수족관',
    W: 2,
    D: 1,
    parts: [
      b(0.05, 0.2, 1.9, 0.6, 0, 12, K.navy, { S: doors(K.navy, 2) }),
      b(0.05, 0.2, 1.9, 0.6, 12, 18, K.sky, {
        top: '#bfe6f6',
        E: '#8fd0ee',
        S: (q) => {
          if (q.u < 0.02 || q.u > 0.98) return K.navy
          if (q.v < 0.12) return frac(q.u * 20) < 0.5 ? '#e8d6a8' : '#d8c08a'
          if (q.v < 0.35 && frac(q.u * 3) < 0.08) return K.leaf[1]
          const fx = Math.floor(q.u * 7)
          if (noise(fx, 9) > 0.4 && Math.abs(q.v - (0.4 + noise(fx, 5) * 0.45)) < 0.06 && frac(q.u * 7) < 0.4) return [K.orange, K.yellow, K.pink][fx % 3]
          return frac((q.u + q.v) * 4) < 0.06 ? K.skyL : '#8fd0ee'
        },
      }),
      b(0.05, 0.2, 1.9, 0.6, 30, 2, K.navy),
    ],
  },
  foosball: {
    name: '테이블 축구',
    W: 2,
    D: 1,
    parts: [
      ...legs(0.16, 0.2, 1.84, 0.8, 0.08, 8, K.walnut),
      b(0.1, 0.15, 1.8, 0.7, 8, 8, K.walnutT, { top: (q) => (q.u < 0.04 || q.u > 0.96 || q.v < 0.08 || q.v > 0.92 ? K.walnutT : Math.abs(q.u - 0.5) < 0.006 ? K.paper : K.leaf[1]) }),
      ...[0, 1, 2, 3].map((i) => b(0.36 + i * 0.4, 0.04, 0.04, 0.92, 15, 1, K.metalL)),
    ],
  },
  'pool-table': {
    name: '당구대',
    W: 3,
    D: 2,
    parts: [
      ...legs(0.2, 0.2, 2.8, 1.8, 0.16, 6, K.walnut),
      b(0.05, 0.05, 2.9, 1.9, 6, 8, K.walnutT, {
        top: (q) => {
          if (Math.min(q.u * 3, (1 - q.u) * 3, q.v * 2, (1 - q.v) * 2) < 0.12) return K.walnutT
          const pocket = (Math.min(q.u, 1 - q.u) < 0.06 || Math.abs(q.u - 0.5) < 0.02) && Math.min(q.v, 1 - q.v) < 0.09
          return pocket ? K.dark : '#3f9a78'
        },
      }),
      b(0.7, 0.9, 0.08, 0.08, 14, 2, K.paper),
      b(2.0, 0.7, 0.08, 0.08, 14, 2, K.red),
      b(2.1, 1.1, 0.08, 0.08, 14, 2, K.yellow),
    ],
  },

  fishbowl: {
    name: '어항',
    W: 1,
    D: 1,
    extraH: 12,
    parts: [b(0.3, 0.3, 0.4, 0.4, 0, 12, K.woodD, { top: K.wood })],
    after: (a) => ball(a, 0.5, 0.5, 18, 6, K.sky, (dx, dy) => (dy < -0.55 ? null : Math.abs(dx - 0.1) < 0.25 && Math.abs(dy - 0.1) < 0.15 ? K.orange : dy > 0.6 ? '#e8d6a8' : null)),
  },
  'lava-lamp': {
    name: '라바 램프',
    W: 1,
    D: 1,
    parts: [b(0.38, 0.38, 0.24, 0.24, 0, 4, K.metal), b(0.42, 0.42, 0.16, 0.16, 4, 12, K.purple, { S: (q) => (Math.hypot(q.u - 0.5, frac(q.v * 2) - 0.5) < 0.3 ? K.orange : K.purple), E: (q) => (Math.hypot(q.u - 0.3, frac(q.v * 2 + 0.4) - 0.5) < 0.3 ? K.orange : K.purple) }), b(0.41, 0.41, 0.18, 0.18, 16, 2, K.metal)],
  },
  dartboard: {
    name: '다트판',
    W: 1,
    D: 1,
    extraH: 10,
    parts: [b(0.3, 0.36, 0.4, 0.28, 0, 2, K.woodD), b(0.46, 0.46, 0.08, 0.08, 2, 20, K.woodD)],
    after: (a) => ball(a, 0.5, 0.5, 28, 6, K.dark, (dx, dy) => {
      const d = Math.hypot(dx, dy)
      return d < 0.18 ? K.red : d < 0.4 ? K.paper : d < 0.65 ? (Math.floor((Math.atan2(dy, dx) / Math.PI) * 5 + 5) % 2 ? K.red : K.leaf[0]) : d < 0.85 ? '#f4e6c8' : K.dark
    }),
  },
  // 연출 B 파일럿 — 낮은 장 위 평면 TV, 화면은 +y 면. 움직이는 시트(motion/tv.png)의 꺼짐 장과 같은 모양 (서랍·미니 뷰는 이 그림)
  tv: {
    name: 'TV',
    W: 2,
    D: 1,
    parts: [
      b(0.05, 0.2, 1.9, 0.6, 0, 9, K.walnutT, { S: (q) => (Math.abs(q.u - 0.5) < 0.008 || q.v < 0.12 ? K.walnut : K.walnutT) }),
      b(0.04, 0.18, 1.92, 0.64, 9, 1, K.walnut),
      b(0.9, 0.4, 0.2, 0.12, 10, 3, K.metal),
      b(0.12, 0.42, 1.76, 0.08, 13, 22, K.dark, {
        S: (q) => (q.u < 0.04 || q.u > 0.96 || q.v < 0.06 || q.v > 0.94 ? K.dark : q.u + (1 - q.v) * 0.6 > 0.55 && q.u + (1 - q.v) * 0.6 < 0.68 ? '#5a6884' : '#3a4560'),
      }),
    ],
  },
  globe: {
    name: '지구본',
    W: 1,
    D: 1,
    extraH: 12,
    parts: [b(0.36, 0.36, 0.28, 0.28, 0, 2, K.walnut), b(0.47, 0.47, 0.06, 0.06, 2, 10, K.gold)],
    after: (a) => ball(a, 0.5, 0.5, 18, 6, K.blue, (dx, dy) => (noise(Math.round(dx * 4 + 7), Math.round(dy * 4 + 9)) > 0.55 ? K.leaf[1] : null)),
  },
  easel: {
    name: '이젤 그림',
    W: 1,
    D: 1,
    parts: [
      b(0.2, 0.5, 0.06, 0.06, 0, 28, K.woodD),
      b(0.74, 0.5, 0.06, 0.06, 0, 28, K.woodD),
      b(0.47, 0.2, 0.06, 0.06, 0, 26, K.woodD),
      b(0.18, 0.56, 0.64, 0.06, 8, 2, K.woodD),
      b(0.18, 0.56, 0.64, 0.05, 10, 18, K.paper, { S: (q) => (q.v > 0.06 && q.v < 0.94 && q.u > 0.05 && q.u < 0.95 ? (q.v < 0.4 ? K.leaf[1] : Math.hypot(q.u - 0.7, q.v - 0.72) < 0.14 ? K.yellow : K.sky) : K.paper) }),
    ],
  },
  'punching-bag': {
    name: '샌드백',
    W: 1,
    D: 1,
    parts: [b(0.08, 0.36, 0.3, 0.3, 0, 2, K.metal), b(0.18, 0.46, 0.08, 0.08, 2, 36, K.metal), b(0.18, 0.46, 0.4, 0.08, 38, 2, K.metal), b(0.38, 0.38, 0.26, 0.26, 10, 22, K.red, { top: K.dark })],
    after: (a) => line(a.cv, a.at(0.51, 0.51, 38), a.at(0.51, 0.51, 32), K.metalL),
  },
  popcorn: {
    name: '팝콘 기계',
    W: 1,
    D: 1,
    parts: [
      b(0.2, 0.24, 0.6, 0.52, 0, 10, K.red, { S: (q) => (frac(q.u * 5) < 0.5 ? K.red : K.paper) }),
      b(0.22, 0.26, 0.56, 0.48, 10, 12, K.skyL, { S: (q) => (q.v < 0.45 ? (n32(q.gx, q.z / 16) > 0.5 ? '#fbe9b0' : '#f6d878') : q.u < 0.06 || q.u > 0.94 ? K.red : K.skyL), E: (q) => (q.v < 0.45 ? '#f6d878' : K.skyL), top: K.skyL }),
      b(0.18, 0.22, 0.64, 0.56, 22, 3, K.red),
    ],
  },
  'record-shelf': {
    name: 'LP 선반',
    W: 1,
    D: 1,
    parts: [
      b(0.1, 0.2, 0.8, 0.6, 0, 14, K.wood, { S: (q) => (q.v > 0.9 || q.u < 0.04 || q.u > 0.96 ? K.woodD : frac(q.u * 10) < 0.15 ? K.dark : [K.orange, K.blue, K.yellow, K.pink, K.mint][Math.floor(q.u * 10) % 5]) }),
      b(0.18, 0.28, 0.6, 0.44, 14, 2, K.dark, { top: (q) => (Math.hypot(q.u - 0.45, q.v - 0.5) < 0.34 ? (Math.hypot(q.u - 0.45, q.v - 0.5) < 0.08 ? K.orange : '#1e2130') : K.dark) }),
    ],
  },
  icecream: {
    name: '아이스크림 냉장고',
    W: 1,
    D: 1,
    parts: [b(0.08, 0.14, 0.84, 0.72, 0, 14, K.white, { S: (q) => (q.v > 0.45 && q.v < 0.65 ? K.blue : K.white), top: (q) => (inRect(q, 0.08, 0.92, 0.1, 0.9) ? [K.pink, '#f6e0b0', K.mintL, '#c9a07a'][Math.floor(q.u * 4)] : K.white) })],
  },
  jukebox: {
    name: '주크박스',
    W: 1,
    D: 1,
    parts: [
      b(0.15, 0.2, 0.7, 0.58, 0, 28, K.walnutT, {
        S: (q) => {
          if (q.u < 0.12 || q.u > 0.88) return q.v > 0.2 ? (frac(q.v * 6) < 0.5 ? K.orange : K.yellow) : K.walnut
          if (inRect(q, 0.12, 0.88, 0.55, 0.85)) return frac(q.u * 8) < 0.5 ? K.skyL : K.sky
          if (inRect(q, 0.2, 0.8, 0.1, 0.4)) return frac(q.v * 10) < 0.4 ? K.walnut : K.gold
          return K.walnutT
        },
      }),
      b(0.18, 0.23, 0.64, 0.52, 28, 4, K.orange),
    ],
  },
  gacha: {
    name: '뽑기 기계',
    W: 1,
    D: 1,
    parts: [
      b(0.25, 0.25, 0.5, 0.5, 0, 14, K.red, { S: (q) => (Math.hypot(q.u - 0.5, q.v - 0.6) < 0.18 ? K.paper : inRect(q, 0.35, 0.65, 0.1, 0.25) ? K.dark : K.red) }),
      b(0.27, 0.27, 0.46, 0.46, 14, 12, K.skyL, { S: (q) => (noise(Math.floor(q.u * 5), Math.floor(q.v * 4)) > 0.4 ? [K.yellow, K.blue, K.pink, K.mint][Math.floor(q.u * 5 + q.v * 4) % 4] : K.skyL), E: (q) => (noise(Math.floor(q.u * 5) + 9, Math.floor(q.v * 4)) > 0.4 ? [K.orange, K.purple, K.yellow][Math.floor(q.u * 5) % 3] : K.skyL) }),
      b(0.3, 0.3, 0.4, 0.4, 26, 2, K.red),
    ],
  },
  'clock-tower': {
    name: '괘종시계',
    W: 1,
    D: 1,
    parts: [
      b(0.25, 0.3, 0.5, 0.4, 0, 42, K.walnut, {
        S: (q) => {
          const d = Math.hypot((q.u - 0.5) * 1.2, (q.v - 0.82) * 4)
          if (d < 0.3) return Math.abs(q.u - 0.5) < 0.04 && q.v > 0.8 ? K.dark : K.paper
          if (inRect(q, 0.25, 0.75, 0.2, 0.62)) return Math.abs(q.u - 0.5) < 0.05 || Math.hypot(q.u - 0.5, (q.v - 0.3) * 2) < 0.1 ? K.gold : '#5a3a28'
          return K.walnut
        },
      }),
      b(0.22, 0.27, 0.56, 0.46, 42, 3, K.walnutT),
    ],
  },
  'neon-sign': {
    name: '네온사인',
    W: 1,
    D: 1,
    parts: [
      b(0.15, 0.46, 0.06, 0.06, 0, 8, K.metal),
      b(0.79, 0.46, 0.06, 0.06, 0, 8, K.metal),
      b(0.1, 0.44, 0.8, 0.1, 8, 18, K.dark, { S: (q) => (Math.abs(Math.hypot(q.u - 0.5, (q.v - 0.5) * 0.8) - 0.3) < 0.04 || (Math.abs(q.u - 0.5) < 0.04 && q.v > 0.3 && q.v < 0.7) ? K.pink : K.dark) }),
    ],
  },
  parrot: {
    name: '앵무새',
    W: 1,
    D: 1,
    parts: [b(0.3, 0.3, 0.4, 0.4, 0, 2, K.woodD), b(0.47, 0.47, 0.06, 0.06, 2, 20, K.woodD), b(0.2, 0.47, 0.6, 0.06, 22, 1, K.woodD), b(0.42, 0.44, 0.16, 0.12, 23, 8, K.leaf[1], { S: (q) => (q.v < 0.3 ? K.blue : K.leaf[1]) }), b(0.43, 0.45, 0.14, 0.1, 31, 4, K.red)],
  },
  'cat-tower': {
    name: '사무실 고양이',
    W: 1,
    D: 1,
    parts: [
      b(0.1, 0.1, 0.8, 0.8, 0, 3, '#e9d8bf'),
      b(0.4, 0.4, 0.2, 0.2, 3, 24, '#d8c7ae', { S: (q) => (frac(q.v * 10) < 0.3 ? '#c4b08e' : '#d8c7ae') }),
      b(0.55, 0.5, 0.36, 0.36, 12, 3, '#e9d8bf'),
      b(0.2, 0.2, 0.6, 0.6, 27, 3, '#e9d8bf'),
      b(0.34, 0.34, 0.32, 0.3, 30, 5, K.orange, { pet: true, S: (q) => (frac(q.u * 4) < 0.3 ? '#d86a36' : K.orange) }),
      b(0.36, 0.56, 0.06, 0.06, 35, 2, K.orange, { pet: true }),
      b(0.56, 0.56, 0.06, 0.06, 35, 2, K.orange, { pet: true }),
    ],
  },
  'dog-bed': {
    name: '사무실 강아지',
    W: 1,
    D: 1,
    parts: [
      b(0.08, 0.14, 0.84, 0.72, 0, 4, '#c98f78', { top: (q) => (inRect(q, 0.12, 0.88, 0.14, 0.86) ? '#f3e6d2' : '#c98f78') }),
      b(0.3, 0.26, 0.46, 0.32, 4, 6, '#e8c79a', { pet: true }),
      b(0.24, 0.5, 0.24, 0.24, 4, 8, '#e8c79a', { pet: true, S: (q) => (inRect(q, 0.3, 0.45, 0.5, 0.7) || inRect(q, 0.6, 0.75, 0.5, 0.7) ? K.dark : '#e8c79a') }),
      b(0.24, 0.48, 0.06, 0.08, 12, 3, '#a77d52', { pet: true }),
      b(0.42, 0.48, 0.06, 0.08, 12, 3, '#a77d52', { pet: true }),
    ],
  },
  claw: {
    name: '인형뽑기',
    W: 1,
    D: 1,
    parts: [
      b(0.12, 0.12, 0.76, 0.76, 0, 14, K.pink, { S: (q) => (inRect(q, 0.6, 0.85, 0.2, 0.7) ? K.dark : K.pink) }),
      b(0.14, 0.14, 0.72, 0.72, 14, 18, K.skyL, { S: (q) => (q.v < 0.35 && noise(Math.floor(q.u * 5), 2) > 0.3 ? [K.yellow, K.blue, K.orange, K.mint, K.purple][Math.floor(q.u * 5)] : q.v > 0.75 && Math.abs(q.u - 0.5) < 0.04 ? K.metal : K.skyL), E: (q) => (q.v < 0.35 && noise(Math.floor(q.u * 5), 5) > 0.3 ? [K.pink, K.yellow, K.blue][Math.floor(q.u * 5) % 3] : K.skyL) }),
      b(0.12, 0.12, 0.76, 0.76, 32, 5, K.pink, { S: (q) => (frac(q.u * 6) < 0.5 ? K.yellow : K.pink) }),
    ],
  },
  piano: {
    name: '그랜드 피아노',
    W: 2,
    D: 2,
    parts: [
      b(0.25, 0.3, 0.08, 0.08, 0, 10, K.dark),
      b(1.6, 0.3, 0.08, 0.08, 0, 10, K.dark),
      b(0.9, 1.5, 0.08, 0.08, 0, 10, K.dark),
      b(0.1, 0.1, 1.8, 0.9, 10, 6, K.dark),
      b(0.1, 1.0, 1.2, 0.55, 10, 6, K.dark),
      b(0.15, 1.55, 1.7, 0.3, 11, 3, K.dark, { top: (q) => (q.v < 0.25 ? K.dark : frac(q.u * 22) < 0.12 ? K.metal : frac(q.u * 22) < 0.45 && q.v < 0.55 ? '#1e2130' : K.paper) }),
      b(1.3, 0.5, 0.05, 0.05, 16, 5, K.metalL),
      b(0.14, 0.14, 1.72, 0.86, 21, 1, '#4a5070'),
    ],
  },
  trophy: trophyCase('트로피 장식장', 28),
  statue: {
    name: '황금 동상',
    W: 1,
    D: 1,
    parts: [
      b(0.18, 0.18, 0.64, 0.64, 0, 10, K.stone),
      b(0.38, 0.42, 0.24, 0.16, 10, 10, K.gold),
      b(0.34, 0.4, 0.32, 0.2, 20, 10, K.gold),
      b(0.42, 0.44, 0.16, 0.14, 30, 6, K.gold),
      b(0.66, 0.44, 0.08, 0.08, 26, 12, K.gold),
    ],
  },
  'vr-booth': {
    name: 'VR 부스',
    W: 1,
    D: 1,
    parts: [
      b(0.05, 0.05, 0.9, 0.9, 0, 3, K.dark, { top: (q) => (Math.abs(Math.hypot(q.u - 0.5, q.v - 0.5) - 0.36) < 0.04 ? K.screen : K.dark) }),
      b(0.05, 0.05, 0.08, 0.08, 3, 32, K.metalL),
      b(0.87, 0.05, 0.08, 0.08, 3, 32, K.metalL),
      b(0.05, 0.05, 0.9, 0.08, 35, 2, K.metalL),
      b(0.42, 0.13, 0.16, 0.1, 22, 5, K.purple),
    ],
  },
  robot: {
    name: '로봇 비서',
    W: 1,
    D: 1,
    parts: [
      b(0.3, 0.3, 0.4, 0.4, 0, 3, K.dark),
      b(0.28, 0.3, 0.44, 0.36, 3, 14, K.white, { S: (q) => (inRect(q, 0.3, 0.7, 0.4, 0.75) ? K.screen : K.white) }),
      b(0.32, 0.34, 0.36, 0.3, 17, 10, K.white, { S: (q) => (inRect(q, 0.1, 0.9, 0.3, 0.75) ? (Math.abs(q.u - 0.3) < 0.08 || Math.abs(q.u - 0.7) < 0.08 ? K.screen : K.navy) : K.white) }),
      b(0.48, 0.47, 0.04, 0.04, 27, 4, K.metal),
      b(0.47, 0.46, 0.06, 0.06, 31, 2, K.orange),
    ],
  },
  rocket: {
    name: '우주선 모형',
    W: 1,
    D: 1,
    parts: [
      b(0.25, 0.25, 0.5, 0.5, 0, 3, K.metal),
      b(0.3, 0.44, 0.08, 0.12, 3, 8, K.red),
      b(0.62, 0.44, 0.08, 0.12, 3, 8, K.red),
      b(0.38, 0.38, 0.24, 0.24, 3, 26, K.white, { S: (q) => (Math.hypot(q.u - 0.5, (q.v - 0.65) * 2) < 0.22 ? K.blue : Math.abs(q.v - 0.3) < 0.04 ? K.red : K.white) }),
      b(0.42, 0.42, 0.16, 0.16, 29, 5, K.red),
      b(0.46, 0.46, 0.08, 0.08, 34, 3, K.red),
    ],
  },
  dino: {
    name: '공룡 화석',
    W: 1,
    D: 1,
    parts: [
      b(0.04, 0.04, 0.92, 0.92, 0, 4, K.stoneD, { top: K.stone }),
      b(0.32, 0.46, 0.08, 0.08, 4, 12, '#f2ead8'),
      b(0.62, 0.46, 0.08, 0.08, 4, 12, '#f2ead8'),
      b(0.25, 0.42, 0.5, 0.16, 16, 6, '#f2ead8', { S: (q) => (frac(q.u * 6) < 0.4 ? '#d8cdb4' : '#f2ead8') }),
      b(0.12, 0.45, 0.13, 0.1, 20, 8, '#f2ead8'),
      b(0.04, 0.42, 0.18, 0.16, 28, 5, '#f2ead8', { S: (q) => (Math.abs(q.u - 0.3) < 0.1 && q.v > 0.5 ? K.dark : '#f2ead8') }),
      b(0.75, 0.46, 0.2, 0.08, 18, 3, '#f2ead8'),
    ],
  },
  'gold-bar': {
    name: '금괴 금고',
    W: 1,
    D: 1,
    parts: [
      b(0.15, 0.2, 0.7, 0.6, 0, 22, K.dark, { S: (q) => (Math.hypot(q.u - 0.45, q.v - 0.55) < 0.15 ? (Math.hypot(q.u - 0.45, q.v - 0.55) < 0.06 ? K.metal : K.metalL) : inRect(q, 0.72, 0.8, 0.35, 0.75) ? K.metalL : q.u < 0.05 || q.u > 0.95 ? K.metal : K.dark) }),
      b(0.22, 0.3, 0.26, 0.16, 22, 3, K.gold),
      b(0.52, 0.3, 0.26, 0.16, 22, 3, K.gold),
      b(0.37, 0.34, 0.26, 0.16, 25, 3, K.gold),
    ],
  },
  pumpkin: {
    name: '잭오랜턴',
    W: 1,
    D: 1,
    parts: [
      b(0.2, 0.24, 0.6, 0.52, 0, 9, K.orange, { S: (q) => ((Math.abs(q.u - 0.3) < 0.08 || Math.abs(q.u - 0.7) < 0.08) && q.v > 0.55 && q.v < 0.75 ? K.yellow : q.v > 0.2 && q.v < 0.38 && q.u > 0.25 && q.u < 0.75 && frac(q.u * 6) < 0.6 ? K.yellow : frac(q.u * 4) < 0.1 ? '#d86a36' : K.orange) }),
      b(0.26, 0.3, 0.48, 0.4, 9, 2, K.orange),
      b(0.46, 0.46, 0.08, 0.08, 11, 3, K.leaf[0]),
    ],
  },
  ghost: {
    name: '유령 풍선',
    W: 1,
    D: 1,
    extraH: 22,
    parts: [b(0.44, 0.44, 0.12, 0.12, 0, 2, K.metal)],
    after: (a) => {
      line(a.cv, a.at(0.5, 0.5, 2), a.at(0.5, 0.5, 22), K.metalL)
      ball(a, 0.5, 0.5, 30, 7, K.paper, (dx, dy) => ((Math.abs(dx + 0.35) < 0.15 || Math.abs(dx - 0.25) < 0.15) && Math.abs(dy + 0.15) < 0.15 ? K.dark : Math.abs(dx + 0.05) < 0.15 && Math.abs(dy - 0.35) < 0.12 ? K.dark : null))
    },
  },
  snowman: {
    name: '눈사람',
    W: 1,
    D: 1,
    parts: [
      b(0.25, 0.25, 0.5, 0.5, 0, 10, K.paper),
      b(0.32, 0.32, 0.36, 0.36, 10, 7, K.paper, { S: (q) => (Math.abs(q.u - 0.5) < 0.08 && (Math.abs(q.v - 0.3) < 0.1 || Math.abs(q.v - 0.7) < 0.1) ? K.dark : K.paper) }),
      b(0.31, 0.31, 0.38, 0.38, 17, 2, K.red),
      b(0.37, 0.37, 0.26, 0.26, 19, 7, K.paper, { S: (q) => (q.v > 0.5 && q.v < 0.7 && (Math.abs(q.u - 0.3) < 0.08 || Math.abs(q.u - 0.7) < 0.08) ? K.dark : Math.abs(q.u - 0.5) < 0.1 && q.v > 0.25 && q.v < 0.45 ? K.orange : K.paper) }),
      b(0.35, 0.35, 0.3, 0.3, 26, 1, K.dark),
      b(0.4, 0.4, 0.2, 0.2, 27, 6, K.dark),
    ],
  },
  'lunar-lantern': {
    name: '청사초롱',
    W: 1,
    D: 1,
    parts: [b(0.32, 0.32, 0.36, 0.36, 0, 2, K.woodD), b(0.47, 0.47, 0.06, 0.06, 2, 14, K.woodD), b(0.36, 0.36, 0.28, 0.28, 16, 14, K.red, { S: (q) => (q.v > 0.7 ? K.blue : K.red), E: (q) => (q.v > 0.7 ? K.blue : K.red) }), b(0.38, 0.38, 0.24, 0.24, 30, 2, K.gold)],
  },

  // ── 상점 책상·의자 (개인 꾸밈 gear — 그 직원이 배정된 자리에 입힌다, 기술 설계 2-5절) ──
  'desk-white': deskGear('화이트 책상', { top: '#ffffff', side: '#e4e7ee' }),
  'desk-pastel': deskGear('파스텔 책상', { top: '#cdeee4', side: '#a8dccb' }),
  'desk-bamboo': deskGear('대나무 책상', { top: (q) => (frac(q.u * 12) < 0.12 ? '#cdb67a' : '#e8d29a'), side: '#cdb67a' }),
  'desk-walnut': deskGear('월넛 책상', { top: K.walnutT, side: K.walnut }),
  'desk-standing': deskGear('스탠딩 책상', { top: '#eef0f3', side: K.metalL, z: 20, metalLegs: true }),
  'desk-gaming': deskGear('게이밍 책상', { top: '#3a3f55', side: '#2e3246', monitors: 2, screen: '#c9a8ff', edge: '#2e3246', more: [b(0.04, 0.9, 1.92, 0.02, 12, 1, K.pink, { S: (q) => [K.pink, K.screen, K.yellow][Math.floor(q.u * 9) % 3] })] }),
  'desk-glass': deskGear('유리 책상', { top: (q) => (frac((q.u * 2 - q.v) * 1.5) < 0.1 ? K.skyL : '#c4e8f6'), side: K.metalL, metalLegs: true }),
  'desk-executive': deskGear('임원 책상', { top: (q) => (q.u < 0.015 || q.u > 0.985 || q.v < 0.03 || q.v > 0.97 ? K.gold : K.walnutT), side: K.walnut, monitors: 3, edge: K.gold }),
  'desk-hologram': deskGear('홀로그램 책상', { top: '#eef0f6', side: K.metalL, metalLegs: true, monitors: 2, screen: '#c8f4ff' }),
  'desk-gold': deskGear('황금 책상', { top: (q) => (frac((q.u + q.v) * 3) < 0.08 ? '#f6e2a0' : K.gold), side: '#b8923a' }),
  'chair-mesh': chairGear('메쉬 의자', { seat: '#9aa0ad', back: '#b8bdcb' }),
  'chair-wood': chairGear('원목 의자', { seat: K.wood, back: K.woodD, base: K.woodD, woodLegs: true }),
  'chair-pink': chairGear('파스텔 의자', { seat: K.pink }),
  'chair-ball': {
    name: '짐볼 의자',
    W: 1,
    D: 1,
    sitZ: 12,
    parts: [b(0.24, 0.24, 0.52, 0.52, 0, 4, K.blue, { role: 'seat' }), b(0.18, 0.18, 0.64, 0.64, 4, 6, K.blue, { role: 'seat' }), b(0.26, 0.26, 0.48, 0.48, 10, 2, mix(K.blue, WHITE, 0.25), { role: 'seat' })],
  },
  'chair-gaming': chairGear('게이밍 의자', { seat: '#d0505a', back: '#2e3246', backH: 18, more: [b(0.4, 0.14, 0.2, 0.1, 18, 8, '#d0505a', { role: 'back' })] }),
  'chair-ergo': chairGear('인체공학 의자', { seat: '#3a3f55', back: '#4a5a8a', backH: 16, more: [b(0.3, 0.14, 0.4, 0.08, 29, 4, '#3a3f55', { role: 'back' })] }),
  'chair-leather': chairGear('가죽 의자', { seat: '#8a5a3c', back: '#7a4a30', backH: 17, wide: true }),
  'chair-egg': {
    name: '에그 체어',
    W: 1,
    D: 1,
    sitZ: 9,
    parts: [
      b(0.36, 0.36, 0.28, 0.28, 0, 2, K.metal, { role: 'seat' }),
      b(0.46, 0.46, 0.08, 0.08, 2, 5, K.metal, { role: 'seat' }),
      b(0.14, 0.2, 0.72, 0.64, 7, 4, K.paper, { role: 'seat' }),
      b(0.24, 0.3, 0.52, 0.46, 11, 1, K.orange, { role: 'seat' }),
      b(0.1, 0.1, 0.8, 0.14, 11, 16, K.paper, { role: 'back' }),
      b(0.1, 0.24, 0.12, 0.4, 11, 12, K.paper, { role: 'back' }),
      b(0.78, 0.24, 0.12, 0.4, 11, 12, K.paper, { role: 'back' }),
    ],
  },
  'chair-neon': chairGear('네온 게이밍 의자', { seat: '#2e3246', back: '#2e3246', backH: 18, more: [b(0.2, 0.13, 0.6, 0.02, 12, 18, K.screen, { role: 'back' })] }),
  'chair-throne': chairGear('왕좌', { seat: '#c0384a', back: K.gold, base: K.gold, backH: 24, wide: true, woodLegs: true, more: [b(0.3, 0.13, 0.4, 0.02, 14, 16, '#c0384a', { role: 'back' })] }),

  // ── 고정 칸 (기술 설계 2-4절: 계단·엘리베이터 왼쪽 뒤 2×2, 출입구 앞쪽 가운데 1칸) — 서랍 가구가 아니다 ──
  'fixed-entrance': {
    name: '출입구',
    W: 1,
    D: 1,
    flat: true,
    parts: [b(0.06, 0.06, 0.88, 0.88, 0, 0, K.orange, { top: (q) => (q.u < 0.08 || q.u > 0.92 || q.v < 0.08 || q.v > 0.92 ? '#c8693e' : Math.abs(q.u - 0.5) < 0.08 && q.v > 0.2 && q.v < 0.8 ? '#fbe0c8' : Math.abs(Math.abs(q.u - 0.5) - (q.v - 0.2) * 0.6) < 0.06 && q.v < 0.5 ? '#fbe0c8' : K.orange) })],
  },
  'fixed-stairs': {
    name: '계단 (올라감)',
    W: 2,
    D: 2,
    parts: stairsUp(1.2),
  },
  'fixed-stairs-up': {
    name: '계단 (올라감)',
    W: 2,
    D: 2,
    parts: stairsUp(1.2),
  },
  'fixed-stairs-down': {
    name: '계단 (내려감)',
    W: 2,
    D: 2,
    flat: true,
    parts: stairsDown(0.1, 1.5),
  },
  'fixed-stairs-both': {
    name: '계단 (오르내림)',
    W: 2,
    D: 2,
    parts: [...stairsUp(0.8), ...stairsDown(1.1, 0.8, true)],
  },
  'fixed-elevator': {
    name: '엘리베이터',
    W: 2,
    D: 2,
    parts: [
      b(0.1, 0.05, 1.8, 0.9, 0, 48, '#c9d2de', {
        top: '#dde3eb',
        S: (q) => {
          if (inRect(q, 0.25, 0.75, 0, 0.72)) return Math.abs(q.u - 0.5) < 0.01 ? K.metal : frac(q.u * 12) < 0.08 ? '#c4ccd8' : '#dde3eb'
          if (inRect(q, 0.4, 0.6, 0.8, 0.88)) return K.orange
          return '#c9d2de'
        },
      }),
      b(0.3, 1.05, 1.4, 0.8, 0, 0, '#dfe3ea'),
    ],
  },
  // ── Lv.11~20 상점 가구·소품 (0.14.0): 레벨마다 두 개씩 새로 열린다 ──
  // Lv.11
  'massage-chair': {
    name: '안마 의자',
    W: 1,
    D: 1,
    sitZ: 9,
    parts: [
      b(0.1, 0.1, 0.8, 0.76, 0, 3, K.dark, { role: 'seat' }),
      b(0.12, 0.2, 0.76, 0.66, 3, 6, '#5b3f35', { role: 'seat' }),
      b(0.24, 0.3, 0.52, 0.52, 9, 1, '#7a5646', { role: 'seat' }),
      b(0.1, 0.24, 0.14, 0.62, 9, 7, '#5b3f35', { role: 'seat' }),
      b(0.76, 0.24, 0.14, 0.62, 9, 7, '#5b3f35', { role: 'seat' }),
      b(0.3, 0.86, 0.4, 0.12, 0, 6, '#5b3f35', { role: 'seat' }),
      b(0.14, 0.1, 0.72, 0.2, 9, 20, '#5b3f35', { role: 'back', S: (q) => (inRect(q, 0.2, 0.8, 0.2, 0.9) && frac(q.v * 5) < 0.2 ? '#7a5646' : '#5b3f35') }),
    ],
  },
  'air-purifier': {
    name: '공기청정기',
    W: 1,
    D: 1,
    parts: [
      b(0.3, 0.3, 0.4, 0.4, 0, 24, K.white, {
        S: (q) => (q.v > 0.1 && q.v < 0.7 && frac(q.v * 10) < 0.35 ? K.steel : K.white),
        E: (q) => (q.v > 0.1 && q.v < 0.7 && frac(q.v * 10) < 0.35 ? K.steel : K.white),
        top: (q) => (Math.hypot(q.u - 0.5, q.v - 0.5) < 0.2 ? K.mint : K.white),
      }),
    ],
  },
  // ── 작은 소품 (0.16) ──
  'book-stack': {
    name: '책 더미',
    W: 1,
    D: 1,
    parts: [
      ...[[K.red, 0.24, 0.3, 4], [K.navy, 0.28, 0.34, 3], [K.yellow, 0.22, 0.32, 4], [K.mint, 0.3, 0.3, 3], [K.pink, 0.26, 0.36, 3]].map(([c, x, y, h], i, a) =>
        b(x as number, y as number, 0.44, 0.32, a.slice(0, i).reduce((z, r) => z + (r[3] as number), 0), h as number, c as string, { top: K.paper, E: (q: Q) => (q.v > 0.2 && q.v < 0.8 ? K.paper : (c as string)) }),
      ),
      b(0.56, 0.62, 0.22, 0.16, 0, 2, K.wood, { top: K.woodL }),
    ],
  },
  'box-pile': {
    name: '택배 상자',
    W: 1,
    D: 1,
    parts: [
      b(0.12, 0.2, 0.5, 0.5, 0, 10, '#c99a64', { top: (q) => (Math.abs(q.u - 0.5) < 0.07 ? '#e6cf9a' : '#d8ad78'), S: (q) => (q.v > 0.55 && q.v < 0.8 && q.u > 0.15 && q.u < 0.45 ? K.paper : '#c99a64') }),
      b(0.56, 0.42, 0.34, 0.36, 0, 7, '#d4a874', { top: (q) => (Math.abs(q.v - 0.5) < 0.08 ? '#e6cf9a' : '#e2bb88') }),
      b(0.2, 0.28, 0.34, 0.34, 10, 6, '#ddb27c', { top: (q) => (Math.abs(q.u - 0.5) < 0.09 ? '#e6cf9a' : '#ebc995') }),
    ],
  },
  'umbrella-stand': {
    name: '우산꽂이',
    W: 1,
    D: 1,
    parts: [
      b(0.3, 0.3, 0.4, 0.4, 0, 12, K.navy, { top: K.dark, S: (q) => (q.v > 0.8 ? mix(K.navy, WHITE, 0.2) : K.navy) }),
      b(0.36, 0.38, 0.06, 0.06, 12, 14, K.red),
      b(0.33, 0.36, 0.12, 0.1, 22, 4, K.red, { top: mix(K.red, WHITE, 0.2) }),
      b(0.55, 0.44, 0.06, 0.06, 12, 10, K.yellow),
      b(0.52, 0.42, 0.12, 0.1, 18, 4, K.yellow),
      b(0.46, 0.56, 0.05, 0.05, 12, 12, K.woodD),
    ],
  },
  'snack-basket': {
    name: '간식 바구니',
    W: 1,
    D: 1,
    parts: [
      ...legs(0.26, 0.26, 0.74, 0.74, 0.06, 8, K.woodD),
      b(0.22, 0.22, 0.56, 0.56, 8, 2, K.wood, { top: K.woodL }),
      b(0.26, 0.28, 0.48, 0.44, 10, 5, '#d8b07a', { S: (q) => (frac(q.u * 6) < 0.3 ? '#c49a62' : '#d8b07a'), E: (q) => (frac(q.u * 5) < 0.3 ? '#c49a62' : '#d8b07a') }),
      b(0.3, 0.32, 0.14, 0.12, 15, 3, K.red),
      b(0.46, 0.34, 0.12, 0.16, 15, 2, K.yellow),
      b(0.6, 0.3, 0.1, 0.12, 15, 3, K.orange),
      b(0.36, 0.52, 0.16, 0.12, 15, 2, K.pink),
    ],
  },
  'mini-fridge': {
    name: '미니 냉장고',
    W: 1,
    D: 1,
    parts: [
      b(0.22, 0.26, 0.56, 0.52, 0, 20, '#f2e6d0', {
        S: (q) => (q.v > 0.6 && q.v < 0.64 ? '#d6c6aa' : q.u > 0.82 && q.u < 0.88 && Math.abs(q.v - 0.75) < 0.1 ? K.metal : '#f2e6d0'),
        top: '#f8efe0',
      }),
      b(0.3, 0.36, 0.12, 0.1, 20, 4, K.mint),
      b(0.5, 0.4, 0.16, 0.12, 20, 2, K.yellow),
      ...[[0.26, 0.7], [0.66, 0.7]].map(([x, y]) => b(x, y, 0.06, 0.06, 0, 1, K.dark)),
    ],
  },
  'cork-board': {
    name: '코르크 메모판',
    W: 1,
    D: 1,
    parts: [
      b(0.24, 0.44, 0.06, 0.12, 0, 12, K.woodD),
      b(0.7, 0.44, 0.06, 0.12, 0, 12, K.woodD),
      b(0.16, 0.38, 0.68, 0.24, 0, 1, K.woodD),
      b(0.14, 0.46, 0.72, 0.08, 10, 18, K.woodD, {
        S: (q) => {
          if (q.u < 0.06 || q.u > 0.94 || q.v < 0.08 || q.v > 0.92) return K.woodD
          if (inRect(q, 0.12, 0.38, 0.45, 0.82)) return q.v > 0.74 && Math.abs(q.u - 0.25) < 0.04 ? K.red : '#fff3a8'
          if (inRect(q, 0.48, 0.78, 0.5, 0.86)) return q.v > 0.78 && Math.abs(q.u - 0.63) < 0.04 ? K.blue : K.paper
          if (inRect(q, 0.56, 0.86, 0.14, 0.42)) return '#ffc9d2'
          if (inRect(q, 0.14, 0.42, 0.14, 0.36)) return '#c9ecd8'
          return n32(Math.floor(q.u * 20), Math.floor(q.v * 12)) < 0.3 ? '#b88552' : '#c99662'
        },
        N: K.woodD,
      }),
    ],
  },
  // Lv.12
  'magazine-rack': {
    name: '잡지꽂이',
    W: 1,
    D: 1,
    parts: [
      b(0.2, 0.3, 0.6, 0.4, 0, 2, K.walnut),
      b(0.2, 0.3, 0.06, 0.4, 2, 16, K.walnut),
      b(0.74, 0.3, 0.06, 0.4, 2, 16, K.walnut),
      ...[K.red, K.blue, K.yellow].map((c, i) => b(0.28 + i * 0.15, 0.36, 0.12, 0.1, 2, 14 - i * 2, c)),
      b(0.26, 0.52, 0.48, 0.06, 2, 10, K.walnutT),
    ],
  },
  fireplace: {
    name: '벽난로',
    W: 2,
    D: 1,
    parts: [
      b(0.05, 0.1, 1.9, 0.6, 0, 26, '#c97b5a', {
        S: (q) => {
          if (inRect(q, 0.25, 0.75, 0, 0.6)) return q.v < 0.25 ? (frac(q.u * 6) < 0.5 ? K.orange : K.yellow) : q.v < 0.4 && Math.abs(q.u - 0.5) < 0.12 ? K.yellow : K.dark
          return frac(q.v * 6) < 0.08 || frac(q.u * 5 + (Math.floor(q.v * 6) % 2) * 0.5) < 0.04 ? '#a85f45' : '#c97b5a'
        },
      }),
      b(0, 0.06, 2, 0.72, 26, 3, K.stone),
      b(0.3, 0.2, 0.16, 0.16, 29, 6, K.gold),
      b(1.5, 0.22, 0.2, 0.12, 29, 8, K.paper),
    ],
  },
  // Lv.13
  'yoga-mat': {
    name: '요가 매트',
    W: 1,
    D: 2,
    flat: true,
    parts: [b(0.2, 0.1, 0.6, 1.8, 0, 0, K.purple, { top: (q) => (q.u < 0.06 || q.u > 0.94 ? '#7f6bc0' : frac(q.v * 8) < 0.06 ? '#b5a5e6' : K.purple) })],
  },
  'climbing-wall': {
    name: '클라이밍 벽',
    W: 2,
    D: 1,
    parts: [
      b(0.05, 0.1, 1.9, 0.3, 0, 46, '#e8e0d4', {
        S: (q) => {
          const k = noise(Math.floor(q.u * 9), Math.floor(q.v * 12))
          const isHold = k > 0.7 && Math.abs(frac(q.u * 9) - 0.5) < 0.25 && Math.abs(frac(q.v * 12) - 0.5) < 0.25
          return isHold ? [K.red, K.blue, K.yellow, K.green, K.orange][Math.floor(k * 37) % 5] : '#e8e0d4'
        },
      }),
      b(0.05, 0.4, 1.9, 0.56, 0, 3, K.blue),
    ],
  },
  // Lv.14
  'cold-brew': {
    name: '콜드브루 타워',
    W: 1,
    D: 1,
    parts: [
      b(0.2, 0.2, 0.6, 0.6, 0, 3, K.walnut),
      ...[0.24, 0.7].flatMap((x) => [b(x, 0.24, 0.06, 0.06, 3, 34, K.walnut), b(x, 0.7, 0.06, 0.06, 3, 34, K.walnut)]),
      b(0.38, 0.38, 0.24, 0.24, 3, 7, '#6b3e26'),
      b(0.46, 0.46, 0.08, 0.08, 10, 8, K.skyL),
      b(0.36, 0.36, 0.28, 0.28, 18, 6, '#8a5a3c'),
      b(0.36, 0.36, 0.28, 0.28, 26, 8, K.sky),
      b(0.2, 0.2, 0.6, 0.6, 37, 2, K.walnut),
    ],
  },
  'drone-dock': {
    name: '드론 거치대',
    W: 1,
    D: 1,
    parts: [
      b(0.2, 0.2, 0.6, 0.6, 0, 10, K.dark, {
        top: (q) => (Math.abs(Math.hypot(q.u - 0.5, q.v - 0.5) - 0.27) < 0.03 ? K.yellow : K.dark),
        S: (q) => (inRect(q, 0.3, 0.7, 0.4, 0.7) ? K.green : K.dark),
      }),
      b(0.38, 0.38, 0.24, 0.24, 18, 3, K.white),
      ...[0.22, 0.62].flatMap((x) => [b(x, 0.22, 0.16, 0.16, 19, 1, K.metalL), b(x, 0.62, 0.16, 0.16, 19, 1, K.metalL)]),
    ],
  },
  // Lv.15
  'sushi-belt': {
    name: '회전초밥 레일',
    W: 3,
    D: 1,
    parts: [
      b(0.05, 0.15, 2.9, 0.7, 0, 12, K.woodL, { S: (q) => (q.v > 0.85 ? K.woodD : K.woodL) }),
      b(0.05, 0.15, 2.9, 0.7, 12, 2, K.steel, { top: (q) => (q.v > 0.25 && q.v < 0.75 ? (frac(q.u * 12) < 0.1 ? K.metalL : K.steel) : K.metal) }),
      ...[0.3, 0.9, 1.5, 2.1, 2.6].flatMap((x, i) => [b(x, 0.36, 0.22, 0.28, 14, 2, [K.red, K.blue, K.yellow, K.green, K.pink][i]), b(x + 0.04, 0.42, 0.14, 0.16, 16, 2, i % 2 ? '#f08a6a' : K.paper)]),
    ],
  },
  'cotton-candy': {
    name: '솜사탕 기계',
    W: 1,
    D: 1,
    extraH: 10,
    parts: [b(0.2, 0.25, 0.6, 0.5, 0, 16, K.pink, { S: (q) => (frac(q.u * 5) < 0.5 ? K.pink : K.paper) }), b(0.24, 0.29, 0.52, 0.42, 16, 6, K.steel)],
    after: (a) => ball(a, 0.5, 0.5, 26, 5, '#fbd3e0'),
  },
  // Lv.16
  'holo-globe': {
    name: '홀로그램 지구본',
    W: 1,
    D: 1,
    extraH: 18,
    parts: [b(0.25, 0.25, 0.5, 0.5, 0, 8, K.dark, { top: (q) => (Math.hypot(q.u - 0.5, q.v - 0.5) < 0.3 ? K.screen : K.dark) })],
    after: (a) => ball(a, 0.5, 0.5, 18, 7, K.sky, (dx, dy) => (Math.abs(dy) < 0.12 || Math.abs(dx) < 0.1 ? K.skyL : noise(Math.round(dx * 5) + 9, Math.round(dy * 5) + 9) > 0.6 ? '#7fd8b0' : null)),
  },
  spotlight: {
    name: '무대 조명',
    W: 1,
    D: 1,
    parts: [
      b(0.2, 0.6, 0.06, 0.06, 0, 22, K.metal),
      b(0.74, 0.6, 0.06, 0.06, 0, 22, K.metal),
      b(0.47, 0.2, 0.06, 0.06, 0, 22, K.metal),
      b(0.3, 0.3, 0.4, 0.4, 22, 10, K.dark, { S: (q) => (Math.hypot(q.u - 0.5, q.v - 0.5) < 0.32 ? K.yellow : K.dark) }),
    ],
  },
  // Lv.17
  greenhouse: {
    name: '미니 온실',
    W: 2,
    D: 2,
    parts: [
      b(0.08, 0.08, 1.84, 1.84, 0, 4, K.woodD),
      b(0.1, 0.1, 1.8, 1.8, 4, 30, K.skyL, { S: glassFace(K.white), E: glassFace(K.white), N: glassFace(K.white), W: glassFace(K.white), top: (q) => (frac(q.u * 4) < 0.06 || frac(q.v * 4) < 0.06 ? K.white : K.skyL) }),
    ],
    after: (a) => {
      leaves(a, 0.7, 0.9, 6, [[0, -5, 5], [-5, -2, 4], [5, -2, 4]])
      leaves(a, 1.3, 1.3, 6, [[0, -4, 4], [-4, -1, 3]], [K.pink, '#f6c0cc', '#fbe0e6'])
    },
  },
  'fire-pit': {
    name: '불멍 화로',
    W: 1,
    D: 1,
    parts: [
      b(0.15, 0.15, 0.7, 0.7, 0, 7, K.dark, { top: (q) => (Math.hypot(q.u - 0.5, q.v - 0.5) < 0.3 ? (n32(q.u, q.v) > 0.5 ? K.orange : K.red) : K.metal) }),
      b(0.4, 0.42, 0.2, 0.16, 7, 5, K.orange),
      b(0.45, 0.46, 0.1, 0.08, 12, 4, K.yellow),
    ],
  },
  // Lv.18
  planetarium: {
    name: '플라네타리움',
    W: 2,
    D: 2,
    extraH: 14,
    parts: [b(0.1, 0.1, 1.8, 1.8, 0, 4, K.navy, { top: (q) => (n32(q.gx, q.gy) > 0.9 ? K.yellow : K.navy) }), b(0.85, 0.85, 0.3, 0.3, 4, 10, K.metal)],
    after: (a) => ball(a, 1, 1, 24, 9, K.dark, (dx, dy) => (noise(Math.round(dx * 8) + 20, Math.round(dy * 8) + 20) > 0.85 ? K.yellow : null)),
  },
  'wine-cellar': {
    name: '와인 셀러',
    W: 1,
    D: 1,
    parts: [b(0.15, 0.2, 0.7, 0.6, 0, 30, K.dark, { S: (q) => (inRect(q, 0.1, 0.9, 0.08, 0.92) ? (frac(q.v * 6) < 0.5 && Math.abs(frac(q.u * 4) - 0.5) < 0.25 ? '#8a2a3a' : '#2a2f40') : K.dark) })],
  },
  // Lv.19
  'ai-core': {
    name: 'AI 코어',
    W: 1,
    D: 1,
    parts: [
      b(0.18, 0.2, 0.64, 0.6, 0, 40, K.dark, {
        S: (q) => (q.u < 0.08 || q.u > 0.92 || frac(q.v * 10) < 0.15 ? K.metal : frac(q.u * 6 + q.v * 3) < 0.2 ? K.green : frac(q.u * 6) < 0.5 ? K.navy : K.dark),
        E: (q) => (frac(q.v * 10) < 0.15 ? K.metal : K.dark),
        top: K.metal,
      }),
      b(0.38, 0.38, 0.24, 0.24, 40, 3, K.orange),
    ],
  },
  'red-carpet': {
    name: '레드 카펫',
    W: 1,
    D: 3,
    flat: true,
    parts: [b(0.15, 0, 0.7, 3, 0, 0, K.red, { top: (q) => (q.u < 0.08 || q.u > 0.92 ? K.gold : '#c8443a') })],
  },
  // Lv.20
  diamond: {
    name: '거대 다이아몬드',
    W: 1,
    D: 1,
    parts: [
      b(0.2, 0.2, 0.6, 0.6, 0, 10, K.gold, { top: mix(K.gold, WHITE, 0.3) }),
      b(0.34, 0.34, 0.32, 0.32, 10, 4, K.skyL),
      b(0.28, 0.28, 0.44, 0.44, 14, 6, K.sky, { S: (q) => (frac((q.u + q.v) * 3) < 0.5 ? K.skyL : K.sky), E: (q) => (frac((q.u - q.v) * 3) < 0.5 ? K.white : K.sky), top: K.skyL }),
      b(0.36, 0.36, 0.28, 0.28, 20, 4, K.skyL),
    ],
  },
  helipad: {
    name: '헬리패드',
    W: 2,
    D: 2,
    flat: true,
    parts: [
      b(0, 0, 2, 2, 0, 0, K.dark, {
        top: (q) => {
          const u = q.u - 0.5
          const v = q.v - 0.5
          const d = Math.hypot(u, v)
          if (d > 0.48) return null
          if (d > 0.42) return K.yellow
          const isH = ((Math.abs(u + 0.12) < 0.04 || Math.abs(u - 0.12) < 0.04) && Math.abs(v) < 0.2) || (Math.abs(v) < 0.035 && Math.abs(u) < 0.12)
          return isH ? K.paper : '#4a5068'
        },
      }),
    ],
  },
  // 파티션·가벽 (docs/specs/partition-items.md): 칸 가운데 얇은 판. 낮음은 24px(앉은 직원 머리 높이), 높음은 40px(서 있는 직원을 다 가린다 — 장면이 WALL_FADE로 비친다)
  ...Object.fromEntries(Object.entries(PARTITIONS).map(([id, gen]) => [id, gen()])),
}

// ── 고정 소품 (지금 사무실의 settings.layout 키) → 서랍 가구 prop-{key} ──
// 기술 설계 3절: 가격 0·판매 안 함. 같은 그림이 있는 소품은 그 품목 그림을 그대로 쓴다
const PROP_ITEMS: Record<string, ItemDef> = {
  printer: {
    name: '복합기',
    W: 1,
    D: 1,
    parts: [
      b(0.15, 0.2, 0.7, 0.6, 0, 10, '#dfe3ea', { S: doors('#dfe3ea', 2) }),
      b(0.12, 0.18, 0.76, 0.64, 10, 8, K.white, { S: (q) => (q.v > 0.62 && q.v < 0.74 && q.u > 0.15 && q.u < 0.85 ? K.dark : K.white) }),
      b(0.24, 0.5, 0.5, 0.26, 18, 1, K.paper),
      b(0.58, 0.24, 0.2, 0.2, 18, 1, K.blue),
    ],
  },
  cabinets: {
    name: '서류함',
    W: 2,
    D: 1,
    parts: [b(0.08, 0.2, 0.88, 0.6, 0, 24, '#c9d2de', { S: drawers('#c9d2de', 3), top: '#dde3eb' }), b(1.04, 0.2, 0.88, 0.6, 0, 24, '#c9d2de', { S: drawers('#c9d2de', 3), top: '#dde3eb' }), b(1.3, 0.3, 0.36, 0.3, 24, 6, K.deskSide)],
  },
  trash: { name: '분리수거함', W: 1, D: 1, parts: [b(0.18, 0.32, 0.3, 0.3, 0, 9, '#7fa8e0'), b(0.52, 0.32, 0.3, 0.3, 0, 9, K.leaf[2]), b(0.2, 0.34, 0.26, 0.26, 9, 1, '#9dbde8'), b(0.54, 0.34, 0.26, 0.26, 9, 1, '#b8e4a0')] },
  cooler: {
    name: '정수기',
    W: 1,
    D: 1,
    parts: [b(0.25, 0.25, 0.5, 0.5, 0, 18, K.white, { S: (q) => (Math.abs(q.v - 0.7) < 0.06 && (Math.abs(q.u - 0.35) < 0.08 || Math.abs(q.u - 0.65) < 0.08) ? (q.u < 0.5 ? K.blue : K.red) : K.white) }), b(0.3, 0.3, 0.4, 0.4, 18, 10, K.sky, { top: K.blue })],
  },
  coffeeCorner: {
    name: '커피 코너',
    W: 2,
    D: 1,
    parts: [
      b(0.05, 0.1, 1.9, 0.8, 0, 14, K.wood, { S: doors(K.wood, 3), top: K.woodL }),
      b(0.03, 0.08, 1.94, 0.84, 14, 1, '#f4f1ea'),
      b(0.2, 0.2, 0.5, 0.4, 15, 11, K.steel, { S: (q) => (inRect(q, 0.2, 0.8, 0.1, 0.45) ? K.dark : K.steel) }),
      b(0.9, 0.3, 0.1, 0.1, 15, 3, K.paper),
      b(1.1, 0.3, 0.1, 0.1, 15, 3, K.orange),
      b(1.45, 0.25, 0.3, 0.3, 15, 7, K.skyL, { top: K.woodD }),
    ],
  },
  kitchen: {
    name: '주방',
    W: 3,
    D: 1,
    parts: [
      b(0.05, 0.1, 2.9, 0.8, 0, 14, K.white, { S: doors(K.white, 5) }),
      b(0.02, 0.08, 2.96, 0.84, 14, 1, K.steel, { top: (q) => (inRect(q, 0.08, 0.32, 0.25, 0.75) ? '#9aa4b4' : K.steel) }),
      b(0.5, 0.12, 0.06, 0.06, 15, 6, K.metal),
      b(1.9, 0.16, 0.66, 0.5, 15, 9, K.dark, { S: (q) => (inRect(q, 0.08, 0.7, 0.15, 0.85) ? '#4a5470' : K.dark) }),
    ],
  },
}
const PROP_ALIAS: Record<string, string> = {
  lamp: 'floor-lamp',
  plant: 'plant',
  lobbyPlant: 'fig-tree',
  roofPlant: 'lv-grass-pot',
  aquarium: 'aquarium',
  pingpong: 'lv-pingpong',
  arcade: 'arcade',
  napPod: 'lv-sleep-pod',
  fountain: 'lv-fountain',
  reception: 'lv-reception',
  sofa: 'lv-waiting-sofa',
  trophies: 'lv-trophy-case',
  lobbyTrophies: 'lv-trophy-case',
  bbq: 'lv-bbq',
}
/** 지금 사무실의 고정 소품 키 (예전 settings.layout 키). 계단·엘리베이터는 고정 칸(fixed-*)이라 뺐다 */
export const PROP_KEYS = [...Object.keys(PROP_ITEMS), ...Object.keys(PROP_ALIAS)]

// ── 휴게 구역 기본 가구 (office-iso-spaces.md 2-4절 · G6): 나머지는 있는 품목을 쓰고 탁자 3종·메뉴판만 새로 ──
/** 둥근 상판: 윗면만 원으로 */
const disc = (c: string) => (q: Q): Fill => (Math.hypot(q.u - 0.5, q.v - 0.5) > 0.5 ? null : c)
const ZONE_ITEMS: Record<string, ItemDef> = {
  'zone-low-table': {
    name: '낮은 탁자',
    W: 2,
    D: 1,
    parts: [
      ...legs(0.12, 0.2, 1.88, 0.8, 0.06, 5, K.woodD),
      b(0.06, 0.16, 1.88, 0.68, 5, 2, K.wood, { top: K.woodL }),
      b(0.3, 0.36, 0.12, 0.12, 7, 3, K.paper),
      b(1.4, 0.3, 0.3, 0.24, 7, 1, K.orange),
    ],
  },
  'zone-bistro': {
    name: '카페 원탁',
    W: 1,
    D: 1,
    parts: [b(0.3, 0.3, 0.4, 0.4, 0, 1, K.metal), b(0.46, 0.46, 0.08, 0.08, 1, 12, K.metal), b(0.08, 0.08, 0.84, 0.84, 13, 0, K.stone, { top: disc(K.stone) }), b(0.35, 0.4, 0.12, 0.12, 13, 3, K.paper)],
  },
  'zone-high-table': {
    name: '스탠딩 원탁',
    W: 1,
    D: 1,
    parts: [b(0.32, 0.32, 0.36, 0.36, 0, 1, K.metal), b(0.46, 0.46, 0.08, 0.08, 1, 17, K.metal), b(0.1, 0.1, 0.8, 0.8, 18, 0, '#f4f1ea', { top: disc('#f4f1ea') })],
  },
  'zone-menu-board': {
    name: '메뉴판',
    W: 1,
    D: 1,
    parts: [
      b(0.2, 0.42, 0.6, 0.12, 0, 26, K.woodD, {
        S: (q) => (q.u < 0.08 || q.u > 0.92 || q.v > 0.94 || q.v < 0.06 ? K.woodD : q.v > 0.78 ? '#f6e0a0' : frac(q.v * 7) < 0.2 && q.u > 0.18 && q.u < 0.4 + noise(Math.floor(q.v * 7), 1) * 0.4 ? '#f4f1ea' : '#3a4a3e'),
      }),
    ],
  },
}
/** 구역 기본 가구 품목 id (furniture.ts 규격표·ZONE_LAYOUTS가 쓴다) */
export const ZONE_ITEM_IDS = Object.keys(ZONE_ITEMS)

/** 책상 좌우 뒤집기 표시 — 의자가 책상의 오른쪽(로컬 x 1) 칸 앞에 붙으면 장면이 이 이름으로 그려 모니터를 의자 앞으로 옮긴다 */
export const DESK_FLIP = '~flip'
const flipU = (f: Paint | undefined): Paint | undefined => (typeof f === 'function' ? (q: Q) => f({ ...q, u: 1 - q.u }) : f)
/** 정의를 로컬 x축으로 뒤집는다 (부품 위치 · 동서 면 · 앞뒤·윗면 무늬 가로) */
const mirrorDef = (def: ItemDef): ItemDef => ({
  ...def,
  parts: def.parts.map((p) => ({ ...p, x: def.W - p.x - p.w, E: p.W, W: p.E, N: flipU(p.N), S: flipU(p.S), top: flipU(p.top) })),
})
/** 놓인 책상에서 바닥 칸 (cx, cy)가 로컬 몇 번째 칸(x)인지 — 없으면 -1 */
export function deskCellOf(itemId: string, r: Rot, gx: number, gy: number, cx: number, cy: number) {
  const { W, D } = defOf(itemId).def
  for (let i = 0; i < W; i++) {
    const [x, y] = rotPt(i + 0.5, 0.5, r, W, D)
    if (Math.floor(gx + x) === cx && Math.floor(gy + y) === cy) return i
  }
  return -1
}

function defOf(itemId: string): { def: ItemDef; isPlaceholder: boolean } {
  const ji = itemId.indexOf(PART_JOIN)
  if (ji > 0 && PARTITIONS[itemId.slice(0, ji)]) return { def: PARTITIONS[itemId.slice(0, ji)](parseJoin(itemId.slice(ji + PART_JOIN.length))), isPlaceholder: false }
  if (itemId.endsWith(DESK_FLIP)) {
    const base = defOf(itemId.slice(0, -DESK_FLIP.length))
    return { ...base, def: mirrorDef(base.def) }
  }
  if (itemId.startsWith('zone-') && ZONE_ITEMS[itemId]) return { def: ZONE_ITEMS[itemId], isPlaceholder: false }
  if (itemId.startsWith('prop-')) {
    const key = itemId.slice(5)
    const def = PROP_ITEMS[key] ?? ITEMS[PROP_ALIAS[key] ?? '']
    if (def) return { def, isPlaceholder: false }
  }
  const def = ITEMS[itemId]
  if (def) return { def, isPlaceholder: false }
  const [W, D] = specOf(itemId).size
  return { def: placeholder(W, D), isPlaceholder: true }
}
/** 그림이 있는지 (없으면 임시 상자) */
export const hasArt = (itemId: string) => !defOf(itemId).isPlaceholder
/** 그림의 차지 칸(r0) */
export const artSize = (itemId: string): [number, number] => {
  const { def } = defOf(itemId)
  return [def.W, def.D]
}
export const artName = (itemId: string) => itemName(itemId, defOf(itemId).def.name)
/** 앉는 가구면 앉은 직원 높이(아트 px), 아니면 null */
export const seatHeight = (itemId: string) => defOf(itemId).def.sitZ ?? null
/** 그림이 있는 품목 id 전부 (prop-* 포함) */
export const ART_ITEM_IDS = [...Object.keys(ITEMS), ...PROP_KEYS.map((k) => `prop-${k}`), ...ZONE_ITEM_IDS]

export const itemTextureKey = (itemId: string, r: Rot, role?: 'seat' | 'back') => `item-${itemId}-r${r}${role ? `-${role}` : ''}`

export interface ItemPixels {
  cv: Cv
  /** 텍스처 안에서 가구 로컬 (0,0) 칸 꼭짓점(바닥 높이)의 아트 px 위치 */
  o: Pt
  /** 가구 로컬 칸 기준 상자 (깊이 정렬용) */
  box: ArtBox
  /** 돌린 뒤 차지 칸 */
  w: number
  d: number
  isPlaceholder: boolean
}

const boxOf = (parts: ArtBox[]): ArtBox => {
  if (!parts.length) return { x: 0, y: 0, z: 0, w: 0, d: 0, h: 0 }
  const x = Math.min(...parts.map((p) => p.x))
  const y = Math.min(...parts.map((p) => p.y))
  const z = Math.min(...parts.map((p) => p.z))
  return { x, y, z, w: Math.max(...parts.map((p) => p.x + p.w)) - x, d: Math.max(...parts.map((p) => p.y + p.d)) - y, h: Math.max(...parts.map((p) => p.z + p.h)) - z }
}

/** 품목 한 방향 그림 (픽셀). role을 주면 의자 좌석/등받이만 (앉은 직원을 사이에 끼운다). 등받이 없는 의자의 back은 빈 그림 */
export function artItem(itemId: string, r: Rot, role?: 'seat' | 'back', withPets = true): ItemPixels {
  const { def, isPlaceholder } = defOf(itemId)
  return artDef(def, r, role, isPlaceholder, withPets)
}

/** 1칸 의자의 등받이를 앉은 직원 등(직원 깊이 상자 뒤끝 0.32칸)에 붙인다 — 칸 끝에 두면 화면에서 등받이가 사람 옆에 따로 떠 보인다.
 *  뒤쪽(y < 0.3)에서 시작하는 등받이 부품만 같이 민다(팔걸이처럼 앞으로 긴 부품은 그대로) */
function leanBack(def: ItemDef): ItemDef {
  if (def.sitZ === undefined || def.W !== 1 || def.D !== 1) return def
  const backs = def.parts.filter((p) => p.role === 'back' && p.y < 0.3)
  if (!backs.length) return def
  const dy = 0.32 - Math.max(...backs.map((p) => p.y + p.d))
  if (dy <= 0.005) return def
  return { ...def, parts: def.parts.map((p) => (p.role === 'back' && p.y < 0.3 ? { ...p, y: p.y + dy } : p)) }
}

/** 부품 정의 한 방향 그림 — 품목·회의실 기본 테이블이 같이 쓴다 */
function artDef(def: ItemDef, r: Rot, role?: 'seat' | 'back', isPlaceholder = false, withPets = true): ItemPixels {
  const { W, D } = def
  const [w, d] = r % 2 ? [D, W] : [W, D]
  const shown = leanBack(def).parts.filter((p) => withPets || !p.pet)
  const parts = shown.filter((p) => !role || (p.role ?? 'seat') === role).map((p) => rotPart(p, r, W, D))
  const H = Math.max(...shown.map((p) => p.z + p.h)) + (def.extraH ?? 0)
  const pad = 3
  const cv = new Cv((w + d) * HW + pad * 2, (w + d) * HH + H + pad * 2)
  const o: Pt = [d * HW + pad, H + pad]
  // 바닥 그림자: 차지한 칸보다 0.08칸 넓은 마름모 (좌석 쪽에만, 러그는 없음)
  if (role !== 'back' && !def.flat) {
    const g = 0.08
    fillPoly(cv, [P(o, -g, -g, 0), P(o, w + g, -g, 0), P(o, w + g, d + g, 0), P(o, -g, d + g, 0)], () => S.floorShadow)
  }
  for (const p of sortBoxes(parts)) drawBox(cv, o, p)
  if (def.after && role !== 'back')
    def.after({
      cv,
      r,
      at: (x, y, z) => {
        const [rx, ry] = rotPt(x, y, r, W, D)
        return P(o, rx, ry, z).map(Math.round) as Pt
      },
    })
  outline(cv)
  // 앉는 가구의 좌석 장: 팔걸이가 엉덩이보다 높아도 깊이 상자는 엉덩이 높이까지 — 앉은 직원이 늘 좌석 위(앞)에 그려진다
  const box = boxOf(parts)
  if (role === 'seat' && def.sitZ !== undefined) box.h = Math.min(box.h, def.sitZ + 3 - box.z)
  return { cv, o, box, w, d, isPlaceholder }
}

// ── 연출 시트 생성기용 (scripts/motion-pilot.mts · 연출④-5). 화면 코드는 쓰지 않는다 ──
export type { ItemDef as ArtItemDef, Part as ArtPart, Q as ArtQ, Paint as ArtPaint, After as ArtAfter }
/** 정의를 고친 한 방향 그림 — 프레임마다 부품 색·무늬만 바꾼다. 높이(extraH 포함)를 그대로 두면 칸 크기·기준점이 원래 그림과 같다 */
export function artItemPatched(itemId: string, r: Rot, patch: (def: ItemDef) => ItemDef, withPets = true): ItemPixels {
  const { def, isPlaceholder } = defOf(itemId)
  return artDef(patch(def), r, undefined, isPlaceholder, withPets)
}
/** 팔레트·무늬 도우미 (생성기가 원래 무늬를 프레임마다 조금씩 바꿔 칠한다) */
export const ART_KIT = { K, S, mix, noise, frac, inRect, C, WHITE, ball, line, leaves }

export interface ItemArt {
  canvas: HTMLCanvasElement
  /** 텍스처 안에서 가구 로컬 (0,0) 칸 꼭짓점(바닥 높이)의 화면 px 위치 */
  anchor: { x: number; y: number }
  /** 가구 로컬 칸 기준 상자 (깊이 정렬용) */
  box: ArtBox
  isPlaceholder: boolean
}

/** 품목 한 방향 그림 (화면 캔버스) */
export function drawItem(itemId: string, r: Rot, role?: 'seat' | 'back', withPets = true): ItemArt {
  const a = artItem(itemId, r, role, withPets)
  return { canvas: toCanvas(a.cv), anchor: { x: a.o[0] * PIXEL, y: a.o[1] * PIXEL }, box: a.box, isPlaceholder: a.isPlaceholder }
}

// ── 반려동물 (가구와 따로 움직이는 작은 캐릭터) ──────────────────
export type PetKind = 'cat' | 'dog'
export type PetPose = 'rest0' | 'rest1' | 'walk0' | 'walk1'
/** 동물이 사는 가구 → 동물 종류와 집 위에서 발이 닿는 높이(아트 px) */
export const PET_HOMES: Record<string, { kind: PetKind; z: number }> = { 'cat-tower': { kind: 'cat', z: 30 }, 'dog-bed': { kind: 'dog', z: 4 } }
const PET_CAT = { body: K.orange, stripe: '#d86a36', belly: '#f6c9a4' }
const PET_DOG = { body: '#e8c79a', ear: '#a77d52', belly: '#f3e6d2' }

/** 동물 한 장 (왼쪽 아래를 보는 옆모습, 오른쪽은 가로 뒤집기). 발은 맨 아래에서 한 칸 위. 쉴 때는 몸·꼬리가 살짝, 걸을 때는 다리가 번갈아 */
export function drawPet(kind: PetKind, pose: PetPose): { canvas: HTMLCanvasElement } {
  const cv = new Cv(20, 16)
  const walk = pose.startsWith('walk')
  const f = pose.endsWith('1') ? 1 : 0
  const rect = (x: number, y: number, w: number, h: number, c: Color) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cv.set(x + i, y + j, C(c))
  }
  const dark = C(K.dark)
  if (kind === 'cat') {
    const c = PET_CAT
    const up = walk ? 0 : f // 숨쉬기: 등이 한 칸 올라온다
    rect(5, 6 - up, 10, 5 + up, c.body)
    rect(7, 6 - up, 1, 2, c.stripe)
    rect(10, 6 - up, 1, 2, c.stripe)
    rect(1, 4, 5, 5, c.body)
    rect(1, 2, 1, 2, c.body)
    rect(4, 2, 1, 2, c.body)
    cv.set(2, 6, dark)
    cv.set(1, 7, C(c.belly))
    // 꼬리: 쉬면 말아 올리고 걸으면 위로 세운다
    rect(15, walk ? 3 : 7, 1, walk ? 5 : 3, c.body)
    cv.set(walk ? 16 : 15, walk ? 2 : 9, C(c.body))
    if (walk) {
      rect(f ? 6 : 5, 11, 1, 2, c.body)
      rect(f ? 8 : 9, 11, 1, 2, c.body)
      rect(f ? 12 : 11, 11, 1, 2, c.body)
      rect(f ? 14 : 13, 11, 1, 2, c.body)
    } else {
      rect(3, 9, 2, 2, c.body)
      rect(6, 11, 6, 2, c.body)
    }
  } else {
    const c = PET_DOG
    rect(5, 6, 10, 5, c.body)
    rect(1, 4, 6, 5, c.body)
    rect(1, 3, 2, 3, c.ear)
    rect(5, 3, 1, 4, c.ear)
    cv.set(2, 6, dark)
    cv.set(1, 7, dark)
    rect(2, 8, 4, 1, c.belly)
    // 꼬리: 쉴 때 흔든다 (위·아래), 걸을 때는 위로 세운다
    rect(15, walk ? 4 : f ? 4 : 6, 2, 2, c.body)
    if (walk) {
      rect(f ? 6 : 5, 11, 1, 2, c.body)
      rect(f ? 8 : 9, 11, 1, 2, c.body)
      rect(f ? 12 : 11, 11, 1, 2, c.body)
      rect(f ? 14 : 13, 11, 1, 2, c.body)
    } else {
      rect(3, 9, 2, 2, c.body)
      rect(6, 11, 7, 2, c.body)
    }
  }
  outline(cv)
  return { canvas: toCanvas(cv) }
}

/** 상점 카드·서랍 미리보기: 빈 여백을 잘라 낸 r0 그림 (픽셀) */
export function artThumb(itemId: string, r: Rot = 0) {
  const { cv } = artItem(itemId, r)
  let x0 = cv.w
  let y0 = cv.h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < cv.w; x++)
      if (cv.px[(y * cv.w + x) * 4 + 3] === 255) {
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x)
        y1 = Math.max(y1, y)
      }
  if (x1 < 0) return cv
  const out = new Cv(x1 - x0 + 1, y1 - y0 + 1)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (cv.has(y * cv.w + x)) out.write((y - y0) * out.w + (x - x0), cv.read(y * cv.w + x))
  return out
}
/** 미리보기 캔버스 — 키 `thumb-{itemId}`. scale은 화면 배율(기본 PIXEL) */
export const drawThumb = (itemId: string, scale = PIXEL) => toCanvas(artThumb(itemId), scale)

// ── 회의실 고정 칸: 바닥 + 유리 칸막이 (직원이 안팎을 드나들어 조각마다 따로 깊이 정렬) ──
export interface MeetingPiece extends ItemPixels {
  kind: 'floor' | 'wall'
}
/**
 * 회의실 w×d칸 (회의실 왼쪽 뒤 칸이 로컬 (0,0), 문은 앞줄의 doorX번째 칸 — place.ts fixedTilesFor와 같다).
 * 뒤쪽 두 면은 방 벽이라 그리지 않고, 왼쪽(x=0)·앞쪽(y=d, 문 칸은 비움)·오른쪽(x=w) 칸막이를 조각으로 준다
 */
export function artMeetingRoom(w: number, d: number, doorX: number, floor: FloorMat | null = null): MeetingPiece[] {
  const glass: Color = [168, 220, 242, 150]
  const glassHi: Color = [230, 247, 255, 190]
  const pane = (q: Q): Fill => (q.v > 0.92 || q.v < 0.12 || frac(q.u * (q.face === 'S' ? 4 : 3)) < 0.04 ? K.metalL : frac((q.u * 3 + q.v) * 1.3) < 0.1 ? glassHi : glass)
  const piece = (kind: MeetingPiece['kind'], bx: Box & { flat?: boolean }): MeetingPiece => {
    const W = Math.max(1, Math.ceil(bx.x + bx.w))
    const D = Math.max(1, Math.ceil(bx.y + bx.d))
    const H = bx.z + bx.h
    const pad = 3
    const cv = new Cv((W + D) * HW + pad * 2, (W + D) * HH + H + pad * 2)
    const o: Pt = [D * HW + pad, H + pad]
    drawBox(cv, o, bx)
    outline(cv)
    return { kind, cv, o, box: { x: bx.x, y: bx.y, w: bx.w, d: bx.d, z: bx.z, h: bx.h }, w: W, d: D, isPlaceholder: false }
  }
  const t = 0.06
  const H = 22
  const out: MeetingPiece[] = [
    // 바닥: 산 바닥재를 골랐으면 그 재질(테두리 선은 그대로), 아니면 기본 연파랑 카펫
    piece('floor', { x: 0, y: 0, w, d, z: 0, h: 0, top: (q) => (q.u * w < 0.06 || q.v * d > d - 0.06 ? '#8a9cc8' : floor ? FLOORS[floor].paint(q) : (Math.floor(q.gx * 2) + Math.floor(q.gy * 2)) % 2 ? '#b8c6e6' : '#c3cfec'), S: null, E: null }),
    piece('wall', { x: 0, y: 0, w: t, d, z: 0, h: H, top: K.metalL, S: K.metalL, E: pane }),
    piece('wall', { x: w - t, y: 0, w: t, d, z: 0, h: H, top: K.metalL, S: K.metalL, E: pane }),
  ]
  if (doorX > 0) out.push(piece('wall', { x: 0, y: d - t, w: doorX, d: t, z: 0, h: H, top: K.metalL, S: pane, E: K.metalL }))
  if (doorX + 1 < w) out.push(piece('wall', { x: doorX + 1, y: d - t, w: w - doorX - 1, d: t, z: 0, h: H, top: K.metalL, S: pane, E: K.metalL }))
  // 문틀 위 가로대
  out.push(piece('wall', { x: doorX, y: d - t, w: 1, d: t, z: H - 3, h: 3, top: K.metalL, S: K.metal, E: K.metal }))
  return out
}

// ── 회의실 기본 테이블 6단계 (office-iso-spaces.md 2-3절 · 김기획 1-5절): 고정 조각이라 돌리지 않는다 ──
// 텍스처 키: 원탁 `meet-round` · 긴 테이블 `meet-long-{재질}-{길이}` · 단상 `meet-podium` · 강당 좌석 줄 `meet-hall-{석}-{seat|back}`
export type MeetingTableKind = 'folding' | 'pine' | 'oak' | 'walnut' | 'board'
/** 단계별 의자 (있는 품목 그림). 강당은 좌석 줄(artHallRow)이라 없다 */
export const MEETING_CHAIR: Record<MeetingTableKind, string> = { folding: 'lv-folding-chair', pine: 'chair-wood', oak: 'chair', walnut: 'chair-mesh', board: 'chair-leather' }
const MEETING_CHAIR_IDS: ReadonlySet<string> = new Set(Object.values(MEETING_CHAIR))
/** 좌석·등받이 두 장으로 나눠 그릴 의자 — 앉은 직원을 그 사이에 끼운다. 회의실 의자(가죽·메쉬·원목)는 가구 표의 의자가 아니어도 나눈다 */
export const isSplitChair = (itemId: string) => specOf(itemId).kind === 'chair' || MEETING_CHAIR_IDS.has(itemId) || defOf(itemId).def.parts.some((p) => p.role === 'back')
/** 등받이가 카메라 쪽(동·남)을 향하는 방향 — 앉은 직원이 등받이 뒤에 그려진다 */
export const isCameraBack = (r: Rot) => r === 1 || r === 2
/** 카메라 쪽 회의 의자의 등받이 윗면 높이 (아트 px) — 등지고 앉은 직원의 어깨(≈15)부터 보이게 */
export const MEETING_LOW_BACK_TOP = 15
/** 회의실 의자 한 장 — 등받이가 카메라 쪽이면 등받이를 낮춰 앉은 직원의 머리·어깨가 보이게 한다. 일반 의자 그림은 그대로 */
export function artMeetingChair(itemId: string, r: Rot, role: 'seat' | 'back'): ItemPixels {
  if (!isCameraBack(r)) return artItem(itemId, r, role)
  const lower = (p: Part): Part => (p.role === 'back' ? { ...p, h: Math.max(1, Math.min(p.h, MEETING_LOW_BACK_TOP - p.z)) } : p)
  return artItemPatched(itemId, r, (def) => ({ ...def, parts: def.parts.map(lower).filter((p) => (p.role ?? 'seat') === role) }))
}
const tableCup = (x: number, y: number, z: number, c: string = K.paper) => b(x, y, 0.12, 0.12, z, 3, c)
const tablePaper = (x: number, y: number, z: number) => b(x, y, 0.3, 0.22, z, 0, K.paper)
const tableLaptop = (x: number, y: number, z: number) => [b(x, y, 0.34, 0.24, z, 1, '#c8ccd6'), b(x, y, 0.34, 0.04, z + 1, 7, '#c8ccd6')]
/** 판 이음매 (긴 쪽을 따라 n줄) · 진한 테두리 */
const plank = (base: string, line: string, n = 3) => (q: Q) => (frac(q.v * n) < 0.08 ? line : base)
const banded = (base: string, band: string, L: number) => (q: Q) => (q.u * L < 0.08 || q.u * L > L - 0.08 || q.v < 0.1 || q.v > 0.9 ? band : base)

/** 접이식 원탁 2×2 (Lv.1~2): 흰 상판 + 가운데 다리 하나 */
const ROUND_TABLE: ItemDef = {
  name: '접이식 원탁',
  W: 2,
  D: 2,
  parts: [
    b(0.62, 0.95, 0.76, 0.1, 0, 1, K.metalL),
    b(0.95, 0.62, 0.1, 0.76, 0, 1, K.metalL),
    b(0.94, 0.94, 0.12, 0.12, 1, 10, K.metalL),
    b(0.06, 0.06, 1.88, 1.88, 11, 0, '#b9bec9', { top: disc('#b9bec9') }),
    b(0.06, 0.06, 1.88, 1.88, 12, 0, '#f2f3f6', { top: (q) => (Math.hypot(q.u - 0.5, q.v - 0.5) > 0.49 ? null : '#f2f3f6') }),
    tableCup(0.6, 0.5, 12),
    tableCup(1.3, 1.2, 12, K.orange),
    tablePaper(1.1, 0.5, 12),
  ],
}

/** 긴 테이블 L×1 (원목 4 · 오크 5 · 월넛 6 · 보드룸 7) — 재질·다리·소품만 다르다 */
function longTableDef(L: number, kind: Exclude<MeetingTableKind, 'folding'>): ItemDef {
  const ebony = '#6e4630'
  const T = {
    pine: { top: plank(K.woodL, '#d8b383'), side: K.wood, leg: K.wood, name: '원목 회의 테이블' },
    oak: { top: banded('#d9b285', '#c79c6c', L), side: '#c79c6c', leg: '#b88c5e', name: '오크 회의 테이블' },
    walnut: { top: banded(K.walnutT, K.walnut, L), side: K.walnut, leg: K.metal, name: '월넛 회의 테이블' },
    board: { top: (q: Q) => (Math.abs(q.v - 0.5) < 0.12 && q.u * L > 0.5 && q.u * L < L - 0.5 ? K.dark : banded('#7a4e34', ebony, L)(q)), side: ebony, leg: ebony, name: '보드룸 테이블' },
  }[kind]
  const isBoard = kind === 'board'
  const topH = isBoard ? 3 : 2
  const z = 12 + topH
  const base =
    isBoard
      ? [b(0.8, 0.3, 1.2, 0.4, 0, 12, T.side), b(L - 2, 0.3, 1.2, 0.4, 0, 12, T.side)]
      : kind === 'walnut'
        ? [b(0.3, 0.12, 0.08, 0.76, 0, 12, T.leg), b(L - 0.38, 0.12, 0.08, 0.76, 0, 12, T.leg), b(0.3, 0.46, L - 0.6, 0.08, 1, 1, T.leg)]
        : legs(0.1, 0.14, L - 0.1, 0.86, 0.1, 12, T.leg)
  const extras: Part[] = []
  for (let i = 0; i < L; i++) {
    if (isBoard) extras.push(b(i + 0.42, 0.44, 0.16, 0.12, z, 1, K.metal)) // 마이크
    if (i % 2 === 0) extras.push(...(kind === 'pine' || kind === 'oak' ? [tablePaper(i + 0.3, 0.12, z)] : tableLaptop(i + 0.32, 0.1, z)))
    if (i % 3 === 1) extras.push(tableCup(i + 0.5, 0.72, z, i % 2 ? K.orange : K.paper))
  }
  if (isBoard) extras.push(b(L / 2 - 0.3, 0.3, 0.6, 0.4, z, 2, K.dark), b(L / 2 - 0.12, 0.42, 0.24, 0.16, z + 2, 1, K.green)) // 스피커폰
  return { name: T.name, W: L, D: 1, parts: [...base, b(0.02, 0.06, L - 0.04, 0.88, 12, topH, T.side, { top: T.top }), ...extras] }
}

/** 회의실 기본 테이블 (접이식은 원탁 2×2, 나머지는 len×1) */
export function artMeetingTable(kind: MeetingTableKind, len: number): ItemPixels {
  return artDef(kind === 'folding' ? ROUND_TABLE : longTableDef(len, kind), 0)
}
export const meetingTableKey = (kind: MeetingTableKind, len: number) => (kind === 'folding' ? 'meet-round' : `meet-long-${kind}-${len}`)

/** 강당 단상 5×1 + 뒤 벽 스크린 + 오른쪽 연단 (Lv.16~20). 발언하는 직원은 연단 앞 칸(로컬 x 4)에 선다 */
const PODIUM: ItemDef = {
  name: '강당 단상',
  W: 5,
  D: 1,
  parts: [
    b(0, 0, 5, 1, 0, 6, K.walnutT, { top: (q) => (frac(q.u * 10) < 0.05 ? K.woodD : K.wood) }),
    b(0.5, 0.02, 4, 0.05, 18, 26, '#ffffff', {
      S: (q) => (q.u < 0.02 || q.u > 0.98 || q.v < 0.04 || q.v > 0.96 ? K.dark : q.v > 0.35 && q.v < 0.75 && q.u > 0.15 && q.u < 0.6 ? K.screen : q.v > 0.5 && q.u > 0.68 && q.u < 0.86 ? K.orange : '#eef6fb'),
    }),
    b(3.6, 0.3, 0.56, 0.44, 6, 17, K.walnutT, { top: K.woodL, S: (q) => (Math.abs(q.u - 0.5) < 0.2 && q.v > 0.6 && q.v < 0.8 ? K.gold : K.walnutT) }),
    b(3.86, 0.44, 0.05, 0.05, 23, 6, K.metal),
  ],
}
export const artPodium = () => artDef(PODIUM, 0)
export const PODIUM_KEY = 'meet-podium'
/** 연단 앞에 선 발언자의 단상 로컬 칸 (G5 A) */
export const PODIUM_SPEAKER = { gx: 4, gy: 0 }

/** 강당 좌석 한 줄 n석 — 단상(뒤쪽, −y)을 본다. 좌석·등받이 두 장 사이에 앉은 청중을 끼운다 (의자와 같은 방식) */
function hallRowDef(n: number): ItemDef {
  const parts: Part[] = []
  for (let i = 0; i < n; i++) parts.push(b(i + 0.14, 0.14, 0.72, 0.54, 0, 8, K.metal), b(i + 0.14, 0.12, 0.72, 0.56, 8, 3, '#d0605a'), b(i + 0.14, 0.68, 0.72, 0.18, 8, 15, '#d0605a', { role: 'back' }))
  for (let i = 0; i <= n; i++) parts.push(b(Math.min(i, n - 0.08), 0.16, 0.08, 0.66, 0, 13, K.metal))
  return { name: '강당 좌석 줄', W: n, D: 1, parts, sitZ: 9 }
}
export const artHallRow = (role: 'seat' | 'back', n = 5) => artDef(hallRowDef(n), 0, role)
export const hallRowKey = (role: 'seat' | 'back', n = 5) => `meet-hall-${n}-${role}`
/** 강당 좌석에 앉은 직원 높이 (아트 px) */
export const HALL_SIT_Z = 9

// ── 데모데이 발표장 (docs/specs/demo-stage-art.md · 이디자): 사무실 맵과 따로 그리는 무대 화면 ──
// 칸 좌표는 발표장 로컬(왼쪽 뒤 칸 = (0,0)). 텍스처 키: 배경 `stage-hall` · 조각 `stage-{key}` · 조명 `stage-spot`
//   이펙트 `stage-fx-{trophy|clap0|clap1|heart|star|crown}` · 전환 막 `stage-curtain-{w}x{h}` · 객석은 강당 좌석 줄 `meet-hall-6-{seat|back}`
/** 발표장 배치 (칸). 무대는 뒤쪽 3줄, 객석은 6석 × 3줄, 양옆 통로 */
export const STAGE = {
  cols: 10,
  rows: 8,
  /** 벽 높이 (아트 px) — 사무실 벽(48)보다 높여 강당 느낌을 낸다. 벽에 붙인 16:10 스크린이 크게 들어가도록 88 */
  wallH: 88,
  platform: { x: 1, y: 0, w: 8, d: 3, h: 8 },
  /** 연단 오른쪽 발표자 자리(몸 전체가 보인다) · 다음 차례 대기 자리 (무대 위 z = 8) */
  speaker: { gx: 7.0, gy: 1.35 },
  waiting: { gx: 2.4, gy: 2.3 },
  /** 왼쪽 통로 → 무대로 오르는 길 (아래 칸부터) */
  stairs: [
    { gx: 1.7, gy: 3.9, z: 0 },
    { gx: 1.7, gy: 3.52, z: 3 },
    { gx: 1.7, gy: 3.17, z: 6 },
    { gx: 1.7, gy: 2.6, z: 8 },
  ],
  seatRows: [4, 5, 6],
  seatX: 2,
  seatsPerRow: 6,
  /** 객석(18석)이 차면 맨 뒤에 서서 본다 */
  standY: 7.4,
} as const

/** 발표장 색 — 저녁 강당: 남색 벽·보라 카펫·붉은 막 (A 파스텔 K를 그대로 섞는다) */
export const STAGE_COLORS = {
  wall: '#3a4a6a',
  wallD: '#33415e',
  wallLine: '#2c3752',
  cap: '#4a5a7c',
  carpet: '#4f5d82',
  carpetL: '#566590',
  runner: '#d0605a',
  runnerD: '#b54e49',
  curtain: '#c4484a',
  curtainD: '#9a3438',
  curtainL: '#de6a66',
  skirt: '#2e3448',
  screenOff: '#26304a',
  sconce: '#ffe6a6',
  beam: '#fff3c8',
  gold: '#f2c94c',
  goldL: '#fbe49a',
  goldD: '#c79a2e',
  skin: '#f6c9a4',
  skinD: '#e0a77f',
  /** 객석을 어둡게 덮는 막 (장면이 알파 0.35로 깐다) */
  dim: '#1c2238',
} as const
/** 박수·MVP 때 흩날리는 종이 꽃가루 색 (장면이 2×1 · 1×2 아트 px 사각형으로 뿌린다) */
export const STAGE_CONFETTI = [K.orange, K.yellow, K.mint, K.pink, K.sky, K.purple] as const

const stageOrigin = (): Pt => [STAGE.rows * HW + WALL_T * HW + 4, STAGE.wallH + 4 + 2]
/**
 * 대형 스크린: 뒷벽(y=0 면)에 붙인 화면 (테두리 안쪽). x는 칸, z는 아트 px.
 * 벽을 따라 잰 가로 길이 : 높이 = 16:10 — 슬라이드 카드도 이 변 길이 비로 잡힌다.
 * 아래는 연단 뒤 끝(z 8) 바로 위, 위는 막 장식 아래까지. 가운데는 연단 가운데(x 5)
 */
const SCREEN_Z = [12, 74] as const
const SCREEN_W = ((SCREEN_Z[1] - SCREEN_Z[0]) * 16) / 10 / Math.hypot(HW, HH)
const SCREEN = { x0: 5 - SCREEN_W / 2, x1: 5 + SCREEN_W / 2, z0: SCREEN_Z[0], z1: SCREEN_Z[1], y: 0.1 }
/** 테두리 두께 (아트 px): 바깥 검정 1 + 금속 1 + 안쪽 검정 1 */
const SCREEN_FRAME = 3

/** 발표장 배경 한 장: 뒤·왼쪽 벽(벽등·몰딩) + 카펫 바닥(양옆 통로 러너) + 막 장식 + 대형 스크린(꺼진 화면). 직원·조각은 이 위에 */
export function artStageHall(): { cv: Cv; o: Pt } {
  const { cols, rows, wallH: H } = STAGE
  const C2 = STAGE_COLORS
  const pad = 4
  const cv = new Cv((cols + rows) * HW + WALL_T * 2 * HW + pad * 2, (cols + rows) * HH + H + SLAB + pad * 2 + 4)
  const o = stageOrigin()
  const wall = (q: Q): Fill => {
    const along = q.face === 'S' ? q.gx : q.gy
    if (q.z > H - 4) return C2.cap
    if (q.z < 12) return frac(along) < 0.05 ? C2.wallLine : C2.wallD // 아래 판벽
    if (q.z < 13) return K.gold // 판벽 위 금색 띠
    // 벽등: 두 칸마다 (칸 1·3·5…) 따뜻한 점 + 둘레 은은한 빛
    const s = Math.abs(frac(along / 2) - 0.5)
    const dz = Math.abs(q.z - 40)
    if (s < 0.03 && dz < 1.5) return C2.sconce
    if (s < 0.1 && dz < 5) return mix(C2.wall, C2.sconce, 0.22)
    return frac(along) < 0.03 ? C2.wallLine : C2.wall
  }
  drawBox(cv, o, { x: -WALL_T, y: -WALL_T, w: WALL_T, d: WALL_T, z: -SLAB, h: H + SLAB, top: C2.cap, S: C2.wallD, E: C2.wallD })
  drawBox(cv, o, { x: 0, y: -WALL_T, w: cols, d: WALL_T, z: -SLAB, h: H + SLAB, top: C2.cap, S: wall, E: C2.wallD })
  drawBox(cv, o, { x: -WALL_T, y: 0, w: WALL_T, d: rows, z: -SLAB, h: H + SLAB, top: C2.cap, S: C2.wallD, E: wall })
  const runner = (gx: number) => (gx >= 1 && gx < 2) || (gx >= 8 && gx < 9)
  drawBox(cv, o, {
    x: 0,
    y: 0,
    w: cols,
    d: rows,
    z: -SLAB,
    h: SLAB,
    noHi: true,
    top: (q) => (q.gy > 3 && runner(q.gx) ? (frac(q.gx) < 0.08 || frac(q.gx) > 0.92 ? C2.runnerD : C2.runner) : (Math.floor(q.gx * 2) + Math.floor(q.gy * 2)) % 2 ? C2.carpetL : C2.carpet),
    S: mix(C2.wall, S.sh, 0.2),
    E: mix(C2.wall, S.sh, 0.2),
  })
  // 스크린 위 막 장식 (아래 가장자리 금 술)
  drawBox(cv, o, { x: 1, y: 0, w: 8, d: 0.12, z: H - 10, h: 9, top: C2.curtainD, E: C2.curtainD, S: (q) => (q.v < 0.18 ? (frac(q.u * 40) < 0.5 ? K.gold : null) : frac(q.u * 16) < 0.25 ? C2.curtainD : C2.curtain) })
  // 대형 스크린: 벽에 붙은 얇은 판 — 두 겹 테두리(검정·금속·검정) + 꺼진 화면 (슬라이드는 장면이 stageScreenQuad 자리를 뚫고 뒤에 깐다)
  const { x0, x1, z0, z1, y } = SCREEN
  const F = SCREEN_FRAME
  drawBox(cv, o, {
    x: x0 - F / HW,
    y: 0,
    w: x1 - x0 + (2 * F) / HW,
    d: y,
    z: z0 - F,
    h: z1 - z0 + 2 * F,
    top: K.dark,
    E: K.dark,
    S: (q) => {
      // 화면 안쪽 가장자리까지 거리 (px, 음수 = 테두리)
      const d = Math.min((q.gx - x0) * HW, (x1 - q.gx) * HW, q.z - z0, z1 - q.z)
      return d >= 0 ? C2.screenOff : d >= -1 ? K.dark : d >= -2 ? K.metalL : K.dark
    },
  })
  outline(cv)
  return { cv, o }
}

/** 스크린 화면(테두리 안) 네 꼭짓점 — artStageHall 텍스처 안 아트 px, [왼위, 오위, 오아래, 왼아래]. 벽을 따라 가로 변은 오른쪽으로 갈수록 내려간다 */
export function stageScreenQuad(): [number, number][] {
  const o = stageOrigin()
  const { x0, x1, z0, z1, y } = SCREEN
  return [P(o, x0, y, z1), P(o, x1, y, z1), P(o, x1, y, z0), P(o, x0, y, z0)]
}

/** 발표장 조각: 직원과 깊이 정렬해 그린다. at = 조각 로컬 (0,0)이 놓이는 발표장 칸 (box는 조각 로컬) */
export interface StagePiece extends ItemPixels {
  key: 'platform' | 'curtainL' | 'curtainR' | 'lectern'
  at: { gx: number; gy: number }
}

function stagePiece(key: StagePiece['key'], at: StagePiece['at'], parts: Part[], flat = false): StagePiece {
  const W = Math.max(1, Math.ceil(Math.max(...parts.map((p) => p.x + p.w)) - 1e-6))
  const D = Math.max(1, Math.ceil(Math.max(...parts.map((p) => p.y + p.d)) - 1e-6))
  return { ...artDef({ name: key, W, D, parts, flat }, 0), key, at }
}

/** 막 주름: 세로 줄무늬 명암 + 아래 금 단 */
const curtainFolds = (n: number) => (q: Q): Fill => {
  if (q.v < 0.04) return K.gold
  const f = frac(q.u * n)
  return f < 0.18 ? STAGE_COLORS.curtainD : f < 0.42 ? STAGE_COLORS.curtain : f < 0.58 ? STAGE_COLORS.curtainL : STAGE_COLORS.curtain
}

/** 무대 8×3(높이 8, 앞단 주황 띠·바닥 조명·왼쪽 계단) · 뒤 양옆 붉은 막 · 연단(금 명판·마이크) */
export function artStagePieces(): StagePiece[] {
  const C2 = STAGE_COLORS
  const { w, d, h } = STAGE.platform
  const skirt = (n: number) => (q: Q): Fill => (q.v > 0.78 ? K.orange : frac(q.u * n) < 0.06 ? mix(C2.skirt, S.sh, 0.4) : C2.skirt)
  const boards = (q: Q): Fill => {
    if (q.gy > d - 0.06) return K.orange
    if (frac(q.gy * 3) < 0.06) return K.woodD
    return frac(q.gx / 2 + Math.floor(q.gy * 3) * 0.37) < 0.02 ? K.woodD : K.wood
  }
  const lamps: Part[] = []
  for (let x = 1.6; x < w - 0.2; x += 0.9) lamps.push(b(x, d - 0.18, 0.16, 0.12, h, 2, K.dark, { top: K.yellow, S: C2.beam }))
  const curtain = [b(0, 0, 0.45, 1, 0, 60, C2.curtain, { top: C2.curtainD, S: curtainFolds(2), E: curtainFolds(5) })]
  return [
    stagePiece('platform', { gx: STAGE.platform.x, gy: STAGE.platform.y }, [
      b(0, 0, w, d, 0, h, C2.skirt, { top: boards, S: skirt(16), E: skirt(6) }),
      // 계단 두 칸 (무대 앞 왼쪽, 통로 쪽)
      b(0.2, d, 1, 0.35, 0, 6, K.wood, { top: K.woodL, S: K.woodD, E: K.woodD }),
      b(0.2, d + 0.35, 1, 0.35, 0, 3, K.wood, { top: K.woodL, S: K.woodD, E: K.woodD }),
      ...lamps,
    ]),
    stagePiece('curtainL', { gx: 1, gy: 0 }, curtain, true),
    stagePiece('curtainR', { gx: 8.55, gy: 0 }, curtain, true),
    stagePiece(
      'lectern',
      { gx: 5.95, gy: 1.5 },
      [
        b(0, 0, 0.7, 0.6, h, 2, K.walnut),
        b(0.05, 0.05, 0.6, 0.5, h + 2, 12, K.walnutT, { top: K.woodL, S: (q) => (Math.abs(q.u - 0.5) < 0.24 && q.v > 0.5 && q.v < 0.78 ? K.gold : q.v > 0.88 ? K.orange : K.walnutT) }),
        b(0.02, 0.02, 0.66, 0.56, h + 14, 2, K.woodL),
        // 마이크는 발표자 쪽(오른쪽)으로
        b(0.56, 0.2, 0.05, 0.05, h + 16, 6, K.metal),
        b(0.54, 0.18, 0.09, 0.09, h + 22, 2, K.dark),
      ],
      true,
    ),
  ]
}

/** 객석 자리 n개 — 가운데부터 채운다 (6석 × 3줄, 넘치면 맨 뒤에 선다). 앉은 직원은 등(back)을 보이고 z = HALL_SIT_Z */
export function stageSeats(n: number): { gx: number; gy: number; z: number; isSeated: boolean }[] {
  const order = [2, 3, 1, 4, 0, 5]
  const cap = STAGE.seatRows.length * STAGE.seatsPerRow
  return Array.from({ length: n }, (_, i) => {
    if (i >= cap) return { gx: 1.6 + ((i - cap) % 7) * 1.1, gy: STAGE.standY + Math.floor((i - cap) / 7) * 0.3, z: 0, isSeated: false }
    return { gx: STAGE.seatX + order[i % 6] + 0.5, gy: STAGE.seatRows[Math.floor(i / 6)] + 0.41, z: HALL_SIT_Z, isSeated: true }
  })
}

/** 무대 조명 한 줄기: 위에서 내려오는 반투명 원뿔 + 바닥 빛 웅덩이. o = 웅덩이 가운데(발 위치). 장면은 ADD 섞기로 얹는다 */
export function artStageSpot(): { cv: Cv; o: Pt } {
  const cv = new Cv(44, 96)
  const [cx, fy] = [22, 86]
  const beam = C(STAGE_COLORS.beam)
  for (let y = 0; y < fy; y++) {
    const half = 4 + (16 * y) / fy
    const a = Math.round(40 + (36 * y) / fy)
    for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half); x++) cv.set(x, y, [beam[0], beam[1], beam[2], Math.abs(x - cx) > half - 1.5 ? a - 16 : a])
  }
  for (let y = -8; y <= 8; y++) for (let x = -20; x <= 20; x++) if ((x * x) / 400 + (y * y) / 64 <= 1) cv.set(cx + x, fy + y, [beam[0], beam[1], beam[2], (x * x) / 400 + (y * y) / 64 < 0.45 ? 110 : 80])
  return { cv, o: [cx, fy] }
}

/** 칸 그림(행 문자열) → 픽셀 + 외곽선 */
function pixmap(rows: string[], col: Record<string, Color>) {
  const cv = new Cv(rows[0].length + 2, rows.length + 2)
  rows.forEach((row, y) => [...row].forEach((k, x) => col[k] && cv.set(x + 1, y + 1, C(col[k]))))
  outline(cv)
  return cv
}

/** MVP 트로피 20×24 — 금 컵(손잡이·별) + 월넛 받침(금 명판). 아래 가운데가 바닥 */
export function artStageTrophy() {
  const { gold, goldL, goldD } = STAGE_COLORS
  const cv = new Cv(20, 24)
  const cx = 9.5
  const row = (y: number, hw: number, c: (x: number, l: number, r: number) => Color) => {
    for (let x = Math.ceil(cx - hw); x <= Math.floor(cx + hw); x++) cv.set(x, y, C(c(x, cx - hw, cx + hw)))
  }
  const tone = (x: number, l: number, r: number) => (x < l + (r - l) * 0.3 ? goldL : x > l + (r - l) * 0.75 ? goldD : gold)
  // 손잡이 고리 (두 겹)
  for (const s of [-1, 1])
    for (const r of [2.6, 2.0])
      for (let i = 0; i <= 30; i++) {
        const t = (i / 30) * Math.PI
        cv.set(cx + s * (5.2 + Math.sin(t) * r), 4.2 + (1 - Math.cos(t)) * 2.4, C(s < 0 ? goldL : goldD))
      }
  for (let y = 2; y <= 11; y++) row(y, 1 + 5.5 * Math.sqrt(Math.max(0, 1 - ((y - 2) / 10) ** 2)), (x, l, r) => (y === 2 ? goldL : x === Math.ceil(l) + 1 && y > 3 && y < 9 ? WHITE : tone(x, l, r)))
  for (const [x, y] of [[0, 5], [-1, 6], [0, 6], [1, 6], [0, 7]]) cv.set(Math.floor(cx) + x, y, C(goldD)) // 컵의 별
  for (let y = 12; y <= 14; y++) row(y, y === 13 ? 1.6 : 0.6, tone)
  for (let y = 15; y <= 16; y++) row(y, 4, tone)
  for (let y = 17; y <= 21; y++) row(y, 5.5, (x) => (y > 17 && y < 21 && Math.abs(x - cx) < 2.6 ? gold : K.walnut))
  outline(cv)
  return cv
}

/** 박수 손 16×14 두 장 (0 = 벌림, 1 = 마주침 + 반짝 선) — 객석 머리 위에서 번갈아 보인다 */
export function artStageClap(frame: 0 | 1) {
  const { skin, skinD } = STAGE_COLORS
  const cv = new Cv(18, 16)
  const hand = (hx: number, tilt: number) => {
    for (let y = -5; y <= 5; y++)
      for (let x = -3; x <= 3; x++) {
        const u = x - tilt * y * 0.35
        if ((u * u) / 7 + (y * y) / 25 <= 1) cv.set(hx + x, 10 + y, C(u * tilt > 1 ? skinD : skin))
      }
  }
  hand(frame ? 7 : 5, 1)
  hand(frame ? 10 : 12, -1)
  outline(cv)
  if (frame) for (const [a, z] of [[[8.5, 0], [8.5, 2]], [[3, 2], [4, 3]], [[14, 2], [13, 3]]] as Pt[][]) line(cv, a, z, K.yellow)
  return cv
}

/** 칭찬 하트 9×8 (한마디) */
export const artStageHeart = () =>
  pixmap(['.pp...pp.', 'pwpp.pppp', 'pwppppppp', 'ppppppppp', '.ppppppp.', '..ppppp..', '...ppp...', '....p....'], { p: K.pink, w: WHITE })

/** 반짝 별 9×9 (박수·MVP 때 떠오른다) */
export const artStageStar = () =>
  pixmap(['....y....', '....y....', '...yyy...', 'yyyywyyyy', '.yyyyyyy.', '..yyyyy..', '..yy.yy..', '.yy...yy.', '.y.....y.'], { y: K.yellow, w: WHITE })

/** MVP 왕관 11×5 — MVP 직원 머리 위에 붙는다 */
export const artStageCrown = () =>
  pixmap(['G....G....G', 'GG..GGG..GG', 'GGGGGGGGGGG', 'GrGGGbGGGrG', 'ggggggggggg'], { G: STAGE_COLORS.gold, g: STAGE_COLORS.goldD, r: K.red, b: K.blue })

/** 장면 전환용 막 한 폭 (평면, w×h 아트 px) — 양쪽에서 닫혔다 열린다. 주름 10px · 아래 금 술 5px */
export function artStageCurtainPanel(w: number, h: number) {
  const { curtain, curtainD, curtainL, goldD } = STAGE_COLORS
  const cv = new Cv(w, h)
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < cv.w; x++) {
      if (y >= cv.h - 5) {
        if (y < cv.h - 2 || x % 2 === 0) cv.set(x, y, C(y === cv.h - 5 ? goldD : K.gold))
        continue
      }
      const t = Math.cos(frac(x / 10) * Math.PI * 2)
      cv.set(x, y, t > 0.55 ? mix(curtain, curtainL, (t - 0.55) * 1.6) : t < -0.4 ? mix(curtain, curtainD, (-t - 0.4) * 1.6) : C(curtain))
    }
  return cv
}

// ── 바닥·벽 재질 (M1~M5, 문서 6절 · 김기획 레벨표 2-2절) ──────
type LevelFloorMat = 'concrete' | 'vinyl' | 'tile' | 'carpet' | 'wood' | 'herring' | 'terrazzo' | 'marble' | 'marbleGold'
type LevelWallMat = 'block' | 'paint' | 'brick' | 'panel' | 'louver' | 'glass' | 'marble'
/** 바닥 재질 = 레벨 기본 9종 + 상점 바닥재 14종(품목 id 그대로) */
export type FloorMat = LevelFloorMat | ShopFloorId
/** 벽 재질 = 레벨 기본 7종 + 상점 벽지 15종(품목 id 그대로) */
export type WallMat = LevelWallMat | ShopWallId
interface FloorDef {
  name: string
  paint: (q: Q) => Color
}
interface WallDef {
  name: string
  base: string
  cap: string
  face: (a: number, z: number) => Color
}
export type { Material }

const marbleVein = (q: Q, grout: string, w: number) => {
  if (frac(q.gx) < w || frac(q.gy) < w) return grout
  const vein = Math.abs(Math.sin(q.gx * 5.2 + q.gy * 2.1 + Math.sin(q.gy * 7) * 0.6))
  return vein < 0.06 ? '#cfc8c4' : n32(q.gx, q.gy) > 0.9 ? '#ebe6e2' : '#f4f1ee'
}
const LEVEL_FLOORS: Record<LevelFloorMat, FloorDef> = {
  concrete: { name: '콘크리트', paint: (q) => (n32(q.gx, q.gy) > 0.93 ? '#bdbab3' : frac(q.gx * 2) < 0.03 || frac(q.gy * 2) < 0.03 ? '#c4c1ba' : '#d6d3cc') },
  vinyl: { name: '장판', paint: (q) => (frac(q.gx * 0.5) < 0.012 ? '#d9c39c' : n32(q.gx, q.gy) > 0.9 ? '#eedcb8' : '#f2e2c0') },
  tile: { name: '타일', paint: (q) => (frac(q.gx) < 0.04 || frac(q.gy) < 0.04 ? '#ddc8a4' : (Math.floor(q.gx) + Math.floor(q.gy)) % 2 ? '#efe0c4' : '#f6ecd6') },
  carpet: {
    name: '카펫 타일',
    paint: (q) => {
      const a = (Math.floor(q.gx * 2) + Math.floor(q.gy * 2)) % 2
      const n = n32(q.gx, q.gy) > 0.8
      return a ? (n ? '#a2b2d4' : '#a9b9da') : n ? '#97a8cd' : '#9fafd3'
    },
  },
  wood: {
    name: '원목 마루',
    paint: (q) => {
      const row = Math.floor(q.gy * 3)
      const off = (row % 3) * 0.37
      if (frac(q.gy * 3) < 0.09 || frac(q.gx * 0.75 + off) < 0.03) return '#bf9768'
      return ['#ecc999', '#e2bb88', '#d6ae7a'][Math.floor(noise(Math.floor(q.gx * 0.75 + off), row) * 3)]
    },
  },
  herring: {
    name: '헤링본 마루',
    paint: (q) => {
      const k = Math.floor(q.gx * 4) + Math.floor(q.gy * 4)
      const t = frac(q.gx * 4 - q.gy * 4 + (k % 2) * 0.5)
      return t < 0.08 ? '#a87c50' : k % 2 ? '#d2a372' : '#c69565'
    },
  },
  terrazzo: {
    name: '테라조',
    paint: (q) => {
      const n = n32(q.gx, q.gy)
      return frac(q.gx * 0.5) < 0.012 || frac(q.gy * 0.5) < 0.012 ? '#d6d0c6' : n > 0.95 ? '#e09a7a' : n > 0.9 ? '#8ab4c8' : n > 0.85 ? '#b8b0a6' : '#ece7df'
    },
  },
  marble: { name: '대리석', paint: (q) => marbleVein(q, '#d8d2cc', 0.025) },
  marbleGold: { name: '대리석 + 금장 줄눈', paint: (q) => marbleVein(q, K.gold, 0.035) },
}

function windowPx(a: number, z: number, w: number, h: number, isCurtain = false) {
  // 창: 틀 → 유리 → 왼쪽 아래에서 오른쪽 위로 비치는 하이라이트 두 줄
  if (!isCurtain && (a < 0.06 || a > w - 0.06 || z < 2 || z > h - 2)) return a > w - 0.06 || z < 2 ? '#d6e2ea' : '#f6fcff'
  if (!isCurtain && Math.abs(a - w / 2) < 0.03) return '#f6fcff'
  // 창 안쪽 그늘(위·왼쪽 틀 밑) → 하늘 위아래 두 단 → 사선 반사
  if (!isCurtain && (z > h - 4 || a < 0.1)) return '#86c4e2'
  const d = frac((a * 16 + z) / 24)
  return d < 0.12 || (d > 0.2 && d < 0.25) ? '#e6f7ff' : z > h * 0.55 ? '#9cd4ee' : '#b4e2f6'
}
/** a = 벽을 따라가는 칸 좌표, z = 높이(아트 px) */
const LEVEL_WALLS: Record<LevelWallMat, WallDef> = {
  block: {
    name: '시멘트 블록',
    base: '#a39a92',
    cap: '#ece6de',
    face: (a, z) => {
      const row = Math.floor(z / 8)
      if (z % 8 < 1 || frac(a + (row % 2) * 0.5) < 0.03) return '#b3aba2'
      return noise(Math.round(a * 32), Math.round(z)) > 0.9 ? '#c5bdb4' : '#d2cbc2'
    },
  },
  paint: { name: '흰 페인트', base: '#c8b49c', cap: '#fffaf2', face: () => '#f6ecdc' },
  brick: {
    name: '벽돌',
    base: '#b98a78',
    cap: '#fbe9df',
    face: (a, z) => {
      const row = Math.floor(z / 5)
      if (z % 5 < 1 || frac(a * 2 + (row % 2) * 0.5) < 0.08) return '#fbe9df'
      return ['#f2c6b2', '#ecbaa6'][Math.floor(noise(Math.floor(a * 2 + (row % 2) * 0.5), row) * 2)]
    },
  },
  panel: { name: '목재 패널', base: '#7a5634', cap: '#f3e6d4', face: (a, z) => (frac(a * 3) < 0.06 ? '#a77d52' : z > 40 ? '#c79c6c' : '#d9b285') },
  louver: { name: '루버', base: '#6a4a30', cap: '#f3e6d4', face: (a) => (frac(a * 8) < 0.35 ? '#b88c5e' : frac(a * 8) < 0.45 ? '#9a7048' : '#d9b285') },
  glass: { name: '통유리', base: '#8a96a8', cap: '#eef2f6', face: (a, z) => (frac(a) < 0.05 || z > WALL_H - 3 ? '#8a96a8' : windowPx(frac(a), z, 1, WALL_H, true)) },
  marble: { name: '대리석 패널', base: '#9a8f86', cap: K.gold, face: (a, z) => (frac(a * 1.5) < 0.03 ? '#b0a8a0' : z > 42 && z < 44 ? K.gold : Math.abs(Math.sin(a * 6 + z * 0.15)) < 0.05 ? '#d2cbc6' : '#ece7e2') },
}

// ── 상점 바닥재 14 · 벽지 15 (economy.ts 품목 id 그대로) — 산 것을 고르면 레벨 기본 재질 위에 덮는다 (대표님 결정 2026-10-24) ──
/** 2×2 순서 디더 — 그라데이션을 픽셀아트 띠로 (노을·은하수) */
const BAYER = [0.125, 0.625, 0.875, 0.375]
const ramp = (a: number, z: number, t: number, colors: readonly string[]) => {
  const x = Math.max(0, Math.min(0.999, t)) * (colors.length - 1)
  const i = Math.floor(x)
  return colors[Math.min(colors.length - 1, i + (x - i > BAYER[(Math.floor(a * 16) & 1) + (Math.floor(z) & 1) * 2] ? 1 : 0))]
}
/** 육각 칸 (뾰족한 위, 한 변 s칸): 칸 번호와 가장자리까지 (1 = 경계) */
const hexCell = (x: number, y: number, s: number) => {
  const q = ((Math.sqrt(3) / 3) * x - y / 3) / s
  const r = ((2 / 3) * y) / s
  const c = -q - r
  let [rq, rr, rc] = [Math.round(q), Math.round(r), Math.round(c)]
  const [dq, dr, dc] = [Math.abs(rq - q), Math.abs(rr - r), Math.abs(rc - c)]
  if (dq > dr && dq > dc) rq = -rr - rc
  else if (dr > dc) rr = -rq - rc
  else rc = -rq - rr
  const [fq, fr, fc] = [q - rq, r - rr, c - rc]
  return { q: rq, r: rr, e: Math.max(Math.abs(fq - fr), Math.abs(fr - fc), Math.abs(fc - fq)) }
}

const SHOP_FLOORS = {
  'floor-vinyl': { name: '베이지 장판', paint: (q) => (frac(q.gy * 0.5) < 0.015 ? '#d2bc94' : n32(q.gx, q.gy) > 0.94 ? '#e2cfa8' : frac(q.gx * 1.5 + q.gy * 0.3) < 0.05 ? '#e6d4b0' : '#ecdcbc') },
  'floor-cork': {
    name: '코르크',
    paint: (q) => {
      if (frac(q.gx) < 0.03 || frac(q.gy) < 0.03) return '#a87a4c'
      const n = n32(q.gx, q.gy)
      return n > 0.8 ? '#b8875a' : n > 0.55 ? '#d6aa78' : n > 0.3 ? '#cc9e6c' : '#c69460'
    },
  },
  'floor-checker': { name: '체크 타일', paint: (q) => (frac(q.gx) < 0.03 || frac(q.gy) < 0.03 ? '#9a9cac' : (Math.floor(q.gx) + Math.floor(q.gy)) % 2 ? '#4a4f66' : '#f4f2ee') },
  'floor-bluecarpet': {
    name: '블루 카펫',
    paint: (q) => {
      const n = n32(q.gx, q.gy)
      return n > 0.85 ? '#6a7cb8' : n < 0.15 ? '#4f62a0' : '#5b6eac'
    },
  },
  'floor-terrazzo': {
    name: '테라조',
    paint: (q) => {
      // 돌 조각을 큼직하게 (레벨 테라조보다 알록달록)
      const n = noise(Math.floor(q.gx * 12), Math.floor(q.gy * 12))
      return n > 0.93 ? '#e8835a' : n > 0.86 ? '#5ab4e8' : n > 0.8 ? '#f0c84a' : n > 0.75 ? '#7cbc8a' : n32(q.gx, q.gy) > 0.92 ? '#d8d0c4' : '#f1ebe2'
    },
  },
  'floor-carpet': {
    name: '그레이 카펫',
    paint: (q) => {
      if (frac(q.gx * 2) < 0.03 || frac(q.gy * 2) < 0.03) return '#8e93a2'
      // 반 칸 타일마다 결 방향을 엇갈린다
      const a = (Math.floor(q.gx * 2) + Math.floor(q.gy * 2)) % 2
      const t = frac((a ? q.gx : q.gy) * 16) < 0.5
      return a ? (t ? '#b0b4c0' : '#a8acb9') : t ? '#a3a8b6' : '#9ca1b0'
    },
  },
  'floor-hex': {
    name: '육각 타일',
    paint: (q) => {
      const h = hexCell(q.gx, q.gy, 0.32)
      return h.e > 0.86 ? '#b4b6c4' : ['#e2e3ea', '#d8d9e2', '#ecedf2'][Math.floor(noise(h.q, h.r) * 3)]
    },
  },
  'floor-grass': {
    name: '인조 잔디',
    paint: (q) => {
      const n = n32(q.gx, q.gy)
      return n > 0.9 ? '#a5cf78' : n < 0.12 ? '#4a8a4c' : Math.floor(q.gx) % 2 ? '#78aa5c' : '#82b464'
    },
  },
  'floor-parquet': {
    name: '헤링본 원목',
    paint: (q) => {
      const k = Math.floor(q.gx * 3) + Math.floor(q.gy * 3)
      const s = q.gx * 3 - q.gy * 3 + (k % 2) * 0.5
      if (frac(s) < 0.07) return '#b07e4a'
      const tone = noise(k, Math.floor(s))
      return tone > 0.66 ? '#e8bc84' : tone > 0.33 ? '#deb078' : '#d4a46c'
    },
  },
  'floor-marble': {
    name: '대리석',
    paint: (q) => {
      // 2×2칸 큰 판 · 푸른빛 흰 대리석 · 사선 결
      if (frac(q.gx * 0.5) < 0.012 || frac(q.gy * 0.5) < 0.012) return '#d4d2da'
      const v = Math.abs(Math.sin(q.gx * 2.3 - q.gy * 3.1 + Math.sin(q.gx * 4.7) * 0.8))
      return v < 0.05 ? '#bfc0cc' : v < 0.1 ? '#dcdde4' : n32(q.gx, q.gy) > 0.93 ? '#ffffff' : '#f2f2f6'
    },
  },
  'floor-gold': {
    name: '금박 타일',
    paint: (q) => {
      if (frac(q.gx) < 0.035 || frac(q.gy) < 0.035) return '#b8903a'
      if (n32(q.gx, q.gy) > 0.97) return '#fff4c2'
      // 칸마다 왼쪽 위 절반이 밝다 (빛은 왼쪽 위)
      const hi = frac(q.gx) + frac(q.gy) < 0.5
      return (Math.floor(q.gx) + Math.floor(q.gy)) % 2 ? (hi ? '#f0d470' : '#e6c45c') : hi ? '#e2c05a' : '#d6b04a'
    },
  },
  'floor-cloud': {
    name: '구름 위',
    paint: (q) => {
      const c = Math.sin(q.gx * 1.3 + Math.sin(q.gy * 0.9) * 1.5) + Math.sin(q.gy * 1.1 - q.gx * 0.4 + 1.7)
      return c > 1.1 ? '#ffffff' : c > 0.85 ? '#eaf6fd' : c > 0.7 ? '#cfeafa' : n32(q.gx, q.gy) > 0.985 ? '#ffffff' : '#a8d8f4'
    },
  },
  'floor-leaves': {
    name: '낙엽 카펫',
    paint: (q) => {
      // 1/4칸마다 잎 하나 — 방향·색은 칸 번호로
      const cx = Math.floor(q.gx * 4)
      const cy = Math.floor(q.gy * 4)
      const n = noise(cx, cy)
      const fx = frac(q.gx * 4) - 0.5
      const fy = frac(q.gy * 4) - 0.5
      const [u, v] = n > 0.5 ? [fx, fy] : [fy, fx]
      if (Math.abs(u) + Math.abs(v) * 2.2 < 0.42) return Math.abs(v) < 0.04 ? '#a85a30' : ['#e8835a', '#f0c84a', '#d0603e'][Math.floor(noise(cx + 7, cy) * 3)]
      return n32(q.gx, q.gy) > 0.8 ? '#a87a40' : '#b8884a'
    },
  },
  'floor-snow': {
    name: '눈밭',
    paint: (q) => {
      const n = n32(q.gx, q.gy)
      const d = Math.sin(q.gx * 1.7 + Math.sin(q.gy * 1.3) * 1.2)
      return n > 0.97 ? '#ffffff' : d > 0.8 ? '#dde8f2' : d > 0.6 ? '#e8f0f8' : '#f4f8fc'
    },
  },
} satisfies Record<string, FloorDef>

const SHOP_WALLS = {
  'wall-cream': { name: '크림 페인트', base: '#d4bf98', cap: '#fffaf0', face: (a, z) => (n32(a, z / 32) > 0.97 ? '#f2e2c4' : '#f7ead0') },
  'wall-polka': {
    name: '물방울 무늬',
    base: '#e0a0b2',
    cap: '#fff6f8',
    face: (a, z) => {
      const row = Math.floor(z / 8)
      const dx = (frac(a * 2 + (row % 2) * 0.5) - 0.5) * 8
      const dz = frac(z / 8) * 8 - 4
      return dx * dx + dz * dz < 5 ? '#f4a8bc' : '#fde6ec'
    },
  },
  'wall-brick': {
    name: '붉은 벽돌',
    base: '#9a5446',
    cap: '#f4e2d8',
    face: (a, z) => {
      const row = Math.floor(z / 5)
      const col = a * 2 + (row % 2) * 0.5
      if (z % 5 < 1 || frac(col) < 0.08) return '#ead6ca'
      return ['#d0705a', '#c4644e', '#d87c64'][Math.floor(noise(Math.floor(col), row) * 3)]
    },
  },
  'wall-wave': {
    name: '파도 무늬',
    base: '#6a9cc4',
    cap: '#f2faff',
    face: (a, z) => {
      const w = (z + Math.sin(a * Math.PI * 4) * 1.6) % 7
      return w < 1.2 ? '#7cb8e2' : w < 2 ? '#b4daf2' : '#dcf0fa'
    },
  },
  'wall-stripe': {
    name: '민트 스트라이프',
    base: '#7ab8a6',
    cap: '#f4fffb',
    face: (a) => {
      const t = frac(a * 3)
      return t < 0.4 ? '#bfe8da' : t < 0.47 ? '#9fd6c4' : '#f2fbf8'
    },
  },
  'wall-concrete': {
    name: '노출 콘크리트',
    base: '#8e8f8c',
    cap: '#e4e4e0',
    face: (a, z) => {
      // 거푸집 판(1칸 × 21px) 이음매 + 판마다 폼타이 구멍 4개
      const pa = frac(a)
      const pz = (z - 5) % 21
      if (pa < 0.03 || pz < 0.6) return '#a6a7a3'
      if ((Math.abs(pa - 0.2) < 0.04 || Math.abs(pa - 0.8) < 0.04) && (Math.abs(pz - 5) < 0.8 || Math.abs(pz - 16) < 0.8)) return '#8a8b88'
      const n = n32(a, z / 32)
      return n > 0.93 ? '#b4b5b1' : n < 0.05 ? '#c0c1bd' : '#cacbc6'
    },
  },
  'wall-forest': {
    name: '숲속 잎사귀',
    base: '#6aa070',
    cap: '#f2fbef',
    face: (a, z) => {
      const n = noise(Math.floor(a * 2), Math.floor(z / 9))
      const fx = (frac(a * 2) - 0.5) * 8
      const fz = frac(z / 9) * 9 - 4.5
      const lean = n > 0.5 ? 1 : -1
      const u = fx * 0.8 + fz * 0.6 * lean
      const v = -fx * 0.6 * lean + fz * 0.8
      if ((u * u) / 12 + (v * v) / 2.5 < 1) return Math.abs(v) < 0.4 ? '#4f9450' : n > 0.75 ? '#9ad87e' : n > 0.4 ? '#7cbc6a' : '#62a85c'
      return '#e2f2dc'
    },
  },
  'wall-navy': {
    name: '네이비 패널',
    base: '#2e3858',
    cap: '#e8ecf6',
    face: (a, z) => {
      // 반 칸 패널 + 허리 몰딩, 패널 테두리는 밝게
      const pa = frac(a * 2)
      if (z > 28 && z < 30) return '#7a8ab8'
      if (pa < 0.06) return '#36426a'
      if (pa < 0.12 || z > 44 || z < 9) return '#5a6a9a'
      return '#4a5a8a'
    },
  },
  'wall-sunset': { name: '노을 그라데이션', base: '#b86a5a', cap: '#fff0e6', face: (a, z) => ramp(a, z, (z - 5) / (WALL_H - 6), ['#f8b878', '#f49a7a', '#e88aa8', '#c48ac8', '#9b86d8']) },
  'wall-wood': {
    name: '원목 루버',
    base: '#8a6440',
    cap: '#f6ead8',
    face: (a) => {
      // 밝은 오크 살 · 살 사이 그림자 (레벨 루버보다 밝고 촘촘)
      const t = frac(a * 6)
      return t < 0.5 ? (t < 0.08 ? '#f0cc96' : '#e2b882') : t < 0.62 ? '#8a6440' : '#c4996a'
    },
  },
  'wall-glass': {
    name: '통유리 커튼월',
    base: '#7a889c',
    cap: '#eef2f6',
    face: (a, z) => {
      // 유리 너머 도시: 1/3칸 건물마다 높이·색, 창에 불빛
      const pa = frac(a)
      if (pa < 0.05 || z > WALL_H - 3 || Math.abs(z - 26) < 0.6) return '#7a889c'
      const b = Math.floor(a * 3)
      if (z < 13 + noise(b, 7) * 22) {
        const isLit = z % 4 < 2 && frac(a * 12) < 0.5 && noise(Math.floor(a * 12), Math.floor(z / 4)) > 0.55
        return isLit ? '#fff2b8' : noise(b, 3) > 0.5 ? '#8fa8c8' : '#9cb4d2'
      }
      return windowPx(pa, z, 1, WALL_H, true)
    },
  },
  'wall-gold': {
    name: '골드 다마스크',
    base: '#a8843a',
    cap: '#fff4d0',
    face: (a, z) => {
      // 엇갈린 마름모 고리 + 가운데 꽃술
      const u = frac(a * 2 + (Math.floor(z / 12) % 2) * 0.5) - 0.5
      const v = frac(z / 12) - 0.5
      const d = Math.abs(u) * 1.6 + Math.abs(v)
      if (Math.abs(d - 0.32) < 0.05 || d < 0.08) return '#c8a44a'
      if (d < 0.2 && Math.abs(u) < 0.06) return '#d8b45a'
      return n32(a, z / 32) > 0.96 ? '#f6e6b8' : '#ead6a2'
    },
  },
  'wall-galaxy': {
    name: '은하수',
    base: '#1e1a3a',
    cap: '#c8c0f0',
    face: (a, z) => {
      const n = noise(Math.round(a * 16), Math.round(z))
      if (n > 0.985) return '#ffffff'
      if (n > 0.97) return '#cfc6ff'
      // 비스듬히 흐르는 은하수 띠
      const off = Math.abs(z - (26 + Math.sin(a * 0.9) * 10))
      if (off < 2.5) return n > 0.5 ? '#9a8ad8' : '#7a6ac0'
      if (off < 6) return ramp(a, z, (6 - off) / 3.5, ['#3a2a6a', '#4e3e8a', '#6a5aa8'])
      return ramp(a, z, (z - 5) / (WALL_H - 6), ['#2a2450', '#30285c', '#3a2a6a'])
    },
  },
  'wall-halloween': {
    name: '할로윈 벽지',
    base: '#241a30',
    cap: '#f0c890',
    face: (a, z) => {
      // 줄마다 엇갈려 호박·박쥐를 번갈아
      const row = Math.floor((z - 5) / 11)
      const col = a * 1.5 + (row % 2) * 0.5
      const fx = (frac(col) - 0.5) * (16 / 1.5)
      const fz = ((z - 5) % 11) - 5
      if ((Math.floor(col) + row) % 2 === 0) {
        if ((fx * fx) / 9 + ((fz + 0.5) * (fz + 0.5)) / 6 < 1) return Math.abs(fx) < 0.6 || Math.abs(Math.abs(fx) - 1.8) < 0.4 ? '#d0702a' : '#f08a3a'
        if (Math.abs(fx) < 0.6 && fz > 1.5 && fz < 3.5) return '#5a9a4a'
      } else if (fx * fx + fz * fz < 1.6 || (Math.abs(fz - Math.abs(fx) * 0.35 + 0.5) < 0.7 && Math.abs(fx) < 4)) return '#140e1c'
      return '#3a2a4a'
    },
  },
  'wall-xmas': {
    name: '크리스마스 벽지',
    base: '#8a2a2a',
    cap: '#f8f4ee',
    face: (a, z) => {
      // 빨강·크림 줄 사이 초록 선, 빨간 줄에 눈송이
      const t = frac(a * 2)
      if (t > 0.46 && t < 0.54) return '#3a8a4a'
      if (t >= 0.54) return '#f4f0ea'
      const dx = t * 8 - 1.85
      const dz = ((z - 5 + (Math.floor(a * 2) % 2) * 4) % 9) - 4
      if ((Math.abs(dx) < 0.5 && Math.abs(dz) < 1.6) || (Math.abs(dz) < 0.5 && Math.abs(dx) < 1.6)) return '#ffffff'
      return '#c83a3a'
    },
  },
} satisfies Record<string, WallDef>

type ShopFloorId = keyof typeof SHOP_FLOORS
type ShopWallId = keyof typeof SHOP_WALLS
/** 바닥 공통 빛: 뒤 벽(gx·gy = 0) 밑은 벽 그늘 두 단 */
const floorLit = (f: FloorDef): FloorDef => ({
  ...f,
  paint: (q) => {
    const c = f.paint(q)
    const d = Math.min(q.gx, q.gy)
    return d < 0.1 ? mix(c, S.sh, 0.2) : d < 0.22 ? mix(c, S.sh, 0.09) : c
  },
})
const FLOORS: Record<FloorMat, FloorDef> = Object.fromEntries(Object.entries({ ...LEVEL_FLOORS, ...SHOP_FLOORS }).map(([k, f]) => [k, floorLit(f)])) as Record<FloorMat, FloorDef>
const WALLS: Record<WallMat, WallDef> = { ...LEVEL_WALLS, ...SHOP_WALLS }
/** 그림이 있는 상점 바닥재·벽지 id (economy.ts와 같은지 테스트가 본다) */
export const SURFACE_ART_IDS = { floor: Object.keys(SHOP_FLOORS), wallpaper: Object.keys(SHOP_WALLS) }
const shopFloor = (id: string | undefined): ShopFloorId | null => (id && Object.hasOwn(SHOP_FLOORS, id) ? (id as ShopFloorId) : null)
const shopWall = (id: string | undefined): ShopWallId | null => (id && Object.hasOwn(SHOP_WALLS, id) ? (id as ShopWallId) : null)
/** 유리 벽은 창·몰딩을 달지 않는다 */
const isGlass = (m: WallMat) => m === 'glass' || m === 'wall-glass'
export const surfaceName = (id: string) => (shopFloor(id) ? FLOORS[id as ShopFloorId].name : shopWall(id) ? WALLS[id as ShopWallId].name : id)

/** 한 층 바닥·벽 마감 */
export interface Finish {
  material: Material
  floor: FloorMat
  wall: WallMat
  /** 창 개수 (뒤쪽 두 벽에 나눠 단다). 통유리는 무시 */
  windows: number
  /** 벽 위쪽 몰딩 (Lv.5) */
  molding?: boolean
  /** 회의실 벽지: 뒤쪽(gy = 0) 벽의 from칸부터 끝까지 — 회의실이 기댄 자리 */
  meetingWall?: { mat: WallMat; from: number }
}
// 김기획 레벨표 2-2절의 바닥·벽·창 열 그대로. 재질 단계는 층이 느는 레벨(6·10·14·18)에 맞춰 묶었다(M1~M5)
const LEVEL_FINISH: [FloorMat, WallMat, number, boolean?][] = [
  ['concrete', 'block', 0],
  ['concrete', 'block', 1],
  ['vinyl', 'paint', 2],
  ['tile', 'paint', 2],
  ['tile', 'paint', 3, true],
  ['carpet', 'brick', 3],
  ['carpet', 'brick', 4],
  ['wood', 'panel', 4],
  ['wood', 'panel', 4],
  ['wood', 'louver', 5],
  ['wood', 'louver', 5],
  ['herring', 'louver', 6],
  ['herring', 'louver', 6],
  ['terrazzo', 'glass', 0],
  ['terrazzo', 'glass', 0],
  ['terrazzo', 'glass', 0],
  ['terrazzo', 'glass', 0],
  ['marble', 'marble', 6],
  ['marble', 'marble', 6],
  ['marbleGold', 'marble', 6],
]
/** 레벨 → 재질 단계 (LEVEL_TABLE.material) */
export const materialOfLevel = (level: number): Material => levelRowOf(level).material
/** 레벨 → 바닥·벽 마감 (Lv.8 원목 같은 단계 안 변형 포함) */
export function finishOf(level: number): Finish {
  const L = Math.max(1, Math.min(LEVEL_FINISH.length, Math.floor(level) || 1))
  const [floor, wall, windows, molding] = LEVEL_FINISH[L - 1]
  return { material: materialOfLevel(L), floor, wall, windows, ...(molding ? { molding } : {}) }
}
/** 재질 단계의 대표 마감 (문서 6절 stage 그림과 같음) */
export const STAGE_FINISH: Record<Material, Finish> = {
  1: finishOf(2),
  2: finishOf(4),
  3: finishOf(6),
  4: { ...finishOf(12), wall: 'panel' },
  5: { material: 5, floor: 'marbleGold', wall: 'glass', windows: 0 },
}
export const finishKey = (f: Finish) => `${f.floor}-${f.wall}-${f.windows}${f.molding ? 'm' : ''}${f.meetingWall ? `-mw${f.meetingWall.mat}@${f.meetingWall.from}` : ''}`
export const finishLabel = (f: Finish) => `M${f.material} · ${FLOORS[f.floor].name} · ${WALLS[f.wall].name}${f.molding ? ' + 몰딩' : ''}`

/** 상점 벽지·바닥재 고른 것 (ShopState.surfaces 모양) */
export type Surfaces = Partial<Record<'work' | 'meeting' | 'lounge', { wallpaper?: string; floor?: string }>>
/**
 * 산 벽지·바닥재를 레벨 기본 마감 위에 덮는다 (대표님 결정 2026-10-24 "덮어쓰기 유지"). 고르지 않았으면 레벨 기본 그대로.
 * 업무 구역 = 방 바닥·뒤쪽 벽 두 면, 회의실 = 회의실 바닥(meetingFloor)과 회의실이 기댄 뒤쪽 벽(meetingFrom칸부터).
 * 휴게실은 칸 사무실에 따로 없어 쓰지 않는다. 모르는 id(그림 없는 품목)는 무시한다
 */
export function withSurfaces(base: Finish, s: Surfaces | undefined, meetingFrom: number | null = null): { finish: Finish; meetingFloor: FloorMat | null } {
  const finish: Finish = { ...base }
  const floor = shopFloor(s?.work?.floor)
  const wall = shopWall(s?.work?.wallpaper)
  if (floor) finish.floor = floor
  if (wall) {
    finish.wall = wall
    // 통유리 단계(창 0) 위에 벽지를 바르면 창을 단다(M4 끝과 같은 6개). 벽지가 유리면 창·몰딩 없음
    if (isGlass(wall)) {
      finish.windows = 0
      delete finish.molding
    } else if (isGlass(base.wall)) finish.windows = 6
  }
  const mWall = meetingFrom === null ? null : shopWall(s?.meeting?.wallpaper)
  if (mWall && mWall !== finish.wall) finish.meetingWall = { mat: mWall, from: meetingFrom! }
  return { finish, meetingFloor: shopFloor(s?.meeting?.floor) }
}

/** 벽 하나의 면: 걸레받이 → 몰딩 → 창 → 재질. seg = 회의실 벽지 구간(뒤쪽 gy = 0 벽만) */
const wallFace = (mat: WallMat, windows: number[], molding: boolean, seg?: Finish['meetingWall']) => (q: Q) => {
  const a = q.face === 'S' ? q.gx : q.gy
  const m = seg && a >= seg.from ? seg.mat : mat
  const w = WALLS[m]
  if (isGlass(m)) return q.z < 4 ? w.base : w.face(a, q.z)
  if (q.z < 5) return q.z < 1 ? mix(w.base, '#000000', 0.12) : w.base
  if (molding && q.z > 38 && q.z < 40) return w.cap
  for (const w0 of windows) if (a > w0 && a < w0 + 1.3 && q.z > 16 && q.z < 40) return windowPx(a - w0, q.z - 16, 1.3, 24)
  // 창턱(흰 줄)과 그 아래 그늘 한 줄
  for (const w0 of windows) if (a > w0 - 0.05 && a < w0 + 1.35 && q.z > 14 && q.z <= 16) return q.z > 15 ? '#ffffff' : mix(w.face(a, q.z), S.sh, 0.3)
  return wallLight(w.face(a, q.z), a, q.z)
}
/** 벽 빛: 바닥에 닿는 아래쪽·방 구석은 어둡게(AO), 위쪽은 살짝 밝게 — 두세 단으로만 (픽셀 띠) */
const wallLight = (c: Color, a: number, z: number): Color => {
  const t = (z < 8 ? 0.14 : z < 12 ? 0.07 : 0) + (a < 0.12 ? 0.12 : a < 0.3 ? 0.05 : 0)
  if (t) return mix(c, S.sh, t)
  return z > WALL_H - 6 ? mix(c, WHITE, 0.08) : c
}
const windowsAlong = (len: number, want: number) => {
  const n = Math.max(0, Math.min(want, Math.floor(len / 1.8)))
  return Array.from({ length: n }, (_, i) => ((i + 0.5) * len) / n - 0.65)
}

/** 방: 바닥판 + 뒤쪽 벽 두 면 (앞쪽 벽은 그리지 않는다) — 픽셀 */
export function artRoom(cols: number, rows: number, finish: Finish = STAGE_FINISH[2]) {
  const pad = 4
  const cv = new Cv((cols + rows) * HW + WALL_T * 2 * HW + pad * 2, (cols + rows) * HH + WALL_H + SLAB + pad * 2 + 4)
  const o: Pt = [rows * HW + WALL_T * HW + pad, WALL_H + pad + 2]
  const w = WALLS[finish.wall]
  const nS = Math.ceil(finish.windows / 2)
  const molding = !!finish.molding
  drawBox(cv, o, { x: -WALL_T, y: -WALL_T, w: WALL_T, d: WALL_T, z: -SLAB, h: WALL_H + SLAB, top: w.cap, S: w.base, E: w.base })
  const seg = finish.meetingWall && finish.meetingWall.from < cols ? finish.meetingWall : undefined
  drawBox(cv, o, { x: 0, y: -WALL_T, w: cols, d: WALL_T, z: -SLAB, h: WALL_H + SLAB, top: w.cap, S: wallFace(finish.wall, windowsAlong(cols, nS), molding, seg), E: seg ? WALLS[seg.mat].base : w.base })
  drawBox(cv, o, { x: -WALL_T, y: 0, w: WALL_T, d: rows, z: -SLAB, h: WALL_H + SLAB, top: w.cap, S: w.base, E: wallFace(finish.wall, windowsAlong(rows, finish.windows - nS), molding) })
  drawBox(cv, o, { x: 0, y: 0, w: cols, d: rows, z: -SLAB, h: SLAB, top: FLOORS[finish.floor].paint, S: mix(w.base, S.sh, 0.2), E: mix(w.base, S.sh, 0.2) })
  outline(cv)
  return { cv, o }
}

export interface RoomArt {
  canvas: HTMLCanvasElement
  /** 텍스처 안에서 (0,0) 칸 꼭짓점의 화면 px 위치 */
  anchor: { x: number; y: number }
}
export const roomTextureKey = (cols: number, rows: number, finish: Finish) => `room-${cols}x${rows}-${finishKey(finish)}`

/** 상점 벽지·바닥재 미리보기 (상점 카드): 3×3 방 모서리. 바닥재는 흰 페인트 벽과, 벽지는 타일 바닥과 함께 — 창 없이 무늬만 */
export function artSurfaceThumb(id: string) {
  return artRoom(3, 3, { material: 2, floor: shopFloor(id) ?? 'tile', wall: shopWall(id) ?? 'paint', windows: 0 }).cv
}
export const drawSurfaceThumb = (id: string, scale = PIXEL) => toCanvas(artSurfaceThumb(id), scale)

/** 방 (화면 캔버스). 마감을 안 주면 M2 대표(타일·흰 페인트) */
export function drawRoom(cols: number, rows: number, finish: Finish = STAGE_FINISH[2]): RoomArt {
  const { cv, o } = artRoom(cols, rows, finish)
  return { canvas: toCanvas(cv), anchor: { x: o[0] * PIXEL, y: o[1] * PIXEL } }
}

// ── 비정사각 평면 (office-iso-spaces.md 2-5절): 칸 표(Room.cells)로 바닥판·벽을 1칸 조각으로 ──
// 굽는 몫(방 텍스처) = 칸마다 바닥판 + 바깥 뒤 벽. 정렬하는 몫(artPlanEdges) = 안쪽 벽·유리벽·문턱·난간

/** 야외 바닥: 1층 상자 앞 돌출(현관·로비) = 보도블록 · 1층 테라스 = 데크 · 위층(4층 정원) = 잔디 + 디딤돌 */
const OUTDOOR_FLOOR = {
  paving: (q: Q): Fill => (frac(q.gx * 2) < 0.06 || frac(q.gy * 2) < 0.06 ? '#d6cfc2' : '#ebe5da'),
  deck: (q: Q): Fill => (frac(q.gx * 3) < 0.1 ? '#a77d52' : '#c79c6c'),
  garden: (q: Q): Fill =>
    Math.hypot(frac(q.gx) - 0.5, frac(q.gy) - 0.5) < 0.22 && (Math.floor(q.gx) + Math.floor(q.gy)) % 3 === 0 ? K.stone : noise(Math.round(q.gx * 16), Math.round(q.gy * 16)) > 0.85 ? '#8fcf7a' : '#9ad884',
}
function outdoorFloorAt(room: Room, gx: number, gy: number) {
  if (!room.box) return OUTDOOR_FLOOR.garden
  return gy >= room.box.rows ? OUTDOOR_FLOOR.paving : OUTDOOR_FLOOR.deck
}

/** 칸 표 지문 (텍스처 키용) — 같은 모양이면 같은 값 */
function cellsHash(room: Room) {
  let h = 0x811c9dc5
  for (const c of room.cells ?? []) h = Math.imul(h ^ c, 0x01000193)
  return (h >>> 0).toString(36)
}
/** 칸 표 방 텍스처 키. cells가 없으면 예전 정사각형 방과 같은 키 */
export const planRoomTextureKey = (room: Room, finish: Finish) => (room.cells ? `room-${room.cols}x${room.rows}-${cellsHash(room)}-${finishKey(finish)}` : roomTextureKey(room.cols, room.rows, finish))

/** 벽 끝 마구리: 벽이 앞에서 끊기는 단면 — 바닥판 높이 아래는 바닥 옆면색, 위는 벽 윗면색 */
const endCap = (w: WallDef) => (q: Q): Fill => (q.z < 0 ? mix(w.base, S.sh, 0.2) : w.cap)

/** 한 축(뒤 변)을 따라 이어진 칸 구간 [시작, 끝) */
function runsOf(at: number[]) {
  const out: [number, number][] = []
  for (const a of [...at].sort((p, q) => p - q)) {
    const last = out[out.length - 1]
    if (last && last[1] === a) last[1] = a + 1
    else out.push([a, a + 1])
  }
  return out
}

/**
 * 칸 표 방 (픽셀): 바닥판(칸마다, 옆면은 앞쪽 경계에서만 보인다) + 바깥 뒤 벽(gx=0·gy=0). 크기·기준점은 artRoom과 같다.
 * cells가 없으면 artRoom 그대로. 깎인 자리의 안쪽 벽은 굽지 않는다(artPlanEdges)
 */
export function artPlanRoom(room: Room, finish: Finish = STAGE_FINISH[2]) {
  const { cols, rows } = room
  if (!room.cells) return artRoom(cols, rows, finish)
  const pad = 4
  const cv = new Cv((cols + rows) * HW + WALL_T * 2 * HW + pad * 2, (cols + rows) * HH + WALL_H + SLAB + pad * 2 + 4)
  const o: Pt = [rows * HW + WALL_T * HW + pad, WALL_H + pad + 2]
  const w = WALLS[finish.wall]
  const molding = !!finish.molding
  const edges = edgesOf(room)
  const outer = (side: 'x-' | 'y-') => runsOf(edges.filter((e) => e.kind === 'outerWall' && e.side === side).map((e) => (side === 'y-' ? e.gx : e.gy)))
  // 창 개수는 artRoom처럼 뒤 벽(gy=0)에 반, 왼쪽 벽(gx=0)에 나머지 — 구간이 여럿이면 길이 비례
  const wallRuns = (side: 'x-' | 'y-', want: number) => {
    const runs = outer(side)
    const total = runs.reduce((n, [a, e]) => n + e - a, 0)
    return runs.map(([a, e]) => ({ a, len: e - a, windows: windowsAlong(e - a, Math.round((want * (e - a)) / Math.max(1, total))).map((p) => p + a) }))
  }
  const nS = Math.ceil(finish.windows / 2)
  if (kindAt(room, 0, 0) !== CellKind.None) drawBox(cv, o, { x: -WALL_T, y: -WALL_T, w: WALL_T, d: WALL_T, z: -SLAB, h: WALL_H + SLAB, top: w.cap, S: w.base, E: w.base })
  for (const r of wallRuns('y-', nS)) {
    const seg = finish.meetingWall && finish.meetingWall.from < r.a + r.len ? finish.meetingWall : undefined
    drawBox(cv, o, { x: r.a, y: -WALL_T, w: r.len, d: WALL_T, z: -SLAB, h: WALL_H + SLAB, top: w.cap, S: wallFace(finish.wall, r.windows, molding, seg), E: endCap(w) })
  }
  for (const r of wallRuns('x-', finish.windows - nS))
    drawBox(cv, o, { x: -WALL_T, y: r.a, w: WALL_T, d: r.len, z: -SLAB, h: WALL_H + SLAB, top: w.cap, S: endCap(w), E: wallFace(finish.wall, r.windows, molding) })
  // 바닥판: 뒤 → 앞으로 칸마다. 앞모서리 하이라이트는 다 그린 뒤 실제로 드러난 옆면 위에만 (칸 경계에 줄이 생기지 않게)
  const cells: [number, number, CellKind][] = []
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) if (kindAt(room, gx, gy) !== CellKind.None) cells.push([gx, gy, kindAt(room, gx, gy)])
  cells.sort((p, q) => p[0] + p[1] - (q[0] + q[1]))
  const top = new Set<number>()
  const side = new Set<number>()
  const slabSide = mix(w.base, S.sh, 0.2)
  const outSide = '#8a7a64'
  for (const [gx, gy, k] of cells) {
    const isOut = k === CellKind.Outdoor
    const sideC = isOut ? outSide : slabSide
    const hit = drawBox(cv, o, { x: gx, y: gy, w: 1, d: 1, z: -SLAB, h: SLAB, top: isOut ? outdoorFloorAt(room, gx, gy) : FLOORS[finish.floor].paint, S: sideC, E: sideC, noHi: true })
    for (const i of hit.side) {
      side.add(i)
      top.delete(i)
    }
    for (const i of hit.top) {
      top.add(i)
      side.delete(i)
    }
  }
  for (const i of top) if (side.has(i + cv.w)) cv.write(i, mix(cv.read(i), WHITE, S.hi))
  outline(cv)
  return { cv, o }
}

/** 칸 표 방 (화면 캔버스) */
export function drawPlanRoom(room: Room, finish: Finish = STAGE_FINISH[2]): RoomArt {
  const { cv, o } = artPlanRoom(room, finish)
  return { canvas: toCanvas(cv), anchor: { x: o[0] * PIXEL, y: o[1] * PIXEL } }
}

/** 따로 정렬하는 경계 조각. o·box는 칸 (gx, gy) 기준 — 가구처럼 그 칸에 놓는다 */
export interface PlanEdgePiece extends ItemPixels {
  kind: 'innerWall' | 'glass' | 'sill' | 'rail'
  gx: number
  gy: number
  side: EdgeSide
  /** 텍스처 키 `plan-{kind}-{side}-{gx}x{gy}[-{finishKey}]` — 무늬가 칸 위치를 따라 이어져 칸마다 다르다 */
  key: string
  /** 뒤에 직원·든 가구가 가려지면 반투명으로 하는 조각 (안쪽 벽, G3 A) — depth.ts hidesMover로 판정 */
  canFade: boolean
}
/** 안쪽 벽이 뒤를 가릴 때의 불투명도 (G3 A) */
export const WALL_FADE_ALPHA = 0.35

const PLAN_GLASS: Color = [168, 220, 242, 150]
const PLAN_GLASS_HI: Color = [230, 247, 255, 190]
/** 실내↔야외 유리벽 (회의실 유리와 같은 색). a = 벽을 따라가는 칸 좌표 */
const planGlass = (q: Q): Fill => {
  const a = q.face === 'S' ? q.gx : q.gy
  return q.v > 0.95 || q.v < 0.06 || frac(a * 2) < 0.05 ? K.metalL : frac((a * 3 + q.v) * 1.3) < 0.12 ? PLAN_GLASS_HI : PLAN_GLASS
}
/** 난간: 낮은 유리 + 위 금속 손잡이 */
const planRail = (q: Q): Fill => (q.v > 0.8 ? K.metal : q.v < 0.12 ? K.metalL : [190, 228, 244, 120])

/**
 * 칸 표의 정렬하는 경계 조각 (2-5절 표): 안쪽 벽(마구리 포함) · 실내↔야외 유리벽 · 문턱 · 난간.
 * 바깥 뒤 벽·바닥판 옆면은 artPlanRoom에 굽는다. 자리 상자는 depth.ts edgeBox와 같다
 */
export function artPlanEdges(room: Room, finish: Finish = STAGE_FINISH[2]): PlanEdgePiece[] {
  const w = WALLS[finish.wall]
  const face = wallFace(finish.wall, [], !!finish.molding)
  const fk = finishKey(finish)
  const out: PlanEdgePiece[] = []
  for (const e of edgesOf(room)) {
    if (e.kind === 'outerWall' || e.kind === 'slabSide') continue
    const isX = e.side === 'x-' || e.side === 'x+'
    // 보이는 두 면: x 쪽 벽은 E가 벽면·S가 끝 단면, y 쪽 벽은 S가 벽면·E가 끝 단면
    const faces = (main: Paint, end: Paint) => (isX ? { S: end, E: main } : { S: main, E: end })
    const look =
      e.kind === 'innerWall'
        ? { top: w.cap, ...faces(face, endCap(w)) }
        : e.kind === 'glass'
          ? { top: K.metalL, ...faces(planGlass, K.metalL) }
          : e.kind === 'sill'
            ? { top: K.metalL, S: K.metal, E: K.metal }
            : { top: K.metal, ...faces(planRail, K.metal) }
    const box = { ...edgeBox(e), ...look }
    const p = edgePiece(box, e.gx, e.gy)
    out.push({ ...p, kind: e.kind, gx: e.gx, gy: e.gy, side: e.side, key: `plan-${e.kind}-${e.side}-${e.gx}x${e.gy}${e.kind === 'innerWall' ? `-${fk}` : ''}`, canFade: e.kind === 'innerWall' })
  }
  return out
}

/** 평면 좌표 상자 하나를 칸 (gx, gy) 기준 작은 텍스처로 — 무늬는 평면 좌표로 칠해 옆 칸과 이어진다 */
function edgePiece(bx: Box, gx: number, gy: number): ItemPixels {
  const lx = bx.x - gx
  const ly = bx.y - gy
  const x0 = Math.min(0, lx)
  const y0 = Math.min(0, ly)
  const W = Math.max(1, Math.ceil(lx + bx.w))
  const D = Math.max(1, Math.ceil(ly + bx.d))
  const H = Math.max(0, bx.z + bx.h)
  const pad = 3
  const up = Math.ceil(-(x0 + y0) * HH)
  const cv = new Cv((W + D - x0 - y0) * HW + pad * 2, (W + D) * HH + H + up + Math.max(0, -bx.z) + pad * 2)
  const o: Pt = [Math.round((D - x0) * HW) + pad, H + up + pad]
  drawBox(cv, [o[0] - (gx - gy) * HW, o[1] - (gx + gy) * HH], bx)
  outline(cv)
  return { cv, o, box: { x: lx, y: ly, w: bx.w, d: bx.d, z: bx.z, h: bx.h }, w: 1, d: 1, isPlaceholder: false }
}

// ── 구역 바닥 (벽 없는 구역, 2-4절): 방 바닥 바로 위에 한 장 깐다. 다른 바닥재 + 1px 테두리 ──
// 텍스처 키 `zone-floor-{종류}-{w}x{d}`
const ZONE_FLOORS = {
  kitchen: { edge: '#b8c0ca', paint: (q: Q) => (frac(q.gx * 2) < 0.06 || frac(q.gy * 2) < 0.06 ? '#c9d0d8' : '#f4f6f8') },
  lounge: { edge: '#9fb894', paint: (q: Q) => ((Math.floor(q.gx * 2) + Math.floor(q.gy * 2)) % 2 ? '#c9d9c0' : '#d3e2cb') },
  game: { edge: '#8a84c0', paint: (q: Q) => ((Math.floor(q.gx) + Math.floor(q.gy)) % 2 ? '#bdb6e6' : '#c9c3ee') },
  sleep: { edge: '#8a9cc8', paint: (q: Q) => (noise(Math.round(q.gx * 16), Math.round(q.gy * 16)) > 0.9 ? '#aab8dc' : '#b8c4e4') },
  library: { edge: '#a97b5c', paint: (q: Q) => (frac(q.gy * 4) < 0.06 ? '#b78a68' : '#c99c78') },
  fitness: { edge: '#5d6380', paint: (q: Q) => (frac(q.gx) < 0.04 || frac(q.gy) < 0.04 ? '#5d6380' : '#7a8098') },
  cafe: { edge: '#b88c5e', paint: (q: Q) => (frac(q.gx * 4 + (Math.floor(q.gy * 2) % 2) * 0.5) < 0.06 ? '#b88c5e' : frac(q.gy * 2) < 0.04 ? '#c79c6c' : '#e2b986') },
  cafeteria: { edge: '#c9b48e', paint: (q: Q) => ((Math.floor(q.gx * 2) + Math.floor(q.gy * 2)) % 2 ? '#efe4cc' : '#f6eedc') },
  sky: { edge: '#3a3e66', paint: (q: Q) => (noise(Math.round(q.gx * 16), Math.round(q.gy * 16)) > 0.92 ? '#5a5e88' : '#4a4e78') },
  ceo: { edge: '#8a5a3c', paint: (q: Q) => (frac(q.gx * 2 + (Math.floor(q.gy * 4) % 2) * 0.5) < 0.05 ? '#8a5a3c' : '#a06a46') },
} satisfies Record<string, { edge: string; paint: (q: Q) => Color }>
export type ZoneFloor = keyof typeof ZONE_FLOORS
export const ZONE_FLOOR_KINDS = Object.keys(ZONE_FLOORS) as ZoneFloor[]
export const zoneFloorKey = (kind: ZoneFloor, w: number, d: number) => `zone-floor-${kind}-${w}x${d}`
/** 구역 바닥 w×d (픽셀). o = 구역 왼쪽 뒤 칸 꼭짓점 */
export function artZoneFloor(kind: ZoneFloor, w: number, d: number): ItemPixels {
  const z = ZONE_FLOORS[kind]
  const t = 0.06
  const pad = 2
  const cv = new Cv((w + d) * HW + pad * 2, (w + d) * HH + pad * 2)
  const o: Pt = [d * HW + pad, pad]
  drawBox(cv, o, { x: 0, y: 0, w, d, z: 0, h: 0, top: (q) => (q.gx < t || q.gy < t || q.gx > w - t || q.gy > d - t ? z.edge : z.paint(q)), S: null, E: null })
  return { cv, o, box: { x: 0, y: 0, w, d, z: 0, h: 0 }, w, d, isPlaceholder: false }
}

// ── 직원 (인물 그림은 personArt.ts — 서기 약 13×32칸, 4방향: 앞 ↙ · 뒤 ↖ · 오른앞 ↘ · 오른뒤 ↗) ──
export interface Look {
  h: string
  s: string
  c: string
  p: string
  /** 신발 */
  b?: string
  /** 아래 번호는 shared/look.ts 목록 순서 (없으면 0 = 기본 그림) — HAIR_STYLES */
  hair?: number
  /** TOPS (티셔츠·후드티·셔츠·넥타이·카디건·정장) */
  top?: number
  /** FACE_ITEMS (없음·안경·선글라스·수염·콧수염) */
  face?: number
  /** HEAD_ITEMS (없음·헤드셋·모자·비니·머리핀·베레모) */
  head?: number
}
/** n번째 직원 — 지금 앱의 머리·피부·윗옷·바지 팔레트(shared/look.ts)를 돌려 쓰고, 머리 모양·옷·소품도 돌아가며 입힌다 */
export const lookOf = (n: number): Look => ({
  h: HAIR_COLORS[(n * 3) % HAIR_COLORS.length][0],
  s: SKINS[(n * 5) % SKINS.length],
  c: TOP_COLORS[n % TOP_COLORS.length][0],
  p: PANTS[(n * 7) % PANTS.length],
  hair: n % HAIR_STYLES.length,
  top: n % TOPS.length,
  face: n % FACE_ITEMS.length,
  head: n % HEAD_ITEMS.length,
})

/** 앱 생김새(부품 번호) → 칸 사무실 직원 그림 (색 + 머리 모양·윗옷·얼굴·머리 소품) */
export const isoLook = (avatar: number): Look => {
  const l = decodeLook(avatar)
  return { h: HAIR_COLORS[l.hairColor % HAIR_COLORS.length][0], s: SKINS[l.skin % SKINS.length], c: TOP_COLORS[l.topColor % TOP_COLORS.length][0], p: PANTS[l.pants % PANTS.length], hair: l.hairStyle, top: l.top, face: l.face, head: l.head }
}

/** type = 책상 앞에 앉아 키보드 치기 (앞 방향은 다리를 그리지 않는다). 상호작용 연출 자세(personArt ActPose)도 같이 쓴다 */
export type PersonPose = FigurePose
/** front ↙ · back ↖ · frontRight ↘ · backRight ↗ */
export type PersonDir = 'front' | 'back' | 'frontRight' | 'backRight'
export const PERSON_POSES: PersonPose[] = ['stand', 'walk1', 'walk2', 'sit', 'type'] // 기본 자세 (연출 자세는 쓸 때 그린다)
export const PERSON_DIRS: PersonDir[] = ['front', 'back', 'frontRight', 'backRight']
/** 칸 방향(r0 ↙ · r1 ↖ · r2 ↗ · r3 ↘) → 직원 그림 방향 */
export const personDirOf = (facing: Rot): PersonDir => (['front', 'back', 'backRight', 'frontRight'] as const)[facing]
const FIG_DIR: Record<PersonDir, FigureDir> = { front: 'SW', frontRight: 'SE', back: 'NW', backRight: 'NE' }
/** 그린 칸을 내용만 남기고 자른다 → [윗줄, 아랫줄] */
const rowsUsed = (g: Grid) => {
  let top = -1
  let bottom = -1
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (g.p[y * g.w + x]) {
        if (top < 0) top = y
        bottom = y
      }
  return [top, bottom]
}

/** 직원 한 장 (픽셀, 16 × 키). 아래 가장자리 = 발끝(앉으면 앞 방향은 발끝, 뒤 방향은 엉덩이), 가로 가운데 = 발 위치 */
export function artPerson(pose: PersonPose, dir: PersonDir, look: Look) {
  const g = drawFigure(look, pose, FIG_DIR[dir])
  const [top, bottom] = rowsUsed(g)
  const cv = new Cv(g.w, bottom - top + 1)
  for (let y = top; y <= bottom; y++)
    for (let x = 0; x < g.w; x++) {
      const c = g.p[y * g.w + x]
      if (c) cv.set(x, y - top, [...figureHex(c), 255] as RGBA)
    }
  return cv
}

/** 앉은 그림에서 엉덩이(좌석에 닿는 줄) 아래로 내려온 다리 길이 (아트 px) — 장면은 이만큼 그림을 내려 엉덩이를 좌석에 맞춘다 */
export function personSitDrop(dir: PersonDir, pose: 'sit' | 'type' = 'sit') {
  const g = drawFigure({ h: '#000000', s: '#000000', c: '#000000', p: '#000000' }, pose, FIG_DIR[dir])
  return rowsUsed(g)[1] - g.hip
}

/** 대시보드·패널 아바타용 상반신 (앞 방향 서기 그림의 윗부분, 16 × rows) */
export function artPersonBust(look: Look, rows = 18) {
  const full = artPerson('stand', 'front', look)
  const cv = new Cv(full.w, Math.min(rows, full.h))
  cv.px.set(full.px.subarray(0, cv.w * cv.h * 4))
  return cv
}

/** 직원 한 장 (화면 캔버스) — 장면은 쓰는 자세부터 한 장씩 만든다 */
export const drawPerson = (pose: PersonPose, dir: PersonDir, look: Look) => toCanvas(artPerson(pose, dir, look))

/** 직원 그림 묶음: 서기·걷기 2프레임·앉기 × 4방향 (화면 캔버스, 키 = `{pose}-{dir}`) */
export function drawPersonSet(look: Look) {
  const out: Record<string, HTMLCanvasElement> = {}
  for (const pose of PERSON_POSES) for (const dir of PERSON_DIRS) out[`${pose}-${dir}`] = toCanvas(artPerson(pose, dir, look))
  return out
}

/** 직원 바닥 그림자 12×5 타원 (픽셀) */
export function artPersonShadow() {
  const cv = new Cv(14, 7)
  for (let y = -2; y <= 2; y++) for (let x = -6; x <= 6; x++) if ((x * x) / 36 + (y * y) / 4 <= 1) cv.set(x + 7, y + 3, S.floorShadow)
  return cv
}
export const drawPersonShadow = () => toCanvas(artPersonShadow())
