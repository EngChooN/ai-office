/**
 * 듀오톤 아이콘 20종의 이름과 이모지 대응표 (DOM 없는 순수 데이터 — main·renderer·시험이 같이 본다).
 * 그림 좌표는 renderer/components/duo-icon-data.ts, 그리는 부품은 duo-icon.tsx
 */
export const DUO_NAMES = ['done', 'warn', 'reject', 'ask', 'ai', 'repeat', 'schedule', 'manual', 'lab', 'meeting', 'plan', 'money', 'phone', 'remote', 'pause', 'party', 'trophy', 'like', 'new', 'bug'] as const
export type DuoName = (typeof DUO_NAMES)[number]

/** 이모지 → 아이콘 (디자인 전달 문서의 대체표 그대로). 여기 없는 이모지는 바꾸지 않는다 */
export const EMOJI_TO_ICON: Readonly<Record<string, DuoName>> = {
  '✅': 'done', '✓': 'done', '✔': 'done',
  '⚠': 'warn',
  '⛔': 'reject', '💦': 'reject',
  '🙋': 'ask', '❓': 'ask',
  '🤖': 'ai',
  '🔁': 'repeat',
  '🕘': 'schedule', '⏰': 'schedule',
  '📘': 'manual',
  '🧪': 'lab',
  '📋': 'meeting', '🗣': 'meeting',
  '🗂': 'plan',
  '💰': 'money', '🪙': 'money',
  '📱': 'phone',
  '🌐': 'remote',
  '⏸': 'pause', '⏳': 'pause',
  '🎉': 'party', '🎊': 'party',
  '🏆': 'trophy', '🏅': 'trophy',
  '👍': 'like',
  '✨': 'new',
  '🐞': 'bug', '🔧': 'bug',
}

const LEADING = /^\s*(\p{Extended_Pictographic}|[✓✔])️?\s*/u

/**
 * 글 맨 앞 이모지 하나가 20종이면 떼어 아이콘 이름으로 (저장된 글은 그대로 두고 보여줄 때만 바꾼다 — 옛 기록도 같은 규칙).
 * 20종이 아니거나 맨 앞이 아니면 그대로
 */
export function splitLeadingIcon(text: string): { icon?: DuoName; rest: string } {
  const m = LEADING.exec(text)
  const icon = m ? EMOJI_TO_ICON[m[1]] : undefined
  return icon && m ? { icon, rest: text.slice(m[0].length) } : { rest: text }
}

const TRAILING = /\s*(\p{Extended_Pictographic}|[✓✔])\uFE0F?\s*$/u

/** 맨 앞이 아니면 맨 끝 이모지 하나 (사전 문구 '결재할 건이 없어요. 🎉' 같은 곳) — isEnd면 아이콘을 글 뒤에 붙인다 */
export function splitEdgeIcon(text: string): { icon?: DuoName; rest: string; isEnd?: boolean } {
  const lead = splitLeadingIcon(text)
  if (lead.icon) return lead
  const m = TRAILING.exec(text)
  const icon = m ? EMOJI_TO_ICON[m[1]] : undefined
  return icon && m ? { icon, rest: text.slice(0, m.index), isEnd: true } : { rest: text }
}

/** 글 맨 앞 20종 이모지만 지운다 — 아이콘을 따로 붙이는 자리나 글자만 들어가는 자리(title·토스트)용 */
export const stripIconEmoji = (text: string) => splitEdgeIcon(text).rest
