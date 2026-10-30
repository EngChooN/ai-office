// 직원 카드의 안 읽은 보고 개수: 늘리기·읽음 처리·깨진 값·배지 글자 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addUnread, clearUnread, unreadLabel, unreadOf, UNREAD_BADGE_MAX } from '../src/shared/unreadReports.ts'

test('보고가 올 때마다 그 직원만 1씩 는다', () => {
  let m = addUnread({}, 'a')
  m = addUnread(m, 'a')
  m = addUnread(m, 'b')
  assert.deepEqual(m, { a: 2, b: 1 })
})

test('늘릴 때 원래 객체는 그대로 둔다', () => {
  const m = { a: 1 }
  addUnread(m, 'a')
  assert.deepEqual(m, { a: 1 })
})

test('패널을 열면 그 직원만 0이 된다', () => {
  const m = clearUnread({ a: 3, b: 1 }, 'a')
  assert.deepEqual(m, { b: 1 })
  assert.equal(unreadOf(m, 'a'), 0)
})

test('읽을 게 없으면 같은 객체를 돌려준다 (저장 건너뛰기)', () => {
  const m = { b: 1 }
  assert.equal(clearUnread(m, 'a'), m)
})

test('깨진 저장값은 0으로, 소수는 내려서 읽는다', () => {
  const m = { a: -2, b: Number.NaN, c: 2.7, d: 'x' as unknown as number }
  assert.equal(unreadOf(m, 'a'), 0)
  assert.equal(unreadOf(m, 'b'), 0)
  assert.equal(unreadOf(m, 'c'), 2)
  assert.equal(unreadOf(m, 'd'), 0)
  assert.equal(unreadOf(m, 'none'), 0)
  assert.deepEqual(addUnread(m, 'a').a, 1)
})

test('배지 글자: 0이면 숨기고, 너무 크면 99+', () => {
  assert.equal(unreadLabel(0), '')
  assert.equal(unreadLabel(3), '3')
  assert.equal(unreadLabel(UNREAD_BADGE_MAX), '99')
  assert.equal(unreadLabel(UNREAD_BADGE_MAX + 1), '99+')
})
