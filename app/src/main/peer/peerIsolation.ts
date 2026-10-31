// 다른 PC가 맡긴 일의 격리 규칙 (순수 함수 — office.ts가 쓰고 테스트가 직접 부른다)
// 승인 주체(피어 jobId)가 있으면 자동결재 끔·A컴 결재 중계·acceptEdits 거절이 적용된다. 로컬 일과 같은 세션에서 섞이지 않게 한다

export interface OriginLike {
  kind: string
  jobId?: string
  peerJobId?: string
}

/** 이 직원이 받은 일 중 피어 일(또는 거기서 파생된 재위임)이 하나라도 있으면 그 일 id — 맨 앞이 로컬이어도 빠지지 않는다 */
export function peerJobOfOrigins(origins: readonly OriginLike[]): string | null {
  for (const o of origins) {
    if (o.kind === 'peer' && o.jobId) return o.jobId
    if (o.peerJobId) return o.peerJobId
  }
  return null
}

export const isPeerOrigin = (o: OriginLike) => o.kind === 'peer' || Boolean(o.peerJobId)

/** 피어 일이 걸린 직원에게 온 지시를 대기시켜야 하는가 (피어 문맥의 지시와 /명령은 통과) */
export const shouldHoldLocal = (origins: readonly OriginLike[], incoming: OriginLike, isSlash: boolean) => peerJobOfOrigins(origins) !== null && !isPeerOrigin(incoming) && !isSlash

/** 로컬 일을 하는 직원은 피어 일을 받지 않는다 (A컴 큐가 잠시 뒤 다시 보낸다) */
export const hasLocalWork = (origins: readonly OriginLike[], backlog: number, queuedTasks: number) => origins.some((o) => !isPeerOrigin(o)) || backlog > 0 || queuedTasks > 0
