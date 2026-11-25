// 도우미(서브에이전트) — 직원이 일을 나눠 맡기는 하위 AI. 엔진 이벤트로 목록을 고치고(main), 화면은 여기 규칙대로 보여 준다.
// 화면 이름은 '도우미' ('서브에이전트'·'분신'은 쓰지 않는다 — 분신은 외부 직원 포크 기능)
import type { HelperRun, Staff } from './types'

/** 이 수 이상 동시에 돌 때만 표시한다 — 1명은 혼자 일할 때와 구분이 안 된다 */
export const HELPER_SHOW_MIN = 2

/** 도우미가 쓰면 안 되는 도구: 사무실 도구(위임·보고·결재)와 또 다른 도우미 띄우기 */
const NESTED_AGENT_TOOLS = new Set(['Agent', 'Task'])
export const isHelperBarredTool = (toolName: string, officePrefix: string) => toolName.startsWith(officePrefix) || NESTED_AGENT_TOOLS.has(toolName)

/** 도우미 쓰기가 켜진 Claude 직원인가 (GPT 엔진에는 도우미가 없다) */
export const isHelpersOn = (s: Pick<Staff, 'provider' | 'equipment'>) => s.provider === 'claude' && s.equipment.helpers === true

/** 엔진 작업 시작 이벤트 중 도우미만 — 셸 백그라운드·워크플로·안 보이는 관리 작업은 뺀다 */
export const isHelperTask = (e: { task_type?: string; subagent_type?: string; ambient?: boolean; skip_transcript?: boolean }) =>
  !e.ambient && !e.skip_transcript && (e.task_type === 'local_agent' || (e.task_type === undefined && e.subagent_type !== undefined))

export function helperStarted(list: HelperRun[], run: { id: string; title: string; at: number }): HelperRun[] {
  if (list.some((h) => h.id === run.id)) return list
  return [...list, { id: run.id, title: run.title.trim() || '…', startedAt: run.at }]
}

/** 모르는 id(셸 작업 등)면 같은 배열을 돌려준다 — 바뀌었는지 ===로 본다 */
export function helperEnded(list: HelperRun[], id: string, at: number): HelperRun[] {
  if (!list.some((h) => h.id === id && h.endedAt === undefined)) return list
  return list.map((h) => (h.id === id ? { ...h, endedAt: at } : h))
}

/** 턴이 끝나면 끝난 도우미는 지운다 (아직 도는 백그라운드 도우미는 남긴다) */
export function pruneEnded(list: HelperRun[]): HelperRun[] {
  return list.some((h) => h.endedAt !== undefined) ? list.filter((h) => h.endedAt === undefined) : list
}

/** 사무실 말풍선·카드·목록 칩의 숫자 — 지금 도는 도우미 수, 표시하지 않으면 0 */
export function helperBadgeCount(s: Pick<Staff, 'provider' | 'equipment' | 'helpers'>): number {
  if (!isHelpersOn(s)) return 0
  const n = (s.helpers ?? []).filter((h) => h.endedAt === undefined).length
  return n >= HELPER_SHOW_MIN ? n : 0
}

/** 머리말 한 줄: 도는 중 N명(2명 이상) 또는 모두 끝남(이번 턴에 2명 이상 썼을 때). 표시하지 않으면 null */
export function helperHeadline(s: Pick<Staff, 'provider' | 'equipment' | 'helpers'>): { kind: 'running' | 'allDone'; n: number; list: HelperRun[] } | null {
  if (!isHelpersOn(s)) return null
  const list = s.helpers ?? []
  const running = list.filter((h) => h.endedAt === undefined).length
  if (running >= HELPER_SHOW_MIN) return { kind: 'running', n: running, list }
  if (running === 0 && list.length >= HELPER_SHOW_MIN) return { kind: 'allDone', n: list.length, list }
  return null
}

/** 경과 시간 m:ss (한 시간이 넘으면 h:mm:ss) */
export function helperElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const ss = String(sec % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
