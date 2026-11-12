import type { Equipment } from './types'
import { READ_ONLY_BASH, RISKY_BASH } from './bashPolicy.ts'

// 장비 탭 카드: 일 하나마다 [막기 · 결재 받기 · 결재 없이] 중 하나를 고른다.
// 저장 형식은 예전 권한 묶음과 같다 — allow는 equipment.allowedTools, deny는 equipment.disallowedTools에 넣는다

export type PolicyLevel = 'block' | 'ask' | 'auto'
/** 저장값이 한 칸으로 정해지지 않음 (일부 도구만 있거나 허용·금지가 함께 있음) — 칸을 누를 때만 정리한다 */
export type PolicyState = PolicyLevel | 'custom'

export type PolicyRowId = 'edit' | 'web' | 'shell' | 'readOnly' | 'risky' | 'capture'

export interface PolicyRow {
  id: PolicyRowId
  /** '결재 없이'로 허용하는 도구 */
  allow?: readonly string[]
  /** '막기'로 금지하는 도구 */
  deny?: readonly string[]
}

export const POLICY_ROWS: readonly PolicyRow[] = [
  { id: 'edit', allow: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] },
  { id: 'web', allow: ['WebSearch', 'WebFetch'], deny: ['WebSearch', 'WebFetch'] },
  { id: 'shell', allow: ['Bash'], deny: ['Bash'] },
  { id: 'readOnly', allow: [READ_ONLY_BASH] },
  { id: 'risky', deny: [RISKY_BASH] },
  { id: 'capture', allow: ['mcp__office__capture_screen'] },
]

export const policyRow = (id: PolicyRowId) => POLICY_ROWS.find((r) => r.id === id)!

/** 이 행에서 고를 수 있는 칸 (묶음이 없는 칸은 빼고) */
export function policyLevels(row: PolicyRow): PolicyLevel[] {
  return [...(row.deny ? (['block'] as const) : []), 'ask', ...(row.allow ? (['auto'] as const) : [])]
}

type Lists = Pick<Equipment, 'allowedTools' | 'disallowedTools'>

/** 저장값 → 지금 고른 칸 */
export function levelOf(eq: Lists, row: PolicyRow): PolicyState {
  const allow = row.allow ?? []
  const deny = row.deny ?? []
  const allowHits = allow.filter((x) => eq.allowedTools.includes(x)).length
  const denyHits = deny.filter((x) => eq.disallowedTools.includes(x)).length
  if (allowHits === 0 && denyHits === 0) return 'ask'
  if (deny.length > 0 && denyHits === deny.length && allowHits === 0) return 'block'
  if (allow.length > 0 && allowHits === allow.length && denyHits === 0) return 'auto'
  return 'custom'
}

/** 칸 고르기: 이 행의 도구 이름만 바꾸고 다른 값(연결 서비스 이름 등)은 그대로 둔다 */
export function withLevel<E extends Lists>(eq: E, row: PolicyRow, level: PolicyLevel): E {
  // 이미 그 칸이면 그대로 — 다시 눌러 배열 순서만 바뀌면 저장 버튼이 켜진다
  if (levelOf(eq, row) === level) return eq
  const mine = new Set([...(row.allow ?? []), ...(row.deny ?? [])])
  const allowedTools = eq.allowedTools.filter((x) => !mine.has(x))
  const disallowedTools = eq.disallowedTools.filter((x) => !mine.has(x))
  if (level === 'auto') allowedTools.push(...(row.allow ?? []))
  if (level === 'block') disallowedTools.push(...(row.deny ?? []))
  return { ...eq, allowedTools, disallowedTools }
}

/** 처음 저장값과 비교해 바뀐 행 수 ('이대로 지급' 줄에 보여 준다) */
export function changedRows(before: Lists, after: Lists): number {
  return POLICY_ROWS.filter((r) => levelOf(before, r) !== levelOf(after, r)).length
}
