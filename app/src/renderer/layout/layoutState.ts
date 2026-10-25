// 폰·태블릿 배치 판정 (모바일 빌드). DOM을 쓰지 않는 순수 코드 — scripts/mobile.test.mts가 키보드를 흉내 내 확인한다
// 키보드가 올라오면 셸이 WebView 높이를 줄인다(adjustResize). 그 높이로 판정하면 펼친 폴드(태블릿)가 입력 중에 폰 배치로 바뀌어
// 화면 전체가 다시 그려지고 입력칸 포커스가 풀린다 → 판정은 "키보드를 뺀 높이"(안정 높이)로, 입력 중에는 높이 변화를 무시한다

/** 폰 배치 기준 폭 (dp = WebView의 CSS px). 이보다 넓으면 태블릿 — PC 배치 그대로 */
export const PHONE_MAX_WIDTH = 840
/** 이보다 낮으면 가로로 돌린 폰 — 폭이 넓어도 폰 배치에 헤더를 접는다 (태블릿은 가로여도 600 이상) */
export const SHORT_MAX_HEIGHT = 500
/** 입력 중에 높이가 이만큼 줄면 키보드가 열린 것으로 본다 (셸이 ime 값을 안 줄 때) */
const KEYBOARD_RATIO = 0.8

export interface ViewportInput {
  width: number
  height: number
  /** 셸이 알려 준 키보드 높이 (insets.ime). 이때 셸은 WebView를 줄이지 않으므로 높이는 그대로다 */
  ime: number
  /** 글자 입력칸에 포커스가 있는지 */
  isTyping: boolean
}

export interface LayoutState {
  isPhone: boolean
  /** 가로 폰 (높이가 낮아 헤더를 접는다) */
  isShort: boolean
  isKeyboardOpen: boolean
}

export function createLayoutTracker(initial: { width: number; height: number }) {
  // 키보드가 없을 때의 높이. 입력 중이 아니거나 폭이 바뀌면(회전·폴드 펼침) 새로 잡는다
  let stableHeight = initial.height
  let lastWidth = initial.width
  const decide = (width: number, height: number) => ({ isPhone: width < PHONE_MAX_WIDTH || height < SHORT_MAX_HEIGHT, isShort: height < SHORT_MAX_HEIGHT })
  let state: LayoutState = { ...decide(initial.width, initial.height), isKeyboardOpen: false }

  return {
    get: () => state,
    update({ width, height, ime, isTyping }: ViewportInput): LayoutState {
      const isRotated = width !== lastWidth
      lastWidth = width
      // ime 방식이면 WebView 높이가 그대로라 키보드가 판정을 흔들지 않는다. 예전 셸(WebView를 줄임)이면 입력 중 높이 변화를 무시한다
      if (!isTyping || isRotated) stableHeight = height
      // 키보드: 셸이 알려 준 ime > 0 (예전 셸은 입력 중 높이가 크게 줄었는지로)
      const isKeyboardOpen = ime > 0 || (isTyping && height < stableHeight * KEYBOARD_RATIO)
      state = { ...decide(width, stableHeight), isKeyboardOpen }
      return state
    },
  }
}

// ── 화면이 구독하는 값 (install.ts가 채운다. 데스크톱 빌드는 늘 PC 배치) ──

let current: LayoutState = { isPhone: false, isShort: false, isKeyboardOpen: false }
const listeners = new Set<() => void>()

export const getLayoutState = () => current

export function setLayoutState(next: LayoutState) {
  if (next.isPhone === current.isPhone && next.isShort === current.isShort && next.isKeyboardOpen === current.isKeyboardOpen) return
  current = next
  listeners.forEach((cb) => cb())
}

export function subscribeLayout(cb: () => void) {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}
