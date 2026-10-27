// 자리 배정 (기술 설계 6-2절) — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assignSeats, autoSeats, isAisleSlot, islandsOf, isAutoSeat, seatsOf, type SeatStaff, type SeatTeam } from '../src/shared/iso/seats.ts'
import { canPlace, fixedTilesFor, type FloorState } from '../src/shared/iso/place.ts'
import type { GridItem } from '../src/shared/iso/furniture.ts'

const room = { cols: 12, rows: 12 }
const fixed = fixedTilesFor(room, { meetingCapacity: 8, hasStairs: false })
const chair = (uid: string, gx: number, gy: number): GridItem => ({ uid, itemId: 'chair', floor: 1, gx, gy, rot: 0 })
const desk = (uid: string, gx: number, gy: number): GridItem => ({ uid, itemId: 'desk', floor: 1, gx, gy, rot: 0 })

// 섬 A: 의자 3개 (1..3, 4) + 책상 / 섬 B: 의자 2개 (1..2, 8)  — 둘은 4칸 떨어져 따로
const layout = (): GridItem[] => [chair('a1', 1, 4), chair('a2', 2, 4), chair('a3', 3, 4), desk('da', 1, 5), chair('b1', 1, 8), chair('b2', 2, 8)]
const teams: SeatTeam[] = [
  { id: 't1', kind: 'hired', leadId: 's3' },
  { id: 't2', kind: 'hired', leadId: null },
]
const staff: SeatStaff[] = [
  { id: 's1', teamId: 't1', hiredAt: 1 },
  { id: 's2', teamId: 't1', hiredAt: 2 },
  { id: 's3', teamId: 't1', hiredAt: 3 },
  { id: 's4', teamId: 't2', hiredAt: 4 },
  { id: 's5', teamId: null, hiredAt: 5 },
]

test('의자 = 자리, 앞에 책상이 붙으면 책상 자리, (gy, gx, uid) 순', () => {
  const seats = seatsOf(layout())
  assert.deepEqual(seats.map((s) => s.uid), ['a1', 'a2', 'a3', 'b1', 'b2'])
  assert.deepEqual(seats.map((s) => s.hasDesk), [true, true, false, false, false])
  assert.deepEqual(islandsOf(seats).map((i) => i.map((s) => s.uid)), [['a1', 'a2', 'a3'], ['b1', 'b2']])
})

test('팀이 같은 섬에, 리드 먼저 · 인원 많은 팀부터 들어가는 가장 작은 섬', () => {
  const plan = assignSeats(seatsOf(layout()), staff, teams)
  const at = (id: string) => plan.seats.get(id)?.uid
  // t1(3명)은 섬 A, 리드 s3이 첫 의자
  assert.deepEqual(['s3', 's1', 's2'].map(at), ['a1', 'a2', 'a3'])
  // t2(1명)와 팀 없음(1명)은 섬 B
  assert.deepEqual(['s4', 's5'].map(at), ['b1', 'b2'])
  assert.deepEqual(plan.standing, [])
})

test('결정적: 입력 순서가 달라도 같은 결과', () => {
  const a = assignSeats(seatsOf(layout()), staff, teams)
  const b = assignSeats(seatsOf([...layout()].reverse()), [...staff].reverse(), teams)
  assert.deepEqual([...a.seats].sort(), [...b.seats].sort())
})

test('의자 하나를 옮기면 그 자리 직원만 바뀐다 (직전 배정 기억)', () => {
  const before = assignSeats(seatsOf(layout()), staff, teams)
  // a1을 다른 섬 옆 (3,8)으로 옮긴다 → a1에 앉던 s3만 따라가고 나머지는 그대로
  const moved = layout().map((it) => (it.uid === 'a1' ? { ...it, gx: 3, gy: 8 } : it))
  const after = assignSeats(seatsOf(moved), staff, teams, before.memory)
  for (const s of staff) {
    const x = before.seats.get(s.id)!
    const y = after.seats.get(s.id)!
    assert.equal(y.uid, x.uid, s.id)
    assert.equal(x.gx === y.gx && x.gy === y.gy, s.id !== 's3', s.id)
  }
  // 섬 맨 앞에 빈 의자를 더 놓아도 아무도 안 옮긴다 (기억이 없으면 리드가 새 의자로 가며 줄줄이 밀린다)
  const plus = assignSeats(seatsOf([...layout(), chair('a0', 0, 4)]), staff, teams, before.memory)
  for (const s of staff) assert.equal(plus.seats.get(s.id)!.uid, before.seats.get(s.id)!.uid, s.id)
  // 먼 곳 빈 의자 하나에 1인 팀이 옮겨 가지 않는다
  const far = assignSeats(seatsOf([...layout(), chair('z1', 9, 10)]), staff, teams, before.memory)
  assert.equal(far.seats.get('s4')!.uid, before.seats.get('s4')!.uid)
  // 팀이 바뀐 직원은 새로 앉는다 — 섬 A에 빈자리가 생겨도 새 팀(t2)이 앉은 섬 B의 빈 의자로
  const moveTeam = staff.map((s) => (s.id === 's2' ? { ...s, teamId: 't2' } : s))
  const re = assignSeats(seatsOf([...layout(), chair('b3', 3, 8)]), moveTeam, teams, before.memory)
  assert.equal(re.seats.get('s1')!.uid, before.seats.get('s1')!.uid)
  assert.equal(re.seats.get('s2')!.uid, 'b3')
})

test('팀이 섬 안에서 붙어 앉는다 (의자 uid가 위치와 무관해도)', () => {
  // 긴 섬 하나: 의자 8개가 한 줄, uid는 뒤섞임
  const ids = ['q5', 'q2', 'q7', 'q0', 'q3', 'q6', 'q1', 'q4']
  const row = ids.map((id, x) => chair(id, x + 1, 4))
  const people: SeatStaff[] = [
    { id: 'x1', teamId: 't1', hiredAt: 1 },
    { id: 'y1', teamId: 't2', hiredAt: 2 },
    { id: 'x2', teamId: 't1', hiredAt: 3 },
    { id: 'n1', teamId: null, hiredAt: 4 },
    { id: 'y2', teamId: 't2', hiredAt: 5 },
    { id: 'x3', teamId: 't1', hiredAt: 6 },
    { id: 'y3', teamId: 't2', hiredAt: 7 },
  ]
  const plan = assignSeats(seatsOf(row), people, teams)
  for (const prefix of ['x', 'y']) {
    const xs = people.filter((p) => p.id.startsWith(prefix)).map((p) => plan.seats.get(p.id)!.gx).sort((a, b) => a - b)
    assert.equal(xs[xs.length - 1] - xs[0], xs.length - 1, `${prefix} 팀이 이어진 칸에 ${xs}`)
  }
})

test('모자라면 섬을 나눠 앉고, 남는 사람은 서 있다', () => {
  const big: SeatStaff[] = [...staff, { id: 's6', teamId: 't2', hiredAt: 6 }, { id: 's7', teamId: 't2', hiredAt: 7 }]
  const plan = assignSeats(seatsOf(layout()), big, teams)
  assert.equal(plan.seats.size, 5)
  assert.equal(plan.standing.length, 2)
})

test('모자라면 기본 자리: 저장 안 하는 가상 가구, 놓기 검사를 통과하는 칸에', () => {
  const items = layout()
  const state: FloorState = { level: 3, floor: 1, items, room, fixed }
  const auto = autoSeats(state, 3)
  assert.equal(auto.length, 6)
  assert.ok(auto.every((it) => isAutoSeat(it.uid)))
  assert.deepEqual(auto.map((it) => it.itemId).sort(), ['chair', 'chair', 'chair', 'desk', 'desk', 'desk'])
  // 하나씩 차례로 놓아도 모두 놓기 검사 통과 (겹침·고정 칸·길 막힘 없음)
  let cur = [...items]
  for (const it of auto) {
    assert.ok(canPlace({ ...state, items: cur }, it).ok, it.uid)
    cur = [...cur, it]
  }
  // 기본 자리 의자는 근무 자리이고 책상이 붙어 있다
  const seats = seatsOf(cur).filter((s) => isAutoSeat(s.uid))
  assert.equal(seats.length, 3)
  assert.ok(seats.every((s) => s.hasDesk))
  // 결정적
  assert.deepEqual(autoSeats(state, 3), auto)
  assert.deepEqual(autoSeats(state, 0), [])
})

test('가구 하나 놓아도 기본 자리 직원 그대로 (기본 자리 id는 위치)', () => {
  const items = layout()
  const state: FloorState = { level: 3, floor: 1, items, room, fixed }
  const many: SeatStaff[] = [...staff, { id: 's6', teamId: 't2', hiredAt: 6 }, { id: 's7', teamId: 't2', hiredAt: 7 }, { id: 's8', teamId: null, hiredAt: 8 }]
  const auto = autoSeats(state, 3)
  assert.ok(auto.every((it) => /^auto:1:\d+,\d+[cd]$/.test(it.uid)), auto.map((it) => it.uid).join(' '))
  const before = assignSeats(seatsOf([...items, ...auto]), many, teams)
  const posOf = (plan: typeof before, id: string) => `${plan.seats.get(id)!.gx},${plan.seats.get(id)!.gy}`
  const onAuto = many.filter((s) => isAutoSeat(before.seats.get(s.id)!.uid)).map((s) => s.id)
  assert.equal(onAuto.length, 3)

  // 기본 자리와 겹치지 않는 곳에 화분 → 기본 자리·직원 모두 그대로
  const fern: GridItem = { uid: 'f1', itemId: 'fern', floor: 1, gx: 0, gy: 10, rot: 0 }
  const s1: FloorState = { ...state, items: [...items, fern] }
  const auto1 = autoSeats(s1, 3, auto)
  assert.deepEqual(auto1, auto)
  const after1 = assignSeats(seatsOf([...s1.items, ...auto1]), many, teams, before.memory)
  for (const s of many) assert.equal(posOf(after1, s.id), posOf(before, s.id), s.id)

  // 첫 기본 자리 의자 칸에 화분 → 그 자리만 다른 곳으로, 나머지 기본 자리 직원은 그대로
  const first = auto.find((it) => it.itemId === 'chair')!
  const s2: FloorState = { ...state, items: [...items, { ...fern, gx: first.gx, gy: first.gy }] }
  const auto2 = autoSeats(s2, 3, auto)
  assert.equal(auto2.length, 6)
  const after2 = assignSeats(seatsOf([...s2.items, ...auto2]), many, teams, before.memory)
  const moved = many.filter((s) => posOf(after2, s.id) !== posOf(before, s.id)).map((s) => s.id)
  assert.equal(moved.length, 1, moved.join(','))
  assert.equal(before.seats.get(moved[0])!.uid, first.uid)
})

test('기본 자리는 통로를 남긴다: 의자 뒤 줄은 비고, 책상 3개마다 한 칸 빈다 (3-5 O3)', () => {
  const big = { cols: 16, rows: 16 }
  const state: FloorState = { level: 10, floor: 1, items: [], room: big, fixed: fixedTilesFor(big, { meetingCapacity: 16, hasStairs: true }) }
  const auto = autoSeats(state, 12)
  const chairs = auto.filter((it) => it.itemId === 'chair')
  assert.equal(chairs.length, 12)
  assert.ok(chairs.every((c) => isAisleSlot(c.gx, c.gy)), chairs.map((c) => `${c.gx},${c.gy}`).join(' '))
  // 의자 바로 뒤 칸(통로 줄)에는 기본 자리 가구가 없다
  const taken = new Set(auto.flatMap((it) => (it.itemId === 'desk' ? [`${it.gx},${it.gy}`, `${it.gx + 1},${it.gy}`] : [`${it.gx},${it.gy}`])))
  for (const c of chairs) assert.ok(!taken.has(`${c.gx},${c.gy - 1}`), `${c.gx},${c.gy}`)
})

test('통로 칸이 모자라면 남은 빈 칸에 채운다 (놓기 검사는 그대로 통과)', () => {
  const state: FloorState = { level: 3, floor: 1, items: [], room, fixed }
  const auto = autoSeats(state, 20)
  const chairs = auto.filter((it) => it.itemId === 'chair')
  assert.ok(chairs.some((c) => !isAisleSlot(c.gx, c.gy)), '통로 칸만으로는 20자리가 안 된다')
  let cur: GridItem[] = []
  for (const it of auto) {
    assert.ok(canPlace({ ...state, items: cur }, it).ok, it.uid)
    cur = [...cur, it]
  }
})

// ── 책상 세트 옮기기 (0.14.0) ──
import { moveSeatSet } from '../src/main/shopGrid.ts'
import { seatSetOf } from '../src/shared/iso/seats.ts'
import { EMPTY_SHOP } from '../src/shared/economy.ts'

test('책상 세트: 책상·의자 어느 쪽을 눌러도 같은 둘, 의자 둘이 보는 책상은 하나만', () => {
  const desk = { uid: 'd', itemId: 'desk', floor: 1, gx: 4, gy: 5, rot: 0 as const }
  const chair = { uid: 'c', itemId: 'chair', floor: 1, gx: 4, gy: 4, rot: 0 as const }
  assert.deepEqual(seatSetOf([desk, chair], 'c').map((g) => g.uid).sort(), ['c', 'd'])
  assert.deepEqual(seatSetOf([desk, chair], 'd').map((g) => g.uid).sort(), ['c', 'd'])
  const chair2 = { ...chair, uid: 'c2', gx: 5 }
  assert.deepEqual(seatSetOf([desk, chair, chair2], 'd').map((g) => g.uid), ['d'])
})

test('moveSeatSet: 기본 자리(auto:)는 새 uid로 저장되고 저장 가구는 그대로 옮긴다', () => {
  const parts = [
    { uid: 'auto:1:6,8d', toUid: 'nd', itemId: 'desk', gx: 6, gy: 9, rot: 0 as const },
    { uid: 'auto:1:6,8c', toUid: 'nc', itemId: 'chair', gx: 6, gy: 8, rot: 0 as const },
  ]
  const a = moveSeatSet(EMPTY_SHOP, 8, 1, parts)
  assert.deepEqual(a.grid.map((g) => [g.uid, g.itemId, g.gx, g.gy]), [['nd', 'desk', 6, 9], ['nc', 'chair', 6, 8]])
  const b = moveSeatSet(a, 8, 1, [
    { uid: 'nd', itemId: 'desk', gx: 8, gy: 9, rot: 0 },
    { uid: 'nc', itemId: 'chair', gx: 8, gy: 8, rot: 0 },
  ])
  assert.deepEqual(b.grid.map((g) => [g.uid, g.gx]), [['nd', 8], ['nc', 8]])
  // 겹침은 기존 규칙대로 거절
  const c = { ...b, grid: [...b.grid, { uid: 'x', itemId: 'desk', floor: 1, gx: 12, gy: 9, rot: 0 as const }] }
  assert.throws(() => moveSeatSet(c, 8, 1, [{ uid: 'nd', itemId: 'desk', gx: 12, gy: 9, rot: 0 }, { uid: 'nc', itemId: 'chair', gx: 12, gy: 8, rot: 0 }]))
  assert.throws(() => moveSeatSet(EMPTY_SHOP, 8, 1, [{ uid: 'zz', itemId: 'desk', gx: 6, gy: 9, rot: 0 }]))
})
