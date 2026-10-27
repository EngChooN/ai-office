import type { ProviderState } from '@shared/types'

/** GPT 직원 안내 띠를 지금 어떻게 할지 — show: 띄운다 · markSeen: 띄우지 않고 본 것으로 적는다 · hide: 아무것도 안 한다 */
export type ProviderBannerAction = 'show' | 'markSeen' | 'hide'

/** codexState: Codex 상태 (아직 조회 전이면 null) — 이미 연결한 사람에게는 띄우지 않는다 */
export function providerBannerAction(i: { isLoaded: boolean; isOnboarded: boolean; isSeen: boolean; codexState?: ProviderState | null }): ProviderBannerAction {
  if (!i.isLoaded || i.isSeen) return 'hide'
  // 새로 설치한 사람은 첫 실행 안내의 공급자 카드에서 이미 고른다 — 마법사를 마친 뒤에도 뜨지 않게 본 것으로 둔다
  if (!i.isOnboarded) return 'markSeen'
  // Codex 상태를 알기 전엔 띄우지 않는다 (새로고침 직후 잠깐 떴다 사라지지 않게) · 이미 준비됨이면 안내할 것이 없다
  if (i.codexState === 'ready') return 'markSeen'
  if (i.codexState === null) return 'hide'
  return 'show'
}
