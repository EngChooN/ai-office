import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { DEMO_ENV, DEMO_LIVE_FILE, demoProviders, loadDemoLive, type DemoLiveFile } from '../src/main/demoLive.ts'

const file: DemoLiveFile = {
  staff: {
    d6: { status: 'waiting', activity: 'Bash', approval: { id: 'demo:d6', toolName: 'Bash', summary: 'npm run db:migrate', input: { command: 'npm run db:migrate' }, agoMin: 2 } },
    d4: { status: 'waiting', activity: 'Q', approval: { id: 'demo:d4', toolName: 'AskUserQuestion', summary: 'Q', questions: [{ question: 'Q', header: '', multiSelect: false, options: [{ label: 'A', description: '' }] }], agoMin: 5 } },
    d1: { status: 'working', activity: 'Read' },
  },
  planUsage: { claude: [{ type: 'five_hour', percent: 42, resetsInMin: 130 }], codex: [{ type: 'seven_day', percent: 35, resetsInMin: 60 }] },
  external: [{ sessionId: 's1', cwd: '/tmp/x', name: 'term', agoMin: 18 }],
}

function dir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'demolive-'))
  fs.writeFileSync(path.join(d, DEMO_LIVE_FILE), JSON.stringify(file))
  return d
}

test('환경 변수가 없으면 파일이 있어도 읽지 않는다', () => {
  assert.equal(loadDemoLive(dir(), {}), null)
})

test('파일이 없으면 null', () => {
  assert.equal(loadDemoLive(fs.mkdtempSync(path.join(os.tmpdir(), 'demolive-')), { [DEMO_ENV]: '1' }), null)
})

test('켜면 시각을 지금 기준으로 바꾸고, 질문이 아닌 결재엔 항상 승인 규칙을 붙인다', () => {
  const now = 1_000_000_000
  const d = loadDemoLive(dir(), { [DEMO_ENV]: '1' }, now)!
  const bash = d.staff.get('d6')!.approvals[0]
  assert.equal(bash.createdAt, now - 2 * 60_000)
  assert.ok(bash.alwaysRule)
  const q = d.staff.get('d4')!.approvals[0]
  assert.equal(q.alwaysRule, undefined)
  assert.equal(q.questions?.length, 1)
  assert.deepEqual(d.staff.get('d1')!.approvals, [])
  assert.equal(d.planUsage[0].resetsAt, now + 130 * 60_000)
  assert.equal(d.codexUsage[0].type, 'seven_day')
  assert.equal(d.external[0].startedAt, now - 18 * 60_000)
})

test('demoProviders: 데모일 때만 Claude·Codex 모두 준비됨 (고용 창의 GPT·베타가 보이게)', () => {
  assert.equal(demoProviders({}), null)
  const p = demoProviders({ [DEMO_ENV]: '1' })!
  assert.equal(p.claude.state, 'ready')
  assert.equal(p.codex.state, 'ready')
  assert.equal(p.codex.defaultModel, p.codex.models[0])
  assert.equal(p.codex.account, 'you@example.com')
})
