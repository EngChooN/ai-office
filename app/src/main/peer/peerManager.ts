// A컴의 PC 간 연결 총괄 (설계서 1~6절): 짝짓기 → 원격 직원 → 일 맡기기 → 실시간 진행 → 결재 중계 → 연결 대기 큐
// PeerRegistry(기록)·PeerClient(연결)·JobQueue(큐)·ApprovalRelay(결재)를 묶고, Office에는 좁은 입구만 보인다 (PeerOfficePort)
// 네트워크는 deps.net으로 넣어 준다 — 테스트가 한 프로세스 안의 가짜 B컴이나 실제 서버(127.0.0.1)를 꽂는다

import {
  parsePeerStaffId,
  PEER_LIMITS,
  PEER_PATHS,
  type PeerApprovalEvent,
  type PeerJobEvent,
  type PeerLinkState,
  type PeerStaffBrief,
  type PeerView,
  type RemoteStaffChoice,
} from '../../shared/peerProtocol.ts'
import type { Approval, Staff } from '../../shared/types'
import { ApprovalRelay, parseRelayId } from './approvalRelay.ts'
import type { ApplyChoice, ApplyResult, CardFile, ChangeSetView, PeerChangesCard } from '../../shared/peerSync.ts'
import { droppedNames, JobQueue, PeerQueueError, type JobQueueSync } from './jobQueue.ts'
import { checkPairInput, pairWithHost, PairFailure, type PairTransport } from './pairing.ts'
import { PeerClient, type OpenStream, type PeerClientOptions } from './peerClient.ts'
import { PeerRegistry, type TokenVault } from './peerRegistry.ts'
import type { PeerJob, PeerRecord, PeerStore } from './peerStore'
import type { PeerHttp } from './peerTransport'

/** Office가 열어 주는 입구 (Office를 직접 import하지 않는다) */
export interface PeerOfficePort {
  /** 끝난 일을 리더에게 [팀원 보고]로 (leadId가 null이면 대표 직접 지시의 완료 알림) */
  report(job: PeerJob, info: { name: string; role: string; text: string }): void
  /** 화면에 다시 보낼 것이 바뀜 */
  changed(): void
  /** 리더 이름·역할, 랩 정보 */
  context(job: PeerJob): { lead: { name: string; role: string }; lab?: { name: string; goal?: string } }
  addToLab(labId: string, staffId: string): void
  removeFromLabs(staffIds: string[]): void
  /** 이 PC 이름 (짝지을 때 상대에게 알릴 이름) */
  ownName(): string
  /** 이 일에 복사본으로 보낼 A컴 폴더 (원격 직원이 든 랩의 프로젝트 폴더). 없으면 복사본 없이 일만 보낸다 */
  workspaceRoot?(leadId: string | null, targetStaffId: string): string | null
}

/** 4번(PeerSync)에서 A컴 쪽이 쓰는 것 — index.ts가 PeerSync를 이 모양으로 맞춰 꽂는다 */
export interface PeerSyncPort extends JobQueueSync {
  fetchChanges(http: PeerHttp, changesetId: string, workspaceId: string): Promise<ChangeSetView>
  card(view: ChangeSetView): Promise<PeerChangesCard>
  detail(changesetId: string): Promise<PeerChangesCard>
  apply(changesetId: string, choice: ApplyChoice): Promise<ApplyResult>
  /** 반영을 기다리는 변경 묶음 (앱을 다시 켰을 때 카드를 되살린다) */
  pending(): { changesetId: string; workspaceId: string; jobId: string; peerId?: string }[]
}

export interface PeerNet {
  pair(host: string, port: number): PairTransport
  http(peer: PeerRecord, token: string): PeerHttp
  stream(peer: PeerRecord, token: string): OpenStream
}

export interface PeerManagerDeps {
  store: PeerStore
  vault: TokenVault
  office: PeerOfficePort
  net: PeerNet
  now?(): number
  /** 짝지을 수 있는 주소인지 (기본: Tailscale·사설·*.ts.net). 테스트가 127.0.0.1을 허용하려고 바꾼다 */
  isHostAllowed?(host: string): boolean
  /** 테스트용: 재연결 지연·offline 판정 시간 */
  clientOptions?: Pick<PeerClientOptions, 'retryMs' | 'offlineAfterMs' | 'idleMs'>
  schedule?: ConstructorParameters<typeof JobQueue>[0]['schedule']
  /** 문구 (화면 언어로) */
  text(key: 'tag' | 'failed' | 'expired' | 'lost' | 'interrupted' | 'changes' | 'changesFailed' | 'changesSummary' | 'noWorkspace' | 'attachDropped' | 'attachFailed', params?: Record<string, string | number>): string
  /** 파일 복사본·변경 묶음 (4번) — 없으면 파일 동기화 없이 일만 오간다 */
  sync?: PeerSyncPort
}

export class PeerError extends Error {
  code: 'unknown_peer' | 'no_staff' | 'auto_edit' | 'offline' | 'queue_full' | 'too_long' | 'gone'
  constructor(code: PeerError['code']) {
    super(code)
    this.name = 'PeerError'
    this.code = code
  }
}

export class PeerManager {
  readonly registry: PeerRegistry
  readonly queue: JobQueue
  readonly relay: ApprovalRelay
  private d: PeerManagerDeps
  private clients = new Map<string, PeerClient>()
  /** 원격 직원이 말하고 있는 내용 (B컴 snapshot의 thought) — 지도 말풍선·활동 줄 */
  private thoughts = new Map<string, string>()
  private states = new Map<string, PeerLinkState>()

  constructor(d: PeerManagerDeps) {
    this.d = d
    this.registry = new PeerRegistry(d.store, d.vault, d.now)
    this.relay = new ApprovalRelay({
      store: d.store,
      send: (peerId, kind, key, payload) => this.queue.enqueueOutbox(peerId, kind, key, payload),
      peerName: (id) => this.registry.getPeer(id)?.name ?? '',
      onChange: () => d.office.changed(),
    })
    this.queue = new JobQueue({
      store: d.store,
      http: (peerId) => this.httpOf(peerId),
      linkState: (peerId) => this.linkState(peerId),
      onReport: (job) => this.onReport(job),
      onChange: () => d.office.changed(),
      context: (job) => d.office.context(job),
      now: d.now,
      schedule: d.schedule,
      sync: d.sync,
      attachNote: (names) => d.text('attachDropped', { files: names.join(', ') }),
    })
  }

  /** 앱을 켤 때: 보내던 일을 되돌리고 저장된 피어마다 연결을 시작한다 */
  start() {
    this.queue.recover()
    this.queue.prune()
    for (const p of this.registry.listPeers()) this.connect(p)
    void this.restoreChanges()
  }

  dispose() {
    for (const c of this.clients.values()) c.stop()
    this.clients.clear()
    this.queue.dispose()
  }

  // ── 연결 ──

  linkState(peerId: string): PeerLinkState {
    return this.clients.get(peerId)?.state ?? this.states.get(peerId) ?? 'unpaired'
  }

  private httpOf(peerId: string): PeerHttp | null {
    const peer = this.registry.getPeer(peerId)
    const token = this.registry.tokenOf(peerId)
    if (!peer || !token || token === 'unreadable') return null
    return this.d.net.http(peer, token)
  }

  private connect(peer: PeerRecord) {
    this.clients.get(peer.id)?.stop()
    const token = this.registry.tokenOf(peer.id)
    // 토큰을 읽지 못하면 몰래 새로 만들지 않고 "다시 짝짓기"로 둔다 (설계서 1-5)
    if (!token || token === 'unreadable') {
      this.clients.delete(peer.id)
      this.states.set(peer.id, 'unpaired')
      return this.d.office.changed()
    }
    const client = new PeerClient({
      peerId: peer.id,
      openStream: this.d.net.stream(peer, token),
      onState: (s) => {
        this.states.set(peer.id, s)
        this.d.office.changed()
      },
      onEvent: (name, data) => this.onEvent(peer.id, name, data),
      onOnline: () => void this.onOnline(peer.id),
      ...this.d.clientOptions,
    })
    this.clients.set(peer.id, client)
    client.start()
  }

  /** 붙었다(재연결 포함): 직원 목록·지켜볼 직원·미결재·미완료 일을 따라잡고 대기 중인 것을 보낸다 */
  private async onOnline(peerId: string) {
    const http = this.httpOf(peerId)
    if (!http) return
    this.registry.touch(peerId)
    try {
      const staff = await http.call('GET', PEER_PATHS.staff)
      if (staff.status === 200 && Array.isArray(staff.body.staff)) this.registry.syncStaff(peerId, staff.body.staff as PeerStaffBrief[])
      const mine = this.registry.listStaff(peerId).filter((s) => !s.isGone).map((s) => s.remoteId)
      await http.call('POST', PEER_PATHS.watch, { staffIds: mine })
      const ap = await http.call('GET', PEER_PATHS.approvals)
      if (ap.status === 200 && Array.isArray(ap.body.approvals)) this.relay.reconcile(peerId, ap.body.approvals as PeerApprovalEvent[])
    } catch {
      // 목록을 못 가져와도 일 따라잡기는 계속한다
    }
    this.d.office.changed()
    await this.queue.onOnline(peerId)
    // 연결이 끊겨 못 받은 변경 묶음을 다시 받는다
    for (const j of this.queue.list(peerId)) if (j.state === 'done' && j.changesetId && j.workspaceId && j.changesState !== 'fetched') await this.fetchChanges(j)
  }

  private onEvent(peerId: string, name: string, data: unknown) {
    if (!data || typeof data !== 'object') return
    if (name === 'job') {
      const ev = data as PeerJobEvent
      this.queue.onJobEvent(peerId, ev)
      const j = this.queue.get(String(ev.jobId))
      if (j && (j.state === 'done' || j.state === 'failed' || j.state === 'canceled')) this.relay.dropJob(j.id)
    } else if (name === 'approval') {
      const ev = data as Partial<PeerApprovalEvent> & { gone?: boolean }
      if (ev.gone && typeof ev.approvalId === 'string') this.relay.onGone(peerId, ev.approvalId)
      else if (typeof ev.approvalId === 'string' && typeof ev.jobId === 'string') this.relay.onApproval(peerId, ev as PeerApprovalEvent)
    } else if (name === 'snapshot') {
      const list = (data as { staff?: unknown }).staff
      if (!Array.isArray(list)) return
      const briefs = list as PeerStaffBrief[]
      for (const b of briefs) if (typeof b.thought === 'string' && b.thought) this.thoughts.set(`p:${peerId}:${b.id}`, b.thought.slice(0, 200))
      else this.thoughts.delete(`p:${peerId}:${b.id}`)
      if (this.registry.patchStatus(peerId, briefs) || briefs.length) this.d.office.changed()
    }
  }

  // ── 보고 ──

  private onReport(job: PeerJob) {
    void this.report(job)
  }

  private async report(job: PeerJob) {
    const rec = this.registry.staffOf(`p:${job.peerId}:${job.remoteStaffId}`)
    const peerName = this.registry.getPeer(job.peerId)?.name ?? ''
    let body = job.state === 'done' ? (job.result ?? '').trim() : this.d.text(job.error === 'expired' || job.error === 'lost' || job.error === 'interrupted' ? job.error : 'failed', { reason: job.error ?? '' })
    // B컴이 쓴 글은 믿지 않는다: 출처 표지를 붙이고 길이를 자른다 (프롬프트 주입 대책, 설계서 T5)
    body = `[${this.d.text('tag', { name: peerName })}] ${body}`.slice(0, PEER_LIMITS.resultMax)
    // 우리가 붙이는 안내는 B컴 글이 아니므로 자른 뒤에 덧붙인다
    if (job.workspaceNote) body += `\n\n${this.d.text('noWorkspace')}`
    const dropped = droppedNames(job)
    if (dropped.length) body += `\n\n${this.d.text('attachFailed', { files: dropped.join(', ') })}`
    if (job.state === 'done' && job.changesetId && job.workspaceId) body += `\n\n${await this.fetchChanges(job)}`
    this.d.office.report(job, { name: rec?.name ?? '?', role: rec?.role ?? '', text: body })
  }

  // ── 파일 변경 묶음 (4번) ──

  private fetching = new Set<string>()

  /** 돌아온 변경 묶음을 받아 결재함에 카드로 올린다. 안내 글을 돌려준다 (실패하면 다시 붙을 때 다시 받는다) */
  private async fetchChanges(job: PeerJob): Promise<string> {
    const sync = this.d.sync
    const http = this.httpOf(job.peerId)
    const staff = this.registry.staffOf(`p:${job.peerId}:${job.remoteStaffId}`)
    if (!sync || !job.changesetId || !job.workspaceId || this.fetching.has(job.id)) return this.d.text('changesFailed')
    if (!http || !staff) {
      this.queue.markChanges(job.id, 'failed')
      return this.d.text('changesFailed')
    }
    this.fetching.add(job.id)
    try {
      const view = await sync.fetchChanges(http, job.changesetId, job.workspaceId)
      const card = lightCard(await sync.card(view))
      const name = this.registry.getPeer(job.peerId)?.name ?? ''
      this.relay.addChanges(job.peerId, job.id, staff.id, card, this.d.text('changesSummary', { name, n: card.files.length }), this.d.now?.() ?? Date.now())
      this.queue.markChanges(job.id, 'fetched')
      // 다 받았으니 B컴이 복사본·묶음을 지워도 된다
      this.queue.ackJob(job.id)
      await sync.discard(job.workspaceId).catch(() => {})
      this.d.office.changed()
      return this.d.text('changes', { n: card.files.length })
    } catch {
      this.queue.markChanges(job.id, 'failed')
      return this.d.text('changesFailed')
    } finally {
      this.fetching.delete(job.id)
    }
  }

  /** 앱을 켤 때: 반영을 기다리는 변경 묶음 카드를 되살린다 */
  private async restoreChanges() {
    const sync = this.d.sync
    if (!sync) return
    for (const p of sync.pending()) {
      const job = this.d.store.jobs.get(p.jobId)
      const peerId = p.peerId ?? job?.peerId
      if (!job || !peerId) continue
      const staff = this.registry.staffOf(`p:${peerId}:${job.remoteStaffId}`)
      if (!staff) continue
      try {
        const card = lightCard(await sync.detail(p.changesetId))
        const name = this.registry.getPeer(peerId)?.name ?? ''
        this.relay.addChanges(peerId, job.id, staff.id, card, this.d.text('changesSummary', { name, n: card.files.length }), job.finishedAt ?? Date.now())
      } catch {
        // 읽지 못하는 묶음은 건너뛴다 (보관 기간이 지나면 정리된다)
      }
    }
  }

  /** 변경 묶음 자세히 (줄 단위 비교 포함, 지금 A컴 파일로 충돌을 다시 판정) */
  changesetDetail(changesetId: string): Promise<PeerChangesCard> {
    if (!this.d.sync) throw new PeerError('unknown_peer')
    return this.d.sync.detail(changesetId)
  }

  async changeFileDiff(changesetId: string, path: string): Promise<CardFile['diff'] | null> {
    const card = await this.changesetDetail(changesetId)
    return card.files.find((f) => f.path === path)?.diff ?? null
  }

  /** 반영·거절. 막힘·실패(되돌림)가 아니면 카드를 지운다 */
  async applyChanges(changesetId: string, choice: ApplyChoice): Promise<ApplyResult> {
    const sync = this.d.sync
    if (!sync) throw new PeerError('unknown_peer')
    const info = sync.pending().find((p) => p.changesetId === changesetId)
    const result = await sync.apply(changesetId, choice)
    if (result.status !== 'blocked' && result.status !== 'failed') {
      const peerId = info?.peerId ?? (info ? this.d.store.jobs.get(info.jobId)?.peerId : undefined)
      if (peerId) this.relay.removeChanges(peerId, changesetId)
      if (info) await sync.discard(info.workspaceId).catch(() => {})
    }
    this.d.office.changed()
    return result
  }

  // ── 화면·Office 입구 ──

  list(): PeerView[] {
    return this.registry.listPeers().map((p) => ({
      id: p.id,
      name: p.name,
      host: p.lastHost ?? p.host,
      port: p.port,
      pairedAt: p.pairedAt,
      state: this.linkState(p.id),
      queued: this.queue.queuedCount(p.id),
      staffCount: this.registry.listStaff(p.id).length,
    }))
  }

  /** A컴 지도·랩 화면에 합쳐 낼 원격 직원 (Staff 모양) */
  staffViews(base: (rec: ReturnType<PeerRegistry['listStaff']>[number]) => Staff): Staff[] {
    return this.registry.listStaff().map((rec) => {
      const peer = this.registry.getPeer(rec.peerId)
      const state = this.linkState(rec.peerId)
      const s = base(rec)
      const approvals: Approval[] = this.relay.approvalsOf(rec.id)
      const thought = this.thoughts.get(rec.id)
      const queuedIds = this.queue.queuedJobIds(rec.peerId, rec.id)
      return {
        ...s,
        status: state === 'online' && !rec.isGone ? ((['idle', 'working', 'waiting', 'error'].includes(rec.lastKnownStatus) ? rec.lastKnownStatus : 'idle') as Staff['status']) : 'idle',
        activity: state === 'online' && thought ? thought : '',
        approvals,
        remote: { peerId: rec.peerId, peerName: peer?.name ?? '', state: rec.isGone ? 'offline' : state, ...(rec.isGone ? { isGone: true } : {}), ...(queuedIds.length ? { queued: queuedIds.length, queuedJobIds: queuedIds } : {}) },
      }
    })
  }

  isRemoteStaff(id: string) {
    return Boolean(parsePeerStaffId(id) && this.registry.staffOf(id))
  }

  /** A컴에서 B컴으로 짝짓기 (IP+코드). 성공하면 저장하고 연결을 시작한다 */
  async pairConnect(host: string, port: number, code: string): Promise<PeerView & { fingerprint: string }> {
    const h = host.trim()
    checkPairInput(h, code, this.d.isHostAllowed)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new PairFailure('bad_host')
    const r = await pairWithHost(this.d.net.pair(h, port), { code, clientName: this.d.office.ownName(), kind: 'peer' })
    const rec = this.registry.addPeer({ name: r.peerName || h, host: h, port, spki: r.spki, slotId: r.slotId, token: r.token })
    this.connect(rec)
    this.d.office.changed()
    return { ...this.list().find((p) => p.id === rec.id)!, fingerprint: r.fingerprint }
  }

  /** B컴 직원 목록 (랩에 넣을 직원 고르기) */
  async remoteStaff(peerId: string): Promise<RemoteStaffChoice[]> {
    const http = this.httpOf(peerId)
    if (!http) throw new PeerError('unknown_peer')
    let res
    try {
      res = await http.call('GET', PEER_PATHS.staff)
    } catch {
      throw new PeerError('offline')
    }
    if (res.status !== 200 || !Array.isArray(res.body.staff)) throw new PeerError('offline')
    const added = new Set(this.registry.listStaff(peerId).map((s) => s.remoteId))
    return (res.body.staff as (PeerStaffBrief & { isAutoEdit?: boolean })[]).map((b) => ({ ...b, isAdded: added.has(b.id) }))
  }

  /** 원격 직원을 랩에 넣는다 (labId가 있으면 그 랩의 멤버로) */
  async addStaff(peerId: string, remoteId: string, labId?: string) {
    const http = this.httpOf(peerId)
    if (!http) throw new PeerError('unknown_peer')
    const list = await this.remoteStaff(peerId)
    const brief = list.find((b) => b.id === remoteId) as (RemoteStaffChoice & { isAutoEdit?: boolean }) | undefined
    if (!brief) throw new PeerError('no_staff')
    if (brief.isAutoEdit) throw new PeerError('auto_edit')
    const rec = this.registry.addStaff(peerId, brief)
    if (labId) this.d.office.addToLab(labId, rec.id)
    const mine = this.registry.listStaff(peerId).filter((s) => !s.isGone).map((s) => s.remoteId)
    await http.call('POST', PEER_PATHS.watch, { staffIds: mine }).catch(() => {})
    this.d.office.changed()
    return rec
  }

  /** 랩에서 원격 직원을 뺀다 (이 직원에게 진행 중인 일은 취소됨으로 닫는다) */
  removeStaff(id: string) {
    const rec = this.registry.staffOf(id)
    if (!rec) return false
    for (const j of this.queue.list(rec.peerId)) if (j.remoteStaffId === rec.remoteId) this.queue.cancel(j.id)
    this.registry.removeStaff(id)
    this.d.office.removeFromLabs([id])
    const http = this.httpOf(rec.peerId)
    const mine = this.registry.listStaff(rec.peerId).filter((s) => !s.isGone).map((s) => s.remoteId)
    void http?.call('POST', PEER_PATHS.watch, { staffIds: mine }).catch(() => {})
    this.d.office.changed()
    return true
  }

  /** 연결 끊기: B컴에 알리되(실패해도 진행) A컴 쪽은 모두 지운다 */
  async unpair(peerId: string) {
    if (!this.registry.getPeer(peerId)) throw new PeerError('unknown_peer')
    const http = this.httpOf(peerId)
    await Promise.race([http?.call('POST', PEER_PATHS.unpair, {}).catch(() => {}), new Promise((r) => setTimeout(r, 3000).unref?.())])
    this.clients.get(peerId)?.stop()
    this.clients.delete(peerId)
    this.states.delete(peerId)
    this.queue.cancelAll(peerId)
    this.relay.dropPeer(peerId)
    const staffIds = this.registry.removePeer(peerId)
    this.d.office.removeFromLabs(staffIds)
    this.d.office.changed()
  }

  /** 지금 바로 다시 연결해 본다 */
  reconnect(peerId: string) {
    this.clients.get(peerId)?.retryNow()
  }

  // ── 일 맡기기 ──

  /** 리더(또는 대표)가 원격 직원에게 일을 맡긴다. 저장된 뒤에만 돌아온다 */
  delegate(targetStaffId: string, instruction: string, from: { leadId: string | null; room?: string; isAutonomous?: boolean; attachments?: { path: string; name: string; mime: string }[] }): PeerJob {
    const parsed = parsePeerStaffId(targetStaffId)
    const rec = parsed && this.registry.staffOf(targetStaffId)
    if (!parsed || !rec) throw new PeerError('no_staff')
    if (rec.isGone) throw new PeerError('gone')
    // 파일 복사본: 이 직원이 든 랩의 프로젝트 폴더가 있으면 일과 함께 보낸다 (복사본은 보낼 때 만든다)
    const workspaceRoot = this.d.sync ? this.d.office.workspaceRoot?.(from.leadId, targetStaffId) : null
    try {
      return this.queue.enqueue({ peerId: rec.peerId, remoteStaffId: rec.remoteId, leadId: from.leadId, ...(workspaceRoot ? { workspaceRoot } : {}), ...(from.room ? { room: from.room } : {}), ...(from.isAutonomous ? { isAutonomous: true } : {}), ...(from.attachments?.length ? { attachments: from.attachments.map((a) => ({ path: a.path, name: a.name, mime: a.mime })) } : {}), instruction })
    } catch (e) {
      if (e instanceof PeerQueueError) throw new PeerError(e.code === 'queue_full' ? 'queue_full' : e.code === 'too_long' ? 'too_long' : 'unknown_peer')
      throw e
    }
  }

  /** A컴 결재함의 결재 처리 (p:… id) */
  decide(id: string, allow: boolean) {
    // 파일 변경 카드: 승인 = 전체 반영(충돌이 있으면 막힌 채 카드가 남는다), 거절 = 받은 내용 버림. 자세한 선택은 peerApplyChanges
    if (this.relay.isChanges(id)) {
      const csid = (parseRelayId(id)?.approvalId ?? '').replace(/^changes:/, '')
      void this.applyChanges(csid, { mode: allow ? 'all' : 'reject' }).catch(() => {})
      return true
    }
    return this.relay.decide(id, allow)
  }

  answerQuestion(id: string, answers: Record<string, string>) {
    return this.relay.answer(id, answers)
  }

  isRelayedApproval(id: string) {
    return Boolean(parseRelayId(id)) && this.relay.has(id)
  }

  cancelJob(jobId: string) {
    return this.queue.cancel(jobId)
  }

  /** 대표가 원격 직원의 '이 일 멈추기'를 누르면: 이 직원에게 맡긴 진행 중인 일을 모두 취소하고 결재 카드도 닫는다. 멈춘 일 수를 돌려준다 */
  stopStaff(staffId: string) {
    const rec = this.registry.staffOf(staffId)
    if (!rec) return 0
    let n = 0
    for (const j of this.queue.list(rec.peerId)) {
      if (j.remoteStaffId !== rec.remoteId || !this.queue.cancel(j.id)) continue
      this.relay.dropJob(j.id)
      n++
    }
    if (n) this.d.office.changed()
    return n
  }

  // 일 목록 (화면용)
  jobs(peerId?: string) {
    return this.queue.list(peerId)
  }

  /** 시작 때·가끔: 끝난 일 정리 */
  prune() {
    this.queue.prune()
  }
}


/** 카드의 줄 단위 비교(diff)는 빼고 목록만 — 스냅샷이 무거워지지 않게 (자세히는 peerChangesetDetail) */
function lightCard(card: PeerChangesCard): PeerChangesCard {
  return { ...card, files: card.files.map(({ diff: _diff, ...f }) => f) }
}
