# 워크스페이스 데스크톱 구현 설계 — 유지보수성·변경 영향 최소화·검증 가능성 관점 (박패턴)

- 작성: 박패턴 · 2026-11-12 · 기준 1.2.0 · 코드 수정 없음(설계만)
- 최가독 안과 미리 맞추지 않고 독립으로 썼습니다. 이 문서에서 최가독 안을 전제로 한 비교는 하지 않습니다(전달받은 요약만 있고, 비교는 정리드가 요청하면 보완).
- 읽은 곳: `workspace-handoff.md`·`workspace-defaults.md`·`../workspace-feasibility.md`, `mobile/remoteOffice.ts`·`bridge.ts`·`install.ts`, `main/peer/peerClient.ts`·`peerTransport.ts`·`peerManager.ts`(목록)·`peerRegistry.ts`, `main/remote/handler.ts`·`v2.ts`(분류표), `main/index.ts`(창·IPC·종료 규칙), `preload.ts`, `petWindow.ts`(앞선 부가 창 선례), `renderer/shell.ts`·`store.ts`, `vite.mobile.config.mts`, 안드로이드 `ErrorMappingTest.kt`(오류 표).

## 1. 한 줄 결론

> **새 기능은 전부 새 폴더(`main/workspace/`, `renderer/remote/`)에 두고, 기존 코드는 "조립 한 줄"과 "문 하나 잠그기"만 고친다.**
> 이 PC 화면이 안 바뀌는 것을 "조심해서 만들겠다"가 아니라 **의존 방향·통로 이름·저장 위치·테스트 네 가지로 구조에 박는다.**

## 2. 요구사항 해석과 빠진 입력

- 다른 PC 화면 = 같은 화면 코드가 `window.office`만 원격 어댑터(`createRemoteOffice`)로 채워서 도는 것(휴대폰 방식). 화면을 새로 만들지 않는다.
- 새로 짜는 것은 **셸(안드로이드 `WebShell.kt`가 하던 일)의 Node 판**: 호출 전달·이벤트 전달·재연결·오류 번역·쓰기 막기.
- 기본값 6개는 확정으로 따른다.

**입력이 부족한 부분(설계에 영향)** — 정리드가 강백엔과 못박아야 합니다.

| 없는 것 | 설계에 주는 영향 |
|---|---|
| '화면 보기' 열쇠가 `/v2/events`에서 받는 이벤트 모양(휴대폰과 같은가) | 같으면 아래 구조 그대로. 다르면 `workspaceBridge`에 번역 함수 1개 추가(`fillOldSnapshot` 같은 보정). 지금 `isPeerPathAllowed`·`shapePeer`는 좁은 모양만 준다 |
| 열쇠 하나로 SSE 2줄(일 중계용 + 화면용)이 열리는가, 허락 상태·프로토콜 버전이 hello에 오는가 | 4-2·7절 상태 판정의 입력. 허락 상태가 없으면 "허락 대기"를 알 방법이 없다 |
| 원격 읽기/쓰기 분류표 | `V2_METHODS`는 R/S/P/C/U(위험 분류)라 읽기·쓰기가 아님. 6-3절의 새 표가 필요 |
| 윈도우 창 버튼 영역(titleBarOverlay)에서 PC색을 어디까지 칠할지 | 시안은 맥 기준. 윈도우는 구현 때 실기기 확인 |

## 3. 변경할 부분 한눈에

| 구분 | 위치 | 내용 | 기존 코드 수정 |
|---|---|---|---|
| 새 | `main/workspace/` | 저장·링크·브리지·창·알림·이전 (4절) | 없음 |
| 새 | `remotePreload.ts` + `renderer/remote/` + `remote.html` + `vite.remote.config.mts` | 원격 창용 통로·진입점·빌드 | 없음 (빌드 설정 한 줄 추가) |
| 새 | `shared/workspace.ts` | 타입·순수 함수(상태 판정·한도·읽기/쓰기 표) | 없음 |
| 새 | 화면: 전환 드롭다운·띠·마법사·연결 PC 관리 | `renderer/features/workspace/` | `PopMenu`·`PeerSection`의 코드 입력부 재사용(import만) |
| 고침 | `main/index.ts` | ① `createWorkspaces(...)` 조립 1줄 ② `office:*` 핸들러에 "보낸 창이 이 PC 창인지" 검사 1곳 | 작음 (6-1) |
| 고침 | `renderer/shell.ts` + 19개 파일 | `IS_REMOTE_VIEW` 추가, "PC 전용 잠금" 분기만 치환 | 중간 (6-4) |
| 고침 | 이 PC 창 상단 이름 칸 | 워크스페이스 0개면 지금과 동일, 있으면 드롭다운 | 작음 |
| 그대로 | `store.ts`·`remoteOffice.ts`·`bridge.ts`·`mobile/install.ts`·`PeerManager`·`PeerClient`·`remote/*`(0단계 제외)·`office.ts`·휴대폰 앱 | 건드리지 않음 | **없음** |

## 4. 역할별 구조

의존 방향은 **한쪽으로만**: `main/workspace/*` → `main/peer/*`, `main/remote/*`(읽기 전용 부품), `shared/*`. 반대 방향 import 금지(6-2).

### 4-1. 메인 프로세스 (`main/workspace/`)

| 파일 | 역할(한 가지씩) | 순수? | 분리 이유 / 추가 복잡도 |
|---|---|---|---|
| `workspaceStore.ts` | 목록 `{id, peerId, name, color, order, lastUsedAt}`을 **자기 파일(`workspaces.json`)** 에 저장. 열쇠·주소는 안 가진다(기존 `PeerRegistry`·vault가 단일 출처, `peerId`로만 참조) | 입출력만 얇게 | 열쇠를 둘로 복사하면 폐기·끊기가 어긋남. 이름·색만 가지면 보는 쪽 저장(11번)과 맞음 |
| `workspaceStatus.ts` | **상태 한 가지를 판정하는 순수 함수** `statusOf(link, hello, grant, now)` → 7절의 `WorkspaceStatus` | ✅ | 드롭다운·창 배너·관리 목록·마법사가 같은 판정을 써야 화면마다 말이 안 달라짐. 표 테스트로 고정 |
| `workspaceLink.ts` | PC 1대 = `PeerClient` 1개 + `createPeerHttp` 1개. 상태·최근 스냅샷의 결재 수·`lastEventId` 보유. 창이 없어도 살아 있어 숫자 점이 갱신 | 가짜 `OpenStream`으로 | 이 PC가 **PeerManager와 별개의 화면용 SSE**를 연다(4-2) |
| `workspaceBridge.ts` | 셸 메시지(`call/upload/download` ⇄ `result/event/connection/resync/hello`)와 링크를 잇는 번역기. **쓰기 막기·오류 번역·이벤트 거르기를 여기서** | ✅ 가짜 링크로 | 화면 쪽 `bridge.ts` 계약(`BridgeRequest`·`ShellMessage`)을 그대로 지켜 `remoteOffice.ts` 무수정 |
| `workspaceErrors.ts` | `mapHttpError`/`mapIoError`의 TS 판(안드로이드 `ErrorMappingTest.kt`와 같은 표) | ✅ | 휴대폰과 "같은 오류 → 같은 문구". 6-5 골든 표 |
| `workspaceWindows.ts` | 창 만들기·보이기·승계·닫기, **창 ↔ 워크스페이스 매핑**(`webContents.id → workspaceId`), IPC 등록, ⌘1~3 메뉴 | 얇음 | 창 일은 이 파일만. `index.ts`의 `win` 싱글톤(38곳)을 일반화하지 않기 위함 |
| `workspaceAlerts.ts` | 보지 않는 PC의 결재 **숫자 점**과 **기기 알림**(PC 이름 포함). 이 PC의 `publish`·트레이 배지·바탕화면 비서·`Notification` 경로를 **타지 않는다** | 순수 중복 제거 + 얇은 발송 | 기본값 1의 "섞지 않음"을 파일 경계로 보장 |
| `workspaceMigration.ts` | 기존 짝 → 워크스페이스 목록 이전(멱등, 데이터만 추가·삭제 없음) | ✅ | 되돌릴 수 있음(6-6) |
| `index.ts` | `createWorkspaces({ peerRegistry, vault, net, notify, ... })` — **의존을 인자로 받는 조립 함수**. 목록이 비어 있으면 링크·창·구독을 하나도 만들지 않는다 | — | 새 코드가 기존 모듈을 직접 import하지 않고 주입받아 가짜로 갈아끼울 수 있음 |

### 4-2. 화면용 SSE를 PeerManager와 따로 두는 이유 (쟁점 ①)

- **선택**: `workspaceLink`가 자기 `PeerClient`를 연다. `PeerManager`의 연결·이벤트를 나눠 받지 않는다.
- **이유(이번 작업)**: `PeerManager`는 일 중계·결재 중계·직원 캐시·동기화가 한 클래스(495줄)에 엮여 있고, 데려오기는 곧 걷어낼 대상이다. 여기에 "이벤트 나눠 받기"를 달면 **걷어낼 코드에 새 의존이 생기고**, 이 PC의 일 중계 동작이 새 기능 버그에 노출된다. 따로 두면 `PeerManager`는 한 줄도 안 바뀐다.
- **비용**: PC당 SSE가 2줄(중계용 + 화면용). 저쪽 열쇠 칸·연결 한도(8)는 **열쇠 1개 = 칸 1개**이므로 칸은 더 안 먹지만 "한 열쇠로 동시 2줄"이 허용되는지는 강백엔 확인 필요(2절 표). 데려오기 제거 뒤 중계용 줄이 사라지면 자연히 1줄.
- **대안**: 이벤트 나눠 받기(줄 1개, 코드 적음). 데려오기 제거 후에는 이쪽이 더 단순하지만 지금은 영향 범위가 큼 → **제거 릴리스 뒤에 합치는 후속 정리**로 미룬다.

### 4-3. 창 구조 (쟁점 ②)

- **선택: 워크스페이스마다 `BrowserWindow` 1개, 필요할 때 만들고(지연 생성) 닫지 않고 숨긴다. "전환"은 현재 창의 위치·크기를 다음 창이 승계하고 이전 창을 숨기는 것.**
  - 이유: 화면 상태 저장소가 앱 전체 하나(`store.ts`)라서 창이 나뉘면 **`store.ts`를 안 고치고** 자동 분리된다. 입력 중 글·스크롤이 창과 함께 보존돼 기본값 4("입력 보존")가 별도 저장 코드 없이 충족된다. 드롭다운은 각 창 안의 화면이라 뷰끼리 겹침 문제(WebContentsView 안)도 없다.
  - 승계 + 숨김으로 "같은 창에서 바뀐 느낌"을 유지(1안 시안). 창이 보일 때 `resync`를 보내 숨어 있던 사이 쌓인 갱신을 한 번에 다시 그린다.
  - 비용: 창 최대 4(이 PC + 3). 원격 창은 `backgroundThrottling`을 **켠다**(이 PC 창은 사무실 애니메이션 때문에 끔) → 숨은 창 CPU 절감. 메모리는 창당 수십~백 MB 수준으로 PC 사양에 따라 느껴질 수 있음 → 3대 한도의 근거 중 하나.
- **창마다 `session.fromPartition('persist:ws-<id>')`**: 화면이 `localStorage`를 30곳 쓰므로 안 나누면 **이 PC의 테마·읽음 표시·둘러보기 완료가 원격 창과 섞이거나 덮어쓴다.** 파티션 하나가 가장 싼 분리.
- **한 창 + WebContentsView(B안)는 비추천**: 크기 동기화·위에 덮이는 드롭다운·윈도우 titleBarOverlay와의 충돌 등 새 기반이 필요하고 얻는 것(메모리 일부)이 이번 범위에선 작다.
- **종료 규칙**: 원격 창은 `petWindow.ts` 선례처럼 **`window-all-closed`·Dock `activate`·트레이 "열기"의 판단에 끼지 않는다**(이 PC 창 하나만 기준). 원격 창만 남아 앱이 안 꺼지는 사고를 막는다.

### 4-4. 통로: 원격 창은 `office:*`를 쓰지 않는다 (쟁점 ③, 가장 중요)

- 같은 preload·같은 채널명(`office:<메서드>`)으로 원격 창을 만들면, **`main`이 보낸 창을 구분하지 못하는 순간 원격 창의 버튼이 이 PC의 사무실을 움직인다**(지금 `ipcMain.handle('office:*')`는 보낸 창 검사가 없음 — `errors:list`만 있음).
- **선택**: 원격 창은 `remotePreload.ts`로 `window.OfficeBridge`(휴대폰과 같은 `postMessage/onmessage`) 한 개만 노출한다. 채널은 `ws:post`/`ws:msg`뿐이고 **"어느 PC인지"는 렌더러가 말하지 않는다** — 메인이 `event.sender.id`로 `workspaceWindows`의 매핑을 찾는다(렌더러가 바꿔 부를 수 없음). 이 PC용 API(`officeUpdate`·`officePack`·`officeScene`·`officeDeskPet`·`officeErrors`·`officeWindow`)는 **원격 preload에서 노출하지 않는다** — 이를 부르는 화면 쪽 8곳은 `window.officeX?.`로 이미 방어돼 있는지 구현 때 점검(없으면 원격 진입점에서 빈 구현을 꽂는다).
- **그래도 한 겹 더**(구조 + 방어): `office:*`·`pet:*`·`errors:*`·`pack:*` 등 이 PC용 핸들러 등록 래퍼에 "`e.sender`가 이 PC 창일 때만" 검사를 넣는다. 변경은 등록 함수 1곳. 부작용은 이 PC 창 외 호출이 막히는 것뿐이고 현재 쓰는 곳은 `win`·`pet` 창이므로 `petPreload`의 채널(`pet:*`)과 겹치는지만 확인하면 됨.
- 이 PC용 새 기능(마법사·목록·전환)은 **`OfficeApi`에 넣지 않고** `window.officeWorkspaces`(pack·scene처럼 OfficeApi 밖, `workspace:*` 채널)로 둔다 → `V2_METHODS`(전수 분류 강제)·원격 표면·휴대폰 어댑터에 번지지 않음.

### 4-5. 화면 (렌더러)

| 구성 | 위치 | 비고 |
|---|---|---|
| 원격 창 진입 | `renderer/remote/main.tsx` + `install.ts` | `createBridge`+`createRemoteOffice`만 꽂는 ~40줄. **`mobile/install.ts`는 수정하지 않는다**(레이아웃 판정·키보드·뒤로가기 등 휴대폰 전용이 섞여 있고 `mobile.test.mts`가 보호 중). 중복은 짧고, 휴대폰 회귀 위험이 0 |
| 빌드 | `vite.remote.config.mts` | `vite.mobile.config.mts`처럼 데스크톱 설정에 덧붙임. `__OFFICE_SHELL__ = 'remote'`. 이 PC 빌드·모바일 빌드와 산출물이 분리 |
| 셸 상수 | `shell.ts` | `IS_MOBILE_SHELL` 의미는 그대로(휴대폰 배치·터치). 새 `IS_REMOTE_VIEW = mobile || remote` = "원격이라 PC 전용을 잠근다". 40곳 중 **잠금 용도만** 치환, 배치 용도(`useLayout` 등)는 그대로 |
| 전환 드롭다운 | `WorkspaceSwitcher` | 목록·합계 점은 `officeWorkspaces.onChange`로. `PopMenu` 재사용. 이 PC 창에서 워크스페이스 0개면 지금 이름 칸 그대로(스냅샷 테스트) |
| PC색 띠·테두리·이름 칸 | `WorkspaceFrame` | 창 루트에 `data-ws-color` 1개 → CSS 변수만 바꿈. **컴포넌트 안에서 "원격이면" 분기를 만들지 않는다.** 윈도우 창 버튼 영역은 메인이 `setTitleBarOverlay`로 칠함 |
| 끊김·꽉 참 | `WorkspaceBanner`, `FullPickDialog` | 둘 다 `WorkspaceStatus`(7절)를 받아 그리는 얇은 표시 |
| 마법사 4장 | `WorkspaceWizard` + `wizardReducer`(순수) | 6-7 |
| 연결 PC 관리 | `ConnectedPcSection` | 이름·색 수정, 끊기, 기기 열쇠 칸 보기 |

## 5. 데이터 흐름

```
[원격 창 렌더러]                    [메인: main/workspace]                         [저쪽 PC]
 화면 → window.office.X
   └ createRemoteOffice ─ bridge.request ─ OfficeBridge.postMessage
        ── ws:post ──▶ workspaceBridge ─(쓰기이고 링크≠online이면 여기서 거절)
                          └ link.http.call('/v2/call') ───────────────▶ POST /v2/call
        ◀─ ws:msg(result|error) ◀ workspaceErrors(번역) ◀──────────────  응답/오류
 저쪽 변화 ◀ ws:msg(event) ◀ bridge(이벤트 거르기) ◀ link.PeerClient ◀── GET /v2/events (SSE)
                                         └ 결재 수 → workspaceAlerts → 점·기기 알림
```

- **데이터 변환 위치**: 화면 모양 맞추기(`fillOldSnapshot` 등)는 기존대로 `remoteOffice.ts`. 오류 번역·이벤트 거르기는 `workspaceBridge`. **화면 컴포넌트에는 변환이 없다.**
- **상태 소유**: 화면 상태 = 창(zustand), 연결 상태·결재 수 = `workspaceLink`, 목록·이름·색 = `workspaceStore`, 열쇠 = 기존 vault. 한 값을 두 곳이 갖지 않는다.
- **이벤트 거르기**: 브리지는 `snapshot/log/chat/focus/remoteStatus/galleryChanged`만 창에 보낸다(모르는 이벤트는 버림 = 새 PC·옛 앱 섞임에 안전).
- **변경 후 갱신**: 호출이 성공해도 화면 갱신은 기존처럼 저쪽 SSE의 `snapshot`이 한다(낙관 갱신 없음). 끊김 뒤 재연결은 `resync` → 화면이 스냅샷·대화·최근 기록을 다시 읽음(`install.ts`의 `onResync` 로직과 같음).

## 6. "이 PC 화면에 영향이 없다"를 구조로 보장하는 방법

| # | 보장 장치 | 이번 작업의 이득 / 추가 복잡도 |
|---|---|---|
| G1 | **의존 방향**: `main/workspace`는 import 가능하지만 `main/peer`·`main/remote`·`office.ts`는 `main/workspace`를 import하지 않는다. `main/index.ts`만 조립 | 새 기능을 통째로 끄거나 뺄 수 있음. 한 줄 테스트로 고정 |
| G2 | **통로 분리**: 원격 창은 `ws:*`뿐, 이 PC 핸들러는 보낸 창 검사 | 원격 창 버그·악성 화면이 이 PC를 조작하는 길 자체가 없음. 검사는 등록 함수 1곳 |
| G3 | **저장 분리**: `workspaces.json` + 창별 파티션 | 이 PC의 설정·DB·localStorage와 섞이지 않음. 지우면 흔적 없음 |
| G4 | **알림 분리**: 원격 이벤트는 `workspaceAlerts`로만. 이 PC `publish`·트레이·비서·`Notification` 호출 없음 | 기본값 1("섞지 않음")을 코드 경계로. 실수로 합쳐지면 테스트가 깨짐 |
| G5 | **지연 생성**: 목록이 비면 링크·창·구독·타이머 0개 | 안 쓰는 사용자의 시작 시간·메모리·동작 동일 |
| G6 | **렌더러 치환의 안전 조건**: 데스크톱 빌드에서 `IS_REMOTE_VIEW === false`이므로 치환한 분기는 기존과 **참/거짓이 같다** | 치환 누락(원격에서 PC 전용 기능이 열림)은 `tsc`가 못 잡음 → 6-4 목록 테스트 |
| G7 | **종료 규칙에서 제외**: 원격 창은 `window-all-closed`·`activate` 판단 밖 | 이 PC 앱 수명 동작 불변 |

### 6-1. `main/index.ts` 수정은 이 두 곳뿐
1. `createWorkspaces(...)` 조립 1줄(+ 종료 때 `dispose` 1줄).
2. `registerIpc`의 `ipcMain.handle('office:*')` 등을 `onLocalWindow(fn)` 래퍼로 감싸기(보낸 창 = 이 PC 창일 때만 실행). **이 PC 창 동작은 같다.** 래퍼가 막는 호출은 현재 없어야 정상이므로 "막힌 횟수 0" 로그를 개발 중 확인.

### 6-4. `IS_MOBILE_SHELL` 치환
- 용도 분류: ① 레이아웃·터치(`useLayout`, `IS_TOUCH`) → 그대로 ② **PC 전용 잠금**(`LabSection`·`HireDialog`·`McpSection`·`SettingsPage` 등) → `IS_REMOTE_VIEW` ③ 휴대폰 전용 동작(`newStaffApprovalMode`처럼 결재 모드 기본값) → 원격에서도 같은 의미인지 항목별 판단.
- 한 번에 바꾸지 않고 **파일 단위로**: 치환 직후마다 `tsc`·`npm test`. "새 잠금 용도 분기가 생길 때 `IS_REMOTE_VIEW`를 안 쓰면 실패"하도록 소스 훑기 테스트(허용 목록 `{파일: 줄 수}`)를 둔다(원인: 분기가 40곳이라 사람 기억에 맡길 수 없음).

## 7. 상태 판정과 오류·끊김 처리 (한 곳에서)

`statusOf()`가 내는 값 하나가 드롭다운 행·창 배너·관리 목록·마법사의 화면을 정한다.

| 상태 | 판정(입력) | 화면 | 쓰기 |
|---|---|---|---|
| `connecting` | 처음 붙는 중 | 회색 스피너 행 | 막음 |
| `ready` | PeerClient online + 버전·권한 통과 | 평소(PC색) | 허용 |
| `reconnecting` | online이었다가 끊김, **8초 이내** | 표시 없음(깜빡임 방지) | 막음 |
| `offline` | 8초 경과(기본값 4) | 마지막 화면 회색 + "연결 끊김" 배너 + 집 PC로 돌아가기 | 막음 |
| `grantPending` | 저쪽 결재 대기(기존 짝 이전·처음 짝) | "저쪽 PC에서 허락해 주세요" | — |
| `grantDenied` | 저쪽이 거절 | 안내 + 다시 요청 | — |
| `peerOutdated` | 저쪽 프로토콜 < `WORKSPACE_MIN_PEER_PROTOCOL` 또는 화면 보기 능력 없음 | "그 PC를 업데이트해 주세요" — **창을 열지 않음** | — |
| `selfOutdated` | 저쪽이 `protocol_unsupported`로 이쪽이 구버전 | "이 PC를 업데이트" | — |
| `unpaired` | 401/403/426, `token_revoked`, `SPKI_MISMATCH`(`PeerClient`가 이미 구분) | "다시 짝지어 주세요" + 마법사 연결 | — |
| `full(self)` | 이 PC 목록 3대 | "PC 추가" 대신 해제 고르기 | — |
| `full(peer)` | 짝짓기가 저쪽 열쇠 칸 8개 초과로 거절 | "저쪽 PC가 꽉 찼어요 — 그 PC의 '연결된 기기'에서 끊어 주세요" | — |

- **쓰기 막기는 메인 브리지가 한다**(권위 있는 곳). 렌더러가 버튼을 비활성화하는 것은 보조(UX). 이유: 창 화면은 결국 렌더러 코드라 어떤 버튼을 놓쳐도 메인에서 막혀야 하고, 어댑터(`window.office` 바깥)와 달리 한 곳에서 모든 경로(업로드·다운로드 포함)가 지난다.
- **읽기/쓰기 표**: `Record<OfficeMethod, 'read' | 'write'>`를 `shared/workspace.ts`에 둔다. 키가 전수여야 하는 타입이라 **새 `OfficeApi` 메서드가 생기면 `tsc`가 실패**한다(`V2_METHODS` 방식과 같음). 기존 R/S/P/C/U 표는 위험 분류이지 읽기/쓰기가 아니라 재사용하지 않는다.
- **전송 중 끊김**: 이미 보낸 쓰기가 응답 없이 끊기면 자동 재전송하지 않고 "결과를 확인해 주세요" 오류로 돌려준다(중복 지시·중복 결재 방지). `/v2/call`의 멱등 키는 같은 요청 재시도 한정으로만 쓴다.
- **409 `already_decided`**: 안드로이드 표(`ApiError.AlreadyDecided`)와 같은 코드로 번역해 전달 → 화면은 "다른 기기에서 이미 처리했어요" 한 줄(문구는 이디자 1-b). 지시는 충돌이 아니라 그대로 큐 순서.
- **옛 이벤트 재전송 중복 알림**: `workspaceAlerts`가 결재 id로 중복을 거르고, 링크가 처음 online이 되기 전의 결재는 알리지 않는다(켜자마자 3대의 묵은 결재가 쏟아지는 것 방지). 그 PC 창이 보이고 포커스면 기기 알림을 생략.

## 8. 버전 섞임 처리 (쟁점 ④)

- **게이트는 한 곳**: 링크가 online이 되면 hello의 프로토콜 버전·능력·허락 상태를 `statusOf()`에 넣는다. 통과 전에는 **원격 창을 만들거나 보여주지 않는다**(`peerOutdated`는 목록 행에만 안내) → "옛 PC라 화면이 깨짐" 위험을 입구에서 차단.
- **저쪽이 새 버전**(이쪽이 옛): 저쪽이 보내는 모르는 이벤트는 `parseShellMessage`·브리지 화이트리스트가 버리고, 모르는 메서드는 404 `unknown_method` → 기존 `pcUpdate` 안내 경로. 프로토콜 자체가 안 맞으면 `selfOutdated`.
- **저쪽이 약간 옛**: 이미 쓰는 능력 협상 재사용 — 헤더 `X-Office-Capabilities`(iso-office)와 `fillOldSnapshot`·`pcChecked`. 새 협상 체계를 만들지 않는다.
- 상수 `WORKSPACE_MIN_PEER_PROTOCOL` 한 개와 문서(0단계 `remote-protocol` 갱신)를 짝으로 올린다 — 버전 정책이 코드 흩어짐 없이 한 줄.
- 에러 번역 표는 **안드로이드 `ErrorMappingTest.kt`와 같은 입력·출력 표**를 TS 쪽 테스트에 옮겨(골든 표) 양쪽이 어긋나면 알 수 있게 한다.

## 9. 마법사 4장·끊김·꽉 참·기존 기능 대체

### 9-1. 마법사 (무엇을 → 어디서 → 준비물 → 코드/QR + 이름·색)
- `wizardReducer(state, action)` 순수 함수로 장·입력·오류·뒤로 가기를 표현한다. 장마다 컴포넌트는 reducer 상태를 그리기만 한다(상태 로직 테스트 가능).
- **짝짓기·열쇠 저장은 기존 것을 부른다**: 12자리 코드·지문 확인 글자는 `PeerSection`의 `ClientPart`/`HostPart`를 재사용(import만), 실제 짝짓기는 기존 `PeerManager.pair`(또는 동등한 기존 진입점). 마법사 끝에서 `workspaceStore.add({peerId, name, color})`만 한다 → 열쇠 출처 단일.
- "어디서" 장의 연결 시도 순서(같은 와이파이 → 밖 → Tailscale)는 `tryEndpoints()` 순수 함수(주소 후보 배열 → 시도 순서·실패 이유 배열)로 만들고, 실패 이유가 곧 **'연결 안 됨 이유' 화면**의 입력.
- 코드·QR 장: 이 PC가 **보여 주는 쪽**일 때(상대가 나를 연결) 기존 `HostPart` 재사용. 3대 한도 판정은 `canAddWorkspace(list)` 순수 함수.

### 9-2. 끊김 화면
- 별도 로직 없음: 7절 상태를 받아 배너만 그림. 재연결은 `PeerClient`(1→30초, 무제한, `retryNow`)가 이미 한다 — **새로 짜지 않는다.** "집 PC로 돌아가기"는 `hub.switchTo(self)`.

### 9-3. 꽉 참(3대)
- `full(self)`이면 "PC 추가" 대신 `FullPickDialog`: `lastUsedAt` 가장 오래된 PC를 표시, 선택하면 `workspaceStore.remove` 후 마법사로. 해제는 목록·열쇠 칸에서 이 PC 쪽 정보만 지움(그 PC 사무실은 그대로).

### 9-4. 기존 직원 보내기·불러오기 대체 — **3단계로 나눠 한 번에 안 지운다**
1. **추가**(이번 구현): 새 진입점·`workspaceMigration`(데이터만 추가, 멱등). `PeerSection`의 보내기·불러오기는 **숨김**(기능 플래그), 코드는 그대로.
2. **이전**: 기존 짝마다 목록 항목을 `grantPending`으로 만든다(저쪽 허락 결재). 데려온 직원은 진행 중 일이 끝난 뒤 정리: `isLegacyDrained()`(진행 중 일·대기 큐 0) 순수 판정이 참일 때만 정리 실행.
3. **삭제**: 다음 릴리스에서 데려오기 UI·`PeerManager` 일 중계 코드를 제거(별도 PR). 이때 4-2의 후속(SSE 1줄 합치기)도.
- 이득: 문제가 생기면 단계 2에서 되돌릴 수 있고(데이터 삭제 없음), 진행 중 일을 끊지 않음. 비용: 한 릴리스 동안 코드 중복.
- **이중 결재 주의**: 같은 PC를 양쪽에서(중계 결재 + 워크스페이스) 보면 같은 결재가 두 곳에 뜰 수 있다. 서버 409가 막아 주므로 후 처리는 "이미 처리" 안내로 충분 — 별도 합치기 로직은 만들지 않는다.

## 10. 재활용과 하지 않는 일반화

| 재활용 | 이득 | 비고 |
|---|---|---|
| `remoteOffice.ts`·`bridge.ts`(무수정) | 화면 코드 그대로 | 계약(`BridgeRequest`·`ShellMessage`)을 메인이 지킴 |
| `PeerClient`·`SseParser`·`createPeerHttp`·지문 고정 | 8초 유예·재연결·이어 받기·SPKI 검사 재구현 0 | 별도 인스턴스만 만듦 |
| `PeerRegistry`·vault | 열쇠 단일 출처 | |
| `PopMenu`·`PeerSection` 코드 입력부 | 마법사·드롭다운 작업량 감소 | import만 |

**하지 않는 것**: ① `mobile/install.ts` 공통화(휴대폰 회귀 위험 > 중복 40줄) ② `win` 싱글톤을 창 집합으로 일반화(38곳 영향) ③ 이 PC도 "워크스페이스 하나"로 통일하는 모델(이 PC 화면이 새 경로를 타게 되어 G1~G7 파괴) ④ `OfficeApi`에 워크스페이스 메서드 추가(V2 표·휴대폰으로 번짐).

## 11. 검증 방법 (시험으로 고정할 지점)

기존 `scripts/*.test.mts`(node:test) 방식으로. 가짜 `OpenStream`·가짜 `PeerHttp`·가짜 `BrowserWindow` 포트를 주입.

| # | 고정할 지점 | 방법 |
|---|---|---|
| T1 | **이 PC 불변** | ① 의존 방향 테스트: `main/peer`·`main/remote`·`office.ts`가 `main/workspace`를 import하지 않음(소스 훑기) ② 목록 비었을 때 `createWorkspaces` 호출이 링크·창·타이머를 만들지 않음 ③ 원격 이벤트 주입 → 이 PC `publish`·트레이·`Notification` 스파이 호출 0 ④ 이 PC용 핸들러에 원격 창 sender로 호출 → 거절 |
| T2 | 상태 판정 `statusOf` | 표 테스트(7절 전 상태 × 경계: 8초 직전·직후, 허락 대기, 구버전·신버전 프로토콜, `SPKI_MISMATCH`) |
| T3 | 브리지 | 가짜 링크: call→result 왕복, 끊김 중 쓰기 거절·읽기 허용, 전송 중 끊김=재전송 안 함, 이벤트 화이트리스트, resync 시점, 업로드·다운로드 경로 |
| T4 | 읽기/쓰기 표 | 타입이 전수 강제 + 테스트가 "쓰기 목록에 결재·지시·고용이 있다" 확인 |
| T5 | 오류 번역 | 안드로이드 `ErrorMappingTest.kt`와 같은 표(골든)를 TS에 옮겨 동일 결과. `already_decided`·`pc_only`·`confirm_required` 포함 |
| T6 | 알림 | 중복 제거, 첫 연결 전 결재 미통지, 포커스 창 생략, PC 이름 포함 문구 |
| T7 | 한도 | `canAddWorkspace`(3대), 저쪽 8칸 초과 거절 → `full(peer)` 구분 |
| T8 | 마법사 reducer | 장 이동·뒤로·오류 복귀·이름 빈값·색 중복 |
| T9 | 이전 | `workspaceMigration` 멱등(두 번 실행 = 한 번), 데이터 삭제 없음, `isLegacyDrained` 판정 |
| T10 | 창 | 승계(위치·크기), 지연 생성, 종료 규칙 제외, 파티션 이름 분리(가짜 포트로) |
| T11 | 렌더러 | `IS_MOBILE_SHELL` 용도 목록 테스트(6-4), 데스크톱 빌드 `IS_REMOTE_VIEW=false` 상수 확인, 워크스페이스 0개일 때 이름 칸 마크업이 현재와 같음 |
| T12 | 회귀 | 기존 `mobile.test.mts`·`peerClient.test.mts`·`peerE2E.test.mts` 무수정 통과(= 휴대폰·중계 불변의 증거) |
| 수동 | 맥·윈도우 실기기 | PC 3대 오가기, 창 승계 깜빡임, 윈도우 창 버튼 영역 색, 알림 PC 이름, 슬립·와이파이 전환 끊김(오큐에이) |

## 12. 정리드가 정할 쟁점과 추천

| # | 쟁점 | 추천 | 이유 · 대안 |
|---|---|---|---|
| 1 | 화면용 SSE를 PeerManager와 공유? | **따로 둔다**(PC당 2줄) | `PeerManager`·일 중계 불변이 최우선. 데려오기 제거 뒤 합침. 공유는 줄 1개로 더 단순하나 걷어낼 코드에 의존 |
| 2 | 창 구조 | **PC별 창 + 승계·숨김 + 파티션 분리** | `store.ts` 무수정·입력 보존. 대안(WebContentsView)은 새 기반 필요 |
| 3 | 통로 | **원격 창은 `ws:*`만, 이 PC 핸들러에 보낸 창 검사 추가** | 원격 창이 이 PC를 조작할 길을 구조로 차단. 비용: 등록 래퍼 1곳 수정 |
| 4 | 이 PC 신규 API 위치 | **`OfficeApi` 밖(`officeWorkspaces`)** | V2 전수 분류·휴대폰으로 번지지 않음 |
| 5 | 쓰기 막기 위치 | **메인 브리지(권위) + 렌더러 비활성(보조)**, 읽기/쓰기 표는 `Record<OfficeMethod,…>` 신설 | 모든 경로 한 곳, 새 메서드 누락을 `tsc`가 잡음 |
| 6 | 기존 `mobile/install.ts` | **수정 안 함**, `remote/install.ts` 신규 | 휴대폰 회귀 위험 0, 중복 ~40줄 |
| 7 | 기존 기능 대체 | **3단계(추가→이전→삭제), 삭제는 다음 릴리스** | 되돌릴 수 있고 진행 중 일 보호 |
| 8 | 상태 판정 | **`statusOf` 한 함수**를 모든 화면이 공유 | 화면마다 말이 달라지는 것 방지, 표 테스트 가능 |

**0단계 의존(강백엔과 정리드가 먼저 못박을 것)**: ① 화면용 이벤트 모양(휴대폰과 동일) ② 한 열쇠로 SSE 2줄 허용 여부 ③ hello의 프로토콜 버전·허락 상태 ④ `defaultCwd` 변경 차단(이 설계 범위 밖, 선행 조건).

**구현 착수 순서 제안**(의존 순): `shared/workspace.ts`(타입·표·`statusOf`) → `workspaceErrors`·`workspaceBridge`(가짜로 T2~T5) → `workspaceLink` → `workspaceWindows`+`remotePreload`(G1·G2 시험과 함께) → 화면(드롭다운·띠) → 마법사 → 이전·숨김. 앞 단계마다 `tsc`·`npm test`.
