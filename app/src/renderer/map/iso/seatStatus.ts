// 지도 현황판이 읽는 "자리가 모자라요" 값 — 지도 장면이 층을 배정한 뒤 올려 준다 (office-iso-spaces.md 3-5절 C안)
import { create } from 'zustand'

export interface SeatStatus {
  /** 보는 층에서 책상 자리를 못 받은 직원 수 */
  short: number
  /** 그 층의 책상 자리 상한 */
  cap: number
  /** 상한이 지금보다 늘어나는 가장 가까운 레벨과 그때 상한 (없으면 null) */
  next: { level: number; cap: number } | null
  /** 전부 치우기로 비운 사무실: 의자가 모자라도 기본 자리를 깔지 않는다 (책상·의자가 다시 놓이면 풀린다) */
  isAutoOff: boolean
}

const AUTO_OFF_KEY = 'office.autoSeatsOff'
const readAutoOff = () => {
  try {
    return localStorage.getItem(AUTO_OFF_KEY) === '1'
  } catch {
    return false
  }
}

export const useSeatStatus = create<SeatStatus>(() => ({ short: 0, cap: 0, next: null, isAutoOff: readAutoOff() }))

/** 기본 자리 자동 놓기 끄기·켜기 (저장해 두어 다시 켜도 유지) */
export function setAutoOff(isOff: boolean) {
  try {
    if (isOff) localStorage.setItem(AUTO_OFF_KEY, '1')
    else localStorage.removeItem(AUTO_OFF_KEY)
  } catch {
    // 저장 못 해도 이번 실행에는 적용
  }
  useSeatStatus.setState({ isAutoOff: isOff })
}
