// 기록 › 보고서 하루 보기 — 하루치 기록을 종류로 나누고, 오늘 요약 숫자를 세고, 직원별로 묶는다 (화면 없는 순수 함수)

import { LANGS, tr, type I18nArg, type I18nText } from './i18n/index.ts'
import type { LogEntry, LogType } from './types.ts'

/** 화면에서 거르는 종류: 끝낸 일·지시(대표 지시 + 리더가 맡긴 일)·결재·문제·그 밖(보고·인사·커밋)·도구 사용(기본 숨김) */
export type RecordKind = 'done' | 'instruction' | 'approval' | 'error' | 'other' | 'tool'
/** 걸러보기 칩: 전체 또는 요약 4칸의 종류 */
export type RecordFilter = 'all' | 'done' | 'instruction' | 'approval' | 'error'
export const RECORD_FILTERS: readonly RecordFilter[] = ['all', 'done', 'instruction', 'approval', 'error']

const KIND_OF: Record<LogType, RecordKind> = {
  result: 'done',
  instruction: 'instruction',
  delegate: 'instruction',
  approval: 'approval',
  error: 'error',
  tool: 'tool',
  reply: 'other',
  status: 'other',
  commit: 'other',
}
export const recordKind = (type: LogType): RecordKind => KIND_OF[type]

/** 결재 줄의 결과: 대표가 승인·반려·답변, 또는 자동결재·규칙·지난 결정이 처리 (null = 안내·취소 등 결과가 아닌 줄) */
export type ApprovalOutcome = 'approved' | 'rejected' | 'answered' | 'auto'

const RESULT_KEYS: Record<string, ApprovalOutcome> = { 'log.approved': 'approved', 'log.rejected': 'rejected', 'log.answered': 'answered' }
const AUTO_KEYS = ['log.autoApprove', 'log.ruleApprove', 'log.autonomousSkip', 'log.autoAnswer', 'log.autonomousAnswer', 'log.pastDecision'] as const
const REMOTE_MARK = '📱 원격'

const isText = (v: I18nArg): v is I18nText => typeof v === 'object' && 'key' in v

/** 번역 키가 남은 줄: 목록 안(휴대폰 표시로 한 번 더 감싼 것 포함)에서 처음 나오는 결과 키 */
function outcomeOfArg(v: I18nArg): ApprovalOutcome | null | undefined {
  if (typeof v !== 'object') return undefined
  if (isText(v)) return RESULT_KEYS[v.key] ?? ((AUTO_KEYS as readonly string[]).includes(v.key) ? 'auto' : undefined)
  for (const x of v.list) {
    const o = outcomeOfArg(x)
    if (o !== undefined) return o
  }
  return undefined
}

const SENT = '\u0001'
let textPrefixes: [string, ApprovalOutcome][] | null = null
/** 글자만 남은 예전 줄: 4개 언어의 라벨·자동 처리 문장 앞부분으로 읽는다 */
function prefixes(): [string, ApprovalOutcome][] {
  if (textPrefixes) return textPrefixes
  const out: [string, ApprovalOutcome][] = []
  for (const lang of LANGS) {
    for (const [key, o] of Object.entries(RESULT_KEYS)) {
      const label = tr({ key }, lang)
      out.push([`${label}:`, o], [`${label}：`, o])
    }
    for (const key of AUTO_KEYS) {
      const s = tr({ key, params: { tool: SENT, summary: SENT, text: SENT, took: SENT, name: SENT } }, lang)
      const head = s.slice(0, s.indexOf(SENT)).trim()
      if (head) out.push([head, 'auto'])
    }
  }
  return (textPrefixes = out)
}

export function approvalOutcome(l: Pick<LogEntry, 'type' | 'text' | 'textI18n'>): ApprovalOutcome | null {
  if (l.type !== 'approval') return null
  if (l.textI18n !== undefined) {
    const o = outcomeOfArg(l.textI18n)
    if (o !== undefined) return o
  }
  const text = l.text.startsWith(REMOTE_MARK) ? l.text.slice(REMOTE_MARK.length).trimStart() : l.text
  return prefixes().find(([p]) => text.startsWith(p))?.[1] ?? null
}

export interface DaySummary {
  done: number
  instruction: number
  approval: { total: number; approved: number; rejected: number; answered: number; auto: number }
  error: number
  /** 결과물(report_artifact) 개수 */
  artifacts: number
}

/** 오늘 요약 4칸 숫자. 결재는 결과가 있는 줄만 센다(대기 알림·규칙 추가 안내는 빼고) */
export function summarizeDay(logs: readonly LogEntry[]): DaySummary {
  const sum: DaySummary = { done: 0, instruction: 0, approval: { total: 0, approved: 0, rejected: 0, answered: 0, auto: 0 }, error: 0, artifacts: 0 }
  for (const l of logs) {
    const kind = recordKind(l.type)
    if (kind === 'done') sum.done++
    else if (kind === 'instruction') sum.instruction++
    else if (kind === 'error') sum.error++
    else if (kind === 'approval') {
      const o = approvalOutcome(l)
      if (o) {
        sum.approval.total++
        sum.approval[o]++
      }
    }
    sum.artifacts += l.attachments?.filter((a) => a.artifact).length ?? 0
  }
  return sum
}

/** 걸러보기: 종류 칩 + 직원(null = 모두) + 도구 사용 보기. 결과는 최신이 먼저 */
export function filterDay(logs: readonly LogEntry[], opts: { filter: RecordFilter; staffId: string | null; isToolsShown: boolean }): LogEntry[] {
  return logs
    .filter((l) => {
      const kind = recordKind(l.type)
      if (opts.staffId && l.staffId !== opts.staffId) return false
      if (opts.filter !== 'all') return kind === opts.filter
      return kind !== 'tool' || opts.isToolsShown
    })
    .sort((a, b) => b.ts - a.ts || b.id - a.id)
}

export interface StaffGroup {
  staffId: string
  /** 최신이 먼저 */
  items: LogEntry[]
  counts: Record<Exclude<RecordKind, 'tool' | 'other'>, number>
}

/** 직원별 묶음 — 문제 있는 직원이 먼저, 그다음 기록이 많은 직원, 같으면 최근에 기록한 직원 */
export function groupByStaff(logs: readonly LogEntry[]): StaffGroup[] {
  const map = new Map<string, StaffGroup>()
  for (const l of [...logs].sort((a, b) => b.ts - a.ts || b.id - a.id)) {
    let g = map.get(l.staffId)
    if (!g) map.set(l.staffId, (g = { staffId: l.staffId, items: [], counts: { done: 0, instruction: 0, approval: 0, error: 0 } }))
    g.items.push(l)
    const kind = recordKind(l.type)
    if (kind !== 'tool' && kind !== 'other') g.counts[kind]++
  }
  return [...map.values()].sort((a, b) => Number(b.counts.error > 0) - Number(a.counts.error > 0) || b.items.length - a.items.length || b.items[0].ts - a.items[0].ts)
}

/** 접힌 줄에 보일 한 줄 글 — 첫 줄(마크다운 머리 기호는 떼고) */
export function oneLine(text: string): string {
  const first = text.split('\n').find((s) => s.trim()) ?? ''
  return first.replace(/^\s*(#{1,6}\s+|[-*+]\s+|>\s*)/, '').trim()
}

/** 날짜 이동: 그날 0시에서 days만큼 (서머타임이 있어도 날짜 기준으로) */
export function shiftDay(dayStart: number, days: number): number {
  const d = new Date(dayStart)
  d.setDate(d.getDate() + days)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export const startOfDay = (ms: number) => new Date(new Date(ms).setHours(0, 0, 0, 0)).getTime()

/** 받아 둔 하루치 기록 뒤에 새로 들어온 기록 중 이날 것만 붙인다 (이미 있는 id는 건너뜀, 새 것이 없으면 그대로) */
export function appendLive(day: readonly LogEntry[], live: readonly LogEntry[], dayStart: number, nextDay: number): LogEntry[] {
  const lastId = day.reduce((m, l) => Math.max(m, l.id), -Infinity)
  const fresh = live.filter((l) => l.id > lastId && l.ts >= dayStart && l.ts < nextDay)
  return fresh.length ? [...day, ...fresh] : (day as LogEntry[])
}
