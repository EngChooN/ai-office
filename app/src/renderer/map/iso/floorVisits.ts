// 쉬는 직원이 다른 층에 놀러 간 상태 — 화면에서만 들고 있다 (저장·동기화 없음)
import { create } from 'zustand'

export interface Visit {
  /** 놀러 간 층 */
  floor: number
  /** 돌아올 때 (Date.now) */
  until: number
}

/** 직원 id → 놀러 간 층. 지도 장면·층 탭이 함께 본다 */
export const useFloorVisits = create<{ visits: Record<string, Visit> }>(() => ({ visits: {} }))

/** 막 돌아온 직원 — 자리 층 장면이 계단에서 나타나게 한 번 꺼내 쓴다 */
const cameBack = new Set<string>()

export function startVisit(staffId: string, floor: number, until: number) {
  useFloorVisits.setState((s) => ({ visits: { ...s.visits, [staffId]: { floor, until } } }))
}

export function endVisit(staffId: string) {
  if (!useFloorVisits.getState().visits[staffId]) return
  cameBack.add(staffId)
  useFloorVisits.setState((s) => {
    const { [staffId]: _, ...rest } = s.visits
    return { visits: rest }
  })
}

export function takeCameBack(staffId: string) {
  return cameBack.delete(staffId)
}

/** 층 탭 인원: 자리가 이 층인 직원 중 나간 사람을 빼고, 놀러 온 사람을 더한다 */
export function headcountOf(floor: number, homeIds: readonly string[], visits: Record<string, Visit>) {
  const away = homeIds.filter((id) => visits[id]).length
  const guests = Object.values(visits).filter((v) => v.floor === floor).length
  return homeIds.length - away + guests
}
