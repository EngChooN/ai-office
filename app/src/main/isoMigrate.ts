// 칸 배치로 옮기기 (docs/specs/office-iso-tech.md 3절 + 10절 대표님 확정 D3) — 메인 시작 시 한 번, 트랜잭션 하나
// 산 가구는 서랍으로(placed = []), 예전 settings.layout 고정 소품은 prop-* 품목으로 만들어 기본 위치에 grid로 놓는다.
// settings.layout은 지우지 않는다(예전 폰 화면만 읽음). electron을 쓰지 않아 scripts/isoMigrate.test.mts가 그대로 돌린다

import type { DatabaseSync } from 'node:sqlite'
import { EMPTY_SHOP, isGridFurniture, LEVEL_GRANTS, type ShopState } from '../shared/economy.ts'
import { FURNITURE, type GridItem, type Rot } from '../shared/iso/furniture.ts'
import { boxOf } from '../shared/iso/grid.ts'
import { isoLevelOf, roomOf } from '../shared/iso/levels.ts'
import { canPlace } from '../shared/iso/place.ts'
import { ZONE_LAYOUTS, zoneGrantsById, type ZoneLayout } from '../shared/iso/zoneLayouts.ts'
import { autoSeats } from '../shared/iso/seats.ts'

export const SHOP_BACKUP_KEY = 'shop.backup.v1'
/** 예전 장면(OfficeScene LEVEL_SPECS)은 10단계 — 소품이 보이던 조건은 이 레벨로 본다 */
const LEGACY_MAX_LEVEL = 10
const LEGACY_PLANT_SPOTS = 8
/** 회사 경험치 → 예전 10단계 레벨 (표는 shared/officeLevel.ts, 개편 안내와 같이 쓴다) */
export { legacyLevelOfXp } from '../shared/officeLevel.ts'
const ROTS: readonly Rot[] = [0, 1, 2, 3]

/**
 * 예전 장면에서 그 레벨에 보이던 고정 소품 (settings.layout 키). 조건은 OfficeScene.ts LEVEL_SPECS와 같다:
 * officeGear Lv.3~ · pantry 1 = Lv.2~4, 2 = Lv.5~ · lobby Lv.6~ · gameZone Lv.7~ · aquarium Lv.8~ · rooftop Lv.9~ · campus Lv.10.
 * 화분은 settings.plants + (Lv.8~ 2개), 자리 8개까지. prop-* 규격이 없는 것(냉장고·빈백·카페 탁자 등)은 옮기지 않는다
 */
export function legacyPropKeys(level: number, plants: number): string[] {
  const L = Math.min(LEGACY_MAX_LEVEL, Math.max(1, Math.floor(level) || 1))
  const keys: string[] = []
  if (L >= 3) keys.push('printer', 'cabinets')
  keys.push('trash', 'lamp')
  if (L >= 8) keys.push('aquarium')
  if (L >= 10) keys.push('trophies')
  if (L >= 2 && L <= 4) keys.push('coffeeCorner')
  if (L >= 5) keys.push('kitchen')
  keys.push('cooler', 'sofa')
  if (L >= 7) keys.push('pingpong', 'arcade', 'napPod')
  if (L >= 6) keys.push('reception')
  if (L >= 10) keys.push('lobbyTrophies')
  if (L >= 9) keys.push('bbq')
  if (L >= 10) keys.push('fountain')
  const plantCount = Math.min(LEGACY_PLANT_SPOTS, Math.max(0, Math.floor(plants) || 0) + (L >= 8 ? 2 : 0))
  for (let i = 0; i < plantCount; i++) keys.push(`plant${i}`)
  return keys
}

/** 소품 키 → 품목 id ('plant3' → 'prop-plant') */
export const propItemId = (key: string) => `prop-${key.replace(/^plant\d+$/, 'plant')}`
/** 옮기면서 놓은 소품의 uid — 몇 번 돌려도 같다 */
export const propUid = (key: string) => `legacy:${key}`

/**
 * 놓아 볼 칸 순서: 가장자리부터 안쪽으로, 같은 둘레에서는 앞쪽(gy가 큰 쪽)·왼쪽부터.
 * 뒤쪽 줄은 기본 자리(autoSeats)가 먼저 쓰도록 비워 둔다. 정확한 기본 위치는 시제품을 보고 다시 맞춘다
 */
function candidateCells(cols: number, rows: number) {
  const out: { gx: number; gy: number; ring: number }[] = []
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) out.push({ gx, gy, ring: Math.min(gx, gy, cols - 1 - gx, rows - 1 - gy) })
  return out.sort((a, b) => a.ring - b.ring || b.gy - a.gy || a.gx - b.gx)
}

/**
 * 소품을 기본 위치에 놓는다. 1층부터, 놓기 검사(canPlace — 바닥 밖·고정 칸·겹침·길 막힘)를 통과하는 첫 칸·방향.
 * 어느 층에도 자리가 없으면 놓지 않는다(서랍에 남는다)
 */
export function placeDefaultProps(level: number, keys: readonly string[], existing: readonly GridItem[] = []): GridItem[] {
  const floors = isoLevelOf(level).floors
  const grid = [...existing]
  for (const key of keys) {
    const itemId = propItemId(key)
    if (!FURNITURE[itemId]) continue
    found: for (let floor = 1; floor <= floors; floor++) {
      // 가장자리 순서는 칸 크기 상자 기준 — 1층 돌출부·테라스(야외)는 후보에서 뺀다
      const box = boxOf(roomOf(level, floor))
      for (const c of candidateCells(box.cols, box.rows))
        for (const rot of ROTS)
          if (canPlace({ level, floor, items: grid }, { itemId, gx: c.gx, gy: c.gy, rot }).ok) {
            grid.push({ uid: propUid(key), itemId, floor, gx: c.gx, gy: c.gy, rot })
            break found
          }
    }
  }
  return grid.slice(existing.length)
}

/**
 * 옮긴 상점 상태. 이미 옮겼으면(schema 2) 그대로 돌려준다.
 * 산 가구의 owned는 그대로(placed = []라 모두 서랍 개수로 돌아감), 보이던 소품마다 owned['prop-…'] += 1 하고 기본 위치에 grid로 놓는다
 */
export function migrateShop(shop: ShopState, opts: { level: number; plants: number; legacyLevel?: number }): ShopState {
  if (shop.schema === 2) return shop
  // 소품은 예전 장면(예전 레벨)에 보이던 것, 놓는 방은 새 레벨의 방
  const keys = legacyPropKeys(opts.legacyLevel ?? opts.level, opts.plants)
  const owned = { ...shop.owned }
  for (const key of keys) {
    const id = propItemId(key)
    if (FURNITURE[id]) owned[id] = (owned[id] ?? 0) + 1
  }
  const grid = placeDefaultProps(opts.level, keys, shop.grid ?? [])
  return { ...shop, owned, placed: [], grid: [...(shop.grid ?? []), ...grid], schema: 2 }
}

/**
 * DB에서 옮기기 (트랜잭션 하나). shop.schema가 2가 아닐 때만: 지금 'shop' JSON과 settings.layout을 shop.backup.v1에 보관
 * (이미 있으면 덮어쓰지 않는다 — 가장 처음 것을 지킨다) → 옮긴 shop 저장. 결과 shop을 돌려준다.
 * level은 레벨을 계산하는 쪽(Office.company)이 넘긴다
 */
export function runIsoMigration(db: DatabaseSync, opts: { level: number; legacyLevel?: number }): ShopState {
  db.exec('BEGIN IMMEDIATE')
  try {
    const shopRow = db.prepare("SELECT value FROM setting WHERE key = 'shop'").get() as { value: string } | undefined
    const shop: ShopState = { ...EMPTY_SHOP, ...(shopRow ? (JSON.parse(shopRow.value) as Partial<ShopState>) : {}) }
    if (shop.schema === 2) {
      db.exec('COMMIT')
      return shop
    }
    const settingsRow = db.prepare("SELECT value FROM setting WHERE key = 'settings'").get() as { value: string } | undefined
    const settings = settingsRow ? (JSON.parse(settingsRow.value) as { layout?: unknown; plants?: unknown }) : {}
    const backup = { at: Date.now(), shop: shopRow ? JSON.parse(shopRow.value) : null, layout: settings.layout ?? {} }
    db.prepare('INSERT OR IGNORE INTO setting (key, value) VALUES (?, ?)').run(SHOP_BACKUP_KEY, JSON.stringify(backup))
    // 화분 수 기본값은 types.ts DEFAULT_SETTINGS(3)와 같다
    const next = migrateShop(shop, { level: opts.level, legacyLevel: opts.legacyLevel, plants: typeof settings.plants === 'number' ? settings.plants : 3 })
    db.prepare("INSERT INTO setting (key, value) VALUES ('shop', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(next))
    db.exec('COMMIT')
    return next
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

// ── 레벨 기본 지급 (office-iso-levels.md 2-3절) ─────────────
// 도달한 레벨의 기본 지급 가구를 owned에 더한다. 레벨마다 설정 키 levelgrant:{n}을 INSERT OR IGNORE로 남겨 한 번만 준다
// (levelup:{n} 보상과 같은 방식 — 몇 번 켜도, 레벨이 내려갔다 다시 올라도 다시 주지 않는다). 칸 배치로 옮긴 뒤(schema 2)에만 돈다

export const levelGrantKey = (level: number) => `levelgrant:${level}`

/** 기본 지급을 이미 받은 레벨들 (levelgrant:{n} 키) */
export function grantedLevels(db: DatabaseSync): number[] {
  const rows = db.prepare("SELECT key FROM setting WHERE key LIKE 'levelgrant:%'").all() as { key: string }[]
  return rows.map((r) => Number(r.key.slice('levelgrant:'.length))).filter((n) => Number.isInteger(n) && n > 0)
}
export const zoneGrantKey = (zone: string) => `zonegrant:${zone}`

/** 구역 지급을 이미 받은 구역들 (zonegrant:{구역} 키) */
export function grantedZones(db: DatabaseSync): string[] {
  const rows = db.prepare("SELECT key FROM setting WHERE key LIKE 'zonegrant:%'").all() as { key: string }[]
  return rows.map((r) => r.key.slice('zonegrant:'.length)).filter(Boolean)
}

/** 이 레벨에서 지급 대상인 구역: 레벨이 됐고 그 층이 이 레벨에 있다 */
export function zonesOpenAt(level: number, layouts: Readonly<Record<string, ZoneLayout>> = ZONE_LAYOUTS): string[] {
  const floors = isoLevelOf(level).floors
  return Object.entries(layouts).filter(([, z]) => z.level <= level && z.floor <= floors).map(([id]) => id)
}

/** Lv.1 기본 지급 책상·의자를 처음 줄 때 실제로 놓는 uid 앞부분 (기본 자리 auto:와 달리 저장된다) */
export const GRANT_SEAT_PREFIX = 'grant:'
/** 구역 기본 가구의 uid 앞부분 */
export const ZONE_UID_PREFIX = 'zone:'
const GRANT_DESK = 'lv-folding-desk'
const GRANT_CHAIR = 'lv-folding-chair'

/**
 * 기본 지급 책상·의자를 기본 자리(autoSeats) 위치에 놓는다 — 1층, 놓기 검사를 통과하는 곳만, pairs 쌍까지.
 * 기본 자리와 같은 자리라 처음 켰을 때 모습이 바뀌지 않고, 이제 저장된 가구라 꾸미기에서 옮길 수 있다
 */
export function placeGrantSeats(level: number, grid: readonly GridItem[], pairs: number): GridItem[] {
  const autos = autoSeats({ level, floor: 1, items: [...grid] }, pairs)
  return autos.map((a, i) => ({ ...a, uid: `${GRANT_SEAT_PREFIX}${Math.floor(i / 2) + 1}${a.itemId === 'desk' ? 'd' : 'c'}`, itemId: a.itemId === 'desk' ? GRANT_DESK : GRANT_CHAIR }))
}

/** 새로 지급할 레벨들의 가구를 owned에 더한다. Lv.1이 새로 지급되면 책상·의자를 기본 자리 위치에 놓는다 */
export function applyLevelGrants(shop: ShopState, level: number, newly: readonly number[], newlyZones: readonly string[] = [], layouts: Readonly<Record<string, ZoneLayout>> = ZONE_LAYOUTS): ShopState {
  if (!newly.length && !newlyZones.length) return shop
  const owned = { ...shop.owned }
  for (const lv of newly) for (const [id, n] of Object.entries(LEVEL_GRANTS[lv] ?? {})) owned[id] = (owned[id] ?? 0) + n
  const zoneGrants = zoneGrantsById(layouts)
  for (const z of newlyZones) for (const [id, n] of Object.entries(zoneGrants[z] ?? {})) owned[id] = (owned[id] ?? 0) + n
  let grid = shop.grid
  if (newly.includes(1)) {
    const pairs = Math.min(LEVEL_GRANTS[1]?.[GRANT_DESK] ?? 0, LEVEL_GRANTS[1]?.[GRANT_CHAIR] ?? 0)
    grid = [...grid, ...placeGrantSeats(level, grid, pairs)]
  }
  grid = placeZoneItems(level, grid, newlyZones, layouts)
  return { ...shop, owned, grid }
}

/** 새로 지급하는 구역의 기본 가구를 정해 둔 위치에 놓는다. 놓기 검사에 걸리면(사용자 가구가 있거나 평면이 달라 안 맞으면) 그 가구는 서랍에 둔다 */
export function placeZoneItems(level: number, grid: readonly GridItem[], newlyZones: readonly string[], layouts: Readonly<Record<string, ZoneLayout>> = ZONE_LAYOUTS): GridItem[] {
  const out = [...grid]
  for (const [zoneId, z] of Object.entries(layouts)) {
    if (!newlyZones.includes(zoneId) || z.floor > isoLevelOf(level).floors) continue
    z.items.forEach((it, i) => {
      if (!isGridFurniture(it.itemId) || !canPlace({ level, floor: z.floor, items: out }, it).ok) return
      out.push({ uid: `${ZONE_UID_PREFIX}${zoneId}:${i}`, itemId: it.itemId, floor: z.floor, gx: it.gx, gy: it.gy, rot: it.rot })
    })
  }
  return out
}

/**
 * DB에서 기본 지급 (트랜잭션 하나). 칸 배치로 옮기기 전(schema !== 2)이면 아무것도 안 함.
 * 1~level 중 지급 표가 있는 레벨마다 levelgrant:{n}, 열린 구역마다 zonegrant:{구역} 키를 INSERT OR IGNORE — 새로 들어간 것만 준다. 바뀐 게 있으면 새 상점 상태, 없으면 null
 */
export function runLevelGrants(db: DatabaseSync, level: number): ShopState | null {
  db.exec('BEGIN IMMEDIATE')
  try {
    const row = db.prepare("SELECT value FROM setting WHERE key = 'shop'").get() as { value: string } | undefined
    const shop: ShopState = { ...EMPTY_SHOP, ...(row ? (JSON.parse(row.value) as Partial<ShopState>) : {}) }
    if (shop.schema !== 2) {
      db.exec('COMMIT')
      return null
    }
    const insert = db.prepare('INSERT OR IGNORE INTO setting (key, value) VALUES (?, ?)')
    const at = JSON.stringify({ at: Date.now() })
    const newly: number[] = []
    for (let lv = 1; lv <= level; lv++) if (LEVEL_GRANTS[lv] && insert.run(levelGrantKey(lv), at).changes === 1) newly.push(lv)
    // 구역 지급은 레벨 지급과 따로 — 이미 레벨 지급을 받은 저장분도 새 구역 가구를 받는다
    const newlyZones = zonesOpenAt(level).filter((z) => insert.run(zoneGrantKey(z), at).changes === 1)
    if (!newly.length && !newlyZones.length) {
      db.exec('COMMIT')
      return null
    }
    const next = applyLevelGrants(shop, level, newly, newlyZones)
    db.prepare("INSERT INTO setting (key, value) VALUES ('shop', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(next))
    db.exec('COMMIT')
    return next
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
