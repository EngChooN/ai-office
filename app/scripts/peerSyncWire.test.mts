// 4번(파일 동기화)을 앱에 이은 곳: 일 큐의 복사본 전송·B컴 복사본 확인·변경 결재 카드
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApprovalRelay, changesApprovalId } from '../src/main/peer/approvalRelay.ts'
import { JobQueue, type JobQueueSync } from '../src/main/peer/jobQueue.ts'
import { PeerHost, type PeerHostOffice } from '../src/main/peer/peerHost.ts'
import { memoryPeerStore } from '../src/main/peer/peerStore.ts'
import type { PeerHttp } from '../src/main/peer/peerTransport.ts'
import { SyncError, type PeerChangesCard } from '../src/shared/peerSync.ts'

const WS = '33333333-3333-4333-8333-333333333333'
const CS = '44444444-4444-4444-8444-444444444444'
const J = '11111111-1111-4111-8111-111111111111'

function world(syncOver: Partial<JobQueueSync> = {}) {
  const store = memoryPeerStore()
  const posts: any[] = []
  const calls: string[] = []
  const http: PeerHttp = {
    call: async (method, path, body) => {
      calls.push(`${method} ${path}`)
      if (method === 'POST' && path === '/v2/peer/jobs') {
        posts.push(body)
        return { status: 202, body: { jobId: (body as any).jobId, state: 'running' } }
      }
      return { status: 200, body: { ok: true } }
    },
  }
  const log: string[] = []
  const sync: JobQueueSync = {
    prepare: async (root, peerId) => (log.push(`prepare:${root}:${peerId}`), { workspaceId: WS }),
    push: async (_h, id) => void log.push(`push:${id}`),
    discard: async (id) => void log.push(`discard:${id}`),
    ...syncOver,
  }
  let n = 0
  const q = new JobQueue({ store, http: () => http, linkState: () => 'online', onReport: () => {}, onChange: () => {}, context: () => ({ lead: { name: 'L', role: 'r' } }), newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, schedule: () => ({ cancel() {} }), sync })
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))
  }
  return { q, store, posts, calls, log, settle }
}
const base = { peerId: 'p1', remoteStaffId: 'r1', leadId: null, instruction: '고쳐 줘' }

test('일 큐: 복사본을 만들고 B컴에 올린 뒤에 일을 보낸다 (workspaceId가 요청에 실린다)', async () => {
  const w = world()
  const job = w.q.enqueue({ ...base, workspaceRoot: '/lab/proj' })
  await w.settle()
  assert.deepEqual(w.log, ['prepare:/lab/proj:p1', `push:${WS}`])
  assert.equal(w.posts.length, 1)
  assert.equal(w.posts[0].workspaceId, WS)
  assert.equal(w.q.get(job.id)?.isWorkspacePushed, true)
})

test('일 큐: 폴더가 너무 크거나 허용 밖이면 일을 막지 않고 복사본 없이 보내고 이유를 남긴다', async () => {
  const w = world({ prepare: async () => Promise.reject(new SyncError('workspace_too_large')) })
  const job = w.q.enqueue({ ...base, workspaceRoot: '/lab/huge' })
  await w.settle()
  assert.equal(w.posts.length, 1)
  assert.equal(w.posts[0].workspaceId, undefined)
  assert.equal(w.q.get(job.id)?.workspaceNote, 'workspace_too_large')
})

test('일 큐: 올리다 전송 오류가 나면 일은 보내지 않고 queued로 두어 다시 시도한다', async () => {
  const w = world({ push: async () => Promise.reject(new SyncError('transfer_failed', 'network')) })
  const job = w.q.enqueue({ ...base, workspaceRoot: '/lab/proj' })
  await w.settle()
  assert.equal(w.posts.length, 0)
  const j = w.q.get(job.id)!
  assert.deepEqual([j.state, j.attempts, j.workspaceId], ['queued', 1, WS])
})

test('일 큐: 변경 묶음이 딸린 완료는 ack를 미루고(ackJob이 부른다), 복사본 없는 완료는 바로 ack', async () => {
  const w = world()
  const a = w.q.enqueue({ ...base, workspaceRoot: '/lab/proj' })
  await w.settle()
  w.q.onJobEvent('p1', { jobId: a.id, state: 'done', result: '끝', changesetId: CS })
  assert.equal(w.store.outbox.list().filter((o) => o.kind === 'ack').length, 0)
  assert.equal(w.log.some((l) => l.startsWith('discard')), false) // 묶음을 받을 때까지 복사본 목록을 남긴다
  w.q.ackJob(a.id)
  assert.equal(w.store.outbox.list().filter((o) => o.kind === 'ack').length, 1)
  const b = w.q.enqueue({ ...base })
  await w.settle()
  w.q.onJobEvent('p1', { jobId: b.id, state: 'done', result: '끝' })
  assert.equal(w.store.outbox.list().filter((o) => o.kind === 'ack' && o.payload.jobId === b.id).length, 1)
})

test('일 큐: 실패·취소된 일의 복사본은 버린다', async () => {
  const w = world()
  const a = w.q.enqueue({ ...base, workspaceRoot: '/lab/proj' })
  await w.settle()
  w.q.cancel(a.id)
  await w.settle()
  assert.ok(w.log.includes(`discard:${WS}`))
})

function host(ready: boolean) {
  const store = memoryPeerStore()
  const acked: string[] = []
  const office: PeerHostOffice = { staffBriefs: () => [], startJob: () => 'ok', cancelJob: () => {}, decide: () => true, answerQuestion: () => true, pendingApprovals: () => [], approvalJob: () => null }
  const h = new PeerHost({ store, office, publish: () => {}, workspaceReady: (id, slot) => ready && id === WS && slot === 'slotA', onAcked: (j) => void acked.push(j.id) })
  return { h, acked }
}
const req = (extra = {}) => ({ jobId: J, staffId: 'kim', instruction: 'x', lead: { name: 'L', role: 'r' }, ...extra })

test('B컴: 복사본이 없거나 다른 슬롯의 것이면 그 workspaceId로는 일을 받지 않는다 (404)', () => {
  assert.equal(host(false).h.accept('slotA', req({ workspaceId: WS })).status, 404)
  assert.equal(host(true).h.accept('slotB', req({ workspaceId: WS })).status, 404)
  assert.equal(host(true).h.accept('slotA', req({ workspaceId: WS })).status, 202)
  assert.equal(host(true).h.accept('slotA', req()).status, 202) // 복사본 없는 일은 그대로
})

test('B컴: ack·취소 때 복사본 정리 갈고리가 불린다', () => {
  const { h, acked } = host(true)
  h.accept('slotA', req({ workspaceId: WS }))
  h.finish(J, '끝', CS)
  h.ack('slotA', J)
  assert.deepEqual(acked, [J])
})

const card = (files = 1): PeerChangesCard => ({ changesetId: CS, workspaceId: WS, jobId: J, rootName: 'proj', files: Array.from({ length: files }, (_, i) => ({ op: 'modify' as const, path: `a${i}.ts`, verdict: 'apply' as const, isSensitive: false })), counts: { add: 0, modify: files, delete: 0, conflict: 0, same: 0, sensitive: 0 }, bytes: 10, skipped: [] })

test('결재 카드: 변경 묶음 카드는 B컴 결재 대조·일 종료로 지워지지 않고, B컴으로 승인을 보내지 않는다', () => {
  const store = memoryPeerStore()
  const sent: string[] = []
  const relay = new ApprovalRelay({ store, send: (_p, _k, key) => void sent.push(key), peerName: () => 'B맥', onChange: () => {} })
  const id = relay.addChanges('p1', J, 'p:p1:kim', card(), '파일 변경 1개', 1)
  assert.equal(id, changesApprovalId('p1', CS))
  assert.equal(relay.addChanges('p1', J, 'p:p1:kim', card(), '또', 2), id) // 같은 묶음은 한 번만
  assert.equal(relay.approvalsOf('p:p1:kim')[0].toolName, 'PeerChanges')
  assert.equal(relay.approvalsOf('p:p1:kim')[0].peerChanges?.changesetId, CS)
  relay.reconcile('p1', []) // 재연결 대조
  relay.dropJob(J) // 일 종료
  assert.equal(relay.has(id), true)
  assert.equal(relay.decide(id, true), false) // 일반 결재 경로로는 B컴에 보내지 않는다
  assert.deepEqual(sent, [])
  relay.removeChanges('p1', CS)
  assert.equal(relay.has(id), false)
})
