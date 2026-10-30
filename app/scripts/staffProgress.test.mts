// 지시 처리 상태(#9): 직원별 진행 정보 계산·오류 문구
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildStaffProgress, summarizeInstruction } from '../src/shared/staffProgress.ts'
import MAIN_DICT from '../src/shared/i18n/dict/main.ts'

const o = (text: string, room?: string) => ({ text, room })

test('받은 일이 없으면 null', () => {
  assert.equal(buildStaffProgress({ status: 'idle', origins: [], queued: 0, hasApproval: false }), null)
})

test('상태: 작업 중·대기·오류·결재', () => {
  const base = { origins: [o('a', 'r1'), o('b')], queued: 1, hasApproval: false }
  assert.deepEqual(buildStaffProgress({ ...base, status: 'working' }), { state: 'working', text: 'a', room: 'r1', queued: 1 })
  assert.equal(buildStaffProgress({ ...base, status: 'idle' })?.state, 'queued')
  assert.equal(buildStaffProgress({ ...base, status: 'error' })?.state, 'error')
  assert.equal(buildStaffProgress({ ...base, status: 'working', hasApproval: true })?.state, 'approval')
})

test('대기 수는 런타임이 센 값을 그대로 쓴다', () => {
  assert.equal(buildStaffProgress({ status: 'working', origins: [o('a')], queued: 0, hasApproval: false })?.queued, 0)
})

test('요약: 공백 정리·80자 제한', () => {
  assert.equal(summarizeInstruction(' a \n b '), 'a b')
  assert.equal(summarizeInstruction('x'.repeat(100)).length, 81)
})

test('오류 문구 4개 언어', () => {
  const d = (MAIN_DICT as Record<string, Record<string, string>>)['chat.runError']
  for (const l of ['ko', 'en', 'ja', 'zh']) assert.ok(d[l].includes('{error}'))
})
