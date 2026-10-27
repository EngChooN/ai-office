import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isProviderStale, PROVIDER_RECHECK_MS } from '../src/renderer/lib/providerRecheck.ts'

test('포커스 복귀 재조회: 조회한 적이 없으면 건너뛰고, 30분이 지나야 다시 본다', () => {
  const t0 = 1_000_000
  assert.equal(isProviderStale(0, t0), false)
  assert.equal(isProviderStale(t0, t0 + PROVIDER_RECHECK_MS - 1), false)
  assert.equal(isProviderStale(t0, t0 + PROVIDER_RECHECK_MS), true)
  assert.equal(isProviderStale(t0, t0 + 2 * PROVIDER_RECHECK_MS), true)
})
