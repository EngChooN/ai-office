// 자율 진행(묻지 않고 끝까지): 켜졌는지 판정 · 위험 도구 거부 · 질문 대체 답 · 글 질문 재지시 횟수 — electron 없이 테스트한다
// 대표 결정(2026-10-30): 업무별 스위치(하위·위임 상속) + 자동결재의 '완전 자율' 단계. 위험 작업은 건너뛰고 보고에 남긴다. 기획안은 자동 승인

import { autoApprove, autoWindow, AWAY_ANSWER, type AutoApproveConfig } from './autoApprove.ts'
import type { StaffQuestion, Task } from './types.ts'

/** 업무 하나에서 글 질문을 "스스로 판단해 계속" 재지시로 바꾸는 최대 횟수 (넘으면 평소처럼 결재함 질문) */
export const AUTONOMY_TEXT_ASK_MAX = 3

/** 지금 '완전 자율' 단계가 켜져 있는가 (자동결재 기간 안 + 완전 자율) */
export function isFullAutonomy(config: AutoApproveConfig, now: number) {
  return Boolean(config.isFull) && autoWindow(config, now).isActive
}

/** 카드가 자율 진행인가 — 상위 기획 카드가 자율이면 하위도 자율 (부모를 따라 올라가며, 고리는 끊는다) */
export function isTaskAutonomous(task: Pick<Task, 'id' | 'isAutonomous' | 'parentId'> | undefined, getTask: (id: string) => Pick<Task, 'id' | 'isAutonomous' | 'parentId'> | undefined) {
  const seen = new Set<string>()
  let cur = task
  while (cur && !seen.has(cur.id)) {
    if (cur.isAutonomous) return true
    seen.add(cur.id)
    cur = cur.parentId ? getTask(cur.parentId) : undefined
  }
  return false
}

/** 직원이 받은 일 하나 (office의 Origin과 같은 모양 — 필요한 칸만) */
export interface AutonomyOrigin {
  kind: string
  taskId?: string
  isAutonomous?: boolean
}

/**
 * 이 직원이 지금 자율 진행 중인가: 완전 자율 단계가 켜져 있거나, 받은 일 중 하나라도 자율(지시·위임에 붙은 표시, 또는 자율 카드)이면 true
 */
export function resolveAutonomy(input: { isFull: boolean; origins: readonly AutonomyOrigin[]; isTaskAutonomous: (taskId: string) => boolean }) {
  if (input.isFull) return true
  return input.origins.some((o) => o.isAutonomous || (o.kind === 'task' && typeof o.taskId === 'string' && input.isTaskAutonomous(o.taskId)))
}

export type AutonomyVerdict = 'allow' | 'deny'

/**
 * 자율 진행 중 도구 판정: 자동결재가 대표를 기다릴 도구(삭제·배포·push·외부 전송·스크립트 실행·쓰기 MCP 등)는 결재함으로 보내지 않고 거부한다.
 * extraWait = 자동결재 기간에 쓴 파일·빌드 설정을 실행하는 명령처럼 office가 따로 거르는 경우
 */
export function autonomyVerdict(tool: string, input: Record<string, unknown>, extraWait = false): AutonomyVerdict {
  if (extraWait) return 'deny'
  return autoApprove(tool, input) === 'wait' ? 'deny' : 'allow'
}

/** 질문 도구에 비서가 답하지 못했을 때의 대체 답: 질문마다 첫 번째(추천) 선택지, 선택지가 없으면 "알아서 판단" */
export function fallbackAnswers(questions: readonly StaffQuestion[]): Record<string, string> {
  return Object.fromEntries(questions.map((q) => [q.question, q.options.find((o) => o.label.trim())?.label.trim() || AWAY_ANSWER]))
}

/**
 * 글 질문 재지시 횟수: 이번이 몇 번째인지 세어 아직 한도 안이면 재지시, 넘었으면 평소처럼 결재함.
 * counts는 업무(카드 id 또는 직원 id)별 지금까지 횟수 — 새 값을 돌려준다
 */
export function nextTextAskRetry(counts: ReadonlyMap<string, number>, key: string, max = AUTONOMY_TEXT_ASK_MAX): { isRetry: boolean; counts: Map<string, number> } {
  const used = counts.get(key) ?? 0
  const next = new Map(counts)
  if (used >= max) return { isRetry: false, counts: next }
  next.set(key, used + 1)
  return { isRetry: true, counts: next }
}
