import type { Schedule } from './types.ts'

// 예약 업무가 언제 도는지 — main의 실행 판정과 화면의 '다음 실행' 표시가 같은 규칙을 쓴다

type ScheduleTiming = Pick<Schedule, 'time' | 'weekdays' | 'enabled' | 'lastRunDate'>

const pad = (n: number) => String(n).padStart(2, '0')
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** 지금 돌려야 하면 true: 켜져 있고, 오늘이 고른 요일이며, 시각이 지났고, 오늘 아직 안 돌았을 때 */
export function isScheduleDue(s: ScheduleTiming, now: Date): boolean {
  return s.enabled && s.weekdays.includes(now.getDay()) && s.lastRunDate !== dateKey(now) && s.time <= hhmm(now)
}

/**
 * 다음 실행 시각(ms). 꺼져 있거나 요일이 없으면 null.
 * 오늘 시각이 이미 지났는데 아직 안 돌았으면 바로 돌기 때문에 now를 돌려준다 (main은 1분마다 확인한다).
 */
export function nextScheduleRun(s: ScheduleTiming, now: Date): number | null {
  if (!s.enabled || s.weekdays.length === 0) return null
  if (isScheduleDue(s, now)) return now.getTime()
  const [h, m] = s.time.split(':').map(Number)
  for (let i = 0; i <= 7; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, h, m)
    if (!s.weekdays.includes(day.getDay())) continue
    if (i === 0 && (s.lastRunDate === dateKey(now) || day.getTime() <= now.getTime())) continue
    return day.getTime()
  }
  return null
}
