import type { AiProvider, EquipmentCatalog, McpSourceKind, ModelChoice, ProvidersStatus } from './types'

/** 엔진을 정하지 않았을 때 쓸 공급자: Claude가 준비됐으면 Claude, 아니면 준비된 Codex (모르면 Claude) */
export const defaultProvider = (s: ProvidersStatus | null | undefined): AiProvider => (s && s.claude.state !== 'ready' && s.codex.state === 'ready' ? 'codex' : 'claude')

const CLAUDE_MODELS = new Set(['default', 'opus', 'sonnet', 'haiku'])
const looksGpt = (m: string, codexModels: string[]) => codexModels.includes(m) || /^(gpt|o\d|codex)/i.test(m)

/** 엔진과 모델을 맞춘다: Claude 엔진은 Claude 별칭만, GPT 모델 이름이 들어오면 GPT 엔진으로, GPT 엔진에 Claude 별칭이 오면 기본 모델로 */
export function fitEngineModel(provider: AiProvider | undefined, model: ModelChoice, codexModels: string[] = []): { provider: AiProvider; model: ModelChoice } {
  const p = provider ?? 'claude'
  if (p === 'codex') return { provider: 'codex', model: CLAUDE_MODELS.has(model) ? 'default' : model }
  if (CLAUDE_MODELS.has(model)) return { provider: 'claude', model }
  return looksGpt(model, codexModels) ? { provider: 'codex', model } : { provider: 'claude', model: 'default' }
}

/** 화면·기록에 쓰는 엔진 이름 (번역하지 않는 고유 이름) */
export const ENGINE_NAME: Record<AiProvider, string> = { claude: 'Claude', codex: 'GPT' }

/** 지급된 연결 도구 중 그 엔진에서 못 쓰는 것: Codex 설정의 도구는 GPT만, claude.ai 커넥터는 GPT에서 못 붙인다 (카탈로그에 없는 이름은 판단하지 않는다) */
export function engineUnsupportedMcp(catalog: EquipmentCatalog, equipped: string[], provider: AiProvider): string[] {
  const kind = new Map(catalog.mcpServers.map((m) => [m.name, m.sourceKind]))
  const blocked: McpSourceKind = provider === 'codex' ? 'claudeai' : 'codex'
  return equipped.filter((name) => kind.get(name) === blocked)
}

/** 이미 저장된 직원의 모델이 엔진에 안 맞는지 */
export const isEngineMismatch = (provider: AiProvider, model: ModelChoice) => provider === 'claude' ? !CLAUDE_MODELS.has(model) : model !== 'default' && CLAUDE_MODELS.has(model)

/** GPT(Codex)가 연결돼 있을 때만 붙는 엔진 안내 — 고용할 때 엔진·모델 고르는 법 */
export function engineGuide(status: ProvidersStatus | null | undefined): string {
  const x = status?.codex
  if (!x || x.state !== 'ready') return ''
  const models = x.models.length ? x.models.map((m) => `"${m}"`).join(' · ') : '없음'
  return `

엔진(고용)
- 직원은 엔진이 둘입니다: Claude(provider "claude") 또는 GPT(provider "codex"). 직원 목록에 직원마다 엔진이 나옵니다.
- hire의 provider는 대표가 GPT·Codex를 말했을 때만 "codex", Claude를 말했을 때만 "claude"입니다. 말하지 않았으면 provider를 생략합니다(앱이 연결된 엔진으로 정합니다).
- provider "claude"면 model은 "default"|"opus"|"sonnet"|"haiku" 중에서, provider "codex"면 model은 "default" 또는 쓸 수 있는 GPT 모델 중에서 고릅니다(Claude 모델 이름을 넣지 않습니다). 쓸 수 있는 GPT 모델: ${models}${x.defaultModel ? ` (기본 ${x.defaultModel})` : ''}. 대표가 모델을 말하지 않았으면 "default"로 둡니다.
- updateStaff의 model도 그 직원의 엔진에 맞는 모델이어야 합니다.`
}

