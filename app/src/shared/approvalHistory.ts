import type { ApprovalHistoryFilter, ApprovalRecord } from './types.ts'

/** 직원 패널 결재 탭 '내가 내린 결재'에서 한 번에 불러오는 수 */
export const APPROVAL_HISTORY_PAGE_SIZE = 20

/** 기록 한 줄이 걸러보기에 들어가는지 — 뒷단 approvalRecordsPage의 걸러보기와 같은 규칙 (새로 들어온 줄을 붙일 때 쓴다) */
export function matchesApprovalFilter(r: Pick<ApprovalRecord, 'result' | 'actor'>, filter: ApprovalHistoryFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'auto') return r.actor === 'auto' || r.actor === 'rule'
  if (filter === 'approved') return shownResult(r) === 'approved'
  return r.result === filter
}

/** 줄 머리에 보일 결과: 자동결재·규칙이 승인한 줄은 '자동', 나머지는 결과 그대로 */
export function shownResult(r: Pick<ApprovalRecord, 'result' | 'actor'>): ApprovalRecord['result'] | 'auto' {
  return r.result === 'approved' && (r.actor === 'auto' || r.actor === 'rule') ? 'auto' : r.result
}

/** 새로 들어온 기록을 맨 앞에 붙인다 (같은 id가 이미 있거나 걸러보기에 안 맞으면 그대로) */
export function prependRecord(list: readonly ApprovalRecord[], rec: ApprovalRecord, filter: ApprovalHistoryFilter): readonly ApprovalRecord[] {
  if (!matchesApprovalFilter(rec, filter) || list.some((r) => r.id === rec.id)) return list
  return [rec, ...list]
}

/** 다시 받은 첫 쪽(최신순)에서 목록에 아직 없는 새 기록만 앞에 붙인다 (이미 더 불러온 이전 기록은 그대로 둔다) */
export function mergeNewer(list: readonly ApprovalRecord[], page: readonly ApprovalRecord[]): readonly ApprovalRecord[] {
  const newest = list[0]?.id ?? -Infinity
  const fresh = page.filter((r) => r.id > newest)
  return fresh.length ? [...fresh, ...list] : list
}

/** 최신순 기록을 그 기기의 날짜별로 묶는다 (순서는 그대로) */
export function groupByDay(list: readonly ApprovalRecord[]): { key: string; ts: number; records: ApprovalRecord[] }[] {
  const groups: { key: string; ts: number; records: ApprovalRecord[] }[] = []
  for (const r of list) {
    const d = new Date(r.decidedAt)
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
    const last = groups.at(-1)
    if (last?.key === key) last.records.push(r)
    else groups.push({ key, ts: r.decidedAt, records: [r] })
  }
  return groups
}
