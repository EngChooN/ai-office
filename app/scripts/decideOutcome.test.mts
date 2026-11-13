import assert from 'node:assert/strict'
import test from 'node:test'
import { decideOutcome } from '../src/renderer/features/secretary/decideOutcome.ts'

test('결재 카드: true 응답만 승인·반려, false 응답과 오류는 실패', async () => {
  assert.equal(await decideOutcome(() => true, true), 'approved')
  assert.equal(await decideOutcome(async () => true, false), 'rejected')
  assert.equal(await decideOutcome(() => false, true), 'failed')
  assert.equal(await decideOutcome(async () => { throw new Error('x') }, false), 'failed')
  assert.equal(await decideOutcome(() => undefined as unknown as boolean, true), 'failed')
})
