// 인터넷이 끊겨 멈춘 직원 일 이어 하기: 오류 글 판정(networkError)과 보관·재개 규칙(netResume)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isNetworkError } from '../src/shared/networkError.ts'
import { NET_PARK_MAX_MS, NET_RESUME_MAX_TRIES, NetParking } from '../src/shared/netResume.ts'
import { buildStaffProgress } from '../src/shared/staffProgress.ts'
import { countByStatus } from '../src/shared/dashboard.ts'
import { NET_WAIT_ACTIVITY, remoteActivity, remoteStatus } from '../src/main/remote/protocol.ts'

// 실제 출력에서 받아 둔 문구 (2026-11-05, ANTHROPIC_BASE_URL·HTTPS_PROXY를 닿지 않는 주소로 두고 SDK·codex-app-server를 돌려 확인)
const CLAUDE_DNS = "API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)"
const CLAUDE_REFUSED = 'API Error: Connection refused — a firewall or proxy may be blocking it (ECONNREFUSED)'
const CODEX_RETRY = 'Reconnecting... waiting for network'
const CODEX_WARNING = 'Falling back from WebSockets to HTTPS transport. stream disconnected before completion: Connection refused (os error 61)'
// 같은 실패를 SDK가 세션을 닫으며 다시 던진 것 — 이미 결과로 처리했으니 보관하지 않는다
const CLAUDE_RETHROW = `Error: Claude Code returned an error result: ${CLAUDE_DNS}`

test('인터넷 오류: 실제 Claude·Codex 문구와 노드 오류 코드를 잡는다', () => {
  for (const text of [CLAUDE_DNS, CLAUDE_REFUSED, CODEX_RETRY, CODEX_WARNING, 'TypeError: fetch failed', 'Connection error.', 'getaddrinfo EAI_AGAIN api.anthropic.com', 'read ECONNRESET', 'connect ETIMEDOUT 1.2.3.4:443']) {
    assert.equal(isNetworkError(text), true, text)
  }
})

test('인터넷 오류 아님: 한도·권한·모델·요청 크기 오류와 다시 던진 결과는 빼낸다', () => {
  for (const text of [
    CLAUDE_RETHROW,
    'API Error: 429 rate_limit_error: This request would exceed the rate limit',
    "You've hit your usage limit. Upgrade to Pro",
    'API Error: 401 authentication_error: invalid x-api-key',
    'API Error: 403 permission_error',
    'API Error: 404 model: claude-x does not exist (fetch failed)',
    'API Error: 529 overloaded_error',
    'Prompt is too long',
    'Your credit balance is too low',
    '오류로 중단 (error_during_execution)',
    '',
  ]) {
    assert.equal(isNetworkError(text), false, text)
  }
})

const clock = (start = 1_000) => {
  const c = { now: start }
  return { c, park: new NetParking<{ kind: string; taskId?: string }, { taskId: string; context: string }>(() => c.now) }
}
const ORIGINS = [{ kind: 'task', taskId: 't1' }, { kind: 'delegate' }]
const QUEUED = [{ taskId: 't2', context: '' }]

test('보관 후 재개: 받은 일·대기 카드를 그대로 돌려주고 횟수를 센다', () => {
  const { park } = clock()
  assert.equal(park.park('a', CLAUDE_DNS, ORIGINS, QUEUED), true)
  assert.equal(park.has('a'), true)
  assert.deepEqual(park.allOrigins(), ORIGINS)
  const p = park.resume('a')
  assert.deepEqual(p?.origins, ORIGINS)
  assert.deepEqual(p?.queued, QUEUED)
  assert.equal(p?.error, CLAUDE_DNS)
  assert.equal(park.has('a'), false)
  assert.equal(park.resume('a'), null)
})

test('보관하지 않음: 인터넷 오류가 아니거나 받은 일이 없으면 평소 오류 정리로', () => {
  const { park } = clock()
  assert.equal(park.park('a', 'API Error: 401 authentication_error', ORIGINS, []), false)
  assert.equal(park.park('a', CLAUDE_DNS, [], []), false)
  assert.equal(park.size, 0)
})

test(`${NET_RESUME_MAX_TRIES}번 이어 가도 또 끊기면 더 보관하지 않는다 — 정상으로 끝나면 다시 센다`, () => {
  const { park } = clock()
  for (let i = 0; i < NET_RESUME_MAX_TRIES; i++) {
    assert.equal(park.park('a', CLAUDE_DNS, ORIGINS, []), true, `${i + 1}번째`)
    park.resume('a')
  }
  assert.equal(park.park('a', CLAUDE_DNS, ORIGINS, []), false)
  // 포기하면 횟수도 비운다 — 다음 일은 처음부터
  assert.equal(park.park('a', CLAUDE_DNS, ORIGINS, []), true)
  park.resume('a')
  park.succeeded('a')
  for (let i = 0; i < NET_RESUME_MAX_TRIES; i++) {
    assert.equal(park.park('a', CLAUDE_DNS, ORIGINS, []), true)
    park.resume('a')
  }
})

test('처음 멈춘 지 6시간이 지나면 꺼내 오류로 정리한다 (이어 갔다 또 끊겨도 처음 시각 기준)', () => {
  const { c, park } = clock()
  park.park('a', CLAUDE_DNS, ORIGINS, QUEUED)
  park.park('b', CODEX_RETRY, [{ kind: 'user' }], [])
  c.now += NET_PARK_MAX_MS
  assert.deepEqual(park.takeExpired(), [])
  park.resume('b')
  c.now += 1
  const out = park.takeExpired()
  assert.deepEqual(out.map(([id]) => id), ['a'])
  assert.deepEqual(out[0][1].origins, ORIGINS)
  assert.equal(park.has('a'), false)
  // b는 처음 멈춘 시각에서 6시간이 지났으니 다시 끊겨도 보관하지 않는다
  assert.equal(park.park('b', CODEX_RETRY, [{ kind: 'user' }], []), false)
})

test('대표가 새로 지시하거나 멈추면 보관을 풀어 돌려주고 횟수도 비운다', () => {
  const { park } = clock()
  park.park('a', CLAUDE_DNS, ORIGINS, QUEUED)
  park.resume('a')
  park.park('a', CLAUDE_DNS, ORIGINS, QUEUED)
  const p = park.cancel('a')
  assert.deepEqual(p?.origins, ORIGINS)
  assert.deepEqual(p?.queued, QUEUED)
  assert.equal(park.has('a'), false)
  assert.equal(park.cancel('a'), null)
  for (let i = 0; i < NET_RESUME_MAX_TRIES; i++) {
    assert.equal(park.park('a', CLAUDE_DNS, ORIGINS, []), true)
    park.resume('a')
  }
})

test('보관 중에는 정상 결과가 와도 횟수를 비우지 않는다', () => {
  const { park } = clock()
  for (let i = 0; i < NET_RESUME_MAX_TRIES - 1; i++) {
    park.park('a', CLAUDE_DNS, ORIGINS, [])
    park.resume('a')
  }
  park.park('a', CLAUDE_DNS, ORIGINS, [])
  park.succeeded('a')
  park.resume('a')
  assert.equal(park.park('a', CLAUDE_DNS, ORIGINS, []), false)
})

test('연결 대기 상태: 진행 줄은 netWait, 휴대폰에는 작업 중 + 연결 대기 활동, 요약은 작업 중으로 센다', () => {
  const progress = buildStaffProgress({ status: 'netWait', origins: [{ text: '보고서 쓰기' }], queued: 0, hasApproval: false, nameOf: () => undefined })
  assert.equal(progress?.state, 'netWait')
  assert.equal(remoteStatus('netWait'), 'working')
  assert.equal(remoteStatus('error'), 'error')
  assert.equal(remoteActivity('netWait', ''), NET_WAIT_ACTIVITY)
  assert.deepEqual(countByStatus([{ status: 'netWait' }, { status: 'working' }]), { working: 2, waiting: 0, error: 0, idle: 0 })
})
