// 플랜 한도 대응 — 사용률이 높으면 급하지 않은 일(예약·보드 자동 진행)을 보류하고, 한도가 회복되면 자동 재개한다

import type { PlanUsage } from './types'

/** 이 사용률(%) 이상이면 보류한다 */
export const HOLD_PERCENT = 95
/** 모델별 창(seven_day_opus 등)은 그 모델만 막으므로 전체 한도 두 창만 본다 */
const HOLD_WINDOWS = new Set(['five_hour', 'seven_day'])

export interface PlanHold {
  isHeld: boolean
  /** 보류가 풀리는 시각(ms) — 보류 중인 창이 모두 회복되는 때. 보류가 아니면 null */
  resumeAt: number | null
  /** 보류의 원인이 된 창과 사용률 */
  type: string | null
  percent: number | null
}

export const NO_HOLD: PlanHold = { isHeld: false, resumeAt: null, type: null, percent: null }

/**
 * 막혔거나 사용률이 높고 아직 회복 전(리셋 시각이 미래)인 창이 있으면 보류.
 * 사용률은 Claude를 부를 때만 갱신되므로, 리셋 시각이 지난 값은 이미 회복된 것으로 본다. bypassUntil(바로 시작)까지는 보류하지 않는다
 */
export function planHold(usage: PlanUsage[], now: number, bypassUntil = 0): PlanHold {
  if (now < bypassUntil) return NO_HOLD
  const hot = usage.filter((u) => HOLD_WINDOWS.has(u.type) && u.resetsAt !== null && u.resetsAt > now && (u.status === 'rejected' || (u.percent !== null && u.percent >= HOLD_PERCENT)))
  if (hot.length === 0) return NO_HOLD
  const top = hot.reduce((a, b) => ((b.percent ?? 100) > (a.percent ?? 100) ? b : a))
  return { isHeld: true, resumeAt: Math.max(...hot.map((u) => u.resetsAt ?? 0)), type: top.type, percent: top.percent }
}

/** 상황판·단체방에 보일 보류 중인 일 */
export interface HeldItem {
  kind: 'schedule' | 'task'
  id: string
  label: string
  staffId: string
}

export interface PlanHoldState extends PlanHold {
  items: HeldItem[]
}
