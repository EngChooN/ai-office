import test from 'node:test'
import assert from 'node:assert/strict'
import { codexUsageAfterFailure, parseRateLimits, rateLimitsFailure, readCodexRateLimits, shareInFlight } from '../src/main/ai/codexAssets.ts'
import { planHold } from '../src/shared/planHold.ts'
import type { PlanUsage } from '../src/shared/types.ts'

// 실제 codex-app-server `account/rateLimits/read` 응답(ChatGPT Plus 로그인, 개인정보 제외)
const REAL = {
  ordinaryUsageAllowed: true,
  rateLimits: {
    limitId: 'codex',
    primary: { usedPercent: 33, windowDurationMins: 300, resetsAt: 1793451619 },
    secondary: { usedPercent: 32, windowDurationMins: 10080, resetsAt: 1793802911 },
    credits: { hasCredits: false, unlimited: false, balance: '0' },
    planType: 'plus',
    rateLimitReachedType: null,
  },
  rateLimitsByLimitId: { codex: {} },
}

test('실제 응답: 5시간·주간 사용률을 읽는다', () => {
  const info = parseRateLimits(REAL)
  assert.ok(info)
  assert.equal(info.status, 'allowed')
  assert.equal(info.unifiedWindows?.five_hour?.utilization, 0.33)
  assert.equal(info.unifiedWindows?.seven_day?.utilization, 0.32)
  assert.equal(info.unifiedWindows?.five_hour?.resetsAt, 1793451619)
})

test('한도 도달·사용 불가면 rejected', () => {
  assert.equal(parseRateLimits({ ...REAL, ordinaryUsageAllowed: false })?.status, 'rejected')
  assert.equal(parseRateLimits({ ...REAL, rateLimits: { ...REAL.rateLimits, rateLimitReachedType: 'primary' } })?.status, 'rejected')
})

test('창 정보가 없거나 null이면 null', () => {
  assert.equal(parseRateLimits({ rateLimits: { primary: null, secondary: null } }), null)
  assert.equal(parseRateLimits(null), null)
})

// 형식이 예상과 달라도 예외 없이 null — 앱 시작·새로고침이 멈추면 안 된다
const WEIRD: [string, unknown][] = [
  ['배열', [REAL]],
  ['문자열', 'rate limited'],
  ['숫자', 42],
  ['rateLimits가 배열', { rateLimits: [REAL.rateLimits] }],
  ['rateLimits가 문자열', { rateLimits: 'codex' }],
  ['창이 배열', { rateLimits: { primary: [33], secondary: [] } }],
  ['창이 문자열', { rateLimits: { primary: '33%', secondary: 'n/a' } }],
  ['사용률이 문자열', { rateLimits: { primary: { usedPercent: '33', windowDurationMins: 300 } } }],
  ['다른 응답 구조', { result: { limits: [{ name: 'codex', used: 33 }] } }],
  ['한 단계 더 감싼 응답', { result: REAL }],
]

test('비정상 응답: 예외 없이 null, 이유는 unreadable', () => {
  for (const [name, res] of WEIRD) {
    assert.doesNotThrow(() => parseRateLimits(res), name)
    assert.equal(parseRateLimits(res), null, name)
    assert.equal(rateLimitsFailure(res), 'unreadable', name)
  }
})

test('창 길이·리셋이 문자열이어도 사용률은 읽고, 리셋은 버린다', () => {
  const info = parseRateLimits({ rateLimits: { primary: { usedPercent: 50, windowDurationMins: '300', resetsAt: 'soon' } } })
  assert.equal(info?.rateLimitType, 'primary')
  assert.equal(info?.utilization, 0.5)
  assert.equal(info?.resetsAt, undefined)
})

test('이유 구분: 응답 없음 / 창이 비어 옴 / 해석 실패', () => {
  assert.equal(rateLimitsFailure(null), 'noResponse')
  assert.equal(rateLimitsFailure(undefined), 'noResponse')
  assert.equal(rateLimitsFailure({ rateLimits: { primary: null, secondary: null } }), 'noWindow')
  assert.equal(rateLimitsFailure({ rateLimits: {} }), 'noWindow')
  assert.equal(rateLimitsFailure({}), 'unreadable')
})

test('readCodexRateLimits: 실행 파일 없음·조회 실패·이상한 응답을 이유 코드로', async () => {
  const bin = process.execPath // 존재하는 파일이면 된다 (실제로 실행하지 않는다)
  assert.deepEqual(await readCodexRateLimits('/no/such/codex'), { info: null, note: 'binary' })
  assert.deepEqual(await readCodexRateLimits(bin, async () => { throw new Error('spawn failed') }), { info: null, note: 'noResponse' })
  assert.deepEqual(await readCodexRateLimits(bin, async () => []), { info: null, note: 'noResponse' })
  assert.deepEqual(await readCodexRateLimits(bin, async () => [['oops']]), { info: null, note: 'unreadable' })
  assert.deepEqual(await readCodexRateLimits(bin, async () => [{ rateLimits: { primary: null } }]), { info: null, note: 'noWindow' })
  assert.equal((await readCodexRateLimits(bin, async () => [REAL])).info?.utilization, 0.33)
})

test('조회에 실패해도 읽어 둔 사용률과 보류 상태는 그대로, 안내는 값이 없을 때만', () => {
  const now = Date.UTC(2026, 9, 31)
  const usage: PlanUsage[] = [
    { type: 'five_hour', percent: 100, resetsAt: now + 3_600_000, status: 'rejected', updatedAt: now },
    { type: 'seven_day', percent: 40, resetsAt: now + 86_400_000, status: 'allowed', updatedAt: now },
  ]
  const before = planHold(usage, now)
  assert.equal(before.isHeld, true)
  for (const note of ['binary', 'noResponse', 'unreadable', 'noWindow'] as const) {
    const after = codexUsageAfterFailure(usage, note)
    assert.equal(after.usage, usage, note)
    assert.equal(after.note, undefined, note)
    assert.deepEqual(planHold(after.usage, now), before, note)
  }
  assert.deepEqual(codexUsageAfterFailure([], 'noResponse'), { usage: [], note: 'noResponse' })
})

// 앱 시작 조회와 새로고침이 겹치는 경우 — office.ts의 refreshCodexUsage가 쓰는 함수 그대로
test('동시 조회: 진행 중인 조회 하나를 같이 기다리고 app-server는 한 번만 부른다', async () => {
  let calls = 0
  let finish!: (v: string) => void
  const refresh = shareInFlight(() => {
    calls++
    return new Promise<string>((r) => (finish = r))
  })
  const onStart = refresh()
  const onButton = refresh()
  assert.equal(onButton, onStart)
  assert.equal(calls, 1)
  finish('read')
  assert.deepEqual(await Promise.all([onStart, onButton]), ['read', 'read'])
})

test('조회가 끝난 뒤 새로고침하면 새로 조회한다 (실패로 끝나도)', async () => {
  let calls = 0
  const refresh = shareInFlight(async () => {
    calls++
    if (calls === 2) throw new Error('codex down')
    return calls
  })
  assert.equal(await refresh(), 1)
  await assert.rejects(refresh(), /codex down/)
  assert.equal(await refresh(), 3)
  assert.equal(calls, 3)
})
