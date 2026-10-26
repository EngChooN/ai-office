// 연출 시트 도우미 (연출④-5 · docs/specs/furniture-motion-guide.md) — 묶음 파일(bundle*.mts)이 같이 쓴다.
// 프레임 = 원래 품목 정의(isoArt ITEMS)를 조금 고친 그림 + 덧그림 층. 같은 행의 프레임은 칸 크기·기준점이 모두 같다
import { ART_KIT, artItemPatched, artSize, Cv, type ArtAfter, type ArtPart, type ArtQ } from '../../src/renderer/map/iso/isoArt.ts'
import { HH, HW } from '../../src/shared/iso/grid.ts'
import type { Rot } from '../../src/shared/iso/furniture.ts'

export type RGBA = [number, number, number, number]
export type Pt = [number, number]
export type Part = ArtPart
export type Q = ArtQ
export type After = ArtAfter
export const { K, mix, noise, frac, inRect, C, WHITE, ball, line, leaves } = ART_KIT
export const ROTS: Rot[] = [0, 1, 2, 3]
const OUT = C('#2e2a40')
/** 반투명 색 (빛·김) */
export const glowOf = (c: string, a: number): RGBA => [...C(c).slice(0, 3), a] as RGBA

export interface MotionSheetDef {
  id: string
  kind: string
  rows: Cv[][]
  rowOfRot: number[]
  anchors: Pt[]
  clips: Record<string, { frames: number[]; ms?: number }>
  still: number | Record<string, number>
  shares?: string[]
  note?: string
}

export interface Draw {
  cv: Cv
  /** 불투명 덧그림 — 빈 칸에 닿는 곳에만 외곽선 1px */
  layer: Cv
  /** 원래 품목 r0 로컬 (x, y 칸, z 아트 px) → 텍스처 안 아트 px */
  at: (x: number, y: number, z: number) => Pt
  r: Rot
  /** 앞(+y = 쓰는 쪽)이 보이는 방향인가 (r0·r3) */
  front: boolean
}

const P = (o: Pt, gx: number, gy: number, z: number): Pt => [o[0] + (gx - gy) * HW, o[1] + (gx + gy) * HH - z]
function rotPt(x: number, y: number, r: Rot, W: number, D: number): [number, number] {
  let w = W
  let d = D
  for (let i = 0; i < r; i++) {
    ;[x, y] = [d - y, x]
    ;[w, d] = [d, w]
  }
  return [x, y]
}
const get = (cv: Cv, x: number, y: number): RGBA | null => (x < 0 || y < 0 || x >= cv.w || y >= cv.h ? null : cv.read(y * cv.w + x))

/** 덧그린 층에 외곽선 1px (바탕이 빈 칸일 때만, isoArt outline과 같은 72%) 을 두르고 바탕 위에 얹는다 */
export function stamp(base: Cv, layer: Cv) {
  for (let y = 0; y < base.h; y++)
    for (let x = 0; x < base.w; x++) {
      const i = y * base.w + x
      if (layer.has(i) || base.has(i)) continue
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const n = get(layer, x + dx, y + dy)
        if (n && n[3] === 255) {
          base.write(i, mix(n, OUT, 0.72))
          break
        }
      }
    }
  base.blit(layer, 0, 0)
}

export interface FrameOpt {
  /** 부품 고치기 (높이는 바꾸지 않는다) */
  parts?: (parts: Part[]) => Part[]
  /** 위로 더 비워 둘 높이 (음표·연기). 한 시트의 모든 프레임이 같아야 한다 */
  head?: number
  /** 그림 위 덧그림 (외곽선 있는 층 + 반투명 빛) */
  draw?: (d: Draw) => void
  /** 그림 아래 덧그림 (가구 뒤로 지나가는 빛줄기) */
  under?: (d: Draw) => void
  /** 정의의 after(공·잎처럼 부품 밖에서 그리는 모양)를 바꾼다. orig = 원래 after. 외곽선 전에 그려져 원래 그림과 같은 외곽선이 붙는다 */
  after?: (a: After, orig: ((a: After) => void) | undefined) => void
}

/** 품목 itemId의 방향 r 프레임 한 장 */
export function frame(itemId: string, r: Rot, opt: FrameOpt = {}) {
  // 장면처럼 반려동물은 빼고 그린다 (고양이·강아지는 장면이 따로 움직인다)
  const a = artItemPatched(
    itemId,
    r,
    (def) => ({ ...def, extraH: (def.extraH ?? 0) + (opt.head ?? 0), parts: opt.parts ? opt.parts(def.parts) : def.parts, after: opt.after ? (aa: After) => opt.after!(aa, def.after) : def.after }),
    false,
  )
  const [W, D] = artSize(itemId)
  const at = (x: number, y: number, z: number) => P(a.o, ...rotPt(x, y, r, W, D), z).map(Math.round) as Pt
  const mk = (cv: Cv): Draw => ({ cv, layer: new Cv(cv.w, cv.h), at, r, front: r === 0 || r === 3 })
  let cv = a.cv
  if (opt.under) {
    const u = mk(new Cv(cv.w, cv.h))
    opt.under(u)
    stamp(u.cv, u.layer)
    u.cv.blit(cv, 0, 0)
    cv = u.cv
  }
  if (opt.draw) {
    const d = mk(cv)
    opt.draw(d)
    stamp(cv, d.layer)
  }
  return { cv, o: a.o }
}

/** 부품 i의 값을 바꾼 새 배열 */
export const patch = (parts: Part[], i: number, more: Partial<Part>) => parts.map((p, k) => (k === i ? { ...p, ...more } : p))

/**
 * 로컬 사각형 (x0..x1, y0..y1)을 높이 z(점마다 다를 수 있음)에 칠한다 (평평한 종이·빛 웅덩이).
 * 한 화면 px은 한 번만 칠한다 (반투명이 겹쳐 진해지지 않게). skipSolid면 이미 불투명한 칸은 건너뛴다 (바닥 빛이 가구를 물들이지 않게)
 */
export function flat(d: Draw, cv: Cv, x0: number, x1: number, y0: number, y1: number, z: number | ((x: number, y: number) => number), c: RGBA | ((x: number, y: number) => RGBA | null), skipSolid = false) {
  const st = 1 / 48
  const seen = new Set<string>()
  for (let x = x0; x <= x1 + 1e-9; x += st)
    for (let y = y0; y <= y1 + 1e-9; y += st) {
      const [px, py] = d.at(x, y, typeof z === 'function' ? z(x, y) : z)
      const k = `${px},${py}`
      if (seen.has(k)) continue
      seen.add(k)
      if (skipSolid && px >= 0 && py >= 0 && px < cv.w && py < cv.h && cv.read(py * cv.w + px)[3] === 255) continue
      const col = typeof c === 'function' ? c(x, y) : c
      if (col) cv.set(px, py, col)
    }
}

/**
 * 작은 상자 (책·종이·막대) — 로컬 칸 (x, y, w, dd), 높이 z~z+h. 보이는 옆면 둘 + 윗면을 isoArt처럼 그늘지게 칠한다.
 * 화면 왼쪽 아래 면 12%, 오른쪽 아래 면 26% 그늘 (isoArt S.shadeS·shadeE)
 */
export function cube(d: Draw, cv: Cv, x: number, y: number, w: number, dd: number, z: number, h: number, c: string) {
  const sides = visibleSides(d.r)
  // 방향마다 화면 왼쪽 아래(S)로 보이는 로컬 면
  const leftOf = ['py', 'px', 'ny', 'nx'][d.r]
  const sh = (k: string) => mix(c, '#4a4f80', k === leftOf ? 0.12 : 0.26)
  const st = 1 / 64
  const put = (px: number, py: number, col: RGBA) => cv.set(px, py, col)
  for (let zz = z; zz <= z + h; zz += 0.5) {
    for (let t = 0; t <= 1 + 1e-9; t += st) {
      if (sides.py) put(...d.at(x + w * t, y + dd, zz), sh('py'))
      if (sides.ny) put(...d.at(x + w * t, y, zz), sh('ny'))
      if (sides.px) put(...d.at(x + w, y + dd * t, zz), sh('px'))
      if (sides.nx) put(...d.at(x, y + dd * t, zz), sh('nx'))
    }
  }
  for (let a = 0; a <= 1 + 1e-9; a += st) for (let b = 0; b <= 1 + 1e-9; b += st) put(...d.at(x + w * a, y + dd * b, z + h), mix(c, '#ffffff', 0.15))
}

/** 방향 r에서 화면에 보이는 원래 로컬 면 (+y = 앞) */
export function visibleSides(r: Rot) {
  return { py: r === 0 || r === 3, px: r === 0 || r === 1, nx: r === 2 || r === 3, ny: r === 1 || r === 2 }
}

/** 빛 번짐: 중심 (x, y, z)에서 반지름 rad 아트 px 안의 빈 칸·칠한 칸 모두에 반투명 색을 얹는다 (가까울수록 진하게) */
export function halo(d: Draw, x: number, y: number, z: number, rad: number, c: string, a: number, only?: 'empty') {
  const [cx, cy] = d.at(x, y, z)
  for (let yy = Math.floor(cy - rad); yy <= cy + rad; yy++)
    for (let xx = Math.floor(cx - rad); xx <= cx + rad; xx++) {
      const dist = Math.hypot(xx - cx, (yy - cy) * 1.15)
      if (dist > rad || xx < 0 || yy < 0 || xx >= d.cv.w || yy >= d.cv.h) continue
      if (only === 'empty' && d.cv.has(yy * d.cv.w + xx)) continue
      const t = 1 - dist / rad
      d.cv.set(xx, yy, glowOf(c, Math.round(a * (0.35 + 0.65 * t))))
    }
}

/** 음표 ♪ (머리 2×2 + 기둥 3) — 화면 px 기준 (x, y)가 머리 왼쪽 아래 */
export function note(cv: Cv, x: number, y: number, c: string, beam = false) {
  const col = C(c)
  for (const [dx, dy] of [[0, 0], [1, 0], [0, -1], [1, -1], [2, -1], [2, -2], [2, -3], [2, -4]]) cv.set(x + dx, y + dy, col)
  if (beam) cv.set(x + 3, y - 4, col)
}

/** 반짝이 ✦ (가운데 + 네 방향 한 칸, 크게면 두 칸) */
export function sparkle(cv: Cv, x: number, y: number, c: string, big = false) {
  const col = C(c)
  cv.set(x, y, C('#ffffff'))
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    cv.set(x + dx, y + dy, col)
    if (big) cv.set(x + dx * 2, y + dy * 2, glowOf(c, 150))
  }
}

/** 방향마다 같은 프레임 목록을 만든다 */
export const perRot = (make: (r: Rot) => { cv: Cv; o: Pt }[]) => {
  const rows = ROTS.map((r) => make(r))
  return { rows: rows.map((fs) => fs.map((f) => f.cv)), anchors: rows.map((fs) => fs[0].o), rowOfRot: [0, 1, 2, 3] }
}
/** 네 방향 모양이 같은 소품 (가운데 대칭): 행 1개 */
export const oneRow = (make: (r: Rot) => { cv: Cv; o: Pt }[]) => {
  const fs = make(0)
  return { rows: [fs.map((f) => f.cv)], anchors: [fs[0].o], rowOfRot: [0, 0, 0, 0] }
}
