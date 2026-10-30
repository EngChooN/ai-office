// 직원 상호작용 연출 7종 (일 넘겨주기·어깨 너머 검토·막힘 도움·완료 축하·업무 수다·커피 심부름·클릭 반응).
// 스냅샷 변화 → 연출 이벤트, 종류별 쿨다운, 직원별 큐, 연출 단계를 순수 함수로 둔다. 실행(걷기·자세·말풍선)은 IsoOfficeScene이 한다.
// 연출은 화면에서만 한다 — 업무 처리·저장에는 영향이 없다. AI 호출도 하지 않는다(업무 수다는 업무 기록 제목을 자른다)
import type { LogEntry, Staff, Task, Team } from '../types'
import type { Cell } from './grid.ts'
import { FACE_STEP, type Rot } from './furniture.ts'

/**
 * handoff 일 넘겨주기(팀장 → 팀원) · report 보고(팀원 → 팀장) · review 어깨 너머 검토 👀 · approve 승인 👍 ·
 * help 막힌 동료 돕기 ? · highFive 하위 업무 모두 끝 · clap 레벨업 박수 · chat 업무 내용 수다 · coffee 커피 심부름 · wave 클릭 반응
 */
export type InteractionKind = 'handoff' | 'report' | 'review' | 'approve' | 'help' | 'highFive' | 'clap' | 'chat' | 'coffee' | 'wave'
export const INTERACTION_KINDS: InteractionKind[] = ['handoff', 'report', 'review', 'approve', 'help', 'highFive', 'clap', 'chat', 'coffee', 'wave']

/** actor = 움직이는 사람, target = 상대 (없을 수 있다). at = 큐에 들어온 때 */
export interface Interaction {
  kind: InteractionKind
  actor: string
  target?: string
  /** 업무 수다 한 줄 */
  text?: string
  at: number
  /** 개발용 미리보기 — 막힘 도움도 대상이 실제로 막혀 있는지 보지 않는다 */
  isPreview?: true
}

/** 막힌 직원 — 도울 사람(가까운 쉬는 동료)은 위치를 아는 장면이 고른다 (pickHelper) */
export interface StuckEvent {
  kind: 'stuck'
  target: string
  at: number
}

// ── 스냅샷 변화 → 이벤트 ─────────────────────────────────

export interface IxSnap {
  staff: Pick<Staff, 'id' | 'name' | 'status' | 'teamId' | 'statusSince'>[]
  teams: Pick<Team, 'id' | 'leadId'>[]
  tasks: Pick<Task, 'id' | 'title' | 'status' | 'assigneeId' | 'parentId' | 'updatedAt'>[]
  logs: Pick<LogEntry, 'id' | 'staffId' | 'type' | 'textI18n'>[]
  companyLevel: number
  selectedId: string | null
}

/** 도구로 위임받은 팀원 → 맡긴 팀장 (팀원이 일을 끝내면 팀장에게 보고하러 간다) */
export type DelegateMemo = ReadonlyMap<string, string>

/** 이만큼 일하고 끝낸 직원이 커피 심부름을 간다 */
export const COFFEE_AFTER_MS = 15 * 60_000
/** 하위 업무 완료 하이파이브는 팀장과 팀원 몇 쌍까지 */
const HIGH_FIVE_MAX = 3

/** 팀원 → 팀장: 상위 업무 담당자가 먼저, 없으면 팀장 */
function leadOf(snap: IxSnap, memberId: string, parentId?: string | null) {
  const parent = parentId ? snap.tasks.find((t) => t.id === parentId) : undefined
  if (parent?.assigneeId && parent.assigneeId !== memberId) return parent.assigneeId
  const teamId = snap.staff.find((s) => s.id === memberId)?.teamId
  const lead = teamId ? snap.teams.find((t) => t.id === teamId)?.leadId : null
  return lead && lead !== memberId ? lead : null
}

/**
 * 직전 스냅샷과 비교해 연출할 이벤트를 뽑는다.
 * - 위임: 위임 기록(log.delegate) · 하위 업무가 진행 중이 됨 → handoff(팀장 → 팀원)
 * - 보고: 진행 중 → 완료 → report(팀원 → 팀장) · 도구로 위임받은 일을 끝내고 쉬게 됨 → report
 * - 검토: 진행 중 → 검토 → review(팀장이 팀원 뒤에서 👀) · 검토 → 완료 → approve 👍
 * - 막힘: 결재 대기·오류가 됨 → stuck · 하위 업무가 모두 끝남 → highFive · 회사 레벨업 → 모두 clap · 직원 클릭 → wave
 * - 오래 일하고 끝냄 → coffee
 */
export function detectEvents(prev: IxSnap, next: IxSnap, memo: DelegateMemo, now: number): { events: (Interaction | StuckEvent)[]; memo: Map<string, string> } {
  const events: (Interaction | StuckEvent)[] = []
  const nextMemo = new Map(memo)
  const has = (id: string | null | undefined): id is string => Boolean(id) && next.staff.some((s) => s.id === id)
  const push = (kind: InteractionKind, actor: string | null | undefined, target?: string | null) => {
    if (!has(actor) || (target !== undefined && (!has(target) || target === actor))) return
    events.push({ kind, actor, ...(target ? { target } : {}), at: now })
  }
  // 위임 기록 (도구로 맡김) — 받는 사람은 이름으로 찾는다
  const lastLog = Math.max(0, ...prev.logs.map((l) => l.id))
  for (const l of next.logs) {
    if (l.id <= lastLog || l.type !== 'delegate') continue
    const params = l.textI18n && typeof l.textI18n === 'object' && 'params' in l.textI18n ? l.textI18n.params : undefined
    const name = params?.name
    const member = typeof name === 'string' ? next.staff.find((s) => s.name === name && s.id !== l.staffId) : undefined
    if (!member) continue
    push('handoff', l.staffId, member.id)
    nextMemo.set(member.id, l.staffId)
  }
  // 업무 카드 상태 변화
  const reported = new Set<string>()
  const before = new Map(prev.tasks.map((t) => [t.id, t]))
  for (const t of next.tasks) {
    const p = before.get(t.id)
    const member = t.assigneeId
    if (!member || (p && p.status === t.status && p.assigneeId === t.assigneeId)) continue
    const lead = leadOf(next, member, t.parentId)
    if (t.status === 'doing' && t.parentId && (!p || p.status !== 'doing' || p.assigneeId !== member)) push('handoff', lead, member)
    if (!p || p.assigneeId !== member) continue
    if (p.status === 'doing' && t.status === 'review') push('review', lead, member)
    if (p.status === 'review' && t.status === 'done') push('approve', lead, member)
    if (p.status === 'doing' && t.status === 'done') {
      push('report', member, lead)
      reported.add(member)
    }
  }
  // 하위 업무가 모두 끝남 → 팀장과 팀원 하이파이브
  const doneAll = (s: IxSnap, parentId: string) => {
    const kids = s.tasks.filter((t) => t.parentId === parentId)
    return kids.length > 0 && kids.every((t) => t.status === 'done')
  }
  for (const parent of next.tasks) {
    if (!next.tasks.some((t) => t.parentId === parent.id) || !doneAll(next, parent.id) || doneAll(prev, parent.id)) continue
    const lead = parent.assigneeId
    const members = [...new Set(next.tasks.filter((t) => t.parentId === parent.id).map((t) => t.assigneeId))].filter((id): id is string => Boolean(id) && id !== lead)
    for (const m of members.slice(0, HIGH_FIVE_MAX)) push('highFive', lead, m)
  }
  // 직원 상태 변화
  for (const s of next.staff) {
    const p = prev.staff.find((x) => x.id === s.id)
    if (!p || p.status === s.status) continue
    if (s.status === 'waiting' || s.status === 'error') events.push({ kind: 'stuck', target: s.id, at: now })
    if (p.status === 'working' && s.status === 'idle') {
      const lead = nextMemo.get(s.id)
      if (lead) {
        if (!reported.has(s.id)) push('report', s.id, lead)
        nextMemo.delete(s.id)
      }
      if (now - p.statusSince >= COFFEE_AFTER_MS) push('coffee', s.id)
    }
  }
  if (next.companyLevel > prev.companyLevel) for (const s of next.staff) push('clap', s.id)
  if (next.selectedId && next.selectedId !== prev.selectedId) push('wave', next.selectedId)
  // 없어진 직원의 위임 기억은 지운다
  for (const id of [...nextMemo.keys()]) if (!has(id) || !has(nextMemo.get(id))) nextMemo.delete(id)
  return { events, memo: nextMemo }
}

// ── 쿨다운 · 직원별 큐 ────────────────────────────────────

/** 같은 종류를 같은 사람(막힘 도움은 막힌 사람)에게 다시 하기까지 (ms) */
export const COOLDOWN_MS: Record<InteractionKind, number> = {
  handoff: 15_000,
  report: 15_000,
  review: 30_000,
  approve: 5_000,
  help: 90_000,
  highFive: 60_000,
  clap: 30_000,
  chat: 90_000,
  coffee: 10 * 60_000,
  wave: 3_000,
}
/** 한 사람 앞에 쌓아 둘 연출 수 */
export const QUEUE_MAX = 3
/** 큐에서 이만큼 기다린 연출은 버린다 (이미 지난 일) */
export const QUEUE_TTL_MS = 45_000

export interface Director {
  queue: Record<string, Interaction[]>
  running: Record<string, Interaction>
  /** 쿨다운 키 → 마지막으로 받은 때 */
  last: Record<string, number>
}
export const emptyDirector = (): Director => ({ queue: {}, running: {}, last: {} })

/** 쿨다운 기준: 막힘 도움은 막힌 사람, 상대가 있는 연출은 두 사람 한 쌍(팀장이 여러 팀원과 하이파이브), 나머지는 주인공 */
const cooldownKey = (ix: Pick<Interaction, 'kind' | 'actor' | 'target'>) => {
  if (ix.kind === 'help') return `help:${ix.target}`
  return ix.target ? `${ix.kind}:${ix.actor}:${ix.target}` : `${ix.kind}:${ix.actor}`
}

/** 쿨다운 중이 아니면 받을 수 있다 */
export const isCoolingDown = (d: Director, ix: Pick<Interaction, 'kind' | 'actor' | 'target'>, now: number) => now - (d.last[cooldownKey(ix)] ?? -Infinity) < COOLDOWN_MS[ix.kind]

/**
 * 연출을 holder(기본은 주인공)의 큐에 넣는다. 쿨다운 중·큐가 참·같은 연출이 이미 있으면 그대로 돌려준다.
 * 상대가 다른 층이라 이 층의 상대 쪽이 말풍선만 띄울 때는 holder = 상대 (같은 쿨다운·큐 규칙)
 */
export function offer(d: Director, ix: Interaction, now: number, holder = ix.actor): Director {
  if (isCoolingDown(d, ix, now)) return d
  // 오래 기다린 것부터 버리고 센다 (실행이 막힌 채 지난 일만 쌓여 새 일을 못 받는 일이 없게)
  const q = (d.queue[holder] ?? []).filter((x) => now - x.at <= QUEUE_TTL_MS)
  const isSame = (x: Interaction) => x.kind === ix.kind && x.actor === ix.actor && x.target === ix.target
  if (q.length >= QUEUE_MAX || q.some(isSame) || (d.running[holder] && isSame(d.running[holder]))) return d
  return { ...d, queue: { ...d.queue, [holder]: [...q, ix] }, last: { ...d.last, [cooldownKey(ix)]: now } }
}

/** 막힌 직원이 풀렸다 — 그 사람을 도우러 가려고 기다리던 연출을 모든 큐에서 버린다 (진행 중인 도움은 장면이 접는다) */
export function dropHelpFor(d: Director, target: string): Director {
  let queue: Record<string, Interaction[]> | null = null
  for (const [holder, q] of Object.entries(d.queue)) {
    const rest = q.filter((x) => !(x.kind === 'help' && x.target === target))
    if (rest.length === q.length) continue
    queue ??= { ...d.queue }
    if (rest.length) queue[holder] = rest
    else delete queue[holder]
  }
  return queue ? { ...d, queue } : d
}

/** 쉬고 있는(연출 중이 아닌) 사람의 다음 연출을 꺼낸다. 오래 기다린 것은 버린다 */
export function startNext(d: Director, actor: string, now: number): { d: Director; ix: Interaction | null } {
  if (d.running[actor]) return { d, ix: null }
  const q = (d.queue[actor] ?? []).filter((x) => now - x.at <= QUEUE_TTL_MS)
  const [ix, ...rest] = q
  const queue = { ...d.queue }
  if (rest.length) queue[actor] = rest
  else delete queue[actor]
  if (!ix) return { d: { ...d, queue }, ix: null }
  return { d: { ...d, queue, running: { ...d.running, [actor]: ix } }, ix }
}

/** 연출이 끝났다 */
export function finish(d: Director, actor: string): Director {
  if (!d.running[actor]) return d
  const running = { ...d.running }
  delete running[actor]
  return { ...d, running }
}

/** 새 일이 왔다 — 하던 연출과 기다리던 연출을 모두 버린다 */
export function cancel(d: Director, actor: string): Director {
  if (!d.running[actor] && !d.queue[actor]) return d
  const running = { ...d.running }
  const queue = { ...d.queue }
  delete running[actor]
  delete queue[actor]
  return { ...d, running, queue }
}

/** 연출 중인 사람 (주인공 + 함께 움직이는 상대 — 하이파이브) */
export function involvedIds(d: Director): Set<string> {
  const ids = new Set<string>()
  for (const [holder, ix] of Object.entries(d.running)) {
    ids.add(holder)
    if (holder === ix.actor && ix.target && PARTNER_KINDS.has(ix.kind)) ids.add(ix.target)
  }
  return ids
}
/** 상대도 함께 걸어와 자세를 잡는 연출 */
export const PARTNER_KINDS: ReadonlySet<InteractionKind> = new Set(['highFive'])

// ── 연출 단계 ─────────────────────────────────────────────

/** 장면이 쓰는 자세 묶음 (iso/personArt FIGURE_ANIMS 키) + stand 서기 · keep 하던 자세 그대로 · turn 앉은 채 돌아보기 */
export type IxAnim = 'carry' | 'handOver' | 'peek' | 'highFive' | 'clap' | 'cup' | 'cupPut' | 'wave' | 'stand' | 'keep' | 'turn'

/**
 * target 상대 옆 · behind 상대 의자 뒤 · meet 두 사람이 만나는 칸(상대도 옆 칸으로 온다) ·
 * coffee 커피 머신·정수기·자판기 · home 끝 (일하는 중이면 자리로, 쉬는 중이면 다시 쉬러)
 */
export type IxPlace = 'target' | 'behind' | 'meet' | 'coffee' | 'home'

export type IxStep =
  | { do: 'walk'; to: IxPlace; carry?: 'paper' | 'cup' }
  | { do: 'act'; anim: IxAnim; ms: number; emote?: string; say?: string; partnerAnim?: IxAnim; partnerEmote?: string }

/** 커피를 뽑아 오는 길에 동료 자리에 컵을 놓아 주는 비율 (장면이 target을 정한다) */
export const CUP_SHARE_RATE = 0.35

/** 연출 하나의 단계. isSitting = 주인공이 지금 앉아 있다 (클릭 반응: 앉았으면 돌아보기만) */
export function stepsOf(ix: Interaction, opts: { isSitting?: boolean } = {}): IxStep[] {
  switch (ix.kind) {
    case 'handoff':
    case 'report':
      return [{ do: 'walk', to: 'target', carry: 'paper' }, { do: 'act', anim: 'handOver', ms: 1400 }, { do: 'walk', to: 'home' }]
    case 'review':
      return [{ do: 'walk', to: 'behind' }, { do: 'act', anim: 'peek', ms: 2800, emote: '👀' }, { do: 'walk', to: 'home' }]
    case 'approve':
      return [{ do: 'act', anim: 'keep', ms: 600, emote: '👍', partnerEmote: '👍' }]
    case 'help':
      return [{ do: 'walk', to: 'target' }, { do: 'act', anim: 'stand', ms: 2600, emote: '?' }, { do: 'walk', to: 'home' }]
    case 'highFive':
      return [{ do: 'walk', to: 'meet' }, { do: 'act', anim: 'highFive', ms: 1200, partnerAnim: 'highFive' }, { do: 'walk', to: 'home' }]
    case 'clap':
      return [{ do: 'act', anim: opts.isSitting ? 'keep' : 'clap', ms: 1800, ...(opts.isSitting ? { emote: '🎉' } : {}) }]
    case 'chat':
      return [{ do: 'act', anim: 'keep', ms: 2600, say: ix.text }]
    case 'coffee':
      return [
        { do: 'walk', to: 'coffee' },
        { do: 'act', anim: 'cup', ms: 1500, emote: '☕' },
        ...(ix.target ? [{ do: 'walk', to: 'target', carry: 'cup' } as IxStep, { do: 'act', anim: 'cupPut', ms: 1200, partnerEmote: '☕' } as IxStep] : []),
        { do: 'walk', to: 'home', ...(ix.target ? {} : { carry: 'cup' as const }) },
      ]
    case 'wave':
      return [{ do: 'act', anim: opts.isSitting ? 'turn' : 'wave', ms: 1400 }]
  }
}

/** 상대가 다른 층이면 걸어가지 않고 말풍선만. side = 이 층에 있는 쪽, name = 다른 쪽 이름 */
export function fallbackOf(ix: Interaction, side: 'actor' | 'target', name: string): { emote?: string; say?: string } {
  switch (ix.kind) {
    case 'handoff':
    case 'report':
      return { say: side === 'actor' ? `📄 → ${name}` : `📄 ← ${name}` }
    case 'review':
      return { emote: '👀' }
    case 'approve':
      return { emote: '👍' }
    case 'highFive':
      return { emote: '✅' }
    case 'help':
      return { emote: '?' }
    case 'coffee':
      return { emote: '☕' }
    default:
      return {}
  }
}

// ── 업무 수다 ─────────────────────────────────────────────

/** 업무 수다 한 줄 길이 (글자) */
export const CHAT_LINE_MAX = 20

/** 이 직원이 최근에 맡은 업무 제목을 한 줄로 (AI 호출 없음). 없으면 null */
export function chatLine(staffId: string, tasks: IxSnap['tasks'], max = CHAT_LINE_MAX): string | null {
  let best: IxSnap['tasks'][number] | undefined
  for (const t of tasks) if (t.assigneeId === staffId && t.title.trim() && (!best || t.updatedAt > best.updatedAt)) best = t
  if (!best) return null
  const line = best.title.replace(/\s+/g, ' ').trim()
  const chars = [...line]
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : line
}

// ── 칸 고르기 ─────────────────────────────────────────────

const AROUND: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
const dist = (a: Cell, b: Cell) => Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy)

/** 막힌 사람에게 가장 가까운 쉬는 동료 (같으면 id 순). 없으면 null */
export function pickHelper(stuck: Cell, candidates: (Cell & { id: string })[]): string | null {
  let best: (Cell & { id: string }) | null = null
  for (const c of candidates) if (!best || dist(c, stuck) < dist(best, stuck) || (dist(c, stuck) === dist(best, stuck) && c.id < best.id)) best = c
  return best?.id ?? null
}

/** 상대 옆 빈 칸 — 오는 사람(from)에게 가까운 쪽. 없으면 null */
export function besideCell(target: Cell, from: Cell, isFree: (c: Cell) => boolean): Cell | null {
  const cells = AROUND.map(([dx, dy]) => ({ gx: target.gx + dx, gy: target.gy + dy })).filter(isFree)
  cells.sort((a, b) => dist(a, from) - dist(b, from) || a.gy - b.gy || a.gx - b.gx)
  return cells[0] ?? null
}

/** 앉은 사람 뒤 빈 칸 (보는 방향의 반대) — 바로 뒤가 막혔으면 뒤 대각선, 그것도 없으면 옆 */
export function behindCell(seat: Cell & { face: Rot }, from: Cell, isFree: (c: Cell) => boolean): Cell | null {
  const [dx, dy] = FACE_STEP[seat.face]
  const back = { gx: seat.gx - dx, gy: seat.gy - dy }
  const diag = [
    { gx: back.gx + dy, gy: back.gy + dx },
    { gx: back.gx - dy, gy: back.gy - dx },
  ]
  for (const c of [back, ...diag.sort((a, b) => dist(a, from) - dist(b, from))]) if (isFree(c)) return c
  return besideCell(seat, from, isFree)
}

/** 하이파이브 자리: mid에서 가까운, 가로(+gx)로 붙은 빈 칸 두 개 [↘ 볼 사람, ↖ 볼 사람]. r칸 안에 없으면 null */
export function meetPair(mid: Cell, isFree: (c: Cell) => boolean, r = 5): [Cell, Cell] | null {
  let best: [Cell, Cell] | null = null
  let bestD = Infinity
  for (let gy = mid.gy - r; gy <= mid.gy + r; gy++)
    for (let gx = mid.gx - r; gx <= mid.gx + r; gx++) {
      const a = { gx, gy }
      const b = { gx: gx + 1, gy }
      const d = dist(a, mid) + dist(b, mid)
      if (d < bestD && isFree(a) && isFree(b)) {
        best = [a, b]
        bestD = d
      }
    }
  return best
}
