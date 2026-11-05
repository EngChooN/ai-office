// 인터넷이 끊겨 멈춘 직원 일을 보관했다가 연결되면 이어 가는 순수 로직 (저장하지 않는다 — 앱을 끄면 사라진다). 연결은 office.ts
import { isNetworkError } from './networkError.ts'

/** 같은 일을 이어 가는 최대 횟수 — 넘으면 평소 오류처럼 정리한다 */
export const NET_RESUME_MAX_TRIES = 3
/** 처음 멈춘 뒤 이만큼 지나도 연결되지 않으면 평소 오류처럼 정리한다 */
export const NET_PARK_MAX_MS = 6 * 60 * 60 * 1000
/** 보관한 일이 있을 때 연결을 확인하는 간격 */
export const NET_CHECK_INTERVAL_MS = 15_000

export interface NetParked<O, Q> {
  /** 꺼내 둔 받은 일 (office의 origins) */
  origins: O[]
  /** 꺼내 둔 차례 대기 카드 (office의 taskQueue) */
  queued: Q[]
  /** 멈추게 한 오류 글 — 포기할 때 그대로 알린다 */
  error: string
  /** 이 일이 처음 멈춘 시각 (이어 갔다가 또 끊겨도 처음 시각을 유지한다) */
  since: number
}

export class NetParking<O, Q> {
  private parked = new Map<string, NetParked<O, Q>>()
  /** 이어 간 횟수와 처음 멈춘 시각 — 이어 간 일이 정상으로 끝나면(succeeded) 비운다 */
  private chains = new Map<string, { tries: number; since: number }>()

  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  /** 인터넷 오류이고 받은 일이 있고 횟수·시간이 남았으면 보관하고 true. 아니면 횟수를 비우고 false (평소 오류 정리로) */
  park(staffId: string, error: string, origins: readonly O[], queued: readonly Q[]) {
    const chain = this.chains.get(staffId)
    const now = this.now()
    const canPark = (origins.length > 0 || queued.length > 0) && isNetworkError(error) && (chain?.tries ?? 0) < NET_RESUME_MAX_TRIES && (!chain || now - chain.since <= NET_PARK_MAX_MS)
    if (!canPark) {
      this.chains.delete(staffId)
      return false
    }
    const since = chain?.since ?? now
    this.chains.set(staffId, { tries: chain?.tries ?? 0, since })
    this.parked.set(staffId, { origins: [...origins], queued: [...queued], error, since })
    return true
  }

  has(staffId: string) {
    return this.parked.has(staffId)
  }

  get size() {
    return this.parked.size
  }

  ids() {
    return [...this.parked.keys()]
  }

  /** 보관 중인 받은 일 전부 (카드가 아직 진행 중인지 볼 때) */
  allOrigins() {
    return [...this.parked.values()].flatMap((p) => p.origins)
  }

  /** 연결이 돌아와 이어 간다: 보관한 것을 꺼내고 횟수를 1 올린다 */
  resume(staffId: string) {
    const p = this.parked.get(staffId)
    if (!p) return null
    this.parked.delete(staffId)
    const chain = this.chains.get(staffId)
    this.chains.set(staffId, { tries: (chain?.tries ?? 0) + 1, since: chain?.since ?? p.since })
    return p
  }

  /** 대표가 새로 지시하거나 멈췄다: 보관한 것을 꺼내 돌려주고 횟수도 비운다 (평소 오류 정리로) */
  cancel(staffId: string) {
    const p = this.parked.get(staffId)
    this.parked.delete(staffId)
    this.chains.delete(staffId)
    return p ?? null
  }

  /** 처음 멈춘 지 NET_PARK_MAX_MS가 지난 것을 꺼낸다 (평소 오류 정리로) */
  takeExpired() {
    const now = this.now()
    const out: [string, NetParked<O, Q>][] = []
    for (const [id, p] of this.parked) if (now - p.since > NET_PARK_MAX_MS) out.push([id, p])
    for (const [id] of out) this.cancel(id)
    return out
  }

  /** 이어 간 일이 정상으로 끝났다 — 다음에 끊기면 다시 3번까지 이어 간다 */
  succeeded(staffId: string) {
    if (!this.parked.has(staffId)) this.chains.delete(staffId)
  }
}
