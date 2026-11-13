// 비서 답 안에 띄울 결재 카드 고르기 — electron 없음 (scripts/secretaryApprovals.test.mts)

import type { Approval } from '../shared/types.ts'

/** 한 번에 띄우는 카드 수 — 많으면 답이 길어져 오래된 것부터 이만큼만 (나머지는 결재함) */
export const APPROVAL_CARDS_MAX = 5

/** 질문이 아닌 결재를 오래된 순으로 최대 APPROVAL_CARDS_MAX개의 id로 */
export const approvalCardIds = (approvals: Pick<Approval, 'id' | 'createdAt' | 'questions'>[]): string[] =>
  approvals
    .filter((a) => !a.questions)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, APPROVAL_CARDS_MAX)
    .map((a) => a.id)
