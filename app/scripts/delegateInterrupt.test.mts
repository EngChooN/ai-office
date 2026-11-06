// 리더가 일하는 중인 팀원에게 delegate로 끼어들기 (interrupt: continue | replace) 통합 시험
// netResumeFlow.test.mts와 같은 방식: 실제 Office·HiredStaffManager·ClaudeRuntime.translate를 그대로 타고 엔진 프로세스만 가짜로 바꾼다

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { after, afterEach, beforeEach, test } from 'node:test'
import type { Task } from '../src/shared/types.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delegate-interrupt-'))
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
const { t } = await import('../src/shared/i18n/index.ts')
const db = await import('../src/main/db.ts')
const { startLocalMcp, stopLocalMcp } = await import('../src/main/mcp/localMcp.ts')

await startLocalMcp()
after(() => {
  stopLocalMcp()
  db.closeDb()
  fs.rmSync(root, { recursive: true, force: true })
})

/** Claude: 지시·세션 열기만 가짜, SDK 메시지를 결과 이벤트로 바꾸는 translate는 실제 코드 */
class FakeClaude extends ClaudeRuntime {
  sent: string[] = []
  interrupts = 0
  private open = false
  override get isOpen() {
    return this.open
  }
  override start() {
    this.open = true
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
  override async interrupt() {
    this.interrupts++
  }
  sdk(m: Record<string, unknown>) {
    ;(this as unknown as { translate(m: unknown): void }).translate(m)
  }
  result(text: string) {
    this.sdk({ type: 'result', subtype: 'success', is_error: false, result: text, num_turns: 1, total_cost_usd: 0, modelUsage: {} })
  }
  /** 끼어들기로 끊긴 턴의 결과 */
  interrupted() {
    this.sdk({ type: 'result', subtype: 'error_during_execution', is_error: true, result: '', num_turns: 1, total_cost_usd: 0, modelUsage: {} })
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
  office = new Office({
    makeRuntime: (_provider, onEvent) => (lastRuntime = new FakeClaude(onEvent)),
    isNetBack: async () => true,
  })
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

function hire(name: string, teamId: string) {
  const s = office.hire({ name, role: '개발', avatar: 0, provider: 'claude', model: 'default', cwd: root, systemPrompt: '', approvalMode: 'default', teamId })
  runtimes.set(s.id, lastRuntime!)
  return s.id
}
const rt = (id: string) => runtimes.get(id)!
const staff = (id: string) => office.snapshot().staff.find((s) => s.id === id)!
const task = (id: string) => office.snapshot().tasks.find((x) => x.id === id) as Task
/** 기록에 '정리드가 최팀원의 일을 멈추고…' 줄이 있나 */
const hasLog = (id: string, key: 'log.delegateInterrupt' | 'log.delegateReplace') => office.getRecord(id).logs.some((l) => l.text === t(key, { lead: '정리드', name: '최팀원' }))
const delegate = (leadId: string, member: string, instruction: string, interrupt?: 'continue' | 'replace') =>
  (office as unknown as { delegateFrom(l: string, m: string, i: string, x?: string): string }).delegateFrom(leadId, member, instruction, interrupt)

/** 팀장 정리드와 팀원 최팀원 — 팀원은 업무 카드를 받아 일하는 중 */
async function setup() {
  const team = office.createTeam('프론트', '#888')
  const lead = hire('정리드', team.id)
  const member = hire('최팀원', team.id)
  office.updateTeam(team.id, { leadId: lead })
  await settle()
  const card = office.createTask({ title: '로그인 화면 고치기', detail: '', teamId: team.id })
  office.assignTask(card.id, member)
  rt(member).sdk({ type: 'system', subtype: 'init', session_id: 'sess-m', terminal_slash_commands: [] })
  assert.equal(staff(member).status, 'working')
  return { lead, member, card: card.id, teamId: team.id }
}

const delegated = (instruction: string) => t('staff.msg.delegated', { lead: '정리드', instruction })
const reportOf = (text: string) => t('staff.msg.memberReport', { name: '최팀원', role: '개발', text })

test('continue: 하던 일을 끊고 새 지시를 먼저 전한다. 카드는 진행 중이고 끝나면 보고가 팀장에게 간다', async () => {
  const { lead, member, card } = await setup()
  const reply = delegate(lead, '최팀원', '버튼 색부터 바꿔 주세요', 'continue')
  await flush()
  assert.equal(reply, t('staff.tool.delegate.interrupted', { name: '최팀원' }))
  assert.equal(rt(member).interrupts, 1, '하던 턴을 끊는다')
  assert.equal(rt(member).sent.at(-1), delegated('버튼 색부터 바꿔 주세요'))
  assert.ok(hasLog(member, 'log.delegateInterrupt'), '팀원 기록에 누가 멈췄는지 남는다')
  assert.ok(hasLog(lead, 'log.delegateInterrupt'), '팀장 기록에도 남는다')
  // 끊긴 턴의 결과는 보고로 치지 않는다 — 카드도 그대로, 팀장에게 아무것도 가지 않는다
  const leadSent = rt(lead).sent.length
  rt(member).interrupted()
  await settle()
  assert.equal(task(card).status, 'doing')
  assert.equal(rt(lead).sent.length, leadSent)
  assert.equal(staff(member).status, 'working')
  // 새 지시까지 마친 결과: 카드는 검토로, 보고는 팀장에게 한 번
  rt(member).result('버튼 색 바꾸고 로그인 화면도 마쳤습니다')
  await settle()
  assert.equal(task(card).status, 'review')
  const toLead = rt(lead).sent.slice(leadSent)
  assert.deepEqual(toLead, [reportOf('버튼 색 바꾸고 로그인 화면도 마쳤습니다')])
})

test('continue: 같은 팀장이 맡긴 일에 끼어들어도 보고는 한 번만 간다', async () => {
  const team = office.createTeam('프론트', '#888')
  const lead = hire('정리드', team.id)
  const member = hire('최팀원', team.id)
  office.updateTeam(team.id, { leadId: lead })
  await settle()
  delegate(lead, '최팀원', '목록 화면 만들어 주세요')
  rt(member).sdk({ type: 'system', subtype: 'init', session_id: 'sess-m', terminal_slash_commands: [] })
  assert.equal(staff(member).status, 'working')
  const leadSent = rt(lead).sent.length
  delegate(lead, '최팀원', '정렬은 이름순으로 해 주세요', 'continue')
  await flush()
  rt(member).interrupted()
  rt(member).result('목록 화면을 이름순으로 만들었습니다')
  await settle()
  assert.deepEqual(rt(lead).sent.slice(leadSent), [reportOf('목록 화면을 이름순으로 만들었습니다')])
})

test('replace: 하던 카드와 대기 카드는 할 일로 돌리고, 새 지시만 보낸다. 보고는 팀장에게 간다', async () => {
  const { lead, member, card, teamId } = await setup()
  const next = office.createTask({ title: '회원가입 화면', detail: '', teamId })
  office.assignTask(next.id, member) // 일하는 중이라 대기열로
  const reply = delegate(lead, '최팀원', '급한 버그부터 고쳐 주세요', 'replace')
  await flush()
  assert.equal(reply, t('staff.tool.delegate.replaced', { name: '최팀원' }))
  assert.equal(task(card).status, 'todo', '하던 카드는 할 일로')
  assert.equal(task(next.id).status, 'todo', '대기 카드도 할 일로')
  assert.equal(rt(member).interrupts, 1)
  assert.equal(rt(member).sent.at(-1), `${t('staff.msg.replaced', { lead: '정리드' })}\n\n${delegated('급한 버그부터 고쳐 주세요')}`)
  assert.ok(hasLog(member, 'log.delegateReplace'))
  assert.ok(hasLog(lead, 'log.delegateReplace'))
  const leadSent = rt(lead).sent.length
  rt(member).interrupted()
  await settle()
  assert.equal(rt(lead).sent.length, leadSent, '끊긴 턴은 보고하지 않는다')
  rt(member).result('버그를 고쳤습니다')
  await settle()
  assert.deepEqual(rt(lead).sent.slice(leadSent), [reportOf('버그를 고쳤습니다')])
  assert.equal(task(card).status, 'todo', '버린 카드는 저절로 다시 시작하지 않는다')
  assert.equal(task(next.id).status, 'todo')
  assert.equal(rt(member).sent.at(-1), `${t('staff.msg.replaced', { lead: '정리드' })}\n\n${delegated('급한 버그부터 고쳐 주세요')}`, '대기 카드를 이어 맡기지 않는다')
})

for (const mode of ['continue', 'replace'] as const) {
  test(`쉬는 중이면 interrupt(${mode})를 무시하고 그냥 지시한다`, async () => {
    const team = office.createTeam('프론트', '#888')
    const lead = hire('정리드', team.id)
    const member = hire('최팀원', team.id)
    office.updateTeam(team.id, { leadId: lead })
    await settle()
    assert.equal(staff(member).status, 'idle')
    const reply = delegate(lead, '최팀원', '문서 정리해 주세요', mode)
    await flush()
    assert.equal(reply, t('staff.tool.delegate.done', { name: '최팀원' }))
    assert.equal(rt(member).interrupts, 0)
    assert.equal(rt(member).sent.at(-1), delegated('문서 정리해 주세요'))
    assert.equal(hasLog(lead, mode === 'replace' ? 'log.delegateReplace' : 'log.delegateInterrupt'), false)
    const leadSent = rt(lead).sent.length
    rt(member).result('정리했습니다')
    await settle()
    assert.deepEqual(rt(lead).sent.slice(leadSent), [reportOf('정리했습니다')])
  })
}

test('interrupt를 비우면 지금처럼 줄을 선다 (하던 일을 끊지 않고, 카드가 끝난 뒤 보고)', async () => {
  const { lead, member, card } = await setup()
  delegate(lead, '최팀원', '버튼 색도 바꿔 주세요')
  await flush()
  assert.equal(rt(member).interrupts, 0)
  assert.equal(task(card).status, 'doing')
})
