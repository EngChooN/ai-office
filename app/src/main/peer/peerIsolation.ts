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

/** 이 직원을 jobId와 다른 피어 일(또는 그 복사본 폴더)이 쓰고 있는가 — 다른 일끼리는 한 세션에서 섞이지 않는다. jobId가 없으면(로컬 진입점) 어떤 피어 일이든 점유로 본다 */
export function heldByOtherPeerJob(origins: readonly OriginLike[], cwdJobId: string | undefined, jobId?: string): boolean {
  const cur = peerJobOfOrigins(origins)
  return (cur !== null && cur !== jobId) || (cwdJobId !== undefined && cwdJobId !== jobId)
}

/**
 * 피어 일에서 파생된 지시(늦게 온 팀원 보고·멈춤 방지 재지시)를 어떻게 다룰까
 * - 그 피어 일이 이미 끝났으면 버린다 (A컴은 결과를 받았고, 이어 하면 승인 주체 없이 일하게 된다)
 * - 이 직원을 다른 피어 일이 쓰고 있으면 그 일이 끝날 때까지 대기시킨다 (한 세션에서 섞지 않는다)
 */
export function derivedPeerAction(incoming: OriginLike, origins: readonly OriginLike[], cwdJobId: string | undefined, isJobActive: (jobId: string) => boolean): 'pass' | 'drop' | 'hold' {
  if (incoming.kind === 'peer' || !incoming.peerJobId) return 'pass'
  if (!isJobActive(incoming.peerJobId)) return 'drop'
  return heldByOtherPeerJob(origins, cwdJobId, incoming.peerJobId) ? 'hold' : 'pass'
}

/** 피어 문맥에서 업무 카드를 새로 만들거나 기획안을 올릴 수 있는가 — 카드는 승인 주체를 이어받지 못하므로 막는다 */
export const canCreateCards = (origins: readonly OriginLike[]) => peerJobOfOrigins(origins) === null

/** 이 피어 일이 파일 복사본 폴더로 일하는 중이면 재위임을 막는다 (자식 직원에게 복사본 cwd·수명을 이어 줄 수 없다) */
export const blocksCopyRedelegate = (cwdJobIds: Iterable<string>, peerJobId: string | null) => peerJobId !== null && [...cwdJobIds].includes(peerJobId)

/** 복사본 폴더 정리: 직원의 실제 작업 폴더가 원래대로 돌아왔을 때만 기록을 지운다 (돌아오기 전에는 로컬 지시를 계속 막는다) */
export const peerCwdRestored = (currentCwd: string, originalCwd: string) => currentCwd === originalCwd
