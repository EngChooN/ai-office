// 알아서 배치 (비서 기능 확장 5번 · docs/specs/secretary.md 3-2-4절): 가지고 있는 가구로 한 층의 배치안을 만든다. 저장하지 않는다
// 비서가 확인 카드(그 층 치우기 → 이 순서대로 놓기 묶음)로 올린다. 놓을 때마다 canPlace(메인 저장 직전과 같은 검사)를 통과한 것만 넣어서,
// 같은 순서로 놓으면 그대로 들어간다 — 길 막힘·고정 칸(회의실·계단·출입구)·소유·레벨 규칙은 거기서 지킨다
// 배치 규칙: 구역(휴게실·탕비실 등) 가구는 제자리 · 책상과 의자는 짝(의자가 책상을 본다)으로 뒤쪽부터 통로를 남기는 줄 · 벽 가구는 뒤·왼쪽 벽을 등지게 ·
// 러그 둘레에 소파 · 놀이 가구는 앞 오른쪽 · 작은 소품은 벽가에 흩어서 · 바닥의 절반 넘게 채우지 않는다

import { drawerCount, isGridFurniture, type ShopState } from '../economy.ts'
import { cellKey, isInside, type Cell, type Room } from './grid.ts'
import { cellsOf, FACE_STEP, facingOf, specOf, type GridItem, type GridPose, type Rot } from './furniture.ts'
import { isoLevelOf, roomOf } from './levels.ts'
import { isIndoor } from './plan.ts'
import { canPlace, fixedTiles, type FloorState } from './place.ts'
import { isAisleSlot } from './seats.ts'

export interface ArrangePlan {
  floor: number
  /** 지금 그 층에 놓인 가구 (전 그림·되돌리기용) */
  before: GridItem[]
  /** 이 순서대로 놓는다 (구역 가구 → 책상·의자 짝 → 나머지) */
  place: GridPose[]
  /** 제자리에 다시 놓는 구역 가구 수 */
  kept: number
  /** 책상·의자 짝 수 */
  seatPairs: number
  /** 자리가 없어 서랍에 남는 가구 */
  left: { itemId: string; count: number }[]
}

/** 바닥(고정 칸 뺀 칸)에서 가구(러그 제외)가 차지해도 되는 비율 */
const FILL_MAX = 0.5
/** 책상 줄을 왼쪽 벽에서 띄우는 칸 — 왼쪽 벽 가구와 그 앞 통로 (계단 2×2도 피한다) */
const DESK_OX = 2

type Group = 'wall' | 'rug' | 'sofa' | 'game' | 'other' | 'small'
const GROUP_ORDER: Group[] = ['wall', 'rug', 'sofa', 'game', 'other', 'small']

/** 가구 성격 — 어디에 둘지 정하는 데만 쓴다 */
export function groupOf(itemId: string): Group {
  const s = specOf(itemId)
  if (s.layer === 'flat') return 'rug'
  if (s.kind === 'seat') return 'sofa'
  const spots = s.spots ?? []
  if (spots.length >= 2 && spots.every((p) => p.use === 'use')) return 'game'
  const [w, d] = s.size
  if (spots.length === 1 && spots[0].use === 'use') return w * d === 1 ? 'small' : 'wall'
  if (w * d === 1) return 'small'
  return d === 1 ? 'wall' : 'other'
}

/** 짝을 짓는 책상 (2×1) · 의자 */
const isPairDesk = (id: string) => {
  const s = specOf(id)
  return s.kind === 'desk' && s.size[0] === 2 && s.size[1] === 1
}
const isChair = (id: string) => specOf(id).kind === 'chair'

const center = (p: GridPose) => {
  const cells = cellsOf(p)
  return { x: cells.reduce((s, c) => s + c.gx, 0) / cells.length + 0.5, y: cells.reduce((s, c) => s + c.gy, 0) / cells.length + 0.5 }
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
/** 가구 앞면이 보는 방향 = rot (r0 ↙ +gy — 소파는 앉는 쪽, 책장처럼 앞에 서서 쓰는 가구는 서는 쪽) */
const faceOf = (p: GridPose): Rot => p.rot

function inZone(room: Room, c: Cell) {
  return (room.zones ?? []).some((z) => c.gx >= z.gx && c.gx < z.gx + z.w && c.gy >= z.gy && c.gy < z.gy + z.d)
}

/**
 * 한 층의 배치안. shop은 지금 상태(모든 층) — 다른 층 가구는 그대로 두고, 그 층은 치운 뒤 place 순서대로 놓는다고 보고 만든다.
 * 같은 입력이면 같은 결과
 */
export function autoArrange(shop: Pick<ShopState, 'owned' | 'grid' | 'placed'>, level: number, floor: number): ArrangePlan {
  const room = roomOf(level, floor)
  const fixed = fixedTiles(level, floor)
  const before = shop.grid.filter((g) => g.floor === floor)
  const others = shop.grid.filter((g) => g.floor !== floor)
  const empty: ArrangePlan = { floor, before, place: [], kept: 0, seatPairs: 0, left: [] }
  if (floor < 1 || floor > isoLevelOf(level).floors) return empty

  const fixedKeys = new Set(fixed.map((t) => cellKey(room, t.gx, t.gy)))
  const placed: GridItem[] = []
  const state = (): FloorState => ({ level, floor, items: [...others, ...placed], owned: shop.owned, room, fixed })
  const commit = (p: GridPose) => placed.push({ uid: `plan:${placed.length}`, floor, ...p })
  const fits = (p: GridPose) => canPlace(state(), p).ok

  // 1. 구역 가구: 구역 사각형 안에 다 든 것은 제자리 (정해 둔 모양이라 — zoneLayouts.ts)
  const isZoneItem = (g: GridItem) => cellsOf(g).every((c) => inZone(room, c))
  for (const g of before.filter(isZoneItem)) if (fits(g)) commit({ itemId: g.itemId, gx: g.gx, gy: g.gy, rot: g.rot })
  const kept = placed.length

  // 놓을 가구 더미: 그 층에 있던 것(구역 가구 빼고) 먼저, 그다음 서랍
  const pool: string[] = before.filter((g) => !isZoneItem(g)).map((g) => g.itemId)
  const drawerShop: ShopState = { surfaces: {}, gear: {}, ...shop, grid: [...others, ...before] }
  for (const id of Object.keys(shop.owned).sort()) if (isGridFurniture(id)) for (let n = drawerCount(drawerShop, id); n > 0; n--) pool.push(id)
  const take = (id: string) => pool.splice(pool.indexOf(id), 1)

  // 2. 책상·의자 짝: 지금 그 층의 자리 수만큼 (없으면 직원이 기본 자리에 앉는다 — seats.ts autoSeats)
  const floorDesks = before.filter((g) => !isZoneItem(g) && isPairDesk(g.itemId)).length
  const floorChairs = before.filter((g) => !isZoneItem(g) && isChair(g.itemId)).length
  const desks = pool.filter(isPairDesk)
  const chairs = pool.filter(isChair)
  const want = Math.min(desks.length, chairs.length, Math.max(floorDesks, floorChairs))
  let pairs = 0
  const tryPair = (gx: number, gy: number) => {
    const desk: GridPose = { itemId: desks[pairs], gx, gy: gy + 1, rot: 0 }
    const chair: GridPose = { itemId: chairs[pairs], gx, gy, rot: 0 }
    const cells = [...cellsOf(desk), ...cellsOf(chair)]
    if (!cells.every((c) => isIndoor(room, c.gx, c.gy) && !inZone(room, c))) return
    if (!fits(desk)) return
    commit(desk)
    if (!fits(chair)) {
      placed.pop()
      return
    }
    commit(chair)
    take(desk.itemId)
    take(chair.itemId)
    pairs++
  }
  // 통로를 남기는 칸부터(기본 자리와 같은 줄 간격), 모자라면 남은 칸
  for (let gy = 0; gy < room.rows - 1 && pairs < want; gy++) for (let gx = DESK_OX; gx < room.cols - 1 && pairs < want; gx++) if (isAisleSlot(gx - DESK_OX, gy)) tryPair(gx, gy)
  for (let gy = 0; gy < room.rows - 1 && pairs < want; gy++) for (let gx = 0; gx < room.cols - 1 && pairs < want; gx++) tryPair(gx, gy)

  // 책상 구역(짝들을 감싼 사각형 + 통로 1칸)과 출입구 앞에는 다른 가구를 두지 않는다
  const reserved = new Set<number>()
  const seatCells = placed.slice(kept).flatMap(cellsOf)
  if (seatCells.length) {
    const [x0, x1] = [Math.min(...seatCells.map((c) => c.gx)) - 1, Math.max(...seatCells.map((c) => c.gx)) + 1]
    const [y0, y1] = [Math.min(...seatCells.map((c) => c.gy)) - 1, Math.max(...seatCells.map((c) => c.gy)) + 1]
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isInside(room, x, y)) reserved.add(cellKey(room, x, y))
  }
  const door = fixed.find((t) => t.kind === 'entrance')
  if (door) for (let y = door.gy - 2; y <= door.gy; y++) for (let x = door.gx - 1; x <= door.gx + 1; x++) if (isInside(room, x, y)) reserved.add(cellKey(room, x, y))

  // 3. 나머지 가구: 성격 순서 → 큰 것 먼저 → 그 층에 있던 것 먼저
  let floorCells = 0
  for (let gy = 0; gy < room.rows; gy++) for (let gx = 0; gx < room.cols; gx++) if (isInside(room, gx, gy) && !fixedKeys.has(cellKey(room, gx, gy))) floorCells++
  const objectCells = () => placed.filter((p) => specOf(p.itemId).layer === 'object').reduce((n, p) => n + cellsOf(p).length, 0)
  const wasHere = new Set(before.map((g) => g.itemId))
  const area = (id: string) => specOf(id).size[0] * specOf(id).size[1]
  const deco = pool
    .filter((id) => !isPairDesk(id) && !isChair(id))
    .map((id, i) => ({ id, i }))
    .sort((a, b) => GROUP_ORDER.indexOf(groupOf(a.id)) - GROUP_ORDER.indexOf(groupOf(b.id)) || area(b.id) - area(a.id) || Number(wasHere.has(b.id)) - Number(wasHere.has(a.id)) || a.i - b.i)
    .map((x) => x.id)

  const lounge = { x: Math.max(2, room.cols * 0.25), y: room.rows * 0.75 }
  const play = { x: room.cols * 0.7, y: room.rows * 0.72 }
  const middle = { x: room.cols * 0.5, y: room.rows * 0.6 }
  const isOut = (gx: number, gy: number) => !isInside(room, gx, gy)
  /** 등이 벽(바닥 밖)에 붙었나 — 보는 방향 반대쪽 칸이 모두 바닥 밖 */
  const backToWall = (p: GridPose) => {
    const [dx, dy] = FACE_STEP[faceOf(p)]
    const cells = cellsOf(p)
    const own = new Set(cells.map((c) => `${c.gx},${c.gy}`))
    return cells.every((c) => own.has(`${c.gx - dx},${c.gy - dy}`) || isOut(c.gx - dx, c.gy - dy))
  }
  const nearEdge = (p: GridPose) => cellsOf(p).some((c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isOut(c.gx + dx, c.gy + dy)))
  const minDistTo = (p: GridPose, group: Group | null) => {
    const c = center(p)
    const ds = placed.slice(kept).filter((q) => group === null || groupOf(q.itemId) === group).map((q) => dist(c, center(q)))
    return ds.length ? Math.min(...ds) : 8
  }
  const rugAt = () => {
    const rug = placed.find((p) => groupOf(p.itemId) === 'rug')
    return rug ? center(rug) : lounge
  }

  /** 낮을수록 좋은 자리. null이면 그 성격에 맞지 않는 자리 */
  const score = (id: string, p: GridPose): number | null => {
    const g = groupOf(id)
    const c = center(p)
    if (g === 'wall') {
      if (!backToWall(p)) return null
      // 뒤 벽(↗)·왼쪽 벽(↖)을 등지는 것이 화면에서 앞을 본다. 서로 띄워서
      return (p.rot === 0 || p.rot === 3 ? 0 : 6) - Math.min(4, minDistTo(p, 'wall')) * 1.5 + (p.gx + p.gy) * 0.05
    }
    if (g === 'rug') return dist(c, lounge)
    if (g === 'sofa') {
      const a = rugAt()
      const d = dist(c, a)
      if (d < 1) return null
      const want = facingOf(a.x - c.x, a.y - c.y)
      return d + (faceOf(p) === want ? 0 : 3)
    }
    if (g === 'game') return dist(c, play)
    if (g === 'small') {
      if (!nearEdge(p)) return null
      return -Math.min(5, minDistTo(p, null)) + (p.gx + p.gy) * 0.02
    }
    return dist(c, middle)
  }

  /** 둘레 한 칸에 다른 가구(러그 제외)가 없나 — 바닥 밖은 괜찮다 */
  const hasRoom = (p: GridPose) => {
    const taken = new Set(placed.filter((q) => specOf(q.itemId).layer === 'object').flatMap((q) => cellsOf(q).map((c) => cellKey(room, c.gx, c.gy))))
    for (const c of cellsOf(p))
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = c.gx + dx
          const y = c.gy + dy
          if (isInside(room, x, y) && taken.has(cellKey(room, x, y))) return false
        }
    return true
  }

  for (const id of deco) {
    const isObject = specOf(id).layer === 'object'
    // 책장·화이트보드·러그 같은 실내 가구는 테라스·현관 앞(야외 칸)에 두지 않는다
    const isIndoorOnly = ['wall', 'rug', 'other'].includes(groupOf(id))
    if (isObject && objectCells() + area(id) > floorCells * FILL_MAX) continue
    const cands: { p: GridPose; s: number }[] = []
    for (let gy = 0; gy < room.rows; gy++)
      for (let gx = 0; gx < room.cols; gx++)
        for (const rot of [0, 1, 2, 3] as Rot[]) {
          const p: GridPose = { itemId: id, gx, gy, rot }
          const cells = cellsOf(p)
          if (!cells.every((c) => (isIndoorOnly ? isIndoor(room, c.gx, c.gy) : isInside(room, c.gx, c.gy)) && !fixedKeys.has(cellKey(room, c.gx, c.gy)) && !reserved.has(cellKey(room, c.gx, c.gy)) && !inZone(room, c))) continue
          const s = score(id, p)
          if (s !== null) cands.push({ p, s })
        }
    cands.sort((a, b) => a.s - b.s || a.p.gy - b.p.gy || a.p.gx - b.p.gx || a.p.rot - b.p.rot)
    // 먼저 둘레를 띄운 자리, 없으면 붙여서라도 (러그는 다른 가구와 겹쳐도 된다)
    const pick = cands.find((x) => (!isObject || hasRoom(x.p)) && fits(x.p)) ?? (isObject ? cands.find((x) => fits(x.p)) : undefined)
    if (!pick) continue
    commit(pick.p)
    take(id)
  }

  const left = new Map<string, number>()
  for (const id of pool) left.set(id, (left.get(id) ?? 0) + 1)
  return {
    floor,
    before,
    place: placed.map(({ itemId, gx, gy, rot }) => ({ itemId, gx, gy, rot })),
    kept,
    seatPairs: pairs,
    left: [...left].map(([itemId, count]) => ({ itemId, count })).sort((a, b) => b.count - a.count || (a.itemId < b.itemId ? -1 : 1)),
  }
}
