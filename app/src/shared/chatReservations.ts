import type { ChatReservation } from './types'

/** 날짜 키 YYYY-MM-DD (그 PC 시간대) */
export const reservationDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** 반복 예약의 오늘 보낼 시각(ms) */
function todaySlot(r: ChatReservation, now: Date) {
  const [h, m] = (r.time ?? '00:00').split(':').map(Number)
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0).getTime()
}

/** 지금 보낼 차례인가 (놓친 예약은 대표가 고를 때까지 보내지 않는다) */
export function isReservationDue(r: ChatReservation, now: Date): boolean {
  if (!r.enabled || r.isMissed) return false
  if (r.kind === 'once') return (r.at ?? Infinity) <= now.getTime()
  return Boolean(r.weekdays?.includes(now.getDay())) && r.lastRunDate !== reservationDay(now) && (r.time ?? '99:99') <= hhmm(now)
}

/** 반복 예약을 만들거나 다시 켤 때: 오늘 시각이 이미 지났으면 오늘 몫은 보낸 것으로 쳐서 다음 차례부터 보낸다 */
export function skipPassedToday(r: ChatReservation, now: Date): ChatReservation {
  return r.kind === 'repeat' && isReservationDue(r, now) ? { ...r, lastRunDate: reservationDay(now) } : r
}

/**
 * 앱을 켰을 때: 꺼져 있던 동안 보낼 시각이 지난 예약을 '놓침'으로 표시한다 (보낼지 대표가 고른다).
 * 반복 예약은 오늘 몫만 보고, 어제 놓친 표시는 다음 날이 되면 풀어 평소처럼 보낸다
 */
export function settleMissedOnStart(list: readonly ChatReservation[], now: Date): ChatReservation[] {
  const changed: ChatReservation[] = []
  for (const r of list) {
    if (r.isMissed) {
      if (r.kind === 'repeat' && r.missedAt && reservationDay(new Date(r.missedAt)) !== reservationDay(now)) changed.push({ ...r, isMissed: false, missedAt: undefined })
      continue
    }
    if (!isReservationDue(r, now)) continue
    changed.push({ ...r, isMissed: true, missedAt: r.kind === 'once' ? r.at : todaySlot(r, now) })
  }
  return changed
}

/** 반복 예약이 놓친 채 날이 바뀌었으면 표시를 푼다 (켜 둔 채로 자정을 넘긴 경우) */
export function expireMissed(r: ChatReservation, now: Date): ChatReservation | null {
  if (!r.isMissed || r.kind !== 'repeat' || !r.missedAt) return null
  return reservationDay(new Date(r.missedAt)) === reservationDay(now) ? null : { ...r, isMissed: false, missedAt: undefined }
}
