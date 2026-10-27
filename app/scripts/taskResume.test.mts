// 질문에 답한 뒤 카드 갱신, 앱 재시작 때 검토 카드 보존
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plansToAdvanceOnStart, shouldReopenForAnswer, tasksToReturnToTodo } from '../src/shared/taskResume.ts'
import type { Task } from '../src/shared/types.ts'

const plan = (over: Partial<NonNullable<Task['plan']>> = {}) => ({ status: 'approved', ...over }) as NonNullable<Task['plan']>
const card = (id: string, status: Task['status'], extra: Partial<Task> = {}) => ({ id, status, plan: null, ...extra }) as Pick<Task, 'id' | 'status' | 'plan'>

test('재시작: 검토·완료 카드는 그대로, 진행 중이던 카드만 할 일로', () => {
  const tasks = [card('r', 'review'), card('d', 'done'), card('t', 'todo'), card('w', 'doing'), card('p', 'doing', { isPractice: true } as Partial<Task>)]
  assert.deepEqual(tasksToReturnToTodo(tasks), ['w'])
})

test('재시작: 승인된 기획안이 이어 갈 진행 중 카드는 되돌리지 않고, 그 기획만 이어 간다', () => {
  const tasks = [card('plan', 'doing', { plan: plan() }), card('agg', 'doing', { plan: plan({ isAggregating: true }) }), card('reviewPlan', 'review', { plan: plan() }), card('donePlan', 'done', { plan: plan() })]
  assert.deepEqual(tasksToReturnToTodo(tasks), ['agg'])
  assert.deepEqual(plansToAdvanceOnStart(tasks), ['plan', 'agg'])
})

test('글 질문 답: 첫 턴으로 검토에 넘어간 카드만 진행 중으로 다시 연다', () => {
  assert.equal(shouldReopenForAnswer({ status: 'review' }), true)
  for (const status of ['todo', 'doing', 'done'] as const) assert.equal(shouldReopenForAnswer({ status }), false, status)
  assert.equal(shouldReopenForAnswer(undefined), false)
})
