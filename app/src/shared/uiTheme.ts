import type { TKey } from './i18n/index.ts'

// 바깥 UI(창·메뉴·카드)의 화면 모드와 색 테마. 사무실 그림(Settings.theme·dayNight)과는 따로다.
// 색 값은 renderer/index.css의 [data-theme][data-mode] 토큰이 기준 (docs/design-refresh/themes/tokens.css)

export type UiMode = 'system' | 'light' | 'dark'
export type UiThemeId = 'lavender' | 'blue' | 'terracotta' | 'sage' | 'rose' | 'mono'
export type ResolvedMode = 'light' | 'dark'

export const DEFAULT_UI_MODE: UiMode = 'system'
export const DEFAULT_UI_THEME: UiThemeId = 'lavender'
export const UI_MODES: UiMode[] = ['system', 'light', 'dark']

export interface UiThemeOption {
  id: UiThemeId
  labelKey: TKey
  /** 설정 카드 동그란 견본 (135° 2색 그라데이션) */
  swatchFrom: string
  swatchTo: string
}

/** 설정 화면 색 테마 묶음 — 묶음이 하나면 제목을 숨긴다 */
export const UI_THEME_GROUPS: { id: string; titleKey?: TKey; themes: UiThemeOption[] }[] = [
  {
    id: 'basic',
    themes: [
      { id: 'lavender', labelKey: 'uiTheme.name.lavender', swatchFrom: '#8B7BFF', swatchTo: '#FF7AC6' },
      { id: 'blue', labelKey: 'uiTheme.name.blue', swatchFrom: '#6C9BFF', swatchTo: '#35D0E0' },
      { id: 'terracotta', labelKey: 'uiTheme.name.terracotta', swatchFrom: '#FFB35C', swatchTo: '#E0642A' },
      { id: 'sage', labelKey: 'uiTheme.name.sage', swatchFrom: '#C8E86A', swatchTo: '#1F9A68' },
      { id: 'rose', labelKey: 'uiTheme.name.rose', swatchFrom: '#FF9AB8', swatchTo: '#D6336C' },
      { id: 'mono', labelKey: 'uiTheme.name.mono', swatchFrom: '#E5E5E5', swatchTo: '#171717' },
    ],
  },
]

export const UI_THEME_IDS: UiThemeId[] = UI_THEME_GROUPS.flatMap((g) => g.themes.map((x) => x.id))

/** 'system'이면 기기 설정을 따른다 */
export const resolveMode = (mode: UiMode, prefersDark: boolean): ResolvedMode => (mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode)

/** 저장값·캐시에서 읽은 값을 알 수 있는 값으로 (모르면 기본값) */
export function sanitizeUi(raw: { uiMode?: unknown; uiTheme?: unknown } | null | undefined): { uiMode: UiMode; uiTheme: UiThemeId } {
  const uiMode = UI_MODES.includes(raw?.uiMode as UiMode) ? (raw!.uiMode as UiMode) : DEFAULT_UI_MODE
  const uiTheme = UI_THEME_IDS.includes(raw?.uiTheme as UiThemeId) ? (raw!.uiTheme as UiThemeId) : DEFAULT_UI_THEME
  return { uiMode, uiTheme }
}

/** 첫 페인트 전에 index.html 인라인 스크립트가 읽는 캐시 키 — 값: { mode, theme } */
export const UI_THEME_CACHE_KEY = 'office.uiTheme'

/** 창 배경색(첫 페인트 전 깜빡임 방지·윈도우 제목 표시줄) — 토큰의 라벤더 --background 근사 */
export const WINDOW_BG: Record<ResolvedMode, { background: string; symbol: string }> = {
  light: { background: '#F6F5FB', symbol: '#221F33' },
  dark: { background: '#14131C', symbol: '#E8E6F5' },
}
