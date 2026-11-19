// 현황 구조 공유: 안 바뀐 카드는 이전 객체를 그대로 쓴다 (보드가 바뀐 카드만 다시 그리게) — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shareUnchanged } from '../src/renderer/lib/shareUnchanged.ts'

const card = (id: string, title: string, updatedAt = 1) => ({ id, title, updatedAt, plan: { childIds: ['x'] } })

test('안 바뀐 카드는 같은 객체, 바뀐 카드만 새 객체 (updatedAt이 같아도 내용이 다르면 새 객체)', () => {
  const prev = { tasks: [card('a', 'A'), card('b', 'B'), card('c', 'C')], company: { level: 2 } }
  // main이 보낸 것처럼 통째로 새 객체. b는 제목만 바뀌고 updatedAt은 그대로, 순서도 바뀜
  const next = structuredClone({ tasks: [prev.tasks[2], { ...prev.tasks[1], title: 'B2' }, prev.tasks[0]], company: { level: 2 } })
  const out = shareUnchanged(prev, next)
  assert.equal(out.tasks[0], prev.tasks[2])
  assert.equal(out.tasks[2], prev.tasks[0])
  assert.notEqual(out.tasks[1], prev.tasks[1])
  assert.equal(out.tasks[1].title, 'B2')
  assert.equal(out.tasks[1].plan, prev.tasks[1].plan)
  assert.equal(out.company, prev.company)
  assert.notEqual(out.tasks, prev.tasks)
  // 내용이 하나도 안 바뀌면 배열·전체도 이전 그대로
  assert.equal(shareUnchanged(prev, structuredClone(prev)), prev)
  // 칸이 빠지거나 늘면 새 객체
  const { company: _, ...noCompany } = structuredClone(prev)
  assert.notEqual(shareUnchanged(prev, noCompany), prev)
  assert.notEqual(shareUnchanged(prev.tasks, structuredClone(prev.tasks).slice(1)), prev.tasks)
})
