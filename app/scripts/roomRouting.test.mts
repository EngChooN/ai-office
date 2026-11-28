// 보고·상태 줄의 방 정하기를 실제 Office로 확인 — 단체방 지시는 단체방, 방이 사라지면 다음 순서, 섞인 턴은 방마다
// delegateInterrupt.test.mts와 같은 방식 (엔진 프로세스만 가짜)

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { after, afterEach, beforeEach, test } from 'node:test'
import type { Approval } from '../src/shared/types.ts'

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
const { labRoomId } = await import('../src/shared/chatRooms.ts')
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

// ── 지시한 방에서만: 팀장이 프로젝트 방 일을 하며 만든 카드·멈춤 안내·줄 선 지시 (실제 기록에서 팀 방으로 샌 경로) ──

const toolOf = () => office as unknown as { officeMcp: Map<string, { config: { url: string; headers: Record<string, string> } }> }
async function callTool(staffId: string, name: string, args: Record<string, unknown>) {
  const cfg = toolOf().officeMcp.get(staffId)?.config
  assert.ok(cfg, '직원 세션의 사무실 도구가 등록돼 있다')
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...cfg.headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })
  const body = (await res.json()) as { result: { content: { text: string }[] } }
  return body.result.content[0].text
}
/** 고용 인사를 뺀 직원 글 (인사는 소속 방에 올라가는 게 맞다) */
const postsOf = (id: string) => db.recentChat(300).filter((m) => m.from === id && !m.text.includes('잘 부탁드려요'))

/** 팀장 a·팀원 b(프론트 팀) + a가 멤버인 프로젝트(리드는 다른 사람) */
async function teamInProject() {
  const { team, a, b } = await oneTeam()
  const pl = hire('김리드', null)
  const lab = office.createLab({ name: '앱', color: '#123', goal: '', cwd: root, leadId: pl, memberIds: [pl, a] })
  await settle()
  return { team, a, b, labRoom: labRoomId(lab.id) }
}

test('프로젝트 방 일을 하던 팀장이 add_task로 팀원에게 맡긴 카드: 카드에 그 방이 실리고, 팀원의 보고는 팀 방이 아니라 프로젝트 방으로', async () => {
  const { team, a, b, labRoom } = await teamInProject()
  inst(a, labRoom, '프로젝트 방 일')
  rt(a).init()
  await flush()
  const reply = await callTool(a, 'add_task', { title: '화면 고치기', assignee: '최팀원' })
  assert.match(reply, /최팀원/)
  const card = snap().tasks.find((x) => x.title === '화면 고치기')!
  assert.equal(card.room, labRoom, '카드에 일하던 방을 싣는다')
  assert.equal(db.loadTasks().find((x) => x.id === card.id)?.room, labRoom, '다시 켜도 남는다')
  rt(b).init()
  rt(b).result('고쳤습니다')
  await settle()
  assert.deepEqual(reportRooms(b), [labRoom])
  assert.ok(!postsOf(b).some((m) => m.room === team.id), '팀 방에는 아무것도 올리지 않는다')
})

test('프로젝트 방 일을 하던 팀장이 새 기획안을 올리면: 기획 카드에 그 방이 실리고, 하위 업무 보고도 프로젝트 방으로', async () => {
  const { team, a, b, labRoom } = await teamInProject()
  inst(a, labRoom, '큰 일')
  rt(a).init()
  await flush()
  await callTool(a, 'propose_plan', { title: '큰 기획', spec: '나눠서 진행', subtasks: [{ title: '하위 일', detail: '…', assignee: '최팀원' }] })
  const plan = snap().tasks.find((x) => x.plan && x.title === '큰 기획')!
  assert.equal(plan.room, labRoom)
  assert.equal(postsOf(a).find((m) => m.plan)?.room, labRoom, '기획안 확인 카드도 그 방')
  assert.equal(office.reviewPlan(plan.id, true, ''), true)
  await settle()
  assert.equal(db.recentChat(300).find((m) => m.from === 'me' && m.text.includes('기획안 승인'))?.room, labRoom, '기획 승인 알림도 그 방')
  rt(b).init()
  rt(b).result('하위 일 끝')
  await settle()
  assert.deepEqual(reportRooms(b), [labRoom])
  assert.ok(!postsOf(b).some((m) => m.room === team.id))
})

test('멈춤 안내는 하던 일의 방에 — 받은 일을 비운 뒤라 소속 팀 방으로 새지 않는다', async () => {
  const { b, labRoom } = await teamInProject()
  inst(b, labRoom, '프로젝트 방 일')
  rt(b).init()
  void office.interrupt(b)
  await flush()
  rt(b).result('')
  await settle()
  const posts = postsOf(b)
  assert.ok(posts.length > 0, '멈춤 안내가 올라간다')
  assert.ok(posts.every((m) => m.room === labRoom), JSON.stringify(posts.map((m) => [m.room, m.text])))
})

test('줄 선 지시의 방으로 지금 일의 글이 새지 않는다: 직원 창 지시를 하던 팀장의 위임 글은 프로젝트 방이 아니라 평소 방', async () => {
  const { team, a, labRoom } = await teamInProject()
  inst(a, undefined, '직원 창에서 시킨 일')
  rt(a).init()
  inst(a, labRoom, '프로젝트 방에서 보낸 다음 일') // 일하는 중이라 줄을 선다
  await flush()
  delegate(a, '최팀원', '이것 해 주세요')
  const line = postsOf(a).find((m) => m.text.startsWith('@최팀원'))
  assert.equal(line?.room, team.id)
})

test('줄 선 지시가 있을 때 올린 새 기획 카드는 지금 일의 방 — 줄 선 프로젝트 방 지시의 방을 물려받지 않는다', async () => {
  const { a, labRoom } = await teamInProject()
  inst(a, undefined, '직원 창의 현재 일')
  rt(a).init()
  inst(a, labRoom, '아직 처리하지 않은 프로젝트 일')
  await flush()
  await callTool(a, 'propose_plan', { title: '현재 일의 기획', spec: '나눠서 진행', subtasks: [{ title: '하위 일', detail: '상세', assignee: '최팀원' }] })
  const plan = snap().tasks.find((x) => x.title === '현재 일의 기획')!
  assert.notEqual(plan.room, labRoom)
  assert.notEqual(postsOf(a).find((m) => m.plan)?.room, labRoom, '기획안 확인 카드도')
})

test('턴 끝 글 질문 알림은 끝낸 일의 방 — 줄 선 다음 지시의 방으로 가지 않는다', async () => {
  const { team, b, labRoom } = await teamInProject()
  inst(b, team.id, '팀 방의 현재 일')
  rt(b).init()
  inst(b, labRoom, '아직 처리하지 않은 프로젝트 일')
  await flush()
  rt(b).result('어느 쪽으로 할까요?\n1. 빠른 길\n2. 안전한 길')
  await settle()
  const question = postsOf(b).find((m) => m.approval)
  assert.ok(question, '질문 알림이 올라간다')
  assert.equal(question.room, team.id)
})

test('일 도중 질문: 질문 직전에 쓴 글을 지시가 온 방에 질문 카드보다 먼저 올리고, 다른 방에는 안 올린다', async () => {
  const { team, b } = await oneTeam()
  inst(b, team.id, '비교해 줘')
  rt(b).init()
  rt(b).sdk({ type: 'assistant', message: { content: [{ type: 'text', text: '분석 결과: 우리 앱이 앞섭니다' }] } })
  await flush()
  const addApproval = (office as unknown as { addApproval(a: Approval): void }).addApproval.bind(office)
  addApproval({ id: 'q-1', staffId: b, toolName: 'AskUserQuestion', summary: '어떻게 확인할까요?', createdAt: Date.now(), questions: [{ question: '어떻게 확인할까요?', header: 'h', options: [], multiSelect: false }] })
  const mine = db.recentChat(200).filter((m) => m.from === b)
  const pre = mine.findIndex((m) => m.text === '분석 결과: 우리 앱이 앞섭니다')
  const card = mine.findIndex((m) => m.approval?.id === 'q-1')
  assert.ok(pre >= 0 && card > pre, '질문 직전 글이 질문 카드 앞에')
  assert.equal(mine[pre].room ?? '', team.id)
  assert.ok(!mine[pre].isReport, '끝난 보고가 아니다')
  // 같은 글을 다음 질문에서 또 올리지 않는다
  addApproval({ id: 'q-2', staffId: b, toolName: 'AskUserQuestion', summary: '또?', createdAt: Date.now(), questions: [{ question: '또?', header: 'h', options: [], multiSelect: false }] })
  assert.equal(db.recentChat(200).filter((m) => m.text === '분석 결과: 우리 앱이 앞섭니다').length, 1)
})

// 일하는 중 다 쓴 글은 그때그때 단체방 메시지로 (최종 보고만 기다리지 않는다)
/** 지시를 보낸 뒤 이 직원이 올린 글 (입사 인사는 뺀다) */
const since = (id: string, from: number) => db.recentChat(200).filter((m) => m.from === id && m.id > from)
const lastId = () => db.recentChat(1)[0]?.id ?? 0
const say = (id: string, text: string) => rt(id).sdk({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
const LONG_A = '첫 번째 분석입니다. 화면 구성과 메시지 흐름을 살펴보니 지시가 온 방에만 글이 올라가야 하고 다른 방에는 섞이면 안 됩니다. 이 글은 짧은 글 합치기 기준보다 길게 썼습니다.'
const LONG_B = '두 번째 정리입니다. 마지막 글은 최종 보고와 같으니 새로 올리지 않고 그 말풍선을 보고로 바꾸면 같은 글이 두 번 보이지 않습니다. 이 글도 합치기 기준보다 길게 썼습니다.'

test('중간 글: 다 쓴 글마다 지시가 온 방에 바로 올라가고, 마지막 글이 최종 보고와 같으면 새로 올리지 않고 그 말풍선을 보고로 바꾼다', async () => {
  const { team, b } = await oneTeam()
  const from = lastId()
  inst(b, team.id, '분석해 줘')
  rt(b).init()
  say(b, LONG_A)
  await flush()
  const first = since(b, from)
  assert.deepEqual(first.map((m) => [m.text, m.room ?? '', Boolean(m.isReport)]), [[LONG_A, team.id, false]], '끝나기 전에 일반 메시지로 올라간다')
  say(b, LONG_B)
  await flush()
  rt(b).result(LONG_B)
  await settle()
  const mine = since(b, from).filter((m) => !m.approval)
  assert.deepEqual(mine.map((m) => m.text), [LONG_A, LONG_B], '같은 글이 두 번 올라가지 않는다')
  assert.ok(!mine[0].isReport, '앞 글은 중간 글')
  assert.ok(mine[1].isReport, '마지막 글이 보고가 된다')
  assert.ok(mine.every((m) => (m.room ?? '') === team.id), '다른 방에는 안 올라간다')
})

test('중간 글: 짧은 글이 이어지면 한 말풍선에 붙이고, 끝 조각이 최종 보고면 떼어 보고로 올린다', async () => {
  const { team, b } = await oneTeam()
  const from = lastId()
  inst(b, team.id, '찾아 줘')
  rt(b).init()
  say(b, '찾아볼게요.')
  say(b, '파일 두 개를 읽었습니다.')
  await flush()
  let mine = since(b, from)
  assert.deepEqual(mine.map((m) => m.text), ['찾아볼게요.\n파일 두 개를 읽었습니다.'], '짧은 글은 한 말풍선')
  say(b, '끝났습니다.')
  await flush()
  rt(b).result('끝났습니다.')
  await settle()
  mine = since(b, from)
  assert.deepEqual(mine.map((m) => [m.text, Boolean(m.isReport)]), [['찾아볼게요.\n파일 두 개를 읽었습니다.', false], ['끝났습니다.', true]])
  assert.ok(mine.every((m) => (m.room ?? '') === team.id))
})

test('중간 글: 긴 글은 붙이지 않고, 사이에 다른 사람 글이 끼면 새 말풍선, 최종 보고가 다른 글이면 보고는 따로', async () => {
  const { team, a, b } = await oneTeam()
  const from = lastId()
  inst(b, team.id, '정리해 줘')
  rt(b).init()
  say(b, '확인할게요.')
  say(b, LONG_A)
  await flush()
  inst(a, team.id, '리드도 일') // 다른 사람 글이 방에 낀다
  say(a, '리드 글')
  await flush()
  say(b, '거의 다 됐어요.')
  await flush()
  rt(b).result('최종 보고: 정리 끝')
  await settle()
  const mine = since(b, from)
  assert.deepEqual(mine.map((m) => [m.text, Boolean(m.isReport)]), [['확인할게요.', false], [LONG_A, false], ['거의 다 됐어요.', false], ['최종 보고: 정리 끝', true]])
})

test('중간 글: 질문 카드 뒤에 같은 글로 끝나도 카드 위 말풍선을 보고로 바꾸지 않고 카드 아래에 보고를 올린다', async () => {
  const { team, b } = await oneTeam()
  const from = lastId()
  inst(b, team.id, '비교해 줘')
  rt(b).init()
  say(b, LONG_A)
  await flush()
  const addApproval = (office as unknown as { addApproval(a: Approval): void }).addApproval.bind(office)
  addApproval({ id: 'q-9', staffId: b, toolName: 'AskUserQuestion', summary: '계속할까요?', createdAt: Date.now(), questions: [{ question: '계속할까요?', header: 'h', options: [], multiSelect: false }] })
  rt(b).result(LONG_A)
  await settle()
  const mine = since(b, from)
  const card = mine.findIndex((m) => m.approval?.id === 'q-9')
  const report = mine.findIndex((m) => m.isReport)
  assert.ok(card >= 0 && report > card, '보고는 질문 카드 아래')
  assert.ok(!mine[card - 1].isReport && mine[card - 1].text === LONG_A, '카드 위 글은 중간 글 그대로')
  assert.ok(mine.every((m) => (m.room ?? '') === team.id))
})

test('중간 글: 최종 보고가 결재 카드 앞에 올린 글까지 이어 붙인 글이면(Codex) 이미 올린 문단은 빼고 새 부분만 보고로 올린다', async () => {
  const { team, b } = await oneTeam()
  const from = lastId()
  inst(b, team.id, '폴더 봐 줘')
  rt(b).init()
  say(b, LONG_A)
  await flush()
  const addApproval = (office as unknown as { addApproval(a: Approval): void }).addApproval.bind(office)
  addApproval({ id: 'ap-1', staffId: b, toolName: 'Bash', summary: 'ls /tmp', createdAt: Date.now() })
  rt(b).result(`${LONG_A}\n\n정리: 폴더 확인 끝`)
  await settle()
  const mine = since(b, from).filter((m) => !m.approval)
  assert.deepEqual(mine.map((m) => [m.text, Boolean(m.isReport)]), [[LONG_A, false], ['정리: 폴더 확인 끝', true]])
})

test('중간 글: 다음 글이 앞서 올린 문단을 다시 붙여 쓰면(Codex) 새 부분만 올리고, 그 글로 끝나면 보고로 바꾼다', async () => {
  const { team, b } = await oneTeam()
  const from = lastId()
  inst(b, team.id, '두 파일 봐 줘')
  rt(b).init()
  say(b, LONG_A)
  await flush()
  const addApproval = (office as unknown as { addApproval(a: Approval): void }).addApproval.bind(office)
  addApproval({ id: 'ap-2', staffId: b, toolName: 'Bash', summary: 'cat b.txt', createdAt: Date.now() })
  const whole = `${LONG_A}\n\n${LONG_B}\n\n정리: 끝`
  say(b, whole)
  await flush()
  rt(b).result(whole)
  await settle()
  const mine = since(b, from).filter((m) => !m.approval)
  assert.deepEqual(mine.map((m) => [m.text, Boolean(m.isReport)]), [[LONG_A, false], [`${LONG_B}\n\n정리: 끝`, true]])
})
