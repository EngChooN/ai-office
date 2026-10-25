# 안드로이드 셸 ↔ 화면 브리지 계약 (앱 1.1.0)

> 작성: 임안드 · 2026-10-23 · 갱신: 정리드의 모바일 빌드(`app/src/renderer/mobile/bridge.ts`·`install.ts`·`remoteOffice.ts`)와 줄 단위 대조 완료, 스위치 제거·동시 5개 반영 · 상위 업무 "안드로이드 앱 1.1: PC 화면 그대로 옮기기" 6/9단계
> 읽는 사람: 최가독(모바일 빌드·원격 어댑터), 한리뷰(보안 리뷰), 오큐에이(QA).
> 구현: `android/app/src/main/java/com/claudeoffice/remote/web/` (`WebShell.kt`, `BridgeProtocol.kt`, `EventStream.kt`, `SseParser.kt`)
> 기준: `docs/specs/remote-protocol-v2.md`. 이 문서와 구현이 다르면 이 문서를 먼저 고친다.

## 1. 화면을 띄우는 방법
| 항목 | 값 |
|---|---|
| 빌드 결과 위치 | `app/dist-mobile/` (최가독의 `build:mobile`). 안드로이드 빌드가 이 폴더를 APK의 `assets/web/`으로 복사한다(`android/app/build.gradle.kts`의 `syncWebAssets`, `.map`은 뺌) |
| 입구 | `assets/web/mobile.html`(없으면 `index.html`) |
| 주소 | `https://appassets.androidplatform.net/app/mobile.html` — 자산 파일은 모두 `/app/` 아래. **Vite `base: './'`(상대 경로)** 여야 한다 |
| 화면 묶음이 없을 때 | 기존 네이티브 화면(1.0.x)을 그대로 쓴다 |
| 화면 묶음을 쓰는 조건 | 연결된 PC의 `/v1/status`가 `supportedProtocols`에 2를 담음 (v2 규격 2-1). 아니면(0.8.x) 네이티브 화면 + 안내 배너 "PC 앱을 0.9.0으로 업데이트…". "휴대폰에서 모든 기능 쓰기" 스위치는 대표 결정으로 없어져 보지 않는다(옛 `fullAccess` 필드가 와도 무시) |

### 셸이 막는 것
- **네트워크:** WebView의 모든 요청은 셸이 가로챈다. `/app/`의 자산과 `/office-file/{id}`(아래 5절) 말고는 전부 `403`. 인터넷·PC 주소·`content://`·`file://` 모두 막힌다.
- **CSP 머리글**(HTML 응답에 붙임): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`
  - **인라인 `<script>`는 실행되지 않는다.** 스크립트는 파일로 둔다(Vite 빌드는 기본이 파일이다).
  - `fetch`/`XHR`/`WebSocket`은 자산 출처에만 된다. PC와의 통신은 모두 아래 브리지로 한다.
- **탐색:** `/app/` 밖으로 이동(링크·`location` 변경)은 무시한다. 새 창(`window.open`) 없음.
- **권한:** 카메라·마이크·위치 요청은 거절한다. 파일 선택(`<input type=file>`)은 된다(사진은 시스템 사진 선택기, 그 밖은 파일 선택기).
- **디버깅:** 크롬 원격 디버깅은 디버그 빌드에서만 켜진다(릴리스는 꺼짐).

### 키보드 (한쪽만 올린다)
- **화면이 `ready`에 `features:["ime"]`를 보냄:** 셸은 키보드가 열려도 **WebView 크기를 줄이지 않는다.** 대신 `insets` 메시지와 `--ime`로 높이를 알려 준다. 화면이 아래 탭·입력창·여백을 `--ime`만큼 올린다(예: `bottom: var(--ime, 0px)`). 크기가 바뀌지 않아 키보드가 열릴 때 레이아웃이 다시 계산되며 포커스를 잃는 일이 없다.
- **안 보냄(예전 화면):** 셸이 WebView를 키보드 위까지 줄인다(`--ime`는 넣지 않는다).
- 두 방식을 동시에 쓰지 않는다 — 이중으로 올라가지 않게.
- 높이에는 시스템 내비게이션 바가 빠져 있다(셸이 이미 비켜 둠). targetSdk 35(edge-to-edge 강제)에서도 같은 값이다.

### 화면 크기
- `viewport-fit=cover`와 상관없이 **셸이 시스템 바·키보드 높이만큼 WebView를 줄여 준다.** 화면은 안전 영역을 따로 빼지 않아도 된다.
- 회전·창 크기 변경에 **페이지를 다시 읽지 않는다**(입력 중인 내용·스크롤이 유지됨). 폭이 바뀌면 `resize`가 오므로 CSS(미디어·컨테이너 쿼리)로 태블릿(840px 이상)·폰 배치를 바꾼다.
- `100vh`·`h-screen`은 WebView 높이와 같다(셸이 크기가 정해진 뒤에 페이지를 연다).

## 2. 메시지 통로
| 방향 | 방법 |
|---|---|
| 화면 → 셸 | `OfficeBridge.postMessage(JSON 문자열)` |
| 셸 → 화면 | `OfficeBridge.onmessage = (e) => { const msg = JSON.parse(e.data) … }` |

- `OfficeBridge`는 셸이 **자산 출처(`https://appassets.androidplatform.net`)의 최상위 프레임에만** 넣는다. iframe·다른 출처에서는 없고, 보내도 무시된다.
- 메시지는 모두 한 줄 JSON 문자열. 한 메시지 최대 28MB(첨부 20MB를 base64로 담는 경우).
- 셸은 화면의 `ready`를 받은 뒤에만 이벤트를 보낸다. 화면은 `onmessage`를 붙인 다음 `ready`를 보낸다.
- **id가 있는 요청에는 셸이 꼭 한 번 `result`로 답한다.** id는 `[A-Za-z0-9_.:-]{1,64}`.

## 3. 화면 → 셸
| `type` | 필드 | 셸이 하는 일 |
|---|---|---|
| `ready` | `features`(선택, 문자열 배열) | `hello`로 답하고 이벤트 스트림(SSE)을 연다. `features`에 `"ime"`가 있으면 키보드를 화면이 처리한다(아래 "키보드"). `"iso-office"`가 있으면 셸이 `/v2/call`·`/v2/events`(재연결 포함) 요청에 헤더 `X-Office-Capabilities: iso-office`를 싣는다 — 없으면 PC가 회사 레벨을 10으로 줄여 보낸다(`office-iso-tech.md` 4-3절). 셸은 아는 값(`iso-office`)만 넘긴다 |
| `call` | `id`, `method`, `args`(배열, 없으면 `[]`), `confirm`(선택) | `POST /v2/call {method, args, confirm}`. `Idempotency-Key`는 셸이 붙인다(같은 `id`로 다시 보내면 같은 키 → PC가 한 번만 처리) |
| `upload` | `id`, `name`, `mime`, `base64` | `POST /v2/attachments` 한 번. `saveAttachments(files)`는 어댑터가 파일마다 이것을 보내 `Attachment[]`로 모은다. 20MB 넘으면 셸이 `413 payload_too_large`로 바로 답한다 |
| `download` | `id`, `fileId`(UUID), `name` | `GET /v2/files/{fileId}`를 받아 **휴대폰의 다운로드 폴더에 저장**(`openAttachment` 대신). 결과는 저장한 이름 |
| `backResult` | `handled`(boolean) | 셸의 `back`에 대한 답 (4절) |

- `method`는 이름 모양(`^[A-Za-z][A-Za-z0-9]{0,63}$`)만 셸이 거른다. 어떤 메서드가 되는지는 PC가 정한다(`404 unknown_method`, `422 pc_only` 등).
- **동시에 PC로 가는 요청은 5개까지**(`call`·`upload`·첨부 그림 합산). 서버가 주소당 연결 8개를 받고 이벤트 스트림이 2개를 쓰기 때문이다(한리뷰 권고). 넘는 요청은 셸 안에서 차례를 기다린다 — 화면은 신경 쓰지 않아도 된다.

## 4. 셸 → 화면
| `type` | 필드 | 뜻 |
|---|---|---|
| `hello` | `platform: "android"`, `appVersion`, `protocol: 2`, `isTablet`(폭 840dp 이상) | `ready`에 대한 답 |
| `result` | `id`, `ok: true`, `result` | 호출 성공. `result`는 OfficeApi 반환값 그대로(`void`는 `null`) |
| `result` | `id`, `ok: false`, `error: {status, code, message, alternative?, reason?}` | 실패. 아래 표. `reason`은 422 `blocked`(칸 배치가 막힘)의 이유 |
| `event` | `name`, `data` | SSE 이벤트 그대로: `snapshot`·`log`·`chat`·`focus`·`remoteStatus` (`onSnapshot` 등에 넘기면 된다). 모르는 `name`은 무시 |
| `resync` | — | 이벤트를 놓쳤다(PC가 다시 켜짐·보관 범위 밖). `chatHistory()`·`timeline(sinceMs)`로 빈 구간을 다시 읽는다 (v2 8-3) |
| `connection` | `state`: `connecting`·`open`·`reconnecting`·`closed`, `reason?` | 이벤트 스트림 상태. 연결 배너용 |
| `insets` | `ime`(정수, CSS px) | 키보드가 WebView 아래를 가리는 높이. 0이면 닫힘. **`ready`에 `features:["ime"]`를 보낸 화면에만** 보낸다. 같은 값을 CSS 변수 `--ime`(`<html>` 인라인 스타일)로도 넣어 둔다 |
| `back` | — | 사용자가 뒤로 가기를 눌렀다. 시트·대화상자·이전 화면이 있으면 닫고 `{type:"backResult", handled:true}`, 없으면 `handled:false`. **400ms 안에** 답이 없거나 `false`면 셸이 앱을 뒤로 보낸다 |

### `error`
| `status` | `code` | 언제 | 화면이 할 일 |
|---|---|---|---|
| 400~504 | 서버의 `error` 그대로 (`pc_only`·`confirm_required`·`invalid_args`·`call_failed`·`already_decided`·`call_timeout` 등, v2 9절) | PC가 답함 | `message`를 PC 화면처럼 보인다. `pc_only`는 `alternative`(`enter_path`·`download_file`·`open_on_pc`)로 대체 동작 |
| 400 | `confirm_required` | 연결이 끊기는 설정 변경 | 사용자에게 `message`로 확인받고 같은 호출을 `confirm: true`로 다시 |
| 0 | `phone_offline`·`unreachable`·`remote_off` | 응답을 못 받음 | 다시 시도 안내. **연결 끊김 배너는 화면이 하나만 그린다** — 셸은 웹 화면 위에 배너를 그리지 않고, 다시 연결(`connection: open`·호출 성공)되면 셸의 연결 상태도 함께 풀린다 |
| 0 | `token_revoked`·`unauthorized`·`auth_locked`·`pin_mismatch` | 연결 자체가 막힘 | 할 일 없음 — 셸이 화면을 내리고 네이티브 상태 화면(QR 다시 찍기·잠김 카운트다운·인증서 불일치)으로 바꾼다 |
| 0 | `protocol_unsupported` | PC가 v2를 모름(0.8.x) | 할 일 없음 — 셸이 네이티브 화면 + "PC 앱을 0.9.0으로 업데이트" 안내로 내려간다 |
| 0 | `rate_limited`·`office_unavailable`·`internal_error` | 잠시 뒤 | 잠시 뒤 다시 |

- `window.confirm`·`alert`·`prompt`는 셸이 네이티브 창으로 보여 준다(그대로 써도 된다).

## 5. 첨부 그림 주소 (`office-file`)
- 화면은 PC와 같은 `office-file://file/{id}` 또는 `https://appassets.androidplatform.net/office-file/{id}`를 `<img src>` 등에 쓴다. 셸이 가로채 `GET /v2/files/{id}`(지문 고정)로 받아 넘긴다. 토큰은 주소·화면에 나오지 않는다.
- `{id}`는 UUID(36자)만. 경로 문자는 받지 않는다. 없으면 `404`(깨진 그림).
- 박패턴 설계의 `__OFFICE_FILE_BASE__`는 `https://appassets.androidplatform.net/office-file/`로 두면 된다.

## 6. 그대로 두는 것 (1.0.x와 같음)
QR 연결(`lan` 우선, 지문 고정), Keystore 토큰, 15분 WorkManager 알림(화면이 보이지 않을 때는 SSE를 닫고 v1 조회로 알림), 상태 화면 A~L, 연결 끊기. 화면이 백그라운드로 가면 셸이 `/v1/decisions`를 한 번 읽어 화면에서 본 결정을 다시 알리지 않게 한다.

## 7. 시험 페이지 (디버그 빌드만)
화면 묶음이 없을 때 셸·브리지를 확인하는 페이지가 `android/app/src/debug/assets/bridge-test/`에 있다(릴리스 APK에는 없음). 위 계약을 그대로 쓰므로 어댑터를 만들 때 예시로 볼 수 있다.
```
adb shell am start -n com.claudeoffice.remote.debug/com.claudeoffice.remote.MainActivity --ez bridgeTest true
```
가짜 사무실로 v1+v2+SSE를 띄우는 서버: `node android/tools/dev-server-v2.mts 47920 10.0.2.2` (PC 앱의 실제 원격 코드를 쓴다).
