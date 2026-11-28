import { EFFORT_LEVELS, type EffortChoice, type MemoryLength, type ModelChoice } from '../shared/types.ts'

export type StaffPatch = { teamId?: string | null; name?: string; role?: string; model?: ModelChoice; avatar?: number; systemPrompt?: string; cwd?: string; memory?: MemoryLength; effort?: EffortChoice; fast?: boolean }

const MEMORY_LENGTHS: MemoryLength[] = ['short', 'normal', 'long', 'full']

/** updateStaff가 바꿀 수 있는 필드. 결재 방식·장비는 각자 전용 메서드로만 바꾼다 */
export const STAFF_PATCH_FIELDS = ['teamId', 'name', 'role', 'model', 'avatar', 'systemPrompt', 'cwd', 'memory', 'effort', 'fast'] as const

/** 비서 카드처럼 인자 모양을 다 검사하지 않는 경로에서 다른 필드가 섞여 들어와도 허용 필드만 남긴다 */
export function pickStaffPatch(input: StaffPatch): StaffPatch {
  const patch: Record<string, unknown> = {}
  for (const key of STAFF_PATCH_FIELDS) if ((input as Record<string, unknown>)[key] !== undefined) patch[key] = (input as Record<string, unknown>)[key]
  if (patch.memory !== undefined && !MEMORY_LENGTHS.includes(patch.memory as MemoryLength)) delete patch.memory
  if (patch.effort !== undefined && patch.effort !== 'default' && !(EFFORT_LEVELS as readonly unknown[]).includes(patch.effort)) delete patch.effort
  if (patch.fast !== undefined && typeof patch.fast !== 'boolean') delete patch.fast
  return patch as StaffPatch
}
