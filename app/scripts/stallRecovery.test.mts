// 엔진이 응답하지 않을 때: 첫 응답 감시(지시 확인 중에서 멈춤)와 끼어들기(replace)의 강제 재시작
// delegateInterrupt.test.mts와 같은 방식 (엔진 프로세스만 가짜)

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { after, afterEach, beforeEach, test } from 'node:test'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'room-routing-'))
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
const { stallTiming } = await import('../src/main/hired.ts')
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
    this.drain()
  }
  /** 실제 SDK처럼 inbox를 바로 세션으로 가져간다 — 가져간 지시는 닫힌 뒤 결과가 오지 않는다 */
  delivered: string[] = []
  private drain() {
    const self = this as unknown as { inbox: { message: { content: unknown } }[] }
    for (const m of self.inbox.splice(0)) this.delivered.push(JSON.stringify(m.message.content))
  }
  override close() {
    this.closes++
    super.close()
    this.open = false
  }
  override dispose() {
    this.open = false
  }
  sent: string[] = []
  hangInterrupt = false
  closes = 0
  override send(text: string, attachments: Parameters<ClaudeRuntime['send']>[1]) {
    super.send(text, attachments)
    this.sent.push(text)
    if (this.open) this.drain()
  }
  override async interrupt() {
    if (this.hangInterrupt) await new Promise(() => {})
  }
  sdk(m: Record<string, unknown>) {
    ;(this as unknown as { translate(m: unknown): void }).translate(m)
  }
  init() {
    this.sdk({ type: 'system', subtype: 'init', session_id: `s-${Math.random()}`, terminal_slash_commands: [] })
  }
  result(text: string) {
    this.sdk({ type: 'result', subtype: 'success', is_error: false, result: text, num_turns: 1, total_cost_usd: 0, modelUsage: {} })
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
  office = new Office({ makeRuntime: (_p, onEvent) => (lastRuntime = new FakeClaude(onEvent)), isNetBack: async () => true })
  office.start()
})
stallTiming.firstResponseMs = 150
stallTiming.interruptMs = 150
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


function hire(name: string, teamId: string) {
  const s = office.hire({ name, role: '개발', avatar: 0, provider: 'claude', model: 'default', cwd: root, systemPrompt: '', approvalMode: 'default', teamId })
  runtimes.set(s.id, lastRuntime!)
  return s.id
}
const rt = (id: string) => runtimes.get(id)!
const staff = (id: string) => office.snapshot().staff.find((s) => s.id === id)!
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('엔진이 첫 응답을 안 하면 시간이 지난 뒤 오류로 바꾸고 세션을 닫는다. 다음 지시는 세션을 새로 열어 받는다', async () => {
  const team = office.createTeam('프론트', '#888')
  const m = hire('최팀원', team.id)
  await settle()
  office.instruct(m, '버튼 고쳐 주세요')
  assert.equal(staff(m).status, 'working')
  assert.equal(staff(m).activity, '지시 확인 중')
  await wait(400)
  assert.equal(staff(m).status, 'error')
  assert.match(staff(m).activity, /응답이 없어/)
  assert.ok(rt(m).closes >= 1, '응답 없는 세션을 닫았다')
  assert.equal(office.snapshot().staff.find((s) => s.id === m)?.progress ?? null, null, '받은 일은 정리됐다')
  office.instruct(m, '다시 해 주세요')
  assert.equal(rt(m).sent.at(-1), '다시 해 주세요')
  assert.equal(staff(m).status, 'working')
})

test('첫 이벤트가 오면 감시가 풀려 오래 걸리는 일은 오류로 바뀌지 않는다', async () => {
  const team = office.createTeam('프론트', '#888')
  const m = hire('최팀원', team.id)
  await settle()
  office.instruct(m, '오래 걸리는 일')
  rt(m).init()
  await wait(400)
  assert.equal(staff(m).status, 'working')
})

test('replace: 엔진이 끊기 요청에 응답하지 않아도 강제로 닫고 새 지시를 새 세션으로 보낸다', async () => {
  const team = office.createTeam('프론트', '#888')
  const lead = hire('정리드', team.id)
  const m = hire('최팀원', team.id)
  office.updateTeam(team.id, { leadId: lead })
  await settle()
  office.instruct(m, '하던 일')
  rt(m).init()
  rt(m).hangInterrupt = true
  const reply = (office as unknown as { delegateFrom(l: string, n: string, i: string, x?: string): string }).delegateFrom(lead, '최팀원', '급한 버그부터', 'replace')
  assert.ok(reply)
  await wait(220) // 끊기 대기(150ms) 직후 — 새 지시의 첫 응답 감시(150ms)는 아직 안 끝났다
  assert.ok(rt(m).closes >= 1, '응답 없는 세션을 강제로 닫았다')
  assert.ok(rt(m).sent.at(-1)?.includes('급한 버그부터'), '새 지시가 전해졌다')
  assert.equal(staff(m).status, 'working')
})

test('끼어들기 강제 종료 뒤 옛 세션의 늦은 오류는 새로 보낸 지시를 실패 처리하지 않는다', async () => {
  const team = office.createTeam('프론트', '#888')
  const lead = hire('정리드', team.id)
  const m = hire('최팀원', team.id)
  office.updateTeam(team.id, { leadId: lead })
  await settle()
  office.instruct(m, '하던 일')
  rt(m).init()
  rt(m).hangInterrupt = true
  // 옛 세션: 닫힌 뒤에 오류를 던지는 가짜 query
  let lateFail: () => void = () => {}
  const old = {
    close() {},
    supportedCommands: async () => [],
    async *[Symbol.asyncIterator]() {
      await new Promise<void>((r) => (lateFail = r))
      throw new Error('late boom')
    },
  }
  ;(rt(m) as unknown as { q: unknown }).q = old
  void (rt(m) as unknown as { consume(q: unknown): Promise<void> }).consume(old)
  ;(office as unknown as { delegateFrom(l: string, n: string, i: string, x?: string): string }).delegateFrom(lead, '최팀원', '급한 버그부터', 'replace')
  for (let i = 0; i < 50 && !rt(m).sent.at(-1)?.includes('급한 버그부터'); i++) await wait(40)
  assert.ok(rt(m).sent.at(-1)?.includes('급한 버그부터'))
  lateFail()
  await settle()
  assert.equal(staff(m).status, 'working', '옛 세션의 늦은 오류가 새 지시를 실패로 만들지 않는다')
})

test('끼어들기 강제 종료는 이미 세션에 넘어간 줄 선 지시를 새 세션에서 다시 보낸다', async () => {
  const team = office.createTeam('프론트', '#888')
  const lead = hire('정리드', team.id)
  const m = hire('최팀원', team.id)
  office.updateTeam(team.id, { leadId: lead })
  await settle()
  office.instruct(m, '하던 일')
  rt(m).init()
  office.instruct(m, '줄 선 일')
  rt(m).hangInterrupt = true
  ;(office as unknown as { delegateFrom(l: string, n: string, i: string, x?: string): string }).delegateFrom(lead, '최팀원', '급한 버그부터', 'replace')
  for (let i = 0; i < 50 && !rt(m).delivered.at(-1)?.includes('급한 버그부터'); i++) await wait(40)
  const lines = rt(m).delivered.filter((d) => d.includes('줄 선 일') || d.includes('급한 버그부터'))
  assert.equal(lines.length, 3, '줄 선 일(처음) + 줄 선 일(다시) + 새 지시')
  assert.ok(lines[1].includes('줄 선 일') && lines[2].includes('급한 버그부터'), '줄 선 지시가 새 지시보다 먼저 다시 전해졌다')
})

test('10초 안에 결과가 와서 중지 처리가 끝났으면 강제 경로가 중지를 두 번 알리지 않는다', async () => {
  const team = office.createTeam('프론트', '#888')
  const m = hire('최팀원', team.id)
  await settle()
  office.instruct(m, '하던 일')
  rt(m).init()
  rt(m).hangInterrupt = true
  const closesBefore = rt(m).closes
  const done = office.interrupt(m)
  rt(m).result('')
  await done
  await wait(250)
  assert.equal(rt(m).closes, closesBefore, '이미 처리된 중지는 세션을 다시 닫지 않는다')
  assert.equal(staff(m).status, 'idle')
})
