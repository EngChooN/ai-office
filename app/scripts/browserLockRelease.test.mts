// 공용 브라우저 락 해제: 락을 쥔(또는 막힌) 직원이 한가해지면 락을 놓고 세션을 닫는다
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
  deliveredIds: (string | undefined)[] = []
  private drain() {
    const self = this as unknown as { inbox: { uuid?: string; message: { content: unknown } }[] }
    for (const m of self.inbox.splice(0)) {
      this.delivered.push(JSON.stringify(m.message.content))
      this.deliveredIds.push(m.uuid)
    }
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

type Priv = { browserLock: { claim(id: string): boolean; holder(): string | null }; browserBlocked: Set<string> }
const priv = () => office as unknown as Priv

test('락을 쥔 직원의 턴이 끝나면 락을 놓고 세션을 닫아, 다른 직원이 잡을 수 있다', async () => {
  const team = office.createTeam('프론트', '#888')
  const a = hire('가직원', team.id)
  const b = hire('나직원', team.id)
  await settle()
  office.instruct(a, '로그인 해 주세요')
  rt(a).init()
  assert.equal(priv().browserLock.claim(a), true)
  assert.equal(priv().browserLock.claim(b), false)
  const before = rt(a).closes
  rt(a).result('끝')
  await settle()
  assert.equal(priv().browserLock.holder(), null)
  assert.ok(rt(a).closes > before, '락을 쥐었던 직원의 세션을 닫았다')
  assert.equal(priv().browserLock.claim(b), true)
})

test('락이 없는 직원의 턴이 끝나도 세션을 닫지 않는다', async () => {
  const team = office.createTeam('프론트', '#888')
  const a = hire('가직원', team.id)
  await settle()
  office.instruct(a, '일')
  rt(a).init()
  const before = rt(a).closes
  rt(a).result('끝')
  await settle()
  assert.equal(rt(a).closes, before)
})

test('막혀 있던 직원도 턴이 끝나면 세션을 닫아, 다음 지시 때 브라우저를 다시 받는다', async () => {
  const team = office.createTeam('프론트', '#888')
  const b = hire('나직원', team.id)
  await settle()
  priv().browserBlocked.add(b)
  office.instruct(b, '일')
  rt(b).init()
  const before = rt(b).closes
  rt(b).result('끝')
  await settle()
  assert.equal(priv().browserBlocked.has(b), false)
  assert.ok(rt(b).closes > before)
})

test('해고하면 락과 막힘 기록을 정리한다', async () => {
  const team = office.createTeam('프론트', '#888')
  const a = hire('가직원', team.id)
  const b = hire('나직원', team.id)
  await settle()
  priv().browserLock.claim(a)
  priv().browserBlocked.add(b)
  office.fire(a)
  office.fire(b)
  assert.equal(priv().browserLock.holder(), null)
  assert.equal(priv().browserBlocked.size, 0)
})
