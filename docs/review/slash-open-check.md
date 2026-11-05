# / 명령 열기 실제 세션 확인 (slash-open-check)

확인 방법: 앱이 쓰는 `@anthropic-ai/claude-agent-sdk`(0.3.304)를 /tmp 스크립트로 직접 불러 실제 세션(haiku, 쓰기·실행 도구는 거부, 임시 git 저장소)에서 돌렸다. 앱(Electron) 화면에서 친 것이 아니라 SDK 직접 호출이다.

## 이름 대조 (`supportedCommands()`)

| 명령 | 결과 | 판단 |
|---|---|---|
| 열기로 한 작업형 19개 + 설정 5개(`reload-skills`·`reload-plugins`·`autocompact`·`doctor`·`output-style`) | 목록에 모두 있고 `builtin:true` | 열어 둠 |
| `model`·`effort`·`fast`·`advisor` | 모두 `builtin:true` | 앱 설정 처리(setting)로 열어 둠 |
| 계속 막는 `config`·`mcp`·`update-config`·`fewer-permission-prompts`·`auto-mode-setup`·`import` | 모두 `builtin:true` | 막힘 유지 |
| 별칭 | `review`→`code-review`, `checkup`→`doctor`, `proactive`→`loop`, `routines`→`schedule` | 별칭도 같은 판정 |
| `design`·`focus`·`color`·`heapdump`·`usage-credits`·`design-consent` 등 | builtin이지만 APP_BUILTINS에 없음 | 목록 수신 후 자동으로 막힘(기존 동작) |

## 실제 실행

| 명령 | 결과 | 판단 |
|---|---|---|
| `/loop 5m echo probe` | 5분 주기 작업(`*/5 * * * *`, recurring)을 만들고 `echo probe`를 한 번 실행. 세션 전용·7일 뒤 만료. 세션을 닫자 작업도 사라짐 | **다시 막음.** 동작은 하지만 앱 채팅에는 반복을 멈추는 화면이 없어, 세션이 살아 있는 동안 앱이 모르는 사이 토큰을 쓴다. 앱이 세션을 다시 열면(모델 변경 등) 조용히 사라지는 점도 혼란. 별칭 `/proactive`도 같이 막음 |
| `/batch a.txt …(계획만)` | git 저장소 안에서 시작. 파일 조사 → 계획 모드 → `AskUserQuestion`으로 질문 → 계획 작성 → `ExitPlanMode`(이번엔 거부해서 중단). 작업 1건이라 워커·worktree는 띄우지 않음 | 열어 둠. 단 worktree 워커 실행과 계획 승인 카드가 앱에서 뜨는지는 못 봄. 저장소가 아닌 폴더에서는 시작 못 함(이전 확인) |
| `/schedule …(만들지 말고 질문만)` | 현재 시각 확인 후 시간·환경·모델 설정안을 정리하고 저장소 첨부 여부를 질문. 실제 루틴은 만들지 않음 | 열어 둠. 클라우드 루틴이라 앱 세션에 반복이 남지 않음. 질문이 `AskUserQuestion`이 아닌 일반 글로 옴 |

## /model

| 항목 | 결과 | 판단 |
|---|---|---|
| 별칭 → 다음 응답 모델 | SDK에 `sonnet` 전달 시 init·응답 모두 `claude-sonnet-5-5`, `haiku`는 둘 다 `claude-haiku-5-5` | 직원 카드의 `s.model`(별칭)과 다음 응답 모델이 같은 모델을 가리킴. 앱 화면에서 카드를 직접 본 것은 아님 |

## 다시 막은 명령
- `loop`(별칭 `proactive`) — `shared/slashCommands.ts`의 `APP_BUILTINS`에서 빼고 `BLOCKED_COMMANDS`에 추가. 목록 수신 전·후 모두 막힘.
