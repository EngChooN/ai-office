// 놓기 검사 (기술 설계 2-3·2-4절). 화면(꾸미기 미리보기)과 메인(저장 직전 재검사)이 같은 함수를 쓴다
import { shopItem } from '../economy.ts'
import { boxOf, cellKey, isInside, type Cell, type Room } from './grid.ts'
import { cellsOf, specOf, spotsOf, type GridItem, type GridPose } from './furniture.ts'
import { isoLevelOf, roomOf } from './levels.ts'
import { buildWalkMap, canEnter, reachable, type WalkMap } from './path.ts'
import { meetingLayoutOfCapacity } from './meeting.ts'

export type BlockReason = 'out_of_bounds' | 'fixed_tile' | 'overlap' | 'not_owned' | 'level_locked' | 'blocks_path'

/** 빨강 이유 한 줄 (김기획 문서 6-3절) — 꾸미기 화면·시제품이 같이 쓴다 */
export const REASON_TEXT: Record<BlockReason, string> = {
  out_of_bounds: '바닥 밖이에요',
  fixed_tile: '회의실·계단·문 자리예요',
  overlap: '다른 가구와 겹쳐요',
  not_owned: '서랍에 남은 게 없어요',
  level_locked: '레벨이 더 올라야 놓을 수 있어요',
  blocks_path: '길이 막혀요',
}

export type PlaceResult = { ok: true } | { ok: false; reason: BlockReason; tiles: [number, number][] }

/** 고정 칸: 회의실(오른쪽 뒤 구석) · 회의실 문 · 계단·엘리베이터(왼쪽 뒤 2×2, 층이 둘 이상일 때) · 출입구(앞쪽 가운데 1칸) */
export interface FixedTile extends Cell {
  kind: 'meeting' | 'meetingDoor' | 'stairs' | 'entrance'
  /** 구획 번호(path.ts). 없으면 회의실 칸은 MEETING_REGION, 나머지는 0 — 강당·대표실이 따로 쓸 때 */
  region?: number
  /** 지나갈 수 없는 칸 (회의 테이블·단상) */
  solid?: boolean
}

/** 한 층의 놓기 검사 재료. items는 모든 층의 shop.grid(서랍 개수 계산에 필요) — 검사는 floor 층만 */
export interface FloorState {
  level: number
  floor: number
  items: readonly GridItem[]
  /** 메인에서만: 산 개수. 없으면 소유·레벨 검사를 건너뛴다(화면 미리보기) */
  owned?: Readonly<Record<string, number>>
  /** 기본값 roomOf(level, floor) */
  room?: Room
  /** 기본값 fixedTiles(level, floor) */
  fixed?: readonly FixedTile[]
}

/** 회의실 칸 크기 (정원 → 배치표 meeting.ts) */
export const meetingSizeOf = (capacity: number) => {
  const l = meetingLayoutOfCapacity(capacity)
  return { w: l.w, d: l.d }
}

/** 칸 크기와 층 구성으로 고정 칸을 만든다 (fixedTiles의 본체 — 시험·시제품이 방 크기를 바꿔 쓸 때). 회의실은 상자의 오른쪽 뒤(배치표 meeting.ts), 출입구는 room.entrance(없으면 상자 앞 가운데) */
export function fixedTilesFor(room: Room, opts: { meetingCapacity: number; hasStairs: boolean }): FixedTile[] {
  const out: FixedTile[] = []
  const box = boxOf(room)
  const layout = meetingLayoutOfCapacity(opts.meetingCapacity)
  const x0 = box.cols - layout.w
  const solid = new Set(layout.solid.map((c) => `${c.gx},${c.gy}`))
  // 벽 있는 방만 구획으로 닫는다. 트인 자리(접이식·원목)는 구획 0 — 의자·테이블 말고는 바닥과 같다
  const region = layout.isWalled ? undefined : 0
  for (let y = 0; y < layout.d; y++)
    for (let x = 0; x < layout.w; x++) {
      const isDoor = layout.door?.gx === x && layout.door.gy === y
      const t: FixedTile = { gx: x0 + x, gy: y, kind: isDoor ? 'meetingDoor' : 'meeting' }
      if (region !== undefined) t.region = region
      if (solid.has(`${x},${y}`)) t.solid = true
      out.push(t)
    }
  if (opts.hasStairs) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) out.push({ gx: x, gy: y, kind: 'stairs' })
  const entrance = room.entrance ?? { gx: Math.floor(box.cols / 2), gy: room.rows - 1 }
  out.push({ gx: entrance.gx, gy: entrance.gy, kind: 'entrance' })
  return out
}

/** 레벨·층의 고정 칸. 회의실·계단은 모든 층이 같은 자리(상자 기준), 출입구만 층 평면을 따른다 */
export function fixedTiles(level: number, floor: number): FixedTile[] {
  const row = isoLevelOf(level)
  return fixedTilesFor(roomOf(level, floor), { meetingCapacity: row.meetingCapacity, hasStairs: row.floors > 1 })
}

const tilesOf = (cells: Cell[]): [number, number][] => cells.map((c) => [c.gx, c.gy])

/** 걸어서 닿아야 하는 곳: 앉는 자리·쓰는 자리(가구마다)와 회의실 문·계단 */
interface Target extends Cell {
  /** 차지 칸 안(의자)이면 옆에서 들어갈 수 있으면 됨 */
  isSeat: boolean
}

function targetsOf(items: readonly GridPose[], fixed: readonly FixedTile[]): Target[] {
  const out: Target[] = []
  for (const it of items) for (const s of spotsOf(it)) out.push({ gx: s.gx, gy: s.gy, isSeat: s.isInside })
  for (const t of fixed) if (t.kind === 'meetingDoor' || t.kind === 'stairs') out.push({ gx: t.gx, gy: t.gy, isSeat: false })
  return out
}

function isReached(m: WalkMap, seen: Uint8Array, t: Target) {
  if (!isInside(m.room, t.gx, t.gy)) return false
  if (t.isSeat) return canEnter(m, seen, t)
  const k = cellKey(m.room, t.gx, t.gy)
  return seen[k] === 1 && !m.blocked[k]
}

/** 출입구에서 닿지 못하는 자리 */
function unreachedTargets(room: Room, items: readonly GridPose[], fixed: readonly FixedTile[], targets: Target[]) {
  const entrance = fixed.find((t) => t.kind === 'entrance')
  if (!entrance) return []
  const m = buildWalkMap(room, items, fixed)
  const seen = reachable(m, entrance)
  return targets.filter((t) => !isReached(m, seen, t))
}

/**
 * 놓을 수 있는지. 순서대로 보고 처음 걸린 이유 하나와 빨강으로 칠할 칸을 돌려준다.
 * ignoreUid: 옮기는 가구 자신(겹침·길 검사에서 빼고, 서랍 개수에서도 빼지 않는다)
 */
export function canPlace(state: FloorState, item: GridPose, ignoreUid?: string): PlaceResult {
  // 0. 잘못된 입력 (폰·원격에서 오는 소수·범위 밖 값) — 칸 계산 전에 막는다. 칠할 칸은 없다
  const isBadRot = !Number.isInteger(item.rot) || item.rot < 0 || item.rot > 3
  const isBadFloor = !Number.isInteger(state.floor) || state.floor < 1 || state.floor > isoLevelOf(state.level).floors
  if (!Number.isInteger(item.gx) || !Number.isInteger(item.gy) || isBadRot || isBadFloor) return { ok: false, reason: 'out_of_bounds', tiles: [] }

  const room = state.room ?? roomOf(state.level, state.floor)
  const fixed = state.fixed ?? fixedTiles(state.level, state.floor)
  const cells = cellsOf(item)

  // 1. 바닥 밖
  const outside = cells.filter((c) => !isInside(room, c.gx, c.gy))
  if (outside.length) return { ok: false, reason: 'out_of_bounds', tiles: tilesOf(outside) }
  // 1-1. 서는 자리가 바닥 밖 (벽 쪽을 보는 책장·옆자리가 벽 밖인 축구 게임대) — 가구는 방 안이니 가구 칸을 칠한다
  if (spotsOf(item).some((s) => !isInside(room, s.gx, s.gy))) return { ok: false, reason: 'out_of_bounds', tiles: tilesOf(cells) }

  // 2. 고정 칸
  const fixedKeys = new Set(fixed.map((t) => cellKey(room, t.gx, t.gy)))
  const onFixed = cells.filter((c) => fixedKeys.has(cellKey(room, c.gx, c.gy)))
  if (onFixed.length) return { ok: false, reason: 'fixed_tile', tiles: tilesOf(onFixed) }

  // 3. 겹침 — 같은 layer끼리만 (러그 위 책상은 된다)
  const others = state.items.filter((it) => it.floor === state.floor && it.uid !== ignoreUid)
  const layer = specOf(item.itemId).layer
  const taken = new Set<number>()
  for (const it of others) if (specOf(it.itemId).layer === layer) for (const c of cellsOf(it)) taken.add(cellKey(room, c.gx, c.gy))
  const overlap = cells.filter((c) => taken.has(cellKey(room, c.gx, c.gy)))
  if (overlap.length) return { ok: false, reason: 'overlap', tiles: tilesOf(overlap) }

  // 4. 소유·레벨 (메인에서만)
  if (state.owned) {
    const isMoving = ignoreUid !== undefined && state.items.some((it) => it.uid === ignoreUid && it.itemId === item.itemId)
    const used = state.items.filter((it) => it.itemId === item.itemId).length
    if (!isMoving && (state.owned[item.itemId] ?? 0) - used <= 0) return { ok: false, reason: 'not_owned', tiles: tilesOf(cells) }
    const minLevel = shopItem(item.itemId)?.minLevel ?? 1
    if (state.level < minLevel) return { ok: false, reason: 'level_locked', tiles: tilesOf(cells) }
  }

  // 5. 길 막힘 — 놓았다고 가정하고 출입구에서 BFS. 원래 닿던 자리가 끊기거나, 놓는 가구 자신의 자리에 못 닿으면 막힘.
  //    (원래부터 못 닿던 자리는 이 가구 탓이 아니므로 보지 않는다)
  const before = new Set(unreachedTargets(room, others, fixed, targetsOf(others, fixed)).map((t) => `${t.gx},${t.gy}`))
  const after = [...others, item]
  const lost = unreachedTargets(room, after, fixed, targetsOf(after, fixed)).filter((t) => !before.has(`${t.gx},${t.gy}`))
  if (lost.length) return { ok: false, reason: 'blocks_path', tiles: tilesOf(lost) }

  return { ok: true }
}

/** 한 층의 책상 자리 상한 = 업무 칸(실내 바닥 − 고정 칸) ÷ 8 (office-iso-spaces.md 1-4절). 그 레벨에 없는 층은 0 */
export function seatCapOf(level: number, floor: number): number {
  if (floor > isoLevelOf(level).floors) return 0
  const room = roomOf(level, floor)
  const fixed = new Set(fixedTiles(level, floor).map((t) => cellKey(room, t.gx, t.gy)))
  let work = 0
  for (let gy = 0; gy < room.rows; gy++)
    for (let gx = 0; gx < room.cols; gx++) if (isInside(room, gx, gy) && !fixed.has(cellKey(room, gx, gy)) && (!room.cells || room.cells[gy * room.cols + gx] === 1)) work++
  return Math.floor(work / 8)
}

/** 책상 자리 상한이 지금보다 늘어나는 가장 가까운 레벨 */
export function nextSeatCap(level: number, floor: number, maxLevel = 20): { level: number; cap: number } | null {
  const now = seatCapOf(level, floor)
  for (let lv = Math.floor(level) + 1; lv <= maxLevel; lv++) {
    const cap = seatCapOf(lv, floor)
    if (cap > now) return { level: lv, cap }
  }
  return null
}
