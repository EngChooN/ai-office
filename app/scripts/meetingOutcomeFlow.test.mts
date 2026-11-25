// 회의 결과 고르기 통합 시험 — 잘못된 선택값 거절, 리더 아닌 진행자의 기획안 '다시 기획' (collabApproval.test.mts와 같은 방식)

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { after, afterEach, beforeEach, test } from 'node:test'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-outcome-'))
process.env.HOME = path.join(root, 'home')
fs.mkdirSync(process.env.HOME)
const g = globalThis as unknown as { __electron: unknown }
let userData = ''
g.__electron = {
  app: { getPath: () => userData, getVersion: () => '0.0.0', getLocale: () => 'ko', getAppPath: () => process.cwd(), isPackaged: false, on() {} },
  net: { isOnline: () => true, fetch: () => assert.fail('시험에서는 AI 서버에 묻지 않는다') },
}
register('./officeLoaderHooks.mjs', import.meta.url)

const { Office } = await import('../src/main/office.ts')
const { ClaudeRuntime } = await import('../src/main/ai/claude.ts')
const db = await import('../src/main/db.ts')
const { t } = await import('../src/shared/i18n/index.ts')
const { startLocalMcp, stopLocalMcp } = await import('../src/main/mcp/localMcp.ts')
type Meeting = import('../src/shared/types.ts').Meeting

await startLocalMcp()
after(() => {
  stopLocalMcp()
  db.closeDb()
  fs.rmSync(root, { recursive: true, force: true })
})

class FakeClaude extends ClaudeRuntime {
  private open = false
  override get isOpen() {
    return this.open
  }
  override start() {
    this.open = true
  }
  override close() {
    super.close()
    this.open = false
  }
  override dispose() {
    this.open = false
  }
  override async interrupt() {}
}

type OfficeT = InstanceType<typeof Office>
let office: OfficeT

beforeEach(() => {
  db.closeDb()
  userData = fs.mkdtempSync(path.join(root, 'ud-'))
  db.openDb()
  office = new Office({ makeRuntime: (_p, onEvent) => new FakeClaude(onEvent), isNetBack: async () => true })
  office.start()
})

const settle = async () => {
  await new Promise((r) => setTimeout(r, 80))
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))
}

afterEach(async () => {
  office.stop()
  await settle()
})

const inner = () => office as unknown as { meetings: Meeting[]; officeMcp: Map<string, { config: { url: string; headers: Record<string, string> } }> }
const task = (id: string) => office.snapshot().tasks.find((x) => x.id === id)!
const meeting = (id: string) => inner().meetings.find((x) => x.id === id)!

/** 리더가 없는 팀의 두 직원이 끝낸 회의 (진행자 = 첫 참석자 가직원, 리더 아님) */
async function setup() {
  const team = office.createTeam('가팀', '#888')
  const hire = (name: string) => office.hire({ name, role: '개발자', avatar: 0, provider: 'claude', model: 'default', cwd: '', systemPrompt: '', approvalMode: 'default', teamId: team.id }).id
  const a = hire('가직원')
  const b = hire('나직원')
  const m: Meeting = {
    id: 'mt1',
    topic: '출시 준비',
    participantIds: [a, b],
    rounds: 1,
    status: 'done',
    messages: [],
    summary: '결론\n할 일:\n- 문서 정리 (담당: 나직원)',
    createdAt: Date.now(),
    outcome: { state: 'pending', at: Date.now() },
  }
  inner().meetings.unshift(m)
  db.saveMeeting(m)
  await settle()
  return { a, b, m }
}

async function callTool(staffId: string, name: string, args: Record<string, unknown>) {
  const cfg = inner().officeMcp.get(staffId)?.config
  assert.ok(cfg, '직원 세션의 사무실 도구가 등록돼 있다')
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...cfg.headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })
  const body = (await res.json()) as { result: { content: { text: string }[] } }
  return body.result.content[0].text
}

test('잘못된 선택값은 상태를 바꾸지 않고 거절한다 (빈 객체·형식 없음·모르는 형식·모르는 종류)', async () => {
  const { m } = await setup()
  const tasksBefore = office.snapshot().tasks.length
  for (const bad of [{}, { kind: 'artifact' }, { kind: 'artifact', format: 'pdf' }, { kind: 'publish' }, null, 'plan']) {
    assert.equal(office.resolveMeetingOutcome(m.id, bad as never), false, JSON.stringify(bad))
    assert.equal(meeting(m.id).outcome?.state, 'pending')
  }
  assert.equal(office.snapshot().tasks.length, tasksBefore, '업무 카드도 만들지 않는다')
  // 바른 값은 그대로 된다
  assert.equal(office.resolveMeetingOutcome(m.id, { kind: 'skip' }), true)
  assert.equal(meeting(m.id).outcome?.state, 'skipped')
})

test("리더 아닌 진행자도 '다시 기획'으로 돌려받은 회의 기획안을 다시 올린다 (담당 = 회의 참석자)", async () => {
  const { a, m } = await setup()
  assert.equal(office.resolveMeetingOutcome(m.id, { kind: 'plan' }), true)
  const ref = meeting(m.id).outcome!.ref!
  assert.equal(task(ref).assigneeId, a)
  assert.equal(office.reviewPlan(ref, false, '할 일을 둘로 나눠 주세요'), true)
  assert.equal(task(ref).plan?.status, 'revise')
  await settle()

  const reply = await callTool(a, 'propose_plan', {
    spec: '고친 기획',
    subtasks: [
      { title: '문서 초안', detail: '…', assignee: '나직원' },
      { title: '문서 검토', detail: '…', assignee: '가직원' },
    ],
  })
  const plan = task(ref).plan!
  assert.equal(plan.status, 'waiting', reply)
  assert.deepEqual(
    plan.subtasks.map((st) => st.assigneeName),
    ['나직원', '가직원'],
  )
  // 다시 올린 뒤(돌려받은 기획안이 없으면) 리더가 아닌 직원은 기획안을 올리지 못한다
  const again = await callTool(a, 'propose_plan', { spec: '또', subtasks: [{ title: 'x', detail: '…', assignee: '나직원' }] })
  assert.equal(again, t('staff.tool.plan.useHelp'))
  assert.ok(task(ref).plan?.spec.includes('고친 기획') && !task(ref).plan?.spec.includes('또'))
})
