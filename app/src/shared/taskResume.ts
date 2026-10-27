import type { Task } from './types'

// 업무 카드 상태를 앱 시작 때·글 질문 답을 받을 때 어떻게 바꿀지 정하는 규칙 (office.ts가 부른다)

type Card = Pick<Task, 'id' | 'status' | 'plan'> & { isPractice?: boolean }

/** 앱을 켤 때 할 일로 되돌릴 카드: 진행 중(doing)이던 것만 — 검토·완료 카드는 그대로. 승인된 기획안이 이어 갈 카드는 되돌리지 않는다. 연습 카드는 튜토리얼이 이어 간다 */
export function tasksToReturnToTodo(tasks: Card[]): string[] {
  return tasks
    .filter((t) => t.status === 'doing' && !t.isPractice)
    .filter((t) => !(t.plan && !t.plan.isAggregating && (t.plan.status === 'approved' || t.plan.status === 'waiting')))
    .map((t) => t.id)
}

/** 앱을 켤 때 다음 단계로 이어 갈 기획 카드: 진행 중인 카드의 승인된 기획안만 (검토·완료 카드의 기획은 다시 시작하지 않는다) */
export function plansToAdvanceOnStart(tasks: Card[]): string[] {
  return tasks.filter((t) => t.status === 'doing' && t.plan?.status === 'approved' && !t.isPractice).map((t) => t.id)
}

/** 글 질문에 답이 오면 첫 턴으로 검토에 넘어간 카드를 다시 진행 중으로 — 이어지는 턴의 비용과 결과가 그 카드에 쌓이게 */
export const shouldReopenForAnswer = (task: Pick<Task, 'status'> | undefined) => task?.status === 'review'
