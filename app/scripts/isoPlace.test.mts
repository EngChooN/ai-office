// 놓기 검사 (기술 설계 2-3·2-4절) — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canPlace, fixedTiles, fixedTilesFor, type FloorState } from '../src/shared/iso/place.ts'
import type { GridItem } from '../src/shared/iso/furniture.ts'

const room = { cols: 10, rows: 10 }
// 회의실 (6..9, 0..2)·문 (7,2), 출입구 (5,9). 계단 없음
const fixed = fixedTilesFor(room, { meetingCapacity: 8, hasStairs: false })
let n = 0
const it = (itemId: string, gx: number, gy: number, rot: 0 | 1 | 2 | 3 = 0, floor = 1): GridItem => ({ uid: `u${++n}`, itemId, floor, gx, gy, rot })
const floorOf = (items: GridItem[], extra: Partial<FloorState> = {}): FloorState => ({ level: 3, floor: 1, items, room, fixed, ...extra })

test('바닥 밖: 칸마다 밖으로 나간 칸만 빨강', () => {
  const r = canPlace(floorOf([]), { itemId: 'desk', gx: 3, gy: 9, rot: 1 })
  assert.deepEqual(r, { ok: false, reason: 'out_of_bounds', tiles: [[3, 10]] })
  assert.equal(canPlace(floorOf([]), { itemId: 'desk', gx: -1, gy: 4, rot: 0 }).ok, false)
})

test('잘못된 입력: 소수 칸·범위 밖 rot·없는 층은 바닥 밖으로 거부', () => {
  const bad = { ok: false, reason: 'out_of_bounds', tiles: [] }
  assert.deepEqual(canPlace(floorOf([]), { itemId: 'fern', gx: 1.5, gy: 4, rot: 0 }), bad)
  assert.deepEqual(canPlace(floorOf([]), { itemId: 'fern', gx: 1, gy: Number.NaN, rot: 0 }), bad)
  assert.deepEqual(canPlace(floorOf([]), { itemId: 'desk', gx: 1, gy: 4, rot: 5.5 as 0 }), bad)
  assert.deepEqual(canPlace(floorOf([]), { itemId: 'desk', gx: 1, gy: 4, rot: -1 as 0 }), bad)
  // Lv.3은 1층뿐
  assert.deepEqual(canPlace(floorOf([], { floor: 9 }), { itemId: 'fern', gx: 1, gy: 4, rot: 0 }), bad)
  assert.deepEqual(canPlace(floorOf([], { floor: 0 }), { itemId: 'fern', gx: 1, gy: 4, rot: 0 }), bad)
})

test('고정 칸: 회의실·출입구·계단', () => {
  assert.equal((canPlace(floorOf([]), { itemId: 'fern', gx: 6, gy: 0, rot: 0 }) as { reason: string }).reason, 'fixed_tile')
  assert.equal((canPlace(floorOf([]), { itemId: 'fern', gx: 5, gy: 9, rot: 0 }) as { reason: string }).reason, 'fixed_tile')
  // 레벨표: Lv.6부터 2층 → 계단 2×2, Lv.1 8×8 방
  const lv6 = fixedTiles(6, 1)
  assert.ok(lv6.some((t) => t.kind === 'stairs' && t.gx === 0 && t.gy === 0))
  assert.ok(!fixedTiles(5, 1).some((t) => t.kind === 'stairs'))
  assert.ok(fixedTiles(1, 1).every((t) => t.gx < 8 && t.gy < 8))
  assert.equal(canPlace({ level: 6, floor: 2, items: [] }, { itemId: 'fern', gx: 1, gy: 1, rot: 0 }).ok, false)
})

test('겹침: 같은 layer끼리만 (러그 위 책상은 되고, 러그끼리는 안 됨)', () => {
  const rug = it('rug-round', 2, 4)
  const desk = it('desk', 2, 6)
  const items = [rug, desk]
  assert.equal(canPlace(floorOf(items), { itemId: 'fern', gx: 3, gy: 5, rot: 0 }).ok, true)
  assert.deepEqual(canPlace(floorOf(items), { itemId: 'rug-round', gx: 3, gy: 5, rot: 0 }), { ok: false, reason: 'overlap', tiles: [[3, 5]] })
  assert.deepEqual(canPlace(floorOf(items), { itemId: 'desk', gx: 1, gy: 6, rot: 0 }), { ok: false, reason: 'overlap', tiles: [[2, 6]] })
  // 다른 층 가구와는 겹치지 않는다
  assert.equal(canPlace(floorOf([it('desk', 1, 6, 0, 2)]), { itemId: 'desk', gx: 1, gy: 6, rot: 0 }).ok, true)
})

test('ignoreUid: 옮기는 가구 자신과는 겹치지 않는다', () => {
  const desk = it('desk', 2, 6)
  assert.equal(canPlace(floorOf([desk]), { itemId: 'desk', gx: 3, gy: 6, rot: 0 }).ok, false)
  assert.equal(canPlace(floorOf([desk]), { itemId: 'desk', gx: 3, gy: 6, rot: 0 }, desk.uid).ok, true)
})

test('소유·레벨: owned가 있을 때만 (메인)', () => {
  const placed = it('fern', 0, 5)
  // 1개 사서 이미 놓았으면 서랍 0개
  assert.equal((canPlace(floorOf([placed], { owned: { fern: 1 } }), { itemId: 'fern', gx: 2, gy: 5, rot: 0 }) as { reason: string }).reason, 'not_owned')
  // 그 가구를 옮기는 것은 된다
  assert.equal(canPlace(floorOf([placed], { owned: { fern: 1 } }), { itemId: 'fern', gx: 2, gy: 5, rot: 0 }, placed.uid).ok, true)
  // 화면 미리보기(owned 없음)는 보지 않는다
  assert.equal(canPlace(floorOf([placed]), { itemId: 'fern', gx: 2, gy: 5, rot: 0 }).ok, true)
  // 레벨 미달 (그랜드 피아노 minLevel > 3)
  assert.equal((canPlace(floorOf([], { owned: { piano: 1 } }), { itemId: 'piano', gx: 1, gy: 4, rot: 0 }) as { reason: string }).reason, 'level_locked')
})

test('길 막힘: 통로를 막는 1×2 거부, 비켜 놓으면 통과', () => {
  // y=6 줄을 x=0..9 중 x=4,5만 남기고 막는다 → 출입구(5,9)에서 위쪽 의자(2,2)로 가는 길은 (4,6)(5,6)
  const wall = [0, 1, 2, 3, 6, 7, 8, 9].map((x) => it('fern', x, 6))
  const chair = it('chair', 2, 2)
  const items = [...wall, chair]
  // 1×2 (돌린 책상)을 (4,6)(5,6)에 놓으면 막힌다
  const r = canPlace(floorOf(items), { itemId: 'desk', gx: 4, gy: 6, rot: 0 })
  assert.equal(r.ok, false)
  assert.equal((r as { reason: string }).reason, 'blocks_path')
  assert.ok((r as { tiles: [number, number][] }).tiles.some(([x, y]) => x === 2 && y === 2))
  // 한 칸만 막으면 다른 칸으로 지나간다
  assert.equal(canPlace(floorOf(items), { itemId: 'fern', gx: 4, gy: 6, rot: 0 }).ok, true)
})

test('길 막힘: 쓰는 자리를 가리면 거부', () => {
  const darts = it('dartboard', 3, 3) // 쓰는 자리 (3,4)
  assert.equal((canPlace(floorOf([darts]), { itemId: 'fern', gx: 3, gy: 4, rot: 0 }) as { reason: string }).reason, 'blocks_path')
})

test('서는 자리가 바닥 밖: 바닥 밖으로 거부하고 가구 칸을 칠한다 (방 밖 좌표는 칠하지 않음)', () => {
  // 맨 앞줄에 r0로 놓으면 쓰는 자리 (2,10)이 바닥 밖 → 돌리면 된다
  assert.deepEqual(canPlace(floorOf([]), { itemId: 'dartboard', gx: 2, gy: 9, rot: 0 }), { ok: false, reason: 'out_of_bounds', tiles: [[2, 9]] })
  assert.equal(canPlace(floorOf([]), { itemId: 'dartboard', gx: 2, gy: 9, rot: 2 }).ok, true)
  // 한리뷰 예: Lv.1(8×8) 앞벽에 붙인 책장, 왼벽에 붙인 축구 게임대
  const lv1 = (itemId: string, gx: number, gy: number) => canPlace({ level: 1, floor: 1, items: [] }, { itemId, gx, gy, rot: 0 })
  assert.deepEqual(lv1('bookshelf', 0, 7), { ok: false, reason: 'out_of_bounds', tiles: [[0, 7], [1, 7]] })
  assert.deepEqual(lv1('foosball', 0, 3), { ok: false, reason: 'out_of_bounds', tiles: [[0, 3], [1, 3]] })
  assert.equal(lv1('foosball', 1, 3).ok, true)
})
