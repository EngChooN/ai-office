// 코치마크 설명 상자 자리 (순수 계산 — DOM 없이 테스트한다). 상자는 언제나 화면 안에 들어오게 한다

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** 설명 상자 최대 폭 (좁은 화면은 화면 폭 - 양옆 여백) */
export const TIP_MAX_W = 340
/** 화면 가장자리 여백 */
export const TIP_MARGIN = 12
/** 대상과 설명 상자 사이 */
export const TIP_GAP = 14

/** 이 화면 폭에서 설명 상자 폭 — min(340px, 100vw - 24px) */
export const tipWidth = (viewW: number) => Math.max(0, Math.min(TIP_MAX_W, viewW - TIP_MARGIN * 2))

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)))

/**
 * 설명 상자 왼쪽 위 자리: 대상 오른쪽 → 왼쪽 → 아래 → 위 중 들어가는 첫 자리, 어디도 안 되면 화면 안에 붙인다.
 * target이 없으면 화면 가운데. tipH는 실제로 잰 상자 높이 (상자가 화면보다 크면 위에 붙이고 상자 안에서 스크롤한다)
 */
export function placeTip(target: Box | null, tipH: number, viewW: number, viewH: number): { left: number; top: number; width: number } {
  const width = tipWidth(viewW)
  const maxLeft = viewW - TIP_MARGIN - width
  const maxTop = viewH - TIP_MARGIN - tipH
  const inView = (left: number, top: number) => ({ left: clamp(left, TIP_MARGIN, maxLeft), top: clamp(top, TIP_MARGIN, maxTop), width })
  if (!target) return inView((viewW - width) / 2, (viewH - tipH) / 2)
  const right = target.left + target.width
  const bottom = target.top + target.height
  if (right + TIP_GAP + width <= viewW - TIP_MARGIN) return inView(right + TIP_GAP, target.top)
  if (target.left - TIP_GAP - width >= TIP_MARGIN) return inView(target.left - TIP_GAP - width, target.top)
  const centerLeft = target.left + target.width / 2 - width / 2
  if (bottom + TIP_GAP + tipH <= viewH - TIP_MARGIN) return inView(centerLeft, bottom + TIP_GAP)
  if (target.top - TIP_GAP - tipH >= TIP_MARGIN) return inView(centerLeft, target.top - TIP_GAP - tipH)
  // 대상이 화면을 거의 다 차지하면 대상과 겹치더라도 화면 아래쪽에 둔다 (버튼이 늘 보이게)
  return inView(centerLeft, maxTop)
}

/** 화면에 실제로 보이는 자리인지 (숨긴 상단 바처럼 크기 0인 요소는 강조하지 않는다) */
export const isVisibleBox = (box: Pick<Box, 'width' | 'height'>) => box.width > 0 && box.height > 0
