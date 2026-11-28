// 생각 깊이·빠른 모드(tuning)와 쓰고 있는 답 글(draft): 세션을 열 때 tuning을 넘기고, 바꾸면 세션을 닫지 않고 setTuning,
// 답 글 조각(textDelta)은 DRAFT_FLUSH_MS마다 모아 보내고 다 쓴 글(text)·턴 끝(result)·오류에 지운다
// netResumeFlow.test.mts와 같은 방식: 실제 Office·HiredStaffManager·CodexRuntime.onMessage를 타고 엔진 프로세스만 가짜로 바꾼다

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { after, afterEach, beforeEach, test } from 'node:test'
import type { RuntimeStartOpts, RuntimeTuning } from '../src/main/ai/types.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-tuning-'))
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
const { CodexRuntime } = await import('../src/main/ai/codex.ts')
const { DRAFT_FLUSH_MS, tuningOf } = await import('../src/main/hired.ts')
const db = await import('../src/main/db.ts')
const { startLocalMcp, stopLocalMcp } = await import('../src/main/mcp/localMcp.ts')

await startLocalMcp()
after(() => {
  stopLocalMcp()
  db.closeDb()
  fs.rmSync(root, { recursive: true, force: true })
})

/** 세션 열기·tuning 바꾸기만 적어 두는 가짜 */
interface Fake {
  starts: RuntimeStartOpts[]
  tunings: RuntimeTuning[]
}

class FakeClaude extends ClaudeRuntime implements Fake {
  starts: RuntimeStartOpts[] = []
  tunings: RuntimeTuning[] = []
  private open = false
  override get isOpen() {
    return this.open
  }
  override start(opts: RuntimeStartOpts) {
    this.starts.push(opts)
    this.open = true
  }
  override setTuning(tuning: RuntimeTuning) {
    this.tunings.push(tuning)
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

/** Codex: app-server 알림을 이벤트로 바꾸는 onMessage는 실제 코드 */
class FakeCodex extends CodexRuntime implements Fake {
  starts: RuntimeStartOpts[] = []
  tunings: RuntimeTuning[] = []
  private open = false
  override get isOpen() {
    return this.open
  }
  override start(opts: RuntimeStartOpts) {
    this.starts.push(opts)
    this.open = true
  }
  override setTuning(tuning: RuntimeTuning) {
    this.tunings.push(tuning)
  }
  override send() {}
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
}

type OfficeT = InstanceType<typeof Office>
let office: OfficeT
let lastRuntime: (FakeClaude | FakeCodex) | null = null
let drafts: { staffId: string; text: string }[] = []

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))
}

beforeEach(() => {
  db.closeDb()
  userData = fs.mkdtempSync(path.join(root, 'ud-'))
  db.openDb()
  drafts = []
  office = new Office({
    makeRuntime: (provider, onEvent) => (lastRuntime = provider === 'codex' ? new FakeCodex(onEvent) : new FakeClaude(onEvent)),
    isNetBack: async () => true,
  })
  office.on('draft', (d) => drafts.push(d))
  office.start()
})

afterEach(async () => {
  office.stop()
  await wait(80)
  await flush()
})

function hire(name: string, provider: 'claude' | 'codex' = 'claude') {
  const s = office.hire({ name, role: '개발', avatar: 0, provider, model: provider === 'codex' ? 'gpt-5.5' : 'default', cwd: root, systemPrompt: '', approvalMode: 'default', teamId: null })
  const rt = lastRuntime!
  return { id: s.id, rt }
}

/** 업무 카드를 맡겨 세션을 연다 */
async function assign(id: string) {
  await wait(80) // 고용 직후 화면 갱신을 먼저 끝낸다
  const card = office.createTask({ title: '버튼 고치기', detail: '', teamId: null })
  office.assignTask(card.id, id)
  await flush()
}

test('pickStaffPatch: 생각 깊이(default·EFFORT_LEVELS)·빠른 모드(boolean)는 받고 틀린 값은 뺀다', async () => {
  // staffPatch.ts는 확장자 없는 값 import라 로더(officeLoaderHooks)를 거쳐야 불러진다
  const { pickStaffPatch } = await import('../src/main/staffPatch.ts')
  type In = Parameters<typeof pickStaffPatch>[0]
  assert.deepEqual(pickStaffPatch({ effort: 'high', fast: true }), { effort: 'high', fast: true })
  assert.deepEqual(pickStaffPatch({ effort: 'default', fast: false }), { effort: 'default', fast: false })
  assert.deepEqual(pickStaffPatch({ effort: 'max' }), { effort: 'max' })
  // 모르는 깊이·문자열 켬은 버리고 나머지는 남긴다
  assert.deepEqual(pickStaffPatch({ effort: 'ultra', fast: 'yes', name: '김' } as unknown as In), { name: '김' })
  assert.deepEqual(pickStaffPatch({ effort: null, fast: 1 } as unknown as In), {})
})

test('tuningOf: 깊이는 있을 때만, 빠른 모드는 true일 때만 켬', () => {
  assert.deepEqual(tuningOf({}), { fast: false })
  assert.deepEqual(tuningOf({ effort: 'high' }), { effort: 'high', fast: false })
  assert.deepEqual(tuningOf({ effort: 'low', fast: true }), { effort: 'low', fast: true })
  assert.deepEqual(tuningOf({ fast: false }), { fast: false })
})

test('세션을 열 때 직원의 생각 깊이·빠른 모드를 tuning으로 넘긴다 (설정 없으면 엔진 기본·끔)', async () => {
  const a = hire('김기본')
  await assign(a.id)
  assert.equal(a.rt.starts.length, 1)
  assert.deepEqual(a.rt.starts[0].tuning, { fast: false })

  const b = hire('박깊이')
  office.updateStaff(b.id, { effort: 'xhigh', fast: true })
  await assign(b.id)
  assert.equal(b.rt.starts.length, 1)
  assert.deepEqual(b.rt.starts[0].tuning, { effort: 'xhigh', fast: true })
})

test('깊이·빠른 모드를 바꾸면 세션을 닫지 않고 setTuning (default·false는 엔진 기본·끔으로)', async () => {
  const { id, rt } = hire('이조절')
  await assign(id)
  assert.equal(rt.isOpen, true)

  office.updateStaff(id, { effort: 'high' })
  assert.deepEqual(rt.tunings.at(-1), { effort: 'high', fast: false })
  office.updateStaff(id, { fast: true })
  assert.deepEqual(rt.tunings.at(-1), { effort: 'high', fast: true })
  office.updateStaff(id, { effort: 'default', fast: false })
  assert.deepEqual(rt.tunings.at(-1), { fast: false })
  assert.equal(rt.tunings.length, 3)
  // 세션은 그대로 — 다시 열지 않는다
  assert.equal(rt.isOpen, true)
  assert.equal(rt.starts.length, 1)

  // 다른 필드만 바꾸면 setTuning을 부르지 않는다. 틀린 값은 걸러져 부르지 않는다
  office.updateStaff(id, { role: '기획' })
  office.updateStaff(id, { effort: 'ultra' } as unknown as Parameters<OfficeT['updateStaff']>[1])
  assert.equal(rt.tunings.length, 3)
})

test('Codex 직원도 setTuning으로 바로 바뀐다', async () => {
  const { id, rt } = hire('최코덱스', 'codex')
  office.updateStaff(id, { effort: 'low', fast: true })
  assert.deepEqual(rt.tunings.at(-1), { effort: 'low', fast: true })
  await assign(id)
  assert.deepEqual(rt.starts[0].tuning, { effort: 'low', fast: true })
})

test('답 글 조각은 모았다가 한 번에 보내고, 다 쓴 글(text)이 오면 지운다', async () => {
  const { id, rt } = hire('정초안', 'codex')
  await assign(id)
  const codex = rt as FakeCodex
  drafts = []
  codex.notify('item/agentMessage/delta', { delta: '안녕' })
  codex.notify('item/agentMessage/delta', { delta: '하세요' })
  codex.notify('item/agentMessage/delta', { delta: '' }) // 빈 조각은 이벤트가 아니다
  // 바로 보내지 않는다
  assert.deepEqual(drafts, [])
  await wait(DRAFT_FLUSH_MS + 40)
  assert.deepEqual(drafts, [{ staffId: id, text: '안녕하세요' }])

  // 이어지는 조각은 누적된 전체 글로
  codex.notify('item/agentMessage/delta', { delta: '!' })
  await wait(DRAFT_FLUSH_MS + 40)
  assert.deepEqual(drafts.at(-1), { staffId: id, text: '안녕하세요!' })

  // 다 쓴 글이 오면 빈 글로 지운다
  codex.notify('item/completed', { item: { type: 'agentMessage', id: 'm1', text: '안녕하세요!' } })
  assert.deepEqual(drafts.at(-1), { staffId: id, text: '' })
  const n = drafts.length
  // 쓰던 글이 없으면 다시 지우지 않는다
  codex.notify('turn/completed', { turn: { id: 't1', status: 'completed' } })
  await wait(DRAFT_FLUSH_MS + 40)
  assert.equal(drafts.length, n)
})

test('보내기 전에 다 쓴 글이 오면 모아 둔 조각은 보내지 않고 지우기만 한다', async () => {
  const { id, rt } = hire('한빠름', 'codex')
  await assign(id)
  const codex = rt as FakeCodex
  drafts = []
  codex.notify('item/agentMessage/delta', { delta: '짧은 답' })
  codex.notify('item/completed', { item: { type: 'agentMessage', id: 'm1', text: '짧은 답' } })
  await wait(DRAFT_FLUSH_MS + 40)
  assert.deepEqual(drafts, [{ staffId: id, text: '' }])
})

test('글을 쓰다가 턴이 끝나거나(result) 오류가 나면 쓰던 글을 지운다', async () => {
  const { id, rt } = hire('윤중단', 'codex')
  await assign(id)
  const codex = rt as FakeCodex
  drafts = []
  codex.notify('item/agentMessage/delta', { delta: '쓰는 중' })
  await wait(DRAFT_FLUSH_MS + 40)
  assert.deepEqual(drafts, [{ staffId: id, text: '쓰는 중' }])
  codex.notify('turn/completed', { turn: { id: 't1', status: 'interrupted' } })
  assert.deepEqual(drafts.at(-1), { staffId: id, text: '' })

  // 오류(Claude 런타임 예외 경로)도 같게
  const c = hire('서오류')
  await assign(c.id)
  const onEvent = (c.rt as unknown as { onEvent(e: unknown): void }).onEvent.bind(c.rt)
  drafts = []
  onEvent({ type: 'textDelta', text: '부분' })
  await wait(DRAFT_FLUSH_MS + 40)
  assert.deepEqual(drafts, [{ staffId: c.id, text: '부분' }])
  onEvent({ type: 'error', error: new Error('boom') })
  assert.deepEqual(drafts.at(-1), { staffId: c.id, text: '' })
})
