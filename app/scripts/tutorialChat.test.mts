// 업무 연습 구동부(main/tutorial.ts): 단체방 지시를 연습으로 받기 · 리드의 단체방 글 · 다시 켜도 두 번 올리지 않기 · 정리 때 연습 단체방 글 지우기
// db.ts는 electron의 app.getPath만 쓰므로 가짜 app으로 임시 폴더의 실제 sqlite 파일을 연다 (dbArtifacts.test.mts와 같은 방식)

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { after, test } from 'node:test'
import type { Task } from '../src/shared/types.ts'

register('./dbLoaderHooks.mjs', import.meta.url)
const g = globalThis as unknown as { __testUserData: string }
const dbm = await import('../src/main/db.ts')
const { Tutorial } = await import('../src/main/tutorial.ts')
type Port = ConstructorParameters<typeof Tutorial>[0]

const dirs: string[] = []
const fresh = () => {
  dbm.closeDb()
  g.__testUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'tutorial-chat-'))
  dirs.push(g.__testUserData)
  dbm.openDb()
}
after(() => {
  dbm.closeDb()
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true })
})

/** 메모리 사무실 — 연습 직원·카드만 들고, 단체방 글은 실제 DB에 쓴다 */
function fakeOffice() {
  const staff = new Map<string, string>()
  const tasks = new Map<string, Task>()
  let n = 0
  const port: Port = {
    hirePractice: (input) => {
      const id = `s${++n}`
      staff.set(id, input.name)
      return id
    },
    createPracticeTeam: (name) => ({ id: 'team1', name, color: '#888', leadId: null, kind: 'hired', isPractice: true }),
    createPracticeLab: (input) => ({ ...input, id: 'lab1', refDocs: [] }),
    setTeamLead: () => {},
    staffExists: (id) => staff.has(id),
    staffName: (id) => staff.get(id) ?? '',
    task: (id) => tasks.get(id),
    saveTask: (task) => void tasks.set(task.id, task),
    createPracticeTask: (input) => {
      const task = { id: `t${++n}`, title: input.title, detail: input.detail, status: 'todo', assigneeId: null, teamId: input.teamId, labId: input.labId, result: '', createdAt: 1, updatedAt: 1, parentId: null, plan: null, meetingId: null, isPractice: true } as unknown as Task
      tasks.set(task.id, task)
      return task
    },
    postPracticeChat: (from, text, room, meta) => dbm.insertChat(from, text, undefined, undefined, room, Boolean(meta.isReport), { ...meta.plan ? { plan: meta.plan } : {}, ...meta.taskId ? { taskId: meta.taskId } : {}, isPractice: true }).id,
    chatExists: (id) => Boolean(dbm.getChat(id)),
    approvePlan: () => {},
    meeting: () => undefined,
    saveMeeting: () => {},
    setBubble: () => {},
    addFunds: () => {},
    hasPracticeData: () => staff.size > 0,
    clearPracticeData: () => {
      staff.clear()
      dbm.deletePracticeChats()
    },
    changed: () => {},
  }
  return { port, staff, tasks }
}

const chats = () => dbm.recentChat(100)

test('단체방 지시: 지시 단계에서 연습 리드를 부른 말만 연습으로 받는다 — 리드의 답·기획안 확인 요청이 같은 방에 올라간다', () => {
  fresh()
  const { port } = fakeOffice()
  const tut = new Tutorial(port)
  tut.load()
  tut.start('task')
  const lead = port.staffName(tut.snapshot().cast!.leadId)
  // P1(사무실 보기)에서는 아직 받지 않는다
  assert.equal(tut.takeChat(`@${lead} 로그인 화면 만들어 줘`, ''), false)
  tut.act({ type: 'ack' })
  // 연습 리드를 부르지 않은 말(진짜 직원에게 한 지시)은 그대로 둔다
  assert.equal(tut.takeChat('@김진짜 보고서 써 줘', ''), false)
  assert.equal(tut.takeChat(`@${lead} 로그인 화면 만들어 줘`, ''), true)
  assert.equal(tut.snapshot().step, 'p2wait')
  assert.equal(tut.snapshot().chatRoom, '')
  let list = chats()
  assert.deepEqual(list.map((m) => m.from), ['me', tut.snapshot().cast!.leadId])
  assert.ok(list.every((m) => m.isPractice))
  // 리드가 기획안을 올리면 단체방에 기획안 확인 카드가 붙는다
  tut.act({ type: 'showNow' })
  assert.equal(tut.snapshot().step, 'p3')
  list = chats()
  const plan = list.at(-1)!
  assert.equal(plan.plan?.taskId, tut.snapshot().taskId)
  tut.stop()
})

test('다시 켜면 지금 단계 효과를 한 번 더 하지만 단체방 글은 두 번 올리지 않는다', () => {
  fresh()
  const { port } = fakeOffice()
  const first = new Tutorial(port)
  first.load()
  first.start('task')
  first.act({ type: 'ack' })
  first.act({ type: 'skipStep' })
  first.act({ type: 'showNow' })
  first.stop()
  const before = chats().length
  assert.equal(before, 3, '대신 보낸 지시 · 리드의 답 · 기획안 확인 요청')
  const again = new Tutorial(port)
  again.load()
  again.stop()
  assert.equal(chats().length, before)
})

test('결과 보고: 팀원 작업이 끝나면 리드가 결과 보고(카드와 이어진 보고 글)를 올리고, 카드는 검토 칸', () => {
  fresh()
  const { port, tasks } = fakeOffice()
  const tut = new Tutorial(port)
  tut.load()
  tut.start('task')
  for (const input of [{ type: 'ack' }, { type: 'skipStep' }, { type: 'showNow' }, { type: 'view', view: 'inbox' }, { type: 'skipStep' }, { type: 'showNow' }] as const) tut.act(input)
  assert.equal(tut.snapshot().step, 'p6')
  const report = chats().at(-1)!
  assert.equal(report.isReport, true)
  assert.equal(report.taskId, tut.snapshot().taskId)
  assert.equal(tasks.get(tut.snapshot().taskId!)?.status, 'review')
  // 보고의 '완료로 옮기기'(office가 taskDone을 알린다) → 축하 단계
  assert.equal(tut.notify('taskDone', tut.snapshot().taskId!), true)
  assert.equal(tut.snapshot().step, 'done')
  tut.stop()
})

test('연습 회사 정리: 연습 단체방 글(내가 보낸 지시 포함)만 지우고 진짜 글은 남긴다', () => {
  fresh()
  const { port } = fakeOffice()
  const real = dbm.insertChat('me', '@김진짜 보고서 써 줘')
  const tut = new Tutorial(port)
  tut.load()
  tut.start('task')
  tut.act({ type: 'ack' })
  tut.act({ type: 'skipStep' })
  assert.ok(chats().length > 1)
  tut.cleanup()
  assert.deepEqual(chats().map((m) => m.id), [real.id])
  assert.equal(tut.snapshot().scenario, null)
})
