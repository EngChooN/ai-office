// 가구 규격·돌리기 (기술 설계 2-1절) — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cellsOf, FURNITURE, isInGroup, rotate, sizeOf, specOf, spotsOf, type FurnitureSpec } from '../src/shared/iso/furniture.ts'
import { ITEM_ACTIONS } from '../src/shared/iso/actions.ts'
import { isGridCategory, isGridFurniture, SHOP_ITEMS } from '../src/shared/economy.ts'

const pod: FurnitureSpec = { size: [1, 2], layer: 'object', kind: 'deco', spots: [{ at: [0, 2], face: 2, use: 'use' }, { at: [0, 0], face: 0, use: 'sit' }] }

test('1×2를 r1로 돌리면 2×1, 자리 좌표·방향도 함께 돈다', () => {
  const r1 = rotate(pod, 1)
  assert.deepEqual(r1.size, [2, 1])
  // r0에서 앞(+gy)에 서서 가구(−gy)를 보던 자리 → r1에서는 −gx 쪽에 서서 +gx를 본다
  assert.deepEqual(r1.spots![0], { at: [-1, 0], face: 3, use: 'use' })
  assert.deepEqual(r1.spots![1], { at: [1, 0], face: 1, use: 'sit' })
  const r2 = rotate(pod, 2)
  assert.deepEqual(r2.size, [1, 2])
  assert.deepEqual(r2.spots![0], { at: [0, -1], face: 0, use: 'use' })
})

test('r0 → r4는 제자리 (네 번 돌리면 원래대로)', () => {
  for (const id of ['foosball', 'pool-table', 'treadmill', 'sofa-green', 'lv-ceo-desk']) {
    const s = specOf(id)
    const r4 = rotate(s, 4)
    assert.deepEqual(r4.size, s.size)
    assert.deepEqual(r4.spots, s.spots)
    let cur: FurnitureSpec = s
    for (let i = 0; i < 4; i++) cur = rotate(cur, 1)
    assert.deepEqual(cur.spots, s.spots)
  }
})

test('김기획 2-3절 크기와 규격 없는 품목 기본값', () => {
  assert.deepEqual(FURNITURE.desk.size, [2, 1])
  assert.equal(FURNITURE.chair.kind, 'chair')
  assert.deepEqual(FURNITURE['lv-meeting-table'].size, [2, 2])
  assert.deepEqual(FURNITURE['lv-long-table'].size, [4, 2])
  assert.deepEqual(FURNITURE['lv-sleep-pod'].size, [1, 2])
  // 표에 없는 품목: 1×1 object
  const plain = specOf('fern')
  assert.deepEqual([plain.size, plain.layer, plain.spots], [[1, 1], 'object', undefined])
  assert.equal(specOf('rug-round').layer, 'flat')
})

test('ITEM_ACTIONS를 자리로 옮김: 행동이 있는 상점 가구는 모두 그 행동을 가리키는 자리가 있다', () => {
  const furn = SHOP_ITEMS.filter((i) => i.category === 'furniture')
  for (const it of furn) {
    if (!ITEM_ACTIONS[it.id]) continue
    const spots = specOf(it.id).spots ?? []
    assert.ok(spots.some((s) => s.action === it.id), it.id)
  }
  // 모든 action 키는 ITEM_ACTIONS에 있다
  for (const [id, s] of Object.entries(FURNITURE)) for (const p of s.spots ?? []) if (p.action) assert.ok(ITEM_ACTIONS[p.action], `${id} → ${p.action}`)
  // 설계 예: 테이블 축구 양옆
  assert.deepEqual(FURNITURE.foosball.spots, [
    { at: [-1, 0], face: 3, use: 'use', action: 'foosball' },
    { at: [2, 0], face: 1, use: 'use', action: 'foosball' },
  ])
})

test('prop-* 소품도 규격이 있다', () => {
  for (const key of ['printer', 'cabinets', 'trash', 'lamp', 'plant', 'aquarium', 'pingpong', 'arcade', 'napPod', 'fountain']) assert.ok(FURNITURE[`prop-${key}`], key)
})

test('놓인 가구의 차지 칸·자리 (돌리기 반영)', () => {
  const p = { itemId: 'foosball', gx: 4, gy: 4, rot: 1 as const }
  assert.deepEqual(sizeOf('foosball', 1), { w: 1, d: 2 })
  assert.deepEqual(cellsOf(p), [{ gx: 4, gy: 4 }, { gx: 4, gy: 5 }])
  assert.deepEqual(
    spotsOf(p).map((s) => [s.gx, s.gy, s.face, s.isInside]),
    [[4, 3, 0, false], [4, 6, 2, false]],
  )
  assert.deepEqual(spotsOf({ itemId: 'chair', gx: 2, gy: 2, rot: 3 })[0], { gx: 2, gy: 2, face: 3, use: 'sit', isInside: true })
})

test('서랍 분류: 접이식 책상·의자(기본 지급)는 책상·의자와 레벨 전용 둘 다, 소품·가구는 한 곳 (office-iso-levels.md 6-2절)', () => {
  const groups = (id: string) => (['seat', 'furniture', 'prop', 'level'] as const).filter((g) => isInGroup(id, g))
  assert.deepEqual(groups('lv-folding-desk'), ['seat', 'level'])
  assert.deepEqual(groups('lv-folding-chair'), ['seat', 'level'])
  assert.deepEqual(groups('lv-fridge'), ['level'])
  assert.deepEqual(groups('desk'), ['seat'])
  assert.deepEqual(groups('sofa-green'), ['furniture'])
  assert.deepEqual(groups('prop-plant'), ['prop'])
  assert.ok(isInGroup('lv-fridge', 'all'))
})

test('상점의 레벨 전용 품목은 모두 칸 가구로 서랍에 들어간다 (규격표에 있음)', () => {
  const level = SHOP_ITEMS.filter((i) => i.category === 'level')
  assert.ok(level.length > 0)
  for (const i of level) {
    assert.ok(isGridCategory(i.category) && isGridFurniture(i.id), i.id)
    assert.ok(Object.hasOwn(FURNITURE, i.id), `규격 없음: ${i.id}`)
  }
})
