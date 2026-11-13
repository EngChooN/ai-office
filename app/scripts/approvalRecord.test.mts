// 결재 기록(approval_record): 처리 지점별 기록 남김·90일 삭제·예전 기록 1회 옮기기·원격 표시(text_i18n)·timeline until·팀 설명
// roomRouting.test.mts와 같은 방식 (엔진 프로세스만 가짜, 실제 Office·sqlite)

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { after, afterEach, beforeEach, test } from 'node:test'
import type { ApprovalRecord, Approval } from '../src/shared/types.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-record-'))
process.env.HOME = path.join(root, 'home')
fs.mkdirSync(process.env.HOME)
const g = globalThis as unknown as { __electron: unknown }
let userData = ''
g.__electron = {
  app: { getPath: () => userData, getVersion: () => '0.0.0', getLocale: () => 'ko', getAppPath: () => process.cwd(), isPackaged: false, on() {} },
  net: { isOnline: () => true, fetch: () => assert.fail('시험에서는 AI 서버에 묻지 않는다') },
}
register('./officeLoaderHooks.mjs', import.meta.url)

const { Office, APPROVAL_RECORD_KEEP_MS } = await import('../src/main/office.ts')
const { ClaudeRuntime } = await import('../src/main/ai/claude.ts')
const db = await import('../src/main/db.ts')
const { REMOTE_MARK, runAsRemote, remoteMarked, remoteMarkedI18n } = await import('../src/main/remoteContext.ts')
const { parseLegacyApproval } = await import('../src/main/approvalLegacy.ts')
const { tr } = await import('../src/shared/i18n/index.ts')
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
}

type OfficeT = InstanceType<typeof Office>
let office: OfficeT
// 테스트가 건드리는 Office 안쪽 (private)
type Inner = {
  demoApprovalIds: Set<string>
  textAsks: Map<string, { staffId: string; question: string; taskId: string | null }>
  restoredAsks: Map<string, unknown>
  hired: Map<string, { approvals: Approval[] }>
  origins: Map<string, unknown[]>
  rules: unknown[]
  addApproval(a: Approval): void
  autoDecide(staffId: string, toolName: string, input: Record<string, unknown>, summary: string): Promise<unknown> | null
  pruneApprovalRecords(): void
}
const inner = () => office as unknown as Inner
const emitted: ApprovalRecord[] = []

beforeEach(() => {
  db.closeDb()
  userData = fs.mkdtempSync(path.join(root, 'ud-'))
  db.openDb()
  emitted.length = 0
  office = new Office({ makeRuntime: (_p, onEvent) => new FakeClaude(onEvent), isNetBack: async () => true })
  office.on('approvalRecord', (r) => emitted.push(r))
  office.start()
})
afterEach(async () => {
  office.stop()
  // 자동결재 저장 예약이 닫힌 DB를 건드리지 않게 거둔다
  clearTimeout((office as unknown as { autoSaveTimer: NodeJS.Timeout | null }).autoSaveTimer ?? undefined)
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))
  await new Promise((r) => setTimeout(r, 50))
})

const hire = () => office.hire({ name: '강백엔', role: '개발', avatar: 0, provider: 'claude', model: 'default', cwd: root, systemPrompt: '', approvalMode: 'default', teamId: null as unknown as string }).id
let seq = 0
/** 결재함에 결재 하나를 올린다 (세션 없이 처리되도록 demo 결재로) */
function ask(staffId: string, over: Partial<Approval> = {}) {
  const a: Approval = { id: `ap-${++seq}`, staffId, toolName: 'Read', summary: '/tmp/a.txt', createdAt: Date.now() - 5000, ...over }
  inner().demoApprovalIds.add(a.id)
  inner().addApproval(a)
  return a
}
const history = (staffId: string, opts?: Parameters<OfficeT['approvalHistory']>[1]) => office.approvalHistory(staffId, opts)

// ── 기록 남김: 처리 지점마다 ─────────────────────────────

test('decide: 승인·반려는 요청 시각·결과·PC와 함께 남고, 원래 명령도 그대로 남는다', () => {
  const id = hire()
  const a = ask(id, { toolName: 'Bash', summary: 'npm test' })
  const b = ask(id, { toolName: 'Bash', summary: 'rm -rf build' })
  assert.equal(office.decide(a.id, true), true)
  assert.equal(office.decide(b.id, false), true)
  const { records, hasMore } = history(id)
  assert.equal(hasMore, false)
  assert.deepEqual(
    records.map((r) => [r.result, r.actor, r.toolName, r.summary, r.approvalId]),
    [
      ['rejected', 'pc', 'Bash', 'rm -rf build', b.id],
      ['approved', 'pc', 'Bash', 'npm test', a.id],
    ],
    '최신순',
  )
  assert.equal(records[1].requestedAt, a.createdAt)
  assert.ok(records[1].decidedAt >= a.createdAt)
  assert.equal(emitted.length, 2, '새 기록 이벤트')
})

test('decide: 휴대폰(원격 표시·원격 호출)은 actor가 phone, 질문을 반려하면 skipped', () => {
  const id = hire()
  const viaMark = ask(id)
  const viaCall = ask(id)
  const question = ask(id, { toolName: 'AskUserQuestion', summary: '어느 쪽?', questions: [{ question: '어느 쪽?', header: 'h', options: [], multiSelect: false }] })
  office.decide(viaMark.id, true, REMOTE_MARK)
  runAsRemote(() => office.decide(viaCall.id, false))
  office.decide(question.id, false)
  assert.deepEqual(
    history(id).records.map((r) => [r.result, r.actor]),
    [
      ['skipped', 'pc'],
      ['rejected', 'phone'],
      ['approved', 'phone'],
    ],
  )
})

test('answerQuestion: 답변 기록에 질문과 답이 남는다', () => {
  const id = hire()
  const q = ask(id, { toolName: 'AskUserQuestion', summary: '배포할까요?', questions: [{ question: '배포할까요?', header: 'h', options: [], multiSelect: false }] })
  assert.equal(office.answerQuestion(q.id, { '배포할까요?': '네' }, REMOTE_MARK), true)
  const [r] = history(id).records
  assert.equal(r.result, 'answered')
  assert.equal(r.actor, 'phone')
  assert.equal(r.answer, '네')
  assert.equal(r.summary, '배포할까요?')
})

test('closeTextAsk: 글 질문에 답하면 answered, 넘기면 skipped', () => {
  const id = hire()
  for (const [i, question] of ['첫째?', '둘째?'].entries()) {
    const a: Approval = { id: `text:${i}`, staffId: id, toolName: 'AskUserQuestion', summary: question, createdAt: Date.now() - 1000, questions: [{ question, header: 'h', options: [], multiSelect: false }] }
    inner().textAsks.set(a.id, { staffId: id, question, taskId: null })
    inner().addApproval(a)
  }
  office.answerQuestion('text:0', { '첫째?': '예' })
  office.decide('text:1', false)
  const rs = history(id).records
  assert.deepEqual(rs.map((r) => [r.result, r.approvalId, r.summary]), [['skipped', 'text:1', '둘째?'], ['answered', 'text:0', '첫째?']])
  assert.equal(rs[1].answer, '예')
})

test('closeRestored: 앱을 다시 켜며 되살린 결재를 처리해도 기록이 남는다', () => {
  const id = hire()
  const a: Approval = { id: 'restored-1', staffId: id, toolName: 'Edit', summary: 'a.ts', createdAt: Date.now() - 60_000, isRestored: true }
  inner().hired.get(id)!.approvals.push(a)
  inner().restoredAsks.set(a.id, { id: a.id, staffId: id, toolName: 'Edit', summary: 'a.ts', createdAt: a.createdAt, taskId: null })
  assert.equal(office.decide(a.id, true), true)
  const [r] = history(id).records
  assert.deepEqual([r.result, r.actor, r.toolName, r.summary, r.requestedAt], ['approved', 'pc', 'Edit', 'a.ts', a.createdAt])
})

test('autoDecide: 자동결재(auto)와 "항상 승인" 규칙(rule)을 구분해 남긴다', async () => {
  const id = hire()
  // 규칙: Read는 항상 승인
  inner().rules = [{ id: 'r1', staffId: id, toolName: 'Read', patterns: [], createdAt: Date.now() }]
  assert.ok(inner().autoDecide(id, 'Read', { file_path: '/tmp/x' }, '/tmp/x'))
  // 자율 진행: 규칙 없는 도구는 대신 판정 (Glob은 읽기)
  inner().origins.set(id, [{ kind: 'user', isAutonomous: true }])
  assert.ok(inner().autoDecide(id, 'Glob', { pattern: '*.ts' }, '*.ts'))
  const rs = history(id).records
  assert.deepEqual(rs.map((r) => [r.result, r.actor, r.toolName]), [['approved', 'auto', 'Glob'], ['approved', 'rule', 'Read']])
  assert.equal(rs[0].approvalId, '')
  assert.equal(history(id, { filter: 'auto' }).records.length, 2)
  // '승인'은 대표가 직접 누른 것만 — 자동·규칙 승인은 '자동'에서 본다
  assert.equal(history(id, { filter: 'approved' }).records.length, 0)
  assert.equal(history(id, { filter: 'rejected' }).records.length, 0)
})

// ── 조회 ────────────────────────────────────────────────

test('approvalHistory: 최신순·beforeId로 이어 받기·기본 20건·filter', () => {
  const id = hire()
  const other = hire()
  for (let i = 0; i < 25; i++) office.decide(ask(id).id, i % 5 !== 0)
  office.decide(ask(other).id, true)
  const first = history(id)
  assert.equal(first.records.length, 20)
  assert.equal(first.hasMore, true)
  const next = history(id, { beforeId: first.records.at(-1)!.id })
  assert.equal(next.records.length, 5)
  assert.equal(next.hasMore, false)
  assert.ok(next.records.every((r) => r.id < first.records.at(-1)!.id && r.staffId === id))
  assert.equal(history(id, { filter: 'rejected', limit: 100 }).records.length, 5)
  assert.equal(history(id, { limit: 3 }).records.length, 3)
})

// ── 보관 90일 ───────────────────────────────────────────

test('90일 지난 결재 기록은 지우고 최근 것은 남긴다', () => {
  const id = hire()
  const now = Date.now()
  const base = { staffId: id, approvalId: '', actor: 'pc', result: 'approved', toolName: 'Read', summary: 'x' } as const
  db.insertApprovalRecord({ ...base, decidedAt: now - APPROVAL_RECORD_KEEP_MS - 60_000 })
  db.insertApprovalRecord({ ...base, decidedAt: now - APPROVAL_RECORD_KEEP_MS + 60_000 })
  assert.equal(history(id).records.length, 2)
  inner().pruneApprovalRecords()
  assert.deepEqual(history(id).records.map((r) => r.decidedAt >= now - APPROVAL_RECORD_KEEP_MS), [true])
})

// ── 예전 기록 1회 옮기기 ────────────────────────────────

test('예전 log 줄 옮기기: 결과·도구·요약을 읽어 채우고 요청 시각·결재한 쪽은 비운 채 한 번만 옮긴다', () => {
  const id = hire()
  // 진짜 기록 경로로 log 줄을 만든 뒤, 결재 기록과 완료 표시를 지워 "옛 앱" 상태를 만든다
  office.decide(ask(id, { toolName: 'Bash', summary: 'npm test' }).id, true)
  office.decide(ask(id, { toolName: 'Bash', summary: 'git push' }).id, false)
  office.decide(ask(id, { toolName: 'Bash', summary: 'ls' }).id, true, REMOTE_MARK)
  const q = ask(id, { toolName: 'AskUserQuestion', summary: '배포?', questions: [{ question: '배포?', header: 'h', options: [], multiSelect: false }] })
  office.answerQuestion(q.id, { '배포?': '네' })
  inner().rules = [{ id: 'r1', staffId: id, toolName: 'Read', patterns: [], createdAt: Date.now() }]
  inner().autoDecide(id, 'Read', { file_path: '/tmp/x' }, '/tmp/x')
  // 결재가 아닌 줄(읽을 수 없는 줄)도 섞는다
  db.insertLog(id, 'approval', '🤖 자동결재: 이 질문은 대표님 답을 기다려요')
  db.insertLog(id, 'approval', '알 수 없는 문장')

  db.closeDb()
  const raw = new DatabaseSync(path.join(userData, 'office.db'))
  raw.exec("DELETE FROM approval_record; DELETE FROM setting WHERE key = 'approvalRecordImported'")
  // 90일보다 오래된 줄은 옮기지 않는다
  raw.prepare("INSERT INTO log (staff_id, ts, type, text) VALUES (?, ?, 'approval', '승인: Bash old')").run(id, Date.now() - APPROVAL_RECORD_KEEP_MS - 1000)
  raw.close()
  db.openDb()

  const parse = (text: string, i18n: Parameters<typeof parseLegacyApproval>[1]) => {
    const l = parseLegacyApproval(text, i18n)
    return l && { ...l }
  }
  assert.equal(db.importLegacyApprovals(Date.now() - APPROVAL_RECORD_KEEP_MS, parse), 5)
  assert.equal(db.importLegacyApprovals(Date.now() - APPROVAL_RECORD_KEEP_MS, parse), null, '두 번째는 하지 않는다')

  const rs = history(id).records.slice().reverse()
  assert.deepEqual(
    rs.map((r) => [r.result, r.actor, r.toolName, r.summary, r.answer ?? '']),
    [
      ['approved', '', 'Bash', 'npm test', ''],
      ['rejected', '', 'Bash', 'git push', ''],
      ['approved', 'phone', 'Bash', 'ls', ''],
      ['answered', '', 'AskUserQuestion', '', '배포? → 네'],
      ['approved', 'rule', 'Read', '/tmp/x', ''],
    ],
  )
  assert.ok(rs.every((r) => r.requestedAt === undefined && r.approvalId === '' && r.effectI18n === undefined), '요청 시각·쉬운 요약은 비어 있다')
})

test('예전 줄 읽기: 번역 키가 없는 글 줄(4개 언어)과 취소 줄도 읽고, 결재가 아닌 줄은 건너뛴다', () => {
  const p = (text: string) => parseLegacyApproval(text)
  assert.deepEqual(p('승인: Bash npm test'), { result: 'approved', actor: '', toolName: 'Bash', summary: 'npm test' })
  assert.equal(p('Rejected: Edit a.ts')?.result, 'rejected')
  assert.equal(p('📱 원격 승인: Read /x')?.actor, 'phone')
  assert.equal(p('承認: Bash ls')?.toolName, 'Bash')
  assert.equal(p('취소됨: Bash x')?.result, 'canceled')
  assert.deepEqual(p('답변: 질문 → 답'), { result: 'answered', actor: '', toolName: 'AskUserQuestion', summary: '', answer: '질문 → 답' })
  assert.equal(p('🤖 자동결재 승인: Edit a.ts')?.actor, 'auto')
  assert.equal(p('규칙으로 자동 승인: Read /x')?.actor, 'rule')
  assert.equal(p('앞으로 항상 승인하는 규칙을 더했어요'), null)
})

// ── 원격 표시 ───────────────────────────────────────────

test('원격 표시: text_i18n이 있는 결재 기록에도 표시가 붙는다 (휴대폰 v2 승인·반려)', () => {
  const id = hire()
  const a = ask(id, { toolName: 'Bash', summary: 'npm test' })
  runAsRemote(() => office.decide(a.id, true))
  const log = db.logsSince(id, 0).find((l) => l.type === 'approval')!
  assert.match(log.text, new RegExp(`^${REMOTE_MARK} `))
  assert.ok(log.textI18n, '번역 키는 그대로 남는다')
  assert.equal(tr(log.textI18n!, 'ko'), log.text, '키로 풀어도 같은 글 — 표시가 빠지지 않는다')
  assert.match(tr(log.textI18n!, 'en'), new RegExp(`^${REMOTE_MARK} Approved`))
  // PC에서 한 것에는 붙지 않는다
  const b = ask(id)
  office.decide(b.id, true)
  const pc = db.logsSince(id, 0).filter((l) => l.type === 'approval').at(-1)!
  assert.ok(!pc.text.startsWith(REMOTE_MARK) && !tr(pc.textI18n!, 'ko').startsWith(REMOTE_MARK))
})

test('원격 표시: 이미 표시가 붙은(v1) 기록은 두 번 붙지 않는다', () => {
  const id = hire()
  office.decide(ask(id).id, true, REMOTE_MARK)
  const log = db.logsSince(id, 0).find((l) => l.type === 'approval')!
  assert.equal(log.text.split(REMOTE_MARK).length - 1, 1)
  assert.equal(tr(log.textI18n!, 'ko').split(REMOTE_MARK).length - 1, 1)
  assert.equal(remoteMarked('approval', `${REMOTE_MARK} x`), `${REMOTE_MARK} x`)
  assert.equal(tr(remoteMarkedI18n('x'), 'ko'), `${REMOTE_MARK} x`)
})

// ── timeline until ──────────────────────────────────────

test('timeline(since, until): until이 있으면 그 사이만, 없으면 지금까지', () => {
  const id = hire()
  const t0 = Date.now()
  db.insertLog(id, 'result', '하나')
  const mid = Date.now() + 1
  const wait = Date.now() + 5
  while (Date.now() < wait);
  db.insertLog(id, 'result', '둘')
  const texts = (since: number, until?: number) => office.timeline(since, until).filter((l) => l.type === 'result').map((l) => l.text)
  assert.deepEqual(texts(t0 - 1), ['하나', '둘'])
  assert.deepEqual(texts(t0 - 1, mid), ['하나'])
  assert.deepEqual(texts(mid, mid + 10_000), ['둘'])
  assert.deepEqual(texts(t0 - 1, t0 - 1), [])
})

// ── 팀 설명 ─────────────────────────────────────────────

test('팀 description: 80자로 자르고 저장·불러오기·스냅샷에 실린다, 비우면 지운다', () => {
  const team = office.createTeam('백엔드', '#888')
  office.updateTeam(team.id, { description: `  ${'가'.repeat(100)}  ` })
  assert.equal(office.snapshot().teams.find((t) => t.id === team.id)?.description, '가'.repeat(80))
  assert.equal(db.loadTeams().find((t) => t.id === team.id)?.description, '가'.repeat(80))
  office.updateTeam(team.id, { name: '서버' })
  assert.equal(db.loadTeams().find((t) => t.id === team.id)?.description, '가'.repeat(80), '다른 칸을 고쳐도 유지')
  office.updateTeam(team.id, { description: '' })
  assert.equal(db.loadTeams().find((t) => t.id === team.id)?.description, undefined)
  assert.equal('description' in office.snapshot().teams.find((t) => t.id === team.id)!, false)
})
