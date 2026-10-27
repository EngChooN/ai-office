// 공급자 감지: 응답 해석(미설치·로그아웃·준비됨 + 플랜)과 stdio 연결을 가짜 app-server로 확인한다.
// 실제 번들 실행은 AI_OFFICE_CODEX_BIN 에 codex-app-server 경로를 주면 같이 확인한다.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { classifyClaude, classifyCodex, isRunFailure, keepPrevOnUnknown, probeCodex } from '../src/main/ai/providerStatus.ts'

test('Claude: 실행 파일 없음 / 로그아웃 / 준비됨(플랜 포함)', () => {
  assert.equal(classifyClaude(false, null).state, 'missing')
  assert.equal(classifyClaude(true, { loggedIn: false }).state, 'loggedOut')
  assert.equal(classifyClaude(true, null, 'boom').error, 'boom')
  const ok = classifyClaude(true, { loggedIn: true, email: 'a@b.c', authMethod: 'claude.ai', subscriptionType: 'max' })
  assert.deepEqual([ok.state, ok.account, ok.authMethod, ok.plan], ['ready', 'a@b.c', 'claude.ai', 'max'])
})

test('Claude: 실행 실패는 broken, 실행 파일이 없으면 broken보다 missing이 먼저', () => {
  const b = classifyClaude(true, null, 'spawn EBADARCH', true)
  assert.deepEqual([b.state, b.error], ['broken', 'spawn EBADARCH'])
  assert.equal(classifyClaude(false, null, 'x', true).state, 'missing')
  assert.equal(classifyClaude(true, null, 'exit 1', false).state, 'loggedOut')
})

test('isRunFailure: 못 띄움·시간 초과·해석 불가는 실패, 숫자 종료 코드는 아니다', () => {
  assert.equal(isRunFailure(Object.assign(new Error('x'), { code: 'EBADARCH' })), true)
  assert.equal(isRunFailure(Object.assign(new Error('x'), { code: 'ENOENT' })), true)
  assert.equal(isRunFailure(Object.assign(new Error('x'), { killed: true, signal: 'SIGTERM', code: null })), true)
  assert.equal(isRunFailure(new SyntaxError('Unexpected token')), true)
  assert.equal(isRunFailure(Object.assign(new Error('x'), { code: 1 })), false)
})

test('Codex: 계정 없음은 로그아웃, ChatGPT 로그인은 플랜·모델과 함께 준비됨', () => {
  assert.equal(classifyCodex({ account: null, requiresOpenaiAuth: true }, { data: [] }).state, 'loggedOut')
  assert.equal(classifyCodex(null, null).state, 'loggedOut')
  const s = classifyCodex(
    { account: { type: 'chatgpt', email: 'x@y.z', planType: 'free' } },
    { data: [{ id: 'a', model: 'gpt-a' }, { id: 'h', model: 'gpt-hidden', hidden: true }, { id: 'b', model: 'gpt-b', isDefault: true }] },
  )
  assert.deepEqual([s.state, s.plan, s.authMethod, s.account], ['ready', 'free', 'chatgpt', 'x@y.z'])
  assert.deepEqual(s.models, ['gpt-a', 'gpt-b'])
  assert.equal(s.defaultModel, 'gpt-b')
  // API 키 로그인은 이메일·플랜이 없다
  const k = classifyCodex({ account: { type: 'apiKey' } }, { data: [] })
  assert.deepEqual([k.state, k.plan, k.account, k.defaultModel], ['ready', '', '', ''])
})

/** 가짜 app-server: JSON-RPC 줄을 읽고 정해진 응답을 돌려주는 node 스크립트 */
function fakeServer(account: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'co-codex-'))
  const file = path.join(dir, 'codex-app-server')
  const body = `#!${process.execPath}
const rl = require('readline').createInterface({ input: process.stdin })
const results = { initialize: {}, 'account/read': ${JSON.stringify(account)}, 'model/list': { data: [{ id: 'm1', model: 'm1', isDefault: true }] } }
rl.on('line', (l) => { const m = JSON.parse(l); if (m.id !== undefined) console.log(JSON.stringify({ id: m.id, result: results[m.method] ?? null })) })
`
  fs.writeFileSync(file, body, { mode: 0o755 })
  return file
}

test('probeCodex: 없는 경로는 missing', async () => {
  assert.equal((await probeCodex('/no/such/codex-app-server')).state, 'missing')
})

test('probeCodex: 가짜 서버로 로그아웃·준비됨 판별', { skip: process.platform === 'win32' }, async () => {
  const out = await probeCodex(fakeServer({ account: null, requiresOpenaiAuth: true }))
  assert.equal(out.state, 'loggedOut')
  const ready = await probeCodex(fakeServer({ account: { type: 'chatgpt', email: 'e@x', planType: 'plus' }, requiresOpenaiAuth: true }))
  assert.deepEqual([ready.state, ready.plan, ready.defaultModel], ['ready', 'plus', 'm1'])
})

test('probeCodex: 응답 없는 서버는 시간 초과 → broken이 아니라 unknown(확인 못 함)', { skip: process.platform === 'win32' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'co-codex-'))
  const file = path.join(dir, 'codex-app-server')
  fs.writeFileSync(file, `#!${process.execPath}\nsetTimeout(() => {}, 60000)\n`, { mode: 0o755 })
  const s = await probeCodex(file, 300)
  assert.equal(s.state, 'unknown')
  assert.match(s.error, /시간 초과/)
})

test('keepPrevOnUnknown: 시간 초과면 직전 상태 유지, 직전이 없으면 unknown, 실행 오류(broken)는 그대로 반영', () => {
  const ready = classifyCodex({ account: { type: 'chatgpt', email: 'e@x', planType: 'plus' } }, { data: [{ id: 'm1', isDefault: true }] })
  const timeout = { ...ready, state: 'unknown' as const, account: '', plan: '', models: [], defaultModel: '', error: 'Codex 응답 시간 초과' }
  const broken = { ...timeout, state: 'broken' as const, error: 'spawn EACCES' }
  assert.deepEqual(keepPrevOnUnknown(ready, timeout), ready)
  assert.equal(keepPrevOnUnknown(classifyCodex({ account: null }, null), timeout).state, 'loggedOut')
  assert.equal(keepPrevOnUnknown(null, timeout).state, 'unknown')
  assert.equal(keepPrevOnUnknown(undefined, timeout).state, 'unknown')
  assert.equal(keepPrevOnUnknown(ready, broken).state, 'broken')
})

test('probeCodex: 실행 파일이 있어도 못 띄우거나 바로 죽으면 broken', { skip: process.platform === 'win32' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'co-codex-'))
  const bad = path.join(dir, 'codex-app-server')
  fs.writeFileSync(bad, 'not executable', { mode: 0o644 }) // EACCES
  assert.equal((await probeCodex(bad)).state, 'broken')
  const dying = path.join(dir, 'dying')
  fs.writeFileSync(dying, `#!${process.execPath}\nprocess.exit(1)\n`, { mode: 0o755 })
  assert.equal((await probeCodex(dying)).state, 'broken')
})

test('probeCodex: 실제 번들 (AI_OFFICE_CODEX_BIN 지정 시)', { skip: !process.env.AI_OFFICE_CODEX_BIN }, async () => {
  const s = await probeCodex(process.env.AI_OFFICE_CODEX_BIN as string)
  console.log(JSON.stringify(s))
  assert.ok(['loggedOut', 'ready'].includes(s.state))
})
