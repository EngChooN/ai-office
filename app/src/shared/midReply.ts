// 일하는 중 직원이 쓴 글(중간 보고)을 단체방에 그때그때 올리는 규칙 — 합치기·최종 보고와 겹침 판단 (가짜 엔진 없이 시험)

/** 이 길이 이하의 짧은 글끼리는 한 말풍선에 이어 붙인다 ("찾아볼게요" 같은 한 줄이 방을 덮지 않게) */
export const MID_SHORT_MAX = 80
/** 이어 붙인 말풍선이 이 길이를 넘으면 새 말풍선으로 */
export const MID_MERGED_MAX = 600

/** 단체방 '쓰는 중' 표시에 이름을 보여 주는 최대 수 — 넘으면 '외 N명' */
export const TYPING_NAMES_MAX = 3

/** '쓰는 중' 표시에 쓸 이름 (먼저 쓰기 시작한 순서 그대로)과 나머지 수 */
export function typingNames(names: readonly string[], max = TYPING_NAMES_MAX): { shown: string[]; rest: number } {
  return { shown: names.slice(0, max), rest: Math.max(0, names.length - max) }
}

/** 이번 턴에 마지막으로 올린 중간 글 말풍선 (직원별로 하나만 기억한다) */
export type MidBubble = { chatId: number; room: string; pieces: string[] }

const norm = (text: string) => text.trim()

/** 이어 붙인 말풍선 글 */
export function bubbleText(pieces: readonly string[]): string {
  return pieces.map(norm).join('\n')
}

/**
 * 새 글을 직전 말풍선에 이어 붙일까 — 같은 방이고, 그 말풍선이 아직 방의 마지막 메시지이고(사이에 다른 글·결재 카드 없음),
 * 직전 조각과 새 글이 모두 짧고, 합쳐도 길지 않을 때만
 */
export function canMerge(prev: MidBubble | undefined, room: string, lastIdInRoom: number | undefined, text: string): prev is MidBubble {
  if (!prev || prev.room !== room || prev.chatId !== lastIdInRoom) return false
  const last = prev.pieces[prev.pieces.length - 1] ?? ''
  if (norm(last).length > MID_SHORT_MAX || norm(text).length > MID_SHORT_MAX) return false
  return bubbleText([...prev.pieces, text]).length <= MID_MERGED_MAX
}

/**
 * 최종 보고 앞부분이 이번 턴에 이미 올린 중간 글이면 떼어 낸다 (Codex는 턴의 글을 이어 붙여 보고하므로 같은 문단이 두 번 보이지 않게).
 * posted: 이 방에 올린 중간 글 (올린 순서). 다 떼어 내 남는 게 없으면 원문 그대로 (보고 자리를 비우지 않는다)
 */
export function stripPosted(summary: string, posted: readonly string[]): string {
  let rest = norm(summary)
  for (const p of posted) {
    const text = norm(p)
    if (text && rest.startsWith(text) && rest.length > text.length) rest = rest.slice(text.length).trim()
  }
  return rest
}

/**
 * 끝난 턴의 최종 보고를 마지막 중간 글과 어떻게 맞출까:
 * - promote: 말풍선이 최종 보고 글 그대로 — 새로 올리지 않고 그 말풍선을 보고로 바꾼다
 * - trim: 이어 붙인 말풍선의 마지막 조각이 최종 보고 — 그 조각을 말풍선에서 빼고(text) 보고는 새로 올린다
 * - post: 겹치지 않는다 — 보고(text: 이미 올린 앞부분을 뗀 글)를 새로 올린다
 * posted: 이번 턴에 이 방에 올린 중간 글 전부 (결재·질문 카드 앞 글 포함)
 */
export function finishPlan(prev: MidBubble | undefined, room: string, summary: string, posted: readonly string[] = []): { kind: 'promote' } | { kind: 'trim'; text: string } | { kind: 'post'; text: string } {
  const s = stripPosted(summary, posted)
  if (!prev || prev.room !== room || !s) return { kind: 'post', text: s }
  if (bubbleText(prev.pieces) === s) return { kind: 'promote' }
  const last = prev.pieces[prev.pieces.length - 1]
  if (prev.pieces.length > 1 && last !== undefined && norm(last) === s) return { kind: 'trim', text: bubbleText(prev.pieces.slice(0, -1)) }
  return { kind: 'post', text: s }
}
