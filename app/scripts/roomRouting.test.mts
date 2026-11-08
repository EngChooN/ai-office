// 보고·상태 줄의 방 정하기를 실제 Office로 확인 — 단체방 지시는 단체방, 방이 사라지면 다음 순서, 섞인 턴은 방마다
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
const snap = () => office.snapshot()
const progress = (id: string) => snap().staff.find((s) => s.id === id)?.progress
const reportsOf = (id: string) => db.recentChat(200).filter((m) => m.from === id && m.isReport)
const reportRooms = (id: string) => reportsOf(id).map((m) => m.room ?? '')
const inst = (id: string, room: string | undefined, text = '일') => office.instruct(id, text, { kind: 'user', ...(room !== undefined ? { room } : {}) })
const delegate = (leadId: string, member: string, instruction: string, interrupt?: 'continue') => (office as unknown as { delegateFrom(l: string, m: string, i: string, x?: string): string }).delegateFrom(leadId, member, instruction, interrupt)

async function oneTeam() {
  const team = office.createTeam('프론트', '#888')
  const a = hire('정리드', team.id)
  const b = hire('최팀원', team.id)
  office.updateTeam(team.id, { leadId: a })
  await settle()
  return { team, a, b }
}

test('섞인 턴: 팀원이 팀 방 일을 하다 전체 방 리드의 끼어들기를 받아 한 턴으로 마치면 보고가 두 방에 각각 올라가고, 상태 줄도 방마다 뜬다', async () => {
  const { team, a, b } = await oneTeam()
  inst(b, team.id, '팀 방 일')
  rt(b).init()
  inst(a, '') // 리드는 전체 방에서 시킨 일을 하는 중
  rt(a).init()
  delegate(a, '최팀원', '급한 일도 같이 해 주세요', 'continue')
  await flush()
  assert.equal(progress(b)?.room, team.id)
  assert.deepEqual(progress(b)?.others?.map((o) => o.room ?? ''), [''], '전체 방 지시는 전체 방 상태 줄에')
  rt(b).sdk({ type: 'result', subtype: 'error_during_execution', is_error: true, result: '', num_turns: 1, total_cost_usd: 0, modelUsage: {} })
  rt(b).result('둘 다 끝')
  await settle()
  assert.deepEqual(reportRooms(b).sort(), ['', team.id].sort())
})

test('섞이지 않은 턴: 전체 방 지시는 소속 팀 방으로 새지 않는다', async () => {
  const { b } = await oneTeam()
  inst(b, '')
  rt(b).init()
  assert.equal(progress(b)?.room, undefined)
  rt(b).result('끝')
  await settle()
  assert.deepEqual(reportRooms(b), [''])
})

test('방이 사라지면: 지시가 온 팀 방이 삭제된 뒤의 보고는 소속 방 → 전체 방으로', async () => {
  const { team, b } = await oneTeam()
  const other = office.createTeam('백엔드', '#444')
  const c = hire('박다른', other.id)
  await settle()
  inst(c, team.id) // 다른 팀 직원에게 첫 팀 방에서 시킨 일
  rt(c).init()
  office.deleteTeam(team.id)
  assert.equal(progress(c)?.room, other.id, '상태 줄도 보이지 않는 방이 아니라 소속 방')
  rt(c).result('끝')
  await settle()
  assert.deepEqual(reportRooms(c), [other.id])
  inst(b, 'lab:none')
  rt(b).init()
  rt(b).result('끝')
  await settle()
  assert.ok(reportRooms(b).every((r) => r === '' || r !== 'lab:none'))
})

test('소속 방이 없는 직원의 지시는 상태 줄·보고 모두 전체 방', async () => {
  const x = hire('무소속', null)
  inst(x, undefined)
  rt(x).init()
  assert.equal(progress(x)?.room, undefined)
  rt(x).result('끝')
  await settle()
  assert.deepEqual(reportRooms(x), [''])
})

test('위임: 팀 방에서 시킨 리드의 보고는 팀 방, 전체 방에서 시킨 리드의 보고는 전체 방', async () => {
  for (const room of ['team', ''] as const) {
    const { team, a, b } = await oneTeam()
    const want = room === 'team' ? team.id : ''
    inst(a, want)
    rt(a).init()
    delegate(a, '최팀원', '이것 해 주세요')
    rt(b).init()
    assert.equal(progress(b)?.room ?? '', want, '위임받은 팀원의 상태 줄도 같은 방')
    rt(b).result('했습니다')
    await settle()
    rt(a).result('정리해서 보고합니다')
    await settle()
    assert.deepEqual(reportRooms(a), [want])
  }
})
