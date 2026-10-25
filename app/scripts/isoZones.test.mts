// 구역 기본 가구 표(ZONE_LAYOUTS)가 모든 레벨·층에서 평면에 맞는지, 쉬는 자리가 있는지, 지급 키가 레벨 지급과 따로인지
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { earnedOwned, EMPTY_SHOP, grantedCounts, shopItem, ZONE_GRANTS, type ShopState } from '../src/shared/economy.ts'
import { cellsOf, specOf, spotsOf, type GridItem } from '../src/shared/iso/furniture.ts'
import { isoLevelOf, roomOf } from '../src/shared/iso/levels.ts'
import { canPlace, fixedTiles } from '../src/shared/iso/place.ts'
import { CellKind, kindAt } from '../src/shared/iso/plan.ts'
import { ZONE_FLOOR_KINDS } from '../src/renderer/map/iso/isoArt.ts'
import { ZONE_LAYOUTS } from '../src/shared/iso/zoneLayouts.ts'
import { grantedZones, levelGrantKey, runLevelGrants, zoneGrantKey, ZONE_UID_PREFIX } from '../src/main/isoMigrate.ts'

const zones = Object.entries(ZONE_LAYOUTS)

/** 그 레벨·층에 열린 구역 가구를 열린 순서대로 */
const itemsAt = (level: number, floor: number): GridItem[] =>
  zones.filter(([, z]) => z.level <= level && z.floor === floor).flatMap(([id, z]) => z.items.map((it, i) => ({ uid: `${ZONE_UID_PREFIX}${id}:${i}`, itemId: it.itemId, floor, gx: it.gx, gy: it.gy, rot: it.rot })))

test('구역은 바닥 종류 이름을 쓰고, 그 레벨에 실제로 있는 층에 있다', () => {
  assert.ok(zones.length >= 10)
  for (const [id, z] of zones) {
    assert.ok((ZONE_FLOOR_KINDS as string[]).includes(id.split(':')[0]), `${id}: 바닥 종류 이름`)
    assert.ok(z.level >= 3 && z.level <= 20, id)
    assert.ok(z.floor >= 1 && z.floor <= isoLevelOf(z.level).floors, `${id}: Lv.${z.level}에 ${z.floor}층이 있어야 함`)
    assert.ok(z.items.length > 0, id)
    for (const it of z.items) assert.ok((shopItem(it.itemId)?.minLevel ?? 1) <= z.level, `${id}: ${it.itemId}은 Lv.${z.level}에 열려 있어야 함`)
  }
})

test('레벨 1~20 모든 층에서 구역 가구가 바닥 안에 놓이고 겹치지 않고 길을 막지 않는다', () => {
  for (let level = 1; level <= 20; level++)
    for (let floor = 1; floor <= isoLevelOf(level).floors; floor++) {
      const room = roomOf(level, floor)
      const fixed = fixedTiles(level, floor)
      const all = itemsAt(level, floor)
      const placed: GridItem[] = []
      for (const it of all) {
        const r = canPlace({ level, floor, items: placed }, it)
        assert.ok(r.ok, `Lv.${level} ${floor}층 ${it.uid} ${it.itemId}(${it.gx},${it.gy}): ${r.ok ? '' : r.reason}`)
        placed.push(it)
        // 회의실·계단·야외 칸을 침범하지 않는다 (canPlace가 못 막는 야외 칸까지)
        for (const c of cellsOf(it)) {
          assert.equal(kindAt(room, c.gx, c.gy), CellKind.Indoor, `${it.uid} 실내 바닥 위`)
          assert.ok(!fixed.some((t) => t.gx === c.gx && t.gy === c.gy), `${it.uid} 고정 칸 밖`)
        }
      }
      // 구역 바닥 사각형도 실내 바닥 안, 고정 칸 밖
      for (const z of room.zones ?? [])
        for (let gy = z.gy; gy < z.gy + z.d; gy++)
          for (let gx = z.gx; gx < z.gx + z.w; gx++) {
            assert.equal(kindAt(room, gx, gy), CellKind.Indoor, `Lv.${level} ${floor}층 구역 ${z.id}(${gx},${gy})`)
            assert.ok(!fixed.some((t) => t.gx === gx && t.gy === gy), `구역 ${z.id}(${gx},${gy})가 고정 칸`)
          }
    }
})

test('planOf가 열린 구역만 room.zones에 채운다', () => {
  assert.equal(roomOf(2, 1).zones, undefined)
  assert.deepEqual(roomOf(3, 1).zones?.map((z) => z.id), ['lounge'])
  assert.deepEqual(roomOf(7, 1).zones?.map((z) => z.id), ['lounge', 'kitchen'])
  assert.equal(roomOf(5, 1), roomOf(5, 1))
})

test('Lv.3 이상은 층마다 쉬는 자리가 하나 이상', () => {
  for (let level = 3; level <= 20; level++)
    for (let floor = 1; floor <= isoLevelOf(level).floors; floor++) {
      const spots = itemsAt(level, floor).filter((it) => specOf(it.itemId).kind !== 'chair').flatMap((it) => spotsOf(it))
      assert.ok(spots.length >= 1, `Lv.${level} ${floor}층에 쉬는 자리가 없음`)
    }
})

test('구역 지급은 zonegrant:{구역} 키로 레벨 지급과 따로 — 레벨 지급을 받은 저장분도 구역 가구를 받는다', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT)')
  const shop: ShopState = { ...EMPTY_SHOP, schema: 2 }
  db.prepare("INSERT INTO setting (key, value) VALUES ('shop', ?)").run(JSON.stringify(shop))
  // 예전 저장: 구역 지급이 없던 시절에 레벨 1~7 지급을 이미 받았다
  for (let lv = 1; lv <= 7; lv++) db.prepare('INSERT INTO setting (key, value) VALUES (?, ?)').run(levelGrantKey(lv), '{}')
  const a = runLevelGrants(db, 7)!
  assert.deepEqual(grantedZones(db).sort(), ['kitchen', 'lounge', 'lounge:2'])
  assert.equal(a.owned['lv-fridge'], 1)
  assert.equal(a.owned['lv-studio-sofa'], 4)
  assert.equal(a.grid.filter((g) => g.uid.startsWith(ZONE_UID_PREFIX)).length, 3 + 4 + 3)
  assert.equal(runLevelGrants(db, 7), null)
  assert.ok(db.prepare('SELECT 1 FROM setting WHERE key = ?').get(zoneGrantKey('kitchen')))
  // 업적 계산: 레벨 지급과 구역 지급을 둘 다 무료분으로 뺀다
  const granted = grantedCounts([1, 2, 3, 4, 5, 7], grantedZones(db))
  assert.equal(granted['lv-fridge'], 2)
  assert.deepEqual(earnedOwned({ 'lv-fridge': 2, 'lv-studio-sofa': 5 }, granted), { 'lv-studio-sofa': 1 })
  assert.equal(ZONE_GRANTS.lounge['lv-studio-sofa'], 2)
})

// ── 자리가 모자란 직원의 대기 칸 (IsoOfficeScene.waitCell → path.ts waitCellFor) ──
import { buildWalkMap, entranceOf, waitCellFor } from '../src/shared/iso/path.ts'
import { cellKey, isInside } from '../src/shared/iso/grid.ts'

test('출입구는 모든 레벨·층에서 바닥 안이다', () => {
  for (let level = 1; level <= 20; level++)
    for (let floor = 1; floor <= isoLevelOf(level).floors; floor++) {
      const room = roomOf(level, floor)
      const e = entranceOf(room, fixedTiles(level, floor))
      assert.ok(isInside(room, e.gx, e.gy), `Lv.${level} ${floor}층 출입구`)
      // 바닥 밖 출입구가 들어와도 실내 바닥으로 떨어진다
      const out = entranceOf(room, [{ gx: -3, gy: room.rows + 5, kind: 'entrance' }])
      assert.equal(kindAt(room, out.gx, out.gy), CellKind.Indoor, `Lv.${level} ${floor}층 대체 출입구`)
    }
})

test('자리가 모자란 직원 8~40명의 대기 칸이 모두 바닥 안·걷는 칸·서로 다른 칸이다 (층마다)', () => {
  for (const level of [3, 6, 10, 14, 18, 20])
    for (let floor = 1; floor <= isoLevelOf(level).floors; floor++) {
      const room = roomOf(level, floor)
      const fixed = fixedTiles(level, floor)
      const m = buildWalkMap(room, itemsAt(level, floor), fixed)
      const occupied = new Set<number>()
      const fixedKeys = new Set(fixed.map((t) => cellKey(room, t.gx, t.gy)))
      for (let n = 0; n < 40; n++) {
        const c = waitCellFor(m, fixed, occupied)
        assert.ok(c, `Lv.${level} ${floor}층 ${n + 1}번째 직원의 대기 칸`)
        const k = cellKey(room, c.gx, c.gy)
        assert.ok(isInside(room, c.gx, c.gy), `Lv.${level} ${floor}층 (${c.gx},${c.gy}) 바닥 안`)
        assert.ok(!m.blocked[k] && !fixedKeys.has(k) && !occupied.has(k), `Lv.${level} ${floor}층 (${c.gx},${c.gy}) 걷는 빈 칸`)
        if (n < 8) assert.equal(kindAt(room, c.gx, c.gy), CellKind.Indoor, `Lv.${level} ${floor}층 처음 8명은 실내 바닥`)
        occupied.add(k)
      }
    }
})
