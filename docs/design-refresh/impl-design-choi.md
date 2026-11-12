# 구현 설계안 — 모바일 1안 · 장비·프로필 카드형 (최가독, 가독성·단순함·재활용)

> 박패턴 안과 합의하지 않고 독립으로 썼다. 코드는 고치지 않았다. 최종 선택은 정리드.
> 읽은 것: `ChatPage.tsx`(머리·`RoomStatusStrip`·`Composer`), `StaffPanel.tsx`(`PanelBody`·`Profile`), `EquipmentTab.tsx`, `PhoneShell.tsx`, `index.css`(변형), `layoutState.ts`, `pop-menu.tsx`, 시안 HTML·인계 메모.
> 시안 PNG는 보지 않고 HTML·메모 글로만 확인했다.

---

## A. 모바일(폭 600 미만) 대화방·직원 패널 — 1안 "헤더·입력창 축소형"

### ① 바꿀 파일·새 컴포넌트
| 파일 | 변경 |
|---|---|
| `index.css` | 변형 1개 추가: `slim` = `[data-layout=phone]:not([data-split]):not([data-short])` (폭 600 미만 세로 폰). 주의: 이미 `compact:`(좁은 데스크톱 창)가 있어 이름을 피했다 |
| `features/ChatPage.tsx` | 머리 4줄에 `slim:hidden`, 새 `RoomBar`를 `hidden slim:flex`로 추가(분할이 이미 쓰는 "한 벌 숨기고 하나 더" 방식). `Composer`는 분할용 compact 클래스를 `split:` → `portrait:`로 넓힘 |
| **새** `features/ChatRoomBar.tsx` | 46px 한 줄: `방이름 ▾`(방·회의실 목록) · 일하는 직원 얼굴 겹침 · ⓘ(방 설명) · 🔍. 목록·ⓘ는 기존 `PopMenu`를 쓴다 |
| **새** `RecipientChip` (Composer 안 작은 함수) | 받는 사람 칩을 입력칸 안 앞쪽에. 기존 `Recipients`의 계산(`parsed`·`staffOf`)을 그대로 쓰고 모양만 작게 |
| `layout/PhoneShell.tsx` | `PhoneTabBar` 높이 `h-16` → `slim:h-[52px]` (분할의 `split:h-[50px]`는 그대로) |
| `features/StaffPanel.tsx` `PanelBody` | 머리(≈504) `slim:` 56px, 미니 뷰 `slim:size-10`, 결재 영역(≈591)을 `slim:`에서 한 줄 띠로, 진행 줄(≈682)을 탭 줄(≈642) 오른쪽으로 |
| **새** `features/ApprovalStrip.tsx` | 결재 한 줄 띠: `⏳ N건 · {첫 건 approvalHeadline}` — 누르면 기존 카드 목록이 펼쳐짐 |
| `mobile.test.mts` | 변형·구조 시험 추가 (⑤) |

데스크톱·폴드는 `slim:`이 안 걸리므로(데스크톱은 `data-layout` 자체가 없고, 폴드는 `data-split`) 클래스 추가만으로 바뀌지 않는다.

### ② 상태·데이터 흐름 (재사용)
- **방·구성원 계산**: 지난 폴드 작업에서 뽑은 `chatRoomHooks.ts`를 `RoomBar`가 그대로 쓴다 (`RoomTabs`·`RoomStatusStrip`·`ChatSide`와 4번째 사용처. 새 계산 없음).
- **방 이름 ▾ 목록·ⓘ**: `PopMenu`(바깥 누르기·Esc·뒤로 가기 처리 포함) 재사용. 목록 안은 `RoomTabs`의 항목 렌더를 그대로 넣는다 — 새로 그리지 않는다.
- **찾기**: 기존 `isSearchOpen`·store의 `chatSearchRequest`(분할이 쓰는 신호)를 그대로. `RoomBar`의 🔍는 그 신호를 보낸다.
- **얼굴 겹침**: `RoomStatusStrip`이 이미 하는 "일하는 중·확인 필요 사람" 선별을 훅으로 한 번 더 빼서 공유 (2곳이 쓰게 되는 시점이라 이때 추출).
- **결재 띠**: `staff.approvals`·`approvalHeadline`(지난 결재 카드 작업에서 만든 것) 재사용. 펼침 상태는 `ApprovalStrip` 지역 `useState` — store에 올리지 않는다.
- **진행 상태**: 탭 줄 오른쪽에 사본 하나 더(`hidden slim:block`), 원래 자리는 `slim:hidden` — 폴드의 "진행 줄·토큰" 처리와 같은 방식.
- 입력창: 분할의 1줄 입력 + ＋ `PopMenu`를 `portrait:`로 넓혀 같이 쓴다. 새 입력 컴포넌트를 만들지 않는다.

### ③ 화면 분기
- **CSS만으로**: 새 `slim:` 변형. JS 판정·`useLayout` 변경 없음 (화면(feature)이 `useLayout`을 못 쓰게 한 기존 규칙과 맞다).
- 분할과 공통인 부분(1줄 입력·＋ 메뉴·`PopMenu`)은 기존 `portrait:`(= 폰 배치 중 가로 폰 아님)로 묶어 클래스가 두 벌 되지 않게 한다. 분할에서만 다른 부분만 `split:`·`side:`.
- 키보드 열림: 기존 `data-keyboard`. 세로 폰은 `typing:`이 안 걸려(가로 폰 전용) 입력창이 이미 키보드 위에 붙는 현행 동작을 유지한다.
- 안드로이드 `WebShell.kt`: 같은 renderer를 띄우고 폭은 CSS px로 `install.ts`가 판정하므로 Kotlin 변경은 없을 것으로 본다. 확인할 것은 하나 — 360·390·412dp에서 `data-split`이 켜지지 않는지(599/600 경계).

### ④ 위험·영향 범위
1. **DOM 사본이 늘어난다**(머리·진행 줄). `data-tour`·`id` 중복이 생기면 투어가 엉킨다 → 새 사본에는 `data-tour`를 달지 않는다(폴드에서 이미 지킨 규칙).
2. `portrait:`로 넓힌 입력 영역은 **폴드 분할 화면도 같이 바뀌는 곳**이라, 분할 캡처 회귀 확인이 필수다.
3. 직원 패널 미니 뷰는 Phaser 캔버스(`LiveMiniView`)다. 112px → 40px로 줄여도 그려지는지 불확실하다 → 안 되면 미니 뷰를 숨기고 기존 아바타 이미지로 대체 (구현 때 확인).
4. 시안에 상단 앱 바(PhoneShell 48px)·`NavTabs`가 남는지는 HTML만으로 단정하지 못했다. 시안대로 남긴다면 "46px 한 줄"은 대화방 **머리**만이고 총 높이는 줄지 않는다 → 정리드·디자인 확인 필요.
5. 결재 띠가 한 줄이라 요청자(`requestedBy`)·대기 이유(`WaitReasonLine`)가 접힌다 → 펼친 카드에서는 그대로 보이게 둔다.

### ⑤ 검증
- **시험** (`mobile.test.mts` 추가): (a) `slim` 변형 정의가 `data-split`·`data-short`를 제외하는지 CSS 문자열 검사(분할 변형 시험과 같은 방식), (b) `ChatPage`가 `slim:` 클래스·`RoomBar`를 갖고 머리 4줄에 `slim:hidden`이 있는지 구조 검사, (c) `chatRoomHooks`의 얼굴 선별 훅 표 시험(일하는 중·확인 필요·전체 방), (d) `ApprovalStrip` 건수·첫 줄·펼침.
- **회귀**: 기존 `npm test`·`tsc`가 수정 없이 통과해야 한다(데스크톱 경로 무변경 근거).
- **화면**: 390×844 · 360 · 412, 599 vs 600 경계, 624(분할 회귀), 데스크톱 1280(전후 동일), 라이트·다크, 대화방·직원 패널 각각 + 결재 있음·없음, 키보드 열림. 안드로이드는 에뮬레이터 1회.

---

## B. 직원 패널 장비·프로필 — 1안 "카드형"

### ① 바꿀 파일·새 컴포넌트
| 파일 | 변경 |
|---|---|
| `features/EquipmentTab.tsx` | 8개 칩 격자를 카드 목록으로. `TOOL_PRESETS` 표는 **남기고** 각 줄에 `group`·`level` 두 칸만 추가 |
| **새** `features/equipmentLevels.ts` (순수) | `levelOf(eq, group)`·`setLevel(eq, group, level)` — 지금 `presetOn`·`togglePreset`의 로직을 그룹 단위로 감싼 것 |
| **새** `features/EquipCard.tsx` | 카드 한 장: 아이콘·제목·한 줄 설명 + 기존 `Segmented`(HireDialog가 쓰는 부품) 3칸 + 선택한 칸의 설명 |
| `features/McpSection.tsx` | 문구(연결된 서비스 등)와 접는 '개발자용 자세히'만. 구조 변경 없음 |
| `features/StaffPanel.tsx` `Profile` | 결재 방식 줄은 **요약 표시**로 줄이고 카드로 안내 (`ApprovalStatusChips`는 유지) |
| `shared/i18n/dict/*`(4개 언어) | 인계 메모 53개 문구를 같은 키 모양으로 반영, 영어 도구 이름은 접은 자세히로 |

### ② 상태·데이터 흐름 (재사용) — **저장 데이터는 그대로**
- 카드 → `eq.allowedTools`·`eq.disallowedTools`를 `setEq`로 바꾸고 기존 **저장 버튼**(`setEquipment`)으로 저장. 저장 형식·IPC·`equipment` 필드 변경 없음.
- **3칸 ↔ 기존 묶음**(메모의 대응표와 같게): 막기 = deny 묶음 켬 · 결재 받기 = 둘 다 꺼짐 · 결재 없이 = allow 묶음 켬. `setLevel`은 지금 `togglePreset`이 하던 "반대 묶음 함께 풀기"를 그대로 한다 → **서로 꺼지는 동작이 카드 선택 한 번으로 눈에 보이게** 된다. 로직을 새로 짜지 않고 기존 두 함수를 그룹 단위로 감싸는 것이 핵심이다.
- 카드 5장: 파일 만들기·고치기(막기 없음 → 2~3칸) · 인터넷 검색 · 프로그램 실행 · 화면 찍기(맥, 2칸) · 그 아래 체크 2개(보기만 하는 실행 = `READ_ONLY_BASH` 허용, 위험한 것 항상 막기 = `RISKY_BASH` 금지 — 기존 두 줄 그대로).
- **애매한 저장값**(예: Edit만 허용되고 Write는 아님, allow·deny 동시): `levelOf`가 `'custom'`을 돌려 칸을 선택하지 않고 "직접 고름"으로 표시. 칸을 누르면 묶음 단위로 덮어쓴다. allow·deny 동시면 deny 우선으로 보인다(현행 판정에 맞춰 구현 때 확인).
- 휴대폰: 도구 권한은 PC만 바꾼다 → 카드는 지금처럼 `IS_MOBILE_SHELL`이면 `disabled` + `PcOnlyState`.

### ② -2. 프로필 `acceptEdits` vs 장비 "파일 수정 자율" — 카드에 담는 법
두 값은 **다른 저장소**다(`staff.approvalMode` 대 `equipment.allowedTools`)이고 효과도 다르다(작업 폴더 안만 + 위험 경로는 묻고 + 다른 PC 위임 거절 vs 경로 무관 허용·가드 없음). 메모 제안("한 곳에서만")은 효과가 달라 **그대로 합치면 안전 범위가 넓어진다.**

**추천**: 파일 카드를 3칸으로 둔다.

| 칸 | 의미 | 저장 |
|---|---|---|
| 결재 받기 | 매번 묻는다 | `approvalMode: 'ask'` · Edit 묶음 허용 아님 |
| 작업 폴더 안은 결재 없이 | 이 폴더 안 수정만 자동. `.git/hooks` 같은 위험한 곳은 계속 묻는다 | `approvalMode: 'acceptEdits'` · Edit 묶음 허용 아님 |
| 어디서든 결재 없이 | 폴더 밖·위험한 곳도 묻지 않는다 (경고색) | Edit 묶음 허용 (`approvalMode`는 그대로 둠) |

- 상태 판정 우선순위: 어디서든(Edit 묶음 허용) > 작업 폴더 안(`acceptEdits`) > 결재 받기.
- 저장 경로가 둘이라 **초안·저장 버튼을 하나로 맞춘다**: 카드는 `eq`와 지역 `draftMode` 둘을 바꾸고, 저장 버튼이 `setEquipment`와(바뀐 경우만) `updateStaff({approvalMode})`를 함께 호출. 프로필 쪽을 즉시 저장하는 지금 방식과 섞이지 않게, 프로필은 요약만 보여 주고 "장비에서 바꾸기"로 이동시킨다.
- 가운데 칸 설명에 제약을 쉬운 말로: 다른 PC에 맡긴 일에서는 결재를 받는다 · GPT 직원은 같은 기준으로 판단한다(`codex.ts` `editNeedsAsk`). 휴대폰은 `acceptEdits`를 못 고르므로 가운데 칸 🔒(HireDialog의 기존 `disabled` 규칙과 같게).
- **대안**(더 단순, 비추천): 파일 카드는 2칸(받기·없이)만 두고 프로필 결재 방식은 지금처럼 따로 둔다 → 구현은 가장 작지만 "같은 일을 두 곳에서"라는 시안의 문제가 그대로 남는다.

### ③ 화면 분기
- 새 변형 없음. 카드는 한 벌 마크업이고, 좁은 폭에서 세로로 쌓이는 정도만 `phone:`·`narrow:`(기존)로 처리. 3칸 라벨이 길어("작업 폴더 안은 결재 없이") 좁으면 칸 대신 세로 라디오로 접히도록 `narrow:flex-col`.
- 폴드 분할의 직원 패널 오른쪽 칸에서도 같은 컴포넌트가 그대로 보인다.

### ④ 위험·영향 범위
1. **안전 범위 오해**가 가장 큰 위험이다. "어디서든 결재 없이"는 위험 경로 가드가 없으므로 경고 문구·색을 빼먹지 않는다. 가운데 칸을 기본 추천으로 안내하는 것도 고려.
2. 기존 저장값 호환: 이미 `allowedTools`에 임의 조합이 있는 직원은 `custom`으로 나온다 → 숨은 값을 덮어쓰지 않게 사용자가 누르기 전에는 바꾸지 않는다.
3. 두 저장소 동시 저장의 부분 실패(장비는 저장되고 모드는 실패) → 순서를 장비 → 모드로 하고 실패 시 안내.
4. 4개 언어 53문구 번역 품질·키 누락(`i18n.test`가 잡는다). 영어 도구 이름은 지우지 않고 접는다.
5. `McpSection`은 문구만 바꿔 영향이 작다. 직접 추가·공용 로그인은 PC 전용 표시 유지.

### ⑤ 검증
- **순수 함수 시험** (`equipmentLevels.test.mts`, 표로): 막기/받기/없이 ↔ 저장 배열 왕복, 반대 묶음 자동 해제, 다른 도구 값 보존, `custom` 판정(부분 허용·allow·deny 동시), 파일 카드 3칸 ↔ `approvalMode`·Edit 묶음 조합.
- **저장 불변 시험**: 카드로 만든 `Equipment`가 지금 칩으로 같은 상태를 만든 결과와 **바이트 단위로 같다**(기존 `TOOL_PRESETS` 기준 대조).
- 사전: `i18n.test` 4개 언어 키·`{변수}` 일치. 영어 도구 이름이 화면 본문에 다시 안 나오는지 grep 시험(접는 자세히는 허용).
- 화면: 카드 5장 각 상태·휴대폰 🔒·`custom` 표시·가운데 칸 설명, 라이트·다크, 390·624·데스크톱. 시안 `?sheet=a`와 나란히 비교.

---

## 한 줄 추천
- **A**: 새 변형 `slim` 하나와 새 부품 `ChatRoomBar`·`ApprovalStrip` 둘 — 나머지는 폴드 분할의 `PopMenu`·`chatRoomHooks`·"한 벌 숨기고 하나 더" 방식을 재사용한다.
- **B**: 칩 표(`TOOL_PRESETS`)를 그대로 두고 그룹·단계 칸만 얹는다. 파일 카드는 3칸(받기 / 작업 폴더 안 / 어디서든)으로 두 효과를 합치지 않고 나란히 보이게 한다.
