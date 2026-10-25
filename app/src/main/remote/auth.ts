// 원격 인증: 토큰(원문은 저장하지 않고 해시만) · 폐기 목록 · 실패 횟수 제한(IP별·전체) · 요청 속도 제한
// 수치는 규격 7절·9절. 시각은 밖에서 받아 테스트에서 시간을 돌릴 수 있게 한다

import crypto from 'node:crypto'

const TOKEN_BYTES = 32
/** 폐기 목록은 최근 20개만 (더 오래된 토큰은 그냥 unauthorized) */
const REVOKED_KEEP = 20
const WINDOW_MS = 10 * 60_000
const LOCK_MS = 15 * 60_000
const IP_FAILURES_MAX = 5
const GLOBAL_FAILURES_MAX = 20
/** 실패를 기억하는 IP 수 상한 — 넘으면 오래된 것부터 버린다 (많은 주소로 메모리를 채우지 못하게) */
const IP_TRACK_MAX = 5000
/** 같은 종류의 PC 알림은 10분에 한 번만 (그 사이 일은 다음 알림에 횟수로 합친다) */
const ALERT_INTERVAL_MS = 10 * 60_000
/** 이 횟수마다 한 번씩 10분 지난 실패·풀린 잠금을 쓸어낸다 */
const SWEEP_EVERY = 100
const RATE_WINDOW_MS = 60_000
/** 토큰당 분당 요청 수 (v1·v2 합산, v2 규격 9절 — v1의 120에서 늘림) */
const RATE_MAX = 300

/** 무작위 32바이트 → base64url 43자 (패딩 없음) */
export const newToken = () => crypto.randomBytes(TOKEN_BYTES).toString('base64url')

export const hashToken = (token: string) => crypto.createHash('sha256').update(token, 'utf8').digest('hex')

/** 해시끼리 상수 시간 비교 (길이가 다르면 바로 false — 해시라 길이로 알 수 있는 것은 없다) */
export function sameHash(a: string, b: string) {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y)
}

/** "Authorization: Bearer <token>" 헤더에서 토큰만 꺼낸다 (형식이 틀리면 null) */
export function bearerToken(header: string | undefined) {
  const m = header?.match(/^Bearer ([A-Za-z0-9_-]{1,200})$/)
  return m ? m[1] : null
}

export interface AuthState {
  /** 지금 쓰는 토큰의 해시 (원격을 처음 켜기 전에는 null) */
  tokenHash: string | null
  /** 폐기한 토큰 해시 (최근 순) */
  revoked: string[]
}

export type AuthResult = { ok: true } | { ok: false; code: 'unauthorized' | 'token_revoked' } | { ok: false; code: 'auth_locked'; retryAt: number }

/**
 * PC 알림용: 'ip' = 주소를 15분 잠갔음(until = 풀리는 시각), 'global' = 여러 곳 합쳐 실패가 많음(잠그지는 않고 알리기만, until = 알린 시각).
 * 같은 종류는 10분에 한 번만 부른다. count = 지난 알림 뒤로 합친 횟수 ('ip'는 잠근 주소 수, 'global'은 틀린 시도 수).
 * 화면 문구에만 쓰고 휴대폰 응답에는 드러내지 않는다
 */
export type LockListener = (scope: 'ip' | 'global', until: number, count: number) => void

export class AuthGuard {
  private ipFailures = new Map<string, number[]>()
  private globalFailures: number[] = []
  private ipLocks = new Map<string, number>()
  private checks = 0
  /** 지금 토큰으로 인증에 성공한 적이 있는지 (휴대폰이 이 토큰으로 붙어 있는지 — 재발급하면 false) */
  private isUsed = false
  private rates = new Map<string, number[]>()
  private state: AuthState
  private onLock: LockListener
  /** 종류별 마지막 알림 시각과 그 뒤로 쌓인 횟수 */
  private alerted: Record<'ip' | 'global', { at: number; pending: number }> = { ip: { at: -Infinity, pending: 0 }, global: { at: -Infinity, pending: 0 } }

  // (테스트가 타입만 지우고 돌리므로 생성자 매개변수 속성은 쓰지 않는다)
  constructor(state: AuthState, onLock: LockListener = () => {}) {
    this.state = state
    this.onLock = onLock
  }

  get current(): AuthState {
    return this.state
  }

  /** 이 IP가 잠겨 있으면 풀리는 시각 (전체 잠금은 없다 — 누구나 주인을 잠가 버릴 수 있어서, 전체 한도는 알림만) */
  lockedUntil(ip: string, now: number) {
    const until = this.ipLocks.get(ip) ?? 0
    return until > now ? until : null
  }

  /** 지금 잠긴 IP 중 가장 늦게 풀리는 시각 — PC 설정 화면 경고용 (휴대폰 응답에는 쓰지 않는다) */
  latestLock(now: number) {
    const until = Math.max(0, ...this.ipLocks.values())
    return until > now ? until : null
  }

  get isTokenUsed() {
    return this.isUsed
  }

  /** 실패·잠금을 기억하고 있는 IP 수 (테스트·점검용) */
  get trackedIps() {
    return new Set([...this.ipFailures.keys(), ...this.ipLocks.keys()]).size
  }

  /** 잠겨 있는 IP 수 (테스트·점검용) */
  get lockedIps() {
    return this.ipLocks.size
  }

  /**
   * 요청 하나를 인증한다. 잠금 중이면 토큰이 맞아도 auth_locked (맞는지 알려 주는 통로가 되지 않게).
   * 실패 횟수에는 "Bearer 형식은 맞는데 토큰이 틀린" 요청만 센다 — 헤더가 없거나 형식이 틀린 요청(token = null)·폐기된 토큰·잠금 응답은 세지 않는다
   */
  check(token: string | null, ip: string, now: number): AuthResult {
    if (++this.checks % SWEEP_EVERY === 0) this.sweep(now)
    const until = this.lockedUntil(ip, now)
    if (until) return { ok: false, code: 'auth_locked', retryAt: until }
    if (!token) return { ok: false, code: 'unauthorized' }
    const hash = hashToken(token)
    if (this.state.tokenHash && sameHash(hash, this.state.tokenHash)) {
      this.isUsed = true
      return { ok: true }
    }
    if (this.state.revoked.some((h) => sameHash(hash, h))) return { ok: false, code: 'token_revoked' }
    this.recordFailure(ip, now)
    const lockedNow = this.lockedUntil(ip, now)
    return lockedNow ? { ok: false, code: 'auth_locked', retryAt: lockedNow } : { ok: false, code: 'unauthorized' }
  }

  private recordFailure(ip: string, now: number) {
    const recent = (list: number[]) => [...list.filter((t) => now - t < WINDOW_MS), now]
    if (!this.ipFailures.has(ip)) this.makeRoom(now)
    const ipList = recent(this.ipFailures.get(ip) ?? [])
    this.ipFailures.set(ip, ipList)
    this.globalFailures = recent(this.globalFailures)
    if (ipList.length >= IP_FAILURES_MAX) {
      this.lockIp(ip, now)
      this.ipFailures.delete(ip)
      this.alert('ip', now + LOCK_MS, 1, now)
    }
    // 전체 한도는 잠그지 않고 PC에 알리기만 한다 (한 번 알리면 다시 센다)
    if (this.globalFailures.length >= GLOBAL_FAILURES_MAX) {
      this.globalFailures = []
      this.alert('global', now, GLOBAL_FAILURES_MAX, now)
    }
  }

  /** 잠금을 건다. 잠근 주소도 5000개까지만 — 넘으면 풀린 것을 지우고, 그래도 차면 가장 먼저 잠근(가장 먼저 풀릴) 것부터 버린다 */
  private lockIp(ip: string, now: number) {
    this.ipLocks.delete(ip)
    if (this.ipLocks.size >= IP_TRACK_MAX) {
      for (const [k, until] of this.ipLocks) if (until <= now) this.ipLocks.delete(k)
      for (const k of this.ipLocks.keys()) {
        if (this.ipLocks.size < IP_TRACK_MAX) break
        this.ipLocks.delete(k)
      }
    }
    this.ipLocks.set(ip, now + LOCK_MS)
  }

  /** 같은 종류의 알림은 10분에 한 번만 — 그 사이 일은 쌓아 두었다가 다음 알림에 합쳐 보낸다 */
  private alert(scope: 'ip' | 'global', until: number, count: number, now: number) {
    const a = this.alerted[scope]
    a.pending += count
    if (now - a.at < ALERT_INTERVAL_MS) return
    const total = a.pending
    this.alerted[scope] = { at: now, pending: 0 }
    this.onLock(scope, until, total)
  }

  /** 10분 지난 실패와 풀린 잠금을 지운다 */
  private sweep(now: number) {
    for (const [ip, list] of this.ipFailures) if (list.every((t) => now - t >= WINDOW_MS)) this.ipFailures.delete(ip)
    for (const [ip, until] of this.ipLocks) if (until <= now) this.ipLocks.delete(ip)
  }

  /** 새 IP를 기억하기 전에 자리를 만든다: 먼저 쓸어내고, 그래도 꽉 차 있으면 가장 먼저 기억한 IP부터 잊는다 */
  private makeRoom(now: number) {
    if (this.ipFailures.size < IP_TRACK_MAX) return
    this.sweep(now)
    for (const ip of this.ipFailures.keys()) {
      if (this.ipFailures.size < IP_TRACK_MAX) break
      this.ipFailures.delete(ip)
    }
  }

  /** 인증된 요청의 속도 제한 (토큰당 분당 120회). 넘으면 다시 시도할 수 있을 때까지 남은 초 */
  rateLimit(now: number): number | null {
    const key = this.state.tokenHash ?? ''
    const list = [...(this.rates.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS)]
    if (list.length >= RATE_MAX) return Math.max(1, Math.ceil((list[0] + RATE_WINDOW_MS - now) / 1000))
    list.push(now)
    this.rates.set(key, list)
    return null
  }

  /** 토큰 재발급: 이전 토큰을 폐기 목록에 넣고, 실패 횟수·잠금을 초기화한다 (PC 앞의 소유자가 직접 한 조작). 새 토큰 원문을 돌려준다 */
  rotate(): { token: string; state: AuthState } {
    const token = newToken()
    const revoked = this.state.tokenHash ? [this.state.tokenHash, ...this.state.revoked].slice(0, REVOKED_KEEP) : this.state.revoked
    this.state = { tokenHash: hashToken(token), revoked }
    this.ipFailures.clear()
    this.globalFailures = []
    this.ipLocks.clear()
    this.rates.clear()
    this.isUsed = false
    return { token, state: this.state }
  }
}

export const AUTH_LIMITS = { WINDOW_MS, LOCK_MS, IP_FAILURES_MAX, GLOBAL_FAILURES_MAX, RATE_MAX, REVOKED_KEEP, IP_TRACK_MAX, SWEEP_EVERY, ALERT_INTERVAL_MS }
