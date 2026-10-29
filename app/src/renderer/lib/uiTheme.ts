import { resolveMode, UI_THEME_CACHE_KEY, type UiMode, type UiThemeId } from '@shared/uiTheme'

// 바깥 UI 화면 모드·색 테마를 <html data-theme data-mode>에 반영한다 (색 값은 index.css 토큰).
// 첫 페인트는 index.html 인라인 스크립트가 같은 캐시로 먼저 칠한다

const DARK_QUERY = '(prefers-color-scheme: dark)'
let current: { uiMode: UiMode; uiTheme: UiThemeId } | null = null

const prefersDark = () => window.matchMedia(DARK_QUERY).matches

function paint() {
  if (!current) return
  const root = document.documentElement
  const mode = resolveMode(current.uiMode, prefersDark())
  if (root.dataset.mode === mode && root.dataset.theme === current.uiTheme) return
  root.dataset.mode = mode
  root.dataset.theme = current.uiTheme
  root.style.colorScheme = mode
}

export function applyUiTheme(next: { uiMode: UiMode; uiTheme: UiThemeId }) {
  if (current?.uiMode === next.uiMode && current.uiTheme === next.uiTheme) return
  current = { uiMode: next.uiMode, uiTheme: next.uiTheme }
  paint()
  try {
    localStorage.setItem(UI_THEME_CACHE_KEY, JSON.stringify({ mode: next.uiMode, theme: next.uiTheme }))
  } catch {
    // 저장소를 못 쓰면 다음 첫 페인트만 기본값으로 시작한다
  }
}

/** 'system'일 때 기기의 라이트·다크 변경을 바로 따라간다 (main이 nativeTheme.themeSource를 uiMode에 맞춘다). 한 번만 부른다 */
export function watchSystemMode() {
  const mq = window.matchMedia(DARK_QUERY)
  mq.addEventListener('change', paint)
  return () => mq.removeEventListener('change', paint)
}
