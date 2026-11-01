# PC 간 연결 기술 설계서 (여러 PC 한 랩)

> 작성: 강백엔(백엔드) · 2026-11-01 · 상위 업무 "여러 PC 한 랩" 1/8단계
> 기준: `docs/specs/multi-pc-lab.md`(대표 결정 — 이 문서와 다르면 그쪽이 우선), `docs/specs/remote-protocol-v2.md`, `app/src/main/remote/*`, `app/src/main/office.ts`의 `delegate`·`instruct`·`decide`
> **코드는 고치지 않았다.** 이 문서가 3·4번 구현의 계약이다. 구현과 달라지면 이 문서를 먼저 고친다.
> 용어: **A컴** = 본부(평소 쓰는 맥), **B컴** = 일을 실행하는 맥, **피어(peer)** = A컴이 짝지은 B컴, **원격 직원** = B컴 직원을 A컴 화면에 보여 주는 분신, **일(job)** = A컴이 B컴에 맡긴 지시 한 건.

## 0. 설계 요약

| 결정 | 내용 |
|---|---|
| 구조 | A컴이 B컴 v2 서버의 **클라이언트**로 붙는다(`PeerClient`). B컴은 서버만 하고 A컴 쪽으로 먼저 연결하지 않는다 → B컴 방화벽·포트 설정이 필요 없고, 끊김은 항상 A컴이 감지한다 |
| 길 | 기존 `/v2/call`·`/v2/events`를 그대로 쓰고, 새 일은 `/v2/peer/*` 한 묶음으로 더한다. v1·v2 규격은 바꾸지 않고 **더하기만** 한다 |
| 신뢰 | 휴대폰과 같은 신뢰 수준(내 기기끼리)이되, **피어 토큰은 휴대폰 토큰보다 권한을 좁힌다**(8절 `peer` 범위). A컴이 뚫려도 B컴 전체 조작은 못 하게 한다 |
| 일의 주인 | 일·결재·변경 묶음의 **기록은 A컴이 갖는다**(본부). B컴은 받은 일을 실행하고 결과를 `수신함(inbox)`에 남겨 A컴이 몇 번이든 가져가게 한다 |
| 중복 방지 | 일마다 UUID `jobId`. 요청 헤더 `Idempotency-Key = jobId`이면서 B컴이 `jobId`를 **디스크에 영구 저장**해 재시작 뒤에도 같은 일을 두 번 실행하지 않는다(v2의 10분 메모리 저장소만으로는 부족, 6절) |
| 파일 | tar·zip 같은 묶음 파일 대신 **목록(manifest) + 파일별 내용(sha256 주소)** 으로 주고받는다. 경로 탈출·압축 폭탄 같은 묶음 파일 계열 공격면이 없다(7절) |

연결 그림:

```
A컴 (본부)                                                  B컴 (실행)
 ├ Office (리더, delegate)                                   ├ Office (직원 세션)
 ├ PeerRegistry  ─ 원격 직원·피어 정보(DB)                     ├ v2 서버 (기존) + peerRoutes (새)
 ├ PeerClient ──HTTPS(Tailscale)── /v2/events (SSE) ───────▶ │   EventHub: log·chat + job·approval·changes
 │            ──────────────────── /v2/peer/jobs … ────────▶ │   PeerHost: 일 수신·실행·수신함
 ├ JobQueue (연결 대기·재전송)                                 └ SyncHost: 작업 복사본·변경 묶음 (4번)
 └ SyncClient (4번): 복사본 보내기·변경 받기·반영
```

---

## 1. 짝짓기 (QR · IP+코드 · 토큰 저장 · 해제)

### 1-1. 전제와 새 요소
- B컴 설정에 **"다른 PC 연결 허용"** 을 새로 둔다. 휴대폰 연결(원격)과 같은 서버를 쓰므로 원격 기능이 켜져 있어야 한다(꺼져 있으면 함께 켜도록 안내).
- 기존 모델은 **토큰 한 개**(`AuthState.tokenHash`)다. 피어는 여러 대일 수 있고 휴대폰과 따로 끊을 수 있어야 하므로, 인증 상태를 **토큰 슬롯 목록**으로 넓힌다:

```
AuthState {
  tokenHash, revoked        // 기존: 휴대폰 슬롯 (그대로)
  peers: PeerSlot[]         // 새: { id, label, tokenHash, createdAt, lastSeenAt }  최대 8개
}
```
`AuthGuard`는 슬롯 종류(`phone` | `peer:<id>`)를 알려 주는 `AuthResult.slot`을 돌려준다. **실패 횟수 제한·IP 잠금·속도 제한은 슬롯과 무관하게 지금 그대로**(같은 `ipKey`·15분 잠금).

### 1-2. 짝짓기 창과 코드
B컴이 "다른 PC 연결" 화면을 열면 **짝짓기 창**이 열린다.

| 항목 | 값 |
|---|---|
| 유지 시간 | 5분(`QR_SHOW_MS`와 같음). 화면을 닫으면 즉시 닫힘 |
| 짝짓기 코드 | **12자 Crockford base32(약 60비트)**, 표기 `XXXX-XXXX-XXXX`(`crypto.randomInt`로 한 글자씩), **창마다 새로**, 한 번 성공하면 폐기 |
| 시도 제한 | 코드 틀림 3번이면 창이 닫히고 새 창을 열어야 함. 같은 IP는 기존 잠금 규칙(5회/15분)도 함께 |
| 화면에 보이는 것 | QR + IP:포트 + 코드 12자 + **인증서 지문 앞 8자리**("연결할 때 A컴에 같은 글자가 보이면 맞아요") |
| 로그·클립보드 | QR·코드는 화면에만. 파일·클립보드·로그에 남기지 않음(기존 QR과 같은 규칙) |

### 1-3. 두 가지 입력 방식 — 결과는 같다

**(가) QR** — B컴 화면의 QR을 A컴이 읽는다(A컴 카메라 또는 화면 캡처 이미지 불러오기). 기존 QR 형식을 확장한다:
```
{ v, host, port, spki, ts?, lan?, pv, kind:"peer", code:"7M3Q-H9XK-2VTB", name:"디자인 맥" }   // token 없음
```
QR에는 **토큰을 넣지 않고** 1회용 코드만 넣는다(휴대폰 QR은 토큰이 바로 들어 있으나, 피어는 코드를 교환해 토큰을 받는다). 맥끼리는 카메라 읽기가 번거로우므로 QR 대신 **"연결 정보 복사"(host:port+코드 한 줄)** 도 둔다 — 코드와 같은 5분 수명이라 클립보드에 남아도 곧 무효.

**(나) IP + 코드 입력** — A컴 "PC 추가"에서 `IP`(또는 Tailscale 이름)와 `코드`를 입력. 포트는 기본 47900(고급에서 변경).
- 허용 주소: Tailscale 100.64.0.0/10, 사설 IPv4(`isLanAddress`), MagicDNS `*.ts.net`. **공인 IP·그 밖의 이름은 거절**("같은 Tailscale 망의 주소만 쓸 수 있어요"). 이 검사는 입력 직후 A컴이 한다(연결 시도 전, 아무 데나 코드를 보내지 않게).

### 1-4. 교환 절차 — `POST /v2/pair/hello` → `POST /v2/pair/confirm` (인증 없음, 짝짓기 창이 열린 동안에만)

**v2 규격(2026-11-01 확정, PC↔PC와 휴대폰 `kind:"phone"` 모두 같다. 안드로이드·PC가 이 절만 보고 구현한다.)** 코드로 인증서를 묶고(채널 바인딩), 느린 키 유도로 오프라인 대입을 막고, 양쪽이 서로를 증명한다.

#### 코드 규칙
- 알파벳(Crockford base32): `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (I·L·O·U 없음). 12글자 = 60비트.
- 표기는 4글자씩 하이픈(`7M3Q-H9XK-2VTB`). **입력 정규화**: 공백·하이픈 제거 → 대문자 → `O→0`, `I→1`, `L→1` → 12글자이고 모두 알파벳 안인지 검사(아니면 `bad_code`, 연결 시도 전).
- **키 유도에 쓰는 코드는 정규화한 12글자**(하이픈 없음, ASCII/UTF-8 바이트). QR·"연결 정보 복사"에는 하이픈 표기를 넣고, 받는 쪽이 정규화한다.

#### 바이트 규격
- `nonceA`, `nonceB`: 각각 **랜덤 16바이트**, 전송은 **base64url(패딩 없음) 22글자**. 서버는 정확히 22글자 base64url인지 검사한다.
- `spkiDigest`(32바이트): 서버 인증서 SPKI DER의 SHA-256. 문자열 지문 `sha256/<base64>`의 `<base64>`(표준 base64, 패딩 포함 44글자)를 디코드한 값. 클라이언트는 **TLS에서 실제로 본 인증서**로 계산한다.
- `salt = nonceA(16B) ‖ nonceB(16B) ‖ spkiDigest(32B)` — 날바이트 이어붙임, **64바이트**.
- `K = PBKDF2-HMAC-SHA256(password = UTF8(code12), salt, iterations = 200000, dkLen = 32)`
  - Node: `crypto.pbkdf2(code12, salt, 200000, 32, 'sha256')` / 안드로이드: `SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")`, `PBEKeySpec(code12.toCharArray(), salt, 200000, 256)`.
- `clientProof = HMAC-SHA256(K, UTF8("client") ‖ salt)` (32바이트)
- `serverProof = HMAC-SHA256(K, UTF8("server") ‖ salt ‖ clientProof)` (32바이트, 클라이언트 증명을 묶어 되돌려 보내기를 막는다)
- 선에 실을 때 두 증명은 **소문자 hex 64글자**.

#### 절차
1. A: B에 TLS로 접속(이 한 번만 인증서 검증 없이). 실제로 본 서버 인증서 지문 `spkiSeen`을 기록.
2. A → `POST /v2/pair/hello` `{ clientName, nonceA }` → B가 `{ nonceB, spki(B가 아는 자기 지문), name }`. (창이 닫혀 있으면 `410 pair_closed`.)
3. A는 `spki == spkiSeen`인지 확인(다르면 중간자 → 중단, `spki_mismatch`).
4. A가 `salt`·`K`를 계산하고 → `POST /v2/pair/confirm` `{ nonceA, nonceB, clientProof, peerLabel, clientId, kind }`.
5. B는 hello에서 발급한 `nonceB`↔`nonceA` 짝인지 확인하고 같은 식으로 `K`를 계산해 `clientProof`를 `timingSafeEqual`로 비교한다. **시도 횟수는 계산 전에 먼저 센다**(동시에 여러 번 보내 3회를 넘기지 못하게). 틀리면 `401 pair_failed {remaining}`, 3번째 오답이면 창이 닫힌다. 맞으면 토큰(32바이트 base64url)을 만들어 슬롯에 **해시만** 저장하고 `{ token, slotId, peerName, serverProof }`를 응답. 코드는 즉시 폐기, 창 닫힘.
6. **A는 `serverProof`가 `HMAC(K, "server" ‖ salt ‖ clientProof)`와 같을 때만 토큰을 저장한다.** 다르면 `server_proof_mismatch`(가짜 서버 — 저장하지 않고 중단).
7. 중간자·가짜 서버는 코드를 모르니 `K`를 만들 수 없다. 코드는 선에 실리지 않는다. 오프라인으로 훔친 `hello`·`confirm` 기록(nonce·clientProof)에서 코드를 찾으려면 60비트 × PBKDF2 20만 회가 필요해 5분 안에는 불가능하다.
- 사람이 눈으로 확인하는 장치(보조): A컴 화면에 지문 앞 8자리를 보여 준다.

**테스트 벡터** (두 구현 모두 이 값이 나와야 한다)
```
code12        = 7M3QH9XK2VTB                  (표기 7M3Q-H9XK-2VTB)
nonceA(hex)   = 000102030405060708090a0b0c0d0e0f   → "AAECAwQFBgcICQoLDA0ODw"
nonceB(hex)   = 101112131415161718191a1b1c1d1e1f   → "EBESExQVFhcYGRobHB0eHw"
spkiDigest    = 0xab × 32                         → "sha256/q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s="
salt(hex)     = 000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
                abababababababababababababababababababababababababababababababab
K             = eecc54457136acf3bc7f7dd3ab4f2b95ef43be799c31e8c5423e439bcf966238
clientProof   = 1c1728fc7f1a6dc43cac178fcf2a35a51690be716a2ddf965b93704dfeb37e48
serverProof   = 65767af5031f2c8c6dc71acaafe8a2c877d53cb7a557f02a5991c1e5cf4749e9
```

### 1-5. A컴 저장
- 테이블 `peer`(DB, 3번 소유) 한 줄: `{ id, name, host, port, spki, pairedAt, lastSeenAt, lastHost }` + 토큰.
- **토큰은 DB에 평문으로 두지 않는다.** `remote/keystore.ts`와 같은 방식(운영체제 키체인 `safeStorage` 암호화, 파일 0600)으로 `userData/peers/<peerId>.token.enc`에 저장. 암호화를 못 쓰는 환경이면 0600 평문 + 화면 경고(키 저장과 같은 규칙).
- 읽지 못하면 `unreadable` → 그 피어를 "다시 짝짓기 필요" 상태로 표시(토큰을 몰래 새로 만들지 않는다).
- 주소가 바뀌는 경우(Tailscale IP는 고정이지만 LAN은 바뀜): `hello` 답의 `lan/tsHost`로 `lastHost`를 갱신(기존 앱의 자동 주소 고치기와 같은 방식). **인증서 지문(`spki`)은 고정** — 지문이 바뀌면 연결을 거부하고 "B컴 인증서가 바뀌었어요. 다시 짝지어 주세요".

### 1-6. 해제
| 누가 | 동작 | 효과 |
|---|---|---|
| A컴에서 "연결 끊기" | `POST /v2/peer/unpair`(마지막 호출, 실패해도 진행) → A컴 토큰 파일·`peer` 행 삭제, 원격 직원은 랩에서 빠지고 진행 중 일은 "취소됨"으로 닫음 | B컴 슬롯도 삭제되면 즉시 불가 |
| B컴에서 "이 PC 연결 해제" | 슬롯 삭제 → 해당 토큰의 SSE에 `bye(token_revoked)`, 다음 요청 `401 token_revoked` | A컴은 "B컴이 연결을 해제했어요" 표시, 재연결 시도 중단(`426`·`token_revoked`는 재연결하지 않는 v2 규칙 그대로) |
| 휴대폰 QR 재발급 | **피어에 영향 없음**(슬롯이 달라서) | 휴대폰만 끊김 |
| 원격 기능 끄기 | v2 서버가 닫히므로 모든 슬롯이 끊김 | A컴은 "B컴 원격이 꺼졌어요" |

해제 뒤 이미 B컴이 받은 일은 B컴에서 취소하고(`bye` 직전 정리), 작업 복사본은 7일 뒤 삭제(7-6).

---

## 2. 원격 직원의 표현 (A컴 DB)

### 2-1. 저장
`staff` 테이블에는 **넣지 않는다**(세션·작업 폴더·sessionId 같은 "이 PC에서 도는 직원" 전제가 깔려 있어서 가짜 행이 오동작을 만든다). 별도 테이블:

```
peer         (id TEXT PK, data JSON, paired_at)                     -- 1-5
peer_staff   (id TEXT PK, peer_id, remote_id, data JSON, added_at)  -- 랩에 넣은 원격 직원
```
- `peer_staff.id` = **`p:<peerId>:<remoteStaffId>`** (로컬 직원 uuid와 절대 겹치지 않는 접두사). 이 id가 `Lab.memberIds`에 들어간다(랩은 A컴 DB 그대로).
- `data`(캐시): `{ name, role, avatar, provider, model, lastKnownStatus, lastSeenAt }` — B컴이 `GET /v2/peer/staff`로 준 **얇은 목록**에서만 채운다. B컴 `systemPrompt`·`cwd`·`refDocs`·장비 설정은 받지 않는다(A컴에 B컴 폴더 구조를 알리지 않는다).
- 같은 B컴 직원을 두 번 넣을 수 없다(`UNIQUE(peer_id, remote_id)`).
- B컴에서 직원이 해고되면 목록에서 사라짐 → A컴이 `peer_staff`를 "B컴에서 사라진 직원"으로 표시하고 랩에서 자동으로 빼지는 않는다(대표가 확인, 진행 중 일은 실패 처리).

### 2-2. 화면에 보내는 모양
`OfficeSnapshot.staff`에 원격 직원도 `Staff`로 **합쳐 내보낸다**(지도·랩 화면이 한 목록을 그대로 쓰도록). 새 선택 필드 하나만 더한다:

```
Staff.remote?: { peerId: string; peerName: string; state: 'online' | 'connecting' | 'offline' | 'unpaired' }
```
- 필드가 없으면 로컬 직원(옛 화면·모바일은 무시하면 됨 — 모르는 필드 무시 규칙).
- 합성 값: `kind`는 기존 값 중 하나(`'internal'` 상당)로, `status`는 B컴 snapshot의 같은 직원 상태를 그대로(오프라인이면 `'idle'`로 두되 화면은 `remote.state`를 보고 회색), `cwd`는 빈 값, `approvals`는 5절의 중계 결재.
- 연결 상태 `state`는 **메모리 값**이다(DB에 저장 안 함): `PeerClient`의 SSE 상태에서 나온다.
  - `online`: SSE `hello` 받고 `snapshot` 도착
  - `connecting`: 재연결 중 8초 이내(화면은 깜빡임 없이 유지)
  - `offline`: 8초 넘게 못 붙음 → **회색**. 큐에 일이 있으면 "연결 대기 N건"
  - `unpaired`: 토큰 폐기·인증서 불일치 → 회색 + "다시 짝짓기"
- `snapshot`은 연결 상태가 바뀌어도 `scheduleEmit()`으로 그대로 나간다(500ms 묶기 규칙 유지).

### 2-3. 로컬 직원 코드에 닿는 곳(최소 갈고리)
원격 직원은 `Office.hired`(로컬 직원 맵)에 넣지 않으므로, `office.ts`에서 아래 **다섯 줄 안팎의 갈고리**만 3번이 추가한다(9절 소유 표):
1. `delegatesOf()` — 랩 `memberIds`에서 `p:`로 시작하는 id는 `peerRegistry.staffOf(id)`로 찾아 후보에 포함.
2. `delegate` 도구 — 대상이 원격이면 `this.instruct` 대신 `peerDispatch(target, instruction, origin)`.
3. `instruct()` 맨 앞 — 대표가 원격 직원에게 직접 지시(대화창)한 경우도 `p:` id면 같은 곳으로.
4. `decide()` / `approveAlways()` — `p:` 결재 id면 `approvalRelay.decide(...)`.
5. 업무 완료 처리(1243줄 부근 `o.kind === 'delegate'`) — 원격 일의 완료는 `jobQueue.onResult`가 같은 `memberReport` 경로로 리더에게 돌려준다(3절).

---

## 3. delegate를 B컴으로 보내기 + [팀원 보고] 회수

### 3-1. A컴 일 테이블 (A컴 DB, 3번)
```
peer_job (
  id TEXT PK              -- jobId (UUID v4)
  peer_id, remote_staff_id, lead_id, room, is_autonomous,
  instruction TEXT,       -- 리더가 준 지시 원문 (최대 20,000자)
  workspace_id TEXT NULL, -- 복사본을 보냈으면 (4번 소유 id)
  state TEXT,             -- 3-3 상태
  attempts INT, next_try_at, created_at, sent_at, finished_at,
  result TEXT NULL,       -- 보고 원문 (TASK_RESULT_MAX 20,000자로 자름)
  error TEXT NULL
)
```
리더 id·방(`room`)·자율 여부는 로컬 `Origin { kind:'delegate', leadId, room, isAutonomous }`와 같은 값을 **A컴이 저장**한다 → 결과가 돌아올 때 A컴이 그대로 `[팀원 보고]`를 만든다. B컴은 리더가 누구인지 몰라도 된다.

### 3-2. 보내는 호출
`delegate` 도구가 불리면(대상이 원격 직원):
1. A컴은 `peer_job`에 `state='queued'`로 **먼저 저장**하고(저장 뒤에만 도구가 "맡겼어요"로 답한다), 리더 로그·채팅은 로컬 delegate와 똑같이 남긴다(`log.delegate`, `@이름 지시`).
2. `JobQueue`가 보낸다 — `POST /v2/peer/jobs`
```
Authorization: Bearer <peer token>
Idempotency-Key: <jobId>
{ "jobId", "staffId": <remoteStaffId>, "instruction", "lead": { "name", "role" },
  "lab": { "name", "goal" }, "workspaceId"?: "…", "isAutonomous": false }
```
3. B컴 `PeerHost`가 `jobId`를 `peer_inbox`(B컴 DB, 영구)에 넣고 `202 { jobId, state:'accepted' }`. 같은 `jobId`가 이미 있으면 **새로 만들지 않고 현재 상태를 그대로** 돌려준다(6절).
4. B컴은 일을 `Office.instruct(target, text, { kind:'peer', jobId })`로 실행한다. 지시문은 로컬 delegate와 같은 `staff.msg.delegated` 문구 틀(리더 이름·역할 포함)을 쓴다. 새 `Origin.kind:'peer'`는 B컴 쪽 완료 처리에서 `peerHost.finish(jobId, summary)`를 부른다.
5. B컴이 완료하면 `peer_inbox`에 `done + result`를 저장하고 SSE `job` 이벤트를 보낸다.

### 3-3. 일 상태 (A컴 기준)
```
queued ─▶ sending ─▶ accepted ─▶ running ─▶ done
   │         │                      │         ├▶ failed
   │         └ (실패·끊김) ─▶ queued │         └▶ canceled
   └ 연결 없음이 8초↑ → 화면 라벨 "연결 대기"
```
- 화면 라벨 `연결 대기`는 상태 `queued`이면서 피어가 `offline`일 때(2-2). 상태값 자체는 `queued` 하나.
- `running`의 세부(말하는 중·도구 쓰는 중)는 직원 상태(`Staff.status`)가 보여 준다. 일 상태는 큰 단계만.
- 취소: A컴 "취소" → `queued`면 로컬에서 바로 `canceled`, `accepted/running`이면 `POST /v2/peer/jobs/{id}/cancel`(B컴이 해당 세션을 중단, 결과는 `canceled`). 취소가 B컴에 못 닿으면 `cancel` 요청도 큐에 둔다(6절).

### 3-4. 결과 회수와 [팀원 보고]
- **빠른 길**: SSE `job` 이벤트 `{ jobId, state, result?, summary?, changesetId? }`.
- **확실한 길**: 연결(재연결 포함)마다 A컴이 `GET /v2/peer/jobs?ids=<미완료 jobId 목록>`로 **미완료 일 상태를 일괄 조회**해 이벤트를 놓친 일을 따라잡는다(SSE `Last-Event-ID` 보관은 5분·500개뿐이라 그 이상 끊겼던 동안의 결과는 이 조회로만 얻는다).
- `done`을 받으면 A컴은 `peer_job`에 `result` 저장 → **같은 [팀원 보고] 경로**를 탄다:
  `instruct(leadId, t('staff.msg.memberReport', { name, role, text }), { kind:'user', room, isAutonomous })` — 로컬 직원 일과 문구·XP·알림이 동일(`name`·`role`은 `peer_staff`에서).
- 결과를 A컴이 확실히 처리한 뒤 `POST /v2/peer/jobs/{id}/ack` — B컴은 ack 받은 일의 `result`를 30일 뒤 삭제(ack가 없어도 30일 보관, 4번의 `changeset`은 이보다 짧게, 7-6).
- 보고 본문은 **B컴 쪽에서 쓴 글**이므로 A컴 리더에게 갈 때 길이를 `TASK_RESULT_MAX`로 자르고 앞에 `[원격: <피어 이름>]` 표시를 붙인다(10절 프롬프트 주입 대책).
- 파일을 고친 일이면 `done` 이벤트에 `changesetId`가 실리고, A컴이 변경 묶음을 받아 결재 카드를 만든 **뒤에** [팀원 보고]를 낸다(카드 안내 문구를 보고에 한 줄 덧붙임: "파일 N개 변경은 결재함에서 확인해 주세요").

### 3-5. 대표가 원격 직원에게 직접 지시
대화창에서 원격 직원에게 말하면 `delegate` 없이도 같은 `peer_job`으로 가고(`lead_id`는 null), 완료 보고는 로컬 직원의 "대표에게 올린 보고"와 같은 알림·안 읽음 표시를 쓴다.

### 3-6. 첨부(이미지·파일) 보내기
대표가 원격 직원에게 직접 지시할 때 붙인 첨부를 일과 함께 보낸다(리더의 `delegate` 도구는 첨부가 없다).
- **한도**(`PEER_LIMITS`): 파일당 `attachmentMax` 20MB(휴대폰 `V2_UPLOAD_MAX`와 같다), 일 하나에 `attachmentsPerJob` 5개.
- **A컴 저장**: `PeerJob.attachments: { path, name, mime, remoteId?, dropped? }[]` — A컴 첨부 폴더의 파일. 6번째부터는 저장할 때 `dropped:'too_many'`.
- **올리기** — 일을 보내기 직전(복사본 준비 뒤) 첨부를 하나씩:
```
PUT /v2/peer/attachments
Authorization: Bearer <peer token>
Content-Length: <바이트 수>            -- 필수 (없으면 411 length_required)
Content-Type: <mime>                   -- 확장자가 우선, 확장자로 모를 때만 이 값(형식이 맞을 때만)
X-File-Name: <URI 인코딩한 파일 이름>   -- 200자까지
<바이트>
→ 201 { attachment: { id, name, mime, size } }   -- B컴 경로는 싣지 않는다
```
  B컴은 휴대폰 올리기와 같은 `saveUpload`로 첨부 저장소에 넣고 `peer_upload`(B컴 DB, `{ id, slotId, attachment, createdAt }`)에 **올린 슬롯**을 적는다. 길이가 20MB를 넘으면 본문을 읽기 전에 `413 payload_too_large`(연결 닫음). 디스크가 가득 차면 `507`. 슬롯마다 아직 일에 쓰이지 않은 첨부가 `uploadsPendingMax`(20개)·`uploadsPendingBytesMax`(200MB)를 넘으면 `413 upload_quota_exceeded`(A컴은 그 첨부만 빼고 보낸다). 본문을 읽지 않고 거절하는 경우(토큰 범위 밖·잘못된 메서드 포함)는 연결을 닫는다.
- 받은 id는 `remoteId`로 A컴 일에 저장한다 → 재시도 때 이미 올린 것은 다시 올리지 않는다. 파일이 사라졌으면 `dropped:'missing'`, 20MB 초과면 `'too_large'`, B컴이 영구히 거절하면(400·401·403·404·410·411·413·415·422 — 예전 B컴은 404) `'rejected'`로 **그 첨부만 빼고** 일을 보낸다. 네트워크 오류·429·5xx는 일 전체를 기존 재시도 흐름(`retryMs`)에 맡긴다.
- **일 요청**: `POST /v2/peer/jobs` 본문에 `attachmentIds?: string[]`(올린 B컴 id, 최대 5개 — 넘으면 `400 invalid_request` `too_many_attachments`). 뺀 첨부가 있으면 A컴이 지시 끝에 `peer.report.attachDropped`(빠진 파일 이름) 안내를 붙인다.
- **B컴 수락**: `PeerHost.accept`는 **그 슬롯이 올린 id만** `InboxJob.attachments`(B컴 `Attachment[]`)로 붙이고, 다른 슬롯의 id·모르는 id는 버리고 개수를 `InboxJob.droppedAttachments`에 남긴다. `startJob`은 그 수가 있으면 지시 끝에 `peer.attachMissing` 안내를 붙이고, 첨부를 `Office.instruct(…, attachments)`로 직원에게 넘긴다.
- **알림**: A컴은 지시할 때 개수·크기 한도를 넘는 첨부를 바로 직원 로그에 `peer.attachSkipped`로 알리고, 일이 끝난 보고에도 못 보낸 첨부를 `peer.report.attachFailed`로 덧붙인다.
- **정리**: 일에 붙은 첨부는 `peer_upload.usedBy`에 그 일 id를 적는다. 기록은 `attachmentKeepMs`(48시간, A컴 큐 수명의 두 배) 뒤 또는 슬롯 해제 때 지우고, 이때 **일에 쓰이지 않은 첨부는 파일도 지운다**(응답 유실·취소로 남은 파일이 쌓이지 않게). 일에 쓰인 파일은 받은 일·로그가 가리키므로 남긴다.

---

## 4. 실시간 진행 — SSE 중계

### 4-1. 연결
A컴 `PeerClient`가 피어마다 **`GET /v2/events` 한 개**를 유지(재연결 규칙·35초 무수신 판정·`Last-Event-ID`는 v2 8-4절 그대로, 지연 1·2·4·8·16·30초 ±20%). 기존 `X-Office-Capabilities: iso-office`를 보내 회사 레벨을 줄이지 않는다.

### 4-2. B컴이 보내는 이벤트
기존 5종(`snapshot`·`log`·`chat`·`focus`·`remoteStatus`)에 **새 이름만 더한다**(모르는 이벤트는 무시하는 v2 규칙이라 휴대폰 앱에 영향 없음). 새 이벤트는 **피어 슬롯 연결에만** 보낸다(휴대폰에 안 나감).

| event | data | 용도 |
|---|---|---|
| `job` | `{ jobId, state, result?, error?, changesetId? }` | 일 상태·결과(3절) |
| `approval` | `{ jobId, approvalId, staffId, toolName, summary, summaryI18n?, createdAt, questions? }` / `{ approvalId, gone:true }` | 결재 중계(5절) |
| `changes` | `{ jobId, changesetId, files, bytes }` | 변경 묶음이 준비됨(7절) |

- `snapshot`은 B컴 전체가 아니라 **피어용으로 줄인 모양**으로 보낸다: 원격 직원으로 **고른 직원만** `{id, name, role, avatar, status, thought?}`. 선택은 A컴이 `POST /v2/peer/watch { staffIds }`로 알려 준다(고르지 않은 직원의 활동은 A컴으로 안 흐른다). 서버 쪽 사영 함수(`peerSnapshotShape`)가 필드를 **허용 목록으로** 만든다(`V2_FIELDS` 방식).
- `log`·`chat`: 관찰 중인 직원의 것만 보낸다. 로그 본문은 이미 `Attachment.path` 제거 규칙(`stripAttachmentPaths`)을 거친다.

### 4-3. A컴 반영
- `snapshot.staff[i]` → `peer_staff.data.lastKnownStatus`와 `Staff.status`.
- `log` → A컴 로그에 `staffId = p:<peerId>:<remoteId>`로 저장(활동 기록·대화 진행이 내 직원처럼 보임). 같은 이벤트가 재연결로 두 번 오지 않도록 `(peerId, epoch:n)`을 기억해 중복을 버린다. **XP·경제 보상은 A컴에서 올리지 않는다**(열린 항목 O-6).
- `chat` → 원격 직원이 말한 글을 같은 방(`room`)에 `postChat(sender=<직원>)`로.
- 끊기면 직원은 회색(2-2)이고, 다시 붙은 뒤 `hello.resync:true`면 A컴이 `chatHistory`·`timeline`을 부르지 않고 `GET /v2/peer/jobs`로 일만 따라잡는다(대화 로그는 빈 구간을 허용 — 표시용이라서).

### 4-4. 한도(기존 숫자 조정)
- 현재 SSE: 토큰당 2개, **서버 전체 4개**. 휴대폰 1~2 + 피어 N이 4를 쉽게 넘는다 → 서버 전체를 **8개**로, **피어 슬롯은 슬롯당 1개**(새 연결이 오면 옛 연결에 `bye(replaced)`)로 올린다. `SSE_LIMITS.total` 하나를 3번이 바꾼다(`events.ts`의 한 줄 + 테스트).

---

## 5. 결재 중계

### 5-1. 원칙
- **결재 장소는 A컴 하나**: B컴의 피어 일에서 생긴 결재는 B컴 화면에서도 보이지만 B컴의 **자동 승인 경로를 끈다**(5-4). 모든 승인은 A컴에서 온 `decide` 한 길로만 풀린다. 단, B컴 대표가 B컴 앞에서 직접 눌러도 되도록 B컴 화면의 수동 버튼은 그대로 둔다(같은 사람의 PC — 먼저 누른 쪽이 이김).
- 결재는 **jobId에 묶인다**: A컴이 만들지 않은 일의 결재는 A컴이 받지 않는다(10절).

### 5-2. B → A 흐름
1. B컴 직원이 도구 승인이 필요해 `Approval`이 생기면, `Origin.kind==='peer'`인 일의 승인이면 `PeerHost`가 SSE `approval` 이벤트를 만든다(원문은 `Approval` 그대로: `toolName`, `summary`, `summaryI18n`, `questions`; **`alwaysRule`은 싣지 않는다** — 원격에서 "항상 승인" 규칙을 B컴에 만들지 못하게).
2. A컴 `ApprovalRelay`가 받아 로컬 결재 목록에 **`p:<peerId>:<approvalId>`** 로 올린다(직원은 원격 직원, 지도 말풍선·결재함·메뉴바 알림은 로컬 결재와 똑같이 뜸. 제목에 `[원격: 피어명]`).
3. A컴 대표가 승인/거절 → `decide('p:…', allow)` → 갈고리(2-3 ④) → `ApprovalRelay.decide`.
4. `POST /v2/call { method:'decide', args:[approvalId, allow] }` + `Idempotency-Key: appr:<approvalId>:<allow>`. 피어 범위는 이 메서드를 **피어 일의 결재에 한해서만** 허용한다(8절).
5. B컴이 `decide`를 적용하면 직원 세션이 이어지고, `approval { approvalId, gone:true }`가 나가 A컴 목록에서 사라진다.
- 질문(AskUserQuestion) 결재도 같은 경로: `questions`를 그대로 중계, 답은 `answerQuestion`(피어 범위 허용, 같은 jobId 제한).

### 5-3. 끊겼을 때·두 곳에서 눌렀을 때
| 상황 | 동작 |
|---|---|
| 결재 요청이 올 때 A가 끊겨 있음 | B컴 직원은 **그대로 기다린다**(결재 대기 — 로컬 결재와 같은 취급). A가 다시 붙으면 연결 직후 B컴이 **미결재 목록 전체를 `approval` 이벤트로 다시 보낸다**(`GET /v2/peer/approvals`도 제공, 재연결마다 A컴이 대조) |
| A가 누른 뒤 전달 전에 끊김 | 결정은 A컴 `peer_outbox`(DB)에 남고 연결 대기 표시("전달 대기"). 연결되면 재전송(6절) |
| B컴 앞에서 먼저 눌렀음 | `decide`가 `false` → 응답 `{ ok:true, result:false, alreadyDecided:true }` → A컴은 카드를 "B컴에서 이미 처리됨"으로 닫는다 |
| 일이 취소·해제로 사라짐 | B컴이 `approval gone` 전송, A컴 카드 제거 |
| 결재 만료 | 로컬 결재와 같은 규칙. 별도 만료는 두지 않는다(열린 항목 O-4) |

### 5-4. B컴에서 끄는 자동 경로
피어 일(`Origin.kind==='peer'`)로 시작된 세션에서는 B컴의 다음을 **적용하지 않는다**: ① 직원 `approvalMode`의 자동 승인(파일 수정 자동 등), ② "앞으로 항상 승인" 규칙, ③ 자동결재(대표 부재 중). 항상 `ask`로 올려 A컴으로 보낸다. A컴에서는 A컴의 자동결재·규칙이 **로컬 결재와 똑같이** 중계 결재에도 적용된다(대표 설정 하나로 일관). 휴대폰 원격과 같은 안전장치로, A컴에서 "항상 승인" 규칙을 만들 때 Bash 규칙은 막는다(`isRemoteRuleBlocked` 재사용).

---

## 6. 연결 대기 큐와 재전송 (Idempotency-Key)

### 6-1. 큐
- A컴 `JobQueue`가 `peer_job`(state `queued`)과 `peer_outbox`(결재 결정·취소·ack — 같은 "보낼 것" 한 목록)를 **원격 직원별 순서대로**(FIFO) 처리한다. 같은 직원에게 간 일은 앞 일이 `accepted`가 된 뒤에 다음을 보낸다(순서 보장; 동시에 몇 건이 `running`일지는 B컴 직원 큐가 정한다 — 로컬 `taskQueue`와 같은 규칙).
- 보내기 시도: 피어가 `online`이 될 때 즉시, 그 외엔 `offline` 동안 **30초마다 한 번 연결 확인**(SSE 재연결 지연이 같은 역할을 하므로 별도 타이머는 SSE `open`에 트리거).
- 실패 처리: 네트워크 오류·5xx·`429`·`409 in_progress` → 지연 후 재시도(1·2·4·8·16·30초, 이후 30초). `400/403/404`(일 자체가 틀림)·`401 token_revoked` → 재시도하지 않고 `failed`(이유 표시). 최대 시도 횟수는 두지 않되 **큐 수명 24시간**을 넘기면 `failed(expired)`로 닫고 리더에게 [팀원 보고]로 "연결이 안 돼 못 보냈어요"를 알린다(열린 항목 O-3).
- 한도: 피어당 큐 대기 **50건**, 넘으면 `delegate`가 "대기 일이 너무 많아요" 도구 오류. 지시 길이 20,000자, 일 하나의 복사본은 7절 한도.
- 앱 재시작: `peer_job`·`peer_outbox`가 DB에 있으므로 시작 때 `sending`이던 일은 `queued`로 되돌려 다시 보낸다(안전한 이유는 6-2).

### 6-2. 두 번 보내지 않는 법 (3중)
1. **요청 헤더** `Idempotency-Key: <jobId>` — 기존 v2 규칙(같은 (토큰,키) 10분간 한 번만, 저장한 응답 재생, 다른 본문이면 `400`).
2. **영구 수신함** — B컴 `peer_inbox`가 `jobId`를 **기본키**로 저장한다. v2의 저장소는 메모리·10분이라 B컴이 재시작했거나 A컴이 몇 시간 뒤 다시 보내면 통하지 않는다. 이 때는 `jobId`로 조회해 **이미 있으면 새 일을 만들지 않고 현재 상태를 `200`으로 돌려준다**(`state`가 `running`·`done`이어도). A컴은 그 응답으로 상태를 맞춘다.
3. **A컴 상태 기록** — `sending`에서 응답을 못 받고 끊겨도 `queued`로 돌아가 같은 `jobId`로 다시 보내므로 새 jobId를 만들 일이 없다. 사람이 "다시 보내기"를 눌러 **새 일을 만들 때만** 새 jobId.
- 같은 방식을 `decide`(`appr:<id>:<allow>`)·`cancel`·`ack`에도 쓴다. 이 세 호출은 본래 몇 번 불러도 결과가 같다(결재가 이미 풀렸으면 `alreadyDecided`).
- `peer_inbox` 보관: 완료 후 30일(ack 이후), ack 안 된 일은 90일. 크기는 행당 결과 20KB 안이라 무시할 수준.

---

## 7. 파일 복사본과 변경 묶음 (4번 담당 범위)

대표 결정: 일 시작 때 A컴 작업 폴더를 B컴으로 옮기고, 끝나면 **바뀐 부분만** A컴으로 돌아와 결재 카드가 되며, 승인하면 반영, 충돌은 덮어쓰지 않는다.

### 7-1. 형식 — 목록 + 파일별 내용 (묶음 파일 없음)
```
Manifest  { workspaceId, rootName, createdAt, rev: sha256(정렬된 entries 직렬화), entries: Entry[] }
Entry     { path, size, sha256, exec: boolean }          // 일반 파일만. 폴더는 path로 암시
ChangeSet { changesetId, workspaceId, baseRev, jobId, changes: Change[] }
Change    { op: 'add'|'modify'|'delete', path, size?, sha256?, baseSha256?, exec? }
```
- `path`는 **작업 폴더 기준 상대 경로, `/` 구분, NFC 정규화**. 이름이 달라 보이는 두 파일(NFC/NFD, 대소문자)이 맥에서 같은 파일이 되는 문제 때문에 정규화 비교키(`NFC+소문자`)가 **중복이면 거절**한다.
- 내용은 sha256 주소로 따로 올린다: 
  - 보내기: `POST /v2/peer/workspaces { manifest }` → `{ missing: [sha256…] }` → `PUT /v2/peer/blobs/{sha256}`(파일 하나씩, 바이트 그대로, 본문 sha256을 서버가 다시 계산해 주소와 다르면 거절) → `POST /v2/peer/workspaces/{id}/commit`. 이미 있는 내용은 다시 안 올린다(두 번째 일부터 빠름).
  - 받기: `GET /v2/peer/changesets/{id}` → 변경 목록, `GET /v2/peer/blobs/{sha256}`.
- 끊겨도 이어 받을 수 있다(blob이 파일 단위·주소 기반이라 같은 `missing` 계산으로 이어 감).
- **왜 tar/zip이 아닌가**: 압축 해제 시 경로 탈출(`../`)·심볼릭 링크·압축 폭탄·중복 이름 같은 공격을 해제기가 막아 줘야 하는데, 목록 방식은 모든 경로를 우리 코드가 한 곳(`pathPolicy`)에서 검사하고 바이트는 해시로 검증한다.

### 7-2. 크기 한도 (초기값 — 구현·QA 중 조정하면 이 문서도 고친다)
| 항목 | 한도 | 넘으면 |
|---|---|---|
| 파일 하나 | 20MB (기존 `V2_UPLOAD_MAX`) | 그 파일을 복사본에서 제외하고 "큰 파일 N개 제외" 안내(변경 묶음에서는 해당 변경 거절) |
| 복사본 총량 | 500MB | 일 시작 전에 A컴이 막고 "폴더가 커요. 일부 폴더만 보내거나 제외할 폴더를 정해 주세요" |
| 파일 수 | 20,000개 | 같음 |
| 변경 묶음 총량 / 파일 수 | 200MB / 2,000개 | `failed(changes_too_large)` + B컴 결과 텍스트에는 요약만 (파일은 B컴에 7일 보관, 대표가 B컴에서 직접 확인) |
| 목록(manifest) JSON | 4MB | 위 파일 수 한도로 자연히 막힘 |
| 동시 올리기/받기 | 4개 | 대기 |
- 전송 시간 상한: blob 하나 5분(느린 회선 대비), 전체 일 시작 전 복사 30분.

### 7-3. 복사본에서 빼는 것 (기본 제외)
`.git/`, `node_modules/`, `dist/`·`build/`·`.next/`·`target/`·`.venv/`·`__pycache__/`·`.DS_Store`, 비밀로 보이는 파일(`.env*`, `*.pem`, `*.key`, `id_rsa*`, `.npmrc`, `.aws/`, `.ssh/`, `credentials*`). 빠진 목록은 일 시작 전에 **한 줄 요약**("제외: .git, node_modules 외 3개")으로 보여 주고, 대표가 폴더·패턴을 더하거나 뺄 수 있다(빼기는 비밀 항목에는 허용하지 않음 — 열린 항목 O-7). `.gitignore`는 참고만 하고 신뢰하지 않는다(제외의 기준은 위 고정 목록 + 대표 설정).
- `.git`을 보내지 않으므로 B컴 직원은 git 이력을 못 보고 `git commit`을 못 한다(대표 결정: "git을 몰라도 된다"). B컴에서 git이 꼭 필요한 일(배포 등)은 복사본 대신 B컴 자체 폴더로 지시하는 일 종류로 구분한다 → **일마다 `workspace: 'copy' | 'none'`**. 기본: 랩에 폴더가 있고 대표가 "파일 포함"을 켠 랩이면 `copy`(열린 항목 O-1).

### 7-4. B컴 쪽 (일 실행 중)
- 복사본은 `userData/peer-workspaces/<workspaceId>/` 아래에만 쓴다. 직원 세션의 `cwd`를 이 폴더로 **그 일에 한해** 바꾼다(`Origin.kind:'peer'`가 `cwdOverride`를 갖고, 평소 직원 cwd는 그대로).
- 일이 끝나면 `collectChanges`: 복사본 폴더를 `lstat`로 훑어(심볼릭 링크 따라가지 않음) manifest와 해시를 비교해 `add/modify/delete`를 만든다. **심볼릭 링크·소켓·특수 파일이 하나라도 있으면** 그 항목은 변경 목록에 넣지 않고 `skipped: [{path, reason}]`로 기록(숨기지 않고 카드에 표시).
- B컴 직원이 복사본 폴더 밖을 건드리는 것은 이 설계가 막지 못한다(기존 도구 승인이 막는다 — 5절 결재). 변경 묶음에는 복사본 폴더 안만 들어간다.

### 7-5. A컴 쪽 — 받기·카드·반영

**받기** (`SyncClient.fetchChangeSet`): 목록을 받고 → 모든 `path`를 `pathPolicy.check`로 검사(7-6) → blob을 받으며 **sha256을 다시 계산**해 목록과 다르면 전체 거절 → 임시 폴더 `userData/peer-staging/<changesetId>/`에 보관(A컴 프로젝트 폴더에는 아직 아무것도 쓰지 않음).

**결재 카드**: 기존 `Approval` 한 종류를 더한다(`toolName:'PeerChanges'`, 카드 본문은 4번이 만든다): 파일 목록(추가/수정/삭제 아이콘, 크기), 텍스트 파일은 줄 단위 diff(`shared/textDiff.ts` 재사용), 충돌·민감 경로 경고, 제외·건너뜀 목록. 선택지: **전체 반영 / 파일별 선택 / 거절**. 카드가 열릴 때(그리고 승인 직전에 다시) 충돌 판정을 한다.

**충돌 판정** — 판정 기준은 "복사본을 만든 시점의 A컴 파일 해시"(`entries[].sha256`, A컴 DB `peer_workspace`에 manifest를 저장)와 "지금 A컴 파일":
| 변경 | A컴 지금 상태 | 결과 |
|---|---|---|
| modify (base=X → Y) | 지금 = X | 반영 |
| modify | 지금 = Y (이미 같음) | 건너뜀(이미 반영됨으로 표시) |
| modify | 지금 = 그 밖 | **충돌** |
| modify | 파일 없음 | **충돌** (A컴에서 지워짐) |
| add (Y) | 파일 없음 | 반영 |
| add | 지금 = Y | 건너뜀 |
| add | 지금 = 다른 내용 | **충돌** |
| delete (base=X) | 지금 = X | 반영 |
| delete | 지금 ≠ X(수정됨) | **충돌** |
| delete | 이미 없음 | 건너뜀 |
- 이름 변경은 delete + add로 본다. 이 판정은 **파일 단위**이고 내용 병합(줄 단위 3-way)은 하지 않는다(범위 밖, 열린 항목 O-8).
- 충돌이 나면 **A컴 파일을 덮어쓰지 않는다.** B컴 버전은 `userData/peer-conflicts/<changesetId>/<path>`에 보관하고(대표가 "열어 보기·A컴 것으로 두기·B컴 것으로 바꾸기"를 파일별로 고를 수 있게), 충돌이 아닌 파일만 반영한다(대표가 "충돌이 없는 것만" 적용을 선택한 경우). 기본 선택은 **충돌이 하나라도 있으면 전체 보류**("먼저 확인해 주세요") — 반쪽 반영으로 코드가 깨지는 일을 막기 위함. 리더에게 가는 [팀원 보고]에도 "충돌 N개"가 한 줄 들어간다.

**반영(쓰기)** — 3단계로 안전하게:
1. 모든 대상 경로를 한 번 더 검사하고(`pathPolicy`) 충돌을 다시 판정(카드를 연 뒤 A컴 파일이 또 바뀌었을 수 있어서).
2. 되돌리기용으로 바뀔 A컴 파일의 현재 내용을 `userData/peer-undo/<changesetId>/`에 복사(7일).
3. 파일마다 **같은 폴더의 임시 파일에 쓰고 `rename`** 으로 교체(중간에 죽어도 반쯤 쓴 파일이 남지 않음). 하나라도 실패하면 이미 쓴 것을 undo 복사본으로 되돌리고 `failed`. 완료 뒤 파일 권한은 `0644`/`0755`(exec 비트만 옮기고 setuid·setgid·sticky는 항상 버림).

### 7-6. 금지 경로와 방어 (`pathPolicy`, B컴·A컴 양쪽이 같은 함수를 쓴다)
다음 중 하나라도 걸리면 **그 변경이 아니라 변경 묶음 전체를 거절**한다(한 줄이라도 악의적이면 나머지도 믿지 않는다 — 단 7-4의 "건너뜀 항목"은 변경에 안 넣은 것이라 별개):
1. **작업 폴더 밖**: 절대 경로, `..` 구성요소, 빈 구성요소, `\`, NUL·제어 문자, 구성요소 255자·전체 1024자 초과. 정규화 뒤에도 `resolve(root, path)`가 `root/` 안에 있어야 한다.
2. **`.git`**: 어느 깊이든 구성요소가 `.git`(대소문자·NFC/NFD·**유니코드 무시 문자(ZWJ 등)·끝의 점·공백** 제거 후 비교, 맥 파일시스템이 대소문자를 무시하므로 `.GIT`·`.Git`도 같다)이면 거절. `.gitmodules`·`.gitattributes`·`.gitignore`는 **`.git` 내부가 아니므로 허용하되 민감 경로 경고(아래)**.
3. **심볼릭 링크**: ① 변경 목록에는 일반 파일만 있다(링크·장치·소켓 종류가 있으면 거절). ② A컴 반영 때 대상의 **부모 폴더를 루트부터 한 구성요소씩 `lstat`** 하여 링크가 하나라도 있으면 거절(이미 있는 링크 폴더로 새 파일을 흘려보내는 공격 차단). ③ 파일 쓰기는 `O_NOFOLLOW`, 교체는 임시 파일 `rename`(기존 파일이 링크라면 링크 자체를 교체하지 않고 거절). ④ 루트 자체(`Lab.cwd`)가 링크이면 `realpath`로 한 번 풀어 **등록된 랩 폴더인지** 확인.
4. **루트 보호**: 루트는 대표가 등록한 `Lab.cwd`만. 홈·`/`·시스템 폴더·`userData`는 복사본 루트가 될 수 없다(`rootAllowed`).
5. **경로 길이·개수·중복**: 7-2 한도, 정규화 후 중복 거절.
6. **민감 경로**(거절은 아니고 **카드에서 따로 체크해야 반영**, 기본 해제): `.claude/`, `.github/`, `.husky/`, `.vscode/`, `.envrc`, `.env*`, `*.sh`·`Makefile`·`package.json`·`pyproject.toml`·`Dockerfile`(실행·빌드 설정), `.gitmodules`·`.gitattributes`·`.gitignore`, 쉘 시작 파일 이름. (B컴 직원이 훗날 A컴에서 실행될 코드를 슬쩍 심는 경로를 눈에 띄게 하기 위함.)
7. **TOCTOU**: 검사와 쓰기 사이에 부모가 링크로 바뀌는 경쟁을 줄이려고, 쓰기 직전에 3-②를 다시 하고 파일 열기에 `O_NOFOLLOW`를 쓴다. 완전한 방어가 아님은 한계로 적는다(10절, 같은 사람의 A컴에서 다른 프로세스가 폴더를 바꿀 때만 해당).

### 7-7. 정리(보관 기간)
- B컴 `peer-workspaces/<id>/`: 일 완료 뒤 변경 묶음이 A컴에 ack 되면 즉시 삭제, ack가 안 되면 7일. 피어 해제 시 전부 삭제.
- A컴 `peer-staging`(받은 변경 대기): 반영·거절 즉시 삭제, 방치되면 14일. `peer-undo`·`peer-conflicts`: 7일.
- 디스크 상한: B컴 복사본 합계 5GB 넘으면 새 일 거절(`workspace_quota`).

---

## 8. 휴대폰 원격의 IP 입력 흐름

대상: 안드로이드 앱(기존 QR 연결 화면에 "주소로 연결" 추가). 서버 쪽은 1-4의 짝짓기 교환을 **휴대폰용으로 같은 길**로 쓴다.

1. PC 설정 > 휴대폰 연결에서 QR 옆에 **코드 12자(`XXXX-XXXX-XXXX`)**와 IP:포트, 지문 앞 8자리를 같이 보여 준다(QR이 보이는 5분 동안만, `QR_SHOW_MS`와 같은 창).
2. 휴대폰 앱 "주소로 연결": `IP`(Tailscale 100.x, 같은 와이파이의 사설 IP, `*.ts.net`) + `코드`(+고급: 포트) 입력. 앱은 입력 즉시 주소 종류를 검사(공인 IP는 막고 "Tailscale 앱이 켜져 있어야 해요" 안내).
3. 앱 → `POST /v2/pair/hello` → `POST /v2/pair/confirm`(1-4와 같은 코드·PBKDF2 키 유도·양방향 증명·지문 확인. 휴대폰도 `serverProof`가 맞아야만 토큰을 저장한다). 휴대폰에는 `kind:'phone'`을 보낸다.
4. 서버가 휴대폰 슬롯 **현재 토큰을 돌려준다**(QR을 찍은 것과 똑같은 결과). 단 이 토큰이 이미 다른 폰이 쓰는 중(`isTokenUsed`)이면 QR 재발급과 같은 `confirm_required`("이전 폰이 끊겨요")를 PC 쪽 화면 확인으로 거친다.
5. 이후는 기존과 동일(`hello` 능력 확인·v2 `/v2/call`·SSE). 앱은 `{ host, port, token, spki }`만 저장하고, 기존 QR 저장 경로와 같은 값이다 → **앱 나머지 코드는 변경 없음**.
6. 실패: 코드 오답(남은 시도 표시), 창 만료("PC에서 코드를 새로 만들어 주세요"), 주소 접속 불가(Tailscale 꺼짐), 지문 불일치(중단).
- 이유: 휴대폰 QR 읽기가 어려운 경우(카메라 없음·화면 공유 불가)와 PC↔PC 짝짓기를 **한 서버 구현으로** 해결. `v1·v2`의 기존 호출·QR 형식은 그대로 두고 `/v2/pair/*` 두 경로만 더한다.

### 8-1. 피어 토큰의 권한 범위 (`peer` 범위, 휴대폰 `phone` 범위와 구분)
피어 슬롯의 토큰은 아래만 허용한다(허용 목록, 나머지는 `403 scope_denied`). 구현은 `V2_METHODS` 분류표 옆에 `PEER_ALLOWED` 한 표를 두고 "표에 없으면 막힘" 테스트를 둔다(기존 84개 분류 테스트와 같은 방식).
| 경로·메서드 | 조건 |
|---|---|
| `GET /v2/events` | 피어 슬롯 연결(슬롯당 1개) |
| `/v2/peer/*` 전부 | 8-2 |
| `/v2/call`의 `decide`, `answerQuestion` | **`jobId`를 가진 피어 일의 결재만**(그 슬롯이 보낸 일) |
| `/v2/call`의 `snapshot` | 사영된 얇은 모양만(4-2) — 사실상 `GET /v2/peer/staff`로 대체되어 `/v2/call` 경유는 막아도 됨(구현 판단) |
| 그 밖 모든 OfficeApi(직원 채용·해고·설정·원격 설정·파일 열기·PC 전용 포함) | **거부** |

### 8-2. 새 경로 한눈에 (B컴 서버, 3번·4번 소유 구분은 9절)
| 경로 | 설명 | 담당 |
|---|---|---|
| `POST /v2/pair/hello`, `/v2/pair/confirm` | 짝짓기(1-4·8절) — 인증 없음, 창이 열린 동안만 | 3 |
| `GET /v2/peer/staff` | 얇은 직원 목록(2-1) | 3 |
| `POST /v2/peer/watch` | 지켜볼 직원 선택(4-2) | 3 |
| `POST /v2/peer/jobs`, `GET /v2/peer/jobs?ids=`, `POST …/jobs/{id}/cancel`, `…/ack` | 일(3·6절) | 3 |
| `PUT /v2/peer/attachments` | 일에 붙일 첨부 올리기(3-6) — 바이트 본문, 파일당 20MB | 3 |
| `GET /v2/peer/approvals` | 미결재 일괄(5-3) | 3 |
| `POST /v2/peer/unpair` | 해제(1-6) | 3 |
| `POST /v2/peer/workspaces`, `…/{id}/commit`, `PUT /v2/peer/blobs/{sha256}`, `GET /v2/peer/blobs/{sha256}`, `GET /v2/peer/changesets/{id}` | 파일(7절) | 4 |
- 오류 코드는 v2 9절 표에 더한다: `pair_failed`(401)·`pair_closed`(410)·`scope_denied`(403)·`job_not_found`(404)·`workspace_quota`(507 상당 insufficient_storage)·`changes_rejected`(422). 모두 `v2Fail` 형식.

---

## 9. 모듈 경계 — 3번(연결·위임)과 4번(파일 동기화)이 같은 파일을 고치지 않게

원칙: **파일마다 소유자 한 명.** 겹쳐 고쳐야 하는 공용 파일은 3번이 모아서 고치고, 4번은 그 파일에 직접 손대지 않고 자기 폴더에서 함수를 내보낸다. 4번이 필요한 갈고리는 3번이 **인터페이스(`shared/peerSync.ts` 타입)에 맞춘 한 줄 호출**로만 넣는다.

### 9-1. 소유 표

| 파일(새 파일은 ★) | 소유 | 내용 |
|---|---|---|
| `app/src/shared/peerProtocol.ts` ★ | 3 | 경로·상태·이벤트·오류 코드 타입, 한도 상수(4번은 **읽기만**) |
| `app/src/shared/peerSync.ts` ★ | 4 | `Manifest`·`ChangeSet`·`Change`·한도 상수, 3번이 부를 **`SyncApi` 인터페이스** (3번은 읽기만) |
| `app/src/main/peer/peerRegistry.ts` ★ | 3 | 피어·원격 직원 DB(`peer`,`peer_staff`), `staffOf(id)`, 토큰 파일 |
| `app/src/main/peer/pairing.ts` ★ | 3 | 짝짓기 창·코드·`pair/hello|confirm`(서버), A컴 짝짓기 흐름(클라) |
| `app/src/main/peer/peerClient.ts` ★ | 3 | SSE·재연결·`PeerHttp`(인증 붙은 get/post/put/stream) |
| `app/src/main/peer/jobQueue.ts` ★ | 3 | `peer_job`·`peer_outbox`, 큐·재전송, 결과 회수·[팀원 보고] |
| `app/src/main/peer/approvalRelay.ts` ★ | 3 | 결재 중계(5절) |
| `app/src/main/peer/peerHost.ts` ★ | 3 | B컴 쪽: 일 수신·`peer_inbox`·완료 처리·결재 이벤트 |
| `app/src/main/remote/peerRoutes.ts` ★ | 3 | 8-2의 3번 담당 경로 + 범위 검사(`PEER_ALLOWED`) |
| `app/src/main/remote/auth.ts` | 3 | 토큰 슬롯 `peers[]` |
| `app/src/main/remote/events.ts` | 3 | 새 이벤트 3종·피어 연결 한도 |
| `app/src/main/remote/v2routes.ts` / `server.ts` | 3 | 새 경로 연결선 한 곳(`stream()`에 `peerRoutes` 위임 한 줄) |
| `app/src/main/office.ts` | 3 | 2-3의 갈고리 5곳 (**4번은 건드리지 않음**) |
| `app/src/main/db.ts` | 3 | 마이그레이션 호출 줄만(아래) |
| `app/src/shared/types.ts`, `officeApiShape.ts`, `preload.ts`, `officeHandlers.ts`, `v2.ts`(`V2_METHODS`) | 3 | `Staff.remote`, `Approval.peerChanges?`(4번 타입을 import), 새 OfficeApi 메서드(`peerPairStart/peerList/peerUnpair/peerAddStaff/peerRemoveStaff/peerChangesetDetail/peerApplyChanges`)의 이름·분류·전달 한 줄. 4번 메서드(`peerChangesetDetail`·`peerApplyChanges`)의 **본문**은 4번 함수를 부르기만 한다 |
| `app/src/main/peer/sync/pathPolicy.ts` ★ | 4 | 7-6 `check`·`rootAllowed` (A·B 양쪽이 같이 씀) |
| `app/src/main/peer/sync/manifest.ts` ★ | 4 | 폴더 훑기·제외 목록·해시·한도 검사 |
| `app/src/main/peer/sync/workspaceStore.ts` ★ | 4 | B컴 복사본 폴더 생성·정리·할당량 |
| `app/src/main/peer/sync/changeset.ts` ★ | 4 | `collectChanges`(B컴), `fetchChangeSet`·검증·스테이징(A컴) |
| `app/src/main/peer/sync/conflict.ts` ★ | 4 | 충돌 판정표 |
| `app/src/main/peer/sync/applyChanges.ts` ★ | 4 | 반영·되돌리기·원자적 교체 |
| `app/src/main/peer/sync/syncDb.ts` ★ | 4 | `peer_workspace`·`peer_changeset` 테이블 (자기 테이블만, `ensureSyncTables(db)` 하나를 내보냄) |
| `app/src/main/remote/syncRoutes.ts` ★ | 4 | 8-2의 4번 담당 경로(`workspaces`·`blobs`·`changesets`) |
| `app/src/shared/i18n/dict/*` | 3은 `peer.*`, 4는 `peerSync.*` | **파일을 나눈다**: 3번 `peer.ts`, 4번 `peerSync.ts`(각 4개 언어). `dict/index` 한 줄 등록은 3번 |
| 테스트 | 각자 | `peer*.test.mts`(3), `peerSync*.test.mts`(4). 서로의 테스트를 고치지 않음 |
| 화면(renderer) | 이 문서 범위 밖 | 3·4번이 화면 파일을 고쳐야 하면 별도 협의(업무 카드의 화면 담당) |

> `db.ts` 규칙: 3번이 `db.ts`에서 `ensureSyncTables(db)`를 한 줄 호출하고, 4번은 `db.ts`를 열지 않는다. 마찬가지로 `officeHandlers.ts`의 한 줄은 3번이 4번이 내보낸 함수를 불러 이어 준다.

### 9-2. 둘 사이 인터페이스 (`shared/peerSync.ts`)
3번이 4번을 부르는 함수(4번이 구현, **먼저 시그니처부터 확정해 3번이 가짜 구현(stub)으로 개발**):
```ts
interface SyncApi {
  // A컴: 일 시작 전
  prepareWorkspace(root: string, opts: { exclude?: string[] }): Promise<{ workspaceId; manifest; skipped: Skipped[]; warnings: string[] }>   // 한도·제외 검사 포함, 어기면 SyncError
  pushWorkspace(http: PeerHttp, workspaceId): Promise<void>                      // missing 계산→blob 올리기→commit
  // B컴: 일 실행 직후
  workspaceDir(workspaceId): string | null                                       // 3번이 cwdOverride로 씀
  collectChanges(jobId, workspaceId): Promise<{ changesetId; files; bytes } | { none: true }>
  // A컴: 결과 회수 후
  fetchChangeSet(http: PeerHttp, changesetId): Promise<ChangeSetView>            // 받기·검증·스테이징
  approvalCard(view: ChangeSetView): PeerChangesCard                             // Approval.peerChanges 본문
  applyChangeSet(changesetId, choice: ApplyChoice): Promise<ApplyResult>         // 충돌 재판정·반영·되돌리기
  discardWorkspace(workspaceId): Promise<void>                                   // 해제·ack 뒤 정리
}
interface PeerHttp { get/put/post(path, …): Promise<…>; stream(path): Readable }  // 3번 제공, 4번은 소비만
```
- 3번의 `JobQueue`가 `prepareWorkspace`→`pushWorkspace`를 일 전송 **앞단계**로 호출(오류는 `peer_job`을 `failed(reason)`로), `PeerHost`가 `collectChanges`를 일 완료 직후 호출해 `done` 이벤트에 `changesetId`를 싣는다. 4번은 일·결재·큐 상태를 알지 못한다 — **반대로 4번이 3번 모듈을 import하지 않는다**(의존은 한 방향 3 → 4).
- 같은 코드를 A컴·B컴이 모두 쓰므로 4번의 모든 함수는 `electron`을 직접 import하지 않고(저장 경로는 인자), 테스트는 한 맥에서 임시 폴더로 돈다.

### 9-3. 개발 순서(충돌 없는 병합)
1. **뼈대 PR(3번, 먼저)**: `shared/peerProtocol.ts`·`shared/peerSync.ts`(4번이 채움 — 3번은 빈 인터페이스만)·소유 폴더 생성·타입 필드·`db.ts`/`office.ts` 갈고리 자리와 **빈 구현(`NotImplemented`)**. 이후 3·4번이 각자 폴더만 채운다.
2. 3번과 4번은 동시에 진행하고, `SyncApi` 시그니처 변경은 이 문서 9-2를 먼저 고친 뒤(둘이 합의) 코드에 반영.
3. 통합 시험: 한 맥에서 앱 2개(`AI_OFFICE_USER_DATA` 다르게, 포트 47900/47901)로 짝짓기→일→결재→변경 승인 전체 흐름(8단계 QA가 실행).

---

## 10. 보안 위협과 대책

| # | 위협 | 대책 |
|---|---|---|
| T1 | **짝짓기 코드 무작위 대입** | 6자리·5분·3번 오답이면 창 닫힘·IP 잠금(5회/15분)·전체 실패 알림. 코드 폐기는 1회 사용 즉시 |
| T2 | **첫 연결 중간자(MITM)** | 코드로 지문을 묶는 HMAC(1-4). Tailscale 구간 암호화. 지문 앞 8자리 육안 확인. 이후 연결은 인증서 고정 |
| T3 | **토큰 탈취**(A컴 디스크 접근) | `safeStorage` 암호화·0600. 피어 토큰은 `peer` 범위만(8-1) → 훔쳐도 B컴에서 **일 맡기기·결재(자기 일만)** 외 불가. B컴에서 슬롯 삭제로 즉시 무효. B컴 로그에 슬롯 id·마지막 접속 기록 |
| T4 | **B컴이 A컴을 속임**(침해된 B컴) | A컴은 B컴이 준 모든 것을 입력 불신으로 처리: 결재는 **A컴이 만든 jobId와 이 피어의 것만** 받음(모르는 jobId 결재·변경은 버림), 변경 묶음은 검증 후 **A컴 결재 승인 전에는 폴더 미접촉**, 텍스트는 길이 제한·표시용 라벨 |
| T5 | **프롬프트 주입**(B컴 결과 글이 A컴 리더에게 지시를 심음) | 보고에 `[원격: 피어명]` 표지, 20,000자 제한. 리더의 모든 도구 사용은 A컴의 기존 결재·규칙을 그대로 거침(결과 텍스트가 결재를 우회하지 못함). 자동결재는 `Bash` 위험 목록을 그대로 적용 |
| T6 | **경로 탈출·`.git` 덮어쓰기·심볼릭 링크**(변경 묶음 공격) | 7-6 `pathPolicy`: 묶음 전체 거절·`.git` 정규화 비교·링크 금지·부모 `lstat`·`O_NOFOLLOW`·임시 파일 rename·루트 `realpath` 등록 확인. 묶음 파일(tar/zip)을 쓰지 않음 |
| T7 | **민감 파일에 코드 심기**(`.claude/`·CI·스크립트) | 민감 경로는 카드에서 별도 체크해야 반영(7-6 ⑥), 기본 해제 |
| T8 | **내용 변조·잘못된 해시** | 모든 blob sha256 재계산·불일치면 전체 거절. 목록 자체의 `rev`도 해시로 묶음 |
| T9 | **A컴 비밀이 B컴으로 샘** | 복사본 기본 제외 목록(7-3: `.env`·키·`.ssh`)·"무엇을 보냈는지" 요약 표시·큰 폴더 경고. 비밀 항목은 대표도 빼기 금지(O-7). 일 시작 때 처음 한 번 "이 폴더를 B컴에 복사해요" 확인 |
| T10 | **재전송으로 같은 일 중복 실행·재생 공격** | 6-2의 3중 중복 방지. 인증된 요청만 처리(토큰 필수)하므로 도청해도 재생 불가(HTTPS+WireGuard). `jobId`는 UUID v4 |
| T11 | **자원 고갈**(큐·SSE·큰 파일) | 큐 50건·SSE 슬롯 1·본문/파일/총량 한도(7-2)·B컴 복사본 5GB·동시 전송 4·인증 전에는 본문을 읽지 않는 기존 규칙(`precheck`) |
| T12 | **B컴 자동 승인 우회** | 피어 일에서는 자동 승인·규칙·자동결재를 끔(5-4). `decide`는 피어 일의 결재만(8-1) — 피어 토큰으로 B컴 직원 `approvalMode`를 바꾸거나 B컴의 다른 결재를 승인할 수 없다 |
| T13 | **다른 사람이 Tailscale 망에서 접속** | 토큰 필수(없으면 `401`), IP 잠금. "Tailscale ACL로 이 두 맥만 허용" 안내(권장 사항). 짝짓기 창이 닫혀 있으면 `pair`는 `410` |
| T14 | **검사와 쓰기 사이 경쟁(TOCTOU)** | 쓰기 직전 재검사·`O_NOFOLLOW`. **남는 위험**: A컴에서 다른 프로세스가 같은 순간 폴더를 링크로 바꾸는 경우(같은 사용자 권한 공격자 — 위협 모델 밖으로 문서화) |
| T15 | **로그에 비밀이 남음** | 토큰·코드·`proof`·blob 내용은 로그·접속 기록에 안 남김(기존 QR 규칙). 경로와 크기만 기록. 접속 기록의 토큰은 해시 앞 8자 |
| T16 | **해제 뒤 잔존** | 해제 즉시 토큰 파일·`peer` 행 삭제, B컴 슬롯 삭제, 복사본 삭제, 진행 중 일 취소(1-6, 7-7) |
| T17 | **버전 불일치로 오동작** | `hello`/`pv`로 피어 지원 버전을 확인(`pv>=2`+`peer` 능력 문자열 `peer-v1`을 `KNOWN_CAPABILITIES`에 추가). 능력이 없으면 "B컴 앱을 업데이트해 주세요"로 연결 거절 |

보안 리뷰(7단계) 중점: `pathPolicy` 입력 퍼저(유니코드·`..`·`.GIT`·링크), `PEER_ALLOWED` 표 완전성 테스트, 짝짓기 HMAC 바인딩, jobId 소속 검사, 자동 승인 우회 불가 테스트.

---

## 11. 호환·기존 코드와의 관계
- v1·v2 기존 경로·응답·QR 형식은 **그대로**. 휴대폰 앱은 새 이벤트(`job`·`approval`·`changes`)를 받지 않는다(피어 슬롯 연결에만 보냄).
- `AuthState`에 `peers[]`를 더하면 저장된 옛 설정(`peers` 없음)은 빈 목록으로 읽는다(`DEFAULT_REMOTE_CONFIG`에 기본값, 마이그레이션 불필요).
- `OfficeSnapshot.staff[].remote`와 `Approval.peerChanges`는 선택 필드 — 옛 화면·모바일은 무시.
- 4개 언어 문구: 짝짓기·연결 상태·연결 대기·충돌·민감 경로 경고·오류 메시지는 `peer.*`·`peerSync.*` 키로(9-1).

---

## 12. 열린 항목 (대표·리드 확인 — 아래 "기본값"으로 구현을 시작하고, 달라지면 문서를 고친다)

| # | 내용 | 기본값(설계에서 정한 가정) | 확인 대상 |
|---|---|---|---|
| O-1 | 복사본을 쓸지 일마다 고르는가, 랩 설정으로 켜는가. `.git`이 필요한 일(배포·커밋)은 어떻게 하는가 | 랩 설정 "파일 포함" 기본 **켬**, 일마다 `copy/none`. `.git`은 안 보냄 → B컴에서 git 쓰는 일은 `none`(B컴 폴더 그대로)으로 | 대표·리드 |
| O-2 | 같은 B컴 직원이 동시에 여러 일을 받을 때 | B컴 직원의 기존 업무 큐 규칙을 그대로(순서대로) | 리드 |
| O-3 | 연결 대기 일의 수명·재시도 한도 | **24시간**, 지나면 실패 처리하고 리더에게 보고 | 대표 |
| O-4 | 결재 요청의 만료 시간 | 두지 않음(로컬 결재와 같음) | 대표 |
| O-5 | B컴 직원이 만든 `delegate`(B컴 직원 → 다른 B컴 직원) | 지원하지 않음. 오케스트레이터는 A컴 리더 하나 | 리드 |
| O-6 | 원격 직원이 일한 경험치(XP)·보상·비용(`monthCostUsd`) 집계 | A컴은 XP·비용을 올리지 않음(B컴이 각자 집계). 화면에 비용 합산은 후속 | 대표 |
| O-7 | 비밀 파일 제외 목록을 대표가 풀 수 있는가 | 풀 수 없음(보수적). 필요하면 후속에서 예외 기능 | 대표·한리뷰 |
| O-8 | 충돌 시 줄 단위 병합(3-way merge) | 이번 범위 밖. 파일 단위 판정·B컴 버전 보관만 | 대표 |
| O-9 | 여러 피어(B컴 외 C컴)와 동시에 | 설계는 N대 가능(피어당 슬롯·클라이언트). 이번 완료 기준은 1대로 시험 | 리드 |
| O-10 | 화면(짝짓기·랩에 넣기·지도 "원격" 표시·충돌 카드) | 이 문서는 서버 쪽 계약까지. 화면은 2번 시안 + 화면 담당 | 리드 |
| O-11 | 업무 보드 5·6번의 범위 | 이 문서는 3=연결·위임·결재·큐, 4=파일 동기화로 나누고, 5·6번은 화면·QA 쪽으로 가정(코드 파일 소유는 9-1에 없음) | 리드 |
| O-12 | `peer` 능력 문자열·SSE 전체 한도 8·큐 50·복사본 500MB 같은 숫자 | 모두 초기값 | 구현·QA |

## 변경 이력 (이 문서)
- 2026-11-01 강백엔: 초안 작성(1/8단계). 코드 변경 없음.
- 2026-11-01 강백엔: 3번(연결·위임·결재 중계) 구현 반영. 설계와 달라진 점·구현 메모:
  - 짝짓기 확인: A컴은 "지문 확인 뒤 저장"이 아니라 **저장 후 지문 앞 8자리를 돌려준다**(`peerPairConnect` 결과 `fingerprint`). 다르면 화면이 "연결 끊기"를 안내한다. HMAC 바인딩이 먼저 중간자를 막으므로 눈 확인은 보조.
  - `PairWindowView`에 `copyText`(주소:포트 코드 한 줄)와 `qr`(토큰 없는 1회용 QR, 피어용)를 더했다. 휴대폰용 창은 기존 QR을 쓴다.
  - 피어 토큰 경로 허용 목록은 `handler.ts isPeerPathAllowed`(`/v2/events`·`/v2/call`·`/v2/peer/*`)가 앞단에서, `/v2/call` 안의 메서드는 `PeerRoutes.callAsPeer`(hello·decide·answerQuestion만)가 거른다.
  - 파일 수정을 결재 없이 하는 직원(`approvalMode: acceptEdits`)은 원격 일을 **받지 않는다**(`422 peer_auto_edit`, 목록에 `isAutoEdit`). 자동 승인이 세션 안(SDK)에서 일어나 A컴이 막을 수 없어서다. 설계 5-4 ①의 구현 방식.
  - 피어에 나가는 SSE는 `snapshot`(고른 직원의 줄인 정보)·`job`·`approval`만이다. `log`·`chat`·`remoteStatus`는 보내지 않는다(활동 줄은 snapshot의 `thought`로). 4-3의 로그·대화 중계는 후속.
  - 일괄 조회·결정은 `GET /v2/peer/jobs?ids=`·`POST /v2/call decide`(피어 범위). 수신함 정리는 앱 시작 때 한 번(`prune`).
  - 짝짓기 호출 속도 제한: 인증 전 경로라 주소당 분당 12번(`PeerRoutes`)을 따로 둔다.
  - SSE 전체 한도 4 → 8, 피어 슬롯당 1개. `closeAll('token_revoked', {phonesOnly:true})`: 휴대폰 QR 재발급이 피어 연결에 `token_revoked`를 보내지 않는다.
  - 새 OfficeApi 12개(`peerPairStart`·`peerPairClose`·`peerSlots`·`peerRevokeSlot`·`peerPairConnect`·`peerList`·`peerUnpair`·`peerReconnect`·`peerRemoteStaff`·`peerAddStaff`·`peerRemoveStaff`·`peerCancelJob`)는 v2 분류 모두 P(PC 전용), 비서 도구는 제외.
  - 파일 복사본·변경 묶음(4번)은 구현하지 않았다. `PeerJob.workspaceId`·`InboxJob.workspaceId`·`changesetId` 자리만 있다.

- 2026-11-01 정리드: 4번(파일 복사본·변경 묶음·충돌) 구현 반영. `peer/sync/*`·`remote/syncRoutes.ts`·`shared/peerSync.ts`·`dict/peerSync.ts`만 고쳤다. 설계와 달라진 점·구현 메모:
  - 파일 바이트 전송은 3번 `PeerHttp.call`(JSON, 응답 16MB 한도)로는 20MB 파일을 못 실어서, 4번 함수는 **`SyncHttp`**(`call` + `putBytes`·`getBytes`)를 받는다. `call`은 `PeerHttp.call`과 같은 모양이고, `putBytes`·`getBytes`는 3번이 `peerTransport`에 더해 주어야 한다.
  - `SyncApi` 구현은 `PeerSync`(`peer/sync/peerSyncService.ts`). `approvalCard`는 열 때마다 지금 A컴 파일로 충돌을 다시 판정하므로 `Promise`를 돌려준다. `fetchChangeSet`에 `expectWorkspaceId`(그 일에 보낸 복사본 id)를 더해, B컴이 다른 복사본을 가리키면 거절한다. `peerChangesetDetail` 본문은 `changesetDetail(id)`, `peerApplyChanges` 본문은 `applyChangeSet(id, choice)`.
  - 반영 선택은 `all`(충돌이 하나라도 있으면 아무것도 쓰지 않고 `blocked`)·`safe`(충돌 없는 것만)·`files`(고른 파일만)·`reject`. 민감 경로는 `sensitiveOk`에 따로 넣어야 반영된다. 막힘·실패(되돌림)는 `pending`으로 남아 다시 고를 수 있다.
  - B컴 경로는 슬롯마다 자기 것만: `PUT blobs`는 그 슬롯이 올리는 중인 목록에 든 주소만, `GET blobs`는 그 슬롯의 변경 묶음에 든 주소만. 4번 오류 코드(`workspace_quota` 507·`changes_rejected` 422 등)는 `syncRoutes`가 v2 모양으로 직접 낸다(`v2.ts`는 고치지 않음).
  - 아직 3번 쪽에서 이어 줄 곳(4번은 손대지 않음): `v2routes.stream()`에서 `SyncRoutes.isSyncPath`면 `SyncRoutes.handle`로 위임, `db.ts`의 `ensureSyncTables(db)`, `dict/index.ts`의 `peerSync` 등록, `JobQueue`의 `prepareWorkspace`→`pushWorkspace`, `PeerHost`의 `workspaceDir`(cwd)·`collectChanges`, 결과 회수 후 `fetchChangeSet`→`Approval.peerChanges` 카드, ack·해제 때 `discardWorkspace`·`discardSlot`, 앱 시작 때 `prune()`.

- 2026-11-01 강백엔(2차): 짝짓기 보안 강화. 1-2·1-3·1-4·8절을 v2 규격으로 교체했다 — 코드 6자리 숫자 → 12자 Crockford base32, `HMAC(code, …)` 한 번 → PBKDF2 20만 회 키 `K` + `clientProof`/`serverProof` 양방향 증명(바이트 순서·인코딩·테스트 벡터는 1-4). 요청 필드가 `proof` → `clientProof`로, 응답에 `serverProof`가 더해졌다. 옛 6자리·`proof` 형식은 더 받지 않는다(호환 없음: 두 PC·휴대폰이 같이 올라가야 한다).
- 2026-11-01 강백엔(2차): 3번 리뷰 지적 수정 + 4번 앱 연결.
  - **격리(P1)**: 피어 일이 걸린 직원은 그 일이 끝날 때까지 로컬 지시를 받지 않고 대기시킨다(`/명령` 제외, 끝나면 순서대로 전달). 반대로 로컬 일을 하는 직원은 피어 일을 `503 staff_busy`로 되돌려 A컴 큐가 같은 jobId로 다시 보낸다. 승인 주체 판정(`peerJobOf`)은 맨 앞이 아니라 **모든 받은 일**을 본다(`peer/peerIsolation.ts`).
  - **재위임(P1)**: 피어 일에서 B컴 직원이 다른 B컴 직원에게 `delegate`하면 `Origin.peerJobId`로 승인 주체가 이어진다(자동결재 끔·A컴 결재 중계·acceptEdits 직원에게는 맡기지 않음·보고도 같은 문맥). 피어 일을 또 다른 PC로 넘기는 연쇄는 막았다.
  - **전송 실패(P2)**: 보내는 중 취소·완료된 일을 전송 오류가 `queued`로 되살리지 않고, 취소된 일이면 B컴에 취소를 보낸다.
  - **가리기(P2)**: B컴에서 나가는 결과·오류·결재 요약(+i18n·질문)·말풍선의 절대 경로는 마지막 이름만, 토큰·비밀번호·긴 무작위 문자열은 `‹가림›`으로(`peer/redact.ts`).
  - **4번 연결**: `/v2/peer/workspaces|blobs|changesets`는 `V2Routes.stream`이 `SyncRoutes`로 넘긴다. `db.ensureSyncTables`, i18n `peerSync` 등록. 통로에 `putBytes/getBytes`(실제 HTTPS 시험 포함). 일 큐는 보내기 전에 랩 프로젝트 폴더로 복사본을 만들어 올리고(`PeerJob.workspaceRoot`→`workspaceId`), 크기·위치 문제(`root_not_allowed`·`workspace_too_large`·`workspace_quota`)면 복사본 없이 일만 보내며 보고에 알린다. B컴은 복사본(해당 슬롯이 commit한 것만)을 직원 작업 폴더로 지정하고, 일이 끝나면 바뀐 파일을 모아 `changesetId`와 함께 돌려준다. A컴은 묶음을 받아 결재함에 `PeerChanges` 카드(`Approval.peerChanges`, diff 없는 목록)로 올린다. ack(B컴 정리)는 묶음을 다 받은 뒤에 보낸다. 앱을 다시 켜면 반영 대기 중인 묶음 카드를 되살린다(`PeerManager.restoreChanges`). 보관 정리는 앱 시작 때 `prune()`.
  - 새 OfficeApi 3개: `peerChangesetDetail(changesetId)`·`peerChangeFileDiff(changesetId, path)`·`peerApplyChanges(changesetId, choice)` — 모두 P(PC 전용), 비서 도구 제외. `choice.mode`: `all`·`safe`·`files`·`reject`.
- 2026-11-01: 원격 직원에게 첨부(이미지·파일) 보내기(3-6절). 새 경로 `PUT /v2/peer/attachments`, `PeerJobRequest.attachmentIds`, 한도 `attachmentMax` 20MB·`attachmentsPerJob` 5·`attachmentKeepMs` 48시간, B컴 표 `peer_upload`(`usedBy`, 쓰이지 않은 첨부는 정리 때 파일까지 삭제, 슬롯당 대기 첨부 20개·200MB). 이전의 "첨부는 보내지 못해 글만 보냄"(`peer.attachUnsupported`·`peer.attachDropped`)은 없앴다. 예전 B컴(경로 없음, 404)에는 첨부를 빼고 일만 보내고 보고에 알린다.
