# 1.3.1 구현 설계안 — 박패턴 (유지보수성·변경 영향 최소화·검증 가능성)

작성: 박패턴 / 대상: 정리드 / 2026-11-13 / 코드는 고치지 않았고, 최가독 안은 받지 않아 비교하지 않았습니다.
읽은 곳: `v131-brief.md`, `chat-header.html`(B안 보완·폭 기준), `connect-handoff.md`, `ChatPage/ChatSide/ChatSlimBar/chatRoomHooks`, `RemoteSection/PeerSection/SettingsPage`, `main/remote/auth.ts·service.ts`, `index.css`(변형 규칙), `i18n.test.mts`.

## 0. 한눈에
| | 단체방 B안 | 휴대폰 연결 1안 |
|---|---|---|
| 핵심 구조 | 방 목록 계산을 `useRoomEntries` 하나로 모으고 **목록(ChatSide)·띠(새 ChatRoomRail)·가로 탭**이 같이 씀. 머리는 `ChatPage` 안에서 줄이고 새 파일은 띠 하나 | 새 폴더 `features/connect/`에 **순수 모델(`shared/connectModel.ts`) + 단계 화면 하나**. 기존 QR·Tailscale·호스트/클라이언트 조각은 export해서 재사용 |
| 자동 접힘 | 대화 칸이 아니라 **대화 영역을 감싼 행의 실제 폭**을 ResizeObserver로 재고, 순수 함수 `roomListMode`로 판정 | — |
| 기존 동작 위험 | 폰 배치(slim·split)가 같은 `ChatSide`를 씀 → 새 props는 기본값이 옛 동작 | 휴대폰 열쇠·QR·결재 권한 경고 흐름을 그대로 유지, 화면 껍데기만 교체 |
| 새 사전 키 | 약 7개(`chat.rooms.*`·`chat.header.summary`) | 약 45개(새 파일 `dict/connect.ts`) + 기존 키 문구 수정 |
| 서버(main) 변경 | 없음 | **선택 1건**: 휴대폰 마지막 접속 시각(`phoneSeenAt`, 메모리만) |
| 두 기능 충돌 | `ChatPage.tsx` 등 채팅 파일만 | `SettingsPage.tsx`·`RemoteSection.tsx`·`PeerSection.tsx`만 → **서로 겹치는 파일 없음, 병렬 구현 가능** (사전은 파일이 다름) |

---

# 기능 1. 단체방 상단 B안 + 자동 접힘

## 1-1. 컴포넌트 나누기 · 상태 위치 · 재활용
현재 사실: 방 목록의 "안 읽은 수·결재 점·선택 여부" 계산이 `RoomTabs`(ChatPage)와 `ChatSide`에 **같은 모양으로 두 번** 있고(`roomKey(key==='all'?null:key)` 포함), B안은 세 번째 표현(띠)을 더합니다.

| 대상 | 변경 | 이번 작업에서의 이득 / 추가 복잡도 |
|---|---|---|
| `chatRoomHooks.ts` | `useRoomEntries(current)` 추가: `[{key, label, group:'all'|'team'|'lab', color, isActive, unread, hasApproval, select()}]` + `useRoomList`는 그대로 둠 | **이득**: 목록·띠·가로 탭 3곳의 계산 일치를 한 곳에서 보장(읽음/결재 규칙이 바뀌어도 한 군데). **복잡도**: 훅 하나(기존 `useRoomList`·`roomKey` 위에 얇게) |
| `shared/chatRoomLayout.ts` **(신규, 순수)** | `roomListMode(containerWidth, pref, prev)`, `summarizeRoomPeople(people)` → `{total, working, chips, hidden}` | **이득**: 접힘 기준·"N명 · M명 일하는 중" 계산을 화면 없이 시험. 기존 `shared/chatRooms.ts`·`chatUnread.ts`와 같은 위치 규칙 |
| `ChatSide.tsx` | 행 그리기를 `useRoomEntries`로 교체. **선택 props 추가(기본값=옛 동작)**: `isDoingShown`(기본 true), `onCollapse?`(있으면 목록 위 «) | **이득**: 폴드 분할·세로 폰 ▾ 메뉴(`ChatSlimBar`)는 코드 수정 0. **복잡도**: props 2개. 데스크톱 B안에서만 `isDoingShown={false}`로 상단 칩과의 중복을 없앰(시안 '대가'에서 지적된 문제) |
| `ChatRoomRail.tsx` **(신규)** | 56px 띠: ≡ · 방 아이콘(머리 글자·색·안 읽은 수 배지·결재 점) · 묶음 구분선 · 회의실. ≡ 누르면 겹침 펼침(`ChatSide` 그대로 안에 넣음) + 📌 | 띠 전용 그림만 담음. 방 정보는 `useRoomEntries` 소비. 펼침 열기·닫기(바깥 클릭·Esc)는 기존 `PopMenu`로 되는지 구현 때 확인(옆으로 열기가 안 되면 작은 절대 배치 패널 + 바깥 클릭 처리) |
| `ChatPage.tsx` | ① 본문 행을 `ref`가 달린 래퍼로 감싸 폭 측정 ② 데스크톱 전용 머리(1줄: 방 이름·팀/랩 꼬리표·ⓘ·🔍 / 2줄: 요약+일하는 칩) ③ `RoomTabs`는 폰 비분할 배치용으로만 남김 | 머리 4줄 → 2줄 |
| `RoomStatusStrip`(ChatPage 안) | 앞에 요약 문장, **접혔을 때는 일하는 사람만** 칩, `+N명`을 누르면 지금처럼 전원 펼침(기존 `isOpen` 토글·툴팁 재사용) | 새 컴포넌트 없이 필터와 요약 한 줄만 추가 |

- **상태 위치**: 사용자 선택값 `pref: 'auto' | 'open' | 'rail'`은 이 기기 설정이라 `localStorage`(`office:chatRooms`, `WhatsNew`의 `readSeen/writeSeen`처럼 try/catch로 못 읽으면 'auto'). 폭에서 나온 `mode`는 저장하지 않는 파생값. 펼침(peek)이 열렸는지는 `ChatRoomRail` 안 `useState`. 전역 스토어에 넣지 않습니다(다른 화면이 몰라도 되는 값).
- **새 파일을 최소로 둔 이유**: `RoomStatusStrip`·`StatusTip`·`RoomTabs`를 `ChatHeader.tsx`로 옮기면 가독성은 좋아지지만 ChatPage 916줄에서 ~250줄이 이동해 diff가 커지고 이전 수정과 충돌하기 쉽습니다. 1.3.1은 제자리 수정을 추천하고, 추출은 별도 정리 작업으로 미룹니다.
- **"기존 접힘 상태"**: 요청서의 표현이 모호해 `RoomStatusStrip`의 `+N명`↔접기 토글(`isOpen`)로 해석했습니다. 다른 접힘(예: 방 묶음 접기)이 따로 있다면 알려 주세요 — 설계에 영향이 있습니다.
- **폰 배치 보호**: 데스크톱 전용 래퍼에 `phone:hidden`을 둡니다. `side:flex hidden`인 폴드 분할 `ChatSide`와 겹치지 않도록, 두 규칙의 **변형 정의 순서**(index.css에서 `side`가 `phone`보다 뒤라 이김)에 기대지 말고 **데스크톱 래퍼와 분할 `ChatSide`를 서로 다른 요소**로 둡니다. 확인은 §1-4 매트릭스.
- **`RemoteLine`**: 지금 머리에 있어 띠 상태에서 사라질 수 있음 → 띠일 때만 머리 2줄 끝에 한 줄로 보여 주도록 제안(목록 상태는 `ChatSide`의 `footer`로 이미 가능).

## 1-2. 사전 키 방향 — 새 키, 기존 문구는 손대지 않음
- 새 키(약 7개, `featuresA.ts`의 `chat.room*` 근처 또는 `chatStatus.ts`): `chat.header.summary`("{total}명 · {working}명 일하는 중"), `chat.rooms.expand`(≡ aria), `chat.rooms.collapse`(«), `chat.rooms.pin`·`chat.rooms.unpin`, `chat.rooms.rail`(띠 aria), `chat.room.tag.team/lab`가 필요한지는 기존 `chat.room.groupTeams`("팀")·`groupLabs`를 **꼬리표로도 재사용** 가능한지 확인(뜻이 같으면 새 키를 만들지 않음).
- 기존 키 재사용: `chat.rooms`·`chat.unread.*`·`chat.status.more/less/list`·`chat.search.open`·`chat.slim.about`(ⓘ).
- 수정하지 않는 것: `chat.room.title`·`chat.labRoom.title`은 폰 비분할 머리가 계속 쓰므로 남김 → 키 삭제 없음(사용 키 검증 시험에 걸릴 위험 0).
- 시험: 기존 `i18n.test.mts`가 4개 언어 누락·`{변수}` 일치·코드의 키 존재를 이미 검사 → 추가 시험 불필요.

## 1-3. 자동 접힘 기준 — **대화 칸이 아니라 "대화 영역을 감싼 행"의 폭**
- 재는 것: `ChatPage` 본문 행(좌: 방 칸, 우: 대화)의 `clientWidth`. 이 값은 **방 칸이 목록이든 띠든 변하지 않으므로** "접으면 폭이 늘어 다시 펴지는" 되먹임이 생기지 않습니다(대화 칸 폭을 재면 접는 순간 폭이 +144px 변해 경계에서 깜빡임).
- 규칙(`roomListMode`): `pref`가 'open'/'rail'이면 그대로. 'auto'면 `containerWidth − 200 < 640`이면 띠, 아니면 목록. 즉 **840px 아래가 띠**. 시안의 "접는 640 / 펴는 784(=640+144)"는 대화 칸 기준 값인데, 행 폭 기준으로는 같은 경계(840)가 됩니다. 스크롤바·창 끌기의 1~2px 흔들림만 막도록 펴는 쪽에 **+16px 여유**(≥856)를 둡니다(`prev` 인자).
- 창 폭(`innerWidth`)·`compact` 미디어쿼리를 쓰지 않는 이유: 직원 패널은 1000px 이상에서는 본문을 줄이고(행 폭이 줄어듦), 1000px 미만에서는 **본문 위에 덮습니다**. 후자는 창 폭이 어차피 1000 미만 → 앱 본문은 `1000−176(사이드바) = 824 < 840`이라 **항상 띠**로 나와 별도 보정이 필요 없습니다. 패널 폭(기본 380, 사용자 조절)을 `StaffPanel`에서 끌어오는 결합이 생기지 않는 것이 이 방식의 이득입니다.
- 첫 그림: 측정 전에는 'list'로 그리고 `useLayoutEffect`에서 즉시 한 번 재서 깜빡임을 막음. CSS 컨테이너 쿼리안은 검토 후 제외(두 표현이 모두 마운트되고 aria·중복 DOM이 생기며, 'pref' 우선 처리에는 어차피 JS가 필요하고, 판정을 순수 함수로 시험할 수 없음).

## 1-4. 위험과 검증
| 위험 | 대응 |
|---|---|
| `ChatSide` 변경이 폴드 분할·세로 폰 ▾에 번짐 | props는 선택·기본값=옛 동작. `ChatSlimBar`·분할 사용처는 코드 수정 0, 캡처로 회귀 확인 |
| 폰 배치에서 데스크톱 머리·띠가 같이 보임 | `phone:hidden` 래퍼 + 캡처(세로 폰 slim, 폴드 split, 가로 short) |
| 띠에서 **안 읽음·결재 점·검색(⌘F)·회의실**이 빠짐 | 기능 체크리스트로 하나씩(안 읽음 숫자, 결재 점, ⌘F, 회의실 진입, 팀/랩 묶음, 방 전환, 현재 방 숫자 0) |
| 키보드·읽기: 띠 버튼에 이름이 없음 | 방 아이콘은 글자만이므로 `aria-label`={방 이름 + 안 읽은 N}, 현재 방 `aria-current`, 펼침은 `aria-expanded`·Esc 닫기 |
| 폭 판정 경계에서 깜빡임 | 행 폭 기준 + 펴기 +16px 여유, 순수 함수 시험으로 경계값 고정 |
| 방이 아주 많을 때 띠 스크롤 | 띠도 `overflow-y-auto`, 묶음 구분선 유지 |
| 한 번 정한 `pref`가 영영 자동으로 안 돌아옴 | 📌을 다시 누르면 'auto'로 해제(`open→auto`), «는 `rail`. 해제 경로는 구현 때 문구 확정(§5 쟁점) |

- **시험 추가(예)**: `scripts/chatRoomLayout.test.mts` — ① `roomListMode` 839/840/855/856, pref 우선, prev 유지 ② `summarizeRoomPeople`: 전체 방은 일하는·확인 필요·오류만, 일하는 사람 우선, N 초과 시 hidden 수, 0명 ③ (기존 `chatUnread` 시험은 그대로).
- **타입 검사**: `npm run typecheck`, 린트.
- **화면 확인(요청서 항목)**: 라이트·다크 × 창 900·1100·1400 × 직원 패널 닫힘/열림(기본 380 폭) 총 12장 중 대표 4~6장(1400 닫힘, 1100 닫힘, 1100 패널 열림=띠, 900 패널 열림, 펼침 peek, 다크 1장). 폰 회귀 3종.

## 1-5. 구현 순서 (같은 파일 충돌 없게)
1. `shared/chatRoomLayout.ts` + 시험 (파일 신규, 다른 것과 무관)
2. `chatRoomHooks.ts`에 `useRoomEntries`, `RoomTabs`·`ChatSide`가 쓰도록 교체 → 이 단계에서 **화면 변화 0**임을 캡처로 확인
3. `ChatRoomRail.tsx` + `ChatSide` 선택 props
4. `ChatPage.tsx` 한 번에: 본문 행 래퍼·폭 훅·데스크톱 머리·`RoomStatusStrip` 요약
5. 사전 키 7개 → i18n 시험
6. 캡처 매트릭스 · 보고
→ `ChatPage.tsx`는 4단계에서만, `ChatSide.tsx`는 2·3단계에서 두 번 만지므로 **같은 사람이 이어서** 작업.

---

# 기능 2. 휴대폰 연결 1안 '단계형'

## 2-1. 컴포넌트 나누기 · 상태 위치 · 재활용
현재: 설정 › 연결 분류에 `RemoteSection`(545줄, 체크박스·방식 라디오·TS 상자·상태줄·버튼·코드·지문·접속기록·5단계 안내 창), `ConnectedPcSection`(작업 공간), `PeerSection`(역할 카드·슬롯·피어 목록)이 **세 섹션**으로 흩어져 있고, `useRemoteStatus` 훅이 두 파일에 똑같이 있습니다.

| 대상 | 변경 | 이득 / 복잡도 |
|---|---|---|
| `shared/connectModel.ts` **(신규, 순수)** | `readinessOf(status)`(단계 ②의 체크 항목), `devicesOf({status, slots, peers})`(연결된 기기 목록·N대), `phoneAddAction(status)`(첫 연결 / 새 휴대폰=지금 휴대폰 끊김 경고), `connectView(status)`('setup'/'connected') | **이득**: 화면의 판단(어느 단계 완료인지, 몇 대인지, 경고가 필요한지)을 상태값→결과의 표로 만들어 **시험으로 고정**. 지금은 이 판단이 JSX 안 조건식에 섞여 있어 시험이 불가능. **복잡도**: 파일 1개 |
| `features/connect/useConnectData.ts` **(신규)** | 두 `useRemoteStatus` + `peerSlots`/`peerList` 로딩·재읽기를 하나로(3초 Tailscale 폴링·`staff.remote` 변화 시 재읽기 포함) | 상태를 부모 한 곳에서만 읽음 → 두 섹션이 서로 다른 시점의 상태를 보는 문제 제거. 기존 두 훅 삭제 |
| `features/connect/ConnectSection.tsx` **(신규)** | 단계 UI·펼침 상태. 로컬 상태만: `flow: {step, target} | null`, 고급·끊기 접힘 | 새 상태 없음(서버 상태는 `RemoteStatus`) |
| `RemoteSection.tsx` | 본체를 걷어내고 **조각을 export**: `Banner`·`TailscaleSteps`·`PhoneCode`·`RecentAccess`·`RemoteGuide`(공유기 직접용). `QrStep`은 **`QrPanel`(그림·주소·안내) + 대화창용 푸터**로 쪼개 `QrPanel`을 export | 재작성 없이 기존 동작(켜기 전 경고 확인, QR 거둠 조건, 재발급 확인)을 그대로 재사용 |
| `PeerSection.tsx` | `HostPart`·`ClientPart`(이미 export)·`SlotList`·`PeerList` export, 본체·`Readiness`·`RolePicker` 제거 | 다른 PC 쪽 로직(짝짓기·피어 해제)은 건드리지 않음 |
| `SettingsPage.tsx` | `<Section remote>`+`<Section peer>`를 `<Section remote 제목='휴대폰·PC 연결'><ConnectSection/></Section>` 하나로. **`SECTION_ID.remote` 유지**(`WorkspaceWizard`·`Switcher`·설정 바로가기가 쓰는 id), `workspaces` 섹션은 그대로 | 줄 수 감소, 외부 링크 무수정 |
| `main/remote/auth.ts`·`service.ts`·`shared/types.ts` | **선택**: `phoneSeenAt: number | null`(§2-4) | 아래 |

- **단계 화면의 모양**: `flow === null && status.isEnabled` → '켜짐' 화면(한 줄 상태+[끄기], 연결된 기기 N대, [+ 기기 추가], 접이식 2개). 꺼져 있거나 `flow`가 있으면 3단계. ①을 고르면(같은 와이파이/밖에서도/고급) `setRemoteMode`, ②는 `readinessOf`의 체크, ③은 [휴대폰|내 다른 PC] 선택 후 휴대폰이면 **경고 1회 확인 → `setRemoteEnabled(true, port)` → `QrPanel` + `PhoneCode`**, 다른 PC면 `HostPart`(이 PC 직원 빌려주기)/`ClientPart`(다른 PC 직원 데려오기).
- **'고급: 공유기 직접'**: 포트·주소·UPnP 안내가 5단계 대화창(`RemoteGuide`)에 있어, 1안에서도 이 선택을 고르면 **기존 대화창을 그대로 연다**(문구만 갱신). 인라인으로 다시 쓰면 변경 범위와 위험이 큼 → 쟁점 5-①.
- **IS_REMOTE_SCREEN(원격 웹에서 연 설정)**: 지금처럼 방식 라디오 비활성 + `PcOnlyState`, 피어 영역은 숨김. `ConnectSection`이 이 분기를 한 곳에서 처리.
- **`OPEN_REMOTE_GUIDE_EVENT`**(다른 PC 연결의 [원격 켜기]): 새 구조에선 불필요해지므로 이벤트·리스너 제거, 대신 같은 섹션이라 `flow` 시작 한 줄.

## 2-2. 사전 키 방향 — 새 파일 + 기존 키는 "값만" 수정
- **새 파일 `shared/i18n/dict/connect.ts`**(~45키, `dict/index.ts`에 등록): 단계 제목·선택지 이름·체크 항목·'연결 켜짐 · …' 줄·기기 목록 항목·접이식 제목·휴대폰 추가 경고·코드 복사·'휴대폰 모두 끊기'. 이유: 요청서 용어 정리가 4개 언어에 걸쳐 있어 **한 파일에 모아야 "같은 뜻" 대조가 쉽고**, 사라질 옛 키와 섞이지 않음.
- **기존 키는 키 이름은 두고 값만**: 'remote.*'·'peer.*' 중 계속 쓰는 것(QR 안내·Tailscale 상자·오류 배너·호스트/클라이언트 단계)은 '원격'→'연결', 'QR을 못 찍을 때 코드'→'코드로 연결', 'peer.role.*'→'이 PC 직원 빌려주기/다른 PC 직원 데려오기'로 값 수정. 키 이름을 바꾸면 사용처 수십 곳이 따라 바뀌어 이득이 없음.
- **정리**: 더 이상 안 쓰는 키(`remote.step.*` 칩, `peer.ready.*`, `peer.role.*` 일부)는 구현 마지막에 목록으로 지움(`i18n.test`는 미사용 키를 잡지 않으므로 cleanup은 사람이). 키 중복 방지로 삭제 전 `grep t('...')` 확인.
- **Tailscale 용어**: '내 기기끼리 잇는 무료 앱'을 처음 나올 때만 붙이는 규칙 → `connect.ts` 한 키(`connect.tsHint`)로 고정해 반복 노출을 막음.
- **범위 밖**: 안드로이드 `strings.xml`의 '주소로 연결' 등은 PC 앱 사전이 아니라 이번 4언어 작업에 넣지 않음(앱 빌드가 필요) → 쟁점 5-③.

## 2-3. 자동 접힘 / 기준 — 해당 없음 (이 기능은 폭 기준 없음)
다만 단계 ②의 **자동 확인 기준**을 같은 칸에 정합니다.
- 항목은 **측정 가능한 것만 ✓**: Tailscale 방식은 이 PC의 `tsState`(`notInstalled`/`needsLogin`/`stopped`/`running`) → 설치·로그인·연결을 체크, 같은 와이파이는 `connectHost` 유무·`isLanOnly`, 고급은 `isListening`/`upnp`.
- **측정 못 하는 것은 체크 표시를 만들지 않음**: "휴대폰에 Tailscale 설치"는 PC가 알 수 없으므로(인계 문서 3번 어려움) '직접 확인하는 항목'으로 문장 + 로컬 체크박스. 거짓 ✓가 연결 실패 원인이 되는 가장 흔한 오해이기 때문.
- 폴링: 기존 3초 `refreshRemoteTailscale`을 **단계 ②가 보일 때만** 돌려 대기 낭비를 줄임(지금은 mode가 tailscale인 동안 항상).

## 2-4. 연결된 기기 목록과 휴대폰 접속 시각
- 목록 = 휴대폰(열쇠 하나: `isTokenUsed`면 1대) + 이 PC에서 빌려준 다른 PC(`peerSlots`: 이름·`lastSeenAt`) + 데려온 다른 PC(`peerList`). N대는 `devicesOf`가 셈.
- **휴대폰 마지막 접속**: `AuthGuard.check`의 phone 성공 분기(`isUsed = true` 옆)에서 `phoneSeenAt = now`만 기록. 선택 이유와 대안:
  | 안 | 이득 | 대가 |
  |---|---|---|
  | **메모리만 (추천)** | 설정 파일 구조·마이그레이션 변경 0, 핫 경로에 대입 1줄, 시험이 간단. `QrStep`의 "연결됐어요" 판정이 지금 `recentAccess`의 경로 문자열(`/v1/status`·200)에 기대는데 이 값으로 대체하면 더 견고 | 앱을 다시 켜면 시각이 비어 '연결된 적 있어요'만 표시 |
  | 디스크 저장 | 재시작 뒤에도 시각 표시 | `RemoteConfig` 필드·저장 주기(요청마다 쓰면 안 됨, 1분 제한)·마이그레이션·시험 증가 |
- `RemoteStatus.phoneSeenAt`로 내보내되, **요청마다 `changed()`를 부르지 않습니다**(상태 푸시가 요청 수만큼 늘어남). 화면은 마운트·`onRemoteStatus`·기기 목록 보일 때 15초 재읽기로 "N분 전"을 맞추면 충분. `regenerateToken`에서는 `null`로 초기화(새 열쇠 = 새 기기).
- '결재 2건 처리' 같은 횟수는 어디에도 없어 쓰지 않음(요청서 결정).
- **두 번째 휴대폰**: 열쇠가 하나라 `phoneAddAction(status)`가 `isTokenUsed`면 `'replace'`를 반환 → [+ 기기 추가 › 휴대폰]에서 "새 휴대폰을 연결하면 지금 휴대폰이 끊겨요"를 **같은 화면 안 확인 문장**으로 보이고(지금의 `window.confirm` 대신), 확인하면 `regenerateRemoteQr()` 후 QR. `isTokenUsed`가 false(첫 연결·QR 미사용)면 확인 없이 현재 QR. 빨간 '휴대폰 모두 끊기(새 QR)' 접이식은 같은 `regenerate` 함수를 씀(경로 하나).
- **'코드로 연결' 복사 버튼**: 새 요소. 복사 대상은 **1회용 짝짓기 코드(12자)뿐**이고 QR 주소·토큰은 복사하지 않음(`QR에는 토큰이 있으므로 클립보드로 남기지 않는다`는 기존 원칙 유지). 그래도 클립보드 기록에 남는 코드라 쟁점 5-④.

## 2-5. 위험과 검증
| 위험 | 대응 |
|---|---|
| **켜기 전 경고(휴대폰=모든 권한) 누락** — 대화창이 사라지면 `isFullAccessNoticeSeen` 확인 흐름이 같이 사라짐 | 단계 ③ 휴대폰 선택 시 **한 번** 표시하고 확인해야 [연결 켜기] 활성(기존 `isAcknowledged` 동작 이식). 안내문 반복(어려움 11번)은 이 한 곳으로 합침 |
| 다른 PC 연결이 **원격 켜짐에 의존**(어려움 8번)이 새 구조에서 깨짐 | 단계 ③에서 '내 다른 PC' 선택 시 `isEnabled && isListening`이 아니면 자동으로 켜기 단계로 안내(`phase` 판단은 `connectView`) |
| 기존 QR 거둠·"연결됐어요" 판정이 바뀜 | `QrPanel`은 `QrStep` 본문 그대로 이동, 판정은 `phoneSeenAt >= shownAt`(있으면) → 없으면 기존 경로 판정으로 폴백(구현 후 정리) |
| 방식 변경 시 이미 연결한 휴대폰이 끊길 수 있음 | 고급 안의 방식 변경에 기존 `remote.mode.changed` 배너 유지 |
| 설정 바로가기 id·원격 웹 화면 | `SECTION_ID.remote` 유지, `IS_REMOTE_SCREEN` 분기를 `ConnectSection` 한 곳에 |
| 사전 45키 × 4언어 뜻 차이 | `i18n.test` 자동(누락·`{변수}`), 뜻 대조는 정리드·김번역 눈 확인 |
| 상태 폴링 중복 | `useConnectData` 한 곳 |

- **시험 추가**: ① `scripts/connectModel.test.mts` — `readinessOf`(mode×tsState 표), `connectView`, `devicesOf`(휴대폰 사용/미사용·슬롯·피어 조합·N), `phoneAddAction`(isTokenUsed true/false). ② `remote.test.mts`(또는 hardening)에 `phoneSeenAt`: phone 토큰 성공 시 기록, **피어 토큰·실패·잠금·폐기 토큰은 기록 안 함**, `regenerate` 후 `null`. ③ 기존 `remote*.test.mts`·`peer*.test.mts`·`i18n.test.mts`가 그대로 통과(변경이 화면+상태 1필드뿐이라는 증거).
- **수동**: 신규(꺼짐)→3단계 완주 / Tailscale 미설치·로그인 전·연결됨 / 이미 휴대폰 연결된 상태에서 [+ 기기 추가] / 고급 방식 / 다른 PC 빌려주기·데려오기 / 원격 웹에서 설정 열기 / 4개 언어 / 라이트·다크. 화면 캡처는 켜짐 상태와 3단계 두 장.
- `npm run typecheck`, 린트.

## 2-6. 구현 순서 (같은 파일 충돌 없게)
1. (선택) `auth.ts`·`service.ts`·`types.ts`: `phoneSeenAt` + 시험 — main/shared만, 화면 무관
2. `dict/connect.ts` + 기존 키 값 수정(4개 언어) → `i18n.test`
3. `shared/connectModel.ts` + 시험
4. `RemoteSection.tsx`·`PeerSection.tsx`에서 **export·분리만**(동작 불변) — 이 단계에서 옛 화면이 그대로 동작해야 함
5. `connect/useConnectData.ts`·`ConnectSection.tsx` 신규, `SettingsPage.tsx`에서 섹션 교체
6. 죽은 코드(옛 `RemoteSection` 본체·`PeerBody`·`Readiness`·`RolePicker`·중복 `useRemoteStatus`·`OPEN_REMOTE_GUIDE_EVENT`)와 미사용 키 삭제
7. 캡처·보고
→ 4단계 이후 `RemoteSection.tsx`를 건드리는 사람이 한 명이 되도록 **한 사람이 연속 작업**. 단계 4에서 멈춰도 앱은 정상(롤백 지점).

---

# 공통
## 3. 두 기능의 순서·충돌
- 파일 집합이 겹치지 않습니다(채팅: `ChatPage·ChatSide·chatRoomHooks·ChatRoomRail·shared/chatRoomLayout·featuresA/chatStatus` / 연결: `connect/*·RemoteSection·PeerSection·SettingsPage·auth·service·types·dict/connect·featuresB·peer`). 두 사람이 병렬로 할 수 있고, 한 사람이면 **연결 → 채팅** 또는 반대 어느 쪽이든 무방합니다.
- 공유 지점은 `shared/types.ts`(연결의 `phoneSeenAt` 한 줄)와 `dict/index.ts`(연결의 `connect.ts` 등록 한 줄)뿐 → 마지막에 합칠 때만 확인.
- `ChatPage.tsx`·`StaffPanel.tsx`·`SecretaryChat.tsx`의 미커밋 수정은 지금 작업 트리에 없습니다(`git status` 확인: 문서만 untracked). 착수 전에 다시 확인.

## 4. 변경 파일 총괄
| 구분 | 파일 | 위험 |
|---|---|---|
| 신규 | `shared/chatRoomLayout.ts`, `features/ChatRoomRail.tsx`, `shared/connectModel.ts`, `features/connect/ConnectSection.tsx`·`useConnectData.ts`, `dict/connect.ts`, 시험 `chatRoomLayout.test.mts`·`connectModel.test.mts` | 낮음 |
| 수정(채팅) | `ChatPage.tsx`(중), `ChatSide.tsx`(낮음·기본값 보존), `chatRoomHooks.ts`(낮음), `featuresA.ts`/`chatStatus.ts` | 중 |
| 수정(연결) | `RemoteSection.tsx`·`PeerSection.tsx`(중: 분리·삭제), `SettingsPage.tsx`(낮음), `featuresB.ts`·`peer.ts`(문구), `dict/index.ts` | 중 |
| 수정(main, 선택) | `auth.ts`·`service.ts`·`types.ts` | 낮음(필드 1개, 핫 경로 대입 1줄) |
| 김버전 | `CHANGELOG*.md`·`docs/release-notes/1.3.1.md` — 편집은 정리드가 조율. 핵심 요약 3줄 제안: 단체방 상단 정리·방 목록 자동 접힘 / 휴대폰·PC 연결 단계 안내 / 연결된 기기 목록 | — |

## 5. 정리드가 고를 쟁점과 추천
| # | 쟁점 | 추천 | 이유·대가 |
|---|---|---|---|
| ① | '고급: 공유기 직접'을 인라인으로 다시 쓸지 | **기존 `RemoteGuide` 창 재사용** | 포트·UPnP·주소 입력은 위험·시험이 많은 부분. 대가: 이 경로만 창이 뜸 |
| ② | 휴대폰 접속 시각 `phoneSeenAt` | **메모리만 도입** | 구조 변경 없이 '마지막 접속'을 얻고 '연결됐어요' 판정도 단단해짐. 대가: 재시작 후 시각 비어 있음 |
| ③ | 안드로이드 `strings.xml` 용어('주소로 연결' 등) | 1.3.1에서는 제외, 후속 | PC 사전만으로 끝남. 대가: 두 앱 용어가 잠시 다름 |
| ④ | '코드로 연결' 복사 버튼 | 1회용 코드만 복사 | 지금 손으로 옮기는 마찰 제거. 대가: 클립보드 기록에 남음 — 보안 입장 확인 필요 |
| ⑤ | 단체방 접힘 기준 | **행 폭(840)+펴기 +16px** | 되먹임·창 폭 보정 없음. 대가: 시안의 640/784 숫자와 말이 다름(같은 경계) |
| ⑥ | `ChatHeader.tsx`로 머리 추출 | 이번엔 제자리 수정 | diff·충돌 최소. 대가: ChatPage가 계속 큼 |
| ⑦ | `pref`를 'auto'로 되돌리는 방법 | 📌 다시 누르면 해제 | 새 설정 항목 없음. 대가: 발견성 낮음 |
| ⑧ | '기존 접힘 상태'의 뜻 | `+N명` 토글로 해석 | 틀리면 알려 주세요 |

대표 결정이 필요한 사항: 없음(이미 시안으로 확정). 단 ④(클립보드)와 ③은 대표 보안·출시 범위 입장이 있으면 좋습니다.
