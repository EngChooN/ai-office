// 전부 치우기 대상 (화면 확인 창의 가구 수와 메인 저장이 같은 규칙을 쓴다)
import { specOf, type GridItem } from './furniture.ts'

/** 범위(floor가 null이면 건물 전체)에 놓인 가구. keepSeats면 직원 자리(책상·의자)는 남긴다. 회의실·고정 칸은 grid에 없어 대상이 아니다 */
export function stowTargets(grid: readonly GridItem[], floor: number | null, keepSeats: boolean): GridItem[] {
  return grid.filter((g) => (floor === null || g.floor === floor) && !(keepSeats && ['desk', 'chair'].includes(specOf(g.itemId).kind)))
}
