import { useEffect, useRef, useState } from 'react'
import { useOffice } from '@/store'
import { encodeLook, randomLook } from '@shared/look'
import type { AiProvider, LogEntry, PlanUsage } from '@shared/types'
import { t, trOr } from '@shared/i18n'

// 온보딩 첫 업무: 직원 1명을 고용해 예제 업무를 실제로 맡기고, 결과·실패를 지켜본다 (화면은 Onboarding.tsx)
export type FirstTaskExample = 'folder' | 'ideas'
export type FirstTaskPhase = 'pick' | 'running' | 'done' | 'failed'
export type FirstTaskFail = 'login' | 'limit' | 'timeout' | 'network' | 'unknown'

/** 이 시간이 넘으면 실패로 보여 준다 (직원은 계속 일하고, 늦게라도 끝나면 완료로 바뀐다) */
export const FIRST_TASK_TIMEOUT_MS = 90_000
const PROGRESS_LINES = 3

const promptOf = (example: FirstTaskExample) => (example === 'folder' ? t('onboarding.firstTask.taskFolder') : t('onboarding.firstTask.taskIdeas'))

/** 오류 글·공급자 상태로 실패 원인을 고른다 (사용자에게 보일 안내 한 줄을 정하는 용도) */
export function classifyFail(text: string, opts: { isLoggedOut: boolean; isLimited: boolean; isOnline: boolean }): FirstTaskFail {
  if (opts.isLoggedOut || /log ?in|auth|401|unauthori|credential|로그인/i.test(text)) return 'login'
  if (opts.isLimited || /limit|quota|rate|429|usage|한도/i.test(text)) return 'limit'
  if (!opts.isOnline || /network|ENOTFOUND|ECONN|ETIMEDOUT|fetch failed|socket|offline/i.test(text)) return 'network'
  return 'unknown'
}

const limitResetAt = (usage: PlanUsage[]) => usage.find((u) => u.status === 'rejected' && u.resetsAt)?.resetsAt ?? null

export function useFirstTask() {
  const [phase, setPhase] = useState<FirstTaskPhase>('pick')
  const [staffId, setStaffId] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState(0)
  const [finishedAt, setFinishedAt] = useState(0)
  const [now, setNow] = useState(0)
  const [fail, setFail] = useState<FirstTaskFail | null>(null)
  const [limitAt, setLimitAt] = useState<number | null>(null)
  const seenApprovals = useRef(new Set<string>())
  const staff = useOffice((s) => (staffId ? s.staff.find((x) => x.id === staffId) : undefined))
  const liveLogs = useOffice((s) => s.liveLogs)
  const logs: LogEntry[] = staffId && startedAt ? liveLogs.filter((l) => l.staffId === staffId && l.ts >= startedAt) : []
  const report = logs.findLast((l) => l.type === 'reply')?.text ?? ''
  const progress = logs
    .filter((l) => l.type === 'tool')
    .slice(-PROGRESS_LINES)
    .map((l) => trOr(l.textI18n, l.text))
  const approvals = staff?.approvals ?? []
  for (const a of approvals) seenApprovals.current.add(a.id)

  // 끝·오류는 이번 지시 뒤의 로그로만 판단한다 (시간 초과로 실패를 보인 뒤에 끝나도 완료로 바꾼다)
  const doneLog = logs.find((l) => l.type === 'result')
  const errorLog = logs.find((l) => l.type === 'error')
  const isWatching = phase === 'running' || (phase === 'failed' && fail === 'timeout')
  useEffect(() => {
    if (!isWatching) return
    if (doneLog) {
      setFinishedAt(doneLog.ts)
      setFail(null)
      setPhase('done')
      return
    }
    if (!errorLog) return
    const text = `${trOr(errorLog.textI18n, errorLog.text)} ${staff?.activity ?? ''}`
    const provider = staff?.provider ?? 'claude'
    void window.office.providerStatus().then((providers) => {
      const s = useOffice.getState()
      const resetAt = limitResetAt(provider === 'codex' ? (s.codexUsage ?? []) : s.planUsage)
      setLimitAt(resetAt)
      setFail(classifyFail(text, { isLoggedOut: providers[provider].state === 'loggedOut', isLimited: resetAt !== null, isOnline: navigator.onLine }))
      setPhase('failed')
    })
  }, [isWatching, doneLog, errorLog, staff?.activity, staff?.provider])

  // 경과 시간 표시 + 시간 초과
  useEffect(() => {
    if (phase !== 'running') return
    const timer = setInterval(() => {
      const at = Date.now()
      setNow(at)
      if (at - startedAt > FIRST_TASK_TIMEOUT_MS) {
        setFail('timeout')
        setPhase('failed')
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [phase, startedAt])

  /** 처음엔 직원을 고용하고, 다시 시도할 때는 같은 직원에게 다시 맡긴다 (일하는 중이면 멈추고 새로 지시) */
  const run = async (example: FirstTaskExample, provider: AiProvider, cwd: string) => {
    let id = staffId
    if (!id) {
      const hired = await window.office.hire({
        name: t('onboarding.firstTask.staffName'),
        role: t('onboarding.firstTask.staffRole'),
        avatar: encodeLook(randomLook()),
        provider,
        model: 'default',
        cwd: example === 'folder' ? cwd : '',
        systemPrompt: '',
        approvalMode: 'ask',
        teamId: null,
        labIds: [],
      })
      id = hired.id
      setStaffId(id)
    }
    const at = Date.now()
    seenApprovals.current.clear()
    setStartedAt(at)
    setNow(at)
    setFail(null)
    setPhase('running')
    const isBusy = useOffice.getState().staff.find((x) => x.id === id)?.status === 'working'
    await (isBusy ? window.office.interrupt(id, promptOf(example)) : window.office.instruct(id, promptOf(example)))
  }

  /** 첫 업무용 직원을 내보낸다 — 온보딩이 끝나거나(완료·실패·건너뛰기) 그만두면 사무실에 남기지 않는다 (업무 기록은 남는다) */
  const dismiss = () => {
    if (staffId) void window.office.fire(staffId)
    setStaffId(null)
  }

  const stop = () => {
    dismiss()
    setPhase('pick')
  }

  return {
    phase,
    staff,
    fail,
    limitAt,
    report,
    progress,
    approvals,
    approvalCount: seenApprovals.current.size,
    elapsedMs: Math.max(0, now - startedAt),
    tookMs: Math.max(0, finishedAt - startedAt),
    run,
    stop,
    dismiss,
    /** 실패 화면에서 고르기로 돌아가기 */
    reset: () => setPhase('pick'),
  }
}
