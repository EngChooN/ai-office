// 움직임 줄이기 — 시스템 '애니메이션 제거'(맥 '동작 줄이기'·윈도우 '애니메이션 효과 끄기')가 prefers-reduced-motion으로 온다.
// 지도 장면·바깥 풍경·꾸미기·소품 연출이 같은 값을 본다. 읽을 때마다 지금 값이라, 매 프레임 읽으면 설정을 바꾸자마자 따른다

const QUERY = '(prefers-reduced-motion: reduce)'
let mql: MediaQueryList | null = null
const query = () => (mql ??= typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null)

export const isReducedMotion = () => query()?.matches ?? false
