import assert from 'node:assert/strict'
import { test } from 'node:test'
import { settleStaleMeeting } from '../src/shared/gallery.ts'
import type { Meeting } from '../src/shared/types.ts'

const demo = (status: Meeting['status']): Meeting => ({
  id: 'm1', topic: '데모데이', participantIds: ['a'], rounds: 1, status, messages: [], summary: '', createdAt: 1, kind: 'demo',
  demo: { presenterId: 'a', phase: 'present', slides: [{ id: 'i', name: 'x.png', path: '/tmp/x.png', mime: 'image/png', size: 1 }], cardTitle: 'c', index: 3, total: 7, startedAt: 1, durationMs: 9000, mvpId: null },
})

test('켤 때 진행 중이던 데모데이는 끝남으로 닫히고 진행 표시가 지워진다', () => {
  for (const st of ['running', 'waiting'] as const) {
    const r = settleStaleMeeting(demo(st), 100)
    assert.equal(r.status, 'done')
    assert.equal(r.demo?.presenterId, null)
    assert.equal(r.demo?.durationMs, 0)
    assert.deepEqual(r.demo?.slides, [])
  }
})

test('끝난 회의는 그대로, 일반 회의는 실패로', () => {
  const d = demo('done')
  assert.equal(settleStaleMeeting(d, 100), d)
  assert.equal(settleStaleMeeting({ ...demo('running'), kind: undefined, demo: undefined }, 100).status, 'failed')
})

import { abortable, demoOutcome } from '../src/shared/gallery.ts'

test('끝내기 경합: 총평 도중 들어온 discard는 총평과 저장을 버리고, wrapup은 총평 없이 끝낸다', () => {
  const remark = { text: '좋았어요' }
  assert.deepEqual(demoOutcome('discard', remark), { status: 'stopped', remark: null, isSaved: false })
  assert.deepEqual(demoOutcome('wrapup', remark), { status: 'done', remark: null, isSaved: true })
  assert.deepEqual(demoOutcome(undefined, remark), { status: 'done', remark, isSaved: true })
})

test('끝내기(abort)가 오면 오래 걸리는 AI 대기를 바로 끊는다', async () => {
  const ac = new AbortController()
  const never = new Promise<string>(() => {})
  const t0 = Date.now()
  setTimeout(() => ac.abort(), 20)
  await assert.rejects(abortable(never, ac))
  assert.ok(Date.now() - t0 < 1000)
  await assert.rejects(abortable(never, ac)) // 이미 abort된 뒤에도 즉시 거절
})
