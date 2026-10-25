import type { BudgetPeriod } from './types'

export const BUDGET_PERIODS: BudgetPeriod[] = ['day', 'week', 'month']
export const BUDGET_WARN_RATIOS = [0.8, 1]
/** 주의 시작 요일 (0 = 일요일, 1 = 월요일) — [미확정] 대표 결정 전 임시값 */
export const WEEK_STARTS_ON = 1

/** 달력 기준 기간의 시작 시각 */
export function periodStart(period: BudgetPeriod, d: Date) {
  if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  if (period === 'week') x.setDate(x.getDate() - ((x.getDay() - WEEK_STARTS_ON + 7) % 7))
  return x.getTime()
}

/**
 * 예산에 세는 토큰 — [미확정] 대표 결정 전 임시로 입력+출력 합산.
 * tokensIn에는 캐시 읽기·쓰기 토큰이 이미 섞여 있다 (hired.ts·transcript.ts 기록 방식). 정의가 바뀌면 여기만 고친다.
 */
export function budgetTokens(u: { tokensIn: number; tokensOut: number }) {
  return u.tokensIn + u.tokensOut
}

/** "5M", "340K", "1,000,000" → 토큰 수. 빈 값은 0(제한 없음), 못 읽으면 null */
export function parseTokens(text: string) {
  if (!text.trim()) return 0
  const m = text.replace(/[,\s]/g, '').match(/^(\d+(?:\.\d+)?)([kKmM]?)$/)
  if (!m) return null
  const unit = { k: 1_000, m: 1_000_000 }[m[2].toLowerCase()] ?? 1
  return Math.round(Number(m[1]) * unit)
}

/**
 * 알림 범위 키: 기간·기간 시작·단위·한도. 한도를 바꾸면 키가 달라져 같은 기간에도 다시 알린다.
 * 예) "day:1792508400000:tok:5000000", "month:1790866800000:usd:50"
 */
export function budgetAlertScope(period: BudgetPeriod, start: number, unit: 'tok' | 'usd', limit: number) {
  return `${period}:${start}:${unit}:${limit}`
}

/**
 * 아직 안 알린 문턱 중 넘은 것이 있으면 가장 높은 문턱 하나만 알린다.
 * keys = 이번에 알린 것으로 표시할 키 (넘은 문턱 전부 — 80%와 100%를 한 번에 넘으면 100%만 알리고 80%도 표시)
 */
export function nextBudgetAlert(scope: string, usedRatio: number, warned: ReadonlySet<string>) {
  const crossed = BUDGET_WARN_RATIOS.filter((r) => usedRatio >= r)
  const fresh = crossed.filter((r) => !warned.has(`${scope}:${r}`))
  if (fresh.length === 0) return null
  return { ratio: Math.max(...fresh), keys: crossed.map((r) => `${scope}:${r}`) }
}

/** 지난 기간의 알림 키는 버린다 (저장해 둔 키가 끝없이 늘지 않게) */
export function pruneAlertKeys(keys: Iterable<string>, now: Date) {
  return [...keys].filter((key) => {
    const [period, start] = key.split(':')
    return BUDGET_PERIODS.includes(period as BudgetPeriod) && Number(start) === periodStart(period as BudgetPeriod, now)
  })
}
