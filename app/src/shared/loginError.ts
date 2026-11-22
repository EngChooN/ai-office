// Claude Code가 로그인 안 돼 답을 못 했는지 가린다 (#20 — 영어 원문 "Not logged in · Please run /login"을 그대로 보여 주던 문제)
// 실제 출력으로 확인했다 (번들 claude, 로그인 정보 없는 설정 폴더):
// - assistant 메시지: model "<synthetic>", error "authentication_failed", 글 "Not logged in · Please run /login"
// - result 메시지: subtype "success", is_error true, result는 같은 글 (error 칸이 없다)

/** 로그인 문제 글 — 문장 맨 앞에서 시작하고 /login으로 끝나는 짧은 한 줄만 (보통 답 속의 설명은 잡지 않는다) */
const LOGIN_TEXT = /^\s*(?:not logged in|invalid api key)\b[^\n]{0,60}\/login\s*$/i

/** assistant 메시지(error 칸이 있다) 또는 오류 결과 글이 로그인 문제인가 */
export const isLoginError = (error: unknown, text: string) => error === 'authentication_failed' || LOGIN_TEXT.test(text)
