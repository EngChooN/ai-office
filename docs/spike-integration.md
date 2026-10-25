# 1단계 연동 스파이크 결과 (2026-10-20)

## A. 고용 직원 — Agent SDK (`@anthropic-ai/claude-agent-sdk` 0.3.304)
`spikes/agent-sdk/sdk-spike.ts` 로 검증.

| 확인 항목 | 결과 |
|---|---|
| 인증 | 별도 API 키 없이 **로컬 Claude Code 로그인**으로 동작 (`apiKeySource: none`) |
| 세션 생성 | `query({ prompt: AsyncIterable<SDKUserMessage>, options })` — init 메시지에 `session_id`·`model` |
| 후속 지시 | 스트리밍 입력 큐에 메시지를 넣으면 같은 세션에서 이어짐 (사무실 "지시하기") |
| 권한 요청 | `canUseTool(toolName, input)` 콜백이 대기 → allow/deny 반환 (사무실 "결재") |
| hooks | `options.hooks.PreToolUse` 등 콜백으로 도구 사용 실시간 수신 |
| 비용·토큰 | `result` 메시지의 `total_cost_usd`(세션 누적), `usage.input/output_tokens` |

## B. 외부 직원 — 관찰
1. **세션 레지스트리 `~/.claude/sessions/<pid>.json`** (설정 변경 없이 바로 사용 가능)
   - 필드: `pid, sessionId, cwd, name, status(busy/idle), entrypoint, kind, updatedAt`
   - `process.kill(pid, 0)`으로 생존 확인 → 퇴근(종료) 판정
2. **hooks** (`spikes/hooks/settings.json`, `claude -p --settings`로 검증)
   - stdin JSON: `session_id, transcript_path, cwd, hook_event_name` + 이벤트별 필드
   - 수신 확인: SessionStart · UserPromptSubmit · PreToolUse · Stop · SessionEnd (Notification = 권한 대기 알림)
   - 전역 적용은 `~/.claude/settings.json` 수정이 필요 → 앱에서 **사용자가 직접 켜는 옵트인**으로 둔다
3. **트랜스크립트** `~/.claude/projects/<cwd 인코딩>/<sessionId>.jsonl` — 외부 직원 토큰·한 일 집계용 (0.1 이후)

## 결론
- 0.1 외부 직원 = 레지스트리 폴링(상태·이름·폴더) + 옵트인 hooks(권한 대기·도구 사용 알림)
- 고용 직원 = main 프로세스에서 SDK `query` 스트리밍 입력 세션을 직원마다 1개 유지
