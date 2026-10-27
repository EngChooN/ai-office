// Codex 토큰 → 추정 비용. app-server는 금액을 주지 않으므로 모델별 API 단가(USD / 100만 토큰)로 환산한다.
// 구독(ChatGPT 플랜) 로그인은 실제 과금이 아니라 "API 단가로 환산한 추정치"다 (급여 명세서에 그렇게 표시).
// 값은 공개 단가 기준 추정이며, 표에 없는 새 모델은 중간 단가(FALLBACK)로 센다 — 새 모델이 나와도 앱이 깨지지 않게.

export interface CodexUsage {
  inputTokens: number
  cachedInputTokens: number
  cacheWriteInputTokens: number
  outputTokens: number
}

interface Price {
  input: number
  cachedInput: number
  output: number
}

const PRICES: Record<string, Price> = {
  'gpt-6-luna': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-5.6-luna': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-5.6-terra': { input: 1.25, cachedInput: 0.125, output: 10 },
}
const FALLBACK: Price = { input: 1.25, cachedInput: 0.125, output: 10 }

export const priceFor = (model: string | undefined): Price => (model && PRICES[model]) || FALLBACK

/** inputTokens에는 캐시 읽기·쓰기가 포함돼 있다(input_tokens_details) — 읽기는 싼 단가, 쓰기는 입력 단가로 따로 센다 */
export function codexCostUsd(model: string | undefined, u: CodexUsage) {
  const p = priceFor(model)
  const cached = Math.min(u.cachedInputTokens, u.inputTokens)
  const written = Math.min(u.cacheWriteInputTokens, u.inputTokens - cached)
  const fresh = Math.max(0, u.inputTokens - cached - written)
  return ((fresh + written) * p.input + cached * p.cachedInput + u.outputTokens * p.output) / 1_000_000
}
