// A컴 → B컴 실제 HTTPS 통로: 인증서는 검증하지 않고(자체 서명) 짝지을 때 고정한 공개키 지문(spki)과 같은지만 본다
// 지문이 다르면 요청 내용을 보내기 전에 연결을 끊는다 (SPKI_MISMATCH). 네트워크 오류는 reject, HTTP 오류 상태는 그대로 돌려준다

import crypto from 'node:crypto'
import https from 'node:https'
import type { TLSSocket } from 'node:tls'
import type { PairTransport } from './pairing'
import type { OpenStream, StreamHandlers } from './peerClient'
import { SseParser } from './peerClient.ts'

export interface PeerHttpResponse {
  status: number
  body: Record<string, unknown>
}

/** 인증이 붙은 B컴 호출 (JobQueue·ApprovalRelay가 쓴다). 네트워크 오류면 reject */
export interface PeerHttp {
  call(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, opts?: { idempotencyKey?: string }): Promise<PeerHttpResponse>
  /** 파일 바이트 올리기·받기 (복사본·변경 묶음, 4번). 없는 통로(테스트의 가짜)면 파일 동기화를 쓰지 않는다 */
  putBytes?(path: string, data: Buffer, headers?: Record<string, string>): Promise<PeerHttpResponse>
  getBytes?(path: string, limit: number): Promise<{ status: number; data: Buffer | null }>
}

export interface PeerEndpoint {
  host: string
  port: number
  /** 고정한 지문. 없으면(짝짓기 첫 접속) 검사하지 않고 본 지문만 기록한다 */
  spki?: string
}

const REQUEST_TIMEOUT_MS = 30_000
const BODY_MAX = 16 * 1024 * 1024

export const spkiOfSocket = (socket: TLSSocket) => {
  const raw = socket.getPeerCertificate(false)?.raw
  if (!raw) return null
  const der = new crypto.X509Certificate(raw).publicKey.export({ type: 'spki', format: 'der' })
  return `sha256/${crypto.createHash('sha256').update(der).digest('base64')}`
}

/** 연결이 열리면 지문을 확인한다 — 고정값이 있고 다르면 끊는다 */
function pinCheck(req: ReturnType<typeof https.request>, pin: string | undefined, seen: (s: string | null) => void) {
  req.on('socket', (socket) => {
    const check = () => {
      const s = spkiOfSocket(socket as TLSSocket)
      seen(s)
      if (pin && s !== pin) socket.destroy(Object.assign(new Error('spki mismatch'), { code: 'SPKI_MISMATCH' }))
    }
    // 새 연결은 핸드셰이크가 끝나야 인증서가 보인다 (이미 끝난 소켓이면 바로)
    if ((socket as TLSSocket).getPeerCertificate?.(false)?.raw) check()
    else socket.once('secureConnect', check)
  })
}

const baseOptions = (e: PeerEndpoint, path: string, method: string, headers: Record<string, string | number>) => ({
  host: e.host,
  port: e.port,
  path,
  method,
  headers,
  rejectUnauthorized: false,
  minVersion: 'TLSv1.2' as const,
  agent: false as const,
})

function requestJson(e: PeerEndpoint, token: string | null, method: string, path: string, body?: unknown, extra: Record<string, string> = {}, onSeen: (s: string | null) => void = () => {}): Promise<PeerHttpResponse> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8')
    const headers: Record<string, string | number> = { 'X-Office-Capabilities': 'iso-office', ...extra }
    if (token) headers.Authorization = `Bearer ${token}`
    if (payload) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = payload.length
    }
    const req = https.request(baseOptions(e, path, method, headers), (res) => {
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        size += c.length
        if (size > BODY_MAX) return void req.destroy(new Error('response too large'))
        chunks.push(c)
      })
      res.on('end', () => {
        let parsed: Record<string, unknown> = {}
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        } catch {
          // JSON이 아니면 빈 본문으로 본다
        }
        resolve({ status: res.statusCode ?? 0, body: parsed })
      })
    })
    pinCheck(req, e.spki, onSeen)
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })))
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

const BYTES_TIMEOUT_MS = 120_000

/** 바이트 올리기(PUT)·받기(GET). 받을 때는 limit을 넘으면 끊는다. extra는 첨부 이름·종류 같은 머리글 (인증·길이는 덮어쓰지 못한다) */
function requestBytes(e: PeerEndpoint, token: string, method: 'PUT' | 'GET', path: string, data: Buffer | null, limit: number, extra: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown>; data: Buffer | null }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = { 'X-Office-Capabilities': 'iso-office', ...(data ? { 'Content-Type': 'application/octet-stream' } : {}), ...extra, Authorization: `Bearer ${token}` }
    if (data) headers['Content-Length'] = data.length
    const req = https.request(baseOptions(e, path, method, headers), (res) => {
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        size += c.length
        if (size > limit) return void req.destroy(new Error('response too large'))
        chunks.push(c)
      })
      res.on('end', () => {
        const raw = Buffer.concat(chunks)
        const status = res.statusCode ?? 0
        if (status === 200 && /^application\/octet-stream/i.test(String(res.headers['content-type'] ?? ''))) return resolve({ status, body: {}, data: raw })
        let parsed: Record<string, unknown> = {}
        try {
          parsed = JSON.parse(raw.toString('utf8') || '{}')
        } catch {
          // JSON이 아니면 빈 본문
        }
        resolve({ status, body: parsed, data: null })
      })
    })
    pinCheck(req, e.spki, () => {})
    req.setTimeout(BYTES_TIMEOUT_MS, () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })))
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

/** 짝짓기용 통로: 지문을 모르는 상태로 붙고 실제로 본 지문을 기록한다 */
export function createPairTransport(host: string, port: number): PairTransport {
  let seen: string | null = null
  return {
    seenSpki: () => seen,
    post: (path, body) => requestJson({ host, port }, null, 'POST', path, body, {}, (s) => (seen = s)),
  }
}

/** 인증이 붙은 호출 통로 */
export function createPeerHttp(e: PeerEndpoint & { spki: string }, token: string): PeerHttp {
  return {
    call: (method, path, body, opts) => requestJson(e, token, method, path, body, opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
    putBytes: async (path, data, headers) => {
      const r = await requestBytes(e, token, 'PUT', path, data, BODY_MAX, headers)
      return { status: r.status, body: r.body }
    },
    getBytes: async (path, limit) => {
      const r = await requestBytes(e, token, 'GET', path, null, limit)
      return { status: r.status, data: r.data }
    },
  }
}

/** SSE 통로 */
export function createOpenStream(e: PeerEndpoint & { spki: string }, token: string): OpenStream {
  return (path, headers, h: StreamHandlers) => {
    const req = https.request(baseOptions(e, path, 'GET', { ...headers, Authorization: `Bearer ${token}` }), (res) => {
      const status = res.statusCode ?? 0
      h.onOpen(status)
      if (status !== 200) {
        res.resume()
        return void res.on('end', () => h.onClose({ status }))
      }
      res.setEncoding('utf8')
      const parser = new SseParser()
      res.on('data', (chunk: string) => parser.feed(chunk, (ev) => h.onEvent(ev.event, ev.data, ev.id)))
      res.on('end', () => h.onClose({}))
      res.on('error', (err) => h.onClose({ code: (err as NodeJS.ErrnoException).code ?? 'ERR' }))
    })
    req.socket?.setKeepAlive?.(true, 15_000)
    pinCheck(req, e.spki, () => {})
    req.on('error', (err) => h.onClose({ code: (err as NodeJS.ErrnoException).code ?? 'ERR' }))
    req.end()
    return { close: () => req.destroy() }
  }
}
