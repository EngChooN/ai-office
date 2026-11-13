# v1.3.2 구현 설계안 — 최가독 (가독성·단순함·기존 기능 재활용)

작성: 2026-11-13 · 코드는 고치지 않음 · 박패턴 안과 맞추지 않음
입력: `brief.md`, `chat-tabs.html`(C안), `staff-page.html`(A안 + 상황판 접는 칸)
기준 문서: CONTEXT.md(다국어·문서 규칙), 코드 직접 확인(아래 "확인한 사실")

## 0. 핵심 선택 3줄
1. **대화**: 탭 줄은 PC 틀(`App.tsx`)이 `NavTabs`에 "대화 묶음은 숨겨라"를 넘겨서 끈다(폰 틀은 그대로). 회의실 화면은 방 목록 칸 + 접힘 판정을 `ChatPage`에서 **작은 공용 틀(`ChatRoomsFrame`)로 꺼내** 두 화면이 같이 쓴다.
2. **직원 화면**: 카드·요약 문장·"지금 하는 일" 계산은 **순수 함수 파일 2개**(`staffNow.ts`, `roleInfo.ts`)로 빼 시험하고, 화면은 기존 `Dashboard`·`StaffCard`를 고쳐 쓴다. 상황판 3카드는 **그대로 두고 접는 칸에 담기만** 한다.
3. **공통**: 직원 추가 3단계는 `HireDialog` 안 `step` 상태 하나로 기존 입력칸을 3묶음으로 나눈다(새 창 없음). 용어 17개·직무 11개는 **기존 키는 값만 고치고**, 새 문구만 새 사전 파일 `dict/staffPage.ts`에 둔다.

## 1. 요구사항 해석 + 확인한 사실 (설계에 영향 있는 것)

| 확인한 사실 (코드) | 설계에 미치는 영향 |
|---|---|
| `App.tsx`(PC)와 `PhoneShell.tsx`(폰)가 둘 다 `<NavTabs />`를 그림. 폰 쪽은 이미 분할·세로 대화에서만 탭 줄을 뺌 | 탭 숨김을 `NavTabs` 안 CSS/훅으로 하지 말고 **PC 틀에서 prop으로**. `scripts/mobile.test.mts`가 "feature 화면은 `useLayout`을 안 쓴다"를 지키므로 분기는 틀에만 |
| `ChatSide`·`ChatRoomRail`에 ↑↓ 키 처리가 **없음** (grep 결과 없음) | 브리프의 "↑↓ 키 이동이 회의실까지"는 *기존 동작 확장이 아니라 새 기능*. 같이 만든다(작음) |
| 회의실 배지 = `nav.ts`의 `useNavBadges().meeting` = `pendingMeetingDecisions(meetings).length` | 방 목록에는 이 계산만 가져다 쓰는 작은 훅 추가(`useNavBadges`는 8개 값을 한꺼번에 구독해 목록에 쓰기엔 무거움) |
| `Dashboard`가 `attentionItems(staff, new Map())`로 **직원별 예산 없이** 부름. 직원 장비 `monthlyBudgetUsd`는 `EquipmentTab`이 늘 0으로 저장. CONTEXT: "앱 토큰 한도·월 예산 없앰" | "예산 넘을 때만 '오늘 많이 씀'"은 **판단할 데이터가 없음** → §7 "시안과 다르게" |
| 지시창 글(`draft`)은 `StaffPanel.PanelBody`의 지역 `useState` | "예시를 누르면 지시창에 채움"은 밖에서 넣을 통로가 필요 → 스토어에 한 칸(전례: `meetingPreset`, `searchRequest`) |
| `staff.activity`는 main이 `"Edit src/…"`처럼 **도구 이름 + 요약**으로 채움(`hired.ts:419`). `staff.progress.text`는 지시 요약(`doingOf`가 이미 씀) | "도구 이름 → 쉬운 말"은 renderer에서 첫 단어만 읽어 바꾸면 됨(main 안 고침) |
| 오류 재시도 전용 API 없음(`officeApiShape`에 retry 없음). 인터넷 끊김(`netWait`)은 자동 재개 | '다시 시도' 버튼은 새 API 없이 **패널을 열고 지시창에 "멈춘 일 이어서 다시 해 줘" 채우기**로(§7) |
| `Staff.systemPrompt`가 있고 `updateStaff(…, {systemPrompt})`가 PC·원격 v2 모두 허용 | '소개'에서 업무 지침 보이기·고치기는 **새 API 없이 가능** |
| `EngineSelect`가 있어 고용 뒤에도 프로필에서 AI(엔진)를 바꿀 수 있음(일하는 중엔 막음) | `hire.provider.locked` 문구가 사실과 다름 → 고칠 문구 확정(§4-3) |
| 작업본에 v1.3.1 미커밋 변경이 많음(`ChatPage`·`ChatSide`·`ChatRoomRail`·`chatRoomHooks` 등) | 같은 파일을 또 고치므로 **구현 시작 전 `git status` 확인**, 1.3.1 변경 위에 얹기만 하고 되돌리지 않음 |

## 2. 기능 A. 대화 — 탭 줄 없애고 방 목록으로 합치기

### 2-1. 변경 요지 (파일별)

| 파일 | 변경 |
|---|---|
| `renderer/features/navGroups.ts` | 순수 함수 `visibleTabRow(group, view, hiddenGroups)` 한 개 추가(숨길 묶음이면 빈 배열). NavTabs·시험이 같이 씀 |
| `renderer/features/NavTabs.tsx` | prop `hiddenGroups?: NavGroupId[]` 추가, 위 함수로 걸러서 `tabs.length < 2`면 그리지 않는 기존 줄 재사용. 폰은 prop을 안 넘기므로 그대로 |
| `renderer/App.tsx` | `<NavTabs hiddenGroups={['talk']} />` 한 줄 |
| `renderer/features/chatRoomHooks.ts` | ① `usePendingDecisions()` 추가(`pendingMeetingDecisions(meetings).length`, `nav.ts`도 이걸 쓰게 해 중복 제거) ② `useRoomEntries`에 `isOff`(회의실 화면이라 방이 하나도 활성 아님) 인자, 방 `select()`가 `view`가 `chat`이 아니면 `setView('chat')`까지 |
| `renderer/features/ChatSide.tsx` | 회의실 줄에 ① 활성 표시(`aria-current`, 방 줄과 같은 `bg-accent`) ② 노란 숫자 배지(`bg-status-waiting`, 탭 줄 배지와 같은 색) ③ `data-tour="nav-meeting"` ④ 목록 전체 `onKeyDown`: ↑↓로 방 줄·회의실 줄 사이 이동(roving, 방 줄 `button` 목록을 DOM에서 찾아 포커스) |
| `renderer/features/ChatRoomRail.tsx` | 56px 띠 맨 아래 회의실 아이콘에 활성 표시 + 같은 노란 배지(아이콘 오른쪽 위, 안 읽음 빨간 배지와 자리 겹치지 않게 **오른쪽 아래**), 말풍선(`RailTip`)에도 "결정 N개 기다려요" |
| **새** `renderer/features/ChatRoomsFrame.tsx` | `ChatPage`의 "방 목록 + 대화" 행(§2-2)을 꺼낸 틀: 폭 측정(`ResizeObserver`)·`useRoomListPref`·`roomListMode`·목록/띠 고르기. 자식으로 오른쪽 내용을 받음 |
| `renderer/features/ChatPage.tsx` | 행 부분을 `<ChatRoomsFrame room=…>`로 교체(동작 그대로). `useRoomListPref`·`ROOM_LIST_KEY`는 새 파일로 옮김. **머리·메시지·입력창은 안 건드림** |
| `renderer/features/MeetingPage.tsx` | 최상위를 `<ChatRoomsFrame isMeeting>` 안에 넣기(데스크톱만, 아래 2-3). 화면 내용은 그대로 |
| `shared/i18n/dict/*` | 새 글자 2~3개(회의실 배지 읽기용 `aria-label`, 띠 말풍선 문구, 목록 안내). 기존 키 변경 없음 |

### 2-2. 구성과 데이터 흐름

- **방 목록 한 벌 유지**: 목록(`ChatSide`)·띠(`ChatRoomRail`)·가로 탭은 이미 `useRoomEntries` 하나를 씀. 회의실을 "방이 아닌 마지막 줄"로 두고 활성·배지 규칙만 추가 → 새 목록을 만들지 않음.
- **틀 분리가 필요한 이유**: 회의실 화면에 방 목록을 달려면 접힘 판정(폭 840/856, 저장된 선호, 직접 접음)이 똑같아야 함. `ChatPage` 안에 있으면 `MeetingPage`가 복사하게 되므로 **옮기기만** 하고 새 규칙은 안 만듦(`shared/chatRoomLayout.ts`의 `roomListMode`·`RoomListPref` 재사용).
- **회의실에 있을 때 선택 표시**: `ChatRoomsFrame`이 `isMeeting`이면 `ChatSide`에 `isMeetingActive`를 넘기고, 방 줄은 모두 비활성. '전체 방' 등을 누르면 `setChatRoom` + `setView('chat')` → 단체방으로 돌아옴(탭이 하던 일 ①).
- **왼쪽 메뉴 '대화' = 마지막 본 곳**: `groupEntryView`/`rememberTab`이 이미 함 → **코드 변경 없음**, 시험으로만 고정(§5).
- **↑↓ 이동**: `ChatSide`의 `aside`에 키 처리 하나. 방 줄·회의실 줄에 같은 표식(`data-room-item`)을 붙이고 `querySelectorAll`로 순서를 얻어 다음/이전에 `focus()`. 배열 계산은 순수 함수 `nextIndex(i, key, len)`(맨 끝에서 멈춤, 순환 안 함)로 빼 시험. 띠(`ChatRoomRail`)에도 같은 함수 재사용.

### 2-3. 폰·원격 미리보기 영향 (좁힘)

- `PhoneShell`은 `NavTabs`를 prop 없이 그리므로 **탭 줄 그대로**. 가로 짧은 폰의 `RoomTabs`(방 칩)도 그대로.
- `MeetingPage`가 폰에서도 `ChatRoomsFrame`을 쓰면 폰 화면이 바뀜 → 틀 안에서 **`phone:hidden`으로 목록 칸만 숨김**(`ChatPage`가 이미 `phone:hidden`을 쓰는 방식 그대로, `useLayout` 안 씀). 분할(`side:`)은 `ChatPage`가 `ChatSide`를 `side:flex hidden`으로 따로 두므로, 회의실은 분할에서 목록을 안 보이게 두는 쪽이 현행 유지(분할은 `PhoneShell`이 탭도 없앴지만 회의실은 목록 안 가는 길이 이미 `ChatSlimBar`/`ChatSide`의 회의실 줄뿐이라 변화 없음).
- 원격 화면(IS_REMOTE_SCREEN, 다른 PC 창)은 PC 틀이라 같은 결과.

## 3. 기능 B. 직원 화면 A안

### 3-1. 변경 요지 (파일별)

| 파일 | 변경 |
|---|---|
| `renderer/features/Dashboard.tsx` | 순서 재배열: ① 요약 한 문장 + `＋ 직원 추가` ② 필터·검색·팀별/랩별·카드/목록 보기 ③ 직원 카드 ④ **접는 칸**(`<section>` 제목 버튼, `useState(false)`)에 기존 `AttentionCard`·`UsageCard`·`ActivityFeed` 3칸을 그대로 넣음. 빈 직원 안내·필터 해제는 그대로 |
| `renderer/features/DashboardPanels.tsx` | `SummaryRow`·`Tile`(숫자 칸 6개)을 **삭제**하고, 새 `StaffSummary`(문장)로 대체. 다른 파일이 안 씀(grep 확인: `Dashboard.tsx`만 import). `UsageCard`·`ActivityFeed`·`AttentionCard`는 **수정 없음** |
| **새** `renderer/features/StaffSummary.tsx` | `countByStatus`(재사용) 결과를 한 문장으로, 굵은 부분은 `button`으로 `onFilter` 호출(지금 `Tile` 필터와 같은 값). 0명인 상태는 문장에서 뺌 |
| `renderer/features/StaffCard.tsx` | `StaffCard`만 개편(같은 파일의 `Avatar`·`StatusDot`·`Elapsed`·`LeadMark`·`UnreadBadge`·`PracticeBadge`는 **다른 15개 파일이 쓰므로 그대로**). 구조는 §3-2 |
| `renderer/features/StaffRow.tsx` | 목록 보기는 유지(브리프 범위 밖). 상태 이름만 사전 값 변경으로 따라감. 토큰·$가 있다면 같이 빼서 카드와 맞춤(확인 후) |
| **새** `shared/staffNow.ts` | 순수 함수 `staffNowLine(staff, task)` → `{ key, vars }` (§3-3) |
| **새** `shared/roleInfo.ts` | 직무 11개 → 설명 키·예시 키 3개. `roleLabel.ts`의 `ROLE_KEY` 방식을 그대로 따라 함수 `roleBlurb(role)`·`roleExamples(role)` (직접 입력 직무는 '자유 직무'용 일반 예시로) |
| `renderer/store.ts` | `panelDraft: { staffId: string; text: string; nonce: number } \| null`과 `setPanelDraft` 추가 (전례 `meetingPreset`) |
| `renderer/features/StaffPanel.tsx` | `PanelBody`에 effect 하나: 이 직원 것이면 `setDraft(text)`·입력칸 `focus()`·`setPanelDraft(null)` (§3-4 패널 변경 포함) |
| `renderer/features/OrgPage.tsx` | 탭 이름만 사전으로 바뀜 (코드 변경 없음). 직원 카드 버튼이 '직원 추가'가 되는 문구는 §4 |
| `shared/i18n/dict/featuresB.ts` | `nav.dashboard`→"직원 목록", `nav.org`→"팀 구성" 값 수정 |

### 3-2. 카드 구조 (재활용 위주)

- 머리: 기존 `Avatar`+이름+`LeadMark`+`PracticeBadge`+`RemoteBadge`+`UnreadBadge`+`AutonomyBadge` 줄 그대로, 아래줄에 `roleLabel(role)` + 팀 꼬리표(팀 이름은 `teams`에서 찾음; 시안의 팀 색 칩은 `Avatar`의 `InitialAvatar`가 이미 쓰는 `color-mix` 방식 재사용). 상태: `StatusDot`+`Elapsed` 재사용.
- 지금 하는 일: `staffNowLine`의 결과를 `t()`로 한 줄(2줄 말줄임).
- 시킬 수 있는 일: `roleExamples(role)` 3개 칩. 누르면 `select(staff.id)` + `setPanelDraft({ staffId, text, nonce })`.
- 버튼 1개 강조: 상태 → `waiting`=노랑 '확인하기'(패널 열기: 패널 맨 위 결재 칸이 이미 보임), `error`=빨강 '다시 시도'(패널 열고 이어서 하라는 글 채움), 그 밖=`Button` 기본 '일 시키기'(패널 열고 입력창 포커스). 보조 '일 시키기'·'자세히 ›'는 `variant="outline"`/글자 버튼. 색은 `bg-status-waiting`/`bg-status-error`/`bg-primary` — 새 색 없음.
- **카드 바깥을 `<button>`에서 `<div>`로**: 안에 버튼이 여러 개라 중첩 불가. 카드 클릭은 `onClick`(마우스용)으로 패널을 열되, 안쪽 버튼은 `stopPropagation`, 키보드는 '자세히 ›' 버튼이 담당. 상태색 테두리(`CARD_TONE`)·작업 중 맥박 링은 그대로.
- 빼는 것: `LiveMiniView`(사무실 미니 화면), 하단 `Lv·토큰·$` 줄, 업무 모드 '오늘 완료' 글. 다른 쪽 `LiveMiniView` 사용처(사무실 지도·패널)는 그대로.
- 마지막 칸 `＋ 직원 추가`: 같은 격자의 점선 카드(`setHireOpen(true)`). 직원이 0명일 때는 기존 빈 안내를 유지(중복해서 두 개 안 나오게 `hasHired`일 때만 마지막 칸).
- 외부 직원(`kind==='external'`)·원격 직원: 시킬 수 없는 줄이므로 예시·버튼은 숨기고 '자세히 ›'만(지금 카드도 외부는 단순 줄). 문구는 용어표 "다른 창에서 일하는 직원 (보기만)".

### 3-3. 데이터 출처 — "지금 하는 일" 문장 (`shared/staffNow.ts`)

우선순위(앞에서부터 맞는 첫 것):

| 상태 | 문장 | 어디서 가져옴 |
|---|---|---|
| `waiting` + 질문 결재 | 질문 한 줄 인용 | `staff.approvals[0].questions?.[0]` |
| `waiting` + 도구 결재 | "○○ 해도 되는지 확인을 기다려요" | `approvalHeadline(approval)` (`shared/approvalEffect.ts`, 결재 카드 '효과 줄'이 이미 쉬운 말로 만든 값) |
| `error` | "문제가 생겨 멈췄어요" (+ 인터넷 끊김은 별도 문장) | `staff.status`, 인터넷 끊김은 `netWait` 상태 |
| `netWait` | "인터넷이 끊겨 기다려요. 연결되면 이어서 해요" | `staff.status` |
| `working` + 지시 있음 | 지시 요약 | `staff.progress.text`(`stripHead`) — `chatRoomHooks.doingOf`와 같은 규칙 |
| `working` + 지시 없음 | 맡은 보드 업무 제목 | `currentTask(tasks, id)` (`shared/dashboard.ts`, 카드가 이미 씀) |
| `working` + 그것도 없음 | 도구 이름을 쉬운 말로 | `staff.activity` 첫 단어: `Edit·Write·MultiEdit·NotebookEdit`→"파일 고치는 중", `Read·Glob·Grep`→"파일 읽는 중", `Bash`→"프로그램 실행 중", `Web*`→"인터넷 찾는 중", 그 밖→"작업 중" (용어표 행 12) |
| `idle` | "지금은 맡은 일이 없어요" (+ 맡은 카드 있으면 그 제목) | `currentTask` |
| `offline` | "퇴근했어요" | `status` |

- 반환 형식은 `{ key, vars }`(문장을 저장하지 않고 화면에서 번역 — CONTEXT의 "번역은 읽을 때" 규칙). 사용자 글(지시·업무 제목)은 `vars`로만 넣고 번역하지 않음.
- 한 함수·한 표로 끝내서 읽는 사람이 "상태 → 문장"을 한 곳에서 봄. 시험으로 우선순위 고정(§5).

### 3-4. 공통 변경에 걸린 파일 (패널·직원 추가)

**패널 머리** (`StaffPanel.tsx`, 탭 이름은 사전 값 `staffPanel.tab.*`)
- 모델 이름(`modelLabel` 표시) 머리에서 제거 → 프로필의 'AI 등급'에만. `ModelSelect`는 프로필에 이미 있으므로 이동이 아니라 **머리에서 삭제**(확인: 머리 줄 정확한 위치는 구현 때).
- 폴더: `WorkDir`(1107행)의 표시를 `일하는 곳: ${folderName(cwd)}`(`status.ts`의 `folderName` 재사용), 누르면 `shortPath`/전체 경로 `title`+작은 팝업. '지정 없음'은 기존 `workDirLabel` 재사용.
- '터미널에서 이어 하기': 머리 줄 버튼 → 이미 있는 ⋯ `PopMenu` 안 항목으로 이동(같은 핸들러·같은 오류 표시 재사용).
- 탭 라벨: `TAB_LABEL` 그대로 두고 사전 값만 → 대화·바뀐 파일·도구·소개. 탭 id(`work|review|equip|profile`)는 안 바꿈(저장값·투어가 쓰므로).
- '소개' 탭(`Profile`): 맨 위 '업무 지침' 카드 하나 추가 — `Staff.systemPrompt` 읽기/수정(`updateStaff(id,{systemPrompt})`), 직무 설명은 `roleBlurb`. 지금 `NameRole`의 이름·직무 입력과 같은 저장 방식 재사용(`NameRole`이 쓰는 폼 패턴 복사하지 않고 같은 `Input`/버튼 컴포넌트 사용). 외부 직원은 지침이 없으므로 숨김.

**직원 추가 3단계** (`HireDialog.tsx`, 새 파일 없음)
- `useState<1|2|3>(1)`의 `step` 하나. 지금 `emptyForm`·`update`·`isValid`·역할 칩·`MoreToggle` 등 JSX를 **3개 블록으로 나눠 조건 표시**만 함:
  1. 직무 고르기: 기존 직무 칩 11개 → 카드(이름 + `roleBlurb`), '직접 입력'·`직원 설정 파일 불러오기`·마켓 버튼도 여기
  2. 이름·얼굴: 이름 `Input`, 얼굴은 기존 `AvatarEditor`(직무 선택 때 `roleLook`으로 자동 추천은 지금 로직 그대로)
  3. 일할 곳: 폴더 선택(기존 `handlePickFolder`), '자세히 설정'(`MoreToggle` 안: 팀·랩·AI·성능 등급·결재 방식·지침)은 3단계에 접음
- 마지막 버튼 '일 시작하기'(키 `hire.submit` 값만). 다음·이전은 새 키 2개.
- 상태 초기화 `useEffect`에 `setStep(1)` 한 줄. `isValid`는 그대로 쓰되 1단계는 `form.role.trim()`, 2단계는 `form.name.trim()`일 때 '다음' 활성.
- `hire.provider.locked` 문구: "고용한 뒤에는 AI를 바꿀 수 없어요" → "AI는 '소개'에서 나중에 바꿀 수 있어요(일하는 중에는 바꿀 수 없어요)"로 값 수정(4개 언어). 위치도 AI 선택 칸 옆 그대로.

**'직원 고용' → '직원 추가'**: 사전 값 변경으로 대부분 해결(§4). 코드에 하드코딩된 '고용'은 없어야 하므로 구현 때 `grep -rn "고용"`으로 `renderer`·`main`을 확인(이미 확인 결과: 한국어 문구는 모두 사전 안).

## 4. 쉬운 말 표 17개 · 직무 11개 — 사전 처리 (4개 언어)

원칙: **키 이름은 바꾸지 않고 값만 고친다**(기존 코드·시험·번역 대조가 그대로 유지). 새 문구만 새 파일에 둔다.

| 구분 | 방법 |
|---|---|
| 용어 17행 중 키가 있는 것 | 값만 수정: `nav.dashboard`·`nav.org`·`shell.hire`·`dashboard.hireStaff`·`hire.title`·`coachTour.hire.title`·`status.working/waiting/idle/netWait/error`·`staffPanel.tab.*`·`staffPanel.resume.button`(⋯ 안) 등. 같은 말이 흩어진 곳(`guideHint`·`settings`·`featuresA`의 '고용' 약 40곳)은 **의미가 '직원 추가'로 바뀌는 안내 문구만** 고침(과거 기록·로그 문구는 그대로) |
| 키가 없는 새 문구 | 새 `shared/i18n/dict/staffPage.ts` (`connect.ts` 선례): 요약 문장 조각, 지금 하는 일 문장 약 12개, 직무 11개 설명 + 예시 33개, 직원 추가 3단계 제목·버튼, '일하는 곳', 업무 지침 카드 |
| 직무 11개 | 키 `role.<id>.desc`, `role.<id>.ex1..3` (id는 `roleLabel.ts`의 `ROLE_KEY`와 같은 11개). 저장값(한국어 직무 이름)은 안 바꿈 |
| 용어표 "토큰·$ → (카드에서 뺌)", "Opus·Sonnet → AI 등급" | 화면에서 지우는 것이므로 사전 변경 없음. AI 등급 ●●●●○ 는 프로필의 기존 `ModelSelect`/`modelOptions.ts`의 등급 표시를 재사용(새 계산 만들지 않음) |
| 영어·일본어·중국어 | 시안은 한국어만 있음 → **번역은 구현 담당이 작성**하되 `i18n.test`가 빠짐·`{변수}` 불일치를 잡음. 일본어·중국어는 사람 검수 필요(확인 필요로 표시) |
| 문서 | CONTEXT 규칙: 버전을 올리면 `CHANGELOG` 4개 + `SPEC.md` 갱신(비개발자 문장). **커밋·버전 올리기는 이번 범위 아님**(정리드 판단) |

## 5. 검증 방법

**추가·수정 시험** (`pnpm test`, 순수 함수 위주)
- `navGroups.test.mts`: `visibleTabRow('talk', hidden=['talk'])`는 빈 배열, 다른 묶음·hidden 없음은 그대로; 폰 틀 prop 없음 = 기존. `groupEntryView`가 회의실을 마지막으로 보면 '대화'가 회의실을 연다(탭이 안 보여도 유지됨).
- 새 `scripts/staffNow.test.mts`: 상태 9개×우선순위(결재 질문>도구 결재>오류>netWait>지시>업무>도구 이름>없음), 도구 첫 단어 매핑(모르는 도구는 "작업 중"), 사용자 글이 `vars`로만 들어가는지.
- 새 `scripts/roleInfo.test.mts`: 프리셋 11개 모두 설명·예시 3개 키가 있고 사전에 있음, 직접 입력 직무는 일반 예시.
- `chatRoomLayout.test.mts`(1.3.1 파일)에 `nextIndex` 경계(맨 위·맨 아래·1칸) 추가. 위치는 `shared/chatRoomLayout.ts`에 둠(같은 종류의 순수 계산).
- `dashboard.test.mts`: 요약 문장에 쓸 인원 계산은 기존 `countByStatus` 그대로라 변경 없음(0명 상태 생략은 `StaffSummary`의 얇은 조립).
- `i18n.test.mts`: 새 키 4개 언어·중복 키 없음(`featuresB`·`shell` 값 수정은 키 이름 불변이라 통과해야 함).
- `mobile.test.mts`: 폰 틀이 `NavTabs`를 prop 없이 그리는지(소스 문자열 확인 방식 전례가 있으면 그에 맞춤), feature에 `useLayout` 안 쓰는 규칙 유지.
- 확인 못 함: 위 시험 파일 이름·`mobile.test.mts`의 정확한 확인 방식은 구현 때 열어 본 뒤 맞춤.

**자동 확인**: `tsc --noEmit`(`pnpm typecheck`), `pnpm test` 전체.

**화면 확인 포인트** (라이트·다크 × 1400/1100/900)
- 대화: 탭 줄이 없다 / 다른 묶음(직원·업무·노하우 등) 탭 줄은 그대로 / 회의실에서 방 목록이 보이고 회의실 줄이 선택됨 / 900에서 띠(56px)로 접히고 회의실 아이콘에 노란 배지 / '전체 방' 클릭→단체방 / ↑↓가 회의실까지 / 왼쪽 메뉴 '대화'가 마지막 본 곳 / 결정 대기 숫자(방 안 읽음 빨강과 구분).
- 직원: 탭 이름 / 요약 문장 굵은 부분 필터 / 급한 순 정렬 / 카드 4상태(확인 기다림·문제·일하는 중·쉬는 중) 높이 고정 / 예시 칩→지시창 채움 / '확인하기'·'다시 시도'·'일 시키기' / '＋ 직원 추가' 칸 / 접는 칸 기본 접힘·열면 3카드 / 직원 0명·1명·10명 이상 / 업무 모드(이니셜 원)와 게임 모드 / 외부·원격 직원 카드.
- 공통: 직원 추가 3단계(뒤로 갔다 와도 입력 유지, 직무 11개 설명, '자세히 설정'이 3단계), 패널 머리(모델·경로 사라짐, 폴더 이름→전체 경로, ⋯ 안 '터미널에서 이어 하기'), 소개 탭 업무 지침 수정이 저장되고 다음 일에 반영됨(확인 필요: 일하는 중 지침을 바꿔도 되는지 → 실행 중 세션엔 다음 일부터 적용될 가능성, 구현 때 확인).
- 폰·원격 미리보기: 폰 틀 탭 줄·`RoomTabs` 그대로, 폰 직원 목록 카드(`phone:` 폭에서 카드 3열이 깨지지 않는지, 시킬 수 있는 일 칩이 줄바꿈), 분할·세로 폰 대화 회귀.

## 6. 구현 순서 (작게 나눔, 단계마다 `tsc`+`test`)

1. **준비**: `git status`로 1.3.1 미커밋 변경 목록 확인(되돌리지 않음), 새 사전 파일 `staffPage.ts` 골격 + `dict/index.ts`에 한 줄.
2. **순수 함수 먼저**: `staffNow.ts`·`roleInfo.ts`·`nextIndex`·`visibleTabRow` + 시험. (화면 없이 끝남)
3. **용어·사전 값 수정**: 용어 17개·'직원 추가'·직무 문구 4개 언어(`i18n.test` 통과). 이 단계만으로 전체 앱 이름이 바뀜 → 가장 눈에 띄고 위험이 작음.
4. **대화 1/2 — 리팩터**: `ChatRoomsFrame` 추출(`ChatPage` 동작 그대로, 화면 변화 없음) + `useRoomEntries`/`usePendingDecisions` 정리. 여기서 한 번 확인(1.3.1 접힘 규칙 회귀 없음).
5. **대화 2/2 — 새 동작**: `NavTabs`/`App` 숨김, `MeetingPage`를 틀 안에, `ChatSide`·`Rail` 회의실 활성·배지·↑↓.
6. **직원 화면**: `store.panelDraft` + `PanelBody` 효과 → `StaffSummary`·`Dashboard` 재배열·접는 칸 → `StaffCard` 개편.
7. **패널·직원 추가**: 패널 머리·소개 탭 지침 → `HireDialog` 3단계.
8. **마무리**: 화면 확인(§5), `CHANGELOG`·`SPEC` 문구는 정리드 판단. 커밋·푸시·배포 없음.

각 단계는 서로 독립이라 3~5(대화)와 6~7(직원)은 병행 가능. 겹치는 파일은 사전(`featuresB.ts` 등)뿐이므로 값 수정(3단계)을 먼저 끝낸 뒤 나눠야 충돌이 없음.

## 7. 시안과 다르게 할 수밖에 없는 곳

| 시안 | 내 안 | 이유 |
|---|---|---|
| 카드 '오늘 많이 씀' 꼬리표(예산 넘을 때) | **만들지 않음.** 대신 상황판의 기존 "플랜 사용률 80%↑ 확인 필요"가 그 역할 | 직원별 예산이 없음(위 §1). 새 기준(예: 하루 토큰 N 이상)을 만들면 근거 없는 숫자를 임의로 정하는 일이고, 직원별 오늘 사용량은 카드마다 비동기로 읽어야 해(`useStaffRecord`) 무거움. 대표가 원하면 별도 결정으로 |
| '다시 시도'가 바로 다시 시도 | 패널 열고 지시창에 "멈춘 일 이어서 다시 해 줘"를 채움(보내기는 대표가) | 오류 재시도 API 없음. 새 API는 main·원격 허용 목록·폰까지 번지는 큰 변경. 인터넷 끊김은 이미 자동으로 이어짐 |
| 카드 한 장이 통째로 눌림 | 카드 바탕 클릭은 유지하되 '자세히 ›'가 키보드용 정식 입구 | 카드 안에 버튼이 여러 개라 바깥을 버튼으로 둘 수 없음 |
| 상황판 3카드를 접는 칸 안에서 "확인 필요·쓴 토큰·최근 활동"으로 재정리 | 기존 3카드 **그대로** 담음 | 이미 한 번 정리된 컴포넌트라 모양 바꾸면 회귀 위험만 큼. 접는 칸 제목에 확인 필요 건수를 붙여 닫혀 있어도 급한 일이 보이게(작은 숫자 하나) |
| 숫자 칸의 '오늘 완료 ↗'(업무 보드로 가기) | 요약 문장에는 넣지 않음 | 한 문장에 넣으면 길어짐. 업무 보드 메뉴·사이드 배지로 갈 수 있음. 필요하면 접는 칸 안 한 줄로 후속 |
| 회의실 화면에 방 목록 | **폰은 안 보임**(데스크톱만) | 브리프 "폰 영향 없음" 준수. 가로 폰은 탭 줄이 남아 있음 |

## 8. 위험·영향 범위 (요약)

- **가장 큰 위험**: `ChatPage` 행 추출(4단계). 1.3.1 미커밋 변경 위라 충돌·회귀 가능 → 4단계를 *동작 불변 리팩터*로 따로 확인.
- **영향 화면**: 대화(단체방·회의실), 직원 목록(카드), 직원 패널 머리·탭·소개, 직원 추가 창, 앱 전체 용어(상태 이름이 사무실·결재함·휴대폰 `STATUS_META`에 모두 반영됨). 직원 마켓(`StaffMarketDialog`)·첫 실행 마법사·튜토리얼의 '고용' 문구도 값이 바뀌므로 화면 확인에 포함.
- **휴대폰/원격**: `STATUS_META`·사전은 폰 앱(웹뷰)도 같이 쓰므로 용어는 폰에도 바뀜(의도). 안드로이드 네이티브 문자열(`strings.xml`)의 '고용'은 브리프 범위 밖 → 정리드 판단.
- **시험**: `i18n.test`가 값 수정에 반응하지 않도록 키 이름 불변. `navGroups.test`·`mobile.test` 영향 확인.
- **저장 데이터**: 변경 없음(직무 저장값 한국어 유지, `systemPrompt`는 기존 필드). `localStorage` 키 새로 없음.
- **확인 못 함 / 구현 때 확인**: 패널 머리의 모델 이름 줄 정확한 위치와 `ModelSelect` 재배치 방식, `StaffRow`의 토큰·$ 유무, 소개 탭 지침 수정이 일하는 중인 직원에 즉시 반영되는지, `useTourTarget`이 숨김 탭 대신 `nav-meeting`(방 목록 줄)·`nav-talk`(사이드바)을 찾는지.

## 9. 정리드에게 정해 달라고 할 것 (대표가 아니라 정리드 판단)
1. '오늘 많이 씀' 꼬리표: **빼는 안(추천)** vs 새 기준을 만들어 넣기.
2. '다시 시도': **지시창 채우기(추천)** vs 새 재시도 API.
3. 번역(en/ja/zh): 구현 담당이 쓰고 일본어·중국어는 검수 표시(추천) vs 한국어만 먼저.
