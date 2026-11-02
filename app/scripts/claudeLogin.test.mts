// Claude 로그인: CLI 출력에서 로그인 주소 찾기 + 가짜 CLI로 브라우저 열기·폴백(주소 없음·먼저 종료·실행 실패) — npm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { CLAUDE_LOGIN_ARGS, extractLoginUrl, loginClaudeInBrowser } from '../src/main/ai/claudeLogin.ts'

const AUTH_URL = 'https://claude.ai/oauth/authorize?code=true&client_id=abc&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A54545%2Fcallback&state=xyz'

test('로그인 주소 찾기: 안내 문장·글자 색 코드 사이에서 인증 주소만', () => {
  assert.equal(extractLoginUrl(`Opening browser to sign in…\nBrowser didn't open? Use the url below to sign in \n\n${AUTH_URL}\n`), AUTH_URL)
  assert.equal(extractLoginUrl(`\u001b[2m\u001b[36m${AUTH_URL}\u001b[39m\u001b[22m`), AUTH_URL)
  // 문장 끝 마침표·괄호는 주소가 아니다
  assert.equal(extractLoginUrl(`(visit ${AUTH_URL}).`), AUTH_URL)
  assert.equal(extractLoginUrl('https://console.anthropic.com/oauth/authorize?x=1'), 'https://console.anthropic.com/oauth/authorize?x=1')
})

test('로그인 주소 찾기: 인증 주소가 아니거나 다른 사이트면 무시한다', () => {
  assert.equal(extractLoginUrl(''), null)
  assert.equal(extractLoginUrl('Paste code here if prompted >'), null)
  assert.equal(extractLoginUrl('Docs: https://docs.claude.com/en/docs/claude-code/setup'), null, '안내 문서 주소')
  assert.equal(extractLoginUrl('https://evil.example/oauth/authorize?x=1'), null, '다른 사이트')
  assert.equal(extractLoginUrl('https://claude.ai.evil.example/oauth/authorize'), null, '비슷한 이름의 다른 사이트')
  // 같은 출력에 여러 주소가 있으면 인증 주소를 고른다
  assert.equal(extractLoginUrl(`See https://docs.claude.com/x then ${AUTH_URL}`), AUTH_URL)
})

test('로그인 명령: 구독 계정 플래그로 계정 종류 메뉴를 건너뛴다', () => {
  assert.deepEqual(CLAUDE_LOGIN_ARGS, ['auth', 'login', '--claudeai'])
})

/** 가짜 claude: script를 node로 돌리는 실행 파일 */
function fakeCli(script: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'co-claude-login-'))
  const file = path.join(dir, 'claude')
  fs.writeFileSync(file, `#!${process.execPath}\n${script}\n`, { mode: 0o755 })
  return file
}

test('브라우저 로그인: 출력에 주소가 나오면 그 주소를 열고 browser', { skip: process.platform === 'win32' }, async () => {
  const opened: string[] = []
  const bin = fakeCli(`process.stdout.write('Browser didn\\'t open? Visit:\\n${AUTH_URL}\\n'); setTimeout(() => {}, 2000)`)
  const result = await loginClaudeInBrowser(bin, (url) => void opened.push(url), { args: [], urlWaitMs: 3000, totalMs: 500 })
  assert.equal(result, 'browser')
  assert.deepEqual(opened, [AUTH_URL])
})

test('브라우저 로그인: 시간 안에 주소가 없으면 fallback (터미널 방식으로)', { skip: process.platform === 'win32' }, async () => {
  const opened: string[] = []
  const bin = fakeCli(`process.stdout.write('Select login method:\\n'); setTimeout(() => {}, 5000)`)
  const at = Date.now()
  assert.equal(await loginClaudeInBrowser(bin, (url) => void opened.push(url), { args: [], urlWaitMs: 200 }), 'fallback')
  assert.ok(Date.now() - at < 3000, '프로세스 종료를 기다리지 않는다')
  assert.deepEqual(opened, [])
})

test('브라우저 로그인: 주소 없이 먼저 끝나거나 실행 파일이 없으면 바로 fallback', { skip: process.platform === 'win32' }, async () => {
  const bin = fakeCli(`process.stderr.write('Raw mode is not supported\\n'); process.exit(1)`)
  assert.equal(await loginClaudeInBrowser(bin, () => {}, { args: [], urlWaitMs: 5000 }), 'fallback')
  assert.equal(await loginClaudeInBrowser(path.join(os.tmpdir(), 'no-such-claude-bin'), () => {}, { args: [], urlWaitMs: 5000 }), 'fallback')
})
