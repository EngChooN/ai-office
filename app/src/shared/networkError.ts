// 직원 일이 인터넷이 끊겨 멈췄는지 오류 글로 가린다 (연결되면 이어 가기 — office.ts parkForNetwork)
// 문구는 실제 출력으로 확인했다 (scripts/networkError.test.mts의 샘플):
// - Claude: "API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)" · "API Error: Connection refused … (ECONNREFUSED)"
// - Codex: "Reconnecting... waiting for network" · "stream disconnected before completion: …" · "error sending request"

/** 한도·권한·모델·요청 크기 오류는 인터넷이 돌아와도 다시 해 봐야 소용없다 — 먼저 빼낸다 */
const NOT_NETWORK =
  /rate.?limit|usage limit|quota|\b(?:400|401|403|404|413|429|529)\b|unauthori[sz]ed|forbidden|invalid.?(?:api.?)?key|authenticat|permission|credit balance|overloaded|prompt is too long|context.?(?:window|length)|model.{0,40}(?:not (?:found|exist|supported|available)|unavailable|does not exist)|returned an error result/i

/** 연결 자체가 안 된 흔적 (노드 오류 코드·SDK·Codex 문구) */
const NETWORK =
  /\b(?:ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ENETDOWN|ECONNABORTED|EPIPE)\b|fetch failed|connection error|can't reach the api server|waiting for network|stream disconnected before completion|error sending request|network (?:is )?unreachable|socket hang up/i

/**
 * 인터넷이 끊겨 난 오류인가.
 * "returned an error result"는 이미 결과로 처리한 오류를 SDK가 세션을 닫으며 다시 던진 것이라 넣지 않는다 (같은 실패를 두 번 보관하지 않게)
 */
export const isNetworkError = (text: string) => !NOT_NETWORK.test(text) && NETWORK.test(text)
