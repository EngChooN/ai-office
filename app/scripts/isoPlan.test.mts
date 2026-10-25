// 층 평면(칸 표)·경계 분류·구획 길찾기 (docs/specs/office-iso-spaces.md 1-1·1-3·3-1) — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boxOf, isInside, type Room } from '../src/shared/iso/grid.ts'
import { isoLevelOf, roomOf } from '../src/shared/iso/levels.ts'
import { CellKind, edgesOf, kindAt, planOf, type EdgeKind } from '../src/shared/iso/plan.ts'
import { buildWalkMap, findPath, reachable } from '../src/shared/iso/path.ts'
import { canPlace, fixedTiles, type FixedTile } from '../src/shared/iso/place.ts'
import { autoSeats } from '../src/shared/iso/seats.ts'
import { LEVEL_TABLE, MAX_LEVEL } from '../src/shared/officeLevel.ts'

const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)
const floorsOf = (level: number) => Array.from({ length: isoLevelOf(level).floors }, (_, i) => i + 1)

/** 칸 표를 격자 글자로 (# 실내 · o 야외 · · 없음) — 1-3절 격자와 같은 모양 */
const gridText = (room: Room, rows: [number, number] = [0, room.rows]) =>
  Array.from({ length: rows[1] - rows[0] }, (_, i) =>
    Array.from({ length: room.cols }, (_, x) => ['·', '#', 'o'][kindAt(room, x, rows[0] + i)]).join(''),
  )

const countByKind = (room: Room) => {
  const out: Record<string, number> = {}
  for (const e of edgesOf(room)) out[e.kind] = (out[e.kind] ?? 0) + 1
  return out
}

test('바닥은 줄지 않는다: 어느 층이든 다음 레벨에서도 그 칸이 모두 바닥', () => {
  for (const lv of LEVELS.slice(0, -1))
    for (const f of floorsOf(lv)) {
      const [a, b] = [roomOf(lv, f), roomOf(lv + 1, f)]
      for (let gy = 0; gy < a.rows; gy++)
        for (let gx = 0; gx < a.cols; gx++) if (isInside(a, gx, gy)) assert.ok(isInside(b, gx, gy), `Lv.${lv}→${lv + 1} ${f}층 (${gx},${gy})`)
    }
})

test('상자 크기는 레벨표의 칸 크기, 뒤쪽 두 변은 깎지 않는다', () => {
  for (const lv of LEVELS)
    for (const f of [1, 2, 3, 4, 5]) {
      const n = LEVEL_TABLE[lv - 1].grid
      const room = roomOf(lv, f)
      assert.deepEqual([boxOf(room).cols, boxOf(room).rows], [n, n], `Lv.${lv} ${f}층`)
      // 뒤쪽 위 변 전체와 왼쪽 뒤 변의 앞쪽 깎임 전까지가 곧은 바닥
      for (let x = 0; x < n; x++) assert.ok(isInside(room, x, 0), `Lv.${lv} ${f}층 (${x},0)`)
      let gap = false
      for (let y = 0; y < n; y++) {
        if (!isInside(room, 0, y)) gap = true
        else assert.ok(!gap, `Lv.${lv} ${f}층 gx=0 줄이 끊김 y=${y}`)
      }
      // 뒤쪽 두 변에 붙은 두 줄은 깎지 않는다
      assert.ok(isInside(room, 0, 0))
    }
})

test('평면은 같은 입력이면 같은 객체, 표 밖 레벨은 끝 행', () => {
  assert.equal(planOf(10, 3), planOf(10, 3))
  assert.equal(roomOf(10, 3), planOf(10, 3))
  assert.deepEqual(roomOf(99, 5), roomOf(20, 5))
  assert.deepEqual(roomOf(0, 0), roomOf(1, 1))
})

test('1-3절 격자: Lv.1 1층 정사각형 · Lv.6 2층 ㄱ자 · Lv.10 3층 ㄷ자', () => {
  const r1 = roomOf(1, 1)
  assert.deepEqual([r1.cols, r1.rows, r1.cells], [8, 8, undefined])
  assert.deepEqual(gridText(r1)[7], '########')
  assert.deepEqual(gridText(roomOf(6, 2), [4, 12]), ['############', '############', '############', '############', '########····', '########····', '########····', '########····'])
  assert.deepEqual(gridText(roomOf(10, 3), [10, 16]), ['################', '################', '#####······#####', '#####······#####', '#####······#####', '#####······#####'])
})

test('1-3절 격자: ㄷ자 안뜰은 칸이 늘어도 같은 열에 앞변을 따라 내려간다 (Lv.13)', () => {
  const full = '#'.repeat(18)
  const row = '#####······#######'
  assert.deepEqual(gridText(roomOf(13, 3), [12, 18]), [full, full, row, row, row, row])
})

test('1-3절 격자: Lv.17 4층 T자는 깎인 자리가 옥상 정원, Lv.14~16은 빈 칸', () => {
  const garden = 'oooo###########oooooo'
  assert.deepEqual(gridText(roomOf(17, 4), [16, 21]), ['#'.repeat(21), '#'.repeat(21), garden, garden, garden])
  const cut = '····#########······'
  assert.deepEqual(gridText(roomOf(14, 4), [15, 19]), ['#'.repeat(19), cut, cut, cut])
})

test('1-3절 격자: Lv.20 5층 탑은 앞 양쪽 5×5가 빈 칸', () => {
  const t = gridText(roomOf(20, 5), [18, 24])
  assert.equal(t[0], '#'.repeat(24))
  for (const row of t.slice(1)) assert.equal(row, '·····' + '#'.repeat(14) + '·····')
})

test('1층: 현관 돌출(Lv.2~)·오른쪽 테라스(Lv.6~)·로비(Lv.8~)는 야외 칸으로 붙고 상자 밖으로만 커진다', () => {
  const lv1 = roomOf(1, 1)
  const lv2 = roomOf(2, 1)
  assert.deepEqual([lv1.rows, lv2.cols, lv2.rows], [8, 9, 10])
  assert.deepEqual(gridText(lv2, [9, 10]), ['···ooo···'])
  const lv6 = roomOf(6, 1)
  assert.deepEqual([lv6.cols, lv6.rows], [15, 13])
  // 테라스: 상자 오른쪽 바깥 3열, 위에서 5줄째부터
  assert.deepEqual(gridText(lv6, [4, 12]).map((s) => s.slice(12)), ['···', 'ooo', 'ooo', 'ooo', 'ooo', 'ooo', 'ooo', 'ooo'])
  // 로비는 두 줄, 출입구는 맨 앞줄 돌출 안
  const lv8 = roomOf(8, 1)
  assert.equal(lv8.rows, 14 + 2)
  assert.deepEqual(lv8.entrance, { gx: 7, gy: 15 })
  assert.equal(kindAt(lv8, 7, 15), CellKind.Outdoor)
})

test('경계 분류: Lv.10 3층 ㄷ자 — 안쪽 벽은 날개의 뒤 변, 앞변은 바닥판 옆면', () => {
  const n = roomOf(10, 3)
  assert.deepEqual(countByKind(n), { outerWall: 32, innerWall: 4, slabSide: 36 })
  const inner = edgesOf(n).filter((e) => e.kind === 'innerWall')
  assert.deepEqual(
    inner.map((e) => [e.gx, e.gy, e.side]),
    [12, 13, 14, 15].map((y) => [11, y, 'x-']),
  )
})

test('경계 분류: Lv.17 4층 — 실내 뒤의 정원은 유리벽, 정원 뒤의 실내는 문턱, 바깥 가장자리는 난간', () => {
  const c = countByKind(roomOf(17, 4))
  assert.equal(c.glass, 3)
  assert.equal(c.sill, 13)
  assert.equal(c.rail, 16)
  const glass = edgesOf(roomOf(17, 4)).filter((e) => e.kind === 'glass')
  assert.deepEqual(
    glass.map((e) => [e.gx, e.gy, e.side]),
    [18, 19, 20].map((y) => [4, y, 'x-']),
  )
})

test('경계 분류: Lv.6 1층 — 테라스·현관 앞은 난간, 상자와 닿는 변은 문턱', () => {
  const c = countByKind(roomOf(6, 1))
  assert.equal(c.sill, 10)
  assert.equal(c.rail, 18)
  assert.equal(c.glass, undefined)
})

test('경계 분류: 정사각형 방은 뒤 두 변이 바깥 벽, 앞 두 변이 바닥판 옆면, 변이 겹쳐 나오지 않는다', () => {
  const sq: Room = { cols: 5, rows: 4 }
  assert.deepEqual(countByKind(sq), { outerWall: 9, slabSide: 9 })
  for (const lv of LEVELS)
    for (const f of [1, 2, 3, 4, 5]) {
      const keys = edgesOf(roomOf(lv, f)).map((e) => `${e.gx},${e.gy},${e.side}`)
      assert.equal(new Set(keys).size, keys.length, `Lv.${lv} ${f}층`)
    }
  assert.equal(edgesOf(sq), edgesOf(sq))
})

test('출입구는 늘 바닥 위, 모든 바닥 칸이 출입구에서 걸어서 닿는다 (회의실은 문으로)', () => {
  for (const lv of LEVELS)
    for (const f of floorsOf(lv)) {
      const room = roomOf(lv, f)
      const fixed = fixedTiles(lv, f)
      const door = fixed.find((t) => t.kind === 'entrance')!
      assert.ok(isInside(room, door.gx, door.gy), `Lv.${lv} ${f}층 출입구`)
      const m = buildWalkMap(room, [], fixed)
      const seen = reachable(m, door)
      for (let gy = 0; gy < room.rows; gy++) for (let gx = 0; gx < room.cols; gx++) if (isInside(room, gx, gy) && !m.blocked[gy * room.cols + gx]) assert.equal(seen[gy * room.cols + gx], 1, `Lv.${lv} ${f}층 (${gx},${gy})`)
    }
})

test('고정 칸: 회의실·계단은 상자 기준 같은 자리, 3층 ㄷ자 출입구는 안뜰 옆 바닥으로', () => {
  const [f1, f3] = [fixedTiles(10, 1), fixedTiles(10, 3)]
  const pick = (t: FixedTile[], kind: FixedTile['kind']) => t.filter((x) => x.kind === kind).map((x) => [x.gx, x.gy])
  assert.deepEqual(pick(f1, 'meeting'), pick(f3, 'meeting'))
  assert.deepEqual(pick(f1, 'stairs'), pick(f3, 'stairs'))
  assert.deepEqual(pick(f3, 'entrance'), [[11, 15]])
  // 회의실은 테라스가 아니라 상자 오른쪽 끝에 붙는다
  const m6 = fixedTiles(6, 1).filter((t) => t.kind === 'meeting' || t.kind === 'meetingDoor')
  assert.equal(Math.max(...m6.map((t) => t.gx)), 11)
})

test('놓기 검사: 깎인 자리는 바닥 밖, 야외 칸에는 놓을 수 있고 기본 자리는 깔리지 않는다', () => {
  const cut = canPlace({ level: 6, floor: 2, items: [] }, { itemId: 'prop-plant', gx: 9, gy: 9, rot: 0 })
  assert.deepEqual(cut.ok === false && cut.reason, 'out_of_bounds')
  assert.equal(canPlace({ level: 6, floor: 2, items: [] }, { itemId: 'prop-plant', gx: 7, gy: 7, rot: 0 }).ok, true)
  // 1층 테라스(Lv.6)에도 놓인다
  assert.equal(canPlace({ level: 6, floor: 1, items: [] }, { itemId: 'prop-plant', gx: 13, gy: 8, rot: 0 }).ok, true)
  const room = roomOf(8, 1)
  const autos = autoSeats({ level: 8, floor: 1, items: [] }, 400)
  assert.ok(autos.length > 0)
  for (const it of autos) assert.equal(kindAt(room, it.gx, it.gy), CellKind.Indoor, `${it.uid}`)
})

test('길: 유리벽은 문 없이도 막고, 야외에서 실내로 넘는 문턱은 건넌다', () => {
  const room = roomOf(17, 4)
  const m = buildWalkMap(room, [])
  // 실내 (4,19) → 정원 (3,19)는 바로 못 가고 문턱(3,18)을 돌아간다
  const path = findPath(m, { gx: 4, gy: 19 }, { gx: 3, gy: 19 })!
  assert.equal(path.length, 5)
  assert.ok(path.some((c) => c.gx === 3 && c.gy === 18))
  // 정원 (3,19) → 실내 (4,19) 반대로도 같다
  assert.equal(findPath(m, { gx: 3, gy: 19 }, { gx: 4, gy: 19 })!.length, 5)
  // 정원 앞 칸(4,17)에서 정원 위(3,17→3,18)로 들어가는 문턱은 한 걸음
  assert.equal(findPath(m, { gx: 3, gy: 17 }, { gx: 3, gy: 18 })!.length, 1)
})

test('구획 번호: 번호가 다른 방은 문 칸으로만 드나든다 (회의실 하나가 아니어도)', () => {
  const room: Room = { cols: 10, rows: 10 }
  const fixed: FixedTile[] = []
  for (let y = 0; y < 3; y++) for (let x = 7; x < 10; x++) fixed.push({ gx: x, gy: y, kind: x === 8 && y === 2 ? 'meetingDoor' : 'meeting', region: 2 })
  const m = buildWalkMap(room, [], fixed)
  assert.equal(m.region[0 * 10 + 8], 2)
  const path = findPath(m, { gx: 0, gy: 0 }, { gx: 9, gy: 0 })!
  assert.ok(path.some((c) => c.gx === 8 && c.gy === 2), '문 칸을 지난다')
  // 같은 구획 안은 벽 없이
  assert.equal(findPath(m, { gx: 7, gy: 0 }, { gx: 9, gy: 0 })!.length, 2)
  // 번호를 안 적은 회의실 칸은 예전처럼 구획 1
  const legacy = buildWalkMap(room, [], [{ gx: 9, gy: 0, kind: 'meeting' }])
  assert.equal(legacy.region[9], 1)
})
