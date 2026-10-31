// 파일 복사본 경로 (설계서 8-2의 4번 담당) — B컴 서버 쪽
// POST /v2/peer/workspaces · POST …/{id}/commit · PUT·GET /v2/peer/blobs/{sha256} · GET /v2/peer/changesets/{id}
// 인증·잠금은 V2Routes 앞단이 이미 거쳤다. 피어 토큰(slotId)이 아니면 거부하고, 슬롯마다 자기 복사본·묶음만 다룬다

import type { IncomingMessage, ServerResponse } from 'node:http'
import { isSha256, isSyncId, SyncError, SYNC_LIMITS, type SyncErrorCode } from '../../shared/peerSync.ts'
import type { PeerSync } from '../peer/sync/peerSyncService'
import { V2_PROTOCOL_VERSION } from './v2.ts'

export type Access = (status: number, error?: string) => void

const COMMIT_PATH = /^\/v2\/peer\/workspaces\/([^/]{1,64})\/commit$/
const BLOB_PATH = /^\/v2\/peer\/blobs\/([^/]{1,64})$/
const CHANGESET_PATH = /^\/v2\/peer\/changesets\/([^/]{1,64})$/

/** 4번 오류 코드의 HTTP 상태 */
const STATUS: Record<SyncErrorCode | 'internal_error' | 'scope_denied' | 'not_found' | 'method_not_allowed' | 'invalid_request' | 'payload_too_large' | 'unsupported_media_type', number> = {
  scope_denied: 403,
  not_found: 404,
  method_not_allowed: 405,
  invalid_request: 400,
  payload_too_large: 413,
  unsupported_media_type: 415,
  root_not_allowed: 403,
  workspace_too_large: 413,
  workspace_quota: 507,
  workspace_not_found: 404,
  changes_too_large: 413,
  changes_rejected: 422,
  changeset_not_found: 404,
  blob_mismatch: 422,
  blob_missing: 404,
  transfer_failed: 502,
  already_decided: 409,
  apply_failed: 500,
  internal_error: 500,
}

type Code = keyof typeof STATUS

function readBody(req: IncomingMessage, limit: number): Promise<Buffer | 'too_large'> {
  return new Promise((resolve) => {
    const declared = Number(req.headers['content-length'] ?? 0)
    if (declared > limit) {
      resolve('too_large')
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        resolve('too_large')
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', () => resolve('too_large'))
  })
}

export class SyncRoutes {
  private sync: PeerSync

  constructor(sync: PeerSync) {
    this.sync = sync
  }

  static isSyncPath(path: string) {
    return path === '/v2/peer/workspaces' || COMMIT_PATH.test(path) || BLOB_PATH.test(path) || CHANGESET_PATH.test(path)
  }

  /** slotId는 피어 토큰의 슬롯 (휴대폰 토큰은 null → 거부) */
  async handle(req: IncomingMessage, res: ServerResponse, path: string, slotId: string | null, access: Access) {
    const json = (status: number, body: Record<string, unknown>) => {
      const text = JSON.stringify({ protocolVersion: V2_PROTOCOL_VERSION, ...body })
      // 본문을 다 읽지 않고 거절하면 연결을 닫는다 (올리던 바이트를 받지 않게)
      const close = status === 413 ? { Connection: 'close' } : {}
      res.writeHead(status, { ...close, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text) })
      res.end(text)
      access(status, typeof body.error === 'string' ? body.error : undefined)
    }
    // 화면에 보일 말이 아니라 코드만 — 경로·내용은 응답·기록에 넣지 않는다
    const fail = (code: Code, extra: Record<string, unknown> = {}) => json(STATUS[code], { error: code, ...extra })
    const method = req.method ?? ''
    const allow = (m: string) => {
      res.setHeader('Allow', m)
      fail('method_not_allowed')
    }
    if (!slotId) return fail('scope_denied')
    try {
      if (path === '/v2/peer/workspaces') {
        if (method !== 'POST') return allow('POST')
        if (!/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) return fail('unsupported_media_type')
        const raw = await readBody(req, SYNC_LIMITS.manifestJson + 1024)
        if (raw === 'too_large') return fail('payload_too_large')
        let body: { manifest?: unknown }
        try {
          body = JSON.parse(raw.toString('utf8') || '{}')
        } catch {
          return fail('invalid_request')
        }
        return json(200, await this.sync.hostRegister(slotId, body?.manifest))
      }
      const commit = COMMIT_PATH.exec(path)
      if (commit) {
        if (method !== 'POST') return allow('POST')
        if (!isSyncId(commit[1])) return fail('workspace_not_found')
        await this.sync.hostCommit(slotId, commit[1])
        return json(200, { ok: true })
      }
      const blob = BLOB_PATH.exec(path)
      if (blob) {
        if (!isSha256(blob[1])) return fail('not_found')
        if (method === 'PUT') {
          const raw = await readBody(req, SYNC_LIMITS.fileMax)
          if (raw === 'too_large') return fail('payload_too_large')
          await this.sync.hostPutBlob(slotId, blob[1], raw)
          return json(200, { ok: true })
        }
        if (method !== 'GET') return allow('GET, PUT')
        const data = await this.sync.hostBlob(slotId, blob[1])
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': data.length })
        res.end(data)
        return access(200)
      }
      const cs = CHANGESET_PATH.exec(path)
      if (cs) {
        if (method !== 'GET') return allow('GET')
        if (!isSyncId(cs[1])) return fail('changeset_not_found')
        return json(200, { changeset: this.sync.hostChangeset(slotId, cs[1]) })
      }
      return fail('not_found')
    } catch (e) {
      if (e instanceof SyncError) return fail(e.code)
      return fail('internal_error')
    }
  }
}
