# 레트로 테마 코드 검토 (한리뷰)

판정: **revise** — 꼭 고칠 것 2건. 코드는 고치지 않았습니다. 커밋 안 함.
검증: 타입검사 오류 0건, `themeRetro`·`uiTheme` 시험 18개 통과. 실제 화면(PC·휴대폰·윈도우)은 못 봤습니다 — 아래는 코드 읽기와 검색으로 확인한 것.
참고: 설계 문서는 `docs/design-refresh/special-theme/impl-plan.md`(앱 폴더가 아니라 저장소 루트 `docs/`)에 있습니다.

## 꼭 고칠 것

### 1. "테두리 2px" 규칙이 `border-b-0`·`phone:border-x-0` 같은 "테두리 없애기"를 이겨 버린다 — 레트로 화면만 깨짐
- `src/renderer/theme-retro.css:166-172` — `[data-theme='retro'] .border { border-width: 2px }` 등.
- 이 파일은 Tailwind 레이어 밖(레이어 없는 규칙)이라, 같은 요소에 `border` + `border-b-0`/`phone:border-x-0`/`side:border-b-0`이 같이 있으면 **항상 레트로 규칙이 이긴다**. 한 줄이 2px로 되살아난다.
- 영향 받는 곳(검색으로 확인): `components/ui/dialog.tsx:22`(휴대폰 아래 시트 `phone:border-x-0 phone:border-b-0` → 사방 테두리가 다시 생김), `features/StaffPanel.tsx:511`(`phone:border-l-0`)·`518`·`593`(`side:border-b-0`), `features/ApprovalTab.tsx:199`(`last:border-b-0` → 목록 마지막 줄 밑줄), `features/ChatSlimBar.tsx:52`(`border-0`), `features/ChatPage.tsx:296`(`border-t-0`), `map/DecorDrawer.tsx:35`(`phone:border-x-0 phone:border-b-0`).
- 다른 테마는 영향 없음. 레트로 + 휴대폰·좁은 화면(③과 겹침)에서 테두리가 겹쳐 두 겹으로 보임.
- 고칠 방향: 2px 규칙을 `:where()`로 낮추고 레이어 안(`@layer utilities` 뒤쪽)에 두거나, `.border`를 직접 건드리지 말고 `--tw-border`가 아닌 너비만 `:not([class*='border-b-0']…)`로 거르기. 가장 단순한 길은 레이어 안에 넣어 순서로 지게 하는 것. 시험(`themeRetro.test.mts`)에 "border-X-0 와 함께 쓰인 곳" 확인을 하나 넣으면 재발을 막음.

### 2. 간격(`--spacing`) 1할 확대로 **윈도우 제목줄 높이(44px) 어긋남** (레트로 + 윈도우)
- `theme-retro.css`의 `--spacing: 0.275rem` → 상단 바 `h-11`이 44px가 아니라 약 48.4px.
- `src/main/index.ts:243`(`setTitleBarOverlay height: 44`)·`256`(`titleBarOverlay height: 44`)은 "상단 바 h-11 = 44px"에 맞춘 고정값(주석에 근거 있음). 레트로에서는 창 버튼이 바보다 4px 짧아 아래 띠가 어긋남.
- 고칠 방향: 레트로일 때 높이를 같이 바꾸거나(`windowBg`처럼 테마별 값), 상단 바만 `--spacing` 영향 밖의 고정 높이로. 맥은 `hiddenInset`이라 이 문제는 없음.
- 같은 이유로 `size-4`·`h-9` 등 모든 간격 기반 크기가 1.1배 — 고정 픽셀에 맞춘 곳이 더 있는지 윈도우 실화면으로 한 번 훑는 게 좋음(못 확인).

## 권장

- **전역 각지게(`*:not([data-keep-round]) { border-radius: 0 }`, css:164)**: `data-keep-round`를 쓰는 곳이 코드에 **하나도 없음**(검색). 즉 둥근 것이 전부 네모가 됨 — 아바타·상태 점·진행 막대는 의도일 수 있으나, 캐릭터 얼굴(Avatar)·색 견본 동그라미(설정 견본 `rounded-full`)가 네모가 되는 게 맞는지 화면으로 확인 필요. 이 규칙도 레이어 밖이라 `rounded-*`를 전부 이김.
- **버튼 규칙이 모든 `data-variant`에 닿음(css:~186-215)**: `link` 변형 버튼도 받침 있는 입체 버튼처럼 보이고 `border: 2px solid`가 `border-0`를 이김. `link` 변형 예외 추가 권장(`ghost`만 예외 처리돼 있음).
- **체크박스·라디오 규칙(css:~290)**: `input[type=checkbox|radio]` 전부 16×16으로 고정. `sr-only`처럼 숨겨 쓰는 체크박스가 지금은 없어 문제 없지만(검색 확인), 앞으로 생기면 보이게 됨 → 시험에 주석 정도.
- **기록 글자 크기(⑤)**: 로직은 맞음 — 저장값은 안 바꾸고 읽을 때만 가장 가까운 단계로 맞추고(`logFontStep`, 같으면 작은 쪽), 두 목록 밖 값은 기본 12로. 15·24를 저장한 채 일반 테마로 가면 각각 14·18로 보임(의도대로). 다만 **레트로에서 기록 본문은 `style={{fontSize}}`만 바뀌고 글꼴은 본문 `Galmuri14` 그대로**라 12px·24px일 때 갈무리14가 억지로 줄거나 커져 도트가 흐릴 수 있음 — 화면으로 확인(`StaffPanel.tsx:691,792`).
- 휴대폰 `remote.html`에 `<meta name="theme-color">`가 있다면 레트로에서 값이 안 바뀜(못 확인, 파일에서 그 줄을 못 찾아 "없음"으로 추정).

## 괜찮음 (확인한 것)
- **① 다른 테마 새는 곳 없음**: `theme-retro.css`의 모든 선택자가 `[data-theme='retro']` 아래이고, `data-theme`는 `<html>`에만 붙음. 단, `@font-face` 4개는 전역으로 선언되지만 `font-display`·사용처가 레트로 안이라 다른 테마에서는 내려받지 않음. `button`/`select`/`dialog`/`duo-icon`은 속성 추가만이라 모양 불변(`data-variant` 값은 스타일 안 쓰는 한 무해). `main.tsx`의 `data-lang`도 다른 테마 규칙에 안 쓰임.
- **② 레트로를 끄면 원래대로**: 저장된 `uiMode`는 그대로 두고 `themeMode()`가 읽을 때만 다크로 바꿈. `index.html` 첫 페인트(retro → dark, 아니면 저장된 mode/기기 설정), `lib/uiTheme.ts paint()`, main의 `syncNativeTheme(themeMode(...))` + `syncWindowTheme`가 같은 규칙. 레트로→다른 테마 때 `nativeTheme.themeSource`가 uiMode로 돌아가고 창 배경·윈도우 제목줄 색은 `paintWindowChrome`가 다시 칠함(`windowBg`). 바탕 비서 창·워크스페이스 창은 `windowColors()`를 같이 씀(index.ts:214,387).
- **③ 휴대폰·원격 창**: `mobile/main.tsx`·`remote/main.tsx`가 모두 `../main`을 불러 `theme-retro.css`가 같이 들어가고, `index.html`·`remote.html` 첫 페인트 스크립트도 같은 규칙. 설정 카드는 `IS_REMOTE_SCREEN`에서 비활성(기존 동작) — 이 화면에서 테마를 바꾸는 길은 없고 PC 설정을 따라감. (테두리 문제 1번만 예외)
- 미리보기 컴포넌트 `RetroThemePreview.tsx`는 `var(--…)`·`data-theme` 의존이 없어 다른 테마에서 열어도 같은 그림(코드상).
- 설정 카드·문구·`DARK_ONLY_THEMES` 구조 단순하고 시험 있음.

## 정해 주실 것
- 꼭 고칠 2건을 구현 담당에게 돌릴지 — 추천은 "예". 1번은 레트로를 켠 휴대폰·좁은 화면에서 바로 보이는 결함입니다.

## 반영 (정리드, 2026-11-13)
- 1번: `theme-retro.css` 2px 규칙 바로 뒤에 쓰이는 "테두리 없애기"(`border-0`·`border-[tblrxy]-0`·`last:`·`phone:`·`side:`)를 같은 조건으로 다시 0으로 두는 규칙 추가. 레이어로 옮기는 안은 같은 레이어 안에서 `.border`는 이기고 `border-b-0`에는 져야 해서 순서로 보장할 수 없어 버림. 새 `border-*-0`이 생기면 시험(`테두리 없애기`)이 실패해 알려 줌.
- 2번: 상단 바를 `h-11` → `h-[44px]`(간격 테마와 무관)로, 데모 무대 `top-11` → `top-[44px]`. 창 버튼 높이 44와 항상 같음. 맥 신호등 위치도 기존 테마와 같아짐. 시험 추가.
- 권장: `link` 변형 버튼 예외 추가(받침·테두리 없음). `data-keep-round`(얼굴·색 견본)·기록 글자 12/24px 도트 흐림은 오큐에이 화면 확인 후 판단.
- 검증: 타입검사 0건, 시험 1415개 중 실패 0(건너뜀 1).
