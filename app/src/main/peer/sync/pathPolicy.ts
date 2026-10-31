// 금지 경로와 방어 (설계서 7-6) — A컴·B컴이 같은 함수를 쓴다. electron을 import하지 않는다
// 경로 하나라도 걸리면 부르는 쪽이 변경 묶음 전체를 거절한다

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SYNC_LIMITS } from '../../../shared/peerSync.ts'

export type PathProblem = 'not_string' | 'too_long' | 'absolute' | 'backslash' | 'control' | 'empty_part' | 'dot_part' | 'part_too_long' | 'git' | 'not_nfc' | 'duplicate'

/** 화면에 보이지 않아 이름을 속이는 데 쓰이는 문자 (ZWJ·ZWNJ·BOM·가변 선택자 등) — 비교키에서 뺀다 */
const IGNORABLE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0000}-\u{E0FFF}]/gu
const CONTROL = /[\u0000-\u001F\u007F]/

/** 맥 파일시스템에서 같은 파일이 되는 이름들을 하나로 모은 비교키: NFC·무시 문자 제거·끝 점·공백 제거·소문자 */
export function partKey(part: string): string {
  return part.normalize('NFD').replace(IGNORABLE, '').normalize('NFC').replace(/[. ]+$/u, '').toLowerCase()
}

export const pathKey = (p: string) => p.split('/').map(partKey).join('/')

/** 경로 하나 검사. 통과하면 null */
export function checkPath(p: unknown): PathProblem | null {
  if (typeof p !== 'string' || !p) return 'not_string'
  if (p.length > SYNC_LIMITS.pathMax) return 'too_long'
  if (CONTROL.test(p)) return 'control'
  if (p.includes('\\')) return 'backslash'
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return 'absolute'
  if (p.normalize('NFC') !== p) return 'not_nfc'
  for (const part of p.split('/')) {
    if (!part) return 'empty_part'
    if (part.length > SYNC_LIMITS.componentMax) return 'part_too_long'
    const key = partKey(part)
    // "..", ". ", "..‍" 처럼 정리하면 점만 남는 이름 — 맥이 실제로 다르게 다루더라도 받지 않는다
    if (key === '' || /^\.+$/.test(part) || /^\.*$/.test(key)) return 'dot_part'
    if (key === '.git') return 'git'
  }
  return null
}

/** 경로 목록 검사 — 정규화 비교키가 겹치면(대소문자·NFD) 거절 */
export function checkPaths(paths: readonly unknown[]): { path: string; problem: PathProblem } | null {
  const seen = new Set<string>()
  for (const p of paths) {
    const problem = checkPath(p)
    if (problem) return { path: String(p).slice(0, 200), problem }
    const key = pathKey(p as string)
    if (seen.has(key)) return { path: p as string, problem: 'duplicate' }
    seen.add(key)
  }
  return null
}

/** 반영 전에 따로 체크해야 하는 경로 (설계서 7-6 ⑥) — 거절은 아니다 */
const SENSITIVE_DIRS = new Set(['.claude', '.github', '.husky', '.vscode', '.circleci', '.gitlab'])
const SENSITIVE_NAMES = new Set([
  '.envrc', 'makefile', 'package.json', 'pyproject.toml', 'dockerfile', '.gitmodules', '.gitattributes', '.gitignore',
  '.bashrc', '.bash_profile', '.profile', '.zshrc', '.zprofile', '.zshenv', '.zlogin', '.npmrc', '.yarnrc', '.yarnrc.yml', 'claude.md', 'agents.md',
])
export function isSensitive(p: string): boolean {
  const parts = pathKey(p).split('/')
  const name = parts[parts.length - 1]
  if (parts.slice(0, -1).some((d) => SENSITIVE_DIRS.has(d))) return true
  return SENSITIVE_NAMES.has(name) || name.startsWith('.env') || name.endsWith('.sh') || name.startsWith('dockerfile')
}

/** root 안의 실제 경로. 정규화 뒤에도 root/ 밖이면 null */
export function resolveInside(root: string, rel: string): string | null {
  if (checkPath(rel)) return null
  const abs = path.resolve(root, ...rel.split('/'))
  return abs.startsWith(root.endsWith(path.sep) ? root : root + path.sep) ? abs : null
}

const isMissing = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT' || (e as NodeJS.ErrnoException)?.code === 'ENOTDIR'

/**
 * 대상의 부모 폴더를 root부터 한 구성요소씩 lstat — 링크·폴더가 아닌 것이 하나라도 있으면 false (설계서 7-6 ③-②)
 * 아직 없는 폴더에서 멈춘다 (그 아래는 새로 만든다)
 */
export async function parentsSafe(root: string, rel: string): Promise<boolean> {
  const parts = rel.split('/').slice(0, -1)
  let cur = root
  for (const part of parts) {
    cur = path.join(cur, part)
    try {
      const st = await fs.lstat(cur)
      if (st.isSymbolicLink() || !st.isDirectory()) return false
    } catch (e) {
      if (isMissing(e)) return true
      throw e
    }
  }
  return true
}

/** 복사본 루트가 될 수 없는 곳 */
const SYSTEM_ROOTS = ['/', '/System', '/Library', '/Applications', '/usr', '/bin', '/sbin', '/etc', '/var', '/private', '/opt', '/Volumes', '/cores', '/dev', '/tmp']

const isUnder = (child: string, parent: string) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep)

async function real(p: string): Promise<string | null> {
  try {
    return await fs.realpath(p)
  } catch {
    return null
  }
}

/**
 * 루트 보호 (설계서 7-6 ④): 대표가 등록한 랩 폴더만. 링크면 realpath로 풀어 등록된 폴더인지 본다
 * 홈·`/`·시스템 폴더·userData(와 그 위)는 안 된다. 통과하면 실제 경로, 아니면 null
 */
export async function rootAllowed(root: string, opts: { registered: readonly string[]; forbidden?: readonly string[]; home?: string }): Promise<string | null> {
  if (!root || !path.isAbsolute(root)) return null
  const r = await real(root)
  if (!r) return null
  const st = await fs.stat(r).catch(() => null)
  if (!st?.isDirectory()) return null
  const home = (await real(opts.home ?? os.homedir())) ?? opts.home ?? os.homedir()
  if (r === home || isUnder(home, r)) return null
  if (SYSTEM_ROOTS.some((s) => r === s)) return null
  for (const f of opts.forbidden ?? []) {
    const rf = (await real(f)) ?? f
    // userData 안이거나, 루트가 userData를 품으면 안 된다
    if (isUnder(r, rf) || isUnder(rf, r)) return null
  }
  for (const reg of opts.registered) {
    if (reg && (await real(reg)) === r) return r
  }
  return null
}
