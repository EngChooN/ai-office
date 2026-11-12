// 피어 경로 (설계서 8절): /v2/pair/*(인증 없음, 짝짓기 창이 열린 동안만) · /v2/peer/*(피어 토큰) — B컴 서버 쪽
// 인증·잠금·속도는 V2Routes의 앞단(preflight)이 이미 거쳤다. 여기서는 경로·본문·슬롯 소속만 본다 (파일 복사본 경로는 4번의 syncRoutes)

import type { IncomingMessage, ServerResponse } from 'node:http'
import { PEER_LIMITS, PEER_PATHS, type PairKind } from '../../shared/peerProtocol.ts'
import type { PairingHost } from '../peer/pairing'
import type { PeerHost, HostResult } from '../peer/peerHost'
import { V2_PROTOCOL_VERSION, v2Fail } from './v2.ts'
import type { RemoteResponse } from './protocol.ts'

const BODY_MAX = 64 * 1024
const PAIR_BODY_MAX = 4 * 1024
/** 인증 전 짝짓기 호출 속도: 한 주소에서 분당 12번 */
const PAIR_RATE = { windowMs: 60_000, max: 12 }
const FILE_NAME_MAX = 200
const JOB_PATH = /^\/v2\/peer\/jobs\/([^/]{1,64})\/(cancel|ack)$/

export interface PeerRoutesContext {
  pairing: PairingHost
  host: PeerHost
  /** 짝짓기 성공 처리 — 슬롯을 만들거나 휴대폰 토큰을 꺼내 돌려준다. null이면 만들 수 없음(슬롯이 가득 참 등) */
  onPaired(result: { kind: PairKind; label: string }): { token: string; slotId?: string } | null
  /** 슬롯 해제 (A컴이 unpair를 불렀다) */
  onUnpair(slotId: string): void
  ownName(): string
  now(): number
}

export type Access = (status: number, error?: string) => void

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

const send = (res: ServerResponse, r: RemoteResponse | HostResult, access: Access) => {
  const headers = 'headers' in r ? r.headers : {}
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
    const reply = (r: RemoteResponse | HostResult) => send(res, r, access)
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
  async peer(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams, slotId: string | null, access: Access) {
    const reply = (r: RemoteResponse | HostResult) => send(res, r, access)
    // 첨부 올리기를 본문을 읽지 않고 거절할 때는 연결을 닫는다 (keep-alive가 남은 바이트를 다 받지 않게)
    if (path === PEER_PATHS.attachments && (!slotId || req.method !== 'PUT')) {
      res.setHeader('Connection', 'close')
      res.on('finish', () => req.socket.destroy())
    }
    if (!slotId) return reply(v2Fail('scope_denied'))
    const m = req.method ?? ''
    const host = this.ctx.host
    const needBody = async (): Promise<Record<string, unknown> | null> => {
      if (!/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) {
        reply(v2Fail('unsupported_media_type'))
        return null
      }
      const raw = await readBody(req, BODY_MAX)
      if (raw === 'too_large') {
        reply(v2Fail('payload_too_large'))
        return null
      }
      try {
        const v = JSON.parse(raw.toString('utf8') || '{}')
        return v && typeof v === 'object' ? (v as Record<string, unknown>) : (reply(v2Fail('invalid_request')), null)
      } catch {
        reply(v2Fail('invalid_request'))
        return null
      }
    }

    if (path === PEER_PATHS.staff) return m === 'GET' ? reply({ status: 200, body: { staff: host.staff() } }) : reply(v2Fail('method_not_allowed', { allow: 'GET' }))
    if (path === PEER_PATHS.approvals) return m === 'GET' ? reply(host.approvals(slotId)) : reply(v2Fail('method_not_allowed', { allow: 'GET' }))
    if (path === PEER_PATHS.watch) {
      if (m !== 'POST') return reply(v2Fail('method_not_allowed', { allow: 'POST' }))
      const b = await needBody()
      return b && reply(host.watch(slotId, b.staffIds))
    }
    if (path === PEER_PATHS.unpair) {
      if (m !== 'POST') return reply(v2Fail('method_not_allowed', { allow: 'POST' }))
      // 응답을 보낸 뒤에 슬롯을 지운다 (이 요청의 토큰이 먼저 사라지면 응답이 막히지 않게)
      reply({ status: 200, body: { ok: true } })
      return this.ctx.onUnpair(slotId)
    }
    if (path === PEER_PATHS.attachments) {
      if (m !== 'PUT') return reply(v2Fail('method_not_allowed', { allow: 'PUT' }))
      return this.receiveAttachment(req, res, slotId, reply)
    }
    if (path === PEER_PATHS.jobs) {
      if (m === 'GET') return reply(host.jobs(slotId, query.get('ids') ?? ''))
      if (m !== 'POST') return reply(v2Fail('method_not_allowed', { allow: 'GET, POST' }))
      const b = await needBody()
      return b && reply(host.accept(slotId, b))
    }
    const job = JOB_PATH.exec(path)
    if (job) {
      if (m !== 'POST') return reply(v2Fail('method_not_allowed', { allow: 'POST' }))
      return reply(job[2] === 'cancel' ? host.cancel(slotId, job[1]) : host.ack(slotId, job[1]))
    }
    return reply(v2Fail('not_found'))
  }

  /** PUT /v2/peer/attachments — 바이트 본문(길이 필수), 이름은 x-file-name(URI 인코딩), 종류는 content-type */
  private async receiveAttachment(req: IncomingMessage, res: ServerResponse, slotId: string, reply: (r: RemoteResponse | HostResult) => void) {
    // 본문을 다 읽지 않고 거절하면 연결을 닫는다 (올리던 바이트를 받지 않게)
    const closeAfter = (r: RemoteResponse) => {
      res.setHeader('Connection', 'close')
      res.on('finish', () => req.socket.destroy())
      reply(r)
    }
    const lengthText = req.headers['content-length']
    if (lengthText === undefined) return closeAfter(v2Fail('length_required'))
    const length = Number(lengthText)
    if (!Number.isInteger(length) || length < 0) return closeAfter(v2Fail('invalid_request'))
    if (length > PEER_LIMITS.attachmentMax) return closeAfter(v2Fail('payload_too_large'))
    let name: string
    try {
      name = decodeURIComponent(String(req.headers['x-file-name'] ?? '')).slice(0, FILE_NAME_MAX) || 'file'
    } catch {
      return closeAfter(v2Fail('invalid_request'))
    }
    // 보낸 쪽 종류는 형식이 맞을 때만 믿는다 (확장자로 모를 때만 쓰인다)
    const sent = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    const mime = /^[\w.+-]+\/[\w.+-]+$/.test(sent) ? sent : ''
    const raw = await readBody(req, length)
    if (raw === 'too_large') return
    reply(this.ctx.host.upload(slotId, name, mime === 'application/octet-stream' ? '' : mime, raw))
  }

  /** /v2/call을 피어 토큰으로 불렀을 때 — hello·decide·answerQuestion 말고는 모두 막는다 (설계서 8-1) */
  callAsPeer(slotId: string, method: string | undefined, args: unknown): RemoteResponse | null {
    if (method !== 'decide' && method !== 'answerQuestion') return v2Fail('scope_denied', method ? { method } : {})
    if (!Array.isArray(args)) return v2Fail('invalid_args', { method })
    const r = this.ctx.host.decide(slotId, method, args)
    return { status: r.status, headers: {}, body: { protocolVersion: V2_PROTOCOL_VERSION, serverTime: this.ctx.now(), ...r.body } }
  }
}

