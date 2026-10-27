// GPT 직원 안내 띠: 업데이트한 사람에게 한 번만, 새 설치는 띄우지 않는다 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { providerBannerAction } from '../src/renderer/lib/providerBanner.ts'
import { withSettingsDefaults } from '../src/shared/types.ts'

const base = { isLoaded: true, isOnboarded: true, isSeen: false }

test('GPT 직원 안내 띠: 기존 사용자에게 한 번만 띄운다', () => {
  assert.equal(providerBannerAction({ ...base, isLoaded: false }), 'hide', '상태를 읽기 전')
  assert.equal(providerBannerAction(base), 'show', '첫 실행 안내를 마친 사람')
  // 닫거나 누르면 isSeen이 저장돼 다음부터는 뜨지 않는다
  assert.equal(providerBannerAction({ ...base, isSeen: true }), 'hide')
  // 새 설치: 마법사 중에 본 것으로 적어 마법사를 마쳐도 뜨지 않는다
  assert.equal(providerBannerAction({ ...base, isOnboarded: false }), 'markSeen')
  assert.equal(providerBannerAction({ ...base, isOnboarded: false, isSeen: true }), 'hide')
})

test('GPT 직원 안내 띠: 옛 버전 설정에서 올라오면 아직 안 본 것으로 채운다', () => {
  const s = withSettingsDefaults({ isOnboarded: true })
  assert.equal(s.isProviderBannerSeen, false)
  assert.equal(providerBannerAction({ isLoaded: true, isOnboarded: s.isOnboarded, isSeen: s.isProviderBannerSeen }), 'show')
})
