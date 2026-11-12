// 보고 말투(쉬운 말 기본 · 전문가): 직원 세션 프롬프트에 한 번만 들어가고, 설정을 바꾸면 새 세션부터 바뀐다. 비서 프롬프트에도 들어간다
// delegateInterrupt.test.mts와 같은 방식: 실제 Office·HiredStaffManager를 타고 엔진 프로세스만 가짜로 바꾼다

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { after, afterEach, beforeEach, test } from 'node:test'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-style-'))
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
const { reportStyleRule } = await import('../src/shared/reportStyle.ts')
const db = await import('../src/main/db.ts')
const { startLocalMcp, stopLocalMcp } = await import('../src/main/mcp/localMcp.ts')

await startLocalMcp()
after(() => {
  stopLocalMcp()
  db.closeDb()
  fs.rmSync(root, { recursive: true, force: true })
})

/** 세션을 열 때 받은 시스템 프롬프트만 기억한다 */
class FakeClaude extends ClaudeRuntime {
  prompt = ''
  private open = false
  override get isOpen() {
    return this.open
  }
  override start(opts: Parameters<ClaudeRuntime['start']>[0]) {
    this.prompt = opts.systemPromptAppend ?? ''
    this.open = true
  }
  override close() {
    super.close()
    this.open = false
  }
  override dispose() {
    this.open = false
  }
}

type OfficeT = InstanceType<typeof Office>
let office: OfficeT
let lastRuntime: FakeClaude | null = null

beforeEach(() => {
  db.closeDb()
  userData = fs.mkdtempSync(path.join(root, 'ud-'))
  db.openDb()
  office = new Office({
    makeRuntime: (_provider, onEvent) => (lastRuntime = new FakeClaude(onEvent)),
    isNetBack: async () => true,
  })
  office.start()
})

afterEach(async () => {
  office.stop()
  await new Promise((r) => setTimeout(r, 80))
})

/** 직원을 고용하고 일을 맡겨 세션을 연 뒤, 그 세션의 시스템 프롬프트 */
async function promptOfNewStaff(name: string) {
  const team = office.createTeam(`${name}팀`, '#888')
  const s = office.hire({ name, role: '개발', avatar: 0, provider: 'claude', model: 'default', cwd: root, systemPrompt: '', approvalMode: 'default', teamId: team.id })
  const runtime = lastRuntime!
  const card = office.createTask({ title: '버튼 고치기', detail: '', teamId: team.id })
  office.assignTask(card.id, s.id)
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))
  return runtime.prompt
}

const count = (text: string, part: string) => text.split(part).length - 1

test('설정이 없으면 쉬운 말 — 직원 프롬프트에 한 번만 들어간다', async () => {
  assert.equal(office.snapshot().settings.reportStyle, undefined)
  const prompt = await promptOfNewStaff('최쉬움')
  assert.equal(count(prompt, t('staff.reportStyle.easy')), 1)
  assert.ok(!prompt.includes(t('staff.reportStyle.expert')))
})

test('전문가 말투로 바꾸면 새로 여는 세션부터 전문가 문안만 들어간다', async () => {
  office.updateSettings({ reportStyle: 'expert' })
  const prompt = await promptOfNewStaff('박전문')
  assert.equal(count(prompt, t('staff.reportStyle.expert')), 1)
  assert.ok(!prompt.includes(t('staff.reportStyle.easy')))
})

test('reportStyleRule: 없거나 easy면 쉬운 말, expert면 전문가', () => {
  assert.equal(reportStyleRule(undefined), t('staff.reportStyle.easy'))
  assert.equal(reportStyleRule('easy'), t('staff.reportStyle.easy'))
  assert.equal(reportStyleRule('expert'), t('staff.reportStyle.expert'))
})

test('비서(앱 비서·바탕화면 비서가 같이 쓰는 대화) 시스템 프롬프트에 설정의 보고 말투가 들어간다', () => {
  const src = fs.readFileSync(new URL('../src/main/secretary.ts', import.meta.url), 'utf8')
  assert.match(src, /system: `\$\{SYSTEM_PROMPT\}[^`]*\$\{reportStyleRule\(this\.office\.snapshot\(\)\.settings\.reportStyle\)\}/)
})

test('휴대폰에서도 보고 말투를 바꿀 수 있다 (원격 설정 허용 목록)', async () => {
  const { pickFields } = await import('../src/main/remote/v2.ts')
  assert.deepEqual(pickFields('updateSettings', [{ reportStyle: 'expert' }]), [{ reportStyle: 'expert' }])
})
