// 처음 한 번 힌트 규칙과 기존 사용자 업데이트 처리 (shared/firstHints.ts · withSettingsDefaults) — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FIRST_HINT_IDS, initialSeenHints, shouldShowHint, type FirstHintState } from '../src/shared/firstHints.ts'
import { withSettingsDefaults } from '../src/shared/types.ts'

const base: FirstHintState = { isOnboarded: true, seenHints: [], isHintsOff: false, hasPracticedTask: false, isBusy: false }

test('처음 힌트: 안내를 마친 뒤 · 안 본 것만 · 모두 끄기와 다른 안내 중에는 안 뜬다', () => {
  for (const id of FIRST_HINT_IDS) assert.equal(shouldShowHint(id, base), true, id)
  assert.equal(shouldShowHint('board', { ...base, isOnboarded: false }), false, '첫 실행 안내 중')
  assert.equal(shouldShowHint('board', { ...base, seenHints: ['board'] }), false, '이미 봄')
  assert.equal(shouldShowHint('meeting', { ...base, seenHints: ['board'] }), true, '다른 힌트를 본 것과는 상관없다')
  assert.equal(shouldShowHint('hire', { ...base, isHintsOff: true }), false, '힌트 모두 끄기')
  assert.equal(shouldShowHint('hire', { ...base, isBusy: true }), false, '연습·둘러보기 중')
})

test('처음 힌트: 업무 연습을 해 본 사람에게는 단체방·결재함 힌트를 안 띄운다 (나머지는 그대로)', () => {
  const practiced = { ...base, hasPracticedTask: true }
  assert.equal(shouldShowHint('chat', practiced), false)
  assert.equal(shouldShowHint('inbox', practiced), false)
  for (const id of ['hire', 'board', 'meeting'] as const) assert.equal(shouldShowHint(id, practiced), true, id)
})

test('업데이트: 힌트 기록이 없는 설정에서 이미 안내를 마친 사람은 모든 힌트를 본 것으로 시작한다', () => {
  assert.deepEqual(initialSeenHints({ isOnboarded: true }), [...FIRST_HINT_IDS])
  assert.deepEqual(initialSeenHints({ isOnboarded: false }), [], '안내 도중 업데이트한 사람은 새 사용자처럼')
  assert.deepEqual(initialSeenHints({}), [], '새로 설치')
  // 한 번 저장된 기록은 그대로 (힌트 다시 보기로 비운 []도)
  assert.deepEqual(initialSeenHints({ isOnboarded: true, seenHints: [] }), [])
  assert.deepEqual(initialSeenHints({ isOnboarded: true, seenHints: ['hire'] }), ['hire'])
})

test('설정 불러오기: 예전 설정 파일에도 힌트 칸이 채워지고, 다른 값은 지우지 않는다', () => {
  const old = withSettingsDefaults({ isOnboarded: true, defaultCwd: '/Users/me/work' } as never)
  assert.deepEqual(old.seenHints, [...FIRST_HINT_IDS])
  assert.equal(old.isHintsOff, false)
  assert.equal(old.defaultCwd, '/Users/me/work', '예전에 고른 기본 작업 폴더는 남긴다')
  const fresh = withSettingsDefaults({})
  assert.deepEqual(fresh.seenHints, [])
  assert.equal(fresh.isOnboarded, false)
})
