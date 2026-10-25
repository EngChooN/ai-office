// 칸 길찾기 (기술 설계 6-1절) — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWalkMap, findPath, nearestFreeCell, reachable } from '../src/shared/iso/path.ts'
import { facingOf, type GridPose } from '../src/shared/iso/furniture.ts'
import { fixedTilesFor } from '../src/shared/iso/place.ts'

const room = { cols: 10, rows: 10 }
const wallX5 = (): GridPose[] => Array.from({ length: 9 }, (_, y) => ({ itemId: 'fern', gx: 5, gy: y, rot: 0 }))
const isStep = (a: { gx: number; gy: number }, b: { gx: number; gy: number }) => Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy) === 1

test('가구를 돌아가는 최단 경로 (4방향, 이어진 칸만)', () => {
  // x=5에 세로로 가구를 세우고 y=9만 비운다
  const m = buildWalkMap(room, wallX5())
  const path = findPath(m, { gx: 0, gy: 0 }, { gx: 9, gy: 0 })!
  assert.ok(path)
  assert.equal(path.length, 9 + 9 + 9)
  assert.ok(path.some((c) => c.gx === 5 && c.gy === 9))
  let prev = { gx: 0, gy: 0 }
  for (const c of path) {
    assert.ok(isStep(prev, c))
    assert.equal(m.blocked[c.gy * 10 + c.gx], 0)
    prev = c
  }
})

test('러그(flat) 위는 지나간다', () => {
  // 유일한 틈 (5,9)에 러그 (4..5, 8..9)를 깔아도 막히지 않는다
  const m = buildWalkMap(room, [...wallX5(), { itemId: 'rug-round', gx: 4, gy: 8, rot: 0 }])
  assert.ok(findPath(m, { gx: 0, gy: 0 }, { gx: 9, gy: 0 }))
})

test('막힌 목적지(의자)에는 마지막 걸음으로 들어간다', () => {
  const m = buildWalkMap(room, [{ itemId: 'chair', gx: 3, gy: 3, rot: 0 }])
  assert.deepEqual(findPath(m, { gx: 3, gy: 1 }, { gx: 3, gy: 3 })?.at(-1), { gx: 3, gy: 3 })
})

test('못 가면 null', () => {
  const m = buildWalkMap(room, [{ itemId: 'fern', gx: 1, gy: 0, rot: 0 }, { itemId: 'fern', gx: 0, gy: 1, rot: 0 }, { itemId: 'fern', gx: 1, gy: 1, rot: 0 }])
  assert.equal(findPath(m, { gx: 0, gy: 0 }, { gx: 5, gy: 5 }), null)
  assert.equal(findPath(m, { gx: 5, gy: 5 }, { gx: 10, gy: 5 }), null)
})

test('벽 있는 회의실은 문으로만 드나든다, 트인 자리는 그냥 지난다', () => {
  const fixed = fixedTilesFor(room, { meetingCapacity: 12, hasStairs: false }) // 오크 7×4: 회의실 (3..9, 0..3), 문 (6,3)
  const m = buildWalkMap(room, [], fixed)
  const path = findPath(m, { gx: 2, gy: 0 }, { gx: 3, gy: 0 })!
  // 바로 옆 칸이지만 벽이라 문(6,3)으로 돌아 들어간다
  assert.ok(path.length > 1)
  assert.ok(path.some((c) => c.gx === 6 && c.gy === 3))
  const seen = reachable(m, { gx: 5, gy: 9 })
  assert.equal(seen[0 * 10 + 9], 1)
  // 접이식(트인 자리 4×4, 구획 0): 바로 옆 칸으로 들어간다. 원탁 칸은 막힌 칸
  const open = buildWalkMap(room, [], fixedTilesFor(room, { meetingCapacity: 8, hasStairs: false }))
  assert.equal(findPath(open, { gx: 5, gy: 0 }, { gx: 6, gy: 0 })!.length, 1)
  assert.equal(open.blocked[1 * 10 + 7], 1)
})

test('걷는 방향 → 보는 방향 (r0 ↙ · r1 ↖ · r2 ↗ · r3 ↘)', () => {
  assert.equal(facingOf(0, 1), 0)
  assert.equal(facingOf(-1, 0), 1)
  assert.equal(facingOf(0, -1), 2)
  assert.equal(facingOf(1, 0), 3)
})

test('기다릴 칸: 다른 직원이 차지한 칸을 빼고 가까운 순, 다 차도 겹치지 않는다 (3-5 O1)', () => {
  const fixed = fixedTilesFor(room, { meetingCapacity: 8, hasStairs: false })
  const entrance = fixed.find((t) => t.kind === 'entrance')!
  const m = buildWalkMap(room, wallX5(), fixed)
  const seen = reachable(m, entrance)
  const skip = new Set(fixed.map((t) => t.gy * room.cols + t.gx))
  const picked: string[] = []
  for (let i = 0; i < 30; i++) {
    const c = nearestFreeCell(m, seen, entrance, skip)
    assert.ok(c, `${i}번째`)
    picked.push(`${c.gx},${c.gy}`)
    skip.add(c.gy * room.cols + c.gx)
    // 막힌 칸·못 닿는 칸은 고르지 않는다 (x=5 화분 벽의 오른쪽 위는 막혀 있지 않지만 gx=5 칸은 화분)
    assert.notEqual(c.gx, 5)
  }
  assert.equal(new Set(picked).size, picked.length)
  // 가까운 순: 첫 칸은 출입구 바로 옆
  const [fx, fy] = picked[0].split(',').map(Number)
  assert.equal(Math.abs(fx - entrance.gx) + Math.abs(fy - entrance.gy), 1)
  // 빈 칸이 없으면 null
  const all = new Set(Array.from({ length: room.cols * room.rows }, (_, k) => k))
  assert.equal(nearestFreeCell(m, seen, entrance, all), null)
})
