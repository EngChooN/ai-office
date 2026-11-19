// 프로젝트 간 협업 첫 요청의 대표 결재 통합 시험 — 실제 Office를 타고 엔진 프로세스만 가짜로 바꾼다 (delegateInterrupt.test.mts와 같은 방식)

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { after, afterEach, beforeEach, test } from 'node:test'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-approval-'))
process.env.HOME = path.join(root, 'home')
fs.mkdirSync(process.env.HOME)
const dirA = fs.mkdtempSync(path.join(root, 'projA-'))
const dirB = fs.mkdtempSync(path.join(root, 'projB-'))
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
const { GROUP_MAX_RECIPIENTS, parseApprovedPairs } = await import('../src/shared/collabPairs.ts')
const { groupRoomId } = await import('../src/shared/chatRooms.ts')
const { startLocalMcp, stopLocalMcp } = await import('../src/main/mcp/localMcp.ts')

await startLocalMcp()
after(() => {
  stopLocalMcp()
  db.closeDb()
  fs.rmSync(root, { recursive: true, force: true })
})

class FakeClaude extends ClaudeRuntime {
  sent: string[] = []
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
  override async interrupt() {}
  result(text: string) {
    ;(this as unknown as { translate(m: unknown): void }).translate({ type: 'result', subtype: 'success', is_error: false, result: text, num_turns: 1, total_cost_usd: 0, modelUsage: {} })
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

/** cwd를 주면 직원이 직접 지정한 작업 폴더 (안 주면 지정 없음 — 프로젝트 폴더로 판정) */
function hire(name: string, teamId: string, cwd = '') {
  const s = office.hire({ name, role: '리더', avatar: 0, provider: 'claude', model: 'default', cwd, systemPrompt: '', approvalMode: 'default', teamId })
  runtimes.set(s.id, lastRuntime!)
  return s.id
}
const rt = (id: string) => runtimes.get(id)!
const staff = (id: string) => office.snapshot().staff.find((s) => s.id === id)!
const ask = (from: string, member: string, request: string) => (office as unknown as { requestHelpFrom(s: string, m: string, r: string): Promise<string> }).requestHelpFrom(from, member, request)
const helpMsg = (text: string) => t('staff.msg.helpRequest', { from: '가리더', text })
const gotHelp = (id: string, text: string) => rt(id).sent.some((x) => x.startsWith(helpMsg(text)))

/** 팀·프로젝트가 다른 두 리더: 가리더(프로젝트 A) · 나리더(프로젝트 B) */
async function setup(cwdB = dirB) {
  const t1 = office.createTeam('가팀', '#888')
  const t2 = office.createTeam('나팀', '#999')
  const a = hire('가리더', t1.id)
  const b = hire('나리더', t2.id)
  office.updateTeam(t1.id, { leadId: a })
  office.updateTeam(t2.id, { leadId: b })
  const labA = office.createLab({ name: '프로젝트A', color: '#111', goal: '', cwd: dirA, leadId: a, memberIds: [a] })
  const labB = office.createLab({ name: '프로젝트B', color: '#222', goal: '', cwd: cwdB, leadId: b, memberIds: [b] })
  await settle()
  return { a, b, t1: t1.id, labA: labA.id, labB: labB.id }
}

test('첫 요청은 요청한 리더 이름으로 결재 카드가 뜨고, 승인 전에는 상대에게 가지 않는다. 승인하면 전하고 쌍을 저장한다', async () => {
  const { a, b } = await setup()
  const pending = ask(a, '나리더', '로그인 API 문서 정리 부탁')
  await flush()
  const card = staff(a).approvals[0]
  assert.ok(card, '요청한 리더(일하는 직원)에게 카드가 뜬다')
  assert.equal(staff(b).approvals.length, 0)
  assert.ok(card.id.startsWith('app:'))
  assert.equal(card.toolName, 'request_help')
  assert.ok(card.summary.includes('프로젝트A') && card.summary.includes('프로젝트B'), card.summary)
  assert.ok(card.summary.includes(t('log.collabReason.newPair')))
  assert.ok(!card.alwaysRule, '"항상 승인" 규칙으로 만들 수 없다')
  assert.ok(!gotHelp(b, '로그인 API 문서 정리 부탁'))
  assert.ok(!db.loadPendingApprovals().some((p) => p.id === card.id), '재시작 복원용으로 저장하지 않는다')

  assert.equal(office.decide(card.id, true), true)
  assert.equal(await pending, t('staff.tool.help.done', { name: '나리더' }))
  assert.equal(staff(a).approvals.length, 0)
  assert.ok(gotHelp(b, '로그인 API 문서 정리 부탁'))
  assert.equal(parseApprovedPairs(db.loadCollabPairs()).length, 1)

  // 받은 일이 끝나 요청이 닫힌 뒤, 같은 쌍의 두 번째 요청은 카드 없이 바로 간다
  rt(b).result('정리했습니다')
  await settle()
  const second = await ask(a, '나리더', '두 번째 부탁')
  assert.equal(second, t('staff.tool.help.done', { name: '나리더' }))
  assert.equal(staff(a).approvals.length, 0)
  assert.ok(gotHelp(b, '두 번째 부탁'))
})

test('반려하면 상대에게 가지 않고 쌍도 저장하지 않는다', async () => {
  const { a, b } = await setup()
  const pending = ask(a, '나리더', '부탁')
  await flush()
  office.decide(staff(a).approvals[0].id, false)
  assert.equal(await pending, t('staff.tool.help.collabRejected', { name: '나리더' }))
  assert.ok(!gotHelp(b, '부탁'))
  assert.deepEqual(parseApprovedPairs(db.loadCollabPairs()), [])
})

test('기다리는 중에 요청한 리더가 퇴사하면 반려로 풀린다', async () => {
  const { a, b } = await setup()
  const pending = ask(a, '나리더', '부탁')
  await flush()
  office.fire(a)
  assert.equal(await pending, t('staff.tool.help.collabRejected', { name: '나리더' }))
  assert.ok(!gotHelp(b, '부탁'))
})

test('승인 뒤 상대 프로젝트 폴더가 바뀌면 다시 묻는다', async () => {
  const { a, b, labB } = await setup()
  const p1 = ask(a, '나리더', '첫 부탁')
  await flush()
  office.decide(staff(a).approvals[0].id, true)
  await p1
  rt(b).result('끝')
  await settle()
  const moved = fs.mkdtempSync(path.join(root, 'projB2-'))
  office.updateLab(labB, { cwd: moved })
  await settle()
  const p2 = ask(a, '나리더', '폴더 바뀐 뒤 부탁')
  await flush()
  const card = staff(a).approvals[0]
  assert.ok(card?.summary.includes(t('log.collabReason.folderChanged')), card?.summary)
  office.decide(card.id, true)
  await p2
})

test('R3: 단체방을 만들어도 프로젝트 쌍을 승인으로 저장하지 않는다 — 첫 협업 요청은 여전히 결재', async () => {
  const { a, b, labA, labB } = await setup()
  office.createChatGroup({ name: '', color: '', teamIds: [], labIds: [labA, labB] })
  assert.deepEqual(parseApprovedPairs(db.loadCollabPairs()), [])
  const pending = ask(a, '나리더', '단체방 뒤 부탁')
  await flush()
  const card = staff(a).approvals[0]
  assert.ok(card?.summary.includes(t('log.collabReason.newPair')), '단체방과 별도로 대표가 명시 승인해야 한다')
  assert.ok(!gotHelp(b, '단체방 뒤 부탁'))
  office.decide(card.id, true)
  assert.equal(await pending, t('staff.tool.help.done', { name: '나리더' }))
})

test('R6: 결재를 기다리는 사이 상대가 리더에서 빠지면 승인해도 보내지 않고 쌍도 저장하지 않는다', async () => {
  const { a, b, labB } = await setup()
  const pending = ask(a, '나리더', '자격 바뀐 부탁')
  await flush()
  office.updateLab(labB, { leadId: null })
  office.updateTeam(staff(b).teamId!, { leadId: null })
  office.decide(staff(a).approvals[0].id, true)
  assert.equal(await pending, t('staff.tool.help.noTarget'), '지금 소속으로는 요청할 수 있는 리더가 없다')
  assert.ok(!gotHelp(b, '자격 바뀐 부탁'))
  assert.deepEqual(parseApprovedPairs(db.loadCollabPairs()), [])
})

test('R6: 결재를 기다리는 사이 상대 프로젝트 폴더가 바뀌면 승인해도 보내지 않고 다시 요청하게 한다', async () => {
  const { a, b, labB } = await setup()
  const pending = ask(a, '나리더', '폴더 바뀐 부탁')
  await flush()
  office.updateLab(labB, { cwd: fs.mkdtempSync(path.join(root, 'projB3-')) })
  office.decide(staff(a).approvals[0].id, true)
  assert.equal(await pending, t('staff.tool.help.changed', { name: '나리더' }))
  assert.ok(!gotHelp(b, '폴더 바뀐 부탁'))
  assert.deepEqual(parseApprovedPairs(db.loadCollabPairs()), [])
})

test('R6: 결재를 기다리는 사이 소속이 겹치도록 바뀌어도(결재 이유가 사라져도) 승인 뒤 보내지 않고 쌍도 저장하지 않는다', async () => {
  const { a, b, labA, labB } = await setup()
  const pending = ask(a, '나리더', '소속 바뀐 부탁')
  await flush()
  office.updateLab(labA, { cwd: fs.mkdtempSync(path.join(root, 'projA2-')) })
  office.updateLab(labB, { memberIds: [b, a] })
  office.decide(staff(a).approvals[0].id, true)
  assert.equal(await pending, t('staff.tool.help.changed', { name: '나리더' }))
  assert.ok(!gotHelp(b, '소속 바뀐 부탁'))
  assert.deepEqual(parseApprovedPairs(db.loadCollabPairs()), [])
})

test('S1: 재위임 결과를 기다리며 보류한 요청이 있으면 다른 지시로 재개해도 일반 위임으로 요청 제한을 우회하지 못한다', async () => {
  const { a, b } = await setup()
  const c = hire('다팀원', staff(b).teamId!)
  await settle()
  const p1 = ask(a, '나리더', '큰 부탁')
  await flush()
  office.decide(staff(a).approvals[0].id, true)
  await p1
  const askAs = (from: string, member: string, request: string) => (office as unknown as { requestHelpFrom(s: string, m: string, r: string): Promise<string> }).requestHelpFrom(from, member, request)
  assert.equal(await askAs(b, '다팀원', '세부 작업'), t('staff.tool.help.done', { name: '다팀원' }))
  rt(b).result('다팀원에게 맡겼어요')
  await settle()
  // 보류 중에 대표의 다른 지시로 다시 일한다 — 지금 하는 지시에는 도움 요청 출처가 없다
  office.instruct(b, '대표의 다른 일')
  await flush()
  const delegate = (s: string, m: string, x: string) => (office as unknown as { delegateFrom(s: string, m: string, x: string): string }).delegateFrom(s, m, x)
  assert.equal(delegate(b, '다팀원', '위임으로 네 번째 일'), t('staff.tool.help.noBypass'))
  assert.ok(!rt(c).sent.some((x) => x.includes('위임으로 네 번째 일')))
})

test('R1·R2: 재위임 결과를 기다리는 리더는 중복·바쁨 검사에 걸리고, 하위 결과를 처리한 턴에서만 위로 보고한다', async () => {
  const { a, b } = await setup()
  const c = hire('다팀원', staff(b).teamId!)
  await settle()
  const p1 = ask(a, '나리더', '큰 부탁')
  await flush()
  office.decide(staff(a).approvals[0].id, true)
  await p1
  // 받은 리더 B가 자기 팀원 C에게 재위임 (자기 조직 안이라 결재 없음)
  const toC = await (office as unknown as { requestHelpFrom(s: string, m: string, r: string): Promise<string> }).requestHelpFrom(b, '다팀원', '세부 작업')
  assert.equal(toC, t('staff.tool.help.done', { name: '다팀원' }))
  const reportsToA = () => rt(a).sent.filter((x) => x.includes('나리더') && !x.startsWith(helpMsg(''))).length
  const before = reportsToA()
  rt(b).result('다팀원에게 맡겼어요')
  await settle()
  assert.equal(reportsToA(), before, '하위 요청이 열려 있으면 보고를 미룬다')
  // R1: 보류 중인 B도 같은 요청자의 두 번째 요청은 중복, 다른 리더의 요청은 바쁨
  assert.equal(await ask(a, '나리더', '또 부탁'), t('staff.tool.help.duplicate', { name: '나리더', max: 3 }))
  // R2: B가 다른 일을 하는 사이 C의 결과가 와도(대기열) 그 턴이 끝날 때 위로 보고하지 않는다
  office.instruct(b, '대표의 다른 일')
  await flush()
  rt(c).result('세부 작업 끝')
  await settle()
  rt(b).result('다른 일 끝')
  await settle()
  assert.equal(reportsToA(), before, '돌아온 하위 결과를 처리하기 전에는 보고하지 않는다')
  rt(b).result('취합 보고')
  await settle()
  assert.ok(rt(a).sent.some((x) => x.includes('취합 보고')), '하위 결과를 처리한 턴에서 요청한 리더에게 보고한다')
})

test('R4: 단체방 지시도 토큰 예산·받는 사람 수 한도를 지킨다', async () => {
  const { a, b, t1, labA, labB } = await setup()
  const g = office.createChatGroup({ name: '합동', color: '', teamIds: [], labIds: [labA, labB] })
  const room = groupRoomId(g.id)
  ;(office as unknown as { isOverTokenBudget(): boolean }).isOverTokenBudget = () => true
  office.sendChat('@가리더 @나리더 같이 봐 주세요', [], room)
  await flush()
  assert.ok(!rt(a).sent.some((x) => x.includes('같이 봐 주세요')) && !rt(b).sent.some((x) => x.includes('같이 봐 주세요')))
  assert.ok(office.chatHistory().some((m) => m.text === t('chat.group.overBudget')))
  ;(office as unknown as { isOverTokenBudget(): boolean }).isOverTokenBudget = () => false
  const extra = Array.from({ length: GROUP_MAX_RECIPIENTS }, (_, i) => hire(`가팀원${i}`, t1))
  office.updateLab(labA, { memberIds: [a, ...extra] })
  await settle()
  office.sendChat('@전체 모두 모여 주세요', [], room)
  await flush()
  assert.ok(!rt(a).sent.some((x) => x.includes('모두 모여')))
  assert.ok(office.chatHistory().some((m) => m.text === t('chat.group.tooMany', { count: GROUP_MAX_RECIPIENTS + 2, max: GROUP_MAX_RECIPIENTS })))
})

test('R5: 단체방 병렬 지시에서 다른 프로젝트 두 사람이 같은 폴더를 쓰면 방에 경고하고 지시에 주의를 붙인다', async () => {
  const inner = path.join(dirA, 'sub5')
  fs.mkdirSync(inner, { recursive: true })
  const { a, b, labA, labB } = await setup(inner)
  const g = office.createChatGroup({ name: '합동', color: '', teamIds: [], labIds: [labA, labB] })
  office.sendChat('@가리더 @나리더 같이 고쳐 주세요', [], groupRoomId(g.id))
  await flush()
  const cwd = fs.realpathSync(inner)
  assert.ok(office.chatHistory().some((m) => m.text === t('chat.group.sameFolderWarn', { a: '가리더', b: '나리더', cwd })))
  const note = t('chat.group.sameFolderNote', { a: '가리더', b: '나리더', cwd })
  assert.ok(rt(a).sent.some((x) => x.includes('같이 고쳐') && x.includes(note)))
  assert.ok(rt(b).sent.some((x) => x.includes('같이 고쳐') && x.includes(note)))
})

test('R5: 직원이 직접 지정한 작업 폴더도 폴더 겹침에 넣는다 (프로젝트 폴더는 달라도)', async () => {
  const t1 = office.createTeam('가팀', '#888')
  const t2 = office.createTeam('나팀', '#999')
  const a = hire('가리더', t1.id)
  const b = hire('나리더', t2.id, dirA)
  office.updateTeam(t1.id, { leadId: a })
  office.updateTeam(t2.id, { leadId: b })
  office.createLab({ name: '프로젝트A', color: '#111', goal: '', cwd: dirA, leadId: a, memberIds: [a] })
  office.createLab({ name: '프로젝트B', color: '#222', goal: '', cwd: dirB, leadId: b, memberIds: [b] })
  await settle()
  const pending = ask(a, '나리더', '직접 폴더 부탁')
  await flush()
  office.decide(staff(a).approvals[0].id, true)
  const reply = await pending
  assert.ok(reply.includes(t('staff.tool.help.sameFolder', { name: '나리더', cwd: fs.realpathSync(dirA) })), reply)
})

test('두 프로젝트가 같은 폴더를 쓰면 승인 뒤 양쪽에 동시 수정 주의를 남긴다 (막지는 않는다)', async () => {
  const inner = path.join(dirA, 'sub')
  fs.mkdirSync(inner, { recursive: true })
  const { a, b } = await setup(inner)
  const pending = ask(a, '나리더', '같은 폴더 부탁')
  await flush()
  const card = staff(a).approvals[0]
  assert.ok(!card.summary.includes(t('log.collabReason.otherFolder', { a: '', b: '' }).slice(0, 6)), '같은 폴더면 다른 폴더 이유는 없다')
  office.decide(card.id, true)
  const reply = await pending
  const cwd = fs.realpathSync(inner)
  assert.ok(reply.includes(t('staff.tool.help.sameFolder', { name: '나리더', cwd })), reply)
  assert.ok(rt(b).sent.some((x) => x.includes(t('staff.msg.sameFolder', { from: '가리더', cwd }))))
  assert.ok(office.chatHistory().some((m) => m.text === t('log.sameFolderWarn', { from: '가리더', name: '나리더', cwd })))
})
