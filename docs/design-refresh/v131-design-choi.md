# 1.3.1 구현 설계안 — 최가독 (가독성·단순함·기존 기능 재활용)

작성: 2026-11-13 · 코드 수정 없음 · 박패턴 안과 맞추지 않음 · 요청서 `v131-brief.md`

공통 원칙: **새 파일은 "새 역할"일 때만**, 이미 있는 계산·부품(`chatRoomHooks`, `ChatSide`, `useRemoteStatus`, `TailscaleSteps`, `PhoneCode`, `QrStep`, `SlotList`·`PeerList`)은 옮기거나 다듬어 재사용한다. 상태는 쓰는 곳 가까이(useState), 저장이 필요한 것만 기기 로컬.

---

# 1. 단체방 상단 = B안 '왼쪽 방 목록' (+ 자동 접힘)

## 1-1. 컴포넌트 나누기·상태·재활용
확인한 사실: 가로 방 탭 `RoomTabs`(ChatPage)와 세로 목록 `ChatSide`가 **같은 계산(`useRoomList`)으로 방 버튼을 두 벌** 그린다. B안은 `ChatSide`가 데스크톱에서도 쓰이는 것이므로 `RoomTabs`를 지우고 한 벌로 합친다(중복 제거가 이번 최대 이득).

| 대상 | 변경 |
|---|---|
| `ChatSide.tsx` (수정) | prop 2개 추가: `rail?: boolean`(56px 띠 — 머리 글자 아이콘 + 안 읽은 배지 + 결재 점, 이름은 title/aria-label) · `showDoing?: boolean`(기본 true. 데스크톱은 직원이 상단 줄에 있어 false). '팀'/'랩' 묶음 제목 추가(기존 키 `chat.room.groupTeams/groupLabs` 재사용 — RoomTabs의 `groupLabel`을 옮김). 기본값은 현재 동작과 같아 폴드 분할·`ChatSlimBar` ▾ 메뉴는 그대로 |
| `ChatHeader.tsx` (**새 파일**) | ChatPage의 인라인 머리(제목·설명·칩 줄·상태 줄, 약 25줄)를 꺼낸 역할. 방 이름 + 팀/랩 꼬리표(`room.kind`로 groupTeams/groupLabs 재사용) + ⓘ(`PopMenu`로 `description`, `ChatSlimBar`와 같은 방식) + 🔍. 그 아래 직원 줄 = `children` 자리에 기존 `RoomStatusStrip`을 그대로 넣고, 앞에 요약 문구 'N명 · M명 일하는 중'만 `useRoomPeople`로 계산해 붙임. 넘치면 +N은 `RoomStatusStrip`의 `STRIP_MAX`·'더 보기'가 이미 한다 |
| `ChatPage.tsx` (수정) | 머리 JSX를 `<ChatHeader>`로 교체, `RoomTabs` 삭제(≈35줄), `ChatSide`를 데스크톱에도 렌더(`rail`·`pinned` 상태 보유). `RemoteLine`은 직원 줄 아래로 이동(지금도 머리에 있음) |
| `chatRoomHooks.ts` (수정) | `useAutoRail(ref, minWidth)` 훅 1개(≈15줄, ResizeObserver — `FoldableText`와 같은 방식) |
| `shared/chatRooms.ts` (수정) | 순수 함수 `isRailWidth(containerWidth, isPinned)` 3줄 — 시험 가능하게 분리(이번엔 분리가 정당: 경계값 버그 위험이 있음) |
| `ChatSlimBar.tsx` | **변경 없음** (슬림·분할 레이아웃 보호) |

상태 위치
- `isPinned`(📌): ChatPage의 `useState` + 기기 로컬 저장(`localStorage`, `WhatsNew`의 try/catch 패턴과 같게). 서버·설정 DB로 올리지 않는다(기기마다 창 크기가 다름).
- `isOverlayOpen`(≡로 겹쳐 펼침): ChatPage 로컬 `useState`, 저장 안 함. 방을 고르면 닫힘.
- 검색(`isSearchOpen`)·`searchRequest`·⌘F는 지금 그대로 ChatPage에 둔다(헤더는 `onSearch` 콜백만 받음).
- 레이아웃 분기: 폰 레이아웃(`data-layout=phone`)은 기존 slim/split 경로 그대로. 데스크톱만 B안. `ChatSide`의 `className`이 지금 `side:flex hidden`(폰 분할에서만 보임)이라 **데스크톱 표시는 `phone:` 변형으로 반대 조건을 줘야 한다** — 변형 우선순위가 헷갈리기 쉬워 prop(`isDesktop`) 쪽을 권장.

## 1-2. 사전 키 방향
- **새 키(chatMessenger.ts, 4개 언어)**: `chat.rail.expand`(≡ 방 목록 펼치기), `chat.rail.pin`·`chat.rail.unpin`(📌), `chat.header.summary`('{count}명 · {working}명 일하는 중').
- **재사용(수정 없음)**: `chat.rooms`, `chat.room.all`, `chat.room.groupTeams/Labs`, `chat.unread.*`, `chat.slim.about`(ⓘ), `chat.search.open`, `chat.status.more/less`.
- 기존 키 문구 변경 없음. `chat.room.title`('{team} 방')·`chat.labRoom.title`은 제목에서 안 쓰게 되므로, 구현 때 다른 곳 사용 여부를 grep해 **안 쓰면 지운다**(고아 키 방지).

## 1-3. 자동 접힘 기준: **창 폭이 아니라 '방 목록+대화' 컨테이너의 실제 폭**
- 이유: 직원 패널이 열리면 창은 그대로인데 대화 영역이 줄어든다. 창 폭(미디어 쿼리)은 이걸 못 잡는다. 요구도 "대화 폭 640 아래"다.
- 측정 대상: `ChatSide`와 대화 칼럼을 감싼 `flex min-h-0 flex-1` 컨테이너(ChatPage의 기존 div)에 ref → `ResizeObserver`.
- **함정(진동)**: 대화 칼럼만 재면, 방 목록이 200→56px로 접히며 대화가 144px 넓어져 640을 넘고 → 다시 펼쳐지고 → 반복한다. 그래서 **안정된 값인 컨테이너 전체 폭**으로 판정한다: `접힘 = 컨테이너폭 < 640 + 200(펼친 목록 폭) && !isPinned`. 문턱이 목록 상태와 무관해 진동하지 않는다. (히스테리시스 불필요)
- ≡로 겹쳐 펼친 상태는 `absolute`/오버레이라 레이아웃 폭을 바꾸지 않으므로 이것도 진동 원인이 아니다.
- 📌 고정 = 좁아도 항상 펼침(자동 접힘 끔).
- 앱 사이드바 접기는 범위 밖(요청서대로).

## 1-4. 위험·검증
| 위험 | 대응 |
|---|---|
| 900px 창 + 직원 패널 열림 → 대화 폭 극소 | 측정 기준이 컨테이너라 자동으로 띠 모드. 띠 56px + 대화 ≥ 최소 폭 확인 |
| 접힘 전환 때 스크롤·입력 포커스 손실 | 대화 칼럼 DOM은 그대로(`ChatSide`만 폭 변경), 키 안 바뀜. 직접 확인 |
| 폴드 분할·슬림 ▾ 메뉴 회귀 | `ChatSide` 새 prop 기본값이 현재 동작. 폴드(600+)·세로 폰 확인 |
| 안 읽음·결재 점·묶음 필터가 띠에서 빠짐 | 띠에서도 같은 `row()`가 배지·점을 그림(이름만 숨김). 눈으로 비교 |
| "기존 접힘 상태" 요구의 정확한 대상이 불명 | **확인 필요**: `RoomStatusStrip`의 `isOpen`(+N 펼침)을 가리킨다고 가정함. 다른 접힘이면 알려 주세요 |
| `ChatPage.tsx`에 미커밋 수정이 섞였을 수 있음 | 시작 전 `git status` 확인, 이 변경은 단독 커밋 |

검증: ① `isRailWidth` 경계 시험(`scripts/chatRooms.test.mts`에 추가: 839/840/841, 고정 on/off) ② `tsc` 타입 검사·`i18n.test`(4개 언어) ③ 화면 — 라이트·다크 × 900·1100·1400 × 직원 패널 열림/닫힘, 회의실 진입, 방 전환·필터, 검색(⌘F), 폴드·슬림 회귀, 캡처 1~2장. DOM 시험 도구는 이 프로젝트에 없어 화면 확인으로 갈음.

## 1-5. 구현 순서 (같은 파일 충돌 없게)
1. `isRailWidth` + 시험 (`chatRooms.ts`·시험 파일만)
2. `ChatSide` prop 추가(`rail`·`showDoing`·묶음 제목) — 기본값 동일, 폴드·슬림 회귀 확인 후 **한 번 커밋**
3. `ChatHeader.tsx` 신설 + `ChatPage` 머리 교체 + `RoomTabs` 삭제 (ChatPage 수정은 3·4를 한 사람이 연속으로)
4. `useAutoRail` + 띠 모드 + ≡ 오버레이 + 📌 (ChatPage·ChatSide·chatRoomHooks)
5. 사전 키 4개 언어 + 고아 키 정리 → 화면 검증

---

# 2. 휴대폰 연결 = 1안 '단계형'

## 2-1. 컴포넌트 나누기·상태·재활용
확인한 사실: `RemoteSection`(545줄)에 설정 본문 + 켜기 가이드 창(`RemoteGuide`) + `QrStep`이 같이 있고, `PeerSection`(523줄)은 별도 섹션이다. `useRemoteStatus`가 **두 파일에 복제**돼 있다. `SettingsPage`가 둘을 각각 `Section`으로 낸다.

| 대상 | 변경 |
|---|---|
| `useRemoteStatus.ts` (**새 파일, 이동**) | 두 파일의 복제를 한 곳으로(Tailscale 3초 폴링 포함). 동작 변화 없음 → **첫 커밋** |
| `ConnectSection.tsx` (**새 파일**) | 세로 3단계 화면 본체(≈150줄). ① 어디서(카드 3개, `status.mode`가 곧 선택 상태 — 새 상태 없음) ② 준비물 확인(`TailscaleSteps`를 체크 표시 목록으로 다듬어 재사용, 같은 와이파이·고급이면 생략/한 줄) ③ 무엇을(`target: 'phone'|'pc'` 로컬 `useState` 하나) |
| ③ 휴대폰 | `QrStep`을 export해 인라인 재사용 + `PhoneCode`('코드로 연결', **복사 버튼 추가** — 새 요소, `navigator.clipboard`) |
| ③ 내 다른 PC | `PeerBody`의 역할 선택(`RolePicker`)·`HostPart`·`ClientPart`를 그대로 사용, 문구만 '이 PC 직원 빌려주기 / 다른 PC 직원 데려오기'. `Readiness`(원격 켜짐 확인)는 ②와 겹치므로 ConnectSection이 처리하고 PeerBody에서는 제거 |
| 끝난 뒤 | '연결 켜짐 · …' 한 줄 + [끄기](= `setRemoteEnabled(false)`), '연결된 기기 N대' 목록, [+ 기기 추가](= target 초기화) |
| 기기 목록 | **세 묶음을 하나의 제목 아래 따로** 그린다: 휴대폰 1줄(아래) + `PeerList`(데려온 PC) + `SlotList`(빌려준 PC). 타입이 달라 한 배열로 합치지 않음(분기만 늘어남) |
| '고급 설정' 접이식 | 기존 JSX 이동: 포트·공유기 자동설정 결과(`upnpText`)·주소 방식 전환·지문·`RecentAccess`·공유기 방식 가이드(`RemoteGuide`는 router 전용으로 남김) |
| '휴대폰 모두 끊기(새 QR)' | 빨간 접이식 + 기존 `handleRegenerate` 재사용(확인창 `remote.regenerateConfirm` 그대로) |
| `SettingsPage.tsx` | `remote`·`peer` 두 `Section`을 `ConnectSection` 하나로(제목 '휴대폰·PC 연결'). **`SECTION_ID.remote` 앵커는 유지**(다른 곳의 이동 링크). `ConnectedPcSection`(연결한 PC, 작업 공간)은 별도 섹션 그대로 |
| `RemoteSection.tsx`/`PeerSection.tsx` | 내용을 위로 옮기고 남는 것(가이드·QrStep·HostPart…)만 유지. 껍데기 `RemoteSection`·`PeerSection`은 제거 |

휴대폰 '마지막 접속' (정리드가 판단 요청한 항목): **추가하되 최소로.**
- `AuthGuard.check()`의 휴대폰 분기(`slot:'phone'`)에 `this.phoneLastSeenAt = now` 한 줄 → `RemoteStatus.phoneLastSeenAt: number | null`. 피어는 이미 같은 방식(`peer.lastSeenAt = now`).
- **저장하지 않고 메모리만**(스키마·`AuthState` 변경 없음). 재시작하면 null → 화면은 '마지막 접속 —'/생략. 이유: 영속화하면 저장 빈도·마이그레이션이 늘고, 화면 가치는 "지금 붙어 있나" 정도라 충분.
- 휴대폰 행 표시 조건: `isEnabled && !isQrReady`(= 열쇠가 쓰였음). 결재 처리 횟수는 쓰지 않음(요청서대로).
- 최근 접속 기록(`recentAccess`)은 기기 구분이 없어 그대로 '고급 설정' 안에서만(원문 `GET /v1/status · 200`은 접힌 곳에 둠).

두 번째 휴대폰: [+ 기기 추가]에서 target='phone'이고 이미 휴대폰이 붙어 있으면(`!isQrReady`) **확인창**("새 휴대폰을 연결하면 지금 휴대폰이 끊겨요") 후 `regenerateRemoteQr`(= rotate) → QR 표시. 확인창 문구는 새 키.

켜기 흐름 주의: 지금 `RemoteGuide.handleOpenPort`가 하는 일(포트 확인창, 켜기, `isFullAccessNoticeSeen` 기록, 모드별 단계 건너뛰기)을 ③의 [연결 켜고 QR 보기]가 직접 호출해야 한다. 이 함수를 **ConnectSection이 쓸 수 있게 `enableRemote(status, port)`로 꺼내** 가이드와 공유한다. 경고 문구('QR = 모든 권한')는 **한 곳(③ 위)에 한 번만**(비교표 11번).

`IS_REMOTE_SCREEN`(휴대폰이 PC 설정을 볼 때): 지금처럼 읽기 전용+`PcOnlyState`. ConnectSection 맨 위에서 분기해 단계 UI 대신 상태 요약만 보인다(버튼·라디오 없음).

## 2-2. 사전 키 방향
- **원칙: 같은 요소는 키 이름을 두고 문구만 수정, 구조가 새로 생기는 것만 새 키.** 키 이름 대량 변경은 diff·충돌만 키우므로 `remote.*`는 이름이 '원격'이어도 둔다(코드 안에서만 보이는 이름).
- **기존 키 문구 수정(4개 언어)**: `settingsPage.remote.title/desc`(→ '휴대폰·PC 연결'), `peer.section.title/desc`(합쳐지므로 제거 또는 소제목으로), `remote.phoneCode*`(→ '코드로 연결'), `peer.role.*`·`peer.host/client` 라벨('이 PC 직원 빌려주기/데려오기'), `remote.mode`·mode 라벨들(카드 문구), 그 밖에 '원격' 포함 문구 일괄(grep '원격' → '연결'). `featuresB.ts`의 `remote.*`(≈104)·`peer.ts`(≈119) 중 해당분.
- **새 키**: 단계 제목 3개, 준비물 체크 항목 라벨·상태, 대상 선택(휴대폰/내 다른 PC), 연결된 기기 N대·휴대폰 행·마지막 접속, 복사/복사됨, 기기 추가 확인창, '고급 설정', 끊기 접이식 제목 — 약 25~30개 × 4개 언어, `featuresB.ts`에 추가(분량 때문에 `connect.ts` 새 사전 파일로 나누는 것도 가능하나, 기존 사전 파일 분류를 따라 우선 `featuresB.ts`).
- 고아 키: 가이드 칩 5개(`remote.guide.step*` 일부)·`remote.ts.step1~3`·`remote.reopenGuide` 등 안 쓰게 되는 것은 마지막 커밋에서 grep 후 삭제. 안드로이드 `strings.xml`('주소로 연결' → '코드로 연결')은 요청서 범위 밖이라 **정리드가 별도 판단**.
- 4개 언어 같은 뜻: `scripts/i18n.test.mts`가 누락을 잡는다. 번역은 한국어 확정 뒤 같은 PR에서.

## 2-3. 자동 확인 기준 ("지금 3초 Tailscale 체크 표시")
- 해당은 '폭'이 아니라 **폴링**이다: `useRemoteStatus`의 3초 폴링(`mode==='tailscale'`일 때)을 그대로 재사용, 새 타이머 없음. 설정의 '연결' 카테고리가 보일 때만 마운트되므로 화면을 떠나면 `clearInterval`된다(기존 동작). ②는 `status.tsState`(`running`/`notInstalled`/로그인 대기…)에서 파생 — 저장 상태 없음.
- 휴대폰 쪽 Tailscale 설치는 PC가 확인할 수 없다(`pc_only`) → ② 항목은 "이 PC" 체크만 자동, 휴대폰 항목은 안내문(체크 없음). 시안이 휴대폰까지 체크로 그렸다면 그 부분은 못 한다고 정리드가 디자이너에게 알려야 한다.

## 2-4. 위험·검증
| 위험 | 대응 |
|---|---|
| `handleOpenPort`의 부수효과 누락(포트 확인창·알림 확인 기록·모드별 건너뛰기) | 함수로 꺼내 가이드·새 화면이 공유(위 2-1). 모드 3종 × 켜기 직접 확인 |
| 두 번째 휴대폰 연결이 첫 휴대폰을 몰래 끊음 | 확인창 필수 + 시험 불가(UI) → 화면 확인 |
| 같은 모드 재선택·모드 변경 시 '기존 휴대폰은 QR 다시' 안내(`isLanModeChanged`)가 사라짐 | ConnectSection ①에서 그대로 유지 |
| 다른 PC 연결이 '연결 켜짐'을 전제 | ③ PC 대상에서 꺼져 있으면 같은 [연결 켜고…]를 먼저 보임 (`peer.ready.needOn` 재사용) |
| `SettingsPage` 앵커/딥링크 끊김, `OPEN_REMOTE_GUIDE_EVENT` | 앵커 유지, 이벤트는 ConnectSection이 받아 ③을 열도록 매핑 |
| 설정이 3단계 중 길어짐(1안 단점) | ①이 끝나면 ① 카드는 한 줄 요약으로 접음(CSS만) |
| '지금 화면'이 실제 캡처가 아니라 시안과 실제 차이 | 구현 후 실제 캡처로 비교 |

검증: ① `scripts/remote-*.test.mts`에 `phoneLastSeenAt` 시험 추가(휴대폰 성공 요청 → 갱신, 피어·실패·잠금 → 갱신 안 됨) ② `i18n.test`, `tsc` ③ 화면 — 모드 3종 × (꺼짐/켜짐) × (휴대폰 연결 전/후), 두 번째 휴대폰 확인창, 끊기·새 QR, 고급 접이식, 라이트·다크, 좁은 창, `IS_REMOTE_SCREEN`(휴대폰으로 PC 설정 보기), Tailscale 미설치/대기/실행, 캡처.

## 2-5. 구현 순서
1. `useRemoteStatus.ts` 이동 + `QrStep`·`enableRemote` export — **동작 변화 없음, 단독 커밋**(이후 모든 단계의 기반)
2. `AuthGuard.phoneLastSeenAt` + `RemoteStatus` 필드 + 시험 (main·shared만, UI와 파일 충돌 없음)
3. `ConnectSection.tsx` 신설 + `SettingsPage` 교체 + 옛 껍데기 삭제
4. 사전 키(수정 문구 + 새 키) 4개 언어 → 이 단계는 3과 같은 사람이 이어서(`featuresB.ts`/`peer.ts` 수정은 한 사람만)
5. 고아 키·옛 가이드 칩 정리, 실제 화면 캡처 비교

---

# 3. 두 기능 공통
- **파일 충돌 없음**: 기능 1은 `ChatPage·ChatSide·chatRoomHooks·chatRooms·chatMessenger.ts`, 기능 2는 `RemoteSection·PeerSection·SettingsPage·auth.ts·featuresB.ts·peer.ts`. 겹치는 파일이 없어 **병행 가능**. 사전 파일도 서로 다른 파일.
- 각 기능은 위 순서의 1단계(동작 불변 리팩터)를 먼저 커밋해 되돌리기 쉽게.
- 푸시·배포는 하지 않는다. 미커밋 변경이 있는 파일(`ChatPage` 등)은 시작 전 `git status`로 확인.

## 정리드가 알아야 할 쟁점과 추천
| 쟁점 | 추천 | 이유 |
|---|---|---|
| `RoomTabs` 삭제하고 `ChatSide` 한 벌로 | 합친다 | 같은 계산 두 화면 중복 제거 |
| 자동 접힘 측정 | 컨테이너 폭, 문턱 640+200 | 직원 패널 대응 + 진동 방지 |
| 📌·≡ 상태 | 로컬 state + 기기 로컬 저장 | 서버 저장은 과함 |
| 휴대폰 마지막 접속 | 메모리 필드 하나, 저장 안 함 | 가치 대비 영속화 비용 큼 |
| 기기 목록 | 휴대폰·데려온 PC·빌려준 PC 세 묶음 따로 | 타입이 달라 합치면 분기만 증가 |
| 키 이름 변경 | 하지 않고 문구만 수정 | diff·충돌 최소 |
| `ConnectSection` 신설 | 신설 | '3단계 화면'이라는 새 역할이라 분리 정당. 옛 껍데기는 삭제 |

## 미확인·가정
- '기존 접힘 상태'의 대상(1-4 표) — 가정: `RoomStatusStrip` +N 펼침.
- 시안의 ② 체크가 휴대폰 Tailscale까지 자동 확인하는지 — PC는 할 수 없음(`pc_only`).
- `ChatPage` 시안의 문턱 640, 펼친 목록 폭 200은 현재 `ChatSide` 폭(200px) 기준. 시안 값이 다르면 문턱도 바뀐다.
- `RemoteSection` 전체와 `SettingsPage`·`PeerSection` 내부 일부만 읽었다. `RemoteGuide` 중간 단계(포트·주소)의 세부 부수효과는 구현 때 한 번 더 확인.
