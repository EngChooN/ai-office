import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findCodexRollout } from './ai/codexSession.ts'
import { findSessionFile } from './sessionRotate.ts'
import type { AiProvider } from '../shared/types.ts'

// 빠른 대화 삭제 때 AI 쪽 세션 기록 파일도 함께 지운다 (대표 결정: 삭제하면 항상 같이)
// Claude: ~/.claude/projects/<폴더>/<세션>.jsonl · Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-…-<id>.jsonl
// 찾은 파일이 이 두 폴더 밖이면 지우지 않는다. electron 없이 돈다 (테스트는 home을 임시 폴더로)

/** 세션 기록 폴더 (엔진별) */
export const sessionRoot = (provider: AiProvider, home = os.homedir()) => (provider === 'codex' ? path.join(home, '.codex', 'sessions') : path.join(home, '.claude', 'projects'))

/** 세션 기록 파일 경로 (엔진별 폴더 안에서만, 없거나 이상한 id면 null) */
function sessionFileOf(provider: AiProvider, sessionId: string, home: string): string | null {
  if (!sessionId || /[\\/]|\.\./.test(sessionId)) return null
  const root = sessionRoot(provider, home)
  const file = provider === 'codex' ? findCodexRollout(root, sessionId) : findSessionFile(root, sessionId)
  if (!file) return null
  return isInside(root, file) ? file : null
}

/** 연결(심볼릭 링크)을 풀어 실제 위치가 root 안인지 본다 — 하위 폴더가 바깥을 가리키면 지우지 않는다 */
function isInside(root: string, target: string): boolean {
  try {
    const rel = path.relative(fs.realpathSync(root), fs.realpathSync(target))
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
  } catch {
    return false
  }
}

/** 세션 기록 파일 크기(바이트) — 관리 창의 대략 용량. 없으면 0 */
export function sessionFileSize(provider: AiProvider, sessionId: string | null | undefined, home = os.homedir()): number {
  const file = sessionId ? sessionFileOf(provider, sessionId, home) : null
  if (!file) return 0
  try {
    return fs.statSync(file).size
  } catch {
    return 0
  }
}

const isMissing = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT' || (e as NodeJS.ErrnoException)?.code === 'ENOTDIR'

/** Claude 세션 옆 같은 이름 폴더(도우미·도구 결과) — 기록 파일이 이미 지워졌어도 찾는다. 실제 위치가 기록 폴더 안일 때만.
 *  없으면 null, 권한 등으로 못 살폈으면 'error' (없는 것으로 치면 기록이 남은 채 삭제가 끝난다) */
function claudeSideDirOf(sessionId: string, home: string): string | null | 'error' {
  if (!sessionId || /[\\/]|\.\./.test(sessionId)) return null
  const root = sessionRoot('claude', home)
  let dirs: string[]
  try {
    dirs = fs.readdirSync(root)
  } catch (e) {
    return isMissing(e) ? null : 'error'
  }
  for (const dir of dirs) {
    const side = path.join(root, dir, sessionId)
    try {
      if (fs.lstatSync(side).isDirectory() && isInside(root, side)) return side
    } catch (e) {
      if (!isMissing(e)) return 'error'
    }
  }
  return null
}

/** 세션 기록을 지운다 — 지웠으면 'deleted', 남은 게 없으면 'missing', 남았는데 못 지웠으면 'failed' (오류를 던지지 않는다)
 *  Claude는 옆 폴더까지 지워야 끝난 것으로 본다 — 실패 뒤 다시 지우면 남은 옆 폴더를 이어서 지운다 */
export function deleteSessionFile(provider: AiProvider, sessionId: string, home = os.homedir()): 'deleted' | 'missing' | 'failed' {
  let isDeleted = false
  const file = sessionFileOf(provider, sessionId, home)
  if (file) {
    try {
      fs.unlinkSync(file)
      isDeleted = true
    } catch {
      if (fs.existsSync(file)) return 'failed'
    }
  }
  const side = provider === 'codex' ? null : claudeSideDirOf(sessionId, home)
  if (side === 'error') return 'failed'
  if (side) {
    try {
      fs.rmSync(side, { recursive: true, force: true })
      isDeleted = true
    } catch {
      return 'failed'
    }
    if (fs.existsSync(side)) return 'failed'
  }
  return isDeleted ? 'deleted' : 'missing'
}
