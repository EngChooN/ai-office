# 구현 설계안 — 박패턴 (유지보수성·변경 영향 최소화·검증 가능성)

대상: `/Users/pc-2311001/flitto/poc/claude-office/app` · 코드 수정 없음 · 최가독 안은 보지 않았고 비교하지 않음.
읽은 곳: `layoutState.ts`·`useLayout.ts`·`index.css` 변형, d3b8a74 이후 `ChatPage`(머리·RoomTabs·RoomStatusStrip·Composer 일부)·`chatRoomHooks.ts`·`StaffPanel`의 `side:`/`split:` 부분·`PhoneShell`, `EquipmentTab.tsx` 전문, `equip-profile-terms.md`, 시안 HTML의 1안 마크업.
못 읽은 곳: `WebShell.kt`(경로 못 찾음), 프로필의 결재 방식 UI 위치, `McpSection` 본문, `hired.ts`의 acceptEdits와 장비 Edit 허용의 판정 순서.

---
## A) 모바일(폭 600 미만) 1안 '헤더·입력창 축소형'

### 원칙
폴드 분할(d3b8a74)과 똑같이 **"판정은 순수 함수, 화면은 CSS 변형, 새 요소는 해당 배치에서만 보임"**. 데스크톱·폴드가 안 바뀌는 것을 **구조로 보장**한다.

### ③ 화면 분기 (먼저)
- `layoutState.ts`: `decideLayout`에 `isSlim = isPhone && !isShort && !isSplit`(= 폰 배치·세로·폭 600 미만) 추가. `LayoutState`·`setLayoutState` 같음 비교·`install.ts`의 `data-slim`에 같이 넣는다. **같음 비교에 `isSlim`을 빠뜨리면 회전 때 갱신이 안 되므로** isSplit 때처럼 시험으로 막는다.
- `index.css`: `@custom-variant slim (&:where([data-layout=phone][data-slim] *))` **하나만** 추가. 기존 `phone:`·`short:`·`split:`·`side:`·`typing:`은 건드리지 않는다. 폴드(`data-split`)는 `data-slim`이 안 붙으므로 slim 클래스가 **매칭될 수 없다** → 폴드 무변경이 CSS로 보장된다. 데스크톱은 `data-layout`이 없어 마찬가지.
- 공통 부분(＋ 메뉴 보이기, 첨부 버튼 숨기기)은 이미 있는 `portrait:`(폰·세로, 분할 포함)를 재사용하고, 폴드와 값이 갈리는 높이·크기만 `slim:`을 쓴다. 둘이 같이 매칭되는 곳(분할)에서 우선순위 충돌이 나지 않게 **폭·높이 같은 값은 slim:만, 표시 여부는 portrait:만** 쓴다는 규칙을 둔다.
- 새로 생기는 요소(방 이름 ▾·얼굴 겹침·ⓘ·결재 띠)는 **DOM을 중복 마운트하되 `hidden slim:flex`로 보임/숨김**한다. 입력 `textarea`·검색·메시지 목록은 **절대 두 벌 만들지 않는다**(포커스·키보드가 풀림). 중복되는 것은 부수효과가 없는 표시용(방 탭 줄·구성원 줄·받는 사람 칩)뿐이다. 이 규칙은 기존 시험 "feature는 `useLayout` 금지"와도 맞는다(훅 없이 CSS만).

### ① 바꿀 파일·새 컴포넌트
| 파일 | 변경 | 이득 / 추가 복잡도 |
|---|---|---|
| `layout/layoutState.ts`, `mobile/install.ts`, `index.css` | `isSlim`·`data-slim`·`slim:` | 판정 시험 가능 / 속성 하나 |
| `features/ChatSlimBar.tsx` (신규) | 46px 한 줄: 방 이름 ▾(`PopMenu`로 방·회의실 목록) · 일하는 직원 얼굴 겹침(최대 3 + "+n") · ⓘ(PopMenu로 방 설명) · 결재 대기·🔍·＋는 기존 PhoneTopBar 것 | 기존 `useRoomList`·`useRoomPeople`·`PopMenu`(분할에서 만든 body 고정 메뉴) 재사용 → 새 계산 0 |
| `features/ChatPage.tsx` | 머리 블록(제목·설명·`RoomTabs`·`RoomStatusStrip`)에 `slim:hidden`, 위에 `<ChatSlimBar/>`. Composer: 받는 사람 칩을 입력칸 안으로(`Recipients` inline 변형을 입력 래퍼 안에 한 번 더, 기존 줄은 `slim:hidden`), 매뉴얼·명령·예약은 이미 있는 ＋ `PopMenu` 안으로(`portrait:` 로 노출) | 기존 `split:hidden` 패턴과 같은 모양 |
| `layout/PhoneShell.tsx` | 하단 탭 `slim:h-[52px]`, 진행 상태(`● n 작업`)는 탭 줄 오른쪽(StaffPanel 쪽 탭 줄과 같은 문구 컴포넌트 공유) | 클래스만 |
| `features/StaffPanel.tsx` | 머리 `slim:`로 56px(초상 작게·이름+상태·모델·폴더는 `slim:hidden`, 폴더·터미널 이어 하기·누적 비용은 `PopMenu` ⋯ 안으로 — 분할의 ⋯ 메뉴 항목을 **같은 배열 하나로** 공유), 결재: `features/ApprovalBand.tsx`(신규, 한 줄 띠: "결재 n건 · 요약 · 승인 · 보기") | 아래 참고 |
| 진행 상태 | 탭 줄 오른쪽 `● 작업 중` — 기존 상태 점 컴포넌트 재사용 | |

- **결재 띠**: 띠는 `approval.effectI18n`(1.2.0 '결과 한 줄')의 `approvalHeadline`을 그대로 제목으로 쓴다. "승인"은 기존 `window.office.decide(id, true)`, "보기"는 지금의 카드 목록을 펼치는 `useState` 하나. **질문(`questions`)·피어 변경 묶음은 띠에서 답하지 않고 "보기"만**(고를 게 있어서). 결재가 여럿이면 "결재 n건"만 띠에 두고 승인은 보기 안에서(한 줄 승인이 엉뚱한 건을 승인하지 않게 **맨 앞 1건에만** 붙이고 위험 표시(`waitReason`)가 있는 건에는 승인 버튼을 띠에 두지 않는다 — 위험한 건은 원문을 확인하고 승인해야 하므로).
- 폴드 분할의 직원 패널(`side:`)과 슬림은 **서로 다른 배치**라 같은 컴포넌트를 쓰되 클래스 변형이 겹치지 않게 한다.

### ② 상태·데이터 흐름
- 새 store 상태 없음. 방 전환은 기존 `setChatRoom`, 방 목록·미읽음·결재 점은 `useRoomList`, 구성원은 `useRoomPeople`, 메뉴 열림은 `PopMenu` 내부 상태, 결재는 `staff.approvals`. 입력 `draft`·멘션 파싱(`parseMentions`)은 그대로이고 칩은 `parsed`를 **표시만** 한다.
- 키보드: 기존 `data-keyboard`·`--ime`. 슬림에서 키보드가 열리면 하단 탭이 이미 숨는다(`PhoneTabBar`). 머리 46px은 유지(가로 폰의 `typing:hidden`은 슬림에 해당 없음).

### ④ 위험·영향 범위
1. 폴드·데스크톱 회귀 — 구조로 차단(`data-slim`이 폴드에 안 붙음) + 캡처 비교.
2. **글꼴 크기**: 안드로이드 시스템 글꼴 크게(1.3배)에서 46·52·56px 고정 높이가 글자를 자른다 → `h-[46px]` 대신 `min-h-[46px]`로.
3. 입력칸 안 받는 사람 칩이 길면 입력 폭을 먹는다 → 칩 `max-w-[40%] truncate`, 3명 이상은 "+n".
4. 중복 마운트한 표시 요소의 `aria`·`id` 중복 → 숨긴 쪽은 `aria-hidden`/`inert`가 아닌 `display:none`(slim:hidden)이라 접근성 트리에서 빠짐을 확인.
5. 결재 띠 한 줄 승인: 위 규칙(맨 앞 1건·위험 건 제외) 없이는 잘못 승인 위험 — **이 규칙을 시험으로 고정**.
6. Android WebView: 같은 renderer라 Kotlin 변경은 필요 없을 것으로 본다(`data-*`는 renderer가 붙임). 단 `env(safe-area-inset-*)`·제스처바 18px을 포함한 실제 높이는 에뮬레이터 캡처로 확인(WebShell.kt는 못 읽음).

### ⑤ 검증
- **단위(`scripts/mobile.test.mts` 확장)**: `decideLayout` 표 — (599,900)=slim, (600,900)=split·!slim, (839,900)=split, (840,900)=PC, (390,400)=short·!slim, (360,800)=slim. `setLayoutState`가 `isSlim`만 바뀔 때도 구독자를 깨움. `install.ts`가 `data-slim`을 붙이고 뗌.
- **정적 시험**: 기존 "feature는 `useLayout`/`useIsSplit` 금지" 규칙에 `useIsSlim` 추가. `index.css`에서 기존 변형 정의 6줄이 **바이트 그대로**인지 스냅샷(slim 한 줄 추가만 허용).
- **결재 띠 시험**: 순수 함수 `bandActionOf(approvals)`(띠에 승인을 줄지·대상 id) — 질문·피어·위험·2건 이상·0건 표.
- **화면(오큐에이)**: 390×844·360×780, 글꼴 1.3배, 라이트·다크, 키보드 열림, 방 ▾·ⓘ 메뉴 열림, 결재 띠. 회귀: 624×986(폴드)·데스크톱 1280 캡처가 변경 전과 같음. 입력 포커스 중 키보드가 열려도 포커스 유지.

---
## B) 직원 패널 장비·프로필 '카드형'

### ① 바꿀 파일·새 컴포넌트
| 파일 | 변경 | 이득 / 추가 복잡도 |
|---|---|---|
| `shared/toolPolicyRows.ts` (신규, 순수) | 행 정의 + `levelOf(eq, row)` + `withLevel(eq, row, level)` | 3칸 동작을 node로 시험. 지금 `EquipmentTab` 안 `presetOn`/`togglePreset`을 옮긴 것(동작 동일) |
| `features/EquipmentTab.tsx` | `TOOL_PRESETS` 칩 8개 → `<PolicyCard/>` 행 목록. 연결 서비스·매뉴얼·체크 칸은 카드로 감싸고 문구만 교체 | |
| `features/PolicyRow.tsx` (신규) | `[막기 · 결재 받기 · 결재 없이]` 3칸(라디오 그룹), 못 고르는 칸은 비활성, "직접 고름" 표시 | 쓰는 곳이 한 곳이라 범용 `ui/`가 아닌 `features/` |
| `McpSection.tsx` | 카드 껍질과 문구만(상태·출처 이름은 사전 키 교체). 로직 불변 | 변경은 사전 중심 |
| `StaffPanel.tsx` 프로필 | 카드 배치·결재 방식 문구·"실적" 문구. 장비의 파일 수정 줄과 연결(아래) | 1261줄 파일이라 **프로필 블록을 파일 밖으로 빼는 일은 이번에 하지 않고** 해당 JSX만 수정 |
| `shared/i18n/dict/*.ts` | `equipment.preset.*` 8개×(이름·hint·detail) 교체·추가, 쉬운 말 53개 4개 언어 | 키 이름은 유지해 호출부 변경 최소, 새 칸 이름 키 3개(`policy.block/ask/auto`) 추가 |

### ② 상태·데이터 흐름 (저장 데이터 불변)
- 상태는 기존 `eq: Equipment` 한 벌과 `handleSave`(이대로 지급) 그대로. 카드는 **`eq`를 읽어 단계를 계산하고, 누르면 `allowedTools`·`disallowedTools`만 바꾼다.** 새 필드·스키마·IPC 없음.
- 행(row) 정의 = 기존 프리셋 8개와 1:1:
  - 3칸: 인터넷 검색(`deny[WebSearch,WebFetch]`·`allow[…]`), 프로그램 실행(`deny[Bash]`·`allow[Bash]`)
  - 2칸(막기 없음): 보기만 하는 실행(`allow[READ_ONLY_BASH]`), 화면 찍기(`allow[capture_screen]`), 파일 수정(`allow[Edit,Write,MultiEdit,NotebookEdit]`)
  - 2칸(결재 받기/막기): 위험한 실행(`deny[RISKY_BASH]`)
  - `withLevel`: `block` = 그 행의 deny 추가·allow 제거, `ask` = 둘 다 제거, `auto` = allow 추가·deny 제거. **자기 행의 도구 이름만 건드리고** 목록의 다른 값(MCP 도구 이름·설정에서 온 값)은 그대로 둔다. 지금 `togglePreset`과 효과가 같다.
  - `levelOf`: deny가 모두 있고 allow가 하나도 없으면 block, allow가 모두 있고 deny가 없으면 auto, 둘 다 비면 ask, **그 밖(일부만 있거나 둘 다 있음)은 `custom`** → 화면에 "직접 고름", 아무 칸도 선택 표시 안 함. 칸을 누르면 그 행이 정규화된다. 옛 데이터를 말없이 바꾸지 않는다.
- 모바일 셸: 기존대로 도구 권한은 PC 전용(`PcOnlyState`, 칸 비활성) — 행 컴포넌트에 `disabled` 전달.

### ③ 화면 분기
- 모바일/PC 분기는 기존 `IS_MOBILE_SHELL` 그대로. 카드 자체는 반응형 한 벌(`narrow:`·`phone:` 변형으로 3칸 라벨 줄바꿈). 폴드 `side:`의 왼쪽 칸은 장비 탭에 영향이 없다(오른쪽 칸 본문). A의 `slim:`과 **독립**이라 서로 영향 없음.

### 파일 수정 카드: 프로필 'acceptEdits' vs 장비 'Edit 허용' — 제안
두 설정은 **효과가 다르므로 한 칸으로 합치지 않는다**(메모의 "한 곳으로 합치기"는 불가). 또 저장 방식이 다르다: 장비는 "이대로 지급"에서 저장하는 초안(`eq`)이고 결재 방식(`approvalMode`)은 프로필의 다른 경로다. **한 컨트롤이 두 저장소를 쓰면 저장 시점이 어긋난다**(한쪽만 저장된 채 화면은 맞는 척).
| 안 | 내용 | 평가 |
|---|---|---|
| **나(추천)** | 파일 수정 행은 장비 소관인 2칸만: `[결재 받기 · 어디서든 결재 없이]`. 행 아래에 읽기 전용 한 줄로 프로필 상태를 보여 줌: "프로필에서 '작업 폴더 안 수정은 결재 없이'를 켜 두었어요 — 폴더 밖·.git 같은 위험한 곳은 계속 물어요." + "프로필에서 바꾸기 →". '어디서든' 칸 설명에 "중요한 파일(.git 훅 등)도 묻지 않아요" | 저장 경로 둘이 안 섞임, 변경 최소, 차이를 말로 알림 |
| 가 | 3칸 `[결재 받기 · 작업 폴더 안만 · 어디서든]`, 가운데는 `approvalMode`를 즉시 저장 | 한 컨트롤에 즉시 저장+초안 저장이 섞임, "이대로 지급" 안 눌러도 바뀜 → 비추천 |
| 다 | `approvalMode`도 `eq` 초안에 넣어 한 번에 저장 | IPC·타입 변경(범위 밖) |
- 프로필 문구: 메모의 "파일 수정은 결재 없이"는 범위가 **빠져서 장비의 '어디서든'과 같은 말로 읽힌다** → "작업 폴더 안 파일 수정은 결재 없이"로 범위를 문구에 넣을 것을 권한다. GPT 직원은 같은 설정을 `editNeedsAsk`로 판정하고 다른 PC 위임 일에서는 거절되는 점은 ⓘ 한 줄로.
- **확인할 것(정리드)**: 두 설정이 동시에 켜진 직원에서 어느 쪽이 이기는지(`hired.ts` onToolUse 위험 경로 가드가 canUseTool 허용보다 먼저인지). 카드에 "어디서든"이 켜지면 가드가 우회되는지에 따라 경고 문구 수위가 바뀐다.

### ④ 위험·영향 범위
1. **3칸이 저장 동작을 바꿈**: `withLevel`이 `togglePreset`과 같은 결과인지가 핵심 → 아래 동치 시험.
2. 공유 이름 충돌: `Bash`(프로그램 실행)와 `Bash:readonly`·`Bash:risky`는 다른 문자열이라 독립이지만, 행 사이 상호 영향(프로그램 실행 '막기'가 읽기 전용 허용을 무력화)을 화면에서 어떻게 보일지 정해야 함(추천: 막기 상태면 아래 두 행 비활성+"프로그램 실행을 막아서 쓸 수 없어요").
3. '직접 고름' 상태에서 사용자가 의도치 않게 목록을 바꾸지 않게, 정규화는 칸을 누를 때만.
4. 사전 키 이름을 바꾸면 `i18n.test`·호출부가 깨짐 → 기존 키 유지, 새 키만 추가, 쓰지 않는 키는 따로 정리.
5. 쉬운 말 문구가 영어 도구 이름을 지우므로 개발자용 "자세히"(접힘)에 원래 도구 이름을 남김(메모 반영).
6. McpSection 문구 변경은 시험이 문자열에 기대면 깨짐 — 구현 때 grep.

### ⑤ 검증
- **새 `scripts/toolPolicyRows.test.mts`** (표):
  - 행×단계 `withLevel` 결과(allow/deny 배열)가 **기존 `togglePreset`과 같은 결과**임을 같은 입력에서 비교(옛 함수를 시험 안에 복사해 동치 확인, 구현 뒤에는 삭제).
  - 모르는 도구 이름(`mcp__x`)·`Bash:readonly`가 다른 행 조작 후에도 보존됨.
  - `levelOf`: 부분만 있는 데이터·둘 다 있는 데이터 → `custom`, 둘 다 비면 `ask`.
  - 왕복: `withLevel(level)` → `levelOf` = level (모든 행·단계).
  - `Equipment` 직렬화가 변하지 않음(`JSON.stringify` 키 순서 불변).
- **사전**: 새 키 4개 언어·변수 일치(`i18n.test` 자동), 53개 문구가 메모와 일치하는지 표 시험 대신 리뷰.
- **화면(오큐에이)**: 시안 `?sheet=a`와 나란히 캡처 — 데스크톱·390 폭·다크, `custom` 행, 프로그램 실행 막기 상태, 모바일 PC 전용 비활성. 저장 뒤 재열기로 값 유지(저장 데이터 불변) 확인.

---
## 정리드가 정할 쟁점
1. A: 새 요소를 **CSS 중복 마운트(추천)**로 할지, `layout/`에 `SlimFrame`을 두고 마운트 분기할지.
2. A: 결재 띠의 한 줄 승인을 **맨 앞 1건·위험 제외**로 제한할지.
3. B: 파일 수정 카드를 **나안(2칸 + 프로필 상태 안내, 추천)**으로 할지.
4. B: 프로그램 실행 '막기'일 때 아래 두 행을 비활성으로 할지.
5. 프로필 문구를 "작업 폴더 안 파일 수정은 결재 없이"로 범위를 넣을지.
