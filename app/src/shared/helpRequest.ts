// 직원끼리 도움 요청 — 대상 계산과 제한 규칙 (순수 함수: office.ts가 쓰고 테스트가 직접 부른다)

/** 요청문 길이 한도 */
export const HELP_TEXT_MAX = 800
/** 도움 요청으로 받은 일에서 이어 요청할 수 있는 최대 단계 (2 = 팀원→동료→또 한 사람까지) */
export const HELP_MAX_DEPTH = 2
/** 한 직원이 한 업무(한 번의 일 턴) 안에서 보낼 수 있는 요청 수 */
export const HELP_MAX_PER_TASK = 3

export interface HelpOriginLike {
  kind: string
  fromId?: string
  depth?: number
}

export interface HelpScope {
  /** 이 직원이 속한 팀의 팀원 id (팀이 없으면 빈 목록) */
  teamMemberIds: readonly string[]
  /** 이 직원이 속한 랩들의 멤버 id */
  labMemberIds: readonly (readonly string[])[]
  /** 이 직원이 팀장이거나 랩 리드인가 — 그러면 delegate를 쓰고 도움 요청은 쓰지 않는다 */
  isLead: boolean
}

/** 도움 요청 대상 id: 같은 팀·같은 랩의 직원 중 본인을 뺀 사람. 팀장·랩 리드는 없음(delegate 사용) */
export function helpTargetIds(staffId: string, scope: HelpScope, isHired: (id: string) => boolean): string[] {
  if (scope.isLead) return []
  const ids = new Set<string>([...scope.teamMemberIds, ...scope.labMemberIds.flat()])
  ids.delete(staffId)
  return [...ids].filter(isHired)
}

/** 지금 받은 일 중 도움 요청의 가장 깊은 단계 (없으면 0) */
export function helpDepthOf(origins: readonly HelpOriginLike[]): number {
  return origins.reduce((max, o) => (o.kind === 'help' ? Math.max(max, o.depth ?? 1) : max), 0)
}

export type HelpRejection = 'tooLong' | 'tooDeep' | 'duplicate' | 'tooMany'

/**
 * 요청을 보내도 되는가. 거절 이유를 돌려주고 괜찮으면 null.
 * - requesterOrigins: 요청자가 지금 받은 일 / targetOrigins: 대상이 지금 받은 일 / sentCount: 요청자가 이번 업무에서 이미 보낸 수
 */
export function checkHelpRequest(input: { staffId: string; text: string; requesterOrigins: readonly HelpOriginLike[]; targetOrigins: readonly HelpOriginLike[]; sentCount: number }): HelpRejection | null {
  if (input.text.length > HELP_TEXT_MAX) return 'tooLong'
  if (helpDepthOf(input.requesterOrigins) >= HELP_MAX_DEPTH) return 'tooDeep'
  if (input.targetOrigins.some((o) => o.kind === 'help' && o.fromId === input.staffId)) return 'duplicate'
  if (input.sentCount >= HELP_MAX_PER_TASK) return 'tooMany'
  return null
}
