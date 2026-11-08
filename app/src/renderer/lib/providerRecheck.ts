/** 창 포커스 복귀 때 공급자 상태를 다시 조회할 만큼 오래됐는지 — 마지막 조회 후 30분 */
export const PROVIDER_RECHECK_MS = 30 * 60_000

/** lastCheckedAt: 마지막 조회를 끝낸 시각(ms, 아직 없으면 0). 조회한 적이 없으면 다시 조회할 게 없다(첫 조회는 따로 한다) */
export function isProviderStale(lastCheckedAt: number, now: number): boolean {
  return lastCheckedAt > 0 && now - lastCheckedAt >= PROVIDER_RECHECK_MS
}

/** 공급자 카드 안에 붙일 버튼 — 로그인이 필요하면 로그인, 실행 실패·확인 못 함이면 다시 확인. 설치 안 됨은 업데이트 안내 글만 (다시 봐도 그대로라서) */
export type ProviderCardAction = 'claudeLogin' | 'codexLogin' | 'recheck' | null

export function providerCardAction(provider: 'claude' | 'codex', state: 'missing' | 'broken' | 'loggedOut' | 'ready' | 'unknown' | undefined): ProviderCardAction {
  if (state === 'loggedOut') return provider === 'claude' ? 'claudeLogin' : 'codexLogin'
  if (state === 'broken' || state === 'unknown') return 'recheck'
  return null
}
