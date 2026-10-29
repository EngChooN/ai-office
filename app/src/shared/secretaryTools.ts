// 비서가 쓰는 OfficeApi 분류 (docs/specs/secretary.md 2절): 조회는 바로 · 변경은 확인 카드 · 제외는 도구에 없음
// Record<OfficeMethod, …>라서 OfficeApi에 메서드가 생기면 여기에 분류를 넣어야 tsc가 통과한다 (scripts/secretary.test.mts가 개수도 확인)

import type { OfficeMethod } from './officeApiShape'
import type { SecretaryCompare } from './types'

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
  // ── 조회 (25) ──
  snapshot: read,
  getRecord: read,
  chatHistory: read,
  timeline: read,
  staffActivity: read,
  dailyReport: read,
  payslip: read,
  listManuals: read,
  autoApproveStatus: read,
  autoApproveLog: read,
  approvalRules: read,
  knowledgeList: read,
  galleryList: read,
  ledger: read,
  missions: read,
  remoteStatus: read,
  claudeStatus: read,
  providerStatus: read,
  hooksStatus: read,
  equipmentCatalog: read,
  listAgentTemplates: read,
  workChanges: read,
  workRevertInfo: read,
  missingFiles: read,
  refreshPlanUsage: read,
  draftManual: read,
  boardCleanupPlan: read,

  // ── 변경: 확인 카드 (61) ──
  hire: change('직원 고용'),
  updateStaff: change('직원 정보 바꾸기'),
  instruct: change('지시 보내기'),
  interrupt: change('하던 일 멈추기', 'caution'),
  setRefDocs: change('참고 문서 정하기'),
  setEquipment: change('장비 바꾸기', 'caution'),
  // 대화가 새로 시작되므로 주의 — 화면과 같은 office.changeEngine (쉬는 중일 때만)
  changeEngine: change('엔진 바꾸기', 'caution'),
  fire: change('퇴사', 'danger'),
  decide: change('결재'),
  answerQuestion: change('질문에 답하기'),
  reviewPlan: change('기획 확인'),
  resumePlan: change('기획 다시 진행'),
  createTeam: change('팀 만들기'),
  updateTeam: change('팀 바꾸기'),
  deleteTeam: change('팀 없애기', 'danger'),
  // 팀이 하나 없어지므로 위험 — 묶음에 넣을 수 없고 한 장의 카드로만
  mergeTeams: change('팀 합치기', 'danger'),
  moveStaff: change('직원 배치 바꾸기'),
  createLab: change('랩 만들기'),
  updateLab: change('랩 바꾸기'),
  deleteLab: change('랩 없애기', 'danger'),
  createTask: change('업무 카드 만들기'),
  updateTask: change('업무 카드 바꾸기'),
  assignTask: change('업무 맡기기'),
  deleteTask: change('업무 카드 지우기', 'caution'),
  mergeTasks: change('중복 카드 합치기', 'caution'),
  startTasks: change('업무 한꺼번에 시작'),
  stopTask: change('업무 멈추기', 'caution'),
  startMeeting: change('회의 열기'),
  answerMeetingDecision: change('회의 결정 답하기'),
  endMeeting: change('회의 끝내기'),
  saveSchedule: change('예약 업무 저장'),
  deleteSchedule: change('예약 업무 지우기', 'caution'),
  runScheduleNow: change('예약 업무 지금 실행'),
  releasePlanHold: change('한도 보류 중인 업무 바로 시작'),
  sendChat: change('단체방에 말하기'),
  saveManual: change('매뉴얼 저장'),
  deleteManual: change('매뉴얼 지우기', 'danger'),
  trainStaff: change('직원 교육'),
  trainGroups: change('팀·랩 교육'),
  startRun: change('프로세스 시작'),
  reviewRun: change('프로세스 확인'),
  stopRun: change('프로세스 멈추기', 'caution'),
  setAutoApprove: change('자동결재 설정'),
  approveAlways: change('결재 승인하고 앞으로 자동 승인', 'caution'),
  deleteApprovalRule: change('자동 승인 규칙 지우기'),
  saveKnowledge: change('지식 창고에 쓰기'),
  deleteKnowledge: change('지식 창고에서 지우기', 'caution'),
  deleteGalleryEntry: change('결과물 갤러리에서 지우기', 'caution'),
  runDemoDayNow: change('데모데이 지금 열기'),
  demoReact: change('데모데이 발표에 반응하기'),
  updateSettings: change('설정 바꾸기'),
  recruitExternal: change('외부 직원 영입'),
  forkExternal: change('외부 직원 대화 이어받기'),
  // 꾸미기 중 가지고 있는 가구 배치만 (비서 기능 확장 5번). 사는 일·바닥·벽·미션 보상·직원 장식은 아래 제외 그대로
  placeItem: change('가구 빈자리에 놓기'),
  moveItem: change('가구 옮기기'),
  storeItem: change('가구 서랍에 넣기'),
  placeGridItem: change('가구 놓기'),
  moveGridItem: change('가구 옮기기'),
  setGridItemOn: change('소품 켜고 끄기'),
  stowAllGrid: change('가구 전부 서랍에 넣기', 'caution'),
  restoreGridItems: change('치운 가구 되돌리기'),

  // ── 제외 (32) — PC 화면이 필요하거나 연결·보안, 되돌릴 수 없는 외부 전송, 사용자가 즐기는 부분 ──
  // 마켓 채용은 사람이 마켓 창에서 고른다 (비서는 hire로 직접 고용한다)
  hireMarket: exclude,
  pickFolder: exclude,
  // 책상 세트 옮기기는 꾸미기 화면 전용 — 비서는 moveGridItem으로 하나씩
  moveSeatSet: exclude,
  // 채팅 자동완성용 (직원 세션을 잠깐 띄운다) — 비서에게는 필요 없다
  loadStaffCommands: exclude,
  // 연결 도구: 확인은 Claude를 잠깐 띄우고, 직접 추가 목록엔 비밀값(env·headers)이 있고, 추가·삭제는 PC에 명령을 심는 일이라 대표가 장비 탭에서만
  refreshEquipment: exclude,
  customMcpList: exclude,
  saveCustomMcp: exclude,
  deleteCustomMcp: exclude,
  pickFiles: exclude,
  openAttachment: exclude,
  saveAttachments: exclude,
  openClaudeLogin: exclude,
  openCodexLogin: exclude,
  resumeInTerminal: exclude,
  remoteQr: exclude,
  regenerateRemoteQr: exclude,
  setRemoteEnabled: exclude,
  setRemoteHost: exclude,
  setRemoteLanOnly: exclude,
  dismissRemoteLanNotice: exclude,
  setRemoteMode: exclude,
  refreshRemoteTailscale: exclude,
  dismissRemoteTsNotice: exclude,
  setHooksInstalled: exclude,
  setAskHookInstalled: exclude,
  commitChanges: exclude,
  revertWork: exclude,
  pushAndCreatePr: exclude,
  suggestCommitMessage: exclude,
  fireExternal: exclude,
  // 회사 돈을 쓰거나 대표가 즐기는 꾸미기 — 요청이 오면 EXCLUDE_HINTS로 이유와 상점 화면을 안내한다
  buyItem: exclude,
  applySurface: exclude,
  setGear: exclude,
  claimMission: exclude,
  // 튜토리얼은 화면 안내를 따라 사용자가 직접 누른다
  tutorialStart: exclude,
  tutorialAct: exclude,
  tutorialCleanup: exclude,

  // ── 비서 자신 (도구에 넣지 않음) ──
  secretaryAsk: exclude,
  secretaryRun: exclude,
  secretaryCancel: exclude,
  secretaryClear: exclude,
}

/**
 * 제외 메서드를 부탁받았을 때 모델에게 돌려줄 이유와 대신 할 곳 (못 할 때 안내 — 비서 기능 확장 6번).
 * 없는 메서드는 "비서가 쓸 수 없는 기능"만 답한다
 */
export const EXCLUDE_HINTS: Partial<Record<OfficeMethod, string>> = {
  buyItem: '회사 돈(사무실 금고)을 쓰는 일이라 대표가 직접 사요. [상점 열기](#view=shop)에서 사 주세요',
  applySurface: '바닥·벽 꾸미기는 대표가 고르는 부분이라 대신 하지 않아요. [상점 열기](#view=shop)에서 직접 바꿔 주세요',
  claimMission: '미션 보상은 대표가 직접 받아요. [상점 열기](#view=shop)의 미션에서 받아 주세요',
  setGear: '직원 책상·의자 장식은 대표가 고르는 부분이라 대신 하지 않아요. [상점 열기](#view=shop)에서 직접 골라 주세요',
}

/** 제외 메서드 거절 문장 (이유 + 대신 할 곳) */
export const excludeMessage = (m: string) => {
  const hint = Object.hasOwn(EXCLUDE_HINTS, m) ? EXCLUDE_HINTS[m as OfficeMethod] : undefined
  return hint ? `"${m}"는 비서가 쓸 수 없는 기능이에요 — ${hint}.` : `"${m}"는 비서가 쓸 수 없는 기능이에요.`
}

export const SECRETARY_SELF_METHODS =['secretaryAsk', 'secretaryRun', 'secretaryCancel', 'secretaryClear'] as const

export const methodsOfKind = (kind: SecretaryToolKind) => (Object.keys(SECRETARY_TOOLS) as OfficeMethod[]).filter((m) => SECRETARY_TOOLS[m].kind === kind)

export const isReadMethod = (m: string): m is OfficeMethod => Object.hasOwn(SECRETARY_TOOLS, m) && SECRETARY_TOOLS[m as OfficeMethod].kind === 'read'
export const isChangeMethod = (m: string): m is OfficeMethod => Object.hasOwn(SECRETARY_TOOLS, m) && SECRETARY_TOOLS[m as OfficeMethod].kind === 'change'

/** 카드 한 장의 단계 상한 (넘으면 비서가 나눠 제안하거나 묶음 단계로) */
export const CARD_STEPS_MAX = 8

/**
 * 묶음 단계: 한 단계 안에 같은 성격의 변경을 여러 개 (보드 정리·가구 전부 치우기처럼 8단계를 넘는 일).
 * OfficeApi 메서드가 아니라 비서 카드만의 형식이다 — 항목은 각각 변경 메서드이고, 앞 단계를 참조하지 않는다
 */
export const BATCH_METHOD = 'batch'
export const BATCH_LABEL = '여러 항목 한 번에'
/** 묶음 한 단계의 항목 상한 */
export const BATCH_ITEMS_MAX = 40

/** 카드 한 장에 붙이는 비교 보기 상한 · 글 비교 한쪽 글자 수 · 그림 한 장 크기(data URL 글자 수 — 폰으로도 가므로 작게) */
export const COMPARE_MAX = 4
export const COMPARE_TEXT_MAX = 20_000
export const COMPARE_IMAGE_MAX = 400_000
const IMAGE_SRC = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/

/** 비교 보기를 카드에 붙일 수 있는 모양으로 거른다 — 그림은 data URL만, 크기를 넘으면 뺀다 */
export function cleanCompares(list: readonly { kind: string; label: string; before: string; after: string }[]): SecretaryCompare[] {
  const out: SecretaryCompare[] = []
  for (const c of list) {
    if (out.length >= COMPARE_MAX) break
    const label = String(c.label ?? '').slice(0, 80)
    if (c.kind === 'text' && typeof c.before === 'string' && typeof c.after === 'string' && c.before !== c.after)
      out.push({ kind: 'text', label, before: c.before.slice(0, COMPARE_TEXT_MAX), after: c.after.slice(0, COMPARE_TEXT_MAX) })
    else if (c.kind === 'image' && [c.before, c.after].every((s) => typeof s === 'string' && s.length <= COMPARE_IMAGE_MAX && IMAGE_SRC.test(s))) out.push({ kind: 'image', label, before: c.before, after: c.after })
  }
  return out
}
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
  staffActivity: '(staffId)',
  dailyReport: '(dateMs: number)',
  payslip: '(month: "YYYY-MM")',
  listManuals: '()',
  autoApproveStatus: '()',
  autoApproveLog: '()',
  approvalRules: '()',
  knowledgeList: '()',
  galleryList: '()',
  ledger: '()',
  missions: '()',
  remoteStatus: '()',
  claudeStatus: '()',
  providerStatus: '()',
  hooksStatus: '()',
  equipmentCatalog: '(cwd)',
  listAgentTemplates: '(cwd)',
  workChanges: '(staffId)',
  workRevertInfo: '(staffId)',
  missingFiles: '(paths: string[])',
  refreshPlanUsage: '()',
  draftManual: '(staffId, request, kind: "personal"|"process")',
  boardCleanupPlan: '() → { steps, omitted } — steps를 그대로 propose 단계로',
  hire: '({ name, role, avatar: number, provider?: "claude"|"codex", model: "default"|"opus"|"sonnet"|"haiku"|(GPT 모델 id), cwd, systemPrompt, approvalMode: "ask"|"acceptEdits", teamId: string|null, labIds?: string[] })',
  updateStaff: '(staffId, { teamId?, name?, role?, model?, avatar?, systemPrompt?, cwd? })',
  instruct: '(staffId, text)',
  interrupt: '(staffId, text?)',
  setRefDocs: '({ kind: "staff"|"team"|"lab", id }, docs: string[])',
  setEquipment: '(staffId, { mcpServers: string[], skills: string[]|"all", allowedTools: string[], disallowedTools: string[], monthlyBudgetUsd: number }) — 전체 객체를 넘긴다: staff_detail의 지금 값에서 바꿀 칸만 고치고 allowedTools·disallowedTools는 그대로',
  changeEngine: '(staffId, provider: "claude"|"codex") — 쉬는 직원만. 모델은 새 엔진 기본값, 대화(세션)는 새로 시작',
  fire: '(staffId)',
  decide: '(approvalId, allow: boolean)',
  answerQuestion: '(approvalId, answers: { 질문 문장: 답 })',
  reviewPlan: '(taskId, isApproved: boolean, feedback)',
  resumePlan: '(taskId)',
  createTeam: '(name, color: "#rrggbb")',
  updateTeam: '(teamId, { name?, color?, leadId?, floor? })',
  deleteTeam: '(teamId)',
  mergeTeams: '(fromTeamId, intoTeamId) — from 팀의 직원·카드를 into 팀으로 옮기고 from 팀을 없앰',
  moveStaff: '(staffId, { teamId?: string|null, joinLabIds?: string[], leaveLabIds?: string[] })',
  createLab: '({ name, color: "#rrggbb", goal, cwd: string|null, leadId: string|null, memberIds: string[] })',
  updateLab: '(labId, { name?, color?, goal?, cwd?, leadId?, memberIds? })',
  deleteLab: '(labId)',
  createTask: '({ title, detail, teamId: string|null, labId?: string|null })',
  updateTask: '(taskId, { title?, detail?, status?: "todo"|"doing"|"review"|"done", teamId?, labId?, assigneeId? })',
  assignTask: '(taskId, staffId)',
  deleteTask: '(taskId)',
  mergeTasks: '(keepId, mergeIds: string[]) — 시작 안 한 카드만 keep에 합침',
  startTasks: '(taskIds: string[])',
  stopTask: '(taskId)',
  startMeeting: '({ topic, participantIds: string[], rounds: 1|2|3 })',
  answerMeetingDecision: '(meetingId, decisionId, answer)',
  endMeeting: '(meetingId, mode: "wrapup"|"discard")',
  saveSchedule: '({ id (새로 만들면 새 UUID, 고치면 기존 id), staffId, label, time: "HH:MM", weekdays: number[] (0=일~6=토), instruction, enabled: boolean })',
  deleteSchedule: '(scheduleId)',
  runScheduleNow: '(scheduleId)',
  releasePlanHold: '()',
  sendChat: '(text)',
  saveManual: '({ name, description, kind: "personal"|"process", scope: "user"|"project", projectDir: string|null, body, steps: { id, title, role, instruction, needsMyCheck: boolean, onRevise: string|null, maxLoops: number }[] (personal이면 []) }, previousPath? — 고치기·이름 바꾸기는 원래 경로)',
  deleteManual: '(path)',
  trainStaff: '(manualName, staffIds: string[])',
  trainGroups: '(manualName, labIds: string[], teamIds: string[])',
  startRun: '({ manualName, scope: { kind: "lab"|"team", id }, input, taskId?: string|null })',
  reviewRun: '(runId, approve: boolean, feedback)',
  stopRun: '(runId)',
  setAutoApprove: '({ mode: "off"|"hours"|"daily", hours?: 1|4|8|12, start?: "HH:MM", end?: "HH:MM" })',
  approveAlways: '(approvalId)',
  deleteApprovalRule: '(ruleId)',
  saveKnowledge: '({ id?, kind: "learning"|"feedback"|"decision", title, body, tags?: string[], docPath?: string|null })',
  deleteKnowledge: '(id)',
  deleteGalleryEntry: '(id)',
  runDemoDayNow: '()',
  demoReact: "(meetingId, staffId, 'clap'|'mvp'|'comment', text?)",
  updateSettings: '({ monthlyBudgetUsd?, tokenBudget?: { day, week, month }, theme?, dayNight?, workHours?: { isEnabled, start, end }, isWorkMode? })',
  recruitExternal: '(staffId, { role, model, teamId: string|null, approvalMode: "ask"|"acceptEdits" })',
  forkExternal: '(staffId, text)',
  placeItem: '(itemId) — 서랍의 가구를 1층 첫 빈자리에 (칸을 정하려면 placeGridItem)',
  moveItem: '(uid, x, y) — 예전 방식. 칸 배치 가구는 moveGridItem',
  storeItem: '(uid) — 놓인 가구 하나를 서랍으로',
  placeGridItem: '(itemId, floor, gx, gy, rot: 0|1|2|3) — 서랍의 가구를 칸에 (가구 칸·방향은 office_layout으로 본다)',
  moveGridItem: '(uid, floor, gx, gy, rot: 0|1|2|3)',
  setGridItemOn: '(uid, isOn: boolean) — 켜고 끄는 소품만',
  stowAllGrid: '(floor: 0이면 건물 전체, keepSeats: boolean — true면 직원 책상·의자는 남김)',
  restoreGridItems: '(items) — 직접 만들지 않는다: 치운 뒤 앱이 되돌리기 카드를 올리고, 다시 필요하면 undo_stow 도구',
}

/** 비서 지침에 넣는 메서드 표 */
export const signatureGuide = () =>
  (['read', 'change'] as const)
    .map((kind) => `${kind === 'read' ? '조회(read 도구)' : '변경(propose 도구)'}:\n${methodsOfKind(kind).map((m) => `- ${m}${SECRETARY_SIGNATURES[m] ?? '()'}`).join('\n')}`)
    .join('\n') + `\n${BATCH_GUIDE}`

/** 묶음 단계 쓰는 법 (지침·propose 설명에 붙인다) */
export const BATCH_GUIDE = `- ${BATCH_METHOD}: 같은 성격의 변경이 많을 때 한 단계로 묶는다. { method: "${BATCH_METHOD}", label: "묶음 이름", items: [{ method, args, label? }, …] } (항목 ${BATCH_ITEMS_MAX}개까지, 항목은 위 변경 메서드 중 하나, 앞 단계 "$n" 참조 불가). 대표가 카드에서 항목마다 뺄 수 있다`
