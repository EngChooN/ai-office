import type { StaffProgress, StaffStatus } from './types'

/** 진행 상태 → 화면 문구 키 */
export const PROGRESS_LABEL = {
  queued: 'progress.queued',
  working: 'progress.working',
  approval: 'progress.approval',
  error: 'progress.error',
  netWait: 'progress.netWait',
} as const satisfies Record<StaffProgress['state'], string>

/** 진행 상태 → 직원 상태 색 (STATUS_META 재사용) */
export const PROGRESS_STATUS: Record<StaffProgress['state'], StaffStatus> = { queued: 'idle', working: 'working', approval: 'waiting', error: 'error', netWait: 'netWait' }

/** 이 대화방에서 지시를 처리 중인 직원 — 지시가 온 방(room 없음 = 전체 방)이 지금 보는 방과 같을 때만. 다른 방 지시가 섞였으면 그 방에서는 그 지시를 보여 준다 */
export function progressesForRoom<T extends { progress?: StaffProgress | null }>(staff: readonly T[], room: string | undefined): (T & { progress: StaffProgress })[] {
  const want = room || undefined
  const out: (T & { progress: StaffProgress })[] = []
  for (const s of staff) {
    const p = s.progress
    if (!p) continue
    if ((p.room ?? undefined) === want) out.push({ ...s, progress: p })
    else {
      const o = p.others?.find((x) => (x.room ?? undefined) === want)
      if (o) out.push({ ...s, progress: { ...p, text: o.text, room: o.room, chatId: o.chatId } })
    }
  }
  return out
}
