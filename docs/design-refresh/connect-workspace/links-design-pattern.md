# 진짜 links 부품 설계 — 박패턴 안 (유지보수성·변경 영향 최소화·검증 가능성)

작성: 박패턴 · 2026-11-17 · 요청: 정리드 · 코드는 고치지 않았고 읽기만 했다.
최가독 안과 서로 맞추지 않은 독립 안이다.

## 0. 한눈에

- 문제: `workspace/index.ts:96`이 `links: noLinks`(`workspaceService.ts:19`, 늘 `'connecting'`)라서 연결이 영원히 "연결하는 중"이다.
- 방향: `WorkspaceLinks`를 **새 파일 2개**(순수 판단 + 부수효과)로 구현한다. 기존 `PeerManager`·`PeerClient`는 거의 그대로 쓰고, 읽기 전용 입구 몇 개만 **덧붙인다**.
- **중요한 발견 5가지.** 이것을 안 고치면 부품만 만들어도 두 PC 시험이 통과하지 못한다 (3절).
  1. 저쪽 PC에 **허락 화면이 없다.** 허락을 요청해도 아무도 허락·거절할 수 없다.
  2. hello가 주는 프로토콜 번호는 **2**인데 앱은 **3 이상**을 요구한다. 모든 PC가 "옛 PC"로 판정된다.
  3. `WorkspaceLinks`에 **이벤트를 창으로 밀어 주는 길이 없다.** 상태가 바뀌어도 화면이 모른다.
  4. 파일 올리기는 서버가 **POST**인데 `PeerHttp`는 **PUT**만 있다.
  5. 버전 불일치(426)가 "다시 짝짓기"로 잘못 표시된다.

## 1. 0단계 4항목 — 코드 기준 확인

| # | 질문 | 답 | 근거 |
|---|---|---|---|
| 1 | 화면 보기 열쇠가 받는 이벤트가 휴대폰과 같은 모양인가 | **예** | 같은 `HubEvent` 5종(snapshot·log·chat·focus·remoteStatus)을 같은 `source.shape`로 보낸다. 허락된 열쇠(`view`)는 놓친 이벤트 따라잡기·remoteStatus도 받는다 (`remote/events.ts:115,119,125-126`). 허락 전 열쇠는 hello·keep-alive만 받는다 (`events.ts:124-125`). 시험도 있다 (`scripts/peerE2E.test.mts:146`) |
| 2 | 한 열쇠로 실시간 연결 2줄이 열리는가 | **조건부 예** | 허락된 열쇠만 2줄이다. 허락 전은 **1줄**이다 (`events.ts:96-98` `slotLines`, 한도 `perToken: 2` = `events.ts:23`). 전체 한도 18 = 휴대폰 2 + 슬롯 8×2 (`events.ts:24-25`)라 딱 맞는다. **허락 전에 2번째 줄을 열면 두 줄이 서로 밀어내며 계속 끊겼다 붙는다**(`events.ts:105`, 이유 `replaced`). 그래서 **허락 확인(HTTP) 뒤에만** 화면용 줄을 연다 |
| 3 | hello에 프로토콜 버전·허락 상태가 오는가 | **조건부 예 — 모양이 안 맞는다** | 실시간 줄의 hello 이벤트에는 `protocolVersion`뿐이다 (`events.ts:113`). 허락 상태는 **HTTP `POST /v2/call` hello**에만 있다: `result.protocol`·`result.permissions.{key,view}`, `view`는 `granted/pending/none` (`v2routes.ts:263-273`, `auth.ts:249-251`). 문제 둘: (a) `result.protocol`은 **2** (`v2.ts:11`)인데 앱 기준은 **3** (`shared/workspace.ts:12`). (b) `WorkspaceHello`의 `canView`·`grant:'denied'`라는 값은 서버가 주지 않는다. 변환 함수가 필요하다 (4절) |
| 4 | 화면 보기 열쇠에도 작업 폴더·결재 방식·자율 진행 막기가 그대로 적용되는가 | **예** | 허락된 열쇠도 같은 `handleV2Call`을 지나며 `restrict` 호출은 열쇠 종류로 갈리지 않는다 (`v2routes.ts:291-297`). 폴더·결재 방식은 `restrictRemoteArgs`가 채운다 (`remoteGuard.ts:13-27`, 허용 필드 `v2.ts:246-251`). 자율 진행·자동결재는 `isRemoteCall()`로 막는다 (`office.ts:1931-1936, 1948`, 규칙 `remoteGuard.ts:31-36`). 허락 전 열쇠는 hello 외 전부 `scope_denied` (`v2routes.ts:261`) |

한 가지 확인 못 한 것: 위 막기가 "저쪽 PC가 실제로 꺼내 쓰는 모든 메서드"에 빠짐없이 걸리는지는 메서드 단위로 다 보지 않았다. 휴대폰과 같은 길이라는 점만 확인했다 (**추정: 휴대폰과 같은 수준**).

## 2. 요구사항 해석

- `WorkspaceLinks`(`workspaceService.ts:9-17`)의 네 기능을 진짜로 채운다: `status`·`pending`·`request`·`sync`.
- 서비스는 이미 다음을 해 준다. **이것은 건드리지 않는다.** 쓰기 막기 `gateCall`, 상태에 따른 창 전환 허용 `canOpenWindow`, 결과 응답 `reply`.
- 그대로 두는 것: `shared/workspace.ts`의 `statusOf`·표, `workspaceStore`, `workspaceWindows`, 렌더러, 휴대폰 코드.

## 3. 먼저 막아야 할 선행 구멍

| 구멍 | 지금 상태 | 최소 처방 | 담당(제안) |
|---|---|---|---|
| A. 저쪽 PC 허락 화면 없음 | `peer: { ownName }`만 넘긴다 (`main/index.ts:81`). `onViewRequest`를 주는 곳이 없고 (`service.ts:154`), `setPeerView`(`service.ts:269`)를 부르는 IPC·화면이 없다 (전체 검색에서 시험 코드뿐). `viewPending`은 메모리 값이라 허락 대기가 영원히 유지된다 | `onViewRequest` 연결 → 이 PC 앞에 알림·카드. `peerSetView(slotId, bool)` 메서드와 설정 목록의 허락·거절 버튼 (`PeerSlotView.view/viewPending`이 이미 있음 `shared/peerProtocol.ts:73`). 새 짝짓기의 `kind:'view'`는 클라이언트가 안 쓴다 (`peerManager.ts:125`)이므로 이번엔 쓰지 않는다 | 강백엔 + 디자인 |
| B. 프로토콜 번호 불일치 | hello는 2, 기준은 3 | **줄 번호를 올리지 말고** 기준을 2로 내리고, 허락 능력의 존재(`permissions` 필드)로 새 PC를 가린다. 번호를 올리면 휴대폰·`SUPPORTED_VERSIONS` (`handler.ts:101`)까지 번진다. 상수 한 줄 + 표 시험 수정 | 정리드 |
| C. 밀어 주는 길 없음 | links → 창으로 `event·resync·connection`을 보낼 곳이 없다 (`reply`는 service 안 `workspaceService.ts:82`) | `WorkspaceLinks`에 `onChange`·`onEvent` 구독 2개 추가 (6절) | 이번 설계 |
| D. 올리기는 POST | 서버 `/v2/attachments`는 POST (`v2routes.ts:200`, 허용 메서드 `:134`). `PeerHttp.putBytes`는 PUT 고정 (`peerTransport.ts:104,151`) | `requestBytes`에 `'POST'`를 허용하는 덧붙임 + 헤더로 `X-File-Name`·`Content-Type` | 정리드 |
| E. 426 오분류 | `PeerClient`는 401·403·426을 모두 `unpaired`로 닫는다 (`peerClient.ts:65,182`). 426은 실제로 `protocol_unsupported`(내 앱이 낡음) (`protocol.ts:50`, `handler.ts:101`) | links는 hello 응답의 `error` 문자열을 우선해 `selfOutdated`로 판정한다. `statusOf`의 `UNPAIRED_ERRORS`에서 `http_426` 제거 | 이번 설계 |

허락 대기가 서버 메모리라, 저쪽 앱이 꺼졌다 켜지면 hello가 `none`으로 돌아온다. 이것을 **거절과 구분할 수 없다.** 처방: 화면이 `grantDenied`에 **"다시 요청" 버튼**을 항상 준다. 서버에 저장 필드를 새로 만들지 않는다.

## 4. 부품 구조 — 새 파일 2개 + 덧붙임 3곳

```
workspace/
  linkModel.ts       (새, 순수)   hello 변환 · 실패 분류 · 결재 수 계산 · 재시도 간격 — Electron·네트워크 없음
  workspaceLinks.ts  (새, 부수)   PC마다 줄·타이머·요청 — 포트로만 바깥을 부른다
  workspaceService.ts (수정)      인터페이스 2줄 + 구독 2줄
  index.ts           (수정)       noLinks → createLinks(...)
peer/peerManager.ts  (덧붙임)     읽기 입구 3개 (아래)
peer/peerTransport.ts(덧붙임)     postBytes
shared/workspace.ts  (수정)       MIN 프로토콜 3→2, UNPAIRED에서 http_426 제거, '준비 중' 값 제거
```

**분리 이유(이번 작업에서의 이득)**: `statusOf`에 들어갈 입력(`hello`·`error`·`downSince`)을 만드는 규칙이 이번 작업에서 가장 틀리기 쉽다. 이것을 순수 파일에 두면 가짜 시계·가짜 응답으로 표 시험이 된다. 추가 복잡도는 파일 1개다. `workspaceLinks.ts`를 더 쪼개지 않는다.

### 4-1. `linkModel.ts` (순수 함수)

- `helloFromResult(result) → WorkspaceHello | null`
  - `protocol = result.protocol`.
  - `canView = permissions.key === 'peer'`. 필드가 없으면 `canView:false`라서 **옛 PC = peerOutdated**.
  - `grant`: `view==='granted'`→granted, `'pending'`→pending, `'none'`→`requested ? 'denied' : 'pending'` (요청은 `requested` 플래그, 아래).
  - 모양이 틀리면 null.
- `failureOf(res | netErr) → { error: string|null }`
  - 401·403(`token_revoked`)→`unauthorized`. 426·`protocol_unsupported`→`protocol_unsupported`.
  - 404 `unknown_method`→hello 없는 옛 PC: `{protocol:0,canView:false,…}` 로 만들어 **peerOutdated**.
  - 429 `rate_limited`→`slots_full`.
  - 네트워크 오류·시간 초과→error 없음(링크 `offline`).
- `pendingFromSnapshot(snap) → number`: `staff[].pendingDecisions` 합 (`protocol.ts:135,148`). 모양이 달라도 0 (화면을 깨지 않는다).
- `nextDelay(attempt)`: `PEER_LIMITS.retryMs` 재사용 (`peerProtocol.ts:24`).

### 4-2. `workspaceLinks.ts` (PC마다 상태 1개)

바깥 입구(포트, 테스트가 가짜를 꽂는다):

```ts
interface PeerPort {
  linkState(peerId): PeerLinkState          // 기존 PeerManager.linkState
  onLinkChange(cb: (peerId) => void): () => void   // 신규 (덧붙임)
  http(peerId): PeerHttp | null             // httpOf 공개 (덧붙임)
  stream(peerId): OpenStream | null         // net.stream 공개 (덧붙임)
}
```

PC 한 대의 기록:

```
{ peerId, hello, requested, error, screen: PeerClient|null, hasBeenOnline, downSince, pending, attempt }
```

흐름 (`refresh(ws)` 한 함수가 판단, 다음 때 부른다: 추가·상태 줄 online 전환·"다시 요청"·재시도 타이머):

1. `peers.http(peerId)`가 null이면 `error:'unauthorized'` → `unpaired`로 끝. 재시도 없음.
2. `POST /v2/call hello {capabilities:[...], requestView: <requested>}`를 **10초 안에** 끝낸다. 실패는 `failureOf`로 분류하고 `nextDelay`만큼 뒤에 다시.
3. hello 결과가 `granted`면 화면용 `PeerClient`(기존 클래스)를 시작한다. 아니면 **화면 줄은 열지 않고** 기다린다 (`grantPending`·`grantDenied`·`peerOutdated`).
4. 화면 줄의 이벤트: `snapshot`→`pending` 갱신, 그 외→`onEvent`로 창에 `{type:'event',name,data}`.
   - `hello` 직후 첫 연결이면 `resync`도 한 번 보낸다.
   - `bye permission_changed`를 받으면 **그 줄을 즉시 멈추고** `refresh` (허락 회수 때 두 줄이 서로 밀어내는 것을 막는다).
5. 상태는 항상 `statusOf` 한 함수로 만든다. 입력의 `link`는 "허락됨이면 화면 줄 상태, 아니면 상태 줄(`peers.linkState`) 상태"다.
6. **8초 시계**: `statusOf`는 시간에 따라 값이 바뀌지만(`workspace.ts:87`) 그때 불리는 이벤트가 없다. `downSince + 8초`에 타이머 1개를 걸어 `onChange`를 낸다. 이것이 없으면 화면이 "다시 연결 중"에서 안 바뀐다.

`requested`는 **사용자가 PC를 추가했거나 "다시 요청"을 눌렀을 때만** true다. 자동 재시도는 `requestView:false`로 보낸다. 그래야 거절당한 뒤 저쪽 PC에 카드가 계속 뜨지 않는다 (`auth.ts:254-258`은 `none`이면 매번 새 카드를 만든다).

허락·거절·회수의 알림: 저쪽이 `setPeerView`하면 서버가 그 열쇠의 모든 줄을 닫는다 (`service.ts:269-273`). 상태 줄이 닫혔다 다시 online이 되므로 `onLinkChange`→`refresh`로 **조회 없이 결과가 들어온다.** 따로 계속 묻지(폴링) 않는다.

`request(ws, req)`:

- `call` → `POST /v2/call {method,args,confirm?}`. 쓰기에는 `Idempotency-Key`(요청 id)를 붙인다. **자동 재전송은 하지 않는다**(실패는 사유와 함께 그대로 돌려준다).
- `upload` → `postBytes('/v2/attachments', …)` (20MB 한도, `android-bridge.md:53`).
- `download` → `getBytes('/v2/files/{id}')` 후 다운로드 폴더에 저장하고 저장한 이름을 돌려준다 (계약 `android-bridge.md:54`).
- 한 PC당 동시 5개 한도 (`android-bridge.md:58`). 넘으면 줄을 세운다.
- HTTP 상태·`error`·`message`를 `{status,code,message}`로 그대로 올린다 (서비스가 이미 이 모양을 받는다 `workspaceService.ts:141-142`).

`sync(ids)`: 새 id는 `refresh`로 시작하고, 사라진 id는 화면 줄·타이머를 멈추고 기록을 지운다. 이미 있는 id는 건드리지 않는다.

### 4-3. 덧붙임 (기존 동작 불변)

- `PeerManager`: `onLinkChange`(기존 `onState` 콜백에서 구독자에게도 알림), `http(peerId)`(= 기존 private `httpOf`를 공개), `stream(peerId)`. **기존 메서드·호출 흐름은 바꾸지 않는다.**
- `peerTransport`: `postBytes`. 기존 `putBytes`·`getBytes` 무수정.

## 5. 재사용 판단: `PeerClient`·`PeerManager`

| 대상 | 판단 | 이유 (이번 작업 기준) |
|---|---|---|
| `PeerClient` | **재사용(화면 줄마다 인스턴스 1개 더)** | 재연결·지연·8초 offline 판정·idle 끊기·SSE 해석이 이미 시험돼 있다 (`peerClient.test.mts`). 새로 만들면 같은 로직이 두 벌이 된다 |
| `PeerManager` 상태 줄 | **재사용(상태·허락 확인 용도)** | 짝짓기·해제·인증서 고정이 여기에 있다. 입구만 덧붙인다 |
| `PeerManager`의 줄을 이벤트용으로 공유(최가독 쪽 후보) | **채택하지 않음** | (1) 허락 전에는 이벤트를 안 받고 허락 순간 서버가 줄을 닫는다. 줄 수명이 허락 상태에 묶여 있다. (2) 목록에 없는 PC까지 전체 snapshot을 받게 된다. (3) 이벤트 본문을 지금은 버리는 구조(`peerManager.ts:99`)라 수신 경로를 새로 열어야 하고 짝짓기 흐름을 건드린다 |
| 화면용 줄 2번째의 대가 | 열쇠당 줄 2개 사용 | 허락된 열쇠는 정확히 2줄이 한도다. **세 번째 연결이 생기면 서로 밀어낸다.** 지금 열쇠를 쓰는 곳은 상태 줄과 화면 줄 둘뿐이라 안전하다. 코드에 "이 열쇠는 2줄만" 주석과 시험을 둔다 |

## 6. `WorkspaceLinks` 인터페이스 변경 (service 쪽, 최소)

```ts
interface WorkspaceLinks {
  status; pending; request; sync                    // 기존 그대로
  onChange(cb: () => void): () => void              // 신규: 상태·결재 수가 바뀜 → service가 broadcast()
  onEvent(cb: (id: string, m: LinkMessage) => void): () => void  // 신규: event·resync·connection → reply()
  retryGrant(id: string): void                      // 신규: "다시 요청"
}
```

- `noLinks`에도 같은 3개를 빈 값으로 넣는다 (service 시험이 그대로 돈다).
- 서비스는 생성할 때 두 구독을 한 번 건다. 그 외 서비스 코드는 무수정.
- `retryGrant`를 부르는 입구(IPC·창 API)는 **화면 작업 범위**다 (OfficeWorkspacesApi에 `retryGrant?` 추가).

## 7. 무한 "연결하는 중"이 없음을 보장하는 방법

규칙: **기다리는 모든 단계에 끝나는 시각이 있고, 끝나면 사유가 있는 상태가 된다.**

| 기다림 | 끝나는 방법 | 끝난 뒤 상태 |
|---|---|---|
| hello 응답 | 10초 안에 안 오면 실패 처리 | `offline` (네트워크) |
| 상태 줄·화면 줄 첫 연결 | `PeerClient`가 8초 뒤 `offline` (`peerClient.ts:139-145`) | `offline` |
| 허락 대기 | 무한히 둘 수 있으나 **`grantPending`이라는 사유 상태**이고 "이 PC 앞에서 허락해 주세요"가 보인다 | `grantPending` |
| 상태가 시간 따라 바뀌는 것 | 8초 시계 타이머 (4-2의 6번) | `offline` |
| 실패 사유별 | `failureOf` 표 | `unpaired`·`selfOutdated`·`peerOutdated`·`peerFull`·`grantDenied` |

**자동 시험으로 못박는다**: 가짜 시계와 가짜 PC로 실패 8종(연결 거부·시간 초과·401·426·hello 404·hello none·hello pending·429)을 차례로 넣고, **12초 안에 상태가 `connecting`이 아니다**를 각각 확인한다. 이 시험이 "무한 connecting 방지"의 문서가 된다. 또 `noLinks` 같은 "늘 connecting"을 다시 조립부에 꽂으면 실패하도록, 조립부 시험에 "`links !== noLinks`"를 둔다.

화면에서 사유별 안내가 보이는 것은 **이미 있는 상태값→문구 대응**에 달려 있다. 상태 10종 각각의 문구·행동 버튼이 화면에 있는지는 이번에 보지 않았다 (**확인 못 함**, 화면 담당이 하위 작업 3에서 점검).

## 8. 하위 구현 범위 (작업 단위 5개)

| # | 작업 | 담당(제안) | 완료 기준 |
|---|---|---|---|
| 1 | **저쪽 PC 허락 입구**(구멍 A): `onViewRequest`→알림·카드, `peerSetView` 메서드, 설정 목록의 허락·거절·회수 | 강백엔(+디자인) | 두 PC에서 요청→허락/거절/회수가 각각 `viewState`·`closeSlot`을 일으킨다. 기존 `remote-v2.test.mts:1038-1077` 통과 유지 + 새 호출 경로 시험 |
| 2 | **순수 부분** `linkModel.ts` + `shared/workspace.ts` 수정(MIN 2, `http_426` 제거) | 정리드 | `helloFromResult`·`failureOf`·`pendingFromSnapshot` 표 시험. `statusOf` 표가 새 값으로 통과 |
| 3 | **연결 부분** `workspaceLinks.ts` + `PeerManager` 입구 3개 + service 구독 2개 + 조립부 교체 | 정리드 | 가짜 포트 시험(7절의 8종 + 허락 흐름 + 회수 시 줄 중단 + 8초 시계). `noLinks` 제거. 기존 `peerE2E`·`workspace.test` 통과 |
| 4 | **창 요청** `request`(call·upload·download) + `postBytes` | 정리드 | 실제 로컬 서버(127.0.0.1)에 call·upload 20MB·download. 쓰기 자동 재전송 없음 확인 |
| 5 | **화면 점검·정리**: 상태 문구 점검, `retryGrant` 버튼, 급한 패치의 `화면 보기 준비 중`·`PC 바꾸기 준비 중` 제거 | 화면 담당 | 상태 10종 각각이 사유 문구를 가짐. 준비 중 값이 코드에서 사라짐 (`grep` 0건) |

순서: 1·2는 병행 가능, 3은 2 뒤, 4는 3 뒤, 5는 3과 병행. **1이 없으면 실제 시험이 허락 단계에서 멈춘다.**

## 9. 시험 계획

자동 (`scripts/workspace.test.mts` 확장 + 새 `workspaceLinks.test.mts`):

1. `linkModel` 표: hello 변환(옛 PC·허락 3종·모양 오류), 실패 분류 8종, 결재 수 합계.
2. `workspaceLinks` (가짜 `PeerPort`·가짜 시계): 추가→hello→허락됨→화면 줄 시작 / 허락 전엔 화면 줄 0개 / 회수 `bye`→줄 중단 / `requested`가 자동 재시도에서 false / `sync` 삭제 시 줄·타이머 정리 / 동시 요청 5개 한도.
3. 7절의 "12초 안에 connecting이 아님" 8종.
4. 구조 시험(기존 방식): `main/peer`·`main/remote`가 `workspace/`를 import하지 않음 유지. 덧붙인 입구가 기존 `PeerManager` 시험을 바꾸지 않음.
5. 실제 서버 시험(`peerE2E` 방식, 127.0.0.1 두 인스턴스): 허락 요청→허락→이벤트 수신→허락 회수 시 이벤트 끊김, 한 열쇠 2줄 동시 수신, 허락 전 줄이 서로 밀어내지 않음.

실제 두 PC (맥+윈도우 각각 방향 둘, 대표 기억: 빌드는 두 플랫폼):

- 짝짓기 후 추가 → "허락 기다리는 중"이 보이고, 저쪽 PC에 알림이 뜬다.
- 허락 → 창이 열리고 사무실이 보인다. 결재 대기 숫자가 맞다.
- 거절 → "거절됨 / 다시 요청". 다시 요청하면 저쪽에 카드가 다시 뜬다.
- 저쪽 PC 앱 종료 → 8초 뒤 끊김, 재시작 → 자동 재연결. 허락 대기 중 재시작하면 "다시 요청"이 나온다.
- 저쪽에서 회수·해제 → 창이 끊김/다시 짝짓기로 바뀐다. 옛 버전 PC → "저쪽 PC 업데이트 필요". 이쪽이 낡음 → "이 PC 업데이트 필요".
- 쓰기 시도(직원 채용·파일 올리기 20MB)와 자율 진행 켜기가 휴대폰과 같이 막힌다.

## 10. 위험과 되돌리는 방법

| 위험 | 영향 | 되돌리기·완화 |
|---|---|---|
| 새 연결이 짝지은 PC의 서버에 줄을 더 쓴다 | 허락된 열쇠당 2줄 | 허락된 PC만, 목록에 있는 PC만 연다. 세 번째 사용처 금지(주석+시험) |
| `PeerManager` 덧붙임이 짝짓기 흐름에 영향 | 기존 연결 회귀 | 읽기 전용 입구와 구독만 추가. 기존 시험이 그대로 통과해야 병합 |
| MIN 프로토콜 3→2 | 허락 기능이 없는 PC(옛 1.3.x 초반)를 통과시킴 | 판정은 `permissions.key==='peer'` 존재로 한다 (번호만 믿지 않음). 표 시험에 포함 |
| 허락 대기가 서버 재시작에 사라짐 | 거절로 오해 | "다시 요청" 버튼 (구멍 A 처방과 함께) |
| 허락 화면(작업 1)이 늦어짐 | 두 PC 시험이 못 끝남 | 작업 1을 가장 먼저. 급한 패치의 "준비 중"은 작업 1·3 완료까지 유지 |
| 업로드·다운로드 대용량 | 메모리·시간 | 20MB 상한, 요청 시간 초과 120초 (`peerTransport.ts:101`) 재사용 |

되돌리는 방법: 조립부 한 줄(`links: noLinks`)로 즉시 이전 동작. 새 파일 2개는 import만 끊으면 죽은 코드다. 덧붙인 입구 3개와 `postBytes`는 호출자가 없으면 무해하다. 급한 패치의 "준비 중" 값은 **작업 5가 끝난 뒤** 지운다(그 전엔 남겨 두는 것이 되돌리기 안전판이다). `shared/workspace.ts` 변경은 상수 1개·집합 원소 1개다.

## 11. 정리드가 정할 쟁점 (내 추천)

1. **허락 화면(구멍 A)을 이 작업에 포함할지** — 추천: **포함, 가장 먼저.** 없으면 실제 허락이 불가능하다.
2. **화면 줄을 PC당 따로 열지(내 안) vs 상태 줄 공유(최가독 후보)** — 추천: **따로 열기.** 근거 5절. 단 허락 후에만.
3. **MIN 프로토콜 기준** — 추천: **번호를 올리지 말고 2로 내리고 `permissions` 존재로 판정.**
4. **`WorkspaceLinks`에 구독 3개 추가** — 추천: **추가.** 없으면 상태가 바뀌어도 화면이 갱신되지 않는다.
5. **426을 `selfOutdated`로 분리** — 추천: **분리.** 지금은 "다시 짝짓기"라고 잘못 안내한다.
