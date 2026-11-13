import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupByDay, matchesApprovalFilter, mergeNewer, prependRecord, shownResult } from '../src/shared/approvalHistory.ts'
import type { ApprovalRecord } from '../src/shared/types.ts'

const rec = (id: number, decidedAt: number, over: Partial<ApprovalRecord> = {}): ApprovalRecord => ({
  id, staffId: 's1', approvalId: `a${id}`, decidedAt, result: 'approved', actor: 'pc', toolName: 'Bash', summary: 'ls', ...over,
})

test('걸러보기: 자동은 자동결재·규칙, 나머지는 결과로', () => {
  assert.equal(matchesApprovalFilter(rec(1, 0, { actor: 'rule' }), 'auto'), true)
  assert.equal(matchesApprovalFilter(rec(1, 0, { actor: 'phone' }), 'auto'), false)
  assert.equal(matchesApprovalFilter(rec(1, 0, { result: 'rejected' }), 'rejected'), true)
  assert.equal(matchesApprovalFilter(rec(1, 0, { result: 'answered' }), 'approved'), false)
  assert.equal(matchesApprovalFilter(rec(1, 0, { result: 'canceled' }), 'all'), true)
})

test('자동 승인 줄은 결과를 자동으로 보인다', () => {
  assert.equal(shownResult(rec(1, 0, { actor: 'auto' })), 'auto')
  assert.equal(shownResult(rec(1, 0, { actor: 'auto', result: 'rejected' })), 'rejected')
  assert.equal(shownResult(rec(1, 0)), 'approved')
})

test('새 기록은 맨 앞에, 중복·걸러보기 밖은 그대로', () => {
  const list = [rec(2, 0)]
  assert.deepEqual(prependRecord(list, rec(3, 0), 'all').map((r) => r.id), [3, 2])
  assert.equal(prependRecord(list, rec(2, 0), 'all'), list)
  assert.equal(prependRecord(list, rec(3, 0, { result: 'rejected' }), 'approved'), list)
})

test("'승인' 걸러보기에 자동·규칙 승인은 섞지 않는다", () => {
  assert.equal(matchesApprovalFilter(rec(1, 0), 'approved'), true)
  assert.equal(matchesApprovalFilter(rec(1, 0, { actor: 'auto' }), 'approved'), false)
  assert.equal(matchesApprovalFilter(rec(1, 0, { actor: 'rule' }), 'approved'), false)
  assert.equal(matchesApprovalFilter(rec(1, 0, { actor: 'auto' }), 'auto'), true)
})

test('다시 받은 첫 쪽에서 새 기록만 앞에 붙이고 더 불러온 기록은 지킨다', () => {
  const list = [rec(5, 0), rec(4, 0), rec(1, 0)]
  assert.deepEqual(mergeNewer(list, [rec(7, 0), rec(6, 0), rec(5, 0), rec(4, 0)]).map((r) => r.id), [7, 6, 5, 4, 1])
  assert.equal(mergeNewer(list, [rec(5, 0), rec(4, 0)]), list)
  assert.deepEqual(mergeNewer([], [rec(2, 0)]).map((r) => r.id), [2])
})

test('날짜별로 묶고 순서를 지킨다', () => {
  const day1 = new Date(2026, 10, 13, 14).getTime()
  const day0 = new Date(2026, 10, 12, 18).getTime()
  const g = groupByDay([rec(3, day1), rec(2, day1 - 3600_000), rec(1, day0)])
  assert.equal(g.length, 2)
  assert.deepEqual(g[0].records.map((r) => r.id), [3, 2])
  assert.deepEqual(g[1].records.map((r) => r.id), [1])
})
