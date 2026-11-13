// 데스크톱 단체방 방 목록 자동 접힘·직원 줄 요약·띠 머리 글자 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chatWidthOf, roomInitial, roomListMode, summarizeRoomPeople } from '../src/shared/chatRoomLayout.ts'

test('자동: 행 폭 840 미만이면 띠, 이상이면 목록', () => {
  assert.equal(roomListMode(839, 'auto', 'list'), 'rail')
  assert.equal(roomListMode(840, 'auto', 'list'), 'list')
  assert.equal(roomListMode(1400, 'auto', 'list'), 'list')
})

test('자동: 띠에서 다시 펴려면 856 이상 (16px 여유)', () => {
  assert.equal(roomListMode(840, 'auto', 'rail'), 'rail')
  assert.equal(roomListMode(855, 'auto', 'rail'), 'rail')
  assert.equal(roomListMode(856, 'auto', 'rail'), 'list')
})

test('고정·직접 접음은 폭과 상관없이 우선', () => {
  assert.equal(roomListMode(500, 'open', 'rail'), 'list')
  assert.equal(roomListMode(2000, 'rail', 'list'), 'rail')
})

test('대화 칸 폭 = 행 폭 − 목록(200) 또는 띠(56)', () => {
  assert.equal(chatWidthOf(1000, 'list'), 800)
  assert.equal(chatWidthOf(700, 'rail'), 644)
})

test('직원 줄 요약: 전체 수와 일하는 사람 수', () => {
  assert.deepEqual(summarizeRoomPeople([{ status: 'working' }, { status: 'idle' }, { status: 'waiting' }, { status: 'working' }]), { total: 4, working: 2 })
  assert.deepEqual(summarizeRoomPeople([]), { total: 0, working: 0 })
})

test('머리 글자: 영문 대문자 2자는 2자, 나머지는 첫 글자', () => {
  assert.equal(roomInitial('프론트엔드 팀'), '프')
  assert.equal(roomInitial('QA 팀'), 'QA')
  assert.equal(roomInitial('PO'), 'PO')
  assert.equal(roomInitial('Design'), 'D')
  assert.equal(roomInitial('  디자인'), '디')
  assert.equal(roomInitial(''), '')
})
