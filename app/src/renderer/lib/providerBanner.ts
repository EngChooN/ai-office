/** GPT 직원 안내 띠를 지금 어떻게 할지 — show: 띄운다 · markSeen: 띄우지 않고 본 것으로 적는다 · hide: 아무것도 안 한다 */
export type ProviderBannerAction = 'show' | 'markSeen' | 'hide'

export function providerBannerAction(i: { isLoaded: boolean; isOnboarded: boolean; isSeen: boolean }): ProviderBannerAction {
  if (!i.isLoaded || i.isSeen) return 'hide'
  // 새로 설치한 사람은 첫 실행 안내의 공급자 카드에서 이미 고른다 — 마법사를 마친 뒤에도 뜨지 않게 본 것으로 둔다
  if (!i.isOnboarded) return 'markSeen'
  return 'show'
}
