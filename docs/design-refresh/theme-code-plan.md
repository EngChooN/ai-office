# 테마 기반 코드 설계 (박패턴 설계 · 리드 확정)

## 확정한 선택
- 깜빡임 방지: localStorage 캐시(`office.uiTheme` = `{mode, theme}`) + `index.html` 인라인 스크립트. 첫 페인트 전에 `<html data-theme data-mode>` 설정. 캐시가 없으면 system + lavender. CSP가 있으면 인라인 허용 확인.
- `nativeTheme.themeSource`를 `uiMode`에 맞춘다. renderer는 `matchMedia('(prefers-color-scheme: dark)')`만 구독.
- 휴대폰 원격 허용 필드(`restrictRemoteArgs`)에는 넣지 않는다.
- 창 배경색(`#0f1115`)·윈도우 titleBarOverlay(`#111318`)는 `nativeTheme.shouldUseDarkColors`로 고르고, 모드가 바뀌면 `setBackgroundColor`·`setTitleBarOverlay` 갱신. 값은 토큰의 `--background`.

## 파일별 역할
| 파일 | 할 일 |
|---|---|
| 신규 `src/shared/uiTheme.ts` | `UiMode = 'system'\|'light'\|'dark'`(기본 system), `UiThemeId = lavender\|blue\|terracotta\|sage\|rose`(기본 lavender), `UI_THEME_GROUPS: { id, titleKey?, themes: { id, labelKey, swatchFrom, swatchTo }[] }[]`(이번엔 그룹 1개, 제목 숨김), `resolveMode(mode, prefersDark)`, `sanitize(raw)`. 순수 함수만 |
| `src/shared/types.ts` | `Settings`에 `uiMode`, `uiTheme` 추가, `DEFAULT_SETTINGS` 기본값, `withSettingsDefaults`에서 `sanitize`. 주석: 사무실 그림(theme·dayNight) ≠ 바깥 UI(uiTheme·uiMode) |
| 신규 `src/renderer/lib/uiTheme.ts` | `applyUiTheme({uiMode, uiTheme})`: `dataset.mode`(해석된 light/dark)·`dataset.theme`·`style.colorScheme` 설정 + 캐시 기록. `watchSystemMode(cb)` |
| `store.ts` `setSnapshot` | `applyLanguage` 옆에서 `applyUiTheme` 호출. 구독은 `main.tsx`에서 한 번 |
| `index.html` | 인라인 동기 스크립트 |
| `src/main/index.ts` | nativeTheme·창 배경 연동 |
| `index.css` | 이디자 `docs/design-refresh/themes/tokens.css` 병합. 기존 `:root` 다크 값은 폴백으로 유지(라벤더 다크와 값이 맞는지 확인). `@custom-variant dark (&:where([data-mode='dark'], [data-mode='dark'] *))`로 변경 |
| `SettingsPage.tsx` + i18n | 화면 모드 세그먼트, 슬랙식 색 테마 카드(아래). 로컬 상태 없이 `update({ uiMode })` |

## 색 테마 카드 (참고: `ref/slack-theme-picker.png`)
- 3열 격자, 테두리 있는 둥근 카드, 왼쪽 동그란 견본(135° 2색 그라데이션), 오른쪽 이름. 고른 카드는 강조색 테두리.
- 견본 색과 이름은 `themes/themes.json`이 기준. 이디자 최종 이름: 라벤더 / 스카이(blue) / 노을(terracotta) / 숲속(sage) / 벚꽃(rose). 4개 언어.

| id | 견본 그라데이션 |
|---|---|
| lavender | `#8B7BFF` → `#FF7AC6` |
| blue | `#6C9BFF` → `#35D0E0` |
| terracotta | `#FFB35C` → `#E0642A` |
| sage | `#C8E86A` → `#1F9A68` |
| rose | `#FF9AB8` → `#D6336C` |

## 검증 (`scripts/uiTheme.test.mts`)
- 기본값, 옛 설정 → 기본값 채움, 알 수 없는 값 → 기본값
- `resolveMode` 3모드 × prefersDark 2값
- 테마 id 중복 없음, 기본 테마 포함, 4개 언어 문구 키 존재
- 인라인 스크립트와 `resolveMode` 결과 일치(`new Function`)
