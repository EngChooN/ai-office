/** 창 포커스 복귀 때 공급자 상태를 다시 조회할 만큼 오래됐는지 — 마지막 조회 후 30분 */
export const PROVIDER_RECHECK_MS = 30 * 60_000

/** lastCheckedAt: 마지막 조회를 끝낸 시각(ms, 아직 없으면 0). 조회한 적이 없으면 다시 조회할 게 없다(첫 조회는 따로 한다) */
export function isProviderStale(lastCheckedAt: number, now: number): boolean {
  return lastCheckedAt > 0 && now - lastCheckedAt >= PROVIDER_RECHECK_MS
}
