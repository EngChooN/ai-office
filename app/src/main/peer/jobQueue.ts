// A컴의 일 큐 (설계서 3·6절): 일을 DB에 먼저 저장하고, 연결되면 원격 직원별 순서대로 B컴에 보내고, 결과를 [팀원 보고]로 돌려준다
// 같은 일을 두 번 보내지 않는다: ① Idempotency-Key=jobId ② B컴이 jobId를 영구 저장 ③ A컴의 상태 기록 (재시작 때 sending → queued)
// 네트워크(PeerHttp)·시계·타이머는 밖에서 넣어 준다 — 테스트가 가짜를 넣는다

import crypto from 'node:crypto'
import { isPermanentPeerStatus, isPeerJobActive, PEER_LIMITS, PEER_PATHS, type PeerJobEvent, type PeerJobRequest, type PeerJobState, type PeerLinkState } from '../../shared/peerProtocol.ts'
import type { PeerHttp } from './peerTransport'
import type { PeerJob, PeerOutbox, PeerStore } from './peerStore'

export class PeerQueueError extends Error {
  code: 'queue_full' | 'too_long' | 'peer_missing'
  constructor(code: PeerQueueError['code']) {
    super(code)
    this.name = 'PeerQueueError'
    this.code = code
  }
}

export interface JobQueueDeps {
  store: PeerStore
  /** 피어에 붙은 호출 통로 (짝짓기가 풀렸거나 토큰을 못 읽으면 null) */
  http(peerId: string): PeerHttp | null
  linkState(peerId: string): PeerLinkState
  /** 리더에게 [팀원 보고]를 낸다 (대표 직접 지시면 leadId가 null) */
  onReport(job: PeerJob): void
  /** 화면에 다시 보낼 상태가 바뀜 */
  onChange(): void
  /** 보낼 때 같이 보낼 맥락 (리더 이름·역할, 랩) */
  context(job: PeerJob): Pick<PeerJobRequest, 'lead' | 'lab'>
  now?(): number
  schedule?(ms: number, fn: () => void): { cancel(): void }
  newId?(): string
}

type Pending = Omit<PeerJob, 'id' | 'state' | 'attempts' | 'nextTryAt' | 'createdAt'>

type Finished = 'done' | 'failed' | 'canceled'
const isFinished = (s: PeerJobState): s is Finished => s === 'done' || s === 'failed' || s === 'canceled'
const delayFor = (attempts: number) => PEER_LIMITS.retryMs[Math.min(Math.max(attempts - 1, 0), PEER_LIMITS.retryMs.length - 1)]

export class JobQueue {
  private d: JobQueueDeps
  private pumping = new Set<string>()
  private timers = new Map<string, { cancel(): void }>()

  constructor(d: JobQueueDeps) {
    this.d = d
  }

  private now() {
    return this.d.now?.() ?? Date.now()
  }

  private put(job: PeerJob) {
    this.d.store.jobs.put(job)
    this.d.onChange()
  }

  list(peerId?: string) {
    return this.d.store.jobs.list().filter((j) => !peerId || j.peerId === peerId).sort((a, b) => a.createdAt - b.createdAt)
  }

  get(id: string) {
    return this.d.store.jobs.get(id)
  }

  /** 대기·진행 중인 일 수 (연결 대기 표시) */
  queuedCount(peerId: string) {
    return this.list(peerId).filter((j) => j.state === 'queued' || j.state === 'sending').length
  }

  /** 앱을 켤 때: 보내던 중이던 일은 queued로 되돌린다 (같은 jobId로 다시 보내므로 안전) */
  recover() {
    for (const j of this.list()) if (j.state === 'sending') this.d.store.jobs.put({ ...j, state: 'queued', nextTryAt: 0 })
  }

  /** 일을 저장하고 곧 보내 본다. 저장이 끝난 뒤에만 돌려주므로 "맡겼어요"라고 답해도 된다 */
  enqueue(p: Pending): PeerJob {
    if (p.instruction.length > PEER_LIMITS.instructionMax) throw new PeerQueueError('too_long')
    if (this.queuedCount(p.peerId) >= PEER_LIMITS.queueMax) throw new PeerQueueError('queue_full')
    const job: PeerJob = { ...p, id: this.d.newId?.() ?? crypto.randomUUID(), state: 'queued', attempts: 0, nextTryAt: 0, createdAt: this.now() }
    this.put(job)
    void this.pump(job.peerId)
    return job
  }

  // ── 보내기 ──

  /** 이 피어에 보낼 수 있는 것을 순서대로 보낸다 (한 번에 한 번만 돈다) */
  async pump(peerId: string) {
    if (this.pumping.has(peerId)) return
    this.pumping.add(peerId)
    try {
      this.expire(peerId)
      await this.pumpOutbox(peerId)
      await this.pumpJobs(peerId)
    } finally {
      this.pumping.delete(peerId)
    }
  }

  private expire(peerId: string) {
    const now = this.now()
    for (const j of this.list(peerId)) {
      if (j.state === 'queued' && now - j.createdAt > PEER_LIMITS.queueTtlMs) this.finish(j, 'failed', { error: 'expired' })
    }
  }

  private async pumpJobs(peerId: string) {
    for (const first of this.list(peerId)) {
      const j = this.d.store.jobs.get(first.id)
      if (!j || j.state !== 'queued') continue
      if (j.nextTryAt > this.now()) return this.retryLater(peerId, j.nextTryAt - this.now())
      const http = this.d.http(peerId)
      if (!http) return
      // 보내는 순간부터 sending — 앱이 죽어도 시작할 때 queued로 되돌려 같은 jobId로 다시 보낸다
      this.put({ ...j, state: 'sending', sentAt: this.now() })
      const req: PeerJobRequest = { jobId: j.id, staffId: j.remoteStaffId, instruction: j.instruction, ...this.d.context(j), ...(j.workspaceId ? { workspaceId: j.workspaceId } : {}), ...(j.isAutonomous ? { isAutonomous: true } : {}) }
      let res: Awaited<ReturnType<PeerHttp['call']>>
      try {
        res = await http.call('POST', PEER_PATHS.jobs, req, { idempotencyKey: j.id })
      } catch {
        // 네트워크 끊김: queued로 돌리고 순서를 지키려고 여기서 멈춘다 (연결이 돌아오면 onOnline이 다시 돈다)
        const attempts = j.attempts + 1
        this.put({ ...j, state: 'queued', attempts, nextTryAt: this.now() + delayFor(attempts) })
        return this.retryLater(peerId, delayFor(attempts))
      }
      const cur = this.d.store.jobs.get(j.id)
      // 보내는 동안 취소·완료 이벤트가 이미 닫았으면 그대로 둔다
      if (!cur || cur.state !== 'sending') continue
      if (res.status === 200 || res.status === 202) {
        const state = typeof res.body.state === 'string' ? (res.body.state as PeerJobState) : 'accepted'
        this.applyState(cur, normalize(state), res.body as Partial<PeerJobEvent>)
      } else if (isPermanentPeerStatus(res.status)) {
        this.finish(cur, 'failed', { error: String(res.body.error ?? res.body.message ?? `http_${res.status}`) })
      } else {
        // 409 in_progress·429·5xx: 잠시 뒤 다시
        const attempts = cur.attempts + 1
        this.put({ ...cur, state: 'queued', attempts, nextTryAt: this.now() + delayFor(attempts) })
        return this.retryLater(peerId, delayFor(attempts))
      }
    }
  }

  private async pumpOutbox(peerId: string) {
    const items = this.d.store.outbox.list().filter((o) => o.peerId === peerId).sort((a, b) => a.createdAt - b.createdAt)
    for (const o of items) {
      if (o.nextTryAt > this.now()) return this.retryLater(peerId, o.nextTryAt - this.now())
      const http = this.d.http(peerId)
      if (!http) return
      const { method, path } = outboxCall(o)
      try {
        const res = await http.call(method, path, o.payload, { idempotencyKey: o.key })
        // 이미 처리됨(409)·없음(404)도 끝난 것으로 본다 — 몇 번 불러도 결과가 같은 호출들
        if (res.status < 500 && res.status !== 429 && !(res.status === 409 && res.body.error === 'in_progress')) this.d.store.outbox.delete(o.id)
        else throw new Error(`retry ${res.status}`)
      } catch {
        const attempts = o.attempts + 1
        this.d.store.outbox.put({ ...o, attempts, nextTryAt: this.now() + delayFor(attempts) })
        return this.retryLater(peerId, delayFor(attempts))
      }
    }
  }

  private retryLater(peerId: string, ms: number) {
    this.timers.get(peerId)?.cancel()
    const fn = () => {
      this.timers.delete(peerId)
      void this.pump(peerId)
    }
    const t = this.d.schedule ? this.d.schedule(Math.max(ms, 0), fn) : (() => {
      const h = setTimeout(fn, Math.max(ms, 0))
      h.unref?.()
      return { cancel: () => clearTimeout(h) }
    })()
    this.timers.set(peerId, t)
  }

  /** 보낼 것(결재 결정·취소·ack)을 쌓는다. 같은 키가 이미 있으면 새로 쌓지 않는다 */
  enqueueOutbox(peerId: string, kind: PeerOutbox['kind'], key: string, payload: Record<string, unknown>) {
    if (this.d.store.outbox.list().some((o) => o.peerId === peerId && o.key === key)) return
    this.d.store.outbox.put({ id: crypto.randomUUID(), peerId, kind, key, payload, createdAt: this.now(), attempts: 0, nextTryAt: 0 })
    void this.pump(peerId)
  }

  outboxCount(peerId: string) {
    return this.d.store.outbox.list().filter((o) => o.peerId === peerId).length
  }

  // ── 연결이 붙었을 때 / 이벤트 ──

  /** 다시 붙었다: 미완료 일을 일괄 조회해 놓친 결과를 따라잡고, 대기 중인 것을 보낸다 */
  async onOnline(peerId: string) {
    const http = this.d.http(peerId)
    if (http) await this.reconcile(peerId, http)
    await this.pump(peerId)
  }

  private async reconcile(peerId: string, http: PeerHttp) {
    // 이미 B컴에 닿았을 수 있는 일(sending 포함)만 묻는다 — queued는 B컴이 모른다
    const ids = this.list(peerId).filter((j) => j.state === 'sending' || j.state === 'accepted' || j.state === 'running').map((j) => j.id)
    for (let i = 0; i < ids.length; i += 50) {
      try {
        const res = await http.call('GET', `${PEER_PATHS.jobs}?ids=${ids.slice(i, i + 50).join(',')}`)
        if (res.status !== 200 || !Array.isArray(res.body.jobs)) continue
        const seen = new Set<string>()
        for (const ev of res.body.jobs as PeerJobEvent[]) {
          seen.add(ev.jobId)
          this.onJobEvent(peerId, ev)
        }
        // B컴이 모른다고 하는 일(수신함이 지워짐): sending이었으면 다시 보내고, 이미 접수됐던 일이면 실패로 닫는다
        for (const id of ids.slice(i, i + 50)) {
          if (seen.has(id)) continue
          const j = this.d.store.jobs.get(id)
          if (!j) continue
          if (j.state === 'sending') this.put({ ...j, state: 'queued', nextTryAt: 0 })
          else if (isPeerJobActive(j.state)) this.finish(j, 'failed', { error: 'lost' })
        }
      } catch {
        // 조회 실패: 다음 연결 때 다시
      }
    }
  }

  /** B컴이 보낸 일 상태 (SSE job 이벤트·일괄 조회 응답). 모르는 일·다른 피어의 일은 버린다 (설계서 T4) */
  onJobEvent(peerId: string, ev: PeerJobEvent) {
    const j = this.d.store.jobs.get(ev.jobId)
    if (!j || j.peerId !== peerId) return
    this.applyState(j, normalize(ev.state), ev)
  }

  private applyState(j: PeerJob, state: PeerJobState, ev: Partial<PeerJobEvent>) {
    // 끝난 일은 되돌리지 않는다 (늦게 온 옛 이벤트)
    if (isFinished(j.state)) return
    if (isFinished(state)) return this.finish(j, state, { result: ev.result, error: ev.error, changesetId: ev.changesetId })
    // 단계는 앞으로만 간다 (accepted → running)
    const rank: Record<string, number> = { queued: 0, sending: 1, accepted: 2, running: 3 }
    if ((rank[state] ?? 0) < (rank[j.state] ?? 0) && j.state !== 'queued') return
    if (state !== j.state) this.put({ ...j, state })
  }

  private finish(j: PeerJob, state: 'done' | 'failed' | 'canceled', info: { result?: string; error?: string; changesetId?: string }) {
    const next: PeerJob = {
      ...j,
      state,
      finishedAt: this.now(),
      ...(info.result !== undefined ? { result: info.result.slice(0, PEER_LIMITS.resultMax) } : {}),
      ...(info.error ? { error: info.error.slice(0, 500) } : {}),
      ...(info.changesetId ? { changesetId: info.changesetId } : {}),
    }
    this.put(next)
    // 사용자가 직접 취소한 일은 보고하지 않는다. 그 밖의 끝(완료·실패·만료)은 한 번만 리더에게
    if (state !== 'canceled' && !next.isReported) {
      this.put({ ...next, isReported: true })
      this.d.onReport({ ...next, isReported: true })
      if (state === 'done') this.enqueueOutbox(j.peerId, 'ack', `ack:${j.id}`, { jobId: j.id })
    }
  }

  /** A컴에서 취소. queued면 바로 canceled, 이미 B컴에 갔으면 B컴에 취소를 보낸다 (못 닿으면 큐에 둔다) */
  cancel(jobId: string) {
    const j = this.d.store.jobs.get(jobId)
    if (!j || isFinished(j.state)) return false
    if (j.state === 'queued') this.finish(j, 'canceled', {})
    else {
      this.enqueueOutbox(j.peerId, 'cancel', `cancel:${j.id}`, { jobId: j.id })
      this.finish(j, 'canceled', {})
    }
    return true
  }

  /** 피어를 끊을 때: 진행 중인 일을 모두 취소됨으로 닫는다 */
  cancelAll(peerId: string) {
    for (const j of this.list(peerId)) if (isPeerJobActive(j.state)) this.finish(j, 'canceled', {})
  }

  /** 끝난 지 오래된 일을 지운다 (보관 30일) */
  prune(olderThanMs = PEER_LIMITS.inboxAckedKeepMs) {
    const now = this.now()
    for (const j of this.list()) if (j.finishedAt && now - j.finishedAt > olderThanMs) this.d.store.jobs.delete(j.id)
  }

  dispose() {
    for (const t of this.timers.values()) t.cancel()
    this.timers.clear()
  }
}

/** B컴이 쓰는 상태 이름을 A컴 상태로 (모르는 값은 accepted) */
function normalize(s: string): PeerJobState {
  return (['queued', 'sending', 'accepted', 'running', 'done', 'failed', 'canceled'] as const).includes(s as PeerJobState) ? (s as PeerJobState) : 'accepted'
}

function outboxCall(o: PeerOutbox): { method: 'POST'; path: string } {
  const jobId = String(o.payload.jobId ?? '')
  if (o.kind === 'cancel') return { method: 'POST', path: `${PEER_PATHS.jobs}/${encodeURIComponent(jobId)}/cancel` }
  if (o.kind === 'ack') return { method: 'POST', path: `${PEER_PATHS.jobs}/${encodeURIComponent(jobId)}/ack` }
  if (o.kind === 'answer') return { method: 'POST', path: '/v2/call' }
  return { method: 'POST', path: '/v2/call' }
}
