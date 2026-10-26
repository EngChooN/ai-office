// 리드 멈춤 방지 자동 점검 판단 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasPromise, shouldNudgeLead, type LeadTurnState } from '../src/shared/leadNudge.ts'

const base: LeadTurnState = { isLeader: true, isAutoCheckTurn: false, isBusy: false, hasOpenDelegation: false, hasWaitingPlan: false, summary: '빌드는 김버전이 확인할 거예요.' }

test('앞으로 할 일을 약속하는 표현을 4개 언어로 감지한다', () => {
  for (const s of ['김버전이 확인할 거예요.', '테스트는 제가 돌릴게요', 'QA에게 맡길게요.', '나머지는 정리하겠습니다', '김버전에게 맡기겠습니다.', '내일 배포할 예정입니다', "I'll ask Kim to verify the build.", 'Kim will check the build.', 'ビルドは金さんに任せます。', '我会让小金确认构建。']) {
    assert.equal(hasPromise(s), true, s)
  }
})

test('완료 보고·추측·질문만 있는 보고는 약속으로 보지 않는다', () => {
  for (const s of ['빌드와 테스트를 모두 마쳤습니다.', '아마 이미 반영됐을 거예요.', 'A안과 B안 중 어느 쪽으로 진행할까요?', 'All tests passed.', 'ビルドが完了しました。', '构建已完成。']) {
    assert.equal(hasPromise(s), false, s)
  }
})

test('리드가 약속만 하고 맡긴 일·승인 대기 기획안이 없으면 다시 지시한다', () => {
  assert.equal(shouldNudgeLead(base), true)
})

test('진행 중이거나 대기 중인 위임, 승인 대기 기획안이 있으면 건너뛴다', () => {
  assert.equal(shouldNudgeLead({ ...base, hasOpenDelegation: true }), false)
  assert.equal(shouldNudgeLead({ ...base, hasWaitingPlan: true }), false)
  assert.equal(shouldNudgeLead({ ...base, isBusy: true }), false)
})

test('자동 점검으로 시작된 턴 뒤에는 다시 점검하지 않는다', () => {
  assert.equal(shouldNudgeLead({ ...base, isAutoCheckTurn: true }), false)
})

test('리드가 아니거나 약속 표현이 없으면 점검하지 않는다', () => {
  assert.equal(shouldNudgeLead({ ...base, isLeader: false }), false)
  assert.equal(shouldNudgeLead({ ...base, summary: '모두 끝냈습니다.' }), false)
})
