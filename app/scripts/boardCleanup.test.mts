// 업무 보드 정리안 (shared/boardCleanup.ts): 오래된 카드 닫기·중복 합치기·팀/랩 정하기·상태 바로잡기 — 연습·기획 카드·진행 중은 건드리지 않는다

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DONE_DELETE_DAYS, planBoardCleanup, selectDoneToDelete, STALE_DAYS } from '../src/shared/boardCleanup.ts'
import { BATCH_ITEMS_MAX, BATCH_METHOD, CARD_STEPS_MAX } from '../src/shared/secretaryTools.ts'
import type { Task } from '../src/shared/types.ts'

const NOW = 1_800_000_000_000
const DAY = 86_400_000
const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: id, detail: '', status: 'todo', assigneeId: null, teamId: 'team-a', labId: null, result: '', createdAt: NOW - DAY, updatedAt: NOW - DAY, ...over })
const plan = (tasks: Task[], busy: string[] = []) =>
  planBoardCleanup({ tasks, staff: [{ id: 's1', teamId: 'team-a' }, { id: 's2', teamId: null }, { id: 'p1', teamId: null, isPractice: true }], labs: [{ id: 'lab-1', memberIds: ['s2'] }], busyTaskIds: new Set(busy), now: NOW })
const stepOf = (r: ReturnType<typeof plan>, label: string) => r.steps.find((s) => s.label === label)

test('오래된 카드: 상태마다 기준 날짜를 넘긴 카드만 완료로 닫는다 (진행 중은 아무도 안 할 때만)', () => {
  const old = (status: Task['status']) => NOW - (STALE_DAYS[status] ?? 0) * DAY
  const r = plan([
    task('old-todo', { updatedAt: old('todo') }),
    task('new-todo', { updatedAt: old('todo') + DAY }),
    task('old-review', { status: 'review', updatedAt: old('review') }),
    task('old-doing-busy', { status: 'doing', assigneeId: 's1', updatedAt: old('doing') }),
    task('old-done', { status: 'done', updatedAt: 0 }),
  ], ['old-doing-busy'])
  const close = stepOf(r, '오래된 카드 닫기')
  assert.equal(close?.method, BATCH_METHOD)
  assert.deepEqual(close?.items.map((it) => it.args), [['old-todo', { status: 'done' }], ['old-review', { status: 'done' }]])
  assert.match(close!.items[0].label, /30일째/)
})

test('연습 카드와 기획에 딸린 카드(기획안·하위 업무)는 어느 항목에도 넣지 않는다', () => {
  const r = plan([
    task('practice', { isPractice: true, updatedAt: 0 }),
    task('parent', { updatedAt: 0, plan: { spec: '', subtasks: [], status: 'approved' } as Task['plan'] }),
    task('child', { parentId: 'parent', status: 'doing', updatedAt: 0 }),
  ])
  assert.deepEqual(r.steps, [])
})

test('중복: 제목이 같으면(대소문자·공백·문장부호 무시) 가장 진행된 카드에 시작 안 한 카드만 합친다', () => {
  const r = plan([
    task('a', { title: '로그인 화면', createdAt: 1 }),
    task('b', { title: '로그인  화면!', status: 'doing', assigneeId: 's1' }),
    task('c', { title: '로그인화면', createdAt: 2 }),
    task('d', { title: '로그인 화면', createdAt: 3 }),
  ], ['b', 'd'])
  const merge = stepOf(r, '중복 카드 합치기')
  assert.deepEqual(merge?.items.map((it) => [it.method, ...it.args]), [['mergeTasks', 'b', ['a', 'c']]], '진행 중인 b를 남기고, 대기열에 있는 d는 빼고')
})

test('팀·랩: 비어 있으면 담당 직원의 팀, 팀이 없으면 하나뿐인 랩으로 (담당 없거나 연습 직원이면 그대로)', () => {
  const r = plan([
    task('t1', { teamId: null, assigneeId: 's1' }),
    task('t2', { teamId: null, assigneeId: 's2' }),
    task('t3', { teamId: null }),
    task('t4', { teamId: null, assigneeId: 'p1' }),
  ])
  assert.deepEqual(stepOf(r, '팀·프로젝트 정하기')?.items.map((it) => it.args), [['t1', { teamId: 'team-a' }], ['t2', { labId: 'lab-1' }]])
})

test('상태: 진행 중인데 담당이 없거나 하루 넘게 아무도 안 하면 할 일로', () => {
  const r = plan([
    task('no-one', { status: 'doing', updatedAt: NOW }),
    task('stuck', { status: 'doing', assigneeId: 's1' }),
    task('fresh', { status: 'doing', assigneeId: 's1', updatedAt: NOW }),
    task('working', { status: 'doing', assigneeId: 's1' }),
  ], ['working'])
  assert.deepEqual(stepOf(r, '상태 바로잡기')?.items.map((it) => it.args), [['no-one', { status: 'todo' }], ['stuck', { status: 'todo' }]])
})

test('묶음 항목 상한마다 나누고, 카드 단계 상한을 넘는 항목은 omitted로 센다', () => {
  const n = BATCH_ITEMS_MAX * CARD_STEPS_MAX + 5
  const r = plan(Array.from({ length: n }, (_, i) => task(`t${i}`, { updatedAt: 0 })))
  assert.equal(r.steps.length, CARD_STEPS_MAX)
  assert.ok(r.steps.every((s) => s.items.length <= BATCH_ITEMS_MAX))
  assert.equal(r.omitted, 5)
})

const done = (id: string, daysAgo: number, over: Partial<Task> = {}) => task(id, { status: 'done', updatedAt: NOW - daysAgo * DAY, ...over })
const ids = (list: Task[]) => list.map((x) => x.id)

test('완료 카드 삭제 조건: 완료 + N일 이상 지난 것만 (경계 포함), 팀·프로젝트로 좁힐 수 있다', () => {
  const tasks = [done('old', 31), done('edge', 30), done('new', 29), done('b-old', 90, { teamId: 'team-b' }), done('lab-old', 90, { labId: 'lab-1' })]
  assert.deepEqual(ids(selectDoneToDelete(tasks, { olderThanDays: 30 }, NOW)), ['old', 'edge', 'b-old', 'lab-old'])
  assert.deepEqual(ids(selectDoneToDelete(tasks, { olderThanDays: 60 }, NOW)), ['b-old', 'lab-old'])
  assert.deepEqual(ids(selectDoneToDelete(tasks, { olderThanDays: 1, teamId: 'team-b' }, NOW)), ['b-old'])
  assert.deepEqual(ids(selectDoneToDelete(tasks, { olderThanDays: 1, labId: 'lab-1' }, NOW)), ['lab-old'])
})

test('완료 카드 삭제: 연습 카드는 제외', () => {
  const tasks = [done('p', 400, { isPractice: true }), done('real', 400)]
  assert.deepEqual(ids(selectDoneToDelete(tasks, { olderThanDays: 1 }, NOW)), ['real'])
})

test('완료 카드 삭제: 미완료 카드는 얼마나 오래됐든 절대 대상이 아니다 (조건이 이상해도)', () => {
  const open = (['todo', 'doing', 'review'] as const).map((status) => task(`open-${status}`, { status, updatedAt: 0 }))
  for (const cond of [{ olderThanDays: 1 }, { olderThanDays: 1, teamId: 'team-a' }, { olderThanDays: 0.5 }, { olderThanDays: 99999 }]) {
    assert.deepEqual(selectDoneToDelete(open, cond, NOW), [])
  }
  for (const bad of [0, -5, NaN, Infinity * 0, Number('x')]) assert.deepEqual(selectDoneToDelete([done('d', 999)], { olderThanDays: bad }, NOW), [], `잘못된 일수 ${bad}`)
  // 진행 중인 하위 업무가 부모로 삼은 완료 카드, 승인 대기 기획이 걸린 카드, 대기열에 있는 카드도 남긴다
  const tasks = [done('parent', 100), task('kid', { parentId: 'parent', status: 'doing' }), done('waiting-plan', 100, { plan: { status: 'waiting' } as Task['plan'] }), done('queued', 100)]
  assert.deepEqual(ids(selectDoneToDelete(tasks, { olderThanDays: 1 }, NOW, new Set(['queued']))), [])
})

test('정리안의 doneDelete: 오래된 완료 카드 개수·가장 오래된 일수와 deleteTasks 인자를 준다 (묶음 steps와 별개, 없으면 null)', () => {
  assert.equal(plan([done('fresh', DONE_DELETE_DAYS - 1), task('t')]).doneDelete, null)
  const r = plan([done('a', DONE_DELETE_DAYS + 1), done('b', 100), done('p', 500, { isPractice: true }), task('open', { updatedAt: 0, status: 'doing', assigneeId: 's1' })], ['open'])
  assert.deepEqual(r.doneDelete, { count: 2, oldestDays: 100, args: [{ olderThanDays: DONE_DELETE_DAYS }] })
  assert.ok(r.steps.every((s) => s.items.every((it) => it.method !== ('deleteTasks' as string))), '묶음에 삭제를 섞지 않는다')
})

test('완료 카드가 40항목·8단계 한도보다 많아도 한 번에 모두 고른다', () => {
  const many = Array.from({ length: BATCH_ITEMS_MAX * CARD_STEPS_MAX + 100 }, (_, i) => done(`d${i}`, 60))
  assert.equal(selectDoneToDelete(many, { olderThanDays: 30 }, NOW).length, many.length)
  assert.equal(plan(many).doneDelete?.count, many.length)
})
