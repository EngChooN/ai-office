# 원격 프로토콜 v2 규격 (OfficeApi 전체 원격 호출)

> 작성: 김버전(버전관리) · 2026-10-23 · 상위 업무 "안드로이드 앱 1.1: PC 화면 그대로 옮기기" 1/9단계
> 기준: 기획서(수정 2), `docs/specs/remote-protocol-v1.md`, `app/src/shared/types.ts`의 `OfficeApi`, `app/src/preload.ts`. **코드는 고치지 않았다.**
> 읽는 사람: 박패턴(구조), 이디자·최가독(화면·어댑터), 구현 담당(PC 서버, 12절 2번), 임안드(앱 셸·브리지), 한리뷰(보안 리뷰), 오큐에이(검증). 이 문서가 계약이다. 구현과 다르면 이 문서를 먼저 고친다.

## 1. 한눈에
v2는 PC 화면이 부르는 `window.office`(OfficeApi) 전체를 휴대폰이 그대로 부를 수 있게 하는 프로토콜이다. **v1은 그대로 유지**하고 v2를 **옆에 더한다**(PC 서버가 v1·v2를 함께 제공).

| # | 메서드·경로 | 기능 |
|---|---|---|
| 1 | `POST /v2/call` | OfficeApi 메서드 하나를 부른다 `{method, args}` |
| 2 | `GET /v2/events` | 서버가 보내는 이벤트 스트림(SSE). OfficeApi의 모든 `on*` 이벤트 |
| 3 | `POST /v2/attachments` | 첨부 파일 올리기(파일 하나씩, 바이트 그대로) |
| 4 | `GET /v2/files/{id}` | 사무실 파일(첨부 이미지 등) 받기. PC 화면의 `office-file://file/{id}`에 해당 |
| — | v1 4종 | `/v1/status`·`/v1/decisions`·`/v1/decisions/{id}`·`/v1/instructions`. 규격 그대로. 1.0.x 앱이 계속 쓴다 |

| 항목 | 값 |
|---|---|
| 프로토콜 버전 | 정수 **2**. 경로 `/v2/`, v2 응답 본문의 `protocolVersion: 2` |
| 전송·형식·시각·id | v1 1절과 같다(HTTPS 자체 서명 + 인증서 고정, JSON UTF-8, 시각은 에포크 밀리초 정수, id는 불투명 문자열) |
| 인증·잠금 | v1과 **같다**(4·7절 참조, 이 문서 10절) |
| 기본 상태 | 원격 기능 **기본 꺼짐**. 원격을 켜면 v1·v2 모두 바로 쓴다(별도 스위치 없음, 3절) |

## 2. 버전 표기, 발견, 호환
### 2-1. v2를 지원하는지 알아내는 법
앱(1.1 이상)은 **연결하는 순서**를 이렇게 한다.
1. QR을 읽는다. QR의 `v`는 **계속 1**이다(1.0.x 앱이 QR을 거부하지 않도록). v2를 지원하는 PC는 QR에 **선택 필드 `pv`**(최대 프로토콜 버전, 정수)를 더한다. `pv`가 없으면 v1만 아는 PC로 본다.
2. `GET /v1/status`로 연결을 확인한다(인증서 지문·토큰 확인). 지원하는 PC의 응답에는 **선택 필드 두 개**가 더 들어 있다(v1 앱은 무시).

```json
{
  "protocolVersion": 1,
  "serverVersion": "0.9.0",
  "supportedProtocols": [1, 2],
  "fullAccess": true,
  "...": "v1 규격의 나머지 필드"
}
```
| 필드 | 타입 | 뜻 |
|---|---|---|
| `supportedProtocols` | 정수 배열 | 이 PC가 제공하는 프로토콜 버전. 없으면 `[1]`로 본다 |
| `fullAccess` | boolean | v2 호출이 허용되는지. 0.9.0부터 **항상 `true`**(전체 기능 스위치는 없앴다 — 12절 1번). 1.0.x·1.1 앱 호환을 위해 남긴다. 없으면 `false` |

3. 앱은 아래처럼 정한다. **`supportedProtocols`가 권위**다(QR의 `pv`는 첫 힌트일 뿐).

| `supportedProtocols` | `fullAccess` | 앱 동작 |
|---|---|---|
| 없음 또는 `[1]` | — | **v1 모드.** v1 4종 화면만. "PC의 Claude Office를 0.9.0 이상으로 올리면 모든 기능을 쓸 수 있어요" 안내 |
| `[1, 2]` | `true` | **v2 모드.** `/v2/*` 사용 (0.9.0 PC는 늘 이 경우) |
| `[1, 2]` | `false` | 지금 PC는 보내지 않는다(스위치를 없앴다). 받으면 v1 모드 |

- `403 v2_disabled`는 **보내지 않는다**(폐지 — 원격이 꺼지면 포트가 닫혀 연결 자체가 안 된다). 앱은 이 코드의 전용 화면을 두지 않아도 된다. 혹시 받으면 v1 모드로 내려간다.
- **보조 확인:** v1만 아는 PC에 `/v2/…`를 부르면 v1 규격 2-4절대로 `426 protocol_unsupported`(`supported: [1]`)가 온다(인증보다 먼저 판단). 앱은 이를 "v1만 지원"으로 해석한다.

### 2-2. 호환 규칙
- v1의 규칙을 그대로 따른다: **모르는 필드는 양쪽 모두 무시**, 모르는 enum 값은 안전한 대체 표시, 하위 호환을 지키는 변경(선택 필드·새 오류 코드·새 메서드·새 이벤트 추가)은 버전을 올리지 않는다(v1 2-2·2-3절).
- 단, **`args` 배열**은 필드가 아니라 자리가 정해진 값이므로 **남는 인자는 `400 invalid_args`** 로 거절한다(4-3절).
- v1 서버·앱은 이 문서 때문에 **바뀌는 것이 없다.** v1 응답에 더해지는 것은 위 선택 필드 두 개(`supportedProtocols`, `fullAccess`)와 QR의 `pv`뿐이다.
- v2를 깨는 변경(필드 삭제·의미 변경·필수 필드 추가·메서드 의미 변경)은 v3로 올린다.

### 2-3. 호환 표
| 데스크톱 | 안드로이드 | 쓰는 프로토콜 | 사용자가 보는 것 |
|---|---|---|---|
| 0.8.x | 1.0.x | v1 | 지금과 같다 |
| 0.9.0 이상 | 1.0.x | v1 | 지금과 같다(1.0.x 앱도 계속 연결) |
| 0.8.x | 1.1.x | v1 | v1 4종 화면 + "PC를 올리면 전체 기능" 안내 |
| 0.9.0 이상 | 1.1.x | v2 | 전체 기능 (원격이 켜져 있으면 바로) |

## 3. 보안 모델이 달라지는 점
v1은 4종만 열었지만 **v2는 PC 조작 전체를 연다.** 토큰을 가진 사람은 직원 고용·퇴사, 설정 변경, 결재 승인, 지시, 커밋·푸시까지 PC에서 직접 하는 것과 같은 일을 할 수 있다.

- **전체 기능 스위치는 없다(대표 결정 — 12절 1번):** 휴대폰 연결(원격)이 켜져 있으면 v2(PC 전체 기능)를 바로 쓴다. 원격이 꺼져 있으면 포트가 닫혀 v1·v2 모두 연결되지 않는다. 예전에 저장된 `isFullAccess` 값은 무시한다. 대신 PC 연결 가이드 첫 단계에서 알린다: "QR을 찍은 휴대폰은 이 PC의 Claude Office를 모두 조작할 수 있어요(고용·설정·결재 포함). QR을 남에게 보이지 말고, 휴대폰을 잃어버리면 QR을 다시 만드세요."
- **인증·잠금·오류는 v1과 같다.** 같은 토큰(`Authorization: Bearer`), 같은 IP별·전체 잠금, 같은 401 세 종류, 같은 판단 순서(v1 2-4절). 단 `/v2/*`의 오류 본문은 `protocolVersion: 2`다(401 포함).
- **본문보다 인증이 먼저:** `/v2/*`는 본문을 읽기 **전에** 버전·잠금·인증·속도를 판단한다. 막히면 본문을 한 바이트도 읽지 않고 답한 뒤 `Connection: close`로 닫는다. `/v2/call`의 1MB 본문은 인증된 요청만 받는다(v1은 16KB 그대로).
- **원격 설정 자체를 폰에서 바꿀 때:** 이 폰의 연결을 끊게 되는 메서드(`setRemoteEnabled`로 끄기·포트 바꾸기, `regenerateRemoteQr`)는 호출에 **`"confirm": true`가 없으면 `400 confirm_required`** 로 거절하고 무슨 일이 일어나는지 `message`로 알려 준다. 앱은 사용자에게 한 번 확인받은 뒤 `confirm: true`로 다시 부른다(4-4절).
- **경로를 받는 메서드**(작업 폴더·참고 문서·매뉴얼 경로 등)는 폰이 PC 폴더를 탐색할 수 없고(`pickFolder`는 `pc_only`) 사용자가 글자로 입력한 경로를 보낸다. PC 서버는 **PC 화면과 같은 검사**를 하고, `saveManual`의 `previousPath`·`deleteManual`의 `path`는 **`listManuals()`가 돌려준 경로만** 받는다(5-3절 S 표시).
- **첨부는 `id`만 믿는다.** 폰이 보낸 첨부 정보에서 `path`·`name`·`mime`·`size`는 **무시**하고 서버가 `id`로 저장소에서 다시 찾아 쓴다(7절). 폰이 보낸 `path`로 PC의 아무 파일이나 직원에게 읽히는 일을 막는다.
- **응답에서 빼는 것은 하나:** `Attachment.path`(PC의 절대 경로)는 모든 응답·이벤트에서 **재귀로 제거**한다. 그 밖의 필드는 PC 화면이 받는 것과 **같게** 보낸다(v1처럼 작업 폴더·지침·비용을 빼지 않는다 — 기획서 "기능을 줄이지 않는다"). 토큰·토큰 해시·개인 키는 OfficeApi에 없으므로 나가지 않는다.
- **QR·토큰은 폰에 내려 주지 않는다.** `remoteQr()`는 `pc_only`다.

## 4. `POST /v2/call`
### 4-1. 요청
```
POST /v2/call
Authorization: Bearer <token>
Content-Type: application/json; charset=utf-8
Idempotency-Key: <클라이언트가 만든 UUID>   (권고, 4-6절)
```
```json
{ "method": "decide", "args": ["a.…", true] }
```
| 필드 | 타입 | 설명 |
|---|---|---|
| `method` | string | 5절 표에 있는 OfficeApi 메서드 이름(대소문자 구분) |
| `args` | 배열 | PC 화면이 `window.office.<method>(...)`에 넘기는 **인자 목록 그대로**. 없으면 `[]` |
| `confirm` | boolean(선택) | 4-4절의 확인이 필요한 메서드에서만 `true` |
- 본문은 최대 **1MB**(인증된 요청만 — 인증 전에는 본문을 읽지 않는다, 3절). 넘으면 `413 payload_too_large`(v1과 같은 두 갈래). 파일 바이트는 여기에 담지 않는다(7절).
- **객체 인자는 메서드별 허용 필드만** 쓴다. 표에 없는 필드(예: `updateTask`에 `id`·`attachments`·`plan`)는 **조용히 버린다**(오류 아님). 허용 필드는 `types.ts` 시그니처의 필드 그대로이며 맨 위 필드만 고른다 — 예: `updateTask`는 `title, detail, status, teamId, labId, assigneeId`. 표는 서버 코드 `V2_FIELDS`(타입으로 시그니처와 맞춤). `answerQuestion`의 답 표(질문 → 답)는 고르지 않는다.

### 4-2. 응답
성공 `200`
```json
{ "protocolVersion": 2, "serverTime": 1790000000000, "ok": true, "result": { } }
```
- `result`는 OfficeApi 메서드의 반환값을 JSON으로 바꾼 것이다. 반환이 `void`(`undefined`)면 `null`.
- 모든 `result`에서 `Attachment.path`는 제거된다(3절).
- 오류는 v1과 같은 모양이다(`error`·`message`, 필요하면 `retryAt`·`retryAfterSec`) + v2 오류에는 `method`가 붙는다. 코드표는 9절.

### 4-3. 인자 검사
- 서버는 메서드마다 **인자 개수와 타입을 검사**한다(`types.ts`의 시그니처가 기준). 필수 인자가 없거나 타입이 틀리거나 **남는 인자**가 있으면 `400 invalid_args`, `message`에 틀린 위치(예: `args[1]`)를 쓴다. 값은 오류 본문에 되돌려 보내지 않는다.
- 뒤쪽 선택 인자(`attachments?`, `port?` 등)는 생략하거나 `null`로 줄 수 있다.
- 문자열 길이·배열 길이의 상한은 PC 화면이 만드는 값보다 넉넉하되 본문 1MB 안이다.
- 인자 직렬화: JSON으로 표현되는 값만(문자열·숫자·불리언·`null`·배열·객체). `undefined`는 `null`로 대신하거나 생략. `ArrayBuffer`는 어떤 메서드도 `/v2/call`로 받지 않는다(`saveAttachments`는 7절).

### 4-4. 확인이 필요한 호출 (`confirm_required`)
| 메서드 | 확인이 필요한 경우 | 호출 뒤 일어나는 일 |
|---|---|---|
| `setRemoteEnabled(isEnabled, port?)` | `isEnabled: false`이거나 **현재 포트와 다른** `port`를 줄 때 | 서버가 닫히고 모든 폰이 끊긴다 |
| `regenerateRemoteQr()` | 항상 | 이전 토큰이 폐기되어 **이 폰도 끊긴다**(다음 요청이 `401 token_revoked`) |
- `confirm: true` 없이 부르면 `400 confirm_required`, `message`에 "이 폰의 연결이 끊어져요" 같은 문장을 담는다. 서버는 **아무것도 바꾸지 않는다.**
- **포트 바꾸기**의 `message`는 PC 화면 확인 창과 같은 문장이다: "포트를 바꾸면 연결된 휴대폰이 끊기고, 새 QR을 다시 찍어야 해요. 바꾼 포트는 앱을 다시 켜도 그대로예요. 공유기에서 직접 포트포워딩했다면 공유기 설정도 바꿔야 해요." 바꾼 포트는 설정에 저장되어 다음 실행 때도 그 포트로 연다.
- `confirm: true`로 부르면 서버는 **응답을 먼저 보낸 뒤** 변경을 적용한다(응답이 이 폰에 닿을 수 있도록). `regenerateRemoteQr`의 `result`는 `RemoteStatus`이며 새 QR은 폰에 내려 주지 않는다(3절).
- 그 밖의 원격 설정 메서드(`remoteStatus`, `setRemoteHost`)는 확인 없이 부를 수 있다.

### 4-5. 오래 걸리는 호출과 시간 제한
- `/v2/call` 한 번의 처리 시간 상한은 **120초**. 넘으면 서버는 `504 call_timeout`을 보낸다. **PC에서의 처리는 계속될 수 있다**(결과만 못 받음). 앱은 `snapshot`·SSE로 결과를 확인한다.
- 오래 걸릴 수 있는 메서드: `draftManual`, `refreshPlanUsage`(Claude를 한 번 부름), `suggestCommitMessage`, `commitChanges`, `pushAndCreatePr`, `workChanges`, `claudeStatus`, `startRun`, `startMeeting`, `equipmentCatalog`, `listAgentTemplates`. 앱은 진행 표시를 보여 준다.
- 한 토큰에서 **동시에 처리 중인 `/v2/call`은 최대 8개**. 넘으면 `429 rate_limited`(`retryAfterSec: 1`).

### 4-6. 같은 요청을 다시 보냈을 때 (`Idempotency-Key`)
네트워크가 끊겨 응답을 못 받고 다시 보내면 `hire`·`createTask`처럼 만드는 호출이 **두 번 처리**될 수 있다. 그래서:
- 앱은 `/v2/call`마다 **`Idempotency-Key`(UUID)** 를 보낸다(조회 메서드는 생략해도 된다).
- 서버는 (토큰, 키)로 **10분 동안** 같은 요청을 한 번만 처리하고, 두 번째부터는 **저장한 응답을 그대로** 돌려준다. 처리 중이면 `409 in_progress`(`retryAfterSec`).
- 응답이 256KB를 넘어 저장하지 못했으면 두 번째부터 `409 duplicate_call`을 준다. 앱은 `snapshot`으로 결과를 확인한다.
- 같은 키에 **다른** 본문을 보내면 `400 invalid_request`.

## 5. 메서드 분류 (OfficeApi 전체)
OfficeApi는 **메서드 84개 + 값 1개(`platform`) + 이벤트 5개**다(구현 중 더했던 전체 조작 스위치 `setRemoteFullAccess`는 스위치 폐지로 지웠다 — 폰이 부르면 `404 unknown_method`). 목록은 `shared/officeApiShape.ts`의 `OFFICE_METHODS`·`OFFICE_EVENTS` 한 곳에 두고 `preload.ts`·v2 분류표가 같이 쓴다(OfficeApi와 어긋나면 tsc 실패). 호출 이름은 `types.ts`의 이름 그대로다.

### 5-1. 분류 기호
| 기호 | 뜻 | 폰에서 부르면 |
|---|---|---|
| **R** | 그대로 호출 | 실행하고 `result`를 돌려준다 |
| **S** | 호출은 되지만 **PC의 파일·명령·외부 서비스**에 영향이 있다 | 실행한다. 서버는 **PC 화면과 같은 검사**를 한다(경로 검사 등). 앱은 PC 화면과 같은 확인 창을 띄운다 |
| **P** | PC 전용 | `422 pc_only`(5-2절) |
| **C** | 연결에 영향을 주는 호출 | `confirm: true` 필요(4-4절) |
| **U** | 올리기 경로로 대신한다 | `400 use_upload`(7절) |
- 표의 **첨부** 열의 "첨부 인자"는 `Attachment[]`를 받는 자리다(7절의 `id`만 믿는 규칙이 적용된다).
- "판정 409"는 PC 화면 서버 쪽에서 **이미 처리됐는지 알 수 있는** 호출이다. 처리되지 않았으면 v1처럼 `409 already_decided`를 준다.

### 5-2. PC 전용 호출 (7개)
| 메서드 | 이유 | `alternative` 힌트 | 폰 화면에서의 대신 |
|---|---|---|---|
| `pickFolder` | PC의 폴더 고르기 창 | `enter_path` | 경로를 **직접 입력**하거나 **최근 폴더**에서 고른다(앱이 `snapshot`의 직원·랩 `cwd` 값을 모아 만듦) |
| `pickFiles` | PC의 파일 고르기 창(참고 문서) | `enter_path` | 경로를 직접 입력, `missingFiles`로 존재 확인 |
| `openAttachment` | PC에서 파일을 연다 | `download_file` | `GET /v2/files/{id}`로 받아서 폰에서 연다(7절) |
| `resumeInTerminal` | PC의 터미널을 연다 | `open_on_pc` | "PC에서 열어 주세요" 안내 |
| `openClaudeLogin` | PC의 로그인 터미널을 연다 | `open_on_pc` | "PC에서 열어 주세요" 안내 |
| `remoteQr` | 토큰이 든 QR을 폰에 내려 주지 않는다(3절) | `open_on_pc` | "PC 화면에서 QR을 만드세요" 안내 |
| `revertWork` | 파일을 되돌리는(취소 불가) 동작은 PC 확인 창에서만 | `open_on_pc` | "PC에서 열어 주세요" 안내 |
- **화면 캡처:** OfficeApi에는 캡처 메서드가 **없다**(`capture_screen`은 직원이 쓰는 사무실 도구다). 그래서 이 표에 없고 v2에서 할 일도 없다.
- `pc_only` 응답:
```json
{ "protocolVersion": 2, "error": "pc_only", "message": "PC에서 열어 주세요", "method": "resumeInTerminal", "alternative": "open_on_pc" }
```
상태는 **`422`**. `alternative`는 선택 필드이며 `enter_path`·`download_file`·`open_on_pc` 중 하나다(모르는 값이면 앱은 `message`만 보인다). 앱은 PC 전용 버튼을 폰 화면에서 안내 문구로 바꿔 보여 준다.

### 5-3. 전체 분류표
`platform`은 폰에서는 **셸이 로컬 값(`"android"`)으로 채운다**(원격 호출 없음, 화면은 `window.office.platform`으로 읽음).

| # | 메서드 | 분류 | 첨부 | 메모 |
|---|---|---|---|---|
| 1 | `remoteStatus` | R | | |
| 2 | `setRemoteEnabled` | C | | 끄기·포트 변경만 확인 필요 |
| 3 | `regenerateRemoteQr` | C | | 이 폰도 끊김 |
| 4 | `remoteQr` | P | | `open_on_pc` |
| 5 | `setRemoteHost` | R | | |
| 6 | `snapshot` | R | | 크다. 응답은 gzip 가능(5-4절). 이벤트와 같은 모양 |
| 7 | `hire` | S | | `cwd` 경로 입력. 이전 호출과 같은 키면 두 번 고용 안 함 |
| 8 | `fire` | R | | 되돌릴 수 없음 → 앱이 확인 창 |
| 9 | `updateStaff` | S | | `cwd`·`systemPrompt` 변경 |
| 10 | `instruct` | R | 첨부 인자 | |
| 11 | `saveAttachments` | U | | 7절 |
| 12 | `openAttachment` | P | | `download_file` |
| 13 | `interrupt` | R | 첨부 인자 | |
| 14 | `resumeInTerminal` | P | | `open_on_pc` |
| 15 | `decide` | R | | 판정 409 |
| 16 | `getRecord` | R | | |
| 17 | `listAgentTemplates` | S | | `cwd` 폴더를 읽는다 |
| 18 | `pickFolder` | P | | `enter_path` |
| 19 | `hooksStatus` | R | | |
| 20 | `setHooksInstalled` | P | `open_on_pc` | PC의 Claude 설정 파일을 고친다 (0.13.0: S → P) |
| 21 | `setAskHookInstalled` | P | `open_on_pc` | PC의 Claude 설정 파일을 고친다 (0.13.0: S → P) |
| 22 | `createTeam` | R | | |
| 23 | `updateTeam` | R | | |
| 24 | `deleteTeam` | R | | |
| 25 | `createLab` | S | | 폴더 경로 입력 |
| 26 | `updateLab` | S | | 폴더 경로 입력 |
| 27 | `deleteLab` | R | | |
| 28 | `setRefDocs` | S | | 경로 목록. PC와 같은 경로 검사·상한 |
| 29 | `pickFiles` | P | | `enter_path` |
| 30 | `missingFiles` | S | | 파일이 있는지 확인(PC 파일 존재 여부를 알려 줌) |
| 31 | `fireExternal` | S | | 외부 프로세스를 종료한다 |
| 32 | `recruitExternal` | S | | 0.13.0: R → S. 승인 방식은 원격에서 못 정해 늘 `ask` |
| 33 | `equipmentCatalog` | S | | `cwd`의 설정을 읽는다 |
| 34 | `setEquipment` | R | | |
| 35 | `claudeStatus` | R | | 오래 걸릴 수 있음 |
| 36 | `openClaudeLogin` | P | | `open_on_pc` |
| 37 | `forkExternal` | R | 첨부 인자 | |
| 38 | `listManuals` | R | | |
| 39 | `saveManual` | S | | `previousPath`는 `listManuals()` 경로만 |
| 40 | `deleteManual` | S | | `path`는 `listManuals()` 경로만 |
| 41 | `draftManual` | R | | 오래 걸림 |
| 42 | `trainStaff` | R | | |
| 43 | `trainGroups` | R | | |
| 44 | `startRun` | R | 첨부 인자 | |
| 45 | `reviewRun` | R | | |
| 46 | `stopRun` | R | | |
| 47 | `workChanges` | S | | 소스 변경 내용(diff)을 읽는다. 응답이 클 수 있음 |
| 48 | `suggestCommitMessage` | R | | |
| 49 | `commitChanges` | S | | PC에서 git commit |
| 94 | `workRevertInfo` | S | | 작업 시작 시점 이후 이 직원이 바꾼 파일 `WorkRevertInfo`(`available`·`startedAt`·`files`·`skipped`). 같은 폴더의 다른 직원이 바꾼 파일은 `skipped` |
| 95 | `revertWork` | P | `open_on_pc` | 그 파일들을 작업 시작 시점으로 되돌린다(새 파일은 삭제, 취소 불가) — 휴대폰에선 못 하고 PC 확인 창에서만 |
| 50 | `pushAndCreatePr` | S | | PC에서 git push·PR 만들기(외부 서비스에 보냄) |
| 51 | `createTask` | R | 첨부 인자 | |
| 52 | `updateTask` | R | | |
| 53 | `assignTask` | R | | |
| 54 | `deleteTask` | R | | |
| 55 | `startMeeting` | R | | |
| 56 | `answerMeetingDecision` | R | | |
| 57 | `endMeeting` | R | | |
| 58 | `stopTask` | R | | |
| 59 | `resumePlan` | R | | |
| 60 | `reviewPlan` | R | | 판정 409 |
| 61 | `answerQuestion` | R | | 판정 409 |
| 62 | `refreshPlanUsage` | R | | Claude를 한 번 불러 비용이 든다 |
| 63 | `ledger` | R | | |
| 64 | `buyItem` | R | | |
| 65 | `applySurface` | R | | |
| 66 | `placeItem` | R | | |
| 67 | `moveItem` | R | | |
| 68 | `storeItem` | R | | |
| 69 | `setGear` | R | | |
| 70 | `missions` | R | | |
| 71 | `claimMission` | R | | |
| 72 | `startTasks` | R | | |
| 73 | `saveSchedule` | R | | |
| 74 | `deleteSchedule` | R | | |
| 75 | `runScheduleNow` | R | | |
| 76 | `chatHistory` | R | | |
| 77 | `sendChat` | R | 첨부 인자 | |
| 78 | `timeline` | R | | |
| 79 | `dailyReport` | R | | |
| 80 | `payslip` | R | | |
| 81 | `updateSettings` | S | | 예산·모드 등 PC 설정을 바꾼다 |
| 82 | `autoApproveStatus` | R | | 자동결재 상태 (스냅샷 `autoApprove`와 같음) |
| 83 | `setAutoApprove` | R | | 자동결재 켜기·끄기 `{ mode: 'off' \| 'hours' \| 'daily', hours?, start?, end? }` — 허용 필드는 이 넷 |
| 84 | `autoApproveLog` | R | | 자동결재가 대신 처리한 목록(최근 것부터) |
| 85 | `loadStaffCommands` | R | | 직원의 /명령어 목록을 (없으면) 불러온다. 결과는 스냅샷 `staffCommands[직원 id]`(`StaffCommand[]`: name·description·argumentHint·isBuiltin). 직원 세션을 잠깐 띄우므로 몇 초 걸릴 수 있음. 거르기 규칙은 `shared/slashCommands.ts`의 `matchCommands`(이름 앞부분 → 이름 안 → 설명). `instruct`·`sendChat`의 `/명령`은 PC와 같게 처리(막힌 명령은 안내, `/clear`는 새 대화) |
| 86 | `setGridItemOn` | R | | 눌러서 켜고 끄는 소품(연출 B, `shared/iso/propMotion.ts` `isToggleable`)을 켜거나 끈다 `(uid, isOn)`. `shop.grid[].isOn`으로 저장(꺼짐은 필드 없음). B가 아닌 가구·없는 uid는 400 invalid_args. 예전 PC(iso-office 모름)에는 보내지 않음 |
| 87 | `releasePlanHold` | R | | 플랜 한도가 높아 보류 중인 예약·기획 하위 업무를 지금 시작한다. 스냅샷 `planHold`(`isHeld`·`resumeAt`·`items`)가 보류 상태. 옛 PC엔 `planHold`가 없다 |
| 88 | `approveAlways` | R | | 결재를 승인하면서 "앞으로 항상 승인" 규칙을 만든다 `(approvalId)` → 불리언. 결재의 `alwaysRule`(`toolName`·`patterns`)이 있을 때만(위험 명령·질문이면 없음 → false). 같은 규칙에 들어가는 그 직원의 다른 대기 결재도 함께 승인 |
| 89 | `approvalRules` | R | | 규칙 목록 `ApprovalRule[]`(`id`·`staffId`·`toolName`·`patterns`·`createdAt`). Bash는 `patterns`(명령 머리, 예 `npm test`)가 모두 들어가야 맞고, 다른 도구는 빈 배열 = 그 도구 전부. 위험 명령·외부 전송은 규칙이 있어도 결재 |
| 90 | `deleteApprovalRule` | R | | 규칙 지우기 `(ruleId)` |
| 91 | `knowledgeList` | R | | 회사 지식 창고 `KnowledgeEntry[]`(최근에 고친 순): `kind`(`learning`·`feedback`·`decision`)·`title`·`body`·`tags`·`staffName`·`docPath` |
| 92 | `saveKnowledge` | R | | 쓰기·고치기 `{ id?, kind, title, body, tags?, docPath? }` — 허용 필드는 이 여섯. 제목·내용이 비었거나 `docPath`가 전체 경로가 아니면 400 invalid_args |
| 93 | `deleteKnowledge` | R | | 지식 지우기 `(id)` |
| 96 | `galleryList` | R | | 결과물 갤러리 `GalleryEntry[]`(최근에 끝낸 순): 업무 카드가 "검토"로 넘어갈 때 앱이 만든다. `id`(= 업무 카드 id)·`title`·`staffId`·`staffName`·`teamId`·`labId`·`summary`(보고 앞부분)·`links`·`images`(첨부)·`files`(`path`·`added`·`removed`)·`finishedAt`. 필터(직원·랩·기간)는 앱이 `shared/gallery.ts`의 `filterGallery`로 |
| 97 | `deleteGalleryEntry` | R | | 갤러리에서 한 장 지우기 `(id)` — 업무 카드는 그대로 |
| 98 | `runDemoDayNow` | R | | 데모데이를 지금 연다: 지난 데모데이 이후 끝낸 업무로 회의실 발표(`Meeting.kind = 'demo'`, AI 호출 없음)를 하고 단체방에 짧은 요약 + 갤러리 링크(`#view=gallery`)를 올린다. 정기 일정은 설정 `demoDay`(`isEnabled`·`weekday` 0=일~6=토·`time` HH:MM) |

개수: **R 84 · S 17 · P 15 · C 2 · U 1 = 119** (`setRemoteLanOnly`·`dismissRemoteLanNotice`는 P — 전용 모드를 끄면 밖에서 붙게 되므로 폰에서는 못 바꾼다). 코드는 `app/src/main/remote/v2.ts`의 `V2_METHODS: Record<OfficeMethod, …>` 한 표 — 메서드가 빠지거나 남으면 tsc가 실패하고, `scripts/remote-v2.test.mts`가 이름·개수를 다시 확인한다.

### 5-4. 응답 크기와 압축
- 요청에 `Accept-Encoding: gzip`이 있으면 서버는 `/v2/call` 응답을 gzip으로 보내도 된다(`Content-Encoding: gzip`). SSE는 압축하지 않는다.
- `/v2/call`의 응답 본문 상한은 **16MB**. 넘으면 `500 internal_error`가 아니라 `413 response_too_large`(`workChanges`·`timeline` 같은 큰 응답). 앱은 범위를 좁혀 다시 부른다(예: `timeline(sinceMs)`의 시각을 늦춤).

## 6. 인자와 반환의 형식
| 값 | v2에서 | 비고 |
|---|---|---|
| 문자열·숫자·불리언·`null`·배열·객체 | JSON 그대로 | 숫자는 v1 3-4절과 같은 자료형 규칙(시각은 64비트 정수 에포크 밀리초) |
| `undefined` | 인자는 생략 또는 `null`, 반환은 `result: null` | |
| `Record<string, string>` | 객체 그대로 | `answerQuestion`의 `answers` |
| `Attachment` | **`{id, name, mime, size}`** (`path` 없음) | 7절. 보낼 때는 `id`만 의미가 있다 |
| `UploadFile.data`(`ArrayBuffer`) | `/v2/call`로 받지 않는다 | `saveAttachments`는 `/v2/attachments`로 대신(7절) |
| `Date` 객체 | 쓰지 않는다(시각은 숫자) | |
| 함수(콜백) | 쓰지 않는다 | 이벤트는 8절 SSE로 대신 |
| `RemoteQr.image`(data URL) | 보내지 않는다 | `remoteQr`가 `pc_only` |
- 반환에서 `Attachment`를 **재귀로 찾아** `path`를 제거한다(`snapshot`·`chatHistory`·`getRecord`·`Task.attachments`·이벤트 모두).
- 반환 모양은 PC 화면이 받는 것과 **같다**(필드를 새로 짓지도 이름을 바꾸지도 않는다). 그래서 폰 화면은 PC 화면 코드가 쓰는 타입을 그대로 쓴다(`path`만 없는 것).

## 7. 첨부와 사무실 파일 주소
### 7-1. 올리기 — `POST /v2/attachments`
```
POST /v2/attachments
Authorization: Bearer <token>
Content-Type: <파일의 mime, 예 image/png>
X-File-Name: <파일 이름을 UTF-8로 URL 인코딩한 값>
Content-Length: <바이트 수>

<파일 바이트 그대로>
```
성공 `201`
```json
{ "protocolVersion": 2, "serverTime": 1790000000000, "attachment": { "id": "…", "name": "화면.png", "mime": "image/png", "size": 123456 } }
```
- **파일 하나씩** 올린다. 여러 개면 여러 번 부르고, 받은 `attachment`를 모아 `instruct`·`sendChat` 등의 `attachments`에 쓴다.
- 이름은 서버가 PC 화면과 같은 규칙으로 안전하게 고친다(경로 구분자 등 제거, 80자). 돌려준 `name`을 쓴다.
- mime: PC와 같이 `Content-Type`이 비었거나 `application/octet-stream`이면 확장자로 정한다. 응답의 `mime`을 쓴다.
- 크기 상한 **20MB**(초기값). 넘으면 `413 payload_too_large`. `Content-Length`가 없으면 `411 length_required`를 보내고 읽지 않는다. 본문을 상한까지만 읽고 넘으면 끊는다(v1 3-3절의 두 갈래와 같은 방식).
- 앱의 **어댑터는** OfficeApi의 `saveAttachments(files)` 호출을 받으면 파일마다 위 요청을 보내 `Attachment[]`를 모아 같은 모양으로 돌려준다(PC 화면 코드는 바뀌지 않는다). `/v2/call`로 `saveAttachments`를 부르면 `400 use_upload`.
- 저장된 첨부는 PC의 첨부 저장소에 쌓인다(PC 화면이 올린 것과 같은 곳). 정리·용량 한도는 PC 쪽 정책을 따른다.

### 7-2. 받기 — `GET /v2/files/{id}`
PC 화면은 첨부를 `office-file://file/{id}`로 보여 준다(`attachmentUrl`). 폰에서는 **같은 주소를 화면이 그대로 쓰고**, 앱의 안드로이드 셸이 이 주소를 가로채서 아래 요청으로 바꿔 보낸다. WebView는 PC에 직접 나가지 않고, 토큰은 주소·화면 코드에 나오지 않는다.

```
GET /v2/files/{id}
Authorization: Bearer <token>
```
성공 `200`: 본문은 파일 바이트.
| 헤더 | 값 |
|---|---|
| `Content-Type` | 확장자 목록(이미지·PDF·텍스트·마크다운·JSON·CSV)에 있으면 그 mime, 아니면 `application/octet-stream` |
| `Content-Length` | 바이트 수 |
| `Content-Disposition` | 이미지·PDF·텍스트는 `inline`, 나머지는 `attachment; filename*=UTF-8''<이름>` |
| `X-Content-Type-Options` | `nosniff` |
| `Cache-Control` | `private, max-age=3600` (파일은 `id`가 같으면 내용이 바뀌지 않는다) |
- `{id}`는 UUID(36자)만 받는다. 모양이 틀리면 `400 invalid_request`, 파일이 없으면 `404 file_not_found`. **경로 문자는 한 글자도 쓰지 않는다**(`id`로만 찾는다).
- `Range` 요청(`bytes=…`)을 지원하면 `206`으로 응답해도 된다(큰 PDF·영상용, 선택).
- 이 경로의 응답은 `protocolVersion` 본문이 없다(바이트 응답). 오류만 JSON이다.

### 7-3. 인자로 첨부를 줄 때 (`id`만 믿는다)
`instruct`·`interrupt`·`forkExternal`·`startRun`·`createTask`·`sendChat`의 `attachments`는 PC 화면처럼 `Attachment` 배열이다.
- 폰은 7-1에서 받은 `attachment`(또는 이미 있는 첨부의 `id`)를 보낸다.
- 서버는 각 항목에서 **`id`만** 읽는다. `name`·`mime`·`size`·`path`가 와도 **무시**하고 저장소에서 `id`로 찾은 값을 쓴다.
- `id`가 UUID 모양이 아니거나 저장소에 없으면 **호출 전체를 거절**한다: `400 invalid_attachment`(어느 `args` 위치인지만 알려 줌).
- 한 호출의 첨부 수는 PC 화면과 같은 상한을 따른다. 상한은 구현 때 PC의 값을 그대로 쓴다.

## 8. `GET /v2/events` (SSE)
### 8-1. 연결
```
GET /v2/events
Authorization: Bearer <token>
Accept: text/event-stream
Last-Event-ID: <epoch>:<n>      (다시 연결할 때만)
```
응답 `200`, 헤더 `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-store`, `Connection: keep-alive`, `X-Accel-Buffering: no`. 본문은 끊기지 않는 이벤트 스트림이다.
- 오류는 **연결 전에** 일반 JSON 오류로 온다(`401`·`426`·`429` 등 9절). 스트림이 열린 뒤에는 `bye`(8-4절)로 닫는다.

### 8-2. 이벤트 모양
```
id: 7f3a9c:42
event: log
data: {"…":"…"}

```
- `id`: `<epoch>:<번호>`. `epoch`는 서버가 켜질 때마다 새로 정하는 짧은 무작위 문자열, 번호는 그 `epoch`에서 1부터 늘어나는 정수.
- `event`: 아래 표의 이름. `data`는 JSON **한 줄**.
- OfficeApi의 `on*`이 콜백으로 받는 **값과 같은 JSON**을 `data`에 담는다(3·6절의 `Attachment.path` 제거 포함).

| OfficeApi 이벤트 | `event` 이름 | `data` |
|---|---|---|
| `onSnapshot` | `snapshot` | `OfficeSnapshot` |
| `onLog` | `log` | `LogEntry` |
| `onChat` | `chat` | `ChatMessage` |
| `onFocus` | `focus` | 직원 id(JSON 문자열) |
| `onRemoteStatus` | `remoteStatus` | `RemoteStatus` |

연결·제어용 이벤트(OfficeApi에는 없음, 서버가 만든다)
| `event` | `data` | 언제 |
|---|---|---|
| `hello` | `{ "protocolVersion": 2, "epoch": "…", "lastEventId": 41, "heartbeatSec": 15, "resync": false, "serverTime": … }` | 연결되자마자 **가장 먼저** |
| `bye` | `{ "reason": "token_revoked" \| "remote_disabled" \| "shutdown" \| "replaced" \| "slow_consumer", "retryAt"?: … }` | 서버가 닫기 직전 (`v2_disabled`는 폐지) |
- `hello`는 **`id` 없이** 보낸다(재연결 기준이 되지 않게). 앱은 모르는 `event` 이름을 **무시**한다.
- 앱은 `focus`를 받아도 **화면을 옮길지 스스로 정한다**(PC의 알림 클릭이 폰 화면을 뜬금없이 바꾸지 않게, 12절 5번). 서버는 그대로 전달한다.

### 8-3. 처음 상태와 따라잡기
1. 서버는 연결되면 `hello`를 보낸다.
2. **바로 이어서 전체 상태를 보낸다**: `snapshot` 이벤트 한 개(현재 `OfficeSnapshot`), 이어서 `remoteStatus` 한 개. 앱은 이 둘만으로 화면을 그릴 수 있다.
3. 그 뒤로는 PC에서 일어나는 이벤트가 생기는 대로 보낸다.

**다시 연결할 때 (`Last-Event-ID`)**
- 서버는 최근 이벤트 **500개 또는 5분**(먼저 차는 쪽)을 `log`·`chat`·`focus`에 한해 보관한다(`snapshot`·`remoteStatus`는 마지막 값만 의미가 있으므로 보관하지 않는다).
- 앱이 `Last-Event-ID: <epoch>:<n>`으로 다시 붙으면:
  - `epoch`가 같고 `n` 이후의 이벤트가 보관 범위에 **전부** 있으면: `hello(resync: false)` → **놓친 `log`·`chat`·`focus`를 순서대로** → 새 `snapshot`·`remoteStatus`.
  - `epoch`가 다르거나(PC 앱이 다시 켜짐) 보관 범위를 벗어났으면: `hello(resync: true)` → 새 `snapshot`·`remoteStatus`. 앱은 **`chatHistory()`와 `timeline(sinceMs)`로 빈 구간을 다시 읽는다.**
- `Last-Event-ID`가 없으면 처음 연결로 본다(`resync: true`).

**묶어 보내기 (`snapshot`·`remoteStatus`)**
- PC는 `onSnapshot`을 자주 낸다. 서버는 **`snapshot`과 `remoteStatus`** 를 최대 **500ms에 한 번**으로 묶어 마지막 값만 보낸다(둘 다 전체 상태라 마지막 값이면 충분 — `remoteStatus`는 요청마다 접속 기록이 바뀌어 호출마다 나가던 것을 묶었다). `log`·`chat`·`focus`는 **절대 묶거나 버리지 않는다.**

### 8-4. 살아 있는지 확인, 재연결, 한도
- **keep-alive:** 서버는 보낼 이벤트가 없어도 **15초마다** 주석 줄(`: keep-alive` + 빈 줄)을 보낸다. `hello.heartbeatSec`가 이 값이다.
- **죽은 연결 판단:** 앱은 **35초**(keep-alive 두 번을 놓치고 5초 여유) 동안 아무것도 못 받으면 연결이 끊긴 것으로 보고 닫고 다시 연결한다. 서버는 SSE 소켓에 TCP keep-alive(15초)를 켠다.
- **즉시 재연결:** 앱이 화면으로 돌아왔거나 기본 네트워크가 바뀌면(와이파이↔LTE) 기다리던 지연을 건너뛰고 **바로** 다시 연결하며 지연은 처음으로 되돌린다. 열려 있던 연결은 닫고 새로 붙는다(옛 소켓은 조용히 죽어 있을 수 있다).
- **끊김 알림:** 앱 셸은 끊김(`connecting`·`reconnecting`)을 **8초 안에 다시 붙으면 화면에 알리지 않는다.** 8초 넘게 못 붙을 때만 `connection` 메시지로 보낸다. 앱이 화면에서 멈춘 것(사유 없는 `closed`)은 끊김이 아니라 알리지 않는다. 토큰 폐기 같은 끝(`closed`+사유)과 `open`은 바로 알린다.
- **재연결:** 서버는 `retry: 3000`을 보낸다. 앱은 지연을 1·2·4·8·16·30초(최대)로 늘리고 ±20% 흔들며, **60초 이상 이어졌으면** 지연을 처음으로 되돌린다. `401 token_revoked`·`426`이면 **다시 연결하지 않는다.** `401 auth_locked`는 `retryAt`까지 기다린다. `429`는 `retryAfterSec`를 따른다.
- **연결 한도:** 한 토큰에서 **동시에 SSE 2개**(폰 한 대의 재연결이 겹칠 때를 위한 여유). 세 번째가 연결되면 **가장 오래된 연결에 `bye(replaced)`를 보내고 닫는다.** 서버 전체로는 **4개**. 넘으면 새 연결에 `429 rate_limited`(`retryAfterSec: 5`).
- **토큰 확인:** 서버는 `heartbeat`마다 토큰이 아직 유효한지 확인한다. 폐기됐으면 `bye(token_revoked)`로 닫는다(QR 다시 만들기·PC에서 끄기에도 `bye(remote_disabled)`).
- **느린 연결:** 쓰기 대기가 1MB를 넘은 채로 10초가 지나면 `bye(slow_consumer)`로 닫는다. 앱은 다시 연결하면 된다(`Last-Event-ID`로 따라잡음).
- SSE 연결도 **요청 속도 제한**(토큰당 분당 300회)에 연결 시도 한 번으로 센다. 연결이 이어지는 동안은 더 세지 않는다.
- 앱이 **화면에 없을 때**(백그라운드)는 SSE를 닫는다. 알림은 v1의 15분 조회(`GET /v1/decisions`)가 맡는 구조 그대로다(푸시는 2단계).

## 9. 오류 코드표 (v2)
v1 7절의 코드를 **그대로** 쓰고, v2에서 더해지는 것만 아래에 적는다. 오류 본문은 v1과 같고 `protocolVersion`은 2이며 `method`가 붙을 수 있다. "횟수"는 인증 실패 제한에 세는지다.

| HTTP | `error` | 언제 | 횟수 | 앱 동작 |
|---|---|---|---|---|
| 400 | `invalid_request` | v1과 같음 + 같은 `Idempotency-Key`에 다른 본문 | 안 셈 | v1과 같음 |
| 400 | `invalid_args` | 인자 개수·타입이 틀리거나 남는 인자 | 안 셈 | 앱 버그. 사용자 입력이면 입력 확인 안내 |
| 400 | `confirm_required` | 4-4절의 확인이 필요한 호출에 `confirm: true`가 없음 | 안 셈 | 사용자 확인 뒤 `confirm: true`로 다시 |
| 400 | `use_upload` | `/v2/call`로 `saveAttachments`를 부름 | 안 셈 | 앱 버그. `/v2/attachments` 사용 |
| 400 | `invalid_attachment` | 첨부 `id`가 UUID가 아니거나 저장소에 없음 | 안 셈 | "첨부를 다시 올려 주세요" |
| 401 | `unauthorized`·`token_revoked`·`auth_locked` | v1 7절과 같음 | v1과 같음 | v1과 같음 |
| 403 | ~~`v2_disabled`~~ | **폐지** — 지금 PC는 보내지 않는다(전체 기능 스위치를 없앰). 받으면 v1 모드 | 안 셈 | 전용 화면 불필요 |
| 404 | `unknown_method` | `method`가 OfficeApi에 없음 | 안 셈 | 앱 버그 또는 앱이 더 새로움. "앱·PC 업데이트" 안내 |
| 404 | `file_not_found` | `/v2/files/{id}`에 파일이 없음 | 안 셈 | 깨진 그림 표시 |
| 404 | `not_found` | 4종 + v1 4종 외 경로 | 안 셈 | v1과 같음 |
| 405 | `method_not_allowed` | 메서드 틀림(`Allow` 포함) | 안 셈 | 앱 버그 |
| 409 | `already_decided` | 판정 409 호출(`decide`·`answerQuestion`·`reviewPlan`)이 이미 처리된 결정에 | 안 셈 | "이미 처리됐어요" 후 새로고침 |
| 409 | `in_progress` | 같은 `Idempotency-Key`의 요청이 아직 처리 중 | 안 셈 | `retryAfterSec` 뒤 재시도 |
| 409 | `duplicate_call` | 같은 `Idempotency-Key`가 이미 처리됐고 응답이 저장돼 있지 않음 | 안 셈 | `snapshot`으로 결과 확인 |
| 411 | `length_required` | `/v2/attachments`에 `Content-Length`가 없음 | 안 셈 | 앱 버그 |
| 413 | `payload_too_large` | 요청 본문 1MB(call)·20MB(첨부) 초과 | 안 셈 | 줄이도록 안내 |
| 413 | `response_too_large` | `/v2/call` 응답이 16MB를 넘음 | 안 셈 | 범위를 좁혀 다시 |
| 415 | `unsupported_media_type` | `/v2/call`의 `Content-Type`이 JSON이 아님 | 안 셈 | 앱 버그 |
| 422 | `pc_only` | PC 전용 호출(5-2절). `alternative` 포함 | 안 셈 | 안내 문구 표시 |
| 426 | `protocol_unsupported` | 서버가 그 버전을 지원하지 않음. `supported` 포함 | 안 셈 | 2-1절 |
| 429 | `rate_limited` | 토큰당 분당 300회 초과, 동시 호출 8개 초과, SSE 한도 초과. `retryAfterSec`·`Retry-After` | 안 셈 | `retryAfterSec` 뒤 재시도 |
| 500 | `call_failed` | OfficeApi 호출이 오류를 던짐. `message`는 **첫 줄만**이고 경로·토큰 같은 것은 제거 | 안 셈 | `message`를 PC 화면처럼 표시 |
| 500 | `internal_error` | 서버 내부 오류(v1과 같음) | 안 셈 | v1과 같음 |
| 503 | `office_unavailable` | v1과 같음 | 안 셈 | v1과 같음 |
| 504 | `call_timeout` | `/v2/call`이 120초를 넘음 | 안 셈 | 결과는 `snapshot`·SSE로 확인 |

규칙
- 요청 속도 제한은 **토큰당 분당 300회**(v1과 v2 합산)로 **올린다**(v1 규격은 120회였다 — 더 느슨해지는 변경이라 v1 앱에 영향이 없다). 수치는 서버 상수 한 곳.
- `call_failed`는 PC 화면이 오류를 보이던 그 문장을 앱도 보이게 하려는 것이다. 내부 스택·절대 경로는 서버가 잘라 낸다.
- 판단 순서(서버): ① TLS → ② 경로의 버전(426) → ③ 잠금(`auth_locked`) → ④ 인증(401) → ⑤ 속도(429) → ⑥ 경로·메서드(404·405) → ⑦ 본문(415·413·411·400) → ⑧ 처리(422·409·500·504). `/v2/*`는 ②~⑤를 **본문을 읽기 전에** 하고, 막히면 본문을 읽지 않고 연결을 닫는다(3절).

## 10. 인증·잠금 (v1과 같음)
- `Authorization: Bearer <토큰>`, 토큰은 URL·로그·알림에 넣지 않는다(v1 4절).
- IP별 5회/10분 → 해당 IP 15분 잠금, 전체 합산은 알림만, `auth_locked` + `retryAt`(v1 7절). SSE·첨부·파일 요청도 같은 잠금과 같은 실패 횟수를 쓴다.
- 토큰 재발급·폐기도 v1 9절 그대로다. 재발급하면 열려 있는 SSE에 `bye(token_revoked)`를 보내고 닫는다.
- 인증서 고정(SPKI 지문), 평문 HTTP 금지, 원격 기본 꺼짐은 v1과 같다.

## 11. 버전 라인
세 번호를 **따로** 올린다. 릴리스 노트·README에 아래 표를 함께 적는다.

| 대상 | 이번 변경 | 규칙 |
|---|---|---|
| 데스크톱 | **0.9.0** (0.8.1에서 올림) | `docs/versioning.md` 기준 새 기능 묶음 = **마이너**. 맥·윈도우 **같은 버전** |
| 안드로이드 앱 | **1.1.0** (현재 1.0.1) | 별도 SemVer, `versionCode` 정수 증가. 같은 서명 키(업데이트로 설치) |
| 프로토콜 | **v2 추가, v1 유지** | 서버는 v1·v2를 함께 제공. v1은 필드 두 개(`supportedProtocols`·`fullAccess`)·QR `pv`만 더해짐(선택 필드, v1 유지) |
- 호환 판단은 **프로토콜 버전**(`supportedProtocols`)만으로 한다. 데스크톱·앱 버전 번호로 짐작하지 않는다(2-1절).

## 12. 열린 항목 (대표·리드 확인)
| # | 내용 | 담당 |
|---|---|---|
| 1 | **전체 조작 스위치 — 결정됨(대표, 2026-10-23): 없앤다.** 휴대폰 연결이 켜져 있으면 v2를 바로 쓴다. `fullAccess`는 항상 `true`(호환용), `403 v2_disabled`·`bye(v2_disabled)`는 폐지, 저장된 `isFullAccess`는 무시. 보안 안내는 PC 연결 가이드 첫 단계 문구로(3절). `setRemoteFullAccess`는 PC 화면에서 스위치를 걷어 낸 뒤 OfficeApi에서 **지웠다**. `RemoteStatus.isFullAccess`는 타입이 `true`로 고정된 호환 필드로 남긴다(모바일 미리보기 셸이 이 모양으로 상태를 만든다) | 대표 |
| 2 | **구현 담당:** PC 서버 v2 + SSE는 PC 메인 프로세스의 서버 코드(`app/src/main/remote/`)다. **백엔드 개발자(강백엔)가 맡는 것을 권고**한다(정리드의 v1 구조와 규격 4~8절을 인계). 화면 어댑터·모바일 빌드는 최가독, 셸·브리지는 임안드 | 리드 |
| 3 | **보안 리뷰 중점**(한리뷰): `args` 경로 검사(5-3절 S), `deleteManual`·`saveManual`의 `listManuals` 경로 제한, 첨부 `id`만 믿는 규칙(7-3절), `Attachment.path` 제거(재귀), `confirm_required`, 인증 전 본문 읽지 않기, 객체 인자 허용 필드, SSE 연결 한도·느린 연결, `Idempotency-Key` 저장소 크기 상한 | 한리뷰 |
| 4 | **분류표를 코드에 둔다:** 5-3절의 분류(R·S·P·C·U)를 서버 코드의 한 표로 두고, `OfficeApi` 메서드 목록과 `preload.ts` 목록과 **같은지 테스트**한다(새 메서드를 만들면 분류 없이는 테스트가 실패하도록). 개수는 R 58 · S 17 · P 6 · C 2 · U 1 = 84 — **구현함**(`V2_METHODS`, 타입으로 강제 + 테스트) | 구현 담당, 오큐에이 |
| 5 | `focus` 이벤트를 폰이 어떻게 다룰지(무시·확인 후 이동), 폰에서 PC 전용 버튼을 어떻게 보일지(5-2절의 안내 문구) | 이디자, 최가독 |
| 6 | 수치(본문 1MB·응답 16MB·첨부 20MB·분당 300회·동시 8개·SSE 2/4개·보관 500개/5분·keep-alive 15초·묶기 500ms)는 **초기값**이다. 구현·QA 중 조정하면 이 문서를 같이 고친다 | 구현 담당, 오큐에이 |
| 7 | 앱의 최근 폴더 목록(5-2절 `pickFolder` 대신)은 `snapshot`의 직원·랩 `cwd`로 만든다. 따로 "최근 폴더" 저장이 필요하면 앱이 기기 안에 저장한다(프로토콜 변경 없음) | 임안드, 이디자 |

## 변경 이력 (이 문서)
| 날짜 | 내용 |
|---|---|
| 2026-10-23 | 자동결재 메서드 3개(`autoApproveStatus`·`setAutoApprove`·`autoApproveLog`, R) 추가 — 5절 81 → 84개, R 55 → 58. 하위 호환(새 메서드) (강백엔) |
| 2026-10-23 | `setRemoteFullAccess` 삭제(5절 82 → 81개, P 7 → 6). 폰이 부르면 `404 unknown_method`. `RemoteStatus.isFullAccess`는 `true` 고정으로 유지 (강백엔) |
| 2026-10-23 | 대표 결정·보안 리뷰 반영(강백엔): 전체 기능 스위치 폐지(12-1, `fullAccess` 항상 true, `v2_disabled` 폐지, 2-1·2-3·3·8·9절). 인증 전 본문 읽지 않기(3·4-1·9절), 객체 인자 허용 필드(4-1), 포트 바꾸기 확인 문구·저장(4-4), `remoteStatus`도 500ms 묶기(8-3), `/v2/*` 오류의 `protocolVersion: 2`. 주소당 연결 8개(v1 3-3-1) |
| 2026-10-23 | 구현(데스크톱 0.9.0 예정, 정리드): 82번째 메서드 `setRemoteFullAccess`(P) 추가. 12-1절은 권고안(별도 스위치·기본 꺼짐)으로 구현 — 대표 확정 대기 |
| 2026-10-26 | 원격 보안 보강(0.13.0): `setEquipment`에서 `allowedTools`·`disallowedTools` 제외, `hire`·`updateStaff`·`recruitExternal`의 `cwd`·`approvalMode` 제외(S가 기본 폴더·`ask`로 채움), `setHooksInstalled`·`setAskHookInstalled` S → P, `recruitExternal` R → S, 원격 `setAutoApprove`는 끄기만, 원격 `approveAlways`는 Bash 규칙 미생성, 프로젝트 매뉴얼은 랩 폴더만. 폰이 보내던 값은 무시된다 (강백엔) |
| 2026-10-23 | 최초 작성(v2). OfficeApi 81개 메서드 분류, `/v2/call`·`/v2/events`(SSE)·`/v2/attachments`·`/v2/files/{id}`, 발견(`supportedProtocols`·`fullAccess`·QR `pv`), 호환 표, 보안 모델(전체 조작 스위치 권고) |
| 2026-10-26 | 같은 네트워크 전용 모드: QR 선택 필드 `lo:true`(PROTOCOL_VERSION 그대로), `hello` 결과에 `lo`·`lan`(현재 내부 주소) 추가 — 앱 자동 갱신용, 모르는 앱은 무시 |
