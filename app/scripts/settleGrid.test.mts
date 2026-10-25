// settleGrid(바닥 밖·고정 칸 가구 → 서랍) · 구역 기본 가구 지급·배치 (docs/specs/office-iso-spaces.md 3-2·3-3절)

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { drawerCount, EMPTY_SHOP, mergeGrants, type ShopState } from '../src/shared/economy.ts'
import type { GridItem } from '../src/shared/iso/furniture.ts'
import { fixedTiles } from '../src/shared/iso/place.ts'
import { planOf } from '../src/shared/iso/plan.ts'
import { zoneGrantCounts, zoneGrantsById, type ZoneLayout } from '../src/shared/iso/zoneLayouts.ts'
import { applyLevelGrants, placeZoneItems } from '../src/main/isoMigrate.ts'
import { settleGrid } from '../src/main/shopGrid.ts'

const item = (uid: string, floor: number, gx: number, gy: number, itemId = 'plant'): GridItem => ({ uid, itemId, floor, gx, gy, rot: 0 })
const shopOf = (grid: GridItem[]): ShopState => ({ ...EMPTY_SHOP, schema: 2, owned: { plant: 9 }, grid })

// 2층은 Lv.4부터 — 깎인 칸(바닥 밖)을 평면에서 찾는다
function emptyCell(level: number, floor: number) {
  const room = planOf(level, floor)
  for (let gy = 0; gy < room.rows; gy++) for (let gx = 0; gx < room.cols; gx++) if (!room.cells || room.cells[gy * room.cols + gx] === 0) return { gx, gy, room }
  return null
}

test('settleGrid: 바닥 밖 가구는 빼서 서랍으로, 안쪽 가구는 그대로', () => {
  let found: { level: number; floor: number; gx: number; gy: number } | null = null
  for (let level = 1; level <= 20 && !found; level++)
    for (let floor = 1; floor <= 5 && !found; floor++) {
      try {
        const e = emptyCell(level, floor)
        if (e && e.room.cells) found = { level, floor, gx: e.gx, gy: e.gy }
      } catch {
        // 없는 층
      }
    }
  assert.ok(found, '깎인 칸이 있는 평면이 있다')
  const { level, floor, gx, gy } = found
  const fixed = new Set(fixedTiles(level, 1).map((t) => `${t.gx},${t.gy}`))
  let ok = { gx: 0, gy: 0 }
  const r1 = planOf(level, 1)
  outer: for (let y = 0; y < r1.rows; y++) for (let x = 0; x < r1.cols; x++) if (!fixed.has(`${x},${y}`)) { ok = { gx: x, gy: y }; break outer }
  const shop = shopOf([item('out', floor, gx, gy), item('in', 1, ok.gx, ok.gy)])
  const before = drawerCount(shop, 'plant')
  const r = settleGrid(shop, level)
  assert.deepEqual(r.removed.map((g) => g.uid), ['out'])
  assert.deepEqual(r.shop.grid.map((g) => g.uid), ['in'])
  assert.equal(drawerCount(r.shop, 'plant'), before + 1)
  // 멱등
  const again = settleGrid(r.shop, level)
  assert.equal(again.removed.length, 0)
  assert.equal(again.shop, r.shop)
})

test('settleGrid: 고정 칸(회의실)과 없어진 층의 가구도 서랍으로', () => {
  const meeting = fixedTiles(10, 1).find((t) => t.kind === 'meeting')!
  const shop = shopOf([item('m', 1, meeting.gx, meeting.gy), item('f9', 9, 0, 0)])
  const r = settleGrid(shop, 10)
  assert.deepEqual(r.removed.map((g) => g.uid).sort(), ['f9', 'm'])
  assert.equal(r.shop.grid.length, 0)
})

test('구역 기본 가구: 개수를 지급 표에 더하고, 놓을 수 있는 곳에만 놓는다', () => {
  const layouts: Record<string, ZoneLayout> = {
    lounge: { level: 3, floor: 1, items: [{ itemId: 'lv-floor-sign', gx: 3, gy: 6, rot: 0 }, { itemId: 'lv-floor-sign', gx: 5, gy: 6, rot: 0 }] },
  }
  assert.deepEqual(zoneGrantCounts(layouts), { 3: { 'lv-floor-sign': 2 } })
  assert.deepEqual(mergeGrants({ 3: { 'lv-meeting-table': 1 } }, { 3: { 'lv-floor-sign': 2 } }), { 3: { 'lv-meeting-table': 1, 'lv-floor-sign': 2 } })

  const shop = shopOf([])
  assert.deepEqual(zoneGrantsById(layouts), { lounge: { 'lv-floor-sign': 2 } })
  const next = applyLevelGrants(shop, 5, [], ['lounge'], layouts)
  assert.equal(next.owned['lv-floor-sign'], 2)
  assert.equal(next.grid.length, 2)
  assert.ok(next.grid.every((g) => g.uid.startsWith('zone:lounge:')))
  // 레벨이 아닌 지급이면 놓지 않는다
  assert.equal(placeZoneItems(5, [], ['other'], layouts).length, 0)
  // 이미 사용자 가구가 있는 자리는 건너뛴다 (그 가구는 서랍에)
  const blocked = placeZoneItems(5, [item('u', 1, 3, 6)], ['lounge'], layouts)
  assert.deepEqual(blocked.map((g) => g.uid), ['u', 'zone:lounge:1'])
})
