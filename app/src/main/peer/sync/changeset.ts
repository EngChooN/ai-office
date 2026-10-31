// 변경 묶음: B컴 collectChanges(복사본 ↔ 목록 비교) · A컴 받기·검증·스테이징 (설계서 7-4·7-5)
// A컴은 B컴이 준 것을 하나도 믿지 않는다 — 경로 하나라도 금지면 묶음 전체 거절, 내용은 해시를 다시 계산

import { isSha256, isSyncId, SyncError, SYNC_LIMITS, SYNC_PATHS, type Change, type ChangeSet, type Manifest, type SkipReason, type Skipped, type SyncHttp } from '../../../shared/peerSync.ts'
import type { BlobStore } from './blobStore'
import { scanFolder } from './manifest.ts'
import { checkPaths, pathKey } from './pathPolicy.ts'
import type { ChangesetRecord, WorkspaceRecord } from './syncDb'

/** B컴: 복사본 폴더를 훑어 목록과 다른 것을 add/modify/delete로 만든다. 바뀐 내용은 blob 저장소에 넣는다 */
export async function diffWorkspace(dir: string, manifest: Manifest, blobs: BlobStore): Promise<{ changes: Change[]; skipped: Skipped[]; bytes: number }> {
  // 복사본 안에서 새로 생긴 것까지 훑으므로 한도는 복사본 + 변경 묶음
  const scan = await scanFolder(dir, { limits: { maxFiles: SYNC_LIMITS.workspaceFiles + SYNC_LIMITS.changesFiles, maxBytes: SYNC_LIMITS.workspaceBytes + SYNC_LIMITS.changesBytes, code: 'changes_too_large' } })
  const base = new Map(manifest.entries.map((e) => [pathKey(e.path), e]))
  // 링크·특수 파일로 바뀐 자리는 "지워짐"으로 보지 않는다 (건너뜀으로만 알린다)
  const seen = new Set([...scan.entries.map((e) => pathKey(e.path)), ...scan.skipped.map((s) => pathKey(s.path))])
  const changes: Change[] = []
  let bytes = 0
  for (const e of scan.entries) {
    const b = base.get(pathKey(e.path))
    if (!b) changes.push({ op: 'add', path: e.path, size: e.size, sha256: e.sha256, exec: e.exec })
    else if (b.sha256 !== e.sha256 || b.exec !== e.exec) changes.push({ op: 'modify', path: b.path, size: e.size, sha256: e.sha256, baseSha256: b.sha256, exec: e.exec })
    else continue
    bytes += e.size
  }
  for (const [key, b] of base) if (!seen.has(key)) changes.push({ op: 'delete', path: b.path, baseSha256: b.sha256 })
  if (changes.length > SYNC_LIMITS.changesFiles || bytes > SYNC_LIMITS.changesBytes) throw new SyncError('changes_too_large', `${changes.length} files, ${bytes} bytes`)
  for (const c of changes) {
    if (c.op === 'delete') continue
    const scanned = scan.entries.find((e) => pathKey(e.path) === pathKey(c.path))!
    const put = await blobs.putFile(`${dir}/${scanned.path}`)
    // 훑은 뒤에 또 바뀌었으면 지금 내용으로 맞춘다
    c.sha256 = put.sha256
    c.size = put.size
  }
  return { changes, skipped: scan.skipped, bytes }
}

const SKIP_REASONS: readonly SkipReason[] = ['symlink', 'special', 'too_large', 'bad_name']

/**
 * A컴: B컴이 보낸 변경 목록 검사. 통과하면 정리된 Change[] (base 해시는 A컴 목록 값으로 덮는다)
 * 하나라도 이상하면 SyncError('changes_rejected') — 묶음 전체 거절
 */
export function validateChangeSet(raw: unknown, ws: WorkspaceRecord, changesetId: string): { changes: Change[]; skipped: Skipped[]; jobId: string; bytes: number } {
  const reject = (why: string): never => {
    throw new SyncError('changes_rejected', why)
  }
  if (!raw || typeof raw !== 'object') reject('shape')
  const cs = raw as ChangeSet
  if (cs.changesetId !== changesetId || cs.workspaceId !== ws.id) reject('id')
  if (cs.baseRev !== ws.manifest.rev) reject('base_rev')
  if (typeof cs.jobId !== 'string' || cs.jobId.length > 64) reject('job')
  if (!Array.isArray(cs.changes) || !Array.isArray(cs.skipped ?? [])) reject('shape')
  if (cs.changes.length > SYNC_LIMITS.changesFiles) reject('too_many_files')
  const bad = checkPaths(cs.changes.map((c) => c?.path))
  if (bad) reject(`path:${bad.problem}:${bad.path}`)
  const base = new Map(ws.manifest.entries.map((e) => [pathKey(e.path), e]))
  const changes: Change[] = []
  let bytes = 0
  for (const c of cs.changes) {
    const b = base.get(pathKey(c.path))
    if (c.op === 'delete') {
      if (!b) reject('delete_unknown')
      changes.push({ op: 'delete', path: b!.path, baseSha256: b!.sha256 })
      continue
    }
    if (c.op !== 'add' && c.op !== 'modify') reject('op')
    if (!isSha256(c.sha256) || !Number.isSafeInteger(c.size) || c.size! < 0 || typeof c.exec !== 'boolean') reject('entry')
    // 한 파일 한도를 넘는 변경은 받지 않는다 (B컴이 이미 건너뛰었어야 한다)
    if (c.size! > SYNC_LIMITS.fileMax) reject('file_too_large')
    if (c.op === 'add' && b) reject('add_existing')
    if (c.op === 'modify' && !b) reject('modify_unknown')
    bytes += c.size!
    changes.push(c.op === 'add' ? { op: 'add', path: c.path, size: c.size, sha256: c.sha256, exec: c.exec } : { op: 'modify', path: b!.path, size: c.size, sha256: c.sha256, baseSha256: b!.sha256, exec: c.exec })
  }
  if (bytes > SYNC_LIMITS.changesBytes) reject('too_large')
  // 새 파일이 다른 파일의 폴더 자리를 쓰거나 그 반대면 반영할 수 없다
  const files = new Set([...base.keys(), ...changes.filter((c) => c.op === 'add').map((c) => pathKey(c.path))])
  for (const c of changes) {
    const parts = pathKey(c.path).split('/')
    for (let i = 1; i < parts.length; i++) if (c.op === 'add' && files.has(parts.slice(0, i).join('/'))) reject('file_as_dir')
  }
  const skipped: Skipped[] = (cs.skipped ?? []).slice(0, SYNC_LIMITS.changesFiles).filter((s) => s && typeof s.path === 'string' && SKIP_REASONS.includes(s.reason)).map((s) => ({ path: s.path.slice(0, SYNC_LIMITS.pathMax), reason: s.reason }))
  return { changes, skipped, jobId: cs.jobId, bytes }
}

/** 동시 n개로 돌린다 */
export async function eachLimit<T>(items: readonly T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0
  const run = async () => {
    while (i < items.length) await fn(items[i++])
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run))
}

/** A컴: 변경 목록을 받고 검증한 뒤 내용을 스테이징 저장소로 받는다 (프로젝트 폴더는 건드리지 않음) */
export async function receiveChangeSet(http: SyncHttp, changesetId: string, ws: WorkspaceRecord, staging: BlobStore, now: number): Promise<ChangesetRecord> {
  if (!isSyncId(changesetId)) throw new SyncError('changes_rejected', 'id')
  const r = await http.call('GET', SYNC_PATHS.changeset(changesetId)).catch(() => null)
  if (!r) throw new SyncError('transfer_failed')
  if (r.status === 404) throw new SyncError('changeset_not_found')
  if (r.status !== 200) throw new SyncError('transfer_failed', String(r.status))
  const v = validateChangeSet(r.body.changeset, ws, changesetId)
  const wanted = new Map<string, number>()
  for (const c of v.changes) if (c.op !== 'delete') wanted.set(c.sha256!, c.size!)
  await eachLimit([...wanted], SYNC_LIMITS.concurrency, async ([sha, size]) => {
    if (await staging.has(sha)) return
    const got = await http.getBytes(SYNC_PATHS.blob(sha), size).catch(() => null)
    if (!got || got.status !== 200 || !got.data) throw new SyncError('transfer_failed', 'blob')
    // 해시가 다르면 묶음 전체를 받지 않는다 (put이 다시 계산해 거절)
    await staging.put(sha, got.data, size)
  })
  return { id: changesetId, side: 'a', workspaceId: ws.id, jobId: v.jobId, baseRev: ws.manifest.rev, changes: v.changes, skipped: v.skipped, bytes: v.bytes, state: 'pending', createdAt: now }
}
