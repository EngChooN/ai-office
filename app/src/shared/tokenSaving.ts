/**
 * 토큰 절약: 급여 화면 '이번 주 토큰 아끼기 Top 3'와 '토큰 절약 모드'(새 직원 고용 기본값).
 * 이유는 직원의 실제 설정 값(Fable·Opus 모델, 대화 기억 최대·길게)으로만 고른다. 기존 직원은 대표가 [아끼기]를 눌러야만 바뀐다
 */
import type { AiProvider, ClaudeModel, MemoryLength, ModelChoice, PayslipRow, Staff } from './types.ts'

export const SAVER_TOP = 3

/** 왜 이 직원이 아낄 수 있는지 — 화면 문구는 tokenSaver.reason.<값> */
export type SaverReason = 'fable' | 'opus' | 'memoryFull' | 'memoryLong'

/** [아끼기]가 바꿀 값 한 가지 — 한 단계만 내린다 (Fable → Opus, Opus → Sonnet, 기억 최대·길게 → 보통) */
export type SaverAction = { kind: 'model'; from: ModelChoice; to: ModelChoice } | { kind: 'memory'; from: MemoryLength; to: MemoryLength }

export interface Saver {
  staffId: string
  tokens: number
  reason: SaverReason
  action: SaverAction
}

type SaverStaff = Pick<Staff, 'id' | 'kind' | 'provider' | 'model' | 'memory'>

/** 모델을 한 단계 내리는 표 — 새 모델이 생기면 여기 한 줄 */
const MODEL_STEP_DOWN: Partial<Record<ClaudeModel, { reason: SaverReason; to: ClaudeModel }>> = {
  fable: { reason: 'fable', to: 'opus' },
  opus: { reason: 'opus', to: 'sonnet' },
}

/** 이 직원이 아낄 방법 하나 — 모델이 먼저. 'default' 모델(무엇인지 모름)·Codex는 모델을 건드리지 않는다 */
export function saverFor(s: SaverStaff): Pick<Saver, 'reason' | 'action'> | null {
  const lower = s.provider !== 'codex' ? MODEL_STEP_DOWN[s.model as ClaudeModel] : undefined
  if (lower) return { reason: lower.reason, action: { kind: 'model', from: s.model, to: lower.to } }
  if (s.memory === 'full' || s.memory === 'long') return { reason: s.memory === 'full' ? 'memoryFull' : 'memoryLong', action: { kind: 'memory', from: s.memory, to: 'normal' } }
  return null
}

/** 이번 주 사용량에서 아낄 수 있는 직원을 토큰 많이 쓴 순으로 3명 — 비서·퇴사자·외부 직원은 뺀다 */
export function pickSavers(rows: readonly PayslipRow[], staff: readonly SaverStaff[]): Saver[] {
  const byId = new Map(staff.map((s) => [s.id, s]))
  const savers: Saver[] = []
  for (const r of rows) {
    const s = byId.get(r.staffId)
    const tokens = r.tokensIn + r.tokensOut
    if (!s || s.kind !== 'hired' || tokens <= 0) continue
    const saver = saverFor(s)
    if (saver) savers.push({ staffId: s.id, tokens, ...saver })
  }
  return savers.sort((a, b) => b.tokens - a.tokens).slice(0, SAVER_TOP)
}

/** 토큰 절약 모드의 새 직원 기본값 — 켜면 Haiku + 기억 짧게 (Codex는 모델 목록이 달라 기억만). 끄면 없음 */
export function hireDefaults(isSaverOn: boolean | undefined, provider: AiProvider): { model?: ModelChoice; memory?: MemoryLength } {
  if (!isSaverOn) return {}
  return provider === 'codex' ? { memory: 'short' } : { model: 'haiku', memory: 'short' }
}
