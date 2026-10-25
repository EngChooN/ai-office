# 회의 결정 강조 — 토큰 매핑표 + 대비 점검

> 회의·협업 흐름 개선 스프린트 준비 단계 2/4 · 작성 이디자 · 2026-10-24
> 짝 문서: [meeting-decisions.md](meeting-decisions.md)(저장 구조, 강백엔). 이 표의 행은 그 문서 `decisionView().state`와 1:1로 맞춘다.
> 회의 결정: **기존 토큰만 쓴다 · raw HEX·임의 색 금지 · 배경·좌측 보더·라벨 세 가지로 강조 · 직접=기본 강조 · 위임='위임' 라벨+결정자.**

## 0. 기준 토큰 출처

- `design-system-figma-map.md`는 **이 프로젝트에 없다.** 찾은 곳은 `~/flitto/web-flitto/.agents/rules/design-system-figma-map.md` 하나뿐인데, 이것은 web-flitto의 `flitto-design-system`(SCSS, `--SystemColor-*`) 대응표라 Claude Office에는 쓸 수 없다. Claude Office는 그 토큰을 쓰지 않는다.
- 그래서 **`app/src/renderer/index.css`의 shadcn 토큰**(`:root` 변수 → `@theme inline`의 `--color-*`)을 기준으로 삼는다. 코드에서는 Tailwind 클래스(`bg-status-working/10` 등)로 쓴다.
- 새 토큰은 만들지 않는다. 투명도(`/10`, `/15`, `/20`, `/40`)는 Tailwind 기본 문법으로 기존 토큰에 붙이는 것이고, 지금 `DecisionBox`도 같은 방식(`bg-status-waiting/10`)을 쓴다.

## 1. 매핑표

| 상태 (`decisionView().state`) | 배경 | 좌측 보더 (`border-l-4`) | 라벨 글자 | 라벨 바탕 | 라벨 문구 |
|---|---|---|---|---|---|
| **미결정** (`answer === null`) | `status-waiting` /10 | `status-waiting` (테두리 전체도 지금처럼 유지) | `status-waiting` | `status-waiting` /20 | `답 대기` |
| **직접** (`kind: 'direct'`) — 기본 강조 | `status-working` /10 | `status-working` | `status-working` | `status-working` /20 | `직접 결정` |
| **위임** (`kind: 'delegated'`) | `muted` /40 | `primary` | `primary` | `primary` /15 | `위임 · {결정자}` |

같은 줄 안의 다른 글자
- 질문 본문·최종 선택값: `foreground` (지금 답 줄의 `text-status-working`은 라벨로 옮기고 본문은 `foreground`로)
- "○○의 결정 요청", 위임 이유 한 줄: `muted-foreground`

변형(행을 늘리지 않고 위 행의 문구·글자색만 바꾼다)
| 경우 | 쓰는 행 | 바꾸는 것 |
|---|---|---|
| 옛 데이터 `answer === ''` | 위임 | 라벨 `위임 · 결정자 기록 없음`, 라벨 글자 `muted-foreground` (모르는 값이라 덜 강조) |
| 위임했는데 아직 못 정함(오류·중단) | 위임 | 라벨 `위임 · 아직 정하지 않음`, 라벨 글자 `muted-foreground` |
| 회의를 끝내 풀림 (`endedByMeeting`) | — (강조 없음) | 배경 `muted` /40, 좌측 보더 `status-idle`, 라벨 `답하지 않음` 글자 `muted-foreground` 바탕 `muted` |

왜 이렇게 나눴나
- **미결정 = 노랑**: 지금 결재함·회의 화면이 쓰는 "대기" 색 그대로. 사방 테두리+버튼이 있어 아래 두 행과 모양부터 다르다.
- **직접 = 초록**: 지금 답 줄이 이미 `status-working`(초록)이라 사용자가 보던 색을 이어 간다. "기본 강조".
- **위임 = 주황 라벨 + 회색 배경**: 배경은 눌러 두고 라벨만 `primary`로 띄워, "누가 대신 정했는지"를 대표가 훑어볼 때 라벨에 눈이 가게 했다. 위임 결과는 대표가 다시 볼 필요가 있는 쪽이라 회색만으로 두지 않았다.
- **색만으로 구분하지 않는다**: 세 행은 라벨 문구가 모두 다르고, 미결정만 사방 테두리와 버튼이 있다. 색을 못 보는 사람도 문구로 구분된다.

## 2. 대비 점검

계산: `index.css`의 oklch 값을 sRGB로 바꾸고, 투명도는 놓이는 바탕 위에 섞은 뒤 WCAG 2 대비비로 계산. 바탕은 두 곳 — 회의 화면 카드(`card`), 결재함 페이지(`background`). 숫자는 카드 / 페이지.

| 상태 | 본문 `foreground` vs 행 배경 (기준 4.5) | 보조 글 `muted-foreground` vs 행 배경 (4.5) | 라벨 글자 vs 라벨 바탕 (3) | 좌측 보더 vs 행 배경 (3) |
|---|---|---|---|---|
| 미결정 | 13.1 / 14.5 ✓ | 5.5 / 6.1 ✓ | 5.1 / 5.6 ✓ | 7.8 / 8.6 ✓ |
| 직접 | 13.4 / 14.8 ✓ | 5.7 / 6.2 ✓ | 4.5 / 4.9 ✓ | 6.5 / 7.2 ✓ |
| 위임 | 15.2 / 16.0 ✓ | 6.4 / 6.7 ✓ | 5.2 / 5.5 ✓ | 6.5 / 6.9 ✓ |
| 위임(기록 없음) | 같음 ✓ | 같음 ✓ | `muted-foreground` 5.0 / 5.4 ✓ | 같음 ✓ |
| 회의 끝내기 | 15.2 / 16.0 ✓ | 6.4 / 6.7 ✓ | 6.0 / 6.0 ✓ | `status-idle` 5.3 / 5.6 ✓ |

- 전부 통과. 가장 낮은 값은 **직접 라벨 4.5(카드 위)** — 라벨 기준 3:1은 넉넉하지만 본문 기준에 걸치므로, 라벨을 12px 미만으로 줄이거나 바탕 투명도를 /20보다 올리지 말 것.
- 쓰지 말 것: 좌측 보더에 `border` 토큰(대비 1.1~1.3, 거의 안 보임). 라벨 글자에 `status-idle`을 다른 색 바탕 위에(2.96까지 떨어짐).

### 모드별
| 모드 | 결과 |
|---|---|
| 다크 | 위 표 그대로. 이 앱의 유일한 색 세트다. |
| 라이트 | **이 앱에는 라이트 모드가 없다.** `index.css`는 `:root`(다크)만 정의하고 `color-scheme: dark`로 고정. `dark` 변형은 선언만 있고 쓰는 곳 없음. 점검 대상 없음. |
| 업무 모드 | `isWorkMode`는 맵·레벨·상점·아바타 모양만 숨기고 색 토큰은 바꾸지 않는다(코드 확인). 다크와 같은 값 → 같은 결과. |

라이트 모드가 생기면 토큰 이름은 그대로 두고 값만 바꾸게 되므로 이 표는 이름 그대로 쓸 수 있다. 다만 **노랑(`status-waiting`) 라벨 글자는 밝은 바탕에서 3:1을 못 넘을 가능성이 크다** — 그때 라이트 값만 어둡게 잡거나 라벨 글자를 `foreground`로 바꾼다. 지금 정할 일은 아니다.

## 3. 구현 메모 (다음 기획안용)
- 위치: `DecisionBox`(`renderer/features/MeetingPage.tsx:241`) 한 곳. 회의 화면·결재함이 같이 쓴다.
- 상태→클래스 표는 `decisionView().state`를 키로 한 객체 하나로 둔다(화면·폰이 같은 렌더러를 쓰므로 폰 v2도 자동 반영).
- 좌측 보더는 `border-l-4` + 색, 나머지 세 변은 지금처럼 `border`(미결정만 `border-status-waiting`).
- 라벨은 `components/ui/badge.tsx`의 `Badge`에 위 클래스를 얹어 쓴다. 새 컴포넌트 없음.
- 펼침 동작은 아래 4절.

## 4. 펼침 — 질문 원문 2줄 ↔ 전문

> 스프린트 완료 기준 1: "화면은 기본 2줄, 펼치면 전문". 대상은 `DecisionBox`의 질문 줄(`decision.question`) 하나. 선택지·답·라벨은 접지 않는다.

### 4-1. 동작 규칙

| 항목 | 정한 것 | 근거 |
|---|---|---|
| 트리거 | 질문 아래 **`더 보기` / `접기` 글자 버튼**. 행(카드) 클릭으로는 펼치지 않는다 | 미결정 카드에는 선택지 버튼·입력칸이 있어 행 클릭과 겹친다. 질문은 `selectable`이라 드래그로 고르다 펼쳐지면 안 된다. 앱의 다른 `더 보기`(대시보드 확인 필요 칸·최근 활동, `DashboardPanels.tsx:332·416`)와 같은 모양 |
| 버튼 컴포넌트 | 기존 `Button variant="ghost" size="sm"` + `h-7 text-xs` (대시보드 `더 보기`와 동일), 왼쪽 정렬, 글자 뒤 `ChevronDown` 아이콘 `size-3.5` | 새 컴포넌트 없음 |
| 접힌 모습 | 질문 `line-clamp-2`(끝 말줄임 …) | 지금 카드 목록들이 쓰는 방식 그대로 |
| 펼친 모습 | clamp 해제, `whitespace-pre-wrap break-words`로 원문 줄바꿈 유지 | 원문 전체 저장(강백엔 `question`)을 그대로 보여 줌 |
| 2줄 이하일 때 | **버튼을 숨긴다**(아무것도 안 그림) | 펼칠 게 없는데 버튼이 있으면 눌러도 변화가 없어 고장처럼 보인다. 판정은 렌더 후 `scrollHeight > clientHeight`, 폭이 바뀌면(창 크기·폰 회전) `ResizeObserver`로 다시 잰다 |
| 상태 보관 | 카드마다 화면 안에서만(`useState`), 저장하지 않음. 새로 열면 다시 접힘 | 결정이 여러 개여도 각자 따로 |
| 접근성 | 버튼에 `aria-expanded`, `aria-controls`=질문 요소 id. 펼치거나 접어도 포커스는 버튼에 그대로 | 화면 읽기 프로그램이 상태를 읽음 |

### 4-2. hover·focus 모습 (토큰)

| 상태 | 버튼 | 질문 글 |
|---|---|---|
| 기본 | 글자 `muted-foreground`, 바탕 없음 | `foreground` |
| hover (마우스) | 바탕 `accent`, 글자 `accent-foreground` — ghost 버튼 기본값 그대로 | 변화 없음(클릭 대상이 아니므로) |
| 키보드 focus | `focus-visible:ring-2 ring-ring/50` — Button 기본값 그대로 (`ring` = `primary` 주황) | — |
| 펼친 뒤 | 글자 `접기`, 화살표 180° 회전 | — |

- 대비: `muted-foreground` 버튼 글자는 세 행 배경에서 5.5 이상(2절 표의 "보조 글" 값), hover 시 `accent-foreground`/`accent`는 12.6 → 모두 통과.
- focus 링이 위임 행의 주황 좌측 보더와 같은 색이지만, 링은 버튼 둘레에만 생겨 겹치지 않는다.

### 4-3. 트랜지션

| 대상 | 펼칠 때 | 접을 때 |
|---|---|---|
| 질문 높이 | **200ms `ease-out`** | **150ms `ease-in`** |
| 화살표 회전 | 150ms `ease-out` | 150ms `ease-out` |
| 버튼 hover 바탕 | Button 기본 `transition-colors` (Tailwind 기본 150ms) | 같음 |

- 구현 방식: 질문 감싼 요소에 `interpolate-size: allow-keywords` + `transition: height`로 2줄 높이 ↔ `auto`를 움직인다. 펼칠 때는 clamp를 먼저 풀고 높이를 늘리고, 접을 때는 높이를 줄인 뒤(`transitionend`) clamp를 다시 건다(그래야 말줄임 …이 마지막에 나타난다).
- 데스크톱(Electron 44, 최신 Chromium)은 지원한다. 폰은 기기 WebView 버전에 따라 미지원일 수 있고, 그때는 **즉시 전환**으로 떨어진다(깨지지 않음).
- 질문이 아주 길어도 시간은 고정(길이에 비례하지 않음). 앱 전체에 긴 움직임이 거의 없어(코치 투어 300ms 정도) 그보다 짧게 잡았다.

### 4-4. 움직임 줄이기

- OS의 "동작 줄이기"(`prefers-reduced-motion: reduce`)가 켜져 있으면 **높이·화살표 트랜지션을 모두 끄고 즉시 전환**한다(`motion-reduce:transition-none`). 버튼 글자(`더 보기`↔`접기`)와 화살표 방향은 그대로 바뀐다.
- 앱에 이미 같은 규칙이 있다(`StaffCard.tsx:113` `motion-reduce:animate-none`, `LiveMiniView`·`OfficeMap`의 `matchMedia`).

### 4-5. 폰 (터치)

- hover가 없으므로 **버튼 탭만** 트리거. 질문 글 자체를 탭해도 펼치지 않는다(길게 눌러 글 고르기와 겹치지 않게).
- 터치 영역: Button에 이미 있는 `phone:min-h-10`(40px)이 적용된다. 폭은 글자+화살표 크기 그대로 두되 좌우 여백 `px-2`는 유지.
- 탭했을 때 눌린 표시는 `active:bg-accent`(hover와 같은 토큰)로 짧게. 셸이 탭 강조를 꺼 두었기 때문(`index.css` `-webkit-tap-highlight-color: transparent`).
- 펼쳐서 카드가 길어져도 스크롤 위치는 옮기지 않는다(버튼이 손가락 아래 그대로 남음).
- 폰 v2는 PC와 같은 렌더러라 따로 만들 것 없음. 옛 APK(v1)에는 회의 결정 화면이 없다.

### 4-6. 정해야 할 것 (선택지)

1. **미결정 카드도 2줄로 접을까?**
   - A. 접는다 — 완료 기준 문구 그대로. 대표가 답하기 전에 `더 보기`를 눌러야 할 수 있다.
   - **B. 미결정은 처음부터 펼친다, 답이 난 결정만 2줄 (권장)** — 대표가 질문 전문을 안 보고 답하는 일을 막는다. 2줄 규칙은 기록을 훑어보는 화면에 적용.
2. **높이 트랜지션을 넣을까?**
   - **A. 넣는다 (권장, 4-3)** — 200ms/150ms. 미지원 WebView는 즉시 전환.
   - B. 넣지 않는다 — 즉시 전환 + 화살표 회전만. 구현이 가장 단순(`transitionend` 처리 없음).
3. **펼쳤을 때 `raw`(결정 요청을 골라내기 전 발언 줄)도 보여 줄까?**
   - **A. 보여 주지 않는다 (권장)** — `question`이 이제 전문으로 저장되므로 충분. `raw`는 디버깅용.
   - B. 펼친 아래에 `원래 발언` 한 줄을 `muted-foreground`로 덧붙인다.
