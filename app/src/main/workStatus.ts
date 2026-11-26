import { headCommit } from './review.ts'
import { t, type Lang } from '../shared/i18n/index.ts'
import type { ReReview, TaskStatus, WorkState, WorkStatus, WorkStatusSnapshot } from '../shared/types.ts'

export type { ReReview, WorkState, WorkStatus, WorkStatusSnapshot }

// 상태 보드: 맡긴 일의 진행 상태 한 칸 — 상태 값·전이·옛 기록 기본값·대기 시간·'재검토 필요' 판단을 여기 한곳에 둔다.
// 화면(데스크톱·휴대폰)은 같은 스냅샷을 읽기만 한다. '재검토 필요'는 저장하지 않고 내려보낼 때마다 계산한다

/** 스냅샷 형식 버전. 읽는 쪽은 버전으로 분기하지 않는다 — 모르는 칸은 무시, 없는 칸은 기본값 */
export const WORK_STATUS_VERSION = 1

/** 상태 이름 (순서 = 보드 순서) */
export const WORK_STATES = ['queued', 'working', 'awaitingUser', 'review', 'done'] as const satisfies readonly WorkState[]

/** 옮겨 갈 수 있는 상태 (같은 상태로는 바뀌지 않는다 — 대기 시작 시각이 새로 찍히지 않게) */
const NEXT: Record<WorkState, readonly WorkState[]> = {
  queued: ['working', 'awaitingUser', 'done'],
  working: ['queued', 'awaitingUser', 'review', 'done'],
  awaitingUser: ['queued', 'working', 'review', 'done'],
  review: ['working', 'awaitingUser', 'done'],
  done: ['queued', 'working'],
}

/** 보드 칸 → 상태 (상태 칸이 없는 옛 기록) */
const FROM_TASK: Record<TaskStatus, WorkState> = { todo: 'queued', doing: 'working', review: 'review', done: 'done' }

const COMMIT_RE = /^[0-9a-f]{7,64}$/i

export function isWorkState(v: unknown): v is WorkState {
  return typeof v === 'string' && (WORK_STATES as readonly string[]).includes(v)
}

export function canMove(from: WorkState, to: WorkState): boolean {
  return NEXT[from].includes(to)
}

/**
 * 상태 바꾸기. 옮길 수 없으면 받은 객체를 그대로 돌려준다(같은 참조).
 * 대표 응답 대기에 들어가면 대기 시작 시각을 찍고 나오면 지운다. 검토에 들어가면 그때 HEAD를 검토 커밋으로 남기고,
 * 할 일·진행 중으로 되돌아가면 검토가 무효라 지운다(검토 중 대표 응답 대기·완료는 그대로 둔다)
 */
export function moveWork(cur: WorkStatus, to: WorkState, at: { now: number; head?: string | null }): WorkStatus {
  if (!canMove(cur.state, to)) return cur
  const reviewCommit = to === 'review' ? cleanCommit(at.head) : to === 'queued' || to === 'working' ? null : cur.reviewCommit
  const waitingSince = to === 'awaitingUser' ? cleanTime(at.now) : null
  return { state: to, waitingSince, reviewCommit }
}

/**
 * 저장된 값(또는 받은 스냅샷)을 믿을 수 있는 칸으로. 상태 칸이 없거나 이상하면 보드 칸에서, 그것도 없으면 할 일.
 * 모르는 칸은 버리고, 상태와 맞지 않는 대기 시작 시각·형식이 틀린 커밋은 비운다
 */
export function normalizeWork(raw: unknown, taskStatus?: TaskStatus): WorkStatus {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const state = isWorkState(o.state) ? o.state : taskStatus && FROM_TASK[taskStatus] ? FROM_TASK[taskStatus] : 'queued'
  return {
    state,
    waitingSince: state === 'awaitingUser' ? cleanTime(o.waitingSince) : null,
    reviewCommit: cleanCommit(o.reviewCommit),
  }
}

/** 검토 커밋과 지금 HEAD를 비교한다. 어느 쪽이든 모르면 판단 불가 */
export function reReviewOf(reviewCommit: string | null | undefined, head: string | null | undefined): ReReview {
  const a = cleanCommit(reviewCommit)
  const b = cleanCommit(head)
  if (!a || !b) return 'unknown'
  return a.toLowerCase() === b.toLowerCase() ? 'clear' : 'needed'
}

export function toSnapshot(s: WorkStatus, head: string | null | undefined): WorkStatusSnapshot {
  return { v: WORK_STATUS_VERSION, ...s, reReview: reReviewOf(s.reviewCommit, head) }
}

/**
 * 작업 폴더의 HEAD를 읽어 스냅샷을 만든다. 검토 커밋이 없으면 git을 부르지 않는다.
 * 같은 폴더를 여러 번 물을 때는 heads에 한 번 읽은 값을 담아 넘긴다
 */
export async function snapshotFor(
  s: WorkStatus,
  cwd: string | null | undefined,
  heads: Map<string, Promise<string | null>> = new Map(),
  readHead: (cwd: string) => Promise<string | null> = headCommit,
): Promise<WorkStatusSnapshot> {
  if (!s.reviewCommit || !cwd) return toSnapshot(s, null)
  let head = heads.get(cwd)
  if (!head) heads.set(cwd, (head = readHead(cwd).catch(() => null)))
  return toSnapshot(s, await head)
}

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

function cleanTime(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

function cleanCommit(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return COMMIT_RE.test(s) ? s : null
}
