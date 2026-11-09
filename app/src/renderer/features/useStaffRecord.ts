import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { mergeLogs, RECORD_PAGE } from '@shared/recordLogs'
import type { DailyRecord, LogEntry } from '@shared/types'

const EXTERNAL_REFRESH_MS = 5000
/** 맨 위에서 이만큼 안으로 올라오면 이전 기록을 미리 불러온다 */
const LOAD_OLDER_PX = 400

type Loaded = { logs: readonly LogEntry[]; hasMore: boolean }
export type OlderState = 'idle' | 'loading' | 'error'

/**
 * 업무 패널 기록: 처음엔 날짜와 상관없이 최근 기록을, 위로 올리면 이전 기록을 이어 붙인다.
 * 다시 읽어도(외부 직원 5초마다, 고용 직원은 턴이 끝날 때) 이미 불러온 이전 기록은 그대로 두고 새 줄만 합친다.
 * 오늘 사용량(usage)은 기록과 따로 오늘 0시부터 센다
 */
export function useStaffRecord(staffId: string, isHired: boolean, costUsd: number, scrollRef: RefObject<HTMLElement | null>) {
  const [usage, setUsage] = useState<DailyRecord | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [older, setOlder] = useState<OlderState>('idle')

  useEffect(() => {
    let isLive = true
    const load = () =>
      void window.office.getRecord(staffId).then((r) => {
        if (!isLive) return
        setUsage(r)
        setLoaded((prev) => {
          if (!prev || prev.logs.length === 0) return { logs: r.logs, hasMore: r.hasMore ?? false }
          const logs = mergeLogs(prev.logs, r.logs)
          return logs === prev.logs ? prev : { ...prev, logs }
        })
      })
    load()
    const timer = isHired ? undefined : setInterval(load, EXTERNAL_REFRESH_MS)
    return () => {
      isLive = false
      clearInterval(timer)
    }
    // 고용 직원은 턴이 끝나 비용이 바뀔 때마다 오늘 사용량을 다시 읽는다 (새 기록은 실시간 줄로 붙는다)
  }, [staffId, isHired, costUsd])

  // 이전 기록을 앞에 붙이기 직전의 스크롤 위치 — 붙인 뒤 늘어난 높이만큼 내려 보던 줄을 제자리에 둔다
  const anchorRef = useRef<{ height: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    const anchor = anchorRef.current
    if (!el || !anchor) return
    anchorRef.current = null
    el.scrollTop = anchor.top + (el.scrollHeight - anchor.height)
  })

  const busyRef = useRef(false)
  const loadOlder = useCallback(async () => {
    const first = loaded?.logs[0]
    if (!first || !loaded.hasMore || busyRef.current) return
    busyRef.current = true
    setOlder('loading')
    try {
      const page = await window.office.getRecordBefore(staffId, first.id, RECORD_PAGE)
      const el = scrollRef.current
      if (el) anchorRef.current = { height: el.scrollHeight, top: el.scrollTop }
      setLoaded((prev) => (prev ? { logs: mergeLogs(prev.logs, page.logs), hasMore: page.hasMore } : prev))
      setOlder('idle')
    } catch {
      setOlder('error')
    } finally {
      busyRef.current = false
    }
  }, [staffId, loaded, scrollRef])

  /** 맨 위 가까이면 이전 기록을 부른다 (스크롤할 때·불러온 뒤에도 화면이 덜 찼을 때) */
  const maybeLoadOlder = useCallback(() => {
    const el = scrollRef.current
    if (el && el.scrollTop < LOAD_OLDER_PX && older === 'idle') void loadOlder()
  }, [scrollRef, older, loadOlder])

  return { usage, logs: loaded?.logs, hasMore: loaded?.hasMore ?? false, older, loadOlder, maybeLoadOlder }
}
