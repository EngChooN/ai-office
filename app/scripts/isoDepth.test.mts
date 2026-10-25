// 아이소메트릭 그리는 순서 (기술 설계 1-2절 · 시제품 방식 유지) — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { depthOrder, edgeBox, hidesMover, isBehind, placeMovers } from '../src/shared/iso/depth.ts'
import { edgesOf, planOf } from '../src/shared/iso/plan.ts'

test('그리는 순서: 한 축으로 떨어져 있으면 작은 쪽이 뒤, 긴 가구 옆 직원도 맞게', () => {
  const box = (x: number, y: number, w: number, d: number, z = 0, h = 10) => ({ x, y, w, d, z, h })
  // 1×3 긴 가구 (0,0)~(1,3) 오른쪽 옆 (1.3, 2.3)에 선 직원: x로 떨어져 있어 가구가 뒤
  const long = box(0, 0, 1, 3)
  const person = box(1.32, 2.32, 0.36, 0.36, 0, 24)
  assert.equal(isBehind(long, person), true)
  assert.equal(isBehind(person, long), false)
  // x+y 합만 보면 틀리는 경우: 직원 합(3.64+…)이 커도 가구(합 2+…) 뒤가 아니다 → 위가 맞다
  const seat = box(0.22, 0.24, 0.56, 0.56, 0, 12)
  const sitter = box(0.32, 0.32, 0.36, 0.36, 12, 24)
  assert.equal(isBehind(seat, sitter), true)
  const order = depthOrder([person, sitter, long, seat])
  assert.ok(order.indexOf(long) < order.indexOf(person))
  assert.ok(order.indexOf(seat) < order.indexOf(sitter))
})

test('그리는 순서: 화면에서 위아래로 떨어진 낮은 상자끼리는 순서를 정하지 않는다 (순환 방지)', () => {
  const box = (x: number, y: number, w: number, d: number, z = 0, h = 2) => ({ x, y, w, d, z, h })
  const back = box(0, 0, 1, 1)
  const front = box(3, 3, 1, 1)
  assert.equal(isBehind(back, front), false)
  assert.equal(isBehind(front, back), false)
  // 키가 커서 화면에서 겹치면 다시 순서가 생긴다
  assert.equal(isBehind(back, box(3, 3, 1, 1, 0, 60)), true)
})

test('직원 끼우기: 가구 순서는 그대로 두고 직원만 그 사이에 — 전체 정렬과 같은 앞뒤', () => {
  const box = (x: number, y: number, w: number, d: number, z = 0, h = 10) => ({ x, y, w, d, z, h })
  const desk = box(2, 3, 2, 1, 0, 20)
  const seat = box(2.22, 2.24, 0.56, 0.56, 0, 12)
  const back = box(2.22, 2.05, 0.56, 0.15, 12, 24)
  const plant = box(6, 6, 1, 1, 0, 30)
  const statics = depthOrder([plant, desk, back, seat])
  const sitter = box(2.32, 2.32, 0.36, 0.36, 12, 24)
  const walker = box(5.82, 5.6, 0.36, 0.36, 0, 24)
  const slots = placeMovers(statics, [walker, sitter])
  assert.ok(slots)
  // 깊이 = 가구 i는 i, 직원은 끼는 자리 + rank 비율 → 전체 정렬 결과의 앞뒤 관계를 모두 지킨다
  const depth = new Map<object, number>(statics.map((s, i) => [s, i]))
  for (const s of slots) depth.set(s.item, s.after + 0.1 + s.rank * 0.01)
  const all = [...statics, sitter, walker]
  for (const a of all) for (const b of all) if (a !== b && isBehind(a, b)) assert.ok(depth.get(a)! < depth.get(b)!, 'behind는 먼저')
})

test('직원 끼우기: 맞는 자리가 없으면 null (그 프레임은 전체 정렬)', () => {
  const box = (x: number, y: number, w: number, d: number, z = 0, h = 10) => ({ x, y, w, d, z, h })
  // 직원 오른쪽 앞 가구가 왼쪽 뒤 가구보다 먼저 정렬된 순서를 억지로 준다
  const behindIt = box(0, 1, 1, 1, 0, 40)
  const inFront = box(1, 2, 1, 1, 0, 40)
  const person = box(1.1, 1.1, 0.36, 0.36, 0, 24)
  assert.equal(isBehind(behindIt, person), true)
  assert.equal(isBehind(person, inFront), true)
  assert.equal(placeMovers([inFront, behindIt], [person]), null)
  assert.ok(placeMovers([behindIt, inFront], [person]))
})

test('안쪽 벽 조각 (G3 A): 벽 뒤에 가려진 직원·든 가구가 있는 칸 벽만 반투명', () => {
  // Lv.10 3층 ㄷ자: 안뜰 오른쪽 날개의 −x 변이 안쪽 벽 (앞쪽으로 4칸)
  const room = planOf(10, 3)
  const inner = edgesOf(room).filter((e) => e.kind === 'innerWall')
  assert.ok(inner.length >= 4)
  assert.ok(inner.every((e) => e.side === 'x-' && e.gx === inner[0].gx))
  const wx = inner[0].gx
  const gy0 = Math.min(...inner.map((e) => e.gy))
  const walls = inner.map(edgeBox)
  // 벽은 날개 칸 바깥(안뜰 쪽)에 선다 — 날개 칸 위 가구·직원보다 늘 뒤
  for (const w of walls) assert.ok(w.x + w.w <= wx + 1e-9)
  const person = (x: number, y: number) => ({ x: x - 0.18, y: y - 0.18, w: 0.36, d: 0.36, z: 0, h: 26 })
  // 안뜰 바로 뒤 줄에서 벽 왼쪽 뒤에 선 직원 → 첫 칸 벽만 가린다
  const back = person(wx - 0.5, gy0 - 0.5)
  const faded = walls.map((w) => hidesMover(w, [back]))
  assert.deepEqual(faded, walls.map((w) => w.y === gy0))
  // 날개 안(벽 앞)에 선 직원 · 멀리 왼쪽 직원은 가리지 않는다
  assert.ok(walls.every((w) => !hidesMover(w, [person(wx + 0.5, gy0 + 1.5), person(2.5, gy0 - 0.5)])))
  // 들고 옮기는 가구(2×1)도 같은 판정
  assert.ok(walls.some((w) => hidesMover(w, [{ x: wx - 2, y: gy0 - 1, w: 2, d: 1, z: 0, h: 20 }])))
  // 날개 칸 위 가구와의 앞뒤: 벽이 먼저
  const desk = { x: wx, y: gy0 + 1, w: 2, d: 1, z: 0, h: 20 }
  assert.equal(isBehind(walls[1], desk), true)
})
