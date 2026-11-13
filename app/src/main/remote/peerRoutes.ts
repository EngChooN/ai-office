// 피어 경로 (설계서 8절): /v2/pair/*(인증 없음, 짝짓기 창이 열린 동안만) · /v2/peer/unpair(피어 토큰) — B컴 서버 쪽
// 인증·잠금·속도는 V2Routes의 앞단(preflight)이 이미 거쳤다. 여기서는 경로·본문·슬롯 소속만 본다
// 일 주고받기 경로(1.3.1까지)는 없앴다 — 옛 앱이 부르면 410 peer_feature_removed

import type { IncomingMessage, ServerResponse } from 'node:http'
import { isRetiredPeerPath, PEER_PATHS, type PairKind } from '../../shared/peerProtocol.ts'
import type { PairingHost } from '../peer/pairing'
import { V2_PROTOCOL_VERSION, v2Fail } from './v2.ts'
import type { RemoteResponse } from './protocol.ts'

const PAIR_BODY_MAX = 4 * 1024
/** 인증 전 짝짓기 호출 속도: 한 주소에서 분당 12번 */
const PAIR_RATE = { windowMs: 60_000, max: 12 }

export interface PeerRoutesContext {
  pairing: PairingHost
  /** 짝짓기 성공 처리 — 슬롯을 만들거나 휴대폰 토큰을 꺼내 돌려준다. null이면 만들 수 없음(슬롯이 가득 참 등) */
  onPaired(result: { kind: PairKind; label: string }): { token: string; slotId?: string } | null
  /** 슬롯 해제 (A컴이 unpair를 불렀다) */
  onUnpair(slotId: string): void
  ownName(): string
  now(): number
}

export type Access = (status: number, error?: string) => void
/** 경로가 돌려주는 답 (headers는 있을 때만) */
type PeerReply = Omit<RemoteResponse, 'headers'> & { headers?: Record<string, string> }

function readBody(req: IncomingMessage, limit: number): Promise<Buffer | 'too_large'> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        resolve('too_large')
        req.socket.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', () => resolve('too_large'))
  })
}

const send = (res: ServerResponse, r: PeerReply, access: Access) => {
  const headers = r.headers ?? {}
  const body = 'protocolVersion' in r.body ? r.body : { protocolVersion: V2_PROTOCOL_VERSION, ...r.body }
  const text = JSON.stringify(body)
  res.writeHead(r.status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text) })
  res.end(text)
  access(r.status, typeof r.body.error === 'string' ? r.body.error : undefined)
}

export class PeerRoutes {
  private ctx: PeerRoutesContext
  private pairHits = new Map<string, number[]>()

  constructor(ctx: PeerRoutesContext) {
    this.ctx = ctx
  }

  /** 인증이 없는 짝짓기 경로인가 (V2Routes가 preflight 전에 묻는다) */
  static isPairPath(path: string) {
    return path === PEER_PATHS.pairHello || path === PEER_PATHS.pairConfirm
  }

  static isPeerPath(path: string) {
    return path.startsWith('/v2/peer/')
  }

  private tooMany(ip: string) {
    const now = this.ctx.now()
    const recent = (this.pairHits.get(ip) ?? []).filter((t) => now - t < PAIR_RATE.windowMs)
    if (recent.length >= PAIR_RATE.max) {
      this.pairHits.set(ip, recent)
      return true
    }
    this.pairHits.set(ip, [...recent, now])
    // 주소를 잔뜩 바꿔 가며 메모리를 채우지 못하게
    if (this.pairHits.size > 1000) for (const [k, v] of this.pairHits) if (v.every((t) => now - t >= PAIR_RATE.windowMs)) this.pairHits.delete(k)
    return false
  }

  /** POST /v2/pair/hello · /v2/pair/confirm */
  async pair(req: IncomingMessage, res: ServerResponse, path: string, ip: string, access: Access) {
    const reply = (r: PeerReply) => send(res, r, access)
    if (req.method !== 'POST') return reply(v2Fail('method_not_allowed', { allow: 'POST' }))
    if (this.tooMany(ip)) return reply(v2Fail('rate_limited', { retryAfterSec: 30 }))
    const raw = await readBody(req, PAIR_BODY_MAX)
    if (raw === 'too_large') return
    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw.toString('utf8') || '{}') as Record<string, unknown>
    } catch {
      return reply(v2Fail('invalid_request'))
    }
    if (path === PEER_PATHS.pairHello) {
      const h = this.ctx.pairing.hello(body.nonceA)
      if (h === 'pair_closed') return reply(v2Fail('pair_closed'))
      if (h === 'invalid') return reply(v2Fail('invalid_request'))
      return reply({ status: 200, body: { nonceB: h.nonceB, spki: h.spki, name: this.ctx.ownName() } })
    }
    const r = await this.ctx.pairing.confirm(body)
    if (!r.ok) {
      const f = v2Fail(r.code)
      return reply({ ...f, body: { ...f.body, ...(r.remaining !== undefined ? { remaining: r.remaining } : {}) } })
    }
    const made = this.ctx.onPaired({ kind: r.kind, label: r.label })
    if (!made) return reply({ status: 409, body: { error: 'full', message: '연결할 수 있는 PC 수를 넘었어요. 안 쓰는 PC 연결을 먼저 해제해 주세요' } })
    reply({ status: 200, body: { token: made.token, ...(made.slotId ? { slotId: made.slotId } : {}), peerName: this.ctx.ownName(), serverProof: r.serverProof } })
  }

  /** /v2/peer/* — slotId는 피어 토큰의 슬롯 (휴대폰 토큰은 null → 거부) */
  peer(req: IncomingMessage, res: ServerResponse, path: string, slotId: string | null, access: Access) {
    const reply = (r: PeerReply) => send(res, r, access)
    if (!slotId) return reply(v2Fail('scope_denied'))
    if (path === PEER_PATHS.unpair) {
      if (req.method !== 'POST') return reply(v2Fail('method_not_allowed', { allow: 'POST' }))
      // 응답을 보낸 뒤에 슬롯을 지운다 (이 요청의 토큰이 먼저 사라지면 응답이 막히지 않게)
      reply({ status: 200, body: { ok: true } })
      return this.ctx.onUnpair(slotId)
    }
    // 옛 앱이 일·첨부를 보내면 본문을 읽지 않고 거절하고 연결을 닫는다 (남은 바이트를 받지 않게)
    if (isRetiredPeerPath(path)) {
      res.setHeader('Connection', 'close')
      res.on('finish', () => req.socket.destroy())
      return reply(v2Fail('peer_feature_removed'))
    }
    return reply(v2Fail('not_found'))
  }
}
