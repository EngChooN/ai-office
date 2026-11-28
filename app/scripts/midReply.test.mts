// 중간 글 합치기·최종 보고 겹침·'쓰는 중' 이름 규칙 (순수 함수)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canMerge, finishPlan, MID_SHORT_MAX, stripPosted, typingNames, type MidBubble } from '../src/shared/midReply.ts'

const bubble = (pieces: string[], room = 'r', chatId = 1): MidBubble => ({ chatId, room, pieces })

test('합치기: 같은 방·방의 마지막 메시지·둘 다 짧을 때만', () => {
  assert.equal(canMerge(bubble(['찾아볼게요']), 'r', 1, '읽었어요'), true)
  assert.equal(canMerge(undefined, 'r', 1, '읽었어요'), false)
  assert.equal(canMerge(bubble(['찾아볼게요']), 'other', 1, '읽었어요'), false, '다른 방')
  assert.equal(canMerge(bubble(['찾아볼게요']), 'r', 2, '읽었어요'), false, '사이에 다른 글')
  assert.equal(canMerge(bubble(['찾아볼게요']), 'r', 1, 'x'.repeat(MID_SHORT_MAX + 1)), false, '새 글이 길다')
  assert.equal(canMerge(bubble(['x'.repeat(MID_SHORT_MAX + 1)]), 'r', 1, '짧음'), false, '직전 조각이 길다')
  assert.equal(canMerge(bubble(Array(9).fill('y'.repeat(70))), 'r', 1, '짧음'), false, '합치면 너무 길다')
})

test('최종 보고 맞추기: 같으면 보고로 바꾸고, 이어 붙인 끝 조각이면 떼어 내고, 다르면 새로', () => {
  assert.deepEqual(finishPlan(bubble(['끝났어요']), 'r', ' 끝났어요\n'), { kind: 'promote' })
  assert.deepEqual(finishPlan(bubble(['찾아볼게요', '끝났어요']), 'r', '끝났어요'), { kind: 'trim', text: '찾아볼게요' })
  assert.deepEqual(finishPlan(bubble(['찾아볼게요', '끝났어요']), 'r', '찾아볼게요\n끝났어요'), { kind: 'promote' })
  assert.deepEqual(finishPlan(bubble(['중간 글']), 'r', '다른 최종 보고'), { kind: 'post', text: '다른 최종 보고' })
  assert.deepEqual(finishPlan(bubble(['끝났어요']), 'other', '끝났어요'), { kind: 'post', text: '끝났어요' }, '다른 방 보고는 새로')
  assert.deepEqual(finishPlan(undefined, 'r', '끝났어요'), { kind: 'post', text: '끝났어요' })
  assert.deepEqual(finishPlan(bubble(['끝났어요']), 'r', ''), { kind: 'post', text: '' }, '빈 보고는 기본 문구로 새로')
  // Codex처럼 턴의 글을 이어 붙인 보고: 이미 올린 앞부분을 떼고 새 부분만, 남은 게 마지막 말풍선이면 보고로 바꾼다
  assert.deepEqual(finishPlan(undefined, 'r', '문단1\n\n문단2\n\n정리: 끝', ['확인할게요', '문단1']), { kind: 'post', text: '문단2\n\n정리: 끝' })
  assert.deepEqual(finishPlan(bubble(['문단2']), 'r', '문단1\n\n문단2', ['문단1', '문단2']), { kind: 'promote' })
})

test("'쓰는 중' 이름: 3명까지 보이고 나머지는 수로", () => {
  assert.deepEqual(typingNames(['가']), { shown: ['가'], rest: 0 })
  assert.deepEqual(typingNames(['가', '나', '다', '라', '마']), { shown: ['가', '나', '다'], rest: 2 })
})

test('이미 올린 앞부분 떼기: 순서대로 앞에서만, 다 떼면 원문 그대로', () => {
  assert.equal(stripPosted('가\n나\n다', ['가', '나']), '다')
  assert.equal(stripPosted('나\n다', ['가', '나']), '다', '앞 글이 빠졌어도 다음 글부터')
  assert.equal(stripPosted('가', ['가']), '가', '전부 같으면 그대로')
  assert.equal(stripPosted('다\n가', ['가']), '다\n가', '중간에 있는 글은 안 뗀다')
})
