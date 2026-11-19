// 외부 세션 확인(2초마다): 목록이 그대로면 현황을 다시 보내지 않고, 바뀌면 보낸다

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
const db = await import('../src/main/db.ts')
const { startLocalMcp, stopLocalMcp } = await import('../src/main/mcp/localMcp.ts')

await startLocalMcp()
after(() => {
  stopLocalMcp()
  db.closeDb()
  fs.rmSync(root, { recursive: true, force: true })
})


type Watcher = { poll(): void; setDemoSessions(list: { sessionId: string; cwd: string; name: string; startedAt: number }[]): void }
let office: InstanceType<typeof Office>
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeEach(() => {
  db.closeDb()
  userData = fs.mkdtempSync(path.join(root, 'ud-'))
  db.openDb()
  office = new Office({ isNetBack: async () => true })
  office.start()
})
afterEach(() => {
  office.stop()
})

test('외부 세션 목록이 그대로면 확인을 여러 번 해도 현황을 다시 보내지 않는다', async () => {
  const watcher = (office as unknown as { watcher: Watcher }).watcher
  await sleep(120) // 시작 때 나가는 현황을 먼저 보낸다
  let snapshots = 0
  office.on('snapshot', () => snapshots++)
  for (let i = 0; i < 10; i++) {
    watcher.poll()
    await sleep(70)
  }
  assert.equal(snapshots, 0)
})

test('외부 세션이 생기면 현황을 보낸다', async () => {
  await sleep(120)
  let snapshots = 0
  office.on('snapshot', () => snapshots++)
  const watcher = (office as unknown as { watcher: Watcher }).watcher
  watcher.setDemoSessions([{ sessionId: 'demo-1', cwd: '/tmp/demo', name: 'demo', startedAt: 1 }])
  await sleep(120)
  assert.ok(snapshots >= 1)
})
