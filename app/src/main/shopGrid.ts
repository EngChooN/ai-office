// 칸 배치 저장 직전 재검사 (docs/specs/office-iso-tech.md 2-3절·4-2절). Office가 부르고, electron을 쓰지 않아 scripts/isoMigrate.test.mts가 그대로 돌린다
// 화면이 미리 검사해도 메인에서 canPlace로 다시 본다(소유·레벨 포함). 막히면 BlockedError → 원격 422 blocked { reason }

import { drawerCount, isGridFurniture, shopItem, type ShopState } from '../shared/economy.ts'
import { BlockedError, InvalidArgsError } from '../shared/errors.ts'
import type { Rot } from '../shared/iso/furniture.ts'
import { cellKey, isInside } from '../shared/iso/grid.ts'
import { stowTargets } from '../shared/iso/stowTargets.ts'
import { cellsOf, spotsOf, type GridItem } from '../shared/iso/furniture.ts'
import { isoLevelOf, roomOf } from '../shared/iso/levels.ts'
import { canPlace, fixedTiles, type FloorState } from '../shared/iso/place.ts'

// 서랍 개수·칸 가구 판정은 화면(꾸미기 서랍)도 쓰므로 shared/economy에 있다
export { drawerCount, isGridFurniture, stowTargets }

const floorState = (shop: ShopState, level: number, floor: number): FloorState => ({ level, floor, items: shop.grid, owned: shop.owned })

/** 인자 모양(400 invalid_args) → 층 수 → canPlace(422 blocked) */
function checkPose(shop: ShopState, level: number, itemId: string, floor: number, gx: number, gy: number, rot: number, ignoreUid?: string): Rot {
  if (![floor, gx, gy].every(Number.isInteger) || ![0, 1, 2, 3].includes(rot)) throw new InvalidArgsError('층·칸은 정수, 방향은 0~3이어야 해요')
  if (floor < 1 || floor > isoLevelOf(level).floors) throw new BlockedError('out_of_bounds', '아직 없는 층이에요')
  const r = canPlace(floorState(shop, level, floor), { itemId, gx, gy, rot: rot as Rot }, ignoreUid)
  if (!r.ok) throw new BlockedError(r.reason)
  return rot as Rot
}

/** 서랍의 가구 하나를 칸에 놓은 상태 */
export function placeGridItem(shop: ShopState, level: number, uid: string, itemId: string, floor: number, gx: number, gy: number, rot: number): ShopState {
  if (!isGridFurniture(itemId)) throw new InvalidArgsError('칸에 놓을 수 있는 가구가 아니에요')
  const r = checkPose(shop, level, itemId, floor, gx, gy, rot)
  return { ...shop, grid: [...shop.grid, { uid, itemId, floor, gx, gy, rot: r }] }
}

/** 놓인 가구를 다른 칸·층·방향으로 옮긴 상태. 자기 자신은 겹침·길 검사에서 뺀다 */
export function moveGridItem(shop: ShopState, level: number, uid: string, floor: number, gx: number, gy: number, rot: number): ShopState {
  const cur = shop.grid.find((g) => g.uid === uid)
  if (!cur) throw new InvalidArgsError('놓여 있는 가구가 아니에요')
  const r = checkPose(shop, level, cur.itemId, floor, gx, gy, rot, uid)
  return { ...shop, grid: shop.grid.map((g) => (g.uid === uid ? { ...g, floor, gx, gy, rot: r } : g)) }
}

/**
 * 예전 placeItem(itemId, x?, y?) (D2): 1층 첫 빈칸(gy, gx 순, 놓기 검사 통과, rot 0)에 자동으로 놓는다. x·y(예전 픽셀 좌표)는 쓰지 않는다.
 * 상점 가구가 아니거나 서랍에 없으면 예전처럼 아무것도 안 함(null). 빈칸이 없으면 BlockedError('no_space')
 */
export function placeLegacyItem(shop: ShopState, level: number, uid: string, itemId: string): ShopState | null {
  if (!isGridFurniture(itemId) || drawerCount(shop, itemId) <= 0) return null
  const state = floorState(shop, level, 1)
  const room = roomOf(level, 1)
  for (let gy = 0; gy < room.rows; gy++)
    for (let gx = 0; gx < room.cols; gx++) if (canPlace(state, { itemId, gx, gy, rot: 0 }).ok) return { ...shop, grid: [...shop.grid, { uid, itemId, floor: 1, gx, gy, rot: 0 }] }
  throw new BlockedError('no_space', '1층에 놓을 빈자리가 없어요')
}

/** 예전 moveItem(uid, x, y): 칸 배치 가구(grid uid)면 아무것도 안 하고 성공(null) — 예전 폰 화면이 엉뚱한 칸으로 옮기지 않게 */
export function moveLegacyItem(shop: ShopState, uid: string, x: number, y: number): ShopState | null {
  if (shop.grid.some((g) => g.uid === uid)) return null
  return { ...shop, placed: shop.placed.map((p) => (p.uid === uid ? { ...p, x: Math.round(x), y: Math.round(y) } : p)) }
}

/** 서랍으로 — grid·placed 둘 다에서 찾는다 */
export function storeItem(shop: ShopState, uid: string): ShopState {
  return { ...shop, grid: shop.grid.filter((g) => g.uid !== uid), placed: shop.placed.filter((p) => p.uid !== uid) }
}

/**
 * 평면·회의실이 바뀐 뒤 바닥 밖이거나 고정 칸(회의실·계단·출입구)에 걸린 가구를 grid에서 뺀다 (office-iso-spaces.md 3-2절).
 * 서랍 개수는 owned − grid라 따로 더하지 않아도 서랍으로 돌아간다. 같은 입력이면 같은 결과(멱등), 뺀 가구를 돌려준다.
 * 겹침·길 막힘은 놓을 때 검사한 것이라 보지 않는다. 층이 없어진 가구(floor > floors)도 뺀다
 */
export function settleGrid(shop: ShopState, level: number): { shop: ShopState; removed: GridItem[] } {
  const floors = isoLevelOf(level).floors
  const fixedByFloor = new Map<number, Set<number>>()
  const isStuck = (g: GridItem) => {
    if (g.floor < 1 || g.floor > floors) return true
    const room = roomOf(level, g.floor)
    if (cellsOf(g).some((c) => !isInside(room, c.gx, c.gy))) return true
    if (spotsOf(g).some((s) => !isInside(room, s.gx, s.gy))) return true
    let keys = fixedByFloor.get(g.floor)
    if (!keys) fixedByFloor.set(g.floor, (keys = new Set(fixedTiles(level, g.floor).map((t) => cellKey(room, t.gx, t.gy)))))
    return cellsOf(g).some((c) => keys.has(cellKey(room, c.gx, c.gy)))
  }
  const removed = shop.grid.filter(isStuck)
  if (!removed.length) return { shop, removed }
  return { shop: { ...shop, grid: shop.grid.filter((g) => !removed.includes(g)) }, removed }
}

/**
 * 전부 치우기 — 대상 가구를 한 번에 grid에서 뺀다 (판매·삭제 아님, 서랍 개수 = owned − grid라 그만큼 늘어난다).
 * owned·gear·surfaces와 지급 기록(levelgrant·zonegrant 설정 키)은 건드리지 않아 다시 깔리지 않는다. 치운 가구를 돌려준다(되돌리기용)
 */
export function stowAll(shop: ShopState, floor: number | null, keepSeats: boolean): { shop: ShopState; stowed: GridItem[] } {
  const stowed = stowTargets(shop.grid, floor, keepSeats)
  if (!stowed.length) return { shop, stowed }
  return { shop: { ...shop, grid: shop.grid.filter((g) => !stowed.includes(g)) }, stowed }
}

/** 되돌리기 — 치우기 전 가구를 원래 자리에 다시 놓는다. 그사이 서랍이 모자라거나 자리가 막힌 가구는 건너뛴다 */
export function restoreGrid(shop: ShopState, level: number, items: readonly GridItem[]): ShopState {
  let cur = shop
  for (const it of items) {
    if (cur.grid.some((g) => g.uid === it.uid) || !isGridFurniture(it.itemId) || drawerCount(cur, it.itemId) <= 0) continue
    if (!Number.isInteger(it.floor) || it.floor < 1 || it.floor > isoLevelOf(level).floors) continue
    // 길 막힘은 보지 않는다 — 전체가 한 번 유효했던 배치이고, 하나씩 되놓는 중간에는 책상 없는 의자처럼 일시적으로 막혀 보일 수 있다
    const r = canPlace(floorState(cur, level, it.floor), it)
    if (!r.ok && r.reason !== 'blocks_path') continue
    cur = { ...cur, grid: [...cur.grid, { uid: it.uid, itemId: it.itemId, floor: it.floor, gx: it.gx, gy: it.gy, rot: it.rot }] }
  }
  return cur
}
