import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { ChangeFile, WorkChanges } from '../shared/types'
import { toolEnv, WHICH } from './platform.ts'

// 작업 결과 검토: 직원 작업 폴더의 git 변경을 보여 주고, 사용자가 결재하면 커밋·푸시·PR까지 한다

const run = promisify(execFile)
const DIFF_MAX = 200_000
const GIT_TIMEOUT_MS = 20_000
const env = toolEnv()

async function git(cwd: string, ...args: string[]) {
  const { stdout } = await run('git', args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024, env })
  return stdout
}

// ── 작업 전 스냅샷과 되돌리기 ────────────────────────────
// 작업 폴더 전체(새 파일 포함, .gitignore 제외)를 임시 인덱스로 git 트리 객체 하나에 담는다.
// 브랜치·스테이징·작업 폴더는 건드리지 않는다. 되돌릴 때는 이 트리와 지금 트리의 차이 중 허용된 파일만 되돌린다.

/** git 저장소 맨 위 폴더 (트리 안 경로의 기준) */
export async function repoRoot(cwd: string): Promise<string | null> {
  try {
    return (await git(cwd, 'rev-parse', '--show-toplevel')).trim() || null
  } catch {
    return null
  }
}

/** 지금 작업 폴더 상태를 트리 해시로 남긴다. git 폴더가 아니면 null */
export async function snapshotTree(cwd: string): Promise<string | null> {
  const tmp = path.join(os.tmpdir(), `claude-office-index-${process.pid}-${Math.random().toString(36).slice(2)}`)
  try {
    const realIndex = path.resolve(cwd, (await git(cwd, 'rev-parse', '--git-path', 'index')).trim())
    // 진짜 인덱스를 복사하면 파일 상태 캐시가 남아 큰 저장소에서도 빠르다
    if (fs.existsSync(realIndex)) fs.copyFileSync(realIndex, tmp)
    const tmpEnv = { ...env, GIT_INDEX_FILE: tmp }
    const opts = { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024, env: tmpEnv }
    if (!fs.existsSync(tmp)) await run('git', ['read-tree', 'HEAD'], opts).catch(() => undefined)
    await run('git', ['add', '-A'], opts)
    const { stdout } = await run('git', ['write-tree'], opts)
    return stdout.trim() || null
  } catch {
    return null
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

/** 저장 시점의 폴더 상태: HEAD·브랜치·작업 트리 해시. 앱을 다시 켠 뒤 기록이 아직 유효한지 가리는 데 쓴다 */
export interface FolderState {
  head: string
  branch: string
  snap: string
}

export async function folderState(cwd: string): Promise<FolderState | null> {
  try {
    const head = (await git(cwd, 'rev-parse', 'HEAD').catch(() => '')).trim()
    const branch = (await git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD').catch(() => '')).trim()
    const snap = await snapshotTree(cwd)
    return snap ? { head, branch, snap } : null
  } catch {
    return null
  }
}

/** 불러온 기록을 그대로 써도 되는가: 폴더가 있고, 기준 트리 객체가 있고, HEAD·브랜치·작업 트리가 저장 때와 같아야 한다 */
export async function workBaseStillValid(base: { cwd: string; root: string; tree: string; state?: FolderState }): Promise<boolean> {
  try {
    if (!base.state || !fs.existsSync(base.cwd) || !fs.existsSync(base.root)) return false
    await git(base.root, 'cat-file', '-e', `${base.tree}^{tree}`)
    const now = await folderState(base.cwd)
    return !!now && now.head === base.state.head && now.branch === base.state.branch && now.snap === base.state.snap
  } catch {
    return false
  }
}

/** 두 트리 사이에서 바뀐 파일 (이름 바꾸기는 삭제 + 추가로 본다) */
export async function treeDiff(cwd: string, from: string, to: string): Promise<ChangeFile[]> {
  const [names, nums] = await Promise.all([git(cwd, 'diff-tree', '-r', '--no-renames', '--name-status', '-z', from, to), git(cwd, 'diff-tree', '-r', '--no-renames', '--numstat', '-z', from, to)])
  const counts = new Map<string, [number, number]>()
  const numParts = nums.split('\0').filter(Boolean)
  for (const part of numParts) {
    const [a, d, ...rest] = part.split('\t')
    if (rest.length) counts.set(rest.join('\t'), [Number(a) || 0, Number(d) || 0])
  }
  const files: ChangeFile[] = []
  const nameParts = names.split('\0').filter(Boolean)
  for (let i = 0; i + 1 < nameParts.length; i += 2) {
    const status = nameParts[i]
    const [additions, deletions] = counts.get(nameParts[i + 1]) ?? [0, 0]
    files.push({ path: nameParts[i + 1], status: status === 'A' ? 'A' : status === 'D' ? 'D' : 'M', additions, deletions })
  }
  return files
}

/** 기준 트리 모습으로 파일을 되돌린다. 기준에 없던 파일은 지운다. 작업 폴더 밖 경로는 건드리지 않는다 */
export async function restoreFiles(cwd: string, base: string, files: string[]) {
  const root = path.resolve(cwd)
  let restored = 0
  const failed: string[] = []
  for (const rel of files) {
    const abs = path.resolve(root, rel)
    if (!abs.startsWith(root + path.sep)) {
      failed.push(rel)
      continue
    }
    try {
      const inBase = await git(cwd, 'cat-file', '-e', `${base}:${rel}`).then(() => true, () => false)
      if (inBase) await git(cwd, '--literal-pathspecs', 'restore', `--source=${base}`, '--worktree', '--', rel)
      else fs.rmSync(abs, { force: true })
      restored++
    } catch {
      failed.push(rel)
    }
  }
  return { restored, failed }
}

async function hasCommand(cmd: string) {
  try {
    await run(WHICH, [cmd], { env })
    return true
  } catch {
    return false
  }
}

export async function workChanges(cwd: string): Promise<WorkChanges> {
  const empty: WorkChanges = { cwd, isGit: false, branch: '', files: [], diff: '', hasGh: false, ahead: 0 }
  try {
    await git(cwd, 'rev-parse', '--is-inside-work-tree')
  } catch {
    return empty
  }
  const [branch, status, numstat, diff, hasGh] = await Promise.all([
    git(cwd, 'branch', '--show-current').then((s) => s.trim()),
    git(cwd, 'status', '--porcelain'),
    git(cwd, 'diff', 'HEAD', '--numstat').catch(() => ''),
    git(cwd, 'diff', 'HEAD').catch(() => git(cwd, 'diff')),
    hasCommand('gh'),
  ])
  const counts = new Map<string, [number, number]>()
  for (const line of numstat.split('\n').filter(Boolean)) {
    const [a, d, file] = line.split('\t')
    counts.set(file, [Number(a) || 0, Number(d) || 0])
  }
  const files: ChangeFile[] = status
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const path = line.slice(3).replace(/^"|"$/g, '')
      const [additions, deletions] = counts.get(path) ?? [0, 0]
      return { path, status: line.slice(0, 2).trim() || '?', additions, deletions }
    })
  let ahead = 0
  try {
    ahead = Number((await git(cwd, 'rev-list', '--count', '@{u}..HEAD')).trim()) || 0
  } catch {
    // 업스트림이 없는 새 브랜치
  }
  return { cwd, isGit: true, branch, files, diff: diff.length > DIFF_MAX ? `${diff.slice(0, DIFF_MAX)}\n… (너무 길어 잘림)` : diff, hasGh, ahead }
}

export async function commitAll(cwd: string, message: string) {
  try {
    await git(cwd, 'add', '-A')
    const out = await git(cwd, 'commit', '-m', message)
    return { ok: true, output: out.trim() }
  } catch (e) {
    return { ok: false, output: errorText(e) }
  }
}

export async function pushAndPr(cwd: string, title: string, body: string) {
  try {
    const push = await git(cwd, 'push', '-u', 'origin', 'HEAD')
    const { stdout } = await run('gh', ['pr', 'create', '--title', title, '--body', body], { cwd, timeout: 60_000, env })
    return { ok: true, output: `${push.trim()}\n${stdout.trim()}`.trim() }
  } catch (e) {
    return { ok: false, output: errorText(e) }
  }
}

function errorText(e: unknown) {
  const err = e as { stderr?: string; stdout?: string; message?: string }
  return (err.stderr || err.stdout || err.message || String(e)).trim()
}
