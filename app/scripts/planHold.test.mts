// 플랜 한도 보류 판단 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planHold } from '../src/shared/planHold.ts'
import type { PlanUsage } from '../src/shared/types.ts'

const NOW = 1_000_000
const u = (type: string, percent: number | null, resetsAt: number | null, status: PlanUsage['status'] = 'allowed'): PlanUsage => ({ type, percent, resetsAt, status, updatedAt: NOW })

test('사용률이 95% 이상이고 회복 전이면 보류, 가장 늦은 회복 시각에 재개', () => {
  const h = planHold([u('five_hour', 96, NOW + 100), u('seven_day', 99, NOW + 500)], NOW)
  assert.equal(h.isHeld, true)
  assert.equal(h.resumeAt, NOW + 500)
  assert.equal(h.type, 'seven_day')
})

test('낮거나 이미 리셋된 값·모델별 창은 보류하지 않는다', () => {
  assert.equal(planHold([u('five_hour', 80, NOW + 100)], NOW).isHeld, false)
  assert.equal(planHold([u('five_hour', 99, NOW - 1)], NOW).isHeld, false)
  assert.equal(planHold([u('seven_day_opus', 100, NOW + 100, 'rejected')], NOW).isHeld, false)
  assert.equal(planHold([], NOW).isHeld, false)
})

test('막힌(rejected) 창은 사용률을 몰라도 보류, 바로 시작하면 그 시각까지 보류 안 함', () => {
  assert.equal(planHold([u('five_hour', null, NOW + 100, 'rejected')], NOW).isHeld, true)
  assert.equal(planHold([u('five_hour', 99, NOW + 100)], NOW, NOW + 100).isHeld, false)
  assert.equal(planHold([u('five_hour', 99, NOW + 200)], NOW + 100, NOW + 100).isHeld, true)
})
