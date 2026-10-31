// PC 짝짓기 (설계서 1절): B컴이 5분짜리 짝짓기 창을 열고, A컴(또는 휴대폰)이 6자리 코드로 인증서를 묶어 토큰을 받는다
// 코드는 HMAC의 열쇠로만 쓰고 네트워크에 보내지 않는다 — 중간자는 코드를 몰라 proof를 만들 수 없다
// 서버 쪽(PairingWindow)과 클라이언트 쪽(pairWithHost)이 같은 proof 함수를 쓴다. 네트워크는 밖에서 넣어 준다 (테스트가 가짜를 넣는다)

import crypto from 'node:crypto'
import { isPairCode, isPeerHostAllowed, PEER_LIMITS, type PairKind, type PairWindowView } from '../../shared/peerProtocol.ts'

/** 지문 앞 8자리 (눈으로 확인용 — "sha256/" 뒤) */
export const fingerprintShort = (spki: string) => spki.replace(/^sha256\//, '').slice(0, 8)

/** proof = HMAC-SHA256(code, "peer-pair|" + nonceA + nonceB + spkiSeen) */
export function pairProof(code: string, nonceA: string, nonceB: string, spki: string) {
  return crypto.createHmac('sha256', code).update(`peer-pair|${nonceA}${nonceB}${spki}`).digest('hex')
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/** hello 한 번의 흔적: nonce 두 개가 짝이어야 confirm이 통한다 (한 번 쓰면 버린다) */
const HELLO_KEEP = 8

export type PairConfirmResult = { ok: true; kind: PairKind; label: string } | { ok: false; code: 'pair_failed' | 'pair_closed'; remaining?: number }

export interface PairingHost {
  /** 창이 열려 있을 때만 hello에 답한다 */
  hello(nonceA: unknown): { nonceB: string; spki: string } | 'pair_closed' | 'invalid'
  confirm(body: { nonceA?: unknown; nonceB?: unknown; proof?: unknown; peerLabel?: unknown }): PairConfirmResult
}

export interface PairingInfo {
  host: string
  port: number
  spki: string
}

export class PairingWindow implements PairingHost {
  private win: { kind: PairKind; code: string; until: number; wrong: number; info: PairingInfo } | null = null
  private hellos = new Map<string, string>()
  private now: () => number
  private onChange: () => void

  constructor(opts: { now?: () => number; onChange?: () => void } = {}) {
    this.now = opts.now ?? Date.now
    this.onChange = opts.onChange ?? (() => {})
  }

  /** 새 짝짓기 창 (이미 있으면 닫고 새로 — 코드는 창마다 새로) */
  open(kind: PairKind, info: PairingInfo, code?: string): PairWindowView {
    const c = code ?? String(crypto.randomInt(0, 10 ** PEER_LIMITS.pairCodeDigits)).padStart(PEER_LIMITS.pairCodeDigits, '0')
    this.hellos.clear()
    this.win = { kind, code: c, until: this.now() + PEER_LIMITS.pairWindowMs, wrong: 0, info }
    this.onChange()
    return this.view()!
  }

  close() {
    const was = this.win
    this.win = null
    this.hellos.clear()
    if (was) this.onChange()
  }

  private live() {
    if (this.win && this.win.until <= this.now()) this.close()
    return this.win
  }

  get isOpen() {
    return this.live() !== null
  }

  view(): PairWindowView | null {
    const w = this.live()
    return w && { kind: w.kind, code: w.code, host: w.info.host, port: w.info.port, fingerprint: fingerprintShort(w.info.spki), until: w.until, copyText: `${w.info.host}:${w.info.port} ${w.code}` }
  }

  hello(nonceA: unknown) {
    const w = this.live()
    if (!w) return 'pair_closed' as const
    if (typeof nonceA !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(nonceA)) return 'invalid' as const
    const nonceB = crypto.randomBytes(16).toString('base64url')
    // 오래된 hello부터 버려 메모리가 끝없이 자라지 않게
    while (this.hellos.size >= HELLO_KEEP) this.hellos.delete(this.hellos.keys().next().value as string)
    this.hellos.set(nonceB, nonceA)
    return { nonceB, spki: w.info.spki }
  }

  confirm(body: { nonceA?: unknown; nonceB?: unknown; proof?: unknown; peerLabel?: unknown }): PairConfirmResult {
    const w = this.live()
    if (!w) return { ok: false, code: 'pair_closed' }
    const { nonceA, nonceB, proof } = body
    const expectedNonceA = typeof nonceB === 'string' ? this.hellos.get(nonceB) : undefined
    const isValid =
      typeof nonceA === 'string' &&
      typeof nonceB === 'string' &&
      typeof proof === 'string' &&
      expectedNonceA === nonceA &&
      same(proof, pairProof(w.code, nonceA, nonceB, w.info.spki))
    if (!isValid) {
      // 틀린 코드 3번이면 창이 닫힌다 (새 창을 열어야 함)
      w.wrong++
      if (w.wrong >= PEER_LIMITS.pairMaxWrong) this.close()
      return { ok: false, code: 'pair_failed', remaining: Math.max(0, PEER_LIMITS.pairMaxWrong - w.wrong) }
    }
    const label = typeof body.peerLabel === 'string' && body.peerLabel.trim() ? body.peerLabel.trim().slice(0, 60) : w.kind === 'phone' ? 'phone' : 'peer'
    // 코드는 한 번 성공하면 폐기 — 창도 닫힌다
    const kind = w.kind
    this.close()
    return { ok: true, kind, label }
  }
}

// ── 클라이언트 쪽 (A컴 / 휴대폰) ────────────────────────

/** 접속 통로: 인증서를 검증하지 않고 붙되, 실제로 본 서버 인증서 지문을 알려 준다 */
export interface PairTransport {
  /** 이 연결에서 실제로 본 서버 인증서 지문 (sha256/…) — 첫 요청 뒤에 안다 */
  seenSpki(): string | null
  post(path: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }>
}

export type PairError = 'bad_host' | 'bad_code' | 'unreachable' | 'closed' | 'spki_mismatch' | 'wrong_code' | 'full' | 'failed'
export class PairFailure extends Error {
  code: PairError
  remaining?: number
  constructor(code: PairError, remaining?: number) {
    super(code)
    this.name = 'PairFailure'
    this.code = code
    this.remaining = remaining
  }
}

export interface PairResult {
  token: string
  slotId: string
  peerName: string
  spki: string
  /** 눈으로 확인할 지문 앞 8자리 */
  fingerprint: string
}

/** 입력 검사 (연결 시도 전 — 아무 데나 코드를 보내지 않게, 설계서 1-3) */
export function checkPairInput(host: string, code: string, isAllowed: (host: string) => boolean = isPeerHostAllowed) {
  if (!isAllowed(host)) throw new PairFailure('bad_host')
  if (!isPairCode(code)) throw new PairFailure('bad_code')
}

export async function pairWithHost(transport: PairTransport, opts: { code: string; clientName: string; kind: PairKind; clientId?: string }): Promise<PairResult> {
  const nonceA = crypto.randomBytes(16).toString('base64url')
  let hello: Awaited<ReturnType<PairTransport['post']>>
  try {
    hello = await transport.post('/v2/pair/hello', { clientName: opts.clientName, nonceA })
  } catch {
    throw new PairFailure('unreachable')
  }
  if (hello.status === 410) throw new PairFailure('closed')
  const nonceB = hello.body.nonceB
  const claimed = hello.body.spki
  if (hello.status !== 200 || typeof nonceB !== 'string' || typeof claimed !== 'string') throw new PairFailure('failed')
  // B컴이 아는 자기 지문 == 이 연결에서 실제로 본 지문이어야 한다 (다르면 중간자)
  const seen = transport.seenSpki()
  if (!seen || seen !== claimed) throw new PairFailure('spki_mismatch')
  const proof = pairProof(opts.code, nonceA, nonceB, seen)
  let done: Awaited<ReturnType<PairTransport['post']>>
  try {
    done = await transport.post('/v2/pair/confirm', { nonceA, nonceB, proof, peerLabel: opts.clientName, clientId: opts.clientId ?? '', kind: opts.kind })
  } catch {
    throw new PairFailure('unreachable')
  }
  if (done.status === 410) throw new PairFailure('closed')
  if (done.status === 401) throw new PairFailure('wrong_code', typeof done.body.remaining === 'number' ? done.body.remaining : undefined)
  const token = done.body.token
  if (done.status !== 200 || typeof token !== 'string') throw new PairFailure(done.body.error === 'full' ? 'full' : 'failed')
  return { token, slotId: String(done.body.slotId ?? ''), peerName: String(done.body.peerName ?? ''), spki: seen, fingerprint: fingerprintShort(seen) }
}
