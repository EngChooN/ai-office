// 결재함 결재 저장·복원: 저장 → 다시 켜면 복원, 승인·반려·답 지시, 1회 자동 허용

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ONE_SHOT_ALLOW_TTL_MS, OneShotAllow, PENDING_APPROVAL_MAX_AGE_MS, isPersistable, restoredInstruction, splitRestorable, toPending, toRestoredApproval, withPending, withoutPending } from '../src/main/pendingApprovals.ts'
import type { Approval } from '../src/shared/types.ts'

const NOW = 1_800_000_000_000
const tool: Approval = { id: 's1:a', staffId: 's1', toolName: 'Bash', summary: 'pnpm build', createdAt: NOW - 1000 }
const ask: Approval = { id: 's1:q', staffId: 's1', toolName: 'AskUserQuestion', summary: '어느 쪽?', createdAt: NOW - 1000, questions: [{ question: '어느 쪽?', header: 'h', options: [{ label: 'A', description: '' }], multiSelect: false }] }

test('저장하고 다시 켜면 결재함에 복원된다 (JSON 저장 왕복)', () => {
  let store = withPending([], toPending(tool, 't1'))
  store = withPending(store, toPending(ask, null))
  const reloaded = JSON.parse(JSON.stringify(store))
  const { restore, expired, gone } = splitRestorable(reloaded, NOW, (id) => id === 's1')
  assert.equal(restore.length, 2)
  assert.deepEqual([expired.length, gone.length], [0, 0])
  const card = toRestoredApproval(restore[0])
  assert.equal(card.isRestored, true)
  assert.equal(card.toolName, 'Bash')
  assert.equal(restore[0].taskId, 't1')
  assert.equal(toRestoredApproval(restore[1]).questions?.length, 1)
})

test('닫히면 저장본이 지워진다', () => {
  const store = withPending([], toPending(tool, null))
  assert.equal(withoutPending(store, tool.id).length, 0)
  assert.equal(withoutPending(store, 'none'), store)
})

test('7일 지난 결재와 퇴사한 직원의 결재는 복원하지 않는다', () => {
  const old = toPending({ ...tool, id: 'old', createdAt: NOW - PENDING_APPROVAL_MAX_AGE_MS - 1 }, null)
  const other = toPending({ ...tool, id: 'x', staffId: 's2' }, null)
  const r = splitRestorable([old, other, toPending(tool, null)], NOW, (id) => id === 's1')
  assert.deepEqual([r.restore.length, r.expired.map((p) => p.id), r.gone.map((p) => p.id)], [1, ['old'], ['x']])
})

test('중계·다른 PC 결재는 저장 대상이 아니다', () => {
  assert.equal(isPersistable(tool), true)
  assert.equal(isPersistable({ id: 'p', toolName: 'PeerChanges' }), false)
})

test('승인·반려·답 지시가 나간다', () => {
  const p = toPending(tool, null)
  const ok = restoredInstruction(p, { allow: true })
  const no = restoredInstruction(p, { allow: false })
  assert.match(ok!, /Bash/)
  assert.match(ok!, /pnpm build/)
  assert.notEqual(ok, no)
  const a = restoredInstruction(toPending(ask, null), { answers: { '어느 쪽?': 'A' } })
  assert.match(a!, /어느 쪽\?/)
  assert.match(a!, /A/)
  assert.equal(restoredInstruction(p, null), null)
})

test('1회 자동 허용은 한 번만 통한다', () => {
  const g = new OneShotAllow()
  g.grant('s1', 'Bash', 'pnpm build', NOW)
  assert.equal(g.take('s1', 'Bash', 'pnpm test', NOW), false)
  assert.equal(g.take('s2', 'Bash', 'pnpm build', NOW), false)
  assert.equal(g.take('s1', 'Bash', 'pnpm build', NOW + 1), true)
  assert.equal(g.take('s1', 'Bash', 'pnpm build', NOW + 2), false)
})

test('1회 자동 허용은 직원의 일이 끝나 거두면 쓸 수 없다', () => {
  const g = new OneShotAllow()
  g.grant('s1', 'Bash', 'ls', NOW)
  g.grant('s2', 'Bash', 'ls', NOW)
  g.revoke('s1')
  assert.equal(g.take('s1', 'Bash', 'ls', NOW + 1), false)
  assert.equal(g.take('s2', 'Bash', 'ls', NOW + 1), true)
})

test('1회 자동 허용은 유효 시간이 지나면 쓸 수 없다', () => {
  const g = new OneShotAllow()
  g.grant('s1', 'Bash', 'ls', NOW)
  assert.equal(g.take('s1', 'Bash', 'ls', NOW + ONE_SHOT_ALLOW_TTL_MS + 1), false)
})
