// B컴 쪽 (설계서 3·5·6절): A컴이 보낸 일을 받아 직원에게 시키고, 결과·결재 요청을 SSE로 알린다
// jobId를 수신함(DB)에 영구 저장하므로 B컴이 재시작했거나 A컴이 몇 시간 뒤 다시 보내도 같은 일을 두 번 실행하지 않는다 (설계서 6-2)
// 모든 호출은 슬롯(어느 A컴 토큰인지)에 묶인다 — 다른 슬롯의 일·결재는 건드리지 못한다

import { isJobId, isPeerJobActive, PEER_LIMITS, type PeerApprovalEvent, type PeerJobEvent, type PeerJobRequest, type PeerStaffBrief } from '../../shared/peerProtocol.ts'
import type { Attachment } from '../../shared/types'
import type { InboxJob, PeerStore, PeerUpload } from './peerStore'
import { redactPeerDeep, redactPeerText } from './redact.ts'

export interface PeerHostOffice {
  /** 피어에 보여 줄 얇은 직원 목록 */
  staffBriefs(): PeerStaffBrief[]
  /** 일을 직원에게 시킨다. 이 일의 결과는 PeerHost.finish/fail로 돌아온다 */
  startJob(job: InboxJob): 'ok' | 'no_staff' | 'auto_edit' | 'busy' | 'no_workspace'
  cancelJob(job: InboxJob): void
  decide(approvalId: string, allow: boolean): boolean
  answerQuestion(approvalId: string, answers: Record<string, string>): boolean
  /** 지금 결재를 기다리는 피어 일의 결재들 (jobId가 붙은 것만) */
  pendingApprovals(): PeerApprovalEvent[]
  /** 이 결재가 어느 피어 일의 것인지 (피어 일이 아니면 null) */
  approvalJob(approvalId: string): string | null
}

export interface PeerHostDeps {
  store: PeerStore
  office: PeerHostOffice
  /** 그 슬롯의 SSE 연결에 이벤트를 보낸다 */
  publish(slotId: string, event: 'job' | 'approval', data: unknown): void
  now?(): number
  /** 이 슬롯이 올려 둔(commit까지 끝난) 복사본인가 — 아니면 그 workspaceId로는 일을 받지 않는다 (남의 복사본·없는 복사본 거절) */
  workspaceReady?(workspaceId: string, slotId: string): boolean
  /** A컴이 일을 확인(ack)했다 — 복사본·변경 묶음을 정리할 때 */
  onAcked?(job: InboxJob): void
  /** 피어가 올린 첨부를 B컴 첨부 저장소에 넣는다 (휴대폰 올리기와 같은 함수). 없으면 첨부 올리기는 404 */
  saveUpload?(name: string, mime: string, data: Buffer): Attachment
  /** 일에 쓰이지 않은 채 정리되는 첨부 파일을 지운다 */
  removeUpload?(id: string): void
}

export type HostResult = { status: number; body: Record<string, unknown> }
const err = (status: number, error: string, message = ''): HostResult => ({ status, body: { error, ...(message ? { message } : {}) } })

/** 전송 경계: 결재 글에서 절대 경로·토큰형 문자열을 가린다 */
const safeApproval = (ev: PeerApprovalEvent): PeerApprovalEvent => ({ ...ev, summary: redactPeerText(ev.summary), ...(ev.summaryI18n !== undefined ? { summaryI18n: redactPeerDeep(ev.summaryI18n) } : {}), ...(ev.questions !== undefined ? { questions: redactPeerDeep(ev.questions) } : {}) })

const view = (j: InboxJob): PeerJobEvent => ({ jobId: j.id, state: j.state, ...(j.result !== undefined ? { result: j.result } : {}), ...(j.error ? { error: j.error } : {}), ...(j.changesetId ? { changesetId: j.changesetId } : {}) })

export class PeerHost {
  private d: PeerHostDeps
  /** 슬롯별로 A컴이 지켜보려고 고른 직원 */
  private watched = new Map<string, Set<string>>()

  constructor(d: PeerHostDeps) {
    this.d = d
  }

  private now() {
    return this.d.now?.() ?? Date.now()
  }

  staff(): PeerStaffBrief[] {
    return this.d.office.staffBriefs().map((b) => (b.thought ? { ...b, thought: redactPeerText(b.thought) } : b))
  }

  watch(slotId: string, staffIds: unknown): HostResult {
    if (!Array.isArray(staffIds) || staffIds.length > 200 || staffIds.some((x) => typeof x !== 'string')) return err(400, 'invalid_request')
    this.watched.set(slotId, new Set(staffIds as string[]))
    return { status: 200, body: { ok: true } }
  }

  isWatched(slotId: string, staffId: string) {
    return this.watched.get(slotId)?.has(staffId) ?? false
  }

  /** 이 슬롯이 지켜보는 직원 id 전체 (snapshot 사영에 쓴다) */
  watchedBy(slotId: string) {
    return this.watched.get(slotId) ?? new Set<string>()
  }

  /** 일 받기. 같은 jobId는 새로 만들지 않고 현재 상태를 돌려준다 */
  accept(slotId: string, body: unknown): HostResult {
    const r = body as Partial<PeerJobRequest> | null
    if (!r || typeof r !== 'object' || !isJobId(r.jobId) || typeof r.staffId !== 'string' || typeof r.instruction !== 'string' || !r.instruction.trim()) return err(400, 'invalid_request')
    if (r.instruction.length > PEER_LIMITS.instructionMax) return err(400, 'invalid_request', 'instruction_too_long')
    const old = this.d.store.inbox.get(r.jobId)
    if (old) {
      // 다른 슬롯이 같은 id로 보낸 것은 남의 일이다
      if (old.slotId !== slotId) return err(404, 'job_not_found')
      return { status: 200, body: view(old) as unknown as Record<string, unknown> }
    }
    const workspaceId = typeof r.workspaceId === 'string' ? r.workspaceId.slice(0, 100) : undefined
    if (workspaceId && !(this.d.workspaceReady?.(workspaceId, slotId) ?? false)) return err(404, 'workspace_not_found')
    // 첨부: 이 슬롯이 올린 id만 일에 붙인다 (남의 id·모르는 id는 버리고 수만 기록해 지시에 안내)
    const ids = r.attachmentIds
    if (ids !== undefined && (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string'))) return err(400, 'invalid_request')
    if (ids && ids.length > PEER_LIMITS.attachmentsPerJob) return err(400, 'invalid_request', 'too_many_attachments')
    const attachments: Attachment[] = []
    for (const id of new Set(ids ?? [])) {
      const up = this.d.store.uploads.get(id)
      if (up && up.slotId === slotId) attachments.push(up.attachment)
    }
    const dropped = new Set(ids ?? []).size - attachments.length
    const lead = { name: String(r.lead?.name ?? '').slice(0, 60), role: String(r.lead?.role ?? '').slice(0, 60) }
    const job: InboxJob = {
      id: r.jobId,
      slotId,
      staffId: r.staffId,
      instruction: r.instruction,
      lead,
      ...(r.lab && typeof r.lab.name === 'string' ? { lab: { name: r.lab.name.slice(0, 100), ...(typeof r.lab.goal === 'string' ? { goal: r.lab.goal.slice(0, 500) } : {}) } } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      ...(r.isAutonomous === true ? { isAutonomous: true } : {}),
      ...(attachments.length ? { attachments } : {}),
      ...(dropped ? { droppedAttachments: dropped } : {}),
      state: 'accepted',
      createdAt: this.now(),
    }
    this.d.store.inbox.put(job)
    const started = this.d.office.startJob(job)
    if (started === 'no_staff') {
      this.d.store.inbox.delete(job.id)
      return err(404, 'staff_not_found')
    }
    if (started === 'auto_edit') {
      this.d.store.inbox.delete(job.id)
      return err(422, 'peer_auto_edit', '그 직원은 파일 수정을 결재 없이 하는 설정이라 원격 일을 받을 수 없어요')
    }
    if (started === 'no_workspace') {
      this.d.store.inbox.delete(job.id)
      return err(404, 'workspace_not_found')
    }
    if (started === 'busy') {
      // 그 직원이 로컬 일을 하는 중 — 받지 않고 A컴 큐가 잠시 뒤 같은 jobId로 다시 보내게 한다 (503은 재시도 대상)
      this.d.store.inbox.delete(job.id)
      return err(503, 'staff_busy', '그 직원이 이 PC의 다른 일을 하는 중이에요. 잠시 뒤 다시 보낼게요')
    }
    this.d.store.inbox.put({ ...job, state: 'running' })
    for (const a of attachments) {
      const up = this.d.store.uploads.get(a.id)
      if (up) this.d.store.uploads.put({ ...up, usedBy: job.id })
    }
    return { status: 202, body: { jobId: job.id, state: 'running' } }
  }

  /** 첨부 받기 (PUT /v2/peer/attachments): 저장하고 올린 슬롯을 기록한다. 응답에는 B컴 경로를 싣지 않는다 */
  upload(slotId: string, name: string, mime: string, data: Buffer): HostResult {
    if (!this.d.saveUpload) return err(404, 'not_found')
    if (data.length > PEER_LIMITS.attachmentMax) return err(413, 'payload_too_large')
    this.pruneUploads()
    // 슬롯마다 아직 일에 쓰이지 않은 첨부의 수·용량 상한 — 넘으면 A컴은 그 첨부 없이 일을 보낸다 (413은 다시 보내지 않는 거절)
    const pending = this.d.store.uploads.list().filter((u) => u.slotId === slotId && !u.usedBy)
    const pendingBytes = pending.reduce((n, u) => n + u.attachment.size, 0)
    if (pending.length >= PEER_LIMITS.uploadsPendingMax || pendingBytes + data.length > PEER_LIMITS.uploadsPendingBytesMax) return err(413, 'upload_quota_exceeded')
    let saved: Attachment
    try {
      saved = this.d.saveUpload(name, mime, data)
    } catch (e) {
      // 디스크가 가득 찼거나 첨부 폴더에 쓸 수 없다 — 경로가 섞인 원문은 보내지 않는다 (507은 A컴이 다시 시도한다)
      return (e as NodeJS.ErrnoException)?.code === 'ENOSPC' ? err(507, 'insufficient_storage') : err(500, 'call_failed')
    }
    this.d.store.uploads.put({ id: saved.id, slotId, attachment: saved, createdAt: this.now() })
    return { status: 201, body: { attachment: { id: saved.id, name: saved.name, mime: saved.mime, size: saved.size } } }
  }

  /** 오래된 첨부 기록을 지운다. 일에 쓰이지 않은 첨부는 파일도 지운다 (쓰인 파일은 받은 일·기록이 가리키므로 남긴다) */
  private pruneUploads() {
    const now = this.now()
    for (const u of this.d.store.uploads.list()) if (now - u.createdAt > PEER_LIMITS.attachmentKeepMs) this.dropUpload(u)
  }

  private dropUpload(u: PeerUpload) {
    this.d.store.uploads.delete(u.id)
    if (!u.usedBy) this.d.removeUpload?.(u.id)
  }

  /** 미완료 일 일괄 조회 (재연결 따라잡기) */
  jobs(slotId: string, ids: unknown): HostResult {
    const list = typeof ids === 'string' ? ids.split(',').filter(isJobId).slice(0, 50) : []
    const jobs = list.map((id) => this.d.store.inbox.get(id)).filter((j): j is InboxJob => Boolean(j) && j!.slotId === slotId).map(view)
    return { status: 200, body: { jobs } }
  }

  cancel(slotId: string, jobId: string): HostResult {
    const j = this.d.store.inbox.get(jobId)
    if (!j || j.slotId !== slotId) return err(404, 'job_not_found')
    if (!isPeerJobActive(j.state)) return { status: 200, body: view(j) as unknown as Record<string, unknown> }
    // 상태를 먼저 닫는다 — 세션을 멈추면 "중단됨"이 fail로 돌아오는데 그때는 이미 끝난 일이라 무시된다
    const next: InboxJob = { ...j, state: 'canceled', finishedAt: this.now() }
    this.d.store.inbox.put(next)
    this.d.office.cancelJob(j)
    this.d.onAcked?.(next) // 취소된 일의 복사본·변경 묶음도 정리한다
    this.d.publish(slotId, 'job', view(next))
    return { status: 200, body: view(next) as unknown as Record<string, unknown> }
  }

  ack(slotId: string, jobId: string): HostResult {
    const j = this.d.store.inbox.get(jobId)
    if (!j || j.slotId !== slotId) return err(404, 'job_not_found')
    this.d.store.inbox.put({ ...j, ackedAt: this.now() })
    this.d.onAcked?.(j)
    return { status: 200, body: { ok: true } }
  }

  getJob(jobId: string) {
    return this.d.store.inbox.get(jobId)
  }

  /** 직원이 일을 끝냈다 (Office가 부른다). 끝난 일은 한 번만 */
  finish(jobId: string, summary: string, changesetId?: string) {
    this.settle(jobId, 'done', { result: redactPeerText(summary).slice(0, PEER_LIMITS.resultMax), ...(changesetId ? { changesetId } : {}) })
  }

  fail(jobId: string, error: string) {
    this.settle(jobId, 'failed', { error: redactPeerText(error).slice(0, 500) })
  }

  private settle(jobId: string, state: 'done' | 'failed', info: Partial<InboxJob>) {
    const j = this.d.store.inbox.get(jobId)
    if (!j || !isPeerJobActive(j.state)) return
    const next: InboxJob = { ...j, ...info, state, finishedAt: this.now() }
    this.d.store.inbox.put(next)
    this.d.publish(j.slotId, 'job', view(next))
  }

  // ── 결재 ──

  /** 결재가 생겼다: 피어 일의 것이면 그 슬롯에 알린다 */
  onApproval(ev: PeerApprovalEvent) {
    const j = this.d.store.inbox.get(ev.jobId)
    if (j) this.d.publish(j.slotId, 'approval', safeApproval(ev))
  }

  onApprovalGone(approvalId: string, jobId: string) {
    const j = this.d.store.inbox.get(jobId)
    if (j) this.d.publish(j.slotId, 'approval', { approvalId, gone: true })
  }

  approvals(slotId: string): HostResult {
    const list = this.d.office.pendingApprovals().filter((e) => this.d.store.inbox.get(e.jobId)?.slotId === slotId)
    return { status: 200, body: { approvals: list.map(safeApproval) } }
  }

  /** 피어 토큰으로 온 결재 처리 — 그 슬롯이 보낸 일의 결재만 (설계서 8-1) */
  decide(slotId: string, method: 'decide' | 'answerQuestion', args: unknown[]): HostResult {
    const id = args[0]
    if (typeof id !== 'string') return err(400, 'invalid_args')
    const jobId = this.d.office.approvalJob(id)
    const job = jobId ? this.d.store.inbox.get(jobId) : undefined
    if (!job || job.slotId !== slotId) {
      // 이미 B컴 앞에서 처리돼 사라진 결재면 같은 응답으로 알려 준다 (카드를 닫게)
      return { status: 200, body: { ok: true, result: false, alreadyDecided: true } }
    }
    const done = method === 'decide' ? this.d.office.decide(id, args[1] === true) : this.d.office.answerQuestion(id, (args[1] ?? {}) as Record<string, string>)
    return { status: 200, body: done ? { ok: true, result: true } : { ok: true, result: false, alreadyDecided: true } }
  }

  /** 슬롯이 사라졌다 (B컴에서 해제·A컴이 unpair): 그 슬롯의 진행 중 일을 취소한다 */
  dropSlot(slotId: string) {
    this.watched.delete(slotId)
    for (const u of this.d.store.uploads.list()) if (u.slotId === slotId) this.dropUpload(u)
    for (const j of this.d.store.inbox.list()) {
      if (j.slotId !== slotId) continue
      if (isPeerJobActive(j.state)) {
        this.d.store.inbox.put({ ...j, state: 'canceled', finishedAt: this.now() })
        this.d.office.cancelJob(j)
      }
    }
  }

  /** 오래된 수신함 정리: ack 뒤 30일, ack 없이 90일 */
  prune() {
    const now = this.now()
    for (const j of this.d.store.inbox.list()) {
      if (!j.finishedAt) continue
      const limit = j.ackedAt ? PEER_LIMITS.inboxAckedKeepMs : PEER_LIMITS.inboxKeepMs
      if (now - j.finishedAt > limit) this.d.store.inbox.delete(j.id)
    }
    this.pruneUploads()
  }

  /** 앱을 켤 때: 실행 중이라던 일은 그 세션이 사라졌으니 실패로 닫는다 (같은 일을 다시 실행하지는 않는다) */
  recover() {
    for (const j of this.d.store.inbox.list()) {
      if (isPeerJobActive(j.state)) this.d.store.inbox.put({ ...j, state: 'failed', error: 'interrupted', finishedAt: this.now() })
    }
  }
}

/**
 * 피어 슬롯 연결에 보낼 snapshot: 그 A컴이 고른 직원의 줄인 정보만 (허용 목록 사영 — 모르는 필드는 새어 나가지 않는다)
 * 직원 목록 밖(회사 상태·업무·설정·금액)은 아무것도 보내지 않는다
 */
export function peerSnapshotShape(snapshot: unknown, watched: ReadonlySet<string>): { staff: PeerStaffBrief[] } {
  const list = (snapshot as { staff?: unknown })?.staff
  const staff: PeerStaffBrief[] = []
  if (Array.isArray(list)) {
    for (const s of list as Record<string, unknown>[]) {
      if (typeof s?.id !== 'string' || !watched.has(s.id)) continue
      staff.push({
        id: s.id,
        name: String(s.name ?? ''),
        role: String(s.role ?? ''),
        avatar: Number(s.avatar ?? 0),
        provider: String(s.provider ?? 'claude'),
        model: String(s.model ?? ''),
        status: String(s.status ?? 'idle'),
        ...(typeof s.activity === 'string' && s.activity ? { thought: redactPeerText(s.activity).slice(0, 200) } : {}),
      })
    }
  }
  return { staff }
}
