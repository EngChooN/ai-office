import type { SecretaryMessage } from './types'

// 대화 찾기 공통 계산: 결과 사이 이동(단체방·비서) · 비서 대화 찾기 (#18)

/** 결과 사이 이동: 끝에서 처음으로 돌아간다 (결과가 없으면 null) */
export function stepIndex(index: number, step: number, total: number): number | null {
  if (total === 0) return null
  return (((index + step) % total) + total) % total
}

// 비서 대화는 스냅샷에 모두 있으므로 화면에서 바로 찾는다 (단체방처럼 DB를 묻지 않는다)

/** 말풍선에 글로 보이는 메시지인가 — 확인 카드·결재 카드 답은 text 대신 카드를 그리므로 찾지 않는다 */
const isTextShown = (m: SecretaryMessage) => !m.card && !m.approvalIds

/** 찾는 말(앞뒤 공백 제외, 대소문자 무시)이 든 메시지 id들, 최근 것부터 (단체방 찾기와 같은 순서 — Enter는 더 예전으로) */
export function findSecretaryHits(messages: readonly SecretaryMessage[], query: string): number[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return messages.filter((m) => isTextShown(m) && m.text.toLowerCase().includes(q)).map((m) => m.id).reverse()
}
