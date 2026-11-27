// 업무 카드 실패 처리를 실제 Office로 확인 — 오류·실행 횟수 초과로 못 끝낸 카드는 검토가 아니라 할 일 + '실패' 표시,
// 직접 중단·리더가 바꿔 맡기기·인터넷 대기 보관은 실패가 아니다 (roomRouting.test.mts와 같은 방식, 엔진 프로세스만 가짜)

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { after, afterEach, beforeEach, test } from 'node:test'
import type { RuntimeEvent } from '../src/main/ai/types.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'task-failure-'))
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
const { startLocalMcp, stopLocalMcp } = await import('../src/main/mcp/localMcp.ts')

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
  sdk(m: Record<string, unknown>) {
    ;(this as unknown as { translate(m: unknown): void }).translate(m)
  }
  init() {
    this.sdk({ type: 'system', subtype: 'init', session_id: `s-${Math.random()}`, terminal_slash_commands: [] })
  }
  result(text: string, isError = false, subtype = 'success') {
    this.sdk({ type: 'result', subtype, is_error: isError, result: text, num_turns: 1, total_cost_usd: 0, modelUsage: {} })
  }
  /** SDK query가 던진 예외 (실제 consume의 catch와 같은 이벤트) */
  throws(e: Error) {
    ;(this as unknown as { onEvent(e: RuntimeEvent): void }).onEvent({ type: 'error', error: e })
  }
}

type OfficeT = InstanceType<typeof Office>
let office: OfficeT
const runtimes = new Map<string, FakeClaude>()
let lastRuntime: FakeClaude | null = null

beforeEach(() => {
  db.closeDb()
  userData = fs.mkdtempSync(path.join(root, 'ud-'))
  db.openDb()
  runtimes.clear()
  // 인터넷은 돌아오지 않는다 — 보관한 일이 저절로 이어지지 않게
  office = new Office({ makeRuntime: (_p, onEvent) => (lastRuntime = new FakeClaude(onEvent)), isNetBack: async () => false })
  office.start()
})
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))
}
const settle = async () => {
  await new Promise((r) => setTimeout(r, 80))
  await flush()
}
afterEach(async () => {
  office.stop()
  await settle()
})

function hire(name: string, teamId: string | null) {
  const s = office.hire({ name, role: '개발', avatar: 0, provider: 'claude', model: 'default', cwd: root, systemPrompt: '', approvalMode: 'default', teamId: teamId as string })
  runtimes.set(s.id, lastRuntime!)
  return s.id
}
const rt = (id: string) => runtimes.get(id)!
const card = (id: string) => office.snapshot().tasks.find((x) => x.id === id)!
const delegate = (leadId: string, member: string, instruction: string, interrupt?: 'continue' | 'replace') =>
  (office as unknown as { delegateFrom(l: string, m: string, i: string, x?: string): string }).delegateFrom(leadId, member, instruction, interrupt)

/** 팀원 b가 업무 카드 하나를 받아 일하는 중 */
async function working() {
  const team = office.createTeam('프론트', '#888')
  const a = hire('정리드', team.id)
  const b = hire('최팀원', team.id)
  office.updateTeam(team.id, { leadId: a })
  await settle()
  const task = office.createTask({ title: '화면 고치기', detail: '', teamId: team.id })
  office.assignTask(task.id, b)
  rt(b).init()
  await flush()
  assert.equal(card(task.id).status, 'doing')
  return { a, b, taskId: task.id }
}

test('실행 횟수 초과로 끝난 턴: 카드는 검토가 아니라 할 일로, 실패 표시와 이유가 붙고 다시 켜도 남는다', async () => {
  const { b, taskId } = await working()
  rt(b).result('Reached maximum number of turns (40)\n자세한 기록', true, 'error_max_turns')
  await settle()
  const c = card(taskId)
  assert.equal(c.status, 'todo')
  assert.match(c.failure?.reason ?? '', /error_max_turns/)
  assert.equal(c.work?.state, 'queued')
  assert.equal(db.loadTasks().find((x) => x.id === taskId)?.failure?.reason, c.failure?.reason)
})

test('실행 중 오류(예외): 할 일 + 실패 표시', async () => {
  const { b, taskId } = await working()
  rt(b).throws(new Error('Claude Code process exited with code 1'))
  await settle()
  assert.equal(card(taskId).status, 'todo')
  assert.match(card(taskId).failure?.reason ?? '', /exited with code 1/)
})

test('다시 맡기면 실패 표시를 지운다', async () => {
  const { b, taskId } = await working()
  rt(b).result('max turns', true, 'error_max_turns')
  await settle()
  assert.ok(card(taskId).failure)
  office.assignTask(taskId, b)
  await flush()
  assert.equal(card(taskId).status, 'doing')
  assert.equal(card(taskId).failure, undefined)
  assert.equal(db.loadTasks().find((x) => x.id === taskId)?.failure, undefined)
})

test('직접 중단은 실패가 아니다: 할 일로 돌아가되 표시 없음', async () => {
  const { b, taskId } = await working()
  void office.interrupt(b)
  await flush()
  rt(b).result('')
  await settle()
  assert.equal(card(taskId).status, 'todo')
  assert.equal(card(taskId).failure, undefined)
})

test('리더가 바꿔 맡기기(replace)는 실패가 아니다', async () => {
  const { a, b, taskId } = await working()
  delegate(a, '최팀원', '이것부터 해 주세요', 'replace')
  await settle()
  assert.equal(card(taskId).status, 'todo')
  assert.equal(card(taskId).failure, undefined)
})

test('인터넷 오류 보관은 실패가 아니다: 보관 중엔 진행 중 그대로, 대표가 새로 지시해 보관을 풀어도 표시 없음', async () => {
  const { b, taskId } = await working()
  rt(b).throws(new Error("API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)"))
  await settle()
  assert.equal(office.snapshot().staff.find((s) => s.id === b)?.status, 'netWait')
  assert.equal(card(taskId).status, 'doing')
  assert.equal(card(taskId).failure, undefined)
  office.instruct(b, '다른 일 해 주세요', { kind: 'user' }, [], '', true)
  await settle()
  assert.equal(card(taskId).status, 'todo')
  assert.equal(card(taskId).failure, undefined)
})

test('정상으로 끝나면 지금처럼 검토로 (실패 표시 없음)', async () => {
  const { b, taskId } = await working()
  rt(b).result('다 고쳤습니다')
  await settle()
  assert.equal(card(taskId).status, 'review')
  assert.equal(card(taskId).failure, undefined)
})

// ── 실패를 정상 완료로 흘리지 않는다 (리뷰 경계) ──

const priv = () => office as unknown as { runs: Record<string, unknown>[]; origins: Map<string, unknown[]>; manager: { backlog(id: string): number } }

test('서버가 오류라고 표시한 응답(API Error 500)도 실패: 할 일 + 실패 표시', async () => {
  const { b, taskId } = await working()
  rt(b).result('API Error: 500 Internal server error', true, 'success')
  await settle()
  assert.equal(card(taskId).status, 'todo')
  assert.match(card(taskId).failure?.reason ?? '', /API Error: 500/)
})

test('대화방 지시가 실패로 끝나면 완료 보고가 아니라 오류 안내 (지시 말풍선은 오류)', async () => {
  const team = office.createTeam('검토팀', '#888')
  const b = hire('검토원', team.id)
  await settle()
  office.sendChat('@검토원 테스트 일을 해 주세요', [], team.id)
  rt(b).init()
  await flush()
  rt(b).result('실행 횟수 초과', true, 'error_max_turns')
  await settle()
  const posts = db.recentChat(100).filter((m) => m.from === b && !m.text.includes('잘 부탁드려요'))
  assert.equal(posts.filter((m) => m.isReport).length, 0)
  assert.ok(posts.some((m) => m.room === team.id && m.text.includes('오류로 멈췄어요')))
  const mine = db.recentChat(100).find((m) => m.from === 'me' && m.text.startsWith('@검토원'))
  assert.equal(mine?.deliveries?.find((d) => d.staffId === b)?.state, 'error')
})

test('절차 단계가 실패로 끝나면 다음 단계·절차 완료로 넘기지 않고, 이어진 카드는 실패로 할 일에', async () => {
  const { b, taskId } = await working()
  const run = { id: 'failed-run', manualName: '검증', manualTitle: '검증', steps: [{ id: 'last', title: '마지막', needsMyCheck: false }], scope: { kind: 'team', id: 'x', name: '검증' }, input: '', taskId, status: 'running', stepIndex: 0, currentStaffId: b, history: [], loops: {}, pendingOutput: '', createdAt: Date.now(), updatedAt: Date.now() }
  priv().runs.unshift(run)
  priv().origins.set(b, [{ kind: 'process', runId: run.id, stepId: 'last' }])
  rt(b).result('실행 횟수 초과', true, 'error_max_turns')
  await settle()
  assert.equal(run.status, 'stopped')
  assert.equal(card(taskId).status, 'todo')
  assert.ok(card(taskId).failure)
})

test('아직 전하지 않은(줄 선) 카드는 실패로 표시하지 않는다 — 하던 일만 실패', async () => {
  const team = office.createTeam('검토팀', '#888')
  const b = hire('검토원', team.id)
  await settle()
  office.instruct(b, '직원 창에서 시킨 지금 일', { kind: 'user' })
  rt(b).init()
  await flush()
  const next = office.createTask({ title: '아직 전하지 않은 카드', detail: '', teamId: team.id })
  office.assignTask(next.id, b)
  await flush()
  assert.ok(priv().manager.backlog(b) > 0, '카드 지시는 아직 줄 서 있다')
  rt(b).throws(new Error('process exited with code 1'))
  await settle()
  assert.equal(card(next.id).status, 'todo')
  assert.equal(card(next.id).failure, undefined)
})

test('도움 요청 일이 실패로 끝나면 정상 [팀원 보고]가 아니라 못 마쳤다는 안내로', async () => {
  const { a, b } = await working()
  priv().origins.set(b, [{ kind: 'help', fromId: a, reqId: 'failed-help', room: '' }])
  rt(b).result('실행 횟수 초과', true, 'error_max_turns')
  await settle()
  const sent = office.getRecord(a).logs.filter((x) => x.type === 'instruction').map((x) => JSON.stringify(x))
  assert.ok(!sent.some((x) => x.includes('[팀원 보고]')))
  assert.ok(sent.length > 0, '못 마쳤다는 안내는 간다')
})

// ── 실패 턴 뒤 이어지는 일 (리뷰 2라운드 경계) ──

type Priv = { origins: Map<string, unknown[]>; helpHeld: Map<string, unknown[]>; autoChecked: Set<string>; helpLedger: { open(from: string, to: string, chain: unknown[], isLeader?: boolean): { reqId: string; help: unknown } } }
const inner = () => office as unknown as Priv
const nextCard = (staffId: string) => {
  const next = office.createTask({ title: '다음 카드', detail: '', teamId: null })
  office.assignTask(next.id, staffId)
  return next.id
}

test('실패 턴 뒤 줄 선 다음 카드는 시작하고, 정상으로 끝나면 검토로', async () => {
  const { b, taskId } = await working()
  const next = nextCard(b)
  rt(b).result('API Error: 500 Internal server error', true)
  await settle()
  assert.equal(card(taskId).status, 'todo')
  assert.equal(card(next).status, 'doing')
  rt(b).result('다음 카드 완료')
  await settle()
  assert.equal(card(next).status, 'review')
})

test('실패 턴 뒤에는 대기 메시지를 먼저 보내고, 그다음 대기 카드를 시작한다', async () => {
  const { b } = await working()
  const next = nextCard(b)
  assert.equal(office.instructFromPanel(b, '먼저 답할 질문'), true)
  rt(b).result('API Error: 500 Internal server error', true)
  await settle()
  assert.ok(inner().origins.get(b)?.some((o) => (o as { kind: string }).kind === 'user'))
  rt(b).result('질문 답')
  await settle()
  assert.ok(inner().origins.get(b)?.some((o) => (o as { kind: string; taskId?: string }).kind === 'task' && (o as { taskId?: string }).taskId === next))
})

test('실패 결과 뒤 Claude가 같은 실패를 예외로 다시 던져도 다음 카드는 실패로 표시하지 않는다', async () => {
  const { b } = await working()
  const next = nextCard(b)
  rt(b).result('API Error: 500 Internal server error', true)
  await flush()
  rt(b).throws(new Error('Claude Code returned an error result: API Error: 500 Internal server error'))
  await settle()
  assert.equal(card(next).failure, undefined)
})

test('다음 턴이 움직인 뒤의 예외는 그 턴의 실패다', async () => {
  const { b } = await working()
  const next = nextCard(b)
  rt(b).result('API Error: 500 Internal server error', true)
  await flush()
  rt(b).sdk({ type: 'assistant', message: { content: [{ type: 'text', text: '다음 카드 하는 중' }] } })
  rt(b).throws(new Error('Claude Code returned an error result: 다른 오류'))
  await settle()
  assert.equal(card(next).status, 'todo')
  assert.ok(card(next).failure)
})

test('하위 도움 결과를 기다리던 리더가 실패하면: 취합 대기에 두지 않고 원래 부탁한 사람에게 실패를 알린다', async () => {
  const { a, b } = await working()
  const c = hire('하위도움', null)
  await settle()
  const p = inner()
  const opened = p.helpLedger.open(a, b, [], true)
  const origin = { kind: 'help', fromId: a, reqId: opened.reqId, help: opened.help, room: '' }
  p.origins.set(b, [origin])
  const child = p.helpLedger.open(b, c, [origin])
  p.origins.set(c, [{ kind: 'help', fromId: b, reqId: child.reqId, help: child.help, room: '' }])
  rt(b).result('API Error: 500 Internal server error', true)
  await settle()
  assert.ok(office.getRecord(a).logs.some((x) => x.type === 'instruction'))
  assert.equal(p.helpHeld.get(b)?.length ?? 0, 0)
})

test('실패 턴에서도 리더 멈춤 방지 점검은 그대로 돈다', async () => {
  const team = office.createTeam('점검팀', '#888')
  const a = hire('점검리더', team.id)
  hire('점검팀원', team.id)
  office.updateTeam(team.id, { leadId: a })
  await settle()
  office.instruct(a, '점검할 일', { kind: 'user' })
  rt(a).init()
  await flush()
  rt(a).result('API Error: 500 I will check', true)
  await settle()
  assert.equal(inner().autoChecked.has(a), true)
})
