// 원격 v2 경로 (규격 v2 4·7·8절): /v2/call(JSON) · /v2/events(SSE) · /v2/attachments(올리기) · /v2/files/{id}(받기)
// 모두 v1과 같은 앞단(preflight: 버전 → 잠금 → 인증 → 전체 조작 → 속도)을 먼저 거친다

import crypto from 'node:crypto'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { OfficeMethod } from '../../shared/officeApiShape'
import type { Attachment } from '../../shared/types'
import { bearerToken, hashToken, type AuthGuard } from './auth.ts'
import { acceptHello, CAPABILITIES_HEADER, HELLO_METHOD, NO_CAPABILITIES, parseCapabilities, shapeFor } from './capabilities.ts'
import type { EventHub } from './events.ts'
import { preflight, type RemoteRequest } from './handler.ts'
import type { RemoteResponse } from './protocol.ts'
import type { AccessLogger, HandledResponse } from './server.ts'
import { encodeV2Response, handleV2Call, IdempotencyStore, stripAttachmentPaths, V2_CALL_BODY_MAX, V2_CONCURRENT_MAX, V2_PROTOCOL_VERSION, v2Fail, type AttachmentLookup } from './v2.ts'

/** 첨부 한 개 올리기 상한 */
export const V2_UPLOAD_MAX = 20 * 1024 * 1024
const FILE_NAME_MAX = 200
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const FILE_PATH = /^\/v2\/files\/([^/]+)$/
/** 브라우저 안에서 바로 보여 줘도 되는 종류 (그 밖은 내려받기) */
const INLINE_MIME = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/

/** v2가 사무실에 닿는 길 — PC 화면과 같은 처리 함수 표(officeHandlers)와 첨부 저장소 */
export interface V2Office {
  /** OfficeApi 메서드 부르기 (원격 표시가 붙은 채로) */
  call(method: OfficeMethod, args: unknown[]): unknown
  /** S 분류 호출의 인자를 원격용으로 제한 */
  restrict?(method: OfficeMethod, args: unknown[]): unknown[]
  /** 첨부 저장소에서 id로 찾기 (PC 화면이 올린 것과 같은 곳) */
  attachment: AttachmentLookup
  /** 첨부 저장소에 새 파일 넣기 (이름·mime은 PC 화면과 같은 규칙으로 고친다) */
  saveUpload(name: string, mime: string, data: Buffer): Attachment
}

/** hello 답에 넣는 전용 모드 필드 (lan은 모를 때 생략) */
const lanFields = (i: { lo: boolean; lan: string | null; ts?: boolean; tsHost?: string | null }) => ({ lo: i.lo, ...(i.lan ? { lan: i.lan } : {}), ...(i.ts ? { ts: true } : {}), ...(i.ts && i.tsHost ? { tsHost: i.tsHost } : {}) })

export interface V2RouteContext {
  guard: AuthGuard
  hub: EventHub
  office: V2Office
  /** 폰 화면이 hello로 알린 능력 (없는 토큰은 예전 화면으로 보고 회사 레벨을 10으로 줄여 보낸다) */
  now(): number
  isReady(): boolean
  currentPort(): number
  /** 전용 모드 여부와 지금 이 PC의 내부 주소 (hello 답에 실어 앱이 주소를 자동으로 고치게 한다) */
  lanInfo?(): { lo: boolean; lan: string | null; ts?: boolean; tsHost?: string | null }
}

const json = (res: ServerResponse, r: RemoteResponse, extraHeaders: Record<string, string> = {}) => {
  const text = JSON.stringify(r.body)
  res.writeHead(r.status, { ...r.headers, ...extraHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text) })
  res.end(text)
}

const tokenHashOf = (authorization: string | undefined) => {
  const t = bearerToken(authorization)
  return t ? hashToken(t) : ''
}

export class V2Routes {
  private ctx: V2RouteContext
  private idempotency = new IdempotencyStore()
  private running = 0

  constructor(ctx: V2RouteContext) {
    this.ctx = ctx
  }

  /** v1과 같은 앞단. 오류 본문의 protocolVersion은 v2 경로이므로 2 */
  private preflight(req: Pick<RemoteRequest, 'url' | 'authorization' | 'ip'>): RemoteResponse | null {
    const blocked = preflight(req, { guard: this.ctx.guard, now: this.ctx.now(), isReady: this.ctx.isReady() })
    return blocked && { ...blocked, body: { ...blocked.body, protocolVersion: V2_PROTOCOL_VERSION } }
  }

  /** 서버가 /v2/call 본문을 읽기 전에 부른다 (버전·잠금·인증·속도): 막히면 본문을 읽지 않고 거절, 통과해야 1MB까지 읽는다 (인증 전에는 한 바이트도 받지 않는다) */
  precheck(req: Pick<RemoteRequest, 'url' | 'authorization' | 'ip'>): { blocked: RemoteResponse } | { bodyLimit: number } {
    const blocked = this.preflight(req)
    return blocked ? { blocked } : { bodyLimit: V2_CALL_BODY_MAX }
  }

  /** 본문을 직접 다루는 경로를 맡는다 (SSE·파일 받기·첨부 올리기). /v2/call과 v1은 false → 서버의 JSON 처리로 */
  stream(req: IncomingMessage, res: ServerResponse, { ip, access, markAuthed }: { ip: string; access: AccessLogger; markAuthed?: () => void }): boolean {
    const path = (req.url ?? '/').split('?')[0]
    const isEvents = path === '/v2/events'
    const file = path.match(FILE_PATH)
    const isUpload = path === '/v2/attachments'
    if (!isEvents && !file && !isUpload) return false
    const reply = (r: RemoteResponse, extra?: Record<string, string>) => {
      json(res, r, extra)
      access(r.status, typeof r.body.error === 'string' ? r.body.error : undefined)
    }
    const auth = { url: path, authorization: req.headers.authorization, ip }
    const blocked = this.preflight(auth)
    if (blocked) {
      // 본문을 읽지 않고 거절하는 경우는 연결을 닫는다 (올리던 바이트를 받지 않게)
      reply(blocked, isUpload ? { Connection: 'close' } : {})
      if (isUpload) res.on('finish', () => req.socket.destroy())
      return true
    }
    markAuthed?.()
    const allow = isUpload ? 'POST' : 'GET'
    if (req.method !== allow) {
      reply(v2Fail('method_not_allowed', { allow }))
      return true
    }
    if (isEvents) this.openEvents(req, res, reply, access)
    else if (file) this.sendFile(file[1], res, reply, access)
    else this.receiveUpload(req, res, reply, access)
    return true
  }

  // ── /v2/events ───────────────────────────────────────

  private openEvents(req: IncomingMessage, res: ServerResponse, reply: (r: RemoteResponse) => void, access: AccessLogger) {
    const tokenHash = tokenHashOf(req.headers.authorization)
    if (!this.ctx.hub.canAccept(tokenHash)) return reply(v2Fail('rate_limited', { retryAfterSec: 5 }))
    // 망이 조용히 끊긴 연결(와이파이→LTE)을 OS가 더 빨리 알아채게 — 쓰기 대기가 쌓이는 것도 줄인다
    req.socket.setKeepAlive(true, 15_000)
    req.socket.setNoDelay(true)
    req.socket.setTimeout(0)
    const last = req.headers['last-event-id']
    // 능력은 연결할 때의 헤더로 — 이 연결에만 쓴다 (같은 토큰의 다른 연결과 섞지 않는다)
    this.ctx.hub.open(res, tokenHash, typeof last === 'string' ? last : undefined, parseCapabilities(req.headers[CAPABILITIES_HEADER]))
    access(200)
  }

  // ── /v2/files/{id} ───────────────────────────────────

  private sendFile(id: string, res: ServerResponse, reply: (r: RemoteResponse) => void, access: AccessLogger) {
    // id로만 찾는다 — 경로 문자는 한 글자도 쓰지 않는다
    if (!UUID.test(id)) return reply(v2Fail('invalid_request'))
    const found = this.ctx.office.attachment(id)
    if (!found?.path) return reply(v2Fail('file_not_found'))
    let size: number
    try {
      const stat = fs.statSync(found.path)
      // 폴더(EISDIR)·특수 파일은 보내지 않는다
      if (!stat.isFile()) return reply(v2Fail('file_not_found'))
      size = stat.size
    } catch {
      // 그 사이에 지워졌거나 읽을 수 없다
      return reply(v2Fail('file_not_found'))
    }
    const isInline = INLINE_MIME.test(found.mime)
    const stream = fs.createReadStream(found.path)
    // 파일을 연 뒤에 헤더를 보낸다 — 열다 실패하면 아직 404로 답할 수 있다. 보내는 도중 실패하면 연결을 끊는다 (메인 프로세스 예외로 번지지 않게)
    stream.on('error', () => {
      if (!res.headersSent) reply(v2Fail('file_not_found'))
      else res.destroy()
    })
    res.on('close', () => stream.destroy())
    stream.once('open', () => {
      res.writeHead(200, {
        'Content-Type': isInline || /^(text\/(markdown|csv)|application\/json)$/.test(found.mime) ? found.mime : 'application/octet-stream',
        'Content-Length': size,
        'Content-Disposition': isInline ? 'inline' : `attachment; filename*=UTF-8''${encodeURIComponent(found.name)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      })
      stream.pipe(res)
      access(200)
    })
  }

  // ── /v2/attachments ──────────────────────────────────

  private receiveUpload(req: IncomingMessage, res: ServerResponse, reply: (r: RemoteResponse, extra?: Record<string, string>) => void, access: AccessLogger) {
    const closeAfter = (r: RemoteResponse) => {
      reply(r, { Connection: 'close' })
      res.on('finish', () => req.socket.destroy())
    }
    const lengthText = req.headers['content-length']
    if (lengthText === undefined) return closeAfter(v2Fail('length_required'))
    const length = Number(lengthText)
    if (!Number.isInteger(length) || length < 0) return closeAfter(v2Fail('invalid_request'))
    if (length > V2_UPLOAD_MAX) return closeAfter(v2Fail('payload_too_large'))
    let name: string
    try {
      name = decodeURIComponent(String(req.headers['x-file-name'] ?? '')).slice(0, FILE_NAME_MAX) || 'file'
    } catch {
      return closeAfter(v2Fail('invalid_request'))
    }
    const mime = String(req.headers['content-type'] ?? '').split(';')[0].trim()
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size <= Math.min(length, V2_UPLOAD_MAX)) return void chunks.push(c)
      // 밝힌 길이보다 더 보내면 끊는다
      if (!req.socket.destroyed) access(413, 'payload_too_large')
      req.socket.destroy()
    })
    req.on('end', () => {
      if (res.destroyed) return
      let saved: Attachment
      try {
        saved = this.ctx.office.saveUpload(name, mime === 'application/octet-stream' ? '' : mime, Buffer.concat(chunks))
      } catch (e) {
        // 디스크가 가득 찼거나 첨부 폴더에 쓸 수 없다 — 경로가 섞인 원문은 보내지 않는다
        const isFull = (e as NodeJS.ErrnoException)?.code === 'ENOSPC'
        return reply(v2Fail('call_failed', { message: isFull ? 'PC 저장 공간이 모자라 파일을 저장하지 못했어요' : 'PC에서 파일을 저장하지 못했어요' }))
      }
      reply({ status: 201, headers: {}, body: { protocolVersion: V2_PROTOCOL_VERSION, serverTime: this.ctx.now(), attachment: stripAttachmentPaths(saved) } })
    })
  }

  // ── /v2/call (서버의 JSON 처리에서 부른다) ─────────────

  async call(req: RemoteRequest): Promise<HandledResponse> {
    // 서버가 본문을 읽기 전에 precheck를 이미 거쳤으면 다시 세지 않는다 (속도 제한을 두 번 세지 않게)
    const blocked = req.isPrechecked ? null : this.preflight(req)
    if (blocked) return blocked
    const path = req.url.split('?')[0]
    if (path !== '/v2/call') return v2Fail('not_found')
    if (req.method !== 'POST') return v2Fail('method_not_allowed', { allow: 'POST' })
    if (!/^application\/json\b/i.test(req.contentType ?? '')) return v2Fail('unsupported_media_type')
    let body: unknown
    try {
      body = JSON.parse(req.body?.toString('utf8') || '')
    } catch {
      return v2Fail('invalid_request')
    }
    const method = typeof (body as { method?: unknown })?.method === 'string' ? (body as { method: string }).method : undefined
    const tokenHash = tokenHashOf(req.authorization)

    // 연결 메시지 hello: 화면이 쓸 능력을 서버가 아는지 확인한다 (OfficeApi 메서드가 아님, 아무것도 저장하지 않음 — 능력은 요청 헤더로 판정).
    // 같은 내용을 몇 번 보내도 결과가 같아 요청 키를 보지 않는다
    if (method === HELLO_METHOD) {
      const rawArgs = (body as { args?: unknown }).args ?? []
      const accepted = Array.isArray(rawArgs) ? acceptHello(rawArgs) : null
      if (!accepted) return v2Fail('invalid_args', { method, message: 'args[0]은 { capabilities: 문자열 배열 }이어야 해요' })
      return { status: 200, headers: {}, body: { protocolVersion: V2_PROTOCOL_VERSION, serverTime: this.ctx.now(), ok: true, result: { capabilities: accepted, ...(this.ctx.lanInfo ? lanFields(this.ctx.lanInfo()) : {}) } } }
    }

    // 같은 요청 다시 보내기: (토큰, 키)마다 한 번만 처리
    const key = req.idempotencyKey ? `${tokenHash}:${req.idempotencyKey.slice(0, 100)}` : null
    if (key) {
      const bodyHash = crypto.createHash('sha256').update(req.body ?? Buffer.alloc(0)).digest('hex')
      const seen = this.idempotency.begin(key, bodyHash, this.ctx.now())
      if (seen === 'mismatch') return v2Fail('invalid_request', { message: '같은 요청 키에 다른 내용을 보냈어요' })
      if (seen === 'in_progress') return v2Fail('in_progress', { retryAfterSec: 1, ...(method ? { method } : {}) })
      if (seen === 'duplicate') return v2Fail('duplicate_call', method ? { method } : {})
      if (seen !== 'new') return seen
    }
    // 한 토큰(공유 토큰 하나)에서 동시에 처리 중인 호출은 8개까지
    if (this.running >= V2_CONCURRENT_MAX) {
      if (key) this.idempotency.cancel(key)
      return v2Fail('rate_limited', { retryAfterSec: 1 })
    }
    this.running++
    try {
      const { response, after } = await handleV2Call(body, {
        call: (m, args) => this.ctx.office.call(m, args),
        restrict: this.ctx.office.restrict,
        attachment: this.ctx.office.attachment,
        manualPaths: async () => ((await this.ctx.office.call('listManuals', [])) as { path: string }[]).map((m) => m.path),
        currentPort: this.ctx.currentPort,
        now: this.ctx.now(),
      })
      // 예전 폰 화면(이 요청에 iso-office를 싣지 않음)에는 회사 레벨을 10까지만
      const shaped = response.status === 200 ? { ...response, body: { ...response.body, result: shapeFor(req.capabilities ?? NO_CAPABILITIES, response.body.result) } } : response
      const encoded = encodeV2Response(shaped, method)
      if (key) this.idempotency.finish(key, encoded.response, Buffer.byteLength(encoded.text))
      return { ...encoded.response, ...(after ? { after } : {}) }
    } finally {
      this.running--
    }
  }
}
