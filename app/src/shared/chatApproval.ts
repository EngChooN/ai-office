import type { Approval, ChatApproval, ChatApprovalResult } from './types'

/** 단체방 결재·질문 말풍선이 지금 보여 줄 것: 아직 기다리면 버튼, 처리됐으면 결과(모르면 '처리됨') */
export type ChatApprovalView = { kind: 'pending'; approval: Approval } | { kind: 'done'; result?: ChatApprovalResult; answer?: string }

export function chatApprovalView(link: ChatApproval, pending: Approval | undefined): ChatApprovalView {
  if (link.result) return { kind: 'done', result: link.result, answer: link.answer }
  if (pending) return { kind: 'pending', approval: pending }
  // 결과를 남기지 못한 채 사라진 건(외부 직원이 원래 창에서 답함·앱 재시작 등)
  return { kind: 'done' }
}

/** 질문 답을 한 줄로: 질문이 하나면 답만, 여럿이면 "질문 → 답" 을 / 로 잇는다 */
export function answersText(answers: Record<string, string>): string {
  const entries = Object.entries(answers)
  if (entries.length === 1) return entries[0][1]
  return entries.map(([q, a]) => `${q} → ${a}`).join(' / ')
}
