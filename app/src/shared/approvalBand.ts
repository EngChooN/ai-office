import type { Approval } from './types'
import { commandWaits } from './autoApprove.ts'
import { BROWSER_AUTO_TOOL } from './browserTools.ts'
import { lexSegments } from './commandScan.ts'

/** 띠에서 바로 승인할 수 있는 원문 길이 — 대시보드 바로 승인(INLINE_APPROVAL_MAX)과 같은 기준. 길면 잘린 뒤쪽에 위험한 부분이 숨을 수 있다 */
export const BAND_APPROVE_MAX = 120

/** 띠에서 승인하지 않는 도구 — 고를 게 있거나(계획 확인) 대표 화면·브라우저 권한을 넘기는 결재 */
const BAND_NEVER = new Set(['ExitPlanMode', 'mcp__office__capture_screen', BROWSER_AUTO_TOOL])

/**
 * 세로 폰 직원 패널의 결재 한 줄 띠에서 바로 '승인'을 붙일 결재 id.
 * 원문을 못 본 채 엉뚱하거나 위험한 건을 승인하지 않게 — 기다리는 결재가 딱 1건이고,
 * 고를 게 있는 질문이 아니고, 기다리는 이유가 붙지 않았고,
 * 원문이 짧은 한 줄이고, 명령이면 이어 붙이지 않은 위험하지 않은 명령 하나일 때만.
 * 기다리는 이유(waitReason)는 자동결재 중에만 붙으므로 평소 결재는 원문으로 따로 거른다. 그 밖은 '보기'로 펼쳐서 처리한다
 */
export function bandApproveId(approvals: readonly Pick<Approval, 'id' | 'toolName' | 'summary' | 'questions' | 'waitReason'>[]): string | null {
  if (approvals.length !== 1) return null
  const [a] = approvals
  if (a.questions || a.waitReason || BAND_NEVER.has(a.toolName)) return null
  if (!a.summary || a.summary.length > BAND_APPROVE_MAX || a.summary.includes('\n')) return null
  if (a.toolName === 'Bash' && (commandWaits(a.summary) || lexSegments(a.summary).length !== 1)) return null
  return a.id
}
