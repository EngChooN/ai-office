import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isProviderStale, PROVIDER_RECHECK_MS, providerCardAction } from '../src/renderer/lib/providerRecheck.ts'
import settingsDict from '../src/shared/i18n/dict/settings.ts'

test('포커스 복귀 재조회: 조회한 적이 없으면 건너뛰고, 30분이 지나야 다시 본다', () => {
  const t0 = 1_000_000
  assert.equal(isProviderStale(0, t0), false)
  assert.equal(isProviderStale(t0, t0 + PROVIDER_RECHECK_MS - 1), false)
  assert.equal(isProviderStale(t0, t0 + PROVIDER_RECHECK_MS), true)
  assert.equal(isProviderStale(t0, t0 + 2 * PROVIDER_RECHECK_MS), true)
})

test('공급자 카드 버튼 (#13, #14): 실행 실패·확인 못 함은 다시 확인, 로그인 필요는 로그인, 설치 안 됨·준비됨은 버튼 없음', () => {
  for (const p of ['claude', 'codex'] as const) {
    assert.equal(providerCardAction(p, 'broken'), 'recheck')
    assert.equal(providerCardAction(p, 'unknown'), 'recheck')
    assert.equal(providerCardAction(p, 'missing'), null)
    assert.equal(providerCardAction(p, 'ready'), null)
    assert.equal(providerCardAction(p, undefined), null)
  }
  assert.equal(providerCardAction('claude', 'loggedOut'), 'claudeLogin')
  assert.equal(providerCardAction('codex', 'loggedOut'), 'codexLogin')
})

test('Codex 설치 안 됨 안내 (#13, #14): 4개 언어 모두 업데이트하라고 알려 준다', () => {
  const m = settingsDict['provider.codex.missing']
  assert.match(m.ko, /업데이트/)
  assert.match(m.en, /update/i)
  assert.match(m.ja, /アップデート/)
  assert.match(m.zh, /更新/)
})
