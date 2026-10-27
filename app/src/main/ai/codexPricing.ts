// Codex 토큰 → 추정 비용. app-server는 금액을 주지 않으므로 모델별 API 단가(USD / 100만 토큰)로 환산한다.
// 구독(ChatGPT 플랜) 로그인은 실제 과금이 아니라 "API 단가로 환산한 추정치"다 (급여 명세서에 그렇게 표시).
// 값은 아래 표의 공식 단가이며, 표에 없는 새 모델은 중간 단가(FALLBACK)로 센다 — 새 모델이 나와도 앱이 깨지지 않게.

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

// 단가표 — 2026-10-27 확인. 출처: https://developers.openai.com/api/docs/models/<모델>.md (OpenAI 모델 페이지)
// 캐시 쓰기는 입력 단가의 1.25배(gpt-5.6 페이지 명시). 272K 토큰 초과 프롬프트의 장문 단가(입력 2배·출력 1.5배)는 반영하지 않는다.
const PRICES: Record<string, Price> = {
  'gpt-6-luna': { input: 0.1, cachedInput: 0.01, output: 0.5 }, // 공식 확인(캐시 쓰기 배율은 페이지에 없어 1.25배로 가정)
  'gpt-5.6-luna': { input: 0.2, cachedInput: 0.02, output: 1.2 }, // 공식 확인
  'gpt-5.6-terra': { input: 2, cachedInput: 0.2, output: 12 }, // 공식 확인
}
const CACHE_WRITE_RATE = 1.25
// 표에 없는 모델(추정): gpt-5.6-terra보다 낮지 않게 잡는다
const FALLBACK: Price = { input: 2, cachedInput: 0.2, output: 12 }

export const priceFor = (model: string | undefined): Price => (model && PRICES[model]) || FALLBACK

/** inputTokens에는 캐시 읽기·쓰기가 포함돼 있다(input_tokens_details) — 읽기는 싼 단가, 쓰기는 입력 단가의 1.25배로 따로 센다 */
export function codexCostUsd(model: string | undefined, u: CodexUsage) {
  const p = priceFor(model)
  const cached = Math.min(u.cachedInputTokens, u.inputTokens)
  const written = Math.min(u.cacheWriteInputTokens, u.inputTokens - cached)
  const fresh = Math.max(0, u.inputTokens - cached - written)
  return (fresh * p.input + written * p.input * CACHE_WRITE_RATE + cached * p.cachedInput + u.outputTokens * p.output) / 1_000_000
}
