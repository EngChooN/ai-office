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

## Codex 명령 — 앱 화면 확인 (2026-11-05)

확인 방법: 확인용 앱(AI_OFFICE_USER_DATA=~/claude-office-qa, CDP 9447)에 Codex 직원 '코덱스시험'(기본 모델, ~/claude-office-qa-work)을 뽑아 직원 창 입력칸에서 보냈다.

| 명령 | 결과 | 판단 |
|---|---|---|
| 자동완성 `/` | `/compact`·`/goal`·`/review`가 '기본 명령'으로 맨 위, 그 아래 Codex 스킬 | 정상 |
| `/model gpt-5` | 보내지 않고 "앱에서 쓸 수 없어요" 안내 | 정상 |
| `/goal …` | "목표를 정했어요" 뒤 Codex가 스스로 턴을 열어 이어 함. 목표를 이루면 `update_goal(complete)`로 스스로 끝냄 | **버그 2건 수정** (아래) |
| `/goal clear` | "목표를 해제했어요", 반복 멈춤 | 정상 |
| 목표 반복 중 '멈추기' | 진행 중 턴이 끊기고(turn_aborted) 다시 시작하지 않음 | 정상 |
| `/review` (바뀐 파일 없음) | git 상태를 보고 "working tree is clean" 보고 후 대기 | 동작. 답이 영어로 옴 |
| `/compact` | Codex 기록에 compacted, '업무 완료'로 끝 | 동작. 채팅에는 '완료' 줄만 남음 |

### 고친 버그
1. **목표 이어 하기 턴이 '작업 중'에 멈춤** — 앱이 보내지 않은 턴(Codex가 목표로 연 턴)의 끝 결과를 "지시와 상관없는 결과"로 버렸다. Codex가 지시 없이 턴을 열면 `autoTurn` 이벤트를 보내 새 업무로 받는다 (`codex.ts`·`hired.ts`, 시험: netResumeFlow 마지막 경우).
2. **두 번째 `/goal`이 시작되지 않음** — 목표만 바꾸면 직전 목표의 `complete` 상태가 남았다. `thread/goal/set`에 `status: 'active'`, `origin: 'user'`를 같이 보낸다.

### 남은 위험
- 목표를 이룰 수 없거나 모델이 완료 표시를 못 하면(예: "도구 쓰지 말 것") Codex가 몇 초마다 턴을 계속 연다(1분 반에 30번). 멈추기·`/goal clear`로 멈춘다. 횟수 제한은 아직 없다.

### 목표 이어 하기 한도 (대표 결정: 횟수 제한)
- 마지막 지시 뒤 Codex가 목표로 스스로 연 턴이 20번(`GOAL_AUTO_TURN_MAX`)에 닿으면 `thread/goal/set {status: paused, origin: automatic}`으로 멈추고 "20번 이어 해도 끝나지 않아 잠시 멈췄어요" 안내. 목표는 지우지 않아 `/goal resume`으로 이어 간다.
- Codex는 멈춤을 턴 사이에 받으면서 다음 턴을 이미 열기도 했다(첫 실제 확인에서 21번째 턴이 끝나지 않고 걸려 직원이 '작업 중'에 멈춤). 한도를 넘은 턴은 업무로 받지 않고 바로 끊으며 그 턴의 알림은 버린다.
- 실제 확인: 20턴 뒤 paused, 이후 다시 시작 안 함, 직원 '대기'. `/goal pause`·`/goal resume` 연결(전에는 "pause"가 목표 글로 들어갔다).
