import { mentionTargets, pickResponder, type MentionTarget, type ResponderCandidate } from './mention.ts'
import type { ChatMessage, Staff, Team } from './types'

// 팀 대화방: 전체 방(room 없음) + 고용 팀마다 방 하나. 방 id = 팀 id

type TeamLike = Pick<Team, 'id' | 'name' | 'leadId' | 'kind'> & { isPractice?: boolean }
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

/** 팀 방에서 아무도 부르지 않은 글을 받을 직원: 팀장(방에 있고 예산이 남았으면) → 없으면 방 안에서 pickResponder */
export function pickRoomResponder(text: string, leadId: string | null, candidates: ResponderCandidate[]): string | null {
  const lead = leadId ? candidates.find((c) => c.id === leadId && !c.isOverBudget) : undefined
  return lead ? lead.id : pickResponder(text, candidates)
}

/** 지시 출처들에서 결과를 올릴 방 — 팀 방에서 온 지시가 있으면 그 방, 없으면 전체 방(undefined) */
export function originRoom(origins: { room?: string }[]): string | undefined {
  return origins.find((o) => o.room)?.room
}

/** 단체방 한 줄: 메시지 그대로이거나, 전체 방에서 팀 방 글을 접은 요약 */
export type ChatLine = { kind: 'message'; message: ChatMessage } | { kind: 'roomSummary'; room: string; count: number; firstId: number; lastId: number; ts: number }

/**
 * 방 하나에 보여 줄 줄. 팀 방이면 그 방 글만, 전체 방이면 전체 방 글 사이사이에
 * 팀 방 글을 방마다 "새 글 N개" 한 줄로 접는다 (전체 방 글 사이 구간마다, 처음 나온 방 순서)
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
