// 리더가 맡긴 팀원 일을 기다리는 중인지 — 책상·카드·집계·team 도구가 같은 기준을 쓰는지 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasOpenDelegation, isAwaitingTeam, type DelegationInput } from '../src/shared/delegation.ts'
import { countByStatus, matchesStaffFilter } from '../src/shared/dashboard.ts'
import { nowLine, summaryParts } from '../src/shared/staffCard.ts'
import { summarizeRoomPeople } from '../src/shared/chatRoomLayout.ts'

const base = (over: Partial<DelegationInput> = {}): DelegationInput => ({
  leadId: 'lead',
  members: [{ id: 'm1', origins: [] }],
  tasks: [],
  ...over,
})

test('맡긴 일이 없으면 기다리지 않는다', () => {
  assert.equal(hasOpenDelegation(base()), false)
})

test('팀원이 이 리더의 지시를 처리 중이면 기다림, 다른 리더의 지시면 아님', () => {
  assert.equal(hasOpenDelegation(base({ members: [{ id: 'm1', origins: [{ kind: 'delegate', leadId: 'lead' }] }] })), true)
  assert.equal(hasOpenDelegation(base({ members: [{ id: 'm1', origins: [{ kind: 'delegate', leadId: 'other' }] }] })), false)
  assert.equal(hasOpenDelegation(base({ members: [{ id: 'm1', origins: [{ kind: 'user' }] }] })), false)
})


const plan = { id: 'p', assigneeId: 'lead', status: 'doing' as const }
const sub = (over: Partial<DelegationInput['tasks'][number]> = {}) => ({ id: 's', assigneeId: 'm1', status: 'todo' as const, parentId: 'p', ...over })

test('리더 기획의 하위 업무를 팀원이 할 일·진행 중으로 들고 있으면 기다림, 검토·완료나 팀원 밖 카드는 아님', () => {
  assert.equal(hasOpenDelegation(base({ tasks: [plan, sub()] })), true)
  assert.equal(hasOpenDelegation(base({ tasks: [plan, sub({ status: 'doing' })] })), true)
  assert.equal(hasOpenDelegation(base({ tasks: [plan, sub({ status: 'review' }), sub({ id: 's2', status: 'done' })] })), false)
  assert.equal(hasOpenDelegation(base({ tasks: [plan, sub({ assigneeId: 'x', status: 'doing' }), sub({ assigneeId: null })] })), false)
})

const pausedPlan = { ...plan, plan: { isPaused: true } }

test('멈춘 기획의 todo 하위 카드는 기다리는 일이 아니다', () => {
  assert.equal(hasOpenDelegation(base({ tasks: [pausedPlan, sub()] })), false)
})

test('멈춘 기획이어도 진행 중(doing) 하위 카드는 기다림', () => {
  assert.equal(hasOpenDelegation(base({ tasks: [pausedPlan, sub({ status: 'doing' })] })), true)
})

test('멈추지 않은 기획의 todo 하위 카드는 기다림', () => {
  assert.equal(hasOpenDelegation(base({ tasks: [{ ...plan, plan: { isPaused: false } }, sub()] })), true)
})

test('대표가 보드에서 팀원에게 직접 준 카드는 리더가 맡긴 일이 아니다 (영영 안 풀리는 표시 방지)', () => {
  assert.equal(hasOpenDelegation(base({ tasks: [sub({ parentId: null, status: 'doing' })] })), false)
  assert.equal(hasOpenDelegation(base({ tasks: [{ id: 'q', assigneeId: 'other', status: 'doing' }, sub({ parentId: 'q' })] })), false)
})

test('리더가 add_task로 팀원에게 배정한 카드는 할 일·진행 중이면 맡긴 일 (하위 업무가 아니어도)', () => {
  const card = { id: 'c1', assigneeId: 'm1', status: 'todo' as const, parentId: null }
  assert.equal(hasOpenDelegation(base({ tasks: [card], assignedTaskIds: ['c1'] })), true)
  assert.equal(hasOpenDelegation(base({ tasks: [{ ...card, status: 'review' }], assignedTaskIds: ['c1'] })), false)
  assert.equal(hasOpenDelegation(base({ tasks: [card], assignedTaskIds: [] })), false)
})

test('팀원 일이 끝나면 같은 리더가 다시 기다리지 않음으로 돌아온다', () => {
  const doing = base({ members: [{ id: 'm1', origins: [{ kind: 'delegate', leadId: 'lead' }] }], tasks: [plan, sub({ status: 'doing' })] })
  assert.equal(hasOpenDelegation(doing), true)
  assert.equal(hasOpenDelegation({ ...doing, members: [{ id: 'm1', origins: [] }], tasks: [plan, sub({ status: 'review' })] }), false)
})

test('기다리는 중 표시는 쉬는 중(idle)일 때만', () => {
  assert.equal(isAwaitingTeam({ status: 'idle', awaitingTeam: true }), true)
  assert.equal(isAwaitingTeam({ status: 'idle' }), false)
  for (const status of ['working', 'waiting', 'error', 'offline', 'netWait'] as const) assert.equal(isAwaitingTeam({ status, awaitingTeam: true }), false, status)
})

test('요약·필터: 기다리는 리더는 작업 중으로 센다', () => {
  const counts = countByStatus([{ status: 'idle', awaitingTeam: true }, { status: 'idle' }, { status: 'working' }])
  assert.deepEqual(counts, { working: 2, waiting: 0, error: 0, idle: 1 })
  assert.equal(matchesStaffFilter({ name: '정리드', status: 'idle', awaitingTeam: true }, '', 'working'), true)
  assert.equal(matchesStaffFilter({ name: '정리드', status: 'idle', awaitingTeam: true }, '', 'idle'), false)
  assert.deepEqual(summaryParts([{ status: 'idle', awaitingTeam: true }]).parts, [{ kind: 'working', count: 1 }])
})

test('카드 지금 하는 일: 기다리는 리더는 기다리는 문장, 맡은 카드보다 앞', () => {
  const lead = { kind: 'hired' as const, status: 'idle' as const, activity: '', approvals: [], progress: null, awaitingTeam: true }
  assert.deepEqual(nowLine(lead, { title: '기획' }), { key: 'staffCard.now.awaitingTeam' })
  assert.deepEqual(nowLine({ ...lead, awaitingTeam: false }, null), { key: 'staffCard.now.none' })
  assert.deepEqual(nowLine({ ...lead, status: 'waiting' }, null), { key: 'staffCard.now.approval' })
})

test('대화방 머리 인원: 기다리는 리더도 일하는 중으로 센다', () => {
  assert.deepEqual(summarizeRoomPeople([{ status: 'idle', awaitingTeam: true }, { status: 'working' }, { status: 'idle' }]), { total: 3, working: 2 })
})
