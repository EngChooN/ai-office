// 결재 카드 "AI 추정" 호출 줄 세우기: 동시 2건·대기 5건·같은 명령 합치기·메모리 캐시·시간 초과 (연결은 office.ts, 시험은 가짜 ask로)
// 결재 표시를 막지 않는다 — 실패·시간 초과·모양이 틀린 답은 조용히 null

import { aiGuessKey, aiGuessPrompt, parseAiGuess, type AiGuess } from '../shared/approvalAiGuess.ts'
import type { Lang } from '../shared/i18n/index.ts'

export const AI_GUESS_TIMEOUT_MS = 8000
const CONCURRENCY = 2
const QUEUE_MAX = 5
const CACHE_MAX = 200
/** 실패한 명령은 이 시간 동안 다시 묻지 않는다 */
const RETRY_AFTER_MS = 60_000

export type AskFn = (opts: { system: string; prompt: string; abortController: AbortController }) => Promise<{ text: string; costUsd: number; tokensIn: number; tokensOut: number }>
type Usage = { costUsd: number; tokensIn: number; tokensOut: number }

export function createApprovalEffectAi(deps: { ask: AskFn; now?: () => number; timeoutMs?: number; isPaused?: () => boolean }) {
  const now = deps.now ?? Date.now
  const timeoutMs = deps.timeoutMs ?? AI_GUESS_TIMEOUT_MS
  const cache = new Map<string, AiGuess>()
  const failedAt = new Map<string, number>()
  const inflight = new Map<string, Promise<AiGuess | null>>()
  const waiting: (() => void)[] = []
  let running = 0

  const remember = (key: string, g: AiGuess) => {
    cache.delete(key)
    cache.set(key, g)
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  }

  async function call(key: string, command: string, lang: Lang, onUsage: (u: Usage) => void): Promise<AiGuess | null> {
    if (running >= CONCURRENCY) {
      if (waiting.length >= QUEUE_MAX) return null
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    running++
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
      const { system, prompt } = aiGuessPrompt(command, lang)
      const r = await Promise.race([
        deps.ask({ system, prompt, abortController: ac }),
        new Promise<never>((_, reject) => ac.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })),
      ])
      onUsage(r)
      const g = parseAiGuess(r.text)
      if (g) remember(key, g)
      else failedAt.set(key, now())
      return g
    } catch {
      failedAt.set(key, now())
      return null
    } finally {
      clearTimeout(timer)
      running--
      waiting.shift()?.()
    }
  }

  return {
    /** 비밀을 가린 명령의 추정. 캐시·진행 중 요청을 먼저 쓰고, onUsage는 실제로 부른 쪽에서만 불린다 */
    request(command: string, lang: Lang, onUsage: (u: Usage) => void): Promise<AiGuess | null> {
      const key = aiGuessKey(lang, command)
      const hit = cache.get(key)
      if (hit) {
        remember(key, hit)
        return Promise.resolve(hit)
      }
      const failed = failedAt.get(key)
      if ((failed !== undefined && now() - failed < RETRY_AFTER_MS) || deps.isPaused?.()) return Promise.resolve(null)
      const same = inflight.get(key)
      if (same) return same
      const p = call(key, command, lang, onUsage).finally(() => inflight.delete(key))
      inflight.set(key, p)
      return p
    },
  }
}
