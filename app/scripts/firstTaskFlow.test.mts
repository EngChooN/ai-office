// 첫 실행 안내 갈림길: 실패 종류별 버튼 표·오류 원문 접기·연습 고르기 생략 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FAIL_ACTIONS, loginGate, shouldOfferPractice, showsErrorDetail } from '../src/renderer/lib/firstTaskFlow.ts'

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

test('로그인 단계: Claude·Codex 중 하나만 준비돼도 통과, 둘 다 안 되면 막고 둘러보기로', () => {
  const st = (claude: string, codex: string) => ({ claude: { state: claude }, codex: { state: codex } })
  const pass = { isChecking: false, isOk: true, isBlocked: false }
  // Claude만
  assert.deepEqual(loginGate(true, st('ready', 'missing')), { ...pass, isBothReady: false, taskProvider: 'claude' })
  // Codex만 (Claude 로그아웃)
  assert.deepEqual(loginGate(false, st('loggedOut', 'ready')), { ...pass, isBothReady: false, taskProvider: 'codex' })
  // 둘 다 — 첫 업무는 Claude
  assert.deepEqual(loginGate(true, st('ready', 'ready')), { ...pass, isBothReady: true, taskProvider: 'claude' })
  // 둘 다 안 됨
  const blocked = { isChecking: false, isOk: false, isBlocked: true, isBothReady: false, taskProvider: null }
  assert.deepEqual(loginGate(false, st('loggedOut', 'missing')), blocked)
  assert.deepEqual(loginGate(false, st('missing', 'loggedOut')), blocked)
})

test('로그인 단계: 두 결과가 다 오기 전에는 확인 중 — 막힘으로 판단하지 않는다', () => {
  const checking = { isChecking: true, isOk: false, isBlocked: false, isBothReady: false, taskProvider: null }
  assert.deepEqual(loginGate(null, null), checking)
  assert.deepEqual(loginGate(false, null), checking)
  assert.deepEqual(loginGate(null, { claude: { state: 'loggedOut' }, codex: { state: 'missing' } }), checking)
  // 한쪽 결과만으로도 준비됨은 알 수 있다 (버튼은 확인 중이라 화면에서 막힌다)
  assert.equal(loginGate(true, null).isOk, true)
})

test('로그인 단계: claudeStatus와 공급자 조회 중 한쪽만 Claude 준비를 알려도 통과', () => {
  assert.equal(loginGate(false, { claude: { state: 'ready' }, codex: { state: 'missing' } }).isOk, true)
  assert.equal(loginGate(true, { claude: { state: 'loggedOut' }, codex: { state: 'missing' } }).isOk, true)
})

test('로그인 단계: 통과시킨 쪽과 첫 업무 공급자가 어긋나지 않는다', () => {
  // claudeStatus는 로그아웃인데 공급자 조회가 Claude 준비라고 해 통과했다면, 첫 업무도 Claude로 (예전엔 공급자가 없어 막혔다)
  const onlyProviders = loginGate(false, { claude: { state: 'ready' }, codex: { state: 'missing' } })
  assert.equal(onlyProviders.taskProvider, 'claude')
  assert.equal(loginGate(false, { claude: { state: 'ready' }, codex: { state: 'ready' } }).isBothReady, true)
  // 통과면 언제나 맡길 공급자가 있고, 막히면 없다
  const states = ['ready', 'loggedOut', 'missing', 'broken', 'unknown']
  for (const claudeLoggedIn of [true, false, null])
    for (const claude of states)
      for (const codex of states) {
        const g = loginGate(claudeLoggedIn, { claude: { state: claude }, codex: { state: codex } })
        assert.equal(g.taskProvider !== null, g.isOk, `${claudeLoggedIn}/${claude}/${codex}`)
      }
})
