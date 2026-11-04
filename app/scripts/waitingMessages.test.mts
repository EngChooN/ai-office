// 대기 메시지: 일하는 중에 패널에서 보낸 지시를 앱이 들고 있다가 끝나면 하나씩 보낸다 — 지금 보내기·취소
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldWait, WaitingMessages } from '../src/main/waitingMessages.ts'

const base = { status: 'working', approvals: 0, text: '질문', isSlash: false }

test('대기 여부: 일하는 중일 때만 들고 있고, 결재 대기·/명령·빈 글·쉬는 중은 바로 전한다', () => {
  assert.equal(shouldWait(base), true)
  assert.equal(shouldWait({ ...base, status: 'idle' }), false)
  assert.equal(shouldWait({ ...base, status: 'waiting' }), false)
  assert.equal(shouldWait({ ...base, approvals: 1 }), false)
  assert.equal(shouldWait({ ...base, isSlash: true }), false)
  assert.equal(shouldWait({ ...base, text: '  ' }), false)
})

test('대기 메시지: 받은 순서대로 하나씩 꺼내고, 비면 없음', () => {
  let n = 0
  const q = new WaitingMessages<string, never>(() => `m${++n}`)
  q.add('s1', { text: 'a', origin: 'o', attachments: [] })
  q.add('s1', { text: 'b', origin: 'o', attachments: [] })
  q.add('s2', { text: 'x', origin: 'o', attachments: [] })
  assert.deepEqual(q.list('s1').map((m) => [m.id, m.text]), [['m1', 'a'], ['m2', 'b']])
  assert.equal(q.shift('s1')?.text, 'a')
  assert.equal(q.shift('s1')?.text, 'b')
  assert.equal(q.shift('s1'), null)
  assert.deepEqual(q.list('s1'), [])
  assert.equal(q.list('s2').length, 1) // 다른 직원 것은 그대로
})

test('지금 보내기·취소: 고른 것만 빼고 나머지 순서는 그대로, 없는 id는 null', () => {
  let n = 0
  const q = new WaitingMessages<string, never>(() => `m${++n}`)
  for (const text of ['a', 'b', 'c']) q.add('s1', { text, origin: 'o', attachments: [] })
  assert.equal(q.take('s1', 'm2')?.text, 'b')
  assert.equal(q.take('s1', 'm2'), null) // 두 번 눌러도 한 번만
  assert.deepEqual(q.list('s1').map((m) => m.text), ['a', 'c'])
  q.clear('s1')
  assert.deepEqual(q.list('s1'), [])
})
