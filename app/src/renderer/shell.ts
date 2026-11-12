// 이 화면 묶음이 어느 틀에서 도는지: 데스크톱(Electron 이 PC 창) · 모바일(안드로이드 WebView 빌드) · 원격(데스크톱 원격 창 = 다른 PC 화면)
// __OFFICE_SHELL__은 모바일·원격 빌드만 정의한다 — 이 파일 말고는 읽지 않는다

export type Shell = 'desktop' | 'mobile' | 'remote'

const DEFINED = typeof __OFFICE_SHELL__ !== 'undefined' ? __OFFICE_SHELL__ : undefined
export const SHELL: Shell = DEFINED === 'mobile' ? 'mobile' : DEFINED === 'remote' ? 'remote' : 'desktop'
/** 휴대폰 배치·터치 (레이아웃 판정용) — PC 전용 기능을 잠글 때는 IS_REMOTE_SCREEN을 쓴다 */
export const IS_MOBILE_SHELL = SHELL === 'mobile'
/** 다른 기기에서 원격으로 보는 화면인지 (휴대폰·다른 PC 원격 창) — PC 전용 기능(폴더 고르기·로그인·연결 설정 등)을 잠근다.
 * scripts/workspace.test.mts가 IS_MOBILE_SHELL을 레이아웃 파일 밖에서 쓰지 않는지 확인한다 */
export const IS_REMOTE_SCREEN = SHELL !== 'desktop'

/** 손가락으로 쓰는 기기인지 (모바일 빌드에서만 참 — 데스크톱 문구·키는 그대로) */
export const IS_TOUCH = IS_MOBILE_SHELL && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
