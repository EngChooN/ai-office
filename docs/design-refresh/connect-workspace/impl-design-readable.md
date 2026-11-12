# 워크스페이스 데스크톱 구현 설계 — 가독성·재활용 관점 (최가독)

- 작성: 최가독 · 2026-11-12 · 기준 1.2.0 · 코드 수정 없음(설계만)
- 박패턴 안은 받지 않았고 미리 맞추지도 않았습니다. 공통점·차이점 비교는 정리드가 두 안을 받은 뒤 요청하시면 보완합니다.
- 읽은 곳: `docs/design-refresh/connect-workspace/` 3개 문서, `workspace-feasibility.md`, `mobile/remoteOffice.ts`·`bridge.ts`·`install.ts`·`ui.ts`, `main/peer/*`(Client·Transport·Manager·Store), `main/remote/handler.ts`·`v2.ts`, `preload.ts`, `main/index.ts`(창 생성·IPC·알림), `petWindow.ts`, `App.tsx`·`PeerSection.tsx`·`PhoneShell.tsx`.

## 1. 한 줄 결론

> **"휴대폰이 이미 하는 방식을 데스크톱 창에 그대로 꽂는다."**
> PC 하나당 창 하나. 창 안 화면은 지금 데스크톱 화면 그대로고, `window.office`만 휴대폰용 `createRemoteOffice`로 채운다.
> 휴대폰 WebShell(Kotlin)이 하던 일(HTTPS 호출·실시간 소식·재연결)은 메인 프로세스에 이미 있는 `PeerClient`·`createPeerHttp`가 하고, 새로 짜는 것은 이 둘을 셸 메시지 모양으로 잇는 얇은 어댑터 하나다.

새 코드 약 5개 파일 + 기존 파일 수정, 기존 부품은 `remoteOffice.ts`·`bridge.ts`·`PeerClient`·`createPeerHttp`·`PeerRegistry`·`PairingWindow`·`PopMenu`·`PhoneShell`의 배너·시트를 그대로 씁니다.

## 2. 전제 (0단계 강백엔 작업에 기대는 부분 — 안 되면 설계가 바뀜)

| 기대하는 것 | 이 설계에서 쓰는 곳 | 안 나오면 |
|---|---|---|
| 열쇠 칸(PeerSlot)에 '화면 보기' 권한이 있고, 그 열쇠로 `/v2/call`(PC 전용 목록 제외)·`/v2/events`(휴대폰과 같은 모양의 snapshot·log·chat…)가 열림 | 브리지가 `createPeerHttp.call('/v2/call')`·`PeerClient` 이벤트를 그대로 씀 | 지금은 `isPeerPathAllowed`·`shapePeer`가 좁혀 놓아 화면 이벤트가 안 옴 → 브리지 구현 불가 |
| 짝짓기 응답/hello에 프로토콜 버전·`view` 허락 여부 | 마법사 3장 "저쪽에서 허락해 주세요" 대기, 옛 버전 "업데이트 필요" | 허락 상태를 알 방법이 없어 화면이 계속 대기 |
| 원격 `defaultCwd` 변경 막기 | 원격 창 설정 화면 | 보안 이슈(이 설계 범위 밖) |

→ 정리드께 확인: 위 1번의 **이벤트 모양(휴대폰과 동일)** 을 강백엔과 못박아 주세요. 같지 않으면 `remoteOffice.ts`의 `fillOldSnapshot` 같은 보정이 늘어납니다.

## 3. 요구사항 해석

- "다른 PC를 보면 그 PC의 사무실·직원·대화·결재 전체가 그대로" → 화면을 새로 만들지 않고 **같은 화면 코드가 다른 `window.office`로 돈다**(= 휴대폰 방식).
- "PC색 띠·창 테두리·이름 칸" → 창마다 `data-workspace-color` 하나로 CSS 변수만 바꿔 처리한다(PC별 컴포넌트 분기 없음).
- "기존 직원 보내기·불러오기 대체" → 새 마법사 + 연결 PC 목록이 `PeerSection`을 대신한다. 데려오기 UI는 제거, 이전 로직은 `PeerManager` 안에서 정리(7절).
- 기본값 6개(결재 분리·먼저 누른 쪽·3대 기준·8초 유예·휴대폰·이전)는 확정으로 보고 따른다. 이 문서는 그중 **데스크톱 몫**만 다룬다.

## 4. 주요 선택과 이유

### 4-1. 창 구조: PC별 창 vs 한 창 안 전환

| | **A. PC마다 BrowserWindow (추천)** | B. 창 하나 + PC별 WebContentsView |
|---|---|---|
| 상태 분리 | 창마다 zustand 저장소가 따로 → 앱 전체 하나인 `store.ts`를 **건드리지 않고** 분리 | 같음 |
| 입력 보존(기본값 4) | 창이 살아 있으니 입력 중 글·스크롤·열린 탭이 그대로. 따로 저장 로직 없음 | 같음 |
| 새 코드 | 창 생성·보이기 몇십 줄(`petWindow.ts`의 패턴) | 뷰 크기 동기화·상단 바 위로 드롭다운 띄우기(뷰가 위에 덮임) 등 새 기반 필요 |
| 단점 | 창이 최대 4개(이 PC + 3) → 메모리, 윈도우 창 버튼 겹침 처리 반복, 전환 때 창이 바뀌는 느낌 | 단점 적음, 대신 새 구조 비용이 큼 |

**선택 A.** 이유: 기존 화면·저장소를 그대로 두는 길이 이것뿐이고(`store.ts` 분리는 앱 전체 수정), 입력 보존이 공짜다.
**비용 완화:** 창은 처음 열 때 만들고(지연 생성), 닫으면 파괴(그 PC 연결 자체는 `PeerManager`가 계속 유지 → 결재 숫자 점·알림은 창 없이도 동작). 전환 때는 이전 창의 위치·크기에 새 창을 겹쳐 띄워 "한 창처럼" 보이게 한다.
**한계(정리드가 알아 둘 것):** 맥에서 창 교체 순간 깜빡임 가능, 윈도우 4창 메모리. 3대를 자주 켜 두는 사용이 많으면 B를 다시 검토.

### 4-2. 원격 브리지: 휴대폰 WebShell을 Node로 옮기지 않고 기존 부품을 잇는다

- 화면 쪽은 `mobile/install.ts`가 이미 하는 일 그대로: `createBridge(port)` → `createRemoteOffice(bridge, handlers)` → `window.office = session.office`. **`remoteOffice.ts`·`bridge.ts`는 거의 그대로 재사용.**
- `port`만 다르다: 휴대폰은 `window.OfficeBridge`(Kotlin), 데스크톱 원격 창은 **remotePreload가 주는 IPC 통로**(`postMessage`→`ipcRenderer.send`, `onmessage`←`ipcRenderer.on`). 모양이 `BridgePort`와 같아 `bridge.ts`가 모른다.
- 메인 쪽 새 부품 `RemoteBridge`(PC 1대 = 1개)가 셸 역할을 한다:

```
[원격 창 화면] window.office.X()
  → remoteOffice.ts (그대로) → bridge.ts (그대로) → IPC
  → main/workspace/remoteBridge.ts  ── call/upload ──▶ createPeerHttp (기존, 지문 고정 HTTPS)
        ▲                                                   │ POST /v2/call
        └── event/connection/resync ◀── PeerClient (기존: 8초 유예·재연결·Last-Event-ID)
                                        ◀── GET /v2/events
```

- **SSE를 새로 열지 않는다.** `PeerManager`가 이미 PC마다 `PeerClient` 하나로 `/v2/events`를 유지한다 → 이벤트를 `onPeerEvent(peerId, cb)`로 **갈래만 낸다**(tee). 이유: 서버 SSE 한도 8을 아끼고, 창이 없어도 결재 숫자 점이 계속 갱신되며, 재연결·8초 유예 규칙을 한 곳에서만 관리한다.
- `RemoteBridge`가 하는 일은 번역뿐: `call`→`POST /v2/call`(오류는 `{status,code,message}`로), `upload`→기존 올리기 경로, `PeerLinkState`→셸 `connection` 메시지(online=open, connecting/offline=reconnecting, unpaired=closed+reason), 서버 `resync` 이벤트→셸 `resync`. 매핑은 안드로이드 `WebShell.kt`와 같은 표를 따르면 된다(구현자가 그 파일 대조).
- **창이 누구 것인지는 메인이 정한다**: IPC 메시지에 peerId를 싣지 않고 `webContents.id → peerId` 표로 찾는다 → 한 창이 다른 PC 열쇠를 부를 길이 없다(보안 리뷰 포인트).

### 4-3. 화면 코드는 `IS_MOBILE_SHELL` 하나로 PC 전용 기능을 잠근다 → 이름이 거짓말이 되지 않게

휴대폰 PC 전용 잠금(폴더 고르기·로그인·설정 등)이 `IS_MOBILE_SHELL`로 약 87곳에 흩어져 있다. 원격 창도 같은 잠금이 필요하다.
- **선택:** `shell.ts`에 `'remote'` 틀을 추가하고 새 상수 `IS_REMOTE_SCREEN = SHELL !== 'desktop'`(= "원격 어댑터 화면")을 둔다. `IS_MOBILE_SHELL`은 **레이아웃·터치 전용(폰 배치)** 으로 남긴다.
- **교체 범위:** "PC 전용이라 막는다" 의미인 곳만 `IS_REMOTE_SCREEN`으로 바꾼다(LabSection·HireDialog·SettingsPage·McpSection·EquipmentTab·AutoApprove·InboxPage·ManualsPage·artifact-card·RemoteSection·PeerSection·OfficeMap 등 약 40곳, 기계적 치환). 레이아웃 의미(useLayout·IS_TOUCH·CoachTour·PhoneShell 분기)는 그대로 둔다.
- 다른 길(이름 그대로 두고 값만 넓히기)은 diff가 가장 작지만 `useLayout.ts`·`App.tsx:103`이 "원격 창 = 폰 배치"로 오해해 깨진다 → 비추천. 치환은 파일마다 의미 확인 필요(이 설계의 가장 큰 기계 작업, 위험은 낮고 `tsc`로 누락이 안 잡히므로 아래 검증의 '잠금 목록 테스트' 필요).
- 원격 창에서도 감춰야 할 **이 PC 전용 알림**(`RemoteUpgradeNotice`·`RemoteLanNotice`·`ProviderBanner`, `App.tsx:98·99·164`)도 같은 상수로.

### 4-4. 전환 UI는 새 상태 저장소 없이 메인이 목록의 진실

- 드롭다운이 보여 줄 데이터(PC 목록·색·연결 상태·결재 숫자·마지막 접속)는 **메인의 `WorkspaceHub` 한 곳**이 갖고, 모든 창에 `workspace:state`로 방송한다(`index.ts`의 `broadcast` 패턴). 창은 구독만.
- `window.officeWorkspace`는 `officeWindow`·`officeUpdate`처럼 **`OfficeApi` 밖**에 둔다. `OfficeApi`에 넣으면 원격 v2 분류표(`V2_METHODS`)가 "키가 정확히 같아야" 해서 PC 전용 항목을 또 달아야 하고, 이 기능은 휴대폰과 무관하다.
- `<WorkspaceSwitcher>`는 `PopMenu`(기존, 위/아래로 뜨는 목록)를 감싼 작은 컴포넌트. 이름 칸 자리는 `DesktopShell` 헤더의 `AI Office` 글자 자리.
- ⌘1~3은 창 안 `keydown`(기존 ⌘K 비서와 같은 방식, `MOD_KEY`)에서 `officeWorkspace.switchTo(index)`. 앱 메뉴 단축키는 쓰지 않는다(창이 포커스일 때만 필요하고, 메뉴에 올리면 메뉴막대 파일 수정이 늘어남).

## 5. 파일별 변경 목록

경로는 모두 `app/src/` 기준. ★ = 새 파일.

### 5-1. 메인 프로세스

| 파일 | 변경 | 규모 |
|---|---|---|
| ★ `main/workspace/remoteBridge.ts` | PC 1대의 셸 어댑터: `handle(text)`(call·upload·download) → `createPeerHttp`, `emit(msg)` → 창. 순수 번역이라 가짜 `PeerHttp`로 테스트 | 중 (~200줄) |
| ★ `main/workspace/workspaceHub.ts` | ① PC 목록 상태(`PeerRegistry` + 연결 상태 + 결재 숫자 + 색 + 마지막 접속) 계산, ② PC별 창 열기·전환·닫기(창 생성은 `index.ts`의 `createWindow` 옵션만 다르게: preload=`remotePreload.cjs`, 쿼리 `?view=remote`), ③ `webContents.id→peerId→RemoteBridge` 표, ④ 상태 방송. 창·IPC는 주입받아 테스트 가능하게(`PetWindows`처럼) | 중 (~250줄) |
| ★ `main/workspace/workspaceState.ts` | 순수 함수만: `waitingOf(snapshot)`(결재 숫자), `pickLeastRecent(peers)`(꽉 참 창의 "가장 오래 안 쓴 PC"), `reasonOf(linkState, lastError)`(연결 안 됨 이유 문구 키). 테스트 쉬움 | 소 |
| `main/peer/peerManager.ts` | ① 이벤트 갈래 `onPeerEvent(peerId, cb)` 추가(기존 `onEvent` 처리에 한 줄), ② `listPeers`·`linkState` 노출은 이미 있음, ③ 기존 짝 이전(7절): 시작 때 `view` 미허락 피어를 "허락 대기"로 표시, 데려온 직원 정리 로직 | 소~중 |
| `main/peer/peerStore.ts` | `PeerRecord`에 `color`·`viewState('granted'\|'pending'\|'denied')`·`outdated` 필드 추가. 표가 (id, data JSON)이라 **마이그레이션 없이** 옛 줄은 기본값으로 읽는다(`?? 'pending'`) | 소 |
| `main/index.ts` | `new WorkspaceHub(...)` 생성·`registerIpc`에 `workspace:*`·`wsbridge:*` 채널(몇 줄), `app.on('window-all-closed')`·`before-quit`에서 허브 정리, 다른 PC 결재 알림(기존 `Notification` 호출 자리에서 "PC 이름 · 직원 · 내용"으로 — 이 PC 결재함·트레이 배지·비서에는 **합치지 않음**) | 소~중 |
| `main/officeHandlers.ts` | `peerPairStart/peerSlots/peerRevokeSlot/peerPairConnect/peerList/peerUnpair/peerReconnect/peerRemoteStaff/peerAddStaff/peerRemoveStaff/peerCancelJob/peerChangeset*` 12개: 마법사·관리가 쓰는 것(`peerPairStart/Connect/List/Unpair/Reconnect/Slots/RevokeSlot`)은 **유지**, 데려오기 전용(`peerRemoteStaff/AddStaff/RemoveStaff/CancelJob/ChangesetDetail/ChangeFileDiff/ApplyChanges`)은 7절 일정대로 제거 | 소 |
| `preload.ts` | `officeWorkspace`(상태 구독·전환·목록 열기·마법사 열기) 노출 — 기존 `officeWindow` 노출 방식 복사 | 소 |
| ★ `remotePreload.ts` | 원격 창용: `officeBridgePort`(postMessage/onmessage) + `officeWorkspace`만 노출. **`office`·`officeUpdate`·`officePack`은 주지 않는다**(원격 창이 이 PC 기능에 닿지 못하게) | 소 |
| `vite.preload.config.mts` / forge 설정 | `remotePreload.cjs` 빌드 항목 추가(`petPreload`와 같은 방식 — 구현자가 설정 위치 확인) | 소 |

### 5-2. 화면(renderer)

| 파일 | 변경 | 규모 |
|---|---|---|
| `main.tsx` | `window.officeBridgePort`가 있으면 `import('./remote/install')`을 **`window.office.platform` 읽기 전에** 실행(지금 첫 줄이 `window.office.platform`이라 순서가 중요) | 소 |
| ★ `remote/install.ts` | `mobile/install.ts`의 축소판: `createBridge(window.officeBridgePort)` → `createRemoteOffice(bridge, handlers)` → `window.office`. `platform`은 호스트 OS(메인이 `?platform=`로 전달) | 소 |
| `mobile/remoteOffice.ts` | ① `platform:'android'` 하드코딩을 옵션(기본 `'android'`)으로, ② `PC_ONLY_TEXT`("휴대폰에서는…")를 옵션 `texts`로 덮어쓰게 — 원격 창은 "회사 PC에서 열어 주세요". (※ 이 문구는 지금 i18n 없이 한국어 하드코딩. 이번 범위에서 새로 쓰는 문구만 4개 언어 사전에 넣고, 기존 것은 건드리지 않는다) | 소 |
| `mobile/install.ts` | 재동기화(`onResync`) 블록 12줄을 함수(`resyncOffice()`)로 빼서 `remote/install.ts`와 공유(복붙 방지). 동작 변화 없음 | 소 |
| `shell.ts` | `SHELL`에 `'remote'` 추가(`window.officeBridgePort` 유무로 판단), `IS_REMOTE_SCREEN` 추가 | 소 |
| `App.tsx` | 98·99·164행 `!IS_MOBILE_SHELL`→`!IS_REMOTE_SCREEN`. `DesktopShell` 헤더에 `<WorkspaceSwitcher>`와 `<WorkspaceBand>`(띠) 삽입. 103행은 그대로(원격 창은 데스크톱 배치) | 소 |
| `layout/PhoneShell.tsx` | `ConnectionBanner`·경로 입력 시트·한 줄 안내(Notice)를 **공용 컴포넌트로 추출**해 `DesktopShell`에서도 그림. PhoneShell은 import로 바꿈(동작 동일) | 중 (옮기기) |
| ~40개 화면 파일(4-3절) | PC 전용 잠금 `IS_MOBILE_SHELL`→`IS_REMOTE_SCREEN` 기계적 치환 | 중 (넓지만 단순) |
| `features/SettingsPage.tsx` | 연결 구역(`RemoteSection`·`PeerSection` 자리)을 새 `ConnectedPcSection`으로 교체. `RemoteSection`(이 PC가 켜지는 쪽 — 포트·열쇠·휴대폰 QR)은 **그대로** 유지 | 소 |
| `index.css` | `[data-workspace-color]`로 PC색 변수(`--workspace`) + 창 테두리 한 줄 + 다크 값. 기존 테마 변수 구조 그대로 | 소 |
| `shared/i18n/dict/` 영역 파일 | `workspace.*` 키 추가(ko·en·ja·zh 4개). `peer.*` 중 데려오기 전용 키는 제거 시점에 정리 | 중 (문구량) |
| `shared/peerProtocol.ts` | `PeerView`에 `color`·`viewState`·`waiting`(결재 숫자)·`lastSeenAt` 추가 | 소 |

### 5-3. 새 화면 부품 (재활용 위주)

| 새 파일 | 하는 일 | 재활용하는 것 |
|---|---|---|
| ★ `features/workspace/WorkspaceSwitcher.tsx` | 왼쪽 위 이름 칸 + 목록(이 PC / 연결 PC 최대 3 / PC 추가 또는 꽉 참) + 합계 점 | `PopMenu`, `officeWorkspace` |
| ★ `features/workspace/WorkspaceBand.tsx` | 다른 PC 볼 때 위 띠 한 줄. 끊김이면 "연결 끊김 · 다시 연결 중" + [집 PC로 돌아가기] | `ConnectionBanner`(공용으로 뽑은 것)와 같은 줄에 붙이거나 그 안에 합침 — 띠가 둘로 갈라지지 않게 **한 컴포넌트** |
| ★ `features/workspace/ConnectWizard.tsx` | 마법사 4장(무엇을→어디서→준비물→코드/QR+이름·색). 한 파일에 단계별 작은 함수 4개 | 코드 입력·파싱은 `PeerSection`의 `ClientPart`·`parsePeerInvite`·`formatPairCode`, 코드/QR 보여 주기는 `HostPart`(`peerPairStart`·`PairWindowView`), 확인 글자는 `fingerprintShort` |
| ★ `features/workspace/ConnectedPcSection.tsx` | 설정의 "연결된 PC" 관리 목록(이름 바꾸기·색·해제·기기 끊기(`SlotList`)·꽉 참 고르기) | `PeerSection`의 `SlotList`·`PeerList`의 해제·재연결 버튼 |

→ 새 화면 파일이 4개로 많아 보이지만 **각각 한 곳에서만 쓰이고 서로 모양이 달라** 더 합치지 않는다. 반대로 마법사 단계 4개는 파일로 쪼개지 않는다(한 번 쓰고, 단계가 서로 상태를 넘긴다 — `useState` 한 곳이 읽기 쉽다).

## 6. 화면별 설계

### 6-1. 상단 드롭다운·PC색 띠·테두리
- 이 PC: 띠·테두리 없음, 이름 칸은 지금 `AI Office` 모양(보라 = 기존 primary).
- 다른 PC: 창 `<html data-workspace-color="teal|orange|blue">` + 띠. **색 값은 CSS 변수 한 곳**(`index.css`)이라 컴포넌트는 색 이름을 모른다.
- 창 제목: `AI Office · {PC 이름}`(Mission Control·Alt-Tab에서 구분).
- 윈도우 `titleBarOverlay` 색은 이 PC 창과 같이 `windowColors()` 사용(띠는 헤더 아래 DOM이라 윈도우 창 버튼과 안 겹침) → 윈도우 테두리는 DOM 테두리(`inset box-shadow`)로, OS 창 테두리 색에 의존하지 않음. (오큐에이 윈도우 실기기 확인 항목)
- 결재 숫자 점: `PeerView.waiting`을 드롭다운 줄과 이름 칸 옆 합계에 표시. 값은 `PeerManager`가 유지하는 SSE의 snapshot/approval에서 `waitingOf()`로 계산 — 창이 없어도 갱신.

### 6-2. 마법사 4장
- 시안 순서 그대로, **12자리 코드 + 지문 확인 글자 재사용**(기본값) — 새 8자리 체계 없음.
- 2장 "어디서"(같은 와이파이/밖/Tailscale)와 연결 방식 안내는 `PeerSection`의 "준비" 문구를 가져온다. 3장 "준비물"은 저쪽 PC에서 원격이 꺼져 있을 때를 위한 안내(`peer.ready.*` 키 재사용).
- 4장 이름·색: 이름 기본값 = 저쪽 PC 이름(`pairConnect` 결과의 `r.name`), 색 = 아직 안 쓴 색 중 첫 번째. 저장은 `PeerRecord`(보는 쪽 기기, 기본값 11번).
- 4장 직후 `viewState='pending'` → 저쪽 PC 결재 카드에서 허락(0단계) → 허락이 오면 창 자동 열림. 기다리는 동안은 연결 안 됨 이유 화면의 "허락 대기" 문구.

### 6-3. 끊김·꽉 참
- 끊김: 새 규칙 없음. `PeerClient`(8초 유예·1→30초 재연결·Last-Event-ID)가 이미 기본값 4와 같다. 화면은 `connection` 상태에 따라 (a) 마지막 화면 회색(`opacity`+`pointer-events` 한 클래스), (b) 보내기·결재 버튼 막기 — **막는 곳은 `window.office` 어댑터 한 곳**: 끊김 중이면 쓰기성 호출(`instruct`·`decide` 등)을 `call` 앞에서 거절하고 안내. 버튼마다 `disabled`를 단 곳이 늘지 않는다. 읽기 호출은 그대로 둔다.
  - ⚠ 이 거절은 `OFFICE_METHODS` 중 "쓰기"를 가려내야 한다 → `V2_METHODS`의 분류(`R`/`S`/`C`)에 이미 읽기·쓰기 정보가 있는지 구현 때 확인. 없으면 쓰기 목록을 `officeApiShape.ts`에 한 번만 정의.
- 입력 보존: 창이 안 닫히니 자동.
- 꽉 참(3대): 드롭다운의 "PC 추가"가 "해제할 PC 고르기" 창으로 바뀜. 가장 오래 안 쓴 PC 표시는 `pickLeastRecent`. 창은 `ConnectedPcSection`을 재사용(해제 버튼이 이미 있음) — 별도 화면 만들지 않고 "하나 해제해야 추가할 수 있어요" 안내만 얹는다.
- 한 PC에 붙는 기기 8대 가득(`PairFailure 'full'`): 마법사 4장에서 오류 문구로 `peer.error.full` 재사용 + 저쪽 "연결된 기기"에서 끊기 안내.

### 6-4. 기존 '직원 보내기·불러오기' 대체 범위

| 지금 | 새 구조 |
|---|---|
| `PeerSection` HostPart(보내기: 코드·QR 보여 주기) | → 마법사 3·4장 안으로 이동(`PairWindowView` 로직 재사용), 설정에 따로 남기지 않음 |
| `PeerSection` ClientPart(코드 붙여넣기) | → 마법사 4장 |
| `PeerList`(연결 PC·해제·재연결) | → `ConnectedPcSection` |
| `SlotList`(내가 보여 준 기기·끊기) | → `ConnectedPcSection`의 "이 PC에 붙은 기기"(열쇠 칸 8 한도) |
| 직원 데려오기(`peerRemoteStaff/AddStaff/RemoveStaff`)·랩 화면의 원격 직원 | 제거. 직원은 저쪽 PC 창에서 그대로 보인다 |
| 원격 직원 카드·`RemoteBadge`·`StaffPanel`/`InboxPage`/`BoardPage`의 `peerChanges`·`queuedJobIds` 분기 | 데려오기가 사라지면 쓸 곳이 없으므로 **제거 시점에 같이 정리**(아래 7절 순서) |

## 7. 기존 짝 이전·데려온 직원 정리 (순서가 중요)

한 번에 지우면 진행 중 일이 사라지므로 **2단계로 나눈다(구현은 정리드 판단)**:
1. **1차(기능 추가)**: 새 창·마법사·연결 PC 목록·알림 추가. 기존 짝은 `PeerRecord.viewState='pending'`으로 목록에 이전 표시, 데려오기 UI는 **숨기기만**(코드는 유지).
2. **2차(정리)**: 진행 중 일이 0개이고 대기 일을 다 보낸 PC부터 데려온 직원(`peer_staff`)·관련 분기·`peer.*` 키·`approvalRelay` 정리. 업데이트 직후 한 번에 지우지 않고 "일이 끝난 뒤"(기본값 6)를 코드 조건으로 둔다.
- 이유: 기본값 6이 "진행 중 일은 끝난 뒤 정리"를 요구하고, `ApprovalRelay`는 `peerJob` 결재 중계라 지우는 순간 대기 결재가 사라질 수 있다.
- 한계: 2차가 없으면 죽은 코드가 남는다 → 정리드가 2차를 같은 릴리스에 넣을지 한 단계 뒤로 미룰지 결정해야 한다(권장: 같은 릴리스에서 숨김, 다음 릴리스에서 삭제).

## 8. 새로 만들지 않는 것 (일부러)

- 새 짝짓기·8자리 코드·새 통신 프로토콜: 없음(기본값).
- 창 상태 공유용 전역 저장소·"워크스페이스 store": 없음. 목록은 메인이 방송하고 창은 구독만.
- PC별 컴포넌트 분기·"원격 전용 버전" 화면: 없음. 같은 화면 코드가 `window.office`만 바뀌어 돈다.
- 앱 메뉴 단축키·메뉴막대 변경: 없음(⌘1~3은 창 안 keydown).
- 결재 합쳐 보기·트레이 배지 합산: 없음(기본값 1).
- 다른 PC 파일 열기·"누가 보고 있어요" 표시: 1단계 제외(기본값). `openAttachment`/`artifact*` 호출은 어댑터가 "그 PC에서 열어 주세요" 안내.

## 9. 검증 방법

**자동(`pnpm typecheck`·`pnpm test`)** — 순수·주입 구조로 DOM·Electron 없이 돌린다(`mobile.test.mts`·`deskPet.test.mts` 방식)
1. `workspace.test.mts`(★): ① `RemoteBridge`: 가짜 `PeerHttp`로 call 성공·오류 코드 매핑·`confirm_required` 왕복·upload, 가짜 `PeerClient` 이벤트가 셸 메시지로(연결 상태 4종→connection 3종·resync). ② `workspaceState`: `waitingOf`·`pickLeastRecent`·`reasonOf`. ③ `WorkspaceHub`: 창 없이 `webContents.id→peerId` 표가 다른 PC로 안 새는지, 4번째 PC 추가 거부, 이 PC 포함 최대 4창.
2. 기존 `mobile.test.mts`: `createRemoteOffice`의 `platform`·`texts` 옵션이 **기본값에서 안 바뀌는지**(안드로이드 회귀 방지).
3. `shellLocks.test.mts`(★): PC 전용 잠금 치환 누락 방지 — "`IS_MOBILE_SHELL`을 쓰는 화면 파일 목록" 스냅샷을 만들어 새 파일이 늘 때 알린다. `tsc`는 잠금 누락을 못 잡는 게 이 설계의 가장 큰 구멍.
4. `i18n.test.mts`가 새 `workspace.*` 키 4개 언어를 잡는다(기존).
5. 끊김 중 쓰기 차단: 어댑터 단위 테스트(끊김 상태에서 `instruct`가 `call` 전에 거절).

**수동(오큐에이 포함)**
- PC A에서 B·C·D를 드롭다운·⌘1~3으로 오가며 사무실·대화·결재·지시가 B 화면과 같은지.
- 한쪽만 끄고 8초 뒤 회색+보내기 막힘, 다시 켜면 자동 재연결·놓친 대화 이어 받기, 입력 중이던 글 보존.
- 두 기기가 같은 결재 동시에 → "다른 기기에서 이미 처리했어요"(서버 409 문구 연결).
- 다른 PC 결재 → 이 PC 결재함·비서·트레이에는 안 섞이고 숫자 점·기기 알림(PC 이름 포함)만.
- 윈도우: 창 테두리·창 버튼 겹침·알림, 맥: 창 교체 깜빡임, 4창 메모리.
- 기존 짝 이전: 짝짓기 다시 안 하고 목록에 나오는지, 저쪽 허락 전/후.

## 10. 위험·한계·정리드께 확인할 것

| # | 내용 | 영향 |
|---|---|---|
| 1 | 0단계 슬롯 `view` 권한의 이벤트 모양이 휴대폰과 같아야 함(2절) | 안 같으면 브리지에 보정 코드 증가 |
| 2 | 창 4개 메모리·맥 깜빡임(4-1) | 사용해 보고 한 창 방식(B)으로 바꿀 여지. 그때도 `RemoteBridge`·`remote/install.ts`는 그대로 재사용됨 → **창 방식은 나중에 바꾸기 쉽게** 허브 한 곳에 몰아 둠 |
| 3 | `IS_MOBILE_SHELL`→`IS_REMOTE_SCREEN` 치환 40곳, 누락은 `tsc`가 못 잡음(4-3) | 원격 창에서 PC 전용 버튼이 살아 있을 수 있음 → 서버(`pc_only` 422)가 막긴 하지만 UI가 어색. 검증 3번으로 완화 |
| 4 | 업로드·다운로드·`WebShell.kt` 오류 매핑을 이번에 읽지 않음 | 구현 시작 때 `WebShell.kt`·`v2routes.ts`의 해당 경로를 먼저 대조(설계상 위치만 정해 둠) |
| 5 | `PC_ONLY_TEXT`가 i18n 안 된 한국어 하드코딩(기존 부채) | 건드리면 범위 확장 → 새 문구만 사전화, 기존은 두고 정리드가 별도 판단 |
| 6 | 단순함의 한계: 쓰기 차단을 어댑터 한 곳에서 하면 "어떤 메서드가 쓰기인지" 목록 관리가 필요 | 새 `OfficeApi` 메서드가 추가될 때 분류 누락 → 기존 `V2_METHODS` 분류표를 재사용하면 같은 테스트(키 일치)가 잡아 준다 |

## 11. 이 설계의 판단 근거 요약

- **재활용 우선**: 휴대폰이 이미 `remoteOffice.ts`로 `window.office` 전체를 원격으로 잇는다 → 데스크톱에서도 같은 부품. 새 코드는 "메인에서 셸 역할"(`RemoteBridge`)과 "창·목록 관리"(`WorkspaceHub`) 둘이 핵심.
- **분리는 필요한 곳만**: 저장소는 창으로 분리, 목록은 메인 한 곳, 새 파일은 각각 쓰임이 하나인 것만.
- **단순함의 비용을 적음**: 창 4개 메모리·치환 누락·쓰기 목록 관리(10절).
