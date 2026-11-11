// 직원끼리 도움 요청 — 대상 계산과 제한 규칙 (순수 함수: office.ts가 쓰고 테스트가 직접 부른다)

/** 요청문 길이 한도 */
export const HELP_TEXT_MAX = 800
/** 도움 요청 최대 단계 (1 = 팀원→동료까지, 받은 부탁은 다시 넘기지 않는다).
 *  2단계를 허용하면 중간 직원의 턴이 "다른 동료에게 부탁했어요"로 먼저 끝나 그 중간 답이 처음 요청자에게 결과로 가고,
 *  나중에 온 하위 결과는 처음 요청자에게 돌아가지 않는다 */
export const HELP_MAX_DEPTH = 1
/** 한 직원이 한 업무(한 번의 일 턴) 안에서 보낼 수 있는 요청 수 */
export const HELP_MAX_PER_TASK = 3

/** 도움 요청 사슬 정보 — 일을 받은 쪽과 결과를 받아 다시 시작한 쪽 모두에 붙어 깊이·횟수·순환을 이어 센다 */
export interface HelpCtx {
  /** 처음 부탁한 사람의 일 하나를 가리키는 id (결과로 재개돼도 그대로) */
  rootId: string
  /** 요청 사슬의 직원 id (맨 앞이 처음 부탁한 사람, 맨 뒤가 지금 이 일을 가진 사람) */
  path: string[]
}

export interface HelpOriginLike {
  kind: string
  fromId?: string
  /** 도움 요청 id (kind=help일 때) */
  reqId?: string
  help?: HelpCtx
}

export interface HelpScope {
  /** 이 직원이 속한 팀의 팀원 id (팀이 없으면 빈 목록) */
  teamMemberIds: readonly string[]
  /** 이 직원이 속한 랩들의 멤버 id */
  labMemberIds: readonly (readonly string[])[]
  /** 이 직원이 랩 리드인가 — 랩 멤버 전원에게 delegate를 쓰므로 도움 요청은 쓰지 않는다 */
  isLabLead: boolean
  /** 이 직원이 팀장인가 — 팀원에게는 delegate를 쓰고, 팀원이 아닌 같은 랩 직원에게만 도움 요청을 쓴다 */
  isTeamLead: boolean
}

/** 도움 요청 대상 id: 같은 팀·같은 랩의 직원 중 본인을 뺀 사람. 랩 리드는 없음(delegate 사용), 팀장은 자기 팀원(delegate 사용)을 뺀 사람 */
export function helpTargetIds(staffId: string, scope: HelpScope, isHired: (id: string) => boolean): string[] {
  if (scope.isLabLead) return []
  const ids = new Set<string>([...scope.teamMemberIds, ...scope.labMemberIds.flat()])
  ids.delete(staffId)
  if (scope.isTeamLead) for (const id of scope.teamMemberIds) ids.delete(id)
  return [...ids].filter(isHired)
}

/** 이 직원이 받은 일에 붙은 도움 사슬 중 가장 긴 것 (없으면 null) */
export function helpCtxOf(origins: readonly HelpOriginLike[]): HelpCtx | null {
  let best: HelpCtx | null = null
  for (const o of origins) if (o.help && (!best || o.help.path.length > best.path.length)) best = o.help
  return best
}

/** 지금 받은 일 중 도움 요청의 가장 깊은 단계 (없으면 0) — 결과로 재개된 일도 사슬을 이어 센다 */
export function helpDepthOf(origins: readonly HelpOriginLike[]): number {
  const c = helpCtxOf(origins)
  return c ? c.path.length - 1 : 0
}

/** 도움 요청 사슬 안에서 받은 일인가 — 이런 일에서는 위임·업무 카드·기획안으로 제한을 우회하지 못하게 막는다 */
export function inHelpContext(origins: readonly HelpOriginLike[]): boolean {
  return origins.some((o) => o.kind === 'help' || o.help)
}

export type HelpRejection = 'tooLong' | 'tooDeep' | 'cycle' | 'busy' | 'duplicate' | 'tooMany'

interface HelpRoot {
  owner: string
  sent: Map<string, number>
  open: Set<string>
}

/**
 * 도움 요청 장부: 요청마다 상관 id를 주고, 원업무(root)별로 요청자 보낸 수와 열린 요청을 센다.
 * 결과가 돌아와 일이 다시 시작돼도 사슬(path)·root가 이어져 깊이·3건·순환 제한이 유지된다.
 */
export class HelpLedger {
  private roots = new Map<string, HelpRoot>()
  private reqs = new Map<string, { rootId: string; path: string[] }>()
  private seq = 0

  private nextId(prefix: string) {
    this.seq += 1
    return `${prefix}${this.seq}`
  }

  /** 요청을 보내도 되는가. 거절 이유를 돌려주고 괜찮으면 null */
  check(input: { staffId: string; targetId: string; text: string; requesterOrigins: readonly HelpOriginLike[]; targetOrigins: readonly HelpOriginLike[] }): HelpRejection | null {
    const ctx = helpCtxOf(input.requesterOrigins)
    if (input.text.length > HELP_TEXT_MAX) return 'tooLong'
    if (helpDepthOf(input.requesterOrigins) >= HELP_MAX_DEPTH) return 'tooDeep'
    if (ctx?.path.includes(input.targetId)) return 'cycle'
    if (input.targetOrigins.some((o) => o.kind === 'help' && o.fromId === input.staffId)) return 'duplicate'
    // 다른 도움 요청을 처리하는 중인 사람에게는 보내지 않는다 — 한 턴에 합쳐 끝나면 결과가 요청별로 갈리지 않는다
    if (input.targetOrigins.some((o) => o.kind === 'help')) return 'busy'
    // 사슬이 없는 첫 요청자는 open()과 같이 자기가 연 원업무로 보낸 수를 센다
    const rootId = ctx?.rootId ?? [...this.roots].find(([, r]) => r.owner === input.staffId)?.[0]
    const sent = rootId ? (this.roots.get(rootId)?.sent.get(input.staffId) ?? 0) : 0
    if (sent >= HELP_MAX_PER_TASK) return 'tooMany'
    return null
  }

  /** 요청을 기록하고 받는 사람에게 붙일 출처 정보를 돌려준다 (check를 통과한 뒤에 부른다) */
  open(staffId: string, targetId: string, requesterOrigins: readonly HelpOriginLike[]): { reqId: string; help: HelpCtx } {
    const cur = helpCtxOf(requesterOrigins)
    // 받은 일에 사슬이 없는 첫 요청자는 자기 원업무를 하나 열고, 같은 업무의 다음 요청은 같은 원업무로 센다
    const rootId = cur?.rootId ?? [...this.roots].find(([, r]) => r.owner === staffId)?.[0] ?? this.nextId('root')
    const base = cur?.path ?? [staffId]
    let root = this.roots.get(rootId)
    if (!root) this.roots.set(rootId, (root = { owner: staffId, sent: new Map(), open: new Set() }))
    root.sent.set(staffId, (root.sent.get(staffId) ?? 0) + 1)
    const reqId = this.nextId('req')
    root.open.add(reqId)
    const path = [...base, targetId]
    this.reqs.set(reqId, { rootId, path })
    return { reqId, help: { rootId, path } }
  }

  /** 받은 쪽이 일을 마쳤다 — 요청을 닫고, 부탁한 사람이 결과로 다시 시작할 때 붙일 사슬 정보를 돌려준다 */
  close(reqId: string | undefined): HelpCtx | null {
    const r = reqId ? this.reqs.get(reqId) : undefined
    if (!r || !reqId) return null
    this.reqs.delete(reqId)
    this.roots.get(r.rootId)?.open.delete(reqId)
    return { rootId: r.rootId, path: r.path.slice(0, -1) }
  }

  /** 직원이 일을 마쳤다: 그 직원이 연 원업무 중 끝난 것(열린 요청 없음·돌아올 결과 없음)은 센 횟수를 비운다 */
  release(staffId: string, keptOrigins: readonly HelpOriginLike[], isLive: (reqId: string) => boolean = () => true) {
    for (const [rootId, root] of this.roots) {
      for (const id of [...root.open]) if (!isLive(id)) this.close(id)
      if (root.owner !== staffId || root.open.size > 0) continue
      if (keptOrigins.some((o) => o.help?.rootId === rootId)) continue
      this.roots.delete(rootId)
    }
  }
}

/** 팀장·랩 리드가 아닌 팀원(위임 대상 없음 + 도움 대상 있음)인가 — 카드 배정 대신 도움 요청을 써야 한다 */
export const mustUseHelp = (delegateCount: number, helpTargetCount: number) => delegateCount === 0 && helpTargetCount > 0
