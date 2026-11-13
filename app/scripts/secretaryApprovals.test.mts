import assert from 'node:assert/strict'
import test from 'node:test'
import { APPROVAL_CARDS_MAX, approvalCardIds } from '../src/main/secretaryApprovals.ts'

const a = (id: string, createdAt: number, questions?: unknown[]) => ({ id, createdAt, ...(questions ? { questions: questions as never } : {}) })

test('질문은 카드에서 빼고 오래된 순으로 담는다', () => {
  assert.deepEqual(approvalCardIds([a('b', 2), a('q', 1, [{}]), a('a', 0)]), ['a', 'b'])
})
test('최대 개수를 넘으면 오래된 것부터 자른다', () => {
  const many = Array.from({ length: APPROVAL_CARDS_MAX + 3 }, (_, i) => a(`id${i}`, i))
  const ids = approvalCardIds(many)
  assert.equal(ids.length, APPROVAL_CARDS_MAX)
  assert.equal(ids[0], 'id0')
})
test('결재가 없으면 빈 목록', () => {
  assert.deepEqual(approvalCardIds([]), [])
})
