// 토큰 예산 알림 키·한도 파싱 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { budgetAlertScope, nextBudgetAlert, parseTokens, periodStart, pruneAlertKeys } from '../src/shared/budget.ts'

test('한도 입력 파싱: 단위·쉼표·빈 값·잘못된 값', () => {
  assert.equal(parseTokens('5M'), 5_000_000)
  assert.equal(parseTokens('1.5m'), 1_500_000)
  assert.equal(parseTokens('340K'), 340_000)
  assert.equal(parseTokens('1,000,000'), 1_000_000)
  assert.equal(parseTokens(' 2 000 '), 2_000)
  assert.equal(parseTokens(''), 0)
  assert.equal(parseTokens('   '), 0)
  assert.equal(parseTokens('abc'), null)
  assert.equal(parseTokens('-5M'), null)
  assert.equal(parseTokens('5MB'), null)
})

test('주는 월요일 0시부터, 일요일은 그 전 월요일 주에 속한다', () => {
  const monday = new Date(2026, 9, 19).getTime()
  assert.equal(periodStart('week', new Date(2026, 9, 21, 15)), monday)
  assert.equal(periodStart('week', new Date(2026, 9, 19, 0, 30)), monday)
  assert.equal(periodStart('week', new Date(2026, 9, 25, 23)), monday)
  assert.equal(periodStart('day', new Date(2026, 9, 21, 15)), new Date(2026, 9, 21).getTime())
  assert.equal(periodStart('month', new Date(2026, 9, 21, 15)), new Date(2026, 9, 1).getTime())
})

test('한도가 바뀌면 같은 기간이라도 알림 키가 달라진다', () => {
  const start = periodStart('day', new Date(2026, 9, 21))
  assert.notEqual(budgetAlertScope('day', start, 'tok', 5_000_000), budgetAlertScope('day', start, 'tok', 8_000_000))
})

test('80% → 100% 순서로 넘으면 각각 한 번씩 알린다', () => {
  const scope = 'day:1:tok:100'
  const warned = new Set<string>()
  assert.equal(nextBudgetAlert(scope, 0.5, warned), null)
  const first = nextBudgetAlert(scope, 0.85, warned)!
  assert.deepEqual(first, { ratio: 0.8, keys: [`${scope}:0.8`] })
  first.keys.forEach((k) => warned.add(k))
  assert.equal(nextBudgetAlert(scope, 0.9, warned), null)
  assert.deepEqual(nextBudgetAlert(scope, 1.0, warned), { ratio: 1, keys: [`${scope}:0.8`, `${scope}:1`] })
})

test('한 번에 80%·100%를 다 넘으면 100%만 알리고 80%도 알린 것으로 표시', () => {
  const scope = 'day:1:tok:100'
  const alert = nextBudgetAlert(scope, 1.3, new Set())!
  assert.equal(alert.ratio, 1)
  assert.deepEqual(alert.keys, [`${scope}:0.8`, `${scope}:1`])
  assert.equal(nextBudgetAlert(scope, 1.5, new Set(alert.keys)), null)
})

test('한도를 올리면 새 범위로 80%·100%가 다시 울린다', () => {
  const start = periodStart('day', new Date(2026, 9, 21))
  const old = budgetAlertScope('day', start, 'tok', 100)
  const warned = new Set([`${old}:0.8`, `${old}:1`])
  const raised = budgetAlertScope('day', start, 'tok', 200)
  assert.equal(nextBudgetAlert(raised, 0.6, warned), null)
  assert.equal(nextBudgetAlert(raised, 0.8, warned)?.ratio, 0.8)
})

test('저장된 알림 키는 지금 기간 것만 남긴다 (재시작 중복 방지 + 지난 기간 정리)', () => {
  const now = new Date(2026, 9, 21, 15)
  const today = budgetAlertScope('day', periodStart('day', now), 'tok', 100)
  const yesterday = budgetAlertScope('day', periodStart('day', new Date(2026, 9, 20)), 'tok', 100)
  const thisMonthUsd = budgetAlertScope('month', periodStart('month', now), 'usd', 50)
  const lastWeek = budgetAlertScope('week', periodStart('week', new Date(2026, 9, 12)), 'tok', 100)
  const keys = [`${today}:0.8`, `${yesterday}:1`, `${thisMonthUsd}:1`, `${lastWeek}:0.8`, 'garbage', '2026-10:0.8']
  assert.deepEqual(pruneAlertKeys(keys, now), [`${today}:0.8`, `${thisMonthUsd}:1`])
})
