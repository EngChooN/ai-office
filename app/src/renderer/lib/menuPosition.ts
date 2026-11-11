// 작은 팝업 메뉴(PopMenu)의 고정 위치 계산 — 화면 안에 들어오게 가로를 당기고, 열리는 쪽 남은 높이로 최대 높이를 정한다

export const MENU_WIDTH = 256
const EDGE = 8
const GAP = 4

export type MenuPosition = { left: number; top?: number; bottom?: number; maxHeight: number }

/** 위로 열면 버튼 위, 아래로 열면 버튼 아래. 가로는 버튼 왼쪽에 맞추되 화면 밖으로 나가지 않게 당긴다 */
export function menuPosition(rect: { top: number; bottom: number; left: number }, opens: 'up' | 'down', view: { width: number; height: number }): MenuPosition {
  const left = Math.max(EDGE, Math.min(rect.left, view.width - MENU_WIDTH - EDGE))
  return opens === 'up'
    ? { left, bottom: view.height - rect.top + GAP, maxHeight: Math.min(view.height * 0.6, rect.top - GAP - EDGE) }
    : { left, top: rect.bottom + GAP, maxHeight: Math.min(view.height * 0.6, view.height - rect.bottom - GAP - EDGE) }
}
