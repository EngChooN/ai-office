// 지시 처리 상태 표시(#9): 대화방별로 보일 직원 고르기·문구 키
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PROGRESS_LABEL, PROGRESS_STATUS, progressesForRoom } from '../src/shared/progressView.ts'
import DICT from '../src/shared/i18n/dict/featuresB.ts'

const p = (room?: string) => ({ state: 'working' as const, text: 'x', queued: 0, ...(room ? { room } : {}) })
const staff = [
  { id: 'a', progress: p() },
  { id: 'b', progress: p('team1') },
  { id: 'c', progress: p('lab:1') },
  { id: 'd', progress: null },
  { id: 'e' },
]

test('전체 방: 방 없이 받은 지시만', () => {
  assert.deepEqual(progressesForRoom(staff, undefined).map((s) => s.id), ['a'])
  assert.deepEqual(progressesForRoom(staff, '').map((s) => s.id), ['a'])
})

test('팀·랩 방: 그 방에서 받은 지시만', () => {
  assert.deepEqual(progressesForRoom(staff, 'team1').map((s) => s.id), ['b'])
  assert.deepEqual(progressesForRoom(staff, 'lab:1').map((s) => s.id), ['c'])
  assert.deepEqual(progressesForRoom(staff, 'team2'), [])
})

test('상태마다 문구·색이 있고 4개 언어가 다 있다', () => {
  for (const state of ['queued', 'working', 'approval', 'error'] as const) {
    assert.ok(PROGRESS_STATUS[state])
    const entry = (DICT as Record<string, Record<string, string>>)[PROGRESS_LABEL[state]]
    for (const lang of ['ko', 'en', 'ja', 'zh']) assert.ok(entry?.[lang], `${state}.${lang}`)
  }
  const more = (DICT as Record<string, Record<string, string>>)['progress.more']
  for (const lang of ['ko', 'en', 'ja', 'zh']) assert.match(more[lang], /\{count\}/)
})
