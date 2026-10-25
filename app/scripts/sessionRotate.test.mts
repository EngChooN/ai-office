import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { contextOf, CONTEXT_ROTATE_TOKENS, findSessionFile, handoffText, readSessionTail } from '../src/main/sessionRotate.ts'

test('문맥 크기는 입력 + 캐시 읽기 + 캐시 만들기', () => {
  assert.equal(contextOf({ input_tokens: 10, cache_read_input_tokens: 500_000, cache_creation_input_tokens: 90 }), 500_100)
  assert.equal(contextOf({ input_tokens: 5, cache_read_input_tokens: null }), 5)
  assert.equal(contextOf(undefined), 0)
  assert.ok(CONTEXT_ROTATE_TOKENS < 200_000)
})

test('세션 기록 끝부분에서 마지막 문맥 크기와 마지막 답을 읽는다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotate-'))
  const proj = path.join(dir, '-Users-x-proj')
  fs.mkdirSync(proj)
  const file = path.join(proj, 'abc.jsonl')
  const line = (ctx: number, text: string) => JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 1, cache_read_input_tokens: ctx - 1 }, content: [{ type: 'text', text }] } })
  fs.writeFileSync(
    file,
    [
      '{"type":"user"}',
      line(100_000, '첫 답'),
      line(420_000, '마지막 보고'),
      JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 1, cache_read_input_tokens: 430_000 }, content: [{ type: 'tool_use' }] } }),
    ].join('\n'),
  )
  assert.equal(findSessionFile(dir, 'abc'), file)
  assert.equal(findSessionFile(dir, 'none'), null)
  assert.deepEqual(readSessionTail(file), { contextTokens: 430_001, lastText: '마지막 보고' })
  fs.rmSync(dir, { recursive: true })
})

test('인수인계 글에 직전 보고(길면 끝부분)와 이번 지시가 들어간다', () => {
  const t = handoffText('보고 내용', '새 지시')
  assert.match(t, /인수인계/)
  assert.match(t, /보고 내용/)
  assert.ok(t.endsWith('새 지시'))
  const long = handoffText('가'.repeat(10_000) + '끝', '지시')
  assert.ok(long.includes('끝') && long.length < 5000)
  assert.ok(!handoffText('', '지시').includes('마지막 보고'))
})
