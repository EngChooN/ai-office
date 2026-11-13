// 아침(밤사이) 요약: 언제 띄울지·무엇을 셀지 — electron 없음 (scripts/secretaryBrief.test.mts)
// 조회만 한다 (지어내지 않음): 그동안 끝난 업무 카드·기다리는 결재·오류 난 직원

import { t } from '../shared/i18n/index.ts'
import type { OfficeSnapshot } from '../shared/types.ts'

/** 이만큼 비서를 안 열었다 돌아오면 요약을 보인다 (앱을 새로 켠 뒤 처음 열 때도) */
export const BRIEF_GAP_MS = 6 * 3_600_000

export interface BriefCounts {
  done: number
  approvals: number
  errors: number
}

export interface BriefDueInput {
  isEnabled: boolean
  /** 비서를 마지막으로 연 시각 (처음이면 null) */
  seenAt: number | null
  now: number
  /** 이 앱 실행에서 비서를 처음 여는 것인지 */
  isFirstOpenThisRun: boolean
}

/** 요약을 띄울 때인가: 켜져 있고, 예전에 연 적이 있고, (6시간 넘게 비웠거나 앱을 새로 켠 뒤 첫 열기) */
export const briefDue = ({ isEnabled, seenAt, now, isFirstOpenThisRun }: BriefDueInput) => isEnabled && seenAt !== null && (isFirstOpenThisRun || now - seenAt >= BRIEF_GAP_MS)

/** 그동안의 숫자 — 업무 카드는 since 이후 끝난 것(검토 대기 포함), 결재는 질문 제외 지금 대기 수 (대시보드와 같은 스냅샷) */
export function briefCounts(snap: Pick<OfficeSnapshot, 'tasks' | 'staff'>, since: number): BriefCounts {
  return {
    done: snap.tasks.filter((x) => x.updatedAt >= since && (x.status === 'done' || x.status === 'review')).length,
    approvals: snap.staff.reduce((n, s) => n + s.approvals.filter((a) => !a.questions).length, 0),
    errors: snap.staff.filter((s) => s.kind === 'hired' && s.status === 'error').length,
  }
}

export const isBriefEmpty = (c: BriefCounts) => c.done + c.approvals + c.errors === 0

/** 요약 한 줄 — 0인 항목은 뺀다. 아침(그동안 6시간+ 이고 오전)이면 인사말을 달리 */
export function briefText(c: BriefCounts, now: number, gapMs: number): string {
  const parts = [c.done && t('secretary.brief.done', { n: c.done }), c.approvals && t('secretary.brief.approvals', { n: c.approvals }), c.errors && t('secretary.brief.errors', { n: c.errors })].filter(Boolean)
  const isMorning = gapMs >= BRIEF_GAP_MS && new Date(now).getHours() < 11
  return t(isMorning ? 'secretary.brief.morning' : 'secretary.brief.back', { items: parts.join(t('secretary.brief.sep')) })
}
