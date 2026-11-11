// 결재함에 올라온 결재·질문을 앱을 꺼도 잃지 않게 하는 순수 로직 (저장소 접근은 db.ts, 연결은 office.ts)

import { t } from '../shared/i18n/index.ts'
import type { Approval, StaffQuestion } from '../shared/types'

/** 복원한 지 이 기간이 지난 결재는 되살리지 않는다 */
export const PENDING_APPROVAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** 복원 결재를 승인했을 때 다시 실행하며 한 번 자동 허용하는 유효 시간 (그 전에 직원의 일이 끝나면 바로 거둔다) */
export const ONE_SHOT_ALLOW_TTL_MS = 10 * 60 * 1000

export interface PendingApproval {
  id: string
  staffId: string
  toolName: string
  summary: string
  summaryI18n?: Approval['summaryI18n']
  effectI18n?: Approval['effectI18n']
  questions?: StaffQuestion[]
  createdAt: number
  /** 연결된 업무 카드 */
  taskId: string | null
}

/** 저장할 수 있는 결재인가: 다른 PC 중계(PeerChanges)·외부 직원 질문은 저장하지 않는다 */
export const isPersistable = (a: Pick<Approval, 'id' | 'toolName'>) => a.toolName !== 'PeerChanges' && !a.id.startsWith('peer:')

export function toPending(a: Approval, taskId: string | null): PendingApproval {
  return {
    id: a.id,
    staffId: a.staffId,
    toolName: a.toolName,
    summary: a.summary,
    ...(a.summaryI18n ? { summaryI18n: a.summaryI18n } : {}),
    ...(a.effectI18n ? { effectI18n: a.effectI18n } : {}),
    ...(a.questions ? { questions: a.questions } : {}),
    createdAt: a.createdAt,
    taskId,
  }
}

/** 목록에 더하기(같은 id는 바꿈) */
export const withPending = (list: readonly PendingApproval[], p: PendingApproval) => [...list.filter((x) => x.id !== p.id), p]
export const withoutPending = (list: readonly PendingApproval[], id: string) => (list.some((x) => x.id === id) ? list.filter((x) => x.id !== id) : list)

/** 저장된 결재를 복원할 것(restore)과 버릴 것(expired: 오래됨, gone: 직원이 없음)으로 가른다 */
export function splitRestorable(list: readonly PendingApproval[], now: number, hasStaff: (id: string) => boolean) {
  const restore: PendingApproval[] = []
  const expired: PendingApproval[] = []
  const gone: PendingApproval[] = []
  for (const p of list) {
    if (!hasStaff(p.staffId)) gone.push(p)
    else if (now - p.createdAt > PENDING_APPROVAL_MAX_AGE_MS) expired.push(p)
    else restore.push(p)
  }
  return { restore, expired, gone }
}

export const toRestoredApproval = (p: PendingApproval): Approval => ({
  id: p.id,
  staffId: p.staffId,
  toolName: p.toolName,
  summary: p.summary,
  ...(p.summaryI18n ? { summaryI18n: p.summaryI18n } : {}),
  ...(p.effectI18n ? { effectI18n: p.effectI18n } : {}),
  createdAt: p.createdAt,
  ...(p.questions ? { questions: p.questions } : {}),
  isRestored: true,
})

/** 승인한 복원 결재를 다시 실행할 때 같은 결재가 또 뜨지 않게, 같은 직원·도구·요약을 한 번만 통과시킨다 */
export class OneShotAllow {
  private grants: { staffId: string; toolName: string; summary: string; until: number }[] = []

  grant(staffId: string, toolName: string, summary: string, now = Date.now()) {
    this.grants.push({ staffId, toolName, summary, until: now + ONE_SHOT_ALLOW_TTL_MS })
  }

  /** 맞는 허용이 있으면 하나 쓰고 true (유효 시간이 지난 것은 버린다) */
  take(staffId: string, toolName: string, summary: string, now = Date.now()) {
    this.grants = this.grants.filter((g) => g.until > now)
    const i = this.grants.findIndex((g) => g.staffId === staffId && g.toolName === toolName && g.summary === summary)
    if (i < 0) return false
    this.grants.splice(i, 1)
    return true
  }

  /** 그 직원의 남은 허용을 모두 버린다 — 다시 실행하는 일이 끝나면 다른 일에서 같은 호출이 결재 없이 통과하지 않게 */
  revoke(staffId: string) {
    this.grants = this.grants.filter((g) => g.staffId !== staffId)
  }
}

/** 복원 결재를 처리한 결과로 그 직원에게 보낼 새 지시. 넘기기(답 없이 닫기)는 지시 없음 */
export function restoredInstruction(p: PendingApproval, decision: { allow: boolean } | { answers: Record<string, string> } | null): string | null {
  if (!decision) return null
  if ('answers' in decision) return t('staff.msg.textAnswer', { question: p.summary, answer: Object.values(decision.answers).join(' / ') })
  return t(decision.allow ? 'staff.msg.restoredApproved' : 'staff.msg.restoredRejected', { tool: p.toolName, summary: p.summary })
}
