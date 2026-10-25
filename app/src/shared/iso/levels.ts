// 칸 사무실이 쓰는 레벨 값 — shared/officeLevel.ts의 LEVEL_TABLE에서 읽는다 (칸 크기·층 수·회의실 정원)
import { levelRowOf, meetingRoomOf } from '../officeLevel.ts'
import { planOf } from './plan.ts'

/** 1 미만은 Lv.1, 표보다 크면 마지막 */
export function isoLevelOf(level: number) {
  const row = levelRowOf(level)
  return { grid: row.grid, floors: row.floors, meetingCapacity: meetingRoomOf(level).capacity }
}

/** 한 층의 평면 (층마다 모양이 다르다 — plan.ts planOf). 층은 필수: 호출처가 보는 층을 알아야 한다 */
export function roomOf(level: number, floor: number) {
  return planOf(level, floor)
}
