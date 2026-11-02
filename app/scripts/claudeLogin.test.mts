// Claude 로그인: CLI 출력에서 로그인 주소 찾기 + 가짜 CLI로 브라우저 열기·폴백(주소 없음·먼저 종료·실행 실패·열기 실패)·조각난 출력·취소 — npm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { CLAUDE_LOGIN_ARGS, cancelClaudeLogin, extractLoginUrl, isCompleteOAuthUrl, loginClaudeInBrowser } from '../src/main/ai/claudeLogin.ts'

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

test('로그인 주소 찾기: 끝까지 들어온 주소만 고를 때는 뒤에 공백·줄바꿈이 와야 한다', () => {
  const [head] = AUTH_URL.split('?')
  assert.equal(extractLoginUrl(head, { isCompleteOnly: true }), null, '쿼리가 아직 안 들어온 앞 조각')
  assert.equal(extractLoginUrl(AUTH_URL, { isCompleteOnly: true }), null, '출력 끝에서 끊긴 주소')
  assert.equal(extractLoginUrl(`${AUTH_URL}\n`, { isCompleteOnly: true }), AUTH_URL)
  assert.equal(extractLoginUrl(`\u001b[36m${AUTH_URL}\u001b[39m`, { isCompleteOnly: true }), null, '색 코드만 오고 줄바꿈 전')
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
  const result = await loginClaudeInBrowser(bin, (url) => void opened.push(url), { args: [], urlWaitMs: 3000, totalMs: 2500 })
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

test('브라우저 로그인: 주소가 경로·쿼리로 나뉘어 들어와도 끝까지 모은 주소를 연다', { skip: process.platform === 'win32' }, async () => {
  const opened: string[] = []
  const [head, query] = AUTH_URL.split('?')
  const bin = fakeCli(`process.stdout.write('Visit:\\n${head}'); setTimeout(() => process.stdout.write('?${query}\\n'), 150); setTimeout(() => {}, 2000)`)
  const result = await loginClaudeInBrowser(bin, (url) => void opened.push(url), { args: [], urlWaitMs: 3000, settleMs: 1000, totalMs: 1500 })
  assert.equal(result, 'browser')
  assert.deepEqual(opened, [AUTH_URL])
})

test('브라우저 로그인: 주소 뒤에 줄바꿈이 끝내 안 오면 잠깐 기다린 뒤 들어온 데까지로 연다', { skip: process.platform === 'win32' }, async () => {
  const opened: string[] = []
  const bin = fakeCli(`process.stdout.write('${AUTH_URL}'); setTimeout(() => {}, 2000)`)
  const result = await loginClaudeInBrowser(bin, (url) => void opened.push(url), { args: [], urlWaitMs: 3000, settleMs: 100, totalMs: 1500 })
  assert.equal(result, 'browser')
  assert.deepEqual(opened, [AUTH_URL])
})

test('브라우저 로그인: 쿼리가 기다리는 시간보다 늦게 와도 쿼리 없는 주소를 열지 않고 끝까지 기다린다', { skip: process.platform === 'win32' }, async () => {
  const opened: string[] = []
  const [head, query] = AUTH_URL.split('?')
  const bin = fakeCli(`process.stdout.write('${head}'); setTimeout(() => process.stdout.write('?${query}'), 500); setTimeout(() => {}, 2000)`)
  const result = await loginClaudeInBrowser(bin, (url) => void opened.push(url), { args: [], urlWaitMs: 3000, settleMs: 100, totalMs: 2500 })
  assert.equal(result, 'browser')
  assert.deepEqual(opened, [AUTH_URL])
})

test('브라우저 로그인: 필요한 값이 끝내 안 들어온 주소는 열지 않고 시간이 지나면 fallback', { skip: process.platform === 'win32' }, async () => {
  const opened: string[] = []
  const bin = fakeCli(`process.stdout.write('https://claude.ai/oauth/authorize?code=true&client_id=abc'); setTimeout(() => {}, 2000)`)
  const result = await loginClaudeInBrowser(bin, (url) => void opened.push(url), { args: [], urlWaitMs: 600, settleMs: 100 })
  assert.equal(result, 'fallback')
  assert.deepEqual(opened, [])
})

test('인증 주소 완성 판정: client_id·redirect_uri·state가 모두 있어야 한다', () => {
  assert.equal(isCompleteOAuthUrl(AUTH_URL), true)
  assert.equal(isCompleteOAuthUrl(AUTH_URL.split('?')[0]), false)
  assert.equal(isCompleteOAuthUrl('https://claude.ai/oauth/authorize?client_id=abc&redirect_uri=x&state='), false, '값이 빈 state')
})

test('브라우저 로그인: 브라우저 열기가 실패하면 프로세스를 끝내고 fallback', { skip: process.platform === 'win32' }, async () => {
  const marker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'co-claude-login-')), 'alive')
  // 살아 있는 동안 표시 파일을 계속 새로 쓴다 — 정리되면 더 쓰지 않는다
  const bin = fakeCli(`process.stdout.write('${AUTH_URL}\\n'); setInterval(() => require('fs').writeFileSync(${JSON.stringify(marker)}, String(Date.now())), 50)`)
  const result = await loginClaudeInBrowser(bin, () => Promise.reject(new Error('no browser')), { args: [], urlWaitMs: 3000, totalMs: 10_000 })
  assert.equal(result, 'fallback')
  await new Promise((r) => setTimeout(r, 300))
  const last = fs.existsSync(marker) ? Number(fs.readFileSync(marker, 'utf8')) : 0
  await new Promise((r) => setTimeout(r, 300))
  const after = fs.existsSync(marker) ? Number(fs.readFileSync(marker, 'utf8')) : 0
  assert.equal(after, last, '프로세스가 정리돼 더 이상 쓰지 않는다')
})

test('브라우저 로그인: 주소를 기다리는 중 취소(다시 누름·앱 종료)하면 cancelled — 터미널로 가지 않는다', { skip: process.platform === 'win32' }, async () => {
  const bin = fakeCli(`setTimeout(() => {}, 5000)`)
  const first = loginClaudeInBrowser(bin, () => {}, { args: [], urlWaitMs: 5000 })
  setTimeout(cancelClaudeLogin, 100)
  assert.equal(await first, 'cancelled')
  // 새 로그인을 시작해도 앞의 호출은 cancelled
  const second = loginClaudeInBrowser(bin, () => {}, { args: [], urlWaitMs: 5000 })
  const third = loginClaudeInBrowser(bin, () => {}, { args: [], urlWaitMs: 200 })
  assert.equal(await second, 'cancelled')
  assert.equal(await third, 'fallback')
})
