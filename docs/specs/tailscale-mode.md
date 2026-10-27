# Tailscale 연결 모드 — 상세 기획·규격 (v1·v2 규격 수정안)

작성: 김기획(PM) · 2026-10-27 · 상태: **초안 — 대표 확인 전, 배포 금지**
대상: 강백엔(서버·감지·마이그레이션), 정리드(PC 화면·문구), 임안드(안드로이드)
상위 업무: 휴대폰 원격 접속: Tailscale 방식으로 전환 · 1/6단계

## 1. 요약
- 연결 방식을 **3가지**로 나눈다: `tailscale`(추천·신규 기본) / `lan`(같은 네트워크 전용, 지금의 `lanOnly:true`) / `router`(고급: UPnP·수동 포트포워딩, 지금의 `lanOnly:false`).
- 프로토콜 버전은 **그대로(`v:1`, v2)**. QR에 선택 필드 `ts:true`, `hello` 결과에 선택 필드 `ts`·`tsHost`만 더한다(모르는 앱은 무시 — `lo`·`lan`을 더했을 때와 같은 방식).
- 확인 필요(대표 결정은 아님, 구현 중 확정): ① Tailscale IPv6(`fd7a:115c:a1e0::/48`)는 이번 범위 밖, IPv4(100.64.0.0/10)만 ② 서브넷 라우터·Funnel 등 출발 주소가 100.x가 아닌 경로는 거절(의도된 동작).

## 2. 설정 값과 예전 사용자 넘겨받기
DB `'remote'` 설정에 `mode: 'tailscale' | 'lan' | 'router'`를 추가한다. `lanOnly`는 **계속 같이 써 둔다**(`mode === 'lan'`일 때 true) — 앱을 옛 버전으로 되돌려도 같은 동작을 하도록.

| 저장된 설정 | 읽은 결과 `mode` | 안내 |
|---|---|---|
| `mode`가 있음 | 그대로 | 없음 |
| 저장된 원격 설정 자체가 없음(신규 설치) | `tailscale` | 없음 (설정 화면에서 바로 단계 안내) |
| `lanOnly === true` (0.9.x 이후 전용 모드) | `lan` **유지** | Tailscale 안내 배너 1회 |
| `lanOnly === false` 또는 `lanOnly` 없음(그전 사용자) | `router` **유지** | Tailscale 안내 배너 1회 |

- 안내 배너 표시 여부는 `isTsNoticeSeen`(기본: 신규 true, 예전 사용자 false)로 정한다. 배너의 "Tailscale로 바꾸기"·"그대로 쓰기"·닫기 중 무엇을 눌러도 `true`가 된다(기존 `isLanNoticeSeen`과 같은 방식, 별개 값).
- **자동으로 모드를 바꾸지 않는다.** 예전 사용자의 연결(QR·토큰)은 업데이트 후에도 그대로 동작해야 한다(완료 기준 4).
- 모드를 바꾸면: 열려 있는 연결을 끊고, 새 주소로 QR을 다시 만든다. 토큰은 **재발급하지 않는다**(주소만 바뀜 — 앱은 `hello`의 `tsHost`·`lan`으로 갱신하거나 QR을 다시 찍는다). `router`→다른 모드로 바꿀 때는 지금처럼 UPnP 매핑을 닫는다.

## 3. 감지 (강백엔)
1. `tailscale status --json`을 3초 제한으로 실행한다. 찾는 순서: PATH → macOS `/Applications/Tailscale.app/Contents/MacOS/Tailscale` → Windows `%ProgramFiles%\Tailscale\tailscale.exe`. 실행·파싱 실패는 오류가 아니라 폴백이다.
2. 상태(`TsState`):

| 값 | 조건 | 화면 |
|---|---|---|
| `notInstalled` | 실행 파일 없음 **그리고** NIC에 100.64/10 주소 없음 | 단계 안내 ①부터 |
| `needsLogin` | `BackendState === 'NeedsLogin'` | "Tailscale에 로그인하세요" |
| `stopped` | `Stopped`·`NoState`·`Starting` 등 `Running`이 아님 | "Tailscale이 꺼져 있어요" |
| `running` | `Running` 이고 100.64/10 IPv4가 있음 | 주소·QR 표시 |

3. 주소: `Self.TailscaleIPs` 중 IPv4(100.64/10)를 우선, 없으면 NIC 중 100.64/10 주소. CLI가 없어도 NIC에 100.x가 있으면 `running`으로 본다(앱스토어판 등 CLI 없는 설치). `Self.DNSName`(끝의 `.` 제거)은 **표시용**(`tsName`, QR에 넣지 않음).
4. `lan.ts`의 `VIRTUAL_NAME`은 그대로 둔다(같은 네트워크·router 모드에서는 Tailscale 카드를 계속 뒤로 미룸). Tailscale 모드만 별도 함수 `pickTailscaleAddress()`로 읽는다.
5. 상태는 화면이 열려 있는 동안 **3초마다** 다시 읽는다(사용자가 로그인을 마치면 자동으로 다음 단계로). 화면이 없으면 읽지 않는다. 서버가 켜져 있고 주소가 바뀌면(재로그인·재시작) 다시 바인딩하고 `hello`·화면을 갱신한다.

## 4. 연결 받는 범위 (강백엔)
- `tailscale` 모드: 서버를 **Tailscale 주소에만 바인딩**한다(1차). `running`이 아니면 포트를 열지 않고 `error`에 상태를 보인다(기존 `remote.error.noNetwork`와 같은 방식, 상태가 `running`이 되면 자동으로 연다).
- 소켓이 연결되면 **TLS 시작 전에** 상대 주소가 100.64.0.0/10(IPv4, `::ffff:` 접두사 제거 후)이 아니면 `destroy()`한다(2차). 새 함수 `isTailscaleClient(ip)`를 `lan.ts`에 두고 `isAllowedClient`와 같은 자리(`isAllowed` 훅)에 건다. 거절은 실패 횟수·잠금에 **세지 않는다**(TLS 전이므로 토큰을 시도한 것이 아님). 로그에는 상대 주소를 남기지 않는다.
- UPnP는 **쓰지 않는다**(`init`에서 `lan` 모드처럼 이전 매핑을 한 번 닫는다). 토큰·SPKI 고정·속도 제한·연결 한도는 그대로.
- 테스트(완료 기준 2): `isTailscaleClient` 단위(100.64.0.0·100.127.255.255 허용, 100.63.255.255·100.128.0.0·192.168.x·`8.8.8.8`·IPv6 거절, `::ffff:100.64.1.1` 허용), 소켓 단위(100.x 아닌 주소는 TLS 핸드셰이크 없이 끊김), 모드 전환 통합 1건. 파일 `scripts/remote-tailscale.test.mts`(새로).

## 5. QR (강백엔)
```json
{ "v": 1, "host": "100.101.102.103", "port": 47900, "token": "…", "spki": "sha256/…", "pv": 2, "ts": true }
```
| 필드 | 규칙 |
|---|---|
| `ts` | **선택.** `true`일 때만 들어간다(`false`는 넣지 않음). 의미: "`host`는 Tailscale 주소다. 휴대폰 Tailscale이 켜져 있어야 붙는다". 모르는 앱은 무시(2-3절) |
| `host` | `ts`가 있으면 **100.64.0.0/10 IPv4 숫자 주소** (MagicDNS 이름은 넣지 않음 — 이름 풀이 실패가 흔한 장애라서) |
| `lan` | `ts`가 있으면 **넣지 않는다.** 이 모드는 100.x 외 연결을 끊으므로 같은 와이파이 주소로 붙으면 거절된다 |
| `lo` | `ts`와 함께 쓰지 않는다 |

`isValidQrPayload` 수정(`app/src/main/remote/qr.ts`): `ts !== undefined`이면 ① `ts === true` ② `host`가 `isTailscaleAddress`(IPv4, 첫 옥텟 100·둘째 옥텟 64~127) ③ `lan`·`lo` 없음. `qrText`는 `pv` 뒤에 `ts`를 붙인다. `QrPayload`에 `ts?: boolean` 추가. 기존 payload(ts 없음) 검사는 그대로 통과해야 한다.

`hello`(v2 `/v2/call`) 결과: 기존 `lo`·`lan`에 `ts`(boolean, tailscale 모드일 때만 `true`)와 `tsHost`(현재 Tailscale 주소, 없으면 생략)를 선택 필드로 더한다. 앱은 `ts`가 있고 `tsHost`가 저장된 host와 다르면 host를 갱신한다(Tailscale 주소는 재로그인하면 바뀔 수 있음. 토큰·SPKI는 같으므로 안전).

## 6. PC 화면 흐름 (정리드)
원격 설정 맨 위에 **연결 방식** 라디오 3개(기존 "같은 네트워크에서만 접속" 체크박스를 대체).

### 6-1. Tailscale (추천·기본)
```
[연결 방식] ◉ Tailscale(추천)  ○ 같은 네트워크 전용  ○ 고급: 공유기 포트 열기
 └ 상태 줄: ● running(100.x.x.x) / ● 꺼짐 / ● 로그인 필요 / ● 설치 안 됨   [다시 확인]
 ① PC에 Tailscale 설치하고 로그인   ← state가 notInstalled/needsLogin/stopped일 때만 "현재 단계" 강조, 완료 단계는 체크
 ② 휴대폰에 Tailscale 설치하고 같은 계정으로 로그인
 ③ 아래 QR을 휴대폰 Claude Office로 찍기   ← running일 때만 활성(서버가 켜진 뒤 QR 버튼)
 ※ 회사 PC라면 사내 보안 정책을 확인하세요.   (한 줄, 항상 표시)
```
- `[Tailscale 받기]` 버튼은 외부 링크(`https://tailscale.com/download`)를 연다(앱이 대신 설치하지 않음 — 범위 밖).
- state에 맞는 한 줄 안내만 강조한다(아래 7절 문구). 상태가 `running`으로 바뀌면 ①을 체크하고 ②·③을 보인다.
- 기존 가이드의 UPnP·포트 단계(2·3단계)는 이 모드에서 **건너뛴다**(지금 `lanOnly`가 `setStep(4)`로 가는 것과 같은 구조).

### 6-2. 같은 네트워크 전용
지금의 `lanOnly:true` 화면 그대로. 문구는 `remote.lanMode.on` 유지. 라벨만 라디오로 바뀐다.

### 6-3. 고급: 공유기 포트 열기
지금의 `lanOnly:false` 화면 그대로(UPnP 시도 → 실패 시 수동 포트포워딩 안내). 라벨 아래에 "회사·공용 망에서는 권하지 않아요" 유지.

### 6-4. 예전 사용자 안내 배너 (`isTsNoticePending`)
`router`·`lan`에서 `isTsNoticeSeen === false`이면 원격 설정 맨 위에 배너 1개: 문구 `remote.ts.notice`, 버튼 [Tailscale로 바꾸기] [그대로 쓰기]. 두 버튼·닫기 모두 다시 안 뜬다. (`isLanNoticePending`과는 별개로 계산 — 둘이 동시에 뜨면 Tailscale 배너만 보인다.)

## 7. 문구 (4개 언어, `featuresB.ts` 키)
정리드가 그대로 복사한다. 키 접두사 `remote.mode.*`, `remote.ts.*`.

```ts
'remote.mode': { ko: '연결 방식', en: 'Connection method', ja: '接続方式', zh: '连接方式' },
'remote.mode.tailscale': { ko: 'Tailscale (추천)', en: 'Tailscale (recommended)', ja: 'Tailscale(おすすめ)', zh: 'Tailscale（推荐）' },
'remote.mode.tailscale.desc': {
  ko: '공유기 설정 없이 밖에서도 접속돼요. PC와 휴대폰에 Tailscale이 필요해요.',
  en: 'Connect from anywhere with no router setup. Tailscale is needed on both the PC and the phone.',
  ja: 'ルーターの設定なしで外出先からも接続できます。PCとスマホの両方にTailscaleが必要です。',
  zh: '无需设置路由器，在外部也能连接。电脑和手机都需要安装 Tailscale。' },
'remote.mode.lan': { ko: '같은 네트워크 전용', en: 'Same network only', ja: '同じネットワーク専用', zh: '仅限同一网络' },
'remote.mode.router': { ko: '고급: 공유기 포트 열기', en: 'Advanced: open a router port', ja: '詳細設定：ルーターのポートを開ける', zh: '高级：开放路由器端口' },
'remote.mode.router.desc': {
  ko: 'UPnP 자동 설정이나 수동 포트포워딩을 써요. 회사·공용 망에서는 권하지 않아요.',
  en: 'Uses UPnP auto-setup or manual port forwarding. Not recommended on company or public networks.',
  ja: 'UPnPの自動設定か手動のポート転送を使います。会社や公共のネットワークではおすすめしません。',
  zh: '使用 UPnP 自动设置或手动端口转发。不建议在公司或公共网络中使用。' },
'remote.ts.step1': { ko: '① 이 PC에 Tailscale을 설치하고 로그인하세요', en: '① Install Tailscale on this PC and sign in', ja: '① このPCにTailscaleをインストールしてログインしてください', zh: '① 在此电脑上安装 Tailscale 并登录' },
'remote.ts.step2': { ko: '② 휴대폰에도 Tailscale을 설치하고 같은 계정으로 로그인하세요', en: '② Install Tailscale on your phone and sign in with the same account', ja: '② スマホにもTailscaleをインストールし、同じアカウントでログインしてください', zh: '② 在手机上也安装 Tailscale，并用同一账号登录' },
'remote.ts.step3': { ko: '③ 아래 QR을 휴대폰의 Claude Office로 찍으세요', en: '③ Scan the QR below with Claude Office on your phone', ja: '③ 下のQRをスマホのClaude Officeで読み取ってください', zh: '③ 用手机上的 Claude Office 扫描下方二维码' },
'remote.ts.corp': { ko: '회사 PC라면 Tailscale을 써도 되는지 사내 보안 정책을 먼저 확인하세요.', en: 'On a company PC, check your security policy first to make sure Tailscale is allowed.', ja: '会社のPCの場合は、Tailscaleを使ってよいか社内のセキュリティポリシーを先に確認してください。', zh: '如果是公司电脑，请先确认公司安全政策是否允许使用 Tailscale。' },
'remote.ts.download': { ko: 'Tailscale 받기', en: 'Get Tailscale', ja: 'Tailscaleを入手', zh: '获取 Tailscale' },
'remote.ts.recheck': { ko: '다시 확인', en: 'Check again', ja: '再確認', zh: '重新检查' },
'remote.ts.state.notInstalled': { ko: 'Tailscale이 설치되어 있지 않아요', en: 'Tailscale is not installed', ja: 'Tailscaleがインストールされていません', zh: '未安装 Tailscale' },
'remote.ts.state.needsLogin': { ko: 'Tailscale에 로그인하지 않았어요. Tailscale 앱에서 로그인하세요', en: "You're not signed in to Tailscale. Sign in from the Tailscale app", ja: 'Tailscaleにログインしていません。Tailscaleアプリでログインしてください', zh: '尚未登录 Tailscale，请在 Tailscale 应用中登录' },
'remote.ts.state.stopped': { ko: 'Tailscale이 꺼져 있어요. Tailscale을 켜 주세요', en: 'Tailscale is turned off. Please turn it on', ja: 'Tailscaleがオフになっています。オンにしてください', zh: 'Tailscale 已关闭，请将其打开' },
'remote.ts.state.running': { ko: 'Tailscale 연결됨 ({address})', en: 'Tailscale connected ({address})', ja: 'Tailscale接続済み（{address}）', zh: 'Tailscale 已连接（{address}）' },
'remote.ts.notice': {
  ko: '이제 공유기 설정 없이 밖에서도 접속할 수 있는 Tailscale 방식이 있어요. 지금 쓰던 방식은 그대로 유지돼요.',
  en: "There's now a Tailscale option that connects from anywhere with no router setup. Your current method stays as it is.",
  ja: 'ルーターの設定なしで外出先から接続できるTailscale方式が追加されました。今までの方式はそのまま使えます。',
  zh: '现在可使用 Tailscale 方式，无需设置路由器即可在外部连接。您当前的方式保持不变。' },
'remote.ts.notice.switch': { ko: 'Tailscale로 바꾸기', en: 'Switch to Tailscale', ja: 'Tailscaleに切り替える', zh: '切换到 Tailscale' },
'remote.ts.notice.keep': { ko: '그대로 쓰기', en: 'Keep current', ja: 'このまま使う', zh: '保持不变' },
'remote.ts.error.waiting': { ko: 'Tailscale 주소를 기다리고 있어요. Tailscale이 켜지고 로그인되면 자동으로 열어요.', en: 'Waiting for a Tailscale address. It opens automatically once Tailscale is on and signed in.', ja: 'Tailscaleのアドレスを待っています。Tailscaleがオンになりログインされると自動で開きます。', zh: '正在等待 Tailscale 地址。Tailscale 开启并登录后将自动开放。' },
'remote.mode.changed': { ko: '연결 방식을 바꿨어요. 휴대폰이 접속되지 않으면 QR을 다시 찍어 주세요.', en: "The connection method changed. If your phone can't connect, scan the QR code again.", ja: '接続方式を変更しました。スマホが接続できない場合は、QRをもう一度読み取ってください。', zh: '连接方式已更改。如果手机无法连接，请重新扫描二维码。' },
```
기존 `remote.lanMode*` 키는 `remote.mode.changed`로 합친 것만 지우고, 나머지는 라벨 교체 후 정리(미사용 키는 정리드가 제거).

안드로이드 문구(임안드, 앱 문자열 리소스 4개 언어):
```
android.ts.connectFail
  ko: 휴대폰 Tailscale이 켜져 있는지 확인하세요. PC와 같은 계정으로 로그인되어 있어야 해요.
  en: Check that Tailscale is turned on on your phone and signed in with the same account as the PC.
  ja: スマホのTailscaleがオンになっているか確認してください。PCと同じアカウントでログインしている必要があります。
  zh: 请确认手机上的 Tailscale 已开启，并与电脑使用同一账号登录。
```

## 8. 안드로이드 (임안드)
- QR의 `ts:true`를 읽어 저장한다(모르는 필드 무시 규칙은 그대로, 이 필드만 쓰기 시작). `host`가 100.x여도 연결 코드는 그대로 `https://<host>:<port>`다. **기존 연결 경로·SPKI 고정·토큰 처리는 바꾸지 않는다.**
- 100.x로 붙을 수 있는지 **실기기 확인**(사무실 PC + LTE, 완료 기준 1): 확인할 것 — 앱이 사용하는 네트워크 스택이 Tailscale VPN 인터페이스로 라우팅되는지, `networkSecurityConfig`·cleartext 제한에 걸리지 않는지(HTTPS라 해당 없음 예상), 연결 시간 제한 값(Tailscale 중계 첫 연결은 느릴 수 있어 시간 제한이 짧으면 늘릴 것: 확인 필요).
- `ts`가 true인 연결이 시간 초과·연결 거부로 실패하면 `android.ts.connectFail`를 보인다. 인증서 불일치·`token_revoked`·`401` 등은 **기존 안내 그대로**(원인이 다르므로 섞지 않는다).
- `lan` 먼저 시도하는 동작은 그대로다. `ts` QR에는 `lan`이 없으므로 그 단계가 자연히 생략된다. `ts`가 있는 QR이 `lan`도 갖고 있으면(규격 위반) `lan`을 무시한다.
- `hello`의 `ts`·`tsHost`로 저장된 host를 갱신한다(5절).

## 9. 규격·문서 수정 위치 (이 업무에서 이미 반영)
| 파일 | 수정 |
|---|---|
| `docs/specs/remote-protocol-v1.md` | 8절 QR 표에 `ts` 행, `lan`과의 관계, 연결 규칙(ts 모드는 100.64/10만 받음), 변경 이력 1줄 |
| `docs/specs/remote-protocol-v2.md` | `hello` 결과의 `ts`·`tsHost`, 변경 이력 1줄 |
| `SPEC.md` 24번 | 연결 방식 3가지·Tailscale 모드 요약 한 문장 묶음 추가 |
| `CHANGELOG*.md`·`README*` | 구현 완료 시 구현 담당이 갱신(이 업무 범위 밖) |

## 10. 담당·인수 기준
| 담당 | 할 일 | 끝났다는 기준 |
|---|---|---|
| 강백엔 | 3·4·5절: `mode` 마이그레이션(2절), `pickTailscaleAddress`·상태 감지, `isTailscaleClient`·바인딩·TLS 전 차단, `qr.ts`·`hello`, 테스트 | `tsc`·`scripts/remote*.test.mts` 통과, 2절 표 4개 행 테스트 |
| 정리드 | 6·7절: 연결 방식 라디오·단계 안내·상태 줄·배너, 4개 언어 키, IPC(`setRemoteMode`, 상태 읽기) 연결 | 모드별 화면이 6절과 같음, 4개 언어 누락 없음 |
| 임안드 | 8절: `ts` 읽기·실패 안내·host 갱신, 실기기 확인 | 사무실 PC+LTE에서 QR 연결·결재·지시 확인 기록 |
- 순서: 강백엔이 `RemoteStatus`(`mode`, `tsState`, `tsAddress`, `isTsNoticePending`)와 `setRemoteMode(mode)` 인터페이스를 **먼저** 정해 정리드에게 넘긴다. 임안드는 QR 규격만 있으면 병행 가능.
- 대표 확인 전까지 배포·커밋·버전 올리기 금지(버전 번호는 정하기 전에 대표에게 먼저 묻는다).
