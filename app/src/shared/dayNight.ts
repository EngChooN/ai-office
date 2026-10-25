// 낮밤 판정 — 예전 장면·칸 사무실·외관이 같이 쓴다 (예전 장면을 지울 때(D2) 함께 지워지지 않게 shared에 둔다)
import type { Settings } from './types.ts'

/** 낮밤 설정: 자동이면 저녁 7시~아침 7시가 밤 (사무실 안·외관 창 불빛이 같은 규칙을 쓴다) */
export function isNightTime(settings: Pick<Settings, 'dayNight'>) {
  if (settings.dayNight !== 'auto') return settings.dayNight === 'night'
  const hour = new Date().getHours()
  return hour >= 19 || hour < 7
}
