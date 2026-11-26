import { headCommit } from './review.ts'
import { cleanTime } from '../shared/workWait.ts'
import type { ReReview, TaskStatus, WorkState, WorkStatus, WorkStatusSnapshot } from '../shared/types.ts'

export type { ReReview, WorkState, WorkStatus, WorkStatusSnapshot }
// 대기 시간·상태 이름은 화면도 쓰므로 shared에 둔다 (git을 부르지 않는 순수 계산)
export { waitTime, waitLabel, workStateLabel, type WaitTime } from '../shared/workWait.ts'

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
  return enter(cur, to, at)
}

/**
 * 앱의 실제 진행을 상태에 반영한다 — 보드 칸(할 일·진행 중·검토·완료)과 대표 응답 대기 여부가 기준.
 * 사람이 보드에서 칸을 바로 옮긴 경우(할 일→검토 등)도 따라가야 하므로 전이 표를 거치지 않는다. 같은 상태면 그대로(같은 참조)
 */
export function followTask(cur: WorkStatus, taskStatus: TaskStatus, isAwaiting: boolean, at: { now: number; head?: string | null }): WorkStatus {
  const to: WorkState = taskStatus === 'doing' && isAwaiting ? 'awaitingUser' : FROM_TASK[taskStatus] ?? cur.state
  return to === cur.state ? cur : enter(cur, to, at)
}

function enter(cur: WorkStatus, to: WorkState, at: { now: number; head?: string | null }): WorkStatus {
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

/**
 * 검토 커밋과 지금 HEAD를 비교한다. 어느 쪽이든 모르면 판단 불가.
 * 짧은 번호(7자~)와 전체 번호가 섞여도 같은 커밋이면 '아님' — 짧은 쪽이 긴 쪽의 앞부분이면 같은 커밋으로 본다
 */
export function reReviewOf(reviewCommit: string | null | undefined, head: string | null | undefined): ReReview {
  const a = cleanCommit(reviewCommit)?.toLowerCase()
  const b = cleanCommit(head)?.toLowerCase()
  if (!a || !b) return 'unknown'
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return long.startsWith(short) ? 'clear' : 'needed'
}

export function toSnapshot(s: WorkStatus, head: string | null | undefined): WorkStatusSnapshot {
  return { v: WORK_STATUS_VERSION, ...s, reReview: reReviewOf(s.reviewCommit, head) }
}

/**
 * 작업 폴더의 HEAD를 읽어 스냅샷을 만든다. 검토 커밋이 없으면 git을 부르지 않는다.
 * 같은 폴더를 여러 번 물을 때는 heads에 한 번 읽은 값을 담아 넘긴다.
 * heads는 응답 한 번(목록 한 번 만들기) 안에서만 나눠 쓰고, 다음 응답에는 새 Map을 만든다 — 다시 쓰면 커밋이 바뀌어도 옛 HEAD로 판단한다
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

function cleanCommit(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return COMMIT_RE.test(s) ? s : null
}
