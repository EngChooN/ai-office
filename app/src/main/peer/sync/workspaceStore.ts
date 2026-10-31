// B컴 복사본 폴더: 목록 받기 → 내용 받기 → 폴더 만들기(commit), 할당량·정리 (설계서 7-1·7-4·7-7)
// 복사본은 <baseDir>/peer-workspaces/<workspaceId>/ 아래에만 쓴다. 슬롯마다 자기 복사본만 다룬다

import fs from 'node:fs/promises'
import path from 'node:path'
import { SyncError, SYNC_LIMITS, type Manifest } from '../../../shared/peerSync.ts'
import type { BlobStore } from './blobStore'
import { validateManifest } from './manifest.ts'
import type { SyncStore, WorkspaceRecord } from './syncDb'

export class WorkspaceStore {
  private root: string
  private store: SyncStore
  private blobs: BlobStore
  private now: () => number

  constructor(o: { root: string; store: SyncStore; blobs: BlobStore; now: () => number }) {
    this.root = o.root
    this.store = o.store
    this.blobs = o.blobs
    this.now = o.now
  }

  private own(slotId: string, id: string): WorkspaceRecord {
    const r = this.store.workspaces.get(id)
    if (!r || r.side !== 'b' || r.slotId !== slotId) throw new SyncError('workspace_not_found')
    return r
  }

  dirOf(id: string) {
    return path.join(this.root, id)
  }

  /** 목록을 받는다 → 아직 없는 내용 주소 목록 */
  async register(slotId: string, manifest: unknown): Promise<{ missing: string[] }> {
    const bad = validateManifest(manifest)
    if (bad) throw new SyncError('changes_rejected', bad)
    const m = manifest as Manifest
    const old = this.store.workspaces.get(m.workspaceId)
    if (old && (old.side !== 'b' || old.slotId !== slotId)) throw new SyncError('changes_rejected', 'id')
    if (old?.state === 'ready') return { missing: [] }
    const bytes = m.entries.reduce((n, e) => n + e.size, 0)
    const used = this.store.workspaces.list().filter((r) => r.side === 'b' && r.id !== m.workspaceId).reduce((n, r) => n + r.bytes, 0)
    if (used + bytes > SYNC_LIMITS.hostQuotaBytes) throw new SyncError('workspace_quota')
    this.store.workspaces.put({ id: m.workspaceId, side: 'b', slotId, manifest: m, state: 'uploading', bytes, createdAt: this.now() })
    return { missing: await this.missing(m) }
  }

  private async missing(m: Manifest) {
    const out: string[] = []
    for (const sha of new Set(m.entries.map((e) => e.sha256))) if (!(await this.blobs.has(sha))) out.push(sha)
    return out
  }

  /** 이 슬롯이 올리는 중인 복사본에 들어 있는 내용만 받는다 (아무 내용이나 쌓지 못하게) */
  async putBlob(slotId: string, sha: string, data: Buffer) {
    const r = this.store.workspaces.list().find((w) => w.side === 'b' && w.slotId === slotId && w.state === 'uploading' && w.manifest.entries.some((e) => e.sha256 === sha))
    if (!r) throw new SyncError('workspace_not_found', 'blob not listed')
    const size = r.manifest.entries.find((e) => e.sha256 === sha)?.size
    await this.blobs.put(sha, data, size)
  }

  /** 내용이 다 모였으면 폴더를 만든다 */
  async commit(slotId: string, id: string) {
    const r = this.own(slotId, id)
    if (r.state === 'ready') return
    const missing = await this.missing(r.manifest)
    if (missing.length) throw new SyncError('blob_missing', String(missing.length))
    const dir = this.dirOf(id)
    await fs.rm(dir, { recursive: true, force: true })
    await fs.mkdir(dir, { recursive: true, mode: 0o700 })
    for (const e of r.manifest.entries) {
      const dest = path.join(dir, ...e.path.split('/'))
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, await this.blobs.read(e.sha256), { flag: 'wx', mode: e.exec ? 0o755 : 0o644 })
    }
    this.store.workspaces.put({ ...r, state: 'ready' })
  }

  /** 3번이 직원 cwd로 쓰는 폴더 — 다 만들어진 복사본만 */
  workspaceDir(id: string): string | null {
    const r = this.store.workspaces.get(id)
    return r && r.side === 'b' && r.state === 'ready' ? this.dirOf(id) : null
  }

  record(id: string) {
    const r = this.store.workspaces.get(id)
    return r?.side === 'b' ? r : undefined
  }

  async discard(id: string) {
    await fs.rm(this.dirOf(id), { recursive: true, force: true })
    this.store.workspaces.delete(id)
  }

  /** 슬롯 해제 때 그 슬롯의 복사본을 모두 지운다 */
  async discardSlot(slotId: string) {
    for (const r of this.store.workspaces.list()) if (r.side === 'b' && r.slotId === slotId) await this.discard(r.id)
  }

  /** 오래된 복사본 정리 (7일) */
  async prune() {
    const cutoff = this.now() - SYNC_LIMITS.keepMs
    for (const r of this.store.workspaces.list()) if (r.side === 'b' && r.createdAt < cutoff) await this.discard(r.id)
  }
}
