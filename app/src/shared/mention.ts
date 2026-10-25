import type { Lab, Staff, StaffStatus, Team } from './types'

/** 단체방 안내 줄을 남기는 발신자 (직원 id·'me'와 겹치지 않는다) */
export const OFFICE_SENDER = 'office'
/** 고용 직원 전원을 부르는 멘션 */
export const ALL_MENTION = '전체'

export type MentionKind = 'all' | 'team' | 'lab' | 'staff'

export interface MentionTarget {
  key: string
  kind: MentionKind
  name: string
  color?: string
  /** 고용 직원만 (빈 팀·랩이면 []) */
  memberIds: string[]
}

type StaffLike = Pick<Staff, 'id' | 'name' | 'teamId'>

/** 이름이 같을 때 먼저 잡는 순서: 직원 → 팀 → 랩 → 전체 */
const KIND_ORDER: Record<MentionKind, number> = { staff: 0, team: 1, lab: 2, all: 3 }
export const MENTION_KIND_LABEL: Record<MentionKind, string> = { all: '전체', team: '팀', lab: '랩', staff: '직원' }

/** 종류를 붙인 멘션 — 이름이 같은 직원·팀·랩을 구분한다 (예: "@디자인(팀)") */
const qualifiedToken = (t: MentionTarget) => `@${t.name}(${MENTION_KIND_LABEL[t.kind]})`

/** 자동완성에서 넣을 멘션: 같은 이름의 다른 대상이 있으면 종류를 붙인다 */
export function mentionToken(target: MentionTarget, targets: MentionTarget[]) {
  return targets.some((t) => t.key !== target.key && t.name === target.name) ? qualifiedToken(target) : `@${target.name}`
}

/** 멘션할 수 있는 대상 목록 — 빈 팀·랩도 넣는다 (멘션하면 "구성원이 없어요"로 안내) */
export function mentionTargets(hired: StaffLike[], teams: Pick<Team, 'id' | 'name' | 'color' | 'kind'>[], labs: Pick<Lab, 'id' | 'name' | 'color' | 'memberIds'>[]): MentionTarget[] {
  const hiredIds = new Set(hired.map((s) => s.id))
  return [
    { key: 'all', kind: 'all', name: ALL_MENTION, memberIds: hired.map((s) => s.id) },
    ...teams.filter((t) => t.kind === 'hired').map((t) => ({ key: `team:${t.id}`, kind: 'team' as const, name: t.name, color: t.color, memberIds: hired.filter((s) => s.teamId === t.id).map((s) => s.id) })),
    ...labs.map((l) => ({ key: `lab:${l.id}`, kind: 'lab' as const, name: l.name, color: l.color, memberIds: [...new Set(l.memberIds)].filter((id) => hiredIds.has(id)) })),
    ...hired.map((s) => ({ key: `staff:${s.id}`, kind: 'staff' as const, name: s.name, memberIds: [s.id] })),
  ]
}

export interface ParsedMentions {
  matched: MentionTarget[]
  /** 중복 없이 합친 받는 사람 (매칭 순서대로) */
  recipientIds: string[]
  /** 여러 멘션에 겹쳐 한 번만 받는 인원 */
  duplicates: number
  /** 멘션을 뺀 본문 */
  body: string
}

/**
 * 메시지에서 @대상을 찾는다. 긴 멘션부터 잡고 잡은 자리는 지워서 "@개발팀"이 "@개발"로도 잡히지 않게 한다.
 * 종류를 붙인 "@디자인(팀)"이 먼저 잡히고, 종류 없는 "@디자인"은 이름이 겹치면 직원 → 팀 → 랩 → 전체 순으로 하나만 잡는다.
 * 없는 이름의 @단어는 멘션으로 보지 않는다.
 */
export function parseMentions(text: string, targets: MentionTarget[]): ParsedMentions {
  const tokens = targets
    .filter((t) => t.name)
    .flatMap((t) => [{ t, token: qualifiedToken(t) }, { t, token: `@${t.name}` }])
    .sort((a, b) => b.token.length - a.token.length || KIND_ORDER[a.t.kind] - KIND_ORDER[b.t.kind])
  const matched: MentionTarget[] = []
  let rest = text
  for (const { t, token } of tokens) {
    if (!rest.includes(token)) continue
    if (!matched.includes(t)) matched.push(t)
    rest = rest.replaceAll(token, ' ')
  }
  const all = matched.flatMap((t) => t.memberIds)
  const recipientIds = [...new Set(all)]
  return { matched, recipientIds, duplicates: all.length - recipientIds.length, body: rest.replace(/[ \t]{2,}/g, ' ').trim() }
}

export interface ResponderCandidate {
  id: string
  role: string
  status: StaffStatus
  /** 장비 월 예산을 다 써서 지시를 못 받는 직원 */
  isOverBudget: boolean
  /** 팀장·랩 리드 (Team.leadId·Lab.leadId) — 받은 일을 위임할 수 있다 */
  isLead: boolean
}

const STATUS_ORDER: Record<StaffStatus, number> = { idle: 0, working: 1, waiting: 2, offline: 3, error: 4 }

/** 직무에서 메시지와 맞춰 볼 낱말 ("프론트엔드 개발자" → 프론트엔드, 개발자, 개발) */
function roleWords(role: string) {
  return role
    .split(/[\s·,/()]+/)
    .filter((w) => w.length >= 2)
    .flatMap((w) => [w, w.replace(/[자어너러]$/, '')])
    .filter((w) => w.length >= 2)
}

/**
 * 멘션 없는 메시지를 받을 직원 한 명 (규칙 기반, AI 호출 없음).
 * 1) 직무 낱말이 메시지에 많이 나오는 직원 2) 없으면 팀장·랩 리드(위임할 수 있으니) 3) 한가한 상태 순. 예산을 다 쓴 직원은 뺀다.
 */
export function pickResponder(text: string, candidates: ResponderCandidate[]): string | null {
  const lower = text.toLowerCase()
  const scored = candidates
    .filter((c) => !c.isOverBudget)
    .map((c, i) => ({ c, i, score: new Set(roleWords(c.role).filter((w) => lower.includes(w.toLowerCase()))).size }))
  if (scored.length === 0) return null
  const hasMatch = scored.some((x) => x.score > 0)
  scored.sort((a, b) => b.score - a.score || (hasMatch ? 0 : Number(b.c.isLead) - Number(a.c.isLead)) || STATUS_ORDER[a.c.status] - STATUS_ORDER[b.c.status] || a.i - b.i)
  return scored[0].c.id
}
