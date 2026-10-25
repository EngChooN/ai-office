// 회의실 배치표 (office-iso-spaces.md 1-5·3-4절): 정원 = 의자 수, 모든 레벨에서 평면 안, 의자·문이 출입구에서 닿는다
import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_LEVEL, meetingRoomOf } from '../src/shared/officeLevel.ts'
import { meetingLayoutOf, meetingLayoutOfTier, type MeetingTier } from '../src/shared/iso/meeting.ts'
import { isoLevelOf } from '../src/shared/iso/levels.ts'
import { roomOf } from '../src/shared/iso/levels.ts'
import { fixedTiles } from '../src/shared/iso/place.ts'
import { buildWalkMap, reachable } from '../src/shared/iso/path.ts'
import { isInside, boxOf } from '../src/shared/iso/grid.ts'

const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)
const floorsOf = (lv: number) => Array.from({ length: isoLevelOf(lv).floors }, (_, i) => i + 1)

test('단계별 크기·정원: 의자 수가 곧 정원이다', () => {
  const want: Record<MeetingTier, [number, number, number]> = { folding: [4, 4, 8], wood: [6, 4, 10], oak: [7, 4, 12], walnut: [8, 4, 14], board: [9, 4, 16], hall: [7, 7, 20] }
  for (const [tier, [w, d, cap]] of Object.entries(want) as [MeetingTier, number[]][]) {
    const l = meetingLayoutOfTier(tier)
    assert.deepEqual([l.w, l.d, l.capacity, l.seats.length], [w, d, cap, cap], tier)
  }
  assert.equal(meetingLayoutOfTier('hall').podium?.w, 5)
  assert.equal(meetingLayoutOfTier('folding').door, null)
  assert.deepEqual(meetingLayoutOfTier('oak').door, { gx: 3, gy: 3 })
})

test('의자는 테이블을 본다, 강당은 단상을 본다', () => {
  const oak = meetingLayoutOfTier('oak')
  for (const s of oak.seats) assert.equal(s.face, s.gy === 0 ? 0 : s.gy === 2 ? 2 : s.gx === 0 ? 3 : 1, `(${s.gx},${s.gy})`)
  assert.ok(meetingLayoutOfTier('hall').seats.every((s) => s.face === 2))
  assert.equal(meetingLayoutOfTier('hall').focus.y, 3)
})

test('모든 레벨·층에서 회의실이 평면 안에 들어가고, 의자·문이 출입구에서 걸어서 닿는다', () => {
  for (const lv of LEVELS) {
    const l = meetingLayoutOf(lv)
    assert.equal(l.capacity, meetingRoomOf(lv).capacity, `Lv.${lv} 정원`)
    for (const f of floorsOf(lv)) {
      const room = roomOf(lv, f)
      const fixed = fixedTiles(lv, f)
      const entrance = fixed.find((t) => t.kind === 'entrance')!
      const x0 = boxOf(room).cols - l.w
      for (let y = 0; y < l.d; y++) for (let x = 0; x < l.w; x++) assert.ok(isInside(room, x0 + x, y), `Lv.${lv} ${f}층 (${x0 + x},${y}) 바닥`)
      // 계단과 겹치지 않는다
      assert.ok(!fixed.some((t) => t.kind === 'stairs' && t.gx >= x0 && t.gy < l.d), `Lv.${lv} 계단`)
      const m = buildWalkMap(room, [], fixed)
      const seen = reachable(m, entrance)
      for (const s of l.seats) assert.equal(seen[(s.gy) * room.cols + x0 + s.gx], 1, `Lv.${lv} ${f}층 의자 (${s.gx},${s.gy})`)
      if (l.door) assert.equal(seen[l.door.gy * room.cols + x0 + l.door.gx], 1, `Lv.${lv} ${f}층 문`)
      for (const c of l.solid) assert.equal(m.blocked[c.gy * room.cols + x0 + c.gx], 1, `Lv.${lv} 테이블 칸`)
    }
  }
})
