// 인터넷 끊김 → 연결 대기 → 복구 → 이어 하기 통합 시험 (fa07555)
// 실제 Office·HiredStaffManager(Worker)·ClaudeRuntime.translate·CodexRuntime.onMessage를 그대로 타고,
// 바꿔 끼우는 것은 ① 엔진 프로세스(SDK·app-server를 띄우지 않는 가짜 런타임) ② 연결 확인(isNetBack) ③ 시계(mock.timers)뿐이다
// 끊김 메시지는 실제로 받은 모양 그대로: Claude는 subtype success + is_error true 결과, Codex는 willRetry 없는 error 알림

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { after, afterEach, beforeEach, mock, test } from 'node:test'
import type { RuntimeEvent } from '../src/main/ai/types.ts'
import type { Task } from '../src/shared/types.ts'

// 직원 세션 파일·설정을 실제 홈에서 읽거나 고치지 않게 임시 홈을 쓴다 (모듈이 홈 경로를 불러올 때 읽으므로 import 전에)
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'net-resume-flow-'))
process.env.HOME = path.join(root, 'home')
fs.mkdirSync(process.env.HOME)
const g = globalThis as unknown as { __electron: unknown }
let userData = ''
g.__electron = {
  app: { getPath: () => userData, getVersion: () => '0.0.0', getLocale: () => 'ko', getAppPath: () => process.cwd(), isPackaged: false, on() {} },
  net: {
    isOnline: () => assert.fail('시험에서는 실제 연결 상태를 보지 않는다 (isNetBack을 바꿔 끼운다)'),
    fetch: () => assert.fail('시험에서는 AI 서버에 묻지 않는다'),
  },
}
register('./officeLoaderHooks.mjs', import.meta.url)

const { Office } = await import('../src/main/office.ts')
const { ClaudeRuntime } = await import('../src/main/ai/claude.ts')
const { CodexRuntime, GOAL_AUTO_TURN_MAX } = await import('../src/main/ai/codex.ts')
const { codexSlash } = await import('../src/main/ai/codexAssets.ts')
const { NET_CHECK_INTERVAL_MS, NET_PARK_MAX_MS, NET_RESUME_MAX_TRIES } = await import('../src/shared/netResume.ts')
const { t } = await import('../src/shared/i18n/index.ts')
const db = await import('../src/main/db.ts')
const { startLocalMcp, stopLocalMcp } = await import('../src/main/mcp/localMcp.ts')

// 직원 세션을 열 때 붙이는 사무실 도구 서버 (앱도 직원 세션보다 먼저 켠다)
await startLocalMcp()
after(() => {
  stopLocalMcp()
  db.closeDb()
  fs.rmSync(root, { recursive: true, force: true })
})

// 실제로 받은 끊김 문구 (scripts/networkError.test.mts와 같은 샘플)
const CLAUDE_DNS = "API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)"
const CODEX_REFUSED = 'stream disconnected before completion: Connection refused (os error 61)'

/** 엔진에 넘긴 지시를 적어 두는 가짜 — 공통 */
interface Fake {
  readonly provider: 'claude' | 'codex'
  sent: string[]
  starts: number
}

/** Claude: 지시·세션 열기만 가짜, SDK 메시지를 결과 이벤트로 바꾸는 translate는 실제 코드 */
class FakeClaude extends ClaudeRuntime implements Fake {
  sent: string[] = []
  starts = 0
  private open = false
  override get isOpen() {
    return this.open
  }
  override start() {
    this.open = true
    this.starts++
  }
  override send(text: string, attachments: Parameters<ClaudeRuntime['send']>[1]) {
    super.send(text, attachments)
    this.sent.push(text)
  }
  override close() {
    super.close()
    this.open = false
  }
  override dispose() {
    this.open = false
  }
  override async interrupt() {}
  /** SDK가 보낸 메시지 한 통 (실제 translate로) */
  sdk(m: Record<string, unknown>) {
    ;(this as unknown as { translate(m: unknown): void }).translate(m)
  }
  /** SDK query가 던진 예외 (실제 consume의 catch와 같은 이벤트) */
  throws(e: Error) {
    ;(this as unknown as { onEvent(e: RuntimeEvent): void }).onEvent({ type: 'error', error: e })
  }
  result(text: string, isError = false) {
    this.sdk({ type: 'result', subtype: 'success', is_error: isError, result: text, num_turns: 1, total_cost_usd: 0, modelUsage: {} })
  }
}

/** Codex: 지시·프로세스만 가짜, app-server 알림을 이벤트로 바꾸는 onMessage는 실제 코드 */
class FakeCodex extends CodexRuntime implements Fake {
  sent: string[] = []
  starts = 0
  private open = false
  override get isOpen() {
    return this.open
  }
  override start() {
    this.open = true
    this.starts++
  }
  override send(text: string) {
    this.sent.push(text)
  }
  override close() {
    this.open = false
  }
  override dispose() {
    this.open = false
  }
  override async interrupt() {}
  notify(method: string, params: Record<string, unknown>) {
    const self = this as unknown as { onMessage(m: unknown, gen: number): void; generation: number }
    self.onMessage({ method, params }, self.generation)
  }
  finish(text: string) {
    this.notify('item/completed', { item: { type: 'agentMessage', id: 'm1', text } })
    this.notify('turn/completed', { turn: { id: 't1', status: 'completed' } })
  }
}

// ── 시험 사무실 ─────────────────────────────────────────

type OfficeT = InstanceType<typeof Office>
let office: OfficeT
let online = true
let netChecks = 0
const runtimes = new Map<string, Fake>()
let lastRuntime: Fake | null = null

beforeEach(() => {
  // 시계는 Date와 setInterval만 — 연결 확인 타이머와 6시간 제한을 시험 안에서 돌린다 (setImmediate·setTimeout은 실제)
  mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1_800_000_000_000 })
  db.closeDb()
  userData = fs.mkdtempSync(path.join(root, 'ud-'))
  db.openDb()
  online = true
  netChecks = 0
  runtimes.clear()
  office = new Office({
    makeRuntime: (provider, onEvent) => {
      const rt = provider === 'codex' ? new FakeCodex(onEvent) : new FakeClaude(onEvent)
      lastRuntime = rt
      return rt
    },
    isNetBack: async () => {
      netChecks++
      return online
    },
  })
  office.start()
})

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))
}
/** 사무실의 화면 갱신(50ms 뒤 한 번 — 이때 미뤄 둔 지시 releaseHeld·작업 폴더 맞추기도 돈다)까지 기다린다 */
const settle = async () => {
  await new Promise((r) => setTimeout(r, 80))
  await flush()
}

afterEach(async () => {
  office.stop()
  await settle() // 남은 화면 갱신이 닫힌 DB를 건드리지 않게
  mock.timers.reset()
})

function hire(name: string, provider: 'claude' | 'codex' = 'claude') {
  const s = office.hire({ name, role: '개발', avatar: 0, provider, model: provider === 'codex' ? 'gpt-5.5' : 'default', cwd: root, systemPrompt: '', approvalMode: 'default', teamId: null })
  assert.ok(lastRuntime, '직원을 고용하면 엔진을 만든다')
  runtimes.set(s.id, lastRuntime)
  return s.id
}
const rt = <T extends Fake>(id: string) => runtimes.get(id) as T
const claude = (id: string) => rt<FakeClaude>(id)
const codex = (id: string) => rt<FakeCodex>(id)
const staff = (id: string) => office.snapshot().staff.find((s) => s.id === id)!
const task = (id: string) => office.snapshot().tasks.find((x) => x.id === id) as Task
const hasParked = (id: string) => (office as unknown as { netParked: { has(id: string): boolean } }).netParked.has(id)

/** 업무 카드를 만들어 맡기고, 세션이 열려 init까지 받은 상태로 */
async function startTask(id: string, title = '로그인 화면 고치기') {
  await settle() // 고용 직후 화면 갱신(작업 폴더 맞추기)을 먼저 끝낸다
  const card = office.createTask({ title, detail: '', teamId: null })
  office.assignTask(card.id, id)
  const r = rt(id)
  if (r.provider === 'claude') claude(id).sdk({ type: 'system', subtype: 'init', session_id: `sess-${id}`, terminal_slash_commands: [] })
  else codex(id).notify('turn/started', { turn: { id: 't1' } })
  assert.equal(staff(id).status, 'working')
  assert.equal(task(card.id).status, 'doing')
  return card.id
}

/** Claude: SDK가 연결 실패를 정상 결과(subtype success)에 is_error true로 보낸다 */
async function dropClaude(id: string) {
  claude(id).result(CLAUDE_DNS, true)
  await settle()
}
/** Codex: 재시도를 포기한 error 알림 (재시도 중 알림 willRetry true는 무시된다) */
async function dropCodex(id: string) {
  codex(id).notify('error', { error: { message: 'Reconnecting... 1/5 (waiting for network)' }, willRetry: true })
  codex(id).notify('error', { error: { message: CODEX_REFUSED }, willRetry: false })
  await settle()
}

/** 연결 확인 타이머 한 번 */
async function tickNet() {
  mock.timers.tick(NET_CHECK_INTERVAL_MS)
  await flush()
  await settle()
}

const RESUME = () => t('staff.msg.netResume')

// ── 1) 끊김 → 연결 대기, 카드는 진행 중 ───────────────────

test('1) Claude: is_error 결과로 끊기면 netWait, 카드는 진행 중 그대로, 끊긴 동안은 이어 보내지 않는다', async () => {
  const a = hire('김클로')
  const card = await startTask(a)
  online = false
  await dropClaude(a)
  assert.equal(staff(a).status, 'netWait')
  assert.equal(task(card).status, 'doing')
  assert.equal(hasParked(a), true)
  const sent = claude(a).sent.length
  await tickNet()
  await tickNet()
  assert.equal(netChecks, 2, '보관한 일이 있으면 15초마다 연결을 본다')
  assert.equal(claude(a).sent.length, sent, '연결되기 전에는 아무것도 보내지 않는다')
  assert.equal(staff(a).status, 'netWait')
  assert.equal(task(card).status, 'doing')
})

test('1) Codex: 재시도를 포기한 연결 오류면 netWait, 카드는 진행 중 그대로 (재시도 중 알림은 그대로 일하는 중)', async () => {
  const a = hire('박코덱', 'codex')
  const card = await startTask(a)
  codex(a).notify('error', { error: { message: 'Reconnecting... 1/5 (waiting for network)' }, willRetry: true })
  assert.equal(staff(a).status, 'working', '앱 서버가 다시 붙는 중에는 보관하지 않는다')
  online = false
  await dropCodex(a)
  assert.equal(staff(a).status, 'netWait')
  assert.equal(task(card).status, 'doing')
  // 실패한 턴의 마무리 알림이 뒤따라 와도 보관은 그대로
  codex(a).notify('turn/completed', { turn: { id: 't1', status: 'failed' } })
  assert.equal(staff(a).status, 'netWait')
  assert.equal(task(card).status, 'doing')
})

// ── 2) 복구 → 같은 대화에 이어 하라는 지시 1번 ─────────────

for (const provider of ['claude', 'codex'] as const) {
  test(`2) ${provider}: 연결이 돌아오면 같은 세션에 이어 하라는 지시가 한 번 가고, 끝나면 카드가 검토로 간다`, async () => {
    const a = hire('이어하', provider)
    const card = await startTask(a)
    const r = rt(a)
    online = false
    if (provider === 'claude') await dropClaude(a)
    else await dropCodex(a)
    const before = r.sent.length
    const session = staff(a).sessionId
    online = true
    await tickNet()
    assert.deepEqual(r.sent.slice(before), [RESUME()], '이어 하라는 지시 한 번만')
    assert.equal(r.starts, 1, '세션을 새로 열지 않는다')
    assert.equal(staff(a).sessionId, session, '같은 대화')
    assert.equal(staff(a).status, 'working')
    assert.equal(hasParked(a), false)
    await tickNet()
    assert.equal(r.sent.length, before + 1, '다음 확인 때 다시 보내지 않는다')
    // 이어 간 턴이 끝나면 보관했던 출처(업무 카드)로 보고가 간다
    if (provider === 'claude') claude(a).result('고쳤습니다')
    else codex(a).finish('고쳤습니다')
    assert.equal(task(card).status, 'review')
    assert.equal(staff(a).status, 'idle')
  })
}

// ── 3) 3번 넘김 · 6시간 넘김 → 평소 오류 ─────────────────────

test(`3) 같은 일을 ${NET_RESUME_MAX_TRIES}번 이어 간 뒤 또 끊기면 평소 오류로 정리한다 (카드는 할 일로)`, async () => {
  const a = hire('세번')
  const card = await startTask(a)
  for (let i = 0; i < NET_RESUME_MAX_TRIES; i++) {
    online = false
    await dropClaude(a)
    assert.equal(staff(a).status, 'netWait', `${i + 1}번째 끊김은 보관`)
    online = true
    await tickNet()
    assert.equal(staff(a).status, 'working')
  }
  await dropClaude(a)
  assert.equal(hasParked(a), false)
  assert.equal(staff(a).status, 'error')
  assert.equal(task(card).status, 'todo')
  assert.equal(claude(a).sent.filter((x) => x === RESUME()).length, NET_RESUME_MAX_TRIES)
})

test('3) 처음 멈춘 지 6시간이 지나도록 연결되지 않으면 평소 오류로 정리한다', async () => {
  const a = hire('여섯')
  const card = await startTask(a)
  online = false
  await dropClaude(a)
  mock.timers.tick(NET_PARK_MAX_MS)
  await flush()
  await settle()
  assert.equal(staff(a).status, 'netWait', '6시간 정각까지는 기다린다')
  await tickNet()
  assert.equal(hasParked(a), false)
  assert.notEqual(staff(a).status, 'netWait')
  assert.equal(task(card).status, 'todo')
  online = true
  const sent = claude(a).sent.length
  await tickNet()
  assert.equal(claude(a).sent.length, sent, '포기한 일은 연결돼도 이어 가지 않는다')
})

// ── 4) 기다리는 중 대표가 직접 지시·중지 → 보관을 푼다 ────────

test('4) 연결을 기다리는 중 대표가 직접 지시하면 보관을 풀고(카드는 할 일로) 새 지시를 보낸다', async () => {
  const a = hire('직지시')
  const card = await startTask(a)
  online = false
  await dropClaude(a)
  office.instruct(a, '그건 두고 이것부터 해 주세요', { kind: 'user' }, [], '', true)
  assert.equal(hasParked(a), false)
  assert.equal(task(card).status, 'todo')
  assert.equal(claude(a).sent.at(-1), '그건 두고 이것부터 해 주세요')
  assert.equal(staff(a).status, 'working')
  online = true
  await tickNet()
  assert.equal(claude(a).sent.includes(RESUME()), false, '풀린 일은 이어 가지 않는다')
})

test('4) 연결을 기다리는 중 대표가 멈추면 보관을 풀고 손을 놓는다', async () => {
  const a = hire('멈춤')
  const card = await startTask(a)
  online = false
  await dropClaude(a)
  await office.interrupt(a)
  assert.equal(hasParked(a), false)
  assert.equal(task(card).status, 'todo')
  assert.notEqual(staff(a).status, 'netWait')
  online = true
  await tickNet()
  assert.equal(claude(a).sent.includes(RESUME()), false)
})

// ── 5) 기다리는 중 위임 결과 보고 → 이어 간 뒤에 보낸다 ────────

test('5) 리드가 연결을 기다리는 중 팀원의 위임 결과 보고가 오면 들고 있다가, 이어 하라는 지시 뒤에 보낸다', async () => {
  const lead = hire('정리드')
  const member = hire('최팀원')
  const card = await startTask(lead)
  // 리드가 맡긴 일 (사무실 delegate 도구와 같은 출처)
  office.instruct(member, '버튼 색만 바꿔 주세요', { kind: 'delegate', leadId: lead })
  online = false
  await dropClaude(lead)
  const before = claude(lead).sent.length
  claude(member).result('버튼 색을 바꿨습니다')
  await settle() // 화면 갱신이 미뤄 둔 지시를 꺼내 보려 해도(releaseHeld) 보관 중이면 다시 들고 있어야 한다
  await tickNet()
  assert.equal(claude(lead).sent.length, before, '보관 중에는 보고를 보내지 않는다')
  assert.equal(hasParked(lead), true, '보고가 리드 일을 끝내 버리지 않는다')
  assert.equal(staff(lead).status, 'netWait')
  assert.equal(task(card).status, 'doing')
  online = true
  await tickNet()
  const after = claude(lead).sent.slice(before)
  assert.equal(after.length, 2)
  assert.equal(after[0], RESUME())
  assert.match(after[1], /버튼 색을 바꿨습니다/)
  // 이어 간 턴과 보고 턴이 끝나면 카드는 검토로 (보고가 카드 출처를 가로채지 않는다)
  claude(lead).result('이어서 마쳤습니다')
  claude(lead).result('팀원 보고 확인했습니다')
  assert.equal(task(card).status, 'review')
})

// ── 6) 인터넷이 아닌 API 오류는 지금처럼 ───────────────────

test('6) Claude: 인터넷이 아닌 API 오류(is_error, 401)는 지금처럼 답 글로 끝나 카드가 검토로 간다', async () => {
  const a = hire('인증')
  const card = await startTask(a)
  claude(a).result('API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}', true)
  assert.equal(hasParked(a), false)
  assert.notEqual(staff(a).status, 'netWait')
  assert.equal(task(card).status, 'review')
})

test('6) Codex: 인터넷이 아닌 오류(사용량 한도)는 지금처럼 오류로 정리한다', async () => {
  const a = hire('한도', 'codex')
  const card = await startTask(a)
  codex(a).notify('error', { error: { message: "You've hit your usage limit. Try again later." }, willRetry: false })
  assert.equal(hasParked(a), false)
  assert.equal(staff(a).status, 'error')
  assert.equal(task(card).status, 'todo')
  await tickNet()
  assert.equal(netChecks, 0, '보관한 일이 없으면 연결을 확인하지 않는다')
})

// ── 그 밖: Claude가 같은 실패를 세션을 닫으며 한 번 더 던질 때 ───

test('Claude가 같은 실패를 "returned an error result"로 한 번 더 던져도 보관·연결 대기는 그대로다', async () => {
  const a = hire('두번')
  const card = await startTask(a)
  online = false
  await dropClaude(a)
  claude(a).throws(new Error(`Claude Code returned an error result: ${CLAUDE_DNS}`))
  assert.equal(hasParked(a), true)
  assert.equal(staff(a).status, 'netWait')
  assert.equal(task(card).status, 'doing')
  online = true
  await tickNet()
  assert.equal(claude(a).sent.filter((x) => x === RESUME()).length, 1)
})

// ── 그 밖: Codex /goal 뒤 Codex가 스스로 연 턴 ───

test('Codex: /goal로 목표를 정한 뒤 Codex가 스스로 이어 간 턴도 업무로 받아, 끝나면 대기로 돌아온다', async () => {
  const a = hire('목표', 'codex')
  await settle()
  office.instruct(a, '/goal a.txt 첫 줄 알려 주기')
  const self = codex(a) as unknown as { afterSlash(slash: unknown, r: unknown): void }
  self.afterSlash(codexSlash('/goal a.txt 첫 줄 알려 주기'), { result: {} })
  await settle()
  assert.equal(staff(a).status, 'idle', '목표를 정하면 그 명령은 끝난다')
  codex(a).notify('turn/started', { turn: { id: 't2' } })
  assert.equal(staff(a).status, 'working', '스스로 연 턴은 일하는 중으로 보인다')
  codex(a).finish('a.txt 첫 줄은 hi입니다.')
  await settle()
  assert.equal(staff(a).status, 'idle', '끝 결과를 버리지 않아 작업 중에 멈추지 않는다')
})

test(`Codex: 지시 없이 이어 간 목표 턴이 ${GOAL_AUTO_TURN_MAX}번에 닿으면 목표를 멈추고 알린다, 새 지시를 하면 다시 센다`, async () => {
  const a = hire('끝없는목표', 'codex')
  await settle()
  const calls: [string, Record<string, unknown>][] = []
  const self = codex(a) as unknown as { call(m: string, p: Record<string, unknown>): Promise<unknown>; threadId: string | null }
  self.threadId = 'th1'
  self.call = async (m, p) => (calls.push([m, p]), { result: {} })
  const autoTurn = async () => {
    codex(a).notify('turn/started', { turn: { id: 'tg' } })
    codex(a).finish('아직')
    await settle()
  }
  for (let i = 1; i < GOAL_AUTO_TURN_MAX; i++) await autoTurn()
  assert.equal(calls.length, 0, '한도 전에는 목표를 건드리지 않는다')
  await autoTurn()
  assert.deepEqual(calls, [['thread/goal/set', { threadId: 'th1', status: 'paused', origin: 'automatic' }]])
  const logs = office.getRecord(a).logs.map((l) => l.text)
  assert.ok(logs.some((x) => x === t('codex.goal.limit', { n: GOAL_AUTO_TURN_MAX })), '멈춘 까닭을 남긴다')
  assert.equal(staff(a).status, 'idle')
  // 멈춤을 받는 사이 Codex가 이미 연 다음 턴은 업무로 받지 않고, 그 턴의 글도 남기지 않는다 (실제 Codex 0.164에서 생김)
  const before = office.getRecord(a).logs.length
  await autoTurn()
  assert.equal(staff(a).status, 'idle', '한도를 넘은 턴 때문에 작업 중에 멈추지 않는다')
  assert.equal(office.getRecord(a).logs.length, before)
  // 새 지시를 하면 처음부터 다시 센다
  office.instruct(a, '/goal resume')
  calls.length = 0
  for (let i = 1; i < GOAL_AUTO_TURN_MAX; i++) await autoTurn()
  assert.equal(calls.length, 0)
})
