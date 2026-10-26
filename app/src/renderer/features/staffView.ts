import { useState } from 'react'

// 대시보드 직원 영역을 카드로 볼지 목록으로 볼지. 이 기기에서만 기억하면 충분하다 (못 읽으면 카드)
export type StaffView = 'cards' | 'list'

const STAFF_VIEW_KEY = 'office:dashboardStaffView'

function readStaffView(): StaffView {
  try {
    return localStorage.getItem(STAFF_VIEW_KEY) === 'list' ? 'list' : 'cards'
  } catch {
    return 'cards'
  }
}

function writeStaffView(view: StaffView) {
  try {
    localStorage.setItem(STAFF_VIEW_KEY, view)
  } catch {
    // 저장 못 해도 이번 화면에서는 적용된다
  }
}

export function useStaffView() {
  const [view, setView] = useState(readStaffView)
  const changeView = (next: StaffView) => {
    setView(next)
    writeStaffView(next)
  }
  return [view, changeView] as const
}
