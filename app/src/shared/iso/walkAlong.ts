// 이어진 점을 따라 한 프레임만큼 걷기 (데모데이 발표장 장면). 순수 함수 — 장면과 테스트가 같이 쓴다.
// 매 반복은 다음 점에 닿아 경로를 줄이거나 남은 걸음을 다 써서 0으로 만들기 때문에 반드시 끝난다
// (예전에는 남은 걸음을 빼기로 줄였는데, 빼고 남은 값이 아주 작은 수(5e-324)에 걸리면 줄지 않아 화면 전체가 멈췄다)

export interface WalkPoint {
  gx: number
  gy: number
  z: number
}

/** at에서 path를 따라 steps칸만큼 간다. 닿은 점은 path 앞에서 빠진다 */
export function walkAlong(at: WalkPoint, path: readonly WalkPoint[], steps: number): { at: WalkPoint; path: WalkPoint[] } {
  let pos = at
  const rest = [...path]
  let budget = steps
  while (budget > 0 && rest.length) {
    const to = rest[0]
    const dist = Math.hypot(to.gx - pos.gx, to.gy - pos.gy)
    if (dist <= budget) {
      pos = { ...to }
      rest.shift()
      budget -= dist
      continue
    }
    const u = budget / dist
    pos = { gx: pos.gx + (to.gx - pos.gx) * u, gy: pos.gy + (to.gy - pos.gy) * u, z: pos.z + (to.z - pos.z) * u }
    budget = 0
  }
  return { at: pos, path: rest }
}
