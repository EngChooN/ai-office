// 앱 밖 직원 알림 hook 명령 맥·윈도우 번갈아 가정 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ASK_COMMAND, HOOK_COMMAND, HIRED_ENV, askCommand, hookCommand } from '../src/main/externalCommands.ts'
import { HOOK_PORT } from '../src/shared/types.ts'

const HOOK_MARKER = `127.0.0.1:${HOOK_PORT}/hook`
const ASK_MARKER = `127.0.0.1:${HOOK_PORT}/ask`

test('맥·리눅스 명령은 기존 문자열과 한 글자도 다르지 않다', () => {
  const hook = `curl -s -m 1 -X POST -H 'content-type: application/json' --data-binary @- http://${HOOK_MARKER} >/dev/null 2>&1 || true`
  const ask = `[ -n "$${HIRED_ENV}" ] || [ "$CLAUDE_CODE_ENTRYPOINT" = "claude-desktop" ] || curl -s -m 590 -X POST -H 'content-type: application/json' --data-binary @- http://${ASK_MARKER} 2>/dev/null || true`
  for (const platform of ['darwin', 'linux'] as const) {
    assert.equal(hookCommand(platform), hook)
    assert.equal(askCommand(platform), ask)
  }
  assert.equal(HOOK_COMMAND, hook)
  assert.equal(ASK_COMMAND, ask)
})

test('윈도우 명령은 curl.exe를 쓰고 마커·건너뛰기 조건·타임아웃을 그대로 가진다', () => {
  const hook = hookCommand('win32')
  const ask = askCommand('win32')
  assert.match(hook, /^curl\.exe -s -m 1 /)
  assert.ok(hook.includes(HOOK_MARKER))
  assert.ok(ask.includes(ASK_MARKER))
  assert.ok(ask.includes(`[ -n "$${HIRED_ENV}" ]`))
  assert.ok(ask.includes('"$CLAUDE_CODE_ENTRYPOINT" = "claude-desktop"'))
  assert.ok(ask.includes('|| curl.exe -s -m 590 '))
  for (const c of [hook, ask]) assert.doesNotMatch(c, /(^|[\s|])curl /) // PowerShell 별칭 curl이 남지 않는다
})

test('윈도우 명령에서 curl.exe 말고는 맥 명령과 같다 (셸 문법은 Git Bash 호환)', () => {
  assert.equal(hookCommand('win32').replace('curl.exe ', 'curl '), hookCommand('darwin'))
  assert.equal(askCommand('win32').replace('curl.exe ', 'curl '), askCommand('darwin'))
})

test('플랫폼을 안 주면 지금 OS 기준', () => {
  assert.equal(hookCommand(), hookCommand(process.platform))
  assert.equal(askCommand(), askCommand(process.platform))
})
