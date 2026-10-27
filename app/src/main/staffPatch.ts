import type { ModelChoice } from '../shared/types'

export type StaffPatch = { teamId?: string | null; name?: string; role?: string; model?: ModelChoice; avatar?: number; systemPrompt?: string; cwd?: string }

/** updateStaff가 바꿀 수 있는 필드. 결재 방식·장비는 각자 전용 메서드로만 바꾼다 */
export const STAFF_PATCH_FIELDS = ['teamId', 'name', 'role', 'model', 'avatar', 'systemPrompt', 'cwd'] as const

/** 비서 카드처럼 인자 모양을 다 검사하지 않는 경로에서 다른 필드가 섞여 들어와도 허용 필드만 남긴다 */
export function pickStaffPatch(input: StaffPatch): StaffPatch {
  const patch: Record<string, unknown> = {}
  for (const key of STAFF_PATCH_FIELDS) if ((input as Record<string, unknown>)[key] !== undefined) patch[key] = (input as Record<string, unknown>)[key]
  return patch as StaffPatch
}
