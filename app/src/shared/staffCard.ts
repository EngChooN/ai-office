import { ROLE_PRESETS, type Staff } from './types.ts'
import { tk, type I18nArg, type I18nText, type TKey } from './i18n/index.ts'
import { countByStatus, type SummaryKey } from './dashboard.ts'
import { isNetworkError } from './networkError.ts'
import { isAwaitingTeam } from './delegation.ts'

/** 직무 → '한 줄 설명'·'시킬 수 있는 일 예시 3개' 사전 키. 프리셋이 아닌 직무(직접 입력)는 '자유 직무' 것을 쓴다 */
const ROLE_INFO_ID: Record<(typeof ROLE_PRESETS)[number], string> = {
  팀장: 'lead',
  '프론트엔드 개발자': 'frontend',
  '백엔드 개발자': 'backend',
  '코드 리뷰어': 'reviewer',
  QA: 'qa',
  기획자: 'planner',
  리서처: 'researcher',
  디자이너: 'designer',
  '고객 응대(CS)': 'cs',
  마케터: 'marketer',
  '자유 직무': 'free',
}

export function roleInfo(role: string): { descKey: TKey; exampleKeys: [TKey, TKey, TKey]; isPreset: boolean } {
  const id = (ROLE_INFO_ID as Record<string, string>)[role]
  const key = id ?? 'free'
  return {
    descKey: `roleInfo.${key}.desc` as TKey,
    exampleKeys: [`roleInfo.${key}.ex1`, `roleInfo.${key}.ex2`, `roleInfo.${key}.ex3`] as [TKey, TKey, TKey],
    isPreset: Boolean(id) && id !== 'free',
  }
}

// ── 직원 추가 3단계 ────────────────────────────────────

/** 직원 추가 단계: 0 직무 고르기 → 1 이름·얼굴 → 2 일할 곳(+자세히 설정) */
export type HireStep = 0 | 1 | 2
export const HIRE_LAST_STEP: HireStep = 2

/** 그 단계에서 '다음'(마지막은 '일 시작하기')을 누를 수 있는지. 앞 단계 조건도 함께 본다 */
export function hireStepValid(step: HireStep, form: { name: string; role: string }, isProviderReady: boolean): boolean {
  const hasRole = form.role.trim() !== ''
  if (step === 0) return hasRole
  const hasName = form.name.trim() !== ''
  if (step === 1) return hasRole && hasName
  return hasRole && hasName && isProviderReady
}

// ── 직원 목록(A안) 카드 ─────────────────────────────────

type CardStaff = Pick<Staff, 'kind' | 'status' | 'activity' | 'approvals' | 'progress' | 'awaitingTeam'>

const NOW_MAX = 80
const clip = (text: string) => {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > NOW_MAX ? `${one.slice(0, NOW_MAX)}…` : one
}
/** 지시 요약 앞의 "[방 이름]" 꼬리표를 뗀다 (chatRoomHooks.stripHead와 같은 규칙) */
const stripHead = (text: string) => text.replace(/^\[[^\]]+\]\s*/, '')

/** activity 첫 낱말이 이 도구 이름이면 쉬운 말로 바꾼다 (모르는 도구 이름·답변 글은 아래에서) */
const TOOL_WORD: Record<string, string> = {
  Edit: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
  Write: 'write',
  Read: 'read',
  Bash: 'run',
  BashOutput: 'run',
  KillShell: 'run',
  Grep: 'search',
  Glob: 'search',
  LS: 'search',
  WebSearch: 'web',
  WebFetch: 'web',
  Task: 'agent',
  Agent: 'agent',
  TodoWrite: 'plan',
  Skill: 'other',
  ToolSearch: 'other',
  Monitor: 'other',
}

function toolLine(activity: string): I18nText | null {
  const word = activity.trim().split(/\s/, 1)[0] ?? ''
  if (word.startsWith('mcp__')) return tk('staffCard.tool.other')
  const id = TOOL_WORD[word]
  return id ? tk(`staffCard.tool.${id}` as TKey) : null
}

/**
 * 카드의 '지금 하는 일' 한 문장. 도구 이름·오류 원문은 카드에 보이지 않는다(원문은 '자세히'의 패널에서).
 * task: 맡은 보드 업무 제목 (dashboard.currentTask)
 */
export function nowLine(staff: CardStaff, task: { title: string } | null): I18nArg {
  if (staff.status === 'waiting') {
    const a = staff.approvals[0]
    if (a?.questions?.length) return tk('staffCard.now.question', { n: a.questions.length, q: clip(a.questions[0].question) })
    if (a?.effectI18n) return tk('staffCard.now.approvalOf', { what: a.effectI18n })
    return tk('staffCard.now.approval')
  }
  if (staff.status === 'netWait' || (staff.status === 'error' && isNetworkError(staff.activity))) return tk('staffCard.now.netError')
  if (staff.status === 'error') return tk('staffCard.now.error')
  if (staff.status === 'working') {
    const doing = stripHead(staff.progress?.text ?? '').trim()
    if (doing) return clip(doing)
    const tool = toolLine(staff.activity)
    if (tool) return tool
    if (staff.activity.trim()) return clip(staff.activity)
    return task ? tk('staffCard.now.task', { title: clip(task.title) }) : tk('staffCard.now.working')
  }
  if (isAwaitingTeam(staff)) return tk('staffCard.now.awaitingTeam')
  if (task) return tk('staffCard.now.task', { title: clip(task.title) })
  return tk(staff.status === 'offline' ? 'staffCard.now.offline' : 'staffCard.now.none')
}

/** 카드에서 강조할 버튼 하나. 외부·퇴근 직원은 이 화면에서 시킬 수 없어 none ('자세히 ›'만) */
export type CardAction = 'confirm' | 'retry' | 'assign' | 'none'

export function cardAction(staff: Pick<Staff, 'kind' | 'status'>): CardAction {
  if (staff.kind !== 'hired' || staff.status === 'offline') return 'none'
  if (staff.status === 'waiting') return 'confirm'
  if (staff.status === 'error') return 'retry'
  return 'assign'
}

/** 한 문장 요약의 조각 (0명은 뺀다). offline 조각은 필터가 없어 누를 수 없다 */
export type SummaryPartKind = SummaryKey | 'offline'

export function summaryParts(staff: Pick<Staff, 'status' | 'awaitingTeam'>[]): { total: number; parts: { kind: SummaryPartKind; count: number }[] } {
  const counts = countByStatus(staff)
  const offline = staff.filter((s) => s.status === 'offline').length
  const order: [SummaryPartKind, number][] = [
    ['working', counts.working],
    ['waiting', counts.waiting],
    ['error', counts.error],
    ['idle', counts.idle],
    ['offline', offline],
  ]
  return { total: staff.length, parts: order.filter(([, n]) => n > 0).map(([kind, count]) => ({ kind, count })) }
}
