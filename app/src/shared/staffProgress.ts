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
export function buildStaffProgress(a: { status: StaffStatus; origins: readonly { kind?: string; fromId?: string; text?: string; room?: string }[]; queued: number; hasApproval: boolean; nameOf?: (id: string) => string | undefined }): StaffProgress | null {
  const cur = a.origins[0]
  if (!cur) return null
  const state: StaffProgress['state'] = a.status === 'error' ? 'error' : a.hasApproval || a.status === 'waiting' ? 'approval' : a.status === 'working' ? 'working' : 'queued'
  // 동료의 도움 요청으로 받은 일이면 부탁한 사람 이름을 붙인다 (그 직원이 없어졌으면 생략)
  const requestedBy = cur.kind === 'help' && cur.fromId ? a.nameOf?.(cur.fromId) : undefined
  // 대기 중 카드: 처리 중(첫 항목) 뒤에 줄 선 일 중 런타임이 센 수만큼 (같은 업무 카드는 origins에 한 번만 있어 더 적을 수 있다)
  const waiting = a.origins.slice(1, 1 + a.queued).flatMap((o) => (o.text ? [{ text: o.text }] : []))
  return { state, text: cur.text ?? '', ...(cur.room ? { room: cur.room } : {}), queued: a.queued, ...(requestedBy ? { requestedBy } : {}), ...(waiting.length ? { waiting } : {}) }
}
