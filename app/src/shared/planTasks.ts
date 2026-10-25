// 리드 기획안과 업무 보드 카드 정리 규칙 (묶을 카드 찾기·보드에서 숨길 카드)
import type { Task } from './types'

type CardLike = Pick<Task, 'id' | 'title' | 'status' | 'parentId'>

/**
 * 기획안이 대신 처리할 보드 카드를 제목으로 찾는다 (회의에서 나온 할 일 등).
 * 아직 시작 안 한 최상위 "할 일" 카드만 묶고, 제목은 그대로 같거나 한쪽이 다른 쪽을 포함하면 같은 카드로 본다
 */
export function matchAbsorbed(titles: string[], cards: CardLike[], selfId: string) {
  const open = cards.filter((c) => c.id !== selfId && c.status === 'todo' && !c.parentId)
  const ids: string[] = []
  const unmatched: string[] = []
  for (const raw of titles) {
    const title = raw.trim()
    if (!title) continue
    const exact = open.filter((c) => c.title === title)
    const found = exact.length ? exact : open.filter((c) => c.title.includes(title) || title.includes(c.title))
    if (found.length === 1) {
      if (!ids.includes(found[0].id)) ids.push(found[0].id)
    } else unmatched.push(title)
  }
  return { ids, unmatched }
}

/** 기획에 묶여 끝날 때 함께 완료될 카드는 보드 칸에 따로 보이지 않는다 */
export function isAbsorbedOpen(task: Pick<Task, 'id' | 'status' | 'parentId'>, parent: Pick<Task, 'plan'> | undefined) {
  return task.status !== 'done' && Boolean(parent?.plan?.absorbedIds?.includes(task.id))
}

const MEETING_TITLE_MAX = 40
const MEETING_ITEMS_TITLE = '할 일 (담당 제안)'

/**
 * 회의가 끝나면 할 일을 낱장으로 뿌리지 않고 리드에게 줄 카드 한 장(기획안 초안)으로 묶는다.
 * 리드가 이 카드를 받으면 선후 관계를 정해 기획안(하위 업무)으로 올린다 — 할 일은 이 카드 안에만 있어 absorbs로 묶을 카드는 없다.
 * decisions는 shared/meetingDecisions의 decisionSections 결과 — 결정 섹션은 앱이 채우고 기획안을 올릴 때 다시 덮어쓴다
 */
export function meetingResultCard(topic: string, summary: string, items: { title: string; assignee: string | null }[], decisions = '') {
  const head = topic.split('\n')[0].trim()
  const title = `회의 결과: ${head.length > MEETING_TITLE_MAX ? `${head.slice(0, MEETING_TITLE_MAX)}…` : head}`
  const list = items.length ? items.map((it, i) => `${i + 1}. ${it.title}${it.assignee ? ` (담당 제안: ${it.assignee})` : ''}`).join('\n') : '- 없음'
  const detail = [
    `회의 "${head}" 결과로 만든 기획안 초안이에요. 할 일 ${items.length}건의 선행 관계를 따져 순서를 정하고, mcp__office__propose_plan 기획안(하위 업무)으로 올려 주세요. 회의에서 정한 진행 순서가 있으면 그대로 따르세요. 아래 할 일은 따로 보드 카드가 없으니 absorbs에 적지 않아도 돼요.`,
    decisions &&
      '결정 섹션(결정 사항(직접)·위임 결정·답하지 않음)은 앱이 회의 기록으로 채우고, 기획안을 올리면 앱이 원본으로 다시 덮어써요. 고치지 말고, 바꿀 결정이 있으면 기획서 "열린 질문"에 적어 주세요.',
    decisions,
    `## ${MEETING_ITEMS_TITLE}\n${list}`,
    `## 회의록\n${summary.trim() || '- 없음'}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  return { title, detail }
}

/** 회의 결과 카드 본문의 "## 할 일" 목록에서 제목만 뽑는다 (카드에 이미 들어 있는 할 일은 absorbs로 따로 찾지 않는다). 옛 카드의 "## 할 일"도 읽는다 */
export function meetingCardItems(detail: string) {
  const section = detail.split(/\n## /).find((s) => /^할 일(?: \(담당 제안\))?\n/.test(s))
  if (!section) return []
  return section
    .split('\n')
    .slice(1)
    .flatMap((line) => {
      const m = /^\d+\.\s+(.+?)(?:\s+\(담당 제안: [^)]*\))?\s*$/.exec(line)
      return m ? [m[1]] : []
    })
}

type PlanCard = Pick<Task, 'id' | 'title'> & { plan?: unknown }

/** 같은 카드가 두 번 들어와도(제목이 같아도 id가 같으면) 한 장으로 본다 */
export function uniqueById<T extends { id: string }>(cards: T[]) {
  const seen = new Set<string>()
  return cards.filter((c) => !seen.has(c.id) && Boolean(seen.add(c.id)))
}

/**
 * propose_plan이 어느 카드의 기획안인지 고른다.
 * - task(카드 제목)를 주면 받은 업무에서 그 카드를 찾는다.
 * - title만 주면 받은 업무 중 같은 제목 카드가 있으면 그 카드, 받은 업무가 딱 하나(기획안 전 또는 '다시' 받음)면 그 카드, 아니면 새 카드.
 * - 둘 다 없으면 받은 업무가 하나일 때만 그 카드, 없으면 새 카드, 여러 개면 물어본다.
 */
export function pickPlanCard<T extends PlanCard>(received: T[], opts: { task?: string; title?: string }): { card: T | null } | { error: string } {
  const myTasks = uniqueById(received)
  const list = () => myTasks.map((t) => `"${t.title}"`).join(', ')
  const byTitle = (q: string) => myTasks.filter((t) => t.title === q || t.title.includes(q) || q.includes(t.title))
  const taskTitle = opts.task?.trim()
  const title = opts.title?.trim()
  const only = myTasks.length === 1 ? myTasks[0] : undefined
  if (taskTitle) {
    const named = byTitle(taskTitle)
    if (named.length === 1) return { card: named[0] }
    if (myTasks.length > 1) return { error: `"${taskTitle}" 카드를 하나로 찾지 못했습니다. 받은 업무: ${list()} — task에 제목을 그대로 적어 주세요.` }
    return { card: only ?? null }
  }
  if (title) {
    const named = byTitle(title)
    if (named.length === 1) return { card: named[0] }
    // 같은 턴에 먼저 올린 기획 카드는 덮어쓰지 않되, 대표가 "다시"를 누른 카드는 고쳐 올리는 것이다
    const onlyPlan = only?.plan as { status?: string } | undefined
    return { card: only && (!onlyPlan || onlyPlan.status === 'revise') ? only : null }
  }
  if (myTasks.length > 1) return { error: `업무를 여러 개 받았습니다: ${list()} — 어느 업무의 기획안인지 task에 제목을 적어 주세요. 새 업무면 title에 새 제목을 적으세요.` }
  return { card: only ?? null }
}
