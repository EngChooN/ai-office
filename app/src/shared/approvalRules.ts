// "앞으로 항상 승인" 규칙: 대표가 결재 승인 옆에서 만든다 (직원 + 도구 + 명령 패턴) — electron 없이 테스트한다
// 위험 명령·푸시·외부 전송·스크립트 실행·실행 위험 경로 쓰기는 규칙을 만들 수 없고, 규칙이 있어도 늘 대표를 기다린다 (자동결재와 같은 기준)

import { autoApprove, commandWaits } from './autoApprove.ts'
import { base, gitSubcommand, lexSegments, resolveCommand } from './commandScan.ts'
import { t } from './i18n/index.ts'

/** 규칙 초안 — 결재 카드에 붙여 보내고, 대표가 누르면 그대로 규칙이 된다 */
export interface ApprovalRuleDraft {
  toolName: string
  /** Bash만: 허용하는 명령 머리 ("npm test", "ls"). 다른 도구는 빈 배열 = 그 도구 전부 */
  patterns: string[]
}

export interface ApprovalRule extends ApprovalRuleDraft {
  id: string
  staffId: string
  createdAt: number
}

/** 하위 명령까지 봐야 뜻이 갈리는 명령 — "npm test"와 "npm publish"는 다른 규칙 */
const SUBCOMMAND_TOOLS = new Set(['git', 'npm', 'pnpm', 'yarn', 'bun', 'cargo', 'go', 'docker', 'gh', 'make', 'pip', 'pip3', 'uv', 'poetry', 'swift', 'flutter', 'dart', 'gradle', 'kubectl', 'brew'])
/** 규칙으로 넘길 수 없는 도구 — 질문은 답이 필요하고, 화면 캡처는 대표 화면이 그대로 찍힌다 */
const NEVER_RULE = new Set(['AskUserQuestion', 'ExitPlanMode', 'mcp__office__capture_screen'])

/** 명령 한 토막의 머리: 이름 + (필요하면) 하위 명령. 알 수 없으면 null */
function segmentKey(cmd: string | null, args: string[]): string | null {
  if (!cmd) return null
  const name = base(cmd)
  if (!/^[\w.+-]+$/.test(name)) return null
  if (!SUBCOMMAND_TOOLS.has(name)) return name
  const sub = name === 'git' ? gitSubcommand(args).sub : args.find((a) => !a.startsWith('-'))
  return sub && /^[\w:.-]+$/.test(sub) ? `${name} ${sub}` : name
}

/** 이어 붙인 명령의 머리 목록 (중복 없이). 하나라도 알 수 없으면 null */
export function commandKeys(command: string): string[] | null {
  const keys: string[] = []
  for (const seg of lexSegments(command)) {
    const { cmd, args } = resolveCommand(seg)
    if (!cmd) continue // 변수 대입만 있는 토막
    const key = segmentKey(cmd, args)
    if (!key) return null
    if (!keys.includes(key)) keys.push(key)
  }
  return keys.length ? keys : null
}

const commandOf = (input: Record<string, unknown>) => (typeof input.command === 'string' ? input.command : '')

/** 이 요청으로 규칙을 만들 수 있으면 초안, 위험하거나 질문이면 null */
export function ruleDraftFor(toolName: string, input: Record<string, unknown>): ApprovalRuleDraft | null {
  if (NEVER_RULE.has(toolName)) return null
  if (toolName === 'Bash') {
    const command = commandOf(input)
    if (commandWaits(command)) return null
    const patterns = commandKeys(command)
    return patterns ? { toolName, patterns } : null
  }
  // 자동결재가 기다리는 요청(실행 경로 쓰기·쿼리 붙은 WebFetch·쓰기 MCP·브라우저 조작)은 규칙으로 넘기지 않는다
  return autoApprove(toolName, input) === 'wait' ? null : { toolName, patterns: [] }
}

/** 이 직원의 이 요청에 맞는 규칙이 있으면 그 규칙 (Bash는 이어 붙인 명령이 모두 규칙 안에 있어야 한다) */
export function matchRule(rules: readonly ApprovalRule[], staffId: string, toolName: string, input: Record<string, unknown>): ApprovalRule | null {
  const mine = rules.filter((r) => r.staffId === staffId && r.toolName === toolName)
  if (mine.length === 0) return null
  const draft = ruleDraftFor(toolName, input)
  if (!draft) return null
  if (toolName !== 'Bash') return mine[0]
  const allowed = new Set(mine.flatMap((r) => r.patterns))
  if (!draft.patterns.every((p) => allowed.has(p))) return null
  return mine.find((r) => r.patterns.some((p) => draft.patterns.includes(p))) ?? mine[0]
}

/** 초안이 이미 있는 규칙들로 덮이는가 (규칙을 만든 뒤 같은 직원의 대기 결재를 함께 넘길 때) */
export function draftCovered(rules: readonly ApprovalRule[], staffId: string, draft: ApprovalRuleDraft): boolean {
  const mine = rules.filter((r) => r.staffId === staffId && r.toolName === draft.toolName)
  if (mine.length === 0) return false
  if (draft.toolName !== 'Bash') return true
  const allowed = new Set(mine.flatMap((r) => r.patterns))
  return draft.patterns.every((p) => allowed.has(p))
}

/** 같은 직원·도구·패턴의 규칙이 있으면 새로 만들지 않는다 */
export function isSameRule(a: ApprovalRuleDraft & { staffId: string }, b: ApprovalRuleDraft & { staffId: string }) {
  return a.staffId === b.staffId && a.toolName === b.toolName && [...a.patterns].sort().join('\n') === [...b.patterns].sort().join('\n')
}

/** 화면에 보이는 규칙 한 줄: "명령 npm test · cd" / "Edit 전부" */
export function ruleLabel(draft: ApprovalRuleDraft): string {
  if (draft.toolName === 'Bash') return t('rule.label.command', { patterns: draft.patterns.join(' · ') })
  return t('rule.label.tool', { tool: draft.toolName.replace(/^mcp__/, '').replace(/__/g, ' › ') })
}
