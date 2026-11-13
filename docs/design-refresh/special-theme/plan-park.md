# 특별 테마 A안(레트로 오피스 도트) 구현 설계 — 박패턴 (유지보수성·변경 영향 최소화·검증 가능성)

> 2026-11-13 · 설계만 씀(코드 수정 없음). 최가독 안은 받지 않아 비교하지 않음.
> 읽은 것: `special-theme/notes.md`, `fonts/OFL.md`, `index.css`(토큰·base·reduced-motion), `shared/uiTheme.ts`, `lib/uiTheme.ts`, `index.html`·`remote.html` 부트 스크립트, `components/ui/button.tsx`, 글자 크기·둥근 모서리 사용 횟수 집계.
> 경로는 모두 `app/` 기준(`src/renderer/…`).

## 0. 한 줄 방향
**"테마 하나 더"로 취급한다.** 새 테마 id `retro`를 기존 13종과 같은 방식(`<html data-theme data-mode>`)으로 켜고, 모든 새 규칙을 **새 CSS 파일 한 곳에 `[data-theme='retro']`로 가둔다.** 공통 부품(tsx)은 되도록 안 고치고, 다른 테마 화면은 코드상 영향이 0이 되게 한다. 이게 이번 작업에서 가장 중요한 이득: 지금 v1.3.2가 같은 파일을 고치는 중이라 충돌이 거의 없고, 문제가 생기면 파일 하나만 빼면 된다.

## 1. 켜고 끄기 (기본 테마 그대로)
| 변경 | 방식 | 이유 |
|---|---|---|
| `shared/uiTheme.ts` | `UiThemeId`에 `'retro'` 추가, `UI_THEME_GROUPS`에 새 묶음 `special`(제목 "특별 테마") 추가. `DEFAULT_UI_THEME`은 `lavender` 그대로 | 저장값·`sanitizeUi`·`UI_THEME_IDS`가 목록에서 자동 파생 → 모르는 값은 기본값으로 떨어짐(기존 안전장치 재활용) |
| `shared/types.ts` | 변경 없음(`uiTheme: UiThemeId` 그대로) | 새 설정 항목 안 만듦 = 저장 데이터 이행 불필요 |
| `index.html`, `remote.html` 부트 스크립트 | 정규식 `(lavender\|…\|meadow)`에 `retro` 추가 | 깜빡임 방지용 첫 페인트가 이 목록을 따로 들고 있음. **빠뜨리면 켜 둔 상태로 재실행 때 한 순간 기본 테마로 번쩍이고 `remote.html`은 아예 못 알아봄** |
| `SettingsPage.tsx` | 기존 테마 카드 그리드가 `UI_THEME_GROUPS`를 돌면 자동 표시. 견본 색(`swatchFrom/To`)은 팔레트의 주황·민트 | 새 UI를 안 만들고 묶음만 추가 |
| `shared/i18n` 4개 언어 | `uiTheme.group.special`, `uiTheme.name.retro` | 기존 키 패턴 그대로 |
| 창 배경 `WINDOW_BG` | 지금은 모드만 키로 가짐(`light/dark`). retro는 바탕이 달라(크림 `#fffcf5`·남색) **테마별 값을 넘길 수 있게** `windowBg(theme, mode)` 하나로 감싸기. 부르는 곳(`main/index.ts` 246행 부근, 부트)은 확인 필요 | 윈도우 제목 표시줄 색이 어긋나는 것 방지. 기존 테마는 기존 값 반환 |
| 부트 스크립트·목록 어긋남 방지 | **시험 1개**: `UI_THEME_IDS`와 두 html의 정규식을 파싱해 같은지 비교 | 지금도 수동 동기화 3곳(ts·index.html·remote.html). 14번째를 넣는 김에 자동 잠금 |

끄기 = 설정에서 다른 테마 고르기. 별도 스위치 없음(기능 깃발 불필요). 문제가 터졌을 때의 비상구는 `UI_THEME_GROUPS`에서 `special` 한 줄 빼기(이미 retro 저장된 사람은 `sanitizeUi`가 기본값으로 되돌림 — 이 동작을 시험으로 확인).

## 2. 영역별 방식 (건드릴 파일)
**원칙: 새 파일 `renderer/theme-retro.css`(+ 글꼴 `@font-face`)를 `main.tsx`에서 `index.css` 뒤에 import. 이 파일 규칙은 전부 `[data-theme='retro']` 아래.** 신규 규칙은 레이어 밖(unlayered)에 두면 Tailwind 유틸(레이어 안)을 `!important` 없이 이긴다(Tailwind v4 구조 — 1차 스파이크에서 확인).

| 영역 | 방식 | 이번 작업의 이득 / 추가 복잡도 |
|---|---|---|
| **색 변수** | 기존 토큰 이름(`--background`, `--card`, `--primary`, `--border`, `--ring`, `--muted-foreground`…)을 라이트·다크 두 블록(`[data-theme='retro'][data-mode='light'\|'dark']`)으로 채움. 값은 시안 A 토큰 그대로. 그라데이션 토큰(`--grad-primary`, `--spark-*`)은 **단색**으로(`--grad-primary: none` + 단색 `background`) | 새 이름 안 만들고 컴포넌트가 이미 쓰는 이름을 재활용 → 부품 수정 0. 단, 13종 블록에 있는 **모든 토큰을 빠짐없이** 정의해야 함 → 시험: 기존 블록의 변수 이름 집합 ⊆ retro 블록(빠지면 폴백 `lavender`/기본값이 섞여 보임) |
| **테두리·모서리** | `--radius*`·`--radius-pill/card/hud/dialog` = 0. Tailwind의 `--radius-2xl/3xl`도 0(`rounded-2xl` 등은 테마 변수를 읽는지 확인). `rounded-full`(48개 파일)은 직원 얼굴·상태 점 등이 섞여 있어 **일괄 0으로 하지 말고** 1차는 목록으로 확인(§7) | 직접 쓴 둥근 클래스 약 400곳(92파일)을 파일마다 안 고치고 변수·선택자로 흡수. 못 흡수하는 `rounded-[Npx]` 직접값은 `[class*='rounded-[']` 선택자 한 줄 + 개수 점검 시험 |
| **귀퉁이 한 칸 빠진 테두리** | `clip-path`는 그림자·포커스 링을 잘라 먹음 → **`box-shadow` 겹겹**(상하좌우 2px 외곽선 + 귀퉁이 비움)으로 구현하고 `border: 0`. 공통 부품 8종(`button·card·input·textarea·select·switch·badge·dialog`)에 붙임 | 부품이 이미 `box-shadow`를 쓰는 곳(`--shadow-primary`, 포커스 링)과 충돌 → retro에서 `--focus-ring`은 `outline: 2px solid`(오프셋 2px)로 대체하고 `--shadow-*`는 §아래 규칙으로 통일 |
| **그림자** | 오른쪽 아래 6px 흐림 없음: `--shadow-soft/primary/dialog`를 같은 값(`6px 6px 0 var(--st-shadow)`)으로 재정의 | 기존 부품은 변수만 읽으므로 자동 반영 |
| **버튼** | `data-slot="button"` 선택자로 아래 받침·눌림(`translate 2px`)을 부여. `button.tsx`의 cva 클래스 수정 없음 | `data-slot`은 `button·card·input·textarea·badge·label·switch`에 있음. **`select.tsx`·`dialog.tsx`에는 없음** → 이 둘만 `data-slot` 한 줄씩 추가(다른 테마 무영향) |
| **아이콘** | ① `duo-icon.tsx`(자체 21개): `duo-icon-data.ts`는 10×10 격자 데이터로 **retro용 두 번째 세트**를 두고, 컴포넌트는 `data-theme` 대신 **CSS로 선택**(두 SVG를 같이 그리지 말고 `useUiTheme()`로 한쪽만 렌더 — 훅이 없으면 `document.documentElement.dataset.theme` 구독 한 곳을 `lib/uiTheme.ts`에 추가). ② `lucide-react`(75개 파일): 1차는 **CSS만**으로 각지게(`stroke-linecap: square; stroke-linejoin: miter; shape-rendering: crispEdges`), 도트 대체는 2차에 사용 빈도 상위부터 | 75개 파일을 1차에 전부 손대면 v1.3.2와 충돌·검토 부담 폭증. CSS 근사는 파일 수정 0. 대신 "진짜 도트 아이콘"은 점진 |
| **글꼴** | §3 |  |
| **글자 크기 토큰** | §4 | |

> 확인하지 못한 것: 위 `box-shadow` 겹겹 외곽선이 `overflow-hidden`·스크롤 영역 안에서 잘리지 않는지, `select/dialog`가 어떤 클래스로 모서리를 주는지. → 단계 0(스파이크)에서 버튼+카드+입력+대화상자 4개로 먼저 확인.

## 3. 글꼴 라이선스·용량
- **라이선스**: 갈무리 = SIL OFL 1.1(`fonts/OFL.md`, 저작권 줄 `Copyright © 2019–2025 Lee Minseo`). 앱에 포함·재배포·상업 사용 가능, **글꼴 단독 판매만 금지**. 지킬 것: ① 저작권 고지 + OFL 전문을 **앱과 함께 배포**(`extraResource`에 `OFL.md` 추가, 설정 "정보/오픈소스" 같은 곳이 있으면 거기에도 한 줄 — 그런 화면이 있는지는 확인 못 함) ② **글꼴 파일을 고치지 않는다.** OFL은 수정판에 Reserved Font Name 사용을 막을 수 있어, 글자 줄이기(서브셋)는 이름 문제를 일으킬 수 있음 → 원본 그대로 사용. (`OFL.md`에 RFN 지정 문구가 있는지는 맨 윗줄 저작권에서 "with Reserved Font Name"이 안 보여 지정 없음으로 **추정**, 구현 때 원문 재확인.)
- **넣을 파일(시안 폴더 기준 크기, 직접 확인)**:
  | 파일 | 크기 | 용도 | 판단 |
  |---|---|---|---|
  | `Galmuri14.woff2` | 565KB | 본문 15px | **넣음** |
  | `Galmuri11.woff2` | 505KB | 라벨·버튼 12px | **넣음** |
  | `Galmuri11-Bold.woff2` | 167KB | 굵은 라벨 | **디자이너 확인 후**(시안이 굵은 12px를 쓰는지 — 안 쓰면 제외. 안 넣으면 `font-synthesis: none`으로 가짜 굵게 방지) |
  | `Galmuri9.woff2` | 430KB | 9px | **넣지 않음**(12px 미만 금지) |
- **용량**: 넣는 양 1.07MB(Bold 포함 1.24MB). 설치 파일 전체 크기는 확인 못 함(추정: 전체 대비 작음). 윈도우·맥 설치본에서 **각각 설치 파일 크기 전후 비교**를 1차 완료 기준에 넣는다.
- **적재 방식**: `renderer/assets/fonts/`에 두고 `theme-retro.css`의 `@font-face`에서 `url()`로 참조 → Vite가 묶어 줌. `font-display: block`(로컬 파일이라 즉시, 도트 글꼴은 대체 글꼴이 번쩍이면 어색). CSP(`font-src 'self' data:`)는 이미 허용 → 변경 불필요. 시안의 CDN 주소는 **쓰지 않는다**(오프라인·CSP). 글꼴은 retro 글자가 화면에 그려질 때만 읽힘.
- **안드로이드(원격 웹)**: 같은 CSS를 쓰면 휴대폰이 처음 열 때 1MB를 한 번 받음(이후 캐시). 한 번 받는 양이 문제면 2차에 용량 검토.

## 4. 글자 크기·대비·움직임 줄이기
**크기 12/15/24px만**
- 현재 코드 사용량: `text-xs` 572 · `text-sm` 213 · `text-base` 13 · `text-lg` 8 · `text-xl` 6, 그리고 **직접 px**: `text-[11px]` 167 · `text-[10px]` 72 · `13px` 6 · `14px` 2 · 기타 3(전부 직접 확인). 10·11px는 **239곳** — 12px 미만이라 retro에서 모두 12로 올려야 함.
- 방식: ① retro 블록에서 Tailwind 글자 변수 재정의(`--text-xs:12px`, `--text-sm:15px`, `--text-base:15px`, `--text-lg:24px`, `--text-xl:24px`와 각 `--line-height`) → 클래스 약 800곳이 자동 반영(Tailwind v4가 `var(--text-*)`를 읽는지 스파이크에서 확인). ② 직접 px 약 250곳은 **선택자 대응표**(`[class*='text-[11px]']→12px` 등) 한 블록. ③ **시험**: `renderer` 전체에서 `text-[Npx]`를 훑어 N이 대응표에 없으면 실패 → 새로 추가되는 임의 크기가 retro를 깨지 않게 잠금.
- 이득/복잡도: 파일 수정 0으로 크기 규칙 강제. 대신 선택자 대응표는 일종의 "우회"라 2차 후반에 `text-label/body/title` 토큰 클래스로 바꾸는 정리를 선택 사항으로 남김(안 해도 시험이 지킴).
- 15px 본문은 지금(14px)보다 넓어 **줄바꿈·고정 폭 칸이 깨질 수 있음**(대화·기록·보드·휴대폰) → 줄 간격 넉넉히(본문 1.7 안팎), 1차 핵심 화면별 캡처로 확인.
- **'글자 크기' 설정과의 관계**: 코드에서 앱 차원의 "글자 크기" 설정은 **찾지 못했습니다**(설정 화면·타입에 없음, 글자 관련 매치는 모두 지도 그림 안쪽). v1.3.2에서 새로 들어오는지, 윈도우 배율·`zoomFactor`를 말씀하시는지 **정리드께 확인 필요**. 들어온다는 전제의 설계: retro일 때 이 설정은 **정수 배수(1× / 2×)만** 허용하거나 **잠그고 안내 문구**("도트 테마는 글자 크기가 고정돼요")를 보인다. 중간 크기는 도트가 흐려짐. 판단은 정리드.

**대비 4.5**
- 시안 표(`st-contrast.png`)는 6조합 모두 4.6 이상. **구현 후 숫자가 달라지지 않게** 시험으로 잠금: `theme-retro.css`의 retro 두 블록에서 토큰을 읽어(본문/배경, 흐린 글자/카드, 버튼·배지·알림 글자/각 바탕) 대비 ≥ 4.5를 검사하는 `scripts/themeRetro.test.mts`. 시안 HTML의 계산식을 그대로 옮기면 두 곳이 같은 기준.
- 짚을 점: 다크의 **테두리/카드 대비 1.5~1.8**은 글자가 아니라 경계선이라 4.5 대상은 아니지만(WCAG 비글자 3:1 권장 수준에는 미달), A는 안쪽 밝은 줄로 보완. 입력칸·버튼 경계는 3:1 이상으로 맞추도록 완료 기준에 포함할지 정리드가 판단.

**움직임 줄이기**
- 현재 앱에는 **OS 설정(`prefers-reduced-motion`) 대응 15곳만** 있고 앱 안 설정은 못 찾음. retro의 ▼ 깜빡임(`steps(1)` 반복)은 같은 미디어 쿼리에서 `animation: none` + 항상 보이는 상태로. 새 설정은 만들지 않음(만들 이유 없음). v1.3.2에서 앱 설정이 생기면 그 신호(`data-motion` 등)에 한 줄 추가.
- ▶ 선택 표시·칸 끊긴 막대 등 **정적 장식은 유지**, 움직이는 것만 정지. 시험: `theme-retro.css`의 모든 `animation`이 `prefers-reduced-motion` 블록에서 꺼지는지 파싱.

## 5. 다국어 대체 글꼴 순서
- 갈무리는 한글·라틴은 있고, **일본어 가나·한자·중국어 글자 범위는 확인하지 못함**(도구 없음). 구현 첫날 `fonttools`로 `cmap` 점검: 한글 11,172자, 가나, 한자(자주 쓰는 3천~), 문장부호가 들어 있는지.
- 글꼴 줄(공통 형태, 앞에서부터 글자 하나씩 차례로 찾음):
  - 한국어·영어: `'Galmuri14'(본문)/'Galmuri11'(라벨)` → `'Apple SD Gothic Neo'`(맥) → `'Malgun Gothic'`(윈도우) → `'Noto Sans KR'`(안드로이드) → `sans-serif`
  - 일본어: 갈무리 → `'Hiragino Sans'` → `'Yu Gothic UI'` → `'Meiryo'` → `'Noto Sans CJK JP'` → `sans-serif`
  - 중국어 간체: 갈무리 → `'PingFang SC'` → `'Microsoft YaHei UI'` → `'Noto Sans CJK SC'` → `sans-serif` (번체는 `PingFang TC`/`Microsoft JhengHei`)
- **주의: 앱이 언어에 따라 `<html lang>`을 바꾸지 않는 것으로 보임**(`documentElement.lang` 설정을 못 찾음, `index.html`은 `lang="ko"` 고정) → 언어별 순서를 `:lang(ja)` 등으로 고르려면 `lib/i18n.ts`의 `applyLanguage`에 `document.documentElement.lang` 설정 한 줄이 필요. 대안은 `data-lang` 속성. 이 한 줄은 다른 테마에도 영향을 주므로(한자 글꼴 선택이 바뀔 수 있음) **retro에서만 읽게 하고** 값만 설정한다.
- 섞여 보임 완화(2차): `@font-face`에 `local()` 대체 글꼴을 `size-adjust`로 맞춘 래퍼를 두면 12px 도트 글자 옆의 일반 글자 크기 차이가 줄어듦. 효과 대비 복잡해 **측정 후** 필요할 때만.
- 검증: 4개 언어 × 핵심 화면 캡처에서 빠진 글자(네모·섞임)를 확인. 고객 데이터(채팅 본문)는 어떤 글자든 들어오므로 대체가 **항상 존재**해야 함(마지막 `sans-serif`).

## 6. 적용 범위
| 환경 | 상태 / 설계 |
|---|---|
| **맥·윈도우(데스크톱 Electron)** | `index.css` + `theme-retro.css` 그대로. 윈도우는 제목 표시줄 색 = `windowBg`(§1). 지도(Phaser 캔버스)는 테마 영향 없음(원래 바깥 UI 토큰과 분리) |
| **바탕화면 비서 창(`.pet-panel`)** | 같은 토큰을 씀 → 색·글꼴은 따라오나 작은 글자가 많아 12px 규칙 영향 큼 → **2차**에서 확인 |
| **안드로이드(원격 웹 화면, `remote.html`·`mobile.html`)** | 부트 정규식에 `retro` 추가 필수(§1). 모바일 진입점이 `index.css`를 같은 방식으로 불러오는지는 **확인하지 못함** → 단계 0에서 확인. `phone:` 변형(터치 최소 높이 `min-h-10`)은 retro에서도 유지(도트 두께 때문에 터치 영역을 줄이지 않기). 안드로이드 기본 글꼴 쪽 대체 순서는 §5 |
| **윈도우 배율 125/150%** | CSS 2px = 장치 2.5·3px → 선 굵기·도트가 흐리거나 들쭉날쭉(추정). 갈무리11은 11·22px 정수배에서만 또렷해 12px×1.25=15px 등은 번질 수 있음. **1차 완료 기준에 100/125/150% 캡처 3장 확인**을 넣고, 허용 못 하면 대응 순서: ① 테두리를 `max(1px 정수)`가 되게 하고 `devicePixelRatio`를 `data-dpr`로 알려 정수 장치 픽셀로 반올림(Electron 44의 Chromium은 CSS `round()` 사용 가능 — 확인) ② 그래도 흐리면 125/150에서만 글꼴 크기를 정수배에 맞춘 값으로 대체. 안드로이드(DPR 2.6~3.0 등 비정수 흔함)도 같은 점검. 이 부분은 **측정 전에 약속하지 않음** |

## 7. 위험·단계·완료/검증 기준
**위험(큰 순)**
1. 15px 본문 + 12px 고정 → **줄바꿈·고정 폭 깨짐**(가장 큼, 대화·보드·휴대폰). 완화: 핵심 화면별 캡처.
2. `box-shadow` 방식 테두리가 부품의 기존 `box-shadow`·`overflow-hidden`과 충돌. 완화: 단계 0 스파이크.
3. 규칙이 retro 밖으로 새어 **기존 13종이 바뀜**. 완화: 아래 "영향 없음 확인".
4. 부트 정규식·`WINDOW_BG` 수동 동기화 누락. 완화: 시험 잠금.
5. v1.3.2와 같은 파일(`SettingsPage.tsx`, `index.css`)을 건드려 충돌. 완화: 새 CSS 파일, `SettingsPage`는 건드리지 않음(그리드 자동), `index.css`는 **건드리지 않음**(import만 `main.tsx`).
6. 글꼴 범위·배율 흐림은 **측정 전 추정**.

**단계 0 — 스파이크(반나절~1일, 머지 안 함)**: 버튼·카드·입력·대화상자 4개를 retro로 그려 §2의 미확인 4가지(레이어 우선순위, Tailwind 글자 변수, `overflow` 안 외곽선, `select/dialog` 모서리)와 §5 글자 범위, §6 모바일 진입점 CSS를 확인. 결과로 이 문서를 보정.

**1차 — 핵심 화면**: 테마 등록(§1) + `theme-retro.css`(색·모서리·그림자·버튼·크기 변수) + 글꼴 + 공통 부품 8종 + `duo-icon` 21개 도트판 + lucide CSS 각짐. 화면: 설정(테마 고르기), 상단·사이드, 직원 패널, 결재 카드, 대화, 지도 위 HUD.
- 완료 기준: ① 설정에서 고르면 즉시 바뀌고 재실행해도 유지, 기본 `lavender` 불변 ② 위 화면 라이트·다크 12장 캡처에서 테두리·버튼·아이콘·글꼴이 시안 A와 같은 규칙 ③ 대비 시험 통과 ④ 12/15/24 외 글자 크기 없음(시험) ⑤ 움직임 줄이기에서 깜빡임 정지 ⑥ 윈도우 100/125/150% 캡처 ⑦ 한·영·일·중 캡처 ⑧ `typecheck`·`test` 통과 ⑨ 설치 파일 크기 전후 기록.

**2차 — 나머지**: lucide 도트 대체(사용 빈도 상위부터), `rounded-*` 잔여, 비서 창, 매뉴얼·기록·보드·휴대폰 화면, 선택 표시 ▶·이름표 대화창 같은 재미 요소, 크기 선택자 → 토큰 정리(선택).
- 완료 기준: 앱 전 화면 목록(구현 시 작성)에서 각진 모서리·12px 미만·옛 아이콘 잔존 0 점검표 통과, 안드로이드 실기기 캡처.

**기존 테마에 영향 없음 확인(자동 3 + 수동 1)**
1. **스코프 시험**: `theme-retro.css`의 모든 최상위 규칙 선택자가 `[data-theme='retro']`로 시작함을 파싱 확인(`@font-face`·`@keyframes` 제외).
2. **`index.css` 기준선**: 구현 전 `index.css`의 기존 13종 토큰 블록 해시를 시험에 기록 → 해시가 바뀌면 의도 변경인지 확인(남이 건드렸는지 검출).
3. **테마 목록 동기화 시험**(§1).
4. **기존 테마 화면 대조**(수동): 13종 중 대표 3개(`lavender`·`mono`·`candy`) × 라이트·다크 × 핵심 6화면을 **변경 전/후 같은 크기 캡처로 비교**(픽셀 차이 0이어야 함). 로컬 서버를 직원별 포트로 띄우는 `scripts/qa-start.sh` 사용 가능(추정, 내용은 안 읽음).
- 신규 시험 파일: `scripts/themeRetro.test.mts`(스코프·대비·크기·움직임·토큰 누락·id 동기화). 기존 `pnpm test`에 자동 포함됨(`scripts/*.test.mts`).

## 8. 정리드가 정할 쟁점 (추천 포함)
1. **글자 크기 설정과 retro**: 설정이 있다면 retro에서 잠금(추천) / 1×·2× 정수 배수만 허용.
2. **도트 아이콘 범위**: 1차는 자체 21개 + lucide는 CSS 각짐만(추천) / 1차에 lucide 상위 N개까지.
3. **굵은 글꼴(Bold 167KB)**: 시안이 굵은 12px를 쓰는지 이디자에게 확인 후 결정(추천) — 안 쓰면 제외.
4. **1차 착수 조건**: 단계 0 스파이크 후 본 작업(추천) / 바로 착수.
5. 비글자 경계 대비 3:1을 완료 기준에 넣을지(추천: 입력칸·버튼만 포함).
