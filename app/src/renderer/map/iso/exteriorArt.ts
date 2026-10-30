// 외관 — 땅에 붙은 사무실 부지 (docs/specs/office-iso-spaces.md 2-2절 · 9절 G1 A, 2026-10-25 대표님 "땅에 붙이기")
// 부지(땅·건물·꾸밈)는 레벨·낮밤이 바뀔 때만 한 장(Cv)으로 굽고, 화면(exteriorDiorama.ts)은 그 위에 차·사람·구름만 매 프레임 그린다.
// 부지 밖은 하늘 없이 화면 끝까지 도시 블록(큰길·골목·이웃 건물·공원)이 이어진다(artGround) — 부지 두께·허공·땅 끝이 없다.
// 건물은 사무실 층 평면(planOf)을 층마다 칸 상자로 쌓는다(평면 1칸 = 외관 K칸) — 2층 ㄱ·3층 ㄷ·4층 T·5층 탑이 밖에서도 보이고,
// 위층이 아래층 없는 칸 위로 나오면 기둥 없이 내민다(캔틸레버). 꾸밈 자리는 단계별 표(StageDef)로 정하고 레벨 숫자는 보지 않는다(C3 원칙).
// DOM 없이 픽셀 배열(Cv)에 그린다 — 시안 생성기(scripts/iso-art.mts)도 같은 코드를 쓴다. 상자·정렬 규칙은 isoArt.ts와 같다(A 파스텔)
import { HH, HW } from '../../../shared/iso/grid.ts'
import { CellKind, kindAt, planOf } from '../../../shared/iso/plan.ts'
import type { Rot } from '../../../shared/iso/furniture.ts'
import { LEVEL_TABLE, levelRowOf, type ExteriorFeature, type ExteriorStage } from '../../../shared/officeLevel.ts'
import { artItem, Cv, lookOf, type ArtBox, type PersonDir, type PersonPose } from './isoArt.ts'

type RGBA = [number, number, number, number]
type Color = string | RGBA
export type Pt = [number, number]
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
const frac = (n: number) => n - Math.floor(n)
const noise = (x: number, y: number) => (((Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663)) >>> 0) % 997) / 997
const SH = '#5a4a66'
const OUT = '#2e2a40'
const SHADOW: RGBA = [42, 46, 80, 46]
const K = {
  wood: '#d6ae7a',
  woodD: '#a77d52',
  metal: '#5f5866',
  metalL: '#c4bdbc',
  dark: '#433d4c',
  navy: '#3a4a6a',
  white: '#f6f8fb',
  orange: '#f0834e',
  mint: '#8fd6c2',
  yellow: '#edb417',
  blue: '#5aa8d8',
  sky: '#b0d9e4',
  skyL: '#e6f7ff',
  pink: '#f2a7b8',
  gold: '#d8b45a',
  leaf: ['#4a8a4c', '#6fae5c', '#a5cf78'] as const,
}

/** 외관 한 층 높이 (아트 px — 안의 벽 48px보다 낮춰 층수가 잘 보이게) · 평면 1칸이 외관에서 차지하는 칸 */
export const FH = 22
export const PLAN_K = 0.5
/** 출입문 높이 (아트 px) — 외관 사람(miniPerson, 15px)보다 조금 높게 */
const DOOR_H = 17

// ── 상자 (isoArt.ts drawBox와 같은 빛: 윗면 원색 · 왼쪽 아래 12% · 오른쪽 아래 26% 남색 섞기) ──
interface Q {
  u: number
  v: number
  gx: number
  gy: number
  z: number
  face: 'S' | 'E' | 'top'
}
type Paint = Color | null | ((q: Q) => Color | null)
interface Box extends ArtBox {
  top: Paint
  S: Paint
  E: Paint
  /** 옆면 그림자를 섞지 않는다 (유리·빛) */
  flat?: boolean
  /** 윗면 앞모서리 하이라이트를 넣지 않는다 (칸 상자를 이어 붙인 지붕 — 칸마다 줄이 생긴다) */
  noHi?: boolean
}
export const P = (o: Pt, gx: number, gy: number, z: number): Pt => [o[0] + (gx - gy) * HW, o[1] + (gx + gy) * HH - z]
const paintOf = (c: Paint, q: Q) => {
  const f = typeof c === 'function' ? c(q) : c
  return f ? C(f) : null
}

/** 볼록 다각형 칠하기 — 줄마다 걸치는 x 범위만 본다 (isoArt.ts와 같음) */
function fillPoly(cv: Cv, pts: Pt[], colorAt: (px: number, py: number) => RGBA | null) {
  const ys = pts.map((p) => p[1])
  const xs = pts.map((p) => p[0])
  const x0 = Math.max(0, Math.floor(Math.min(...xs)))
  const x1 = Math.min(cv.w, Math.ceil(Math.max(...xs)))
  const y0 = Math.max(0, Math.floor(Math.min(...ys)))
  const y1 = Math.min(cv.h, Math.ceil(Math.max(...ys)))
  const hit: number[] = []
  for (let y = y0; y < y1; y++) {
    const py = y + 0.5
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
    for (let x = Math.max(x0, Math.floor(lo) - 1); x < Math.min(x1, Math.ceil(hi) + 1); x++) {
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

function drawBox(cv: Cv, o: Pt, b: Box) {
  const { x, y, w, d, z, h } = b
  const z1 = z + h
  const side = new Set<number>()
  const sh = (c: RGBA | null, t: number) => (c && !b.flat ? mix(c, SH, t) : c)
  if (h > 0) {
    for (const i of fillPoly(cv, [P(o, x, y + d, z1), P(o, x + w, y + d, z1), P(o, x + w, y + d, z), P(o, x, y + d, z)], (px, py) => {
      const gy = y + d
      const gx = (px - o[0]) / HW + gy
      const zz = (gx + gy) * HH + o[1] - py
      return sh(paintOf(b.S, { u: (gx - x) / w, v: (zz - z) / h, gx, gy, z: zz, face: 'S' }), 0.12)
    }))
      side.add(i)
    for (const i of fillPoly(cv, [P(o, x + w, y, z1), P(o, x + w, y + d, z1), P(o, x + w, y + d, z), P(o, x + w, y, z)], (px, py) => {
      const gx = x + w
      const gy = gx - (px - o[0]) / HW
      const zz = (gx + gy) * HH + o[1] - py
      return sh(paintOf(b.E, { u: (gy - y) / d, v: (zz - z) / h, gx, gy, z: zz, face: 'E' }), 0.26)
    }))
      side.add(i)
  }
  const top = fillPoly(cv, [P(o, x, y, z1), P(o, x + w, y, z1), P(o, x + w, y + d, z1), P(o, x, y + d, z1)], (px, py) => {
    const a = (px - o[0]) / HW
    const s = (py - o[1] + z1) / HH
    const gx = (a + s) / 2
    const gy = (s - a) / 2
    return paintOf(b.top, { u: (gx - x) / w, v: (gy - y) / d, gx, gy, z: z1, face: 'top' })
  })
  if (h > 0 && !b.flat && !b.noHi) for (const i of top) if (side.has(i + cv.w) && cv.has(i)) cv.write(i, mix(cv.read(i), '#ffffff', 0.4))
}

/** 실루엣 외곽선 1px (닿은 색을 외곽선색 쪽으로 72%) */
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
        if (xx >= 0 && yy >= 0 && xx < cv.w && yy < cv.h && solid(yy * cv.w + xx)) n = yy * cv.w + xx
      }
      if (n >= 0) cv.write(i, mix([src[n * 4], src[n * 4 + 1], src[n * 4 + 2], 255], OUT, 0.72))
    }
}

/** isoArt.ts sortBoxes와 같은 규칙 (뒤 → 앞). 꾸밈처럼 개수가 적은 것에만 쓴다 — 건물 칸은 층·대각선 순서로 따로 정렬 */
function sortBoxes<T extends { box: ArtBox }>(items: T[]): T[] {
  const n = items.length
  const behind: number[][] = items.map(() => [])
  const sx = (b: ArtBox) => [b.x - (b.y + b.d), b.x + b.w - b.y]
  const sy = (b: ArtBox) => [(b.x + b.y) * HH - (b.z + b.h), (b.x + b.w + b.y + b.d) * HH - b.z]
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const a = items[i].box
      const b = items[j].box
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
  const order = [...items.keys()].sort((i, j) => items[i].box.x + items[i].box.y + items[i].box.z / 100 - (items[j].box.x + items[j].box.y + items[j].box.z / 100))
  for (const i of order) visit(i, new Set())
  return out
}

// ── 조각(스프라이트): 상자 여럿을 한 장에 그리고 실루엣 외곽선 ──
export interface Sprite {
  cv: Cv
  /** 로컬 (0,0) 칸 꼭짓점 (바닥 높이)의 아트 px */
  o: Pt
  box: ArtBox
}
const bx = (x: number, y: number, w: number, d: number, z: number, h: number, c: Paint, more: Partial<Box> = {}): Box => ({ x, y, w, d, z, h, top: c, S: c, E: c, ...more })
const legs = (x0: number, y0: number, x1: number, y1: number, s: number, h: number, c: Color) =>
  [
    [x0, y0],
    [x1 - s, y0],
    [x0, y1 - s],
    [x1 - s, y1 - s],
  ].map(([x, y]) => bx(x, y, s, s, 0, h, c))

function boxOf(parts: ArtBox[]): ArtBox {
  const x = Math.min(...parts.map((p) => p.x))
  const y = Math.min(...parts.map((p) => p.y))
  const z = Math.min(...parts.map((p) => p.z))
  return { x, y, z, w: Math.max(...parts.map((p) => p.x + p.w)) - x, d: Math.max(...parts.map((p) => p.y + p.d)) - y, h: Math.max(...parts.map((p) => p.z + p.h)) - z }
}

type After = (cv: Cv, at: (x: number, y: number, z: number) => Pt) => void
function sprite(parts: Box[], opts: { extraH?: number; after?: After; shadow?: boolean; noSort?: boolean } = {}): Sprite {
  const box = boxOf(parts)
  const W = Math.ceil(box.x + box.w)
  const D = Math.ceil(box.y + box.d)
  const H = box.z + box.h + (opts.extraH ?? 0)
  const pad = 3
  const x0 = Math.min(0, box.x)
  const y0 = Math.min(0, box.y)
  const cv = new Cv((W + D - x0 - y0) * HW + pad * 2, (W + D) * HH + H + pad * 2 + Math.max(0, -box.z))
  const o: Pt = [(D - x0) * HW + pad, H + pad]
  if (opts.shadow !== false) {
    const g = 0.08
    fillPoly(cv, [P(o, box.x - g, box.y - g, 0), P(o, box.x + box.w + g, box.y - g, 0), P(o, box.x + box.w + g, box.y + box.d + g, 0), P(o, box.x - g, box.y + box.d + g, 0)], () => SHADOW)
  }
  for (const p of opts.noSort ? parts : sortBoxes(parts.map((p) => ({ box: p, p }))).map((x) => x.p)) drawBox(cv, o, p)
  opts.after?.(cv, (x, y, z) => P(o, x, y, z).map(Math.round) as Pt)
  outline(cv)
  return { cv, o, box }
}

/** 부품 좌표를 90°씩 돌린다 (isoArt.ts rotPart와 같은 식). 색만 있는 부품용 */
function rotate(parts: Box[], r: Rot, W: number, D: number): Box[] {
  return parts.map((p) => {
    let q = { x: p.x, y: p.y, w: p.w, d: p.d }
    let w = W
    let d = D
    for (let i = 0; i < r; i++) {
      q = { x: d - q.y - q.d, y: q.x, w: q.d, d: q.w }
      ;[w, d] = [d, w]
    }
    return { ...p, ...q }
  })
}

function blob(cv: Cv, cx: number, cy: number, r: number, pal: readonly string[] = K.leaf) {
  for (let yy = -r; yy <= r; yy++)
    for (let xx = -r; xx <= r; xx++) {
      if (xx * xx + yy * yy > r * r) continue
      const l = (xx + yy) / r
      cv.set(cx + xx, cy + yy, C(l < -0.7 ? pal[2] : l < 0.35 ? pal[1] : pal[0]))
    }
}

// ── 장면: 정렬해 한 장에 ──
interface Obj {
  box: ArtBox
  draw: (cv: Cv, o: Pt) => void
}
const put = (s: Sprite | { cv: Cv; o: Pt; box: ArtBox }, gx: number, gy: number, z = 0): Obj => ({
  box: { ...s.box, x: s.box.x + gx, y: s.box.y + gy, z: s.box.z + z },
  draw: (cv, o) => {
    const [sx, sy] = P(o, gx, gy, z)
    cv.blit(s.cv, Math.round(sx - s.o[0]), Math.round(sy - s.o[1]))
  },
})
/** isoArt.ts 품목을 놓는다 */
const item = (id: string, gx: number, gy: number, r: Rot = 0, z = 0) => put(artItem(id, r), gx, gy, z)

/** 외관 사람 — 건물이 사무실 안의 반 크기(PLAN_K)라 사람도 반 크기로 새로 그린다 (사무실 직원 그림을 줄이면 뭉개진다).
 *  7×13 + 외곽선 1px = 9×15 — 문(DOOR_H 17)·가로등(32)·나무보다 작다. 머리·피부·윗옷·바지 색은 lookOf(n) */
const MINI_HEAD: Record<'front' | 'back', string[]> = {
  front: ['..hhh..', '.hhhhh.', '.hssss.', '.hssss.', '..sss..'],
  back: ['..hhh..', '.hhhhh.', '.hhhhh.', '.hhhhh.', '..sss..'],
}
const MINI_BODY = ['.ccccc.', 'ccccccc', 'ccccccc', 'sppppps']
const MINI_LEGS: Record<'stand' | 'walk1' | 'walk2', string[]> = {
  stand: ['.pp.pp.', '.pp.pp.', '.pp.pp.', '.bb.bb.'],
  walk1: ['.pp.pp.', 'pp...pp', 'pp...pp', 'bb...bb'],
  walk2: ['..ppp..', '..pp...', '..pp...', '..bb...'],
}
export function miniPerson(pose: PersonPose, dir: PersonDir, n: number): Cv {
  const k = lookOf(n)
  const rows = [...MINI_HEAD[dir === 'back' || dir === 'backRight' ? 'back' : 'front'], ...MINI_BODY, ...MINI_LEGS[pose === 'walk1' || pose === 'walk2' ? pose : 'stand']]
  const W = rows[0].length
  const cv = new Cv(W + 2, rows.length + 2)
  const pal: Record<string, Color> = { h: k.h, s: k.s, c: k.c, p: k.p, b: '#3a3442' }
  // 외곽선 먼저, 그 위에 색 (오른쪽 끝 열은 그늘)
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => cv.set(x + 1 + dx, y + 1 + dy, C(OUT)))))
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return
      const isShade = x === W - 1 || row[x + 1] === '.' || row[x + 1] === undefined
      cv.set(x + 1, y + 1, C(isShade && ch !== 'b' ? mix(pal[ch], SH, 0.28) : pal[ch]))
    }),
  )
  return dir === 'frontRight' || dir === 'backRight' ? mirrorCv(cv) : cv
}
function mirrorCv(src: Cv): Cv {
  const cv = new Cv(src.w, src.h)
  cv.blit(src, 0, 0, true)
  return cv
}

/** 외관 사람 한 명 (miniPerson) — front ↙, back ↖, flip이면 ↘·↗ */
const person = (pose: PersonPose, dir: PersonDir, n: number, gx: number, gy: number, flip = false): Obj => ({
  box: { x: gx - 0.2, y: gy - 0.2, w: 0.4, d: 0.4, z: 0, h: 15 },
  draw: (cv, o) => {
    const [px, py] = P(o, gx, gy, 0)
    for (let y = -1; y <= 1; y++) for (let x = -4; x <= 4; x++) if ((x * x) / 16 + y * y <= 1) cv.set(px + x, py + y, SHADOW)
    const p = miniPerson(pose, dir, n)
    cv.blit(p, Math.round(px - p.w / 2), Math.round(py - p.h + 1), flip)
  },
})

// ── 밤: 불빛(따뜻하고 밝은 노랑)만 남기고 남색으로 42% 어둡게 ──
const isLit = (c: RGBA) => c[0] > 150 && c[1] > 120 && c[2] < 150 && c[0] - c[2] > 60
export function nightTint(cv: Cv) {
  for (let i = 0; i < cv.w * cv.h; i++) {
    if (!cv.has(i)) continue
    const c = cv.read(i)
    if (!isLit(c)) cv.write(i, mix(c, '#1a2150', 0.42).slice(0, 3).concat(c[3]) as RGBA)
  }
}

// ── 재질 ──
const winPx = (zz: number, a: number, isNight: boolean, seed: number, wide = 0.56, z0 = 6, z1 = FH - 5): Color | null => {
  const f = frac(a)
  if (f < 0.5 - wide / 2 || f > 0.5 + wide / 2 || zz < z0 || zz > z1) return null
  if (isNight) return noise(Math.floor(a), seed) > 0.35 ? (zz > z1 - 3 ? '#ffe7a8' : '#ffd98a') : '#3a4470'
  return (f - zz * 0.02) % 0.3 < 0.05 ? K.skyL : zz > z1 - 3 ? '#cfe9ee' : K.sky
}
const curtain = (zz: number, a: number, isNight: boolean, seed: number, fin: string): Color => {
  if (zz < 2 || frac(a * 2) < 0.06) return fin
  if (isNight) return noise(Math.floor(a * 2), seed) > 0.3 ? '#ffd98a' : '#34406a'
  return frac(a * 2 - zz * 0.03) < 0.12 ? K.skyL : '#bcdfe6'
}
/** 밤: 불빛으로 잘못 읽히는 따뜻한 재질(벽돌 등)은 미리 어둡게 — nightTint가 불빛만 남기므로 */
const dusk = (c: Color, isNight: boolean): Color => (isNight && isLit(C(c)) ? mix(c, '#1a2150', 0.42) : c)
const brick = (a: number, zz: number) => ((Math.floor(zz / 3) % 2 ? frac(a * 4) : frac(a * 4 + 0.5)) < 0.08 || zz % 3 < 0.6 ? '#f3dccb' : noise(Math.floor(a * 4), Math.floor(zz / 3)) > 0.7 ? '#c97d61' : '#d98f72')
const paving = (q: Q) => (frac(q.gx * 2) < 0.06 || frac(q.gy * 2) < 0.06 ? '#d6cfc2' : '#ebe5da')
const lawn = (q: Q) => (noise(Math.round(q.gx * 16), Math.round(q.gy * 16)) > 0.86 ? '#97bd6e' : '#a8c97e')
const plainLot = (q: Q) => (noise(Math.round(q.gx * 16), Math.round(q.gy * 16)) > 0.9 ? '#c4b8a6' : '#d9cfbf')
/** 차고 마당: 자갈 섞인 흙 */
const gravel = (q: Q) => {
  const n = noise(Math.round(q.gx * 16), Math.round(q.gy * 16))
  return n > 0.9 ? '#dccaa8' : n < 0.12 ? '#b09878' : n > 0.6 && n < 0.68 ? '#c0a888' : '#c8b292'
}
const marble = (q: Q) => ((Math.floor(q.gx) + Math.floor(q.gy)) % 2 ? '#ece7e2' : '#f6f2ee')
const DECK = (q: Q) => (frac(q.gx * 4) < 0.12 ? '#b88c5e' : '#d9b285')
const GRASS = (q: Q) => (noise(Math.round(q.gx * 16), Math.round(q.gy * 16)) > 0.8 ? '#97bd6e' : '#abcb80')
const RAIL: Paint = (q) => (q.v > 0.8 ? K.metal : q.v < 0.12 ? K.metalL : [190, 228, 244, 120])

// ── 꾸밈 조각 (외관 전용) ──
const tree = (r = 7, h = 12) =>
  sprite([bx(0.42, 0.42, 0.16, 0.16, 0, h, K.woodD)], {
    extraH: r * 2 + 4,
    after: (cv, at) => {
      const [cx, cy] = at(0.5, 0.5, h + r - 2)
      blob(cv, cx, cy, r)
      blob(cv, cx - r + 2, cy + 2, r - 3)
      blob(cv, cx + r - 3, cy + 1, r - 3)
    },
  })
const lampSprite = (isNight: boolean) => sprite([bx(0.44, 0.44, 0.12, 0.12, 0, 2, K.metal), bx(0.47, 0.47, 0.06, 0.06, 2, 30, K.metal), bx(0.36, 0.36, 0.28, 0.28, 32, 4, isNight ? '#fff3c4' : '#e6e9ef', { flat: isNight })])
/** 나무 전봇대 + 작은 전등 (E1 흙길 동네) */
const poleSprite = (isNight: boolean) =>
  sprite([bx(0.45, 0.45, 0.1, 0.1, 0, 36, K.woodD), bx(0.2, 0.47, 0.6, 0.06, 31, 1, K.woodD), bx(0.42, 0.56, 0.16, 0.12, 27, 2, isNight ? '#fff3c4' : '#d8d2c4', { flat: isNight })])
const bench = () => sprite([...legs(0.1, 0.3, 0.9, 0.7, 0.06, 4, K.metal), bx(0.08, 0.3, 0.84, 0.4, 4, 1, K.wood), bx(0.08, 0.26, 0.84, 0.06, 5, 5, K.wood)])
/** 차 한 대 (+x로 달림 — 앞모습이 ↘). dir −1이면 180° 돌려 ↖ */
export function carSprite(color: string, isNight: boolean, dir: 1 | -1 = 1): Sprite {
  const lamp = isNight ? '#fff3c4' : '#f6f1d0'
  const parts = [
    bx(0.08, 0.15, 1.84, 0.7, 2, 6, color),
    bx(0.5, 0.2, 0.95, 0.6, 8, 5, '#cfeefa', { top: color, S: (q) => (q.u < 0.06 || q.u > 0.94 ? color : '#cfeefa'), E: (q) => (q.u < 0.08 || q.u > 0.92 ? color : '#cfeefa') }),
    ...[0.3, 1.5].flatMap((x) => [bx(x, 0.1, 0.24, 0.08, 0, 4, K.dark), bx(x, 0.82, 0.24, 0.08, 0, 4, K.dark)]),
    bx(1.9, 0.22, 0.04, 0.14, 4, 2, lamp, { flat: true }),
    bx(1.9, 0.64, 0.04, 0.14, 4, 2, lamp, { flat: true }),
  ]
  return sprite(dir === 1 ? parts : rotate(parts, 2, 2, 1))
}
const bike = () => sprite([bx(0.1, 0.4, 0.8, 0.2, 0, 3, K.metal), bx(0.05, 0.38, 0.9, 0.24, 3, 2, K.blue)])
const hedge = (w: number) => sprite([bx(0, 0.15, w, 0.7, 0, 4, '#d8c7ae'), bx(0.05, 0.2, w - 0.1, 0.6, 4, 5, K.leaf[1], { top: (q) => (noise(Math.round(q.gx * 16), Math.round(q.gy * 16)) > 0.7 ? K.leaf[2] : K.leaf[1]), S: K.leaf[0], E: K.leaf[0] })])
const pylon = () => sprite([bx(0.3, 0.3, 0.4, 0.4, 0, 2, K.metal), bx(0.32, 0.38, 0.36, 0.24, 2, 40, K.dark, { S: (q) => (q.v > 0.7 && q.v < 0.9 && q.u > 0.2 && q.u < 0.8 ? K.orange : q.v > 0.35 && q.v < 0.62 && q.u > 0.2 && q.u < 0.8 ? '#f6f8fb' : K.dark) })])
const flag = () => sprite([bx(0.46, 0.46, 0.08, 0.08, 0, 44, K.metalL), bx(0.5, 0.46, 0.7, 0.04, 34, 10, K.orange, { E: K.orange, flat: true })])
/** 손글씨 입간판 (E1 sign) */
const aSign = () => sprite([bx(0.2, 0.42, 0.6, 0.16, 0, 11, K.wood, { S: (q) => (q.u > 0.12 && q.u < 0.88 && q.v > 0.25 && q.v < 0.9 ? (frac(q.v * 4) < 0.25 && q.u < 0.7 ? '#f6f8fb' : '#3f5a4a') : K.wood) })])

// ── 건물: 평면을 층마다 칸 상자로 쌓는다 ──
/** 칸 표시: '#' 실내 · 'L' 1층 앞 돌출(유리 로비) · 'T' 1층 테라스 · 'O' 위층 야외(옥상 정원) */
type Mark = '#' | 'L' | 'T' | 'O' | null
interface Plan {
  floors: number
  cols: number
  rows: number
  /** 상자(n×n) 한 변 */
  n: number
  mark: (fl: number, x: number, y: number) => Mark
  entrance: { gx: number; gy: number }
}
function planMarks(level: number): Plan {
  const floors = levelRowOf(level).floors
  const ground = planOf(level, 1)
  const n = (ground.box ?? ground).cols
  const grids = Array.from({ length: floors }, (_, fl) => {
    const room = planOf(level, fl + 1)
    const box = room.box ?? room
    return (x: number, y: number): Mark => {
      const k = kindAt(room, x, y)
      if (k === CellKind.None) return null
      if (k === CellKind.Indoor) return '#'
      if (fl > 0) return 'O'
      return y >= box.rows ? 'L' : 'T'
    }
  })
  return { floors, cols: ground.cols, rows: ground.rows, n, mark: (fl, x, y) => grids[fl]?.(x, y) ?? null, entrance: ground.entrance ?? { gx: Math.floor(n / 2), gy: n - 1 } }
}

interface WallCtx {
  fl: number
  /** 층 바닥에서 높이 (px) */
  zz: number
  /** 면을 따라가는 외관 칸 좌표 (창 간격) */
  a: number
  isNight: boolean
}

/** 단계마다 꾸밈 자리를 정하는 틀 — 그 단계 마지막 레벨의 건물 크기로 땅 판을 정하고, 꾸밈은 그 바깥(옆·앞 마당)에 둔다 */
interface Frame {
  /** 건물 왼쪽 뒤 칸 */
  x0: number
  y0: number
  /** 그 단계에서 가장 큰 건물의 오른쪽·앞 끝 */
  x1: number
  y1: number
  GX: number
  GY: number
  /** 인도 줄(앞에서 세 번째 줄)의 뒤 끝 */
  side: number
  stage: ExteriorStage
}
interface Built {
  plan: Plan
  /** 상자 앞변·오른변 (외관 칸, 땅 판 좌표) */
  front: number
  right: number
  /** 출입문 칸 (땅 판 좌표, 왼쪽 뒤 꼭짓점) */
  door: { x: number; y: number }
}
interface DecorCtx {
  f: Frame
  b: Built
  isNight: boolean
  has: (f: ExteriorFeature) => boolean
  add: (o: Obj) => void
  lamp: (gx: number, gy: number) => void
}
interface StageDef {
  name: string
  at: [number, number]
  /** 건물 오른쪽 마당·앞마당 칸 수 */
  right: number
  front: number
  wall: (q: Q, c: WallCtx) => Color
  roof: string
  lot: (q: Q, f: Frame, has: (f: ExteriorFeature) => boolean) => Color | null
  /** 건물에 붙는 것(차양·캐노피·간판·조명) — 건물 로컬 좌표 상자. 건물과 같이 정렬한다 */
  attach?: (b: Built, has: (f: ExteriorFeature) => boolean, isNight: boolean) => Box[]
  /** 맨 위 지붕 설비 (단계마다 다르게 — 넓은 평지붕이 비어 보이지 않게) */
  rooftop?: (b: Built, isNight: boolean) => Box[]
  decor: (d: DecorCtx) => void
}

/** E6·E7 타워: 굵은 돌 기둥 + 금색 테 + 층마다 돌 띠 (E5 유리 사옥과 구별되게 따뜻한 돌·유리) */
const towerWall = (_q: Q, c: WallCtx) => {
  const f = frac(c.a)
  if (c.zz < 2 || c.zz > FH - 3 || f < 0.18) return f > 0.16 && f < 0.18 ? K.gold : c.zz > FH - 3 && c.zz < FH - 2.4 ? '#d8ccb6' : '#e8dfcf'
  if (f > 0.97) return K.gold
  return curtain(c.zz, c.a, c.isNight, c.fl + 20, '#e8dfcf')
}
/** E5 유리 사옥: 청록 유리 커튼월 + 층마다 짙은 띠(스팬드럴) + 가는 멀리언 */
const glassWall = (_q: Q, c: WallCtx) => {
  if (c.zz > FH - 4) return c.zz > FH - 1 ? '#8b97a3' : '#56616f'
  if (frac(c.a * 2) < 0.05) return '#7b8796'
  if (c.isNight) return curtain(c.zz, c.a, true, c.fl + 13, '#7b8796')
  return frac(c.a * 2 - c.zz * 0.04) < 0.1 ? '#d6eeee' : c.zz > FH - 8 ? '#a9d2d0' : '#93c2c2'
}
const woodWall = (_q: Q, c: WallCtx) => (c.zz < 1.5 ? '#7a5634' : (winPx(c.zz, c.a, c.isNight, c.fl + 9, 0.7) ?? (frac(c.a * 3) < 0.12 ? '#b88c5e' : '#d9b285')))
const towerLot = (q: Q, f: Frame) => (q.gy > f.y1 - 0.5 ? marble(q) : null)

/** 줄무늬 차양 (상자 앞변, 로비 돌출 칸은 건너뜀) */
const awning = (b: Built): Box[] => {
  const stripe = (q: Q) => (frac(q.gx * 2.5) < 0.5 ? K.orange : '#ffffff')
  const out: Box[] = []
  for (let x = 0; x < b.plan.n; x++) if (b.plan.mark(0, x, b.plan.n) !== 'L') out.push(bx(x * PLAN_K, b.plan.n * PLAN_K, PLAN_K, 0.35, DOOR_H, 3, stripe, { E: K.orange, noHi: true }))
  return out
}
/** 지붕 앞 왼쪽 조명 간판 (밤에 켜짐) */
const roofSign = (b: Built, isNight: boolean, z: number, y: number, c = K.orange): Box[] => [
  bx(0.4, y, 1.8, 0.12, z, 6, c, { S: (q) => (q.v > 0.25 && q.v < 0.75 && q.u > 0.1 && q.u < 0.9 ? (isNight ? '#ffe7a8' : '#ffffff') : c), flat: isNight }),
  ...[0.6, 1.9].map((x) => bx(x, y + 0.02, 0.06, 0.06, z - 1, 1, K.metal)),
]
/** 출입문 위 캐노피 */
const canopy = (b: Built): Box[] => {
  const [x, y] = [b.door.x, b.door.y + PLAN_K]
  return [bx(x - 0.3, y, PLAN_K + 0.6, 0.45, DOOR_H, 2, '#f6f8fb', { S: K.metalL, E: K.metalL }), bx(x - 0.28, y + 0.38, 0.05, 0.05, 0, DOOR_H, K.metal), bx(x + PLAN_K + 0.23, y + 0.38, 0.05, 0.05, 0, DOOR_H, K.metal)]
}

// ── 지붕 설비: 맨 위층 실내 칸 위에만, 앞 줄(깃발·간판 자리)은 비운다 ──
type RoofKit = 'vent' | 'ac' | 'tank' | 'skylight' | 'solar' | 'hvac' | 'helipad'
/** 평면 칸 cw×cd가 모두 맨 위층 실내인 자리 (뒤에서부터, step 칸 간격) */
function roofSpots(b: Built, cw: number, cd: number, step: number): [number, number][] {
  const { plan } = b
  const fl = plan.floors - 1
  const ok = (x0: number, y0: number) => {
    for (let y = y0; y < y0 + cd; y++) for (let x = x0; x < x0 + cw; x++) if (plan.mark(fl, x, y) !== '#' || plan.mark(fl, x, y + 1) === null || plan.mark(fl, x + 1, y) === null) return false
    return y0 + cd <= plan.rows - 3 || x0 >= 4
  }
  const out: [number, number][] = []
  for (let y = 1; y + cd < plan.rows; y += step) for (let x = 1; x + cw < plan.cols; x += step) if (ok(x, y)) out.push([x, y])
  return out
}
const roofZ = (b: Built) => b.plan.floors * FH
const kit: Record<RoofKit, (X: number, Y: number, z: number, isNight: boolean) => Box[]> = {
  // 둥근 환기팬
  vent: (X, Y, z) => [bx(X + 0.1, Y + 0.1, 0.5, 0.5, z, 3, '#b3aea8', { top: (q) => (Math.hypot(q.u - 0.5, q.v - 0.5) < 0.32 ? (frac((q.u + q.v) * 3) < 0.5 ? '#5f5866' : '#837c88') : '#c9c4be') })],
  // 실외기 (옆면 팬 그릴)
  ac: (X, Y, z) => [bx(X + 0.05, Y + 0.1, 0.8, 0.5, z, 5, '#d4d0ca', { S: (q) => (Math.hypot((q.u - 0.35) * 1.6, q.v - 0.5) < 0.3 ? (frac(q.u * 10) < 0.5 ? '#6e6874' : '#9a949e') : '#d4d0ca'), E: '#bdb8b1' })],
  // 나무 물탱크 (다리 + 띠)
  tank: (X, Y, z) => [...legs(X + 0.1, Y + 0.1, X + 0.8, Y + 0.8, 0.06, 4, K.dark), bx(X + 0.05, Y + 0.05, 0.8, 0.8, z + 4, 11, K.wood, { S: (q) => (frac(q.v * 3) < 0.12 ? K.dark : frac(q.u * 6) < 0.1 ? K.woodD : K.wood), E: (q) => (frac(q.v * 3) < 0.12 ? K.dark : K.woodD), top: '#8a6a48' }), bx(X + 0.3, Y + 0.3, 0.3, 0.3, z + 15, 3, '#8a6a48')].map((p) => (p.z < z ? { ...p, z: p.z + z } : p)),
  // 천창 (밤엔 켜짐)
  skylight: (X, Y, z, isNight) => [bx(X, Y, 0.9, 0.9, z, 2, K.metalL, { top: (q) => (q.u > 0.14 && q.u < 0.86 && q.v > 0.14 && q.v < 0.86 ? (isNight ? '#ffd98a' : frac(q.u - q.v) < 0.2 ? K.skyL : K.sky) : K.metalL), flat: isNight })],
  // 태양광 패널
  solar: (X, Y, z) => [bx(X + 0.05, Y + 0.1, 1.3, 0.8, z, 3, '#3e4f78', { top: (q) => (frac(q.u * 4) < 0.08 || frac(q.v * 3) < 0.1 ? '#93a2c2' : '#3e4f78'), S: K.metal, E: K.metal })],
  // 큰 공조 설비
  hvac: (X, Y, z) => [
    bx(X, Y, 1.4, 0.9, z, 7, '#c9c4be', { S: (q) => (frac(q.u * 8) < 0.15 && q.v > 0.2 ? '#9a949e' : '#c9c4be'), E: '#b3aea8', top: (q) => (Math.hypot((q.u - 0.3) * 1.5, q.v - 0.5) < 0.3 || Math.hypot((q.u - 0.72) * 1.5, q.v - 0.5) < 0.3 ? '#5f5866' : '#d9d5cf') }),
  ],
  // 헬기장 (어두운 판 + 노란 원 + 흰 H)
  helipad: (X, Y, z) => [
    bx(X, Y, 2.5, 2.5, z, 1, '#5f5866', {
      top: (q) => {
        const r = Math.hypot(q.u - 0.5, q.v - 0.5)
        if (r > 0.36 && r < 0.42) return K.yellow
        const H = Math.abs(q.v - 0.5) < 0.2 && (Math.abs(q.u - 0.38) < 0.04 || Math.abs(q.u - 0.62) < 0.04 || (Math.abs(q.u - 0.5) < 0.12 && Math.abs(q.v - 0.5) < 0.035))
        return H ? K.white : '#5f5866'
      },
      flat: true,
    }),
  ],
}
/** 지붕 꾸밈 목록 → 상자. [종류, 평면 칸 크기, 간격, 최대 개수] */
const rooftop =
  (...list: [RoofKit, number, number, number][]) =>
  (b: Built, isNight: boolean): Box[] => {
    const used = new Set<string>()
    const out: Box[] = []
    for (const [k, cells, step, max] of list) {
      let n = 0
      for (const [x, y] of roofSpots(b, cells, cells, step)) {
        if (n >= max) break
        const keys: string[] = []
        for (let yy = y - 1; yy <= y + cells; yy++) for (let xx = x - 1; xx <= x + cells; xx++) keys.push(xx + ',' + yy)
        if (keys.some((key) => used.has(key))) continue
        keys.forEach((key) => used.add(key))
        out.push(...kit[k](x * PLAN_K, y * PLAN_K, roofZ(b), isNight))
        n++
      }
    }
    return out
  }

const STAGES: Record<ExteriorStage, StageDef> = {
  1: {
    name: 'E1 차고',
    rooftop: rooftop(['vent', 2, 3, 2]),
    at: [2, 1],
    right: 3,
    front: 1,
    // 셔터(문 왼쪽) · 블록 벽 · 옆면 높은 창
    wall: (q, c) => {
      if (q.face === 'S' && c.a > 2.2 && c.a < 3.6 && c.zz < DOOR_H + 1) return c.zz % 3 < 1 ? '#8a8f98' : '#b9bec6'
      if (q.face === 'E') {
        const w = winPx(c.zz, c.a, c.isNight, 1, 0.4, 9, 15)
        if (w) return w
      }
      return frac(c.a * 2 + (Math.floor(c.zz / 4) % 2) * 0.5) < 0.05 || c.zz % 4 < 0.5 ? '#c4c1ba' : '#dcd9d2'
    },
    roof: '#9aa0a8',
    lot: gravel,
    decor: ({ f, b, add, lamp, has }) => {
      add(put(bike(), f.x1 + 0.6, f.y0 + 1))
      add(item('prop-trash', f.x1 + 0.4, f.y0 - 0.2))
      lamp(0.5, f.side)
      add(put(tree(6), f.x1 + 1.6, f.side - 1.2))
      if (has('sign')) add(put(aSign(), b.door.x + 0.7, b.front + 0.15))
      add(person('stand', 'front', 1, f.x1 + 0.9, f.y1 - 0.4))
    },
  },
  2: {
    name: 'E2 1층 상가',
    rooftop: rooftop(['ac', 2, 3, 2], ['vent', 2, 3, 1]),
    at: [2, 1],
    right: 3,
    front: 2,
    wall: (_q, c) => (c.zz < 2 ? '#94bfd3' : (winPx(c.zz, c.a, c.isNight, 2, 0.6, 5, 16) ?? '#f4f1ea')),
    roof: '#d4d0c8',
    lot: paving,
    attach: (b, has, isNight) => [...(has('awning') ? awning(b) : []), ...(has('litSign') ? roofSign(b, isNight, FH, b.plan.n * PLAN_K - 0.5) : [])],
    decor: ({ f, add, lamp }) => {
      add(item('prop-plant', f.x0 - 1.4, f.y0 + 2))
      add(item('prop-plant', f.x1 + 0.3, f.y1 - 0.6))
      add(put(bench(), f.x1 + 1.2, f.y1 - 2))
      lamp(0.5, f.side)
      add(put(tree(6), f.x1 + 1.8, f.side - 1.1))
      add(person('stand', 'back', 2, f.x1 + 0.8, f.y1 + 0.6))
    },
  },
  3: {
    name: 'E3 2층 벽돌',
    rooftop: rooftop(['tank', 2, 3, 1], ['vent', 2, 3, 2]),
    at: [2, 1],
    right: 2,
    front: 2,
    wall: (_q, c) => (c.zz < 1.5 ? '#c08a72' : (winPx(c.zz, c.a, c.isNight, c.fl + 5, 0.5) ?? dusk(brick(c.a, c.zz), c.isNight))),
    roof: '#c9b8a8',
    lot: lawn,
    attach: (b, has) => (has('canopy') ? canopy(b) : []),
    decor: ({ f, add, lamp, has }) => {
      add(put(tree(7), 0.2, f.y0 + 1))
      add(put(tree(7), f.x1 + 0.6, f.y0 + 1.5))
      if (has('landscape')) {
        add(put(hedge(3), f.x0 + 5.5, f.y1 + 0.3))
        add(put(hedge(2), 0.1, f.y1 - 1))
        add(put(tree(6), f.x1 + 0.6, f.y1 - 1))
      }
      if (has('planters')) {
        add(item('prop-plant', f.x0 - 1.2, f.y1 + 0.4))
        add(put(bench(), f.x0 + 8.8, f.y1 + 0.6))
      }
      lamp(f.GX - 1.5, f.side)
      add(person('walk1', 'back', 5, f.x0 + 4.6, f.y1 + 1))
    },
  },
  4: {
    name: 'E4 3층 오피스',
    rooftop: rooftop(['skylight', 2, 3, 4], ['ac', 2, 3, 2]),
    at: [1, 1],
    right: 5,
    front: 2,
    wall: woodWall,
    roof: '#c9b8a8',
    // 주차장(오른쪽 마당, 아스팔트 + 흰 선)
    lot: (q, f, has) => (has('parking') && q.gx > f.x1 + 0.7 && q.gy < f.y1 ? (frac(q.gy * 0.5) < 0.04 && q.gx > f.x1 + 1 ? '#f6f8fb' : '#a2a6ba') : lawn(q)),
    decor: ({ f, add, lamp, has, isNight }) => {
      if (has('parking')) [K.mint, K.yellow, K.pink].forEach((c, i) => add(put(carSprite(c, isNight), f.x1 + 1.6, f.y0 + 0.4 + i * 2)))
      if (has('pylon')) add(put(pylon(), 0, f.y1 - 1))
      if (has('garden')) {
        add(put(hedge(4), f.x0 + 6, f.y1 + 0.3))
        add(put(tree(6), f.x1 + 0.5, f.y1 + 0.2))
        add(item('lv-grass-pot', 0, f.y1 + 0.4))
      }
      add(put(tree(7), 0, f.y0))
      lamp(f.x0 + 5, f.side)
      add(person('walk1', 'front', 7, f.x0 + 2.4, f.y1 + 1.2, true))
    },
  },
  5: {
    name: 'E5 4층 유리 사옥',
    rooftop: rooftop(['hvac', 3, 3, 1], ['solar', 3, 3, 6]),
    at: [2, 1],
    right: 3,
    front: 3,
    wall: glassWall,
    roof: '#c4ccd6',
    lot: (q, f, has) => (has('fountain') && Math.hypot(q.gx - (f.x0 + 8), q.gy - (f.y1 + 1.5)) < 1.7 ? null : paving(q)),
    attach: (b, has) => (has('logo') ? [bx(b.plan.n * PLAN_K * 0.5 - 0.8, 0.5, 1.6, 0.14, FH * b.plan.floors, 7, K.white, { S: (q) => (Math.hypot((q.u - 0.5) * 3, q.v - 0.5) < 0.35 ? K.orange : K.white) })] : []),
    decor: ({ f, b, add, lamp, has }) => {
      if (has('fountain')) add(item('lv-fountain', f.x0 + 7, f.y1 + 0.5))
      if (has('rooftop'))
        // 4층 옥상 정원(위층 야외 칸) 양쪽에 잔디 화분
        for (const side of [0, 1]) {
          const x = side ? b.plan.n - 3 : 1
          if (b.plan.mark(3, x, b.plan.n - 2) === 'O') add(item('lv-grass-pot', f.x0 + x * PLAN_K, f.y0 + (b.plan.n - 2) * PLAN_K, 0, FH * 3 + 2))
        }
      add(put(tree(7), 0.2, f.y0 + 1))
      add(put(tree(7), f.x1 + 1, f.y0 + 1))
      add(put(bench(), f.x1 + 0.6, f.y1 + 0.8))
      lamp(1, f.side)
      lamp(f.GX - 2, f.side)
      add(person('stand', 'front', 9, f.x1 + 1.2, f.y1 - 0.5))
    },
  },
  6: {
    name: 'E6 5층 타워',
    rooftop: rooftop(['helipad', 5, 2, 1], ['hvac', 3, 3, 2]),
    at: [2, 1],
    right: 3,
    front: 3,
    wall: towerWall,
    roof: '#efe9dc',
    lot: towerLot,
    attach: (b, has) => (has('nightLights') ? Array.from({ length: Math.floor(b.plan.n / 4) }, (_, i) => bx(i * 4 * PLAN_K + 0.9, b.plan.n * PLAN_K + 0.05, 0.14, 0.1, 0, 2, K.navy)) : []),
    decor: towerDecor,
  },
  7: {
    name: 'E7 캠퍼스',
    rooftop: rooftop(['helipad', 5, 2, 1], ['hvac', 3, 3, 2]),
    at: [2, 1],
    right: 9,
    front: 3,
    wall: towerWall,
    roof: '#efe9dc',
    // 광장 + 별관으로 가는 잔디 산책로 + 연못
    lot: (q, f) => {
      if (Math.hypot((q.gx - (f.x1 + 5)) * 0.8, q.gy - (f.y1 - 2)) < 1.3) return frac(q.gx * 3 + q.gy) < 0.1 ? '#e6f7ff' : '#9fd8ee'
      if (q.gx > f.x1 + 0.5 && q.gy > f.y0 + 4.6 && q.gy < f.y0 + 5.6) return paving(q)
      return towerLot(q, f)
    },
    attach: (b, has) => STAGES[6].attach!(b, has, false),
    decor: (d) => {
      towerDecor(d)
      const { f, add, isNight } = d
      // 2층 원목 별관 + 2층 높이 연결 다리
      const ax = f.x1 + 2.5
      const annexFace = (q: Q) => (q.z < 1.5 ? '#7a5634' : woodWall(q, { fl: Math.floor(q.z / FH), zz: q.z % FH, a: q.face === 'S' ? q.gx : q.gy, isNight }))
      add(put(sprite([bx(0, 0, 5, 4, 0, FH * 2, '#c9b8a8', { S: annexFace, E: annexFace, noHi: true })]), ax, f.y0 + 0.5))
      add(put(sprite([bx(0, 0.3, ax - d.b.right, 0.8, 0, 6, K.metalL, { S: (q) => curtain(q.z, q.gx, isNight, 50, K.metalL), E: K.metalL, top: '#c4ccd6', noHi: true })], { shadow: false }), d.b.right, f.y0 + 0.8, FH + 2))
      add(put(tree(8), ax + 5.5, f.y0 + 4))
      add(put(tree(7), f.x1 + 7.6, f.y1 - 0.6))
      add(put(bench(), ax + 1, f.y0 + 6))
      add(person('walk1', 'front', 13, ax + 2.5, f.y0 + 5.1, true))
      add(person('stand', 'front', 15, f.x1 + 3.4, f.y1 - 2))
    },
  },
}
function towerDecor({ f, add, lamp }: DecorCtx) {
  add(item('lv-fountain', f.x0 + 8, f.y1 + 0.6))
  add(put(flag(), f.x0 - 1.4, f.y1 + 0.6))
  add(put(flag(), f.x1 + 0.6, f.y1 + 0.6))
  add(put(tree(8), 0.2, f.y0 + 1))
  add(put(tree(8), f.x1 + 0.8, f.y0))
  lamp(f.x0 + 3, f.side)
  lamp(f.GX - 4, f.side)
  add(person('walk1', 'front', 11, f.x0 + 11, f.y1 + 1.4, true))
}

/** 단계마다: 그 단계 마지막 레벨 */
const lastLevelOf = (stage: ExteriorStage) => LEVEL_TABLE.reduce((last, r, i) => (r.exterior === stage ? i + 1 : last), 1)

function frameOf(stage: ExteriorStage): Frame {
  const s = STAGES[stage]
  const plan = planMarks(lastLevelOf(stage))
  const [x0, y0] = s.at
  const x1 = x0 + plan.cols * PLAN_K
  const y1 = y0 + plan.rows * PLAN_K
  const GX = Math.ceil(x1 + s.right)
  const GY = Math.ceil(y1 + s.front) + 3
  return { x0, y0, x1, y1, GX, GY, side: GY - 3, stage }
}

/** 회사 깃발: 맨 위층 앞 왼쪽 칸 지붕에 깃대 + 주황 깃발(흰 줄) — 이웃 건물 사이에서 내 사무실이 눈에 띄게 */
function companyFlag(b: Built): Box[] {
  const { plan } = b
  const fl = plan.floors - 1
  let at: [number, number] | null = null
  for (let y = plan.rows - 1; y >= 0 && !at; y--)
    for (let x = 0; x < plan.cols; x++) {
      const m = plan.mark(fl, x, y)
      if (m === '#' || m === 'L') {
        at = [x, y]
        break
      }
    }
  if (!at) return []
  const [X, Y] = [at[0] * PLAN_K + 0.15, at[1] * PLAN_K + 0.15]
  const z = plan.floors * FH
  return [
    bx(X, Y, 0.06, 0.06, z, 30, K.metalL),
    bx(X + 0.06, Y, 0.8, 0.04, z + 18, 12, K.orange, { S: (q) => (q.v > 0.4 && q.v < 0.6 ? K.white : K.orange), E: K.orange, flat: true }),
  ]
}

/** 건물 한 장 (건물 로컬 좌표, 평면 1칸 = PLAN_K). 칸 정렬은 층 → 대각선 순서 (같은 크기 칸 격자라 이 순서면 맞다) */
function buildingSprite(s: StageDef, b: Built, has: (f: ExteriorFeature) => boolean, isNight: boolean): { sprite: Sprite; lights: Pt[] } {
  const { plan } = b
  const k = PLAN_K
  const parts: Box[] = []
  const solid = (fl: number, x: number, y: number) => {
    const m = plan.mark(fl, x, y)
    return m === '#' || m === 'L'
  }
  const deck = (fl: number, x: number, y: number) => {
    const m = plan.mark(fl, x, y)
    return m === 'T' || m === 'O'
  }
  const { entrance } = plan
  for (let fl = 0; fl < plan.floors; fl++)
    for (let y = 0; y < plan.rows; y++)
      for (let x = 0; x < plan.cols; x++) {
        const m = plan.mark(fl, x, y)
        if (!m) continue
        const [X, Y, z] = [x * k, y * k, fl * FH]
        if (m === 'T' || m === 'O') {
          // 테라스(1층 바닥 데크) · 옥상 정원(아래층 지붕 위 잔디) + 바깥 난간
          parts.push(bx(X, Y, k, k, z, 2, m === 'T' ? DECK : GRASS, { S: '#a99880', E: '#a99880', noHi: true }))
          if (!plan.mark(fl, x, y + 1)) parts.push(bx(X, Y + k * 0.9, k, k * 0.1, z + 2, 6, K.metal, { S: RAIL, flat: true }))
          if (!plan.mark(fl, x + 1, y)) parts.push(bx(X + k * 0.9, Y, k * 0.1, k, z + 2, 6, K.metal, { E: RAIL, flat: true }))
        } else {
          const isLobby = m === 'L'
          const h = isLobby ? FH - 4 : FH
          // 안 보이는 칸(위·앞·오른쪽이 모두 실내 칸)은 건너뛴다
          if (!isLobby && plan.mark(fl + 1, x, y) === '#' && plan.mark(fl, x, y + 1) === '#' && plan.mark(fl, x + 1, y) === '#') continue
          const isDoor = fl === 0 && x === entrance.gx && y === entrance.gy
          const face = (q: Q): Color => {
            const zz = q.z - z
            const a = q.face === 'S' ? q.gx : q.gy
            if (isDoor && q.face === 'S' && zz < DOOR_H) return q.u < 0.12 || q.u > 0.88 || zz > DOOR_H - 1.5 || Math.abs(q.u - 0.5) < 0.05 ? K.metalL : isNight ? '#ffd98a' : '#cfeefa'
            if (isLobby) return zz < 1.5 || zz > h - 2 ? K.metalL : curtain(zz, a, isNight, 3, K.metalL)
            return s.wall(q, { fl, zz, a, isNight })
          }
          // 지붕: 맨 위 칸만, 둘레에 파라펫 색
          const rim = mix(s.roof, '#ffffff', 0.4)
          const top = solid(fl + 1, x, y)
            ? s.roof
            : (q: Q): Color => ((q.u < 0.14 && !solid(fl, x - 1, y)) || (q.v < 0.14 && !solid(fl, x, y - 1)) || (q.u > 0.86 && !solid(fl, x + 1, y)) || (q.v > 0.86 && !solid(fl, x, y + 1)) ? rim : s.roof)
          parts.push(bx(X, Y, k, k, z, h, top, { S: face, E: face, noHi: true }))
        }
      }
  parts.push(...(s.attach?.(b, has, isNight) ?? []))
  parts.push(...(s.rooftop?.(b, isNight) ?? []))
  parts.push(...companyFlag(b))
  const key = (p: Box) => Math.floor((p.z + 0.01) / FH) * 1e4 + p.x + p.w / 2 + p.y + p.d / 2
  parts.sort((a, c) => key(a) - key(c))
  const sp = sprite(parts, { noSort: true })
  const lights = has('nightLights') ? parts.filter((p) => p.z === 0 && p.h === 2 && p.w < 0.2).map((p) => P(sp.o, p.x + p.w / 2, p.y + p.d / 2, 0)) : []
  return { sprite: sp, lights }
}

// ── 동네: 사무실이 좋아질수록 주변도 좋아진다 (2026-10-30 대표님 "차고지일 때는 흙길에 휑하게, 사무실이 좋아질수록 주변도 점점 좋아지게") ──
// E1 흙길·마른 풀·빈터·판잣집·나무 전봇대 → E2 낡은 포장길·빈터 조금 → E3 차선 그은 길·횡단보도 → E4 가로수 → E5~ 타일 인도·공원 많은 도심
interface Town {
  /** 큰길·골목: 흙길 · 낡은 포장(차선 없음) · 포장(가운데 점선) */
  road: 'dirt' | 'worn' | 'paved'
  /** 인도: 없음(흙 갓길) · 시멘트 · 타일 */
  walk: 'none' | 'plain' | 'tile'
  /** 빈 땅: 마른 풀·흙 · 덜 자란 풀 · 잔디 */
  ground: 'dry' | 'mixed' | 'lawn'
  /** 블록이 빈터일 확률 · 공원일 확률 */
  vacant: number
  park: number
  /** 이웃이 판잣집·창고(1층)인가 */
  shabby: boolean
  /** 큰길 건너편 가로등 간격 (칸) · 가로수 */
  lampStep: number
  streetTree: boolean
  crosswalk: boolean
  /** 이웃 건물 종류 (블록마다 하나를 뽑는다 — 같은 종류를 여러 번 적으면 그만큼 자주 나온다) */
  kinds: readonly NbKind[]
}
const TOWNS: Record<ExteriorStage, Town> = {
  1: { road: 'dirt', walk: 'none', ground: 'dry', vacant: 0.6, park: 0.04, shabby: true, lampStep: 9, streetTree: false, crosswalk: false, kinds: ['shack', 'shack', 'shed', 'store'] },
  2: { road: 'worn', walk: 'plain', ground: 'mixed', vacant: 0.35, park: 0.08, shabby: true, lampStep: 8, streetTree: false, crosswalk: false, kinds: ['shack', 'shed', 'store', 'store', 'cafe'] },
  3: { road: 'paved', walk: 'plain', ground: 'lawn', vacant: 0.15, park: 0.12, shabby: false, lampStep: 6, streetTree: false, crosswalk: true, kinds: ['brick', 'brick', 'shop', 'villa', 'cafe', 'store'] },
  4: { road: 'paved', walk: 'plain', ground: 'lawn', vacant: 0.05, park: 0.16, shabby: false, lampStep: 5, streetTree: true, crosswalk: true, kinds: ['brick', 'shop', 'villa', 'cafe', 'store', 'glass'] },
  5: { road: 'paved', walk: 'tile', ground: 'lawn', vacant: 0, park: 0.18, shabby: false, lampStep: 5, streetTree: true, crosswalk: true, kinds: ['shop', 'villa', 'glass', 'stone', 'brick', 'cafe'] },
  6: { road: 'paved', walk: 'tile', ground: 'lawn', vacant: 0, park: 0.22, shabby: false, lampStep: 5, streetTree: true, crosswalk: true, kinds: ['glass', 'glass', 'stone', 'shop', 'villa', 'cafe'] },
  7: { road: 'paved', walk: 'tile', ground: 'lawn', vacant: 0, park: 0.24, shabby: false, lampStep: 5, streetTree: true, crosswalk: true, kinds: ['glass', 'stone', 'stone', 'shop', 'villa', 'cafe'] },
}
/** 빈 땅 */
function groundPaint(q: Q, t: Town): Color {
  const nz = noise(Math.round(q.gx * 16), Math.round(q.gy * 16))
  // 흙 얼룩: 두 크기 잡음을 섞고 가장자리를 픽셀 잡음으로 흩어 네모가 안 보이게
  const blot = (noise(Math.floor(q.gx * 1.2), Math.floor(q.gy * 1.2)) + noise(Math.floor(q.gx * 2.6) + 31, Math.floor(q.gy * 2.6) + 17)) / 2 + (nz - 0.5) * 0.3
  if (t.ground === 'dry') return blot > 0.62 ? (nz > 0.7 ? '#c9b38c' : '#d2be98') : nz > 0.8 ? '#a3ad6e' : nz > 0.45 ? '#aeb577' : '#b8bc80'
  if (t.ground === 'mixed') return blot > 0.72 ? (nz > 0.6 ? '#c6b890' : '#cfc39c') : nz > 0.82 ? '#9fbb72' : '#adc67e'
  return lawn(q)
}
/** 차도 (v = 차도 안 가로 위치 0~2, s = 길 방향 좌표) */
function roadPaint(t: Town, v: number, s: number, gx: number, gy: number, isNight: boolean): Color {
  if (t.road === 'dirt') {
    const nz = noise(Math.round(gx * 16), Math.round(gy * 16))
    const rut = Math.abs(v - 0.55) < 0.12 || Math.abs(v - 1.45) < 0.12
    return rut ? '#94765a' : nz > 0.85 ? '#a48868' : '#b09372'
  }
  const base = isNight ? '#6e7290' : '#8e93a8'
  if (t.road === 'worn') return noise(Math.floor(gx * 3), Math.floor(gy * 3)) > 0.82 ? mix(base, '#b8b0a0', 0.35) : mix(base, '#a09c98', 0.35)
  if (Math.abs(v - 1) < 0.05 && frac(s * 0.8) < 0.5) return '#f6e6a0'
  return v < 0.06 || v > 1.94 ? '#a2a6ba' : base
}
/** 인도 (s = 길 방향 좌표, edge = 차도 쪽 연석 줄인가) */
function walkPaint(t: Town, s: number, gx: number, gy: number, edge: boolean): Color {
  if (t.walk === 'none') return noise(Math.round(gx * 16), Math.round(gy * 16)) > 0.8 ? '#b9a07e' : '#c3aa86'
  if (edge) return '#c9c0b2'
  if (t.walk === 'tile') return frac(gx * 4) < 0.08 || frac(gy * 4) < 0.08 ? '#cbbfae' : (Math.floor(gx * 4) + Math.floor(gy * 4)) % 2 ? '#e9e0d1' : '#dfd3c1'
  return frac(s * 2) < 0.06 ? '#cfc8ba' : CURB
}

/** 거리 줄 (부지 앞 GY−3 ~ GY+1, gx는 끝없이): 인도 1 + 차도 2(가운데 점선) + 건너편 인도 1. 거리가 아니면 null */
function streetPaint(q: Q, GY: number, isNight: boolean, t: Town): Color | null {
  const road = GY - 2
  if (q.gy >= road && q.gy < GY) return roadPaint(t, q.gy - road, q.gx, q.gx, q.gy, isNight)
  if (q.gy >= road - 1 && q.gy < road) return walkPaint(t, q.gx, q.gx, q.gy, q.gy > road - 0.12)
  if (q.gy >= GY && q.gy < GY + 1) return walkPaint(t, q.gx, q.gx, q.gy, q.gy < GY + 0.12)
  return null
}

/** 부지 바닥 (두께 없이 땅과 같은 높이): 뒤 = 대지(단계별), 앞쪽 3줄 = 인도 + 차도(횡단보도). 부지 둘레는 연석 한 줄 */
function drawGround(cv: Cv, o: Pt, s: StageDef, f: Frame, has: (f: ExteriorFeature) => boolean, isNight: boolean, crossX: number) {
  const road = f.GY - 2
  const t = TOWNS[f.stage]
  const top = (q: Q): Color => {
    if (t.crosswalk && q.gy >= road && q.gx > crossX - 0.7 && q.gx < crossX + 0.7 && frac(q.gx * 4) < 0.5) return '#f2f2ee'
    const st = streetPaint(q, f.GY, isNight, t)
    if (st) return st
    if (t.walk !== 'none' && (q.gx < 0.08 || q.gy < 0.08 || q.gx > f.GX - 0.08)) return CURB
    return s.lot(q, f, has) ?? groundPaint(q, t)
  }
  drawBox(cv, o, bx(0, 0, f.GX, f.GY, 0, 0, top))
}

/** 구운 땅 판 한 장 + 화면이 쓰는 위치 정보 */
export interface ExteriorBoard {
  /** 땅·건물·꾸밈 (투명 바탕) */
  cv: Cv
  /** 땅 판 (0,0) 칸 꼭짓점(높이 0)의 아트 px */
  o: Pt
  GX: number
  GY: number
  /** 건물 그림과 cv 안 위치 — 누르면 들어가는 범위(불투명 픽셀) */
  building: { cv: Cv; x: number; y: number }
  /** 건물 실루엣 둘레의 빛나는 외곽선 (building.cv와 같은 크기·위치) — 마우스를 올리면 */
  outline: Cv
  /** 건물 층수 — 이웃 건물은 이보다 낮게 */
  floors: number
  /** 출입문 앞면 네 꼭짓점 (cv 아트 px) */
  door: Pt[]
  /** 인도 걷는 줄·먼 차선·가까운 차선의 칸 y (차는 차선 칸 뒤 끝 기준) */
  lanes: { walk: number; far: number; near: number }
  stageName: string
  stage: ExteriorStage
}

const boardCache = new Map<string, ExteriorBoard>()

/** 실루엣 바깥 2px 테두리: 바로 옆은 진한 노랑, 한 칸 더 밖은 옅게 */
function outlineOf(src: Cv): Cv {
  const cv = new Cv(src.w, src.h)
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < src.w && y < src.h && src.has(y * src.w + x)
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      if (solid(x, y)) continue
      let d = 3
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (solid(x + dx, y + dy)) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)))
      if (d === 1) cv.set(x, y, [255, 224, 138, 255])
      else if (d === 2) cv.set(x, y, [255, 224, 138, 110])
    }
  return cv
}

/** 레벨의 외관 땅 판 (레벨·낮밤마다 한 번 굽는다) */
export function artExteriorBoard(level: number, isNight: boolean): ExteriorBoard {
  const row = levelRowOf(level)
  const lv = LEVEL_TABLE.indexOf(row) + 1
  const cacheKey = `${lv}-${isNight ? 'n' : 'd'}`
  const hit = boardCache.get(cacheKey)
  if (hit) return hit
  const stage = row.exterior
  const s = STAGES[stage]
  const f = frameOf(stage)
  const feats = new Set(row.features)
  const has = (x: ExteriorFeature) => feats.has(x)
  const plan = planMarks(lv)
  const b: Built = { plan, front: f.y0 + plan.n * PLAN_K, right: f.x0 + plan.n * PLAN_K, door: { x: f.x0 + plan.entrance.gx * PLAN_K, y: f.y0 + plan.entrance.gy * PLAN_K } }
  const top = plan.floors * FH + 56
  const pad = 24
  const W = (f.GX + f.GY) * HW + pad * 2
  const H = top + (f.GX + f.GY) * HH + pad
  const cv = new Cv(W, H)
  const o: Pt = [f.GY * HW + pad, top]
  drawGround(cv, o, s, f, has, isNight, b.door.x + 0.25)

  const objs: Obj[] = []
  const lamps: Pt[] = []
  const { sprite: bs, lights } = buildingSprite(s, b, has, isNight)
  const buildingObj = put(bs, f.x0, f.y0)
  objs.push(buildingObj)
  const ls = stage === 1 ? poleSprite(isNight) : lampSprite(isNight)
  s.decor({
    f,
    b,
    isNight,
    has,
    add: (ob) => objs.push(ob),
    lamp: (gx, gy) => {
      objs.push(put(ls, gx, gy))
      lamps.push(P(o, gx + 0.5, gy + 0.5, 0))
    },
  })
  for (const ob of sortBoxes(objs)) ob.draw(cv, o)
  if (isNight) {
    nightTint(cv)
    // 가로등 아래 노란 빛 웅덩이 · 야간 조명은 외벽을 비추는 빛기둥
    for (const [lx, ly] of lamps) for (let yy = -6; yy <= 6; yy++) for (let xx = -14; xx <= 14; xx++) if ((xx * xx) / 196 + (yy * yy) / 36 <= 1) cv.set(lx + xx, ly + yy, [255, 230, 150, 60])
    const [bx0, by0] = P(o, f.x0, f.y0, 0)
    for (const [lx, ly] of lights)
      for (let k = 0; k < 26; k++) {
        const w = 1 + Math.floor(k / 6)
        for (let xx = -w; xx <= w; xx++) {
          const [x, y] = [Math.round(bx0 - bs.o[0] + lx + xx), Math.round(by0 - bs.o[1] + ly - 3 - k * 2)]
          if (cv.has(y * cv.w + x)) cv.set(x, y, [255, 214, 120, 50])
        }
      }
  }
  const [sx, sy] = P(o, f.x0, f.y0, 0)
  const bxp = Math.round(sx - bs.o[0])
  const byp = Math.round(sy - bs.o[1])
  const dy = b.door.y + PLAN_K
  const door: Pt[] = [P(o, b.door.x, dy, DOOR_H), P(o, b.door.x + PLAN_K, dy, DOOR_H), P(o, b.door.x + PLAN_K, dy, 0), P(o, b.door.x, dy, 0)]
  const board: ExteriorBoard = { cv, o, GX: f.GX, GY: f.GY, building: { cv: bs.cv, x: bxp, y: byp }, outline: outlineOf(bs.cv), floors: plan.floors, door, lanes: { walk: f.GY - 2.35, far: f.GY - 2, near: f.GY - 1 }, stageName: s.name, stage }
  boardCache.set(cacheKey, board)
  return board
}

// ── 화면 전체 땅: 위에서 내려다본 도시 블록 (하늘·지평선 없음 — 2026-10-25 대표님 "배경 없이 거리로 채우기") ──
// 땅은 부지 칸 좌표를 화면 끝까지 이어 쓴다: 부지 앞 큰길(인도·차도)은 양쪽으로 끝없이, 그 밖은 블록(NB칸)으로 나눠
// 골목길 · 이웃 건물(마당 포함) · 나무 공원 · 잔디. 낮밤은 땅 색(nightTint)과 가로등·창 불빛으로만 나타낸다.
// 이웃 건물은 배경: 단색 벽 + 작은 창, 채도·명도를 낮추고 회사 건물보다 낮게(회사 층수 − 1, 거리 건너편은 2층까지). 눌러도 반응 없다.
// 그리는 층: back(부지 뒤·왼쪽 — 땅 그림에, 부지가 덮는다) · side(부지 오른쪽 — 부지 위에) · front(거리 건너편 — 사람·차 위에).
// side·front는 회사 건물 그림과 겹치지 않을 때까지 층을 낮추고, 1층도 겹치면 비운다 (회사 건물은 늘 다 보이고 누를 수 있다)
const CURB = '#e4ded4'
const NB = 4
const NB_PAD = 0.5
type NbLayer = 'back' | 'side' | 'front'
// ── 이웃 건물: 종류마다 재질·창·문·지붕 설비가 다르다 (2026-10-30 대표님 "주변 건물이 다 똑같이 생겼다 — 종류도 다양하고 퀄리티도 사무실 건물 같았으면") ──
// 판잣집·창고·구멍가게(E1·E2) → 벽돌 다세대·상가·빌라·카페(E3~) → 유리 오피스·석조 빌딩(E4~). 같은 종류도 블록마다 색·곁채·설비가 달라진다.
// 회사 건물이 눈에 띄게: 다 그린 뒤 채도를 조금 낮추고(nbMute), 회사 깃발·핀은 이웃에 없다.
type NbKind = 'shack' | 'shed' | 'store' | 'brick' | 'shop' | 'villa' | 'cafe' | 'glass' | 'stone'
const pick = <T,>(xs: readonly T[], r: number): T => xs[Math.min(xs.length - 1, Math.floor(r * xs.length))]
interface NbCtx {
  w: number
  d: number
  floors: number
  isNight: boolean
  seed: number
  /** 블록마다 고정된 0~1 값 (k로 여러 개) */
  t: (k: number) => number
}
/** 면 칠 함수에 넘기는 값: a = 면을 따라가는 칸 좌표 · zz = 층 바닥에서 높이 · fl = 층 */
type NbFace = (q: Q, a: number, zz: number, fl: number) => Color
const nbFace = (f: NbFace) => (q: Q) => f(q, q.face === 'S' ? q.gx : q.gy, q.z % FH, Math.floor(q.z / FH))
/** 유리 한 칸: 낮엔 하늘 반사 사선, 밤엔 켜짐(노랑)·꺼짐(남색) */
const pane = (a: number, zz: number, isNight: boolean, on: boolean, tint: Color = K.sky): Color =>
  isNight ? (on ? (zz > 12 ? '#ffe7a8' : '#ffd98a') : '#3a4470') : frac(a * 2 - zz * 0.04) < 0.1 ? K.skyL : tint
/** 창 칸마다 밤에 불이 켜졌는가 */
const litAt = (c: NbCtx, a: number, fl: number, rate: number) => noise(Math.floor(a * 2) + fl * 7, c.seed) < rate
/** 창 + 창틀 + 창턱: 한 칸(1칸)에 창 하나, 폭 wide · 높이 z0~z1. 창 밖이면 null */
function nbWindow(c: NbCtx, a: number, zz: number, fl: number, o: { wide: number; z0: number; z1: number; frame: string; sill?: string; rate?: number; per?: number }): Color | null {
  const per = o.per ?? 1
  const f = frac(a * per)
  const [l, r] = [0.5 - o.wide / 2, 0.5 + o.wide / 2]
  if (o.sill && zz >= o.z0 - 2 && zz < o.z0 - 0.8 && f > l - 0.08 && f < r + 0.08) return o.sill
  if (zz < o.z0 - 0.8 || zz > o.z1 + 0.8 || f < l - 0.05 || f > r + 0.05) return null
  if (zz < o.z0 || zz > o.z1 || f < l || f > r || Math.abs(f - 0.5) < 0.025) return o.frame
  return pane(a * per, zz, c.isNight, litAt(c, a * per, fl, o.rate ?? 0.45))
}
/** 1층 앞면 문 (a0부터 0.5칸) — 안 맞으면 null */
const nbDoor = (q: Q, a: number, zz: number, fl: number, a0: number, frame: string, glass: boolean, isNight: boolean): Color | null => {
  if (fl !== 0 || q.face !== 'S' || a < a0 || a > a0 + 0.5 || zz > DOOR_H) return null
  if (a < a0 + 0.05 || a > a0 + 0.45 || zz > DOOR_H - 1.2) return frame
  if (!glass) return Math.abs(a - a0 - 0.37) < 0.03 && Math.abs(zz - 8) < 1 ? K.gold : mix(frame, '#ffffff', 0.18)
  return Math.abs(a - a0 - 0.25) < 0.02 ? frame : isNight ? '#ffd98a' : '#cfeefa'
}
/** 지붕 윗면: 둘레 파라펫 + 안쪽 색 (fill로 무늬) */
const nbRoof = (base: Color, fill?: (q: Q) => Color) => (q: Q): Color => (q.u < 0.06 || q.v < 0.06 || q.u > 0.94 || q.v > 0.94 ? mix(base, '#ffffff', 0.35) : (fill?.(q) ?? base))
/** 줄무늬 차양 (앞면, x0~x1, 높이 z) */
const nbAwning = (x0: number, x1: number, d: number, z: number, c: string): Box[] => [
  bx(x0, d, x1 - x0, 0.32, z, 3, (q) => (frac(q.gx * 2.5) < 0.5 ? c : '#fbf7ef'), { S: (q) => (frac(q.gx * 2.5) < 0.5 ? c : '#fbf7ef'), E: c, noHi: true }),
]
/** 지붕 설비 하나 (지붕 위 빈 자리에) */
const nbKit = (c: NbCtx, kind: RoofKit, H: number): Box[] => {
  const size = kind === 'hvac' || kind === 'solar' ? 1.5 : 1
  if (c.w < size + 0.5 || c.d < size + 0.5) return []
  return kit[kind](0.25 + c.t(11) * (c.w - size - 0.5), 0.25 + c.t(12) * (c.d - size - 0.5), H, c.isNight)
}

const NB_KINDS: Record<NbKind, (c: NbCtx) => Box[]> = {
  // 판잣집: 세로 널빤지 벽(군데군데 덧댄 판) · 작은 창 · 나무문 · 처마가 나온 함석 지붕(골·녹) · 연통 · 가끔 옆 헛간
  shack: (c) => {
    const base = pick(['#b39a7a', '#a9a296', '#bea585', '#a49a8a'], c.t(1))
    const tin = pick(['#8f9692', '#a8775a', '#7f8a90'], c.t(2))
    const shed = c.t(3) > 0.5 && c.w >= 1.75
    const mw = shed ? c.w - 0.6 : c.w
    const H = 17
    const wall = nbFace((q, a, zz) => {
      const door = nbDoor(q, a, zz, 0, 0.25, '#6e5236', false, c.isNight)
      if (door) return door
      if (q.face === 'E' || a > 1) {
        const w = nbWindow(c, a, zz, 0, { wide: 0.32, z0: 7, z1: 12, frame: '#7a5a3c', rate: 0.5 })
        if (w && noise(Math.floor(a), c.seed + 3) > 0.25) return w
      }
      if (zz < 1.2) return mix(base, SH, 0.35)
      const p = frac(a * 6)
      const patch = noise(Math.floor(a * 6), Math.floor(zz / 7) + c.seed) > 0.86
      return p < 0.1 ? mix(base, SH, 0.28) : patch ? mix(base, '#e8dcc4', 0.25) : base
    })
    const ribs = (q: Q): Color => (noise(Math.round(q.gx * 8), Math.round(q.gy * 8) + c.seed) > 0.93 ? '#a8775a' : frac((q.gx + q.gy) * 3) < 0.35 ? mix(tin, SH, 0.18) : tin)
    const parts: Box[] = [
      bx(0.08, 0.08, mw - 0.16, c.d - 0.16, 0, H, tin, { S: wall, E: wall }),
      bx(0, 0, mw, c.d, H, 2, ribs, { S: mix(tin, SH, 0.2), E: mix(tin, SH, 0.3), noHi: true }),
      bx(mw * 0.65, c.d * 0.3, 0.1, 0.1, H + 2, 7, K.metal),
    ]
    if (shed) parts.push(bx(mw, 0.3, 0.55, c.d - 0.6, 0, 11, ribs, { S: wall, E: (q) => (frac(q.gy * 5) < 0.12 ? mix(base, SH, 0.3) : mix(base, SH, 0.1)) }))
    return parts
  },
  // 창고: 골강판 벽(세로 골) · 큰 셔터 · 높은 띠창 · 낮은 골지붕 · 환기팬
  shed: (c) => {
    const base = pick(['#a9b4bb', '#bab3a2', '#a3b2aa', '#c3b7a3'], c.t(1))
    const H = FH
    const sw = Math.min(c.w - 0.5, 1.4)
    const wall = nbFace((q, a, zz) => {
      if (q.face === 'S' && a > 0.25 && a < 0.25 + sw && zz < 16) return zz > 15 || a < 0.3 || a > 0.2 + sw ? K.metal : zz % 2.4 < 0.5 ? mix(K.metalL, SH, 0.25) : K.metalL
      if (q.face === 'E' && zz > 15 && zz < 19 && frac(a * 2) > 0.15 && frac(a * 2) < 0.85) return zz < 15.6 || zz > 18.4 ? K.metal : pane(a, zz, c.isNight, litAt(c, a, 0, 0.3))
      if (zz < 1.4) return mix(base, SH, 0.35)
      return frac(a * 8) < 0.3 ? mix(base, '#ffffff', 0.18) : base
    })
    const roof = mix(base, '#8f9692', 0.5)
    return [bx(0, 0, c.w, c.d, 0, H, nbRoof(roof, (q) => (frac(q.v * c.d * 5) < 0.3 ? mix(roof, SH, 0.15) : roof)), { S: wall, E: wall }), ...nbKit(c, 'vent', H)]
  },
  // 구멍가게·편의점: 1층 통유리 진열창 + 색 간판 띠(흰 글자) · 위층은 창 · 지붕 실외기
  store: (c) => {
    const wallC = pick(['#f1e9db', '#e6ebe6', '#f0e2d6', '#ebe4f0'], c.t(1))
    const band = pick([K.mint, K.blue, K.yellow, '#e98a8a', K.orange], c.t(2))
    const H = c.floors * FH
    const wall = nbFace((q, a, zz, fl) => {
      if (fl === 0 && q.face === 'S') {
        const door = nbDoor(q, a, zz, fl, 0.3, K.metalL, true, c.isNight)
        if (door) return door
        if (zz >= 15 && zz < 20.5) return zz > 16.8 && zz < 18.8 && frac(a * 3) < 0.55 && a > 0.4 && a < c.w - 0.4 ? '#fbf7ef' : band
        if (zz >= 2 && zz < 14.5) return frac(a * 2) < 0.05 || zz > 13.5 ? K.metalL : c.isNight ? '#ffe7a8' : frac(a * 2 - zz * 0.04) < 0.12 ? K.skyL : '#bfe0e6'
        if (zz < 2) return mix(wallC, SH, 0.3)
      }
      return nbWindow(c, a, zz, fl, { wide: 0.45, z0: 7, z1: 15, frame: '#c4bdbc', sill: '#f8f4ee' }) ?? (zz < 1.4 ? mix(wallC, SH, 0.25) : wallC)
    })
    return [bx(0, 0, c.w, c.d, 0, H, nbRoof('#d4d0c8'), { S: wall, E: wall }), ...nbKit(c, 'ac', H)]
  },
  // 벽돌 다세대: 붉은·갈색 벽돌 + 흰 창틀·창턱 + 맨 위 코니스 띠 · 현관문 · 물탱크나 환기팬
  brick: (c) => {
    const dark = c.t(1) > 0.5
    const trim = '#efe6da'
    const H = c.floors * FH
    const wall = nbFace((q, a, zz, fl) => {
      const door = nbDoor(q, a, zz, fl, 0.35, '#7a5634', false, c.isNight)
      if (door) return door
      if (fl === c.floors - 1 && zz > FH - 3) return zz > FH - 1.2 ? mix(trim, SH, 0.15) : trim
      const w = nbWindow(c, a, zz, fl, { wide: 0.46, z0: 6, z1: 15, frame: '#f8f4ee', sill: trim })
      if (w) return w
      if (zz < 1.5) return '#a0705c'
      const b = brick(a, zz)
      return dusk(dark ? mix(b, '#7a4a3c', 0.3) : b, c.isNight)
    })
    return [bx(0, 0, c.w, c.d, 0, H, nbRoof('#c9b8a8'), { S: wall, E: wall }), ...nbKit(c, c.t(4) > 0.45 ? 'tank' : 'vent', H)]
  },
  // 상가 건물: 1층 가게 통유리 + 줄무늬 차양 · 위층 미장 벽에 두 짝 창 · 옥상 광고판
  shop: (c) => {
    const wallC = pick(['#e9e2d6', '#dfe4e6', '#efe0d4', '#e4e0ea'], c.t(1))
    const aw = pick([K.orange, K.mint, '#e98a8a', K.blue, K.yellow], c.t(2))
    const H = c.floors * FH
    const wall = nbFace((q, a, zz, fl) => {
      if (fl === 0 && q.face === 'S') {
        const door = nbDoor(q, a, zz, fl, Math.floor(c.w / 2) + 0.25, K.metal, true, c.isNight)
        if (door) return door
        if (zz < 1.6) return mix(wallC, SH, 0.3)
        if (zz < 15) return frac(a) < 0.06 || zz > 14 ? K.metal : c.isNight ? (frac(a * 0.5 + 0.3) < 0.5 ? '#ffe7a8' : '#ffd98a') : frac(a * 2 - zz * 0.04) < 0.12 ? K.skyL : '#bcdde4'
      }
      if (fl > 0 && zz < 1.4) return mix(wallC, SH, 0.15)
      return nbWindow(c, a, zz, fl, { wide: 0.32, z0: 6, z1: 15, frame: '#8a8f98', per: 2 }) ?? wallC
    })
    const parts: Box[] = [bx(0, 0, c.w, c.d, 0, H, nbRoof('#cfcbc4'), { S: wall, E: wall }), ...nbAwning(0.05, c.w - 0.05, c.d, 15, aw)]
    if (c.floors >= 2 && c.t(3) > 0.4) {
      const bw = Math.min(1.6, c.w - 0.4)
      parts.push(...[0.2, 0.2 + bw - 0.08].map((x) => bx(x, c.d - 0.5, 0.06, 0.06, H, 4, K.metal)), bx(0.2, c.d - 0.52, bw, 0.1, H + 4, 9, aw, { S: (q) => (q.v > 0.3 && q.v < 0.7 && q.u > 0.1 && q.u < 0.9 ? (c.isNight ? '#ffe7a8' : '#fbf7ef') : aw), flat: c.isNight }))
    } else parts.push(...nbKit(c, 'ac', H))
    return parts
  },
  // 빌라: 밝은 미장 벽 + 넓은 창(짙은 틀) · 층마다 발코니(바닥판 + 유리 난간) · 지붕 태양광이나 실외기
  villa: (c) => {
    const wallC = pick(['#f4efe6', '#e9eef0', '#f3e6e2', '#eef0e4'], c.t(1))
    const H = c.floors * FH
    const wall = nbFace((q, a, zz, fl) => {
      const door = nbDoor(q, a, zz, fl, 0.25, '#8a8f98', true, c.isNight)
      if (door) return door
      if (zz < 1.3) return mix(wallC, SH, fl === 0 ? 0.3 : 0.12)
      return nbWindow(c, a, zz, fl, { wide: 0.6, z0: 5, z1: 16, frame: '#8a8f98' }) ?? wallC
    })
    const parts: Box[] = [bx(0, 0, c.w, c.d, 0, H, nbRoof('#d4d0c8'), { S: wall, E: wall })]
    for (let fl = 1; fl < c.floors; fl++)
      for (let x = 0; x + 1 <= c.w; x++) {
        if (noise(x + fl * 5, c.seed + 9) < 0.3) continue
        parts.push(bx(x + 0.08, c.d, 0.84, 0.3, fl * FH, 1.5, '#e4ded4', { S: '#cfc8bb', E: '#cfc8bb' }), bx(x + 0.08, c.d + 0.26, 0.84, 0.04, fl * FH + 1.5, 6, K.metal, { S: RAIL, flat: true }))
      }
    return [...parts, ...nbKit(c, c.t(4) > 0.5 ? 'solar' : 'ac', H)]
  },
  // 카페: 원목 판벽 + 큰 창 · 색 차양 · 앞에 화단 상자 · 지붕 천창
  cafe: (c) => {
    const tone = pick(['#d9b285', '#c8a27a', '#e0c29a'], c.t(1))
    const aw = pick(['#5f9a6a', K.orange, '#c0605a', '#3f5a7a'], c.t(2))
    const H = c.floors * FH
    const wall = nbFace((q, a, zz, fl) => {
      const door = nbDoor(q, a, zz, fl, 0.3, '#7a5634', true, c.isNight)
      if (door) return door
      if (zz < 1.5) return '#7a5634'
      const big = fl === 0 && q.face === 'S'
      return nbWindow(c, a, zz, fl, { wide: big ? 0.78 : 0.5, z0: big ? 3 : 6, z1: big ? 14 : 15, frame: '#7a5634', rate: big ? 0.95 : 0.5 }) ?? (frac(a * 4) < 0.1 ? mix(tone, '#7a5634', 0.4) : tone)
    })
    return [
      bx(0, 0, c.w, c.d, 0, H, nbRoof('#b8a690'), { S: wall, E: wall }),
      ...nbAwning(0.05, c.w - 0.05, c.d, 14, aw),
      bx(0.85, c.d + 0.08, c.w - 0.95, 0.25, 0, 3, K.leaf[1], { top: (q) => (noise(Math.round(q.gx * 16), Math.round(q.gy * 16)) > 0.6 ? K.leaf[2] : K.leaf[1]), S: K.woodD, E: K.woodD }),
      ...nbKit(c, 'skylight', H),
    ]
  },
  // 유리 오피스: 커튼월(청록·하늘·은빛) + 층마다 짙은 띠 + 가는 멀리언 · 1층 로비 · 공조 설비
  glass: (c) => {
    const tint = pick(['#93c2c2', '#9cb6d4', '#b2bccb', '#a3c8b8'], c.t(1))
    const band = pick(['#56616f', '#4f5a6a', '#6a6470'], c.t(2))
    const H = c.floors * FH
    const wall = nbFace((q, a, zz, fl) => {
      const door = nbDoor(q, a, zz, fl, 0.45, K.metalL, true, c.isNight)
      if (door) return door
      if (zz > FH - 4) return zz > FH - 1 ? '#8b97a3' : band
      if (frac(a * 2) < 0.05) return '#7b8796'
      return pane(a, zz, c.isNight, litAt(c, a, fl, 0.5), frac(a * 2 - zz * 0.04) > 0.6 ? mix(tint, '#ffffff', 0.2) : tint)
    })
    return [bx(0, 0, c.w, c.d, 0, H, nbRoof('#c4ccd6'), { S: wall, E: wall, flat: true }), ...nbKit(c, 'hvac', H)]
  },
  // 석조 빌딩: 돌 기둥(1칸마다) 사이 유리 · 층마다 돌 띠 · 맨 위 두꺼운 코니스 · 실외기
  stone: (c) => {
    const stone = pick(['#e3dccd', '#d6d7d6', '#e6d6c4'], c.t(1))
    const H = c.floors * FH
    const wall = nbFace((q, a, zz, fl) => {
      const door = nbDoor(q, a, zz, fl, 0.25, '#6a6470', true, c.isNight)
      if (door) return door
      const f = frac(a)
      if (fl === c.floors - 1 && zz > FH - 4) return zz > FH - 1.5 ? mix(stone, '#ffffff', 0.3) : mix(stone, SH, 0.12)
      if (zz < 2 || zz > FH - 3 || f < 0.2 || f > 0.95) return f > 0.18 && f < 0.2 ? mix(stone, SH, 0.2) : stone
      return frac(a * 2) < 0.06 ? mix(stone, SH, 0.25) : pane(a, zz, c.isNight, litAt(c, a, fl, 0.45), '#a9cfd6')
    })
    return [bx(0, 0, c.w, c.d, 0, H, nbRoof(pick(['#cbc3b4', '#bfc0c0', '#cdbfad'], c.t(1))), { S: wall, E: wall }), ...nbKit(c, 'ac', H)]
  },
}
/** 이웃 건물은 회사 건물보다 조금 흐리게 (불빛은 그대로) */
function nbMute(cv: Cv) {
  for (let i = 0; i < cv.w * cv.h; i++) {
    if (!cv.has(i)) continue
    const c = cv.read(i)
    if (isLit(c)) continue
    const g = Math.round((c[0] + c[1] + c[2]) / 3)
    cv.write(i, [0, 1, 2].map((k) => Math.round(c[k] + (g - c[k]) * 0.18)).concat(c[3]) as RGBA)
  }
}

const mod = (n: number, m: number) => ((n % m) + m) % m
/** 블록 칸 위치 (i: 오른쪽으로, r: 0 이상이면 거리 건너편, 음수면 거리 뒤) */
const nbCellX = (i: number, GX: number) => GX + NB_PAD + i * NB
const nbCellY = (r: number, GY: number) => (r < 0 ? GY - 3.5 + r * NB : GY + 1.5 + r * NB)
/** 땅 칸 → 블록 번호 (큰길·부지 앞 틈이면 null) */
function cellOf(q: Q, GX: number, GY: number): [number, number] | null {
  const i = Math.floor((q.gx - GX - NB_PAD) / NB)
  if (q.gy < GY - 3.5) return [i, Math.floor((q.gy - (GY - 3.5)) / NB)]
  if (q.gy >= GY + 1.5) return [i, Math.floor((q.gy - (GY + 1.5)) / NB)]
  return null
}
/** 골목길: 블록 열·줄 셋 중 하나 (부지를 지나는 열·줄은 없다) */
const isRoadCol = (i: number, GX: number) => mod(i, 3) === 1 && !(nbCellX(i, GX) < GX + 0.5 && nbCellX(i, GX) + NB > -0.5)
const isRoadRow = (r: number, GY: number) => (r >= 0 ? r % 3 === 2 : -r % 3 === 0 && nbCellY(r, GY) + NB <= -0.5)


/** 골목 인도 폭 (칸) — 블록 열 양쪽 끝 */
const ALLEY_WALK = 0.6

/** 골목길 칠 (양쪽 인도 + 가운데 점선 차도, 교차로는 선 없이) */
function alleyPaint(q: Q, GX: number, GY: number, isNight: boolean, t: Town): Color | null {
  const cell = cellOf(q, GX, GY)
  if (!cell) return null
  const [i, r] = cell
  const col = isRoadCol(i, GX)
  const row = isRoadRow(r, GY)
  if (!col && !row) return null
  const u = q.gx - nbCellX(i, GX)
  const v = q.gy - nbCellY(r, GY)
  const walkU = u < ALLEY_WALK || u > NB - ALLEY_WALK
  const walkV = v < ALLEY_WALK || v > NB - ALLEY_WALK
  const walk = (s: number) => walkPaint(t, s, q.gx, q.gy, false)
  // 골목 차도: 가운데 점선은 포장길만, 차도 폭 NB − 2·ALLEY_WALK를 0~2로 맞춘다
  const lane = (w: number, s: number) => roadPaint(t, ((w - ALLEY_WALK) / (NB - 2 * ALLEY_WALK)) * 2, s, q.gx, q.gy, isNight)
  if (col && row) return walkU && walkV ? walk(q.gx + q.gy) : roadPaint(t, 0.3, 0, q.gx, q.gy, isNight)
  if (col) return walkU ? walk(q.gy) : lane(u, q.gy)
  return walkV ? walk(q.gx) : lane(v, q.gx)
}

/** 큰길과 만나는 골목 어귀 — 블록과 큰길 사이 틈(0.5칸)과 큰길 인도를 골목 차도가 지나 큰길 차도에 닿는다(교차로).
 * 큰길 인도 자리는 횡단보도, 틈의 골목 인도는 큰길 인도에 이어진다. 골목 열이 아니면 null */
function alleyMouthPaint(q: Q, GX: number, GY: number, isNight: boolean, t: Town): Color | null {
  const isWalk = (q.gy >= GY - 3 && q.gy < GY - 2) || (q.gy >= GY && q.gy < GY + 1)
  const isGap = (q.gy >= GY - 3.5 && q.gy < GY - 3) || (q.gy >= GY + 1 && q.gy < GY + 1.5)
  if (!isWalk && !isGap) return null
  const i = Math.floor((q.gx - GX - NB_PAD) / NB)
  if (!isRoadCol(i, GX)) return null
  const u = q.gx - nbCellX(i, GX)
  if (u < ALLEY_WALK || u > NB - ALLEY_WALK) return isGap ? walkPaint(t, q.gy, q.gx, q.gy, false) : null
  return t.crosswalk && isWalk && frac(q.gy * 4) < 0.5 ? '#f2f2ee' : roadPaint(t, 0.3, 0, q.gx, q.gy, isNight)
}
/** 칸 gx가 골목 차도 위인가 (큰길 건너편 가로등을 골목 어귀에 세우지 않게) */
const isAlleyRoadX = (gx: number, GX: number) => {
  const i = Math.floor((gx - GX - NB_PAD) / NB)
  const u = gx - nbCellX(i, GX)
  return isRoadCol(i, GX) && u >= ALLEY_WALK - 0.3 && u <= NB - ALLEY_WALK + 0.3
}

interface Nb {
  i: number
  r: number
  gx: number
  gy: number
  w: number
  d: number
  floors: number
  kind: NbKind
  wing: number
  park: boolean
  layer: NbLayer
}

/** 블록 하나의 건물 (블록 번호로 정해지는 값 — 화면 크기가 바뀌어도 같은 건물). maxFloors = 회사 건물 층수 */
function nbAt(i: number, r: number, GX: number, GY: number, maxFloors: number, t: Town): Nb | null {
  const cx = nbCellX(i, GX)
  const cy = nbCellY(r, GY)
  if (cx < GX + 0.5 && cx + NB > -0.5 && cy < GY - 3 && cy + NB > -0.5) return null
  if (isRoadCol(i, GX) || isRoadRow(r, GY)) return null
  const n = (k: number) => noise(i * 37 + k * 101 + 4000, r * 53 + k * 7 + 4000)
  // 빈터 (동네가 덜 자랐을 때)
  if (n(9) < t.vacant) return null
  const w = (t.shabby ? 1.25 : 2) + Math.round(n(1) * 4) * 0.25
  const d = (t.shabby ? 1.25 : 2) + Math.round(n(2) * 4) * 0.25
  const layer: NbLayer = r >= 0 ? 'front' : cx >= GX ? 'side' : 'back'
  // 회사 건물보다 한 층 낮게, 거리 건너편은 거리를 덜 가리게 2층까지
  const cap = t.shabby ? 1 : Math.max(1, maxFloors - 1)
  return {
    i,
    r,
    gx: cx + NB_PAD + n(3) * (NB - NB_PAD * 2 - w),
    gy: cy + NB_PAD + n(4) * (NB - NB_PAD * 2 - d),
    w,
    d,
    floors: 1 + Math.floor(n(5) * (layer === 'front' ? Math.min(2, cap) : cap)),
    kind: pick(t.kinds, n(6)),
    wing: n(7),
    park: n(8) < t.park,
    layer,
  }
}

/** 이웃 건물 한 채 (종류별 그림 — NB_KINDS). 2층 이상이면 가끔 뒤쪽에 한 층 낮은 곁채 */
function nbSprite(nb: Nb, floors: number, isNight: boolean): Sprite {
  const seed = nb.i * 11 + nb.r * 17
  const t = (k: number) => noise(nb.i * 13 + k * 31 + 5000, nb.r * 19 + k * 7 + 5000)
  const hasWing = floors >= 2 && nb.wing > 0.55 && nb.w >= 2.5
  const mw = hasWing ? Math.round(nb.w * 0.6 * 4) / 4 : nb.w
  const draw = NB_KINDS[nb.kind]
  const parts = draw({ w: mw, d: nb.d, floors, isNight, seed, t })
  if (hasWing) {
    const wd = Math.round(nb.d * 0.7 * 4) / 4
    for (const p of draw({ w: nb.w - mw, d: wd, floors: floors - 1, isNight, seed: seed + 5, t })) parts.push({ ...p, x: p.x + mw })
  }
  const sp = sprite(parts)
  nbMute(sp.cv)
  if (isNight) nightTint(sp.cv)
  return sp
}

/** 공원 블록: 나무 두세 그루 */
function nbPark(nb: Nb, isNight: boolean): { sp: Sprite; gx: number; gy: number }[] {
  const n = (k: number) => noise(nb.i * 41 + k * 97 + 900, nb.r * 59 + k * 5 + 900)
  return [0, 1, 2].slice(0, 2 + Math.round(n(0))).map((k) => {
    const sp = tree(Math.round(6 + n(k + 1) * 3))
    if (isNight) nightTint(sp.cv)
    return { sp, gx: nb.gx + n(k + 4) * (nb.w - 0.5), gy: nb.gy + n(k + 7) * (nb.d - 0.5) }
  })
}

interface NbPlaced {
  cv: Cv
  x: number
  y: number
  layer: NbLayer
}
interface NbScene {
  placed: NbPlaced[]
  /** 건물 밑 포장 마당 (블록 키 → 칸 범위) */
  aprons: Map<string, [number, number, number, number]>
  /** 거리 건너편 가로등 발밑 (화면 px) — 밤에 빛 웅덩이 */
  lamps: Pt[]
}
const nbCache = new Map<string, NbScene>()

/** 화면에 보이는 이웃 건물·공원·가로등 (O = 부지 (0,0) 꼭짓점의 화면 px) */
function neighborsOf(W: number, H: number, isNight: boolean, O: Pt, board: ExteriorBoard): NbScene {
  const cacheKey = `${W},${H},${O[0]},${O[1]},${board.GX},${board.GY},${board.stageName},${board.floors},${isNight}`
  const hit = nbCache.get(cacheKey)
  if (hit) return hit
  const { GX, GY } = board
  const town = TOWNS[board.stage]
  const toG = (x: number, y: number) => {
    const a = (x - O[0]) / HW
    const s = (y - O[1]) / HH
    return [(a + s) / 2, (s - a) / 2]
  }
  const corners = [toG(0, 0), toG(W, 0), toG(0, H), toG(W, H)]
  const gxs = corners.map((c) => c[0])
  const gys = corners.map((c) => c[1])
  const i0 = Math.floor((Math.min(...gxs) - GX) / NB) - 1
  const i1 = Math.ceil((Math.max(...gxs) - GX) / NB) + 1
  const r0 = Math.floor((Math.min(...gys) - GY) / NB) - 2
  const r1 = Math.ceil((Math.max(...gys) - GY) / NB) + 1
  // 회사 건물 그림 사각형 (화면 px)
  const bxo = O[0] - board.o[0] + board.building.x
  const byo = O[1] - board.o[1] + board.building.y
  const body = { x0: bxo - 2, y0: byo - 2, x1: bxo + board.building.cv.w + 2, y1: byo + board.building.cv.h + 2 }
  const placed: (NbPlaced & { depth: number })[] = []
  const aprons = new Map<string, [number, number, number, number]>()
  const lamps: Pt[] = []
  const rectOf = (gx: number, gy: number, w: number, d: number, h: number) => ({
    x0: P(O, gx, gy + d, 0)[0],
    x1: P(O, gx + w, gy, 0)[0],
    y0: P(O, gx, gy, 0)[1] - h,
    y1: P(O, gx + w, gy + d, 0)[1],
  })
  const onScreen = (b: ReturnType<typeof rectOf>) => b.x1 > 0 && b.x0 < W && b.y0 < H && b.y1 > 0
  const hitsBody = (b: ReturnType<typeof rectOf>) => b.x1 > body.x0 && b.x0 < body.x1 && b.y1 > body.y0 && b.y0 < body.y1
  const place = (sp: Sprite, gx: number, gy: number, layer: NbLayer) => {
    const [sx, sy] = P(O, gx, gy, 0)
    placed.push({ cv: sp.cv, x: Math.round(sx - sp.o[0]), y: Math.round(sy - sp.o[1]), layer, depth: gx + gy + (sp.box.x + sp.box.w / 2 + sp.box.y + sp.box.d / 2) })
  }
  for (let r = r0; r <= r1; r++)
    for (let i = i0; i <= i1; i++) {
      const nb = nbAt(i, r, GX, GY, board.floors, town)
      if (!nb) {
        // 빈터: 덤불 한두 포기
        if (town.vacant > 0 && !isRoadCol(i, GX) && !isRoadRow(r, GY))
          for (let k = 0; k < 2; k++) {
            const nn = (j: number) => noise(i * 29 + j * 13 + k * 71 + 700, r * 31 + j * 3 + k * 19 + 700)
            if (nn(0) < 0.45) continue
            const gx = nbCellX(i, GX) + 0.6 + nn(1) * (NB - 1.6)
            const gy = nbCellY(r, GY) + 0.6 + nn(2) * (NB - 1.6)
            const b = rectOf(gx, gy, 1, 1, 14)
            if (!onScreen(b) || (gx > -1 && gx < GX + 0.5 && gy > -1 && gy < GY)) continue
            const sp = tree(4, 2)
            if (isNight) nightTint(sp.cv)
            place(sp, gx, gy, r >= 0 ? 'front' : gx >= GX ? 'side' : 'back')
          }
        continue
      }
      if (nb.park) {
        for (const t of nbPark(nb, isNight)) {
          const b = rectOf(t.gx, t.gy, 1, 1, 34)
          if (onScreen(b) && (nb.layer === 'back' || !hitsBody(b))) place(t.sp, t.gx, t.gy, nb.layer)
        }
        continue
      }
      let floors = nb.floors
      let b = rectOf(nb.gx, nb.gy, nb.w, nb.d, floors * FH + 18)
      if (!onScreen(b)) continue
      while (nb.layer !== 'back' && floors > 0 && hitsBody(b)) b = rectOf(nb.gx, nb.gy, nb.w, nb.d, --floors * FH + 18)
      if (floors === 0) continue
      place(nbSprite({ ...nb, floors }, floors, isNight), nb.gx, nb.gy, nb.layer)
      aprons.set(`${i},${r}`, [nb.gx - 0.3, nb.gy - 0.3, nb.gx + nb.w + 0.3, nb.gy + nb.d + 0.3])
    }
  // 큰길 건너편 인도의 가로등 (밤에 거리를 밝힌다)
  // 흙길 동네는 나무 전봇대, 동네가 좋아질수록 가로등이 촘촘해지고 사이에 가로수
  const ls = town.road === 'dirt' ? poleSprite(isNight) : lampSprite(isNight)
  if (isNight) nightTint(ls.cv)
  const step = town.lampStep
  for (let gx = Math.floor(Math.min(...gxs) / step) * step + 2; gx < Math.max(...gxs) + 2; gx += step) {
    const b = rectOf(gx + 0.4, GY + 0.4, 0.2, 0.2, 40)
    if (!onScreen(b) || hitsBody(b) || isAlleyRoadX(gx + 0.5, GX)) continue
    place(ls, gx, GY, 'front')
    lamps.push(P(O, gx + 0.5, GY + 0.5, 0))
  }
  if (town.streetTree)
    for (let gx = Math.floor(Math.min(...gxs) / step) * step + 2 + Math.floor(step / 2); gx < Math.max(...gxs) + 2; gx += step) {
      const b = rectOf(gx + 0.3, GY + 0.3, 0.4, 0.4, 30)
      if (!onScreen(b) || hitsBody(b) || isAlleyRoadX(gx + 0.5, GX)) continue
      const sp = tree(5, 10)
      if (isNight) nightTint(sp.cv)
      place(sp, gx, GY + 0.1, 'front')
    }
  const scene = { placed: placed.sort((a, b) => a.depth - b.depth), aprons, lamps }
  if (nbCache.size > 8) nbCache.clear()
  nbCache.set(cacheKey, scene)
  return scene
}

/** 이웃 건물 마당 칠 (땅 칸 q가 어느 블록의 마당 안이면 포장색) */
function apronPaint(q: Q, scene: NbScene, GX: number, GY: number, t: Town): Color | null {
  const cell = cellOf(q, GX, GY)
  const a = cell && scene.aprons.get(`${cell[0]},${cell[1]}`)
  if (!cell || !a || q.gx < a[0] || q.gy < a[1] || q.gx >= a[2] || q.gy >= a[3]) return null
  // 판잣집 동네는 연석 없는 흙 마당
  if (t.shabby) return gravel(q)
  return q.gx < a[0] + 0.06 || q.gy < a[1] + 0.06 || q.gx > a[2] - 0.06 || q.gy > a[3] - 0.06 ? CURB : (cell[0] + cell[1]) % 2 ? paving(q) : plainLot(q)
}

/** 부지 오른쪽(side) 또는 거리 건너편(front) 이웃 건물·가로등만 투명 바탕 한 장에. side는 부지 위, front는 사람·차 위에 얹는다 */
export function artNeighbors(W: number, H: number, isNight: boolean, boardO: Pt, board: ExteriorBoard, layer: 'side' | 'front'): Cv {
  const cv = new Cv(W, H)
  for (const p of neighborsOf(W, H, isNight, boardO, board).placed) if (p.layer === layer) cv.blit(p.cv, p.x, p.y)
  return cv
}

/** 가로등 아래 노란 빛 웅덩이 (밤) */
const lampPool = (cv: Cv, [lx, ly]: Pt) => {
  for (let yy = -6; yy <= 6; yy++) for (let xx = -14; xx <= 14; xx++) if ((xx * xx) / 196 + (yy * yy) / 36 <= 1) cv.set(lx + xx, ly + yy, [255, 230, 150, 60])
}

/**
 * 화면 전체 땅 (W×H, 하늘 없음): 부지 칸 좌표(boardO = 부지 (0,0) 꼭짓점)를 이어 큰길 · 골목길(큰길과 교차로로 이어짐) · 이웃 건물 마당 · 잔디를 칠하고,
 * 밤이면 부지와 같은 남색으로 어둡게 + 가로등 빛 웅덩이. 그 위에 부지 뒤·왼쪽 이웃 건물(back). 부지 자리는 부지 그림이 덮는다
 */
export function artGround(W: number, H: number, isNight: boolean, boardO: Pt, board: ExteriorBoard): Cv {
  const cv = new Cv(W, H)
  const nbs = neighborsOf(W, H, isNight, boardO, board)
  const { GX, GY } = board
  const town = TOWNS[board.stage]
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = (x + 0.5 - boardO[0]) / HW
      const s = (y + 0.5 - boardO[1]) / HH
      const q: Q = { u: 0, v: 0, gx: (a + s) / 2, gy: (s - a) / 2, z: 0, face: 'top' }
      const isLotEdge = q.gx >= -0.08 && q.gx < GX + 0.08 && q.gy >= -0.08 && q.gy < GY
      cv.write(y * W + x, C(alleyMouthPaint(q, GX, GY, isNight, town) ?? streetPaint(q, GY, isNight, town) ?? (isLotEdge && town.walk !== 'none' ? CURB : (alleyPaint(q, GX, GY, isNight, town) ?? apronPaint(q, nbs, GX, GY, town) ?? groundPaint(q, town)))))
    }
  if (isNight) {
    nightTint(cv)
    for (const p of nbs.lamps) lampPool(cv, p)
  }
  for (const p of nbs.placed) if (p.layer === 'back') cv.blit(p.cv, p.x, p.y)
  return cv
}

/** 내 사무실 표시 핀 (주황 물방울 + 흰 점, 외곽선) — 화면이 건물 위에 띄워 둥실 움직인다 */
export function artPin(): Cv {
  const rows = [
    '..#####..',
    '.#ooooo#.',
    '#ooowooo#',
    '#oowwwoo#',
    '#ooowooo#',
    '#ooooooo#',
    '.#ooooo#.',
    '..#ooo#..',
    '...#o#...',
    '....#....',
  ]
  // 한 칸 = 2×2 px (멀리서도 잘 보이게)
  const cv = new Cv(rows[0].length * 2, rows.length * 2)
  const pal: Record<string, RGBA> = { '#': C(OUT), o: C(K.orange), w: C(K.white) }
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && [0, 1].forEach((dy) => [0, 1].forEach((dx) => cv.set(x * 2 + dx, y * 2 + dy, pal[ch])))))
  return cv
}

/** 걷는 사람 한 프레임 (사무실 직원 그림, 밤이면 어둡게) */
export function artWalker(pose: PersonPose, dir: PersonDir, n: number, isNight: boolean): Cv {
  const p = miniPerson(pose, dir, n)
  if (!isNight) return p
  const cv = new Cv(p.w, p.h)
  cv.blit(p, 0, 0)
  nightTint(cv)
  return cv
}

/** 차 한 대 (밤이면 전조등만 남기고 어둡게) */
export function artCar(color: string, isNight: boolean, dir: 1 | -1): Sprite {
  const s = carSprite(color, isNight, dir)
  if (isNight) nightTint(s.cv)
  return s
}

/** 땅 + 부지 + 이웃 건물을 한 장으로 (다음 레벨 미리보기·시안 생성기) — 부지 둘레에 margin만큼 거리 */
export function artExteriorPreview(level: number, isNight: boolean, margin = 24): Cv {
  const board = artExteriorBoard(level, isNight)
  const W = board.cv.w + margin * 2
  const H = board.cv.h + margin * 2
  const o: Pt = [board.o[0] + margin, board.o[1] + margin]
  const cv = artGround(W, H, isNight, o, board)
  cv.blit(board.cv, margin, margin)
  for (const layer of ['side', 'front'] as const) cv.blit(artNeighbors(W, H, isNight, o, board, layer), 0, 0)
  return cv
}

export const EXTERIOR_STAGE_LEVELS = ([1, 2, 3, 4, 5, 6, 7] as ExteriorStage[]).map((stage) => ({ stage, name: STAGES[stage].name, level: lastLevelOf(stage) }))
