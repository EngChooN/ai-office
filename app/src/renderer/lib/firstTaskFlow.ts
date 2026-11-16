// 첫 실행 안내의 갈림길 표 — 화면(Onboarding.tsx)에 흩지 않고 여기 한 곳에서 바꾼다 (npm test로 고정)

/**
 * 로그인 단계 갈림길 — Claude·Codex(ChatGPT)를 함께 확인하고 둘 중 하나만 준비돼도 통과한다.
 * claudeLoggedIn: claudeStatus 결과(아직 모르면 null) · providers: 두 공급자 상태(아직 모르면 null).
 * isChecking: 둘 다 결과가 올 때까지는 확인 중 · isOk: 하나라도 준비됨 · isBlocked: 둘 다 확인했는데 둘 다 안 됨(계정은 나중에 — 연습은 AI를 부르지 않아 그대로 할 수 있다)
 * isBothReady: 둘 다 준비됨
 */
export function loginGate(claudeLoggedIn: boolean | null, providers: Record<'claude' | 'codex', { state: string }> | null) {
  const isChecking = claudeLoggedIn === null || providers === null
  const isClaudeReady = claudeLoggedIn === true || providers?.claude.state === 'ready'
  const isCodexReady = providers?.codex.state === 'ready'
  const isOk = isClaudeReady || isCodexReady
  return { isChecking, isOk, isBlocked: !isChecking && !isOk, isBothReady: isClaudeReady && isCodexReady }
}
