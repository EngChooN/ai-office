// 화면 보기 연결의 판단만 하는 순수 함수 — 저쪽 PC의 hello·실패 응답·스냅샷을 statusOf 입력으로 바꾸고, 내려받을 파일 이름을 정한다 (scripts/workspace.test.mts)
// 설계: docs/design-refresh/connect-workspace/links-design-decision.md

import fs from 'node:fs'
import path from 'node:path'
import type { WorkspaceHello } from '../../shared/workspace.ts'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * /v2/call hello 결과 → WorkspaceHello. 모양이 틀리면 null.
 * 허락 상태(permissions)가 없는 PC는 화면 보기를 모르는 옛 PC(canView false → peerOutdated).
 * 서버의 'none'은 "허락 없음" — 요청 전과 거절을 서버가 나누지 않으므로 그대로 'none'으로 넘기고, 요청한 적이 있으면 링크가 거절로 바꾼다
 */
export function helloFromResult(result: unknown): WorkspaceHello | null {
  if (!isObject(result) || typeof result.protocol !== 'number') return null
  const permissions = isObject(result.permissions) ? result.permissions : null
  const view = permissions?.view
  if (!permissions || permissions.key !== 'peer' || (view !== 'granted' && view !== 'pending' && view !== 'none')) return { protocol: result.protocol, canView: false, grant: 'denied' }
  return { protocol: result.protocol, canView: true, grant: view }
}

/** hello를 모르는 옛 PC (404 unknown_method) */
export const OLD_PEER_HELLO: WorkspaceHello = { protocol: 0, canView: false, grant: 'denied' }

/** hello 실패가 "그 PC가 낡음"인지 — hello를 모르거나(unknown_method) PC 열쇠에 hello를 열어 주지 않던 때(scope_denied) */
export const isOldPeerReply = (body: unknown) => isObject(body) && (body.error === 'unknown_method' || body.error === 'scope_denied')

/**
 * 저쪽 PC가 답한 실패 → statusOf의 error. null이면 사유 없는 일시 실패(네트워크 쪽)로 다시 시도한다.
 * 426은 이 PC가 낡은 것 — 다시 짝지을 일이 아니다
 */
export function failureOf(status: number, body: unknown): string | null {
  const code = isObject(body) && typeof body.error === 'string' ? body.error : ''
  if (status === 426 || code === 'protocol_unsupported') return 'protocol_unsupported'
  if (status === 401 || code === 'unauthorized' || code === 'token_revoked') return 'unauthorized'
  if (status === 403) return 'forbidden'
  return null
}

/** 저쪽 PC 스냅샷의 결재 대기 수 (직원별 결재 합). 모양이 달라도 0 — 화면을 깨지 않는다 */
export function pendingFromSnapshot(snap: unknown): number {
  if (!isObject(snap) || !Array.isArray(snap.staff)) return 0
  return snap.staff.reduce((n: number, s: unknown) => n + (isObject(s) && Array.isArray(s.approvals) ? s.approvals.length : 0), 0)
}

/** 같은 이름이 있으면 '이름 (2).확장자'로 — 다운로드 폴더의 파일을 덮어쓰지 않는다 */
export function freeFileName(dir: string, name: string, exists: (p: string) => boolean = fs.existsSync) {
  const safe = path.basename(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'file'
  const ext = path.extname(safe)
  const stem = safe.slice(0, safe.length - ext.length)
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? safe : `${stem} (${i})${ext}`
    if (!exists(path.join(dir, candidate))) return candidate
  }
}
