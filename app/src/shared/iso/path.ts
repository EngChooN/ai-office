// 칸 길찾기 (기술 설계 6-1절) — 상하좌우 4방향 A*. 화면에서는 마름모 변을 따라 걷는 모습
// 걸을 수 있는 칸: 바닥 안(칸 표 마스크)이고 object 가구가 없는 칸(flat 가구 위는 통과), 고정 칸(회의실 안쪽·문·계단·출입구).
// 구획(region): 0 = 트인 바닥, 1 이상 = 벽 있는 방(회의실·강당·대표실). 구획이 다른 칸 사이는 둘 중 하나가 문 칸일 때만 건넌다
// 유리벽(실내 칸 뒤에 야외가 있는 변, plan.ts edgesOf)은 문과 상관없이 지나갈 수 없고, 야외 칸에서 실내로 넘어가는 문턱은 지나간다
import { boxOf, cellKey, isInside, type Cell, type Room } from './grid.ts'
import { cellsOf, specOf, type GridPose } from './furniture.ts'
import { edgesOf, isIndoor } from './plan.ts'
import type { FixedTile } from './place.ts'

/** 회의실(강당) 구획 번호 */
export const MEETING_REGION = 1

export interface WalkMap {
  room: Room
  /** 1 = object 가구가 차지한 칸 */
  blocked: Uint8Array
  /** 구획 번호 (0 = 트인 바닥) */
  region: Uint8Array
  /** 1 = 구획을 드나드는 문 칸 */
  door: Uint8Array
  /** 1 = 이 칸의 −x(−y) 쪽이 유리벽 */
  wallX: Uint8Array
  wallY: Uint8Array
}

/** 구획이 번호를 직접 정하지 않은 고정 칸의 구획 */
const regionOfFixed = (t: FixedTile) => t.region ?? (t.kind === 'meeting' || t.kind === 'meetingDoor' ? MEETING_REGION : 0)

/** 방마다 한 번만: 유리벽 변 */
const glassCache = new WeakMap<Room, { x: Uint8Array; y: Uint8Array } | null>()
function glassOf(room: Room) {
  if (!room.cells) return null
  const hit = glassCache.get(room)
  if (hit !== undefined) return hit
  const n = room.cols * room.rows
  const g = { x: new Uint8Array(n), y: new Uint8Array(n) }
  for (const e of edgesOf(room)) if (e.kind === 'glass') (e.side === 'x-' ? g.x : g.y)[cellKey(room, e.gx, e.gy)] = 1
  glassCache.set(room, g)
  return g
}

/** 층의 길 지도. 배치가 바뀔 때만 다시 만든다 */
export function buildWalkMap(room: Room, items: readonly GridPose[], fixed: readonly FixedTile[] = []): WalkMap {
  const n = room.cols * room.rows
  const glass = glassOf(room)
  const m: WalkMap = { room, blocked: new Uint8Array(n), region: new Uint8Array(n), door: new Uint8Array(n), wallX: glass?.x ?? new Uint8Array(n), wallY: glass?.y ?? new Uint8Array(n) }
  for (const it of items) {
    if (specOf(it.itemId).layer === 'flat') continue
    for (const c of cellsOf(it)) if (isInside(room, c.gx, c.gy)) m.blocked[cellKey(room, c.gx, c.gy)] = 1
  }
  for (const t of fixed) {
    if (!isInside(room, t.gx, t.gy)) continue
    const k = cellKey(room, t.gx, t.gy)
    m.region[k] = regionOfFixed(t)
    if (t.solid) m.blocked[k] = 1
    if (t.kind === 'meetingDoor') m.door[k] = 1
  }
  return m
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/** a → b 한 걸음(b = a + (dx, dy))이 벽(방 경계·유리벽)에 막히지 않는지. 칸이 막혔는지는 따로 본다 */
function canCross(m: WalkMap, a: number, b: number, dx: number, dy: number) {
  const hi = dx + dy > 0 ? b : a
  if (dx !== 0 ? m.wallX[hi] : m.wallY[hi]) return false
  return m.region[a] === m.region[b] || m.door[a] === 1 || m.door[b] === 1
}

/** 이웃 칸 key들 (바닥 안, 방·유리벽 경계 통과 가능한 것만. 막힌 칸 여부는 안 봄) */
function neighbors(m: WalkMap, k: number, out: number[]) {
  out.length = 0
  const { cols } = m.room
  const x = k % cols
  const y = Math.floor(k / cols)
  for (const [dx, dy] of DIRS) {
    const nx = x + dx
    const ny = y + dy
    if (!isInside(m.room, nx, ny)) continue
    const nk = cellKey(m.room, nx, ny)
    if (canCross(m, k, nk, dx, dy)) out.push(nk)
  }
  return out
}

/** start에서 걸어서 닿는 칸 (BFS). start가 막혀 있어도 출발은 된다 */
export function reachable(m: WalkMap, start: Cell): Uint8Array {
  const seen = new Uint8Array(m.blocked.length)
  if (!isInside(m.room, start.gx, start.gy)) return seen
  const s = cellKey(m.room, start.gx, start.gy)
  const queue = [s]
  seen[s] = 1
  const nb: number[] = []
  for (let i = 0; i < queue.length; i++)
    for (const nk of neighbors(m, queue[i], nb)) {
      if (seen[nk] || m.blocked[nk]) continue
      seen[nk] = 1
      queue.push(nk)
    }
  return seen
}

/** 막힌 칸(의자 등)이라도 옆 칸에서 들어갈 수 있으면 닿는 것 — 앉는 자리 판정 */
export function canEnter(m: WalkMap, seen: Uint8Array, c: Cell) {
  if (!isInside(m.room, c.gx, c.gy)) return false
  const k = cellKey(m.room, c.gx, c.gy)
  if (seen[k]) return true
  return neighbors(m, k, []).some((nk) => seen[nk] === 1)
}

/**
 * from에서 가까운 순(마름모 거리 1, 2, …)으로 서 있을 칸을 찾는다 — 자리가 없는 직원이 기다릴 칸 (office-iso-spaces.md 3-5절 O1).
 * seen(출입구에서 닿는 칸) 안이고, 가구로 막히지 않았고, skip(고정 칸·다른 직원이 선/가려는 칸 key)에 없는 칸. 같은 거리면 앞쪽 줄(gy 큰 쪽) 먼저.
 * 거리 제한 없이 층 전체를 본다 — 가까운 칸이 다 차도 한 칸에 겹치지 않게
 */
export function nearestFreeCell(m: WalkMap, seen: Uint8Array, from: Cell, skip: ReadonlySet<number>): Cell | null {
  const maxD = m.room.cols + m.room.rows
  for (let d = 1; d <= maxD; d++)
    for (let dy = d; dy >= -d; dy--) {
      const rest = d - Math.abs(dy)
      for (const dx of rest ? [-rest, rest] : [0]) {
        const gx = from.gx + dx
        const gy = from.gy + dy
        if (!isInside(m.room, gx, gy)) continue
        const k = cellKey(m.room, gx, gy)
        if (seen[k] && !m.blocked[k] && !skip.has(k)) return { gx, gy }
      }
    }
  return null
}

/**
 * start → goal 칸 경로 (start 제외, goal 포함). 못 가면 null.
 * goal은 막혀 있어도 들어갈 수 있다(의자 칸에 가서 앉기). start가 막혀 있어도 출발은 된다(가구가 발밑에 놓인 경우)
 */
export function findPath(m: WalkMap, start: Cell, goal: Cell): Cell[] | null {
  const { room } = m
  if (!isInside(room, goal.gx, goal.gy) || !isInside(room, start.gx, start.gy)) return null
  const startK = cellKey(room, start.gx, start.gy)
  const goalK = cellKey(room, goal.gx, goal.gy)
  if (startK === goalK) return []
  const h = (k: number) => Math.abs((k % room.cols) - goal.gx) + Math.abs(Math.floor(k / room.cols) - goal.gy)
  const g = new Map<number, number>([[startK, 0]])
  const from = new Map<number, number>()
  const heap = new Heap()
  heap.push(h(startK), startK)
  const nb: number[] = []
  while (heap.size) {
    const cur = heap.pop()
    if (cur === goalK) {
      const path: Cell[] = []
      for (let c = cur; c !== startK; c = from.get(c)!) path.push({ gx: c % room.cols, gy: Math.floor(c / room.cols) })
      return path.reverse()
    }
    for (const nk of neighbors(m, cur, nb)) {
      if (m.blocked[nk] && nk !== goalK) continue
      const ng = g.get(cur)! + 1
      if (ng >= (g.get(nk) ?? Infinity)) continue
      g.set(nk, ng)
      from.set(nk, cur)
      heap.push(ng + h(nk), nk)
    }
  }
  return null
}

/** 이진 힙 (f가 같으면 먼저 넣은 것 — 경로가 매번 같게) */
class Heap {
  private items: [number, number, number][] = []
  private seq = 0
  get size() {
    return this.items.length
  }
  push(f: number, k: number) {
    const a = this.items
    a.push([f, ++this.seq, k])
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (less(a[p], a[i])) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop() {
    const a = this.items
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && less(a[l], a[m])) m = l
        if (r < a.length && less(a[r], a[m])) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top[2]
  }
}

const less = (a: [number, number, number], b: [number, number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])

/**
 * 출입구 칸 — 고정 칸의 출입구, 없으면 평면의 출입구. 어느 쪽도 바닥 밖이면 상자 앞 가운데에서 가까운 실내 바닥 칸.
 * 장면의 길찾기·대기·고용 입장이 모두 이 칸을 쓴다 (바닥 밖 칸을 돌려주지 않는다)
 */
export function entranceOf(room: Room, fixed: readonly FixedTile[]): Cell {
  const want = fixed.find((t) => t.kind === 'entrance') ?? room.entrance ?? { gx: Math.floor(boxOf(room).cols / 2), gy: room.rows - 1 }
  if (isInside(room, want.gx, want.gy)) return { gx: want.gx, gy: want.gy }
  let best: Cell = { gx: 0, gy: 0 }
  let bestD = Infinity
  for (let gy = 0; gy < room.rows; gy++)
    for (let gx = 0; gx < room.cols; gx++) {
      if (!isIndoor(room, gx, gy)) continue
      const d = Math.abs(gx - want.gx) + Math.abs(gy - want.gy)
      if (d < bestD) [best, bestD] = [{ gx, gy }, d]
    }
  return best
}

/**
 * 자리가 없는 직원이 기다릴 칸 — 출입구에서 가까운 실내 바닥 칸. 닿을 수 있고, 가구·고정 칸이 아니고, occupied(다른 직원이 서 있거나 가는 칸 key)가 아닌 칸.
 * 실내에 빈 칸이 없으면 야외 바닥(현관 앞·테라스)까지 넓히고, 그래도 없으면 null (출입구 칸에 서게 하는 건 부르는 쪽)
 */
export function waitCellFor(m: WalkMap, fixed: readonly FixedTile[], occupied: ReadonlySet<number>): Cell | null {
  const from = entranceOf(m.room, fixed)
  const seen = reachable(m, from)
  const skip = new Set(occupied)
  for (const t of fixed) skip.add(cellKey(m.room, t.gx, t.gy))
  const indoor = new Set(skip)
  for (let gy = 0; gy < m.room.rows; gy++) for (let gx = 0; gx < m.room.cols; gx++) if (!isIndoor(m.room, gx, gy)) indoor.add(cellKey(m.room, gx, gy))
  return nearestFreeCell(m, seen, from, indoor) ?? nearestFreeCell(m, seen, from, skip)
}
