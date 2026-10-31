// PC 짝짓기 (설계서 1-4절 v2 규격): B컴이 5분짜리 짝짓기 창을 열고, A컴(또는 휴대폰)이 12자 코드로 인증서를 묶어 토큰을 받는다
// 코드는 PBKDF2 키(K)의 재료로만 쓰고 네트워크에 보내지 않는다 — 양쪽이 clientProof·serverProof로 서로를 증명한다
// 서버 쪽(PairingWindow)과 클라이언트 쪽(pairWithHost)이 같은 키·증명 함수를 쓴다. 네트워크는 밖에서 넣어 준다 (테스트가 가짜를 넣는다)

import crypto from 'node:crypto'
import { formatPairCode, isPeerHostAllowed, normalizePairCode, PAIR_CODE_ALPHABET, PEER_LIMITS, type PairKind, type PairWindowView } from '../../shared/peerProtocol.ts'

/** 지문 앞 8자리 (눈으로 확인용 — "sha256/" 뒤) */
export const fingerprintShort = (spki: string) => spki.replace(/^sha256\//, '').slice(0, 8)

export const PBKDF2_ITERATIONS = 200_000
const NONCE_RE = /^[A-Za-z0-9_-]{22}$/

/** salt = nonceA(16B) ‖ nonceB(16B) ‖ spkiDigest(32B) — 모양이 틀리면 null */
export function pairSalt(nonceA: string, nonceB: string, spki: string): Buffer | null {
  if (!NONCE_RE.test(nonceA) || !NONCE_RE.test(nonceB)) return null
  const m = /^sha256\/([A-Za-z0-9+/]{43}=)$/.exec(spki)
  if (!m) return null
  const a = Buffer.from(nonceA, 'base64url')
  const b = Buffer.from(nonceB, 'base64url')
  const d = Buffer.from(m[1], 'base64')
  return a.length === 16 && b.length === 16 && d.length === 32 ? Buffer.concat([a, b, d]) : null
}

/** K = PBKDF2-HMAC-SHA256(code12, salt, 200000, 32) — 비동기(메인 프로세스를 막지 않는다) */
export function deriveKey(code12: string, salt: Buffer, iterations = PBKDF2_ITERATIONS): Promise<Buffer> {
  return new Promise((resolve, reject) => crypto.pbkdf2(code12, salt, iterations, 32, 'sha256', (e, k) => (e ? reject(e) : resolve(k))))
}

const hmac = (k: Buffer, ...parts: Buffer[]) => crypto.createHmac('sha256', k).update(Buffer.concat(parts)).digest()
/** clientProof = HMAC(K, "client" ‖ salt) */
export const clientProofOf = (k: Buffer, salt: Buffer) => hmac(k, Buffer.from('client'), salt)
/** serverProof = HMAC(K, "server" ‖ salt ‖ clientProof) */
export const serverProofOf = (k: Buffer, salt: Buffer, clientProof: Buffer) => hmac(k, Buffer.from('server'), salt, clientProof)

const same = (a: string, b: string) => {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/** hello 한 번의 흔적: nonce 두 개가 짝이어야 confirm이 통한다 (한 번 쓰면 버린다) */
const HELLO_KEEP = 8

export type PairConfirmResult = { ok: true; kind: PairKind; label: string; serverProof: string } | { ok: false; code: 'pair_failed' | 'pair_closed'; remaining?: number }

export interface PairingHost {
  /** 창이 열려 있을 때만 hello에 답한다 */
  hello(nonceA: unknown): { nonceB: string; spki: string } | 'pair_closed' | 'invalid'
  confirm(body: { nonceA?: unknown; nonceB?: unknown; clientProof?: unknown; peerLabel?: unknown }): Promise<PairConfirmResult>
}

export interface PairingInfo {
  host: string
  port: number
  spki: string
}

export class PairingWindow implements PairingHost {
  private win: { kind: PairKind; code: string; until: number; tries: number; info: PairingInfo } | null = null
  private hellos = new Map<string, string>()
  private now: () => number
  private onChange: () => void

  constructor(opts: { now?: () => number; onChange?: () => void } = {}) {
    this.now = opts.now ?? Date.now
    this.onChange = opts.onChange ?? (() => {})
  }

  /** 새 짝짓기 창 (이미 있으면 닫고 새로 — 코드는 창마다 새로) */
  open(kind: PairKind, info: PairingInfo, code?: string): PairWindowView {
    const c = (code && normalizePairCode(code)) || Array.from({ length: PEER_LIMITS.pairCodeLength }, () => PAIR_CODE_ALPHABET[crypto.randomInt(0, PAIR_CODE_ALPHABET.length)]).join('')
    this.hellos.clear()
    this.win = { kind, code: c, until: this.now() + PEER_LIMITS.pairWindowMs, tries: 0, info }
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
    const code = w && formatPairCode(w.code)
    return w && code && { kind: w.kind, code, host: w.info.host, port: w.info.port, fingerprint: fingerprintShort(w.info.spki), until: w.until, copyText: `${w.info.host}:${w.info.port} ${code}` }
  }

  hello(nonceA: unknown) {
    const w = this.live()
    if (!w) return 'pair_closed' as const
    if (typeof nonceA !== 'string' || !NONCE_RE.test(nonceA)) return 'invalid' as const
    const nonceB = crypto.randomBytes(16).toString('base64url')
    // 오래된 hello부터 버려 메모리가 끝없이 자라지 않게
    while (this.hellos.size >= HELLO_KEEP) this.hellos.delete(this.hellos.keys().next().value as string)
    this.hellos.set(nonceB, nonceA)
    return { nonceB, spki: w.info.spki }
  }

  async confirm(body: { nonceA?: unknown; nonceB?: unknown; clientProof?: unknown; peerLabel?: unknown }): Promise<PairConfirmResult> {
    const w = this.live()
    if (!w) return { ok: false, code: 'pair_closed' }
    // 시도는 계산 전에 센다 — 동시에 여러 개를 보내도 3번을 넘겨 시험할 수 없다
    w.tries++
    const left = Math.max(0, PEER_LIMITS.pairMaxWrong - w.tries)
    const fail = (): PairConfirmResult => {
      if (w.tries >= PEER_LIMITS.pairMaxWrong && this.win === w) this.close()
      return { ok: false, code: 'pair_failed', remaining: left }
    }
    if (w.tries > PEER_LIMITS.pairMaxWrong) return fail()
    const { nonceA, nonceB, clientProof } = body
    // hello의 짝은 한 번만 쓴다
    const expectedNonceA = typeof nonceB === 'string' ? this.hellos.get(nonceB) : undefined
    if (typeof nonceB === 'string') this.hellos.delete(nonceB)
    if (typeof nonceA !== 'string' || typeof nonceB !== 'string' || typeof clientProof !== 'string' || expectedNonceA !== nonceA || !/^[0-9a-f]{64}$/.test(clientProof)) return fail()
    const salt = pairSalt(nonceA, nonceB, w.info.spki)
    if (!salt) return fail()
    const k = await deriveKey(w.code, salt)
    const mine = clientProofOf(k, salt)
    if (!same(clientProof, mine.toString('hex')) || this.win !== w) return fail()
    const label = typeof body.peerLabel === 'string' && body.peerLabel.trim() ? body.peerLabel.trim().slice(0, 60) : w.kind === 'phone' ? 'phone' : 'peer'
    // 코드는 한 번 성공하면 폐기 — 창도 닫힌다
    const kind = w.kind
    this.close()
    return { ok: true, kind, label, serverProof: serverProofOf(k, salt, mine).toString('hex') }
  }
}

// ── 클라이언트 쪽 (A컴 / 휴대폰) ────────────────────────

/** 접속 통로: 인증서를 검증하지 않고 붙되, 실제로 본 서버 인증서 지문을 알려 준다 */
export interface PairTransport {
  /** 이 연결에서 실제로 본 서버 인증서 지문 (sha256/…) — 첫 요청 뒤에 안다 */
  seenSpki(): string | null
  post(path: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }>
}

export type PairError = 'bad_host' | 'bad_code' | 'unreachable' | 'closed' | 'spki_mismatch' | 'server_proof_mismatch' | 'wrong_code' | 'full' | 'failed'
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
  if (!normalizePairCode(code)) throw new PairFailure('bad_code')
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
  const code12 = normalizePairCode(opts.code)
  const salt = code12 && pairSalt(nonceA, nonceB, seen)
  if (!code12 || !salt) throw new PairFailure(code12 ? 'failed' : 'bad_code')
  const k = await deriveKey(code12, salt)
  const clientProof = clientProofOf(k, salt)
  let done: Awaited<ReturnType<PairTransport['post']>>
  try {
    done = await transport.post('/v2/pair/confirm', { nonceA, nonceB, clientProof: clientProof.toString('hex'), peerLabel: opts.clientName, clientId: opts.clientId ?? '', kind: opts.kind })
  } catch {
    throw new PairFailure('unreachable')
  }
  if (done.status === 410) throw new PairFailure('closed')
  if (done.status === 401) throw new PairFailure('wrong_code', typeof done.body.remaining === 'number' ? done.body.remaining : undefined)
  const token = done.body.token
  if (done.status !== 200 || typeof token !== 'string') throw new PairFailure(done.body.error === 'full' ? 'full' : 'failed')
  // 가짜 서버가 아무 토큰으로 성공 응답하는 것을 막는다 — serverProof가 맞을 때만 토큰을 돌려준다
  const sp = done.body.serverProof
  if (typeof sp !== 'string' || !same(sp, serverProofOf(k, salt, clientProof).toString('hex'))) throw new PairFailure('server_proof_mismatch')
  return { token, slotId: String(done.body.slotId ?? ''), peerName: String(done.body.peerName ?? ''), spki: seen, fingerprint: fingerprintShort(seen) }
}
