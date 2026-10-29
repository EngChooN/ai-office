// 상단 바 플랜 사용률 칩 — 어느 엔진(Claude·GPT) 값을 보여 줄지 고른다

import { PLAN_WINDOW_LABEL, type AiProvider, type PlanUsage } from './types.ts'

const ORDER = Object.keys(PLAN_WINDOW_LABEL)
/** 칩에는 기본 한도만 — 무료 ChatGPT 플랜은 30일 하나뿐이라 함께 둔다 */
const CHIP_TYPES = new Set(['five_hour', 'seven_day', 'thirty_day'])

export interface ChipEngine {
  provider: AiProvider
  usage: PlanUsage[]
}

/**
 * 값이 있는 엔진 중 직원이 실제로 쓰는 엔진만 고른다 (Claude 먼저).
 * 쓰는 엔진의 값이 아직 없으면(직원 없음·막 바꾼 직후) 값이 있는 엔진을 그대로 보여 준다
 */
export function chipEngines(usage: Record<AiProvider, PlanUsage[]>, usedProviders: ReadonlySet<AiProvider>): ChipEngine[] {
  const withData = (['claude', 'codex'] as const)
    .map((provider) => ({
      provider,
      usage: usage[provider].filter((u) => CHIP_TYPES.has(u.type) && u.percent !== null).sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type)),
    }))
    .filter((e) => e.usage.length > 0)
  const used = withData.filter((e) => usedProviders.has(e.provider))
  return used.length > 0 ? used : withData
}
