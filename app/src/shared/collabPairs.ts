// 프로젝트 간 협업 승인 판정 (순수 함수 — main/office.ts가 부르고 scripts/collabPairs.test.mts가 시험한다).
// 다른 프로젝트로 가는 첫 협업 요청은 대표 결재, 승인된 프로젝트 쌍은 그때의 작업 폴더와 함께 저장해 다음부터 통과시킨다.
// 단체방을 만드는 것만으로는 쌍을 승인하지 않는다 (협업 자동 통과는 결재 카드에서 대표가 따로 승인).

/** 협업 단위 하나: 프로젝트(lab id)나, 프로젝트가 없는 직원이면 팀(`team:<id>`). cwd는 그 프로젝트의 일하는 곳(팀이면 null) */
export interface CollabScope {
  key: string
  cwd: string | null
}

/** 대표가 승인한 프로젝트 쌍 — cwds는 pair 키 순서(정렬된 a|b)대로, 승인할 때의 작업 폴더 */
export interface ApprovedPair {
  pair: string
  cwds: [string | null, string | null]
  approvedAt: number
}

/** 승인 카드에 보일 이유: 처음 만나는 쌍·승인 뒤 폴더가 바뀜·서로 다른 폴더를 오감·토큰 예산 초과 */
export type CollabReason = 'newPair' | 'folderChanged' | 'otherFolder' | 'overBudget'

export interface CollabCheck {
  /** 비어 있으면 결재 없이 통과 */
  reasons: CollabReason[]
  /** 승인하면 저장할 쌍 (overBudget만 있으면 비어 있다 — 예산 승인은 기억하지 않는다) */
  drafts: ApprovedPair[]
  /** 두 쪽이 같은 폴더(같거나 안팎)를 쓰는 쌍이 있으면 그 폴더(받는 쪽 것) — 동시에 고치면 부딪칠 수 있어 경고한다 */
  sameFolder: string | null
  /** 서로 다른 폴더를 오가는 쌍이 있으면 [보내는 쪽, 받는 쪽] 폴더 (카드에 보인다) */
  otherFolders: [string, string] | null
}

export const teamScopeKey = (teamId: string) => `team:${teamId}`

/**
 * 직원의 협업 단위: 속한 프로젝트 전부, 없으면 팀 하나, 둘 다 없으면 빈 목록(판정 안 함).
 * 직원이 작업 폴더를 직접 지정했으면(ownCwd) 실제로 일하는 곳은 그 폴더라 모든 단위의 폴더를 그것으로 본다
 */
export function scopesOf(labs: readonly { id: string; cwd: string | null }[], teamId: string | null, ownCwd: string | null = null): CollabScope[] {
  if (labs.length) return [...labs].sort((a, b) => a.id.localeCompare(b.id)).map((l) => ({ key: l.id, cwd: ownCwd || l.cwd || null }))
  return teamId ? [{ key: teamScopeKey(teamId), cwd: ownCwd || null }] : []
}

/** 순서와 무관한 쌍 키 + 키 순서대로 놓은 폴더 */
export function pairOf(a: CollabScope, b: CollabScope): { pair: string; cwds: [string | null, string | null] } {
  return a.key <= b.key ? { pair: `${a.key}|${b.key}`, cwds: [a.cwd, b.cwd] } : { pair: `${b.key}|${a.key}`, cwds: [b.cwd, a.cwd] }
}

/** 비교용 폴더 문자열: 역슬래시→슬래시, 끝 슬래시 제거, 대소문자 무시 (맥·윈도우 기본 파일 시스템) */
const normDir = (d: string) => d.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** 두 폴더가 같거나 한쪽이 다른 쪽 안에 있는가 (하나라도 없으면 false) */
export function isSameFolder(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const x = normDir(a)
  const y = normDir(b)
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`)
}

/** 두 폴더가 모두 있고 서로 다른 곳인가 */
export const isOtherFolder = (a: string | null, b: string | null) => Boolean(a && b) && !isSameFolder(a, b)

const sameCwds = (x: [string | null, string | null], y: [string | null, string | null]) =>
  (x[0] ? normDir(x[0]) : null) === (y[0] ? normDir(y[0]) : null) && (x[1] ? normDir(x[1]) : null) === (y[1] ? normDir(y[1]) : null)

/** 두 소속 목록이 같은가 (순서 무관, 폴더는 비교용 문자열로) — 결재를 기다리는 사이 소속·폴더가 바뀌었는지 볼 때 쓴다 */
export function sameScopes(a: readonly CollabScope[], b: readonly CollabScope[]): boolean {
  const keyOf = (s: CollabScope) => `${s.key}\n${s.cwd ? normDir(s.cwd) : ''}`
  const x = a.map(keyOf).sort()
  const y = b.map(keyOf).sort()
  return x.length === y.length && x.every((k, i) => k === y[i])
}

/**
 * 협업 요청 한 건의 판정. 두 쪽이 프로젝트를 하나라도 함께하면 같은 프로젝트 안의 일이라 쌍 승인은 묻지 않는다.
 * 아니면 (보내는 쪽 × 받는 쪽) 쌍 중 승인 안 됐거나 승인 뒤 폴더가 바뀐 쌍을 한 카드로 모아 묻는다.
 */
export function checkCollab(input: { from: readonly CollabScope[]; to: readonly CollabScope[]; approved: readonly ApprovedPair[]; isOverBudget: boolean; now: number }): CollabCheck {
  const reasons = new Set<CollabReason>()
  const drafts: ApprovedPair[] = []
  let sameFolder: string | null = null
  let otherFolders: [string, string] | null = null
  const toKeys = new Set(input.to.map((s) => s.key))
  const isShared = input.from.some((s) => toKeys.has(s.key))
  if (!isShared) {
    for (const a of input.from)
      for (const b of input.to) {
        const p = pairOf(a, b)
        if (!sameFolder && isSameFolder(a.cwd, b.cwd)) sameFolder = b.cwd
        const stored = input.approved.find((x) => x.pair === p.pair)
        if (stored && sameCwds(stored.cwds, p.cwds)) continue
        reasons.add(stored ? 'folderChanged' : 'newPair')
        if (a.cwd && b.cwd && isOtherFolder(a.cwd, b.cwd)) {
          reasons.add('otherFolder')
          otherFolders ??= [a.cwd, b.cwd]
        }
        drafts.push({ ...p, approvedAt: input.now })
      }
  }
  if (input.isOverBudget) reasons.add('overBudget')
  const order: CollabReason[] = ['newPair', 'folderChanged', 'otherFolder', 'overBudget']
  return { reasons: order.filter((r) => reasons.has(r)), drafts, sameFolder, otherFolders }
}

/** 단체방 지시 한 번에 함께 받을 수 있는 최대 인원 — 여러 팀·프로젝트를 한꺼번에 돌리는 일의 횟수 한도 */
export const GROUP_MAX_RECIPIENTS = 6

/** 협업 공통 한도 (리더 간 요청·단체방 지시): 받는 사람 수 초과·토큰 예산 초과 */
export type CollabLimit = 'tooMany' | 'overBudget'

export function collabLimit(input: { count: number; max: number; isOverBudget: boolean }): CollabLimit | null {
  if (input.count > input.max) return 'tooMany'
  if (input.isOverBudget) return 'overBudget'
  return null
}

/** 동시에 일할 사람: 이름·협업 단위 키들·실제 작업 폴더 */
export interface FolderEntry {
  name: string
  keys: readonly string[]
  cwds: readonly (string | null)[]
}

/**
 * 서로 다른 협업 단위(프로젝트를 하나도 함께하지 않는)의 두 사람이 같은 폴더(같거나 안팎)를 쓰면 첫 쌍을 돌려준다.
 * 단체방 병렬 지시·리더 간 요청 모두 이 함수로 본다 (같은 프로젝트 안은 원래 같은 폴더라 경고하지 않는다)
 */
export function folderClash(entries: readonly FolderEntry[]): { a: string; b: string; cwd: string } | null {
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      const x = entries[i]
      const y = entries[j]
      if (x.keys.some((k) => y.keys.includes(k))) continue
      for (const cx of x.cwds) for (const cy of y.cwds) if (isSameFolder(cx, cy)) return { a: x.name, b: y.name, cwd: cy! }
    }
  return null
}

/** 승인 목록에 새 쌍을 더한다 (같은 쌍은 새 폴더·시각으로 바꾼다) */
export function withApproved(list: readonly ApprovedPair[], add: readonly ApprovedPair[]): ApprovedPair[] {
  const m = new Map(list.map((x) => [x.pair, x]))
  for (const x of add) m.set(x.pair, x)
  return [...m.values()]
}

/** 저장본 읽기 — 모양이 틀린 줄은 버린다 */
export function parseApprovedPairs(raw: unknown): ApprovedPair[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (x): x is ApprovedPair =>
      !!x && typeof x === 'object' && typeof (x as ApprovedPair).pair === 'string' && Array.isArray((x as ApprovedPair).cwds) && (x as ApprovedPair).cwds.length === 2 && typeof (x as ApprovedPair).approvedAt === 'number',
  )
}
