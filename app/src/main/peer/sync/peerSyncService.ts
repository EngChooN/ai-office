// 파일 복사본·변경 묶음의 입구 — 3번이 부르는 SyncApi(설계서 9-2)와 B컴 경로(syncRoutes)가 쓰는 host* 함수
// electron을 import하지 않는다 (저장 경로는 baseDir 인자). A컴·B컴이 같은 클래스를 쓴다

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  isSha256,
  isSyncId,
  SyncError,
  SYNC_LIMITS,
  SYNC_PATHS,
  type ApplyChoice,
  type ApplyResult,
  type CardFile,
  type ChangeSet,
  type ChangeSetView,
  type Manifest,
  type PeerChangesCard,
  type SyncApi,
  type SyncHttp,
} from '../../../shared/peerSync.ts'
import { diffHunks } from '../../../shared/textDiff.ts'
import { applyPlan, assertNoLinkParent, planChanges, readNoFollow } from './applyChanges.ts'
import { BlobStore } from './blobStore.ts'
import { diffWorkspace, eachLimit, receiveChangeSet } from './changeset.ts'
import { hashFile, manifestRev, scanFolder } from './manifest.ts'
import { resolveInside, rootAllowed } from './pathPolicy.ts'
import type { ChangesetRecord, SyncStore, WorkspaceRecord } from './syncDb'
import { WorkspaceStore } from './workspaceStore.ts'

export interface PeerSyncDeps {
  /** 앱 저장 폴더 (userData). 아래에 peer-workspaces·peer-blobs·peer-staging·peer-undo·peer-conflicts를 만든다 */
  baseDir: string
  store: SyncStore
  /** 대표가 등록한 랩 폴더들 — 복사본 루트는 이 중 하나만 */
  registeredRoots(): string[]
  /** 루트가 될 수 없는 곳 (기본: baseDir) */
  forbiddenRoots?: string[]
  home?: string
  now?(): number
  newId?(): string
}

/** 카드에 붙이는 비교 글자 수 합계 (화면으로 너무 큰 결재가 가지 않게) */
const CARD_DIFF_TOTAL = 1024 * 1024

const asText = (b: Buffer): string | null => {
  if (b.includes(0)) return null
  const s = b.toString('utf8')
  return s.includes('�') ? null : s
}

export class PeerSync implements SyncApi {
  private d: PeerSyncDeps
  private now: () => number
  private newId: () => string
  /** B컴: 받은 복사본 내용과 변경 묶음 내용 */
  readonly blobs: BlobStore
  /** A컴: 받은 변경 묶음 내용 (반영·거절 전까지) */
  readonly staging: BlobStore
  readonly workspaces: WorkspaceStore

  constructor(d: PeerSyncDeps) {
    this.d = d
    this.now = d.now ?? Date.now
    this.newId = d.newId ?? crypto.randomUUID
    this.blobs = new BlobStore(path.join(d.baseDir, 'peer-blobs'))
    this.staging = new BlobStore(path.join(d.baseDir, 'peer-staging'))
    this.workspaces = new WorkspaceStore({ root: path.join(d.baseDir, 'peer-workspaces'), store: d.store, blobs: this.blobs, now: this.now })
  }

  private async allowedRoot(root: string) {
    const r = await rootAllowed(root, { registered: this.d.registeredRoots(), forbidden: this.d.forbiddenRoots ?? [this.d.baseDir], home: this.d.home })
    if (!r) throw new SyncError('root_not_allowed')
    return r
  }

  private sideA(id: string): WorkspaceRecord {
    const r = this.d.store.workspaces.get(id)
    if (!r || r.side !== 'a' || !r.root) throw new SyncError('workspace_not_found')
    return r
  }

  // ── A컴: 일 시작 전 ─────────────────────────────────

  async prepareWorkspace(root: string, opts: { exclude?: string[]; peerId?: string } = {}) {
    const real = await this.allowedRoot(root)
    const scan = await scanFolder(real, { exclude: opts.exclude, limits: { maxFiles: SYNC_LIMITS.workspaceFiles, maxBytes: SYNC_LIMITS.workspaceBytes, code: 'workspace_too_large' } })
    const workspaceId = this.newId()
    const manifest: Manifest = { workspaceId, rootName: path.basename(real), createdAt: this.now(), rev: manifestRev(scan.entries), entries: scan.entries }
    if (Buffer.byteLength(JSON.stringify(manifest)) > SYNC_LIMITS.manifestJson) throw new SyncError('workspace_too_large', 'manifest')
    const bytes = scan.entries.reduce((n, e) => n + e.size, 0)
    this.d.store.workspaces.put({ id: workspaceId, side: 'a', root: real, ...(opts.peerId ? { peerId: opts.peerId } : {}), manifest, state: 'prepared', bytes, createdAt: this.now() })
    return { workspaceId, manifest, skipped: scan.skipped, excluded: scan.excluded }
  }

  /** 목록 보내기 → 없는 내용만 올리기 → commit. 끊겨도 다시 부르면 남은 것만 올린다 */
  async pushWorkspace(http: SyncHttp, workspaceId: string) {
    const ws = this.sideA(workspaceId)
    const fail = (why: string): never => {
      throw new SyncError('transfer_failed', why)
    }
    const reg = await http.call('POST', SYNC_PATHS.workspaces, { manifest: ws.manifest }).catch(() => fail('network'))
    if (reg.status === 507 || reg.body.error === 'workspace_quota') throw new SyncError('workspace_quota')
    if (reg.status !== 200 || !Array.isArray(reg.body.missing)) fail(`register:${reg.status}`)
    const bySha = new Map(ws.manifest.entries.map((e) => [e.sha256, e]))
    const missing = (reg.body.missing as unknown[]).filter((s): s is string => isSha256(s) && bySha.has(s))
    await eachLimit(missing, SYNC_LIMITS.concurrency, async (sha) => {
      const e = bySha.get(sha)!
      const abs = resolveInside(ws.root!, e.path)
      if (!abs || (await hashFile(abs).catch(() => null)) !== sha) fail(`source_changed:${e.path}`)
      const r = await http.putBytes(SYNC_PATHS.blob(sha), await fs.readFile(abs!)).catch(() => fail('network'))
      if (r.status !== 200) fail(`blob:${r.status}`)
    })
    const c = await http.call('POST', SYNC_PATHS.commit(workspaceId), {}).catch(() => fail('network'))
    if (c.status !== 200) fail(`commit:${c.status}`)
    this.d.store.workspaces.put({ ...ws, state: 'pushed' })
  }

  // ── B컴 ────────────────────────────────────────────

  workspaceDir(workspaceId: string) {
    return this.workspaces.workspaceDir(workspaceId)
  }

  async collectChanges(jobId: string, workspaceId: string) {
    const ws = this.workspaces.record(workspaceId)
    const dir = this.workspaces.workspaceDir(workspaceId)
    if (!ws || !dir) throw new SyncError('workspace_not_found')
    const d = await diffWorkspace(dir, ws.manifest, this.blobs)
    if (!d.changes.length && !d.skipped.length) return { none: true as const }
    const changesetId = this.newId()
    this.d.store.changesets.put({ id: changesetId, side: 'b', workspaceId, jobId, slotId: ws.slotId, baseRev: ws.manifest.rev, changes: d.changes, skipped: d.skipped, bytes: d.bytes, state: 'collected', createdAt: this.now() })
    return { changesetId, files: d.changes.length, bytes: d.bytes }
  }

  hostRegister(slotId: string, manifest: unknown) {
    return this.workspaces.register(slotId, manifest)
  }

  hostPutBlob(slotId: string, sha: string, data: Buffer) {
    return this.workspaces.putBlob(slotId, sha, data)
  }

  hostCommit(slotId: string, workspaceId: string) {
    return this.workspaces.commit(slotId, workspaceId)
  }

  private hostChangesetRecord(slotId: string, id: string): ChangesetRecord {
    const r = this.d.store.changesets.get(id)
    if (!r || r.side !== 'b' || r.slotId !== slotId) throw new SyncError('changeset_not_found')
    return r
  }

  hostChangeset(slotId: string, id: string): ChangeSet {
    const r = this.hostChangesetRecord(slotId, id)
    return { changesetId: r.id, workspaceId: r.workspaceId, baseRev: r.baseRev, jobId: r.jobId, changes: r.changes, skipped: r.skipped }
  }

  /** 이 슬롯의 변경 묶음에 든 내용만 내보낸다 (다른 슬롯이 주소만 알고 꺼내 가지 못하게) */
  async hostBlob(slotId: string, sha: string): Promise<Buffer> {
    const ok = this.d.store.changesets.list().some((c) => c.side === 'b' && c.slotId === slotId && c.changes.some((x) => x.sha256 === sha))
    if (!ok || !(await this.blobs.has(sha))) throw new SyncError('blob_missing')
    return this.blobs.read(sha)
  }

  // ── A컴: 결과 회수 후 ─────────────────────────────────

  private view(r: ChangesetRecord): ChangeSetView {
    const ws = this.sideA(r.workspaceId)
    return { changesetId: r.id, workspaceId: r.workspaceId, jobId: r.jobId, root: ws.root!, rootName: ws.manifest.rootName, changes: r.changes, skipped: r.skipped, bytes: r.bytes }
  }

  async fetchChangeSet(http: SyncHttp, changesetId: string, expectWorkspaceId?: string): Promise<ChangeSetView> {
    const old = this.d.store.changesets.get(changesetId)
    if (old?.side === 'a') {
      if (expectWorkspaceId && old.workspaceId !== expectWorkspaceId) throw new SyncError('changes_rejected', 'workspace')
      return this.view(old)
    }
    // 어느 복사본의 묶음인지는 B컴 말이 아니라 목록 자체로 확인한다 (A컴이 만든 복사본만)
    const peek = await http.call('GET', SYNC_PATHS.changeset(changesetId)).catch(() => null)
    const wsId = (peek?.body.changeset as { workspaceId?: unknown } | undefined)?.workspaceId
    if (!peek || peek.status !== 200) throw new SyncError(peek?.status === 404 ? 'changeset_not_found' : 'transfer_failed')
    if (!isSyncId(wsId) || (expectWorkspaceId && wsId !== expectWorkspaceId)) throw new SyncError('changes_rejected', 'workspace')
    const ws = this.sideA(wsId)
    try {
      const rec = await receiveChangeSet({ ...http, call: async () => peek }, changesetId, ws, this.staging, this.now())
      this.d.store.changesets.put(rec)
      return this.view(rec)
    } catch (e) {
      // 거절한 묶음의 내용은 남기지 않는다
      await this.dropStaging(changesetId, null)
      throw e
    }
  }

  private pendingA(changesetId: string) {
    const r = this.d.store.changesets.get(changesetId)
    if (!r || r.side !== 'a') throw new SyncError('changeset_not_found')
    return r
  }

  /** 결재 카드 본문 — 열 때마다 지금 A컴 파일로 충돌을 다시 판정한다 */
  async approvalCard(view: ChangeSetView): Promise<PeerChangesCard> {
    const plan = await this.planOrReject(view.root, view.changesetId, view.changes)
    let budget = CARD_DIFF_TOTAL
    const files: CardFile[] = []
    for (const p of plan) {
      const c = p.change
      const f: CardFile = { op: c.op, path: c.path, ...(c.size !== undefined ? { size: c.size } : {}), verdict: p.verdict, ...(p.reason ? { conflict: p.reason } : {}), isSensitive: p.isSensitive }
      if (p.verdict !== 'same') f.diff = await this.diffOf(view.root, c, budget)
      if (Array.isArray(f.diff)) budget -= f.diff.reduce((n, h) => n + (h.kind === 'same' ? h.lines : [...h.del, ...h.add]).reduce((m, l) => m + l.length, 0), 0)
      files.push(f)
    }
    const count = (fn: (f: CardFile) => boolean) => files.filter(fn).length
    return {
      changesetId: view.changesetId,
      workspaceId: view.workspaceId,
      jobId: view.jobId,
      rootName: view.rootName,
      files,
      counts: { add: count((f) => f.op === 'add'), modify: count((f) => f.op === 'modify'), delete: count((f) => f.op === 'delete'), conflict: count((f) => f.verdict === 'conflict'), same: count((f) => f.verdict === 'same'), sensitive: count((f) => f.isSensitive) },
      bytes: view.bytes,
      skipped: view.skipped,
    }
  }

  /** 3번 officeHandlers의 peerChangesetDetail 본문 */
  async changesetDetail(changesetId: string) {
    return this.approvalCard(this.view(this.pendingA(changesetId)))
  }

  private async diffOf(root: string, c: ChangeSetView['changes'][number], budget: number): Promise<CardFile['diff']> {
    if ((c.size ?? 0) > SYNC_LIMITS.diffMax || budget <= 0) return 'too_large'
    const abs = resolveInside(root, c.path)
    if (!abs) return 'too_large'
    // 판정 뒤에 링크로 바뀌었을 수 있어 읽기 직전에 다시 본다 (폴더 밖 파일을 카드로 내보내지 않게)
    await assertNoLinkParent(root, c.path)
    const st = await fs.lstat(abs).catch(() => null)
    const before = st?.isFile() && st.size <= SYNC_LIMITS.diffMax ? await readNoFollow(abs).catch(() => null) : st ? null : Buffer.alloc(0)
    if (!before) return 'too_large'
    const after = c.op === 'delete' ? Buffer.alloc(0) : await this.staging.read(c.sha256!)
    const a = asText(before)
    const b = asText(after)
    if (a === null || b === null) return 'binary'
    if (a.length + b.length > budget) return 'too_large'
    return diffHunks(a, b)
  }

  async applyChangeSet(changesetId: string, choice: ApplyChoice): Promise<ApplyResult> {
    const r = this.pendingA(changesetId)
    const rejected: ApplyResult = { status: 'rejected', applied: [], same: [], conflicts: [], held: r.changes.map((c) => c.path) }
    // 링크 때문에 이미 거절된 묶음을 대표가 거절로 닫는 경우
    if (r.state === 'rejected' && choice.mode === 'reject') return rejected
    if (r.state !== 'pending') throw new SyncError('already_decided', r.state)
    const decide = async (state: ChangesetRecord['state'], result: ApplyResult) => {
      this.d.store.changesets.put({ ...r, state, decidedAt: this.now() })
      await this.dropStaging(changesetId, r)
      return result
    }
    if (choice.mode === 'reject') return decide('rejected', rejected)
    const ws = this.sideA(r.workspaceId)
    // 루트가 아직 등록된 랩 폴더인지, 그사이 링크로 바뀌지 않았는지 다시 본다
    const root = await this.allowedRoot(ws.root!)
    if (root !== ws.root) throw new SyncError('root_not_allowed', 'moved')
    let result: ApplyResult
    try {
      const plan = await this.planOrReject(root, changesetId, r.changes)
      result = await applyPlan(plan, choice, {
        root,
        staging: this.staging,
        undoDir: path.join(this.d.baseDir, 'peer-undo', changesetId),
        conflictDir: path.join(this.d.baseDir, 'peer-conflicts', changesetId),
      })
    } catch (e) {
      // 링크 폴더를 지나는 경로: 아무것도 쓰지 않고 묶음 전체 거절 (충돌 없는 것만 반영도 마찬가지)
      if (!(e instanceof SyncError) || e.code !== 'changes_rejected') throw e
      if (this.d.store.changesets.get(changesetId)?.state === 'pending') return decide('rejected', { ...rejected, error: 'changes_rejected' })
      return { ...rejected, error: 'changes_rejected' }
    }
    // 막혔거나 실패해 되돌린 경우는 대표가 다시 고를 수 있게 그대로 둔다
    if (result.status === 'blocked' || result.status === 'failed') return result
    return decide(result.status, result)
  }

  /** 판정. 링크 폴더를 지나는 경로가 있으면 묶음 전체를 거절 상태로 닫고(받은 내용 삭제) 다시 던진다 */
  private async planOrReject(root: string, changesetId: string, changes: ChangeSetView['changes']) {
    try {
      return await planChanges(root, changes)
    } catch (e) {
      const r = this.d.store.changesets.get(changesetId)
      if (e instanceof SyncError && e.code === 'changes_rejected' && r?.side === 'a' && r.state === 'pending') {
        this.d.store.changesets.put({ ...r, state: 'rejected', decidedAt: this.now() })
        await this.dropStaging(changesetId, r)
      }
      throw e
    }
  }

  /** 받은 묶음의 스테이징 내용을 지운다 (다른 대기 묶음이 같은 내용을 쓰면 남긴다) */
  private async dropStaging(changesetId: string, r: ChangesetRecord | null) {
    const keep = new Set<string>()
    for (const c of this.d.store.changesets.list()) if (c.side === 'a' && c.state === 'pending' && c.id !== changesetId) for (const x of c.changes) if (x.sha256) keep.add(x.sha256)
    if (r) {
      for (const x of r.changes) if (x.sha256 && !keep.has(x.sha256)) await this.staging.remove(x.sha256)
    } else await this.staging.prune(keep)
  }

  async discardWorkspace(workspaceId: string) {
    const r = this.d.store.workspaces.get(workspaceId)
    if (!r) return
    if (r.side === 'b') {
      await this.workspaces.discard(workspaceId)
      for (const c of this.d.store.changesets.list()) if (c.side === 'b' && c.workspaceId === workspaceId) this.d.store.changesets.delete(c.id)
      await this.pruneBlobs()
      return
    }
    // A컴: 반영을 기다리는 묶음이 있으면 기준 목록이 필요하니 남긴다
    if (this.d.store.changesets.list().some((c) => c.side === 'a' && c.workspaceId === workspaceId && c.state === 'pending')) return
    this.d.store.workspaces.delete(workspaceId)
  }

  /** 슬롯 해제 (B컴) */
  async discardSlot(slotId: string) {
    for (const r of this.d.store.workspaces.list()) if (r.side === 'b' && r.slotId === slotId) await this.discardWorkspace(r.id)
  }

  private async pruneBlobs() {
    const keep = new Set<string>()
    for (const w of this.d.store.workspaces.list()) if (w.side === 'b') for (const e of w.manifest.entries) keep.add(e.sha256)
    for (const c of this.d.store.changesets.list()) if (c.side === 'b') for (const x of c.changes) if (x.sha256) keep.add(x.sha256)
    await this.blobs.prune(keep)
  }

  /** 보관 기간 정리 (설계서 7-7) — 앱 시작 때 한 번 */
  async prune() {
    const now = this.now()
    for (const w of this.d.store.workspaces.list()) if (w.createdAt < now - SYNC_LIMITS.keepMs && (w.side === 'b' || w.state !== 'prepared')) await this.discardWorkspace(w.id)
    for (const c of this.d.store.changesets.list()) {
      if (c.side === 'a' && c.state === 'pending' && c.createdAt < now - SYNC_LIMITS.stagingKeepMs) {
        this.d.store.changesets.put({ ...c, state: 'rejected', decidedAt: now })
        await this.dropStaging(c.id, c)
      } else if (c.side === 'a' && c.state !== 'pending' && (c.decidedAt ?? c.createdAt) < now - SYNC_LIMITS.keepMs) this.d.store.changesets.delete(c.id)
    }
    for (const dir of ['peer-undo', 'peer-conflicts']) {
      const base = path.join(this.d.baseDir, dir)
      for (const name of await fs.readdir(base).catch(() => [] as string[])) {
        const st = await fs.stat(path.join(base, name)).catch(() => null)
        if (st && st.mtimeMs < now - SYNC_LIMITS.keepMs) await fs.rm(path.join(base, name), { recursive: true, force: true })
      }
    }
    await this.pruneBlobs()
  }
}

