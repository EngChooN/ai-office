# 안드로이드 1.1 · 폰 배치안 (PC 화면 재배치)

> 작성: 이디자(디자인 팀) · 2026-10-23 · 상위 업무 "안드로이드 앱 1.1: PC 화면 그대로 옮기기" 3/9단계
> 근거: 기획서(수정 2), `docs/specs/remote-protocol-v2.md`, 박패턴 구조 설계(모바일 빌드·어댑터·`phone:` 변형·`PhoneShell`), 현재 `app/src/renderer` 소스. **앱 코드는 고치지 않았다.**
> 읽는 사람: **최가독(구현)**, 임안드(셸·키보드·안전 영역), 정리드·강백엔(PC 전용 동작 응답), 오큐에이(화면 검증).

## 0. 원칙
- **새 디자인 없음.** 화면·컴포넌트·색·아이콘·문구는 PC 것을 그대로 쓴다. 바꾸는 것은 **틀(사이드바 → 아래 탭·더보기, 오른쪽 패널 → 시트, 대화상자 → 아래 시트)과 폭·높이 값**뿐이다. 1.0의 모바일 전용 디자인(`android-design.md`)은 1.1에서 쓰지 않는다.
- **폰 = 폭 840dp 미만, 태블릿 = 840dp 이상(PC 레이아웃 그대로).** 단 800×1280 같은 **세로 태블릿은 840 미만이라 폰 배치**가 된다(8절 확인 필요).
- 분기는 박패턴 설계대로 세 곳에서만 한다: 셸(`PhoneShell`), UI 기본 부품(`components/ui/*`), CSS 변형 `phone:`. **feature 화면 파일은 최소로만** 건드린다(아래 표에서 "feature 수정"으로 따로 표시).

## 1. 목업 보는 법
실제 renderer를 가짜 `window.office`(고정 데이터)로 브라우저에 띄워 캡처했다. 그림을 따로 그리지 않았다.

| 이미지 | 내용 |
|---|---|
| `android-pc-layout/img/<화면>-phone.png` | **지금** renderer를 390×844로 띄운 모습(PC 틀 그대로) |
| `android-pc-layout/img/<화면>-prop.png` | **제안**: 같은 화면 컴포넌트를 폰 틀(상단 바·아래 탭·시트)에 끼워 390×844로 렌더링 |
| `android-pc-layout/img/<화면>-tablet.png` | 800×1280, PC 레이아웃 그대로 |
| `android-pc-layout/board-<화면>.png` | 위 세 장 위에 번호 표시 + 설명 (20장) |

- 재현: `android-pc-layout/harness/`(미리보기 장치. 앱 소스 밖에서 앱 `vite.renderer.config.mts`를 불러 씀). `harness/PhoneShell.tsx`는 **목업용 틀**이고 구현 코드가 아니다. 최가독이 앱 안에 만들 `PhoneShell`의 모양 참고용으로만 쓴다.
- 제안 캡처의 폰 규칙(패딩 p-4, 대화상자 → 아래 시트, 패널 전체 폭)은 `harness/phone.css`로 덮어 보여 준 것이다. 구현은 `phone:` 변형으로 한다.
- 데이터는 가짜(고정)라 숫자·이름은 실제와 다르다.

## 2. 공통 틀 (board-shell.png)

### 2-1. 지금 폰 폭에서 깨지는 이유 (모든 화면 공통)
1. **사이드바 `w-44`(176px)가 390폭의 45%를 차지**해 본문이 214px로 눌린다. 매뉴얼실·급여 명세서는 제목 설명이 한 글자씩 세로로 끊긴다.
2. **상단 바**(`App.tsx` header `h-11`)가 두 줄로 깨지고 "직원 고용" 버튼이 잘린다. 맥 신호등 자리 `pl-20`도 폰에는 필요 없다.

### 2-2. 폰 틀 구성
```
┌ 상태 표시줄(안전 영역) ───────────────────┐
│ PhoneTopBar  화면이름   💰자금  🔔2  [+👤] │ h-12
│ (ConnectionBanner — 끊겼을 때만)          │
│                                          │
│            기존 화면 컴포넌트              │
│                                          │
│ PhoneTabBar  사무실 단체방 업무보드 결재함 더보기 │ h-16
└ 제스처 바(안전 영역) ──────────────────────┘
```

| 컴포넌트(신규) | 내용 | 가져오는 기존 요소 |
|---|---|---|
| `PhoneShell` | `DesktopShell` 대신 폰에서 쓰는 틀. 상단 바 + 본문(`PAGES[view]`) + 아래 탭 + 시트들 | `App.tsx`의 `PAGES`, `HireDialog`, `Onboarding`, `CoachTour`, `WhatsNew`, `LevelUp`은 그대로 넣는다 |
| `PhoneTopBar` | 왼쪽 **지금 화면 이름**(사이드바 라벨) · 💰자금 칩(업무 모드면 숨김) · **확인 필요**(`Button outline` + `BellIcon` + 숫자, 0이면 숨김) · **직원 고용**(`Button size="icon"` + `UserPlusIcon`, `aria-label="직원 고용"`) | `App.tsx` header의 자금 칩·확인 필요·직원 고용. "이번 달 $31.20 / $50"은 **숨김**(급여 명세서·대시보드 토큰 예산에 같은 정보가 있음) |
| `PhoneTabBar` | 아래 탭 5칸: **사무실 · 단체방 · 업무 보드 · 결재함 · 더보기** | `Sidebar` ITEMS의 아이콘·라벨·배지(`bg-status-waiting` 숫자)·선택 모양(`bg-accent text-foreground font-medium`) 그대로 |
| `MoreSheet` | 더보기를 누르면 아래에서 올라오는 목록. **사이드바의 나머지 메뉴를 같은 순서·아이콘·줄 모양**으로, 맨 아래 "업데이트 소식 v0.8.1" | `Sidebar`의 버튼 줄(`rounded-md px-2.5 py-1.5 text-sm`)을 높이만 `min-h-12`로 |

메뉴 배치
| 위치 | 메뉴 (PC 사이드바 순서) |
|---|---|
| 아래 탭 | 사무실(`MapIcon`) · 단체방(`MessagesSquareIcon`) · 업무 보드(`KanbanIcon`, 검토 수 배지) · 결재함(`ClipboardCheckIcon`, 대기 수 배지) · 더보기(`EllipsisIcon`) |
| 더보기 | 대시보드 · 조직도 · 회의실(결정 대기 배지) · 매뉴얼실 · 예약 업무 · 보고서 · 급여 명세서 · 상점(보상 배지) · 설정·꾸미기 · ─ · 업데이트 소식 |
- 아래 탭 순서는 기획서대로다. 아이콘은 PC 사이드바와 같다.
- **더보기 배지** = 더보기 안 메뉴들의 배지 합(회의실 결정 대기 + 상점 보상). 지금 보는 화면이 더보기 안 메뉴면 더보기 탭이 선택 모양.
- **업무 모드:** 첫 탭 "사무실" 자리가 "대시보드"(`LayoutGridIcon`)로 바뀌고, 더보기에서 대시보드 대신 상점이 빠진다(PC도 업무 모드면 지도·상점을 숨김, board-banner.png).
- 안드로이드 **뒤로 가기:** 열린 시트(더보기·직원 패널·대화상자) 닫기 → 그 다음은 직전 탭. 첫 탭에서 뒤로 가면 앱을 백그라운드로.

## 3. 공통 규칙 (UI 기본 부품에서 한 번에)
| 부품 | 폰에서 바꿀 점 | 이유 |
|---|---|---|
| `components/ui/page.tsx` `Page` | 머리 `px-6 py-4` → `phone:px-4 phone:py-3`, 본문 `p-6` → `phone:p-4`. **`actions`를 제목 아래 줄로**(`phone:flex-col phone:items-stretch`, actions는 `flex-wrap gap-2`) | 매뉴얼실·결재함·급여 명세서·보고서에서 actions 때문에 설명이 좁아지는 문제를 한 번에 해결 |
| `components/ui/dialog.tsx` `DialogContent` | `phone:` 아래 시트: `inset-x-0 bottom-0 top-auto`, `translate-x-0 translate-y-0`(Tailwind 4는 `translate` 속성), `max-w-none w-full`, `rounded-t-xl rounded-b-none`, `max-h-[92dvh]`, `p-4`, 아래 안전 영역만큼 `pb` | 기획서 "대화상자는 시트로". 내용·버튼은 그대로 |
| `components/ui/button.tsx` | `size="sm"`(h-8)·`h-7` 클래스로 줄인 버튼을 폰에서 `phone:h-10`(터치 40px + 간격 8px로 48px 영역) | 승인·반려·시작 같은 작은 버튼이 손가락에 작다 |
| `components/ui/select.tsx` `NativeSelect` | `h-7`·`h-8` → `phone:h-10` | 팀 이동·담당자 고르기 |
| `components/ui/input.tsx`·`textarea.tsx` | 글자 `phone:text-base`(16px) | 안드로이드 WebView가 16px 미만 입력칸에 포커스하면 확대하는 기기가 있음 |
| `Dashboard`·`Report` 등 `@container` 쿼리 | **그대로.** 390폭에서 이미 잘 접힘(대시보드 3×2 타일, 보고서 세로 쌓기) | 캡처로 확인 |

## 4. 화면별 폰 배치 (최가독 구현 표)
"feature 수정"은 화면 파일을 직접 고쳐야 하는 곳이다. 나머지는 3절 공통 규칙이나 `PhoneShell`로 해결된다.

| 화면 | 보드 | 지금(390) 문제 | 바꿀 점 | 컴포넌트 · 파일 | 태블릿(800) |
|---|---|---|---|---|---|
| 사무실 · 외관 | board-exterior | HUD(`w-48`)가 건물을 가림. 다음 건물 미리보기가 hover로만 열림 | HUD를 접힌 한 줄(회사 Lv · 확인 필요 수)로, 탭하면 펼침. 미리보기는 **탭으로 열고 닫기**(onClick 토글) | `map/OfficeMap.tsx` `Hud`, 미리보기 영역(141행 `onMouseEnter`) — feature 수정 | 문제 없음 |
| 사무실 · 지도 | board-map | HUD가 지도 위쪽 1/4을 덮음. 조작 안내가 "⌘+스크롤" | HUD 접힘(위와 같음). 안내 문구 폰: "두 손가락으로 확대 · 끌어서 이동". **두 손가락 확대**(핀치) 추가 | `OfficeMap.tsx` 안내(366행), `map/OfficeScene.ts` 입력(1626행 근처: 휠만 있음 → 포인터 2개 거리로 `zoomBy`) — feature 수정 | 세로 화면에서 지도가 폭에 맞춰 아래가 빔 → 처음 맞춤을 화면 전체 기준으로(`fitView`) |
| 사무실 · 꾸미기 | board-decorate | 안내 "노랗게 빛나는 소품을 끌어서" | 문구 폰: "소품을 손가락으로 끌어서 옮기세요". 소품 잡는 영역 최소 48px | `OfficeScene.setDecorating`(1467행 `setInteractive` hitArea 넓힘), `OfficeMap` 안내 문구 — feature 수정 | 그대로 |
| 직원 패널 | board-panel | 패널이 화면을 거의 다 덮고 왼쪽에 대시보드 조각이 남음 | **전체 화면 시트**(`fixed inset-0`), 폭 100%, `ResizeHandle` 숨김. 뒤로 가기 = 닫기. 지시 입력칸은 키보드 바로 위(5-3절) | `features/StaffPanel.tsx` `PanelBody` aside `style={{width}}` → 폰은 `w-full`, `ResizeHandle` 폰 숨김 — feature 수정(작음) | **패널 380px이 열리면 대시보드가 170px로 눌려 글자가 끊김** → 840 미만에서는 시트, 840 이상은 그대로 |
| 대시보드 | board-dashboard | 사이드바 때문에 타일이 1열·글자 세로 | 틀만 바뀌면 컨테이너 쿼리로 3×2·카드가 잘 접힘. 루트 `p-6` → `phone:p-4`. 확인 필요 칸의 승인·반려·결재함 열기 `h-7` → `phone:h-10` | `Dashboard.tsx`(66행 루트), `DashboardPanels.tsx`(160·163·212행) — feature 수정(클래스만) | 패널 열릴 때만 위 문제 |
| 조직도 | board-org | 팀 만들기 줄에서 색 점이 넘침 | 색 점 줄 `flex-wrap`, 색 점 `size-6` → `phone:size-8`. 팀 이동 셀렉트는 공통 규칙(h-10) | `OrgPage.tsx` 40행 근처 — feature 수정(클래스만) | 그대로 |
| 업무 보드 | board-board | 칸이 가로로 이어져 2칸이 반씩 보임. 카드 끌어 옮기기가 터치에서 안 됨 | 칸 폭 `phone:auto-cols-[calc(100%-24px)]` + `snap-x snap-mandatory`(칸마다 `snap-start`): 한 칸씩 넘김. **"칸 옮기기" 셀렉트**(5-1절) | `BoardPage.tsx` 칸 그리드(112행), `TaskCard`(article) — feature 수정 | 칸 3개 보이고 가로 스크롤. 그대로 |
| 결재함 | board-inbox | 모두 승인·모두 반려가 제목 옆에 끼임 | Page 공통 규칙(actions 아래 줄). 버튼 높이 공통 | `InboxPage.tsx` 변경 없음 | 그대로 |
| 단체방 | board-chat | 입력 안내에 "⌘+Enter" | 키보드 규칙(5-3절). 안내 문구에서 단축키 숨김, Enter = 줄바꿈, 보내기 버튼 | `ChatPage.tsx` `Composer` 키 처리·placeholder — feature 수정(문구·키) | 그대로 |
| 회의실 | board-meeting | 칩이 작음(약 26px) | 칩 `phone:min-h-9`. 발언 바퀴·회의 시작 줄은 그대로 | `MeetingPage.tsx` 99행 칩 클래스 — feature 수정(클래스만) | 그대로 |
| 매뉴얼실 | board-manuals | 설명이 한 글자씩 세로로 끊김 | Page 공통 규칙으로 해결. 편집 폼의 프로젝트 폴더 선택 → 경로 입력 시트(6절) | 화면 변경 없음 | 그대로 |
| 예약 업무 | board-schedule | 담당·이름·시각 한 줄에서 시각이 잘림 | 폰에서 2줄(담당 + 시각 / 이름). 요일 버튼 `size-7` → `phone:size-10`(7개 한 줄 들어감) | `SchedulePage.tsx` 폼 줄·65행 — feature 수정(클래스만) | 그대로 |
| 보고서 | board-report | 사이드바 때문만 | 그대로(컨테이너 쿼리로 이미 세로 쌓임). "복사"는 폰 클립보드 | 변경 없음 | 그대로 |
| 급여 명세서 | board-payroll | 직원별 표 6칸이 안 들어가 머리글이 세로로 깨짐 | 표를 `overflow-x-auto`로 감싸고 `phone:min-w-[560px]`, 첫 칸(직원) `sticky left-0 bg-background`. 월 선택은 Page 공통 | `PayrollPage.tsx` 52행 `<table>` — feature 수정 | 그대로 |
| 상점 | board-shop | 분류 탭이 두 줄 | 그대로 둬도 됨(선택: 한 줄 가로 스크롤) | 변경 없음 | 그대로 |
| 설정·꾸미기 | board-settings | 사이드바 때문만 | 그대로. **휴대폰 연결 섹션**은 7-2절 확인창. PC 전용 설정(메뉴바·외부 직원 알림)에 "PC에 적용돼요" 한 줄 | `RemoteSection.tsx`, `SettingsPage.tsx` — feature 수정(문구·확인창) | 그대로 |
| 업데이트 소식 | board-updates | 사이드바 때문만 | 그대로. 더보기 맨 아래에서 들어감 | 변경 없음 | 그대로 |
| 직원 고용 | board-hire | 가운데 대화상자(390에서도 거의 들어감) | 아래 시트(공통 규칙). 작업 폴더 "폴더 선택" → 경로 입력 시트(6절) | 화면 변경 없음(어댑터가 대신 띄움) | 그대로 |
| 첫 실행 안내(`Onboarding`)·둘러보기(`CoachTour`)·새 소식(`WhatsNew`)·레벨업(`LevelUp`) | — | (캡처 안 함) | 대화상자 공통 규칙으로 아래 시트. **둘러보기**는 사이드바 항목(`data-tour="nav-…"`)을 가리키므로 폰에서는 아래 탭·더보기 버튼에 같은 `data-tour`를 달아야 함 | `PhoneTabBar`·`MoreSheet`에 `data-tour` | 그대로 |

## 5. 수단 바꾸기

### 5-1. 끌어놓기 → 터치
| 기능 | 지금 | 폰 |
|---|---|---|
| **업무 보드 칸 옮기기** | `TaskCard`를 끌어 다른 칸에 놓음(HTML 끌기 — 터치에서 이벤트가 오지 않음) | 카드 아래 줄에 기존 `NativeSelect` **"칸: 할 일/진행 중/검토/완료"**를 폰에서만 보임 → `updateTask(id, {status})`. 선택지 이름은 칸 머리와 같은 `STATUS_LABEL` |
| **업무 보드 배정** | 이미 카드 안 "담당자 고르기" 셀렉트 + 시작 버튼 | 그대로(끌어놓기 아님) |
| **조직도 팀 이동** | 이미 팀원 줄의 셀렉트(`aria-label="팀 이동"`) | 그대로. 랩 멤버 편집도 칩 토글이라 그대로 |
| **사무실 가구 배치** | Phaser 끌기(꾸미기 모드) | Phaser 포인터는 터치를 같은 이벤트로 받으므로 **손가락으로 끌기 그대로**. 소품 위에서 시작한 끌기는 소품 이동, 빈 곳에서 시작하면 지도 이동(지금 규칙). 소품 잡는 영역만 넓힘 |
| **첨부 끌어다 놓기** | 파일을 창에 끌어다 놓기(`attachments.tsx` `onDragOver`) | 폰에는 없음. 첨부 버튼(📎)으로 고르기만. 버튼 `title`의 "끌어다 놓기도 돼요"는 폰에서 숨김 |

### 5-2. hover로만 보이던 것
| 위치 | 지금 | 폰 |
|---|---|---|
| 외관 "다음 건물 미리보기" | `onMouseEnter`로 열림 | 탭으로 열고 닫기(바깥 누르면 닫기) |
| 외관 건물 강조 | hover 시 강조 | 없음. 건물을 누르면 바로 들어감(지금도 클릭으로 들어감) |
| `title` 말풍선(30여 곳) | 마우스를 올려야 보임 | 아래 규칙으로 정리 |
- `title` 정리 규칙
  - **잘린 글을 다 보여 주는 title**(직원 이름·업무 제목 `StaffCard` 37·120행, 최근 활동 `DashboardPanels` 206행, 작업 폴더 `StaffPanel` 303·681행): 폰에서는 줄임 대신 **2줄까지 보이기**(`phone:line-clamp-2`) 또는 누르면 펼침.
  - **설명을 담은 title**(고용 템플릿 설명 `HireDialog` 191행, 장비 MCP·스킬 설명 `EquipmentTab` 64·87행): 이름 아래 `text-muted-foreground text-xs` 한 줄로 보이기.
  - **버튼 동작 설명**(직원 패널 멈추기·이어서·끼어들기 457~483행, 플랜 "지금 확인" `PlanUsageCard` 80행): 버튼 라벨이 이미 있으므로 폰에서는 생략. 단축키(Esc·Enter·⌘) 안내는 지운다.
  - **폭 조절 손잡이**(`StaffPanel` 188행): 폰에서 손잡이 자체를 숨김.
  - `title`은 그대로 남겨 두고(PC·태블릿 마우스용), 폰에서만 위 방식으로 보이게 한다.

### 5-3. 키보드 가림
- WebView 뷰포트 `interactive-widget=resizes-content`(박패턴 1-2절) + 안드로이드 `windowSoftInputMode=adjustResize`로 **키보드가 열리면 화면 높이가 줄게** 한다.
- 키보드가 열려 있는 동안 **`PhoneTabBar`를 숨긴다**(입력칸이 키보드 바로 위에 붙도록). `visualViewport` 높이 변화로 판단.
- 입력칸이 아래에 붙는 곳(단체방 `Composer`, 직원 패널 지시 입력, 회의 주제)은 그대로 아래에 두고, 시트 안 입력칸(고용·카드 만들기·예약)은 포커스되면 `scrollIntoView({block:'nearest'})`.
- **Enter = 줄바꿈, 보내기는 버튼.** 소프트 키보드에는 Shift가 없어 지금 PC 규칙(Enter 보내기)이면 여러 줄을 쓸 수 없다. 하드웨어 키보드가 붙은 태블릿은 PC 규칙 그대로.
- 안내 문구의 단축키(`⌘+Enter 줄바꿈`, `Esc 멈추기`, `/ 입력`)는 폰에서 숨긴다.

### 5-4. 안전 영역
- 뷰포트 `viewport-fit=cover`(박패턴 1-2절). 
- `PhoneTopBar` 위: `padding-top: env(safe-area-inset-top)`(상태 표시줄·카메라 구멍).
- `PhoneTabBar` 아래: `padding-bottom: env(safe-area-inset-bottom)`(제스처 바). 아래 시트(더보기·대화상자)도 같은 값을 아래 패딩에 더한다.
- 가로 화면: 좌우 `env(safe-area-inset-left/right)`를 상단 바·아래 탭·본문에 준다. 사무실 지도 캔버스는 안전 영역 안쪽 크기로 맞춘다(`ResizeObserver`가 이미 부모 크기를 따름).
- 직원 패널 시트는 전체 화면이므로 위·아래 안전 영역을 모두 준다.

## 6. PC 전용 동작 (프로토콜 v2 `422 pc_only`, 박패턴 "어댑터가 대신")
화면 코드는 그대로 두고 **어댑터가 대체 동작을 띄워 같은 모양의 값을 돌려준다**(박패턴 0절 3번). 대체 화면은 기존 부품(`Dialog`=아래 시트, `Input`, `Button`)만 쓴다.

| 메서드 | 부르는 곳 | 폰 동작 | 문구 |
|---|---|---|---|
| `pickFolder` | `HireDialog` 90행 · `LabSection` 74행 · `ManualsPage` 152행 · `StaffPanel` 674행(작업 폴더) | **경로 입력 시트**(`PathInputSheet`): 제목 "작업 폴더", `Input`(placeholder "PC의 폴더 경로 · 예: ~/projects/app") + **최근 폴더 목록**(직원 작업 폴더·랩 폴더를 중복 없이 최근 순, 줄 `min-h-12` 버튼) + `선택`·`취소`. 취소면 `null` | 보조 줄: "폴더 고르기 창은 PC에서만 열려요. 경로를 적거나 최근 폴더에서 골라 주세요." |
| `pickFiles` | `RefDocsEditor` 50행(참고 문서) | 같은 시트, 여러 줄 입력(한 줄에 경로 하나) | "파일 고르기 창은 PC에서만 열려요. 경로를 한 줄에 하나씩 적어 주세요." |
| `openAttachment` | `attachments.tsx` 87·98행 | 이미지: 지금처럼 확대 보기. 파일·"기본 앱으로 열기": **휴대폰에 내려받기**(`download_file` 힌트, 셸이 처리) | 버튼 라벨 폰: "휴대폰에 저장" |
| `resumeInTerminal` | `StaffPanel` 280행 | 버튼은 보이되 누르면 안내 | "터미널은 PC에서 열어 주세요." (기존 `resumeError` 자리에 표시) |
| `openClaudeLogin` | `Onboarding` 151행 | 안내 | "Claude 로그인은 PC에서 해 주세요. PC 화면의 Claude Office 첫 실행 안내를 따라 주세요." |
| `remoteQr` | `RemoteSection` 332행 | QR을 휴대폰에 보여 주지 않음 | "연결 QR은 PC 화면에서만 볼 수 있어요." |
- 안내는 새 토스트를 만들지 않고 **그 버튼 바로 아래 `text-muted-foreground text-xs` 한 줄**로 보인다(지금 `resumeError`와 같은 방식).
- 최근 폴더 목록의 출처(직원 `cwd`·랩 `cwd`만 쓸지, PC가 따로 기록할지)는 **[확인 필요]**(정리드·강백엔). 스냅샷에 이미 있는 값만으로도 목록을 만들 수 있다.

## 7. 연결 상태

### 7-1. 연결 끊김 배너 (board-banner.png)
- 자리: `PhoneTopBar` 바로 아래, 본문 위. 끊겼을 때만 보인다.
- 모양: 기존 경고 배너와 같은 토큰 — `border-b border-status-waiting/40 bg-status-waiting/10 px-3 py-2 text-xs`, 앞에 `WifiOffIcon size-4 text-status-waiting`, 오른쪽 `Button size="sm" variant="outline"` "다시".
- 문구
  | 상태 | 문구 |
  |---|---|
  | 이벤트 스트림이 끊겨 재연결 중 | `PC와 연결이 끊겼어요. 다시 연결하는 중… · 10:24에 마지막으로 받은 화면이에요` |
  | 응답 없음(시간 초과) | `PC에 닿지 않아요. PC가 잠자기 중이거나 Claude Office가 꺼져 있을 수 있어요.` |
  | 다시 연결됨 | 같은 자리 `border-status-working/40 bg-status-working/10` `다시 연결됐어요`, 1.5초 뒤 사라짐 |
- 끊긴 동안 **본문 조작을 막는다**(`pointer-events-none` + `opacity-60`). 마지막 화면은 계속 보인다. 결재·지시가 늦게 들어가 엉뚱하게 처리되는 일을 막기 위해서다.
- 토큰 폐기·잠김·인증서 불일치 같은 **다시 연결해야 하는 상태**는 안드로이드 셸(임안드)의 연결 화면 몫이다. 1.0 상태 화면을 셸이 그대로 쓰면 된다(`android-design.md` 5절).

### 7-2. 연결이 끊기는 설정 바꾸기 (기획서 "연결 끊김 방지")
`RemoteSection`의 **원격 끄기(`setRemoteEnabled(false)`)·포트 바꾸기·QR 다시 만들기(`regenerateRemoteQr`)**를 폰에서 누르면 바로 실행하지 않고 확인창(아래 시트)을 먼저 띄운다.
- 제목: `이 휴대폰 연결이 바로 끊겨요`
- 내용: 끄기 → `원격 연결을 끄면 이 휴대폰도 바로 끊기고, 다시 켜려면 PC 앞에서 켜야 해요.` / QR 다시 만들기 → `새 QR을 만들면 지금 연결된 휴대폰이 모두 끊겨요. 다시 쓰려면 PC 화면의 새 QR을 찍어야 해요.`
- 버튼: `취소` · `끊고 진행`(`Button variant="destructive"`). 진행 시 프로토콜의 `confirm: true`를 붙여 보낸다.

## 8. 태블릿 (840dp 이상, PC 레이아웃 그대로) — 폭에서 깨지는 곳
| 곳 | 문제 | 처리 |
|---|---|---|
| 직원 패널 + 대시보드 | 패널 380px + 사이드바 176px가 빠지면 본문이 좁아짐(800에서 170px, 1024 가로에서도 470px) | 본문이 480px 미만이 되면 패널을 겹쳐 띄우기(오버레이). 폰 시트와 같은 컴포넌트 재사용 |
| 사무실 지도(세로) | 폭 맞춤이라 아래가 빔 | 처음 맞춤을 화면 전체 기준으로 |
| 상단 바 | 맥 신호등 자리 `pl-20` | 안드로이드에서는 `pl-3`(`win:`과 같은 방식으로 `android:` 또는 셸에서) |
| 단축키·hover | 하드웨어 키보드·마우스가 없을 수 있음 | 5-2·5-3절 규칙을 **터치 기기**(`pointer: coarse`)면 폰·태블릿 모두 적용 |

**[확인 필요] 기준 폭:** 기획서는 840dp로 나누지만, 흔한 세로 태블릿(800dp 안팎)은 폰 배치가 된다. 캡처로 보면 800 세로에서도 PC 레이아웃이 직원 패널만 빼면 쓸 만하다. 두 가지 중 하나를 정해야 한다.
1. 840 유지(세로 태블릿 = 폰 배치). 단순하다.
2. 기준을 **본문 폭 600dp 이상**(=창 폭 776 이상)으로 낮추고 직원 패널만 시트로. 세로 태블릿도 PC 모습이 된다.
- 권고: **1번**(기획서 그대로). 세로 태블릿에서도 아래 탭이 더 손에 맞는다.

## 9. 최가독 구현 체크리스트 (요약)
1. `PhoneShell` · `PhoneTopBar` · `PhoneTabBar` · `MoreSheet` · `ConnectionBanner` · `PathInputSheet`(어댑터용) 새로 만들기 — 모두 기존 부품·토큰만 사용
2. UI 부품 `phone:` 규칙: `Page`(패딩·actions 줄), `DialogContent`(아래 시트), 버튼·셀렉트 높이, 입력 16px
3. feature 수정(클래스·문구 위주): `OfficeMap`(HUD 접기·안내 문구·미리보기 탭), `OfficeScene`(핀치·꾸미기 잡는 영역), `StaffPanel`(시트 폭·손잡이 숨김·단축키 문구), `BoardPage`(칸 snap·칸 옮기기 셀렉트), `PayrollPage`(표 가로 스크롤), `SchedulePage`·`MeetingPage`·`OrgPage`·`Dashboard(Panels)`(크기 클래스), `ChatPage`(Enter 규칙·문구), `RemoteSection`(확인창·QR 안내), `attachments.tsx`(저장 라벨·끌어놓기 문구)
4. 키보드: 탭 바 숨김, Enter = 줄바꿈. 안전 영역 패딩
5. 둘러보기 `data-tour`를 아래 탭·더보기에
6. 확인: 업무 모드 탭 교체, 뒤로 가기 순서, 데스크톱 화면이 바뀌지 않음(`phone:`만 사용)

## 10. 확인 필요
| # | 내용 | 담당 |
|---|---|---|
| 1 | 폰/태블릿 기준 폭(8절, 권고: 840 유지) | 리드 |
| 2 | 경로 입력 시트의 최근 폴더 출처 | 정리드·강백엔 |
| 3 | 폰 Enter = 줄바꿈으로 바꾸는 것(PC와 다름) 동의 | 리드 |
| 4 | 미리보기에서 직원 패널 시트의 닫기(X)가 보이지 않았다. 시트로 바꿀 때 X가 오른쪽 위에 보이는지 구현 시 확인 | 최가독 |
