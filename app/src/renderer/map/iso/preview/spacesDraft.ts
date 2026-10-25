// 디자인 보강 1단계 시안 전용 그림 (iso-preview.html?spaces=1, 이디자 · docs/specs/office-iso-spaces.md 2절)
// 앱은 이 파일을 쓰지 않는다. 대표님이 고르면 2단계에서 필요한 조각만 isoArt.ts로 옮긴다.
// 상자 그리기·외곽선·정렬은 isoArt.ts와 같은 규칙(A 파스텔)을 시안용으로 짧게 다시 썼다 — isoArt.ts는 고치지 않는다.
import type { Rot } from '@shared/iso/furniture'
import { HH, HW, SLAB, WALL_H, WALL_T } from '@shared/iso/grid'
import { artItem, artMeetingRoom, artPerson, artRoom, Cv, finishOf, lookOf, seatHeight, type ArtBox, type PersonDir, type PersonPose } from '../isoArt'

type RGBA = [number, number, number, number]
type Color = string | RGBA
type Pt = [number, number]
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
const SH = '#4a4f80'
const OUT = '#2e2a40'
const SHADOW: RGBA = [42, 46, 80, 46]
const K = {
  wood: '#d6ae7a',
  woodL: '#e8c79a',
  woodD: '#a77d52',
  oak: '#d9b285',
  walnut: '#8a5a3c',
  walnutT: '#a06a46',
  ebony: '#6e4630',
  metal: '#5d6380',
  metalL: '#b8bdcb',
  steel: '#cfd6de',
  dark: '#3a3f55',
  paper: '#ffffff',
  white: '#f6f8fb',
  orange: '#f0834e',
  green: '#3fc168',
  mint: '#8fd6c2',
  yellow: '#edb417',
  red: '#e85a4a',
  blue: '#5aa8d8',
  sky: '#a8dcf2',
  skyL: '#e6f7ff',
  pink: '#f2a7b8',
  gold: '#d8b45a',
  stone: '#e4ded4',
  leaf: ['#3f9a58', '#62bd6c', '#9ad87e'] as const,
}

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
export interface Box extends ArtBox {
  top: Paint
  S: Paint
  E: Paint
  /** 옆면 그림자를 섞지 않는다 (유리·빛) */
  flat?: boolean
  /** 윗면 앞모서리 하이라이트를 넣지 않는다 (칸 상자를 이어 붙인 건물 지붕 — 칸마다 줄이 생긴다) */
  noHi?: boolean
}
const P = (o: Pt, gx: number, gy: number, z: number): Pt => [o[0] + (gx - gy) * HW, o[1] + (gx + gy) * HH - z]
const paintOf = (c: Paint, q: Q) => {
  const f = typeof c === 'function' ? c(q) : c
  return f ? C(f) : null
}

function fillPoly(cv: Cv, pts: Pt[], colorAt: (px: number, py: number) => RGBA | null) {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x0 = Math.max(0, Math.floor(Math.min(...xs)))
  const x1 = Math.min(cv.w, Math.ceil(Math.max(...xs)))
  const y0 = Math.max(0, Math.floor(Math.min(...ys)))
  const y1 = Math.min(cv.h, Math.ceil(Math.max(...ys)))
  const hit: number[] = []
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const px = x + 0.5
      const py = y + 0.5
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
  return hit
}

export function drawBox(cv: Cv, o: Pt, b: Box) {
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

/** isoArt.ts sortBoxes와 같은 규칙 (뒤 → 앞) */
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
export interface Obj {
  box: ArtBox
  draw: (cv: Cv, o: Pt) => void
}
/** 조각을 칸 (gx, gy, z)에 놓는다 */
export const put = (s: Sprite | { cv: Cv; o: Pt; box: ArtBox }, gx: number, gy: number, z = 0, extra?: (cv: Cv, o: Pt) => void): Obj => ({
  box: { ...s.box, x: s.box.x + gx, y: s.box.y + gy, z: s.box.z + z },
  draw: (cv, o) => {
    const [sx, sy] = P(o, gx, gy, z)
    cv.blit(s.cv, Math.round(sx - s.o[0]), Math.round(sy - s.o[1]))
    extra?.(cv, o)
  },
})
/** isoArt.ts 품목을 놓는다 */
export const item = (id: string, gx: number, gy: number, r: Rot = 0, z = 0) => put(artItem(id, r), gx, gy, z)

/** 직원 한 명을 칸 위 점에 (front ↙, back ↖, flip이면 ↘·↗) */
function personAt(cv: Cv, o: Pt, pose: PersonPose, dir: PersonDir, n: number, gx: number, gy: number, z: number, flip = false) {
  const p = artPerson(pose, dir, lookOf(n))
  const [sx, sy] = P(o, gx, gy, z)
  cv.blit(p, Math.round(sx - p.w / 2), Math.round(sy - p.h + 1), flip)
}
export const person = (pose: PersonPose, dir: PersonDir, n: number, gx: number, gy: number, flip = false): Obj => ({
  box: { x: gx - 0.2, y: gy - 0.2, w: 0.4, d: 0.4, z: 0, h: 26 },
  draw: (cv, o) => {
    for (let y = -2; y <= 2; y++) for (let x = -6; x <= 6; x++) if ((x * x) / 36 + (y * y) / 4 <= 1) cv.set(P(o, gx, gy, 0)[0] + x, P(o, gx, gy, 0)[1] + y, SHADOW)
    personAt(cv, o, pose, dir, n, gx, gy, 0, flip)
  },
})
/** 의자 + 앉은 직원 (의자는 r0 = 직원이 ↙을 봄 / r1 = ↖ 등받이가 오른쪽) */
export const seated = (chairId: string, gx: number, gy: number, r: Rot, n: number | null): Obj => {
  const sitZ = seatHeight(chairId) ?? 9
  const seat = artItem(chairId, r, 'seat')
  const back = artItem(chairId, r, 'back')
  const dir: PersonDir = r === 0 || r === 3 ? 'front' : 'back'
  const flip = r === 3 || r === 2
  // 등받이가 직원 뒤(−x·−y, r0·r3)면 등받이 → 직원, 앞(r1·r2)이면 좌석 → 직원 → 등받이
  const isBackBehind = r === 0 || r === 3
  return {
    box: { ...seat.box, x: seat.box.x + gx, y: seat.box.y + gy, h: Math.max(seat.box.h, 26) },
    draw: (cv, o) => {
      const [sx, sy] = P(o, gx, gy, 0)
      const blit = (s: { cv: Cv; o: Pt }) => cv.blit(s.cv, Math.round(sx - s.o[0]), Math.round(sy - s.o[1]))
      if (isBackBehind) blit(back)
      blit(seat)
      if (n !== null) personAt(cv, o, 'sit', dir, n, gx + 0.5, gy + 0.5, sitZ, flip)
      if (!isBackBehind) blit(back)
    },
  }
}

/** 방(바닥판 + 뒤쪽 벽 두 면, isoArt.ts artRoom) 위에 조각들을 정렬해 그린 한 장 */
export function roomScene(cols: number, rows: number, level: number, objs: Obj[], under: Obj[] = []): Cv {
  const room = artRoom(cols, rows, finishOf(level))
  const m = 16
  const cv = new Cv(room.cv.w + m * 2, room.cv.h + m * 2)
  cv.blit(room.cv, m, m)
  const o: Pt = [room.o[0] + m, room.o[1] + m]
  for (const u of under) u.draw(cv, o)
  for (const ob of sortBoxes(objs)) ob.draw(cv, o)
  return cv
}

/** 바닥 위 구역 표시 (벽 없는 구역 = 바닥재가 다르다 · 9절 S2 A) */
export const zone = (x: number, y: number, w: number, d: number, paint: (q: Q) => Color, edge: string): Obj => {
  const s = sprite([bx(0, 0, w, d, 0, 0, (q) => (q.u * w < 0.06 || q.v * d < 0.06 || q.u * w > w - 0.06 || q.v * d > d - 0.06 ? edge : paint(q)))], { shadow: false })
  return put(s, x, y)
}
export const ZONE_PAINT = {
  cafe: (q: Q) => (frac(q.gx * 4 + (Math.floor(q.gy * 2) % 2) * 0.5) < 0.06 ? '#b88c5e' : frac(q.gy * 2) < 0.04 ? '#c79c6c' : '#e2b986'),
  lounge: (q: Q) => ((Math.floor(q.gx * 2) + Math.floor(q.gy * 2)) % 2 ? '#c9d9c0' : '#d3e2cb'),
  kitchen: (q: Q) => (frac(q.gx * 2) < 0.06 || frac(q.gy * 2) < 0.06 ? '#c9d0d8' : '#f4f6f8'),
  sky: (q: Q) => (noise(Math.round(q.gx * 16), Math.round(q.gy * 16)) > 0.92 ? '#5a5e88' : '#4a4e78'),
}

// ═══ 지적 3 — 회의실 기본 테이블 6단계 ═══════════════════════
const plank = (base: string, line: string, n = 3) => (q: Q) => (frac(q.v * n) < 0.08 ? line : base)
const banded = (base: string, band: string, L: number) => (q: Q) => (q.u * L < 0.08 || q.u * L > L - 0.08 || q.v < 0.1 || q.v > 0.9 ? band : base)
const cup = (x: number, y: number, c: string = K.paper): Box[] => [bx(x, y, 0.12, 0.12, 14, 3, c)]
const paper = (x: number, y: number): Box[] => [bx(x, y, 0.3, 0.22, 14, 0, K.paper)]
const laptop = (x: number, y: number, isNorth: boolean): Box[] => [bx(x, y, 0.34, 0.24, 14, 1, '#c8ccd6'), bx(x, isNorth ? y : y + 0.2, 0.34, 0.04, 15, 7, isNorth ? '#c8ccd6' : '#c8ccd6', { S: isNorth ? '#c8ccd6' : '#9fe3ff' })]

/** 접이식 원탁 2×2 (Lv.1~2) */
function roundTable(): Sprite {
  const disc = (r: number, c: string) => (q: Q) => (Math.hypot(q.u - 0.5, q.v - 0.5) > r ? null : c)
  return sprite(
    [
      bx(0.62, 0.95, 0.76, 0.1, 0, 1, K.metalL),
      bx(0.95, 0.62, 0.1, 0.76, 0, 1, K.metalL),
      bx(0.94, 0.94, 0.12, 0.12, 1, 10, K.metalL),
      bx(0.06, 0.06, 1.88, 1.88, 11, 0, disc(0.5, '#b9bec9'), { S: null, E: null }),
      bx(0.06, 0.06, 1.88, 1.88, 12, 0, disc(0.49, '#f2f3f6'), { S: null, E: null }),
      ...cup(0.6, 0.5),
      ...cup(1.3, 1.2, K.orange),
      ...paper(1.1, 0.5),
    ],
    { noSort: true },
  )
}
/** 긴 테이블 L×1 — 단계별로 나무·마감만 다르다 */
function longTable(L: number, kind: 'pine' | 'oak' | 'walnut' | 'board'): Sprite {
  const T = {
    pine: { top: plank(K.woodL, '#d8b383'), side: K.wood, leg: K.wood },
    oak: { top: banded(K.oak, '#c79c6c', L), side: '#c79c6c', leg: '#b88c5e' },
    walnut: { top: banded(K.walnutT, K.walnut, L), side: K.walnut, leg: K.metal },
    board: { top: (q: Q) => (Math.abs(q.v - 0.5) < 0.12 && q.u * L > 0.5 && q.u * L < L - 0.5 ? '#3a3f55' : banded('#7a4e34', K.ebony, L)(q)), side: K.ebony, leg: K.ebony },
  }[kind]
  const base: Box[] =
    kind === 'board'
      ? [bx(0.8, 0.3, 1.2, 0.4, 0, 12, T.side), bx(L - 2, 0.3, 1.2, 0.4, 0, 12, T.side)]
      : kind === 'walnut'
        ? [bx(0.3, 0.12, 0.08, 0.76, 0, 12, T.leg), bx(L - 0.38, 0.12, 0.08, 0.76, 0, 12, T.leg), bx(0.3, 0.46, L - 0.6, 0.08, 1, 1, T.leg)]
        : legs(0.1, 0.14, L - 0.1, 0.86, 0.1, 12, T.leg)
  const extras: Box[] = []
  for (let i = 0; i < L; i++) {
    if (kind === 'board') extras.push(bx(i + 0.42, 0.44, 0.16, 0.12, 15, 1, K.metal))
    if (i % 2 === 0) extras.push(...(kind === 'pine' || kind === 'oak' ? paper(i + 0.3, 0.12) : laptop(i + 0.32, 0.1, true)))
    if (i % 3 === 1) extras.push(...cup(i + 0.5, 0.72, i % 2 ? K.orange : K.paper))
  }
  if (kind === 'board') extras.push(bx(L / 2 - 0.3, 0.3, 0.6, 0.4, 15, 2, K.dark), bx(L / 2 - 0.12, 0.42, 0.24, 0.16, 17, 1, K.green))
  return sprite([...base, bx(0.02, 0.06, L - 0.04, 0.88, 12, kind === 'board' ? 3 : 2, T.top, { S: T.side, E: T.side }), ...extras.map((e) => (kind === 'board' ? { ...e, z: e.z + 1 } : e))])
}
/** 강당 단상 5×1 + 뒤 벽 스크린 (Lv.16~20) */
function podium(): Sprite {
  return sprite([
    bx(0, 0, 5, 1, 0, 6, (q) => (frac(q.u * 10) < 0.05 ? K.woodD : K.wood), { S: K.walnutT, E: K.walnutT }),
    bx(0.5, 0.02, 4, 0.05, 18, 26, '#ffffff', { S: (q) => (q.u < 0.02 || q.u > 0.98 || q.v < 0.04 || q.v > 0.96 ? K.dark : q.v > 0.35 && q.v < 0.75 && q.u > 0.15 && q.u < 0.6 ? '#9fe3ff' : q.v > 0.5 && q.u > 0.68 && q.u < 0.86 ? K.orange : '#eef6fb') }),
    bx(3.6, 0.3, 0.56, 0.44, 6, 17, K.walnutT, { top: K.woodL, S: (q) => (Math.abs(q.u - 0.5) < 0.2 && q.v > 0.6 && q.v < 0.8 ? K.gold : K.walnutT) }),
    bx(3.86, 0.44, 0.05, 0.05, 23, 6, K.metal),
  ])
}
/** 강당 의자 한 줄 5석 — 단상(뒤쪽, −y)을 본다: 등받이가 앞쪽(+y). 좌석·등받이 두 장 (앉은 청중을 사이에) */
function hallRow(): { seat: Sprite; back: Sprite } {
  const seat: Box[] = []
  const back: Box[] = []
  for (let i = 0; i < 5; i++) seat.push(bx(i + 0.14, 0.14, 0.72, 0.54, 0, 8, K.metal), bx(i + 0.14, 0.12, 0.72, 0.56, 8, 3, '#d0605a'))
  for (let i = 0; i < 5; i++) back.push(bx(i + 0.14, 0.68, 0.72, 0.18, 8, 15, '#d0605a'))
  for (let i = 0; i <= 5; i++) seat.push(bx(Math.min(i, 4.92), 0.16, 0.08, 0.66, 0, 13, K.metal))
  return { seat: sprite(seat), back: sprite(back, { shadow: false }) }
}

export interface MeetingStage {
  key: string
  name: string
  levels: string
  level: number
  cap: number
  w: number
  d: number
  glass: boolean
  note: string
}
export const MEETING_STAGES: MeetingStage[] = [
  { key: 'folding', name: '접이식', levels: 'Lv.1~2', level: 1, cap: 8, w: 4, d: 4, glass: false, note: '흰 접이식 원탁 2×2 + 접이식 의자 8. 벽 없이 바닥 카펫으로만 구역 표시' },
  { key: 'pine', name: '원목', levels: 'Lv.3~4', level: 3, cap: 10, w: 6, d: 4, glass: false, note: '밝은 소나무 긴 테이블 4×1(판 이음매) + 원목 의자 10' },
  { key: 'oak', name: '오크', levels: 'Lv.5~7', level: 5, cap: 12, w: 7, d: 4, glass: true, note: '오크 5×1(진한 테두리) + 기본 주황 의자 12 · 유리벽 회의실이 처음 생김' },
  { key: 'walnut', name: '월넛', levels: 'Lv.8~9', level: 8, cap: 14, w: 8, d: 4, glass: true, note: '월넛 6×1(금속 다리) + 메쉬 의자 14 · 노트북' },
  { key: 'board', name: '보드룸', levels: 'Lv.10~15', level: 10, cap: 16, w: 9, d: 4, glass: true, note: '흑단 7×1(가운데 가죽 띠·마이크·스피커폰, 받침 다리) + 가죽 의자 16' },
  { key: 'hall', name: '강당', levels: 'Lv.16~20', level: 16, cap: 20, w: 7, d: 7, glass: true, note: '단상 5×1 + 벽 스크린 + 5석 × 4줄(단상을 봄)' },
]
const CHAIR_OF: Record<string, string> = { folding: 'lv-folding-chair', pine: 'chair-wood', oak: 'chair', walnut: 'chair-mesh', board: 'chair-leather' }

/** 회의실 단계 한 장: 레벨의 방 마감 + 회의실 바닥(·유리벽) + 기본 테이블·의자. 직원 몇 명이 앉아 정원 감을 보여 준다 */
export function meetingScene(st: MeetingStage): Cv {
  const doorX = Math.floor(st.w / 2)
  const pieces = artMeetingRoom(st.w, st.d, doorX)
  const floor = pieces.filter((p) => p.kind === 'floor').map((p) => put(p, 0, 0))
  const objs: Obj[] = st.glass ? pieces.filter((p) => p.kind === 'wall').map((p) => put(p, 0, 0)) : []
  let n = 0
  const sit = (id: string, x: number, y: number, r: Rot, isTaken: boolean) => objs.push(seated(id, x, y, r, isTaken ? n++ : null))
  if (st.key === 'hall') {
    objs.push(put(podium(), 1, 0))
    for (let row = 0; row < 4; row++) {
      const { seat, back } = hallRow()
      objs.push(
        put(seat, 1, 2 + row, 0, (cv, o) => {
          // 앉은 청중 몇 명 (뒷모습, 단상을 본다) → 등받이
          for (let i = 0; i < 5; i++) if ((row * 5 + i) % 3 !== 1) personAt(cv, o, 'sit', 'back', row * 5 + i, 1 + i + 0.5, 2 + row + 0.42, 9, true)
          const [sx, sy] = P(o, 1, 2 + row, 0)
          cv.blit(back.cv, Math.round(sx - back.o[0]), Math.round(sy - back.o[1]))
        }),
      )
    }
    objs.push(person('stand', 'front', 7, 4.3, 0.75))
  } else if (st.key === 'folding') {
    const id = CHAIR_OF.folding
    objs.push(put(roundTable(), 1, 1))
    sit(id, 1, 0, 0, true)
    sit(id, 2, 0, 0, false)
    sit(id, 1, 3, 2, true)
    sit(id, 2, 3, 2, false)
    sit(id, 0, 1, 3, true)
    sit(id, 0, 2, 3, false)
    sit(id, 3, 1, 1, false)
    sit(id, 3, 2, 1, true)
  } else {
    const L = st.w - 2
    const id = CHAIR_OF[st.key]
    objs.push(put(longTable(L, st.key as 'pine'), 1, 1))
    for (let i = 0; i < L; i++) {
      sit(id, 1 + i, 0, 0, i % 3 !== 2)
      sit(id, 1 + i, 2, 2, i % 2 === 0)
    }
    sit(id, 0, 1, 3, true)
    sit(id, L + 1, 1, 1, false)
  }
  return roomScene(st.w, st.d, st.level, objs, floor)
}

// ═══ 지적 4·5 — 휴게 공간 ═══════════════════════════════════
/** 낮은 탁자 w×1 (소파 앞) */
const lowTable = (w: number) =>
  sprite([...legs(0.12, 0.2, w - 0.12, 0.8, 0.06, 5, K.woodD), bx(0.06, 0.16, w - 0.12, 0.68, 5, 2, K.woodL, { S: K.wood, E: K.wood }), bx(0.3, 0.36, 0.12, 0.12, 7, 3, K.paper), bx(w - 0.6, 0.3, 0.3, 0.24, 7, 1, K.orange)])
/** 카페 원형 테이블 1×1 */
const bistro = () =>
  sprite([
    bx(0.3, 0.3, 0.4, 0.4, 0, 1, K.metal),
    bx(0.46, 0.46, 0.08, 0.08, 1, 12, K.metal),
    bx(0.08, 0.08, 0.84, 0.84, 13, 1, (q) => (Math.hypot(q.u - 0.5, q.v - 0.5) > 0.5 ? null : K.stone), { S: null, E: null }),
    ...cup(0.35, 0.4, K.paper).map((c) => ({ ...c, z: 14 })),
  ])
/** 세워 두는 메뉴판 1×1 */
const menuBoard = () =>
  sprite([bx(0.2, 0.42, 0.6, 0.12, 0, 26, K.woodD, { S: (q) => (q.u < 0.08 || q.u > 0.92 || q.v > 0.94 || q.v < 0.06 ? K.woodD : q.v > 0.78 ? '#f6e0a0' : frac(q.v * 7) < 0.2 && q.u > 0.18 && q.u < 0.4 + noise(Math.floor(q.v * 7), 1) * 0.4 ? '#f4f1ea' : '#3a4a3e') })])
/** 높은 원형 테이블(탕비실) 1×1 */
const highTable = () => sprite([bx(0.32, 0.32, 0.36, 0.36, 0, 1, K.metal), bx(0.46, 0.46, 0.08, 0.08, 1, 17, K.metal), bx(0.1, 0.1, 0.8, 0.8, 18, 1, (q) => (Math.hypot(q.u - 0.5, q.v - 0.5) > 0.5 ? null : '#f4f1ea'), { S: null, E: null })])

export interface LoungeScene {
  key: string
  title: string
  note: string
  draw: () => Cv
}
export const LOUNGE_SCENES: LoungeScene[] = [
  {
    key: 'lv3',
    title: '기본 세트 ① Lv.2 커피 코너 + Lv.3 휴게 코너 (각 2×2)',
    note: '커피 코너: 커피 선반·정수기·분리수거함 · 휴게 코너: 원룸 소파·낮은 탁자·화분·스탠드',
    draw: () =>
      roomScene(6, 4, 3, [
        item('prop-coffeeCorner', 0, 0),
        item('prop-cooler', 0, 1, 3),
        item('prop-trash', 1, 1),
        seated('lv-studio-sofa', 2, 0, 0, 3),
        put(lowTable(2), 2, 1),
        item('plant', 4, 0),
        item('floor-lamp', 4, 1),
        person('stand', 'back', 5, 1.5, 2.5, true),
        person('walk1', 'front', 8, 3.4, 2.6, true),
      ], [zone(0, 0, 2, 2, ZONE_PAINT.kitchen, '#b8c0ca'), zone(2, 0, 2, 2, ZONE_PAINT.lounge, '#9fb894')]),
  },
  {
    key: 'lv7',
    title: '기본 세트 ② Lv.7 탕비실·휴게실 (각 3×3으로 커짐)',
    note: '탕비실: 주방 3칸·냉장고·정수기·높은 탁자 · 휴게실: 원형 러그·소파·독서 의자·몬스테라·스탠드',
    draw: () =>
      roomScene(7, 4, 7, [
        item('prop-kitchen', 0, 0),
        item('lv-fridge', 0, 1, 3),
        item('prop-cooler', 0, 2, 3),
        put(highTable(), 1, 2),
        person('stand', 'front', 2, 2.5, 2.6),
        item('rug-round', 4, 1),
        seated('sofa-green', 4, 0, 0, 4),
        seated('lv-reading-chair', 6, 1, 1, 6),
        put(lowTable(2), 4, 1),
        item('monstera', 6, 0),
        item('floor-lamp', 6, 2),
      ], [zone(0, 0, 3, 3, ZONE_PAINT.kitchen, '#b8c0ca'), zone(4, 0, 3, 3, ZONE_PAINT.lounge, '#9fb894')]),
  },
  {
    key: 'cafe',
    title: '이후 공간 ① Lv.14 카페 바 (4층)',
    note: '에스프레소 바 3칸 + 바 의자 3 · 카페 테이블 2 · 메뉴판 · 원목 바닥 구역',
    draw: () =>
      roomScene(7, 4, 14, [
        item('lv-espresso-bar', 0, 0),
        seated('lv-bar-stool', 0, 1, 2, null),
        seated('lv-bar-stool', 1, 1, 2, 9),
        seated('lv-bar-stool', 2, 1, 2, null),
        put(bistro(), 4, 1),
        seated('chair-wood', 4, 0, 0, 10),
        seated('chair-wood', 4, 2, 2, null),
        put(bistro(), 6, 1),
        seated('chair-wood', 5, 1, 3, 11),
        seated('chair-wood', 6, 2, 2, null),
        put(menuBoard(), 3, 0),
        item('fig-tree', 6, 0),
      ], [zone(0, 0, 7, 3, ZONE_PAINT.cafe, '#b88c5e')]),
  },
  {
    key: 'sky',
    title: '이후 공간 ② Lv.18 스카이 라운지 (5층)',
    note: 'ㄱ자 라운지 소파 · 페르시안 러그 · 낮은 탁자 · 망원경 · 아크 조명 · 떡갈고무나무 (통유리 벽 앞)',
    draw: () =>
      roomScene(7, 4, 18, [
        seated('lv-lounge-sofa', 0, 0, 0, 12),
        item('rug-persian', 3, 1),
        put(lowTable(2), 3, 1),
        seated('chair-egg', 5, 1, 1, 13),
        item('lv-telescope', 6, 0, 2),
        person('stand', 'back', 14, 5.6, 0.7, true),
        item('arc-lamp', 2, 2),
        item('fig-tree', 3, 0),
      ], [zone(0, 0, 7, 3, ZONE_PAINT.sky, '#3a3e66')]),
  },
]

// ═══ 비정사각 평면 — 칸 표(mask)로 바닥·벽·난간을 만든다 ═══════
// 기호: '#' 업무 바닥 · 'O' 옥상 정원 · 'T' 테라스 · '.' 바닥 없음 (김기획 1-3절과 같은 뜻)
export interface PlanPiece {
  key: string
  name: string
  where: string
}
export const PLAN_PIECES: PlanPiece[] = [
  { key: 'wall', name: '벽 1칸 (뒤쪽 두 방향)', where: '지금 방 벽을 1칸 단위로 자른 것. 바깥 뒤 벽은 지금처럼 방 텍스처에 굽는다' },
  { key: 'inner', name: '안쪽 벽 1칸 (따로 정렬)', where: '깎인 자리의 −x·−y 쪽 경계(ㄷ자 오른쪽 날개, T자 기둥 양옆). 앞에 놓인 가구·직원과 깊이 정렬해야 해서 굽지 않는다' },
  { key: 'end', name: '벽 끝 마구리', where: '벽이 앞쪽에서 끊기는 곳(T자·탑의 뒤 벽 끝). 벽 단면을 벽 윗면색으로' },
  { key: 'post', name: '안쪽 모서리 기둥', where: '안쪽 벽이 꺾이는 곳. 지금 방의 왼쪽 뒤 모서리 기둥과 같은 조각' },
  { key: 'slab', name: '바닥판 옆면 (앞쪽 경계)', where: '깎인 경계 중 +x·+y 쪽. 벽 없이 바닥 두께만 보인다(지금 방 앞변과 같음)' },
  { key: 'glass', name: '실내↔야외 유리벽', where: '야외가 실내 뒤(−x·−y)에 있을 때의 경계(T자 기둥 왼쪽). 반투명이라 안쪽 벽보다 덜 가린다' },
  { key: 'sill', name: '실내↔야외 문턱', where: '야외가 실내 앞에 있을 때의 경계. 앞쪽 벽은 그리지 않으므로 높이 3px 금속 문턱만' },
  { key: 'rail', name: '난간 (낮은 유리 + 금속 손잡이)', where: '테라스·옥상 정원의 바깥 경계 전부(앞쪽 포함). 높이 10px이라 가구를 가리지 않는다' },
  { key: 'outdoor', name: '야외 바닥 2종 (데크·잔디)', where: '테라스 T = 데크, 옥상 정원 O = 잔디 + 디딤돌' },
]

const isFloor = (c: string | undefined) => !!c && c !== '.' && c !== ' '
const isOut = (c: string | undefined) => c === 'O' || c === 'T'
const FLOOR_PAINT: Record<string, (q: Q) => Color> = {
  '#': (q) => (frac(q.gx) < 0.04 || frac(q.gy) < 0.04 ? '#c79c6c' : frac(q.gx * 4 + (Math.floor(q.gy) % 2) * 0.5) < 0.04 ? '#d6ae7a' : '#e2bb88'),
  T: (q) => (frac(q.gx * 3) < 0.1 ? '#a77d52' : '#c79c6c'),
  O: (q) => (Math.hypot(frac(q.gx) - 0.5, frac(q.gy) - 0.5) < 0.22 && (Math.floor(q.gx) + Math.floor(q.gy)) % 3 === 0 ? '#e4ded4' : noise(Math.round(q.gx * 16), Math.round(q.gy * 16)) > 0.85 ? '#8fcf7a' : '#9ad884'),
}
const WALL = { base: '#7a5634', cap: '#f3e6d4', face: (q: Q) => (q.v < 0.06 ? '#7a5634' : frac((q.face === 'S' ? q.gx : q.gy) * 3) < 0.06 ? '#a77d52' : q.v > 0.84 ? '#c79c6c' : '#d9b285') }
const GLASS: Paint = (q) => (q.v > 0.95 || q.v < 0.06 || frac((q.face === 'S' ? q.gx : q.gy) * 2) < 0.05 ? K.metalL : frac(((q.face === 'S' ? q.gx : q.gy) * 3 + q.v) * 1.3) < 0.12 ? [230, 247, 255, 200] : [168, 220, 242, 140])
const RAIL: Paint = (q) => (q.v > 0.8 ? K.metal : q.v < 0.12 ? K.metalL : [190, 228, 244, 120])

/** 평면 한 장: 바닥판(칸마다) + 바깥 뒤 벽(굽는 몫) + 안쪽 벽·유리벽·난간(정렬하는 몫) + 가구 */
export function planScene(mask: string[], objs: Obj[] = [], opts: { highlight?: boolean } = {}): Cv {
  const rows = mask.length
  const cols = Math.max(...mask.map((r) => r.length))
  const at = (x: number, y: number) => mask[y]?.[x]
  const pad = 20
  const cv = new Cv((cols + rows) * HW + pad * 2, (cols + rows) * HH + WALL_H + SLAB + pad * 2)
  const o: Pt = [rows * HW + pad, WALL_H + pad]
  // 1) 바닥판: 칸마다 (뒤 → 앞). 옆면은 앞쪽 경계에서만 보인다
  const cells: [number, number][] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (isFloor(at(x, y))) cells.push([x, y])
  cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]))
  for (const [x, y] of cells) {
    const c = at(x, y)!
    drawBox(cv, o, bx(x, y, 1, 1, -SLAB, SLAB, FLOOR_PAINT[c] ?? FLOOR_PAINT['#'], { S: isOut(c) ? '#8a7a64' : '#a99880', E: isOut(c) ? '#8a7a64' : '#a99880' }))
  }
  // 2) 벽·난간 조각: 칸의 −x·−y 쪽이 바닥이 아니면 벽, 실내↔야외면 유리, 야외 칸은 사방 난간
  const pieces: Obj[] = []
  const isBackLine = (x: number, y: number, side: 'N' | 'W') => (side === 'N' ? y === 0 : x === 0)
  const seg = (b: Box, kind: string): Obj => {
    const s = sprite([b], { shadow: false })
    const hl = opts.highlight && kind !== 'back'
    return {
      box: b,
      draw: (c2, o2) => {
        const [sx, sy] = P(o2, 0, 0, 0)
        c2.blit(s.cv, Math.round(sx - s.o[0]), Math.round(sy - s.o[1]))
        if (hl) {
          const [lx, ly] = P(o2, b.x + b.w / 2, b.y + b.d / 2, b.z + b.h + 6)
          for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (Math.abs(i) + Math.abs(j) <= 2) c2.set(lx + i, ly + j, C(kind === 'inner' ? '#e85a4a' : kind === 'glass' ? '#5aa8d8' : '#edb417'))
        }
      },
    }
  }
  for (const [x, y] of cells) {
    const c = at(x, y)!
    const out = isOut(c)
    for (const side of ['N', 'W'] as const) {
      const nb = side === 'N' ? at(x, y - 1) : at(x - 1, y)
      const isEmpty = !isFloor(nb)
      const box = (h: number, paint: Paint, base: string, top: string, flat = false) =>
        side === 'N' ? bx(x, y - WALL_T, 1, WALL_T, 0, h, top, { S: paint, E: base, flat }) : bx(x - WALL_T, y, WALL_T, 1, 0, h, top, { S: base, E: paint, flat })
      if (out) {
        if (isEmpty) pieces.push(seg(box(10, RAIL, K.metal, K.metal, true), 'rail'))
      } else if (isEmpty) {
        pieces.push(seg(box(WALL_H, WALL.face, WALL.base, WALL.cap), isBackLine(x, y, side) ? 'back' : 'inner'))
      } else if (isOut(nb)) {
        pieces.push(seg(box(WALL_H, GLASS, K.metalL, K.metalL, true), 'glass'))
      }
      // 야외 칸 뒤가 실내면(야외가 실내 앞) 높은 벽 대신 낮은 문턱 — 앞쪽 벽을 그리지 않는 규칙과 같다
      if (out && isFloor(nb) && !isOut(nb)) pieces.push(seg(box(3, K.metalL, K.metal, K.metalL), 'sill'))
    }
    // 야외 칸의 앞쪽(+x·+y) 경계에도 난간
    if (out) {
      if (!isFloor(at(x, y + 1))) pieces.push(seg(bx(x, y + 1 - 0.06, 1, 0.06, 0, 10, K.metal, { S: RAIL, E: K.metal, flat: true }), 'rail'))
      if (!isFloor(at(x + 1, y))) pieces.push(seg(bx(x + 1 - 0.06, y, 0.06, 1, 0, 10, K.metal, { S: K.metal, E: RAIL, flat: true }), 'rail'))
    }
  }
  for (const ob of sortBoxes([...pieces, ...objs])) ob.draw(cv, o)
  return cv
}

/** 김기획 1-3절 평면 (시안용으로 그대로 옮김) */
export const PLANS = {
  lv10f3: {
    title: 'Lv.10 3층 — ㄷ자 (앞 가운데 6×4 안뜰)',
    mask: ['################', '################', '################', '################', '################', '################', '################', '################', '################', '################', '################', '################', '#####......#####', '#####......#####', '#####......#####', '#####......#####'],
  },
  lv17f4: {
    title: 'Lv.17 4층 — T자 + 옥상 정원(O)',
    mask: [
      ...Array.from({ length: 18 }, () => '#####################'),
      'OOOO###########OOOOOO',
      'OOOO###########OOOOOO',
      'OOOO###########OOOOOO',
    ],
  },
}
/** 평면 위 가구 몇 개 — 안쪽 벽 뒤에 가구가 가려지는지 보이게 */
export function planDemoObjs(key: keyof typeof PLANS): Obj[] {
  if (key === 'lv10f3')
    return [
      seated('chair', 12, 13, 3, 1),
      item('desk', 13, 12, 1),
      item('plant', 11, 15),
      item('desk', 2, 13, 0),
      seated('chair', 2, 14, 2, 2),
      item('lv-pingpong', 6, 8),
      item('plant', 9, 10),
      person('walk1', 'front', 3, 10.3, 11.3, true),
    ]
  return [item('lv-bbq', 0, 19), item('lv-hammock', 17, 19), item('lv-grass-pot', 15, 20), item('lv-grass-pot', 3, 20), seated('chair-wood', 1, 20, 2, 5), person('stand', 'front', 6, 18.5, 18.6), item('desk', 6, 18, 0), seated('chair', 6, 19, 2, 4)]
}

// ═══ 지적 1 — 외관 디오라마 E1~E7 ═══════════════════════════
// 하늘 배경 위에 떠 있는 땅 한 판(칸 사무실 방처럼). 건물은 층 평면(김기획 1-3)을 줄여 쌓는다. 길·인도·나무·차·사람도 같은 상자 그림
const FH = 22 // 외관 한 층 높이 (아트 px)
interface Stage {
  stage: number
  name: string
  levels: string
  GX: number
  GY: number
  /** 건물 왼쪽 뒤 칸 */
  at: [number, number]
  /** 층별 평면 ('#' 실내, 'L' 로비 돌출(1층 높이 유리), 'T' 테라스, 'O' 옥상 정원은 아래층 지붕) */
  floors: string[][]
  wall: (q: Q, fl: number, zz: number, a: number, isNight: boolean) => Color
  roof: string
  lot: (q: Q) => Color | null
  extra: (add: (o: Obj) => void, s: Stage, isNight: boolean) => void
  note: string
}
const winPx = (zz: number, a: number, isNight: boolean, seed: number, wide = 0.56, z0 = 6, z1 = FH - 5): Color | null => {
  const f = frac(a)
  if (f < 0.5 - wide / 2 || f > 0.5 + wide / 2 || zz < z0 || zz > z1) return null
  if (isNight) return noise(Math.floor(a), seed) > 0.35 ? (zz > z1 - 3 ? '#ffe7a8' : '#ffd98a') : '#3a4470'
  return (f - zz * 0.02) % 0.3 < 0.05 ? K.skyL : zz > z1 - 3 ? '#cfeefa' : K.sky
}
const curtain = (zz: number, a: number, isNight: boolean, seed: number, fin: string): Color => {
  if (zz < 2 || frac(a * 2) < 0.06) return fin
  if (isNight) return noise(Math.floor(a * 2), seed) > 0.3 ? '#ffd98a' : '#34406a'
  return frac(a * 2 - zz * 0.03) < 0.12 ? K.skyL : '#b8e2f4'
}
const brick = (a: number, zz: number) => (Math.floor(zz / 3) % 2 ? frac(a * 4) : frac(a * 4 + 0.5)) < 0.08 || zz % 3 < 0.6 ? '#fbe9df' : noise(Math.floor(a * 4), Math.floor(zz / 3)) > 0.7 ? '#ecbaa6' : '#f2c6b2'
const paving = (q: Q) => (frac(q.gx * 2) < 0.06 || frac(q.gy * 2) < 0.06 ? '#d6cfc2' : '#ebe5da')
const lawn = (q: Q) => (noise(Math.round(q.gx * 16), Math.round(q.gy * 16)) > 0.86 ? '#8fcf7a' : '#9ad884')

const tree = (r = 7, h = 12) =>
  sprite([bx(0.42, 0.42, 0.16, 0.16, 0, h, '#a77d52')], {
    extraH: r * 2 + 4,
    after: (cv, at) => {
      const [cx, cy] = at(0.5, 0.5, h + r - 2)
      blob(cv, cx, cy, r)
      blob(cv, cx - r + 2, cy + 2, r - 3)
      blob(cv, cx + r - 3, cy + 1, r - 3)
    },
  })
const lamp = (isNight: boolean) =>
  sprite([bx(0.44, 0.44, 0.12, 0.12, 0, 2, K.metal), bx(0.47, 0.47, 0.06, 0.06, 2, 30, K.metal), bx(0.36, 0.36, 0.28, 0.28, 32, 4, isNight ? '#fff3c4' : '#e6e9ef', { flat: isNight })])
const bench = () => sprite([...legs(0.1, 0.3, 0.9, 0.7, 0.06, 4, K.metal), bx(0.08, 0.3, 0.84, 0.4, 4, 1, K.wood), bx(0.08, 0.26, 0.84, 0.06, 5, 5, K.wood)])
const car = (c: string, isNight: boolean, alongX = true) => {
  const parts = [
    bx(0.08, 0.15, 1.84, 0.7, 2, 6, c, { top: c }),
    bx(0.5, 0.2, 0.95, 0.6, 8, 5, '#cfeefa', { top: c, S: (q) => (q.u < 0.06 || q.u > 0.94 ? c : '#cfeefa'), E: (q) => (q.u < 0.08 || q.u > 0.92 ? c : '#cfeefa') }),
    ...[0.3, 1.5].flatMap((x) => [bx(x, 0.1, 0.24, 0.08, 0, 4, K.dark), bx(x, 0.82, 0.24, 0.08, 0, 4, K.dark)]),
    bx(1.9, 0.22, 0.04, 0.14, 4, 2, isNight ? '#fff3c4' : '#f6f1d0', { flat: true }),
    bx(1.9, 0.64, 0.04, 0.14, 4, 2, isNight ? '#fff3c4' : '#f6f1d0', { flat: true }),
  ]
  return sprite(alongX ? parts : rotate(parts, 1, 2, 1))
}
const hedge = (w: number) => sprite([bx(0, 0.15, w, 0.7, 0, 4, '#d8c7ae'), bx(0.05, 0.2, w - 0.1, 0.6, 4, 5, K.leaf[1], { top: (q) => (noise(Math.round(q.gx * 16), Math.round(q.gy * 16)) > 0.7 ? K.leaf[2] : K.leaf[1]), S: K.leaf[0], E: K.leaf[0] })])
const pylon = () => sprite([bx(0.3, 0.3, 0.4, 0.4, 0, 2, K.metal), bx(0.32, 0.38, 0.36, 0.24, 2, 40, K.dark, { S: (q) => (q.v > 0.7 && q.v < 0.9 && q.u > 0.2 && q.u < 0.8 ? K.orange : q.v > 0.35 && q.v < 0.62 && q.u > 0.2 && q.u < 0.8 ? '#f6f8fb' : K.dark) })])
const flag = () => sprite([bx(0.46, 0.46, 0.08, 0.08, 0, 44, K.metalL), bx(0.5, 0.46, 0.7, 0.04, 34, 10, K.orange, { E: K.orange, flat: true })])

/** 땅 판: 뒤 = 대지(단계별), 앞쪽 3줄 = 인도 1 + 차도 2 (횡단보도 포함). 두께 6px 흙 */
function ground(s: Stage, isNight: boolean): Sprite {
  const { GX, GY } = s
  const road = GY - 2
  const top = (q: Q): Color => {
    if (q.gy >= road) {
      const v = q.gy - road
      if (q.gx > GX - 3.2 && q.gx < GX - 1.8 && frac(q.gx * 4) < 0.5) return '#f2f2ee'
      if (Math.abs(v - 1) < 0.05 && frac(q.gx * 0.8) < 0.5) return '#f6e6a0'
      return v < 0.06 || v > 1.94 ? '#a2a6ba' : isNight ? '#6e7290' : '#8e93a8'
    }
    if (q.gy >= road - 1) return frac(q.gx * 2) < 0.06 ? '#cfc8ba' : q.gy > road - 0.12 ? '#c9c0b2' : '#e4ded4'
    return s.lot(q) ?? lawn(q)
  }
  return sprite([bx(0, 0, GX, GY, -6, 6, top, { S: '#b48e64', E: '#9a7a56' })], { shadow: false })
}

/** 건물: 층 평면을 칸 상자로 쌓아 한 장으로 (외곽선은 건물 실루엣에만). 아래층이 없는 칸은 기둥(필로티)을 세운다 */
function building(s: Stage, isNight: boolean): Obj[] {
  const parts: Box[] = []
  const solid = (fl: number, x: number, y: number) => !!s.floors[fl]?.[y]?.[x]?.match(/[#L]/)
  s.floors.forEach((rows, fl) => {
    rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === '.' || c === ' ') return
        const z = fl * FH
        if (c === 'T' || c === 'O') {
          // 테라스(1층 바닥) · 옥상 정원(아래층 지붕 위) + 바깥 난간
          parts.push(bx(x, y, 1, 1, z, 2, c === 'T' ? FLOOR_PAINT.T : FLOOR_PAINT.O, { S: '#a99880', E: '#a99880' }))
          if (!rows[y + 1]?.[x] || rows[y + 1][x] === '.') parts.push(bx(x, y + 0.94, 1, 0.06, z + 2, 6, K.metal, { S: RAIL, flat: true }))
          if (!rows[y][x + 1] || rows[y][x + 1] === '.') parts.push(bx(x + 0.94, y, 0.06, 1, z + 2, 6, K.metal, { E: RAIL, flat: true }))
          return
        }
        const isLobby = c === 'L'
        const h = isLobby ? FH - 4 : FH
        const face = (q: Q): Color => {
          const zz = q.z - z
          const a = q.face === 'S' ? q.gx : q.gy
          if (isLobby) return zz < 1.5 || zz > h - 2 ? K.metalL : curtain(zz, a, isNight, 3, K.metalL)
          return s.wall(q, fl, zz, a, isNight)
        }
        // 지붕: 맨 위 칸만 테두리(파라펫) 색
        const isTop = !solid(fl + 1, x, y)
        parts.push(bx(x, y, 1, 1, z, h, isTop ? (q: Q) => (frac(q.gx) < 0.08 && !solid(fl, x - 1, y)) || (frac(q.gy) < 0.08 && !solid(fl, x, y - 1)) ? mix(s.roof, '#ffffff', 0.4) : s.roof : s.roof, { S: face, E: face, noHi: true }))
        if (fl > 0 && !solid(fl - 1, x, y) && !s.floors[fl - 1]?.[y]?.[x]?.match(/[TO]/)) for (const [px, py] of [[0.06, 0.06], [0.82, 0.82], [0.82, 0.06], [0.06, 0.82]]) parts.push(bx(x + px, y + py, 0.12, 0.12, 0, z, '#e8e4dc'))
      }),
    )
  })
  return [put(sprite(parts), s.at[0], s.at[1])]
}

const PLAIN_LOT = (q: Q) => (noise(Math.round(q.gx * 16), Math.round(q.gy * 16)) > 0.9 ? '#bdbab3' : '#d6d3cc')
export const EXTERIOR_STAGES: Stage[] = [
  {
    stage: 1,
    name: 'E1 차고',
    levels: 'Lv.1~2',
    GX: 9,
    GY: 7,
    at: [2, 1],
    floors: [['####', '####', '####']],
    wall: (q, _fl, zz, a, n) => (q.face === 'S' && a > 2.6 && a < 4.6 && zz < 15 ? (zz % 3 < 1 ? '#8a8f98' : '#b9bec6') : q.face === 'S' && a > 4.9 && a < 5.5 && zz < 14 ? '#6fb59a' : (winPx(zz, a, n, 1, 0.4, 9, 15) && q.face === 'E' ? winPx(zz, a, n, 1, 0.4, 9, 15)! : frac(a * 2 + (Math.floor(zz / 4) % 2) * 0.5) < 0.05 || zz % 4 < 0.5 ? '#c4c1ba' : '#dcd9d2')),
    roof: '#9aa0a8',
    lot: PLAIN_LOT,
    extra: (add, s, n) => {
      add(put(sprite([bx(0.1, 0.4, 0.8, 0.2, 0, 3, K.metal), bx(0.05, 0.38, 0.9, 0.24, 3, 2, '#5aa8d8')]), 7, 2))
      add(item('prop-trash', 6, 1))
      add(put(lamp(n), 1, s.GY - 3))
      add(put(tree(6), 7, s.GY - 4))
      add(person('walk1', 'front', 1, 4.5, s.GY - 2.5, true))
    },
    note: '콘크리트 마당 · 셔터 · 자전거 · 분리수거함',
  },
  {
    stage: 2,
    name: 'E2 1층 상가',
    levels: 'Lv.3~5',
    GX: 10,
    GY: 7,
    at: [2, 1],
    floors: [['#####', '#####', '#####', '.LLL.']],
    wall: (_q, _fl, zz, a, n) => (zz < 2 ? '#94bfd3' : (winPx(zz, a, n, 2, 0.6, 5, 16) ?? '#f4f1ea')),
    roof: '#d4d0c8',
    lot: paving,
    extra: (add, s, n) => {
      add(put(sprite([bx(0, 0, 5, 0.5, 0, 3, (q) => (frac(q.gx * 2.5) < 0.5 ? K.orange : '#ffffff'), { S: (q) => (frac(q.gx * 2.5) < 0.5 ? K.orange : '#ffffff'), E: K.orange })], { shadow: false }), 2, 4, 15))
      add(item('plant', 1, 3))
      add(item('plant', 7, 3))
      add(put(bench(), 8, 4))
      add(put(lamp(n), 1, s.GY - 3))
      add(put(tree(6), 9, s.GY - 3))
      add(person('stand', 'back', 2, 4.5, s.GY - 2.4))
      add(person('walk2', 'front', 4, 7.4, s.GY - 2.6, true))
    },
    note: '보도블록 마당 · 유리 현관 돌출(Lv.2) · 줄무늬 차양 · 화분·벤치',
  },
  {
    stage: 3,
    name: 'E3 2층 벽돌',
    levels: 'Lv.6~9',
    GX: 12,
    GY: 9,
    at: [2, 1],
    floors: [
      ['######TT', '######TT', '######TT', '######TT', '######TT', '.LLL....'],
      ['######', '######', '######', '####..', '####..'],
    ],
    wall: (_q, fl, zz, a, n) => (zz < 1.5 ? '#c08a72' : (winPx(zz, a, n, fl + 5, 0.5) ?? brick(a, zz))),
    roof: '#c9b8a8',
    lot: lawn,
    extra: (add, s, n) => {
      add(put(hedge(3), 1, 6))
      add(put(hedge(3), 6, 6))
      add(put(tree(7), 0, 2))
      add(put(tree(7), 11, 3))
      add(put(lamp(n), 10, s.GY - 3))
      add(person('walk1', 'back', 5, 5.5, 6.5))
      add(person('walk2', 'front', 6, 8.5, s.GY - 2.5, true))
    },
    note: '잔디 대지 · 산울타리 · 1층 오른쪽 테라스(Lv.6) · 2층 ㄱ자(앞-오른쪽을 깎음)',
  },
  {
    stage: 4,
    name: 'E4 3층 오피스',
    levels: 'Lv.10~13',
    GX: 14,
    GY: 10,
    at: [1, 1],
    floors: [
      ['#######TT', '#######TT', '#######TT', '#######TT', '#######TT', '.LLLL....'],
      ['#######', '#######', '#######', '#####..', '#####..'],
      ['#######', '#######', '#######', '##...##', '##...##'],
    ],
    wall: (_q, fl, zz, a, n) => (zz < 1.5 ? '#7a5634' : (winPx(zz, a, n, fl + 9, 0.7) ?? (frac(a * 3) < 0.12 ? '#b88c5e' : '#d9b285'))),
    roof: '#c9b8a8',
    lot: (q) => (q.gx > 10.2 && q.gy < 7 ? (frac(q.gy) < 0.05 && q.gx > 10.5 ? '#f6f8fb' : '#a2a6ba') : lawn(q)),
    extra: (add, s, n) => {
      add(put(car(K.mint, n), 11, 1))
      add(put(car(K.yellow, n), 11, 3))
      add(put(car(K.pink, n), 11, 5))
      add(put(pylon(), 0, 6))
      add(put(tree(7), 0, 1))
      add(put(hedge(4), 1, 7))
      add(put(lamp(n), 6, s.GY - 3))
      add(person('walk1', 'front', 7, 8.6, s.GY - 2.5, true))
    },
    note: '주차장 · 옥외 간판 · 3층 ㄷ자가 2층의 깎인 자리 위로 나와 기둥(필로티)이 섬',
  },
  {
    stage: 5,
    name: 'E5 4층 유리 사옥',
    levels: 'Lv.14~17',
    GX: 14,
    GY: 10,
    at: [2, 1],
    floors: [
      ['########TT', '########TT', '########TT', '########TT', '########TT', '.LLLLL....'],
      ['########', '########', '########', '######..', '######..'],
      ['########', '########', '########', '##....##', '##....##'],
      ['########', '########', '########', 'OO####OO', 'OO####OO'],
    ],
    wall: (_q, fl, zz, a, n) => curtain(zz, a, n, fl + 13, '#8a96a8'),
    roof: '#c4ccd6',
    lot: (q) => (Math.hypot(q.gx - 6.5, q.gy - 7.6) < 1.6 ? null : paving(q)),
    extra: (add, s, n) => {
      add(item('lv-fountain', 5, 7))
      add(put(tree(7), 0, 2))
      add(put(tree(7), 12, 2))
      add(put(bench(), 9, 7))
      add(put(lamp(n), 1, s.GY - 3))
      add(put(lamp(n), 12, s.GY - 3))
      add(item('lv-grass-pot', 2, 4, 0, FH * 3))
      add(person('stand', 'front', 9, 4.5, 7.6))
      add(person('walk2', 'back', 10, 10.5, s.GY - 2.4))
    },
    note: '분수 앞마당 · 통유리 · 4층 T자, 깎인 자리가 옥상 정원(Lv.17)',
  },
  {
    stage: 6,
    name: 'E6 5층 타워',
    levels: 'Lv.18~19',
    GX: 14,
    GY: 11,
    at: [2, 1],
    floors: [
      ['#########TT', '#########TT', '#########TT', '#########TT', '#########TT', '#########TT', '.LLLLLL....'],
      ['#########', '#########', '#########', '#########', '#######..', '#######..'],
      ['#########', '#########', '#########', '#########', '##.....##', '##.....##'],
      ['#########', '#########', '#########', '#########', 'OO#####OO', 'OO#####OO'],
      ['#########', '#########', '#########', '#########', '..#####..'],
    ],
    wall: (_q, fl, zz, a, n) => (zz < 2 ? '#efe9dc' : frac(a) < 0.1 ? (frac(a) < 0.04 ? K.gold : '#efe9dc') : curtain(zz, a, n, fl + 20, '#efe9dc')),
    roof: '#efe9dc',
    lot: (q) => (q.gy > 7.2 ? ((Math.floor(q.gx) + Math.floor(q.gy)) % 2 ? '#ece7e2' : '#f6f2ee') : null),
    extra: (add, s, n) => {
      add(item('lv-fountain', 6, 8))
      add(put(flag(), 1, 8))
      add(put(flag(), 12, 8))
      add(put(tree(8), 0, 2))
      add(put(tree(8), 12, 1))
      add(put(lamp(n), 4, s.GY - 3))
      add(put(lamp(n), 10, s.GY - 3))
      add(person('walk1', 'front', 11, 8.5, 8.8, true))
      add(person('stand', 'back', 12, 5.4, s.GY - 2.4))
    },
    note: '대리석 광장 · 깃대 · 금장 띠 · 5층 탑 모양',
  },
  {
    stage: 7,
    name: 'E7 캠퍼스',
    levels: 'Lv.20',
    GX: 20,
    GY: 12,
    at: [2, 1],
    floors: [
      ['#########', '#########', '#########', '#########', '#########', '#########', '.LLLLLL..'],
      ['#########', '#########', '#########', '#########', '#######..', '#######..'],
      ['#########', '#########', '#########', '#########', '##.....##', '##.....##'],
      ['#########', '#########', '#########', '#########', 'OO#####OO', 'OO#####OO'],
      ['#########', '#########', '#########', '#########', '..#####..'],
    ],
    wall: (_q, fl, zz, a, n) => (zz < 2 ? '#efe9dc' : frac(a) < 0.1 ? (frac(a) < 0.04 ? K.gold : '#efe9dc') : curtain(zz, a, n, fl + 20, '#efe9dc')),
    roof: '#efe9dc',
    lot: (q) => (q.gy > 7.6 && q.gy < 9.4 ? paving(q) : q.gx > 11.6 && q.gx < 12.4 ? paving(q) : Math.hypot(q.gx - 15.5, q.gy - 8.5) < 1.2 ? '#cfeefa' : null),
    extra: (add, s, n) => {
      // 별관 (2층, 원목) + 연결 다리
      const annex = sprite(
        [
          bx(0, 0, 5, 4, 0, FH * 2, '#c9b8a8', {
            S: (q) => (q.z < 1.5 ? '#7a5634' : (winPx(q.z % FH, q.gx, n, 40, 0.7) ?? (frac(q.gx * 3) < 0.12 ? '#b88c5e' : '#d9b285'))),
            E: (q) => (q.z < 1.5 ? '#7a5634' : (winPx(q.z % FH, q.gy, n, 41, 0.7) ?? (frac(q.gy * 3) < 0.12 ? '#b88c5e' : '#d9b285'))),
          }),
        ],
        {},
      )
      add(put(annex, 14, 1))
      add(put(sprite([bx(0, 0.3, 3, 0.8, 0, 6, K.metalL, { S: (q) => curtain(q.z, q.gx, n, 50, K.metalL), E: K.metalL, top: '#c4ccd6' })], { shadow: false }), 11, 2, FH))
      add(item('lv-fountain', 3, 8))
      add(put(tree(8), 0, 2))
      add(put(tree(8), 12, 6))
      add(put(tree(7), 19, 6))
      add(put(tree(7), 17, 9))
      add(put(flag(), 9, 8))
      add(put(bench(), 14, 8))
      add(put(lamp(n), 6, s.GY - 3))
      add(put(lamp(n), 15, s.GY - 3))
      add(person('walk1', 'front', 13, 12.5, 7.5, true))
      add(person('walk2', 'back', 14, 7.5, 8.6))
      add(person('stand', 'front', 15, 16.3, 8.2))
    },
    note: '본관(E6 타워) + 2층 원목 별관 + 연결 다리 · 광장 · 연못 · 잔디 산책로 (지금은 그림 없음)',
  },
]

const SKY = { day: ['#9fd3f0', '#b4ddf3', '#c8e7f6', '#dcf0f9', '#eef8fc'], night: ['#141a40', '#1a2150', '#222a5e', '#2c356c', '#38427a'] }
/** 외관 한 장: 하늘 그라데이션 + 먼 도시(옅은 상자) + 구름 + 땅 판 + 건물·꾸밈 */
export function exteriorScene(s: Stage, isNight: boolean): Cv {
  const W = (s.GX + s.GY) * HW + 60
  const H = (s.GX + s.GY) * HH + s.floors.length * FH + 90
  const cv = new Cv(W, H)
  const sky = isNight ? SKY.night : SKY.day
  for (let y = 0; y < H; y++) {
    const c = sky[Math.min(sky.length - 1, Math.floor((y / H) * sky.length))]
    for (let x = 0; x < W; x++) cv.set(x, y, C(c))
  }
  if (isNight) for (let i = 0; i < 60; i++) cv.set(Math.floor(noise(i, 7) * W), Math.floor(noise(i, 9) * H * 0.5), C(i % 5 ? '#c8d0f0' : '#ffffff'))
  else
    for (const [cx, cy, r] of [[60, 36, 9], [76, 32, 11], [92, 38, 8], [330, 54, 8], [346, 50, 10], [360, 56, 7]]) {
      for (let yy = -r; yy <= r; yy++) for (let xx = -r * 1.6; xx <= r * 1.6; xx++) if ((xx * xx) / (r * r * 2.56) + (yy * yy) / (r * r) <= 1) cv.set(cx + xx, cy + yy, C(yy > r * 0.4 ? '#e0eef8' : '#ffffff'))
    }
  // 먼 도시: 하늘색에 섞은 상자 실루엣
  const o: Pt = [Math.round(W / 2 - ((s.GX - s.GY) * HW) / 2), Math.round(H - (s.GX + s.GY) * HH - 14)]
  const far = new Cv(W, H)
  const fo: Pt = [o[0], o[1] + 40]
  for (let i = 0; i < 9; i++) {
    const x = -4 + i * 3 + noise(i, 3) * 1.5
    const h = 14 + noise(i, 5) * 30
    drawBox(far, fo, bx(x, -12 - noise(i, 4) * 3, 1.4, 1.4, -200, h + 200, isNight ? '#2a3366' : '#b9d4e6', { S: (q) => (isNight && frac(q.gx * 2) > 0.4 && frac(q.z / 8) > 0.5 && noise(Math.floor(q.gx * 2), Math.floor(q.z / 8) + i) > 0.6 ? '#f0d890' : isNight ? '#2a3366' : '#b9d4e6'), E: isNight ? '#262e5e' : '#acc8dc', flat: true }))
  }
  cv.blit(far, 0, 0)
  // 땅 판 + 건물·꾸밈 (정렬). 밤에는 불빛이 아닌 픽셀만 남색으로 어둡게
  const layer = new Cv(W, H)
  const g = ground(s, isNight)
  layer.blit(g.cv, o[0] - g.o[0], o[1] - g.o[1])
  const objs: Obj[] = [...building(s, isNight)]
  s.extra((ob) => objs.push(ob), s, isNight)
  // 차도 위 지나가는 차 (앱에서는 움직인다)
  objs.push(put(car(K.orange, isNight), 3, s.GY - 1.9), put(car(K.blue, isNight), s.GX - 6, s.GY - 0.95))
  for (const ob of sortBoxes(objs)) ob.draw(layer, o)
  if (isNight) {
    // 불빛(따뜻하고 밝은 노랑 — 옆면 그늘이 섞여도)은 그대로 둔다
    const isLit = (c: RGBA) => c[0] > 150 && c[1] > 120 && c[2] < 150 && c[0] - c[2] > 60
    for (let i = 0; i < W * H; i++) if (layer.has(i) && !isLit(layer.read(i))) layer.write(i, mix(layer.read(i), '#1a2150', 0.42).slice(0, 3).concat(layer.read(i)[3]) as RGBA)
  }
  cv.blit(layer, 0, 0)
  // 밤: 가로등 아래 빛
  if (isNight)
    for (const ob of objs)
      if (ob.box.h > 30 && ob.box.w < 0.3 && ob.box.d < 0.3) {
        const [lx, ly] = P(o, ob.box.x + ob.box.w / 2, ob.box.y + ob.box.d / 2, 0)
        for (let yy = -6; yy <= 6; yy++) for (let xx = -14; xx <= 14; xx++) if ((xx * xx) / 196 + (yy * yy) / 36 <= 1) cv.set(lx + xx, ly + yy, [255, 230, 150, 60])
      }
  return cv
}
