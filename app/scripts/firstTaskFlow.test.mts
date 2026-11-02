// 첫 실행 안내 갈림길: 실패 종류별 버튼 표·오류 원문 접기·연습 고르기 생략 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FAIL_ACTIONS, shouldOfferPractice, showsErrorDetail } from '../src/renderer/lib/firstTaskFlow.ts'

test('첫 업무 실패: 종류에 맞는 버튼만 보인다', () => {
  assert.deepEqual(FAIL_ACTIONS.login, ['toLogin'])
  assert.deepEqual(FAIL_ACTIONS.limit, [], '한도는 안내만')
  assert.deepEqual(FAIL_ACTIONS.network, ['retry'])
  assert.deepEqual(FAIL_ACTIONS.unknown, ['retry'])
  // 시간 초과: 추천은 직원 패널에서 이어 보기
  assert.equal(FAIL_ACTIONS.timeout[0], 'openStaff')
  assert.ok(FAIL_ACTIONS.timeout.includes('practice'))
  // 로그인 문제가 아닌 실패에는 로그인 버튼을 두지 않는다
  for (const fail of ['limit', 'network', 'unknown', 'timeout'] as const) assert.ok(!FAIL_ACTIONS[fail].includes('toLogin'), fail)
})

test('첫 업무 실패: 원인을 모르는 실패만 오류 원문을 접어 둔다', () => {
  assert.equal(showsErrorDetail('unknown'), true)
  for (const fail of ['login', 'limit', 'network', 'timeout'] as const) assert.equal(showsErrorDetail(fail), false, fail)
})

test('둘러보기 뒤 연습 고르기: 실제 업무를 해 본 직원이 있으면 생략한다', () => {
  const hired = { kind: 'hired', tokensIn: 0, tokensOut: 0 }
  assert.equal(shouldOfferPractice([]), true)
  assert.equal(shouldOfferPractice([hired]), true, '고용만 하고 일은 안 함')
  assert.equal(shouldOfferPractice([{ ...hired, tokensIn: 120, tokensOut: 30 }]), false)
  assert.equal(shouldOfferPractice([{ ...hired, tokensIn: 120, isPractice: true }]), true, '연습 회사 직원은 세지 않는다')
  assert.equal(shouldOfferPractice([{ kind: 'external', tokensIn: 500, tokensOut: 0 }]), true, '외부 직원은 세지 않는다')
})
