import type { Meeting } from './types.ts'

// 회의 중 화면의 바퀴·차례: 저장 필드 없이 발언 수로 계산한다.
// 근거: 발언 1번마다 messages에 정확히 1개가 쌓이고(비어도 "(발언 없음)"), 순서는 시작할 때 정한 participantIds 그대로다 (main runMeeting)

export interface MeetingProgress {
  /** 지금 바퀴 (1부터) */
  round: number
  rounds: number
  /** 지금 바퀴에서 몇 명이 말했나 (막대 채우기) */
  spokenInRound: number
  /** 이번 바퀴 발언을 마친 사람 */
  doneIds: string[]
  /** 지금 말하는 사람 (결정 대기·회의록 쓰는 중이면 없음) */
  speakingId: string | null
  /** 그다음 차례 */
  nextId: string | null
  /** speaking = 발언 중 · decision = 대표 결정 기다리는 중 · minutes = 진행자가 회의록 쓰는 중 */
  state: 'speaking' | 'decision' | 'minutes'
}

/** 진행 중인 회의의 바퀴·차례. 연습·데모데이·끝난 회의·참석자 없음은 null (기존 화면을 쓴다) */
export function meetingProgress(m: Pick<Meeting, 'participantIds' | 'rounds' | 'messages' | 'status' | 'kind' | 'isPractice' | 'phase'>): MeetingProgress | null {
  const ids = m.participantIds
  const k = ids.length
  if (m.kind === 'demo' || m.isPractice || k === 0 || m.rounds < 1) return null
  if (m.status !== 'running' && m.status !== 'waiting') return null
  const n = m.messages.length
  const total = k * m.rounds
  // 결정 대기가 먼저: 마지막 발언에서 물었어도 회의록이 아니라 대표 결정을 기다리는 중이다 (마지막이라 다음 차례 없음)
  const isDecision = m.status === 'waiting' && m.phase !== 'minutes'
  if (isDecision && n >= total) return { round: m.rounds, rounds: m.rounds, spokenInRound: k, doneIds: [...ids], speakingId: null, nextId: null, state: 'decision' }
  if (m.phase === 'minutes' || n >= total) {
    // 마지막 바퀴를 다 채웠거나 끝내기로 멈춘 그 바퀴 그대로 보여 준다
    const round = Math.min(Math.floor(Math.max(n - 1, 0) / k) + 1, m.rounds)
    const spoken = n === 0 ? 0 : n - (round - 1) * k
    return { round, rounds: m.rounds, spokenInRound: Math.min(spoken, k), doneIds: ids.slice(0, Math.min(spoken, k)), speakingId: null, nextId: null, state: 'minutes' }
  }
  const round = Math.floor(n / k) + 1
  const idx = n % k
  const turn = ids[idx]
  const after = n + 1 < total ? ids[(idx + 1) % k] : null
  const base = { round, rounds: m.rounds, spokenInRound: idx, doneIds: ids.slice(0, idx) }
  // 결정 대기: 방금 말한 사람이 물었고, 답이 오면 다음 차례(turn)가 이어 말한다
  if (isDecision) return { ...base, speakingId: null, nextId: turn, state: 'decision' }
  return { ...base, speakingId: turn, nextId: after, state: 'speaking' }
}

/** i번째 발언 앞에 "N바퀴째" 줄을 넣을지: 2바퀴째부터 바퀴가 바뀌는 자리면 그 바퀴 번호, 아니면 null */
export function roundBreakAt(i: number, k: number): number | null {
  return k > 0 && i > 0 && i % k === 0 ? i / k + 1 : null
}

/** 진행자: 팀장·프로젝트 리드인 참석자, 없으면 첫 참석자 (main runMeeting과 같은 규칙) */
export function meetingChairId(ids: readonly string[], isLead: (id: string) => boolean): string | null {
  return ids.find(isLead) ?? ids[0] ?? null
}
