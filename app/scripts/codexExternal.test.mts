import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { readExternalSession } from '../src/main/ai/codexExternal.ts'

const line = (type: string, payload: object) => JSON.stringify({ timestamp: new Date().toISOString(), type, payload })
const meta = (originator: string) => line('session_meta', { id: 'tid-1', cwd: '/tmp/x', originator, timestamp: new Date().toISOString(), instructions: 'x'.repeat(18_000) })
const big = () => line('response_item', { type: 'custom_tool_call_output', output: 'y'.repeat(200_000) })

function write(lines: string[]) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cxext-')), 'rollout-a.jsonl')
  fs.writeFileSync(f, lines.join('\n') + '\n')
  return f
}

test('exec 세션: 턴이 도는 중이면 일하는 중, 끝나면 대기', () => {
  const running = write([meta('codex_exec'), line('event_msg', { type: 'task_started' })])
  assert.equal(readExternalSession(running, Date.now())?.status, 'working')
  const done = write([meta('codex_exec'), line('event_msg', { type: 'task_started' }), line('event_msg', { type: 'task_complete' })])
  assert.equal(readExternalSession(done, Date.now())?.status, 'idle')
})

test('도구 출력이 커서 턴 시작 줄이 끝부분 밖이어도 일하는 중', () => {
  const f = write([meta('codex_exec'), line('event_msg', { type: 'task_started' }), big(), big()])
  assert.equal(readExternalSession(f, Date.now())?.status, 'working')
})

test('90초 넘게 기록이 없으면 대기, 앱이 연 세션은 제외', () => {
  const f = write([meta('codex_exec'), line('event_msg', { type: 'task_started' })])
  assert.equal(readExternalSession(f, Date.now() + 120_000)?.status, 'idle')
  assert.equal(readExternalSession(write([meta('ai-office')]), Date.now()), null)
})
