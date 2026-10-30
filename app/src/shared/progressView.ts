import type { StaffProgress, StaffStatus } from './types'

/** 진행 상태 → 화면 문구 키 */
export const PROGRESS_LABEL = {
  queued: 'progress.queued',
  working: 'progress.working',
  approval: 'progress.approval',
  error: 'progress.error',
} as const satisfies Record<StaffProgress['state'], string>

/** 진행 상태 → 직원 상태 색 (STATUS_META 재사용) */
export const PROGRESS_STATUS: Record<StaffProgress['state'], StaffStatus> = { queued: 'idle', working: 'working', approval: 'waiting', error: 'error' }

/** 이 대화방에서 지시를 처리 중인 직원 — 지시가 온 방(room 없음 = 전체 방)이 지금 보는 방과 같을 때만 */
export function progressesForRoom<T extends { progress?: StaffProgress | null }>(staff: readonly T[], room: string | undefined): (T & { progress: StaffProgress })[] {
  return staff.filter((s): s is T & { progress: StaffProgress } => !!s.progress && (s.progress.room ?? undefined) === (room || undefined))
}
