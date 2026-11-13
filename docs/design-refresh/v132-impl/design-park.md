# v1.3.2 구현 설계안 — 박패턴 (유지보수성·변경 영향 최소화·검증 가능성)

대상: 요청서 `brief.md`, 시안 `v132-chat-tabs`(C안) · `v132-staff-page`(A안 + 접는 상황판).
기준 작업본: v1.3.1 미커밋 변경(ChatPage·ChatSide·ChatRoomRail·chatRoomHooks·dict 일부) 위. 코드는 고치지 않았고, 최가독 안은 받지 않아 비교하지 않았습니다.
경로는 모두 `app/src/` 아래입니다.

## 0. 먼저 알려 둘 것 (코드를 읽고 알게 된 사실 4가지)

| # | 사실 | 설계에 주는 영향 |
|---|---|---|
| 1 | **직원별 예산이 지금 없습니다.** 직원 장비의 월 예산은 `EquipmentTab.tsx:124`에서 저장할 때마다 0으로 덮고, 대시보드 주석도 "앱이 정하던 예산·토큰 한도는 없앴다"입니다. 직원별 '오늘 쓴 양'도 화면 상태에 없습니다(`getRecord`로 한 명씩만 읽음). | 요청서의 카드 꼬리표 '오늘 많이 씀'은 **카드마다 판단할 근거가 없습니다**. §2-6에서 대안을 둡니다. |
| 2 | '지금 하는 일'의 원본 `staff.activity`는 main이 `Edit /경로…`처럼 **도구 이름 + 요약을 그대로 저장**하고, 답변 글이나 오류 문구가 들어올 때도 있습니다(`main/hired.ts:421·503·201`). | 쉬운 말 바꾸기는 **화면 쪽에서** 해야 합니다. main을 고치면 휴대폰·원격 화면과 저장 기록이 같이 바뀝니다. |
| 3 | 업무 지침(`systemPrompt`)을 `updateStaff`로 고치면 main이 **그 직원 세션을 다시 시작**합니다(`main/office.ts:1066`). | '소개'에서 지침을 고치게 하려면 **일하는 중에는 막고** 안내해야 합니다(엔진 변경이 이미 같은 방식). |
| 4 | 지금 직원 카드는 카드 전체가 `<button>`입니다(`StaffCard.tsx`). 새 카드에는 안에 버튼(예시 3개·주 버튼·자세히)이 들어갑니다. | 버튼 안에 버튼은 잘못된 HTML이라 **카드 바깥 틀을 `div`로 바꿔야** 합니다. |

그 밖에: '다시 시도' 버튼에 해당하는 기존 동작은 코드에 없습니다(§2-5). 직무에 맞춘 **이름 자동 추천**도 기존 코드에 없습니다(얼굴은 `roleLook`으로 이미 추천).

---

## 1. 기능 1 — 대화 탭 합치기 (C안)

### 1-1. 요구 해석
- 데스크톱 앱(PC 창)에서 '대화' 묶음(단체방·회의실)일 때만 위쪽 탭 줄을 없앤다. 다른 묶음은 그대로.
- 회의실 화면에도 단체방과 **같은 방 목록(접으면 56px 띠)** 을 왼쪽에 둔다. 회의실 줄이 '선택됨'이고, 방 줄을 누르면 단체방으로 돌아온다.
- 회의실 줄·띠 회의실 아이콘에 결정 대기 숫자(노란색 = 지금 탭 배지 색 `bg-status-waiting`).
- 폰 화면(`PhoneShell`)은 건드리지 않는다. 사이드바 '대화'는 마지막 본 곳 그대로 → **`navGroups.ts`의 기억 로직은 안 고친다**.

### 1-2. 핵심 선택과 이유

**선택 A. '왼쪽 방 목록 + 폭 재기 + 접힘'을 한 덩어리로 꺼내 단체방·회의실이 같이 쓴다.**
- 지금 이 코드는 `ChatPage.tsx`(약 99~130줄·166~184줄 + `useRoomListPref`)에 들어 있습니다. 회의실에 복사하면 접힘 기준(840/856)·저장 키·핀 동작이 두 곳에서 어긋날 수 있습니다.
- 새 파일 `renderer/features/RoomListColumn.tsx` 하나에 둡니다.
  - 훅 `useRoomListLayout()` → `{ rowRef, rowWidth, mode, pref, setPref }` (기존 코드 그대로 이동)
  - 컴포넌트 `<RoomListColumn room layout footer />` → 지금 ChatPage의 `listMode === 'list' ? <ChatSide…/> : <ChatRoomRail…/>` 분기 그대로.
- 이득: v1.3.1에서 시험으로 고정한 `roomListMode`를 회의실도 그대로 씀, 고정/접음 설정 키(`office:chatRoomList`)가 한 곳. 추가 복잡도: 파일 1개, ChatPage에서 약 40줄이 빠짐(줄어드는 쪽).
- 하지 않는 것: 머리·검색·`RoomStatusStrip`은 ChatPage에 그대로 둠(단체방에만 있음).

**선택 B. '지금 보는 방인가' 판단을 `useRoomEntries` 안에서 화면 종류까지 포함해 한다.**
- 지금 `isActive = (current ?? null) === room`이라 회의실 화면에서 '전체 방'이 선택됨으로 보입니다. 회의실에서는 어떤 방도 선택되면 안 됩니다.
- 훅 안에서 `const view = useOffice(s => s.view)`를 읽어 `isActive = view === 'chat' && …`로 바꿉니다. 호출하는 쪽(ChatSide·Rail·RoomTabs)은 **속성을 하나도 안 바꿉니다**.
- `entry.select`는 `setChatRoom(room)` → **`openChatRoom(room)`** 으로 바꿉니다(store에 이미 있고 `chatRoom`+`view:'chat'`을 같이 바꿈). 단체방 안에서는 결과가 같고, 회의실에서는 '방을 누르면 단체방으로' 가 이 한 줄로 끝납니다.

**선택 C. 회의실 줄도 `RoomEntry`처럼 훅 하나로: `useMeetingEntry()`.**
- `chatRoomHooks.ts`에 `{ isActive: view === 'meeting', pending, select }`를 돌려주는 훅을 추가하고, ChatSide의 맨 아래 회의실 버튼과 Rail의 회의실 아이콘이 같이 씁니다. 지금은 둘 다 `setView('meeting')`을 따로 적어 두었습니다.
- 숫자는 `nav.ts`의 `useNavBadges` 안에 묶여 있는 `pendingMeetingDecisions(meetings).length`를 **작은 훅 `usePendingMeetingDecisions()`로 빼서** 탭 배지(폰 탭 줄이 계속 씀)와 방 목록이 한 출처를 쓰게 합니다. `useNavBadges`는 이 훅을 부르도록만 바꿉니다(결과 동일).
- 이유: 배지를 목록 쪽에 새로 계산하면 폰의 탭 숫자와 PC 방 목록 숫자가 어긋날 수 있습니다.

**선택 D. 탭 줄 숨김은 '순수 함수 한 개'로 정한다.**
- `navGroups.ts`에 `showsTabRow(groupId, shell: 'desktop' | 'phone')`를 추가(대화 묶음 + desktop이면 false). `App.tsx`의 `<NavTabs />` 앞에서만 부릅니다. **`PhoneShell`·`NavTabs.tsx` 본체는 안 고칩니다** → 폰·원격 미리보기 영향 0.
- 이유: 숨김 규칙을 `NavTabs` 안에 `if`로 넣으면 폰 쪽도 같이 바뀔 위험이 있고, 시험도 못 합니다. 순수 함수면 `navGroups.test.mts`에 한 줄로 고정됩니다.

**선택 E. 방 목록 ↑↓ 키 이동은 '이동 위치 계산'만 순수 함수로, 나머지는 얇은 훅.**
- 지금 방 목록에는 ↑↓ 처리가 **없습니다**(확인함). 새 기능입니다.
- `shared/chatRoomLayout.ts`에 `nextFocusIndex(index, length, key)`(끝에서 멈춤인지 순환인지 포함)를 두고 시험. `chatRoomHooks.ts`에 `useArrowNav(ref)`: 컨테이너 `onKeyDown`에서 `[data-room-item]` 버튼들을 찾아 위 함수가 준 칸으로 `focus()`. ChatSide `<aside>`와 Rail `<nav>`에 한 줄씩 붙이고, 방 줄·회의실 줄에 `data-room-item`.
- 하지 않는 것: roving tabindex(Tab 순서 재설계)는 안 합니다. 모든 줄이 계속 Tab으로도 가고 ↑↓는 추가 수단일 뿐이라 변경 범위가 작고 기존 사용이 안 깨집니다. **추정**: 요청서의 "↑↓ 이동"은 이 수준이면 충족.

### 1-3. 고칠 파일

| 파일 | 변경 요지 |
|---|---|
| **새** `renderer/features/RoomListColumn.tsx` | `useRoomListLayout`, `RoomListColumn`, `useRoomListPref`(ChatPage에서 이동) |
| `renderer/features/ChatPage.tsx` | 위 이동분을 호출로 교체. 머리의 `listMode`·`rowWidth`는 훅 반환값으로 받음. 화면 변화 0이어야 함 |
| `renderer/features/MeetingPage.tsx` | 바깥을 `<div ref={rowRef} className="flex h-full">` + `<div className="phone:hidden flex"><RoomListColumn/></div>` + 기존 `<Page>`(`min-w-0 flex-1`)로 감쌈. `room`은 `undefined`(안 읽은 계산은 전체 방 기준 아님 → `useRoomEntries(undefined,…)`로 충분) |
| `renderer/features/chatRoomHooks.ts` | `isActive`에 view 반영, `select`→`openChatRoom`, `useMeetingEntry`, `useArrowNav` 추가 |
| `renderer/features/ChatSide.tsx` | 회의실 버튼을 `useMeetingEntry`로: 선택 표시(`bg-accent`) + 노란 배지. 방 줄에 `data-room-item`, `aside`에 `useArrowNav`. 기존 속성은 모두 기본값 유지(폴드 분할·세로 폰 메뉴 영향 0) |
| `renderer/features/ChatRoomRail.tsx` | 회의실 아이콘에 선택 링(`ring-primary`)과 노란 점·숫자, `useArrowNav` |
| `renderer/features/nav.ts` | `usePendingMeetingDecisions` 추출(`useNavBadges`가 사용) |
| `renderer/features/navGroups.ts` | `showsTabRow` 추가 (기억 로직 `rememberTab`·`groupEntryView` 불변) |
| `renderer/App.tsx` | `{showsTabRow(…, 'desktop') && <NavTabs />}` |
| `shared/chatRoomLayout.ts` | `nextFocusIndex` |
| `shared/i18n/dict/chatMessenger.ts` | 회의실 배지 읽기용 문구 1~2개(예: 결정 대기 N건). 기존 `chat.unread.approval` 재사용 가능한지 먼저 확인 |
| 시험 | `chatRoomLayout.test.mts`(nextFocusIndex), `navGroups.test.mts`(showsTabRow, 기억 불변) |

### 1-4. 데이터 흐름·상태
- 상태 원본은 그대로: 현재 방 `store.chatRoom`, 화면 `store.view`, 결정 대기는 `store.meetings`에서 `pendingMeetingDecisions`. 새 저장 상태 없음.
- 접힘 설정은 기존 기기 저장 키를 단체방·회의실이 공유(회의실에서 핀을 눌러도 단체방이 같은 모양).
- 폭 판정은 v1.3.1 그대로(행 폭 <840 띠, 되돌릴 때 ≥856). 회의실 안쪽은 이미 `max-w-3xl` 폼이라 200px이 줄어도 깨질 곳은 적다고 **추정** — 화면 확인 항목에 넣음.

### 1-5. 위험과 영향
- **폰·분할·세로 폰:** ChatPage의 폰 머리·`RoomTabs`·ChatSide 분할 칸은 안 건드림. MeetingPage의 방 목록은 `phone:hidden`이라 폰에서는 안 나옴. 폰 회의실은 그대로 NavTabs로 돌아감(PhoneShell은 chat일 때만 탭 줄을 지움).
- **투어·튜토리얼:** PC에서 탭의 `data-tour="nav-meeting"`이 사라집니다. `tourTarget`이 `nav-meeting|nav-talk`로 뒤쪽 후보(사이드바 대화)를 쓰므로 안 끊기지만, **회의실 줄에 `data-tour="nav-meeting"`을 달아** 회의실 안내가 방 목록을 가리키게 하는 것을 권합(작은 변경, 단체방 화면에서 더 정확).
- **되돌릴 때 `isActive` 변화:** 같은 훅을 쓰는 `RoomTabs`(가로 폰)는 항상 view가 chat이라 결과 동일. 훅 호출부 3곳이 모두 chat 화면 또는 회의실 방 목록뿐임을 구현 때 `grep`으로 재확인.
- **v1.3.1 미커밋 파일 위에 얹기:** 같은 파일 5개를 다시 고치므로 **구현 첫 단계에서 현재 작업본의 시험·typecheck를 먼저 통과 기록**으로 남기고, 이동(2단계)은 화면 변화 0을 먼저 확인한 뒤 기능을 얹음.

### 1-6. 구현 순서 (각 단계 끝에 `pnpm typecheck` + 관련 시험)
1. 순수 함수·시험: `showsTabRow`, `nextFocusIndex`, `usePendingMeetingDecisions` 추출(동작 동일).
2. `RoomListColumn` 추출 → ChatPage가 호출. **화면 변화 0 확인(1400/1100/900, 라이트·다크).** ← 되돌림 지점
3. `chatRoomHooks` 변경(`isActive`·`openChatRoom`·`useMeetingEntry`) + ChatSide·Rail 회의실 줄(선택·배지).
4. MeetingPage에 방 목록 얹기.
5. App.tsx 탭 줄 숨김.
6. ↑↓ 키 이동 + `data-tour`.

### 1-7. 검증
- 자동: `chatRoomLayout.test`(nextFocusIndex: 맨 위/맨 아래/한 칸짜리/빈 목록), `navGroups.test`(대화·desktop=숨김, 직원·desktop=표시, 대화·phone=표시, 기억 로직 기존 단언 그대로).
- 화면(1400/1100/900 × 라이트·다크): ① 대화 묶음에 탭 줄 없음, 직원·업무·기록 묶음은 탭 있음 ② 회의실에 방 목록(900에서는 띠), 회의실 줄만 선택 표시, 방 줄에 선택 없음 ③ 결정 대기를 만든 뒤 노란 숫자(목록·띠 모두), 결재함 배지와 숫자 일치 ④ 방 줄 클릭 → 단체방 복귀 ⑤ 사이드바 '대화' 클릭 → 마지막 본 곳 ⑥ 방 목록에서 ↑↓가 회의실까지 ⑦ 폰 미리보기(가로·세로·분할)에서 탭 줄·회의실 이동이 이전과 같음.

---

## 2. 기능 2 — 직원 화면 A안 + 상황판 접기

### 2-1. 요구 해석
탭 이름(직원 목록·팀 구성), 한 문장 요약(굵은 부분=필터), 급한 순 정렬, 새 카드(머리/지금 하는 일/예시 3개/버튼/자세히), 마지막 칸 '＋ 직원 추가', 상황판은 목록 아래 접는 칸(기본 접힘). 토큰·$·Lv는 카드에서 제거.
- 결정: 기존 **팀별/랩별 묶음·이름 찾기·상태 필터 묶음·카드/목록 보기 전환은 그대로** 둡니다(요청서가 없애라고 하지 않았고, 시안도 '팀별 ▾'·찾기를 유지). 한 문장 요약은 숫자 칸 6개(`SummaryRow`)를 대신합니다.

### 2-2. 핵심 선택과 이유

**선택 A. 화면에 안 그리는 판단은 `shared/staffCard.ts` 한 파일의 순수 함수로 모으고 시험한다.**
- 들어갈 함수:
  - `nowLine(staff, task)` → 지금 하는 일 문장(§2-4)
  - `cardAction(staff)` → `'confirm' | 'retry' | 'assign' | 'none'`(외부·다른 PC·퇴근은 `none`)
  - `summaryParts(counts)` → 요약 문장의 조각 `[{kind, count}]`(0명인 조각은 뺌, 굵게 누를 수 있는 조각 표시)
  - `roleInfo(role)` → 직무별 `{ descKey, exampleKeys[3] }`, 프리셋이 아니면 '자유 직무' 것으로
- 이득: 요청서의 규칙(상태→버튼 색, 문장 바꾸기, 요약 조각)이 전부 입력→출력으로 시험됨. 추가 복잡도: 파일 1개 + 시험 1개. 화면 파일에는 `if`가 줄어듭니다.

**선택 B. 카드는 `StaffCard.tsx`를 그 자리에서 다시 쓰되, 안을 작은 조각 컴포넌트로 나눈다.**
- 새 파일을 만들지 않고 같은 파일 안에서 `CardHead` / `NowLine` / `ExampleChips` / `CardActions`로 나눕니다(각 20~30줄). 같은 파일에서 `Avatar`·`StatusDot`·`Elapsed`·`LeadMark`·`PracticeBadge`·`UnreadBadge`를 8개 화면(RunCard·PlanCard·LabSection·StaffPanel·PayrollPage·OrgPage·InboxPage)이 import하므로 **그 export들은 이름·모양 그대로** 둡니다(이것이 이 변경의 가장 큰 파급 위험).
- 바깥 틀은 `div`. 머리 영역(얼굴·이름)은 버튼으로 두어 지금처럼 눌러서 패널을 열 수 있게 하고(`isSelected` 링 유지), '자세히 ›'도 같은 `select(id)`. 안의 버튼이 서로 겹치지 않습니다.
- `LiveMiniView`(카드 위 미니 사무실)는 시안대로 카드에서 뺍니다. **다만 파일은 지우지 않고** 다른 사용처(`grep`)가 없으면 구현 마지막 단계에서 죽은 코드로 정리.
- 외부 직원(보기 전용)·다른 PC 직원: 시킬 수 없으므로 예시·주 버튼 없이 머리+지금 하는 일+'자세히 ›'만(`cardAction`이 `none`). 퇴근(offline)도 동일.

**선택 C. 예시 누르면 지시창에 채우기 = 렌더러 store에 `staffDraft` 한 칸.**
- 이미 `meetingPreset`이 같은 방식(화면 간 한 번 전달)입니다. `store.ts`에 `staffDraft: { staffId, text, nonce } | null`과 `setStaffDraft`를 추가하고, `StaffPanel`이 선택된 직원이 같고 `nonce`가 새로울 때만 `draft`(지시 입력칸 상태, `StaffPanel.tsx:330`)에 넣고 탭을 '대화'로 바꾼 뒤 비웁니다.
- main·IPC는 **안 건드립니다** → 원격 프로토콜·휴대폰 영향 0. 자동 전송은 하지 않습니다(채우기만 → 대표가 보내기).
- 주 버튼의 동작도 이 한 칸으로 해결합니다: '일 시키기'=패널 열기+입력칸 포커스, '확인하기'=패널 열기(기존 결재 띠가 맨 위에 보임).

**선택 D. 상황판은 기존 패널 3개를 그대로 쓰고 접는 틀만 새로 둔다.**
- `AttentionCard`·`UsageCard`·`ActivityFeed`·`usePayslip`은 `DashboardPanels.tsx`에서 **고치지 않고** `Dashboard.tsx`에서 `<details>` 성격의 접는 칸 안에 넣습니다(`aria-expanded` 버튼 + 조건부 그리기). 기본 접힘, 펼침 상태는 기기에 저장(`staffView.ts`와 같은 방식으로 `office:dashboardBoardOpen`; 업무 모드 사용자가 매번 펴지 않게).
- 접힌 동안 3개 패널을 **그리지 않음** → 접혀 있으면 `usePayslip`(IPC 호출)과 피드 계산을 부를 필요가 없는지 확인(`usePayslip`은 훅이라 Dashboard 위에서 계속 호출됨 → 접힌 상태에서도 부르는 비용이 현재와 같아 **변경 없음**, 줄이려면 상황판 안으로 옮길 수 있으나 이번엔 안 함).
- 접는 칸 제목에 '확인 필요 N'을 한 줄로 띄워(기존 `attention` 계산 재사용) 접어 둬도 급한 일을 놓치지 않게 함 — 시안의 접는 칸이 이 정보를 보여 주는지 구현 때 시안(`staff-page.html`의 해당 칸)과 맞추고, 없으면 만들지 않음.
- `SummaryRow`는 `Dashboard.tsx`에서만 쓰이므로(확인함) 더 이상 안 부르면 **삭제**합니다(죽은 코드 정리). 그 안의 '오늘 완료 ↗'·'오늘 토큰' 타일이 하던 링크(기록으로 이동)는 §2-8 쟁점에서 정리드 확인.

**선택 E. 쉬운 말은 '키 이름은 두고 값만' + 새 문구는 새 사전 파일 2개.**
- 17개 용어표 중 대부분은 기존 키의 한국어·영·일·중 값만 바꿉니다(`status.*`, `nav.dashboard`, `nav.org`, `staffPanel.tab.*`, `shell.hire`, `hire.*`, `dashboard.hireStaff` 등). 키 이름을 바꾸면 사용처 수십 곳이 흔들리고 다른 영역 파일 대조(`i18n.test`)가 깨질 위험만 늘기 때문입니다.
- 새 문구는 `dict/staffCard.ts`(카드·요약·상황판 접기·예시 채우기 문구·'오늘 많이 씀' 등)와 `dict/roleInfo.ts`(직무 11개 × 설명 1 + 예시 3 = 44키 × 4개 언어)로 둡니다. `dict/index.ts`에 두 줄 추가. `i18n.test.mts`가 4개 언어·`{변수}`·중복 키를 잡아 줍니다.
- **함정:** 일부 시험이 한국어 글자를 그대로 비교합니다(`grep`에 걸린 `dashboard.test`, `roleLabel.test`, `staffProgress.test`, `networkError.test`, `netResumeFlow.test`, `remote.test`, `artifact.test`, `autoApprove.test`, `deskPetFeed.test`). 값을 바꾼 뒤 이들이 깨지면 **시험의 기대 글자를 같이 갱신**하고, 모든 단어 치환은 §2-7의 단어 목록 `grep`으로 빠짐을 확인합니다. main이 만드는 글(알림·로그·결재함 문구: `main/hired.ts`의 '고용' 포함)도 '앱 전체' 범위입니다.

### 2-3. 고칠 파일

| 파일 | 변경 요지 |
|---|---|
| **새** `shared/staffCard.ts` + `scripts/staffCard.test.mts` | `nowLine`·`cardAction`·`summaryParts`·`roleInfo` (+ 시험) |
| **새** `shared/i18n/dict/staffCard.ts`, `dict/roleInfo.ts` | 새 문구 4개 언어 |
| `shared/i18n/dict/index.ts` | 두 파일 등록 |
| `shared/roleLabel.ts` | `ROLE_KEY` 표가 이미 직무→키를 가지므로 `roleInfo`가 이 표를 export해 재사용(직무 이름 표를 한 번 더 만들지 않음) |
| `renderer/features/StaffCard.tsx` | 카드 본문 재작성(조각 4개). export들(`Avatar` 등)은 불변. `CARD_TONE`·`isRemoteDim`·`RemoteBadge`·`AutonomyBadge`·`praise`는 유지 |
| `renderer/features/StaffRow.tsx` | 목록 보기 줄에서도 토큰·$·Lv를 제거(요청서의 '카드'만이 아닌 용어 일관성 — §2-8 쟁점) |
| `renderer/features/Dashboard.tsx` | 요약 문장, 카드 격자 끝 '＋ 직원 추가' 칸, 상황판 접기, `SummaryRow` 호출 제거. 카운트·필터·그룹·정렬 함수는 그대로 |
| `renderer/features/DashboardPanels.tsx` | `SummaryRow`(와 전용 `Tile`)만 삭제. 나머지 패널은 불변 |
| `renderer/store.ts` | `staffDraft`·`setStaffDraft` |
| `renderer/features/StaffPanel.tsx` | `staffDraft` 소비, 머리·탭 이름, '소개'(§2-5) |
| `renderer/features/HireDialog.tsx` | 3단계(§2-5) |
| `shared/i18n/dict/featuresA.ts · featuresB.ts · shell.ts · staff.ts · logs.ts · main.ts …` | 용어표 값 수정(§2-7), `hire.provider.locked` 문구 |
| `renderer/features/navGroups.ts` | 불변(탭 이름은 사전 값) |

### 2-4. '지금 하는 일' 문장 — 데이터 출처와 규칙
출처 우선순위(앞에서 맞으면 사용), `nowLine(staff, task)`:
1. `waiting` + `staff.approvals[0]` → 질문이면 "질문 1개 — …"(`questions[0]`), 결재면 `approvals[0].effectI18n`(이미 있는 쉬운 효과 문장)을 쓰고, 없으면 "도구를 써도 되는지 확인을 기다려요". 시안의 "시안 파일을 저장해도 되는지 확인을 기다려요"에 해당.
2. `error`/`netWait` → "인터넷 연결이 끊겨 멈췄어요"(netWait·네트워크 오류 판정은 기존 `shared/networkError.ts` 재사용 여부 확인) / "문제가 생겨 멈췄어요". **원문 오류(`API Error 529` 등)는 카드에 안 보이고** '자세히'의 패널에서만 보임.
3. `working` + `staff.progress?.text`(`stripHead` 적용 — `chatRoomHooks.doingOf`가 이미 같은 규칙, 이동·재사용) → 문장 그대로. 없으면 `activity`의 **첫 낱말이 알려진 도구 이름**(Edit·Write·Read·Bash·Grep·Glob·WebSearch·WebFetch…)일 때만 쉬운 말("파일 고치는 중", "읽는 중", "프로그램 실행 중"…) 한 줄 사전으로 바꿈. 도구 이름이 아니면(답변 글) 앞 60자만.
4. 그 외(`idle`·`offline`) → 보드 업무 `task.title`(`currentTask`, 기존 카드와 같은 출처) → "마지막 일: …" / 없으면 "맡은 일이 없어요".
- 낱말 사전은 도구 이름 약 10개 분량 → `dict/staffCard.ts`. 알 수 없는 도구는 일반 문구 "도구를 쓰는 중"(원문 노출 금지).
- 시험: 위 4갈래 × 한글·영어(`setLang`) + 도구 이름 아닌 답변 글 + 빈 activity.

### 2-5. 나머지 세부 결정
- **직무 11개 설명·예시 3개 → `roleInfo`.** 프리셋 아닌 직무(직접 입력)와 '자유 직무'는 시안대로 "고용할 때 적은 업무 지침대로 일해요"(카드에는 지침 첫 줄: `systemPrompt`의 첫 줄, 없으면 설명만). 직무 칩(직원 추가 1단계)과 카드가 **같은 `roleInfo`** 를 씁니다 → 설명이 두 곳에서 갈라질 수 없음.
- **'다시 시도'** — 기존 동작이 없습니다. 안 만드는 쪽을 추천: 패널을 열고 입력칸에 "방금 하던 일을 다시 해 줘"를 채워 대표가 보냄(= `staffDraft` 재사용, main 변경 없음). 진짜 자동 재실행(`retryLast` IPC)은 main·원격 프로토콜(`v2.ts`)·안드로이드까지 번지므로 이번에 안 함. **정리드 확인 필요.**
- **직원 추가 3단계(`HireDialog.tsx`, 393줄 단일 폼).** 폼 상태 `form`은 그대로 하나(단계가 바뀌어도 값이 유지). 새로 두는 것은 `step: 0|1|2`뿐. 단계 검증은 순수 함수 `hireStepValid(step, form, isProviderReady)`(예: 1단계=직무 있음, 2단계=이름 있음, 3단계=제출 가능)를 `shared/staffCard.ts`(또는 같은 규모의 `shared/hireSteps.ts`)에 두어 시험. 기존 필드 JSX는 단계별 3개 섹션으로 **옮기기만** 하고 새로 쓰지 않음. '자세히 설정'(`isMoreOpen`: AI·결재 방식·업무 지침)은 3단계에 접음. 마지막 버튼 라벨만 '일 시작하기'. 열릴 때 초기화하는 기존 `useEffect`에 `setStep(0)` 추가. **이름 자동 추천은 시안에 규칙이 없고 기존 코드에도 없어 만들지 않고**(얼굴만 기존 `roleLook` 추천 유지), 이름 칸 안내 문구만 둡니다 — 시안과 다른 곳 §4.
- **패널 머리(`StaffPanel.tsx` ~510~560줄).** ① 직무 줄에서 `· modelLabel` 제거(AI 등급은 이미 있는 '프로필' 카드의 모델 선택 + `usageDotsText` 점으로 표시되므로 라벨만 'AI 등급'으로) ② 폴더는 `workDirLabel` 전체 경로 대신 '일하는 곳: ' + `status.ts`의 `folderName(cwd)`, 누르면 전체 경로를 펼침(작은 `WorkDirChip` 조각) ③ '터미널에서 이어 하기'는 **세로 폰 머리에 이미 있는 ⋯ 메뉴(`PopMenu`)를 모든 크기가 쓰도록 통일** — 새 메뉴를 만들지 않고 `slim:` 분기만 풀기 ④ 탭 이름 4개는 사전 값 수정. **이 머리는 폰(분할·세로 폰)과 같이 쓰므로** 세 모양(기본·`side:`·`slim:`)을 모두 화면 확인.
- **'소개'에 업무 지침 보이기·고치기.** `profile` 탭에 카드 1개 추가(`staff.systemPrompt` 표시, 편집 → `updateStaff(id,{systemPrompt})`). **사실 3 때문에 일하는 중(`working`·`waiting`)에는 편집 버튼을 막고** "쉬는 중일 때 고쳐 주세요" 안내(엔진 변경의 `staffPanel.engine.busyHint`와 같은 규칙·같은 모양). 저장하면 세션이 다시 시작된다는 한 줄 안내도 필요. 외부 직원은 숨김.
- **'고용 뒤에는 AI를 바꿀 수 없어요' 문구(`hire.provider.locked`).** 실제로는 프로필에서 바꿀 수 있지만 **일하는 중에는 못 바꿈**(`engineChange.error.busy`). 문구를 "직원을 추가한 뒤에는 '소개'에서 바꿀 수 있어요(일하는 중에는 쉬는 중일 때)"로 맞춤. 같은 뜻의 다른 문구가 있는지 `grep '바꿀 수 없'` 결과 5곳 중 해당만 수정.

### 2-6. '오늘 많이 씀' (시안과 다르게 할 수밖에 없는 곳)
사실 1 때문에 **카드마다 붙이는 것은 지금 구조로 불가능**합니다. 선택지:
- **(권장) A. 회사 단위로만:** 설정의 일 토큰 한도(`settings.tokenBudget.day`, 0=없음) 대비 오늘 사용(`payslip.periods`의 day)이 한도를 넘으면 한 문장 요약 줄 끝과 상황판 제목에 '오늘 많이 씀' 꼬리표 1개. 한도가 0(기본)이면 안 보임. 판단은 `usageRatio`(`shared/dashboard.ts`)를 재사용, 함수 `isTodayHeavy(periods)`로 시험. main·IPC 변경 0.
- B. 직원별로: main이 직원별 오늘 토큰을 스냅샷에 담아야 해서 `Staff` 타입·`office.ts`·원격 프로토콜·안드로이드 호환까지 번짐. 이번 버전 범위로 크다고 판단.
→ 정리드 결정 필요(권장 A).

### 2-7. 용어 치환 점검 방법
- 단어 목록(고용·직원 고용·고용하기·대시보드·조직도·작업 중·확인 필요·대기·연결 대기·오류·퇴근·장비·프로필·변경)을 4개 언어 값에서 `grep`해 **표 17개와 대조한 점검표**를 만들고, 바꾼 값은 그 표에 체크. '확인 필요'는 건수 이름(결재함·상황판)과 직원 상태 이름이 같아 **직원 상태만** 바꿔야 하므로(`status.waiting` 값만) 일괄 치환 금지.
- 영·일·중은 같은 뜻으로 직역 + 같은 키를 쓰는 곳이 다른 문맥(예: '대기'가 일정·플랜 대기 의미인 곳)이 아닌지 사용처를 확인.

### 2-8. 정리드가 정할 쟁점 (설계 단계에서 못 정함)
1. **'오늘 많이 씀'**: 권장 A(회사 단위) vs B(직원별, main 변경 큼).
2. **'다시 시도'**: 권장 = 패널 열고 입력칸에 채우기. 자동 재실행은 이번엔 제외.
3. **목록 보기(`StaffRow`)도 토큰·$·Lv 제거**: 권장 예. 카드만 바꾸면 같은 화면 안에서 용어가 갈림.
4. **옛 '오늘 완료 ↗' 타일 링크**(기록 화면으로 이동)가 사라짐: 권장 = 접는 상황판 안에 '오늘 완료 N' 한 줄과 같은 링크를 유지하거나, 필요 없으면 제거(대표 확인 사항 아님, 정리드 판단).
5. **직원 추가의 이름 자동 추천**: 권장 = 안 만듦(시안에 규칙 없음).

---

## 3. 공통 — 구현 순서, 위험, 검증

### 3-1. 전체 순서 (작게 나눔, 각 단계는 따로 되돌릴 수 있음)
기능 1(§1-6)을 먼저 끝내고 기능 2로 갑니다. 두 기능이 겹치는 파일은 `dict/index.ts` 한 줄과 `StaffPanel`/`store.ts` 뿐이라 병렬도 가능하지만, 같은 작업본이므로 **직렬을 권장**(검증 시점이 분명).
기능 2 단계:
1. 순수 함수·시험: `staffCard.ts`(`nowLine`·`cardAction`·`summaryParts`·`roleInfo`·`isTodayHeavy`·`hireStepValid`).
2. 사전: `staffCard.ts`·`roleInfo.ts` 신설 + 등록 → `i18n.test` 통과.
3. `store.staffDraft` + `StaffPanel`이 소비(아직 쓰는 곳 없음, 화면 변화 0).
4. `StaffCard` 재작성 + `Dashboard` 요약·'＋ 직원 추가' 칸 + 상황판 접기 + `SummaryRow` 삭제. ← 되돌림 지점
5. `HireDialog` 3단계.
6. 패널 머리·탭 이름·'소개' 지침 카드.
7. 용어 치환(§2-7) + 깨진 시험 기대값 갱신.
8. 문서: SPEC.md·CHANGELOG(ko/en/ja/zh)·CONTEXT.md 기준 버전. **버전 번호는 정리드가 대표에게 먼저 확인**(다른 안내 참조).

### 3-2. 영향 범위 정리
| 곳 | 영향 | 대응 |
|---|---|---|
| 폰 화면(`PhoneShell`) | 직원 목록·패널 머리·직원 추가는 폰도 같은 컴포넌트. 대화 쪽은 영향 0 | 폰 미리보기(가로·세로·분할)에서 카드·머리 확인. 카드에 폰 폭(1열) 규칙 유지 |
| 원격 미리보기·원격 PC 화면 | 새 IPC·main 변경 없음 → 프로토콜 불변. `fakeShell.ts` 가짜 데이터에 `progress`·`approvals`가 없으면 카드 문장이 빈 칸 | fakeShell 직원 몇 명의 상태를 점검 |
| `StaffCard.tsx`의 export | 8개 화면이 씀 | export 시그니처 불변, `typecheck`로 확인 |
| 튜토리얼·코치 투어 | 카드·'직원 고용' 버튼을 가리키는 곳 | `data-tour` 속성과 `shell.hire` 버튼 위치 불변, 투어 문구에 '고용' 남았는지 `grep` |
| 사무실·직원 외형 | 카드의 미니 사무실 제거 | 업무 모드 외에는 `LiveMiniView`가 카드에서 사라짐 — 사용처 없으면 정리 |

### 3-3. 검증 모음
- 자동(`pnpm typecheck`, `pnpm test`): 새 `staffCard.test`(nowLine 4갈래·cardAction 상태×종류·summaryParts·roleInfo 11개+직접 입력·isTodayHeavy·hireStepValid), `i18n.test`(새 사전 4언어·변수), 확장 `navGroups.test`·`chatRoomLayout.test`, 한국어 값 변경으로 깨진 기존 시험 갱신.
- 화면(1400/1100/900 × 라이트·다크): 직원 목록 — 한 문장 요약 굵은 부분 필터, 급한 순, 카드 3줄 높이 고정, 버튼 색 3종(노랑/빨강/기본), 예시 클릭→패널 입력칸 채움(자동 전송 안 됨), 마지막 칸, 상황판 기본 접힘·펼침 유지, 팀별/랩별·목록 보기·이름 찾기 동작, 직원 0명(빈 화면 문구 '직원 추가'), 직원 많음(스크롤). 직원 추가 — 3단계 이동·뒤로 가도 값 유지·마지막 '일 시작하기'·'자세히 설정' 접힘·직무 11개 설명. 패널 — 머리 3모양(기본·분할·세로 폰), 모델 이름 없음, 폴더 이름→경로, ⋯ 안 터미널 이어 하기, 탭 이름, 소개의 지침 보기·고치기(일하는 중 막힘).
- 용어 점검표(§2-7) 17행 × 4개 언어 확인 + '고용' 남은 곳 0.

---

## 4. 시안과 다르게 할 수밖에 없는 곳 (모음)
1. **'오늘 많이 씀' 꼬리표**: 카드별이 아니라 회사 단위(§2-6). 이유 = 직원별 예산·오늘 사용량이 코드에 없음.
2. **'다시 시도'**: 자동 재실행이 아니라 입력칸 채우기(§2-5). 이유 = 기존 재시도 동작이 없고 main·원격 프로토콜이 번짐.
3. **직원 추가 2단계 '이름 자동 추천'**: 만들지 않음. 이유 = 시안에 규칙이 없고 기존에도 없음(얼굴 추천은 기존 `roleLook`).
4. **'소개' 지침 편집**: 일하는 중에는 막음. 이유 = 저장 시 세션이 다시 시작됨(`office.ts:1066`).
5. 카드가 통째로 눌리던 동작: 머리 영역과 '자세히 ›'만 패널을 열도록 바뀜. 이유 = 카드 안에 버튼이 들어가 중첩 버튼이 됨.

(모두 정리드 판단 대상. 대표에게 직접 넘기지 않음.)
