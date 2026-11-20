// 대화 찾기 공통 계산 (shared/chatFind.ts): 결과 사이 이동 · 비서 대화 찾기 (#18) — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findSecretaryHits, stepIndex } from '../src/shared/chatFind.ts'
import type { SecretaryMessage } from '../src/shared/types.ts'

const msg = (id: number, role: SecretaryMessage['role'], text: string, extra: Partial<SecretaryMessage> = {}): SecretaryMessage => ({ id, ts: id * 1000, role, text, ...extra })

test('결과 사이 이동: 다음·이전, 끝에서 처음으로·처음에서 끝으로 돌아가고 결과가 없으면 null', () => {
  assert.equal(stepIndex(0, 1, 3), 1)
  assert.equal(stepIndex(2, 1, 3), 0)
  assert.equal(stepIndex(0, -1, 3), 2)
  assert.equal(stepIndex(0, 1, 1), 0)
  assert.equal(stepIndex(0, 1, 0), null)
})

test('비서 대화 찾기: 내 말·비서 답·안내 글에서 대소문자 무시로 찾고 최근 것부터', () => {
  const messages = [msg(1, 'me', 'QA 일정 알려줘'), msg(2, 'secretary', '오큐에이의 qa 일정은 내일이에요'), msg(3, 'notice', '상한에 걸려 멈췄어요'), msg(4, 'me', '디자인 시안')]
  assert.deepEqual(findSecretaryHits(messages, 'qa'), [2, 1])
  assert.deepEqual(findSecretaryHits(messages, '  상한 '), [3])
  assert.deepEqual(findSecretaryHits(messages, '없는 말'), [])
})

test('비서 대화 찾기: 빈 말은 결과 없음, 확인 카드·결재 카드 답은 글이 보이지 않으므로 뺀다', () => {
  const card = { id: 'c1' } as unknown as SecretaryMessage['card']
  const messages = [msg(1, 'secretary', '채용 카드', { card }), msg(2, 'secretary', '채용 결재', { approvalIds: ['a1'] }), msg(3, 'secretary', '채용 안내')]
  assert.deepEqual(findSecretaryHits(messages, ''), [])
  assert.deepEqual(findSecretaryHits(messages, '   '), [])
  assert.deepEqual(findSecretaryHits(messages, '채용'), [3])
})
