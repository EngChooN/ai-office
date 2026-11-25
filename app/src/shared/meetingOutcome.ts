import type { Meeting, MeetingOutcome, MeetingOutcomeChoice, PlanSubtask } from './types.ts'

// 회의 결과 고르기 (종료 선택 창): 회의록이 나온 뒤 대표가 결재 올리기·결과물 내기·건너뛰기 중 하나를 고른다

const isLive = (m: Pick<Meeting, 'status'> | undefined) => m?.status === 'running' || m?.status === 'waiting'

/** 창을 저절로 열지: 이 화면이 진행 중이던 회의가 회의록을 내고 고르기 전(pending)으로 바뀌는 순간만. 앱을 다시 켠 뒤엔 열지 않는다(카드의 '결과 고르기'로) */
export function shouldOpenOutcome(prev: Pick<Meeting, 'status' | 'outcome'> | undefined, next: Pick<Meeting, 'status' | 'outcome'>): boolean {
  return isLive(prev) && next.status === 'done' && next.outcome?.state === 'pending'
}

/** 지난 회의 카드에 '결과 고르기'를 보일지 (outcome이 없는 예전 회의는 이미 처리된 것으로 본다) */
export const needsOutcome = (m: Pick<Meeting, 'status' | 'outcome'>) => m.status === 'done' && m.outcome?.state === 'pending'

/** 지난 회의 카드의 '결과 보기'가 열 업무 카드 id: 결재 올림(기획안 카드)·결과물 맡김(업무 카드)만 */
export const outcomeTaskId = (o: MeetingOutcome | undefined) => (o && (o.state === 'plan' || o.state === 'artifact') ? (o.ref ?? null) : null)

/** 원격·비서로 들어온 고르기 값 검사: 정해진 세 종류와 문서 형식(md·html)만. 틀리면 상태를 바꾸지 않고 거절한다 */
export function isOutcomeChoice(v: unknown): v is MeetingOutcomeChoice {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const c = v as Record<string, unknown>
  if (c.kind === 'plan' || c.kind === 'skip') return true
  return c.kind === 'artifact' && (c.format === 'md' || c.format === 'html')
}

/** 회의록을 화면에 그릴 글: 글머리표 바로 다음 줄의 일반 글("할 일:" 같은 제목)이 마크다운에서 앞 항목에 붙지 않게 빈 줄을 넣는다 */
export function minutesMarkdown(text: string): string {
  const lines = text.split('\n')
  const isBullet = (l: string) => /^\s*[-*•]\s/.test(l)
  return lines.map((l, i) => (i > 0 && l.trim() && !/^\s/.test(l) && !isBullet(l) && isBullet(lines[i - 1]) ? `\n${l}` : l)).join('\n')
}

/** 회의록의 "할 일:" 아래 글머리표를 뽑는다 ([할 일]·[ ]·굵게 표시는 걷어내고 "(담당: 이름)"은 따로) */
export function parseActionItems(text: string) {
  const items: { title: string; assignee: string | null }[] = []
  let isInTodo = false
  for (const raw of text.split('\n')) {
    const line = raw.replaceAll('**', '').trim()
    if (/^할 일\s*:/.test(line)) {
      isInTodo = !/없음/.test(line)
      continue
    }
    const bullet = line.match(/^[-*•]\s*(?:\[[^\]]*\]\s*)?(.+)$/)
    if (isInTodo && bullet) {
      const m = bullet[1].match(/^(.*?)\s*\((?:담당 제안|담당)\s*[:：]?\s*([^)]*)\)\s*$/)
      items.push(m ? { title: m[1].trim(), assignee: m[2].trim() || null } : { title: bullet[1].trim(), assignee: null })
    } else if (isInTodo && line && !bullet) isInTodo = false
  }
  return items
}

interface Person {
  id: string
  name: string
}

/** 결재 올리기: 회의록으로 앱이 바로 만드는 기획안 (AI 호출 없음). 할 일마다 하위 업무 하나, 담당은 이름이 맞는 참석자 · 없으면 진행자. 할 일이 없으면 회의 주제 하나 */
export function buildMeetingPlan(
  m: Pick<Meeting, 'topic' | 'summary'>,
  people: Person[],
  chair: Person,
  labels: { spec: string; itemDetail: string },
): { title: string; spec: string; subtasks: PlanSubtask[] } {
  const items = parseActionItems(m.summary)
  const owner = (name: string | null) => (name ? people.find((p) => name.includes(p.name)) : undefined) ?? chair
  const subtasks = (items.length ? items : [{ title: m.topic, assignee: null }]).map((it) => {
    const who = owner(it.assignee)
    return { title: it.title.slice(0, 80), detail: labels.itemDetail, assigneeId: who.id, assigneeName: who.name }
  })
  return { title: m.topic.slice(0, 60), spec: `${labels.spec}\n\n${m.summary}`, subtasks }
}
