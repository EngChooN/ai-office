// A컴의 일 큐(설계서 3·6절): 보내기·연결 대기·재전송(중복 금지)·결과 회수·[팀원 보고]·취소·만료
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JobQueue, PeerQueueError, type JobQueueDeps } from '../src/main/peer/jobQueue.ts'
import { memoryPeerStore, type PeerJob } from '../src/main/peer/peerStore.ts'
import type { PeerHttp, PeerHttpResponse } from '../src/main/peer/peerTransport.ts'
import { PEER_LIMITS, type PeerJobState } from '../src/shared/peerProtocol.ts'

const T0 = 1_800_000_000_000
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** 가짜 B컴: POST jobs를 받아 수신함에 jobId로 한 번만 만든다 (실제 PeerHost와 같은 규칙) */
function makeWorld(over: Partial<JobQueueDeps> = {}) {
  let now = T0
  let n = 0
  const store = memoryPeerStore()
  const inbox = new Map<string, { state: PeerJobState; result?: string }>()
  const sent: { method: string; path: string; body: any; key?: string }[] = []
  const reports: PeerJob[] = []
  let isUp = true
  let failNext: PeerHttpResponse[] = []
  const timers: { ms: number; fn: () => void }[] = []
  const http: PeerHttp = {
    call: async (method, path, body, opts) => {
      if (!isUp) throw new Error('ECONNREFUSED')
      sent.push({ method, path, body, key: opts?.idempotencyKey })
      const forced = failNext.shift()
      if (forced) return forced
      if (method === 'POST' && path === '/v2/peer/jobs') {
        const b = body as { jobId: string }
        const old = inbox.get(b.jobId)
        if (old) return { status: 200, body: { jobId: b.jobId, state: old.state } }
        inbox.set(b.jobId, { state: 'running' })
        return { status: 202, body: { jobId: b.jobId, state: 'running' } }
      }
      if (method === 'GET' && path.startsWith('/v2/peer/jobs?ids=')) {
        const ids = path.split('=')[1].split(',')
        return { status: 200, body: { jobs: ids.filter((i) => inbox.has(i)).map((i) => ({ jobId: i, ...inbox.get(i) })) } }
      }
      return { status: 200, body: { ok: true } }
    },
  }
  const q = new JobQueue({
    store,
    http: () => http,
    linkState: () => (isUp ? 'online' : 'offline'),
    onReport: (j) => reports.push(j),
    onChange: () => {},
    context: () => ({ lead: { name: '리더', role: '리드' } }),
    now: () => now,
    schedule: (ms, fn) => {
      const t = { ms, fn }
      timers.push(t)
      return { cancel: () => void timers.splice(timers.indexOf(t) >>> 0, 1) }
    },
    newId: () => UUID(++n),
    ...over,
  })
  const base = { peerId: 'p1', remoteStaffId: 'r1', leadId: 'lead', room: 'room1', instruction: '배포해 줘' }
  const settle = () => new Promise((r) => setImmediate(r))
  return { q, store, inbox, sent, reports, base, timers, settle, setUp: (v: boolean) => (isUp = v), advance: (ms: number) => (now += ms), failNext: (...r: PeerHttpResponse[]) => (failNext = r), http }
}

test('보내기: DB에 먼저 저장 → B컴에 Idempotency-Key=jobId로 전송 → accepted/running', async () => {
  const w = makeWorld()
  const job = w.q.enqueue(w.base)
  assert.equal(w.store.jobs.get(job.id)?.state, 'queued') // 저장이 먼저 (전송은 그 뒤)
  await w.settle()
  const post = w.sent.find((s) => s.path === '/v2/peer/jobs')!
  assert.equal(post.key, job.id)
  assert.deepEqual([post.body.jobId, post.body.staffId, post.body.instruction, post.body.lead], [job.id, 'r1', '배포해 줘', { name: '리더', role: '리드' }])
  assert.equal(w.q.get(job.id)?.state, 'running')
})

test('연결 대기: 끊긴 동안 준 일은 queued로 남고, 다시 연결되면 자동으로 한 번만 전달된다', async () => {
  const w = makeWorld()
  w.setUp(false)
  const job = w.q.enqueue(w.base)
  await w.settle()
  assert.equal(w.q.get(job.id)?.state, 'queued')
  assert.equal(w.q.queuedCount('p1'), 1)
  assert.equal(w.q.get(job.id)?.attempts, 1)
  assert.equal(w.inbox.size, 0)
  // 재시도 타이머가 걸려 있다 (1초)
  assert.equal(w.timers.at(-1)?.ms, PEER_LIMITS.retryMs[0])
  w.setUp(true)
  w.advance(PEER_LIMITS.retryMs[0] + 1)
  await w.q.onOnline('p1')
  assert.equal(w.q.get(job.id)?.state, 'running')
  assert.equal(w.inbox.size, 1)
  // 연결 이벤트가 또 와도 다시 보내지 않는다
  const posts = () => w.sent.filter((s) => s.method === 'POST' && s.path === '/v2/peer/jobs').length
  const before = posts()
  await w.q.onOnline('p1')
  assert.equal(posts(), before)
})

test('같은 일 두 번 금지: 응답을 못 받아 sending에서 끊겨도 같은 jobId로 다시 보내고 B컴은 새로 만들지 않는다', async () => {
  const w = makeWorld()
  // B컴은 일을 받았는데 응답이 A컴에 못 왔다고 가정: 수신함에만 넣고 네트워크 오류
  const job = w.q.enqueue(w.base)
  await w.settle()
  assert.equal(w.inbox.size, 1)
  // A컴이 응답 전에 죽은 것처럼 sending 상태로 되돌려 놓고 앱 재시작
  w.store.jobs.put({ ...w.q.get(job.id)!, state: 'sending' })
  w.q.recover()
  assert.equal(w.q.get(job.id)?.state, 'queued')
  await w.q.onOnline('p1')
  const posts = w.sent.filter((s) => s.path === '/v2/peer/jobs' && s.method === 'POST')
  assert.equal(new Set(posts.map((p) => p.body.jobId)).size, 1)
  assert.equal(w.inbox.size, 1) // 새 일이 생기지 않았다
  assert.equal(w.q.get(job.id)?.state, 'running')
})

test('연결이 다시 붙으면 B컴이 이미 끝낸 일의 결과를 일괄 조회로 따라잡는다', async () => {
  const w = makeWorld()
  const job = w.q.enqueue(w.base)
  await w.settle()
  w.setUp(false)
  w.inbox.set(job.id, { state: 'done', result: '배포 완료' }) // 끊긴 동안 B컴에서 끝남
  w.setUp(true)
  await w.q.onOnline('p1')
  const j = w.q.get(job.id)!
  assert.deepEqual([j.state, j.result], ['done', '배포 완료'])
  assert.equal(w.reports.length, 1)
})

test('결과 → [팀원 보고]는 한 번만 (SSE와 일괄 조회로 같은 결과가 두 번 와도)', async () => {
  const w = makeWorld()
  const job = w.q.enqueue(w.base)
  await w.settle()
  w.q.onJobEvent('p1', { jobId: job.id, state: 'done', result: '끝' })
  w.q.onJobEvent('p1', { jobId: job.id, state: 'done', result: '끝' })
  w.q.onJobEvent('p1', { jobId: job.id, state: 'running' }) // 늦게 온 옛 이벤트는 되돌리지 않는다
  assert.equal(w.reports.length, 1)
  assert.equal(w.reports[0].leadId, 'lead')
  assert.equal(w.reports[0].room, 'room1')
  assert.equal(w.q.get(job.id)?.state, 'done')
  // 확실히 처리한 뒤 ack를 보낸다
  await w.settle()
  assert.ok(w.sent.some((s) => s.path === `/v2/peer/jobs/${job.id}/ack`))
})

test('실패·만료도 리더에게 보고되고, 다른 피어·모르는 일의 이벤트는 버린다', async () => {
  const w = makeWorld()
  const job = w.q.enqueue(w.base)
  await w.settle()
  w.q.onJobEvent('other-peer', { jobId: job.id, state: 'done', result: '가짜' })
  w.q.onJobEvent('p1', { jobId: UUID(999), state: 'done', result: '가짜' })
  assert.equal(w.q.get(job.id)?.state, 'running')
  assert.equal(w.reports.length, 0)
  w.q.onJobEvent('p1', { jobId: job.id, state: 'failed', error: 'boom' })
  assert.deepEqual([w.q.get(job.id)?.state, w.reports[0].error], ['failed', 'boom'])
})

test('큐 수명 24시간: 연결 대기가 길어지면 failed(expired)로 닫고 리더에게 알린다', async () => {
  const w = makeWorld()
  w.setUp(false)
  const job = w.q.enqueue(w.base)
  await w.settle()
  w.advance(PEER_LIMITS.queueTtlMs + 1)
  await w.q.pump('p1')
  const j = w.q.get(job.id)!
  assert.deepEqual([j.state, j.error], ['failed', 'expired'])
  assert.equal(w.reports.length, 1)
})

test('한도: 피어당 대기 50건·지시 20,000자', () => {
  const w = makeWorld()
  w.setUp(false)
  for (let i = 0; i < PEER_LIMITS.queueMax; i++) w.q.enqueue(w.base)
  assert.throws(() => w.q.enqueue(w.base), (e: PeerQueueError) => e.code === 'queue_full')
  assert.throws(() => w.q.enqueue({ ...w.base, peerId: 'p2', instruction: 'x'.repeat(PEER_LIMITS.instructionMax + 1) }), (e: PeerQueueError) => e.code === 'too_long')
  // 다른 피어는 따로 센다
  assert.doesNotThrow(() => w.q.enqueue({ ...w.base, peerId: 'p2' }))
})

test('순서: 같은 피어의 일은 만든 순서대로 보내고, 앞 일이 막히면 뒤 일이 앞지르지 않는다', async () => {
  const w = makeWorld()
  w.setUp(false)
  const a = w.q.enqueue({ ...w.base, instruction: 'A' })
  w.advance(1)
  const b = w.q.enqueue({ ...w.base, instruction: 'B' })
  await w.settle()
  w.setUp(true)
  w.advance(60_000)
  await w.q.onOnline('p1')
  const order = w.sent.filter((s) => s.method === 'POST' && s.path === '/v2/peer/jobs').map((s) => s.body.instruction)
  assert.deepEqual(order.slice(-2), ['A', 'B'])
  assert.deepEqual([w.q.get(a.id)?.state, w.q.get(b.id)?.state], ['running', 'running'])
})

test('B컴이 일 자체를 거절(404·422)하면 다시 보내지 않고 failed, 5xx·429·409 in_progress는 다시 시도', async () => {
  const w = makeWorld()
  w.failNext({ status: 422, body: { error: 'peer_auto_edit' } })
  const bad = w.q.enqueue(w.base)
  await w.settle()
  assert.deepEqual([w.q.get(bad.id)?.state, w.q.get(bad.id)?.error], ['failed', 'peer_auto_edit'])
  assert.equal(w.reports.length, 1)

  for (const forced of [{ status: 503, body: {} }, { status: 429, body: {} }, { status: 409, body: { error: 'in_progress' } }]) {
    const w2 = makeWorld()
    w2.failNext(forced)
    const j = w2.q.enqueue(w2.base)
    await w2.settle()
    assert.equal(w2.q.get(j.id)?.state, 'queued', String(forced.status))
    assert.equal(w2.q.get(j.id)?.attempts, 1)
  }
})

test('취소: queued는 바로 canceled(보고 없음), B컴에 간 일은 취소 요청을 보낸다', async () => {
  const w = makeWorld()
  w.setUp(false)
  const a = w.q.enqueue(w.base)
  await w.settle()
  assert.equal(w.q.cancel(a.id), true)
  assert.equal(w.q.get(a.id)?.state, 'canceled')
  assert.equal(w.reports.length, 0)
  assert.equal(w.q.cancel(a.id), false)

  const w2 = makeWorld()
  const b = w2.q.enqueue(w2.base)
  await w2.settle()
  w2.q.cancel(b.id)
  await w2.settle()
  assert.ok(w2.sent.some((s) => s.path === `/v2/peer/jobs/${b.id}/cancel`))
  assert.equal(w2.q.get(b.id)?.state, 'canceled')
})

test('outbox: 결재 결정은 끊겨도 남아 있다가 같은 키로 한 번만 전달된다', async () => {
  const w = makeWorld()
  w.setUp(false)
  w.q.enqueueOutbox('p1', 'decide', 'appr:a1:true', { method: 'decide', args: ['a1', true] })
  w.q.enqueueOutbox('p1', 'decide', 'appr:a1:true', { method: 'decide', args: ['a1', true] }) // 같은 키는 한 번만 쌓인다
  await w.settle()
  assert.equal(w.q.outboxCount('p1'), 1)
  w.setUp(true)
  w.advance(60_000)
  await w.q.onOnline('p1')
  assert.equal(w.q.outboxCount('p1'), 0)
  const calls = w.sent.filter((s) => s.path === '/v2/call')
  assert.equal(calls.length, 1)
  assert.deepEqual([calls[0].key, calls[0].body], ['appr:a1:true', { method: 'decide', args: ['a1', true] }])
})

test('B컴 수신함이 지워져 모르는 일: sending이던 것은 다시 보내고, 이미 접수됐던 것은 failed(lost)', async () => {
  const w = makeWorld()
  const job = w.q.enqueue(w.base)
  await w.settle()
  assert.equal(w.q.get(job.id)?.state, 'running')
  w.inbox.clear()
  await w.q.onOnline('p1')
  assert.deepEqual([w.q.get(job.id)?.state, w.q.get(job.id)?.error], ['failed', 'lost'])
})

test('끝난 일 정리(prune)와 피어 해제(cancelAll)', async () => {
  const w = makeWorld()
  const a = w.q.enqueue(w.base)
  const b = w.q.enqueue({ ...w.base, peerId: 'p2' })
  await w.settle()
  w.q.cancelAll('p1')
  assert.equal(w.q.get(a.id)?.state, 'canceled')
  assert.equal(w.q.get(b.id)?.state, 'running')
  w.advance(PEER_LIMITS.inboxAckedKeepMs + 1)
  w.q.prune()
  assert.equal(w.q.get(a.id), undefined)
  assert.ok(w.q.get(b.id))
})

test('회귀(P2): 보내는 중 취소했는데 전송이 끊겨도 canceled를 queued로 되살리지 않고 B컴에 취소를 전한다', async () => {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const w = makeWorld()
  const real = w.http.call
  // POST jobs만 붙들어 두었다가 네트워크 오류로 끝낸다 (B컴에는 이미 접수됐을 수 있는 상황)
  w.http.call = async (method, path, body, opts) => {
    if (method === 'POST' && path === '/v2/peer/jobs') {
      await gate
      throw new Error('ECONNRESET')
    }
    return real(method, path, body, opts)
  }
  const job = w.q.enqueue(w.base)
  await w.settle()
  assert.equal(w.q.get(job.id)?.state, 'sending')
  w.q.cancel(job.id)
  release()
  await w.settle()
  await w.settle()
  assert.equal(w.q.get(job.id)?.state, 'canceled')
  assert.equal(w.store.outbox.list().filter((o) => o.kind === 'cancel' && o.payload.jobId === job.id).length, 1) // 한 번만
  assert.equal(w.q.queuedCount('p1'), 0)
})

test('queuedJobIds: 연결 대기 중인 일 id만, 직원별로 내려준다', async () => {
  const w = makeWorld()
  w.setUp(false)
  const a = w.q.enqueue(w.base)
  const b = w.q.enqueue({ ...w.base, remoteStaffId: 'r2' })
  await w.settle()
  assert.deepEqual(w.q.queuedJobIds('p1').sort(), [a.id, b.id].sort())
  assert.deepEqual(w.q.queuedJobIds('p1', 'r2'), [b.id])
  assert.deepEqual(w.q.queuedJobIds('p9'), [])
})
