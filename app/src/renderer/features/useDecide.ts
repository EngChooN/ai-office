import { useCallback, useRef, useState } from 'react'
import { decideOutcome } from './secretary/decideOutcome'

export type DecidePhase = 'idle' | 'busy' | 'done' | 'failed'

/** 결재 카드 하나의 승인·반려: 누르면 바로 '처리 중'(두 버튼 끔), 처리 결과를 확인한 뒤
 * 성공이면 'done'(카드를 숨긴다 — 이 카드 컴포넌트가 살아 있는 동안 늦게 온 옛 상태 알림에도 다시 나타나지 않는다), 실패면 'failed'(되돌려 다시 누를 수 있게) */
export function useDecide(approvalId: string) {
  const [phase, setPhase] = useState<DecidePhase>('idle')
  const lock = useRef(false)
  const decide = useCallback(
    async (allow: boolean) => {
      if (lock.current) return
      lock.current = true
      setPhase('busy')
      const outcome = await decideOutcome(() => window.office.decide(approvalId, allow), allow)
      lock.current = outcome !== 'failed'
      setPhase(outcome === 'failed' ? 'failed' : 'done')
    },
    [approvalId],
  )
  return { phase, isBusy: phase === 'busy', isDone: phase === 'done', isFailed: phase === 'failed', decide }
}
