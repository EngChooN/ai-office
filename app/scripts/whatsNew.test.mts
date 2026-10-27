// 업데이트 소식 창: 새로 설치하면 띄우지 않고, 업데이트한 사람에게만 · 튜토리얼과 겹치지 않게 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { whatsNewAction, type WhatsNewInput } from '../src/renderer/lib/whatsNew.ts'

const base: WhatsNewInput = { isLoaded: true, isOnboarded: true, isBusy: false, seen: '0.12.1', version: '0.13.0', hasRelease: true }

test('업데이트 소식 창: 새 설치는 본 것으로 적고, 업데이트한 사람은 튜토리얼이 끝난 뒤 띄운다', () => {
  assert.equal(whatsNewAction({ ...base, isLoaded: false }), 'wait', '상태를 읽기 전')
  // 새 설치: 시작 마법사 중 — 지금 버전을 본 것으로 적어 마법사·튜토리얼이 끝나도 뜨지 않는다
  assert.equal(whatsNewAction({ ...base, isOnboarded: false, seen: null }), 'markSeen')
  assert.equal(whatsNewAction({ ...base, seen: '0.13.0' }), 'markSeen', '마법사를 마친 뒤엔 이미 본 버전')
  // 업데이트한 사람
  assert.equal(whatsNewAction(base), 'open')
  assert.equal(whatsNewAction({ ...base, seen: null }), 'open', '본 버전 기록이 없던 옛 버전에서 올라옴')
  assert.equal(whatsNewAction({ ...base, isBusy: true }), 'wait', '코치마크·튜토리얼 중엔 미룬다')
  assert.equal(whatsNewAction({ ...base, hasRelease: false }), 'markSeen', '이번 버전 소식이 없으면 띄우지 않는다')
})
