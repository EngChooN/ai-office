# 설계안 B — 디자인 리프레시 3건 구현 (유지보수성 · 변경 영향 최소화 · 검증 가능성)

> 작성: 박패턴(FE 설계). 코드는 고치지 않았고, 최가독 설계안(`impl-design-readable.md`)은 읽지 않았습니다. 기준: `app/` 현재 코드(앱 1.1.5).
> 구현은 정리드 혼자, 순서는 **페이블 → 아이콘 → 폴드 분할**입니다. 아래 각 장은 이 순서와 무관하게 읽을 수 있게 썼지만, 파일 충돌 지점(`StaffPanel.tsx`·`HireDialog.tsx`)은 §4에 따로 모았습니다.

## 0. 이 안의 원칙 3가지

1. **경계를 한 줄로 긋는다.** 새 동작은 전부 "분할 켜짐" / "새 컴포넌트 안" / "새 파일 안"에만 존재한다. 켜지지 않았을 때는 기존 클래스·기존 JSX가 **바이트 단위로 같게** 남는다. (회귀 방지의 핵심)
2. **판정은 순수 함수, 표시는 얇게.** 분할 판정·모델 순서·아이콘 치환·이모지 검사는 DOM 없이 `node --test`로 돌릴 수 있는 함수/데이터로 둔다.
3. **분리·공통화는 이번 작업에서 이득이 보이는 곳만.** 이득이 없으면 분리하지 않는다. 각 항목에 "이득 / 추가 복잡도"를 적었다.

---

## 1. 폴드 분할 (624×986)

### 1-1. 요구사항 해석
- 분할 = `isPhone && width ≥ 600 && !isShort`. 키보드가 열리면 **왼쪽 칸만** 숨긴다(분할 판정 자체는 유지 → 입력 중 레이아웃이 통째로 바뀌어 포커스가 풀리는 사고 방지. 기존 `layoutState.ts` 주석이 지키려는 바로 그 원칙).
- 폭 ≥ 600인데 `isPhone`이 아닌 경우(≥840 태블릿)는 PC 배치 → 분할 아님. 즉 분할은 **600 ≤ 폭 < 840** 구간뿐이다. (`isPhone`이 가로 폰 `height<500`으로도 켜지지만 그 경우 `isShort`라 제외)

### 1-2. 판정 로직 (순수 함수)
**고칠 파일:** `app/src/renderer/layout/layoutState.ts`

```ts
export const SPLIT_MIN_WIDTH = 600
export interface LayoutState { isPhone; isShort; isSplit; isKeyboardOpen }

/** 폭·안정 높이만으로 정하는 배치 — createLayoutTracker 안에서 쓰던 decide를 꺼내 export */
export function decideLayout(width: number, stableHeight: number) {
  const isShort = stableHeight < SHORT_MAX_HEIGHT
  const isPhone = width < PHONE_MAX_WIDTH || isShort
  return { isPhone, isShort, isSplit: isPhone && width >= SPLIT_MIN_WIDTH && !isShort }
}
```
- `createLayoutTracker`의 지역 `decide`를 이 함수로 교체(두 호출 지점 모두). 폭은 키보드로 변하지 않으므로 `width`(실시간)를 그대로 써도 안정 높이 규칙과 충돌하지 않는다.
- **함정 1:** `setLayoutState`의 같음 비교에 `isSplit`을 반드시 추가. 빠뜨리면 폴드 펼침/접힘 때 구독자(`useSyncExternalStore`)가 갱신되지 않는다. → 시험으로 잠근다(§1-8).
- **함정 2:** `current` 초기값에 `isSplit:false` 추가(데스크톱 빌드는 늘 false).
- 이득: `decideLayout`을 export 하면 경계값(599/600/839/840, 높이 499/500)을 표로 시험할 수 있다. 추가 복잡도: 함수 1개 export, 필드 1개.

### 1-3. 경계 — 일반 폰·데스크톱에 영향이 없게
세 겹으로 막는다.

| 겹 | 방법 | 막는 것 |
|---|---|---|
| ① 신호 | `install.ts`가 `root.dataset.split`을 `next.isSplit`일 때만 붙임. 분할은 `isPhone`의 부분집합이라 `data-layout=phone` 없이는 존재 불가 | 데스크톱 빌드(`data-shell` 없음) 영향 0 |
| ② CSS | `@custom-variant split (&:where([data-layout=phone][data-split] *))` 하나만 추가. **기존 `phone:`·`short:`·`typing:` 정의는 손대지 않음** | 기존 클래스 의미 변화 0 |
| ③ 마운트 | 왼쪽 칸 컴포넌트는 분할일 때만 **마운트**(CSS로 숨기지 않음) | 일반 폰·데스크톱에서 불필요한 구독·중복 `data-tour`·중복 미니 뷰 |

③ 때문에 JS 신호도 필요하다. 이미 `useMobileUi.isKeyboardOpen`이 store로 올라와 있는 선례가 있으니 같은 모양으로:
- **새 파일 `layout/useSplit.ts`**: `useSyncExternalStore(subscribeLayout, () => getLayoutState().isSplit && IS_MOBILE_SHELL)` → `{ isSplit, isSideOpen }` (`isSideOpen = isSplit && !isKeyboardOpen`).
- **경계 규칙(기존 시험과 충돌 금지):** `mobile.test.mts`는 `features/·map/·components/`가 `layout/useLayout`을 import 못 하게 막는다. `useSplit`을 feature가 직접 쓰면 같은 규칙을 우회하게 되므로, **분할 컨테이너를 `layout/` 안의 래퍼로 만들고 feature는 슬롯만 넘긴다**:

```tsx
// layout/SplitFrame.tsx (새 파일, 50줄 이내)
export function SplitFrame({ side, children }: { side: ReactNode; children: ReactNode }) {
  const { isSideOpen } = useSplit()
  if (!isSideOpen) return <>{children}</>          // ← 비분할: 지금과 같은 트리(Fragment만 추가)
  return <div className="flex h-full min-h-0"><aside className="w-[200px] shrink-0 ...">{side}</aside><div className="min-w-0 flex-1 flex flex-col">{children}</div></div>
}
```
  - 비분할일 때 `<>{children}</>`라 DOM이 한 겹도 늘지 않는다 → 일반 폰·데스크톱 DOM 동일.
  - `side`는 JSX 값이라 비분할일 땐 **엘리먼트만 만들어지고 마운트되지 않는다**(훅은 컴포넌트 내부에서만 실행되므로). 구독 비용 0.
  - 이득: 기존 시험 규칙을 건드리지 않고 분기를 틀(layout/)에 가둔다. 추가 복잡도: 파일 2개(`useSplit.ts`, `SplitFrame.tsx`).
  - 이 시험은 `layout/`을 대상에서 빼 두었으므로 **`mobile.test.mts`에 "feature는 `layout/useSplit`도 import 금지" 한 줄**을 같이 넣어 같은 규칙을 유지한다.

### 1-4. 대화방 구조
**현재:** `ChatPage`가 머리(제목·설명·`RemoteLine`·`RoomTabs`·검색·`RoomStatusStrip`) → `MessageList` → `Composer`를 한 열로 쌓는다.

**바꿈(분할일 때만):**
```
SplitFrame
 ├ side: <ChatSide/>        ← 새 컴포넌트. 방 목록 + 회의실 + "지금 하는 일"
 └ children: (상단 바는 PhoneShell) MessageList + Composer
```
- `ChatPage`는 `return <SplitFrame side={<ChatSide room={room}/>}>…기존 본문…</SplitFrame>`로 감싼다. 기존 머리 블록(`div.border-b`)은 **분할일 때 렌더하지 않는다** → 이를 위해 머리 블록을 별도 지역 컴포넌트 `ChatHeader`로 빼고(내용 변경 없이 이동만), 분할이면 `ChatHeader`를 건너뛴다. `ChatPage`가 분할 여부를 알아야 하므로 `SplitFrame`에 render-prop을 쓴다: `children={(isSplit) => …}`. (CSS `split:hidden`으로 숨기면 `RoomTabs`·`RoomStatusStrip`이 이중 마운트되어 구독 2배 + 포인터 툴팁 중복 → 채택하지 않음.)
- **`ChatSide` 데이터:** `RoomTabs`와 `RoomStatusStrip`이 같은 계산을 이미 중복(unread·approvalRooms·teamRooms·members)한다. 분할 칸이 세 번째 복사본이 되지 않도록 **계산만** 훅으로 추출:
  - 새 `features/chatRoomHooks.ts`: `useRoomList()`(방 항목+안읽은 수+결재 점), `useRoomPeople(room)`(구성원 정렬). 기존 `RoomTabs`/`RoomStatusStrip`이 이 훅을 쓰게 바꾼다.
  - 이득: 같은 로직 3벌 방지(이번 작업에서 실제로 세 번째가 생김). 추가 복잡도: 기존 두 컴포넌트 내부를 훅으로 교체하는 리팩터가 따라옴 → **회귀 위험**. 완화: 훅 추출 커밋을 분할 커밋과 **분리**(훅 추출만 먼저 하고 데스크톱 캡처로 동일함을 확인). 시험: 추출한 계산이 이미 순수 함수 `unreadByRoom`·`roomsWithPendingApproval`·`chatRoomMembers`(shared)에 있으므로 훅은 얇은 `useMemo` 래퍼 — 별도 시험 불필요.
- 왼쪽 칸 안에서만 스크롤(`overflow-y-auto`), 배경 `--surface-chrome`, 오른쪽 경계선.
- `Composer`: 분할일 때 한 줄(＋·입력·보내기), 받는 사람 줄은 `@` 입력 때만. 입력 로직(멘션 파싱·예약·첨부)은 **건드리지 않고** "＋ 메뉴" 안에 기존 버튼을 옮겨 담는다(§1-6).
- **상단 바·결재 칩·🔍:** 시안의 상단 바는 `PhoneShell.PhoneTopBar`에서 분할일 때만 변형한다(§1-7). 검색 열림 상태 `isSearchOpen`은 현재 `ChatPage` 지역 상태이고 🔍 버튼이 `ChatPage` 머리 안에 있다 → 상단 바로 옮기려면 상태 공유가 필요.
  - **내 추천:** `store`에 올리지 말고 `ChatPage`가 분할일 때 **상단 바 우측 슬롯에 자기 버튼을 포털로 주입**하는 것도 가능하지만 복잡. 가장 작은 변경은 `useMobileUi`(이미 모바일 전용 UI 상태 store)에 `isChatSearchOpen`/`setChatSearchOpen` 1쌍만 추가하고, 데스크톱 `ChatPage`는 로컬 상태 그대로 두는 것. 단, 상태 출처가 둘이 되지 않게 `ChatPage`에서 `const [isSearchOpen, setIsSearchOpen] = IS_MOBILE_SHELL ? 모바일store : 로컬` 식 분기는 **훅 호출 순서가 달라지므로 금지**(규칙: 훅은 조건부 호출 불가). → 해결: `ChatPage`는 항상 로컬 상태를 쓰고, 분할일 때만 상단 바 버튼이 `window` 커스텀 이벤트 대신 **store의 `searchRequest` 카운터**를 올려 `ChatPage`가 `useEffect`로 반응(열기 요청만, 닫기는 로컬). 상태 출처는 로컬 하나, store는 "요청 신호"뿐.
  - 이득: 데스크톱 코드 경로 무변경. 추가 복잡도: 신호 필드 1개 + effect 1개.

### 1-5. 직원 패널 구조
**현재:** `StaffPanel`은 `<aside>` 한 벌에 머리·결재·탭·진행·사용량·로그·입력부가 세로로 쌓이고, 폰에선 `phone:fixed phone:inset-0`로 전체 화면.

**선택지 비교(이 안의 추천):** 가장 변경이 작은 건 `split:` 클래스 재배치지만, 한 JSX를 두 레이아웃에 맞추려면 `order`·`grid-area`·`split:hidden`이 얽혀 **다음 수정자가 기존 클래스와 새 클래스의 상호작용을 추적**해야 하고, 미니 뷰(`HeaderPortrait`/`LiveMiniView`)는 120px 큰 버전이 필요해 어차피 새 마크업이 든다. 반면 별도 컴포넌트로 가르면 `StaffPanel` 본문 JSX는 **무변경**이라 회귀 위험이 가장 낮다.
→ **추천: 분할일 때만 `SplitPanelBody`를 렌더하고, 기존 JSX는 건드리지 않는다.** 다만 두 갈래가 같은 로직(결재 처리·로그·입력)을 중복하지 않도록 `StaffPanel`을 다음처럼 **추출만** 한다:
1. `StaffPanel` 본문 안의 덩어리를 이름 붙은 지역 컴포넌트로 이동(내용 무변경): `ApprovalsSection`(결재), `LogSection`(로그+자동 스크롤), `ComposerFooter`(입력부), `TabsRow`. 이 이동은 **순수 이동 커밋**으로 하고 데스크톱·폰 캡처 동일 확인.
2. 분할 변형은 같은 덩어리들을 다른 부모 안에 재배치: 왼쪽 `SideColumn`(미니 뷰·정보·진행·결재·세로 탭·토큰) + 오른쪽 `MainColumn`(탭 내용). 오른쪽의 입력부는 기존 `ComposerFooter`를 한 줄 모드(`isOneLine`)로.
- 이득: 기존 경로 무변경 + 로직 한 벌 + 분할은 읽기 쉬운 새 트리. 추가 복잡도: **StaffPanel 1155줄에서 추출 리팩터가 선행**(위험 중간). 추출 범위가 크면 이 안의 약점이다 — 정리드가 위험을 줄이고 싶으면 대안 B′: **분할일 때 `ApprovalsSection` 등을 건드리지 않고 `<aside>`에 `split:grid` 클래스만 얹는 최소 변형**(레이아웃 격자 2열, `grid-template-areas`)을 쓸 수 있다. 이 경우 미니 뷰는 헤더의 기존 `HeaderPortrait`에 `split:` 크기 클래스만 준다. → 정리드 선택 쟁점 ①.

- 세로 탭: 현재 가로 탭 줄(업무 메시지·검토·장비·프로필) 컴포넌트를 `orientation` prop 하나로 세로 모양 지원(기존 값 기본). 새 탭 컴포넌트를 만들지 않는다.
- "자율 진행이 켜져 있으면 ＋에 점": `Autonomy` 상태를 읽는 기존 훅 재사용.
- 키보드가 열리면(`!isSideOpen`) `SplitPanelBody` 대신 **오른쪽 칸(업무 메시지+입력)만** 전체 폭으로 — 왼쪽 칸 컴포넌트만 언마운트되므로 입력칸은 같은 DOM 위치에서 폭만 넓어진다(포커스 유지 확인 필요 → §1-8 수동 확인 항목).

### 1-6. ＋ 메뉴
- 대화방 ＋(첨부·예약·매뉴얼·명령), 직원 패널 ＋(자율 진행·기억 길이·매뉴얼·명령·내보내기·해고), 그리고 ⋯(터미널 이어 하기·대화만 보기·글자 크기)가 모두 "버튼 목록 팝업"이다.
- **새 `components/ui/pop-menu.tsx`**: Radix가 이미 `dialog.tsx`에 쓰이는지 확인 후, 이미 설치된 프리미티브(dropdown/popover 계열)가 없으면 **Dialog 시트 재사용**(앱이 이미 모바일에서 Dialog를 시트로 쓰고, `handleBack()`이 Dialog를 Esc로 닫는 길을 이미 가진다 → 안드로이드 뒤로 가기 호환이 공짜). 새 팝업 라이브러리를 추가하지 않는다.
- **기존 버튼/컴포넌트는 그대로 안에 넣는다**(첨부 버튼, 예약 선택, `MemoryLength`, `Autonomy` 등). ＋ 메뉴는 "자리 이동"이지 기능 재작성이 아님.
- 위험: 예약 ▾·매뉴얼 선택이 인라인 팝업(`SlashMenu`)을 열면 ＋ 메뉴 닫힘/포커스 순서 충돌. 완화: ＋ 메뉴에서 매뉴얼·명령을 누르면 메뉴를 닫고 입력칸에 `/`·`/매뉴얼 `을 채워 **기존 SlashMenu 흐름을 재사용**(새 흐름 금지).

### 1-7. 하단 탭 50px 아이콘만 / 상단 바 46px
**고칠 파일:** `layout/PhoneShell.tsx`
- `PhoneTabBar`: `short:h-11 h-16` → 분할 변형 클래스 **`split:h-[50px]`만 추가**(기존 `h-16`은 유지). 글자 숨김: 기존 `short:sr-only`와 같은 패턴으로 `split:sr-only` 추가. → 일반 폰은 클래스 문자열이 `split:` 항목 외에 동일.
- `PhoneTopBar`: `h-12` + `split:h-[46px]`. 분할일 때 자금 칩 숨김은 **채팅 화면일 때만**이므로 `view === 'chat'` 조건이 필요 → CSS만으로는 불가 → `data-view` 등을 쓰지 말고 JS로 `isSplit && view === 'chat'`를 한 번 계산해 `!isWorkMode && !isAuto && !(isSplit && view==='chat')`. (PhoneShell은 틀이라 `useSplit` 사용 가능.)
- 결재 대기 숫자 칩·🔍·＋: 이미 `waitingCount`/`setHireOpen` 있음. 🔍는 §1-4 신호.
- **`RemoteLine`·✨ 비서 버튼:** 시안에 없다. 비서 진입점이 상단 바뿐이라 삭제하면 기능 접근이 사라진다 → **분할에서도 유지**(✨는 상단 바에 남기고 폭이 모자라면 ⋯ 안으로). `RemoteLine`은 왼쪽 칸 맨 아래에 작게. (시안 밖 결정이므로 정리드 확인 필요 → 쟁점 ②.)

### 1-8. 키보드 감지
- **새로 만들지 않는다.** 기존 `data-keyboard`와 `useMobileUi.isKeyboardOpen`(둘 다 `install.ts`가 채움)을 그대로 쓴다. 분할은 `isSideOpen = isSplit && !isKeyboardOpen` 하나로만 소비.
- 짚어 둘 점: 기존 `typing:` 변형은 **`short` 전용**(가로 폰)이라 이번 분할(non-short)에선 적용되지 않는다 → 폴드 분할에선 `typing:` 대신 JS의 `isSideOpen`을 쓴다. (CSS 변형 `side:`를 새로 만들지 않는 이유: 변형 순서/우선순위 의존을 줄이고 마운트 제어와 한 곳에서 일치시키기 위해.)

### 1-9. 검증
**자동(`app/scripts/mobile.test.mts`에 추가, 기존 파일·방식 그대로):**
1. `decideLayout` 표: (599,986)→isSplit false / (600,986)→true / (839,986)→true / (840,986)→false / (700,499)→isShort true·isSplit false(가로 폰) / (624,986) true.
2. `createLayoutTracker`: 키보드 흉내 입력(`ime>0`, 높이 40% 감소) 후에도 `isSplit` 유지·`isKeyboardOpen`만 true. 폭 변경(폴드 펼침 624→1100) 시 `isSplit` false·`isPhone` false.
3. `setLayoutState`: `isSplit`만 바뀌어도 구독 콜백이 호출됨(함정 1 잠금).
4. `index.css`에 `@custom-variant split (&:where([data-layout=phone][data-split] *));` 존재, 기존 phone/short/portrait/typing 정의 **원문 유지**(정규식으로 잠금).
5. feature·components·map이 `layout/useSplit`·`layout/useLayout`을 import하지 않음(기존 시험 확장).
6. `install.ts`가 `data-split`을 `isPhone` 없이 붙이지 않음(소스 매치: `next.isSplit`일 때만).
**수동·QA 캡처(오큐에이):** 624×986 대화방/직원 패널 비율 실측(대화 84%, 업무 메시지 94%), 400폭(분할 아님)·1100폭 PC 배치 회귀 캡처, **분할 상태에서 입력칸 포커스 → 키보드 열림 시 왼쪽 칸만 사라지고 포커스 유지**, 가로 폰(900×400) 분할 아님.

**위험 표**
| 위험 | 대응 |
|---|---|
| `StaffPanel` 추출 리팩터가 데스크톱 회귀 | 순수 이동 커밋 분리 + 캡처 동일성 + 대안 B′(클래스만) |
| `isSplit`을 `setLayoutState` 비교에서 누락 | 시험 3 |
| 키보드 열림/닫힘으로 왼쪽 칸 언마운트→재마운트 시 스크롤 위치·툴팁 상태 손실 | 왼쪽 칸 상태는 store 구독 파생값뿐(지역 상태 없게) — 손실돼도 무해하게 설계 |
| 600 경계(599/600) 기기 흔들림 | 판정이 `window.innerWidth` 정수 비교뿐 → 경계 시험으로 고정 |

---

## 2. 페이블 모델

### 2-1. 요구사항 해석
저장값 `fable`, CLI `claude-fable-5-1`(`MODEL_ID` 매핑), 표기 "Fable". 고용 창 카드 목록·직원 패널 드롭다운에 같은 순서·점. 토큰 절약 `fable→opus` 포함. `pickModel` 현행. 사용량 창 라벨·목록 단일화 제외.

### 2-2. 고칠 곳 (조사서 필수 12 + 토큰 절약)
| # | 파일 | 변경 | 위험 |
|---|---|---|---|
| 1 | `shared/types.ts:34` | `ClaudeModel`에 `'fable'` | 타입 오류가 `MODEL_ID` 누락을 컴파일 시점에 잡아 줌(이득) |
| 2 | `main/ai/claude.ts:36` | `MODEL_ID.fable = 'claude-fable-5-1'` (별칭 `fable`이 아니라 전체 ID) | 계정에서 호출 불가 시 오류 — 대표 확인 대기(실제 호출) |
| 3 | `shared/slashCommands.ts:122` | `CLAUDE_MODEL_CHOICES`에 `fable` | 시험 기대값 갱신 필수 |
| 4 | `shared/engineModel.ts:6,40` | `CLAUDE_MODELS` Set·프롬프트 문장 | **빠뜨리면 다음 시작에 조용히 `default`로 덮임 — 최우선** |
| 5 | `shared/staffPack.ts:29` | `MODELS` | 빠뜨리면 팩 가져오기 `pack.err.model` |
| 6 | `renderer/features/HireDialog.tsx` | 카드형 목록(§2-4) | 폭·줄바꿈 4개 언어 |
| 7 | `renderer/features/StaffPanel.tsx` | `MODELS`·`CLAUDE_MODEL_NAME`·외부 영입 `<option>` 3곳 | 세 곳 중 하나 누락 쉬움 → 시험 |
| 8 | `renderer/features/secretary/ConfirmCard.tsx` | select 목록 | 표기가 소문자 그대로인 기존 방식 유지(범위 밖) |
| 9 | `shared/secretaryTools.ts:303` | hire 인자 설명 | 비서가 `fable`을 제안할 수 있게 됨 → 비용 큰 모델 자동 제안이므로 설명에 "가장 어려운 일에만" 문구는 **넣지 않음**(요구 밖), 정리드 확인 |
| 10 | `main/agents.ts:8` | `MODELS` | `includes` 부분 일치라 안전 |
| 11 | `shared/i18n/dict/guideHint.ts` | `guideHint.model.fable` 신규 + `guideHint.model.opus` 문구 변경 | 4개 언어 모두 |
| 11 | `shared/i18n/dict/tools.ts:423~426` | `/model` 설명에 fable | 4개 언어 |
| 12 | 시험 3개 | §2-6 | — |
| 13 | `shared/tokenSaving.ts:26` + 사전 | `fable→opus` 규칙 | §2-5 |

### 2-3. 목록 단일화는 하지 않되, **새로 만드는 UI 목록은 한 곳**
- 8곳 중복 정리는 제외(요구). 단, **새로 생기는 두 UI(고용 카드·직원 드롭다운)가 서로 다른 목록을 만들면** 같은 중복이 하나 더 생기므로 → **새 파일 `renderer/features/modelOptions.ts`**(UI 전용): `[{ value, label, hintKey, dots, isNew }]` 순서 배열 하나. 고용 카드와 직원 패널 드롭다운이 이것을 읽는다(순서·점·NEW가 한 곳). 기존 `ConfirmCard`·외부 영입 `<option>`은 현행 그대로 두되 `fable`만 한 줄 추가.
  - 이득: 순서·점 임시값(5·4·3·1)이 대표 확인 후 바뀔 때 **한 줄 수정**. 추가 복잡도: 파일 1개.
- 점(사용량) 표기: 숫자 `dots` 데이터와 렌더 컴포넌트를 분리 — 렌더는 `components/ui/usage-dots.tsx`(작은 순수 표시 컴포넌트, 5칸)로 두고 카드와 드롭다운이 같이 쓴다. 단, 네이티브 `<select>`의 `<option>`은 **안에 JSX를 못 넣는다** → 드롭다운 점은 `●●●○○` 문자를 label에 붙이는 수밖에 없다. 선택지: (a) 문자(모양이 시안의 7px 둥근 점과 다름, 변경 작음) (b) NativeSelect를 커스텀 리스트박스로 교체(시안과 일치, 접근성·모바일 네이티브 선택기 상실, 변경 큼). **추천 (a)** — 점 모양은 시안 설명상 "항목 오른쪽 점"이 핵심이고 네이티브 선택기는 모바일 입력 접근성이 높다. 다만 시안과 픽셀 일치는 포기 → 정리드·이디자 확인 쟁점 ③.

### 2-4. 카드형 목록 컴포넌트 위치
- **새 파일 `components/ui/radio-cards.tsx`** 가 아니라 **`features/ModelCards.tsx`** 로 둔다. 이유: 이 목록은 "모델"에 의미가 묶인 UI(점·NEW·사용량 범례)이고, 이번 작업에서 쓰는 곳이 고용 창 한 곳뿐이다 → 범용 `RadioCards`로 일반화할 근거가 없다(원칙: 미래 요구로 일반화 금지). 필요해지면 그때 끌어올린다.
- 마크업: 네이티브 `<input type="radio">` + `label`(키보드·스크린리더 기본 지원), 그룹은 `role="radiogroup"`. 선택 상태는 `has-[:checked]:` 스타일로 JS 없이.
- 결재 방식 칸을 모델 칸 아래로 옮기는 건 `HireDialog` JSX 순서 교체뿐(상태·핸들러 무변경).
- `Segmented`는 결재 방식에서 계속 쓰므로 삭제하지 않는다.
- Codex 직원: 기존 드롭다운 분기 그대로(`provider !== 'claude'`이면 `ModelCards` 대신 현행 UI).
- 폭: 고용 창 폭이 624px 분할 화면에서도 카드 한 줄 설명이 줄바꿈 없이 들어가는지 4개 언어로 캡처.

### 2-5. 토큰 절약 규칙·사전
**`shared/tokenSaving.ts`**
```ts
const LOWER: Partial<Record<ClaudeModel, ClaudeModel>> = { fable: 'opus', opus: 'sonnet' }
export function saverFor(s) {
  const to = s.provider !== 'codex' ? LOWER[s.model as ClaudeModel] : undefined
  if (to) return { reason: s.model === 'fable' ? 'fable' : 'opus', action: { kind: 'model', from: s.model, to } }
  …memory 규칙 그대로
}
```
- `SaverReason`에 `'fable'` 추가(타입). 사전: `tokenSaver.reason.fable`(예: "Fable 모델을 써요"), `tokenSaver.hint.model`이 "Sonnet으로 한 단계 낮추기"를 **하드코딩**하고 있으면 `{to}`·`{from}` 변수화 필요 — `TokenSaverTop3.tsx:77`·사전 키를 확인하고 변수 방식으로 일반화(Fable→Opus 문구가 틀린 "Sonnet" 안내가 되지 않게). 이득: 규칙이 표(데이터)라 다음 모델 추가 시 한 줄. 추가 복잡도: 변수 1개.
- `hireDefaults`·`pickModel` 변경 없음.

### 2-6. 시험
| 파일 | 추가 |
|---|---|
| `slashCommands.test.mts:154~166` | 기대 배열에 `fable`; **전체 ID `claude-fable-5-1`은 거부**(기존 "전체 ID 거부" 원칙 유지)를 거부 목록에 추가 |
| `engineModel.test.mts` | `fable`+claude는 불일치 아님, `claude-fable-5-1`(전체 ID 저장값)은 불일치(저장 규약 고정) |
| `staffPack.test.mts` | `fable` 팩 가져오기 통과 |
| `tokenSaving.test.mts` | `fable→opus`, `opus→sonnet` 유지, codex 직원 제외 |
| 새 `modelOptions.test.mts` | **모델 행 누락 방지**: `CLAUDE_MODELS`(shared)의 모든 값이 `modelOptions`에 있음(default 포함) + 순서가 기본→Fable→Opus→Sonnet→Haiku + `MODEL_ID.fable === 'claude-fable-5-1'`(`claude.ts`에서 `claudeModelId` export 필요 여부 확인, 안 되면 소스 정규식) |
| `i18n.test` | 새 키 4개 언어 자동 검사(기존 시험이 이미 함) |

### 2-7. 구버전 되돌림 위험 처리
- 문제: `fable` 저장 후 구버전 앱 실행 → 시작 시 `isEngineMismatch`로 **조용히 `default`로 덮어써 DB 저장** → 신버전 복귀해도 Fable 설정 소실.
- **내 추천:** 코드로 막지 않고 **릴리스 정보로 알린다**(이번 범위 밖 배포 단계): 대표 확인 후 CHANGELOG·업데이트 안내에 "Fable 직원은 구버전으로 돌리면 기본 모델로 바뀝니다" 한 줄. 이유: 구버전 코드는 고칠 수 없고, 신버전이 막는 방법(저장을 `default`로 하고 별도 필드에 보관)은 DB 스키마 변경이라 이번 범위 초과.
- 같은 이유로 **피어(원격 팀원) 구버전**은 표시만 영향 — 변경 없음.
- 대표 확인 대기: 계정 호출 가능 여부(실호출), 점 개수. 실호출 실패 오류 표시는 기존 `chat.runError` 경로를 그대로 탐 — 구현에서 새 오류 처리 만들지 않음.

---

## 3. 듀오톤 아이콘 20종

### 3-1. 요구사항 해석
이모지 UI를 20종 SVG로 교체. 24 격자·선 2.15·currentColor·닫힌 모양만 `--ring` 계열 채움 (1.6,1.8) 어긋남·투명도 0.42(라이트)/0.6(다크)·16px 미만은 선만. 범위 밖: 지도 말풍선, 상점·미션 데이터, 트레이·OS 알림, 안드로이드, 사이트.

### 3-2. 20종 보관 방식 — 시안 HTML 좌표 이식
- **새 파일 `renderer/components/duo-icons.ts`** (데이터만): 시안 `ICONS`의 `d` 배열을 그대로 옮긴 **타입 있는 데이터**.
```ts
type Part = { t: 'path'|'circle'|'rect'|'dot'; fill?: boolean; d?: string; cx?; cy?; r?; x?; y?; w?; h?; rx? }
export const DUO_ICONS = { done: [...], warn: [...], … } as const   // 20개
export type DuoIconName = keyof typeof DUO_ICONS
```
- **이식 방법(수작업 오타 방지):** 시안의 `'F:…'`, `'CF:cx,cy,r'`, `'RF:x,y,w,h,rx'`, `'D:x,y'`, `'C:…'`, 그대로의 `d` 문자열을 **파싱하는 작은 변환 스크립트(일회성, `app/scripts/`에 두지 않고 정리드가 로컬에서 실행)**로 `Part[]` 리터럴을 생성해 붙여 넣는다 — 손으로 옮기다 좌표 한 글자 틀리는 사고를 막는다. 생성 후 스크립트는 저장하지 않는다(재생성 필요 없음).
- 대안(문자열 그대로 보관 후 런타임 파싱)은 시안 포맷 그대로라 이식이 가장 쉽지만, 런타임 파서가 번들에 들어가고 타입 안전성이 없다. **추천: 빌드 전 변환된 데이터**(런타임 파서 없음).
- `.svg` 파일 20개로 분리하는 안은 `currentColor`·채움 변수 때문에 `<img>`가 불가(인라인 필요) → 채택하지 않음.
- **새 파일 `renderer/components/duo-icon.tsx`**: `<DuoIcon name size className />`.
  - `size < 16`이면 채움 그룹을 **렌더하지 않는다**(§3-3 상수 `DUO_FILL_MIN_SIZE = 16`).
  - 접근성: 장식이면 `aria-hidden`, 의미 전달이면 `aria-label` prop(이모지는 스크린리더가 읽던 글자였다 → 의미 있는 곳은 반드시 `label` 전달, 기존 문구 옆에 글이 있으면 `aria-hidden`).
  - 크기별 프리셋 없이 `size` 숫자 직접(13~16 본문, 18 카드, 26 알림 — 시안 규칙).

### 3-3. 듀오톤 색·투명도 (CSS 변수, 라이트·다크·테마 6종)
**고칠 파일:** `index.css`(+ 테마 정의가 있는 파일 — `themes/` 폴더 또는 CSS 내 테마 블록; 정확한 위치는 구현 시 `--ring` 정의 grep으로 확인)
```css
:root { --duo-fill: var(--ring); --duo-fill-opacity: .42; --duo-dx: 1.6px; --duo-dy: 1.8px }
[data-mode='dark'] { --duo-fill-opacity: .6 }
```
- **원칙: 변수 2개(`--duo-fill`, `--duo-fill-opacity`)만 테마가 덮어쓸 수 있고, 아이콘 컴포넌트는 변수만 읽는다.** → 대표가 "라벤더 외 테마 채움 색"을 정하면 **테마 CSS 한 곳에 `--duo-fill: …` 한 줄씩** 추가(임시값은 `var(--ring)` 그대로). 컴포넌트·20종 데이터는 안 건드림.
- 오프셋 `(1.6, 1.8)`는 SVG `transform`에 숫자로 박지 않고 상수 한 곳(`duo-icon.tsx` 상단)에 둔다(CSS 변수화는 `transform` 속성에서 불가 → 속성값으로 `translate(1.6 1.8)`).
- 테마 6종 가시성: 라벤더만 확인된 상태. **시험으로는 대비를 잡을 수 없으므로**(색 대비는 시각 확인) QA 캡처 항목: 6테마×라이트·다크 12장 중 최소 "채움이 배경과 구분되는지"를 오큐에이 확인. 안 보이는 테마는 해당 테마 블록에 `--duo-fill` 덮어쓰기(코드 변경 최소).
- 이득: 테마별 색 조정이 CSS 한 줄. 추가 복잡도: 변수 2개 정의 + 테마 블록 점검.

### 3-4. 사전 문구 속 이모지 처리 (i18n.test 영향)
현재 사전(4개 언어) 이모지 포함 키: `chatMessenger` 13, `autonomy` 17, `featuresA` 40, `featuresB` 8, `main` 14, `logs` 4, `staff` 4, `shell` 6, `tutorial` 2, `gallery` 2 (줄 수 기준, 이 10개 파일). 이들은 **세 종류**로 나뉜다:
1. **화면 라벨**(`chat.quick.like` = `👍 좋아요` 등): 사전에서 이모지를 빼고 JSX에서 `<DuoIcon name="like"/> {t('chat.quick.like')}`로 붙인다. 한 키를 4개 언어가 공유하므로 이모지 제거도 4개 언어 동시.
2. **OS 알림·트레이로도 나가는 키**: 이모지 유지(SVG 불가, 범위 밖). 같은 키를 화면과 OS 알림이 같이 쓰면 **키를 분리**(`notify.*`는 이모지 유지, 화면은 이모지 없는 새 키)하거나 화면 쪽에서 앞머리를 떼는 `stripLeadingEmoji`를 쓴다. → 구현 시 키별로 호출처 grep(`t('키'`)으로 확인(조사서에서 확인하지 못함 — 미확정 항목).
3. **DB 저장 시스템 메시지의 앞머리**: §3-5.
- **`i18n.test.mts` 영향:** 기존 시험은 키 존재·4언어·`{변수}` 동일만 보므로 이모지 제거로 깨지지 않는다. 단 `{변수}` 목록이 같아야 하므로 이모지를 뺄 때 변수 위치를 건드리지 않게 주의.
- **새 시험(범위 보호):** `emojiScope.test.mts`(§3-7).

### 3-5. DB 저장 시스템 메시지 앞머리 이모지
**사실:** `main/office.ts`의 `postChat('me', '🤖 자동결재를 시작해요…')`, `'✅ 커밋을 결재받았어요…'`, `'✅ 결정: …'` 등(약 28곳)이 이모지를 문자열에 박아 **DB `chat` 테이블에 저장**한다. 이미 저장된 과거 메시지에도 같은 이모지가 있다.
**선택지**
- (A) 저장 문구에서 이모지를 빼고 메시지에 `icon` 필드를 추가 → 과거 메시지는 이모지 그대로 남아 두 방식이 영구히 공존, DB 컬럼 추가(스키마 변경) → **채택하지 않음**.
- (B) **표시할 때 맨 앞 이모지만 아이콘으로 치환**(저장 무변경): 과거·신규 메시지가 같은 규칙, 마이그레이션 없음, 되돌리면 이모지로 복귀 → **추천**.
**(B) 구체화**
- **새 파일 `shared/iconText.ts`**(순수·시험 가능): `EMOJI_TO_ICON: Record<string, DuoIconName>`(20종의 이모지→이름, 예 `'✅'→done`, `'🤖'→ai` …) + `splitLeadingIcon(text): { icon?: DuoIconName; rest: string }` (맨 앞 이모지 1개 + 뒤 공백만 처리, 이모지 변형 선택자 U+FE0F 허용).
- 적용 지점: `ChatPage`의 `Bubble` 한 곳(시스템/'me' 줄 렌더). 다른 화면은 쓰지 않음.
- **부작용 명시:** 사용자가 직접 입력한 `✅ …`도 맨 앞이면 아이콘으로 보인다 → 의미가 같고 저장은 원문 그대로이므로 허용(수정·복사 시 이모지 원문 유지). 정리드가 막고 싶으면 `m.from === 'me'`가 시스템 글과 사용자 글을 구분하지 못한다는 점을 알아야 한다(`OFFICE_SENDER`로 오는 글은 구분 가능). → 쟁점 ④.
- 20종에 없는 앞머리 이모지(예: ❓ 는 매핑 있음, 🔍 같은 것)는 **변환하지 않고 이모지 그대로** 둔다(범위 밖 이모지에 에러 없이 폴백).
- 이득: DB·IPC·피어 프로토콜 무변경(피어가 구버전이어도 문자열 그대로). 추가 복잡도: 함수 1개 + 표 1개 + 적용 1곳.

### 3-6. 교체 대상 · 범위 밖 파일
**교체 대상(렌더러, 이모지 포함 줄 수 상위 — 정리드가 구현 때 `emoji-inventory.md` §3의 `파일:줄`로 확정):**
`features/CoachTour.tsx`(19), `ChatExtras.tsx`(7), `StaffPanel.tsx`(6), `Onboarding.tsx`(6), `LabSection.tsx`(5), `ChatPage.tsx`(5), `RunCard.tsx`(4), `StaffCard.tsx`·`McpSection.tsx`·`McpAddDialog.tsx`·`AutoApprove.tsx`(각 3), `Tutorial.tsx`·`ReviewTab.tsx`·`RemoteSection.tsx`·`HireDialog.tsx`·`EquipmentTab.tsx`·`components/slash-menu.tsx`·`store.ts`(각 2), 그 외 1줄짜리: `layout/PhoneShell.tsx`·`secretary/SecretaryChat.tsx`·`WhatsNew.tsx`·`WaitReasonLine.tsx`·`PlanCard.tsx`·`OrgPage.tsx`·`MeetingPage.tsx`·`ManualsPage.tsx`·`LevelUp.tsx`·`InboxPage.tsx`·`Dashboard.tsx`·`ChangesetCard.tsx`·`BoardPage.tsx`·`AvatarEditor.tsx`·`Autonomy.tsx`·`App.tsx`. 사전 10개 파일(§3-4). `main/office.ts` 저장 문구 28곳은 §3-5로 **수정하지 않음**.
- 주의: 위 수치는 이번에 직접 grep한 "이모지 포함 줄 수"로 조사서 380곳 집계와 단위가 다르며(주석 포함·20종 외 이모지 포함), **20종에 해당하지 않는 이모지(🔍 📎 등)는 이번 교체 범위가 아니다** — 20종 이외는 현행 유지/lucide 유지.
**범위 밖(교체 금지·시험에서 허용 목록):** `renderer/map/**`(`emoteArt.ts` 등), `renderer/deskPet/**`, `shared/economy.ts`(상점·미션 49), `shared/iso/actions.ts`·`interactions.ts`(지도 말풍선), `main/trayMenu.ts`·`tray.ts`·`petWindow.ts`·OS 알림 경로, `mobile/preview/fakeShell.ts`(개발용), `android/`, `site/`, 코드 주석.
- **교체 규칙(기계적으로 검증 가능하게):** 이모지 → `<DuoIcon name=… />` 1:1. 의미 매핑은 핸드오프 §3의 대체표를 그대로(✅✓→done, ⚠→warn …). 20종에 없는 이모지는 **남긴다**.

### 3-7. 빠뜨림을 잡는 시험
**새 `app/scripts/emojiScope.test.mts`**
1. **범위 안 파일에 20종 이모지가 남지 않았는지:** 렌더러 `features/`·`components/`·`layout/`·`store.ts`·`App.tsx`에서 주석(`//`, `/* */`)·문자열 안 이모지를 정규식 스캔 → **허용 목록(파일:이모지 쌍) 밖**이면 실패. 허용 목록은 시험 파일 상단 상수 한 곳(범위 밖 사유를 주석으로).
2. **`shared/i18n/dict/*.ts`:** 화면용 키는 20종 이모지 0개. OS 알림·트레이 키는 **키 이름 접두사 허용 목록**(`notify.`·`tray.` 등, 실제 접두사는 구현 때 grep으로 확정)으로 예외. 허용 키 밖에서 발견되면 실패.
3. **`DUO_ICONS` 20종 무결성:** 이름 20개 전부 존재, 각 `Part`가 최소 1개의 선 요소 포함, 좌표 문자열이 SVG path로 파싱 가능한 문자만 포함(오타 방지), `EMOJI_TO_ICON`의 값이 모두 `DUO_ICONS` 키.
4. **`splitLeadingIcon` 단위 시험:** `'✅ 승인'`→done/`'승인'`, `'🤖자동'`(공백 없음), `'✅️ x'`(VS-16), 맨 앞이 아닌 이모지 무변환, 20종 외(`'🔍 x'`) 무변환, 빈 문자열.
5. **`DuoIcon` 16px 미만 선만:** 서버 렌더(`react-dom/server`의 `renderToStaticMarkup`)로 `size=15`는 채움 그룹 없음·`size=16`은 있음. (현 시험들은 소스 정규식 중심이라, 렌더 시험을 하나 도입하는 비용이 있다 — 정리드가 어려우면 상수 `DUO_FILL_MIN_SIZE`가 16임을 소스 매치로 대체.)
6. **데스크톱 경계:** 아이콘 컴포넌트가 `layout/`을 import하지 않음(어디서나 쓰이는 부품이므로).

### 3-8. 위험
| 위험 | 대응 |
|---|---|
| 사전 이모지를 빼면서 JSX에서 아이콘을 붙이지 않아 **아이콘이 사라진 채** 문구만 남음 | 사전 이동과 JSX 추가를 **같은 커밋 단위(키 단위)**로, 시험 2가 이모지 잔존은 잡지만 "붙임 누락"은 못 잡으므로 `emoji-inventory.md` 체크리스트를 대조 |
| 같은 키를 화면·OS 알림이 공유 | §3-4 ② 호출처 grep 선행 |
| 채움 어긋남이 `overflow` 컨테이너에서 잘림 | `overflow: visible` 지정(시안도 사용) |
| 번들 크기 | 20종×평균 4파트 ≈ 수 KB, 무시 가능 |
| 아이콘만 있는 버튼의 접근성 상실 | `aria-label` 필수화(§3-2) |

---

## 4. 파일 충돌·순서 메모 (정리드 단독 구현용)
`StaffPanel.tsx`·`HireDialog.tsx`는 세 작업이 모두 건드린다.
- 1단계 페이블: StaffPanel(`MODELS`·`CLAUDE_MODEL_NAME`·`<option>`), HireDialog(카드).
- 2단계 아이콘: StaffPanel 6줄·HireDialog 2줄의 이모지만 → 1단계가 끝난 코드 위에서 줄 번호가 달라지므로 **줄 번호가 아닌 키워드로** 대조.
- 3단계 분할: StaffPanel **추출 리팩터가 가장 큰 변경**이므로 앞 두 단계 커밋이 정리된 뒤 별도 커밋. 추출 전후 데스크톱·400폭 캡처 동일 확인이 선행 조건.
- 각 단계 끝에서 `pnpm test`와 `pnpm typecheck`를 돌려 다음 단계로 넘어간다.

## 5. 정리드가 선택할 쟁점 (추천 포함)
1. **직원 패널 분할 구조**: (추천) 덩어리 추출 후 분할용 트리 새로 구성 — 기존 경로 무변경·로직 한 벌, 단 추출 리팩터 위험 / (대안 B′) `split:` 클래스만으로 재배치 — 변경 작지만 클래스 상호작용 추적이 어려움. 위험을 최소로 하려면 B′ 먼저 시도하고 미니 뷰 120px만 안 맞으면 추출로 전환도 가능.
2. **✨ 비서 버튼·`RemoteLine`** 분할에서 유지(추천) — 시안엔 없지만 진입점 소실 방지.
3. **직원 드롭다운 점**: 문자 `●●●○○`(추천, 네이티브 선택기 유지) vs 커스텀 리스트박스(시안 일치).
4. **채팅 앞머리 이모지**: 표시 시점 치환(추천, 저장 무변경) — 사용자가 입력한 `✅`도 아이콘화되는 점 수용 여부.
5. **검색 상태**: store에 신호 카운터만(추천) vs 상태 전체 이동.
6. **카드 컴포넌트 위치**: `features/ModelCards.tsx`(추천, 일반화 금지) vs `components/ui` 범용화.

## 6. 확인하지 못한 것 (구현 전 확인 필요)
- Tailwind `@custom-variant`가 기존 변형과 섞일 때의 우선순위는 624×986 캡처로 확인(이 안은 `split:` 클래스를 **추가만** 하고 기존 클래스를 지우지 않아 영향이 작지만 확인은 필요).
- `HireDialog`·`StaffPanel`의 정확한 JSX 구조(1155줄)는 분할 대상 범위만 읽었다. 추출 단위(`ApprovalsSection` 등)의 실제 경계는 구현 시 확정.
- 사전 키 중 화면·OS 알림 공유 여부, 앱 테마 CSS의 `--ring` 정의 위치, `Dialog`를 `PopMenu` 재사용으로 쓸 때의 시트 모양은 구현 때 확인.
- 페이블 실호출 가능 여부·사용량 점 개수는 대표 확인 대기(임시값 5·4·3·1).
