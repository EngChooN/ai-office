// 지도 터치 계산 (순수 함수 — scripts/mobile.test.mts)

export interface Pt {
  x: number
  y: number
}

/** 두 손가락이 prev → next로 움직였을 때 확대 배율과 기준점(두 손가락의 가운데) */
export function pinchStep(prev: [Pt, Pt], next: [Pt, Pt]): { factor: number; center: Pt } {
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
  const before = dist(prev[0], prev[1])
  const after = dist(next[0], next[1])
  const factor = before > 0 && after > 0 ? after / before : 1
  return { factor, center: { x: (next[0].x + next[1].x) / 2, y: (next[0].y + next[1].y) / 2 } }
}
