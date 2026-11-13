import type { TKey } from './i18n/index.ts'

// 바깥 UI(창·메뉴·카드)의 화면 모드와 색 테마. 사무실 그림(Settings.theme·dayNight)과는 따로다.
// 색 값은 renderer/index.css의 [data-theme][data-mode] 토큰이 기준 (docs/design-refresh/themes/tokens.css)

export type UiMode = 'system' | 'light' | 'dark'
export type UiThemeId = 'lavender' | 'blue' | 'terracotta' | 'sage' | 'rose' | 'mono' | 'aurora' | 'twilight' | 'candy' | 'meadow' | 'retro'
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
  /** 특별 테마: 이름만으로 알기 어려워 한 줄 설명과 미리보기 그림을 함께 보여 준다 */
  descKey?: TKey
}

/** 설정 화면 색 테마 묶음 — 묶음이 하나면 제목을 숨긴다 */
export const UI_THEME_GROUPS: { id: string; titleKey?: TKey; themes: UiThemeOption[] }[] = [
  {
    id: 'basic',
    titleKey: 'uiTheme.group.basic',
    themes: [
      { id: 'lavender', labelKey: 'uiTheme.name.lavender', swatchFrom: '#8B7BFF', swatchTo: '#FF7AC6' },
      { id: 'blue', labelKey: 'uiTheme.name.blue', swatchFrom: '#6C9BFF', swatchTo: '#35D0E0' },
      { id: 'terracotta', labelKey: 'uiTheme.name.terracotta', swatchFrom: '#FFB35C', swatchTo: '#E0642A' },
      { id: 'sage', labelKey: 'uiTheme.name.sage', swatchFrom: '#C8E86A', swatchTo: '#1F9A68' },
      { id: 'rose', labelKey: 'uiTheme.name.rose', swatchFrom: '#FF9AB8', swatchTo: '#D6336C' },
      { id: 'mono', labelKey: 'uiTheme.name.mono', swatchFrom: '#E5E5E5', swatchTo: '#171717' },
    ],
  },
  {
    id: 'gradient',
    titleKey: 'uiTheme.group.gradient',
    themes: [
      { id: 'aurora', labelKey: 'uiTheme.name.aurora', swatchFrom: '#7C6CFF', swatchTo: '#14B8A6' },
      { id: 'twilight', labelKey: 'uiTheme.name.twilight', swatchFrom: '#6366F1', swatchTo: '#F97316' },
      { id: 'candy', labelKey: 'uiTheme.name.candy', swatchFrom: '#D946EF', swatchTo: '#38BDF8' },
      { id: 'meadow', labelKey: 'uiTheme.name.meadow', swatchFrom: '#22C55E', swatchTo: '#F5B21A' },
    ],
  },
  {
    // 색만이 아니라 모양·글꼴까지 바꾸는 테마 (규칙: renderer/theme-retro.css)
    id: 'special',
    titleKey: 'uiTheme.group.special',
    themes: [{ id: 'retro', labelKey: 'uiTheme.name.retro', descKey: 'uiTheme.retro.desc', swatchFrom: '#8F80E6', swatchTo: '#E8C79A' }],
  },
]

export const UI_THEME_IDS: UiThemeId[] = UI_THEME_GROUPS.flatMap((g) => g.themes.map((x) => x.id))

/** 다크로만 만든 테마 — 고르면 앱 화면 모드 설정과 상관없이 다크로 보이고, 다른 테마로 바꾸면 원래 설정대로 돌아간다 */
export const DARK_ONLY_THEMES: readonly UiThemeId[] = ['retro']

/** 테마까지 따진 화면 모드 (저장된 uiMode는 그대로 둔다) */
export const themeMode = (theme: UiThemeId, mode: UiMode): UiMode => (DARK_ONLY_THEMES.includes(theme) ? 'dark' : mode)

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

/** 레트로(다크 전용)는 바탕이 라벤더와 많이 달라 따로 둔다 — 값은 theme-retro.css의 --background·--foreground와 같다 */
const RETRO_WINDOW_BG = { background: '#1D1A2A', symbol: '#FAF5EC' }

export const windowBg = (theme: UiThemeId, mode: ResolvedMode) => (theme === 'retro' ? RETRO_WINDOW_BG : WINDOW_BG[mode])
