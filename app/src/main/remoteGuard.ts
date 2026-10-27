import os from 'node:os'
import path from 'node:path'

// 원격(휴대폰) 호출 중 S 분류(PC 파일·명령에 영향)의 인자 제한 — v2의 허용 필드(V2_FIELDS)가 위험 필드를 뺀 뒤, 빠진 값을 안전한 값으로 채운다

export interface RemoteGuardContext {
  /** 설정의 기본 작업 폴더 (비어 있으면 홈) */
  defaultCwd: string
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function restrictRemoteArgs(method: string, args: unknown[], ctx: RemoteGuardContext): unknown[] {
  const cwd = ctx.defaultCwd || os.homedir()
  const patchAt = (i: number, patch: Record<string, unknown>) => args.map((v, n) => (n === i && isObject(v) ? { ...v, ...patch } : v))
  switch (method) {
    // 새 직원: 작업 폴더는 기본 폴더, 승인은 늘 묻기 (파일 수정 자동 승인은 PC에서만)
    case 'hire':
      return patchAt(0, { cwd, approvalMode: 'ask' })
    // 기존 외부 세션을 직원으로: 승인은 늘 묻기
    case 'recruitExternal':
      return patchAt(1, { approvalMode: 'ask' })
    default:
      return args
  }
}

/** 원격에서 자동결재는 끄기만 */
export const isRemoteAutoAllowed = (plan: { mode: string }) => plan.mode === 'off'

/** "앞으로 항상 승인" 규칙을 원격에서 만들 수 없는 도구 (Bash — 한 번 누른 승인이 모든 명령 허가가 되지 않게) */
export const isRemoteRuleBlocked = (toolName: string) => /^bash$/i.test(toolName.trim())

/** 원격이 새로 만드는 프로젝트 매뉴얼의 폴더: 등록된 랩 폴더이거나, 고치는 매뉴얼이 이미 있는 폴더 */
export function isRemoteManualDirAllowed(dir: string | null | undefined, labDirs: string[], ownDir?: string | null) {
  if (!dir) return false
  const same = (a: string) => path.resolve(a) === path.resolve(dir)
  return labDirs.some(same) || Boolean(ownDir && same(ownDir))
}

/** 원격에서는 프로젝트·랩 폴더 매뉴얼만 만들고 고친다 — 전역(~/.claude/skills) 매뉴얼은 만들기·고치기·프로젝트로 옮기기 모두 PC에서만 */
export const isRemoteManualScopeAllowed = (scope: string, previousScope?: string | null) => scope === 'project' && previousScope !== 'user'
