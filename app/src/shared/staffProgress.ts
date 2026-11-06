import type { StaffProgress, StaffStatus } from './types'

const TEXT_MAX = 80
/** 대기 메시지 글 상한 (화면은 두 줄로 줄이고 마우스를 올리면 전체를 보여 준다) */
const WAITING_TEXT_MAX = 500

/** 지시 글을 한 줄 요약으로 (공백 정리·길이 제한) */
export function summarizeInstruction(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > TEXT_MAX ? `${one.slice(0, TEXT_MAX)}…` : one
}

/**
 * 직원의 처리 중인 지시 정보. 받은 일(origins)이 없으면 null.
 * queued = 현재 지시 뒤에 줄 선 지시 수 (공급자마다 세는 법이 달라 런타임이 계산해 넘긴다) — 대기 메시지도 더해 센다
 * waiting = 대기 메시지 (일하는 중에 직원 패널·대화방에서 보내 앱이 들고 있는 지시)
 */
export function buildStaffProgress(a: {
  status: StaffStatus
  origins: readonly { kind?: string; fromId?: string; text?: string; room?: string }[]
  queued: number
  hasApproval: boolean
  nameOf?: (id: string) => string | undefined
  waiting?: readonly { id: string; text: string; room?: string }[]
}): StaffProgress | null {
  const cur = a.origins[0]
  if (!cur) return null
  const state: StaffProgress['state'] = a.status === 'error' ? 'error' : a.status === 'netWait' ? 'netWait' : a.hasApproval || a.status === 'waiting' ? 'approval' : a.status === 'working' ? 'working' : 'queued'
  // 동료의 도움 요청으로 받은 일이면 부탁한 사람 이름을 붙인다 (그 직원이 없어졌으면 생략)
  const requestedBy = cur.kind === 'help' && cur.fromId ? a.nameOf?.(cur.fromId) : undefined
  const waiting = (a.waiting ?? []).map((w) => ({ id: w.id, text: w.text.slice(0, WAITING_TEXT_MAX), ...(w.room ? { room: w.room } : {}) }))
  return { state, text: cur.text ?? '', ...(cur.room ? { room: cur.room } : {}), queued: a.queued + waiting.length, ...(requestedBy ? { requestedBy } : {}), ...(waiting.length ? { waiting } : {}) }
}
