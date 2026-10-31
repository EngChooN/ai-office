import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRateLimits } from '../src/main/ai/codexAssets.ts'

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

test('창 정보가 없거나 null이면 null (API 키 로그인 등)', () => {
  assert.equal(parseRateLimits({ rateLimits: { primary: null, secondary: null } }), null)
  assert.equal(parseRateLimits(null), null)
})
