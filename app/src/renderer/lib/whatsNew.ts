/** 업데이트 소식 창을 지금 어떻게 할지 — open: 띄운다 · markSeen: 띄우지 않고 이번 버전을 본 것으로 적는다 · wait: 나중에 다시 본다 */
export type WhatsNewAction = 'open' | 'markSeen' | 'wait'

export interface WhatsNewInput {
  isLoaded: boolean
  isOnboarded: boolean
  /** 코치마크·튜토리얼 선택·튜토리얼이 진행 중 — 겹치지 않게 끝난 뒤로 미룬다 */
  isBusy: boolean
  /** 이 기기에서 마지막으로 본 버전 (처음이면 null) */
  seen: string | null
  version: string
  hasRelease: boolean
}

export function whatsNewAction(i: WhatsNewInput): WhatsNewAction {
  if (!i.isLoaded) return 'wait'
  // 시작 마법사부터 하는 사람(새로 설치)은 소식이 아니라 첫 실행 안내를 본다 — 이번 버전은 본 것으로 둔다
  if (!i.isOnboarded) return 'markSeen'
  if (i.seen === i.version || !i.hasRelease) return 'markSeen'
  return i.isBusy ? 'wait' : 'open'
}
