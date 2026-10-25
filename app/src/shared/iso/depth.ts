// 그리는 순서 (docs/specs/office-iso-art.md 1절): 칸 위 상자끼리 한 축으로 떨어져 있으면 작은 쪽이 뒤.
// 같은 칸에서 위아래로 쌓였으면(의자 좌석 → 앉은 직원) 낮은 쪽이 뒤

import { HH, SLAB, WALL_H, WALL_T } from './grid.ts'
import type { Edge } from './plan.ts'

/** 칸 단위 상자: x·y·w·d는 칸, z·h는 아트 px */
export interface IsoBox {
  x: number
  y: number
  w: number
  d: number
  z: number
  h: number
}

const EPS = 1e-6

/** a가 b보다 먼저(뒤에) 그려져야 하면 true. 화면에서 가로로 겹치지 않으면 순서가 상관없어 false */
export function isBehind(a: IsoBox, b: IsoBox) {
  // 화면 x 범위 = (gx − gy) 범위
  const a0 = a.x - (a.y + a.d)
  const a1 = a.x + a.w - a.y
  const b0 = b.x - (b.y + b.d)
  const b1 = b.x + b.w - b.y
  if (a1 <= b0 + EPS || b1 <= a0 + EPS) return false
  // 화면 세로 범위 (아트 px)도 겹쳐야 한다 — 안 그러면 위아래로 떨어진 것끼리 순서를 정해 순환이 생긴다 (탁구대 네트, isoArt sortBoxes와 같다)
  const ay0 = (a.x + a.y) * HH - (a.z + a.h)
  const ay1 = (a.x + a.w + a.y + a.d) * HH - a.z
  const by0 = (b.x + b.y) * HH - (b.z + b.h)
  const by1 = (b.x + b.w + b.y + b.d) * HH - b.z
  if (ay1 <= by0 + EPS || by1 <= ay0 + EPS) return false
  if (a.x + a.w <= b.x + EPS || a.y + a.d <= b.y + EPS) return true
  const isApart = b.x + b.w <= a.x + EPS || b.y + b.d <= a.y + EPS
  return !isApart && a.z + a.h <= b.z + EPS
}

/** 뒤 → 앞 순서. 관계가 없는 것끼리는 (x+y) 순으로 두어 매 프레임 같은 순서가 나온다 */
export function depthOrder<T extends IsoBox>(items: T[]): T[] {
  const n = items.length
  const behind: number[][] = items.map(() => [])
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && isBehind(items[i], items[j])) behind[j].push(i)
  const state = new Uint8Array(n) // 0 = 아직, 1 = 방문 중, 2 = 끝
  const out: T[] = []
  const visit = (i: number) => {
    if (state[i]) return
    state[i] = 1
    for (const k of behind[i]) visit(k)
    state[i] = 2
    out.push(items[i])
  }
  const key = (b: IsoBox) => b.x + b.w / 2 + b.y + b.d / 2 + b.z / 1000
  const order = [...items.keys()].sort((i, j) => key(items[i]) - key(items[j]))
  for (const i of order) visit(i)
  return out
}

/** 움직이는 것 하나가 끼는 자리: 고정 물체 순서에서 after번째 바로 뒤 (−1이면 맨 앞), 같은 자리끼리는 rank 순 */
export interface MoverSlot<T> {
  item: T
  after: number
  rank: number
}

/**
 * 이미 정렬한 고정 물체(가구) 사이에 움직이는 것(직원)을 끼운다 — 기술 설계 1-2절.
 * 매 프레임 전체를 다시 정렬하지 않고 직원 × 가구만 본다. 맞는 자리가 없으면(앞에 와야 할 가구가 뒤에 와야 할 가구보다
 * 먼저 정렬된 경우) null — 그 프레임만 전체를 정렬하면 된다
 */
export function placeMovers<T extends IsoBox>(statics: readonly IsoBox[], movers: T[]): MoverSlot<T>[] | null {
  const order = depthOrder(movers)
  const out: MoverSlot<T>[] = []
  for (const [rank, m] of order.entries()) {
    let after = -1
    let before = statics.length
    for (let i = 0; i < statics.length; i++) {
      if (isBehind(statics[i], m)) after = Math.max(after, i)
      else if (isBehind(m, statics[i])) before = Math.min(before, i)
    }
    // 앞에 정렬된 직원이 이 직원 뒤에 있어야 하면 그보다 앞 자리로 갈 수 없다
    for (const prev of out) if (prev.after > after && isBehind(prev.item, m)) after = prev.after
    if (before <= after) return null
    out.push({ item: m, after, rank })
  }
  return out
}

// ── 경계 조각 (office-iso-spaces.md 2-5절): 깎인 평면의 안쪽 벽·유리벽·문턱·난간은 가구·직원과 같이 정렬한다 ──

/** 난간·문턱 두께 (칸) */
const RAIL_T = 0.06

/**
 * 경계 조각의 칸 상자 (isoArt artPlanEdges가 이 자리에 그린다).
 * 벽·유리는 칸 바깥(이웃 쪽)에 WALL_T 두께로 서고, 난간·문턱은 칸 안쪽 가장자리에 선다
 */
export function edgeBox(e: Pick<Edge, 'gx' | 'gy' | 'side' | 'kind'>): IsoBox {
  const { gx, gy, side, kind } = e
  const isX = side === 'x-' || side === 'x+'
  if (kind === 'outerWall' || kind === 'innerWall' || kind === 'glass') {
    const [z, h] = kind === 'glass' ? [0, WALL_H] : [-SLAB, WALL_H + SLAB]
    return isX ? { x: gx - WALL_T, y: gy, w: WALL_T, d: 1, z, h } : { x: gx, y: gy - WALL_T, w: 1, d: WALL_T, z, h }
  }
  const [z, h] = kind === 'slabSide' ? [-SLAB, SLAB] : [0, kind === 'sill' ? 3 : 10]
  const at = side === 'x+' || side === 'y+' ? 1 - RAIL_T : 0
  return isX ? { x: gx + at, y: gy, w: RAIL_T, d: 1, z, h } : { x: gx, y: gy + at, w: 1, d: RAIL_T, z, h }
}

/**
 * 안쪽 벽 반투명 (9절 G3 A): 움직이는 것(직원·든 가구) 중 하나라도 이 벽보다 뒤에 있고 화면에서 겹치면 true.
 * 그 칸 벽 조각만 반투명(isoArt WALL_FADE_ALPHA)으로 그린다 — 벽 높이는 그대로
 */
export function hidesMover(wall: IsoBox, movers: readonly IsoBox[]) {
  return movers.some((m) => isBehind(m, wall))
}
