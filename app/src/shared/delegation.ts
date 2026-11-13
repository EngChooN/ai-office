import type { Staff, TaskStatus } from './types.ts'

/** 리더가 맡긴 일이 남았는지 볼 재료 (main이 모아 넘긴다) */
export interface DelegationInput {
  leadId: string
  /** 이 리더가 일을 맡길 수 있는 사람(팀원·랩 멤버)과 처리 중인 지시의 출처 */
  members: { id: string; origins: { kind: string; leadId?: string }[] }[]
  tasks: { id: string; assigneeId: string | null; status: TaskStatus; parentId?: string | null }[]
  /** 이 리더가 add_task로 팀원에게 직접 배정한 카드 id */
  assignedTaskIds?: readonly string[]
}

/**
 * 맡긴 일이 아직 끝나지 않았다: 팀원이 이 리더의 지시를 처리 중 ·
 * 이 리더 업무의 하위 업무(기획 분배)나 리더가 add_task로 배정한 카드를 팀원이 할 일·진행 중으로 들고 있음(줄 서 있는 카드도 할 일이라 여기서 센다).
 * 대표가 보드에서 팀원에게 직접 준 카드는 리더가 맡긴 일이 아니다 — 세면 그 카드가 남는 동안 리더가 영영 기다리는 중으로 보인다
 */
export function hasOpenDelegation(i: DelegationInput): boolean {
  if (i.members.some((m) => m.origins.some((o) => o.kind === 'delegate' && o.leadId === i.leadId))) return true
  const memberIds = new Set(i.members.map((m) => m.id))
  const leadTaskIds = new Set(i.tasks.filter((t) => t.assigneeId === i.leadId).map((t) => t.id))
  const assigned = new Set(i.assignedTaskIds ?? [])
  return i.tasks.some((t) => t.assigneeId !== null && memberIds.has(t.assigneeId) && (Boolean(t.parentId && leadTaskIds.has(t.parentId)) || assigned.has(t.id)) && (t.status === 'todo' || t.status === 'doing'))
}

/**
 * 화면용: 리더가 자기 차례는 끝났지만(쉬는 중) 맡긴 팀원 일을 기다리는 중.
 * 책상 그림·직원 카드·패널·집계가 모두 이것 하나로 판단한다 (실제 상태 idle은 지시 배정·멘션 정렬이 그대로 쓴다)
 */
export function isAwaitingTeam(s: Pick<Staff, 'status' | 'awaitingTeam'>): boolean {
  return s.status === 'idle' && Boolean(s.awaitingTeam)
}
