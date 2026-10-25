// 회의 결정 읽기·쓰기 규칙 (docs/specs/meeting-decisions.md)
// 회의 화면·결재함·발언 맥락·회의 결과 카드가 모두 이 파일의 함수로 같은 결정 데이터를 읽는다. 결정 문구는 여기서만 만든다
import type { Meeting, MeetingDecision } from './types'

export const DECISION_MARK = '[결정 요청]'
export const DELEGATED_MARK = '[위임 결정]'
export const CEO_ID = 'me'
export const CEO_NAME = '대표'

// 표시는 줄 맨 앞일 때만 인정한다 (앞에 목록 기호·인용, 여는 굵게·백틱은 허용). 표시 뒤는 반드시 띄어 쓴다 —
// "`[결정 요청]`과 …"처럼 말로 언급만 한 줄은 발언으로 남긴다
const markLine = (mark: string) => new RegExp(String.raw`^\s*(?:[-*>]\s+)?([\`*]*)${mark.replace(/[[\]]/g, '\\$&')}[\`*]*\s+(.*)$`)
const DECISION_LINE = markLine(DECISION_MARK)
const DELEGATED_LINE = markLine(DELEGATED_MARK)

// findLastIndex는 오래된 폰 WebView에 없을 수 있어 직접 찾는다 (이 파일은 폰 화면 묶음에도 들어간다)
const lastIndexOf = (lines: string[], test: (line: string) => boolean) => {
  for (let i = lines.length - 1; i >= 0; i--) if (test(lines[i])) return i
  return -1
}

/** 표시 줄 → 칸들 ("질문 | 선택지…"). 띄어 쓴 " | "가 있으면 그것만 구분자로 본다 (질문 안의 "A|B"를 살린다). 표시 줄이 아니면 null */
function markedFields(line: string, re: RegExp) {
  const m = re.exec(line)
  if (!m) return null
  const [, open, rest] = m
  let body = rest.trim()
  // 줄 전체를 감싼 백틱·굵게의 닫는 쪽만 뗀다 (질문 안의 `코드`는 그대로)
  if (open && body.endsWith(open)) body = body.slice(0, -open.length).trim()
  return body
    .split(/\s\|\s/.test(body) ? /\s+\|\s+/ : '|')
    .map((x) => x.trim())
    .filter(Boolean)
}

/** 결정 요청 줄인지: 선택지가 있거나 질문이 물음표로 끝나야 한다 (표시를 설명하는 평서문을 거른다) */
function decisionFields(line: string) {
  const f = markedFields(line, DECISION_LINE)
  return f && f.length > 0 && (f.length > 1 || /[?？]$/.test(f[0])) ? f : null
}

/** 발언에서 "[결정 요청] 질문 | 선택지…" 줄을 떼어 낸다. 여러 줄이면 마지막 것. 질문은 자르지 않고, 원문 줄은 raw로 */
export function splitDecision(text: string): { text: string; decision: { question: string; options: string[]; raw: string } | null } {
  const lines = text.split('\n')
  const idx = lastIndexOf(lines, (l) => decisionFields(l) !== null)
  if (idx < 0) return { text: text.trim(), decision: null }
  const [question, ...options] = decisionFields(lines[idx])!
  const raw = lines[idx].trim()
  lines.splice(idx, 1)
  return { text: lines.join('\n').trim(), decision: { question, options, raw } }
}

/** 위임받은 진행자의 답에서 "[위임 결정] 선택 | 이유"를 읽는다. 표시가 없으면 첫 줄을 선택으로. 선택지와 같으면 선택지 글자 그대로 */
export function parseDelegatedChoice(text: string, options: string[]): { choice: string; reason: string } | null {
  const lines = text.split('\n').filter((l) => l.trim())
  const idx = lastIndexOf(lines, (l) => markedFields(l, DELEGATED_LINE) !== null)
  const [choice = '', ...rest] = idx >= 0 ? markedFields(lines[idx], DELEGATED_LINE)! : [(lines[0] ?? '').replace(/^[`*\s]+|[`*\s]+$/g, '')]
  if (!choice) return null
  const option = options.find((o) => o === choice) ?? options.find((o) => o.trim().toLowerCase() === choice.toLowerCase())
  return { choice: option ?? choice, reason: rest.join(' | ') }
}

/** 대표의 답(또는 회의 끝내기)을 결정에 기록한다. answer는 그대로 두고(옛 화면·폰 호환) 유형·결정자를 더한다 */
export function recordAnswer(d: MeetingDecision, answer: string, ended: boolean, now: number) {
  d.answer = answer
  if (ended) d.endedByMeeting = true
  else if (answer) Object.assign(d, { kind: 'direct', decidedById: CEO_ID, decidedByName: CEO_NAME, choice: answer, decidedAt: now })
  // 위임은 진행자가 정할 때 결정자·선택을 채운다 (recordDelegated)
  else d.kind = 'delegated'
}

/** 위임받은 진행자가 정한 값을 기록한다 */
export function recordDelegated(d: MeetingDecision, decider: { id: string; name: string }, picked: { choice: string; reason: string }, now: number) {
  Object.assign(d, { decidedById: decider.id, decidedByName: decider.name, choice: picked.choice, decidedAt: now, ...(picked.reason ? { reason: picked.reason } : {}) })
}

/** 위임받은 진행자에게 줄 지시 */
export function delegatedPrompt(question: string, options: string[]) {
  return [
    `대표가 아래 결정을 "알아서 정해"라고 위임했습니다. 회의 진행자로서 지금까지의 회의 내용을 보고 하나로 정하세요.`,
    `결정: ${question}`,
    options.length ? `선택지: ${options.join(' / ')} (이 중 하나를 글자 그대로 고르세요)` : '선택지가 없으니 짧게 정하세요.',
    `다른 말 없이 한 줄로만 답하세요: ${DELEGATED_MARK} 선택 | 이유 한 문장`,
  ].join('\n')
}

export type DecisionState = 'pending' | 'direct' | 'delegated' | 'ended' | 'unanswered'

export interface DecisionView {
  state: DecisionState
  /** 질문 전문 */
  question: string
  /** 최종 선택값 (모르면 null) */
  choice: string | null
  /** '대표' · 직원 이름 · null(기록 없음) */
  deciderName: string | null
  reason: string | null
  decidedAt: number | null
  /** 화면 라벨 ("직접 결정", "위임 · 정리드" …) */
  label: string
  /** 새 필드 없이 answer로 추정했는지 (옛 데이터) */
  isLegacy: boolean
}

const isLive = (m: Pick<Meeting, 'status'>) => m.status === 'running' || m.status === 'waiting'

/** 지금 대표 답을 기다리는 결정 — 결재함 목록과 메뉴 숫자가 같은 판정을 쓴다 */
export function pendingMeetingDecisions<M extends Pick<Meeting, 'status' | 'decisions'>>(meetings: M[]) {
  return meetings.flatMap((m) => (m.decisions ?? []).filter((d) => decisionView(d, m).state === 'pending').map((d) => ({ meeting: m, decision: d })))
}

/** 저장된 결정 하나를 화면·요약이 쓰는 모양으로. 옛 데이터는 지어내지 않고 "기록 없음"으로 둔다 */
export function decisionView(d: MeetingDecision, meeting: Pick<Meeting, 'status'>): DecisionView {
  const base = { question: d.question, reason: d.reason || null, decidedAt: d.decidedAt ?? null }
  if (d.answer === null)
    return isLive(meeting)
      ? { ...base, state: 'pending', choice: null, deciderName: null, label: '답 대기', isLegacy: false }
      : { ...base, state: 'unanswered', choice: null, deciderName: null, label: '답하지 않음', isLegacy: false }
  if (d.endedByMeeting) return { ...base, state: 'ended', choice: null, deciderName: null, label: '답하지 않음', isLegacy: false }
  if (d.kind === 'direct' || (!d.kind && d.answer !== '')) {
    // 옛 데이터의 답은 대표만 할 수 있었다
    return { ...base, state: 'direct', choice: d.choice ?? d.answer, deciderName: d.decidedByName ?? CEO_NAME, label: '직접 결정', isLegacy: !d.kind }
  }
  const isLegacy = !d.kind
  const deciderName = d.decidedByName ?? null
  const label = deciderName ? `위임 · ${deciderName}` : isLegacy ? '위임 · 결정자 기록 없음' : isLive(meeting) ? '위임 · 정하는 중' : '위임 · 아직 정하지 않음'
  return { ...base, state: 'delegated', choice: d.choice || null, deciderName, label, isLegacy }
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

/** 결정 한 줄 문구 — 요약·카드·발언 맥락 공용 */
export function decisionLine(v: DecisionView) {
  const q = oneLine(v.question)
  switch (v.state) {
    case 'direct':
      return `- ${q} → ${oneLine(v.choice ?? '')} (${v.deciderName})`
    case 'delegated':
      return v.choice ? `- ${q} → ${oneLine(v.choice)} (위임: ${v.deciderName ?? '결정자 기록 없음'})${v.reason ? ` — ${oneLine(v.reason)}` : ''}` : `- ${q} → (${v.label})`
    case 'ended':
      return `- ${q} (회의를 끝내 답하지 않음)`
    case 'unanswered':
      return `- ${q} (답하지 않음)`
    case 'pending':
      return `- ${q} (답 대기)`
  }
}

/** 회의의 결정을 섹션별 줄로 (저장 순서 그대로). 대기 중인 결정은 넣지 않는다 */
export function decisionLines(m: Pick<Meeting, 'status' | 'decisions'>) {
  const out = { direct: [] as string[], delegated: [] as string[], open: [] as string[] }
  for (const d of m.decisions ?? []) {
    const v = decisionView(d, m)
    if (v.state === 'pending') continue
    out[v.state === 'direct' ? 'direct' : v.state === 'delegated' ? 'delegated' : 'open'].push(decisionLine(v))
  }
  return out
}

/** 다음 발언·회의록 프롬프트에 붙일 결정 블록 (없으면 '') */
export function decisionsContext(m: Pick<Meeting, 'status' | 'decisions'>) {
  const { direct, delegated, open } = decisionLines(m)
  return [
    direct.length ? `[대표가 내린 결정]\n${direct.join('\n')}` : '',
    delegated.length ? `[위임 결정 — 대표가 맡겨 진행자가 정함]\n${delegated.join('\n')}` : '',
    open.length ? `[답하지 않은 결정]\n${open.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

// ── 회의 결과 카드·기획안의 결정 섹션 (앱이 원본으로 고정) ──

export const DECISION_SECTION_TITLES = ['결정 사항(직접)', '위임 결정', '답하지 않음'] as const

/** 결정 세 섹션 마크다운. 빈 섹션도 빼지 않고 "없음"으로 둔다 ("확인했는데 없음"과 "누락"을 구분) */
export function decisionSections(m: Pick<Meeting, 'status' | 'decisions'>) {
  const { direct, delegated, open } = decisionLines(m)
  return [direct, delegated, open].map((xs, i) => `## ${DECISION_SECTION_TITLES[i]}\n${xs.length ? xs.join('\n') : '- 없음'}`).join('\n\n')
}

// 리드가 제목 수준을 ###로 바꾸거나 괄호 주변을 띄어 써도 같은 섹션으로 본다
const SECTION_HEAD = /^#{2,3}[ \t]*(?:결정[ \t]*사항[ \t]*\([ \t]*직접[ \t]*\)|위임[ \t]*결정|답하지[ \t]*않음)[ \t]*$/
const ANY_HEAD = /^#{1,6}\s/

/** 글에서 결정 섹션을 빼고, 첫 섹션 자리(없으면 맨 위 — 첫 줄이 # 제목이면 그 아래)에 sections를 넣는다 */
export function withDecisionSections(spec: string, sections: string) {
  const out: string[] = []
  let insertAt = -1
  let skipping = false
  for (const line of spec.split('\n')) {
    if (SECTION_HEAD.test(line.trim())) {
      if (insertAt < 0) insertAt = out.length
      skipping = true
      continue
    }
    if (skipping && ANY_HEAD.test(line)) skipping = false
    if (!skipping) out.push(line)
  }
  if (insertAt < 0) insertAt = /^#\s/.test(out[0] ?? '') ? 1 : 0
  out.splice(insertAt, 0, '', sections, '')
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 카드 본문에 앱이 넣어 둔 결정 섹션만 뽑는다 (회의 기록이 지워졌을 때 원본으로 씀). 없으면 null */
export function decisionSectionsOf(detail: string) {
  const lines = detail.split('\n')
  const kept: string[] = []
  let inSection = false
  for (const line of lines) {
    if (SECTION_HEAD.test(line.trim())) inSection = true
    else if (ANY_HEAD.test(line)) inSection = false
    if (inSection) kept.push(line)
  }
  const text = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return text || null
}
