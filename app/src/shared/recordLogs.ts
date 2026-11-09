// 직원 업무 패널 기록: 날짜와 상관없이 최근 기록부터 보여 주고, 위로 올리면 이전 기록을 이어 불러온다.
// 기록 순서는 id(오름차순)다 — DB는 넣은 순서, 외부 세션은 기록 파일의 줄 순서라 둘 다 시간 순서와 같다

import type { LogEntry, RecordPage } from './types'

/** 패널을 열 때 처음 보여 주는 최근 기록 수 */
export const RECORD_RECENT = 300
/** 위로 올려 한 번에 더 불러오는 기록 수 */
export const RECORD_PAGE = 200
/** 한 번에 불러올 수 있는 최대 수 (원격에서 큰 수를 보내도 이만큼만) */
export const RECORD_PAGE_MAX = 500

export const clampRecordLimit = (limit: number | undefined, fallback: number) =>
  Math.max(1, Math.min(RECORD_PAGE_MAX, Math.floor(Number.isFinite(limit) ? (limit as number) : fallback)))

/** id 오름차순 기록에서 beforeId보다 앞선 마지막 limit개 (beforeId가 없으면 맨 끝 limit개) */
export function pageLogs(logs: readonly LogEntry[], limit: number, beforeId?: number): RecordPage {
  const end = beforeId === undefined ? logs.length : lowerBound(logs, beforeId)
  const start = Math.max(0, end - limit)
  return { logs: logs.slice(start, end), hasMore: start > 0 }
}

/** id가 처음으로 beforeId 이상이 되는 자리 */
function lowerBound(logs: readonly LogEntry[], beforeId: number) {
  let lo = 0
  let hi = logs.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (logs[mid].id < beforeId) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * 이미 가진 기록(a)에 새로 읽은 기록(b)을 합친다. 둘 다 id 오름차순, 같은 id는 a를 남긴다.
 * 새로 더할 것이 없으면 a를 그대로 돌려줘 다시 그리지 않게 한다
 */
export function mergeLogs(a: readonly LogEntry[], b: readonly LogEntry[]): readonly LogEntry[] {
  if (b.length === 0) return a
  if (a.length === 0) return b
  // 흔한 경우: 뒤에 새 줄만 붙거나 앞에 이전 기록만 붙는다
  if (b[0].id > a[a.length - 1].id) return [...a, ...b]
  if (b[b.length - 1].id < a[0].id) return [...b, ...a]
  const have = new Set(a.map((l) => l.id))
  const fresh = b.filter((l) => !have.has(l.id))
  if (fresh.length === 0) return a
  return [...a, ...fresh].sort((x, y) => x.id - y.id)
}

/** 날짜 구분선을 나눌 그 기기의 날짜 (YYYY-M-D) */
export const dayKey = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** 목록에서 날짜가 바뀌는 자리(앞 줄과 날짜가 다른 줄)의 id들 — 첫 줄도 포함한다 */
export function dayStarts(logs: readonly LogEntry[]): Set<number> {
  const starts = new Set<number>()
  let prev = ''
  for (const l of logs) {
    const key = dayKey(l.ts)
    if (key !== prev) starts.add(l.id)
    prev = key
  }
  return starts
}
