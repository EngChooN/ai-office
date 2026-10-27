// 알아서 배치 (shared/iso/autoArrange.ts): 안대로 놓으면 메인 놓기 검사를 모두 통과하는지, 책상·의자 짝·구역 가구·고정 칸·채우기 상한을 지키는지
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ShopState } from '../src/shared/economy.ts'
import { autoArrange, groupOf } from '../src/shared/iso/autoArrange.ts'
import { cellsOf, specOf, type GridItem } from '../src/shared/iso/furniture.ts'
import { cellKey, isInside } from '../src/shared/iso/grid.ts'
import { isoLevelOf, roomOf } from '../src/shared/iso/levels.ts'
import { canPlace, fixedTiles } from '../src/shared/iso/place.ts'
import { seatsOf } from '../src/shared/iso/seats.ts'
import { ZONE_LAYOUTS } from '../src/shared/iso/zoneLayouts.ts'

const zoneItems = (level: number, floor: number): GridItem[] =>
  Object.entries(ZONE_LAYOUTS)
    .filter(([, z]) => z.level <= level && z.floor === floor)
    .flatMap(([id, z]) => z.items.map((it, i) => ({ uid: `zone:${id}:${i}`, floor, ...it })))

/** 어수선한 배치: 구역 가구 + 아무렇게나 놓은 책상·의자·소품 (놓기 검사는 통과한 것만) */
function messyShop(level: number, extra: Record<string, number> = {}): ShopState {
  const grid: GridItem[] = [...zoneItems(level, 1)]
  const owned: Record<string, number> = {}
  for (const g of grid) owned[g.itemId] = (owned[g.itemId] ?? 0) + 1
  const want = ['desk', 'chair', 'desk', 'chair', 'desk', 'chair', 'bookshelf', 'sofa-green', 'rug-round', 'prop-plant', 'prop-plant', 'whiteboard', 'foosball', 'prop-lamp']
  let n = 0
  for (const id of want) {
    owned[id] = (owned[id] ?? 0) + 1
    const room = roomOf(level, 1)
    // 앞쪽부터 엇갈리게 — 정리 안 된 모양
    outer: for (let gy = room.rows - 1; gy >= 0; gy--)
      for (let gx = (n * 3) % room.cols; gx < room.cols; gx++) {
        const it: GridItem = { uid: `m${n}`, itemId: id, floor: 1, gx, gy, rot: (n % 4) as 0 }
        if (canPlace({ level, floor: 1, items: grid, owned }, it).ok) {
          grid.push(it)
          break outer
        }
      }
    n++
  }
  for (const [id, c] of Object.entries(extra)) owned[id] = (owned[id] ?? 0) + c
  return { owned, surfaces: {}, placed: [], grid, gear: {} }
}

/** 실행과 같은 순서: 그 층을 비우고 하나씩 canPlace(소유 포함) → 놓기 */
function replay(shop: ShopState, level: number, floor: number, place: ReturnType<typeof autoArrange>['place']) {
  const grid = shop.grid.filter((g) => g.floor !== floor)
  for (const [i, p] of place.entries()) {
    const r = canPlace({ level, floor, items: grid, owned: shop.owned }, p)
    assert.ok(r.ok, `${i}번 ${p.itemId}(${p.gx},${p.gy},r${p.rot}): ${r.ok ? '' : r.reason}`)
    grid.push({ uid: `r${i}`, floor, ...p })
  }
  return grid.filter((g) => g.floor === floor)
}

for (const level of [3, 6, 10, 16]) {
  test(`Lv.${level} 1층: 안대로 놓으면 놓기 검사를 모두 통과하고, 의자는 모두 책상을 본다`, () => {
    const shop = messyShop(level, { 'prop-plant': 2, 'beanbag-blue': 1 })
    const plan = autoArrange(shop, level, 1)
    const after = replay(shop, level, 1, plan.place)
    // 책상·의자 짝: 그 층에 있던 3쌍 그대로, 의자 자리마다 책상
    assert.equal(plan.seatPairs, 3)
    const seats = seatsOf(after)
    assert.equal(seats.length, 3)
    assert.ok(seats.every((s) => s.hasDesk))
    // 구역 가구는 제자리
    const zones = zoneItems(level, 1)
    assert.equal(plan.kept, zones.length)
    for (const z of zones) assert.ok(plan.place.some((p) => p.itemId === z.itemId && p.gx === z.gx && p.gy === z.gy && p.rot === z.rot), `${z.uid} 제자리`)
    // 구역 밖 가구는 구역 칸에 들어가지 않는다
    const room = roomOf(level, 1)
    const inZone = (c: { gx: number; gy: number }) => (room.zones ?? []).some((z) => c.gx >= z.gx && c.gx < z.gx + z.w && c.gy >= z.gy && c.gy < z.gy + z.d)
    for (const p of plan.place.slice(plan.kept)) assert.ok(!cellsOf(p).some(inZone), `${p.itemId} 구역 밖`)
    // 바닥의 절반 넘게 채우지 않는다 (러그 제외)
    const fixed = new Set(fixedTiles(level, 1).map((t) => cellKey(room, t.gx, t.gy)))
    let floorCells = 0
    for (let gy = 0; gy < room.rows; gy++) for (let gx = 0; gx < room.cols; gx++) if (isInside(room, gx, gy) && !fixed.has(cellKey(room, gx, gy))) floorCells++
    const used = after.filter((g) => specOf(g.itemId).layer === 'object').reduce((n, g) => n + cellsOf(g).length, 0)
    assert.ok(used <= floorCells * 0.5, `${used} / ${floorCells}`)
    // 가진 개수보다 많이 놓지 않는다 · 남는 가구는 개수로 알려 준다
    const placedCount = plan.place.length
    const leftCount = plan.left.reduce((n, l) => n + l.count, 0)
    const total = Object.values(shop.owned).reduce((n, c) => n + c, 0)
    assert.equal(placedCount + leftCount, total)
  })
}

test('같은 입력이면 같은 안 · 없는 층은 빈 안', () => {
  const shop = messyShop(10)
  assert.deepEqual(autoArrange(shop, 10, 1), autoArrange(shop, 10, 1))
  const none = autoArrange(shop, 1, 3)
  assert.deepEqual([none.place.length, none.seatPairs], [0, 0])
})

test('의자가 없으면 책상을 혼자 놓지 않고 서랍에 남긴다 · 다른 층 가구는 건드리지 않는다', () => {
  const shop: ShopState = { owned: { desk: 2, 'prop-plant': 1 }, surfaces: {}, placed: [], gear: {}, grid: [{ uid: 'a', itemId: 'desk', floor: 1, gx: 5, gy: 5, rot: 0 }, { uid: 'b', itemId: 'prop-plant', floor: 2, gx: 3, gy: 3, rot: 0 }] }
  const level = 10
  assert.ok(isoLevelOf(level).floors >= 2)
  const plan = autoArrange(shop, level, 1)
  assert.equal(plan.seatPairs, 0)
  assert.ok(!plan.place.some((p) => p.itemId === 'desk'))
  assert.deepEqual(plan.left.find((l) => l.itemId === 'desk')?.count, 2)
  assert.deepEqual(plan.before.map((g) => g.uid), ['a'])
})

test('가구 성격: 벽 가구·러그·소파·놀이·작은 소품', () => {
  assert.deepEqual(['bookshelf', 'rug-round', 'sofa-green', 'foosball', 'prop-plant', 'piano'].map(groupOf), ['wall', 'rug', 'sofa', 'game', 'small', 'wall'])
})
