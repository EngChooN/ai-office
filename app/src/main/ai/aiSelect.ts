import type { AiProvider, InternalAi, ProvidersStatus } from '../../shared/types'
import type { AiTier } from './types.ts'

// 앱 내부 AI(비서·요약·askOnce)가 쓸 공급자 고르기·Codex 모델 매핑. 프로세스 없이 테스트할 수 있게 순수 함수로 둔다.

/** 앱 내부 AI가 시도할 공급자 순서. 감지 결과를 모르면(null) 지금까지처럼 Claude 하나.
 * 설정이 가리키는 쪽이 ready면 그쪽이 먼저, 다른 쪽이 ready면 폴백으로 뒤에 붙는다. 설정한 쪽이 안 되면 ready인 쪽만 */
export function internalProviders(setting: InternalAi, status: ProvidersStatus | null): AiProvider[] {
  if (!status) return ['claude']
  // Claude를 확인 못 했으면(시간 초과) 감지 전처럼 후보로 둔다 — 응답이 늦었다고 내부 AI에서 빠지면 안 된다
  const ready = (['claude', 'codex'] as const).filter((p) => status[p].state === 'ready' || (p === 'claude' && status[p].state === 'unknown'))
  if (!ready.length) return ['claude']
  // auto는 Claude 우선 (기존 사용자 동작 유지)
  const first: AiProvider = setting === 'codex' ? 'codex' : 'claude'
  return ready.length === 2 ? [first, first === 'claude' ? 'codex' : 'claude'] : ready
}

const LIGHT_HINT = /luna|mini|nano|spark|lite/i

/** tier → Codex 모델. light는 가벼운 모델 이름이 든 첫 모델, 없으면 기본. standard는 기본 모델.
 * models는 쓸 수 있는 모델 id(숨김 제외), 비면 undefined(app-server 기본) */
export function codexTierModel(tier: AiTier, models: string[], defaultModel: string): string | undefined {
  if (!models.length) return defaultModel || undefined
  if (tier === 'light') return models.find((m) => LIGHT_HINT.test(m)) ?? (defaultModel || models[0])
  return models.includes(defaultModel) ? defaultModel : models[0]
}

/** 한쪽이 못 쓰는 상태(로그아웃·만료·한도)여서 다른 쪽으로 넘겨도 되는 오류인가. 사용자가 끊은 호출은 넘기지 않는다 */
export function shouldFallback(e: unknown, aborted: boolean): boolean {
  if (aborted) return false
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return !/abort/i.test(msg)
}
