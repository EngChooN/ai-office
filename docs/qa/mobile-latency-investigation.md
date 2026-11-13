# 휴대폰 앱 지연 조사

대표 의견: 메시지 보내기·승인 버튼을 누른 뒤 반영까지 느리다.
이 문서는 두 절로 나뉜다. **PC 쪽** 절은 강백엔, **휴대폰 쪽** 절은 임안드가 쓴다. 서로의 절은 고치지 않는다.

## PC 쪽

(강백엔이 작성)

## 휴대폰 쪽

조사: 임안드, 2026-11-13. 코드만 읽었고 실기기 측정은 못 했다. 그래서 크기는 모두 **추정**이다.
확인한 곳: `android/.../net/PinnedTls.kt`, `net/RemoteClient.kt`, `web/EventStream.kt`, `web/WebShell.kt`, `web/BridgeProtocol.kt`, `app/src/renderer/mobile/{bridge,remoteOffice,install}.ts`, `app/src/renderer/store.ts`, 승인·채팅 화면.

### 한 번 누를 때 일어나는 일 (승인·메시지 공통)
버튼 → `window.office.decide/sendChat` → `bridge.request`(JSON 문자열) → WebShell `Call` → `RemoteClient.v2Call`(OkHttp `POST /v2/call`) → PC 처리 → 결과 응답.
화면은 **그 결과로 바뀌지 않는다.** PC가 처리한 뒤 SSE(`/v2/events`)로 보내는 `snapshot`·`chat` 이벤트를 받아야 카드가 사라지고 내 메시지가 보인다.
즉 체감 지연 ≈ (새 연결 맺기) + (PC 처리) + (PC가 snapshot을 만들어 SSE로 밀어 줄 때까지) + (화면 다시 그리기).

### 원인 후보 (큰 순서)

#### 1. 호출마다 TCP+TLS를 새로 맺는다 — 영향 큼(추정), 고치기 쉬움
- 근거: `PinnedTls.kt:73-75` `connectionPool(ConnectionPool(0, 1, SECONDS))` — 연결을 재사용하지 않는다. 주석 이유는 "PC 서버가 쉬는 연결을 몇 초 뒤 닫아서"이고, v1 조회(30초·15분 간격)를 기준으로 정한 설정이다. `v2Call`이 쓰는 `lanCallHttp`/`externalCallHttp`도 같은 `pinnedClient`를 거쳐 그대로 물려받는다(`RemoteClient.kt:250-254`). `retryOnConnectionFailure(false)`.
- 영향: 버튼마다 TCP 3-way(1 RTT) + TLS(TLS1.3 1 RTT, 1.2면 2 RTT) = 약 2~3 RTT가 요청 앞에 붙는다. Tailscale 직접 연결(RTT 20~50ms)이면 0.1초 안팎이지만, **중계(DERP) 경로면 RTT 100~300ms라 0.3~0.9초**가 매 버튼마다 더해진다. 같은 이유로 `hello`·`snapshot` 같은 부수 호출과 SSE 재연결에도 붙는다. 원거리 데이터망이면 더 크다.
- 고칠 방법: v2 호출·이벤트용 클라이언트만 `ConnectionPool(2~3, 20~30초)`로 재사용한다(v1 조회용은 그대로 둔다). 끊긴 연결로 실패하면 **한 번 자동 재시도**한다 — 서버 idle 닫기에 대비하고, `Idempotency-Key`(`WebShell.kt:396`)가 이미 있어 같은 호출을 중복 처리하지 않는다. PC 서버의 keep-alive 시간도 같이 확인해야 한다(PC 절). 지문 고정은 연결 맺을 때마다 확인되므로 재사용해도 약해지지 않는다.
- 난이도: 하 (설정 한 곳 + 재시도 한 번). 서버 idle 시간과 짝 맞추는 확인이 필요.

#### 2. 누른 즉시 보이는 반응이 없고, 결과는 SSE 이벤트가 와야 반영된다 — 영향 큼(체감), 중간
- 근거:
  - 승인 버튼(`ApprovalTab.tsx:59`, `InboxPage.tsx:135`, `ApprovalBand.tsx:23`, `ChatPage.tsx:591`)은 `void window.office.decide(...)`만 부른다. 누름 표시(비활성·스피너)도, 카드를 먼저 치우는 낙관적 갱신도 없다.
  - 채팅(`ChatPage.tsx:680-686`)은 입력칸만 즉시 비우고 `sendChat`을 `void`로 보낸다. 내 메시지가 화면에 나타나는 것은 PC가 만든 `chat` 이벤트가 올 때다.
  - `decide`의 응답 값은 화면 상태에 쓰이지 않는다(`remoteOffice.ts`의 `call`은 결과만 돌려줄 뿐 store를 건드리지 않음).
- 영향: 위 1번과 PC 처리 시간이 **그대로 눈에 보이는 공백**이 된다. 버튼을 눌렀는데 아무 변화가 없으니 느리다고 느끼고 다시 누르기도 쉽다(중복 눌림 방어 없음). 실제 지연이 같아도 체감은 가장 크게 줄일 수 있는 자리다.
- 고칠 방법: (a) 눌린 즉시 버튼 비활성+"처리 중" 표시(승인 id 기준 로컬 상태). (b) 승인·거절은 store에서 해당 승인을 먼저 지우고, 실패하면 되돌리고 안내. (c) 채팅은 내 메시지를 임시 id로 즉시 넣고 `chat` 이벤트의 같은 글이 오면 교체. (a)만 해도 체감이 크게 좋아진다.
- 난이도: (a) 하 / (b) 중 (되돌리기·`snapshot`과의 충돌 처리) / (c) 중 (임시 id와 서버 id 매칭)

#### 3. snapshot이 올 때마다 store를 통째로 갈아 끼워 화면이 넓게 다시 그려진다 — 영향 중간(추정), 중간
- 근거:
  - 셸은 snapshot 이벤트 본문을 파싱해 다시 문자열로 만들어(`BridgeProtocol.kt:138-148`) WebView로 보내고, 화면은 이를 한 번 더 `JSON.parse`한다(`bridge.ts` `parseShellMessage`). 큰 스냅샷이면 UI 스레드에서 두 번 직렬화한다.
  - `store.ts:156-167` `setSnapshot`은 `{...snap}`으로 staff·tasks·runs·approvals 등 **모든 배열을 새 참조로** 교체한다. 같은 내용이어도 매번 새 객체라서 `useOffice((s) => s.staff)`처럼 배열을 구독한 컴포넌트(23곳 이상)는 전부 다시 렌더된다. 값 비교(structural sharing·shallow)가 없다.
  - snapshot은 직원 상태가 바뀔 때마다 오므로(PC 절) 일이 활발하면 초당 여러 번 올 수 있다.
- 영향: 중저가 기기에서는 승인 직후 들어오는 snapshot 렌더가 카드 사라지는 시점을 늦추고 스크롤·입력도 끊긴다. 실제 렌더 시간은 미측정 — React Profiler로 재야 한다.
- 고칠 방법: `setSnapshot`에서 이전 값과 깊은 비교해 같은 부분은 기존 참조를 유지(예: id 기준 배열 병합). 자주 오는 snapshot은 `requestAnimationFrame`/100ms로 묶어 마지막 것만 반영. 셸에서는 이벤트 JSON을 파싱하지 말고 문자열 그대로 끼워 넣는다(이벤트 이름만 확인).
- 난이도: 중 (비교 로직·회귀 위험 있음). 먼저 프로파일로 실제 비중을 확인하길 권한다.

### 그 밖의 후보 (작거나 조건부)

#### 4. SSE 재연결·복귀 때 전체 다시 받기 — 영향 작음~중간(조건부), 중간
- 근거: 앱이 백그라운드로 가면 스트림을 닫고(`WebShell.kt` `onBackground`) 돌아오면 새로 맺는다(1번의 새 연결 비용 포함). `Last-Event-ID`는 보내지만(`EventStream.kt`) PC가 놓친 구간을 못 채우면 `hello.resync=true` → 화면이 `snapshot`+`chatHistory`+`timeline`을 전부 다시 읽는다(`install.ts:35-45`). 재연결 대기는 1·2·4…30초(`reconnectDelayMs`)이고 앱 복귀·망 전환에는 `reconnectNow()`로 바로 붙는다. 35초 무소식이면 끊고 재연결한다(`SSE_SILENCE_SEC`).
- 영향: 복귀 직후나 망이 흔들릴 때 한동안 화면이 갱신되지 않거나 느려 보인다. 평소 연결이 안정적일 때의 버튼 지연과는 별개다.
- 고칠 방법: PC가 이벤트를 더 오래 보관해 resync를 줄인다(PC 절). 폰 쪽은 resync 때 `chatHistory`를 최근분만 받게 하고 세 호출을 한꺼번에 보낸다(지금도 병렬이지만 각각 새 연결을 맺는다 → 1번을 고치면 같이 줄어든다). 연결 직후 snapshot은 이미 SSE로 오므로 resync가 아니면 별도 `snapshot` 호출이 필요 없는지 확인.
- 난이도: 중

#### 5. 호출 직렬화 한도(동시 5개)와 큰 응답 — 영향 작음
- 근거: `V2_MAX_CONCURRENT=5` 세마포어(`RemoteClient.kt:79,356`). 화면 진입 때 `snapshot`·`chatHistory`·`timeline`·`hello`·사진(`/v2/files`)이 몰리면 버튼 호출이 줄을 설 수 있다. 첨부는 base64로 브리지를 지나 두 번 변환한다(`toBase64`→셸 디코딩).
- 영향: 사진이 많은 화면에서 간헐적. 평소 버튼에는 거의 영향 없음(추정).
- 고칠 방법: 버튼류 호출용 슬롯을 따로 확보(우선순위). 사진은 이미 별도 경로라면 그 슬롯을 분리.
- 난이도: 하~중

#### 6. 셸 통로(bridge) 자체의 지연 — 영향 작음
- 근거: `postMessage`는 JSON 문자열 한 번이고 WebShell이 코루틴에서 바로 처리한다(`WebShell.kt:395`). 응답은 `main.post`로 UI 스레드에서 보낸다. 요청마다 id를 붙여 매칭할 뿐 추가 대기·폴링은 없다. 큰 이벤트 본문의 이중 직렬화(3번)를 빼면 통로 자체는 수 ms 수준일 것으로 본다(추정).
- 고칠 방법: 없음(3번의 파싱 중복 제거만).

### Tailscale 중계(DERP) 여부 — 앱에서 아는 방법
- 지금 앱에는 직접/중계를 구분하는 코드가 없다(`derp`·RTT 측정 검색 결과 없음). 연결 시 `isTailscale` 여부만 안다.
- 알아내는 방법 (쉬운 순):
  1. **앱이 RTT를 잰다**: 이미 맺는 `/v2/status` 같은 가벼운 호출(또는 SSE `hello`)의 왕복 시간을 `OkHttp EventListener`(`connectStart/secureConnectEnd/responseHeadersStart`)로 재어 기록한다. 연결 맺기 시간과 첫 응답까지의 시간을 따로 보면 1번의 비용도 바로 숫자로 나온다. 직접 연결은 대개 수십 ms, 중계는 100ms 이상이다. 진단 화면·로그에 표시하면 대표가 "느린 이유가 연결 경로인지"를 바로 볼 수 있다. 난이도 하.
  2. **PC에서 확인**: PC의 `tailscale status`/`tailscale ping <휴대폰>`이 `direct`인지 `relay "xxx"`인지 알려 준다(앱 밖, PC 절). 앱 안에서는 Tailscale 상태를 읽을 방법이 없다(로컬 API는 앱이 접근 못 함).
  3. 같은 와이파이면 QR의 `lan` 주소가 먼저 시도된다(`LAN_CONNECT_TIMEOUT_SEC=2초`). 실패하면 2초를 쓰고 Tailscale로 넘어가지만, 성공한 길을 기억해(`RouteMemory`) 다음부터는 그 길을 먼저 쓴다. 길이 바뀌면 첫 호출이 2초 늦을 수 있다.
- 영향: DERP이면 1번의 비용이 2~4배로 커진다. 그래서 1번(연결 재사용)이 DERP 환경에서 가장 효과가 크다.

### 우선순위 제안
1. 누름 즉시 표시(2-a) — 가장 싸고 체감이 가장 크다.
2. v2 연결 재사용 + 1회 재시도(1) — 실제 지연을 줄인다. PC 서버 idle 시간 확인과 함께.
3. 앱에서 RTT·연결 맺기 시간 기록(DERP 5번) — 이후 어느 쪽이 병목인지 숫자로 판단.
4. 낙관적 갱신(2-b, 2-c)과 snapshot 렌더 줄이기(3)는 프로파일 결과를 보고.

### 확인하지 못한 것
- 실기기·실제 Tailscale 경로에서 시간을 재지 못했다. 위 영향은 모두 코드에서 추정한 값이다.
- React 렌더 시간(3번)과 snapshot 도착 빈도·크기는 측정하지 않았다.
- PC 서버가 연결을 몇 초 뒤 닫는지(1번 고칠 때 필요)와 PC가 `snapshot`을 얼마나 늦게 보내는지는 PC 절 소관이라 보지 않았다.
