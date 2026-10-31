// 폴더 훑기·기본 제외 목록·해시·한도 검사 (설계서 7-1~7-3)
// 링크는 따라가지 않는다(lstat). 일반 파일만 목록에 넣고, 링크·특수 파일·큰 파일·이상한 이름은 skipped로 남긴다

import crypto from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isSha256, isSyncId, SyncError, SYNC_LIMITS, type Manifest, type Skipped, type SyncEntry } from '../../../shared/peerSync.ts'
import { checkPath, checkPaths, partKey, pathKey } from './pathPolicy.ts'

/** 기본 제외 폴더 (어느 깊이든 이 이름이면 통째로) */
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'target', '.venv', '__pycache__', '.ssh', '.aws', '.gnupg'])
const EXCLUDED_FILES = new Set(['.ds_store', '.npmrc', '.netrc', '.pypirc'])

/** 비밀로 보이는 파일 — 대표도 이 제외는 풀 수 없다 (설계서 O-7) */
export function isSecretName(name: string): boolean {
  const n = partKey(name)
  return n.startsWith('.env') || n.endsWith('.pem') || n.endsWith('.key') || n.endsWith('.p12') || n.endsWith('.pfx') || n.startsWith('id_rsa') || n.startsWith('id_ed25519') || n.startsWith('id_ecdsa') || n.startsWith('credentials') || EXCLUDED_FILES.has(n)
}

/**
 * 제외 판정. extra는 대표가 더한 제외(이름 또는 상대 경로) — 더하기만 있고 빼기는 없다
 * `.git`은 이름 비교키로 본다 (`.GIT`·`.git.` 도 제외)
 */
export function isExcluded(rel: string, isDir: boolean, extra: readonly string[] = []): boolean {
  const name = rel.slice(rel.lastIndexOf('/') + 1)
  const key = partKey(name)
  if (key === '.git' || (isDir ? EXCLUDED_DIRS.has(key) : isSecretName(name))) return true
  const relKey = pathKey(rel)
  return extra.some((x) => {
    const k = pathKey(x.replace(/^\/+|\/+$/g, ''))
    return k && (k === key || k === relKey || relKey.startsWith(k + '/'))
  })
}

export async function hashFile(abs: string): Promise<string> {
  const h = crypto.createHash('sha256')
  // 링크를 따라가지 않는다 (훑은 뒤 링크로 바뀌었으면 실패)
  const fh = await fs.open(abs, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    for await (const chunk of createReadStream('', { fd: fh.fd, autoClose: false })) h.update(chunk as Buffer)
  } finally {
    await fh.close()
  }
  return h.digest('hex')
}

export const sha256Of = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex')

export function manifestRev(entries: readonly SyncEntry[]): string {
  const rows = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((e) => [e.path, e.size, e.sha256, e.exec])
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

export interface ScanResult {
  entries: SyncEntry[]
  skipped: Skipped[]
  /** 제외한 항목의 상대 경로 (요약 표시용) */
  excluded: string[]
}

export interface ScanLimits {
  maxFiles: number
  maxBytes: number
  /** 넘으면 던질 오류 코드 */
  code: 'workspace_too_large' | 'changes_too_large'
}

/** 폴더를 훑어 일반 파일의 목록과 해시를 만든다. 한도를 넘으면 SyncError */
export async function scanFolder(root: string, opts: { exclude?: readonly string[]; limits: ScanLimits }): Promise<ScanResult> {
  const entries: SyncEntry[] = []
  const skipped: Skipped[] = []
  const excluded: string[] = []
  const keys = new Set<string>()
  let bytes = 0
  const walk = async (dirAbs: string, dirRel: string) => {
    const items = await fs.readdir(dirAbs, { withFileTypes: true })
    items.sort((a, b) => (a.name < b.name ? -1 : 1))
    for (const it of items) {
      const rel = (dirRel ? `${dirRel}/${it.name}` : it.name).normalize('NFC')
      const abs = path.join(dirAbs, it.name)
      const st = await fs.lstat(abs)
      if (st.isDirectory() && isExcluded(rel, true, opts.exclude)) {
        excluded.push(rel)
        continue
      }
      if (!st.isDirectory() && isExcluded(rel, false, opts.exclude)) {
        excluded.push(rel)
        continue
      }
      if (checkPath(rel) || keys.has(pathKey(rel))) {
        skipped.push({ path: rel, reason: 'bad_name' })
        continue
      }
      if (st.isSymbolicLink()) {
        skipped.push({ path: rel, reason: 'symlink' })
        continue
      }
      if (st.isDirectory()) {
        keys.add(pathKey(rel))
        await walk(abs, rel)
        continue
      }
      if (!st.isFile()) {
        skipped.push({ path: rel, reason: 'special' })
        continue
      }
      if (st.size > SYNC_LIMITS.fileMax) {
        skipped.push({ path: rel, reason: 'too_large' })
        continue
      }
      bytes += st.size
      if (entries.length + 1 > opts.limits.maxFiles || bytes > opts.limits.maxBytes) throw new SyncError(opts.limits.code, `${entries.length + 1} files, ${bytes} bytes`)
      keys.add(pathKey(rel))
      entries.push({ path: rel, size: st.size, sha256: await hashFile(abs), exec: (st.mode & 0o111) !== 0 })
    }
  }
  await walk(root, '')
  return { entries, skipped, excluded }
}

/** "제외: .git, node_modules 외 3개" 같은 한 줄 요약에 쓸 이름들 (겹치는 이름은 하나로) */
export function excludedNames(excluded: readonly string[]): string[] {
  return [...new Set(excluded.map((p) => p.slice(p.lastIndexOf('/') + 1)))]
}

/** B컴이 받은 목록 검사 — 문제가 있으면 이유, 없으면 null */
export function validateManifest(m: unknown): string | null {
  if (!m || typeof m !== 'object') return 'shape'
  const x = m as Manifest
  if (!isSyncId(x.workspaceId) || typeof x.rootName !== 'string' || x.rootName.length > 255 || typeof x.createdAt !== 'number' || !isSha256(x.rev) || !Array.isArray(x.entries)) return 'shape'
  if (x.entries.length > SYNC_LIMITS.workspaceFiles) return 'too_many_files'
  let total = 0
  for (const e of x.entries) {
    if (!e || typeof e !== 'object' || !isSha256(e.sha256) || typeof e.exec !== 'boolean' || !Number.isSafeInteger(e.size) || e.size < 0 || e.size > SYNC_LIMITS.fileMax) return 'entry'
    total += e.size
  }
  if (total > SYNC_LIMITS.workspaceBytes) return 'too_large'
  const bad = checkPaths(x.entries.map((e) => e.path))
  if (bad) return `path:${bad.problem}`
  // 파일 경로가 다른 파일의 폴더 자리이면(a 와 a/b) 만들 수 없다
  const keys = new Set(x.entries.map((e) => pathKey(e.path)))
  for (const e of x.entries) {
    const parts = pathKey(e.path).split('/')
    for (let i = 1; i < parts.length; i++) if (keys.has(parts.slice(0, i).join('/'))) return 'path:file_as_dir'
  }
  if (manifestRev(x.entries) !== x.rev) return 'rev'
  return null
}
