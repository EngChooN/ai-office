// 충돌 판정표 (설계서 7-5) — 기준은 "복사본을 만든 시점의 A컴 해시"(base)와 "지금 A컴 파일"
// 파일 단위 판정이고 내용 병합은 하지 않는다 (O-8)

import fs from 'node:fs/promises'
import type { Change, ConflictReason, Verdict } from '../../../shared/peerSync'
import { hashFile } from './manifest.ts'
import { parentsSafe, resolveInside } from './pathPolicy.ts'

/** 지금 A컴 파일: 해시 · 없음(null) · 일반 파일이 아님(링크·폴더 또는 부모가 링크) */
export type Current = string | null | 'not_a_file'

export async function currentOf(root: string, rel: string): Promise<Current> {
  const abs = resolveInside(root, rel)
  if (!abs || !(await parentsSafe(root, rel))) return 'not_a_file'
  try {
    const st = await fs.lstat(abs)
    if (!st.isFile()) return 'not_a_file'
    return await hashFile(abs)
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw e
  }
}

export interface Judgment {
  verdict: Verdict
  reason?: ConflictReason
}

/** base: 복사본 목록의 해시 (add면 없음) */
export function judge(c: Pick<Change, 'op' | 'sha256'>, base: string | undefined, cur: Current): Judgment {
  if (cur === 'not_a_file') return { verdict: 'conflict', reason: 'not_a_file' }
  if (c.op === 'add') {
    if (cur === null) return { verdict: 'apply' }
    return cur === c.sha256 ? { verdict: 'same' } : { verdict: 'conflict', reason: 'exists_here' }
  }
  if (c.op === 'modify') {
    if (cur === null) return { verdict: 'conflict', reason: 'deleted_here' }
    if (cur === base) return { verdict: 'apply' }
    return cur === c.sha256 ? { verdict: 'same' } : { verdict: 'conflict', reason: 'changed_here' }
  }
  // delete
  if (cur === null) return { verdict: 'same' }
  return cur === base ? { verdict: 'apply' } : { verdict: 'conflict', reason: 'changed_here' }
}
