// 리더에게 가는 [팀원 보고] 지시문의 길이 — 단체방 표시용 짧은 글(CHAT_TEXT_MAX 600)과 따로 둔다 — electron 없이 테스트한다

/**
 * 리더 지시문에 넣는 팀원 보고 상한(글자).
 * 보고는 결론·결정·남은 일이 뒤에 오기 쉬워 600자로 자르면 리더가 핵심을 못 읽는다.
 * 실제 보고는 대개 1,000~4,000자라 8,000자면 거의 다 들어가고, 한국어로 대략 5~6천 토큰이라 리더 대화가 크게 불지 않는다.
 * 넘는 부분은 단체방 보고·업무 카드(각각 20,000자까지 저장)에서 볼 수 있다
 */
export const LEADER_REPORT_MAX = 8_000

/** 상한 안이면 그대로, 넘으면 앞부분 + 잘렸다는 표시(몇 자 뺐는지·전체 위치)를 붙인다 */
export function clipLeaderReport(text: string, cutNote: (omitted: number) => string, max = LEADER_REPORT_MAX): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n${cutNote(text.length - max)}`
}
