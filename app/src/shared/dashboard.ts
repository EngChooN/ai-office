// 대시보드 상황판 계산 (요약 줄·확인 필요·맡은 업무·시간 표기). 화면과 떼어 단위 테스트한다
import { t } from './i18n/index.ts'
import type { Approval, LogType, Staff, Task } from './types'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
/** 예산 경고·초과 기준 (급여 명세서와 같다) */
export const BUDGET_WARN_RATIO = 0.8

/** 지금 상태가 이어진 시간: 방금 / 12분째 / 1시간 5분째 / 2일째 */
export function formatElapsed(ms: number) {
  if (ms < MINUTE_MS) return t('elapsed.now')
  if (ms < HOUR_MS) return t('elapsed.min', { n: Math.floor(ms / MINUTE_MS) })
  if (ms < DAY_MS) {
    const m = Math.floor((ms % HOUR_MS) / MINUTE_MS)
    return m ? t('elapsed.hourMin', { h: Math.floor(ms / HOUR_MS), m }) : t('elapsed.hour', { n: Math.floor(ms / HOUR_MS) })
  }
  return t('elapsed.day', { n: Math.floor(ms / DAY_MS) })
}

/** 활동 피드 시각: 방금 / 3분 전 / 2시간 전, 하루가 넘으면 10/20 14:30 */
export function formatAgo(ts: number, now: number) {
  const ms = now - ts
  if (ms < MINUTE_MS) return t('elapsed.now')
  if (ms < HOUR_MS) return t('ago.min', { n: Math.floor(ms / MINUTE_MS) })
  if (ms < DAY_MS) return t('ago.hour', { n: Math.floor(ms / HOUR_MS) })
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 이니셜 원 글자: 한글 이름은 뒤 2글자(성이 겹치지 않게), 영문은 단어 첫 글자 2개 */
export function initials(name: string) {
  const trimmed = name.trim()
  if (/^[A-Za-z]/.test(trimmed)) {
    const words = trimmed.split(/[\s._-]+/).filter(Boolean)
    return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase()
  }
  const chars = [...trimmed.replace(/\s+/g, '')]
  return chars.length <= 2 ? chars.join('') : chars.slice(-2).join('')
}

export type SummaryKey = 'working' | 'waiting' | 'error' | 'idle'

/** 요약 줄 상태별 인원. 퇴근(offline)은 세지 않는다 */
export function countByStatus(staff: Pick<Staff, 'status'>[]): Record<SummaryKey, number> {
  const counts: Record<SummaryKey, number> = { working: 0, waiting: 0, error: 0, idle: 0 }
  for (const s of staff) if (s.status !== 'offline') counts[s.status]++
  return counts
}

export type AttentionKind = 'approval' | 'question' | 'error' | 'budget'

export interface AttentionItem {
  key: string
  kind: AttentionKind
  staffId: string
  createdAt: number
  approval?: Approval
  /** 예산 항목: 사용 비율 (0.87 = 87%) */
  ratio?: number
}

const KIND_ORDER: Record<AttentionKind, number> = { error: 0, approval: 1, question: 1, budget: 2 }

/**
 * 확인 필요 칸 항목. 오류가 맨 위, 그다음 결재·질문은 오래된 것부터(FIFO), 예산 경고는 아래.
 * budgetRatio: 직원별 이번 달 예산 사용 비율 (예산을 안 정했으면 없음)
 */
export function attentionItems(staff: Pick<Staff, 'id' | 'status' | 'statusSince' | 'approvals'>[], budgetRatio: Map<string, number>): AttentionItem[] {
  const items: AttentionItem[] = []
  for (const s of staff) {
    if (s.status === 'error') items.push({ key: `error:${s.id}`, kind: 'error', staffId: s.id, createdAt: s.statusSince })
    for (const a of s.approvals) items.push({ key: `approval:${a.id}`, kind: a.questions ? 'question' : 'approval', staffId: s.id, createdAt: a.createdAt, approval: a })
    const ratio = budgetRatio.get(s.id)
    if (ratio !== undefined && ratio >= BUDGET_WARN_RATIO) items.push({ key: `budget:${s.id}`, kind: 'budget', staffId: s.id, createdAt: 0, ratio })
  }
  return items.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.createdAt - b.createdAt)
}

/** 직원이 지금 맡은 보드 업무: 진행 중(doing) 중 가장 최근 것 + 나머지 수 */
export function currentTask(tasks: Pick<Task, 'title' | 'status' | 'assigneeId' | 'updatedAt'>[], staffId: string) {
  const doing = tasks.filter((t) => t.assigneeId === staffId && t.status === 'doing').sort((a, b) => b.updatedAt - a.updatedAt)
  return doing.length ? { title: doing[0].title, more: doing.length - 1 } : null
}

/** 활동 피드에 보일 기록 (도구 사용·인사는 소음이라 뺀다) */
export const FEED_TYPES = new Set<LogType>(['result', 'error', 'approval', 'delegate', 'commit', 'reply'])

/** 사용 비율 (한도가 없으면 null) */
export const usageRatio = (used: number, limit: number) => (limit > 0 ? used / limit : null)
