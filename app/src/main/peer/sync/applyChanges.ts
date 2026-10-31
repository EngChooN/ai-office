// A컴 반영 — 경로 재검사·충돌 재판정 → 되돌리기 복사 → 파일마다 임시 파일 + rename (설계서 7-5 "반영")
// 충돌 파일은 덮어쓰지 않고 B컴 버전을 peer-conflicts/에 보관한다. 하나라도 실패하면 이미 쓴 것을 되돌린다

import crypto from 'node:crypto'
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { SyncError, type ApplyChoice, type ApplyResult, type Change, type ConflictReason } from '../../../shared/peerSync.ts'
import type { BlobStore } from './blobStore'
import { currentOf, judge } from './conflict.ts'
import { checkPaths, isSensitive, parentsSafe, pathKey, resolveInside } from './pathPolicy.ts'

/** 부모 폴더를 한 구성요소씩 만든다 — 이미 있는 것이 링크·파일이면 거절 */
async function ensureDirs(root: string, rel: string) {
  let cur = root
  for (const part of rel.split('/').slice(0, -1)) {
    cur = path.join(cur, part)
    const st = await fs.lstat(cur).catch((e: NodeJS.ErrnoException) => (e.code === 'ENOENT' ? null : Promise.reject(e)))
    if (!st) await fs.mkdir(cur, { mode: 0o755 })
    else if (st.isSymbolicLink() || !st.isDirectory()) throw new SyncError('apply_failed', `parent:${rel}`)
  }
}

/** 같은 폴더의 임시 파일에 쓰고 rename. 대상이 링크·폴더면 교체하지 않고 거절. 권한은 0644/0755만 */
export async function writeAtomic(root: string, rel: string, data: Buffer, exec: boolean) {
  const abs = resolveInside(root, rel)
  if (!abs) throw new SyncError('apply_failed', `path:${rel}`)
  await ensureDirs(root, rel)
  if (!(await parentsSafe(root, rel))) throw new SyncError('apply_failed', `parent:${rel}`)
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs).slice(0, 100)}.peer-${crypto.randomUUID()}.tmp`)
  const mode = exec ? 0o755 : 0o644
  const fh = await fs.open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode)
  try {
    await fh.writeFile(data)
    // umask와 상관없이 정확히 (setuid·setgid·sticky 없음)
    await fh.chmod(mode)
  } finally {
    await fh.close()
  }
  const st = await fs.lstat(abs).catch(() => null)
  if (st && !st.isFile()) {
    await fs.rm(tmp, { force: true })
    throw new SyncError('apply_failed', `not_a_file:${rel}`)
  }
  await fs.rename(tmp, abs)
}

async function removeFile(root: string, rel: string) {
  const abs = resolveInside(root, rel)
  if (!abs || !(await parentsSafe(root, rel))) throw new SyncError('apply_failed', `path:${rel}`)
  const st = await fs.lstat(abs).catch(() => null)
  if (!st) return
  if (!st.isFile()) throw new SyncError('apply_failed', `not_a_file:${rel}`)
  await fs.unlink(abs)
}

export interface PlanItem {
  change: Change
  verdict: 'apply' | 'same' | 'conflict'
  reason?: ConflictReason
  isSensitive: boolean
}

/** 지금 A컴 상태로 파일마다 판정한다 */
export async function planChanges(root: string, changes: readonly Change[]): Promise<PlanItem[]> {
  const bad = checkPaths(changes.map((c) => c.path))
  if (bad) throw new SyncError('changes_rejected', `path:${bad.problem}`)
  const out: PlanItem[] = []
  for (const c of changes) {
    const j = judge(c, c.baseSha256, await currentOf(root, c.path))
    out.push({ change: c, verdict: j.verdict, ...(j.reason ? { reason: j.reason } : {}), isSensitive: isSensitive(c.path) })
  }
  return out
}

export interface ApplyDirs {
  root: string
  staging: BlobStore
  /** 되돌리기 복사본 폴더 (peer-undo/<id>) */
  undoDir: string
  /** 충돌한 B컴 버전 보관 폴더 (peer-conflicts/<id>) */
  conflictDir: string
}

/** 고른 대로 반영한다. reject는 부르는 쪽이 처리한다 */
export async function applyPlan(plan: readonly PlanItem[], choice: ApplyChoice, d: ApplyDirs): Promise<ApplyResult> {
  const picked = choice.mode === 'files' ? new Set((choice.files ?? []).map(pathKey)) : null
  const sensitiveOk = new Set((choice.sensitiveOk ?? []).map(pathKey))
  const isPicked = (p: PlanItem) => !picked || picked.has(pathKey(p.change.path))
  const conflicts = plan.filter((p) => p.verdict === 'conflict' && isPicked(p)).map((p) => ({ path: p.change.path, reason: p.reason! }))
  const same = plan.filter((p) => p.verdict === 'same' && isPicked(p)).map((p) => p.change.path)
  const held = plan.filter((p) => p.verdict === 'apply' && (!isPicked(p) || (p.isSensitive && !sensitiveOk.has(pathKey(p.change.path))))).map((p) => p.change.path)
  const todo = plan.filter((p) => p.verdict === 'apply' && !held.includes(p.change.path))
  const base: ApplyResult = { status: 'applied', applied: [], same, conflicts, held }

  // 충돌 파일의 B컴 버전은 언제나 보관해 둔다 (대표가 열어 보고 고를 수 있게)
  if (conflicts.length) {
    for (const p of plan) {
      if (p.verdict !== 'conflict' || p.change.op === 'delete' || !isPicked(p)) continue
      const dest = resolveInside(d.conflictDir, p.change.path)
      if (!dest) continue
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, await d.staging.read(p.change.sha256!), { mode: 0o600 })
    }
    base.conflictDir = d.conflictDir
    // 전체·고른 파일 반영인데 충돌이 있으면 아무것도 쓰지 않는다 (반쪽 반영으로 코드가 깨지지 않게)
    if (choice.mode !== 'safe') return { ...base, status: 'blocked' }
  }

  // 되돌리기용으로 지금 내용을 복사
  const undo: { rel: string; data: Buffer | null; exec: boolean }[] = []
  for (const p of todo) {
    const abs = resolveInside(d.root, p.change.path)!
    const st = await fs.lstat(abs).catch(() => null)
    if (st?.isFile()) {
      const data = await fs.readFile(abs)
      const keep = resolveInside(d.undoDir, p.change.path)
      if (keep) {
        await fs.mkdir(path.dirname(keep), { recursive: true })
        await fs.writeFile(keep, data, { mode: 0o600 })
      }
      undo.push({ rel: p.change.path, data, exec: (st.mode & 0o111) !== 0 })
    } else undo.push({ rel: p.change.path, data: null, exec: false })
  }

  const done: number[] = []
  try {
    for (let i = 0; i < todo.length; i++) {
      const c = todo[i].change
      if (c.op === 'delete') await removeFile(d.root, c.path)
      else await writeAtomic(d.root, c.path, await d.staging.read(c.sha256!), !!c.exec)
      done.push(i)
      base.applied.push(c.path)
    }
  } catch (e) {
    for (const i of done.reverse()) {
      const u = undo[i]
      await (u.data ? writeAtomic(d.root, u.rel, u.data, u.exec) : removeFile(d.root, u.rel)).catch(() => {})
    }
    return { ...base, applied: [], status: 'failed', error: e instanceof SyncError ? e.code : 'apply_failed' }
  }
  return { ...base, status: conflicts.length || held.length ? 'partial' : 'applied' }
}
