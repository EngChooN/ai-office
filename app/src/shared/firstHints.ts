// 화면을 처음 열 때 한 번만 뜨는 힌트 (handoff onboarding-shorten ②) — 어떤 힌트를 띄울지 정하는 순수 규칙
// 본 기록은 앱 설정(seenHints·isHintsOff)에 둔다: PC와 휴대폰 원격 화면이 같은 기록을 본다

export const FIRST_HINT_IDS = ['hire', 'board', 'meeting', 'chat', 'inbox'] as const
export type FirstHintId = (typeof FIRST_HINT_IDS)[number]

/** 업무 연습을 끝냈거나 예전에 실제 첫 업무를 해 본 사람에게는 띄우지 않는 힌트 (연습에서 이미 해 봤다) */
const SKIP_IF_PRACTICED = new Set<FirstHintId>(['chat', 'inbox'])

export interface FirstHintState {
  isOnboarded: boolean
  seenHints: readonly string[]
  isHintsOff: boolean
  /** 업무 연습을 끝까지 해 봤거나 예전 첫 실행에서 실제 첫 업무를 해 봤다 */
  hasPracticedTask: boolean
  /** 연습·둘러보기·업데이트 소식처럼 다른 안내가 떠 있다 */
  isBusy: boolean
}

export function shouldShowHint(id: FirstHintId, s: FirstHintState): boolean {
  if (!s.isOnboarded || s.isHintsOff || s.isBusy || s.seenHints.includes(id)) return false
  return !(SKIP_IF_PRACTICED.has(id) && s.hasPracticedTask)
}

/**
 * 저장된 설정의 힌트 기록 — 기록이 없는(이번 업데이트 전) 설정에서 이미 첫 실행 안내를 마친 사람은 모든 힌트를 본 것으로 시작한다
 * (기존 사용자가 화면을 열 때마다 힌트를 처음부터 보지 않게)
 */
export function initialSeenHints(saved: { isOnboarded?: boolean; seenHints?: string[] }): string[] {
  if (Array.isArray(saved.seenHints)) return saved.seenHints
  return saved.isOnboarded ? [...FIRST_HINT_IDS] : []
}
