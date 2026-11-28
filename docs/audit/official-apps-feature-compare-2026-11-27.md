# 공식 Claude Code·Codex 기능·기본 설정 vs AI Office (조사 2026-11-27)

조사 방법: 공식 문서 읽기(설치된 공식 CLI는 이 맥에 없어 직접 실행 못 함). 긴 문서는 요약 도구를 거쳐 일부 "요약 기반".
우리 앱 쪽 근거: CONTEXT.md·SPEC.md·`app/src/main/ai/claude.ts`(SDK 옵션)·`shared/slashCommands.ts` 등 코드 확인.

| 항목 | Claude Code 공식 | Codex 공식 | AI Office | 비고 |
|---|---|---|---|---|
| 계획 모드 | `plan` 권한 모드, Shift+Tab·`/plan`, 승인 후 실행 | `/plan` (요약 기반) | **일부** — SDK `plan` 모드는 안 씀(`permissionMode`는 default/acceptEdits만). 대신 팀장 "기획→기획 확인 카드" 흐름이 있음 | 방식이 다름 |
| 되돌리기 | `/rewind`: 프롬프트마다 체크포인트, 코드·대화 따로 복원 | 문서상 Git 체크포인트 권장, `/undo` 못 찾음 | **일부** — "작업 전 되돌리기"(일 시작 시점 git 트리 기억). SDK 체크포인트(`enableFileCheckpointing`)는 안 씀, 대화만 되돌리기는 없음 | |
| 슬래시 명령 | 내장 다수+커스텀(`.claude/commands`, 스킬) | `/compact /review /model /fast /plan …` | **있음** — SDK가 주는 명령 목록 + 설정 명령 `/model`만 실제 적용, `/effort /fast /advisor`는 안내만. Codex는 `/compact /review /goal` | |
| 스킬 | `.claude/skills`, 자동 호출 | `/skills`, AGENTS.md | **있음** — 매뉴얼(스킬) 교육, 직원별 스킬 켜기(`skills`) | |
| 서브에이전트 | 내장 Explore·Plan·general-purpose + 커스텀 `.claude/agents` | 기본 켜짐, 병렬 스레드 | **부분** — `claude_code` 지시문을 쓰므로 도구로는 쓸 수 있고 화면이 "도우미"로 표시. 커스텀 정의 화면·켜기/끄기 스위치는 없음(보류 결정) | 실제 사용량은 별도 확인 중 |
| 훅 | 34개 이벤트, settings.json | 14개 이벤트, notify | **부분** — 앱 내부에서만 사용(PreToolUse 등). 사용자 훅 설정 화면 없음. 설정 파일 읽기(`settingSources`)는 켜져 있어 사용자 settings의 훅은 동작(추정) | |
| MCP | local/project/user, `claude mcp add` | `config.toml`, `codex mcp add` | **있음(제한)** — 장비 탭에서 켠 것만(`strictMcpConfig`), claude.ai 커넥터는 못 붙임 | 의도된 제한(문맥 절약) |
| 이미지·파일 첨부 | `@파일`, 이미지 붙여넣기 | `--image`, `/mention` | **있음** — 사진 첨부(PC·휴대폰), 결과물 미리보기 | `@파일` 멘션 UI는 확인 못 함 |
| 대화 이어 하기 | `--continue/--resume/--fork-session` | `resume`, `/fork` | **있음** — `resume`으로 재시작 후 이어받기, 분신(`forkSession`), 터미널 세션 이어 하기 | |
| 컨텍스트 압축 | 한도 근처 자동(1M 모델 약 967K), `/compact`, `/context` | `/compact`, `model_auto_compact_token_limit` | **다른 방식** — 일정 길이가 되면 "새 대화로 넘기기"(직원별 짧게/보통/길게/최대). Claude `/compact`는 명령으로 전달 | 요약 품질·연속성 차이 가능(추정) |
| 프롬프트 캐시 | 자동 사용, TTL 5분(구독 메인 1시간), 끄는 환경변수 | 문서에서 못 찾음 | **확인 못 함** — 앱이 직접 설정하지 않음. SDK 기본을 따름(추정). 캐시 읽기 토큰은 집계만 함 | 3단계 실험에서 측정 |
| 기본 모델 | `default`=Opus 5.5(플랜 무관), effort 기본 `medium` | 문서에 기본값 없음 | 직원별 모델 선택(고용 때). 추론 강도 **설정 없음**(SDK 기본) | |
| 추론 강도 | `/effort` low~max, `ultrathink` | `model_reasoning_effort`, `/model --reasoning` | **없음** — `/effort`는 안내만 | 품질 영향 후보 |
| 빠른 모드 | `/fast` 약 2.5배 빠름(Opus 5.5·Fable 5.2, 요금 높음) | `/fast` | **없음** — 안내만 | 속도 영향 후보 |
| 글자 스트리밍 | 대화형 화면 실시간(`-p`는 stream-json) | TUI 실시간 | **없음(추정)** — `includePartialMessages` 코드에 없음, 메시지 단위로 표시 | 체감 속도 큰 후보, 3단계에서 확인 |
| 권한 관리 | 6모드 allow/ask/deny 규칙, 샌드박스(기본 꺼짐) | `approval_policy`·`sandbox_mode`, 기본 workspace-write·네트워크 차단 | **있음(더 쉬운 형태)** — 결재함, 자동결재 규칙·장비 허용/차단 도구, 자율 진행, GPT 직원별 셸 네트워크 허용 | auto 모드는 안 씀 |

## 출처
- Claude Code: https://code.claude.com/docs/en/ 아래 permission-modes, permissions, checkpointing, commands, sub-agents, hooks, mcp, sessions, context-window, model-config, prompt-caching, fast-mode, sandboxing, settings, interactive-mode, common-workflows
- Codex: https://learn.chatgpt.com/docs/ (developers.openai.com/codex 가 이쪽으로 이동) — developer-commands, codex/cli, agent-configuration/subagents, hooks, config-file/config-basic·config-reference·config-advanced, extend/mcp, agent-approvals-security, agent-configuration/agents-md, app

## 확인 못 한 것
- 공식 CLI 직접 실행(미설치), Codex 프롬프트 캐시·기본 모델·기본 추론 강도·`/undo`, 우리 앱 `@파일` 멘션과 사용자 훅 실제 동작.
