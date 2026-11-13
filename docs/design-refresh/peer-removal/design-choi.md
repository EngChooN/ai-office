# 다른 PC 직원 빌려주기·데려오기 삭제 + 연결 카드 합치기 — 최가독 설계안

코드는 고치지 않았습니다. 박패턴 안은 보지 않고 따로 썼습니다. 줄 번호는 작업본(v1.3.1·1.3.2 미커밋 포함) 기준이라 구현 직전에 한 번 더 확인해야 합니다.

## 0. 먼저 알아 둘 사실 (코드로 확인)
- **같은 연결을 둘이 나눠 씁니다.** 워크스페이스(PC 창 보기)도 빌려주기와 같은 `PeerRecord`·짝짓기·`PeerClient` 연결을 씁니다(`main/index.ts:430` `peerName`이 `peerStore().peers`를 읽음, `renderer/features/workspace/WorkspaceWizard.tsx:176` `peerList`). 그래서 `PeerManager`(`main/peer/peerManager.ts`)를 통째로 지울 수 없고 **'연결 쪽'만 남기고 '일 맡기기 쪽'만 도려냅니다.**
- **워크스페이스 연결(`links`)은 아직 `noLinks`입니다**(`main/workspace/index.ts:96`, `workspaceService.ts:19`). 즉 '화면 보기' 실제 통로는 이 작업 범위 밖이고, 지금 '연결됨/끊김' 표시는 `PeerView.state`(`peerManager.ts:312` `list()`)가 줍니다. 이 값을 만드는 `PeerClient` 연결(`peerManager.ts:144` `connect`)은 남깁니다.
- 안드로이드 앱은 `peer` 기능을 쓰지 않습니다(`android/.../ManualPair.kt:179`는 `kind:"phone"`뿐, `peer` 글자는 TLS 인증 용어). **안드로이드는 범위 밖, 변경 없음.**
- 원격 v2 API(`main/remote/v2.ts:64-78`)의 `peer*` 15개 메서드는 PC 화면 전용(`open_on_pc`)이라 휴대폰에 영향 없음.

## 1. 지울 것·남길 것

### 1-1. 통째로 지우는 파일
| 파일 | 이유 |
|---|---|
| `main/peer/peerHost.ts`(312줄) | 받는 쪽 일 상자(`accept`·`jobs`·`approvals`) — 빌려주기 전용 |
| `main/peer/jobQueue.ts`(472) | 보낼 일 줄 세우기 |
| `main/peer/approvalRelay.ts`(140) | 결재 중계 |
| `main/peer/peerIsolation.ts`(51) | 피어 일 격리(`office.ts:13`에서만 씀) |
| `main/peer/remoteStaffView.ts`(37) | 원격 직원 → Staff 변환 |
| `main/peer/redact.ts`(45) | 쓰는 곳이 `peerHost.ts`·`office.ts`·`secretary.ts`·`errorLog.ts` → **`errorLog`·`secretary`가 쓰면 남김, 구현 때 import 확인(확인 못 함)** |
| `main/peer/sync/` 9개 파일 전부(1249줄) | 파일 복사본·변경 묶음은 빌려주기 전용 |
| `main/remote/syncRoutes.ts` | `/v2/peer/workspaces·blobs·changesets` |
| `shared/peerSync.ts`(205), `shared/i18n/dict/peerSync.ts`(59) | 같은 이유 |
| `renderer/features/ChangesetCard.tsx` | 파일 변경 결재 카드(`approval.peerChanges`, `types.ts:86-87`) |
| `renderer/features/RemoteBadge.tsx` | 원격 직원 표지(`StaffCard.tsx:15,157,168`, `StaffRow.tsx:11,50`) |
| `scripts/peerHost·peerQueue·peerGuard·peerSync·peerSyncWire·peerSyncE2E.test.mts` | 지운 코드의 시험 |

### 1-2. 파일은 남기고 안을 줄이는 곳
- `main/peer/peerManager.ts`: **남김** `list`(312)·`linkState`(133)·`connect`(144)·`pairConnect`(349)·`unpair`(406)·`reconnect`(421)·`dispose`·`start`. **지움** `onOnline`의 직원 목록·`watch`·결재 따라잡기(169-187, 연결 확인·`touch`만 남김), `onEvent`의 `job`·`approval`·`snapshot`(189-210), `report`·`fetchChanges`·`restoreChanges`(212-283), `changesetDetail`·`changeFileDiff`·`applyChanges`(285-310), `staffViews`·`isRemoteStaff`(326-347), `remoteStaff`·`addStaff`·`removeStaff`(361-404), `delegate`·`decide`·`answerQuestion`·`isRelayedApproval`·`cancelJob`·`stopStaff`·`jobs`·`prune`(428-495), 생성자의 `relay`·`queue`(94-117), `PeerOfficePort`·`PeerSyncPort`·`thoughts`(27-52, 91). 남는 클래스는 100줄 안팎이라 이름을 `PeerLinks`로 바꾸는 것도 좋지만 **이름은 그대로 둡니다**(바꾸면 `index.ts`·`officeHandlers.ts`·시험 import가 줄줄이 변함 — 단순함 우선).
- `main/peer/peerRegistry.ts`: 남김 `listPeers`·`getPeer`·`addPeer`·`tokenOf`·`touch`·`removePeer`(56-92). 지움 `listStaff`·`staffOf`·`addStaff`·`removeStaff`·`syncStaff`·`patchStatus`(93-141). `removePeer`(83)가 돌려주던 직원 id 목록은 이제 없음.
- `main/peer/peerStore.ts`: `PeerRecord`(8)만 남기고 `PeerStaffRecord`(23)·`PeerJob`(40)·`PeerJobAttachment`(74)·`PeerOutbox`(83)·`InboxJob`(96)·`PeerUpload`(119)와 `TABLES`(166)를 `['peer']`로 축소. `ensurePeerTables`(169)는 `peer` 표만 만듦.
- `main/peer/peerClient.ts`·`peerTransport.ts`·`pairing.ts`·`peerErrors.ts`: **전부 남김**(연결·짝짓기·hello·재연결 — 요청서 '반드시 남길 것').
- `main/remote/peerRoutes.ts`: `pair`(89, hello/confirm)와 `/v2/peer/unpair`(154)만 남김. `staff`(147)·`approvals`(148)·`watch`(149)·`attachments`(160)·`jobs`(164)·`JOB_PATH`(170 이후)·`decide` 우회 허용(205 `/v2/call` 피어 토큰 허용 목록 중 `decide`·`answerQuestion`)은 지움. hello는 남겨 `view` 권한 요청(`v2routes.ts:280`)이 계속 동작.
- `main/remote/service.ts`: `peer?: { host; sync; … shapePeer … }`(81)에서 `host`·`sync`·`shapePeer` 제거(142·157·167), `onSlotRemoved`의 `dropSlot` 호출 제거. `peerSlots`(210)·`revokePeerSlot`(215)·`setPeerView`(228)·`onViewRequest`(155)는 남김.
- `shared/peerProtocol.ts`: 남김 `PEER_CAPABILITY`(5)·`PEER_PATHS.pairHello/pairConfirm/unpair`·`PEER_LIMITS.pairCodeLength/pairMaxWrong/maxSlots/offlineAfterMs/retryMs/sseTotal`·`PeerLinkState`(55)·`PairKind`(128)·`PairWindowView`(131)·`PeerView`(147, `queued`·`staffCount` 두 칸 삭제)·`PeerSlotView`(161)·주소·코드 도우미(183 이후). 지움 나머지(`PEER_PATHS` 나머지, `PEER_LIMITS`의 큐·첨부·수신함 한도, `PeerJobState`(50-52), `peerStaffId`·`parsePeerStaffId`·`isPeerStaffId`(59-64), `PeerStaffBrief`(67), `PeerJobEvent`·`PeerApprovalEvent`·`PeerApprovalGone`·`PeerJobRequest`·`PeerAttachmentBrief`(81-126), `RemoteStaffChoice`(173), `isJobId`(211)).
- `main/office.ts`: `setPeer`·`setPeerHost`·`setPeerSync`(1554-1563), `peerPort`(1567), `peerHostOffice`(1804 이후)·`syncPeerApprovals`(1783)·`peerApprovalEvent`(1800)·`finishPeerJob`·`failPeerJob`·`endPeerCwd`·`settlePeerCwd`(1729-1770)·`isPeerBusy`(1724)·`peerJobOf`(1706)·`instructRemote`(1685 이후)·`peerErrorText`(1677)·필드 `peer`·`peerHost`·`peerApprovalSeen`·`peerCwd`·`peerSync`(243-249), 호출부 `isRemoteStaff` 분기(1087·1274·1307·1318)·`isRelayedApproval`(1438·1465)·`o.kind==='peer'` 실패 처리(757·1382)·`peerJobOfOrigins`/`derivedPeerAction`/`shouldHoldLocal` 사용(1097-1103), `remoteStaff()`(1614-1640 부근 `staffViews`·`remoteMembersOf`)와 스냅샷의 `...this.remoteStaff()`(650), 위임 쪽 `peerJobStates`(1644)·`this.peer?.jobs()`(1655)·`this.peer!.delegate`(1667)와 `checkStall`의 `this.peer?.jobs()`(1991). `Origin` 타입의 `kind:'peer'`(226)도 제거. `describe`(team 도구, 2783)의 `remotes` 줄 제거.
- `main/officeHandlers.ts`: 핸들러 지움 `peerRemoteStaff`·`peerAddStaff`·`peerRemoveStaff`·`peerCancelJob`·`peerChangesetDetail`·`peerChangeFileDiff`·`peerApplyChanges`(78-84), `parseApplyChoice`·`ApplyChoice` import(17). 남김 `peerPairStart`·`peerPairClose`·`peerSlots`·`peerRevokeSlot`·`peerPairConnect`·`peerList`·`peerUnpair`·`peerReconnect`(66-77).
- `main/index.ts`: `createPeer`(71-122)에서 `PeerSync`·`PeerHost` 생성·연결 삭제, `PeerManager` 생성만 남김(`workspaceReady`·`fetchChanges`·`asSyncHttp` 124-127 모두 삭제). `peerHost`·`peerSync` 변수(65-68), `peer: {host, sync …}`(136-145), `peerSync?.prune()`(443) 삭제.
- `main/db.ts`: `ensureSyncTables`(111, 42 import) 삭제, 그 자리에 §2의 1회 정리. `peerStore()`(256) 유지.
- API 목록 5곳에서 15→8개로: `shared/officeApiShape.ts:151-165`, `shared/types.ts:1109-1129`, `shared/workspace.ts:243-257`(권한표), `shared/secretaryTools.ts:162-176`(exclude 표), `main/remote/v2.ts:64-78`. 지우는 7개 이름은 5곳에서 같이 지워야 타입검사가 통과(표가 `Record<…>`라 하나라도 빠지면 오류 → **빠뜨림을 컴파일러가 잡아 줌**).
- 화면: `renderer/features/PeerSection.tsx`에서 `RemoteStaffPicker`(222-290) 삭제, `HostPart`(19)·`ClientPart`(137)만 남음(파일 이름은 `PairParts.tsx`로 바꾸지 않음 — import 3곳이 바뀜. 구현 후 여력이 있으면 선택). `StaffCard.tsx:157,168`·`StaffRow.tsx:50`의 원격 흐림·뱃지, `StaffPanel.tsx:819,887`의 `!staff.remote` 조건(조건 자체 제거), `BoardPage.tsx:382-398` 대기 일 표시·취소, `ChatPage.tsx:303-312` `peers`·`peer.chatLine` 줄, `ChatPage.tsx:779` `!s.remote`, `map/IsoOfficeScene.ts:474-477` 🌐·흐림, `nav.ts`(peer 언급 부분), `shared/types.ts:192` `Staff.remote`·`StaffRemote` 타입·`Approval.peerChanges`(87)와 `PeerChangesCard` 계열, `map/iso/levelUpFx.ts`·`demoStageScene.ts`의 remote 참조(확인 못 함: 줄 미확인), `shared/staffCard.ts`·`shared/delegation.ts`의 `remote` 분기(`cardAction`의 `staff.remote`, 101-102 등, v1.3.2 작업본).
- 사전 키: `dict/peer.ts` 80개 중 **남김** `peer.state.*`(4), `peer.host.*`(code·address·fingerprint·untilUsed·copy·copied·qrAlt·sendTitle·sendDesc·fingerprintDesc·closed·renew·newSlot·another·retry), `peer.client.*`(host·code·connect·connecting·badHost·done·reconnect·pasteTitle·pasteDesc·paste·pasteHint·needCode·needHost·manual·manualDesc·doneFp), `peer.error.*`(unreachable·closed·full·failed·offline), `peer.role.*`, `peer.section.accountNotice`, `remote.phoneCode*`. **지움** `peer.tag`·`peer.leadOwner`·`peer.queued`·`peer.report.*`·`peer.delegate.*`·`peer.approval.alreadyDecided`·`peer.badge`·`peer.chatLine`·`peer.client.pickStaff`·`peer.picker.*`·`peer.attach*`·`peer.queuedCancel*`·`peer.queuedHint`. `dict/peerGuard.ts` 전체(`peer.guard.*`·`peer.report.changes*`·`peer.report.noWorkspace`) 삭제, `dict/index.ts`의 `peerGuard`·`peerSync` import·`DICT_PARTS`·`DICT`(26·46·48)에서 제거. `peer.error.pair_off`(officeHandlers:68)는 사전 확인 후 유지. `connect.device.from`·`connect.device.to` 중 '데려온 n명' 문구(`connect.ts`)도 제거. 4개 언어는 키 하나가 4개 언어를 한 줄에 담는 구조라 키 삭제로 같이 사라짐. **검사 방법:** 지운 뒤 `t('peer.…')` 호출 전부를 grep해 남은 키와 대조.

### 1-3. 남길 것과의 경계 (한 줄 규칙)
`main/peer/`에서 **'짝짓기·연결 상태·열쇠'**(`pairing`·`peerClient`·`peerTransport`·`peerRegistry`의 peer 부분·`peerStore`의 `peer` 표·`peerErrors`)만 남고, **'일·직원·결재·파일'**을 다루는 파일은 모두 삭제합니다. 나눌 때 기준은 "`PeerRecord`만 쓰는가 / `PeerJob`·`PeerStaffRecord`·`InboxJob`을 쓰는가"입니다.

## 2. 저장 데이터 처리 — "1회 정리 + 모르는 건 무시"
**원칙:** 옛 표와 옛 id는 앱 시작 때 한 번 지우고, 지우지 못한 찌꺼기를 만나도 죽지 않게 읽는 쪽은 "모르면 건너뛴다"만 지킵니다. 1.3.0 문서(`impl-design-readable.md` §7)의 "일이 끝난 뒤 정리"는 **빌려주기 UI가 이번 릴리스에서 사라지면 일을 더 진행시킬 방법이 없으므로** 조건을 "진행 중 일은 실패로 닫고 지움"으로 단순화합니다(대표 결정 '완전 삭제'와 일치).

| 데이터 | 처리 | 근거·위치 |
|---|---|---|
| DB 표 `peer_staff`·`peer_job`·`peer_outbox`·`peer_inbox`·`peer_upload`(`peerStore.ts:166`), `peer_workspace`·`peer_changeset`(`syncDb.ts:70`) | **1회 `DROP TABLE IF EXISTS`** (`db.ts:108-111` 자리의 `purgeLegacyPeerTables`) | 표가 `(id, data JSON)` 한 모양이라 지워도 다른 표와 엮임 없음. 이미 `IF NOT EXISTS`로 만들던 것이라 반복 실행해도 안전(멱등) → 별도 '실행했음' 표시 없이 매 시작 실행 가능, 가장 단순 |
| `peer` 표(`PeerRecord`) | **그대로 유지** | 워크스페이스·휴대폰 아닌 PC 연결이 쓴다. 필드 바뀜 없음 |
| 데려온 직원이 들어 있는 랩 `memberIds`('`p:`…'), 팀 `leadId`(있다면) | 시작 때 1회 `p:`로 시작하는 id를 걸러 저장 | `office.ts`가 `this.hired.get(id)`로 걸러 읽는 곳(2783·1585)은 이미 죽지 않음 → 걸러내는 것은 청소 목적. 위치: `db.ts` 랩 로드 직후(줄 확인 필요) |
| 카드 `task.assignee_id`가 `p:…` | 시작 때 1회 `UPDATE task SET assignee_id = NULL WHERE assignee_id LIKE 'p:%'` | `db.ts:267`에 같은 문장의 선례(직원 삭제 때) |
| 로그 `staffId` = `p:…` | 그대로 둠(보이지 않음, 직원 패널이 id로만 조회) | 지우면 오늘 한 일 기록이 사라질 우려 없음. 용량 문제 생기면 후속 |
| 대기 일(`peer_job` queued/sending) | 표 삭제와 함께 사라짐. A컴 화면에서 '결과 안 옴' 보고는 만들지 않음 | 보고를 만들려면 `onReport` 경로를 살려야 해 삭제 목적과 어긋남. **릴리스 노트에 "대기 중이던 일은 사라진다" 한 줄**(CHANGELOG는 버전 정할 때 정리드가 씀) |
| 파일 맞추기 결재(`Approval.peerChanges`, 메모리) | 앱 재시작 때 이미 사라짐(메모리 값). 저장된 복사본 폴더 `userData` 아래 sync 폴더는 시작 때 1회 폴더째 삭제 | 폴더 이름은 `peerSyncService.ts:34` `baseDir` 하위 — **하위 폴더명은 확인 못 함**, 구현 때 `workspaceStore.ts`·`blobStore.ts` 경로 확인 |
| B컴에 남은 수신함·피어 슬롯 | 슬롯(`peers` in `RemoteConfig`, `auth.ts:77`)은 **유지**(연결·휴대폰 열쇠) | 슬롯은 연결 열쇠이지 일 데이터가 아님 |
| 원격 설정 `RemoteConfig` | 변화 없음 | |
| 워크스페이스 목록 `userData/workspaces.json` | 변화 없음 | `peerId` 참조만(`workspaceStore.ts:27`) |

**옛 데이터를 만나도 죽지 않게 하는 방법:** (1) 정리는 앱 시작 때 `openDb()`(`main/index.ts:408`) 직후 한 곳, 실패해도 `try/catch`로 삼키고 로그만 남김. (2) 읽는 쪽에서 `p:`로 시작하는 직원 id를 마주치면 `this.hired.get(id)`가 없으니 건너뜀(이미 `filter(Boolean)` 패턴). (3) DB는 `CREATE IF NOT EXISTS`/`DROP IF EXISTS`만 써서 몇 번 시작해도 같다.

**상대 PC가 옛 버전일 때:**
- 옛 A → 새 B: 새 B에는 `/v2/peer/staff·watch·jobs·attachments·approvals`와 sync 경로가 없어 404. 옛 A의 `PeerClient`는 hello/SSE는 붙으므로 '연결됨'으로 보이고, 일 보내기·직원 목록은 오류 문구가 뜹니다(`peerErrors`). **옛 A에서 데려온 직원은 '오류/연결 끊김'으로 보일 수 있습니다** — 허용하되 릴리스 노트에 "양쪽 모두 업데이트". 영구 오류 상태(`isPermanentPeerStatus` 404, `peerProtocol.ts:214`)라 무한 재시도는 하지 않음.
- 새 A → 옛 B: 새 A는 일을 보내지 않으므로 영향 없음. 짝짓기·화면 보기 경로는 그대로.
- `PairKind` `'peer'`(`peerProtocol.ts:128`)는 **와이어 값 그대로 둠**(옛 A가 보낼 수 있어서). 새 PC 추가 창은 `'view'`만 엽니다(`service.ts:204`). 구현 때 `peerPairStart('peer')`(`PeerSection.tsx:41`)가 `'view'`로 바뀌는지 확인 필요.
- 마이그레이션 번호(스키마 버전)는 올리지 않음: 표 삭제가 멱등이라 필요 없음.

## 3. 합친 연결 카드 화면 흐름

### 3-1. 한 카드, 위에서 아래 한 줄기 (기존 `Step` 3개를 그대로 씀)
`connect/ConnectSection.tsx`를 **한 카드 안에서** 다음처럼 보이게 하고 `workspace/ConnectedPcSection.tsx`는 이 카드 아래에 이어붙입니다.
1. **① 연결 방식 고르기** (`Step n={1}`, 287) — 변화 없음.
2. **② 준비** (`Step n={2}`, 306) — 변화 없음.
3. **③ 무엇을 연결할까** (`Step n={3}`, 310): 탭 두 개 `휴대폰` / `내 다른 PC`(`target` 탭, 322-326, 이름은 `connect.target.pc` 유지).
   - 휴대폰: 지금 그대로(QR·`PhoneCode`, 346-351).
   - **내 다른 PC: 지금의 `role`(host/client) 선택과 `HostPart`·`ClientPart`·`RemoteStaffPicker`(363-383)를 지우고, 설명 한 줄 + '**PC 추가**' 버튼 하나만 둠.** 버튼은 `WorkspaceWizard`(`ConnectedPcSection.tsx:12`의 `isWizardOpen` 상태와 같은 창)를 엽니다. 입구가 하나가 됩니다.
4. **기기 목록 하나** (`DeviceList`, 439): 기존 `devicesOf`(`shared/connectModel.ts:27`)가 `phone`·`to`(내가 보여 준 기기)·`from`(내가 데려온 PC) 세 종류를 만드는데, `from` 종류는 이제 `peers`(내가 붙은 PC)이자 **워크스페이스 목록과 같은 대상**입니다. 설계: `devicesOf`는 `phone`·`to` 두 종류로 줄이고(`peers` 인자 제거, `useConnectData.ts:44` `loadPeers` 제거), **'연결한 PC' 줄은 `ConnectedPcSection`의 `Row`(38)가 이미 그리는 것을 그대로 같은 카드 아래 목록에 둠**. 즉 카드 안 순서는 `이 PC에 붙은 기기(휴대폰·보여 준 PC)` → `연결한 PC(이름·색·열기·해제)`. 두 목록을 하나로 합치지는 않습니다(한쪽은 '나를 보는 기기', 한쪽은 '내가 보는 PC'라 버튼이 다르고, 합치면 `ConnectDevice` 합집합 타입과 분기만 늘어납니다 — 단순함 우선. 대신 같은 카드 안 두 소제목).
5. `Section` 래퍼: `SettingsPage.tsx:440-448`에서 두 `Section`을 하나로 합쳐 제목은 `settingsPage.remote.title`, 안에 `<ConnectSection />` 뒤 `{!IS_REMOTE_SCREEN && <ConnectedPcSection />}`. 앵커 `SECTION_ID.workspaces`(`settingsSections.ts:7` 근처)는 **유지하고 같은 `Section`의 하위 앵커로 이동**(`requestSettingsSection(SECTION_ID.workspaces)`를 쓰는 곳이 있어 깨지지 않게, 확인 필요).
6. 휴대폰 앱의 설정(원격 화면, `IS_REMOTE_SCREEN`): '내 다른 PC' 탭은 지금도 PC 전용(`remote/install.ts:34` `workspace.remote.pcOnly`) → 변화 없음.

### 3-2. PC 추가 창 (`WorkspaceWizard`, `wizard.ts`) 변경
- `what` 단계(`wizard.ts:8-9`, `WhatStep` `WorkspaceWizard.tsx:~120`)에서 **'휴대폰으로 이 PC 보기'(phone) 카드 삭제** — 휴대폰은 첫 카드 ③의 휴대폰 탭이 하나의 입구. 겹침이 사라짐. `WizardState.what`에서 `'phone'`을 지우고, `pickWhat`·`canNext`(`wizard.ts:46`)에서 `phone` 분기 삭제, `requestSettingsSection(SECTION_ID.remote)` 이동 버튼(`WorkspaceWizard.tsx:150-160`) 삭제.
- `what`에 남는 것은 `pc`(다른 PC 화면 보기)·`host`(다른 PC가 이 PC를 보게 코드 보여 주기) 두 개. 선택지가 둘뿐이므로 **`what` 장 자체를 없애고 첫 질문을 '이 PC가 보는 쪽 / 보여 주는 쪽'으로 단순화**하는 안도 가능하지만, 4장 구조(`WIZARD_STEPS`)와 `workspace.test.mts`가 바뀌므로 **이번에는 카드 한 장 삭제만** 합니다(작게 시작).
- `ConnectStep`(`WorkspaceWizard.tsx:176`)은 그대로(이미 짝지은 PC 고르기 + `ClientPart`). `peerList`가 `staffCount`를 쓰지 않으므로 타입 변경 영향 없음.
- 사전: `workspace.wizard.what.phone*` 키 삭제(`dict/workspace.ts`), `connect.step3`·`connect.pc.which`·`peer.role.*`·`connect.pc.bothOn`·`peer.client.pickStaff`·`connect.device.from` 중 안 쓰게 된 것 삭제.

### 3-3. 새로 만들지 않는 것
새 컴포넌트·새 저장소·새 색 없음. 두 목록을 합치는 새 타입 없음. 카드 한 장 안에 기존 `Step`·`Button`·`Row`만 재배치.

## 4. 검증
- **타입검사**(`tsc`): 5개 API 표(§1-2)가 `Record<…>`라 이름 한 곳이라도 남으면 오류. 지운 파일 import가 남아 있어도 오류. 이게 가장 큰 안전망.
- **시험(`scripts/*.test.mts`)**: 삭제 6개(§1-1). **일부만 수정(확인 필요: 각 파일에서 peer 일·직원 부분 삭제)**: `peerE2E.test.mts`(608줄, 짝짓기·연결 부분만 남김), `peerRegistry.test.mts`(직원 부분 삭제), `delegation.test.mts`(`peerJobStates` 입력 삭제 — v1.3.2 팀 대기 표시 판정 함수와 겹치므로 **이 작업이 v1.3.2 마무리 뒤라는 순서가 중요**), `remote-v2.test.mts`·`remote-hardening.test.mts`(지운 메서드의 허용·거절 항목), `approvalBand.test.mts`·`pendingApprovals.test.mts`·`connectModel.test.mts`(`from` 기기·`peerChanges` 삭제), `tokenSaving.test.mts`(peer 언급 확인). **그대로 통과해야 하는 것**: `peerPairing`·`peerClient`·`peerInvite`·`workspace.test.mts`(+ wizard 'phone' 삭제 반영)·휴대폰 연결 시험.
- **새 시험 1개** `scripts/legacyPeerPurge.test.mts`: ① 옛 7개 표를 만들고 데이터를 넣은 DB에서 정리 후 표 없음, ② `peer` 표 행 그대로, ③ 한 번 더 실행해도 오류 없음(멱등), ④ `p:` 담당 카드가 `NULL`, ⑤ 랩 `memberIds`에서 `p:` id만 사라지고 로컬 직원 id 유지.
- **실제 앱 확인(맥+윈도우 둘 다 빌드, 메모리 규칙)**: ① 업데이트 전 DB(데려온 직원·대기 일 있는 것)로 앱 시작 → 오류 없이 켜짐·직원 목록 정상, ② 설정 › 연결에서 한 카드 흐름(① ② ③·기기 목록·연결한 PC), ③ ③의 '내 다른 PC' → PC 추가 창이 열림, ④ PC 추가 창에 휴대폰 카드 없음, 호스트 코드·붙여넣기 짝짓기 완료, ⑤ 휴대폰 QR 연결·해제, ⑥ 두 PC에서 새 짝짓기·해제·재연결, ⑦ 직원 카드·책상 그림·대화·업무 보드에 🌐·흐림·`peer.queued` 흔적 없음, ⑧ 옛 버전 PC와 연결했을 때 앱이 죽지 않고 오류 문구만(가능하면).
- **화면 캡처**: 합친 카드와 PC 추가 창 1~2장.

## 5. 영향이 큰 곳과 순서
영향 큰 곳 순서(위험 큰 것 먼저): ① `main/office.ts`(peer 분기 약 30곳 — 지우다가 로컬 지시 라우팅·`checkStall`·결재 처리를 건드릴 위험), ② `peerManager.ts` 슬림화(연결 상태가 워크스페이스의 '연결됨' 표시를 줌), ③ `peerRoutes.ts` 경로 정리(짝짓기 hello 회귀 위험), ④ 5개 API 표, ⑤ DB 정리(데이터 손실이 되돌릴 수 없음 — 한 번만 확인 후), ⑥ 화면.

**권장 순서 (매 단계 끝에 타입검사+시험):**
1. **v1.3.2 마무리·커밋 뒤** 시작(작업본 겹침 — `StaffCard`·`StaffRow`·`StaffPanel`·`delegation.ts`·`staffCard.ts`).
2. 화면에서 입구부터 막기: `RemoteStaffPicker`·PC 탭(③)을 'PC 추가' 버튼으로 교체 + 합친 카드 + PC 추가 창 phone 카드 삭제(§3). 이 단계만으로 사용자 눈에서 기능이 사라지고, 되돌리기 쉬움.
3. 화면의 원격 직원 표시 제거(`RemoteBadge`·`StaffPanel`·`BoardPage`·`ChatPage`·`IsoOfficeScene`·`ChangesetCard`).
4. API 표 7개 이름 삭제(5곳) + `officeHandlers.ts` 핸들러 삭제 + `types.ts` 타입.
5. `office.ts`에서 peer 분기 제거(`instructRemote`·`isRemoteStaff` 분기 → `peerPort`·`peerHostOffice`·승인 동기화 → `Origin 'peer'`).
6. `main/peer/` 일·직원·결재·파일 파일 삭제와 `peerManager`·`peerRegistry`·`peerStore`·`peerRoutes`·`service.ts`·`index.ts` 슬림화.
7. DB 1회 정리 + 시험 + 사전 키 삭제.
8. 맥+윈도우 빌드, §4 실제 앱 확인.

## 6. 하지 않을 것 / 한계
- `PeerManager` 이름 바꾸기·`main/peer/` 폴더 이름 바꾸기, `PeerSection.tsx` 파일명 바꾸기: 하지 않음(import 연쇄).
- 두 기기 목록 합치기(타입 합집합): 하지 않음(§3-1-4).
- 새 와이어 버전·`PairKind` 정리: 하지 않음. 옛 앱이 보낼 수 있어서 호환용으로 남김.
- 옛 A→새 B 연결의 우아한 안내('상대 앱을 업데이트하세요'): 오류 문구만(필요하면 새 키 1개).
- 확인 못 한 것: `redact.ts` 쓰임, sync 폴더 실제 이름, 랩 `memberIds` 저장 코드 줄, `levelUpFx.ts`·`demoStageScene.ts`의 remote 참조 줄, `SECTION_ID.workspaces` 사용처. 구현 시작 때 grep으로 한 번에 확정.
