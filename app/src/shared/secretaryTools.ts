// 비서가 쓰는 OfficeApi 분류 (docs/specs/secretary.md 2절): 조회는 바로 · 변경은 확인 카드 · 제외는 도구에 없음
// Record<OfficeMethod, …>라서 OfficeApi에 메서드가 생기면 여기에 분류를 넣어야 tsc가 통과한다 (scripts/secretary.test.mts가 개수도 확인)

import type { OfficeMethod } from './officeApiShape'

export type SecretaryToolKind = 'read' | 'change' | 'exclude'
export type SecretaryRisk = 'normal' | 'caution' | 'danger'

interface ToolSpec {
  kind: SecretaryToolKind
  /** 확인 카드 단계 이름 (쉬운 말 동사) — 변경만 */
  label?: string
  risk?: SecretaryRisk
}

const read: ToolSpec = { kind: 'read' }
const exclude: ToolSpec = { kind: 'exclude' }
const change = (label: string, risk: SecretaryRisk = 'normal'): ToolSpec => ({ kind: 'change', label, risk })

export const SECRETARY_TOOLS: Record<OfficeMethod, ToolSpec> = {
  // ── 조회 (20) ──
  snapshot: read,
  getRecord: read,
  chatHistory: read,
  timeline: read,
  dailyReport: read,
  payslip: read,
  listManuals: read,
  autoApproveStatus: read,
  autoApproveLog: read,
  ledger: read,
  missions: read,
  remoteStatus: read,
  claudeStatus: read,
  hooksStatus: read,
  equipmentCatalog: read,
  listAgentTemplates: read,
  workChanges: read,
  missingFiles: read,
  refreshPlanUsage: read,
  draftManual: read,

  // ── 변경: 확인 카드 (41) ──
  hire: change('직원 고용'),
  updateStaff: change('직원 정보 바꾸기'),
  instruct: change('지시 보내기'),
  interrupt: change('하던 일 멈추기', 'caution'),
  setRefDocs: change('참고 문서 정하기'),
  setEquipment: change('장비 바꾸기', 'caution'),
  fire: change('퇴사', 'danger'),
  decide: change('결재'),
  answerQuestion: change('질문에 답하기'),
  reviewPlan: change('기획 확인'),
  resumePlan: change('기획 다시 진행'),
  createTeam: change('팀 만들기'),
  updateTeam: change('팀 바꾸기'),
  deleteTeam: change('팀 없애기', 'danger'),
  createLab: change('랩 만들기'),
  updateLab: change('랩 바꾸기'),
  deleteLab: change('랩 없애기', 'danger'),
  createTask: change('업무 카드 만들기'),
  updateTask: change('업무 카드 바꾸기'),
  assignTask: change('업무 맡기기'),
  deleteTask: change('업무 카드 지우기', 'caution'),
  startTasks: change('업무 한꺼번에 시작'),
  stopTask: change('업무 멈추기', 'caution'),
  startMeeting: change('회의 열기'),
  answerMeetingDecision: change('회의 결정 답하기'),
  endMeeting: change('회의 끝내기'),
  saveSchedule: change('예약 업무 저장'),
  deleteSchedule: change('예약 업무 지우기', 'caution'),
  runScheduleNow: change('예약 업무 지금 실행'),
  sendChat: change('단체방에 말하기'),
  saveManual: change('매뉴얼 저장'),
  deleteManual: change('매뉴얼 지우기', 'danger'),
  trainStaff: change('직원 교육'),
  trainGroups: change('팀·랩 교육'),
  startRun: change('프로세스 시작'),
  reviewRun: change('프로세스 확인'),
  stopRun: change('프로세스 멈추기', 'caution'),
  setAutoApprove: change('자동결재 설정'),
  updateSettings: change('설정 바꾸기'),
  recruitExternal: change('외부 직원 영입'),
  forkExternal: change('외부 직원 대화 이어받기'),

  // ── 제외 (23) — PC 화면이 필요하거나 연결·보안, 되돌릴 수 없는 외부 전송, 사용자가 즐기는 부분 ──
  pickFolder: exclude,
  pickFiles: exclude,
  openAttachment: exclude,
  saveAttachments: exclude,
  openClaudeLogin: exclude,
  resumeInTerminal: exclude,
  remoteQr: exclude,
  regenerateRemoteQr: exclude,
  setRemoteEnabled: exclude,
  setRemoteHost: exclude,
  setHooksInstalled: exclude,
  setAskHookInstalled: exclude,
  commitChanges: exclude,
  pushAndCreatePr: exclude,
  suggestCommitMessage: exclude,
  fireExternal: exclude,
  buyItem: exclude,
  applySurface: exclude,
  placeItem: exclude,
  moveItem: exclude,
  storeItem: exclude,
  placeGridItem: exclude,
  moveGridItem: exclude,
  stowAllGrid: exclude,
  restoreGridItems: exclude,
  setGear: exclude,
  claimMission: exclude,

  // ── 비서 자신 (도구에 넣지 않음) ──
  secretaryAsk: exclude,
  secretaryRun: exclude,
  secretaryCancel: exclude,
  secretaryClear: exclude,
}

export const SECRETARY_SELF_METHODS = ['secretaryAsk', 'secretaryRun', 'secretaryCancel', 'secretaryClear'] as const

export const methodsOfKind = (kind: SecretaryToolKind) => (Object.keys(SECRETARY_TOOLS) as OfficeMethod[]).filter((m) => SECRETARY_TOOLS[m].kind === kind)

export const isReadMethod = (m: string): m is OfficeMethod => Object.hasOwn(SECRETARY_TOOLS, m) && SECRETARY_TOOLS[m as OfficeMethod].kind === 'read'
export const isChangeMethod = (m: string): m is OfficeMethod => Object.hasOwn(SECRETARY_TOOLS, m) && SECRETARY_TOOLS[m as OfficeMethod].kind === 'change'

/** 카드 한 장의 단계 상한 (넘으면 비서가 나눠 제안) */
export const CARD_STEPS_MAX = 8
/** 이 시간이 지나면 [실행]을 막는다 (그사이 상태가 바뀌었을 수 있다) */
export const CARD_TTL_MS = 10 * 60_000

/** 카드 위험도: 단계 중 가장 높은 것 */
export function cardRisk(methods: string[]): SecretaryRisk {
  const order: SecretaryRisk[] = ['normal', 'caution', 'danger']
  return methods.reduce<SecretaryRisk>((acc, m) => {
    const r = isChangeMethod(m) ? (SECRETARY_TOOLS[m].risk ?? 'normal') : 'normal'
    return order.indexOf(r) > order.indexOf(acc) ? r : acc
  }, 'normal')
}

/**
 * 비서가 부를 수 있는 메서드의 인자 모양 (OfficeApi 시그니처를 짧게). 비서 지침과 "인자가 틀렸어요" 답에 그대로 넣어
 * 모델이 위치 인자를 짐작하지 않게 한다. 조회·변경 메서드는 모두 있어야 한다 (scripts/secretary.test.mts)
 */
export const SECRETARY_SIGNATURES: Partial<Record<OfficeMethod, string>> = {
  snapshot: '()',
  getRecord: '(staffId)',
  chatHistory: '()',
  timeline: '(sinceMs: number)',
  dailyReport: '(dateMs: number)',
  payslip: '(month: "YYYY-MM")',
  listManuals: '()',
  autoApproveStatus: '()',
  autoApproveLog: '()',
  ledger: '()',
  missions: '()',
  remoteStatus: '()',
  claudeStatus: '()',
  hooksStatus: '()',
  equipmentCatalog: '(cwd)',
  listAgentTemplates: '(cwd)',
  workChanges: '(staffId)',
  missingFiles: '(paths: string[])',
  refreshPlanUsage: '()',
  draftManual: '(staffId, request, kind: "personal"|"process")',
  hire: '({ name, role, avatar: number, model: "default"|"opus"|"sonnet"|"haiku", cwd, systemPrompt, approvalMode: "ask"|"acceptEdits", teamId: string|null, labIds?: string[] })',
  updateStaff: '(staffId, { teamId?, name?, role?, model?, avatar?, systemPrompt?, cwd? })',
  instruct: '(staffId, text)',
  interrupt: '(staffId, text?)',
  setRefDocs: '({ kind: "staff"|"team"|"lab", id }, docs: string[])',
  setEquipment: '(staffId, { mcpServers: string[], skills: string[]|"all", allowedTools: string[], disallowedTools: string[], monthlyBudgetUsd: number })',
  fire: '(staffId)',
  decide: '(approvalId, allow: boolean)',
  answerQuestion: '(approvalId, answers: { 질문 문장: 답 })',
  reviewPlan: '(taskId, isApproved: boolean, feedback)',
  resumePlan: '(taskId)',
  createTeam: '(name, color: "#rrggbb")',
  updateTeam: '(teamId, { name?, color?, leadId?, floor? })',
  deleteTeam: '(teamId)',
  createLab: '({ name, color: "#rrggbb", goal, cwd: string|null, leadId: string|null, memberIds: string[] })',
  updateLab: '(labId, { name?, color?, goal?, cwd?, leadId?, memberIds? })',
  deleteLab: '(labId)',
  createTask: '({ title, detail, teamId: string|null, labId?: string|null })',
  updateTask: '(taskId, { title?, detail?, status?: "todo"|"doing"|"review"|"done", teamId?, labId?, assigneeId? })',
  assignTask: '(taskId, staffId)',
  deleteTask: '(taskId)',
  startTasks: '(taskIds: string[])',
  stopTask: '(taskId)',
  startMeeting: '({ topic, participantIds: string[], rounds: 1|2|3 })',
  answerMeetingDecision: '(meetingId, decisionId, answer)',
  endMeeting: '(meetingId, mode: "wrapup"|"discard")',
  saveSchedule: '({ id, staffId, label, time: "HH:MM", weekdays: number[] (0=일~6=토), instruction, enabled: boolean })',
  deleteSchedule: '(scheduleId)',
  runScheduleNow: '(scheduleId)',
  sendChat: '(text)',
  saveManual: '({ name, description, kind: "personal"|"process", scope: "user"|"project", projectDir: string|null, body, steps: [] }, previousPath?)',
  deleteManual: '(path)',
  trainStaff: '(manualName, staffIds: string[])',
  trainGroups: '(manualName, labIds: string[], teamIds: string[])',
  startRun: '({ manualName, scope: { kind: "lab"|"team", id }, input, taskId?: string|null })',
  reviewRun: '(runId, approve: boolean, feedback)',
  stopRun: '(runId)',
  setAutoApprove: '({ mode: "off"|"hours"|"daily", hours?: 1|4|8|12, start?: "HH:MM", end?: "HH:MM" })',
  updateSettings: '({ monthlyBudgetUsd?, tokenBudget?: { day, week, month }, theme?, dayNight?, workHours?: { isEnabled, start, end }, isWorkMode? })',
  recruitExternal: '(staffId, { role, model, teamId: string|null, approvalMode: "ask"|"acceptEdits" })',
  forkExternal: '(staffId, text)',
}

/** 비서 지침에 넣는 메서드 표 */
export const signatureGuide = () =>
  (['read', 'change'] as const)
    .map((kind) => `${kind === 'read' ? '조회(read 도구)' : '변경(propose 도구)'}:\n${methodsOfKind(kind).map((m) => `- ${m}${SECRETARY_SIGNATURES[m] ?? '()'}`).join('\n')}`)
    .join('\n')
