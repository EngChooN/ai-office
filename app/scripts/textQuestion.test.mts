// 글로 쓴 질문 감지 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectTextQuestion } from '../src/shared/textQuestion.ts'

test('질문으로 끝난 글은 질문으로 본다 (4개 언어)', () => {
  for (const s of ['작업을 마쳤어요.\n\nA안과 B안 중 어느 쪽으로 진행할까요?', 'DB를 지워도 되나요?', 'Which approach should I take?', 'どちらで進めますか？', '要继续吗？']) {
    assert.ok(detectTextQuestion(s), s)
  }
})

test('목록 선택지를 뽑는다 (질문 앞·뒤)', () => {
  assert.deepEqual(detectTextQuestion('어느 쪽으로 할까요?\n1. 빠른 길\n2. 안전한 길')?.options, ['빠른 길', '안전한 길'])
  assert.deepEqual(detectTextQuestion('- 빠른 길\n- 안전한 길\n\n어느 쪽으로 할까요?')?.options, ['빠른 길', '안전한 길'])
  assert.deepEqual(detectTextQuestion('어떻게 할까요?')?.options, [])
})

test('완료 보고·맺음 인사·코드 속 물음표는 질문이 아니다', () => {
  for (const s of ['모두 끝냈습니다.', '끝냈어요. 더 필요한 게 있으면 말씀해 주세요.', '끝냈어요. 추가로 필요한 게 있을까요?', 'Done. Anything else I can help with?', '```\nconst a = b ? 1 : 2\n```\n완료했습니다.', '왜 실패했는지 확인했어요? 원인은 캐시였고 고쳤습니다.']) {
    assert.equal(detectTextQuestion(s), null, s)
  }
})
