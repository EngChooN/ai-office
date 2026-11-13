# 다른 PC 직원 빌려주기·데려오기 삭제 + 연결 카드 합치기 — 박패턴 설계안

> 관점: 유지보수성 · 변경 영향 최소화 · 검증 가능성. 코드는 고치지 않았다. 최가독 안은 받지 않아 비교하지 않는다.
> 줄 번호는 현재 작업본(v1.3.2 미커밋 포함) 기준이다. 구현 때 줄이 밀리므로 **함수·키 이름을 기준**으로 찾고 줄은 참고로 쓴다.
> 경로는 `app/src/` 기준 (`main/…`, `shared/…`, `renderer/…`).

## 0. 한눈에 (결론)

1. **'지우는 것'은 일(job) 쪽 전부, '남기는 것'은 연결(짝·열쇠·hello·PeerClient) 쪽 전부.** 경계는 `main/peer/` 안에서 파일 단위로 거의 깨끗하게 갈린다(§1-1).
2. **저장 데이터는 '1회 정리 모듈' 하나로 처리한다.** 업데이트 뒤 첫 실행에서 (a) 진행 중이던 A컴 일을 리더에게 "닫혔어요"로 알리고 (b) 데려온 직원·일·보관함 표를 지우고 (c) 랩 멤버의 `p:` id·복사본 폴더를 정리한다. 모두 "이미 지워졌으면 아무것도 안 함"이라 **플래그 없이 몇 번 돌아도 안전**하다(§2).
3. **옛 열쇠(`PeerRecord`·B컴의 `view:false` 슬롯)는 지우지 않는다.** 이 열쇠가 곧 워크스페이스의 '화면 보기 허락 요청' 출발점이라, 지우면 이미 짝지은 사람이 전부 다시 짝지어야 한다.
4. **연결 카드는 '기기 목록 하나'로 합친다.** 지금 두 카드의 '해제'는 뜻이 다르다(한쪽은 짝까지 끊고 한쪽은 목록에서만 뺀다). 합치면서 **'해제 = 짝 끊기 + 목록에서 빼기'** 한 가지로 정한다(§3).
5. 안드로이드는 **변경 없음**. 폰 앱은 `kind:'phone'`으로만 짝짓고(`android/.../net/ManualPair.kt:179`) 이 기능의 호출을 갖고 있지 않다(grep 확인, `peer`는 TLS 용어뿐).

---

## 1. 지울 것 · 남길 것 · 경계

### 1-1. `main/peer/` 안의 경계

| 파일 | 처리 | 이유 |
|---|---|---|
| `pairing.ts` (210줄) | **남김, 수정 없음** | 짝짓기 창·코드·증명·`pairWithHost`. 워크스페이스가 그대로 씀 |
| `peerClient.ts` (201줄) | **남김** | SSE 연결·8초 유예·재연결. 워크스페이스 연결 상태의 원천 |
| `peerTransport.ts` (183줄) | **남김** | `createPairTransport`·`createPeerHttp`·`createOpenStream` |
| `peerRegistry.ts` (141줄) | **남김 + 축소** | `PeerRecord`·토큰 금고는 유지. `listStaff/staffOf/addStaff/removeStaff/syncStaff/patchStatus`와 `removePeer`가 돌려주는 staffIds 부분 삭제 |
| `peerStore.ts` (204줄) | **남김 + 축소** | `PeerRecord`·`peers` 표만 유지. `PeerStaffRecord`·`PeerJob`·`PeerOutbox`·`InboxJob`·`PeerUpload`와 해당 표·`TABLES` 항목 삭제(§2-1에서 정리 모듈이 읽어야 하는 모양만 `legacyPeerCleanup.ts` 안에 얇게 선언) |
| `peerErrors.ts` (17줄) | **남김** | 짝짓기 오류 → 문구 키. 일 관련 코드(`queue_full` 등) 매핑만 정리 |
| `redact.ts` (45줄) | **남김** | `main/errorLog.ts:9`가 피드백 오류 가림에 씀. 이름은 어색해도 지우면 토큰이 피드백에 샐 수 있다 → 건드리지 않음 |
| `peerManager.ts` (495줄) | **남김 + 대폭 축소** | `registry`·`connect`·`linkState`·`list`·`pairConnect`·`unpair`·`reconnect`·`start/dispose`·`onEvent`의 연결 상태 부분만. 아래 §1-2 |
| `peerHost.ts` (312줄) | **삭제** | 전부 B컴 '일 받기'(`accept/jobs/cancel/ack/upload/approvals/decide/recover`·`peerSnapshotShape`). 연결 쪽 기능 없음 |
| `jobQueue.ts` (472줄) | **삭제** | A컴 일 큐·재전송 |
| `approvalRelay.ts` (140줄) | **삭제** | 다른 PC 결재 중계(`p:` 결재 id·`PeerChanges`) |
| `remoteStaffView.ts` (37줄) | **삭제** | 데려온 직원 → `Staff` 모양 |
| `peerIsolation.ts` (51줄) | **삭제** | 빌려준 일 격리 규칙(office.ts 전용) |
| `sync/` 9개 파일 (1249줄) | **폴더째 삭제** | 파일 복사본·변경 묶음 = 빌려주기의 부속 |

`peerManager.ts` 이름은 **그대로 둔다**(import 5곳·시험 이름 보존, 영향 최소). 이름 바꾸기는 다음 릴리스에서 `workspace` 연결 구현과 함께 판단 — 지금 바꿔도 얻는 것이 없다.

### 1-2. `PeerManager`에서 지울 메서드(`main/peer/peerManager.ts`)
- 삭제: `queue`·`relay` 필드와 생성(94~115), `onOnline`의 직원 목록·watch·결재 맞추기·큐 보내기·변경 받기(155~182 중 `registry.touch`만 남김), `onEvent`의 `job`·`approval`·`snapshot`(189~210; 연결 상태만 쓰므로 이벤트 본문은 무시), `onReport`/`report`(212~264), `restoreChanges`(265), `changesetDetail`·`changeFileDiff`·`applyChanges`(285~311), `staffViews`(326), `isRemoteStaff`(344), `remoteStaff`(361), `addStaff`(376), `removeStaff`(392), `delegate`(428), `decide`·`answerQuestion`·`isRelayedApproval`(444~460), `cancelJob`·`stopStaff`·`jobs`·`prune`(462~495), 인터페이스 `PeerOfficePort`·`PeerSyncPort`(27~56)과 `PeerManagerDeps.sync/schedule/text`.
- 남김·수정: `unpair`(406)에서 `queue.cancelAll`·`relay.dropPeer`·`removeFromLabs`·B컴 `unpair` 호출(`PEER_PATHS.unpair`)만 정리. `list()`(312)의 `queued`·`staffCount` 필드 삭제 → `PeerView`(shared/peerProtocol.ts:147)에서도 삭제.
- `PeerOfficePort`는 `ownName()`·`changed()` 두 개만 남는 **작은 입구**(`Pick`)로 줄인다. `Office.peerPort()`(office.ts:1567)는 이 둘만 돌려준다.

### 1-3. 앱 본체(`main/`)에서 지울 곳
- `main/index.ts`: `createPeer()`(71~121)에서 `PeerSync`·`PeerHost`·`sync` 부분 삭제, `PeerManager`만 만든다. import 23·25·26 삭제. `peerApi()`(129)·`remote` 설정의 `peer:{host, sync, shapePeer, onSlotRemoved…}`(136~144)는 **`PeerHost`·`sync`를 빼고** `ownName`·슬롯 제거 콜백·`onViewRequest`만 남긴다. `peerSync?.prune()`(443) 삭제. 시작 순서는 §5.
- `main/office.ts` (가장 큰 변경, 약 20곳): 필드 `peer`·`peerHost`·`peerApprovalSeen`·`peerCwd`·`peerSync`(243~249)·`PeerWorkspacePort`(213) 삭제, `Origin`의 `kind:'peer'`·`peerJobId`(226)와 그 분기 전부(757, 1097~1103, 1274, 1307, 1318, 1382, 1438, 1465, 1953, 1992, 2332), `setPeer/setPeerHost/setPeerSync/peerPort/peerHostOffice`(1554~1865), `remoteStaff/remoteMembersOf/instructRemote/peerErrorText`(1614~1700), `peerJobOf/isPeerBusy/finishPeerJob/failPeerJob/endPeerCwd/settlePeerCwd/syncPeerApprovals/peerApprovalEvent`(1706~1865). `hasDelegates`(1660)·`delegationInputOf`(1644)의 `peerJobStates` 입력 삭제 → **`shared/delegation.ts:7,21`의 `peerJobStates` 필드와 `OPEN_PEER_JOB`도 같이 삭제**(v1.3.2에서 막 만든 것이라 같은 날 지워도 싸다. 시험 `scripts/delegation.test.mts` 3곳 수정). `describe`·`checkStall`의 `peerJobId` 인자도 정리.
  - ⚠ 이 중 **`Origin` 분기 삭제가 `shouldHoldLocal`·`derivedPeerAction` 같은 격리 규칙을 통째로 없애므로** 로컬 직원 지시 흐름이 바뀌는 지점은 없다(격리는 `kind:'peer'`가 있을 때만 걸렸다). 구현 뒤 `grep "peer" main/office.ts`가 0이 되는 것을 기준으로 한다.
- `main/officeHandlers.ts:16~84`: 핸들러 삭제 — `peerRemoteStaff`·`peerAddStaff`·`peerRemoveStaff`·`peerCancelJob`·`peerChangesetDetail`·`peerChangeFileDiff`·`peerApplyChanges`(78~84), `parseApplyChoice`와 `ApplyChoice` import(17). **남김**: `peerPairStart·peerPairClose·peerSlots·peerRevokeSlot·peerPairConnect·peerList·peerUnpair·peerReconnect`(66~77).
- `main/db.ts:41~42,108~110,256`: `ensurePeerTables`는 `peer` 표만 만들게, `syncStore`·`ensureSyncTables` 삭제. `peerStore()`(256)는 유지.
- `main/pendingApprovals.ts:25~26` `isPersistable`: `PeerChanges`·`peer:` 제외 규칙은 **다음 릴리스까지 남긴다**(옛 DB에 그런 행이 들어 있을 가능성은 없지만 규칙이 무해하고, 지우면 `pendingApprovals.test.mts` 1곳만 바뀐다 → 이번에 지워도 됨. 선택: 지움).
- `main/remote/`: 
  - `peerRoutes.ts`(213줄): **`/v2/pair/*`와 `/v2/peer/unpair`만 남긴다.** `staff·watch·jobs·attachments·approvals·jobs/<id>/cancel|ack`(147~178)와 `receiveAttachment`(180~)·`callAsPeer`(206)는 삭제. 남은 `/v2/peer/*` 경로는 `410 {error:'peer_feature_removed'}`로 답한다(§2-4, 옛 A컴이 영원히 기다리지 않게).
  - `syncRoutes.ts`(141줄) 삭제, `v2routes.ts:57,103,123~132`의 `sync`·`isPeer` 분기 정리, `v2routes.ts:271` `callAsPeer` 줄 삭제(`view:false` 슬롯은 hello 말고는 **`scope_denied`**: 이미 `HELLO_METHOD` 예외 구조라 줄 하나로 끝남).
  - `service.ts:16,18~19,81,142,157~167`: `peer` 의존에서 `host`·`sync` 제거, `PairingWindow`·슬롯 관리·`onViewRequest`만 남김.
  - `events.ts:11,65,128,133`: `PeerEventName`·`shapePeer`·`publishToSlot` 삭제. 단 아래 확인 필요 1번.
  - `capabilities.ts:10,16`: `PEER_CAPABILITY`(`peer-v1`)는 **남긴다** — 옛 A컴이 hello에서 능력을 확인하므로, 지우면 옛 A컴이 "피어 아님"으로 판정한다(영향 불명). 의미만 "짝짓기 가능"으로 주석 변경.
  - `v2.ts:72~78`·`shared/workspace.ts:251~257`·`shared/secretaryTools.ts:166~172`·`shared/officeApiShape.ts:159~165`·`shared/types.ts:1119~1129`: 삭제한 7개 메서드의 표 항목 삭제(분류표가 서로 어긋나면 시험이 잡는다).
- `shared/`: `peerSync.ts`(205줄) 삭제; `peerProtocol.ts`는 **축소**(남김: `PEER_PATHS.pairHello/pairConfirm/unpair`, `PairKind`, `PairWindowView`, `PeerSlotView`, `PeerView`, `PeerLinkState`, `PEER_LIMITS.pairCodeLength/pairMaxWrong/maxSlots/offlineAfterMs/retryMs/sseTotal`, 코드 정규화·표시 함수; 삭제: 일·첨부·큐·인박스 한도·`PeerJobState`·`PeerStaffBrief`·`PeerApprovalEvent`·`parsePeerStaffId`·`RemoteStaffChoice`·`PeerPairResult` 중 안 쓰는 것). `types.ts`: `Approval.peerChanges`(86~87), `Staff.remote`·`StaffRemote`(190~199), 삭제한 IPC 시그니처. `approvalBand.ts:19,22`의 `peerChanges` 조건 삭제.
- `PairKind`의 값 `'peer'`는 **이름·와이어 값 모두 유지**(옛 앱과의 호환; 의미는 "화면 보기를 요청할 수 있는 열쇠"). 이름 바꾸기는 하지 않는다.

### 1-4. 화면(`renderer/`)에서 지울 곳
- `features/PeerSection.tsx`(290줄): `RemoteStaffPicker`(222~290) 삭제. `HostPart`(19)·`ClientPart`(137)·`autoFormat`(216)은 **`features/workspace/PairParts.tsx`로 옮기고(`git mv`) 파일 이름을 바꾼다.** 이유: 남는 import 처가 `WorkspaceWizard.tsx:11` 하나뿐이고 이름이 'Peer 섹션'이라 앞으로 읽는 사람이 지운 기능으로 오해한다. 추가 복잡도: import 1줄.
- `features/RemoteBadge.tsx` 삭제(사용처가 원격 직원 카드뿐 — 구현 때 grep으로 0 확인).
- `features/ChangesetCard.tsx`(`peerSync.*` 키 54개 사용) 삭제, `StaffPanel.tsx:626,634`·`InboxPage.tsx:120,132`의 `a.peerChanges && !IS_REMOTE_SCREEN` 분기 삭제.
- `features/BoardPage.tsx:384~397`(`peer.queued*`·`peerCancelJob`) 삭제, `features/ChatPage.tsx:303~312`(연결된 PC 한 줄 `peer.chatLine`) 삭제.
- `features/connect/useConnectData.ts`: `slots`·`peers` 조회(17~50)는 §3의 기기 목록이 쓰므로 **유지**하되 `remoteKey`(47, `x.remote?.queued` 의존)는 `workspace` 구독 값으로 교체.
- `shared/connectModel.ts:22,27~31` `devicesOf`: `staffCount` 삭제, 입력에 `workspaces` 추가(§3).

### 1-5. 사전(i18n)·문서·시험

**사전** (`shared/i18n/dict/`):
- 파일째 삭제: `peerSync.ts`(54키), `peerGuard.ts`(13키). `dict/index.ts`의 import·병합 줄도 삭제.
- `peer.ts`(82키): **키별 사용처 grep으로 판정**(구현 단계의 첫 일). 남길 가능성이 큰 묶음: `peer.error.*`(pair_off·full·pair_failed 등 `peerErrors.ts`), `peer.state.*`, `peer.host.*`·`peer.client.*` 중 코드 입력·표시 문구, `peer.section.*`. 지울 묶음: `peer.tag`·`peer.badge`·`peer.queued*`·`peer.chatLine`·`peer.delegate.*`·`peer.report.*`·`peer.attach*`·`peer.leadOwner`·`peer.client.pickStaff`·`peer.role.*`·`peer.section.accountNotice`·`peer.guard.*`. 
  - **방법**: `app/scripts`에 일회용 스크립트를 만들지 않고, 구현자가 `for k in $(키 목록); do grep -rn "'$k'" src --include=*.ts* | grep -v dict/ | wc -l; done`로 0건 키를 지운다. `i18n.test.mts`가 4개 언어 일치를 지키므로 안전.
- 그 밖: `dict/knowledge.ts:69` `staff.tool.browserAuto.peer`("다른 PC가 맡긴 일에서는…")는 `browser_auto` 도구가 `peer` 출처를 거절하는 문구 → 출처 자체가 없어지므로 삭제(사용처 office.ts/`mcp__office__browser_auto`는 구현 때 grep). 새 키는 **하나도 만들지 않는다**(§2의 알림 문구 1~2개만 `dict/peer.ts`에 추가: `peer.retired.jobs`, `peer.retired.changes`).
- `dict/workspace.ts`: 마법사 `what.phone`·`what.phoneDesc`·`what.phoneGo`(§3) 삭제.
- 문서: `SPEC.md`·`README*.md`·`CHANGELOG*.md`(새 버전 항목, 4개 언어)·`docs/specs/multi-pc-protocol.md`(상단에 "v1.3.2에서 일 빌려주기 폐지" 한 줄)·앱 안 매뉴얼(`main/manuals.ts` 템플릿의 '직원 데려오기' 언급은 grep으로 확인 — 확인 못 함).

**시험** (`app/scripts/`, `peer` 언급 수는 grep 결과):

| 시험 | 처리 |
|---|---|
| `peerHost.test.mts`(32) · `peerQueue.test.mts`(40) · `peerGuard.test.mts`(53) · `peerSync.test.mts`(9) · `peerSyncWire.test.mts`(19) · `peerSyncE2E.test.mts`(11) | **삭제** |
| `peerE2E.test.mts`(75) | **축소 후 유지**: 짝짓기 → 연결 → `view` 허락 요청/허락 → 끊기 시나리오만 남기고 일·결재·복사본 시나리오 삭제. 두 PC 실제 HTTPS 통합을 지키는 유일한 시험이라 통째로 지우지 않는다 |
| `peerPairing.test.mts`(48) | 유지. 피어 토큰 권한 범위(8-1절) 시험에서 "`callAsPeer` 가능" 기대를 "`scope_denied`"로 바꿈 |
| `peerRegistry.test.mts`(23) | 직원 관련 시험만 삭제 |
| `peerClient.test.mts`(4) · `peerInvite.test.mts`(4) | 유지 |
| `workspace.test.mts`(30) | `what:'phone'` 시험·`peerRemoteStaff…` 분류표 시험 수정, 허브 격리 시험 유지 |
| `remote-v2.test.mts`(21) | `/v2/peer/*` 시험을 "410 `peer_feature_removed`"·"`unpair`는 동작"으로 교체 |
| `delegation.test.mts`·`connectModel.test.mts`·`pendingApprovals.test.mts`·`approvalBand.test.mts`·`errorReport.test.mts`·`remote-hardening.test.mts` | 해당 줄만 수정(각 1~6곳) |
| 새 시험 | `legacyPeerCleanup.test.mts`(§2), `connectModel.test.mts`에 합친 기기 목록 시험(§3) |

---

## 2. 저장 데이터 처리 · 옛 버전 상대

### 2-1. 무엇이 남아 있나(실제 코드로 확인)
| 데이터 | 위치 | 업데이트 뒤 |
|---|---|---|
| 데려온 직원 `peer_staff` | office.db 표(`peerStore.ts:170`) | **지움** |
| 보내던·진행 중 일 `peer_job`, 보낼 것 `peer_outbox` | 같은 DB | **리더에게 알린 뒤 지움** |
| B컴 받은 일 `peer_inbox`, 올린 첨부 `peer_upload` | 같은 DB | **지움** (받은 일은 앱 재시작 때 실행 세션도 사라져 이어 갈 수 없음) |
| 복사본·변경 묶음 `peer_workspace`·`peer_changeset` | `syncStore()`(`main/db.ts:110`) | **지움** |
| 복사본 파일 | `userData/peer-workspaces/`, `peer-blobs/`, `peer-staging/` (`peerSyncService.ts:68~70`) | **폴더 삭제** (프로젝트 파일 사본이라 남겨 둘 이유가 없고 디스크·개인정보 쪽으로 남기면 오히려 위험) |
| 랩 멤버의 `p:<peer>:<remote>` id | 랩 저장(`office.ts:951,1590` `saveLabObj`) | **1회 제거** |
| 데려온 직원 로그(`log` 표의 `p:…` staffId) | `office.ts:1571` | **1회 삭제** (표·열 이름은 구현 때 `db.ts`에서 확인) |
| `PeerRecord`(짝 목록 `peer` 표)·토큰 파일(`userData/peers/`) | `peerStore`·`peerRegistry.ts:22` | **그대로 둠** |
| B컴 슬롯(`RemoteConfig.peers`, `view:false` 포함) | `main/remote/auth.ts:58~69`, `service.ts:48` | **그대로 둠** |
| `workspaces.json` | `main/workspace/workspaceStore.ts` | **그대로 둠** (`peerId`만 가짐; 깨진 파일은 이미 빈 목록으로 읽는다 — 줄 28~33) |
| 파일 맞추기 결재 `PeerChanges` | 저장 안 함(`pendingApprovals.ts:26`), 앱 켤 때 `restoreChanges`(`peerManager.ts:265`)가 `peer_changeset`에서 다시 만든다 | 표 삭제로 사라짐 → 아래 알림 |

### 2-2. 처리 방식: `main/peer/legacyPeerCleanup.ts` 1개 모듈 (순수 함수 + 입구 주입)
- **함수 하나** `retireBorrowedWork(deps): { activeJobs: PeerJobLite[]; pendingChanges: number }` — `deps`는 `rawRows(table)`(표 이름 → 행 목록), `dropTables()`, `removeDirs()`, `stripLabMembers(prefix)`, `deleteLogs(prefix)`, `now()`. electron·DB 직접 의존 없음 → 메모리 구현으로 시험 가능(기존 `memoryPeerStore` 방식과 같다).
- **순서**(실패해도 앱이 죽지 않게 각 단계를 `try/catch`로 감싸고 오류 기록만 남긴다. 다음 실행에서 다시 시도):
  1. `peer_job`에서 `state ∈ queued|sending|accepted|running`인 행을 읽는다 → 반환값으로 `activeJobs`.
  2. 그 중 `leadId`가 있는 일마다 **리더에게 한 번 알림**: `Office`가 가진 기존 입구(`instruct`로 `[팀원 보고]` 한 줄, `office.ts:1959`와 같은 형식)로 "업데이트로 다른 PC 직원 일이 닫혔어요: <직원 이름>" 보냄. 리더가 영원히 보고를 기다리는 상태(§v1.3.2 '팀원 일 기다리는 중'과 같은 증상)를 막는 것이 이 단계의 목적. `leadId`가 null(대표 직접 지시)이면 대화에 알림 한 줄(`postChat(OFFICE_SENDER, …)`, 기존 호출).
  3. `peer_changeset` 중 아직 적용 안 한 것 수를 `pendingChanges`로 센다 → 0보다 크면 **알림 1건**: "적용하지 않은 다른 PC 변경 N건은 업데이트로 닫혔어요. 파일은 그 PC에서 다시 받으세요".
  4. 랩 멤버에서 `p:` 로 시작하는 id를 모두 제거하고 저장(`saveLabObj`, 리더가 `p:`인 경우는 없음).
  5. `log`에서 `p:%` 행 삭제.
  6. 표 `DROP TABLE IF EXISTS` 7개, 폴더 3개 `rm -rf`(`force: true`).
- **언제**: `main/index.ts` 안에서 DB를 열고 `Office`가 만들어진 뒤, **`peerManager.start()`(441) 직전**. 이유: `start()`는 저장된 피어마다 연결을 시작하므로 그 전에 옛 표를 비워야 일이 다시 전송되지 않는다.
- **멱등(몇 번 돌려도 같다)**: 표가 이미 없으면 `rawRows`는 빈 목록 → 알림 없음 → 드롭은 `IF EXISTS`. 그래서 **'한 번만 돌았나' 표시값을 따로 저장하지 않는다**(저장 위치가 하나 더 느는 것보다 안전). 추가 복잡도: 앱이 켜질 때마다 존재 확인 쿼리 몇 번(밀리초).
- **'일이 끝난 뒤 정리'(`impl-design-readable.md` 7절 기본값 6)는 따르지 않는다.** 이유: (a) 정리드 지시가 "삭제는 이번 릴리스"이고, (b) 보내는 코드·받는 코드가 이미 없어 '끝날 때까지 기다릴' 방법이 없다. 대신 위 2·3단계가 "진행 중 일이 소리 없이 사라지는" 문제를 막는다. 정리드가 정할 일 → §6.

### 2-3. 앱이 옛 데이터를 만나도 죽지 않게
- 표를 만드는 쪽(`ensurePeerTables`)은 `peer`만 만든다. 옛 DB에 남은 다른 표는 **읽는 코드가 없으니 무해**하고, 정리 모듈이 지운다. 지우지 못해도(권한·잠김) 앱은 정상.
- `PeerRecord` 모양은 **바꾸지 않는다**(필드 삭제·추가 없음). 알 수 없는 필드는 `JSON.parse`가 그대로 둔다.
- 랩에 `p:` id가 남아 있는 경우(정리 4단계 실패·다운그레이드): `Office.labsOf()`·`membersOf`가 이미 `this.hired.get(id)` 결과를 `filter(Boolean)`로 거른다(`office.ts:2783` 근처) — **구현 때 모든 `lab.memberIds` 사용처(951, 1005, 1590~1632, 2627~2631, 2682)가 `p:` id에 대비돼 있는지 확인**한다. 대비돼 있지 않은 곳은 `isLocalStaffId` 같은 새 함수를 만들지 말고 정리 모듈에만 의존한다(정리 4단계가 성공하면 필요 없음). 확인 못 함.
- **다운그레이드**(옛 앱으로 되돌림): 옛 `ensurePeerTables`가 빈 표를 다시 만들 뿐이고 `PeerRecord`는 그대로라 연결은 유지된다. 지운 직원·일은 돌아오지 않는다 — 릴리스 노트에 한 줄.

### 2-4. 상대 PC가 옛 버전일 때
| 경우 | 동작 | 근거 |
|---|---|---|
| **새 A컴 → 옛 B컴** (워크스페이스로 B를 보고 싶음) | 짝(`PeerRecord`)·`hello`는 그대로 됨. `hello.protocol < 3`이거나 `canView` 없으면 마법사가 `'peerOutdated'`("저쪽 PC 앱을 업데이트하세요")로 안내 — **이미 있는 분기** | `shared/workspace.ts:12,79~82` |
| **옛 A컴 → 새 B컴**, 이미 빌려 쓰던 사람 | B컴이 `/v2/peer/jobs`·`staff`·`watch`·`approvals`·`attachments`에 `410 peer_feature_removed`로 답한다. 옛 A컴은 일을 못 보내고 **연결은 online이지만 일은 거절**. 옛 A컴 화면이 410을 어떻게 보여 주는지는 옛 코드를 안 봐서 **추정**(`queue_full` 같은 일반 오류로 처리되거나 재시도). 새 B컴 쪽 슬롯·`PeerRecord`는 건드리지 않아 짝은 유지 | `peerRoutes.ts:89~178`(답 변경), 옛 A컴 동작은 미확인 |
| **옛 A컴이 새 B컴에 새로 짝지음** (`kind:'peer'`) | 계속 성공(슬롯 만들어짐, `view:false`). 일은 못 시킨다. 옛 앱은 안내가 없다 → 릴리스 노트로만 해결 | `service.ts:200~207` 유지 |
| **옛 B컴이 처리하던 일**(새 A컴이 보낸 건 없음) | 해당 없음. 새 A컴은 일을 보내지 않는다 | — |
| **옛 B컴에 새 A컴이 남긴 슬롯** | 영향 없음 | — |
| **안드로이드** | 변경 없음. `phone` 짝짓기·`/v2/call`만 쓴다. 삭제한 IPC 메서드를 폰 앱이 부르는 곳이 없음(`android/.../net/*.kt` grep) | §0-5 |

- 410 응답은 `v2Fail`에 새 코드 한 가지(`peer_feature_removed`) 추가가 필요한지, 기존 `not_found`(404)로 충분한지 **정리드가 정한다**(추천: 새 코드. 옛 A컴이 404를 "B컴이 너무 옛 버전"으로 오해해 재짝짓기를 유도할 수 있다 — 추정).

---

## 3. 합친 연결 카드 · PC 추가 창

### 3-1. 지금 구조 (코드로 확인)
- `SettingsPage.tsx:442~446` 한 섹션 안에 `<ConnectSection />`(휴대폰·PC 연결, 단계 1~3) 과 `<ConnectedPcSection />`(연결한 PC) 두 카드.
- `ConnectSection`의 ③(`ConnectSection.tsx:310~395`)는 '휴대폰'·'내 다른 PC' 중 고르고, PC를 고르면 **인라인으로** `HostPart`/`ClientPart`(`peer.role.host/client`)와 `RemoteStaffPicker`를 연다 — 마법사(`WorkspaceWizard`)와 입구가 둘이다.
- 기기 목록 `DeviceList`(439~)는 `devicesOf`(휴대폰 + `slots`(이 PC에 붙은) + `peers`(내가 붙은))를 보여 주고 PC 행의 '직원 고르기'(`peer.client.pickStaff`)·'다시 연결'·'해제(`peerUnpair`)'를 갖는다.
- `ConnectedPcSection`은 이름·색·열기·`workspace:remove`(목록에서만).
- **어긋남 둘**: ① 같은 PC를 가리키는 줄이 두 곳에 따로 나온다. ② 해제 뜻이 다르다 — `DeviceList`는 `peerUnpair`(B컴에도 알리고 짝 삭제)지만 `workspaceService.remove`는 목록에서만 뺀다(`ConnectedPcSection` 주석). 합칠 때 하나로 맞춘다.

### 3-2. 새 흐름 (카드 하나, 단계 1~3 유지)
```
[설정 › 연결]  휴대폰·PC 연결
 ① 연결 방법 고르기 (Tailscale/같은 와이파이/공유기)   ← 지금 그대로
 ② 준비 확인                                           ← 지금 그대로
 ③ 무엇을 연결할까요?   [휴대폰]   [내 다른 PC]
      휴대폰 → QR·코드 (지금 그대로)
      내 다른 PC → 'PC 추가' 버튼 하나 (인라인 HostPart/ClientPart·RemoteStaffPicker 삭제)
                    → WorkspaceWizard 열림 (§3-3)
 ─────────────
 연결된 기기   ← 목록 하나 (아래)
```
**기기 목록 하나** (`connectModel.devicesOf` 확장; 순수 함수라 시험 가능):

| 종류 | 줄 내용 | 버튼 |
|---|---|---|
| 휴대폰 | 마지막 접속 | 끊기(기존) |
| **이 PC를 보는 PC** (B 슬롯, `kind:'to'`) | 이름·마지막 접속·`허락 대기`/`허락됨` | 끊기(`peerRevokeSlot`) |
| **내가 보는 PC** (`PeerRecord` + `workspaces.json` 항목을 `peerId`로 합침, `kind:'from'`) | 이름·색 점·연결 상태·저쪽 허락 상태 | **열기**, **이름·색 바꾸기**(인라인 편집, 기존 `EditRow` 재사용), **다시 연결**(offline일 때), **해제** |
| **이름 없는 옛 짝** (`PeerRecord`는 있고 워크스페이스 항목은 없음 — 업데이트한 사용자 대부분) | 이름·상태 | **'목록에 추가'**(기본 이름=`PeerRecord.name`, 색=안 쓴 첫 색 — 이미 `workspace:add`가 이 기본값을 처리), **해제** |

- **해제 하나로 통일**: `peerUnpair(peerId)` → 성공하면 같은 `peerId`의 워크스페이스 항목도 `workspace:remove`. 확인 문구 한 개(`workspace.manage.removeConfirm`을 "저쪽 PC 연결도 끊어요"로 문구만 수정; 새 키 없음). 이 한 곳에서 두 저장소를 지우므로 **합친 함수 `disconnectPc(peerId)`를 `renderer/features/workspace/useWorkspaces.ts` 안에 둔다**(렌더러가 두 IPC를 순서대로 부르는 지금 방식 유지, main 새 IPC 없음 → 영향 최소). 실패 중간 상태(짝만 끊김)는 목록에 '이름 없는 옛 짝'으로 보이지 않고 `unpaired`로 사라지므로 `workspace:remove`를 먼저 하지 않고 **`peerUnpair` 성공 뒤 제거**한다.
- `ConnectedPcSection.tsx` 삭제, `SettingsPage.tsx:446`의 두 번째 섹션 삭제, 편집 UI(`EditRow`·`ColorPicker`)는 `DeviceList` 행에서 쓸 수 있게 **`WorkspaceWizard.tsx`에서 import하는 곳은 그대로**(`ColorPicker`는 마법사가 이미 export). 새 컴포넌트 파일은 만들지 않는다(`ConnectSection.tsx`의 `DeviceList`가 커지면 같은 폴더 `DeviceList.tsx`로 분리 — 현재 `ConnectSection.tsx`가 500줄 넘으므로 분리 권장: 분리 이득 = 합친 목록 시험·읽기, 비용 = 파일 1개).
- 휴대폰에서 PC 설정을 볼 때(`IS_REMOTE_SCREEN`)는 지금처럼 상태 한 줄만(`ConnectSection.tsx:41~47`) — 변경 없음.

### 3-3. PC 추가 창(`WorkspaceWizard`) 변경
- `what` 단계의 선택을 **둘로 줄인다**: `pc`('다른 PC 보기', 코드 입력) / `host`('이 PC 보여 주기', 코드 표시). `phone`('휴대폰으로 이 PC 보기', `WorkspaceWizard.tsx:148~161`)은 삭제 — 첫 카드 ③ '휴대폰'과 겹치고, 휴대폰 안내를 보려면 설정 카드로 가면 된다. 마법사 안에는 설정 카드로 되돌아가는 링크를 **만들지 않는다**(닫으면 바로 그 카드가 보임).
- `wizard.ts`: `what: 'pc'|'host'|null`(7줄·`pickWhat` 액션 타입에서 `'phone'` 제거), `canNext`는 그대로(`pc`만 다음, `host`는 첫 장에서 끝). `workspace.test.mts`의 `phone` 시험 수정.
- 'host'(이 PC 보여 주기)는 **남긴다**: B컴이 코드를 보여 줘야 A컴이 짝짓기를 시작할 수 있어 입구가 사라지면 PC 추가가 불가능해진다(HostPart = 짝짓기 B쪽 부품 = 브리프의 '반드시 남길 것').
- 입구가 카드 ③ 하나가 되므로 마법사를 여는 곳은 `ConnectSection`의 'PC 추가' 버튼 하나(`isWizardOpen` 상태는 그 컴포넌트가 가짐). 드롭다운(`WorkspaceSwitcher`)의 'PC 추가'는 **같은 컴포넌트를 연다**(이미 `WorkspaceWizard`를 부르는 곳이라 변경 없음).
- 용량: 연결 PC 최대 3대(`WORKSPACE_MAX`)는 기존 그대로 — 가득 차면 'PC 추가' 비활성+안내(기존 문구 재사용).

---

## 4. 검증 방법

**자동 (`pnpm typecheck`·`pnpm test`)**
1. **타입 검사가 1차 안전망**: 삭제 순서를 `shared/types.ts` → 사용처 순으로 하면 컴파일 오류 목록이 곧 남은 일 목록. 끝나면 `pnpm typecheck` 0 오류.
2. `grep -rn "peerHost\|PeerHost\|jobQueue\|approvalRelay\|peerSync\|PeerSync\|remoteStaffBase\|isRemoteStaff\|peerChanges\|StaffRemote" app/src` → **0건**. 이 grep을 구현 뒤 확인 항목으로 못 박는다(죽은 코드 점검).
3. `scripts/legacyPeerCleanup.test.mts` (**새**, 메모리 구현으로):
   - 옛 DB 모양(행 있는 7개 표 + `p:` 멤버가 든 랩 + `p:` 로그)을 넣고 실행 → 표 비어 있음·`activeJobs`에 진행 중 일만 나옴·리더 알림 호출 횟수=진행 중 일 수·적용 안 한 변경 수 계산.
   - **두 번 실행해도 두 번째는 알림 0건·오류 없음(멱등)**.
   - 표가 아예 없는 새 DB → 아무 일 없음.
   - 한 단계가 던져도 다음 단계 계속(오류 기록만).
4. `connectModel.test.mts`: `devicesOf`에 휴대폰+슬롯+짝+워크스페이스 입력 → 합친 행 4종(이 PC를 보는 PC / 내가 보는 PC / 이름 없는 옛 짝 / 휴대폰)이 중복 없이 나오는지, `peerId`가 같은 짝·항목이 한 줄로 합쳐지는지.
5. `workspace.test.mts`: 마법사 `what`이 `phone`을 거절하는지, 분류표(`R/S/C`)에 삭제 메서드가 없는지(없는 메서드를 부르면 실패).
6. `remote-v2.test.mts`: `/v2/peer/jobs` 등 → `410`(또는 정리드가 정한 코드), `/v2/peer/unpair`는 200, `view:false` 슬롯의 `/v2/call`은 hello만 통과·나머지 `scope_denied`.
7. `peerE2E.test.mts`(축소): 짝짓기 → 연결 online → 화면 보기 허락 요청 → 허락 → 끊기, 두 PC 실제 HTTPS.
8. `i18n.test.mts`(기존): 4개 언어 키 일치.

**수동 (실제 앱, 맥+윈도우 둘 다)**
- **업데이트 시나리오가 핵심**: 옛 버전으로 (a) 직원 데려오기·랩 추가·일 맡기기(진행 중 1건 남김)·변경 묶음 결재 1건을 만든 DB·`userData`를 복사해 두고 → 새 버전을 그 위에 실행 → 리더에게 "닫혔어요" 알림이 한 번만 오는지, 랩 멤버에서 직원이 사라지고 앱이 정상 부팅하는지, 재실행해도 알림이 안 반복되는지, 짝 목록(`PeerRecord`)·`workspaces.json`·B컴 슬롯이 그대로인지, `peer-workspaces` 폴더가 사라졌는지.
- 옛 A컴(1.3.1)과 새 B컴(1.3.2)을 짝지은 채로: 옛 A컴에서 일 보내기 → 오류가 나는지(멈춰 있지 않고), 크래시 없는지. 반대로 새 A컴이 옛 B컴을 보려 할 때 `peerOutdated` 안내.
- 설정 › 연결: 합친 카드에서 ① 휴대폰 QR ② 'PC 추가' → 마법사(2택) ③ 옛 짝이 '목록에 추가'로 보이고 눌러서 열림 ④ 해제 한 번에 짝과 목록이 같이 사라짐 ⑤ B컴 슬롯 끊기. 폭 900·1360 두 크기, 한국어·영어 두 언어.
- 안드로이드 앱 연결·QR·결재가 그대로 동작하는지(기존 휴대폰 시험 항목 재실행, 변경 없음 확인).

**확인 못 한 것(구현 전 확인)**
1. `main/remote/events.ts:128`: `shapePeer`를 없애면 `view:false` 슬롯의 SSE 연결이 **끊기지 않고 online으로 남는지**(옛 A컴·새 A컴의 `PeerClient`가 연결 상태를 이 스트림 열림으로 판단). 하트비트가 `shaped()` 밖에서 나가는지 확인 필요. 안 나가면 빈 `snapshot` 이벤트를 `shapePeer` 대신 내는 한 줄이 필요.
2. 옛 A컴이 410을 받을 때 화면 동작(옛 코드 미확인, 추정).
3. `log` 표에서 직원 id 열 이름과 `lab.memberIds` 사용처의 `p:` id 내성(§2-3).
4. `main/manuals.ts`·`intro.html`·`site/`의 '직원 데려오기' 문구.

---

## 5. 변경 영향이 큰 곳과 순서

**영향이 큰 곳** (큰 순): `main/office.ts`(약 20곳·1천 줄 규모, 로컬 지시 흐름 옆이라 가장 조심) > `main/peer/peerManager.ts`(재구성) > `shared/types.ts`(IPC·`Staff.remote`로 renderer 전체 컴파일 오류) > `main/remote/{service,v2routes,peerRoutes,events}.ts`(옛 A컴과의 호환선) > `ConnectSection.tsx`/`SettingsPage.tsx` > 사전 키 정리.

**순서** (각 단계 끝에 `pnpm typecheck && pnpm test` 통과, 중간에 커밋 금지 지시를 따라 작업본에서만):
1. **정리 모듈 + 시험 먼저** (`legacyPeerCleanup.ts`·`.test.mts`). 지울 표를 읽는 모양이 아직 살아 있을 때 만든다. 아직 연결하지 않는다.
2. **B컴 쪽 차단**: `peerRoutes.ts`에서 일 경로를 410으로, `v2routes.ts:271` `callAsPeer` 제거. 옛 A컴과의 동작을 먼저 고정하고 시험(`remote-v2`·`peerPairing`) 수정.
3. **A컴 쪽 일 큐 끊기**: `peerManager.ts`에서 `queue`·`relay`·직원·변경 메서드 삭제, `office.ts`의 `peer` 호출처 정리(컴파일러 오류를 따라감), `delegation.ts`의 `peerJobStates` 삭제. 이 단계에서 `office.ts` 격리 규칙(`peerIsolation`)·`Origin kind 'peer'`도 같이 제거.
4. **핸들러·표·타입 정리**: `officeHandlers`·`v2.ts`·`workspace.ts` 분류표·`secretaryTools`·`officeApiShape`·`types.ts`. `db.ts`의 표 목록 축소, `index.ts` 조립 단순화. **정리 모듈을 `peerManager.start()` 앞에 연결**(§2-2).
5. **파일 삭제**: `peerHost`·`jobQueue`·`approvalRelay`·`remoteStaffView`·`peerIsolation`·`sync/`·`syncRoutes`·`peerSync.ts` — 이제 참조가 없어 안전.
6. **화면**: 기기 목록 합치기(`connectModel`·`DeviceList`)·카드 ③·마법사 `what` 2택·`PairParts` 이동·삭제한 화면 조각(`RemoteBadge`·`ChangesetCard`·`BoardPage`·`ChatPage`·`StaffPanel`·`InboxPage`).
7. **사전·문서·시험 마무리**: 사용 안 하는 키 삭제, CHANGELOG(4개 언어)·SPEC·README, 삭제 시험 정리, §4의 grep 0건 확인, 수동 시나리오.

**순서의 이유**: 1은 읽을 모양이 사라지기 전에, 2는 상대 버전 호환선을 먼저 고정, 3~5는 "컴파일러가 남은 일을 알려 주는" 구간, 6은 데이터·프로토콜이 굳은 뒤 화면. 거꾸로(화면부터) 하면 삭제한 IPC를 부르는 화면이 중간에 깨진다.

---

## 6. 정리드가 정할 쟁점 (추천 포함)

1. **정리 시점**: 업데이트 직후 한 번에 지움(추천 — 보내고 받는 코드가 이미 없어 기다릴 방법이 없고, 진행 중 일은 리더 알림으로 닫음) vs 한 릴리스 더 숨기기만 하고 다음에 삭제(요청서 7절 기본값 6). 숨기기만 하면 이 설계의 §1 삭제 절반이 다음 릴리스로 밀리고 `office.ts` 분기도 남는다.
2. **옛 A컴에 보낼 410 코드**: 새 코드 `peer_feature_removed`(추천) vs 기존 404.
3. **적용 안 한 변경 묶음**: 알림 후 삭제(추천) vs 한 릴리스 동안 읽기만 가능하게 보관. 후자는 `sync/` 삭제가 밀려 §1이 반쯤만 끝난다.
4. **`pendingApprovals.ts` `PeerChanges` 제외 규칙**: 이번에 지움(추천) vs 남김. 영향은 시험 1곳.
5. **`PairKind 'view'`**: 지금 UI는 안 쓴다(`PeerSection.tsx:41`은 `'peer'`; `officeHandlers.ts:67`만 `'view'`를 받음). 정리 범위 밖으로 두고 남김(추천) vs 같이 삭제. 와이어 값이라 지워도 옛 앱에 영향은 없을 것으로 **추정**.
