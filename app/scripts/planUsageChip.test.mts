// 상단 바 플랜 사용률 칩 — 엔진 고르기 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chipEngines } from '../src/shared/planUsageChip.ts'
import type { AiProvider, PlanUsage } from '../src/shared/types.ts'

const u = (type: string, percent: number | null): PlanUsage => ({ type, percent, resetsAt: null, status: 'allowed', updatedAt: 1 })
const claude = [u('seven_day', 1), u('five_hour', 1), u('seven_day_opus', 40)]
const codex = [u('five_hour', 3), u('seven_day', 2)]
const pick = (c: PlanUsage[], x: PlanUsage[], used: AiProvider[]) => chipEngines({ claude: c, codex: x }, new Set(used))

test('두 엔진을 다 쓰면 둘 다 (Claude 먼저), 기본 한도만 5시간·7일 순서로', () => {
  const r = pick(claude, codex, ['claude', 'codex'])
  assert.deepEqual(r.map((e) => e.provider), ['claude', 'codex'])
  assert.deepEqual(r[0].usage.map((x) => x.type), ['five_hour', 'seven_day'])
})

test('한쪽만 쓰면 그쪽만 — 다른 엔진 값이 있어도 숨긴다', () => {
  assert.deepEqual(pick(claude, codex, ['codex']).map((e) => e.provider), ['codex'])
  assert.deepEqual(pick(claude, codex, ['claude']).map((e) => e.provider), ['claude'])
})

test('쓰는 엔진 값이 아직 없거나 직원이 없으면 값 있는 엔진을 보여 주고, 값이 전혀 없으면 빈 목록', () => {
  assert.deepEqual(pick(claude, [], ['codex']).map((e) => e.provider), ['claude'])
  assert.deepEqual(pick(claude, codex, []).map((e) => e.provider), ['claude', 'codex'])
  assert.deepEqual(pick([u('five_hour', null)], [], ['claude']), [])
})

test('무료 ChatGPT 플랜(30일 하나)도 칩에 나온다', () => {
  assert.deepEqual(pick([], [u('thirty_day', 12)], ['codex'])[0].usage.map((x) => x.type), ['thirty_day'])
})
