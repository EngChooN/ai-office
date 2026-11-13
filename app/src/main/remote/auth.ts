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

/**
 * 연결·잠금을 셀 때 쓰는 주소 키: IPv4는 그대로, IPv6는 앞 64비트(/64)로 묶는다.
 * IPv6는 한 사람이 /64 안의 주소를 마음대로 바꿀 수 있어 주소 단위로 세면 한도·잠금을 피해 간다
 */
export function ipKey(ip: string) {
  const addr = ip.replace(/^::ffff:/i, '').replace(/%.*$/, '')
  if (!addr.includes(':') || addr.endsWith('/64')) return addr
  const [head, tail, ...more] = addr.split('::')
  if (more.length > 0 || /[^0-9a-f:]/i.test(addr)) return addr
  const h = head === '' ? [] : head.split(':')
  const t = tail === undefined || tail === '' ? [] : tail.split(':')
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t]
  if (groups.length !== 8 || groups.some((g) => g.length < 1 || g.length > 4)) return addr
  return `${groups.slice(0, 4).map((g) => g.toLowerCase().padStart(4, '0')).join(':')}::/64`
}

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

/** 다른 PC(피어)에 내준 토큰 한 칸 — 휴대폰 토큰과 따로 두고 끊을 수 있다 (설계서 1-1). 해시만 저장한다 */
export interface PeerSlot {
  id: string
  label: string
  tokenHash: string
  createdAt: number
  lastSeenAt: number | null
  /** '화면 보기' 권한 — 이 열쇠로 휴대폰과 같은 화면 연결(/v2/call 전체·/v2/events 휴대폰 모양)을 쓴다. 저쪽 PC 앞에서 허락해야만 true (기존 짝은 없음 = 허락 전) */
  view?: boolean
}

/** 피어 슬롯 최대 수 */
export const PEER_SLOTS_MAX = 8

export interface AuthState {
  /** 지금 쓰는 토큰의 해시 (원격을 처음 켜기 전에는 null) */
  tokenHash: string | null
  /** 폐기한 토큰 해시 (최근 순) */
  revoked: string[]
  /** 피어 슬롯 (없으면 빈 목록 — 예전 저장값은 그대로 읽는다) */
  peers?: PeerSlot[]
}

/** 인증을 통과한 토큰 칸: 'phone' 또는 'peer:<슬롯 id>' */
export type AuthSlot = 'phone' | `peer:${string}`

export type AuthResult = { ok: true; slot: AuthSlot } | { ok: false; code: 'unauthorized' | 'token_revoked' } | { ok: false; code: 'auth_locked'; retryAt: number }

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
  /** 휴대폰 열쇠로 마지막에 인증에 성공한 시각 (메모리만 — 앱을 다시 켜면 null, 재발급하면 null) */
  private phoneSeen: number | null = null
  private rates = new Map<string, number[]>()
  /** '화면 보기' 허락을 기다리는 슬롯 (메모리 값 — 앱을 껐다 켜면 상대가 hello로 다시 요청한다) */
  private viewPending = new Set<string>()
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
    const until = this.ipLocks.get(ipKey(ip)) ?? 0
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

  get phoneSeenAt() {
    return this.phoneSeen
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
  check(token: string | null, rawIp: string, now: number): AuthResult {
    const ip = ipKey(rawIp)
    if (++this.checks % SWEEP_EVERY === 0) this.sweep(now)
    const until = this.lockedUntil(ip, now)
    if (until) return { ok: false, code: 'auth_locked', retryAt: until }
    if (!token) return { ok: false, code: 'unauthorized' }
    const hash = hashToken(token)
    if (this.state.tokenHash && sameHash(hash, this.state.tokenHash)) {
      this.isUsed = true
      this.phoneSeen = now
      return { ok: true, slot: 'phone' }
    }
    const peer = (this.state.peers ?? []).find((p) => sameHash(hash, p.tokenHash))
    if (peer) {
      peer.lastSeenAt = now
      return { ok: true, slot: `peer:${peer.id}` }
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

  /** 이 토큰 해시가 휴대폰·피어 어느 칸이든 지금 쓸 수 있는지 (SSE가 15초마다 확인) */
  isValidHash(hash: string) {
    return Boolean((this.state.tokenHash && sameHash(hash, this.state.tokenHash)) || (this.state.peers ?? []).some((p) => sameHash(hash, p.tokenHash)))
  }

  /** 해시가 가리키는 피어 슬롯 (휴대폰 토큰이거나 모르면 null) */
  peerSlotOf(hash: string) {
    return (this.state.peers ?? []).find((p) => sameHash(hash, p.tokenHash)) ?? null
  }

  /** 이 슬롯이 '화면 보기' 권한을 가졌는지 */
  isViewSlot(id: string) {
    return Boolean((this.state.peers ?? []).find((p) => p.id === id)?.view)
  }

  /** hello가 알려 주는 허락 상태: granted(권한 있음) · pending(저쪽 허락 대기) · none(요청 전) */
  viewState(id: string): 'granted' | 'pending' | 'none' {
    return this.isViewSlot(id) ? 'granted' : this.viewPending.has(id) ? 'pending' : 'none'
  }

  /** '화면 보기' 허락을 요청한다. 새로 대기에 들어갔을 때만 true (같은 요청을 거듭해도 결재 카드가 한 번만 뜨게). 이미 가졌거나 없는 슬롯은 false */
  requestView(id: string) {
    if (!(this.state.peers ?? []).some((p) => p.id === id) || this.isViewSlot(id) || this.viewPending.has(id)) return false
    this.viewPending.add(id)
    return true
  }

  /** 저쪽 PC 앞에서 허락(true)·거절(false)·회수(false)한 결과를 슬롯에 적는다. 슬롯이 없으면 false */
  setPeerView(id: string, isGranted: boolean) {
    const peers = this.state.peers ?? []
    if (!peers.some((p) => p.id === id)) return false
    this.viewPending.delete(id)
    this.state = { ...this.state, peers: peers.map((p) => (p.id === id ? { ...p, view: isGranted } : p)) }
    return true
  }

  /** 새 피어 슬롯을 만들고 토큰 원문을 돌려준다 (가득 차면 null). view: 처음부터 '화면 보기' 열쇠로 (저쪽 PC 앞에서 짝지을 때 이미 허락한 것) */
  addPeerSlot(label: string, now: number, opts: { view?: boolean } = {}): { token: string; slot: PeerSlot } | null {
    const peers = this.state.peers ?? []
    if (peers.length >= PEER_SLOTS_MAX) return null
    const token = newToken()
    const slot: PeerSlot = { id: crypto.randomBytes(6).toString('base64url'), label: label.slice(0, 60), tokenHash: hashToken(token), createdAt: now, lastSeenAt: null, ...(opts.view ? { view: true } : {}) }
    this.state = { ...this.state, peers: [...peers, slot] }
    return { token, slot }
  }

  /** 피어 슬롯을 지운다. 그 토큰은 이제 token_revoked로 답한다 */
  removePeerSlot(id: string): PeerSlot | null {
    const peers = this.state.peers ?? []
    const slot = peers.find((p) => p.id === id)
    if (!slot) return null
    this.viewPending.delete(id)
    this.state = { ...this.state, peers: peers.filter((p) => p.id !== id), revoked: [slot.tokenHash, ...this.state.revoked].slice(0, REVOKED_KEEP) }
    return slot
  }

  /** 인증된 요청의 속도 제한 (토큰 칸마다 분당 300회). 넘으면 다시 시도할 수 있을 때까지 남은 초 */
  rateLimit(now: number, slot: AuthSlot = 'phone'): number | null {
    const key = slot === 'phone' ? (this.state.tokenHash ?? '') : slot
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
    this.state = { tokenHash: hashToken(token), revoked, peers: this.state.peers ?? [] }
    this.ipFailures.clear()
    this.globalFailures = []
    this.ipLocks.clear()
    this.rates.clear()
    this.isUsed = false
    this.phoneSeen = null
    return { token, state: this.state }
  }
}

export const AUTH_LIMITS = { WINDOW_MS, LOCK_MS, IP_FAILURES_MAX, GLOBAL_FAILURES_MAX, RATE_MAX, REVOKED_KEEP, IP_TRACK_MAX, SWEEP_EVERY, ALERT_INTERVAL_MS }
