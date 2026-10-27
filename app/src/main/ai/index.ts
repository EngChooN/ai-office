import type { AiProvider, InternalAi, ProvidersStatus } from '../../shared/types'
import { CodexRuntime } from './codex'
import { CodexBackend } from './codexBackend'
import { ClaudeBackend, ClaudeRuntime, claudeModelId } from './claude'
import { FallbackBackend } from './fallback'
import { internalProviders } from './aiSelect'
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

// 앱 내부 AI의 공급자 선택: 설정(internalAi)과 마지막 감지 결과를 main이 넘겨 준다. 넘기지 않으면 Claude 하나 (기존 동작)
let config: { setting: () => InternalAi; status: () => ProvidersStatus | null } = { setting: () => 'claude', status: () => null }
export function configureAi(c: typeof config) {
  config = c
}

const backends: Record<AiProvider, AiBackend> = { claude: new ClaudeBackend(), codex: new CodexBackend() }

const backend = new FallbackBackend(() => internalProviders(config.setting(), config.status()), (p) => backends[p])
export function aiBackend(): AiBackend {
  return backend
}

/** 도구 없이 한 번만 답을 받는 호출 */
export const askOnce = (opts: AskOptions) => aiBackend().ask(opts)
