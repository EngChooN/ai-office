// 단체방 결재·질문 말풍선 상태 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answersText, chatApprovalView } from '../src/shared/chatApproval.ts'
import type { Approval } from '../src/shared/types.ts'

const approval: Approval = { id: 'a1', staffId: 's1', toolName: 'Bash', summary: 'npm test', createdAt: 0 }

test('결과가 남아 있으면 아직 기다리는 결재가 있어도 결과를 보여 준다', () => {
  assert.deepEqual(chatApprovalView({ id: 'a1', result: 'approved' }, approval), { kind: 'done', result: 'approved', answer: undefined })
  assert.deepEqual(chatApprovalView({ id: 'a1', result: 'answered', answer: 'A안' }, undefined), { kind: 'done', result: 'answered', answer: 'A안' })
})

test('결과가 없고 기다리는 중이면 버튼, 사라졌으면 결과 모름(처리됨)', () => {
  assert.deepEqual(chatApprovalView({ id: 'a1' }, approval), { kind: 'pending', approval })
  assert.deepEqual(chatApprovalView({ id: 'a1' }, undefined), { kind: 'done' })
})

test('질문 답은 하나면 답만, 여럿이면 "질문 → 답" 을 / 로 잇는다', () => {
  assert.equal(answersText({ '어느 안?': 'A안' }), 'A안')
  assert.equal(answersText({ 'Q1': 'A', 'Q2': 'B' }), 'Q1 → A / Q2 → B')
})
