// 회의 참석자 묶음 선택 단위 테스트 — pnpm test (node --test, 타입 제거 실행)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupState, toggleGroup, type PickGroup } from '../src/renderer/features/meetingPick.ts'

const MAX = 8
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
const group = (memberIds: string[]): PickGroup => ({ key: 'lab:x', kind: 'lab', name: 'x', color: '#000', memberIds })

test('빈 상태에서 누르면 전원 추가, 다시 누르면 전원 해제', () => {
  const g = group(ids('a', 3))
  const on = toggleGroup([], g, MAX)
  assert.deepEqual(on, { picked: ['a1', 'a2', 'a3'], added: 3, skipped: 0 })
  assert.equal(groupState(g, on.picked, MAX).state, 'on')
  assert.deepEqual(toggleGroup(on.picked, g, MAX).picked, [])
})

test('이미 고른 사람은 중복으로 넣지 않는다', () => {
  const r = toggleGroup(['a2', 'b1'], group(ids('a', 3)), MAX)
  assert.deepEqual(r.picked, ['a2', 'b1', 'a1', 'a3'])
  assert.equal(r.added, 2)
})

test('구성원이 남은 자리보다 많으면 앞에서부터 채우고 못 넣은 인원을 돌려준다', () => {
  const r = toggleGroup(ids('b', 5), group(ids('a', 5)), MAX)
  assert.deepEqual(r.picked, [...ids('b', 5), 'a1', 'a2', 'a3'])
  assert.deepEqual({ added: r.added, skipped: r.skipped }, { added: 3, skipped: 2 })
})

test('8명 이상 묶음: 8명이 채워지면 on, 다시 누르면 해제된다', () => {
  const g = group(ids('a', 10))
  const filled = toggleGroup([], g, MAX)
  assert.deepEqual({ added: filled.added, skipped: filled.skipped }, { added: 8, skipped: 2 })
  assert.deepEqual(groupState(g, filled.picked, MAX), { state: 'on', selected: 8 })
  assert.deepEqual(toggleGroup(filled.picked, g, MAX), { picked: [], added: 0, skipped: 0 })
})

test('이미 8명이 찼고 묶음이 일부만 선택: 아무도 못 넣고 그대로 둔다 (added 0)', () => {
  const g = group(ids('a', 4))
  const picked = ['a1', 'a2', ...ids('b', 6)]
  assert.equal(groupState(g, picked, MAX).state, 'partial')
  assert.deepEqual(toggleGroup(picked, g, MAX), { picked, added: 0, skipped: 2 })
})

test('이미 8명이 찼고 묶음 구성원이 하나도 없으면 off, 누르면 added 0', () => {
  const g = group(ids('a', 3))
  const picked = ids('b', 8)
  assert.equal(groupState(g, picked, MAX).state, 'off')
  assert.deepEqual(toggleGroup(picked, g, MAX), { picked, added: 0, skipped: 3 })
})
