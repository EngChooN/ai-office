// 답한 결재 질문 저장·지난 결정으로 자동 답하기(엄격한 기준) 단위 테스트 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ASK_DECISION_MAX_AGE_MS, askDecisionInput, isSameQuestion, matchPastDecision, matchPastDecisions, parseAskDecision, sameAskDecisions } from '../src/shared/askDecision.ts'
import type { KnowledgeEntry } from '../src/shared/knowledge.ts'
import type { StaffQuestion } from '../src/shared/types.ts'
import { setLang } from '../src/shared/i18n/index.ts'

setLang('ko')

const NOW = 1_000 * ASK_DECISION_MAX_AGE_MS
const q = (question: string, labels: string[], multiSelect = false): StaffQuestion => ({ question, header: '', options: labels.map((label) => ({ label, description: '' })), multiSelect })
const saved = (id: string, question: StaffQuestion, answer: string, over: Partial<KnowledgeEntry> = {}): KnowledgeEntry => {
  const input = askDecisionInput(question, answer)
  return { id, kind: input.kind, title: input.title, body: input.body, tags: input.tags ?? [], staffId: 's1', staffName: '하나', docPath: null, createdAt: NOW - 1000, updatedAt: NOW - 1000, ...over }
}

const DEPLOY = q('배포 전에 스테이징 서버에서 먼저 확인할까요?', ['스테이징 먼저', '바로 배포'])

test('저장 모양: 결정·태그, 질문·답·선택지를 다시 읽는다', () => {
  const e = saved('a', DEPLOY, '스테이징 먼저')
  assert.equal(e.kind, 'decision')
  assert.deepEqual(parseAskDecision(e), { question: DEPLOY.question, answer: '스테이징 먼저', options: ['스테이징 먼저', '바로 배포'] })
  // 태그가 없거나(회의 결정) 모양이 깨졌으면 읽지 않는다
  assert.equal(parseAskDecision({ ...e, tags: [] }), null)
  assert.equal(parseAskDecision({ ...e, body: '아무 글' }), null)
})

test('같은 질문: 글자가 같거나 낱말이 거의 겹칠 때만', () => {
  assert.equal(isSameQuestion('배포 전에 스테이징 서버에서 먼저 확인할까요?', '배포 전에  스테이징 서버에서 먼저 확인할까요'), true)
  assert.equal(isSameQuestion('배포 전에 스테이징 서버에서 먼저 확인할까요?', '배포 전에 운영 서버에서 먼저 확인할까요?'), false)
  // 짧은 질문은 글자가 똑같아야 한다
  assert.equal(isSameQuestion('지울까요?', '안 지울까요?'), false)
})

test('자동 답: 같은 질문·같은 선택지·최근이면 지금 선택지 이름으로 답한다', () => {
  const m = matchPastDecision([saved('a', DEPLOY, '스테이징 먼저')], q(DEPLOY.question, ['바로 배포', '스테이징 먼저']), NOW)
  assert.equal(m?.answer, '스테이징 먼저')
  assert.equal(m?.staffName, '하나')
})

test('자동 답 안 함: 오래됨·선택지 다름·선택지 밖 답·답이 엇갈림', () => {
  assert.equal(matchPastDecision([saved('a', DEPLOY, '스테이징 먼저', { updatedAt: NOW - ASK_DECISION_MAX_AGE_MS - 1 })], DEPLOY, NOW), null)
  assert.equal(matchPastDecision([saved('a', DEPLOY, '스테이징 먼저')], q(DEPLOY.question, ['스테이징 먼저', '바로 배포', '보류']), NOW), null)
  assert.equal(matchPastDecision([saved('a', DEPLOY, '내일 다시 물어봐')], DEPLOY, NOW), null)
  assert.equal(matchPastDecision([saved('a', DEPLOY, '스테이징 먼저'), saved('b', DEPLOY, '바로 배포')], DEPLOY, NOW), null)
  // 여러 개 못 고르는 질문에 여러 개 답은 따르지 않는다
  assert.equal(matchPastDecision([saved('a', DEPLOY, '스테이징 먼저, 바로 배포')], DEPLOY, NOW), null)
})

test('여러 개 고르기·질문 묶음: 전부 맞아야 답한다', () => {
  const multi = q('이번 릴리즈에 넣을 플랫폼을 모두 골라 주세요', ['맥', '윈도우', '안드로이드'], true)
  const list = [saved('a', DEPLOY, '스테이징 먼저'), saved('m', multi, '맥, 안드로이드')]
  const all = matchPastDecisions(list, [DEPLOY, multi], NOW)
  assert.deepEqual(
    all?.map((x) => [x.question, x.match.answer]),
    [
      [DEPLOY.question, '스테이징 먼저'],
      [multi.question, '맥, 안드로이드'],
    ],
  )
  assert.equal(matchPastDecisions(list, [DEPLOY, q('새 질문인데 처음 보는 내용입니다', ['예', '아니요'])], NOW), null)
})

test('같은 질문의 예전 결정 찾기 (새 답을 남기기 전에 지울 것)', () => {
  const other = q('테스트를 먼저 돌릴까요 아니면 바로 커밋할까요?', ['테스트', '커밋'])
  const list = [saved('a', DEPLOY, '바로 배포', { updatedAt: 0 }), saved('b', other, '테스트')]
  assert.deepEqual(
    sameAskDecisions(list, DEPLOY).map((e) => e.id),
    ['a'],
  )
})
