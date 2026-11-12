import { mentionTargets, pickResponder, type MentionTarget, type ResponderCandidate } from './mention.ts'
import type { ChatMessage, Lab, Staff, Team } from './types'

// 대화방: 전체 방(room 없음) + 고용 팀마다 방 하나(room = 팀 id) + 랩마다 방 하나(room = 'lab:<랩 id>')
// 팀 방 room 값은 예전 그대로 팀 id라 기존 데이터와 호환된다

type TeamLike = Pick<Team, 'id' | 'name' | 'leadId' | 'kind'> & { isPractice?: boolean }
type LabLike = Pick<Lab, 'id' | 'name' | 'leadId' | 'memberIds'> & { isPractice?: boolean }
type StaffLike = Pick<Staff, 'id' | 'name' | 'teamId'>

/** 방이 있는 팀 — project 종류(외부 프로젝트 묶음)와 튜토리얼 연습 팀은 방을 만들지 않는다 */
export function roomTeams<T extends TeamLike>(teams: T[]): T[] {
  return teams.filter((t) => t.kind === 'hired' && !t.isPractice)
}

/** 팀 방 참여 직원: 그 팀 고용 직원 + 팀장 (팀장이 다른 팀 소속이어도 들어온다) */
export function roomMembers<S extends StaffLike>(team: Pick<Team, 'id' | 'leadId'>, hired: S[]): S[] {
  return hired.filter((s) => s.teamId === team.id || s.id === team.leadId)
}

/** 팀 방에서 부를 수 있는 대상: 방 참여 직원과 @전체(= 그 팀 전원). 다른 팀·랩은 부르지 않는다 */
export function roomMentionTargets(team: Pick<Team, 'id' | 'leadId'>, hired: StaffLike[]): MentionTarget[] {
  return mentionTargets(roomMembers(team, hired), [], [])
}

/** 팀·랩 방에서 아무도 부르지 않은 글을 받을 직원: 팀장·랩 리드(방에 있고 예산이 남았으면) → 없으면 방 안에서 pickResponder */
export function pickRoomResponder(text: string, leadId: string | null, candidates: ResponderCandidate[]): string | null {
  const lead = leadId ? candidates.find((c) => c.id === leadId && !c.isOverBudget) : undefined
  return lead ? lead.id : pickResponder(text, candidates)
}

/** 멘션 없이 보낸 글을 받을 직원 (sendChat과 같은 규칙): 팀·랩 방은 리드 → 방 안에서 한 명, 전체 방은 알맞은 한 명 */
export function chatResponder(text: string, info: Pick<ChatRoomInfo, 'leadId'> | undefined, candidates: ResponderCandidate[]): string | null {
  return info ? pickRoomResponder(text, info.leadId, candidates) : pickResponder(text, candidates)
}

// ── 랩 방 ──────────────────────────────────────────────

/** 랩 방 room 값 머리 — 팀 id(무작위 UUID)와 겹치지 않는다 */
export const LAB_ROOM_PREFIX = 'lab:'

/** 랩 id → 랩 방 room 값 */
export const labRoomId = (labId: string) => `${LAB_ROOM_PREFIX}${labId}`

/** room 값이 가리키는 방 종류와 팀·랩 id (빈 값 = 전체 방 → undefined) */
export function parseRoom(room: string | null | undefined): { kind: 'team' | 'lab'; id: string } | undefined {
  if (!room) return undefined
  if (room.startsWith(LAB_ROOM_PREFIX)) {
    const id = room.slice(LAB_ROOM_PREFIX.length)
    return id ? { kind: 'lab', id } : undefined
  }
  return { kind: 'team', id: room }
}

/** 방이 있는 랩 — 튜토리얼 연습 랩은 방을 만들지 않는다 */
export function roomLabs<L extends { isPractice?: boolean }>(labs: L[]): L[] {
  return labs.filter((l) => !l.isPractice)
}

/** 랩 방 참여 직원: 랩 멤버 + 랩 리드 가운데 고용 직원 (여러 팀에서 모인다) */
export function labRoomMembers<S extends StaffLike>(lab: Pick<Lab, 'leadId' | 'memberIds'>, hired: S[]): S[] {
  return hired.filter((s) => lab.memberIds.includes(s.id) || s.id === lab.leadId)
}

/** 랩 방에서 부를 수 있는 대상: 방 참여 직원과 @전체(= 랩 전원). 다른 팀·랩은 부르지 않는다 */
export function labRoomMentionTargets(lab: Pick<Lab, 'leadId' | 'memberIds'>, hired: StaffLike[]): MentionTarget[] {
  return mentionTargets(labRoomMembers(lab, hired), [], [])
}

/** 팀 방·랩 방 공통 정보 */
export type ChatRoomInfo<T extends TeamLike = TeamLike, L extends LabLike = LabLike> = { kind: 'team'; room: string; name: string; leadId: string | null; team: T } | { kind: 'lab'; room: string; name: string; leadId: string | null; lab: L }

/** room 값 → 지금 있는 팀 방·랩 방 (없어졌거나 방이 없는 팀·랩이면 undefined = 전체 방) */
export function findRoom<T extends TeamLike, L extends LabLike>(room: string | null | undefined, teams: T[], labs: L[]): ChatRoomInfo<T, L> | undefined {
  const parsed = parseRoom(room)
  if (!parsed || !room) return undefined
  if (parsed.kind === 'lab') {
    const lab = roomLabs(labs).find((l) => l.id === parsed.id)
    return lab ? { kind: 'lab', room, name: lab.name, leadId: lab.leadId, lab } : undefined
  }
  const team = roomTeams(teams).find((t) => t.id === parsed.id)
  return team ? { kind: 'team', room, name: team.name, leadId: team.leadId, team } : undefined
}

/** 방 참여 직원 (팀 방·랩 방) */
export function chatRoomMembers<S extends StaffLike>(info: ChatRoomInfo, hired: S[]): S[] {
  return info.kind === 'lab' ? labRoomMembers(info.lab, hired) : roomMembers(info.team, hired)
}

/** 방 안에서 부를 수 있는 대상 (팀 방·랩 방) */
export function chatRoomMentionTargets(info: ChatRoomInfo, hired: StaffLike[]): MentionTarget[] {
  return mentionTargets(chatRoomMembers(info, hired), [], [])
}

/** 방에서 보낸 지시의 머리말: 팀 방 "[팀이름 방]", 랩 방 "[랩이름 랩]" */
export function roomHead(info: Pick<ChatRoomInfo, 'kind' | 'name'>): string {
  return info.kind === 'lab' ? `[${info.name} 랩]` : `[${info.name} 방]`
}

/** 전체 방에서 시작된 일임을 뜻하는 명시값 — room이 undefined면 "정해지지 않음"이라 소속 방으로 간다 */
export const GLOBAL_ROOM = ''

/** 지시 출처들에서 결과를 올릴 방 — 첫 번째로 방이 정해진 지시의 값. GLOBAL_ROOM('')이면 전체 방에서 온 지시, undefined면 정해진 방 없음 */
export function originRoom(origins: { room?: string }[]): string | undefined {
  return origins.find((o) => o.room !== undefined)?.room
}

/**
 * 직원의 소속 방: 고용 팀에 방이 있으면 그 팀 방, 아니면 방 있는 랩 중 소속이 하나뿐이거나 리드인 랩이 하나면 그 랩 방.
 * 그래도 하나로 정해지지 않으면 undefined (= 전체 방)
 */
export function homeRoom(staff: Pick<Staff, 'id' | 'teamId'>, teams: TeamLike[], labs: LabLike[]): string | undefined {
  const team = roomTeams(teams).find((t) => t.id === staff.teamId)
  if (team) return team.id
  const mine = roomLabs(labs).filter((l) => l.memberIds.includes(staff.id) || l.leadId === staff.id)
  const led = mine.filter((l) => l.leadId === staff.id)
  const pick = mine.length === 1 ? mine[0] : led.length === 1 ? led[0] : undefined
  return pick ? labRoomId(pick.id) : undefined
}

/** 지금 있는 방인가 — 전체 방('')은 항상 있고, 팀·랩 방은 팀·랩이 남아 있어야 한다 */
export function roomExists(room: string, teams: TeamLike[], labs: LabLike[]): boolean {
  return room === GLOBAL_ROOM || findRoom(room, teams, labs) !== undefined
}

type OriginLike = { kind?: string; room?: string; taskId?: string }

/** 지시 하나가 가리키는 방: 지시에 실린 방 → 업무 카드의 방. 둘 다 없거나 없어진 방이면 undefined (소속 방으로 넘어간다) */
export function resolveOriginRoom(o: OriginLike, taskRoomOf: (taskId: string) => string | undefined, isRoom: (room: string) => boolean = () => true): string | undefined {
  if (o.room !== undefined && isRoom(o.room)) return o.room
  if (o.kind === 'task' && o.taskId) {
    const r = taskRoomOf(o.taskId)
    if (r !== undefined && isRoom(r)) return r
  }
  return undefined
}

/**
 * 지시들이 올라갈 방들 — "각 방에서 한 말은 그 방에만". 지시마다 (지시 방 → 카드 방)을 보고, 모두 없으면 직원의 소속 방 → 전체 방.
 * 한 턴에 여러 방의 지시가 섞였으면 방이 여럿(지시 순서, 중복 없음). 돌려주는 ''은 전체 방
 */
export function roomsForOrigins(origins: readonly OriginLike[], taskRoomOf: (taskId: string) => string | undefined, home: string | undefined, isRoom?: (room: string) => boolean): string[] {
  const rooms: string[] = []
  for (const o of origins) {
    const r = resolveOriginRoom(o, taskRoomOf, isRoom)
    if (r !== undefined && !rooms.includes(r)) rooms.push(r)
  }
  return rooms.length ? rooms : [home ?? GLOBAL_ROOM]
}

/** 대표 방 하나만 필요할 때(질문·결재·오류 알림 등): roomsForOrigins의 첫 방 */
export function roomForOrigins(origins: readonly OriginLike[], taskRoomOf: (taskId: string) => string | undefined, home: string | undefined, isRoom?: (room: string) => boolean): string {
  return roomsForOrigins(origins, taskRoomOf, home, isRoom)[0]
}

type RoomCard = { fromChat?: { room: string | null } | null; parentId?: string | null; labId?: string | null }

/**
 * 업무 카드의 방: 대화 지시로 만든 카드면 그 방(전체 방이면 GLOBAL_ROOM), 기획 하위 업무면 기획 카드의 방, 랩 카드면 랩 방.
 * 그 밖은 undefined (= 정해진 방 없음 → 담당 직원의 소속 방). labRoom은 방이 있는 랩이면 그 방을 돌려준다
 */
export function cardRoom(taskId: string, getTask: (id: string) => RoomCard | undefined, labRoom: (labId: string) => string | undefined): string | undefined {
  let task = getTask(taskId)
  for (let depth = 0; task && depth < 6; depth++) {
    if (task.fromChat) return task.fromChat.room ?? GLOBAL_ROOM
    if (!task.parentId) return task.labId ? labRoom(task.labId) : undefined
    task = getTask(task.parentId)
  }
  return undefined
}

/** 단체방 한 줄: 메시지 그대로이거나, 전체 방에서 팀 방 글을 접은 요약 */
export type ChatLine = { kind: 'message'; message: ChatMessage } | { kind: 'roomSummary'; room: string; count: number; firstId: number; lastId: number; ts: number }

/**
 * 방 하나에 보여 줄 줄. 팀·랩 방이면 그 방 글만, 전체 방이면 전체 방 글 사이사이에
 * 팀·랩 방 글을 방마다 "새 글 N개" 한 줄로 접는다 (전체 방 글 사이 구간마다, 처음 나온 방 순서)
 */
export function chatLines(messages: ChatMessage[], room: string | undefined): ChatLine[] {
  if (room) return messages.filter((m) => m.room === room).map((message) => ({ kind: 'message', message }))
  const lines: ChatLine[] = []
  let open = new Map<string, Extract<ChatLine, { kind: 'roomSummary' }>>()
  for (const m of messages) {
    if (!m.room) {
      open = new Map()
      lines.push({ kind: 'message', message: m })
      continue
    }
    const summary = open.get(m.room)
    if (summary) {
      summary.count += 1
      summary.lastId = m.id
      summary.ts = m.ts
      continue
    }
    const added = { kind: 'roomSummary' as const, room: m.room, count: 1, firstId: m.id, lastId: m.id, ts: m.ts }
    open.set(m.room, added)
    lines.push(added)
  }
  return lines
}

/** 새 메시지를 붙인다: 같은 id면 제자리에서 바꾸고(결재 결과), 방마다 최근 max개만 둔다 */
export function appendChat(chat: ChatMessage[], m: ChatMessage, max: number): ChatMessage[] {
  if (chat.some((x) => x.id === m.id)) return chat.map((x) => (x.id === m.id ? m : x))
  const next = [...chat, m]
  const inRoom = next.filter((x) => (x.room ?? '') === (m.room ?? ''))
  if (inRoom.length <= max) return next
  const drop = inRoom[0]
  return next.filter((x) => x !== drop)
}
