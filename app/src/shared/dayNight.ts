// 낮밤 판정 — 예전 장면·칸 사무실·외관이 같이 쓴다 (예전 장면을 지울 때(D2) 함께 지워지지 않게 shared에 둔다)
import type { Settings } from './types.ts'

export type TimeOfDay = 'day' | 'evening' | 'night'

/** 자동일 때 시간대: 17~19시 저녁(노을), 19시~아침 7시 밤, 나머지 낮. 'off'(끄기)는 늘 낮 모습 */
export function timeOfDay(settings: Pick<Settings, 'dayNight'>, hour = new Date().getHours()): TimeOfDay {
  if (settings.dayNight === 'off') return 'day'
  if (settings.dayNight !== 'auto') return settings.dayNight
  if (hour >= 19 || hour < 7) return 'night'
  return hour >= 17 ? 'evening' : 'day'
}

/** 밤인가 — 사무실 안 어둡게·소품 연출 등 기존 쓰임 (저녁은 밤이 아니다) */
export function isNightTime(settings: Pick<Settings, 'dayNight'>) {
  return timeOfDay(settings) === 'night'
}
