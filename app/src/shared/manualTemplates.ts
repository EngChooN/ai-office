// 매뉴얼 '예시에서 고르기' 템플릿 — 구조는 여기(코드), 글자는 사전(dict/manualTemplates.ts, 키 manualTpl.<id>.*)
// 템플릿을 고르면 현재 언어로 풀어서 저장 가능한 양식에 복사한다. 저장된 글은 사용자 데이터라 언어를 바꿔도 그대로다.
import { tx } from './i18n/index.ts'
import type { ManualInput, ManualKind, ProcessStep } from './types.ts'

export interface TemplateStepDef {
  needsMyCheck?: boolean
  /** 고쳐야 하면 되돌릴 단계 번호(1부터). 없으면 되돌리지 않음 */
  onRevise?: number
}

export interface TemplateDef {
  id: string
  kind: ManualKind
  /** 프로세스만: 단계 구조 (글자는 manualTpl.<id>.s<N>.title|role|instr) */
  steps?: TemplateStepDef[]
}

export const MANUAL_TEMPLATES: readonly TemplateDef[] = [
  { id: 'meetingNotes', kind: 'personal' },
  { id: 'customerEmail', kind: 'personal' },
  { id: 'dailyReport', kind: 'personal' },
  { id: 'writeReview', kind: 'process', steps: [{}, { onRevise: 1 }] },
  { id: 'planBuildQA', kind: 'process', steps: [{}, {}, { onRevise: 2 }] },
  { id: 'contentPublish', kind: 'process', steps: [{}, { onRevise: 1 }, { needsMyCheck: true, onRevise: 1 }] },
  { id: 'bugFix', kind: 'process', steps: [{}, {}, { onRevise: 2 }, { needsMyCheck: true, onRevise: 2 }] },
]

const DEFAULT_MAX_LOOPS = 2

/** 템플릿에 필요한 사전 키 전부 (시험에서 빠진 키를 찾는 데 쓴다) */
export function templateKeys(d: TemplateDef): string[] {
  const p = `manualTpl.${d.id}`
  return [`${p}.title`, `${p}.desc`, `${p}.body`, ...(d.steps ?? []).flatMap((_, i) => ['title', 'role', 'instr'].map((f) => `${p}.s${i + 1}.${f}`))]
}

/** 단계를 지금 언어로 푼다 */
export function templateSteps(d: TemplateDef): ProcessStep[] {
  const p = `manualTpl.${d.id}`
  return (d.steps ?? []).map((s, i) => ({
    id: `s${i + 1}`,
    title: tx(`${p}.s${i + 1}.title`, ''),
    role: tx(`${p}.s${i + 1}.role`, ''),
    instruction: tx(`${p}.s${i + 1}.instr`, ''),
    needsMyCheck: !!s.needsMyCheck,
    // 첫 단계는 되돌릴 곳이 없다
    onRevise: s.onRevise && s.onRevise <= i ? `s${s.onRevise}` : null,
    maxLoops: DEFAULT_MAX_LOOPS,
  }))
}

/** 템플릿을 지금 언어로 풀어 새 매뉴얼 양식을 만든다 (내부 이름은 저장할 때 자동으로 정한다) */
export function fromTemplate(d: TemplateDef, projectDir: string | null): ManualInput {
  const p = `manualTpl.${d.id}`
  return {
    name: '',
    autoName: true,
    title: tx(`${p}.title`, ''),
    description: tx(`${p}.desc`, ''),
    kind: d.kind,
    scope: projectDir ? 'project' : 'user',
    projectDir,
    body: tx(`${p}.body`, ''),
    steps: templateSteps(d),
  }
}
