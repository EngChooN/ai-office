import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ChangeFile, WorkChanges } from '../shared/types'
import { toolEnv, WHICH } from './platform'

// 작업 결과 검토: 직원 작업 폴더의 git 변경을 보여 주고, 사용자가 결재하면 커밋·푸시·PR까지 한다

const run = promisify(execFile)
const DIFF_MAX = 200_000
const GIT_TIMEOUT_MS = 20_000
const env = toolEnv()

async function git(cwd: string, ...args: string[]) {
  const { stdout } = await run('git', args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024, env })
  return stdout
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
