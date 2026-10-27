# Codex P0 시험 보고 (codex-cli 0.164.0, app-server)

- 바이너리: Codex.app이 이 PC에서 사라져 `github.com/openai/codex` 릴리스(rust-v0.164.0, aarch64-apple-darwin)를 받아 `/tmp/codex-bin`으로 썼다.
- 스키마 고정: `schema/`(JSON Schema), `schema-ts/`(TS 바인딩) — `codex app-server generate-json-schema|generate-ts --out <dir>`
- 시험 코드: `spike.py` (`python3 -I spike.py <codex> info|mcpstatus|turn|resume`)
- 2차 시험: ChatGPT 로그인(무료 플랜, `planType: free`) 후 실제 턴 실행. 모델 `gpt-5.6-luna`, 최소 턴(승인 1·파일 1·MCP 1, 중단 1, 재개 1).
- 번들 바이너리는 `codex` 단독이 아니라 **`codex-app-server-package`(bin/codex-app-server + bin/codex-code-mode-host + codex-path/rg)** 를 써야 도구 실행이 된다. 단독 `codex`는 `codex-code-mode-host`가 없어 명령·파일·MCP 도구가 전부 실패했다.

| 항목 | 결과 | 근거 |
|---|---|---|
| 스키마 생성 | 된다 | `generate-json-schema`/`generate-ts`; 요청 106개, 알림·서버요청 목록 확보 |
| 스레드 시작·재개 | **된다(실증)** | `thread/start`로 시작, 새 프로세스에서 `thread/resume {threadId}` 후 기존 2턴이 복원되고 이어서 답함. 주의: `model`을 명시해야 함(아래 위험 2) |
| 턴 중단 | **된다(실증)** | 응답 생성 중 `turn/interrupt` → `{}`, `turn/completed`의 status가 `interrupted` |
| 명령·파일 승인 | **된다(실증)** | 실제로 `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`(+`mcpServer/elicitation/request`)를 받아 `{decision:"accept"}`로 응답 → `approved.txt`·`note.txt` 생성됨. 상세: 서버→클라 요청 `item/commandExecution/requestApproval`·`item/fileChange/requestApproval`, 응답 `{decision: accept/acceptForSession/decline/cancel}`; `approvalPolicy: untrusted/on-request/never/granular` |
| 토큰 사용 알림 | **된다(실증)** | `thread/tokenUsage/updated` — total/last의 input·cached·output·reasoning 토큰, `modelContextWindow` 포함 |
| 외부 MCP(로컬 HTTP) 주입 | **된다(실증)** | `-c mcp_servers.spike.url="http://127.0.0.1:PORT/mcp"`로 서버 기동 → `mcpServerStatus/list`에 `spike` 서버와 도구 `office_ping` 노출, 서버가 initialize·tools/list 수신. thread/start의 `config` 덮어쓰기로도 가능(스키마) |
| 스킬 | **된다(실증)** | `skills/list`가 `~/.codex/skills/*/SKILL.md`를 읽음. 형식은 Claude와 같은 `---name/description---` frontmatter+본문. 앱 주입: `skills/extraRoots/set {extraRoots}`, 켜고 끄기 `skills/config/write`, 턴 입력에 `{type:"skill",name,path}` |
| 슬래시 명령·커스텀 프롬프트 목록 | **안 된다** | 목록 메서드 없음(106개 중 해당 없음). `~/.codex/prompts` 폴더도 없음(프롬프트는 스킬로 대체된 흐름). 대체: 스킬 목록으로 보여 주거나 숨김 |
| 사용량 한도(5시간·주간) | **조건부(실증)** | 읽기·알림은 된다: `account/rateLimits/read`(+`account/rateLimits/updated` 알림), `account/usage/read`. 단 무료 플랜은 `primary`가 **43200분(30일) 창 하나뿐, `secondary: null`** — 5시간·주간 두 창은 유료 플랜에서 확인 필요 |
| 훅·notify로 외부 세션 감시 | 조건부 | `hooks/list`(실증, 설정된 훅 읽기)·`hook/started`·`hook/completed`는 app-server가 연 스레드 한정. 외부 Codex 세션은 `config.toml`의 `notify`/훅 설정을 앱이 써 주거나 `~/.codex/sessions/*.jsonl` 파일을 감시(이 PC에서 확인) |
| config.toml MCP 읽기 | **된다(실증)** | `config/read`, `mcpServerStatus/list`(context7·figma 읽힘). 토큰은 저장하지 않음 |
| 세션 기록 `thread/read` | 된다(목록 실증) | `thread/list`가 과거 세션 반환, `thread/read {threadId, includeTurns}`·`thread/turns/list`·`thread/items/list` |
| 계정·로그인 `account/read` | **된다(실증)** | `{account:null, requiresOpenaiAuth:true}`로 미로그인 판별; `account/login/start`, `account/updated` |
| 모델 목록 | **된다(실증)** | `model/list`(id·displayName·supportedReasoningEfforts) — 로그인 없이도 응답 |

## 일정 위험 (3개, 2차 시험 반영)
1. **번들 구성·용량**: 도구 실행에 `codex-code-mode-host`가 필수다(없으면 "execution environment failed to start"). 앱 번들은 app-server 패키지 전체(약 374MB, mac arm64 기준)를 넣어야 하고, 플랫폼별(mac x64·win) 패키지와 코드서명·공증 확인이 필요하다. 이전 위험 1(미실증 5항목)은 해소.
2. **모델·플랜 의존**: 사용자 config.toml의 기본 모델(`gpt-5.6-sol`)이 ChatGPT 계정에서 거부돼(`model_not_found`) 턴이 실패했다. 앱은 `model/list`(무료 플랜: gpt-6-luna·gpt-5.6-terra·gpt-5.6-luna)로 쓸 수 있는 모델을 골라 `thread/start`에 항상 `model`을 명시해야 한다. 무료 플랜은 한도 창도 30일 하나뿐이라 5시간·주간 표시는 플랜별 분기가 필요(유료 플랜 미실증).
3. **외부 세션 감시·슬래시 명령은 app-server 밖**(변동 없음): 슬래시 목록 API 없음, 훅은 우리 스레드 한정 → 파일 감시·config 쓰기로 별도 구현(2-7 +1~2인일 가능).

## 3차: 공급자 감지 + 번들 패키징 시험 (M1)

스키마(`schema/`, `schema-ts/`)는 커밋하지 않는다. 필요하면 `codex-app-server generate-json-schema|generate-ts --out <dir>` 로 다시 만든다.
앱 코드: `src/main/ai/providerStatus.ts`(감지), `ai/codex.ts`(번들 경로), `scripts/fetch-codex.mts`(패키지 받기), `forge.config.mts` postPackage(Resources/codex 복사).

### 감지 결과 (실제 번들 codex-app-server 0.164.0, mac arm64)
| 상태 | 만드는 법 | 결과 |
|---|---|---|
| 미설치(missing) | 없는 경로 / 다른 CPU 실행 파일(EBADARCH) | `state: missing` |
| 로그아웃(loggedOut) | 빈 `CODEX_HOME` | `account/read` → `account: null` → `state: loggedOut` |
| 준비됨(ready) | ChatGPT 무료 로그인 | `state: ready, plan: free, authMethod: chatgpt`, 모델 3개, 기본 `gpt-6-luna` |

### 플랫폼별 번들
| 대상 | 패키지(압축) | 풀면 | 앱 폴더 전체 | 설치 파일 | 서명 | 실행 확인 |
|---|---|---|---|---|---|---|
| mac arm64 | 105MB | 260MB | 840MB | dmg 348MB / zip 353MB | 자체 서명 검증 통과(공증 없음) | 감지·승인·MCP 호출 통과 |
| mac x64 | 113MB | 279MB | 876MB | dmg 371MB / zip 376MB | 자체 서명 검증 통과(공증 없음) | **못 함**: 이 PC(arm64)에 Rosetta 없음 |
| win x64 | 133MB | 365MB | 1.0GB | zip 428MB | 서명 없음 | **못 함**: 윈도우 PC 없음 (구조·파일 구성만 확인) |

### 문제점
1. **공증 불가:** OpenAI가 서명한 원본 바이너리(Team 2DC432GLL2)를 우리 `postPackage`가 자체 인증서로 다시 서명한다(`Signature size` 교체, 엔타이틀먼트는 원본도 없음, hardened runtime 유지). `spctl` 은 거부(자체 서명이라 기존 앱과 같은 상태). 정식 배포·공증 때는 Developer ID로 같은 방식 재서명이 필요하다.
2. **용량:** 번들이 설치본에 +260~365MB. dmg·zip이 맥 약 350~375MB, 윈도우 428MB. 윈도우 패키지에는 `codex-resources/`(샌드박스 실행기 2개)가 따로 있다.
3. **아키텍처별 번들:** x64 맥용은 x64 패키지가 따로 필요(`fetch-codex.mts darwin-x64`). 유니버설 빌드는 없다.
4. **버그 수정:** 다른 CPU용 바이너리를 `spawn`하면 `error` 이벤트가 아니라 동기 예외로 던져져 main이 죽을 수 있어 감지에서 잡는다.
5. 빌드 전에 `node scripts/fetch-codex.mts <대상>` 을 먼저 돌려야 한다. 없으면 경고만 남기고 Codex 없이 패키징한다(`app/vendor/` 는 gitignore).
6. 윈도우 코드서명·SmartScreen은 별개 이슈(현재 zip만).
