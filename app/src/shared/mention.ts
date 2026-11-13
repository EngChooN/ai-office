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
export const MENTION_KIND_LABEL: Record<MentionKind, string> = { all: '전체', team: '팀', lab: '프로젝트', staff: '직원' }
/** 예전 이름(랩)으로 붙인 종류도 계속 알아듣는다 — v1.3.2에서 '랩'을 '프로젝트'로 바꿨다 */
const LEGACY_KIND_LABEL: Partial<Record<MentionKind, string>> = { lab: '랩' }

/** 종류를 붙인 멘션 — 이름이 같은 직원·팀·프로젝트를 구분한다 (예: "@디자인(팀)") */
const qualifiedToken = (t: MentionTarget, label = MENTION_KIND_LABEL[t.kind]) => `@${t.name}(${label})`

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

export interface MentionSpan {
  start: number
  end: number
  target: MentionTarget
}

/** 찾은 순서(긴 멘션 → 종류 순)대로의 멘션 자리. 잡은 자리는 가려서 "@개발팀" 안의 "@개발"을 다시 잡지 않는다 */
function scanMentions(text: string, targets: MentionTarget[]): MentionSpan[] {
  const tokens = targets
    .filter((t) => t.name)
    .flatMap((t) => {
      const legacy = LEGACY_KIND_LABEL[t.kind]
      return [{ t, token: qualifiedToken(t) }, ...(legacy ? [{ t, token: qualifiedToken(t, legacy) }] : []), { t, token: `@${t.name}` }]
    })
    .sort((a, b) => b.token.length - a.token.length || KIND_ORDER[a.t.kind] - KIND_ORDER[b.t.kind])
  const spans: MentionSpan[] = []
  let rest = text
  for (const { t, token } of tokens) {
    for (let i = rest.indexOf(token); i !== -1; i = rest.indexOf(token, i + token.length)) {
      spans.push({ start: i, end: i + token.length, target: t })
      rest = rest.slice(0, i) + '\0'.repeat(token.length) + rest.slice(i + token.length)
    }
  }
  return spans
}

/**
 * 글 속 멘션 자리 (앞에서부터). 단체방이 받는 사람을 고르는 규칙(parseMentions)과 같다 — 입력칸·말풍선 강조에 쓴다.
 * 이름 바로 뒤에 조사·문장부호가 붙어도("@김버전님", "@김버전,") 이름까지만 잡는다
 */
export function mentionSpans(text: string, targets: MentionTarget[]): MentionSpan[] {
  return scanMentions(text, targets).sort((a, b) => a.start - b.start)
}

/**
 * 메시지에서 @대상을 찾는다. 긴 멘션부터 잡고 잡은 자리는 지워서 "@개발팀"이 "@개발"로도 잡히지 않게 한다.
 * 종류를 붙인 "@디자인(팀)"이 먼저 잡히고, 종류 없는 "@디자인"은 이름이 겹치면 직원 → 팀 → 랩 → 전체 순으로 하나만 잡는다.
 * 없는 이름의 @단어는 멘션으로 보지 않는다.
 */
export function parseMentions(text: string, targets: MentionTarget[]): ParsedMentions {
  const spans = scanMentions(text, targets)
  const matched = [...new Set(spans.map((s) => s.target))]
  let body = text
  for (const s of [...spans].sort((a, b) => b.start - a.start)) body = `${body.slice(0, s.start)} ${body.slice(s.end)}`
  const all = matched.flatMap((t) => t.memberIds)
  const recipientIds = [...new Set(all)]
  return { matched, recipientIds, duplicates: all.length - recipientIds.length, body: body.replace(/[ \t]{2,}/g, ' ').trim() }
}

/**
 * 📘 매뉴얼·/ 명령 버튼: 입력칸에 넣을 "@받는사람 /"와 고른 명령 뒤에 다시 붙일 쓰던 글.
 * 받는 사람은 쓰던 글의 멘션(글 중간에 있어도) → 없으면 fallbackId(멘션 없이 보낼 때 받을 직원). 정할 수 없으면 null.
 * 받는 사람을 늘 채워 넣어 바로 메뉴가 뜨게 한다 — 예전엔 전체 방에서 "@"만 넣어 @ 후보 창이 떴다
 */
export function slashButtonDraft(draft: string, targets: MentionTarget[], fallbackId: string | null): { draft: string; rest: string } | null {
  const parsed = draft.trim() ? parseMentions(draft, targets) : null
  const called = parsed?.matched.filter((tg) => tg.memberIds.length > 0) ?? []
  const fallback = targets.find((tg) => tg.kind === 'staff' && tg.memberIds[0] === fallbackId)
  const heads = called.length > 0 ? called : fallback ? [fallback] : []
  if (heads.length === 0) return null
  const body = called.length > 0 ? parsed!.body : draft.trim()
  return { draft: `${heads.map((tg) => mentionToken(tg, targets)).join(' ')} /`, rest: body.startsWith('/') ? '' : body }
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

const STATUS_ORDER: Record<StaffStatus, number> = { idle: 0, working: 1, netWait: 1, waiting: 2, offline: 3, error: 4 }

/** 직무 이름만으로는 안 잡히는 일 낱말 (직무에 앞 낱말이 들어 있으면 뒤 낱말도 맞춰 본다) */
const ROLE_EXTRA_WORDS: readonly [string, readonly string[]][] = [
  ['디자', ['디자인', '시안', 'UI']],
  ['CS', ['문의', '고객', '답변', '응대']],
  ['응대', ['문의', '고객', '답변', 'CS']],
  ['마케', ['마케팅', '홍보', '광고', '캠페인']],
]

/** 직무에서 메시지와 맞춰 볼 낱말 ("프론트엔드 개발자" → 프론트엔드, 개발자, 개발) */
function roleWords(role: string) {
  const extra = ROLE_EXTRA_WORDS.filter(([key]) => role.includes(key)).flatMap(([, words]) => words)
  return role
    .split(/[\s·,/()]+/)
    .filter((w) => w.length >= 2)
    .flatMap((w) => [w, w.replace(/[자어너러]$/, '')])
    .filter((w) => w.length >= 2)
    .concat(extra)
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
