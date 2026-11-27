// 위임받은 일을 팀원이 오류·중지로 못 끝냈을 때 맡긴 리더에게 보낼 통보 — office.ts failDelegations가 쓴다 (electron 없이 돈다)

/** 오류 사유는 첫 줄 앞 100자만 (긴 스택·로그가 리더 지시창을 채우지 않게) */
export const DELEGATE_FAIL_REASON_MAX = 100

type DelegateOrigin = { kind: string; leadId?: string; room?: string; isAutonomous?: boolean }

export type DelegateFailNotice = { leadId: string; room?: string; isAutonomous: boolean }

/** 오류 글의 첫 줄(비어 있지 않은 줄) 앞부분 */
export function failReasonOf(error: string): string {
  const line = error.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? ''
  return line.length > DELEGATE_FAIL_REASON_MAX ? `${line.slice(0, DELEGATE_FAIL_REASON_MAX)}…` : line
}

/** 받은 일 중 위임 출처마다 통보할 리더 (같은 리더는 한 번, 지금 고용돼 있지 않은 리더는 건너뜀) */
export function delegateFailNotices(origins: readonly DelegateOrigin[], isLeadAlive: (id: string) => boolean): DelegateFailNotice[] {
  const out = new Map<string, DelegateFailNotice>()
  for (const o of origins) {
    if (o.kind !== 'delegate' || !o.leadId || out.has(o.leadId) || !isLeadAlive(o.leadId)) continue
    out.set(o.leadId, { leadId: o.leadId, room: o.room, isAutonomous: Boolean(o.isAutonomous) })
  }
  return [...out.values()]
}
