// 첫 실행 안내의 갈림길 표 — 화면(Onboarding.tsx·App.tsx)에 흩지 않고 여기 한 곳에서 바꾼다 (npm test로 고정)

/** 첫 업무 실패 종류 (useFirstTask.ts와 같다) */
export type FirstTaskFailKind = 'login' | 'limit' | 'timeout' | 'network' | 'unknown'
/** 실패 화면 버튼: 로그인 단계로 · 다시 시도 · 직원 패널에서 이어 보기 · 연습 튜토리얼 */
export type FirstTaskAction = 'toLogin' | 'retry' | 'openStaff' | 'practice'

/** 실패 종류별로 보일 버튼 (앞의 것이 추천 버튼). '건너뛰기'는 모든 실패 화면에 따로 둔다 */
export const FAIL_ACTIONS: Record<FirstTaskFailKind, FirstTaskAction[]> = {
  login: ['toLogin'],
  // 한도는 기다리는 수밖에 없다 — 안내만
  limit: [],
  // 시간 초과는 실패가 아니라 오래 걸리는 중 — 직원 패널에서 이어 본다
  timeout: ['openStaff', 'practice'],
  // 인터넷 문제에 로그인 버튼은 엉뚱하다
  network: ['retry'],
  unknown: ['retry'],
}

/** 오류 원문을 접어서 보여 줄 실패 (원인을 이름 붙이지 못한 경우) */
export const showsErrorDetail = (fail: FirstTaskFailKind) => fail === 'unknown'

/**
 * 로그인 단계 갈림길 — Claude·Codex(ChatGPT)를 함께 확인하고 둘 중 하나만 준비돼도 통과한다.
 * claudeLoggedIn: claudeStatus 결과(아직 모르면 null) · providers: 두 공급자 상태(아직 모르면 null).
 * isChecking: 둘 다 결과가 올 때까지는 확인 중 · isOk: 하나라도 준비됨 · isBlocked: 둘 다 확인했는데 둘 다 안 됨(첫 업무를 못 해 둘러보기로)
 * isBothReady: 둘 다 준비됨 · taskProvider: 첫 업무를 맡길 공급자 — 통과 판단과 같은 기준으로 Claude 먼저, 아니면 Codex
 */
export function loginGate(claudeLoggedIn: boolean | null, providers: Record<'claude' | 'codex', { state: string }> | null) {
  const isChecking = claudeLoggedIn === null || providers === null
  const isClaudeReady = claudeLoggedIn === true || providers?.claude.state === 'ready'
  const isCodexReady = providers?.codex.state === 'ready'
  const isOk = isClaudeReady || isCodexReady
  const taskProvider: 'claude' | 'codex' | null = isClaudeReady ? 'claude' : isCodexReady ? 'codex' : null
  return { isChecking, isOk, isBlocked: !isChecking && !isOk, isBothReady: isClaudeReady && isCodexReady, taskProvider }
}

/** 둘러보기를 끝까지 본 뒤 연습 고르기를 띄울지 — 이미 실제 업무를 해 본 직원이 있으면 생략한다 */
export function shouldOfferPractice(staff: { kind: string; isPractice?: boolean; tokensIn: number; tokensOut: number }[]): boolean {
  return !staff.some((s) => s.kind === 'hired' && !s.isPractice && s.tokensIn + s.tokensOut > 0)
}
