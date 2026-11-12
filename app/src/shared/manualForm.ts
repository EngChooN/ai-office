// 매뉴얼 편집 양식 판단 (순수 함수) — 저장할 수 없는 이유와 고친 내용이 있는지
import type { TKey } from './i18n/dict/index.ts'
import { isValidManualName } from './manualName.ts'
import type { ManualInput, ProcessStep } from './types.ts'

export type StepField = 'title' | 'role' | 'instruction'
/** 문제가 있는 칸: 'title' | 'name' | 'description' | 'body' | 'steps' | `step.<0부터 번호>.<칸>` */
export type ManualField = 'title' | 'name' | 'description' | 'body' | 'steps' | `step.${number}.${StepField}`

export interface ManualProblem {
  field: ManualField
  key: TKey
  /** 화면 번호(1부터) — 단계 문제에만 */
  vars?: { n: number }
}

const STEP_KEY: Record<StepField, TKey> = { title: 'manuals.problem.stepTitle', role: 'manuals.problem.stepRole', instruction: 'manuals.problem.stepInstruction' }

/** 저장할 수 없는 이유를 화면 순서대로 돌려준다 (비어 있으면 저장 가능). 파일 이름은 비워 두면 저장할 때 자동으로 정하므로 문제 아님 */
export function manualProblems(f: ManualInput): ManualProblem[] {
  const out: ManualProblem[] = []
  if (!f.title?.trim()) out.push({ field: 'title', key: 'manuals.problem.title' })
  if (!f.description.trim()) out.push({ field: 'description', key: 'manuals.problem.description' })
  if (f.kind === 'personal') {
    if (!f.body.trim()) out.push({ field: 'body', key: 'manuals.problem.body' })
  } else {
    if (f.steps.length === 0) out.push({ field: 'steps', key: 'manuals.problem.steps' })
    f.steps.forEach((s, i) => {
      for (const k of ['title', 'role', 'instruction'] as const) if (!s[k].trim()) out.push({ field: `step.${i}.${k}`, key: STEP_KEY[k], vars: { n: i + 1 } })
    })
  }
  if (f.name.trim() && !isValidManualName(f.name)) out.push({ field: 'name', key: 'manuals.problem.fileName' })
  return out
}

/** 처음 연 값과 달라졌는지 (닫을 때 확인용) */
export function isDirty(form: ManualInput, initial: ManualInput): boolean {
  const pick = (f: ManualInput) => JSON.stringify([f.title ?? '', f.name, f.description, f.kind, f.scope, f.projectDir, f.body, f.steps])
  return pick(form) !== pick(initial)
}

/** 템플릿처럼 숨은 설정(내 확인·되돌리기)이 켜진 단계는 처음부터 펼쳐 보여 준다 */
export const stepHasExtras = (s: ProcessStep) => s.needsMyCheck || !!s.onRevise
