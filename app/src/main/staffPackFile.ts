import fs from 'node:fs'
import { PACK_MAX_BYTES, type PackReason } from '../shared/staffPack.ts'

// 직원 파일 읽기·쓰기 (Electron 없이 쓰도록 분리). 크기는 읽기 전에 먼저 본다

export function readPackFile(file: string): { ok: true; text: string } | { ok: false; reason: PackReason } {
  let size: number
  try {
    const st = fs.statSync(file)
    if (!st.isFile()) return { ok: false, reason: { key: 'pack.err.read' } }
    size = st.size
  } catch {
    return { ok: false, reason: { key: 'pack.err.read' } }
  }
  if (size > PACK_MAX_BYTES) return { ok: false, reason: { key: 'pack.err.size' } }
  try {
    return { ok: true, text: fs.readFileSync(file, 'utf8') }
  } catch {
    return { ok: false, reason: { key: 'pack.err.read' } }
  }
}

/** 실패하면 이유를, 성공하면 null을 돌려준다 */
export function writePackFile(file: string, text: string): PackReason | null {
  try {
    fs.writeFileSync(file, text, 'utf8')
    return null
  } catch {
    return { key: 'pack.err.write' }
  }
}
