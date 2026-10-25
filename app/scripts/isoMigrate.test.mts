// 칸 배치로 옮기기 (docs/specs/office-iso-tech.md 3절, 10절 D3) + 메인 재검사·예전 메서드 호환 (4-2절)
// 옮기기는 실제 sqlite(메모리)로 트랜잭션까지 돌린다

import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { dailyDeals, drawerCount as drawerOf, EMPTY_SHOP, isGridFurniture, LEVEL_GRANTS, SHOP_ITEMS, shopItem, type ShopState } from '../src/shared/economy.ts'
import { FURNITURE } from '../src/shared/iso/furniture.ts'
import { seatsOf } from '../src/shared/iso/seats.ts'
import { BlockedError, InvalidArgsError } from '../src/shared/errors.ts'
import { canPlace } from '../src/shared/iso/place.ts'
import { legacyLevelOfXp, legacyPropKeys, migrateShop, placeDefaultProps, propItemId, propUid, runIsoMigration, runLevelGrants, SHOP_BACKUP_KEY, levelGrantKey, GRANT_SEAT_PREFIX } from '../src/main/isoMigrate.ts'
import { drawerCount, moveGridItem, moveLegacyItem, placeGridItem, placeLegacyItem, storeItem } from '../src/main/shopGrid.ts'

const OLD_SHOP: ShopState = {
  owned: { fern: 2, 'sofa-green': 1, 'wall-cream': 1 },
  surfaces: { work: { wallpaper: 'wall-cream' } },
  placed: [
    { uid: 'p1', itemId: 'fern', x: 120, y: 300 },
    { uid: 'p2', itemId: 'sofa-green', x: 168, y: 300 },
  ],
  gear: { kim: { desk: 'desk-oak' } },
} as unknown as ShopState
const LAYOUT = { printer: { dx: 10, dy: -4 }, plant0: { dx: 3, dy: 3 } }
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

// ── 보이던 소품 ─────────────────────────────────────────

test('보이던 소품: 예전 장면(LEVEL_SPECS) 조건 그대로 — Lv.1은 기본만, Lv.10은 캠퍼스까지, 11 이상은 10과 같다', () => {
  assert.deepEqual(legacyPropKeys(1, 3), ['trash', 'lamp', 'cooler', 'sofa', 'plant0', 'plant1', 'plant2'])
  assert.deepEqual(legacyPropKeys(3, 0), ['printer', 'cabinets', 'trash', 'lamp', 'coffeeCorner', 'cooler', 'sofa'])
  const ten = legacyPropKeys(10, 3)
  for (const k of ['aquarium', 'trophies', 'kitchen', 'pingpong', 'arcade', 'napPod', 'reception', 'lobbyTrophies', 'bbq', 'fountain']) assert.ok(ten.includes(k), k)
  assert.ok(!ten.includes('coffeeCorner'))
  // 화분: plants + Lv.8부터 2개, 자리 8개까지
  assert.equal(ten.filter((k) => k.startsWith('plant')).length, 5)
  assert.equal(legacyPropKeys(10, 20).filter((k) => k.startsWith('plant')).length, 8)
  assert.deepEqual(legacyPropKeys(15, 3), ten)
  assert.equal(propItemId('plant5'), 'prop-plant')
  assert.equal(propItemId('napPod'), 'prop-napPod')
})

// ── 옮기기 (순수 함수) ──────────────────────────────────

test('옮기기: 산 가구는 서랍으로(placed = [], owned 그대로), 소품은 prop-* 품목으로 기본 위치에 grid로 (D3)', () => {
  const next = migrateShop(OLD_SHOP, { level: 1, plants: 3 })
  assert.equal(next.schema, 2)
  assert.deepEqual(next.placed, [])
  // 산 물건 owned는 하나도 바뀌지 않는다 → 산 가구 서랍 개수 = 산 개수
  for (const [id, n] of Object.entries(OLD_SHOP.owned)) assert.equal(next.owned[id], n, id)
  assert.equal(drawerCount(next, 'fern'), 2)
  assert.equal(drawerCount(next, 'sofa-green'), 1)
  // 전후 owned 합계: 늘어난 만큼이 정확히 grid에 놓인 소품 수 (산 물건 합계는 같다)
  assert.equal(sum(next.owned) - sum(OLD_SHOP.owned), next.grid.length)
  assert.equal(sum(Object.fromEntries(Object.entries(next.owned).filter(([id]) => !id.startsWith('prop-')))), sum(OLD_SHOP.owned))
  // 보이던 소품이 모두 1층 기본 위치에 놓였고 서랍에는 남지 않는다
  const keys = legacyPropKeys(1, 3)
  assert.deepEqual(next.grid.map((g) => g.uid), keys.map(propUid))
  assert.ok(next.grid.every((g) => g.floor === 1 && g.itemId.startsWith('prop-')))
  for (const id of new Set(next.grid.map((g) => g.itemId))) assert.equal(drawerCount(next, id), 0, id)
  // 기본 위치 = placeDefaultProps 결과, 놓인 그대로 놓기 검사를 통과한다(겹침·고정 칸·길 막힘 없음)
  assert.deepEqual(next.grid, placeDefaultProps(1, keys))
  for (const g of next.grid) assert.deepEqual(canPlace({ level: 1, floor: g.floor, items: next.grid, owned: next.owned }, g, g.uid), { ok: true }, g.uid)
  // 상점 상태의 나머지(벽지·꾸밈)는 그대로
  assert.deepEqual([next.surfaces, next.gear], [OLD_SHOP.surfaces, OLD_SHOP.gear])
})

test('옮기기: 두 번 돌려도 같다 (schema 2면 손대지 않음), 소품이 많은 Lv.10도 모두 놓인다', () => {
  const once = migrateShop(OLD_SHOP, { level: 10, plants: 3 })
  const twice = migrateShop(once, { level: 10, plants: 3 })
  assert.equal(twice, once)
  assert.deepEqual(migrateShop(structuredClone(OLD_SHOP), { level: 10, plants: 3 }), once)
  assert.equal(once.grid.length, legacyPropKeys(10, 3).length)
  for (const g of once.grid) assert.deepEqual(canPlace({ level: 10, floor: g.floor, items: once.grid }, g, g.uid), { ok: true }, g.uid)
})

// ── 옮기기 (DB 트랜잭션) ────────────────────────────────

function memDb(shop: unknown, settings: unknown) {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  if (shop !== undefined) db.prepare("INSERT INTO setting (key, value) VALUES ('shop', ?)").run(typeof shop === 'string' ? shop : JSON.stringify(shop))
  if (settings !== undefined) db.prepare("INSERT INTO setting (key, value) VALUES ('settings', ?)").run(JSON.stringify(settings))
  return db
}
const read = (db: DatabaseSync, key: string) => {
  const row = db.prepare('SELECT value FROM setting WHERE key = ?').get(key) as { value: string } | undefined
  return row ? JSON.parse(row.value) : undefined
}

test('옮기기 DB: 백업 키(shop.backup.v1)에 예전 shop·layout을 보관, settings.layout은 지우지 않음, 두 번 돌려도 같음', () => {
  const db = memDb(OLD_SHOP, { plants: 2, layout: LAYOUT })
  const first = runIsoMigration(db, { level: 3 })
  const savedShop = read(db, 'shop')
  assert.deepEqual(savedShop, first)
  assert.equal(savedShop.schema, 2)
  assert.deepEqual(savedShop.placed, [])
  assert.deepEqual(savedShop.grid.map((g: { uid: string }) => g.uid), legacyPropKeys(3, 2).map(propUid))
  const backup = read(db, SHOP_BACKUP_KEY)
  assert.deepEqual(backup.shop, OLD_SHOP)
  assert.deepEqual(backup.layout, LAYOUT)
  assert.deepEqual(read(db, 'settings').layout, LAYOUT)

  // 두 번째: 아무것도 바뀌지 않는다 (백업도 처음 것 그대로)
  const second = runIsoMigration(db, { level: 9 })
  assert.deepEqual(second, first)
  assert.deepEqual(read(db, 'shop'), first)
  assert.deepEqual(read(db, SHOP_BACKUP_KEY), backup)
})

test('옮기기 DB: 상점 기록이 없던 새 사무실도 옮기고(백업 shop은 null), 실패하면 되돌린다(백업·shop 그대로)', () => {
  const fresh = memDb(undefined, undefined)
  const shop = runIsoMigration(fresh, { level: 1 })
  assert.equal(shop.schema, 2)
  assert.deepEqual(shop.grid.map((g) => g.uid), legacyPropKeys(1, 3).map(propUid))
  assert.equal(read(fresh, SHOP_BACKUP_KEY).shop, null)

  const broken = memDb('{망가진 JSON', { layout: LAYOUT })
  assert.throws(() => runIsoMigration(broken, { level: 1 }))
  assert.equal(read(broken, SHOP_BACKUP_KEY), undefined)
  assert.equal((broken.prepare("SELECT value FROM setting WHERE key = 'shop'").get() as { value: string }).value, '{망가진 JSON')
  // 트랜잭션이 닫혀 다음 쓰기가 된다
  broken.exec("UPDATE setting SET value = '{}' WHERE key = 'shop'")
  assert.equal(runIsoMigration(broken, { level: 1 }).schema, 2)
})

// ── 메인 재검사: placeGridItem · moveGridItem ───────────

const migrated = () => ({ ...migrateShop({ ...EMPTY_SHOP, owned: { fern: 2, 'sofa-green': 1, 'wall-cream': 1, jukebox: 1 } }, { level: 1, plants: 0 }), grid: [] as ShopState['grid'] })
const blocked = (fn: () => unknown, reason: string) =>
  assert.throws(fn, (e: unknown) => e instanceof BlockedError && e.reason === reason, reason)

test('placeGridItem: 통과하면 grid에 놓고, 소유·레벨·겹침·바닥 밖·없는 층은 BlockedError(reason), 모양이 틀리면 InvalidArgs', () => {
  const shop = migrated()
  // Lv.1 8×8: 회의실은 오른쪽 뒤(gx 4~7, gy 0~2) — 놓을 칸은 그 밖에서
  const a = placeGridItem(shop, 1, 'u1', 'fern', 1, 2, 4, 0)
  assert.deepEqual(a.grid, [{ uid: 'u1', itemId: 'fern', floor: 1, gx: 2, gy: 4, rot: 0 }])
  assert.equal(drawerCount(a, 'fern'), 1)
  blocked(() => placeGridItem(a, 1, 'u2', 'fern', 1, 2, 4, 0), 'overlap')
  blocked(() => placeGridItem(a, 1, 'u2', 'fern', 1, 5, 1, 0), 'fixed_tile')
  const b = placeGridItem(a, 1, 'u2', 'fern', 1, 4, 4, 0)
  // 서랍에 없으면 not_owned (산 2개를 다 놓음)
  blocked(() => placeGridItem(b, 1, 'u3', 'fern', 1, 5, 4, 0), 'not_owned')
  // 산 적 없는 품목·소품
  blocked(() => placeGridItem(b, 1, 'u3', 'monstera', 1, 5, 4, 0), 'not_owned')
  blocked(() => placeGridItem(b, 1, 'u3', 'prop-printer', 1, 5, 4, 0), 'not_owned')
  // 레벨 미달 (주크박스 Lv.5)
  blocked(() => placeGridItem(b, 1, 'u3', 'jukebox', 1, 5, 4, 0), 'level_locked')
  assert.equal(placeGridItem(b, 5, 'u3', 'jukebox', 1, 5, 4, 0).grid.length, 3)
  blocked(() => placeGridItem(b, 1, 'u3', 'sofa-green', 1, 7, 4, 0), 'out_of_bounds')
  // Lv.1은 1층뿐
  blocked(() => placeGridItem(b, 1, 'u3', 'sofa-green', 2, 1, 4, 0), 'out_of_bounds')
  assert.throws(() => placeGridItem(b, 1, 'u3', 'sofa-green', 1, 1.5, 4, 0), InvalidArgsError)
  assert.throws(() => placeGridItem(b, 1, 'u3', 'sofa-green', 1, 1, 4, 4), InvalidArgsError)
  // 벽지·책상 같은 칸 가구가 아닌 품목
  assert.throws(() => placeGridItem(b, 1, 'u3', 'wall-cream', 1, 1, 4, 0), InvalidArgsError)
})

test('moveGridItem: 자기 자리와 겹쳐도 되고(ignoreUid), 다른 가구와 겹치면 overlap, 없는 uid는 InvalidArgs', () => {
  // 그린 소파는 Lv.3부터 — Lv.3 10×10
  let shop = placeGridItem(migrated(), 3, 'sofa', 'sofa-green', 1, 2, 4, 0)
  shop = placeGridItem(shop, 3, 'f1', 'fern', 1, 5, 4, 0)
  // 한 칸 옆으로(원래 칸과 겹침)·돌리기
  shop = moveGridItem(shop, 3, 'sofa', 1, 3, 4, 0)
  assert.deepEqual(shop.grid.find((g) => g.uid === 'sofa'), { uid: 'sofa', itemId: 'sofa-green', floor: 1, gx: 3, gy: 4, rot: 0 })
  shop = moveGridItem(shop, 3, 'sofa', 1, 3, 4, 1)
  assert.equal(shop.grid.find((g) => g.uid === 'sofa')!.rot, 1)
  blocked(() => moveGridItem(shop, 3, 'f1', 1, 3, 5, 0), 'overlap')
  // 서랍 개수와 상관없이 옮길 수 있다 (소파는 1개뿐이고 이미 놓여 있음)
  assert.equal(drawerCount(shop, 'sofa-green'), 0)
  // 레벨이 내려간 것처럼 보여도(레벨 미달) 옮기기는 같은 검사 — 소파를 Lv.1 기준으로 옮기면 level_locked
  blocked(() => moveGridItem(shop, 1, 'sofa', 1, 3, 4, 0), 'level_locked')
  assert.throws(() => moveGridItem(shop, 3, 'nope', 1, 1, 4, 0), InvalidArgsError)
})

// ── 예전 메서드 호환 ────────────────────────────────────

test('예전 placeItem: 1층 첫 빈칸(rot 0)에 자동 배치, 서랍에 없거나 가구가 아니면 아무것도 안 함, 자리가 없으면 no_space', () => {
  const shop = migrated()
  const a = placeLegacyItem(shop, 1, 'L1', 'fern')!
  const g = a.grid[0]
  assert.deepEqual([g.uid, g.itemId, g.floor, g.rot], ['L1', 'fern', 1, 0])
  assert.deepEqual(canPlace({ level: 1, floor: 1, items: a.grid, owned: a.owned }, g, g.uid), { ok: true })
  // (gy, gx) 순 첫 칸 — 그 앞 칸은 모두 막혀 있다
  for (let gy = 0; gy <= g.gy; gy++) for (let gx = 0; gx < (gy === g.gy ? g.gx : 8); gx++) assert.equal(canPlace({ level: 1, floor: 1, items: [], owned: shop.owned }, { itemId: 'fern', gx, gy, rot: 0 }).ok, false)
  assert.equal(placeLegacyItem(shop, 1, 'x', 'monstera'), null)
  assert.equal(placeLegacyItem(shop, 1, 'x', 'wall-cream'), null)
  // 많이 사서 계속 놓으면 결국 빈칸이 없다
  let full: ShopState = { ...shop, owned: { fern: 200 } }
  let thrown: unknown = null
  for (let i = 0; i < 200 && !thrown; i++) {
    try {
      full = placeLegacyItem(full, 1, `f${i}`, 'fern')!
    } catch (e) {
      thrown = e
    }
  }
  assert.ok(thrown instanceof BlockedError && thrown.reason === 'no_space')
  assert.ok(full.grid.length > 10)
})

test('예전 moveItem: grid uid면 아무것도 안 하고 성공(null), 예전 placed는 그대로 옮긴다 / storeItem은 grid·placed 둘 다', () => {
  const shop: ShopState = { ...EMPTY_SHOP, owned: { fern: 2 }, placed: [{ uid: 'old', itemId: 'fern', x: 1, y: 2 }], grid: [{ uid: 'new', itemId: 'fern', floor: 1, gx: 2, gy: 2, rot: 0 }], schema: 2 }
  assert.equal(moveLegacyItem(shop, 'new', 500, 500), null)
  assert.deepEqual(moveLegacyItem(shop, 'old', 10.4, 20.6)!.placed, [{ uid: 'old', itemId: 'fern', x: 10, y: 21 }])
  const s1 = storeItem(shop, 'new')
  assert.deepEqual([s1.grid, s1.placed.length], [[], 1])
  const s2 = storeItem(shop, 'old')
  assert.deepEqual([s2.grid.length, s2.placed], [1, []])
  assert.equal(drawerCount(storeItem(s1, 'old'), 'fern'), 2)
})

test('옮기는 날 소품은 예전 10단계 레벨로 고른다 (새 표에서 레벨 숫자가 낮아져도 보이던 소품 그대로)', () => {
  assert.deepEqual([0, 149, 150, 1_300, 9_000, 26_192].map(legacyLevelOfXp), [1, 1, 2, 5, 10, 10])
  // 9,000은 새 표 Lv.8이지만 예전 장면에선 Lv.10 캠퍼스 — 트로피·분수가 보였다
  const next = migrateShop({ ...EMPTY_SHOP }, { level: 8, legacyLevel: legacyLevelOfXp(9_000), plants: 0 })
  assert.ok(next.owned['prop-trophies'] && next.owned['prop-fountain'])
})

// ── 레벨 전용 가구·기본 지급 (office-iso-levels.md 2-3절) ─────

test('레벨 전용 가구: 규격표의 lv-* 39종이 모두 상점 품목(분류 level, minLevel = 열리는 레벨)이고 칸 가구다, 기본 지급 품목도 모두 칸 가구', () => {
  const lvIds = Object.keys(FURNITURE).filter((id) => id.startsWith('lv-'))
  assert.equal(lvIds.length, 39)
  for (const id of lvIds) {
    const item = shopItem(id)
    assert.ok(item && item.category === 'level' && item.price > 0 && item.minLevel >= 1 && item.minLevel <= 20, id)
    assert.ok(isGridFurniture(id), id)
  }
  assert.deepEqual(SHOP_ITEMS.filter((i) => i.category === 'level').map((i) => i.id).sort(), lvIds.sort())
  // 예전 폰 화면(자기 품목표로 특가를 고름)과 같은 특가가 나오게 레벨 전용은 특가 후보가 아니다
  for (let d = 0; d < 60; d++) assert.ok(dailyDeals(new Date(2026, 9, d + 1)).every((x) => shopItem(x.itemId)?.category !== 'level'))
  for (const [lv, items] of Object.entries(LEVEL_GRANTS))
    for (const id of Object.keys(items)) {
      assert.ok(isGridFurniture(id), id)
      assert.ok((shopItem(id)?.minLevel ?? 1) <= Number(lv), `${id}은 Lv.${lv}에 열려 있어야 함`)
    }
})

const grantKeys = (db: DatabaseSync) => (db.prepare("SELECT key FROM setting WHERE key LIKE 'levelgrant:%' ORDER BY key").all() as { key: string }[]).map((r) => r.key)

test('기본 지급(새 사무실): 옮기기 전에는 안 줌 → 옮긴 뒤 Lv.1 책상·의자 4쌍을 기본 자리 위치에 실제로 놓아 저장, 다시 돌려도 같고 중복 지급 없음', () => {
  const db = memDb(undefined, undefined)
  assert.equal(runLevelGrants(db, 1), null)
  assert.deepEqual(grantKeys(db), [])
  runIsoMigration(db, { level: 1 })
  const a = runLevelGrants(db, 1)!
  assert.deepEqual([a.owned['lv-folding-desk'], a.owned['lv-folding-chair']], [4, 4])
  const seats = a.grid.filter((g) => g.uid.startsWith(GRANT_SEAT_PREFIX))
  assert.equal(seats.length, 8)
  assert.ok(seats.every((g) => g.floor === 1))
  // 저장된 가구라 놓기 검사(소유 포함)를 통과하고, 의자 4개가 모두 책상 자리다
  for (const g of a.grid) assert.deepEqual(canPlace({ level: 1, floor: g.floor, items: a.grid, owned: a.owned }, g, g.uid), { ok: true }, g.uid)
  const sit = seatsOf(a.grid.filter((g) => g.floor === 1))
  assert.equal(sit.filter((s) => s.uid.startsWith(GRANT_SEAT_PREFIX) && s.hasDesk).length, 4)
  // 모두 놓였으니 서랍 남은 개수는 0 (꺼냈다 넣으면 서랍에 보인다)
  assert.equal(drawerOf(a, 'lv-folding-desk'), 0)
  assert.equal(drawerOf(storeItem(a, seats[0].uid), seats[0].itemId), 1)
  assert.deepEqual(read(db, 'shop'), a)
  // 다시 돌려도 바뀌지 않는다
  assert.equal(runLevelGrants(db, 1), null)
  assert.deepEqual(read(db, 'shop'), a)
  assert.deepEqual(grantKeys(db), [levelGrantKey(1)])

  // Lv.8에 오르면 2~8의 지급분만 더한다 (Lv.1은 다시 주지 않음, Lv.6은 지급 없음). 놓지 않고 서랍으로
  const b = runLevelGrants(db, 8)!
  // 레벨 지급은 서랍으로, 구역 가구(휴게 코너·탕비실)만 정해 둔 자리에 놓인다
  assert.deepEqual(b.grid.slice(0, a.grid.length), a.grid)
  assert.deepEqual(b.grid.slice(a.grid.length).map((g) => g.uid.split(':').slice(0, 2).join(':')).filter((u, i, all) => all.indexOf(u) === i), ['zone:lounge', 'zone:kitchen'])
  for (const id of ['lv-kettle-shelf', 'lv-meeting-table', 'whiteboard', 'lv-glass-table', 'lv-fridge', 'lv-reception']) assert.equal(drawerOf(b, id), 1, id) // 냉장고는 기본 지급 1개 + 탕비실 1개(놓임)
  assert.deepEqual([b.owned['lv-folding-desk'], b.owned['lv-folding-chair']], [4, 4])
  assert.deepEqual(grantKeys(db), [1, 2, 3, 4, 5, 7, 8].map(levelGrantKey).sort())
  assert.equal(runLevelGrants(db, 8), null)
  // 레벨이 낮게 계산돼도(표 개편) 이미 준 것은 그대로, 다시 올라도 다시 주지 않는다
  assert.equal(runLevelGrants(db, 5), null)
  assert.equal(runLevelGrants(db, 8), null)
  assert.deepEqual(read(db, 'shop'), b)
})

test('기본 지급(기존 데이터): 옮긴 뒤 산 물건·소품·백업은 그대로, 도달한 레벨 지급분을 한 번에 더하고 책상·의자는 빈 기본 자리에 놓는다', () => {
  const db = memDb(OLD_SHOP, { plants: 2, layout: LAYOUT })
  const moved = runIsoMigration(db, { level: 10, legacyLevel: 10 })
  const backup = read(db, SHOP_BACKUP_KEY)
  const after = runLevelGrants(db, 10)!
  for (const [id, n] of Object.entries(moved.owned)) assert.equal(after.owned[id] - (id === 'whiteboard' ? 1 : 0), n, id)
  // 옮기면서 놓은 소품은 그대로, 지급 책상·의자는 그 위에 겹치지 않게
  assert.deepEqual(after.grid.slice(0, moved.grid.length), moved.grid)
  const seats = after.grid.slice(moved.grid.length).filter((g) => g.uid.startsWith(GRANT_SEAT_PREFIX))
  assert.equal(seats.length, 8)
  for (const g of after.grid) assert.equal(canPlace({ level: 10, floor: g.floor, items: after.grid, owned: after.owned }, g, g.uid).ok, true, g.uid)
  assert.equal(drawerOf(after, 'lv-floor-sign'), 1)
  assert.equal(drawerOf(after, 'lv-stage'), 0)
  assert.equal(after.owned['lv-stage'], undefined)
  assert.deepEqual(read(db, SHOP_BACKUP_KEY), backup)
  // 옮기기·지급을 다시 돌려도 같다
  assert.deepEqual(runIsoMigration(db, { level: 10 }), after)
  assert.equal(runLevelGrants(db, 10), null)
  assert.deepEqual(read(db, 'shop'), after)
})

test('기본 지급: 실패하면 되돌린다 (지급 키도 남지 않아 다음에 다시 준다)', () => {
  const db = memDb({ ...EMPTY_SHOP, schema: 2 }, undefined)
  db.exec("CREATE TRIGGER no_shop BEFORE UPDATE ON setting WHEN NEW.key = 'shop' BEGIN SELECT RAISE(ABORT, 'disk full'); END")
  assert.throws(() => runLevelGrants(db, 3), /disk full/)
  assert.deepEqual(grantKeys(db), [])
  assert.deepEqual(read(db, 'shop'), { ...EMPTY_SHOP, schema: 2 })
  db.exec('DROP TRIGGER no_shop')
  assert.equal(runLevelGrants(db, 3)!.owned['lv-meeting-table'], 1)
})
