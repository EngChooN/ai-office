// 첫 실행 안내 로그인 단계 갈림길 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loginGate } from '../src/renderer/lib/firstTaskFlow.ts'

test('로그인 단계: Claude·Codex 중 하나만 준비돼도 통과, 둘 다 안 되면 막힘(계정은 나중에 · 연습 먼저)', () => {
  const st = (claude: string, codex: string) => ({ claude: { state: claude }, codex: { state: codex } })
  const pass = { isChecking: false, isOk: true, isBlocked: false }
  assert.deepEqual(loginGate(true, st('ready', 'missing')), { ...pass, isBothReady: false })
  assert.deepEqual(loginGate(false, st('loggedOut', 'ready')), { ...pass, isBothReady: false })
  assert.deepEqual(loginGate(true, st('ready', 'ready')), { ...pass, isBothReady: true })
  const blocked = { isChecking: false, isOk: false, isBlocked: true, isBothReady: false }
  assert.deepEqual(loginGate(false, st('loggedOut', 'missing')), blocked)
  assert.deepEqual(loginGate(false, st('missing', 'loggedOut')), blocked)
})

test('로그인 단계: 두 결과가 다 오기 전에는 확인 중 — 막힘으로 판단하지 않는다', () => {
  const checking = { isChecking: true, isOk: false, isBlocked: false, isBothReady: false }
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
