// 회의 중 앉은 직원이 의자에 가려지지 않는지 · 막힌 의자는 건너뛰는지 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { artItem, artMeetingChair, isCameraBack, isSplitChair, MEETING_CHAIR, MEETING_LOW_BACK_TOP, seatHeight } from '../src/renderer/map/iso/isoArt.ts'
import { depthOrder, type IsoBox } from '../src/shared/iso/depth.ts'
import type { Rot } from '../src/shared/iso/furniture.ts'
import { meetingLayoutOfTier, meetingSeatFor } from '../src/shared/iso/meeting.ts'

test('회의실 의자: 좌석·등받이를 나눠 그려 앉은 직원 몸이 가려지지 않고, 막힌 의자는 건너뛴다', () => {
  for (const chair of Object.values(MEETING_CHAIR)) {
    // 가죽·메쉬·원목 의자는 가구 표의 의자가 아니라 한 장으로 그려져 직원을 덮었다
    assert.equal(isSplitChair(chair), true, chair)
    for (const r of [0, 1, 2, 3] as Rot[]) {
      const at = (role: 'seat' | 'back'): IsoBox => artItem(chair, r, role).box
      const seat = at('seat')
      const back = at('back')
      const sitter = { x: 0.32, y: 0.32, w: 0.36, d: 0.36, z: (seatHeight(chair) ?? 9) + 3, h: 24 }
      const order = depthOrder([back, sitter, seat])
      assert.ok(order.indexOf(seat) < order.indexOf(sitter), `${chair} r${r}: 좌석 위에 앉는다`)
      // 등받이가 뒤(−y·−x 쪽)에 있는 방향은 직원이 등받이 앞에 그려진다. 앞쪽(r1·r2)은 자연스럽게 겹쳐도 된다
      if (r === 0 || r === 3) assert.ok(order.indexOf(back) < order.indexOf(sitter), `${chair} r${r}: 등받이가 몸을 덮지 않는다`)
      // 회의실에선 앞쪽 등받이를 어깨 높이까지 낮춰, 등지고 앉은 직원의 머리·어깨가 보인다. 일반 의자 그림은 그대로
      const meetBack = artMeetingChair(chair, r, 'back').box
      if (isCameraBack(r)) assert.ok(meetBack.z + meetBack.h <= MEETING_LOW_BACK_TOP, `${chair} r${r}: 회의실 앞쪽 등받이는 낮다`)
      else assert.deepEqual(meetBack, back, `${chair} r${r}: 뒤쪽 등받이는 그대로`)
      assert.deepEqual(artMeetingChair(chair, r, 'seat').box, seat, `${chair} r${r}: 좌석은 그대로`)
    }
  }

  const l = meetingLayoutOfTier('board')
  const x0 = 8
  const all = () => true
  assert.deepEqual(meetingSeatFor(l, x0, 0, all), { ...l.seats[0], gx: x0 + l.seats[0].gx })
  // 첫 의자 칸이 파티션에 막히면 그 의자는 건너뛰고 다음 의자부터 앉는다
  const blocked = `${x0 + l.seats[0].gx},${l.seats[0].gy}`
  const isFree = (gx: number, gy: number) => `${gx},${gy}` !== blocked
  assert.deepEqual(meetingSeatFor(l, x0, 0, isFree), { ...l.seats[1], gx: x0 + l.seats[1].gx })
  assert.equal(meetingSeatFor(l, x0, l.capacity - 1, isFree), null, '의자가 모자라면 선다')
  assert.equal(meetingSeatFor(l, x0, -1, all), null)
})
