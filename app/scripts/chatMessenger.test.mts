// 대화방 메신저 기능: 예약·반복 보낼 차례·놓친 예약, 안 읽은 수, 진행 정보의 대화 메시지 id
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { expireMissed, isReservationDue, reservationDay, settleMissedOnStart } from '../src/shared/chatReservations.ts'
import { firstUnread, markSeen, roomsWithPendingApproval, unreadByRoom } from '../src/shared/chatUnread.ts'
import { buildStaffProgress } from '../src/shared/staffProgress.ts'
import { OFFICE_SENDER } from '../src/shared/mention.ts'
import type { ChatMessage, ChatReservation } from '../src/shared/types.ts'

const base = { text: '@이리드 정리해 줘', room: null, enabled: true, lastRunDate: null, sentCount: 0, createdAt: 0 }
const once = (at: number, extra: Partial<ChatReservation> = {}): ChatReservation => ({ id: 'o', kind: 'once', at, ...base, ...extra })
const repeat = (time: string, weekdays: number[], extra: Partial<ChatReservation> = {}): ChatReservation => ({ id: 'r', kind: 'repeat', time, weekdays, ...base, ...extra })
// 2026-11-09 월요일 09:30
const mon930 = new Date(2026, 10, 9, 9, 30)

test('한 번 예약: 시각이 되면 보낼 차례, 꺼 두었거나 놓친 것은 아니다', () => {
  assert.equal(isReservationDue(once(mon930.getTime() - 1), mon930), true)
  assert.equal(isReservationDue(once(mon930.getTime() + 60_000), mon930), false)
  assert.equal(isReservationDue(once(0, { enabled: false }), mon930), false)
  assert.equal(isReservationDue(once(0, { isMissed: true }), mon930), false)
})

test('반복 예약: 그 요일 그 시각이 지났고 오늘 아직 안 보냈을 때만', () => {
  assert.equal(isReservationDue(repeat('09:00', [1]), mon930), true)
  assert.equal(isReservationDue(repeat('10:00', [1]), mon930), false)
  assert.equal(isReservationDue(repeat('09:00', [2]), mon930), false)
  assert.equal(isReservationDue(repeat('09:00', [1], { lastRunDate: reservationDay(mon930) }), mon930), false)
})

test('앱을 켰을 때: 지난 예약은 바로 보내지 않고 놓침으로 표시한다', () => {
  const list = [once(mon930.getTime() - 3_600_000), repeat('09:00', [1]), repeat('18:00', [1])]
  const changed = settleMissedOnStart(list, mon930)
  assert.equal(changed.length, 2)
  assert.ok(changed.every((r) => r.isMissed))
  assert.equal(changed[0].missedAt, mon930.getTime() - 3_600_000)
  assert.equal(changed[1].missedAt, new Date(2026, 10, 9, 9, 0).getTime())
})

test('놓친 반복 예약은 다음 날이 되면 풀려 평소처럼 보낸다 (한 번 예약은 대표가 고를 때까지 남는다)', () => {
  const missed = repeat('09:00', [1, 2], { isMissed: true, missedAt: new Date(2026, 10, 9, 9, 0).getTime() })
  assert.equal(expireMissed(missed, mon930), null)
  const tue = new Date(2026, 10, 10, 8, 0)
  assert.equal(expireMissed(missed, tue)?.isMissed, false)
  assert.equal(settleMissedOnStart([missed], tue)[0].isMissed, false)
  assert.equal(expireMissed(once(0, { isMissed: true, missedAt: 0 }), tue), null)
})

const msg = (id: number, from: string, room?: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, ts: id, from, text: '', ...(room ? { room } : {}), ...extra })

test('안 읽은 수: 직원 글만 방별로, 기록이 없는 방은 처음 켤 때의 자리부터 센다', () => {
  const chat = [msg(1, 's1'), msg(2, 'me'), msg(3, 's1', 'lab:a'), msg(4, OFFICE_SENDER, 'lab:a'), msg(5, 's2', 'lab:a'), msg(6, 's1')]
  const seen = { baseline: 2, rooms: { '': 5 } }
  assert.deepEqual(unreadByRoom(chat, seen), { '': 1, 'lab:a': 2 })
  const next = markSeen(seen, 'lab:a', 5)
  assert.deepEqual(unreadByRoom(chat, next), { '': 1 })
  assert.equal(markSeen(next, 'lab:a', 3), next, '뒤로 가지 않는다')
  assert.deepEqual(firstUnread(chat, 'lab:a', 2), { id: 3, count: 2 })
  assert.equal(firstUnread(chat, 'lab:a', 5), null)
})

test('결재·질문이 아직 기다리는 말풍선이 있는 방만 노란 점', () => {
  const chat = [msg(1, 's1', 'lab:a', { approval: { id: 'a1' } }), msg(2, 's1', 't1', { approval: { id: 'a2', result: 'approved' } }), msg(3, 's1', undefined, { approval: { id: 'a3' } })]
  assert.deepEqual([...roomsWithPendingApproval(chat, new Set(['a1', 'a2']))], ['lab:a'])
})

test('진행 정보: 받은 일 중 대화방 메시지 id (맨 앞 = 지금 하는 것)', () => {
  const p = buildStaffProgress({ status: 'working', origins: [{ text: '보드 카드' }, { text: '대화', chatId: 7 }, { text: '대화2', chatId: 9 }], queued: 2, hasApproval: false })
  assert.deepEqual(p?.chatIds, [7, 9])
  assert.equal(p?.chatId, undefined, '지금 하는 일은 대화 지시가 아니다')
  const q = buildStaffProgress({ status: 'working', origins: [{ text: '대화', chatId: 7 }], queued: 0, hasApproval: false })
  assert.equal(q?.chatId, 7)
  const r = buildStaffProgress({ status: 'working', origins: [{ text: '보드 카드' }], queued: 0, hasApproval: false })
  assert.equal(r && 'chatIds' in r, false, '대화 지시가 없으면 칸을 만들지 않는다')
})
