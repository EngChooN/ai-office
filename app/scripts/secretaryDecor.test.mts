// 비서 꾸미기 (main/secretaryDecor.ts): 알아서 배치 카드 단계·전↔후 평면도 그림·되돌리기 단계·배치 글·카드 본문
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ShopState } from '../src/shared/economy.ts'
import { autoArrange } from '../src/shared/iso/autoArrange.ts'
import type { GridItem } from '../src/shared/iso/furniture.ts'
import { BATCH_ITEMS_MAX, BATCH_METHOD, cleanCompares, COMPARE_IMAGE_MAX } from '../src/shared/secretaryTools.ts'
import { SecretaryDesk } from '../src/main/secretaryCore.ts'
import { describeStep } from '../src/main/secretaryDescribe.ts'
import { arrangeSteps, decorCompares, layoutText, renderFloorPlan, simulateDecor, undoSteps } from '../src/main/secretaryDecor.ts'
import { roomOf } from '../src/shared/iso/levels.ts'
import { fixedTiles } from '../src/shared/iso/place.ts'

const LEVEL = 10
const g = (uid: string, itemId: string, floor: number, gx: number, gy: number, rot: GridItem['rot'] = 0): GridItem => ({ uid, itemId, floor, gx, gy, rot })
const shop = (): ShopState => ({
  owned: { desk: 2, chair: 2, bookshelf: 1, 'prop-plant': 3, 'rug-round': 1, 'sofa-green': 1 },
  surfaces: {},
  placed: [],
  gear: {},
  grid: [g('d1', 'desk', 1, 9, 12), g('c1', 'chair', 1, 9, 11), g('d2', 'desk', 1, 4, 14), g('c2', 'chair', 1, 13, 10, 2), g('p1', 'prop-plant', 1, 6, 9), g('p2', 'prop-plant', 2, 5, 5)],
})

function desk(calls: { method: string; args: unknown[] }[] = []) {
  let n = 0
  return new SecretaryDesk({
    call: (method, args) => void calls.push({ method, args }),
    now: () => 1,
    newId: () => `card-${++n}`,
    currentText: () => null,
    applyEdit: () => ({ method: 'updateStaff', args: [] }),
    compareOf: (steps) => decorCompares(shop().grid, LEVEL, steps),
    cardChanged: () => {},
  })
}

test('알아서 배치 카드: 그 층 치우기 → 놓기 묶음(40개씩) · 카드 검사 통과 · 실행 전에는 아무것도 바꾸지 않는다', () => {
  const plan = autoArrange(shop(), LEVEL, 1)
  assert.ok(plan.place.length > 0)
  const { steps, omitted } = arrangeSteps(plan)
  assert.equal(omitted, 0)
  assert.deepEqual(steps[0], { method: 'stowAllGrid', args: [1, false], label: '1층 가구 서랍에 넣기' })
  assert.ok(steps.slice(1).every((s) => s.method === BATCH_METHOD && (s.items?.length ?? 0) <= BATCH_ITEMS_MAX))
  assert.deepEqual(steps.slice(1).flatMap((s) => s.items!.map((it) => it.args)), plan.place.map((p) => [p.itemId, 1, p.gx, p.gy, p.rot]))
  const calls: { method: string; args: unknown[] }[] = []
  const r = desk(calls).propose({ steps })
  assert.ok('card' in r, 'error' in r ? r.error : '')
  // 전↔후 그림이 1층 한 쌍 붙는다 (2층은 그대로라 없음)
  assert.equal(r.card.compares?.length, 1)
  assert.equal(r.card.compares?.[0].kind, 'image')
  assert.deepEqual(calls, [])
})

test('놓을 게 40개를 넘으면 묶음을 나누고, 카드 8단계를 넘는 만큼은 omitted', () => {
  const place = Array.from({ length: 300 }, (_, i) => ({ itemId: 'prop-plant', gx: i % 10, gy: Math.floor(i / 10), rot: 0 as const }))
  const { steps, omitted } = arrangeSteps({ floor: 2, before: [], place, kept: 0, seatPairs: 0, left: [] })
  assert.equal(steps.length, 8)
  assert.equal(omitted, 300 - 7 * BATCH_ITEMS_MAX)
  assert.equal(steps[1].label, '2층 새 배치 1/7')
})

test('평면도 그림: PNG data URL · 카드 그림 상한 안 · cleanCompares를 통과', () => {
  const room = roomOf(LEVEL, 1)
  const url = renderFloorPlan(room, fixedTiles(LEVEL, 1), shop().grid.filter((x) => x.floor === 1))
  assert.match(url, /^data:image\/png;base64,/)
  assert.ok(url.length < COMPARE_IMAGE_MAX / 10, `${url.length}`)
  const png = Buffer.from(url.split(',')[1], 'base64')
  assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47])
  assert.ok(png.readUInt32BE(16) > room.cols * 6 && png.readUInt32BE(20) > room.rows * 6, '가로·세로')
  assert.equal(cleanCompares([{ kind: 'image', label: 'x', before: url, after: url }]).length, 1)
})

test('미리 실행해 본 배치: 전부 치우기(직원 자리 남기기)·놓기·옮기기·서랍·되돌리기', () => {
  const grid = shop().grid
  const kept = simulateDecor(grid, [{ method: 'stowAllGrid', args: [1, true] }])
  assert.deepEqual(kept.map((x) => x.uid).sort(), ['c1', 'c2', 'd1', 'd2', 'p2'])
  const all = simulateDecor(grid, [{ method: 'stowAllGrid', args: [0, false] }])
  assert.equal(all.length, 0)
  const moved = simulateDecor(grid, [{ method: 'moveGridItem', args: ['p1', 1, 2, 3, 1] }, { method: 'storeItem', args: ['p2'] }, { method: 'placeGridItem', args: ['bookshelf', 1, 0, 5, 3] }])
  assert.deepEqual(moved.find((x) => x.uid === 'p1'), g('p1', 'prop-plant', 1, 2, 3, 1))
  assert.ok(!moved.some((x) => x.uid === 'p2'))
  assert.ok(moved.some((x) => x.itemId === 'bookshelf' && x.gx === 0 && x.rot === 3))
  const back = simulateDecor(all, [{ method: 'restoreGridItems', args: [grid] }])
  assert.equal(back.length, grid.length)
  // 바뀌지 않는 카드(켜고 끄기만)에는 그림이 없다
  assert.deepEqual(decorCompares(grid, LEVEL, [{ method: 'setGridItemOn', args: ['p1', true] }]), [])
  assert.equal(decorCompares(grid, LEVEL, [{ method: 'stowAllGrid', args: [0, false] }]).length, 2, '1층·2층 한 쌍씩')
})

test('되돌리기 단계: 새로 놓은 층을 먼저 비우고 치운 가구를 원래 자리로 · 카드 검사 통과', () => {
  const stowed = shop().grid.filter((x) => x.floor === 1)
  assert.deepEqual(undoSteps(stowed, []).map((s) => s.method), ['restoreGridItems'])
  const steps = undoSteps(stowed, [1, 1])
  assert.deepEqual(steps.map((s) => [s.method, s.args?.[0]]), [['stowAllGrid', 1], ['restoreGridItems', stowed]])
  const r = desk().propose({ steps })
  assert.ok('card' in r, 'error' in r ? r.error : '')
  assert.match(r.card.steps[1].detail, /되놓을 가구: 5개/)
})

test('배치 글과 카드 본문: uid·칸·방향·서랍 개수를 실제 값으로', () => {
  const text = layoutText(shop(), LEVEL, 1)
  assert.match(text, /1층 \(\d+×\d+칸\) — 놓인 가구 5개/)
  assert.match(text, /- c2 · 의자\(chair\) · 13,10 · rot 2↗/)
  assert.ok(!text.includes('2층 ('), '층을 주면 그 층만')
  assert.match(text, /서랍: .*책장\(bookshelf\) ×1/)
  assert.match(describeStep('placeGridItem', ['bookshelf', 1, 0, 5, 3], () => null), /가구: 책장\n1층 0,5칸 · 방향 ↘/)
  assert.match(describeStep('stowAllGrid', [0, true], () => null), /범위: 건물 전체\n직원 책상·의자는 남겨요/)
  assert.match(describeStep('moveGridItem', ['p1', 1, 2, 3, 1], (id) => (id === 'p1' ? '화분 (1층 6,9)' : null)), /가구: 화분 \(1층 6,9\)\n→ 1층 2,3칸 · 방향 ↖/)
})
