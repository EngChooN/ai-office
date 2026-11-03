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
  assert.deepEqual(buildStaffProgress({ ...base, status: 'working' }), { state: 'working', text: 'a', room: 'r1', queued: 1, waiting: [{ text: 'b' }] })
  assert.equal(buildStaffProgress({ ...base, status: 'idle' })?.state, 'queued')
  assert.equal(buildStaffProgress({ ...base, status: 'error' })?.state, 'error')
  assert.equal(buildStaffProgress({ ...base, status: 'working', hasApproval: true })?.state, 'approval')
})

test('대기 중 카드: 처리 중 뒤에 줄 선 지시를 받은 순서대로, 런타임이 센 수만큼만', () => {
  const origins = [o('a'), o('b'), o('c')]
  assert.deepEqual(buildStaffProgress({ status: 'working', origins, queued: 2, hasApproval: false })?.waiting, [{ text: 'b' }, { text: 'c' }])
  // 런타임 대기열이 줄면(처리 시작·합쳐 처리) 카드도 준다
  assert.deepEqual(buildStaffProgress({ status: 'working', origins, queued: 1, hasApproval: false })?.waiting, [{ text: 'b' }])
  // 대기열이 비면(끼어들기·멈추기·처리 시작) 카드 없음 — 필드 자체를 뺀다
  assert.equal('waiting' in (buildStaffProgress({ status: 'working', origins, queued: 0, hasApproval: false }) ?? {}), false)
  // 요약 글이 없는 일은 카드로 만들지 않는다
  assert.deepEqual(buildStaffProgress({ status: 'working', origins: [o('a'), { text: '' }, o('c')], queued: 2, hasApproval: false })?.waiting, [{ text: 'c' }])
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

test('도움 요청으로 받은 일: 현재 지시의 부탁한 사람 이름을 붙인다', () => {
  const nameOf = (id: string) => ({ a: '김기획' })[id]
  const help = { kind: 'help', fromId: 'a', text: '사진 추가' }
  assert.equal(buildStaffProgress({ status: 'working', origins: [help], queued: 0, hasApproval: false, nameOf })?.requestedBy, '김기획')
  // 현재(첫) 지시가 도움 요청이 아니면 붙이지 않는다
  assert.equal(buildStaffProgress({ status: 'working', origins: [o('대표 지시'), help], queued: 1, hasApproval: false, nameOf })?.requestedBy, undefined)
  // 부탁한 직원이 없어졌으면 붙이지 않는다
  assert.equal('requestedBy' in buildStaffProgress({ status: 'working', origins: [{ ...help, fromId: 'gone' }], queued: 0, hasApproval: false, nameOf })!, false)
})

test('도움 요청 문구 4개 언어', async () => {
  const B = (await import('../src/shared/i18n/dict/featuresB.ts')).default as Record<string, Record<string, string>>
  for (const k of ['progress.helpFrom', 'approval.requestedBy']) for (const l of ['ko', 'en', 'ja', 'zh']) assert.ok(B[k][l].includes('{name}'))
})
