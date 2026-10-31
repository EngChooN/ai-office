// 데모데이 발표장을 앱 전체에 한 번 붙이는 자리 — 새 데모데이가 시작되면 발표장으로 옮긴다.
// 발표장 화면(DemoStage.tsx)은 Phaser를 쓰므로 발표장을 열 때만 불러온다 (첫 화면에 싣지 않게)
import { lazy, Suspense, useEffect, useRef } from 'react'
import { LoadErrorBoundary } from '@/components/load-error-boundary'
import { useOffice, useWorkMode } from '@/store'
import { isMeetingLive, type Meeting } from '@shared/types'

/** 진행 표시가 이만큼 멈춰 있으면 앱이 꺼졌다 켜진 옛 회의로 보고 발표장으로 부르지 않는다 */
const STALE_MS = 90_000

const loadStage = () => lazy(() => import('./DemoStage').then((m) => ({ default: m.StageOverlay })))
/** 받지 못하면 "다시 시도"에서 새로 만든다 (lazy는 실패를 기억한다) */
let StageOverlay = loadStage()

/** 지금 진행 중인 데모데이 (오래 멈춘 옛 기록은 뺀다) */
export function liveDemoOf(meetings: Meeting[], now = Date.now()) {
  return meetings.find((m) => m.kind === 'demo' && m.demo && isMeetingLive(m) && now < m.demo.startedAt + m.demo.durationMs + STALE_MS) ?? null
}

/** 앱 전체에 한 번 붙는다: 새 데모데이가 시작되면 발표장으로 옮기고, 열려 있으면 발표장을 그린다 */
export function DemoStage() {
  const stageId = useOffice((s) => s.demoStageId)
  const setStageId = useOffice((s) => s.setDemoStageId)
  const live = useOffice((s) => liveDemoOf(s.meetings))
  const isWorkMode = useWorkMode()
  // 한 회의는 한 번만 저절로 연다 — 사무실로 돌아간 뒤 다시 끌려오지 않게
  const autoOpenedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!live || isWorkMode || autoOpenedRef.current === live.id) return
    autoOpenedRef.current = live.id
    if (Date.now() - live.createdAt < STALE_MS) setStageId(live.id)
  }, [live, isWorkMode, setStageId])
  if (!stageId) return null
  return (
    <LoadErrorBoundary
      key={stageId}
      onRetry={() => (StageOverlay = loadStage())}
      onClose={() => setStageId(null)}
      className="bg-background fixed inset-x-0 top-11 bottom-0 z-40 h-auto"
    >
      {() => (
        <Suspense fallback={null}>
          <StageOverlay meetingId={stageId} onClose={() => setStageId(null)} />
        </Suspense>
      )}
    </LoadErrorBoundary>
  )
}
