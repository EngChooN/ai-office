// Claude 로그인 오류 상태가 세션을 넘어 남지 않는가 (#20, 한리뷰 R2)
// 실제 ClaudeRuntime.close·translate를 탄다. SDK 세션은 띄우지 않고 메시지를 translate로 직접 넣는다 (start도 상태를 새로 만들지만 SDK를 띄워 여기선 못 탄다)
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'
import type { RuntimeEvent } from '../src/main/ai/types.ts'

const g = globalThis as unknown as { __electron: unknown }
g.__electron = { app: { getPath: () => '/tmp', getVersion: () => '0.0.0', getLocale: () => 'ko', getAppPath: () => process.cwd(), isPackaged: false, on() {} } }
register('./officeLoaderHooks.mjs', import.meta.url)
const { ClaudeRuntime } = await import('../src/main/ai/claude.ts')
const { t } = await import('../src/shared/i18n/index.ts')

function runtime() {
  const events: RuntimeEvent[] = []
  const rt = new ClaudeRuntime((e) => events.push(e))
  const sdkMsg = (m: Record<string, unknown>) => (rt as unknown as { translate(m: unknown): void }).translate(m)
  const results = () => events.filter((e) => e.type === 'result')
  return { rt, sdkMsg, results }
}
const AUTH_FAIL = { type: 'assistant', error: 'authentication_failed', message: { content: [{ type: 'text', text: 'Login expired · Please run /login' }] } }
const result = (text: string, isError: boolean) => ({ type: 'result', subtype: 'success', is_error: isError, result: text, num_turns: 1, total_cost_usd: 0, modelUsage: {} })

test('로그인 오류를 받은 턴은 결과 글이 낯선 문구여도 실패로, 안내 글로 바꾼다', () => {
  const { rt, sdkMsg, results } = runtime()
  sdkMsg(AUTH_FAIL)
  sdkMsg(result('Some new auth wording', true))
  assert.equal(results()[0]?.type === 'result' && results()[0].ok, false)
  assert.equal((results()[0] as { text: string }).text, t('claude.loginNeeded.staff'))
  // 같은 세션 다음 턴은 정상
  sdkMsg(result('다 했습니다', false))
  assert.equal((results()[1] as { ok: boolean }).ok, true)
})

test('결과 전에 닫힌 세션의 로그인 오류가 재시작한 세션의 정상 결과를 실패로 만들지 않는다', () => {
  const { rt, sdkMsg, results } = runtime()
  sdkMsg(AUTH_FAIL)
  rt.close() // 결과가 오기 전에 세션 종료 → 같은 직원 재시작
  sdkMsg(result('다 했습니다', false))
  assert.equal(results().length, 1)
  assert.equal((results()[0] as { ok: boolean; text: string }).ok, true)
  assert.equal((results()[0] as { text: string }).text, '다 했습니다')
})
