// A컴의 결재 중계 (설계서 5절): B컴 직원의 결재 요청을 A컴 결재함에 p:<피어>:<결재id>로 올리고, 승인·거절을 B컴에 돌려준다
// 입력 불신(T4): A컴이 만든 일(jobId)의 결재만 받는다. 모르는 jobId·다른 피어의 일·끝난 일의 결재는 버린다
// 보내기는 JobQueue의 outbox를 쓴다 (끊겨도 남아 다시 보낸다, 키는 appr:<id>:<allow>)

import type { Approval } from '../../shared/types'
import { isPeerJobActive, peerStaffId, type PeerApprovalEvent } from '../../shared/peerProtocol.ts'
import type { PeerStore } from './peerStore'

export const relayId = (peerId: string, approvalId: string) => `p:${peerId}:${approvalId}`
export const parseRelayId = (id: string): { peerId: string; approvalId: string } | null => {
  const m = /^p:([A-Za-z0-9_-]{1,64}):(.{1,300})$/.exec(id)
  return m ? { peerId: m[1], approvalId: m[2] } : null
}

interface Relayed {
  peerId: string
  jobId: string
  approval: Approval
}

export interface ApprovalRelayDeps {
  store: PeerStore
  /** B컴으로 보낼 것을 큐에 쌓는다 */
  send(peerId: string, kind: 'decide' | 'answer', key: string, payload: Record<string, unknown>): void
  /** 피어 이름 (결재 제목의 [원격: 이름]) */
  peerName(peerId: string): string
  onChange(): void
}

export class ApprovalRelay {
  private d: ApprovalRelayDeps
  private items = new Map<string, Relayed>()

  constructor(d: ApprovalRelayDeps) {
    this.d = d
  }

  /** B컴의 approval 이벤트. 받아들이면 true */
  onApproval(peerId: string, ev: PeerApprovalEvent): boolean {
    const job = this.d.store.jobs.get(ev.jobId)
    // 이 피어에 A컴이 보냈고 아직 진행 중인 일의 결재만
    if (!job || job.peerId !== peerId || !isPeerJobActive(job.state)) return false
    const staff = this.d.store.staff.get(peerStaffId(peerId, job.remoteStaffId))
    if (!staff) return false
    const id = relayId(peerId, String(ev.approvalId).slice(0, 300))
    if (this.items.has(id)) return true
    const approval: Approval = {
      id,
      staffId: staff.id,
      toolName: String(ev.toolName).slice(0, 100),
      summary: `[원격: ${this.d.peerName(peerId)}] ${String(ev.summary)}`.slice(0, 2000),
      ...(ev.summaryI18n ? { summaryI18n: ev.summaryI18n as Approval['summaryI18n'] } : {}),
      createdAt: Number.isFinite(ev.createdAt) ? ev.createdAt : Date.now(),
      ...(Array.isArray(ev.questions) ? { questions: ev.questions as Approval['questions'] } : {}),
      // alwaysRule은 만들지 않는다 — 원격 결재로는 "항상 승인" 규칙을 만들 수 없다
    }
    this.items.set(id, { peerId, jobId: ev.jobId, approval })
    this.d.onChange()
    return true
  }

  /** B컴에서 결재가 사라졌다 (B컴 앞에서 처리·취소·해제) */
  onGone(peerId: string, approvalId: string) {
    if (this.items.get(relayId(peerId, approvalId))?.peerId === peerId && this.items.delete(relayId(peerId, approvalId))) this.d.onChange()
  }

  /** 재연결 때 B컴의 미결재 목록과 대조: 사라진 것은 지우고 새 것은 올린다 */
  reconcile(peerId: string, events: PeerApprovalEvent[]) {
    const ids = new Set(events.map((e) => relayId(peerId, String(e.approvalId))))
    for (const [id, r] of [...this.items]) if (r.peerId === peerId && !ids.has(id)) this.items.delete(id)
    for (const e of events) this.onApproval(peerId, e)
    this.d.onChange()
  }

  /** 이 피어의 중계 결재를 모두 지운다 (해제·일 취소) */
  dropPeer(peerId: string) {
    for (const [id, r] of [...this.items]) if (r.peerId === peerId) this.items.delete(id)
    this.d.onChange()
  }

  /** 일이 끝났으면 그 일의 결재 카드도 닫는다 */
  dropJob(jobId: string) {
    let isChanged = false
    for (const [id, r] of [...this.items]) if (r.jobId === jobId) isChanged = this.items.delete(id) || isChanged
    if (isChanged) this.d.onChange()
  }

  has(id: string) {
    return this.items.has(id)
  }

  /** 원격 직원 카드에 보일 결재 */
  approvalsOf(staffId: string): Approval[] {
    return [...this.items.values()].filter((r) => r.approval.staffId === staffId).map((r) => r.approval)
  }

  /** A컴 대표가 승인·거절. 처리했으면 true (B컴 전달은 큐가 몇 번이든 다시 보낸다) */
  decide(id: string, allow: boolean): boolean {
    const r = this.items.get(id)
    const parsed = parseRelayId(id)
    if (!r || !parsed) return false
    this.items.delete(id)
    this.d.send(r.peerId, 'decide', `appr:${parsed.approvalId}:${allow}`, { method: 'decide', args: [parsed.approvalId, allow] })
    this.d.onChange()
    return true
  }

  answer(id: string, answers: Record<string, string>): boolean {
    const r = this.items.get(id)
    const parsed = parseRelayId(id)
    if (!r || !parsed) return false
    this.items.delete(id)
    this.d.send(r.peerId, 'answer', `appr:${parsed.approvalId}:answer`, { method: 'answerQuestion', args: [parsed.approvalId, answers] })
    this.d.onChange()
    return true
  }
}
