// 직원별 안 읽은 보고 개수 — 직원이 대표에게 보고(완료·답)를 올리면 1 늘고, 대표가 그 직원 패널을 열면 0이 된다

/** 직원 id → 안 읽은 보고 개수 (0인 직원은 칸을 두지 않는다) */
export type UnreadReports = Record<string, number>

/** 배지에 그대로 쓰기엔 너무 큰 수는 "99+"로 줄인다 */
export const UNREAD_BADGE_MAX = 99

/** 보고 하나가 더 왔다 */
export function addUnread(map: UnreadReports, staffId: string): UnreadReports {
  return { ...map, [staffId]: unreadOf(map, staffId) + 1 }
}

/** 읽음 처리 — 바뀐 게 없으면 같은 객체를 돌려줘 저장을 건너뛸 수 있게 한다 */
export function clearUnread(map: UnreadReports, staffId: string): UnreadReports {
  if (!(staffId in map)) return map
  const next = { ...map }
  delete next[staffId]
  return next
}

/** 저장된 값이 깨졌어도(음수·소수·숫자 아님) 0 이상의 정수로 읽는다 */
export function unreadOf(map: UnreadReports, staffId: string): number {
  const n = map[staffId]
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** 배지 글자 (0이면 빈 문자열 — 배지를 숨긴다) */
export function unreadLabel(n: number): string {
  if (!(n > 0)) return ''
  return n > UNREAD_BADGE_MAX ? `${UNREAD_BADGE_MAX}+` : String(Math.floor(n))
}
