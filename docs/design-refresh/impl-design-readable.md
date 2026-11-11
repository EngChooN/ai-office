# 구현 설계안 A — 가독성·단순함·재활용 관점 (최가독)

> 디자인 리프레시 3건(폴드 와이드 분할 · 페이블 · 듀오톤 아이콘). 설계만 했고 앱 코드는 고치지 않았습니다. 박패턴 설계안은 읽지 않았습니다(독립 안).
> 기준: `handoff-2026-11-11.md`, 시안(`fold-wide`·`fable-model`·`icons`), 조사서 2건, 앱 1.1.5 현재 코드. 시안 PNG는 HTML 원본으로 대신 확인했습니다.
> 작업 순서(기획서 기준): **페이블 → 아이콘 → 폴드 분할**. 아래 3장도 이 순서로 읽으면 됩니다(1장 폴드는 가장 큰 덩어리라 앞에 둡니다).

## 0. 한눈에 보는 선택

| 쟁점 | 내 선택 | 한 줄 이유 |
|---|---|---|
| 분할 판정 | `layoutState.ts`에 `isSplit` 추가 + `<html data-split>` + CSS 변형 `split:`·`side:` | 폰 배치 판정(`phone:`·`short:`)과 똑같은 길이라 새 규칙이 없다. 화면(feature)이 `useLayout`을 못 쓰는 기존 규칙(mobile.test)도 그대로 지킨다 |
| 대화방 분할 | 새 부품은 **왼쪽 칸 하나(`ChatSide`)**뿐. 오른쪽(메시지·입력)은 기존 그대로 | 방 목록·"지금 하는 일"은 칩/상태 줄과 모양이 완전히 달라 CSS만으로 못 바꾼다. 데이터 계산은 훅으로 빼 공유 |
| 직원 패널 분할 | 새 레이아웃을 만들지 않고 **기존 한 벌의 JSX를 `split:` 클래스로 재배치** | 줄 수가 큰 `PanelBody`를 둘로 쪼개면 diff가 커지고 미니 뷰(Phaser 캔버스)가 두 벌 생긴다 |
| ＋ 메뉴 | 새 `PopMenu` 부품 1개(바깥 클릭·Esc 닫기)를 대화방·직원 패널 ＋와 ⋯가 같이 씀. 내용은 기존 버튼·컴포넌트를 그대로 넣음 | 세 군데가 같은 모양이고 `ReserveMenu`의 바깥 클릭 처리와 같은 방식 |
| 페이블 목록 | 새 `ModelCards` 1개(고용 창 전용). Segmented·드롭다운 재활용은 **고용 창엔 안 함**, 직원 패널 드롭다운은 **재활용** | 5개×한 줄 설명은 Segmented에 안 들어간다. 직원 패널은 기존 `NativeSelect` 그대로 |
| 모델 목록 | UI 두 곳(고용 창·직원 패널)이 같이 쓰는 `modelOptions.ts` 1개(순서·점·NEW). 8곳 단일화는 이번 제외 유지 | 순서·점을 두 군데 따로 적으면 바로 어긋난다. 범위는 UI 두 곳에 한정 |
| 아이콘 | `<DuoIcon name size />` + 경로 데이터 파일 1개, 채움 색은 CSS 변수 2개 | 20종 고정 목록이라 이름 타입으로 오타를 컴파일에서 막는다 |
| 사전 속 이모지 | ① 화면용 문구: 사전에서 빼고 JSX에서 `DuoIcon` ② 채팅·시스템 메시지: **저장은 그대로, 보여줄 때 맨 앞 이모지만 아이콘으로 변환** | ②는 DB 이전 저장분도 자동 처리돼 마이그레이션이 필요 없다 |

---

## 1. 폴드8 와이드 커버 좌우 분할

### 1-1. 요구사항 해석
- 켜는 조건: 폰 배치(`isPhone`, 폭<840) **그리고** 폭≥600 **그리고** `!isShort`. 600 미만 폰·가로 폰·태블릿(≥840)·데스크톱은 변화 없음.
- 대상 화면은 **대화방(`chat`)과 직원 패널** 둘뿐. 하단 탭 50px·아이콘만은 분할일 때 모든 화면 공통(틀의 일부), 상단 바 46px·자금 칩 숨김은 **대화방에서만**(시안이 대화방 기준).
- 키보드가 열리면 왼쪽 칸 숨김(대화방·직원 패널 둘 다).
- 시안에 없는 것(내가 임의로 정하지 않은 것): 비서 ✨ 버튼·자동결재 표시 위치, 방 설명 글, 가로 폰/키보드 상태 — 아래 1-8 "확인 필요".

### 1-2. 판정 값을 둘 곳
`app/src/renderer/layout/layoutState.ts` 한 곳.

```ts
/** 이 폭 이상의 폰 배치(폴드 와이드 커버 등)는 화면을 좌우로 나눈다 */
export const SPLIT_MIN_WIDTH = 600
export interface LayoutState { isPhone; isShort; isKeyboardOpen; isSplit: boolean }
// decide(): isSplit = isPhone && !isShort && width >= SPLIT_MIN_WIDTH
```
- 판정은 이미 있는 `decide(width, stableHeight)` 안에서 같이 구한다 → 키보드가 열려도 안정 높이를 쓰므로 **입력 중 분할이 풀리지 않는다**(기존 폰 판정과 같은 보장).
- `setLayoutState`의 비교 조건에 `isSplit` 추가(빠뜨리면 구독자가 안 깨어남 — 테스트로 잠금).
- `mobile/install.ts` `applyLayout()`: `isSplit`이면 `root.dataset.split = ''`, 아니면 삭제. (이 파일이 `dataset.layout`을 쓰는 유일한 곳이라는 기존 테스트 규칙 유지)
- `layout/useLayout.ts`: 틀(PhoneShell)용 `useIsSplit()` 훅 추가. feature 화면은 못 쓴다(기존 규칙). 데스크톱 빌드는 `current` 기본값이 false라 늘 false.
- `index.css` 변형 2개 추가:
  ```css
  @custom-variant split (&:where([data-layout=phone][data-split] *));
  /* 분할이면서 키보드가 닫힌 때 — 왼쪽 칸이 보이는 조건 */
  @custom-variant side (&:where([data-layout=phone][data-split]:not([data-keyboard]) *));
  ```
- 판정을 CSS(`@media (min-width:600px)`)로 하지 않는 이유: 기존에 "화면 높이/폭 미디어 쿼리 X — 키보드로 WebView가 줄어도 안 바뀐다"를 테스트로 못박아 둠. 같은 길을 쓴다.

### 1-3. 틀(PhoneShell) 변경 — `layout/PhoneShell.tsx`
틀은 `useIsSplit()`을 써도 되는 곳이다.
- `PhoneTopBar`: 분할이면 높이 `split:h-[46px]`. 대화방(`view==='chat'`)에서 자금 칩 숨김, 🔍 버튼 표시. 결재 대기 칩·＋(고용)은 그대로. 🔍의 열림 상태는 아래 1-4의 store 값을 토글.
- `NavTabs`(묶음 탭 줄): 분할이고 `view==='chat'`이면 렌더하지 않음(회의실은 왼쪽 칸 행으로 갈 수 있게 함).
- `PhoneTabBar`: `h-16` → `split:h-[50px]`, 글자 `split:sr-only`(가로 폰이 이미 쓰는 `short:sr-only`와 같은 방식), `NoticeBar`의 `bottom-[calc(5rem+...)]`에 `split:` 값 추가.
- 위험: 지금 `Tab`이 `short:`로 글자를 접는 코드가 있으니 `split:`를 같은 줄에 나란히 적어 읽는 사람이 한 패턴으로 보게 한다.

### 1-4. 대화방 — 기존 부품 재배치 vs 새 레이아웃: **왼쪽 칸만 새 부품**
**구조** (`features/ChatPage.tsx`)
```
ChatPage
└ div.flex.h-full.flex-col
  ├ (header — 기존. 분할이면 split:hidden)          ← 제목·설명·RemoteLine·RoomTabs·RoomStatusStrip
  └ div.flex.min-h-0.flex-1
     ├ ChatSide  (신규. `hidden side:flex w-[200px] shrink-0 border-r bg-(--surface-chrome)`)
     └ div.flex-1.flex-col  → ChatSearch(헤더 밖으로 이동) · MessageList · Composer (기존)
```
- **왜 새 부품 1개인가**: 방 목록(세로 행, 색 점+이름+빨간 배지)과 "지금 하는 일"(아바타+이름+한 줄)은 기존 `RoomTabs`(가로 칩)·`RoomStatusStrip`(칩+툴팁+휠 가로 스크롤)과 마크업이 다르다. 같은 DOM을 CSS로 바꾸면 `split:` 클래스가 컴포넌트마다 6~10개씩 붙어 오히려 읽기 어렵다.
- **데이터 계산은 공유**: `RoomTabs` 안의 `unread`·`approvalRooms`·방 목록 만들기와 `RoomStatusStrip` 안의 `people` 계산·`STATUS_ORDER`·`stripHead`를 `features/chatRoomHooks.ts`(신규, 훅·순수 함수만)로 옮겨 두 컴포넌트가 같이 쓴다. 이 이동은 동작 변경 없는 순수 리팩터라 테스트(아래)로 잠근다. `ChatSide`는 그 훅과 기존 `STATUS_META`(상태 색) 재사용.
- **두 벌 마운트**: 분할이 아닐 때 `ChatSide`는 `hidden`, 분할일 때 헤더는 `split:hidden` — 둘 다 마운트돼 있다. 목록이 작아 비용은 무시할 수준이고, 대신 JS 분기가 없어 `useLayout` 금지 규칙을 지킨다.
- **🔍 검색 상태**: 지금 `ChatPage` 지역 상태(`isSearchOpen`). 상단 바(틀)가 열어야 하므로 `store.ts`에 `isChatSearchOpen` + 설정 함수 하나만 올린다(검색어는 지역 상태 유지). ⌘F도 같은 값을 켠다. `ChatSearch`는 헤더 밖(`MessageList` 위)으로 옮겨야 분할에서도 보인다.
- **왼쪽 칸 내용**: "대화방" 제목 → 전체·팀·랩 행(`setChatRoom`) → "회의실" 행(`setView('meeting')`) → "지금 하는 일" → 구성원 행(누르면 `select(id)` = 기존 상태 줄과 같은 동작). 칸 안에서만 세로 스크롤.
- **입력 한 줄**(`Composer`): 새 부품 없이 `split:` 클래스로
  - 둘째 줄(매뉴얼·명령 버튼) `split:hidden`, 예약 ▾ `split:hidden`, 기존 첨부 버튼 `split:hidden`
  - 받는 사람 줄(`Recipients`)은 `!parsed?.matched.length && 'split:hidden'` — @를 쓸 때만 보임
  - ＋(`PopMenu`)는 `hidden split:flex`. 메뉴 항목: 첨부·예약·매뉴얼·명령. 핸들러는 이미 있는 것 그대로(`openSlash('manual'|'command')`, `setIsReserveOpen(true)`). `ReserveMenu`·`SlashMenu`는 그대로 위로 뜬다.
  - 첨부: `AttachButton`이 안에서 파일 입력을 숨겨 쓰므로 메뉴 항목이 못 연다 → `AttachButton`에 `children`(보여줄 모양) 하나만 받게 하거나, 메뉴 안에 `AttachButton`을 `variant`만 바꿔 그대로 둔다. **후자 추천**(파일 입력 코드를 건드리지 않음).
- **말풍선 최대 폭** 75% → 분할이면 82%: `Bubble`의 `max-w-[75%]` 옆에 `split:max-w-[82%]`.
- **키보드**: 별도 JS 없음. `side:` 변형이 `data-keyboard`가 있으면 꺼지므로 `ChatSide`가 사라지고 오른쪽이 전폭. 이때 헤더는 `split:hidden`이라 방 이동이 막히는데, 입력 중이라 허용(키보드를 닫으면 다시 나타남).

### 1-5. 직원 패널 — **한 벌의 JSX를 `split:`로 재배치**
`PanelBody`(`StaffPanel.tsx` 310~790, `<aside>`)는 이미 `phone:fixed phone:inset-0`로 전체 화면 시트다. 구조를 이렇게만 바꾼다.
```
aside (phone:flex-col → split:flex-row)
├ div.panel-side  (`contents split:hidden side:flex side:w-[200px] side:flex-col side:overflow-y-auto side:border-r`)
│   header · resumeError · 결재 칸 · 탭 줄 · 진행 줄 · 토큰 줄
└ div.panel-main  (`contents split:flex split:min-w-0 split:flex-1 split:flex-col`)
    로그 제목줄 · 로그 · WaitingCards · (review/equip/profile 탭 내용) · footer
```
- 분할이 아닐 때는 두 래퍼가 `contents`라 **지금 DOM 모양과 시각적으로 같다**(회귀 최소). 키보드가 열리면(`split:hidden`이 이기고 `side:flex`가 꺼짐) 왼쪽 칸이 통째로 사라진다. `split:hidden side:flex` 순서가 의도대로 적용되는지는 변형 등록 순서에 달려 있으므로 **캡처로 확인 필수**(위험 참고).
- **머리(header)**: 한 개의 `<header>`를 유지한다. `HeaderPortrait`(= `LiveMiniView`)에 `side:w-full side:h-[120px]`을 주고 머리를 `side:flex-col`로, × 버튼에 `side:order-first side:self-end`. **미니 뷰를 하나만 마운트**하는 게 핵심(Phaser 캔버스를 두 번 만들지 않음). ⋯(터미널에서 이어 하기·대화만 보기·글자 크기)는 `PopMenu`에 현재 있는 요소를 그대로 넣는다 — 분할이 아닐 때 이 요소들은 원래 자리(머리의 이어 하기 버튼, 로그 제목줄의 글자 크기·대화만 보기)에 남아 `side:hidden`.
- **탭 줄**: 같은 `<div>`에 `side:flex-col`, 버튼은 `side:rounded-lg side:border-b-0 side:text-left`, 선택 `side:bg-accent`.
- **진행·토큰**: 지금은 `tab==='work'`일 때만 그려진다. 분할은 탭과 무관하게 왼쪽에 보여야 하므로 이 두 개를 탭 분기 밖으로 꺼내 `tab !== 'work' && 'hidden side:flex'`로 감춘다(분할 아닌 화면은 기존과 동일). 토큰 줄은 `side:order-last`로 칸 맨 아래.
- **결재 칸**: 이미 `phone:max-h-[50%]`로 스크롤되는 칸이라 왼쪽 칸 안에서도 그대로 쌓이고 스크롤. 손잡이(`ApprovalSplitHandle`)는 폰에서 이미 없음.
- **입력 한 줄**: `footer` 안에서 자율 진행·기억 길이 줄과 아래 버튼 줄을 `split:hidden`, 입력 상자 안 첨부 버튼 자리에 ＋(`PopMenu`). 메뉴 항목은 자율 진행(`AutonomyCheck`)·기억 길이(`MemoryLengthSelect`)·매뉴얼·명령·내보내기·해고 — **전부 기존 컴포넌트/핸들러를 그대로 자식으로 넣는다.** 자율 진행이 켜져 있으면 ＋에 작은 점(`isAutonomous` 값 그대로).
- **가로 폰(`short`)의 패널 전체 스크롤 규칙**은 분할과 겹치지 않는다(분할 조건이 `!isShort`).

### 1-6. 새로 만들 것 / 재활용할 것
| 구분 | 대상 |
|---|---|
| 신규 | `components/pop-menu.tsx`(`PopMenu`·`PopMenuItem`, 약 40줄), `features/ChatSide.tsx`, `features/chatRoomHooks.ts` |
| 재활용 | `LiveMiniView`(그대로, 클래스만), `STATUS_META`·`Avatar`, `AutonomyCheck`·`MemoryLengthSelect`·`AttachButton`·`SlashMenu`·`ReserveMenu`, `useMobileUi`의 키보드 상태·기존 `data-keyboard` |
| 수정 | `layoutState.ts`, `useLayout.ts`, `mobile/install.ts`, `index.css`, `layout/PhoneShell.tsx`, `store.ts`(검색 열림 1개), `features/ChatPage.tsx`, `features/StaffPanel.tsx` |
| 안 건드림 | `ChatSearch`·`MessageList` 내부, 승인/결재 로직, 데스크톱 레이아웃, `StaffRow` 등 다른 화면 |

### 1-7. 위험과 한계
1. **CSS 변형 우선순위**(`split:hidden`과 `side:flex` 동시 적용): Tailwind v4에서 나중에 등록한 변형이 이기는 것으로 알고 있으나 이번에 직접 확인하지 못했습니다 → 구현 직후 624×986에서 키보드 on/off 캡처로 확인. 안 되면 `side:`를 쓰지 않고 `split:not-keyboard`식 조건 하나로 바꾼다.
2. `contents` 래퍼: `PanelBody`에 래퍼 두 개가 끼므로 아래 자식에 `>` 선택자를 쓰는 CSS가 있는지 확인 필요(내가 본 범위엔 없음).
3. 직원 패널은 **한 파일 안에서 클래스가 늘어나** 읽기에 불리합니다(이 안의 약점). 보완: 분할 전용 클래스를 한 곳(`PANEL_SPLIT = {...}` 상수 묶음)에 모아 이름을 붙이는 정도는 허용. 더 나은 가독성이 필요하면 박패턴이 낼 법한 "`PanelSide`/`PanelMain` 컴포넌트 분리"가 대안인데, 그러면 미니 뷰 이동·상태 전달이 늘고 diff가 큽니다.
4. 두 벌 마운트(대화방): 숨겨진 쪽도 구독하므로 방·직원 수가 매우 많으면 약간의 낭비.
5. 검색 상태를 store로 올리는 것은 이 안에서 유일한 전역 상태 추가 — 사용하는 곳이 틀·대화방 둘이라 정당하다고 봅니다(지역 상태 유지 시 상단 바에 🔍를 못 둠).
6. 폰 키보드가 열리면 틀 전체가 안정 높이로 판정되므로 입력 중 `isSplit`가 바뀌지 않음 — 단, 폴드 접기/펼치기로 폭이 바뀌면(`isRotated`) 즉시 재판정되어 입력 포커스는 풀림(기존 폰 동작과 같음).

### 1-8. 구현 전에 확인할 것(시안에 없음)
- 상단 바의 **비서 ✨ 버튼·자동결재 표시**: 시안은 "대화·칩·🔍·＋"만 그렸지만 비서는 상단 바 버튼이 유일한 진입점입니다(`moreGroups`가 제외). 분할 대화방에서도 **유지**를 추천합니다(624px에 들어감).
- **방 설명 글 / `RemoteLine`**(다른 PC 연결 줄): 시안에서 없앴지만 `RemoteLine`은 정보가 있어서 `ChatSide` 맨 위로 옮기는 게 안전합니다. 내용을 구현 때 확인.
- 직원 패널의 **첨부**: 시안 ＋ 목록(자율 진행·기억 길이·매뉴얼·명령·내보내기·해고)에 없는데 현재는 입력 안에 있음 → 메뉴 맨 위에 "첨부" 추가 추천.
- 방 이름 길게 눌러 설명 보기(제안)는 이번엔 생략, `ChatSide` 제목에 `title`만.

### 1-9. 검증
**추가할 테스트** (`app/scripts/mobile.test.mts` 확장, 순수 함수라 흉내가 쉬움)
1. `createLayoutTracker`: 599×900 → `isSplit:false`, 600×900 → true, 839×986 → true, 840×986 → `isPhone:false·isSplit:false`, 700×400(가로 폰) → `isShort` true & `isSplit` false.
2. 키보드 흉내: 624×986에서 `ime>0` 또는 높이 80% 미만이어도 `isSplit` 유지, `isKeyboardOpen:true`.
3. 폭이 624→1100(펼침)으로 바뀌면 재판정.
4. `setLayoutState`가 `isSplit`만 바뀌어도 구독자를 부른다.
5. 소스 규칙: `index.css`에 `split`·`side` 변형이 있고, `data-split`을 설정하는 파일은 `install.ts` 하나, `features/`·`map/`·`components/`는 여전히 `useLayout`을 import하지 않는다(기존 규칙 테스트가 새 파일에도 걸림).
6. `chatRoomHooks` 추출 순수 함수(`stripHead`, 구성원 정렬) 단위 테스트.
**캡처(오큐에이)**: 624×986 대화방·직원 패널 비율 실측(대화 칸 84%·업무 메시지 94%), 키보드 열림, 599폭·400폭·데스크톱 회귀.

---

## 2. 페이블 모델

### 2-1. 요구사항 해석
- 저장값 `'fable'`, CLI는 `'claude-fable-5-1'`(`claude.ts MODEL_ID`), 화면 표기 "Fable". 확정된 범위 외: 사용량 창 라벨·8곳 목록 단일화·`pickModel`.
- 토큰 절약: 지금은 `opus → sonnet`만. 추가: `fable → opus`(한 단계).

### 2-2. 고칠 파일 확정 (조사서 12곳 + 토큰 절약 + 신규 UI 2개)
| # | 파일 | 변경 |
|---|---|---|
| 1 | `shared/types.ts` | `ClaudeModel`에 `'fable'` |
| 2 | `main/ai/claude.ts` | `MODEL_ID.fable = 'claude-fable-5-1'` |
| 3 | `shared/slashCommands.ts` | `CLAUDE_MODEL_CHOICES`에 `fable` |
| 4 | `shared/engineModel.ts` | `CLAUDE_MODELS` Set(**빠뜨리면 다음 시작 때 default로 되돌아감**) + 비서 프롬프트 문장 |
| 5 | `shared/staffPack.ts` | `MODELS` |
| 6 | `renderer/features/HireDialog.tsx` | `Segmented` 모델 칸 → `ModelCards`, 결재 방식 칸을 아래로 |
| 7 | `renderer/features/StaffPanel.tsx` | `MODELS`·`CLAUDE_MODEL_NAME` → `modelOptions.ts` 사용, 외부 영입 `<option>`에 Fable |
| 8 | `renderer/features/secretary/ConfirmCard.tsx` | select 목록에 fable(표기 소문자 유지 — 이번 범위 아님) |
| 9 | `shared/secretaryTools.ts` | hire 인자 설명 |
| 10 | `main/agents.ts` | `MODELS`에 `'fable'` |
| 11 | 사전: `guideHint.ts`(`model.fable` 추가 + `model.opus` 문구 교체), `tools.ts`(`/model` 설명), `featuresA.ts`(`hire.model.usageLegend`, `hire.model.new`) — 4개 언어 | |
| 12 | 테스트: `slashCommands`·`engineModel`·`staffPack` | |
| 13 | `shared/tokenSaving.ts` + 사전 `tokenSaving.ts` | `SaverReason`에 `'fable'`, `saverFor`에 `fable → opus` 규칙, `tokenSaver.reason.fable` 4개 언어. `tokenSaver.hint.model` 문구가 "Sonnet으로"로 고정돼 있다면 `to` 값에 맞게 수정 필요(구현 때 확인) |
| 14 | `app/scripts/tokenSaving.test.mts` | fable 케이스 |
| 신규 | `features/modelOptions.ts`, `features/ModelCards.tsx`, `app/scripts/modelOptions.test.mts` | 아래 |

`TokenSaverTop3.tsx:77`은 `saver.action`의 모델 이름을 문구에 넣는 곳이라 `fable`이 소문자로 보이지 않는지 구현 때 확인합니다.

### 2-3. 구성과 데이터 흐름
**`features/modelOptions.ts`** — UI 두 곳만 쓰는 순서·점·NEW:
```ts
export const CLAUDE_MODEL_ROWS = [
  { value: 'default' },                                                     // 점 없음
  { value: 'fable', name: 'Fable', hintKey: 'guideHint.model.fable', dots: 5, isNew: true },
  { value: 'opus', name: 'Opus', hintKey: 'guideHint.model.opus', dots: 4 },
  { value: 'sonnet', name: 'Sonnet', hintKey: 'guideHint.model.sonnet', dots: 3 },
  { value: 'haiku', name: 'Haiku', hintKey: 'guideHint.model.haiku', dots: 1 },
] as const
```
- `dots`는 임시값이라는 주석과 함께 **이 한 곳에서만** 바꾸면 되게 한다(대표 확인 후 값 수정).
- 기본 행의 이름·설명만 고용 창(`hire.model.default`)과 직원 패널(`staffPanel.model.default`)이 서로 달라 각 파일이 채운다.
- 고용 창은 **기존 `HireDialog` 안의 `models()` 배열을 지우고** 이 목록을 쓴다 → 순서가 한 곳.

**`features/ModelCards.tsx`** (고용 창 전용, 약 60줄)
- 네이티브 `<input type="radio" class="sr-only peer">` + `label` 카드. 이렇게 하면 방향키 이동·포커스·스크린리더 처리를 브라우저가 해 주고, 선택 스타일은 `peer-checked:`로만 쓴다(롤링 포커스 코드를 새로 안 짠다).
- 카드 모양은 시안 그대로 토큰으로: 높이 36px·`rounded-[14px]`·`border-border`, 선택 `border-primary` + `ring-[3px]`(ring 22% → 기존 `--focus-ring`과 같은 색 혼합식 재활용 가능), 이름 폭 92px, 설명 `text-muted-foreground text-xs`, 점 5칸 7px(채움 `bg-primary`·빈칸 `bg-border`).
- NEW 배지: 기존 `Badge`(`variant`) 재활용 불가(연보라 18% + primary 글자가 기존 변형에 없음) → 카드 안에서 클래스로 직접.
- 목록 아래 오른쪽 `● 사용량(많을수록 한도가 빨리 참)` — `hire.model.usageLegend`.
- **한 번만 쓰므로 범용 `RadioCards`로 일반화하지 않는다.** 두 번째 쓸 곳이 생기면 그때 분리.
- 결재 방식 칸: `flex gap-6`을 `flex flex-col gap-4`로. `Segmented`는 결재 방식에 그대로 남는다.

**직원 패널 드롭다운(`ModelSelect`)** — 기존 `NativeSelect` 재활용.
- `<option>` 안은 글자만 들어가므로 점은 문자(`●●●●●`/`○`)로 붙인다: `Fable  ●●●●●`, 빈칸은 `○`. 기본 아래 구분선은 `<hr />`(Chromium WebView 지원)를 `<option>` 사이에 넣는다.
- 커스텀 드롭다운으로 점 색(primary)을 칠하는 안은 새 부품·키보드 처리가 늘어 이번엔 **하지 않는다**(쟁점 2 참고).
- 머리 줄 표기는 `modelLabel()`이 `modelOptions`의 `name`을 쓰도록 해 "Fable"로 보임(버전 숫자는 설명에만).

**Codex 직원**: `isCodex`일 때의 `NativeSelect` 분기는 그대로.

### 2-4. 위험
- `fable` 저장 후 구버전 앱으로 되돌리면 `isEngineMismatch`로 default로 덮어써짐(조사서 위험 1) — 되돌림 안내만, 코드 대응 없음.
- 4개 언어 `guideHint.model.fable` 문구와 점 개수가 임시값. 대표 확인 후 `modelOptions.ts`·사전 두 곳만 바꾸도록 모아 둠.
- 고용 창이 약 150px 커짐 → 400폭 폰에서 `DialogContent` 스크롤이 되는지 확인(`자세히 설정` 접힘 안에 있음).
- 계정에서 페이블 호출이 되는지는 실제 호출로만 확인 가능(구현 범위 밖, 대표 확인 대기).

### 2-5. 검증
**추가 테스트**
1. `modelOptions.test.mts`(신규): `CLAUDE_MODEL_ROWS`의 `value` 집합이 `ClaudeModel` 전체와 같다(**다음 모델을 추가하며 UI 행을 빠뜨리면 실패**), 순서가 `default→fable→opus→sonnet→haiku`, `claudeModelId('fable') === 'claude-fable-5-1'`, `dots`는 내림차순.
2. 조사서의 3개: `slashCommands`(deepEqual에 fable, 전체 ID `claude-fable-5-1`은 `/model`에서 거부 유지), `engineModel`(`fable` 직원이 불일치가 아님), `staffPack`(fable 팩 가져오기 통과).
3. `tokenSaving`: `fable → opus` 규칙, `opus → sonnet` 기존 규칙 불변, Codex 직원은 제안 없음.
4. i18n 테스트가 새 키 4개 언어와 `{변수}` 일치를 자동 검사(기존).
5. 소스 규칙: `HireDialog`·`StaffPanel`이 `modelOptions`를 import한다(두 군데 목록 부활 방지).

---

## 3. 듀오톤 아이콘 20종

### 3-1. 요구사항 해석
- 20종 SVG를 앱 부품으로 만들고 **UI에 보이는 이모지**를 교체. 범위 밖: 지도 말풍선(`emoteArt.ts`)·상점/미션 데이터(`economy.ts`)·트레이·OS 알림·안드로이드·사이트·`mobile/preview`·`deskPet`.
- 이모지 → 20종 매핑은 시안 `ICONS[].em` 그대로(✅✓·⚠·⛔💦·🙋❓·🤖·🔁·🕘⏰·📘·🧪·📋🗣·🗂·💰🪙·📱·🌐·⏸⏳·🎉🎊·🏆🏅·👍·✨·🐞🔧).

### 3-2. SVG 보관 방식
- **`renderer/components/duo-icon.tsx`**: `export function DuoIcon({ name, size = 16, className, label })`
- **`renderer/components/duo-icon-paths.ts`**: `DUO_PATHS: Record<DuoName, { d: string; fill?: boolean }[]>` — 시안 HTML의 `ICONS` 배열을 **path 문자열만**으로 변환해 옮긴다(원·사각형·점(`D:`)도 path로 환산. 점은 `M12 17h.01` + 둥근 끝). 데이터 한 종류·렌더 한 종류라 읽기 쉽고 이름(`'done'|'warn'|…`)이 타입이라 오타가 컴파일에서 걸린다. 파일 20개(`.svg`) 로더는 빌드 설정이 늘어서 쓰지 않는다.
- `DuoName` 타입과 이모지 매핑은 main·renderer·테스트가 같이 봐야 하므로 **`shared/duoIcons.ts`** 에 둔다(순수 데이터, DOM 없음).
```tsx
<svg viewBox="0 0 24 24" width={size} height={size} className={cn('inline-block shrink-0 align-[-0.125em]', className)} aria-hidden={!label} role={label ? 'img' : undefined} aria-label={label}>
  {size >= 16 && (
    <g transform="translate(1.6 1.8)" fill="var(--duo-fill)" fillOpacity="var(--duo-fill-opacity)" stroke="none">
      {paths.filter(p => p.fill).map(...<path d/>)}
    </g>
  )}
  <g fill="none" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round">{paths.map(...)}</g>
</svg>
```
- 크기 규칙(16px 미만은 선만)이 **한 줄 조건**(`size >= 16`)으로 컴포넌트 안에 있어 호출부가 신경 쓸 필요 없다. 13~15px 호출은 자동으로 선만.
- 선 색 = `currentColor`: 호출부가 `text-status-working` 같은 기존 토큰 클래스로 색을 줌(시안의 아이콘별 `col`은 쓰지 않고 의미 색은 문맥 토큰으로).

### 3-3. 채움 색·투명도 (CSS 변수)
`index.css` `:root`에 2개만:
```css
:root { --duo-fill: var(--ring); --duo-fill-opacity: .42 }
[data-mode='dark'] { --duo-fill-opacity: .6 }
```
- `--ring`이 테마마다 이미 정의돼 있어 **6개 테마 모두 따라 바뀐다**. 라벤더 외 테마에서 안 보이면 해당 `[data-theme][data-mode]` 블록에서 `--duo-fill`만 덮어쓰면 된다(대표 확인 사항 대응 지점이 한 곳).

### 3-4. 사전·화면에 붙이는 방식 (경우를 둘로 나눔)
| 경우 | 예 | 방식 |
|---|---|---|
| **A. 화면에 직접 그리는 사전 문구**(라벨·제목·버튼) | `manuals.section.personal`('📘 개인 매뉴얼…'), 직원 패널·랩·매뉴얼·온보딩·코치 투어 | 사전 4개 언어에서 **이모지 삭제** + JSX에서 `<DuoIcon name="manual" />` 앞에 붙임 |
| **B. 채팅 말풍선·시스템 메시지**(문자열로 저장·전송) | `postChat('me','🎉 회사가…')`, 이미 DB에 있는 옛 메시지 | **저장 문자열은 그대로 두고**, 보여줄 때 `splitLeadingIcon(text)`(`shared/duoIcons.ts`)이 맨 앞 매핑 이모지 1개를 떼어 `DuoIcon`으로 |
| **C. OS·트레이용 문구** | `notify.*`·`tray*`·`remote/service.ts` alert | 이모지 **그대로 유지**(범위 밖). 같은 키를 화면에도 쓰는지 구현 때 확인 |
| **D. 글자만 받는 자리** | `title=`·`aria-label`·`<option>`·`confirm()`·toast 문자열 | 이모지만 빼고 아이콘 없이 글로만(토스트가 노드를 받는지 구현 때 확인) |

- **B를 이렇게 하는 이유**: ① DB 마이그레이션이 필요 없다(옛 메시지도 자동으로 아이콘이 됨). ② `main`의 `postChat` 61곳을 안 건드려 diff와 충돌이 작다. ③ 이모지가 곧 "아이콘 종류를 가리키는 키" 역할이라 별도 필드가 필요 없다.
- B의 한계: ⚠️처럼 변형 선택자(U+FE0F)가 붙은 형태도 매핑에서 제거해 처리. 중간에 낀 이모지(`질문이 있어요 ❓ …`, `결재 부탁드려요 🙏`)는 변환하지 않는다 → 이 두 줄은 `main`의 문구에서 ❓을 맨 앞으로 옮기거나 그대로 둠(그대로 둬도 동작은 정상, 시각만 이모지로 남음). 구현 때 한 번에 결정.
- B 적용 위치는 말풍선(`Bubble`)·`OFFICE_SENDER` 알림 알약·`WaitReasonLine`·`ChatExtras`의 예약/빠른 답 같은 **채팅 렌더 지점**. 사용자가 직접 입력한 말도 `from==='me'`로 같은 경로를 타므로, 맨 앞 `✅ 좋아`가 아이콘으로 바뀔 수 있다 → **사용자 입력(`DeliveryLine`이 붙는 메시지) 제외 조건**이 필요한지 구현 때 `postChat('me', …)` 호출처로 확인(제외가 어렵다면 시스템 알림 알약과 직원 발신만 적용으로 축소).
- 한 줄 호출부 단순화를 위해 `IconText`(= `splitLeadingIcon` + `DuoIcon` 조합, 10줄)를 `duo-icon.tsx`에 같이 둔다. 호출부는 `<IconText text={m.text} />` 한 줄. Markdown 본문 안의 이모지는 건드리지 않는다.

### 3-5. 교체 대상 파일 (인벤토리·실측 grep 기준, 20종 이모지가 있는 것)
**렌더러 UI(교체)** — 대화·채팅: `ChatPage.tsx`(4)·`ChatExtras.tsx`(6)·`components/slash-menu.tsx`(2)·`features/WaitReasonLine.tsx`(1)·`store.ts`(2, 채팅 문구 생성부 확인)
직원·장비: `StaffPanel.tsx`(6)·`StaffCard.tsx`·`ReviewTab.tsx`(2)·`McpSection.tsx`(2)·`McpAddDialog.tsx`(2)·`ChangesetCard.tsx`·`Autonomy.tsx`·`AutoApprove.tsx`(3)·`HireDialog.tsx`(1, 🧪)
업무: `BoardPage.tsx`·`PlanCard.tsx`·`RunCard.tsx`(4)·`LabSection.tsx`(3)·`ManualsPage.tsx`·`MeetingPage.tsx`·`InboxPage.tsx`·`Dashboard.tsx`
기타 화면: `LevelUp.tsx`·`WhatsNew.tsx`(✨🐞🔧)·`Onboarding.tsx`(3)·`CoachTour.tsx`(7, `icon` 필드 데이터는 아이콘 이름으로 변경)·`Tutorial.tsx`·`RemoteSection.tsx`(2)·`DemoStage.tsx`(2)·`ShopPage.tsx`(5, **화면 라벨만**, 세트·미션 데이터 제외)·`App.tsx`·`layout/PhoneShell.tsx`(💰 자금 칩 → `money`)
**사전(4개 언어, A 경우만 이모지 삭제)** — `autonomy.ts`(17)·`chatMessenger.ts`·`featuresA.ts`(29)·`featuresB.ts`·`logs.ts`·`shell.ts`·`staff.ts`·`tutorial.ts`·`gallery.ts`, `main.ts`는 **C(OS 알림)이므로 유지**
**제외(건드리지 않음)** — `map/**`, `shared/iso/**`, `shared/economy.ts`(상점·미션 데이터), `shared/deskPet.ts`·`deskPet/**`, `main/tray*.ts`·`main/petWindow.ts`·`main/index.ts`, `main/remote/service.ts`(OS alert), `mobile/preview/**`, 안드로이드, `site`
**main의 시스템 메시지**(`main/office.ts` 19곳 등)는 B 방식이라 **코드 변경 없음**.
> 정확한 줄은 `emoji-inventory.md` §3에 있음. 구현 시 위 목록을 체크리스트로 쓰고, 파일마다 "A/B/C/D 어느 경우인가"를 판단해 교체합니다.

### 3-6. 글자형 기호(✓ ⚠ ✕ ⏸ ★ ➤)
- ✓·⚠·⏸는 20종에 들어 있어 같이 교체. ★·✕·➤·♪·⬆는 20종 밖이므로 이번에는 **그대로**(필요하면 기존 `lucide-react`) — 임의로 20종을 늘리지 않는다.

### 3-7. 위험
1. **교체 규모**: 렌더러 약 35개 파일 + 사전 9개. 한 번에 바꾸면 리뷰가 어려우므로 **화면 묶음 단위로 커밋**(대화·채팅 / 직원 패널·장비 / 업무·랩 / 기타)을 추천.
2. **사전 키 공용 사용**: 같은 키를 화면과 OS 알림 둘 다 쓰면 이모지를 빼는 순간 OS 알림에서 사라짐 → 사전 테스트(아래)와 키 사용처 grep으로 잠금.
3. 16px 미만 선만 규칙 때문에 작은 칩(13~15px)에서는 듀오톤이 안 보임 — 시안에서 뭉개짐을 확인해 정한 규칙이라 의도된 동작.
4. SVG 인라인 20종 × 두 레이어 → 번들 영향은 경로 문자열 수 KB 수준으로 작음.
5. 라이트·다크 외 테마(5종) 채움 색 가시성은 라벤더만 확인된 상태.

### 3-8. 검증
**추가 테스트**
1. `scripts/duoIcons.test.mts`(신규): `DUO_NAMES` 20개 전부 `DUO_PATHS`에 경로가 있다(2종 이하로 비는 아이콘 없음). `EMOJI_TO_DUO`의 모든 값이 `DUO_NAMES`에 있다. 시안 매핑 표(이모지 28개 전후)를 그대로 기대값으로 deepEqual.
2. `splitLeadingIcon`: `'🎉 회사가 성장했어요'` → `{name:'party', rest:'회사가 성장했어요'}`, `'⚠️ 경고'`(변형 선택자) → warn, `'안녕 ✅'` → 변환 없음, `'📦 가구'`(20종 밖) → 변환 없음, 빈 문자열.
3. **사전 이모지 금지 테스트**(`emojiUi.test.mts`, 신규): 사전 전체를 돌며 허용 목록(`notify.`·`tray.` 접두사 등 C 경우) 외의 키 값(ko·en·ja·zh)에 20종 이모지가 남아 있으면 실패 → **"사전에서 빼고 화면에서 붙인다"가 유지되는지**를 기계적으로 잠금(허용 목록은 이유 주석 필수).
4. 렌더 테스트(DOM 없이 `renderToStaticMarkup`): `<DuoIcon size={14}>`에는 채움 `<g>`가 없고 `size={18}`에는 있다. `name` 20개 모두 오류 없이 렌더.
5. 소스 규칙: `features/`에서 20종 이모지 리터럴이 허용 목록 외에 남지 않았는지 grep 테스트(제외 목록 명시).
**캡처(오큐에이)**: 라이트·다크 각각 대화·직원 패널·결재함·랩/매뉴얼·알림 알약에서 아이콘 교체 확인, 13~16px 경계(선만→듀오톤) 확인.

---

## 4. 정리드가 정할 쟁점과 내 추천

| # | 쟁점 | 선택지 | 추천 |
|---|---|---|---|
| 1 | 직원 패널 분할 방식 | (가) 기존 JSX에 `split:` 클래스(내 안) / (나) `PanelSide`·`PanelMain`으로 컴포넌트 분리 | (가). 이유: 변경 줄 수가 작고 미니 뷰가 한 개. 단, 클래스가 늘어 읽기엔 (나)가 낫다는 점은 인정 — 구현하다 한 요소에 `split:` 클래스가 5개를 넘는 곳이 많아지면 (나)로 전환 |
| 2 | 직원 패널 모델 드롭다운의 점 | 문자 점(`●●●○○`, 내 안) / 커스텀 드롭다운으로 색 점 | 문자 점. 색 점은 새 부품·접근성 처리가 필요하고 시안의 핵심(순서·구분)은 문자로도 전달됨 |
| 3 | 채팅 메시지 이모지 | 저장은 그대로 + 표시 변환(B) / 저장 문구 자체를 바꾸고 마이그레이션 | B. DB 이전분이 자동 처리되고 61곳을 안 고침 |
| 4 | 검색 열림 상태를 store로 | 올림 / 상단 바 🔍 포기하고 대화방 안에 둠 | 올림(1개 값). 시안 준수 |
| 5 | 비서 ✨·`RemoteLine` | 분할에서 유지 / 시안대로 제거 | 유지(비서는 상단 바가 유일한 진입점) |
| 6 | 모델 UI 목록 | `modelOptions.ts`(고용 창·직원 패널만) / 각각 따로 | 한 곳. 8곳 단일화는 이번 제외를 지키되 UI 두 곳은 같이 써서 순서 어긋남 방지 |

**박패턴 안과 비교 시** 서로 갈릴 가능성이 큰 지점(추측이 아니라 이 설계에서 내가 의식적으로 단순함을 택한 곳): 쟁점 1(컴포넌트 분리 여부), 쟁점 2(드롭다운 부품), 폴드 분할 테스트를 순수 함수 위주로 두고 화면 단위 자동 테스트를 늘리지 않은 점. 박패턴 안을 전달받으면 공통점·차이점·추천을 보완하겠습니다.

## 5. 구현 순서 제안(정리드 단독 작업 기준)
1. 페이블: 필수 12곳 → `modelOptions.ts`·`ModelCards`·토큰 절약 → 테스트 → (고용 창은 이 단계에서 `StaffPanel` `MODELS` 교체 포함)
2. 아이콘: `shared/duoIcons.ts`·`DuoIcon`·CSS 변수·두 테스트부터 → 화면 묶음 4개 순서로 교체 → 사전 금지 테스트를 **마지막에** 켠다(중간에 깨지지 않게)
3. 폴드 분할: `layoutState`·CSS 변형·테스트 → `PhoneShell` → `PopMenu` → 대화방 → 직원 패널(가장 마지막, 앞 두 단계로 `StaffPanel`의 모델·아이콘 변경이 끝난 뒤)
