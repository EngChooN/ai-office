import assert from 'node:assert/strict'
import test from 'node:test'
import { BRIEF_GAP_MS, briefCounts, briefDue, briefText, isBriefEmpty } from '../src/main/secretaryBrief.ts'

const now = new Date('2026-11-13T08:00:00').getTime()
const base = { isEnabled: true, now, seenAt: now - BRIEF_GAP_MS - 1, isFirstOpenThisRun: false }

test('6시간 넘게 비웠을 때만 띄운다', () => {
  assert.equal(briefDue(base), true)
  assert.equal(briefDue({ ...base, seenAt: now - BRIEF_GAP_MS + 60_000 }), false)
})
test('앱을 새로 켠 뒤 첫 열기는 6시간 미만이어도 판정을 통과한다', () => {
  assert.equal(briefDue({ ...base, seenAt: now - 1000, isFirstOpenThisRun: true }), true)
})
test('꺼져 있거나 처음 연 것이면 안 띄운다', () => {
  assert.equal(briefDue({ ...base, isEnabled: false }), false)
  assert.equal(briefDue({ ...base, seenAt: null, isFirstOpenThisRun: true }), false)
})

const snap = (over: object = {}) =>
  ({
    tasks: [
      { updatedAt: 200, status: 'done' },
      { updatedAt: 100, status: 'done' },
      { updatedAt: 300, status: 'review' },
      { updatedAt: 300, status: 'todo' },
    ],
    staff: [
      { kind: 'hired', status: 'error', approvals: [{ id: 'a' }, { id: 'q', questions: [{}] }] },
      { kind: 'hired', status: 'idle', approvals: [{ id: 'b' }] },
      { kind: 'external', status: 'error', approvals: [] },
    ],
    ...over,
  }) as never

test('숫자: 끝난 업무(검토 대기 포함)·질문 뺀 결재·오류 직원', () => {
  assert.deepEqual(briefCounts(snap(), 150), { done: 2, approvals: 2, errors: 1 })
})
test('아무것도 없으면 빈 것으로', () => {
  assert.equal(isBriefEmpty(briefCounts({ tasks: [], staff: [] }, 0)), true)
})
test('문장: 0인 항목은 빼고, 오전 + 오래 비움이면 아침 인사', () => {
  const s = briefText({ done: 3, approvals: 0, errors: 1 }, now, BRIEF_GAP_MS)
  assert.match(s, /3/)
  assert.match(s, /1/)
  assert.doesNotMatch(s, /0/)
  assert.notEqual(s, briefText({ done: 3, approvals: 0, errors: 1 }, now, 1000))
})
