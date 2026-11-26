import { t, type Lang } from './i18n/index.ts'
import type { Task, TaskStatus, WorkState } from './types.ts'

// 상태 보드: 대기 시간·상태 이름 — 메인(main/workStatus.ts)과 화면이 같은 규칙을 쓴다

/** 대기 시간: 시계가 어긋나 음수면 0분, 1분이 안 되면 '1분 미만' */
export interface WaitTime {
  minutes: number
  isUnderMinute: boolean
}

export function waitTime(since: number | null | undefined, now: number): WaitTime | null {
  const from = cleanTime(since)
  if (from === null || !Number.isFinite(now)) return null
  const minutes = Math.floor(Math.max(0, now - from) / 60_000)
  return { minutes, isUnderMinute: minutes < 1 }
}

/** '1분 미만' · '42분' · '3시간 5분' · '2일 4시간' */
export function waitLabel(w: WaitTime, lang?: Lang): string {
  if (w.isUnderMinute) return t('workStatus.wait.underMinute', undefined, lang)
  const days = Math.floor(w.minutes / 1440)
  const hours = Math.floor((w.minutes % 1440) / 60)
  const mins = w.minutes % 60
  if (days > 0) return t('workStatus.wait.days', { d: days, h: hours }, lang)
  if (hours > 0) return t('workStatus.wait.hours', { h: hours, m: mins }, lang)
  return t('workStatus.wait.minutes', { m: mins }, lang)
}

export function workStateLabel(s: WorkState, lang?: Lang): string {
  return t(`workStatus.state.${s}`, undefined, lang)
}

export function cleanTime(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

const FROM_TASK: Record<TaskStatus, WorkState> = { todo: 'queued', doing: 'working', review: 'review', done: 'done' }

/** 카드의 상태 — 상태 칸이 없는 카드(옛 기록·방금 만든 카드)는 보드 칸에서 (main/workStatus.ts normalizeWork와 같은 규칙) */
export function workStateOf(task: Pick<Task, 'status' | 'work'>): WorkState {
  return task.work?.state ?? FROM_TASK[task.status] ?? 'queued'
}

/** 대표 응답 대기 카드 — 오래 기다린 것부터 (시작 시각을 모르면 맨 뒤) */
export function awaitingTasks<T extends Pick<Task, 'status' | 'work'>>(tasks: readonly T[]): T[] {
  const since = (tk: T) => cleanTime(tk.work?.waitingSince) ?? Infinity
  return tasks.filter((tk) => workStateOf(tk) === 'awaitingUser').sort((a, b) => since(a) - since(b))
}
