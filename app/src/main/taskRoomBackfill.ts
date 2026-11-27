// 예전 카드의 방 채우기 — 카드에 방(room)을 싣기 전에 직원이 일하다 만든 카드(add_task·propose_plan)는
// 방이 비어 있어 보고가 담당자 소속 방으로 샌다. 남은 기록(도구·지시·결과 로그, 단체방 글)으로 그 카드를 만든 턴의 방을 찾는다.
// 확실할 때만 채운다 — 추측으로 채우면 새는 방향만 바뀐다

/** 방을 채울지 볼 카드 (최상위·대화 지시 카드 아님·방 없음) */
export type BackfillCard = { id: string; title: string; createdAt: number }
/** 직원 로그 줄 (tool·instruction·result·error) */
export type BackfillLog = { staffId: string; ts: number; type: string; text: string }
/** 단체방 글 ('' = 전체 방) */
export type BackfillChat = { ts: number; sender: string; room: string; text: string }
/**
 * 모든 카드 — '[업무 보드] 제목' 지시의 방을 찾는 데 쓴다. room: 지금 정해지는 방 (없으면 undefined),
 * rootId: 방을 채울지 보는 카드(또는 그 하위 업무)면 그 카드 — 방을 채웠으면 그 방을 따른다
 */
export type KnownCard = { id: string; title: string; createdAt: number; room: string | undefined; rootId?: string }

export type BackfillInput = {
  cards: BackfillCard[]
  logs: BackfillLog[]
  chats: BackfillChat[]
  known: KnownCard[]
  /** 직원 소속 방 — 방 없는 일의 글이 떨어지던 곳 (없으면 전체 방) */
  homeRoom: (staffId: string) => string | undefined
  /** 직원 id → 이름 (리드 지시 글의 보낸 리드·받는 직원을 맞춘다) */
  names: Map<string, string>
}

/** 팀·프로젝트 방 글이 처음 생긴 시각 — 그 전에는 모든 글이 전체 방이라 글의 방이 일의 방을 말해 주지 않는다 (없으면 undefined) */
export const firstRoomChatAt = (chats: BackfillChat[]) => chats.reduce<number | undefined>((min, c) => (c.room && (min === undefined || c.ts < min) ? c.ts : min), undefined)

export type BackfillSkip = 'beforeRooms' | 'noCreator' | 'noTurn' | 'noEvidence' | 'mixedRooms' | 'conflict' | 'homeOnly'
export type BackfillResult = { filled: { id: string; room: string }[]; skipped: { id: string; reason: BackfillSkip }[] }

/** 카드를 만든 도구 줄은 카드 생성 직전 이 안에 있다 */
const CREATE_WINDOW_MS = 3000
/** 턴 끝(result·error 로그) 뒤 보고 글이 올라오기까지 (다음 턴 지시가 먼저 오면 거기서 끊는다) */
export const POST_SLACK_MS = 5000
/** 지시 로그와 그 지시 단체방 글의 시간 차 */
const DIRECTIVE_WINDOW_MS = 120_000
/** 턴이 이보다 길면 기록이 끊긴 것으로 본다 */
const TURN_MAX_MS = 6 * 3600_000
const CREATE_TOOLS = ['mcp__office__add_task ', 'mcp__office__propose_plan ']
const BOARD_MARK = '[업무 보드] '
/** '[리드의 지시] 본문' — 리드가 단체방에 '@이름 본문'으로 남긴 지시 */
const DELEGATED = /^\[([^\]\n]+)의 지시\] /
/** 방 이름 머리표 '[AI Office 프로젝트] ' 같은 맨 앞 [ ] 하나 */
const LEADING_TAG = /^\[[^\]\n]+\] /
const REMOTE_MARK = /^📱 원격 /
/** 단체방 글은 지시 로그보다 먼저 쓰인다 — 시계 오차만 둔다 */
const DIRECTIVE_AFTER_MS = 1000
/** 지시 글을 찾을 때 비교하는 본문 앞부분 */
const MATCH_CHARS = 30
/** 도구 로그는 이 길이에서 잘려 저장된다 (hired.ts ACTIVITY_MAX) — 이보다 짧으면 입력 전체가 보인다 */
const TOOL_LOG_MAX = 80
/** 리드가 기획안 제목을 비울 때 카드 제목 (office.ts propose_plan) */
const PLAN_TITLE_MAX = 60

/** 도구 입력 JSON(잘렸을 수 있음)에서 문자열 칸 하나. complete: 닫는 따옴표까지 보였는가 */
function fieldOf(text: string, key: string): { value: string; complete: boolean } | undefined {
  const at = text.indexOf(`"${key}":"`)
  if (at < 0) return undefined
  let raw = ''
  for (let i = at + key.length + 4; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\') {
      if (i + 1 >= text.length) break
      raw += ch + text[++i]
      continue
    }
    if (ch === '"') return { value: decode(raw), complete: true }
    raw += ch
  }
  return { value: decode(raw.replace(/\\u[0-9a-fA-F]{0,3}$/, '')), complete: false }
}

const decode = (raw: string) => {
  try {
    return JSON.parse(`"${raw}"`) as string
  } catch {
    return ''
  }
}

/**
 * 도구 줄이 만든 카드 제목 — 끝까지 보일 때만. 잘린 제목, 제목 칸이 잘려 안 보이는 기획 줄은 모른다(undefined)
 * (앞부분이 같은 다른 카드와 가를 근거가 없다)
 */
function createdTitleOf(log: BackfillLog): string | undefined {
  const title = fieldOf(log.text, 'title')
  if (title) return title.complete ? title.value : undefined
  if (log.text.startsWith('mcp__office__add_task ')) return undefined
  // 제목을 비우면 기획서 첫 줄 — 로그 전체가 보여(뒤에 숨은 title이 없어)야 하고, 첫 줄이 끝까지 보여야 한다
  const spec = fieldOf(log.text, 'spec')
  if (!spec || log.text.length >= TOOL_LOG_MAX) return undefined
  const lines = spec.value.split('\n')
  if (!spec.complete && lines.length < 2) return undefined
  return lines[0].replace(/^#+\s*/, '').slice(0, PLAN_TITLE_MAX) || undefined
}

/** 카드를 만든 도구 줄 — 생성 직전 줄 중 끝까지 보이는 제목이 카드 제목과 같은 것이 딱 하나일 때만 */
function creatorOf(card: BackfillCard, tools: BackfillLog[]): BackfillLog | undefined {
  const hits = tools.filter((l) => l.ts <= card.createdAt && l.ts >= card.createdAt - CREATE_WINDOW_MS && createdTitleOf(l) === card.title)
  return hits.length === 1 ? hits[0] : undefined
}

/** 지시 한 줄의 방: '[업무 보드] 제목'이면 그 카드의 방, 대표·리드의 단체방 지시면 그 글의 방. 모르면 undefined */
function directiveRoom(inst: BackfillLog, input: BackfillInput, filled: Map<string, string>): string | undefined {
  if (inst.text.startsWith(BOARD_MARK)) {
    // '[업무 보드] 제목\n내용' — 제목 줄 전체가 같은 카드만 (없거나 방이 다른 카드가 섞이면 모른다)
    const title = inst.text.slice(BOARD_MARK.length).split('\n')[0]
    const rooms = new Set(input.known.filter((k) => k.title === title).map((k) => (k.rootId && filled.has(k.rootId) ? filled.get(k.rootId) : k.room)))
    const [only, ...rest] = rooms
    return rest.length === 0 ? only : undefined
  }
  // 휴대폰 지시 표시('📱 원격 ')를 떼고, 리드 지시('[리드의 지시] ')는 그 리드의 '@이름 본문' 글, 그 밖(방 이름 머리표·머리표 없음)은 대표 글에서 찾는다
  // 앱이 만든 지시([자동 점검]·[팀원 보고] 등)는 본문이 대표 글에 없어 찾지 못한다 — 방을 모르는 지시로 남는다
  const text = inst.text.replace(REMOTE_MARK, '')
  const lead = DELEGATED.exec(text)?.[1]
  const body = text.replace(lead !== undefined ? DELEGATED : LEADING_TAG, '').trim().slice(0, MATCH_CHARS)
  if (body.length < 8) return undefined
  // 리드 지시는 그 이름의 리드(이름이 하나뿐일 때)가 이 직원에게 '@받는 이름 본문'으로 쓴 글만
  const leadIds = lead === undefined ? [] : [...input.names].filter(([, n]) => n === lead).map(([id]) => id)
  const me = input.names.get(inst.staffId)
  if (lead !== undefined && (leadIds.length !== 1 || !me)) return undefined
  const isDirective = (c: BackfillChat) =>
    lead !== undefined ? c.sender === leadIds[0] && c.text.startsWith(`@${me} `) && c.text.slice(me!.length + 2).trimStart().startsWith(body) : c.sender === 'me' && c.text.replace(/^(@\S+\s+)+/, '').startsWith(body)
  const rooms = new Set(input.chats.filter((c) => c.ts <= inst.ts + DIRECTIVE_AFTER_MS && c.ts >= inst.ts - DIRECTIVE_WINDOW_MS && isDirective(c)).map((c) => c.room))
  const [only, ...rest] = rooms
  return rest.length === 0 ? only : undefined
}

/**
 * 카드마다 만든 턴의 방을 찾는다. 판정:
 * 1) 카드를 만든 도구 줄(직원·시각)이 딱 하나여야 한다
 * 2) 그 턴(앞 결과 줄 뒤 첫 지시 ~ 다음 결과·오류 줄 직후, 다음 턴 지시 전까지)에 그 직원이 단체방에 올린 글이 한 방에만 있어야 한다
 * 3) 그 턴에 들어온 지시 중 방을 알 수 있는 것은 모두 그 방이어야 한다 (줄 선 다른 방 지시가 섞이면 건너뛴다)
 * 4) 그 방이 소속 방이나 전체 방이면 — 방 없는 일이 떨어지던 곳이라 — 그 방 지시가 확인될 때만
 * 팀·프로젝트 방이 생기기 전에 만든 카드는 건너뛴다 (그때 글은 모두 전체 방)
 * 오래된 카드부터 본다 (먼저 채운 카드가 뒤 카드의 '[업무 보드]' 지시 방이 된다)
 */
export function inferTaskRooms(input: BackfillInput): BackfillResult {
  const filled = new Map<string, string>()
  const skipped: BackfillResult['skipped'] = []
  const tools = input.logs.filter((l) => l.type === 'tool' && CREATE_TOOLS.some((p) => l.text.startsWith(p)))
  const cards = [...input.cards].sort((a, b) => a.createdAt - b.createdAt)
  const logsOf = new Map<string, BackfillLog[]>()
  for (const l of [...input.logs].sort((a, b) => a.ts - b.ts)) logsOf.set(l.staffId, [...(logsOf.get(l.staffId) ?? []), l])
  const roomsSince = firstRoomChatAt(input.chats)
  for (const card of cards) {
    const skip = (reason: BackfillSkip) => void skipped.push({ id: card.id, reason })
    if (roomsSince === undefined || card.createdAt < roomsSince) {
      skip('beforeRooms')
      continue
    }
    const made = creatorOf(card, tools)
    if (!made) {
      skip('noCreator')
      continue
    }
    const staffId = made.staffId
    const mine = logsOf.get(staffId) ?? []
    const isEnd = (l: BackfillLog) => l.type === 'result' || l.type === 'error'
    const end = mine.find((l) => isEnd(l) && l.ts >= made.ts)
    const start = mine.findLast((l) => isEnd(l) && l.ts < made.ts)?.ts ?? -Infinity
    // 턴은 앞 턴 끝 뒤 첫 지시에서 시작한다 (그 사이 글은 앞 턴의 끝 보고)
    const first = mine.find((l) => l.type === 'instruction' && l.ts > start && l.ts <= made.ts)
    if (!end || !first || end.ts - first.ts > TURN_MAX_MS) {
      skip('noTurn')
      continue
    }
    const next = mine.find((l) => l.type === 'instruction' && l.ts > end.ts)
    const until = Math.min(end.ts + POST_SLACK_MS, next ? next.ts - 1 : Infinity)
    const posts = new Set(input.chats.filter((c) => c.sender === staffId && c.ts >= first.ts && c.ts <= until).map((c) => c.room))
    if (posts.size > 1) {
      skip('mixedRooms')
      continue
    }
    const known = new Set(
      mine
        .filter((l) => l.type === 'instruction' && l.ts > start && l.ts <= end.ts)
        .map((l) => directiveRoom(l, input, filled))
        .filter((r): r is string => r !== undefined),
    )
    const [posted] = posts
    const room = posted ?? (known.size === 1 ? [...known][0] : undefined)
    if (room === undefined) {
      skip(known.size > 1 ? 'conflict' : 'noEvidence')
      continue
    }
    if ([...known].some((r) => r !== room)) {
      skip('conflict')
      continue
    }
    const isFallback = posted === '' || posted === input.homeRoom(staffId)
    if (posted !== undefined && isFallback && !known.has(posted)) {
      skip('homeOnly')
      continue
    }
    filled.set(card.id, room)
  }
  return { filled: [...filled].map(([id, room]) => ({ id, room })), skipped }
}
