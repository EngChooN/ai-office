// 이 화면 묶음이 어느 틀에서 도는지: 데스크톱(Electron) · 모바일(안드로이드 WebView 빌드)
// __OFFICE_SHELL__은 모바일 빌드만 정의한다 — 이 파일 말고는 읽지 않는다

export type Shell = 'desktop' | 'mobile'

export const SHELL: Shell = typeof __OFFICE_SHELL__ !== 'undefined' && __OFFICE_SHELL__ === 'mobile' ? 'mobile' : 'desktop'
export const IS_MOBILE_SHELL = SHELL === 'mobile'


/** 손가락으로 쓰는 기기인지 (모바일 빌드에서만 참 — 데스크톱 문구·키는 그대로) */
export const IS_TOUCH = IS_MOBILE_SHELL && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
