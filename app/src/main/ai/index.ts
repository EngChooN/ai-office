import type { AiProvider } from '../../shared/types'
import { CodexRuntime } from './codex'
import { ClaudeBackend, ClaudeRuntime, claudeModelId } from './claude'
import type { AgentRuntime, AiBackend, AskOptions, RuntimeEvent } from './types'

export type * from './types'

/** 직원의 공급자에 맞는 세션을 만든다  */
export function createRuntime(provider: AiProvider, onEvent: (e: RuntimeEvent) => void): AgentRuntime {
  if (provider === 'claude') return new ClaudeRuntime(onEvent)
  if (provider === 'codex') return new CodexRuntime(onEvent)
  throw new Error(`지원하지 않는 공급자: ${provider}`)
}

/** 공급자 모델 id (undefined = 공급자 기본) */
export function modelIdFor(provider: AiProvider, model: Parameters<typeof claudeModelId>[0]) {
  return provider === 'claude' ? claudeModelId(model) : undefined
}

// 앱 내부 AI가 쓸 공급자는 M2에서 설정(internalAi)·감지 결과로 고른다. 지금은 Claude 고정
const backend = new ClaudeBackend()
export function aiBackend(): AiBackend {
  return backend
}

/** 도구 없이 한 번만 답을 받는 호출 */
export const askOnce = (opts: AskOptions) => aiBackend().ask(opts)
