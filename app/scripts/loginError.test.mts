// Claude Code 로그인 안 됨 (#20): 오류 글 판정과, 비서가 다음 공급자로 넘어가는지
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isLoginError } from '../src/shared/loginError.ts'
import { FallbackBackend } from '../src/main/ai/fallback.ts'
import type { AiBackend, SecretaryEvent } from '../src/main/ai/types.ts'

// 실제 출력 (2026-11-22, 번들 claude를 로그인 정보 없는 설정 폴더로 돌려 확인)
const NOT_LOGGED_IN = 'Not logged in · Please run /login'

test('로그인 안 됨: error 칸 authentication_failed 또는 실제 결과 글을 잡는다', () => {
  assert.equal(isLoginError('authentication_failed', ''), true)
  assert.equal(isLoginError(undefined, NOT_LOGGED_IN), true)
  assert.equal(isLoginError(undefined, 'Invalid API key · Please run /login'), true)
  // 번들 claude에 있는 다른 로그인 문구 (한리뷰 R1)
  for (const text of ['Login expired · Please run /login', 'OAuth token revoked · Please run /login', 'API Error: 401 Invalid API key · Please run /login', 'Please run /login · API Error: 401']) {
    assert.equal(isLoginError(undefined, text), true, text)
  }
})

test('로그인 안 됨 아님: 다른 오류와 /login을 설명하는 보통 답은 그대로', () => {
  for (const text of ['API Error: 429 rate_limit_error', "Can't reach the API server (ENOTFOUND)", '터미널에서 claude를 실행하고 /login 하세요', 'If you see "Not logged in", run /login in a terminal.\nThen retry.', '']) {
    assert.equal(isLoginError(undefined, text), false, text)
  }
  assert.equal(isLoginError('rate_limit', NOT_LOGGED_IN.replace('/login', '')), false)
})

const fake = (events: SecretaryEvent[]): AiBackend => ({
  provider: 'claude',
  ask: async () => ({ text: '', costUsd: 0, tokensIn: 0, tokensOut: 0 }),
  secretary: () => ({
    events: (async function* () {
      yield* events
    })(),
    close: () => {},
  }),
})
const result: SecretaryEvent = { type: 'result', subtype: 'success', costUsd: 0, tokensIn: 0, tokensOut: 0 }
const collect = async (b: FallbackBackend) => {
  const out: SecretaryEvent[] = []
  for await (const e of b.secretary({} as never).events) out.push(e)
  return out
}

test('비서: Claude 로그인 안 됨이면 Codex로 넘어가고, 다른 공급자가 없으면 로그인 안내를 그대로 넘긴다', async () => {
  const claude = fake([{ type: 'loginNeeded' }, result])
  const codex = fake([{ type: 'text', text: '안녕하세요' }, result])
  const both = new FallbackBackend(() => ['claude', 'codex'], (p) => (p === 'claude' ? claude : codex))
  assert.deepEqual(await collect(both), [{ type: 'text', text: '안녕하세요' }, result])
  const only = new FallbackBackend(() => ['claude'], () => claude)
  assert.deepEqual(await collect(only), [{ type: 'loginNeeded' }, result])
})
