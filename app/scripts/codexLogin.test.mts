// Codex 로그인: 가짜 app-server로 성공·실패·URL 열기 실패·취소 흐름을 확인한다.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { cancelCodexLogin, loginCodex } from '../src/main/ai/codexLogin.ts'

/** completed: 로그인 시작 뒤 보낼 알림 (null이면 보내지 않고 대기) */
function fakeServer(completed: object | null, method = 'account/login/completed'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'co-login-'))
  const file = path.join(dir, 'codex-app-server')
  fs.writeFileSync(
    file,
    `#!${process.execPath}
const rl = require('readline').createInterface({ input: process.stdin })
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
rl.on('line', (l) => {
  const m = JSON.parse(l)
  if (m.method === 'initialize') out({ id: m.id, result: {} })
  if (m.method === 'account/login/start') {
    out({ id: m.id, result: { type: 'chatgpt', loginId: 'L1', authUrl: 'https://auth.example/x' } })
    ${completed ? `setTimeout(() => out({ method: '${method}', params: ${JSON.stringify(completed)} }), 20)` : ''}
  }
})
`,
    { mode: 0o755 },
  )
  return file
}

test('성공: 주소를 열고 완료 알림을 받으면 빈 문자열', async () => {
  const opened: string[] = []
  const r = await loginCodex(fakeServer({ loginId: 'L1', success: true, error: null }), (u) => void opened.push(u), 5000)
  assert.equal(r, '')
  assert.deepEqual(opened, ['https://auth.example/x'])
})

test('성공: 계정 변경 알림(account/updated)만 와도 끝난다', async () => {
  assert.equal(await loginCodex(fakeServer({ authMode: 'chatgpt', planType: 'free' }, 'account/updated'), () => {}, 5000), '')
})

test('실패: 완료 알림의 오류 사유를 돌려준다', async () => {
  assert.equal(await loginCodex(fakeServer({ loginId: 'L1', success: false, error: 'denied' }), () => {}, 5000), 'denied')
})

test('브라우저를 못 열면 사유를 돌려준다', async () => {
  const r = await loginCodex(fakeServer(null), () => Promise.reject(new Error('no browser')), 5000)
  assert.equal(r, 'no browser')
})

test('시간 초과와 취소', async () => {
  assert.match(await loginCodex(fakeServer(null), () => {}, 200), /초과/)
  const p = loginCodex(fakeServer(null), () => {}, 5000)
  setTimeout(cancelCodexLogin, 200)
  assert.match(await p, /취소/)
})

test('실행 파일이 없으면 바로 실패', async () => {
  assert.match(await loginCodex('/no/such/bin', () => {}), /찾지 못/)
})
