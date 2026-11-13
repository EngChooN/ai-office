import { useEffect, useState } from 'react'
import type { Staff, StaffStatus } from '@shared/types'
import { t, type TKey } from '@shared/i18n'
import { isAwaitingTeam } from '@shared/delegation'

// 이름은 키로 두고 읽을 때 번역한다 (언어를 바꾸면 바로 바뀌게)
const meta = (labelKey: TKey, dot: string, text: string) => ({
  dot,
  text,
  get label() {
    return t(labelKey)
  },
})

export const STATUS_META: Record<StaffStatus, { readonly label: string; dot: string; text: string }> = {
  working: meta('status.working', 'bg-status-working', 'text-status-working'),
  waiting: meta('status.waiting', 'bg-status-waiting', 'text-status-waiting'),
  idle: meta('status.idle', 'bg-status-idle', 'text-status-idle'),
  offline: meta('status.offline', 'bg-status-idle', 'text-status-idle'),
  error: meta('status.error', 'bg-status-error', 'text-status-error'),
  netWait: meta('status.netWait', 'bg-status-waiting', 'text-status-waiting'),
}

const AWAITING_TEAM = meta('status.awaitingTeam', 'bg-status-working', 'text-status-working')

/** 직원 한 명의 상태 점·글자. 팀원 일을 기다리는 리더는 쉬는 중이 아니라 '팀원 기다리는 중'(작업 중 색)으로 보인다 */
export function statusMetaOf(s: Pick<Staff, 'status' | 'awaitingTeam'>) {
  return isAwaitingTeam(s) ? AWAITING_TEAM : STATUS_META[s.status]
}

export function formatCost(usd: number) {
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`
}

export { formatTokens } from '@shared/types'

/** 직원 작업 폴더 표시 — 고용 직원이 폴더를 지정 안 했으면 "지정 없음" */
export function workDirLabel(s: Pick<Staff, 'kind' | 'cwd' | 'ownCwd'>) {
  return s.kind === 'hired' && !s.ownCwd ? t('status.noFolder') : shortPath(s.cwd)
}

/** 홈 폴더를 ~로 줄인다 (맥 /Users/이름 · 윈도우 C:\Users\이름) */
export function shortPath(p: string) {
  return p.replace(/^(\/Users\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/, '~')
}

/** 경로의 마지막 폴더 이름 (맥·윈도우 구분자 모두) */
export function folderName(p: string) {
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p
}

/** 지금 시각을 주기적으로 다시 읽는다 (경과 시간·상대 시각 표시용). 창이 가려져 있는 동안은 쉬고, 다시 보이면 바로 맞춘다 */
export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const start = () => {
      clearInterval(timer)
      timer = setInterval(() => setNow(Date.now()), intervalMs)
    }
    const onVisibility = () => {
      if (document.hidden) return clearInterval(timer)
      setNow(Date.now())
      start()
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])
  return now
}
