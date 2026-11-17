# 진짜 links 부품 설계 (최가독 — 가독성·단순함·기존 기능 재활용)

작성: 2026-11-17 · 코드는 고치지 않았고 읽기만 했습니다. 시험·실제 두 PC 확인은 못 했습니다(아래 "확인 못 함" 참고).
박패턴 안과 맞추지 않은 독립안입니다.

## 0. 한 줄 결론
`PeerManager`의 연결을 **그대로 재사용**합니다(PC당 실시간 연결 1줄). 새 파일은 `main/workspace/workspaceLinks.ts` 하나이고, 이 안에서 `WorkspaceLinks` 4개 메서드를 구현합니다. `PeerClient`·서버 중계 코드는 건드리지 않습니다.

## 1. 0단계 4항목 답

| # | 질문 | 답 | 근거 |
|---|---|---|---|
| 1 | 화면 보기 열쇠가 받는 이벤트가 휴대폰과 같은 모양인가 | **예** | 같은 `EventHub.open`이 hello → 따라잡기 → snapshot → remoteStatus 순으로 보냅니다. 화면 보기 열쇠는 `view=true`로 같은 이벤트를 모두 받습니다(`remote/events.ts:100-119`). 짝만 지은 열쇠는 hello·keep-alive만 받습니다(`events.ts:124-125`). 창 쪽 메시지 모양 `{type:'event',name,data}`는 휴대폰 셸 계약과 같고(`renderer/mobile/bridge.ts:12-24`), SSE의 이름·JSON을 그대로 옮기면 됩니다. |
| 2 | 한 열쇠로 연결 2줄이 열리는가 | **조건부 예** (허락된 열쇠만) | 화면 보기 열쇠는 슬롯당 2줄(`SSE_LIMITS.perToken: 2`, `events.ts:23`·`96-98`), 일반 피어 열쇠는 1줄입니다. 3번째 연결은 가장 오래된 줄을 `replaced`로 닫습니다(`events.ts:105`). **그래서 이 설계는 1줄만 씁니다.** 2줄이 꼭 필요하지 않습니다. |
| 3 | hello에 프로토콜 버전·허락 상태가 오는가 | **예, 단 SSE가 아니라 `/v2/call`의 hello** | `/v2/call`의 `hello` 응답이 `protocol: V2_PROTOCOL_VERSION`(=2, `remote/v2.ts:11`)과 `permissions.view: granted\|pending\|none`을 돌려줍니다(`remote/v2routes.ts:263-273`). SSE의 hello에는 `protocolVersion`만 있고 허락 상태는 없습니다(`events.ts:113`). |
| 4 | 화면 보기 열쇠에도 작업 폴더·결재 방식·자율 진행 막기가 적용되는가 | **예 (코드 읽기 기준). 자율 진행은 확인 못 함** | 화면 보기 열쇠도 `/v2/call`을 휴대폰과 같은 길로 탑니다. `V2_FIELDS`가 `cwd`·`approvalMode`를 빼고(`v2.ts:246-251`), `restrictRemoteArgs`가 기본 폴더와 `'ask'`로 채웁니다(`main/index.ts:98`, `main/remoteGuard.ts`). `autoApprove*` 쪽은 읽지 못했습니다. |

**0단계에서 새로 찾은 문제 2건 (구현 전에 풀어야 합니다)**
- **A. 허락 요청 화면이 비어 있습니다.** hello가 허락을 요청하면 저쪽 PC가 `onViewRequest`를 불러 결재 카드를 띄웁니다. 그런데 `main/index.ts:81`은 `peer: { ownName }`만 넘기고 `onViewRequest`를 연결하지 않았습니다. 허락·거절을 적는 `setPeerView`(`remote/service.ts:269`)를 부르는 곳도 서비스 안에는 없습니다. 지금은 "허락 대기"가 영원히 풀리지 않습니다. 그래서 **'화면 보기'로 짝짓는 경로(허락이 이미 된 열쇠)를 1차로** 쓰고, 허락 요청 경로는 따로 작업 단위를 둡니다.
- **B. 이쪽(보는 PC)의 짝짓기가 `kind:'peer'`로 고정입니다**(`peer/peerManager.ts:125`). 허락 여부는 저쪽 PC가 연 짝짓기 창의 종류(`view`)가 정합니다(`officeHandlers.ts:58`, `service.ts:246`). 그래서 보는 쪽에서 따로 바꿀 것은 없고, 안내 문구만 "저쪽 PC에서 '화면 보기'로 코드를 열어 주세요"로 맞춥니다.

## 2. 부품 설계

### 2-1. 위치와 모양
- 새 파일 `main/workspace/workspaceLinks.ts` 하나. `index.ts:96`의 `links: noLinks`를 `createWorkspaceLinks(...)`로 바꿉니다.
- `PeerManager`·`PeerClient` 재사용: **예.** 재연결(지연·흔들림), 8초 offline 판정, 401·403·426과 `SPKI_MISMATCH` 시 `unpaired` 판정이 이미 있고 시험도 있습니다(`peerClient.ts`, `scripts/peerClient.test.mts`). 따로 만들면 같은 로직이 두 벌이 됩니다.
- **PeerManager에 더할 것은 작은 구멍 둘뿐입니다.**
  1. 이벤트 구독: `onEvent: () => {}`(`peerManager.ts:~102`) 자리에 "peerId별 듣는 함수"를 붙입니다. 목록이 하나뿐이라 `Map<peerId, fn>` 한 개면 됩니다.
  2. 요청 보내기: 이미 있는 `httpOf(peerId)`(비공개)를 `httpFor(peerId)`로 열어 줍니다. 업로드·다운로드·call 모두 `PeerHttp`로 갑니다(`peerTransport.ts:88-100`).

### 2-2. 메서드별 동작 (`WorkspaceLinks` 4개)
- **`sync(ids)`**: 연결을 열고 닫지 않습니다. `PeerManager.start()`가 앱 켤 때 모든 짝에 이미 연결하기 때문입니다. 대신 *워크스페이스별 기록*(`Map<workspaceId, Rec>`)을 만들고 지웁니다. 새로 추가된 PC는 hello를 한 번 보냅니다(2-3).
- **`status(id)`**: 기록의 값(`link`·`downSince`·`hasBeenOnline`·`hello`·`error`)을 `statusOf()`에 넣은 결과입니다. **상태 판정은 `statusOf` 한 곳**이라는 규칙을 그대로 지킵니다. 끊김 8초 유예는 `statusOf`가 이미 처리합니다.
- **`pending(id)`**: 저쪽에서 온 `snapshot` 이벤트의 `pendingApprovals.length`를 기록합니다(`shared/types.ts:498`). 필드 이름이 맞는지는 구현 때 확인해야 합니다.
- **`request(id, req)`**: `req.type`에 따라 `httpFor(peerId).call('POST', '/v2/call', {method,args})`, 업로드, 다운로드로 보냅니다. 실패 코드는 그대로 `{status, code}`로 거절해 서비스가 창에 돌려줍니다(`workspaceService.ts:142-146`).

### 2-3. 연결이 생길 때 (online 이벤트)
`onOnline`(hello 직후) 때마다 아래 순서로 합니다. **이 순서를 한 함수 `verify(workspaceId)`에 모읍니다.**
1. `/v2/call` hello를 `{capabilities:['iso-office'], requestView:false}`로 부릅니다. 결과의 `protocol`과 `permissions.view`를 `WorkspaceHello`로 저장합니다(`protocol`, `canView = view==='granted'`, `grant`).
2. 상태가 바뀌었으면 `service.broadcast()`를 부릅니다. 목록과 띠가 함께 갱신됩니다.
3. `ready`가 되면 창에 `{type:'hello'}`와 `{type:'connection',state:'open'}`을 보내고, 이후 SSE 이벤트를 `{type:'event'}`로 전달합니다.

`permission_changed`로 연결이 닫히면 `PeerClient`가 알아서 다시 붙고 `onOnline`이 다시 불립니다. 그러면 허락 직후 상태가 자동으로 `ready`로 바뀝니다. 새 코드는 필요 없습니다.

### 2-4. 창과 이벤트 전달
- `WorkspaceLinks`에 메서드 하나를 더합니다: `onWindowEvent(cb: (workspaceId, message) => void)`. 서비스가 `hub.window(id)?.send('ws:msg', …)`를 부르는 `reply`를 이 콜백에 연결합니다(`workspaceService.ts:82`).
- 창이 `ready`를 보내면(`parseRemotePost`가 `{type:'ready'}`를 돌려주지만 지금은 버립니다, `workspaceService.ts:134`) 그때 hello·connection·최신 snapshot을 한 번 밀어 줍니다. 창이 늦게 떠도 빈 화면이 되지 않습니다.
- SSE의 `hello.resync === true`일 때만 창에 `{type:'resync'}`를 보냅니다. 화면이 스냅샷을 다시 받게 하는 신호입니다.

## 3. 사유별 안내와 "무한 연결 중" 방지

핵심은 **시간 끝이 있는 상태만 쓰는 것**입니다.

| 상황 | 결과 | 안내 |
|---|---|---|
| 처음부터 못 붙음 | 8초 뒤 `offline` (`PeerClient`의 `offlineAfterMs`, `statusOf`의 `link==='offline'` 분기) | "연결 안 됨 · 다시 시도" |
| 붙었다가 끊김 | 8초 `reconnecting` → `offline` | 같음 |
| 401·403·426·인증서 변경 | `unpaired` (재시도 중지) | "다시 짝지어 주세요" |
| hello 없음·실패 | **hello를 5초 안에 못 받으면 `error='hello_failed'`** (새로 추가) | "상대 PC가 응답하지 않아요" |
| 프로토콜 낮음·권한 없음 | `peerOutdated` | "상대 PC도 업데이트해 주세요" |
| 허락 대기·거절 | `grantPending`·`grantDenied` | "저쪽 PC에서 허락해 주세요" |

- **빠진 곳(수정 필요)**: `statusOf`는 `link==='online'`이고 `hello`가 없으면 `connecting`을 돌려줍니다(`shared/workspace.ts:96-97`). hello 호출이 영영 끝나지 않으면 이 상태가 계속됩니다. 그래서 `verify`에 **5초 타임아웃**을 걸고, 실패하면 `error='hello_failed'`를 넣어 `offline`으로 보냅니다. (`statusOf`에서 `hello_failed`를 `offline`으로 돌리는 줄 하나 추가.)
- **시간이 지나면 상태가 바뀌어야** 합니다. `statusOf`는 `now`를 받는 순수 함수라 스스로 다시 불리지 않습니다. 기록에 `downSince`를 넣을 때 `setTimeout(8초)`로 `broadcast()`를 한 번 부릅니다(`unref`).
- 시험: "어떤 입력에서도 `connecting`이 8초(+hello 5초)를 넘지 않는다"를 가짜 시계로 검사합니다.

## 4. 작업 단위와 완료 기준

| 단위 | 내용 | 완료 기준 |
|---|---|---|
| L1 | `PeerManager` 구멍 2개(이벤트 구독·`httpFor`) | 기존 `peerClient`·`peerE2E` 시험 그대로 통과 + 구독 시험 1건 |
| L2 | `workspaceLinks.ts`: 기록·`status`·`pending`·`sync`·`verify`(hello 5초 타임아웃) | 상태 표 시험(끊김 8초·버전 낮음·`unpaired`·허락 3종·`hello_failed`) 통과 |
| L3 | `request`(call·upload·download)와 창 쪽 이벤트·`ready`·`resync` 전달 | 가짜 `PeerHttp`로 `workspace.test`의 ws:post 시험이 실제 연결로 통과 |
| L4 | `index.ts:96` 교체 + 급한 보완 패치의 '준비 중' 상태값·표시 제거 | `noLinks`를 쓰는 곳 없음. tsc·`workspace.test` 통과 |
| L5 (별도) | 허락 요청 경로(저쪽 PC 결재 카드 → `setPeerView` 연결, 1번 문제 A) | 저쪽 PC에서 허락 → 보는 쪽이 `ready`로 바뀜 |

**자동 시험**: `scripts/workspace.test.mts`에 가짜 `PeerManager`로 상태 전이·요청 전달·창 전달을 추가하고, `peerE2E.test.mts` 방식으로 실제 서버(127.0.0.1)와 짝지은 뒤 `ready`까지 통합 시험 1건.
**실제 두 PC 시험**:
1. 저쪽에서 '화면 보기'로 짝지어 창이 뜨는지.
2. 저쪽 Wi-Fi를 끊고 8초 뒤 `offline`이 되는지.
3. 다시 켜면 자동으로 `ready`로 돌아오는지.
4. 저쪽을 옛 버전으로 놓고 `peerOutdated`가 나오는지.
5. 짝을 끊고 `unpaired`가 나오는지.
6. 쓰기(지시)가 저쪽에서 결재 방식 `ask`로 들어오는지.

## 5. 위험과 되돌리기

| 위험 | 대응 |
|---|---|
| `PeerManager` 이벤트 구독 구멍이 기존 연결을 깨뜨림 | 구독이 없으면 지금과 같은 `() => {}`. 기존 시험 그대로 통과해야 합니다 |
| 허락 경로 문제 A | L5로 분리. 그 전에는 '화면 보기' 짝짓기만 안내합니다 |
| hello 호출이 멈춤 | 5초 타임아웃(3장) |
| 창에 이벤트가 중복·누락 | 창은 `ready` 이후에만 받고, `resync`로 복구 |
| 돌리기 | `index.ts`의 `links:` 한 줄을 `noLinks`로 되돌리면 지금과 같습니다. `PeerManager` 구멍은 선택 인자라 남겨 둬도 안전합니다 |

## 6. 박패턴 안과 달라질 만한 지점 (추정 — 상대 안은 보지 않았습니다)
- 저는 **연결 1줄 재사용**을 택했습니다. 이유는 재연결 상태기계가 두 벌이 되지 않고, 3번째 연결이 옛 줄을 `replaced`로 닫는 문제를 피하기 때문입니다.
- 한계: PeerManager에 이벤트 구독 구멍을 더해야 합니다. 상대 PC가 열쇠를 바꿔도 연결을 쉽게 따로 닫을 수 없다는 점도 있습니다(상태가 한 줄에 묶임).

## 확인 못 함
- `autoApprove*` 메서드가 화면 보기 열쇠에서 어떻게 막히는지(`remoteGuard.ts`, `v2.ts` 전체를 읽지 못했습니다).
- `snapshot` 이벤트의 `pendingApprovals` 필드가 화면 보기 열쇠에도 실제로 오는지.
- 실제 두 PC·윈도우 배율에서의 동작.
