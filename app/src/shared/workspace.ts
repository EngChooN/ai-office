// 워크스페이스(내 PC 여러 대 오가며 보기) — 메인·화면이 함께 쓰는 타입과 순수 함수
// 설계: docs/design-refresh/connect-workspace/impl-design-decision.md (상태 판정 statusOf · 읽기/쓰기 표 · 한도)
// 이 PC 화면이 쓰는 OfficeApi에는 넣지 않는다 — 이 PC용 창 API는 window.officeWorkspaces(workspace:* 채널)

import type { OfficeMethod } from './officeApiShape.ts'

/** 이 PC를 빼고 볼 수 있는 다른 PC 수 (보는 쪽 기준, workspace-defaults.md 3번) */
export const WORKSPACE_MAX = 3
/** 끊긴 뒤 '끊김'으로 보이기까지 (안드로이드와 같은 값, workspace-defaults.md 4번) */
export const WORKSPACE_OFFLINE_GRACE_MS = 8_000
/** 화면 보기를 할 수 있는 상대 PC 프로토콜 — 0단계(기기별 열쇠·화면 보기 권한)에서 확정해 문서와 함께 올린다 */
export const WORKSPACE_MIN_PEER_PROTOCOL = 3
export const WORKSPACE_NAME_MAX = 30

/** 연결 PC 색 (이 PC는 기존 primary 보라). 실제 색은 CSS 변수 --ws-<색>이 라이트·다크별로 정한다 */
export const WORKSPACE_COLORS = ['teal', 'orange', 'blue'] as const
export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number]
/** 창 버튼 영역(윈도우 titleBarOverlay)처럼 CSS 밖에서 칠할 때 쓰는 색 — index.css의 --ws-* 와 같은 값 */
export const WORKSPACE_COLOR_HEX: Record<WorkspaceColor, { light: string; dark: string }> = {
  teal: { light: '#0E8C7E', dark: '#3DD6C0' },
  orange: { light: '#C8571F', dark: '#FF9A62' },
  blue: { light: '#2F6FD0', dark: '#6FA8FF' },
}

/** 보는 쪽 기기에 저장하는 연결 PC 한 대. 열쇠·주소는 갖지 않는다 — 기존 짝 목록(peerId)이 단일 출처 */
export interface Workspace {
  id: string
  peerId: string
  name: string
  color: WorkspaceColor
  order: number
  /** 마지막으로 이 PC 화면을 연 시각 (꽉 찼을 때 '가장 오래 안 쓴 PC' 표시) */
  lastUsedAt: number
}

/** 화면 보기 연결의 상태 하나 — 드롭다운 행·창 띠·관리 목록·마법사가 같은 값을 그린다 */
export type WorkspaceStatus =
  | 'connecting'
  | 'ready'
  | 'reconnecting'
  | 'offline'
  | 'grantPending'
  | 'grantDenied'
  | 'peerOutdated'
  | 'selfOutdated'
  | 'unpaired'
  | 'peerFull'

/** 링크(실시간 연결)의 원래 상태 — PeerClient 상태를 그대로 옮긴다 */
export type WorkspaceLinkState = 'idle' | 'connecting' | 'online' | 'offline'

export interface WorkspaceHello {
  protocol: number
  /** 이 열쇠가 화면 보기 권한을 가졌는지 */
  canView: boolean
  grant: 'granted' | 'pending' | 'denied'
}

export interface StatusInput {
  link: WorkspaceLinkState
  /** 마지막으로 online이 아니게 된 시각 (처음 붙는 중이면 시도를 시작한 시각) */
  downSince?: number
  hasBeenOnline: boolean
  /** 연결 직후 받은 hello (없으면 아직 확인 전) */
  hello?: WorkspaceHello | null
  /** 마지막 실패 코드 (PeerClient·짝짓기가 이미 구분한 값) */
  error?: string | null
  now: number
}

/** 다시 짝지어야 하는 실패 (열쇠가 폐기됐거나 인증서가 바뀜) */
const UNPAIRED_ERRORS = new Set(['unauthorized', 'forbidden', 'token_revoked', 'SPKI_MISMATCH', 'http_401', 'http_403', 'http_426'])

/** 화면 보기 상태 판정 — 이 함수 말고 다른 곳에서 상태를 정하지 않는다 */
export function statusOf(input: StatusInput): WorkspaceStatus {
  const { link, hello, error, now } = input
  if (error && UNPAIRED_ERRORS.has(error)) return 'unpaired'
  if (error === 'protocol_unsupported') return 'selfOutdated'
  if (error === 'slots_full') return 'peerFull'
  if (link === 'online') {
    if (!hello) return 'connecting'
    if (hello.protocol < WORKSPACE_MIN_PEER_PROTOCOL || !hello.canView) return 'peerOutdated'
    if (hello.grant === 'pending') return 'grantPending'
    if (hello.grant === 'denied') return 'grantDenied'
    return 'ready'
  }
  const isGraceOver = input.downSince !== undefined && now - input.downSince >= WORKSPACE_OFFLINE_GRACE_MS
  if (input.hasBeenOnline) return isGraceOver ? 'offline' : 'reconnecting'
  return link === 'offline' && isGraceOver ? 'offline' : 'connecting'
}

/** 창을 만들거나 보여 줄 수 있는 상태 — 확인 전·옛 PC·허락 전에는 창을 열지 않는다 */
export const canOpenWindow = (s: WorkspaceStatus) => s === 'ready' || s === 'reconnecting' || s === 'offline'

export type MethodAccess = 'read' | 'write'

/**
 * 원격 창에서 부르는 메서드의 읽기/쓰기 구분. 끊긴 동안·확인 전에는 쓰기를 메인에서 막는다.
 * 키가 OfficeMethod 전부여야 하는 타입이라 OfficeApi에 메서드가 생기면 tsc가 실패한다.
 * 애매하면 write로 둔다(빠뜨려도 막히는 쪽으로 실패). 저쪽 PC에서 무언가를 열거나 AI를 부르는 것도 write
 */
export const METHOD_ACCESS: Record<OfficeMethod, MethodAccess> = {
  snapshot: 'read',
  tutorialStart: 'write',
  tutorialAct: 'write',
  tutorialCleanup: 'write',
  hire: 'write',
  hireMarket: 'write',
  fire: 'write',
  updateStaff: 'write',
  instruct: 'write',
  loadStaffCommands: 'read',
  interrupt: 'write',
  waitingAction: 'write',
  decide: 'write',
  getRecord: 'read',
  getRecordBefore: 'read',
  listAgentTemplates: 'read',
  pickFolder: 'write',
  pickFiles: 'write',
  missingFiles: 'read',
  setRefDocs: 'write',
  hooksStatus: 'read',
  setHooksInstalled: 'write',
  setAskHookInstalled: 'write',
  createTeam: 'write',
  updateTeam: 'write',
  deleteTeam: 'write',
  mergeTeams: 'write',
  moveStaff: 'write',
  createTask: 'write',
  updateTask: 'write',
  assignTask: 'write',
  deleteTask: 'write',
  mergeTasks: 'write',
  boardCleanupPlan: 'read',
  startMeeting: 'write',
  saveSchedule: 'write',
  deleteSchedule: 'write',
  runScheduleNow: 'write',
  releasePlanHold: 'write',
  chatHistory: 'read',
  sendChat: 'write',
  reactChat: 'write',
  searchChat: 'read',
  chatAround: 'read',
  saveChatReservation: 'write',
  chatReservationAction: 'write',
  timeline: 'read',
  staffActivity: 'read',
  dailyReport: 'read',
  payslip: 'read',
  updateSettings: 'write',
  createLab: 'write',
  updateLab: 'write',
  deleteLab: 'write',
  fireExternal: 'write',
  recruitExternal: 'write',
  equipmentCatalog: 'read',
  refreshEquipment: 'write',
  customMcpList: 'read',
  saveCustomMcp: 'write',
  deleteCustomMcp: 'write',
  setEquipment: 'write',
  workChanges: 'read',
  suggestCommitMessage: 'write',
  commitChanges: 'write',
  workRevertInfo: 'read',
  revertWork: 'write',
  pushAndCreatePr: 'write',
  claudeStatus: 'read',
  providerStatus: 'read',
  openClaudeLogin: 'write',
  openCodexLogin: 'write',
  resumeInTerminal: 'write',
  changeEngine: 'write',
  forkExternal: 'write',
  answerMeetingDecision: 'write',
  endMeeting: 'write',
  stopTask: 'write',
  resumePlan: 'write',
  reviewPlan: 'write',
  answerQuestion: 'write',
  autoApproveStatus: 'read',
  setAutoApprove: 'write',
  setAutoFull: 'write',
  autoApproveLog: 'read',
  approveAlways: 'write',
  approvalRules: 'read',
  deleteApprovalRule: 'write',
  knowledgeList: 'read',
  saveKnowledge: 'write',
  deleteKnowledge: 'write',
  galleryList: 'read',
  deleteGalleryEntry: 'write',
  runDemoDayNow: 'write',
  demoReact: 'write',
  markReportsRead: 'write',
  refreshPlanUsage: 'write',
  ledger: 'read',
  buyItem: 'write',
  applySurface: 'write',
  placeItem: 'write',
  moveItem: 'write',
  storeItem: 'write',
  placeGridItem: 'write',
  moveGridItem: 'write',
  setGridItemOn: 'write',
  stowAllGrid: 'write',
  restoreGridItems: 'write',
  moveSeatSet: 'write',
  setGear: 'write',
  missions: 'read',
  claimMission: 'write',
  startTasks: 'write',
  saveAttachments: 'write',
  openAttachment: 'write',
  artifactList: 'read',
  artifactVersions: 'read',
  artifactOpen: 'read',
  artifactOpenExternal: 'write',
  artifactReveal: 'write',
  listManuals: 'read',
  saveManual: 'write',
  deleteManual: 'write',
  draftManual: 'write',
  trainStaff: 'write',
  trainGroups: 'read',
  startRun: 'write',
  reviewRun: 'write',
  stopRun: 'write',
  remoteStatus: 'read',
  setRemoteEnabled: 'write',
  regenerateRemoteQr: 'write',
  // 연결 QR에는 짝짓기 비밀이 들어 있다 — 읽기여도 막는 쪽으로
  remoteQr: 'write',
  setRemoteHost: 'write',
  setRemoteLanOnly: 'write',
  dismissRemoteLanNotice: 'write',
  setRemoteMode: 'write',
  refreshRemoteTailscale: 'write',
  dismissRemoteTsNotice: 'write',
  peerPairStart: 'write',
  peerPairClose: 'write',
  peerSlots: 'read',
  peerRevokeSlot: 'write',
  peerPairConnect: 'write',
  peerList: 'read',
  peerUnpair: 'write',
  peerReconnect: 'write',
  peerRemoteStaff: 'read',
  peerAddStaff: 'write',
  peerRemoveStaff: 'write',
  peerCancelJob: 'write',
  peerChangesetDetail: 'read',
  peerChangeFileDiff: 'read',
  peerApplyChanges: 'write',
  secretaryAsk: 'write',
  secretaryRun: 'write',
  secretaryCancel: 'write',
  secretaryClear: 'write',
}

/** 화면이 보낸 이름의 구분 — 표에 없는 이름(옛·새 화면, 잘못된 값)은 write */
export function accessOf(method: string): MethodAccess {
  return Object.hasOwn(METHOD_ACCESS, method) ? METHOD_ACCESS[method as OfficeMethod] : 'write'
}

export type CallGate = { ok: true } | { ok: false; code: 'workspace_offline' | 'workspace_not_ready' }

/**
 * 원격 창 요청을 저쪽 PC로 보내도 되는지 — 메인 브리지가 부른다(권위 있는 막는 곳).
 * ready: 모두 · 붙는 중·다시 붙는 중·끊김: 읽기만 · 그 밖(옛 PC·허락 전·짝 풀림): 모두 막음
 */
export function gateCall(method: string, status: WorkspaceStatus): CallGate {
  if (status === 'ready') return { ok: true }
  if (status === 'connecting' || status === 'reconnecting' || status === 'offline') return accessOf(method) === 'read' ? { ok: true } : { ok: false, code: 'workspace_offline' }
  return { ok: false, code: 'workspace_not_ready' }
}

/** 하나 더 연결할 수 있는지 (이 PC 제외 3대) */
export const canAddWorkspace = (list: readonly Workspace[]) => list.length < WORKSPACE_MAX

/** 꽉 찼을 때 해제 후보로 보여 줄 가장 오래 안 쓴 PC */
export const leastRecentlyUsed = (list: readonly Workspace[]): Workspace | null => (list.length ? list.reduce((a, b) => (b.lastUsedAt < a.lastUsedAt ? b : a)) : null)

/** 새 PC에 줄 색: 아직 안 쓴 색 중 첫 번째 (다 쓰면 첫 색) */
export const nextFreeColor = (list: readonly Workspace[]): WorkspaceColor => WORKSPACE_COLORS.find((c) => !list.some((w) => w.color === c)) ?? WORKSPACE_COLORS[0]

export const isWorkspaceColor = (v: unknown): v is WorkspaceColor => typeof v === 'string' && (WORKSPACE_COLORS as readonly string[]).includes(v)

/** 이름 정리: 앞뒤 공백·줄바꿈 제거, 길이 제한. 비면 기본 이름 */
export const cleanWorkspaceName = (raw: unknown, fallback: string) => {
  const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, WORKSPACE_NAME_MAX) : ''
  return s || fallback.slice(0, WORKSPACE_NAME_MAX)
}

/** 화면에 내려 주는 목록 한 줄 (상태·결재 수 포함) */
export interface WorkspaceView extends Workspace {
  status: WorkspaceStatus
  /** 그 PC의 결재 대기 수 (드롭다운 숫자 점) */
  pending: number
}

/** 어느 창이 지금 앞에 있는지: 'self' = 이 PC */
export type WorkspaceTarget = 'self' | string

export interface WorkspacesState {
  list: WorkspaceView[]
  /** 이 창이 보고 있는 대상 (이 PC 창이면 'self') */
  current: WorkspaceTarget
}

export type WorkspaceAddResult = { ok: true; workspace: Workspace } | { ok: false; code: 'full' | 'duplicate' | 'unknown_peer' }

/** 이 PC 창용 API (preload → window.officeWorkspaces). 원격 창에는 list·switchTo·onChange만 있다 */
export interface OfficeWorkspacesApi {
  state(): Promise<WorkspacesState>
  switchTo(target: WorkspaceTarget): Promise<boolean>
  onChange(cb: (state: WorkspacesState) => void): () => void
  add?(input: { peerId: string; name: string; color: WorkspaceColor }): Promise<WorkspaceAddResult>
  update?(id: string, patch: { name?: string; color?: WorkspaceColor }): Promise<boolean>
  remove?(id: string): Promise<boolean>
}
