import type { StaffProgress, StaffStatus } from './types'

const TEXT_MAX = 80

/** 지시 글을 한 줄 요약으로 (공백 정리·길이 제한) */
export function summarizeInstruction(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > TEXT_MAX ? `${one.slice(0, TEXT_MAX)}…` : one
}

/**
 * 직원의 처리 중인 지시 정보. 받은 일(origins)이 없으면 null.
 * queued = 현재 지시 뒤에 줄 선 지시 수 (공급자마다 세는 법이 달라 런타임이 계산해 넘긴다)
 */
export function buildStaffProgress(a: { status: StaffStatus; origins: readonly { text?: string; room?: string }[]; queued: number; hasApproval: boolean }): StaffProgress | null {
  const cur = a.origins[0]
  if (!cur) return null
  const state: StaffProgress['state'] = a.status === 'error' ? 'error' : a.hasApproval || a.status === 'waiting' ? 'approval' : a.status === 'working' ? 'working' : 'queued'
  return { state, text: cur.text ?? '', ...(cur.room ? { room: cur.room } : {}), queued: a.queued }
}
