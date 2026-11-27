// 예전 카드의 방 채우기 — 기록(도구·지시·결과 줄, 단체방 글)으로 확실한 카드만 채우고, 모르면 그대로 둔다

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { after, test } from 'node:test'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'task-room-backfill-'))
const g = globalThis as unknown as { __electron: unknown }
g.__electron = {
  app: { getPath: () => root, getVersion: () => '0.0.0', getLocale: () => 'ko', getAppPath: () => process.cwd(), isPackaged: false, on() {} },
  net: { isOnline: () => true },
}
register('./officeLoaderHooks.mjs', import.meta.url)

const { inferTaskRooms } = await import('../src/main/taskRoomBackfill.ts')
type Input = Parameters<typeof inferTaskRooms>[0]
const db = await import('../src/main/db.ts')

after(() => {
  db.closeDb()
  fs.rmSync(root, { recursive: true, force: true })
})

const LEAD = 'lead'
const TEAM = 'team-fe'
const LAB = 'lab:office'
const OTHER = 'lab:world'
const T = 1_000_000
const home = (id: string) => (id === LEAD ? TEAM : undefined)
const names = new Map([
  [LEAD, '정리드'],
  ['ai', 'ai-office'],
  ['world', '월드기획'],
  ['other', '오큐에이'],
])
const card = (id: string, title: string, createdAt: number, extra: { room?: string; rootId?: string } = {}) => ({ id, title, createdAt, room: extra.room, ...(extra.rootId ? { rootId: extra.rootId } : {}) })
// 방 글이 생긴 뒤의 기록 (그 전 카드는 건너뛴다)
const roomsOpened = { ts: 1, sender: 'me', room: OTHER, text: '방 첫 글' }
const addTask = (title: string, ts = T - 5) => ({ staffId: LEAD, ts, type: 'tool', text: `mcp__office__add_task ${JSON.stringify({ title, detail: '' })}` })
const result = (ts: number) => ({ staffId: LEAD, ts, type: 'result', text: '업무 완료 · 주고받기 3번' })
const inst = (ts: number, text: string) => ({ staffId: LEAD, ts, type: 'instruction', text })
const post = (ts: number, room: string, text = '보고') => ({ ts, sender: LEAD, room, text })

function input(over: Partial<Input>): Input {
  return { cards: [{ id: 'c1', title: '화면 확인 카드', createdAt: T }], logs: [], chats: [roomsOpened], known: [card('c1', '화면 확인 카드', T, { rootId: 'c1' })], homeRoom: home, names, ...over }
}

test('리드 지시를 받아 프로젝트 방에서 일하다 만든 카드 → 그 프로젝트 방', () => {
  const r = inferTaskRooms(
    input({
      logs: [result(T - 60_000), inst(T - 30_000, '[ai-office의 지시] 설계안을 비교하고 구현을 시작해 주세요'), addTask('화면 확인 카드'), result(T + 10_000)],
      chats: [roomsOpened, { ts: T - 30_001, sender: 'ai', room: LAB, text: '@정리드 설계안을 비교하고 구현을 시작해 주세요' }, post(T + 10_003, LAB)],
    }),
  )
  assert.deepEqual(r.filled, [{ id: 'c1', room: LAB }])
})

test('지시를 모르고 보고가 소속 방에만 있으면 건너뛴다 (방 없는 일이 소속 방으로 샌 것일 수 있다)', () => {
  const r = inferTaskRooms(input({ logs: [result(T - 60_000), inst(T - 30_000, '[자동 점검] 보고에 남은 일이 있는데'), addTask('화면 확인 카드'), result(T + 10_000)], chats: [roomsOpened, post(T + 10_003, TEAM)] }))
  assert.deepEqual(r.filled, [])
  assert.deepEqual(r.skipped, [{ id: 'c1', reason: 'homeOnly' }])
})

test('소속 방 지시가 확인되면 소속 방으로 채운다 (방 이름 머리표·휴대폰 표시를 떼고 대표 글과 맞춘다)', () => {
  const r = inferTaskRooms(
    input({
      logs: [result(T - 60_000), inst(T - 30_000, '📱 원격 [프론트엔드 팀] 실패 카드 처리 방향을 정해 주세요'), addTask('화면 확인 카드'), result(T + 10_000)],
      chats: [roomsOpened, { ts: T - 30_003, sender: 'me', room: TEAM, text: '실패 카드 처리 방향을 정해 주세요' }, post(T + 10_003, TEAM)],
    }),
  )
  assert.deepEqual(r.filled, [{ id: 'c1', room: TEAM }])
})

test('전체 방 글도 지시가 확인될 때만 전체 방으로 채운다', () => {
  const logs = [result(T - 60_000), inst(T - 30_000, '[자동 점검] 아직 끝나지 않은 작업이 있습니다'), addTask('화면 확인 카드'), result(T + 10_000)]
  assert.deepEqual(inferTaskRooms(input({ logs, chats: [roomsOpened, post(T + 10_003, '')] })).skipped, [{ id: 'c1', reason: 'homeOnly' }])
  const confirmed = inferTaskRooms(
    input({
      logs: [...logs, inst(T - 20_000, '전체 회의 결과를 정리해 카드로 올려 주세요')],
      chats: [roomsOpened, { ts: T - 20_002, sender: 'me', room: '', text: '전체 회의 결과를 정리해 카드로 올려 주세요' }, post(T + 10_003, '')],
    }),
  )
  assert.deepEqual(confirmed.filled, [{ id: 'c1', room: '' }])
})

test('한 턴의 글이 여러 방에 있거나, 다른 방 지시가 섞였으면 건너뛴다', () => {
  const logs = [result(T - 60_000), inst(T - 30_000, '[ai-office의 지시] 설계안을 비교하고 구현을 시작해 주세요'), addTask('화면 확인 카드'), result(T + 10_000)]
  const directive = { ts: T - 30_001, sender: 'ai', room: LAB, text: '@정리드 설계안을 비교하고 구현을 시작해 주세요' }
  const mixed = inferTaskRooms(input({ logs, chats: [roomsOpened, directive, post(T + 10_003, LAB), post(T + 10_004, OTHER)] }))
  assert.deepEqual(mixed.skipped, [{ id: 'c1', reason: 'mixedRooms' }])
  // 일하는 중에 다른 방 지시가 줄 섰다 — 예전에는 그 방으로 글이 샐 수 있었다
  const queued = inferTaskRooms(
    input({
      logs: [...logs, inst(T + 5000, '[월드기획의 지시] 다른 프로젝트 일도 이어서 해 주세요')],
      chats: [roomsOpened, directive, { ts: T + 4999, sender: 'world', room: OTHER, text: '@정리드 다른 프로젝트 일도 이어서 해 주세요' }, post(T + 10_003, LAB)],
    }),
  )
  assert.deepEqual(queued.skipped, [{ id: 'c1', reason: 'conflict' }])
})

test('만든 도구 줄이 없거나(보드에서 만든 카드) 같은 제목 줄이 둘이면 건너뛴다', () => {
  const chats = [roomsOpened, post(T + 10_003, LAB)]
  assert.deepEqual(inferTaskRooms(input({ logs: [result(T + 10_000)], chats })).skipped, [{ id: 'c1', reason: 'noCreator' }])
  const twice = inferTaskRooms(input({ logs: [addTask('화면 확인 카드', T - 900), { ...addTask('화면 확인 카드', T - 10), staffId: 'other' }, result(T + 10_000)], chats }))
  assert.deepEqual(twice.skipped, [{ id: 'c1', reason: 'noCreator' }])
})

test('팀·프로젝트 방이 생기기 전 카드는 건너뛴다 (그때 글은 모두 전체 방)', () => {
  const r = inferTaskRooms(input({ logs: [addTask('화면 확인 카드'), result(T + 10_000)], chats: [{ ...roomsOpened, ts: T + 1 }, post(T + 10_003, LAB)] }))
  assert.deepEqual(r.skipped, [{ id: 'c1', reason: 'beforeRooms' }])
})

test("턴에 글이 없으면 '[업무 보드]' 지시 카드의 방을 따른다 — 먼저 채운 카드의 방도 이어받는다", () => {
  const cards = [
    { id: 'a', title: '부모 일', createdAt: T },
    { id: 'b', title: '이어서 한 일', createdAt: T + 100_000 },
  ]
  const r = inferTaskRooms(
    input({
      cards,
      known: [card('a', '부모 일', T, { rootId: 'a' }), card('b', '이어서 한 일', T + 100_000, { rootId: 'b' })],
      logs: [
        result(T - 60_000),
        inst(T - 30_000, '[ai-office의 지시] 설계안을 비교하고 구현을 시작해 주세요'),
        addTask('부모 일'),
        result(T + 10_000),
        inst(T + 90_000, '[업무 보드] 부모 일\n자세한 내용'),
        addTask('이어서 한 일', T + 99_000),
        result(T + 110_000),
      ],
      chats: [roomsOpened, { ts: T - 30_001, sender: 'ai', room: LAB, text: '@정리드 설계안을 비교하고 구현을 시작해 주세요' }, post(T + 10_003, LAB)],
    }),
  )
  assert.deepEqual(r.filled, [
    { id: 'a', room: LAB },
    { id: 'b', room: LAB },
  ])
  // 부모 카드를 못 채웠으면 이어받을 방도 모른다
  const unknown = inferTaskRooms(input({ cards: [cards[1]], known: [card('a', '부모 일', T, { rootId: 'a' }), card('b', '이어서 한 일', T + 100_000, { rootId: 'b' })], logs: [result(T + 80_000), inst(T + 90_000, '[업무 보드] 부모 일'), addTask('이어서 한 일', T + 99_000), result(T + 110_000)] }))
  assert.deepEqual(unknown.skipped, [{ id: 'b', reason: 'noEvidence' }])
})

test('db: 확실한 카드만 한 번 채우고 완료 표시를 남긴다 (두 번째는 하지 않는다)', () => {
  db.openDb()
  const realNow = Date.now
  let clock = 2_000_000
  Date.now = () => clock
  try {
    db.insertChat('me', '방 첫 글', undefined, undefined, OTHER)
    clock += 10_000
    db.insertLog(LEAD, 'result', '업무 완료 · 주고받기 1번')
    clock += 10_000
    db.insertChat('ai', '@정리드 설계안을 비교하고 구현을 시작해 주세요', undefined, undefined, LAB)
    db.insertLog(LEAD, 'instruction', '[ai-office의 지시] 설계안을 비교하고 구현을 시작해 주세요')
    clock += 10_000
    db.insertLog(LEAD, 'tool', `mcp__office__add_task ${JSON.stringify({ title: '찾을 카드' })}`)
    const base = { detail: '', status: 'todo' as const, assigneeId: null, teamId: null, labId: null, result: '', updatedAt: clock + 2, parentId: null }
    db.upsertTask({ ...base, id: 'found', title: '찾을 카드', createdAt: clock + 2 })
    // 보드에서 대표가 만든 카드 — 만든 도구 줄이 없다
    db.upsertTask({ ...base, id: 'board', title: '보드 카드', createdAt: clock + 3 })
    // 이미 방이 있는 카드는 보지 않는다
    db.upsertTask({ ...base, id: 'has-room', title: '방 있는 카드', createdAt: clock + 4, room: OTHER })
    clock += 10_000
    db.insertLog(LEAD, 'result', '업무 완료 · 주고받기 2번')
    clock += 1
    db.insertChat(LEAD, '끝냈습니다', undefined, undefined, LAB)
  } finally {
    Date.now = realNow
  }
  const plan = db.taskRoomBackfillPlan(home)
  assert.deepEqual(plan?.filled, [{ id: 'found', room: LAB }])
  assert.deepEqual(plan?.skipped, [{ id: 'board', reason: 'noCreator' }])
  // 미리 세기는 바꾸지 않는다
  assert.equal(db.loadTasks().find((t) => t.id === 'found')?.room, undefined)
  const done = db.backfillTaskRooms(home)
  assert.equal(done?.filled.length, 1)
  const rooms = Object.fromEntries(db.loadTasks().map((t) => [t.id, t.room]))
  assert.deepEqual(rooms, { found: LAB, board: undefined, 'has-room': OTHER })
  assert.equal(db.backfillTaskRooms(home), null)
  assert.equal(db.taskRoomBackfillPlan(home), null)
})

const turn = [result(T - 60_000), inst(T - 30_000, '[ai-office의 지시] 설계안을 비교하고 구현을 시작해 주세요'), addTask('화면 확인 카드'), result(T + 10_000)]
const leadDirective = { ts: T - 30_001, sender: 'ai', room: LAB, text: '@정리드 설계안을 비교하고 구현을 시작해 주세요' }

test('턴 앞부분 글도 본다 — 카드를 만들기 전 A방, 뒤 B방이면 건너뛴다', () => {
  const r = inferTaskRooms(input({ logs: turn, chats: [roomsOpened, leadDirective, post(T - 20_000, OTHER), post(T + 10_003, LAB)] }))
  assert.deepEqual(r.skipped, [{ id: 'c1', reason: 'mixedRooms' }])
})

test('턴 끝 뒤 여유 구간은 다음 턴 지시에서 끊는다 (다음 턴 글을 이 턴 글로 보지 않는다)', () => {
  const logs = [...turn, inst(T + 10_001, '[자동 점검] 보고에 남은 일이 있는데')]
  // 이 턴 글은 없고 다음 턴 글만 여유 구간 안에 있다 — 지시(LAB)로 채우고, 다음 턴 OTHER 글은 섞지 않는다
  const r = inferTaskRooms(input({ logs, chats: [roomsOpened, leadDirective, post(T + 10_002, OTHER)] }))
  assert.deepEqual(r.filled, [{ id: 'c1', room: LAB }])
  // 앞 턴 끝 보고(이 턴 첫 지시 전)도 이 턴 글이 아니다
  const prev = inferTaskRooms(input({ logs: turn, chats: [roomsOpened, leadDirective, post(T - 59_998, OTHER), post(T + 10_003, LAB)] }))
  assert.deepEqual(prev.filled, [{ id: 'c1', room: LAB }])
})

test('제목은 도구의 제목 칸과 맞춘다 — 앞부분만 같은 제목·내용에만 든 제목은 인정하지 않는다', () => {
  const chats = [roomsOpened, leadDirective, post(T + 10_003, LAB)]
  const longer = { staffId: LEAD, ts: T - 5, type: 'tool', text: `mcp__office__add_task ${JSON.stringify({ title: '화면 확인 카드 두 번째' })}` }
  assert.deepEqual(inferTaskRooms(input({ logs: [...turn.filter((l) => l.type !== 'tool'), longer], chats })).skipped, [{ id: 'c1', reason: 'noCreator' }])
  const inDetail = { staffId: LEAD, ts: T - 5, type: 'tool', text: `mcp__office__add_task ${JSON.stringify({ title: '다른 일', detail: '화면 확인 카드' })}` }
  assert.deepEqual(inferTaskRooms(input({ logs: [...turn.filter((l) => l.type !== 'tool'), inDetail], chats })).skipped, [{ id: 'c1', reason: 'noCreator' }])
})

test('잘린 도구 줄은 근거로 쓰지 않는다 — 실제 카드가 지워지고 같은 앞부분의 보드 카드만 남아도 채우지 않는다', () => {
  const title = '아주 긴 제목의 업무 카드 — 화면 확인과 실제 기기 점검, 4개 언어 화면 비교까지 함께 하는 일'
  const cut = `mcp__office__add_task ${JSON.stringify({ title, detail: '자세히' })}`.slice(0, 80)
  assert.ok(!cut.includes(title), '시험 제목은 로그에서 잘려야 한다')
  const logs = [...turn.filter((l) => l.type !== 'tool'), { staffId: LEAD, ts: T - 5, type: 'tool', text: cut }]
  const chats = [roomsOpened, leadDirective, post(T + 10_003, LAB)]
  const board = `${title} (보드)`
  const r = inferTaskRooms(input({ cards: [{ id: 'b', title: board, createdAt: T }], known: [card('b', board, T, { rootId: 'b' })], logs, chats }))
  assert.deepEqual(r.skipped, [{ id: 'b', reason: 'noCreator' }])
})

test('기획 줄의 제목 칸이 잘려 안 보이면 기획서 첫 줄로 다른 카드를 잇지 않는다', () => {
  const spec = '# 실패 카드 정리\n긴 기획 내용이 이어진다 — 하위 업무 셋과 확인 방법까지 적는다'
  const cut = `mcp__office__propose_plan ${JSON.stringify({ spec, subtasks: [], title: '진짜 기획 제목' })}`.slice(0, 80)
  assert.ok(!cut.includes('"title"'), '제목 칸은 잘려야 한다')
  const logs = [...turn.filter((l) => l.type !== 'tool'), { staffId: LEAD, ts: T - 5, type: 'tool', text: cut }]
  const r = inferTaskRooms(input({ cards: [{ id: 'p', title: '실패 카드 정리', createdAt: T }], known: [card('p', '실패 카드 정리', T, { rootId: 'p' })], logs, chats: [roomsOpened, leadDirective, post(T + 10_003, LAB)] }))
  assert.deepEqual(r.skipped, [{ id: 'p', reason: 'noCreator' }])
  // 줄 전체가 보이면(제목 칸이 없으면) 기획서 첫 줄이 카드 제목이다
  const whole = `mcp__office__propose_plan ${JSON.stringify({ spec: '# 실패 카드 정리\n짧게', subtasks: [] })}`
  assert.ok(whole.length < 80)
  const ok = inferTaskRooms(input({ cards: [{ id: 'p', title: '실패 카드 정리', createdAt: T }], known: [card('p', '실패 카드 정리', T, { rootId: 'p' })], logs: [...turn.filter((l) => l.type !== 'tool'), { staffId: LEAD, ts: T - 5, type: 'tool', text: whole }], chats: [roomsOpened, leadDirective, post(T + 10_003, LAB)] }))
  assert.deepEqual(ok.filled, [{ id: 'p', room: LAB }])
})

test('리드 지시는 보낸 리드·받는 직원·본문이 모두 맞는 글만 근거로 쓴다', () => {
  const logs = [...turn.slice(0, 1), inst(T - 30_000, '[ai-office의 지시] 소속 팀 방 일을 정리해 주세요'), ...turn.slice(2)]
  // 다른 직원이 지시를 인용한 글, 다른 사람에게 보낸 같은 본문은 근거가 아니다
  const quoted = [
    { ts: T - 30_001, sender: 'other', room: TEAM, text: '@정리드 소속 팀 방 일을 정리해 주세요' },
    { ts: T - 30_001, sender: 'ai', room: TEAM, text: '@오큐에이 소속 팀 방 일을 정리해 주세요' },
  ]
  const r = inferTaskRooms(input({ logs, chats: [roomsOpened, ...quoted, post(T + 10_003, TEAM)] }))
  assert.deepEqual(r.skipped, [{ id: 'c1', reason: 'homeOnly' }])
  const real = inferTaskRooms(input({ logs, chats: [roomsOpened, { ts: T - 30_001, sender: 'ai', room: TEAM, text: '@정리드 소속 팀 방 일을 정리해 주세요' }, post(T + 10_003, TEAM)] }))
  assert.deepEqual(real.filled, [{ id: 'c1', room: TEAM }])
})

test("'[업무 보드]' 지시는 제목 줄 전체가 같은 카드만 — 더 짧은 제목의 다른 카드 방을 가져오지 않는다", () => {
  const logs = [result(T - 60_000), inst(T - 30_000, '[업무 보드] 화면 확인 카드 정리\n내용'), addTask('새 카드'), result(T + 10_000)]
  const r = inferTaskRooms(input({ cards: [{ id: 'n', title: '새 카드', createdAt: T }], known: [card('n', '새 카드', T, { rootId: 'n' }), card('short', '화면 확인 카드', T - 99_000, { room: LAB })], logs }))
  assert.deepEqual(r.skipped, [{ id: 'n', reason: 'noEvidence' }])
})
