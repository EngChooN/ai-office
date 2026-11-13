import type { UiThemeId } from '@shared/uiTheme'

/** 업무 기록·지시 입력 글자 크기 (px) — 기본은 예전 text-xs와 같은 12 */
export const LOG_FONT_SIZES = [12, 13, 14, 16, 18]
/** 레트로 테마: 도트 글꼴이 또렷한 크기만 (갈무리11 = 12, 갈무리14 = 15, 갈무리11 두 배 = 24) */
export const RETRO_LOG_FONT_SIZES = [12, 15, 24]
export const DEFAULT_LOG_FONT_SIZE = 12

export const logFontSizes = (theme: UiThemeId) => (theme === 'retro' ? RETRO_LOG_FONT_SIZES : LOG_FONT_SIZES)

/** 저장된 크기를 언제든 쓸 수 있는 값으로 (두 목록 밖이면 기본) */
export const sanitizeLogFont = (n: number) => (LOG_FONT_SIZES.includes(n) || RETRO_LOG_FONT_SIZES.includes(n) ? n : DEFAULT_LOG_FONT_SIZE)

/** 저장된 크기에 가장 가까운 단계 — 테마를 바꿔도 저장값은 그대로 두고 읽을 때만 맞춘다 (같으면 작은 쪽) */
export function logFontStep(saved: number, sizes: number[]) {
  let best = 0
  sizes.forEach((v, i) => {
    if (Math.abs(v - saved) < Math.abs(sizes[best] - saved)) best = i
  })
  return best
}
