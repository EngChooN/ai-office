// 원격 HTTPS 서버: 켤 때만 포트를 열고, 끄면 열린 연결까지 모두 닫는다
// TLS가 아닌 평문 요청은 핸드셰이크에서 끊겨 HTTP 응답을 받지 못한다

import https from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { BODY_MAX_BYTES, fail } from './protocol.ts'
import { CAPABILITIES_HEADER, parseCapabilities } from './capabilities.ts'
import { ipKey } from './auth.ts'
import { V2_PROTOCOL_VERSION } from './v2.ts'
import type { RemoteRequest } from './handler.ts'
import type { RemoteResponse } from './protocol.ts'
import type { AccessEntry } from '../../shared/types'

export interface RemoteServerOptions {
  keyPem: string
  certPem: string
  port: number
  /** 기본은 모든 주소 (공유기 포트포워딩으로 밖에서 들어오게) */
  host?: string
  /** 연결을 받을지 정하는 첫 관문 (전용 모드: 사설 대역만). 거절하면 TLS 전에 바로 끊는다. 없으면 모두 받는다 */
  isAllowed?(ip: string): boolean
  /** JSON 요청 하나 처리. after는 응답을 다 보낸 뒤에 부른다 (연결이 끊기는 설정 변경을 응답 뒤로) */
  handle(req: RemoteRequest): RemoteResponse | Promise<HandledResponse>
  /**
   * 본문을 읽기 전에 거치는 검사 (v2: 버전·잠금·인증·전체 조작·속도). 맡지 않는 경로(v1)는 null.
   * 막히면(blocked) 본문을 한 바이트도 읽지 않고 그 응답을 보낸 뒤 연결을 닫는다. 통과하면 그 경로의 본문 상한(bodyLimit)으로 읽는다
   */
  precheck?(req: { url: string; authorization?: string; ip: string }): { blocked: RemoteResponse } | { bodyLimit: number } | null
  /** 본문을 직접 다루는 경로(SSE·파일 받기·첨부 올리기)를 맡는다. 맡았으면 true */
  stream?(req: IncomingMessage, res: ServerResponse, ctx: { ip: string; access: AccessLogger; markAuthed: () => void }): boolean
  onAccess?(entry: AccessEntry): void
}

export type HandledResponse = RemoteResponse & { after?: () => unknown }
export type AccessLogger = (status: number, error?: string) => void

const REQUEST_TIMEOUT_MS = 15_000
const HEADERS_TIMEOUT_MS = 10_000
/** TLS 핸드셰이크를 끝내지 않고 붙들고 있는 연결은 5초 뒤 끊는다 */
const HANDSHAKE_TIMEOUT_MS = 5000
/** 한꺼번에 받을 연결 수 (휴대폰 몇 대면 충분하다 — 연결을 잔뜩 열어 묶어 두지 못하게) */
/** 인증 전 연결 수 상한 (인증을 마친 연결은 세지 않는다) */
export const MAX_CONNECTIONS = 64
/** 인증을 마친 연결 전용 자리 — 인증 전 연결이 한도를 채워도 이미 붙은 휴대폰은 끊기지 않고 계속 쓴다 */
export const AUTHED_RESERVED = 32
/** 한 주소에서 동시에 열 수 있는 연결 수 — 한 곳이 전체 한도를 채워 다른 휴대폰을 막지 못하게.
 * 앱(v2)은 SSE 1~2개에 동시 호출 여러 개를 열어서 8개 (규격 v1 3-3-1절) */
export const MAX_CONNECTIONS_PER_ADDRESS = 8

const clientIp = (req: IncomingMessage) => (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '')

export class RemoteServer {
  private server: https.Server | null = null
  /** 열린 연결과 그 주소 키 (IPv6는 /64), 인증을 마쳤는지 */
  private sockets = new Map<Socket, { key: string; isAuthed: boolean }>()
  /** 주소별 인증 전 연결 수 */
  private perAddress = new Map<string, number>()
  /** 상대 주소:포트로 찾는 같은 목록 — 요청이 올라오는 TLS 소켓은 처음 받은 TCP 소켓과 다른 객체라 이 값으로 잇는다 */
  private byPeer = new Map<string, { key: string; isAuthed: boolean }>()
  private unauthed = 0
  private authed = 0

  get isListening() {
    return Boolean(this.server?.listening)
  }

  /** 포트를 연다. 실제로 열린 포트 번호를 돌려준다 (0을 주면 빈 포트) */
  start(opts: RemoteServerOptions): Promise<number> {
    if (this.server) return Promise.reject(new Error('already started'))
    const server = https.createServer({ key: opts.keyPem, cert: opts.certPem, minVersion: 'TLSv1.2', handshakeTimeout: HANDSHAKE_TIMEOUT_MS }, (req, res) => this.serve(req, res, opts))
    server.requestTimeout = REQUEST_TIMEOUT_MS
    server.headersTimeout = HEADERS_TIMEOUT_MS
    server.maxConnections = MAX_CONNECTIONS + AUTHED_RESERVED
    server.on('connection', (socket: Socket) => {
      if (opts.isAllowed && !opts.isAllowed(socket.remoteAddress ?? '')) return void socket.destroy()
      // 인증 전 연결이 한 주소(IPv6는 /64)에서 한도(8개)를 넘거나 전체 한도(64개)를 넘으면 TLS 전에 바로 끊는다
      const key = ipKey(socket.remoteAddress ?? '')
      const open = this.perAddress.get(key) ?? 0
      if (open >= MAX_CONNECTIONS_PER_ADDRESS || this.unauthed >= MAX_CONNECTIONS) return void socket.destroy()
      this.perAddress.set(key, open + 1)
      this.unauthed++
      const entry = { key, isAuthed: false }
      const peer = `${socket.remoteAddress}:${socket.remotePort}`
      this.sockets.set(socket, entry)
      this.byPeer.set(peer, entry)
      socket.once('close', () => {
        this.sockets.delete(socket)
        this.byPeer.delete(peer)
        if (entry.isAuthed) this.authed--
        else this.releaseUnauthed(key)
      })
    })
    // 평문·깨진 TLS는 조용히 끊는다
    server.on('tlsClientError', (_e, socket) => socket.destroy())
    this.server = server
    return new Promise((resolve, reject) => {
      server.once('error', (e) => {
        this.server = null
        reject(e)
      })
      server.listen(opts.port, opts.host, () => {
        const addr = server.address()
        resolve(typeof addr === 'object' && addr ? addr.port : opts.port)
      })
    })
  }

  private releaseUnauthed(key: string) {
    this.unauthed--
    const left = (this.perAddress.get(key) ?? 1) - 1
    if (left > 0) this.perAddress.set(key, left)
    else this.perAddress.delete(key)
  }

  /** 인증을 통과한 연결은 인증 전 한도에서 빼서 전용 자리로 옮긴다 (전용 자리가 차면 그대로 둔다) */
  private markAuthed(socket: Socket) {
    const entry = this.byPeer.get(`${socket.remoteAddress}:${socket.remotePort}`)
    if (!entry || entry.isAuthed || this.authed >= AUTHED_RESERVED) return
    entry.isAuthed = true
    this.authed++
    this.releaseUnauthed(entry.key)
  }

  /** 포트를 닫고 남은 연결도 끊는다 */
  stop(): Promise<void> {
    const server = this.server
    this.server = null
    if (!server) return Promise.resolve()
    for (const s of this.sockets.keys()) s.destroy()
    this.sockets.clear()
    this.byPeer.clear()
    this.perAddress.clear()
    this.unauthed = 0
    this.authed = 0
    return new Promise((resolve) => server.close(() => resolve()))
  }

  private serve(req: IncomingMessage, res: ServerResponse, opts: RemoteServerOptions) {
    const path = (req.url ?? '/').split('?')[0]
    const access: AccessLogger = (status, error) => opts.onAccess?.({ at: Date.now(), ip: clientIp(req), method: req.method ?? '', path: path.slice(0, 120), status, ...(error ? { error } : {}) })
    if (opts.stream?.(req, res, { ip: clientIp(req), access, markAuthed: () => this.markAuthed(req.socket) })) return
    const send = (status: number, body: Record<string, unknown>, headers: Record<string, string>, after?: () => unknown) => {
      const text = JSON.stringify(body)
      res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text) })
      res.end(text, () => void after?.())
      access(status, typeof body.error === 'string' ? body.error : undefined)
    }
    // 본문보다 인증이 먼저 — 막힌 요청은 본문을 읽지 않고 바로 답하고 연결을 닫는다 (인증 없이 1MB를 받아 주지 않게)
    const checked = opts.precheck?.({ url: req.url ?? '/', authorization: req.headers.authorization, ip: clientIp(req) }) ?? null
    if (checked && !('blocked' in checked)) this.markAuthed(req.socket)
    if (checked && 'blocked' in checked) return send(checked.blocked.status, checked.blocked.body, { ...checked.blocked.headers, Connection: 'close' }, () => req.socket.destroy())
    const limit = checked?.bodyLimit ?? BODY_MAX_BYTES
    // 미리 밝힌 길이가 상한을 넘으면 본문을 읽지 않고 바로 거절하고 연결을 닫는다
    const declared = Number(req.headers['content-length'] ?? 0)
    if (declared > limit) {
      const r = fail('payload_too_large')
      return send(413, checked ? { ...r.body, protocolVersion: V2_PROTOCOL_VERSION } : r.body, { Connection: 'close' }, () => req.socket.destroy())
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size <= limit) return void chunks.push(c)
      // 길이를 밝히지 않고(나눠 보내기) 상한을 넘기면 더 받지 않고 끊는다
      if (!req.socket.destroyed) access(413, 'payload_too_large')
      req.socket.destroy()
    })
    req.on('end', async () => {
      let r: HandledResponse
      try {
        r = await opts.handle({
          method: req.method ?? '',
          url: req.url ?? '/',
          authorization: req.headers.authorization,
          contentType: req.headers['content-type'],
          idempotencyKey: typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined,
          capabilities: parseCapabilities(req.headers[CAPABILITIES_HEADER]),
          ip: clientIp(req),
          body: chunks.length ? Buffer.concat(chunks) : null,
          ...(checked ? { isPrechecked: true } : {}),
        })
      } catch {
        r = { status: 500, headers: {}, body: { protocolVersion: checked ? V2_PROTOCOL_VERSION : 1, error: 'internal_error', message: 'PC에서 문제가 생겼어요' } }
      }
      if (res.destroyed) return
      // 연결이 끊기는 변경(원격 끄기·QR 다시 만들기)은 응답이 폰에 다 간 뒤에 한다
      send(r.status, r.body, r.headers, r.after)
    })
  }
}
