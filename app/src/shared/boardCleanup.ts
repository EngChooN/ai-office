// 업무 보드 정리안 (비서 '정리해줘'): 보드를 읽고 오래된 카드 닫기·중복 합치기·팀/랩 배정·상태 바로잡기를
// 비서 확인 카드의 묶음 단계 모양으로 돌려준다. 실행은 하지 않는다 — 비서가 이 단계를 그대로 propose 한다
// 연습(튜토리얼) 카드와 기획에 딸린 카드(기획안·하위 업무)는 건드리지 않는다 (기획 진행이 상태를 관리한다)

import { BATCH_ITEMS_MAX, BATCH_METHOD, CARD_STEPS_MAX } from './secretaryTools.ts'
import { t, type TKey } from './i18n/index.ts'
import type { Lab, Staff, Task, TaskStatus } from './types'

const DAY = 86_400_000
/** 이만큼 손대지 않은 카드는 닫자고 제안한다 (진행 중은 아무도 하고 있지 않을 때만) */
export const STALE_DAYS: Partial<Record<TaskStatus, number>> = { todo: 30, doing: 14, review: 14 }
/** 진행 중인데 아무도 하고 있지 않은 채 이만큼 지나면 '할 일'로 돌린다 */
export const STUCK_DOING_DAYS = 1

export type CleanupKind = 'close' | 'merge' | 'assign' | 'status'
export interface CleanupItem {
  method: 'updateTask' | 'mergeTasks'
  args: unknown[]
  label: string
}
export interface CleanupStep {
  method: typeof BATCH_METHOD
  label: string
  items: CleanupItem[]
}
export interface BoardCleanupPlan {
  steps: CleanupStep[]
  /** 카드 한 장에 다 못 담아 뺀 항목 수 (다음 정리 때 다시 나온다) */
  omitted: number
}

interface Input {
  tasks: Task[]
  staff: Pick<Staff, 'id' | 'teamId' | 'isPractice'>[]
  labs: Pick<Lab, 'id' | 'memberIds'>[]
  /** 직원이 지금 하고 있거나 대기열에 있는 카드 */
  busyTaskIds: Set<string>
  now: number
}

const KIND_LABEL: Record<CleanupKind, TKey> = {
  close: 'board.cleanup.close',
  merge: 'board.cleanup.merge',
  assign: 'board.cleanup.assign',
  status: 'board.cleanup.status',
}
const STATUS_RANK: Record<TaskStatus, number> = { doing: 0, review: 1, todo: 2, done: 3 }

/** 같은 일인지 보는 제목: 대소문자·공백·문장부호 무시 */
const titleKey = (title: string) => title.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')

export function planBoardCleanup({ tasks, staff, labs, busyTaskIds, now }: Input): BoardCleanupPlan {
  const open = tasks.filter((x) => x.status !== 'done' && !x.isPractice)
  const isFree = (x: Task) => !x.plan && !x.parentId && !busyTaskIds.has(x.id)
  const daysIdle = (x: Task) => (now - x.updatedAt) / DAY
  const items: Record<CleanupKind, CleanupItem[]> = { close: [], merge: [], assign: [], status: [] }
  const touched = new Set<string>()

  // 1) 중복 합치기 — 가장 진행된 카드(같으면 먼저 만든 것)를 남기고, 시작 안 한 카드만 합친다
  const groups = new Map<string, Task[]>()
  for (const x of open.filter((x) => !x.plan && !x.parentId)) {
    const key = titleKey(x.title)
    if (key) groups.set(key, [...(groups.get(key) ?? []), x])
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const [keep, ...rest] = [...group].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.createdAt - b.createdAt)
    const merged = rest.filter((x) => x.status === 'todo' && isFree(x))
    if (merged.length === 0) continue
    items.merge.push({ method: 'mergeTasks', args: [keep.id, merged.map((x) => x.id)], label: t('board.cleanup.mergeItem', { title: keep.title, n: merged.length }) })
    for (const x of merged) touched.add(x.id)
  }

  // 2) 오래된 카드 닫기 (완료로) · 3) 진행 중인데 아무도 안 하는 카드는 할 일로
  for (const x of open) {
    if (touched.has(x.id) || !isFree(x)) continue
    const staleDays = STALE_DAYS[x.status]
    const days = Math.floor(daysIdle(x))
    if (staleDays !== undefined && days >= staleDays) {
      items.close.push({ method: 'updateTask', args: [x.id, { status: 'done' }], label: t('board.cleanup.closeItem', { title: x.title, days }) })
      touched.add(x.id)
    } else if (x.status === 'doing' && (!x.assigneeId || days >= STUCK_DOING_DAYS)) {
      items.status.push({ method: 'updateTask', args: [x.id, { status: 'todo' }], label: t(x.assigneeId ? 'board.cleanup.stuckItem' : 'board.cleanup.noAssigneeItem', { title: x.title }) })
    }
  }

  // 4) 팀·랩이 비어 있는 카드 — 담당 직원의 팀(없으면 하나뿐인 랩)으로
  const staffById = new Map(staff.map((s) => [s.id, s]))
  for (const x of open) {
    if (touched.has(x.id) || x.teamId || x.labId || !x.assigneeId) continue
    const s = staffById.get(x.assigneeId)
    if (!s || s.isPractice) continue
    const myLabs = labs.filter((l) => l.memberIds.includes(s.id))
    const patch = s.teamId ? { teamId: s.teamId } : myLabs.length === 1 ? { labId: myLabs[0].id } : null
    if (patch) items.assign.push({ method: 'updateTask', args: [x.id, patch], label: t('board.cleanup.assignItem', { title: x.title }) })
  }

  // 종류마다 묶음 단계 (항목 상한을 넘으면 나눈다) — 카드 한 장의 단계 상한까지만
  const steps: CleanupStep[] = []
  let omitted = 0
  for (const kind of ['close', 'merge', 'assign', 'status'] as const) {
    for (let i = 0; i < items[kind].length; i += BATCH_ITEMS_MAX) {
      const chunk = items[kind].slice(i, i + BATCH_ITEMS_MAX)
      if (steps.length >= CARD_STEPS_MAX) omitted += chunk.length
      else steps.push({ method: BATCH_METHOD, label: t(KIND_LABEL[kind]), items: chunk })
    }
  }
  return { steps, omitted }
}
