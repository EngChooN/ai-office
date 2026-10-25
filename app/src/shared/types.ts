// main ↔ renderer 공용 타입

import type { LedgerRow, MissionsView, ShopState, Zone } from './economy'
import type { GridItem } from './iso/furniture'
import type { RefDocReject } from './refDocs'
import type { AutoApproveConfig, AutoApprovePlan, AutoKind } from './autoApprove'
import { COMPANY_LEVELS, companyLevelOf } from './officeLevel.ts'
import type { LangSetting } from './i18n/index.ts'

export type StaffKind = 'hired' | 'external'
export type StaffStatus = 'idle' | 'working' | 'waiting' | 'offline' | 'error'
export type ModelChoice = 'default' | 'opus' | 'sonnet' | 'haiku'
export type ApprovalMode = 'ask' | 'acceptEdits'

export interface Approval {
  id: string
  staffId: string
  toolName: string
  summary: string
  createdAt: number
  /** 직원의 질문(AskUserQuestion)이면 질문 목록 — 승인·반려 대신 답을 고른다 */
  questions?: StaffQuestion[]
}

export interface StaffQuestion {
  question: string
  header: string
  options: { label: string; description: string }[]
  multiSelect: boolean
}

export interface StaffStats {
  tasksDone: number
  toolCalls: number
  approvals: number
  xp: number
  level: number
  /** 다음 레벨까지 진행률 0~1 */
  progress: number
}

export interface Staff {
  id: string
  kind: StaffKind
  name: string
  role: string
  avatar: number
  model: ModelChoice
  /** 실제 작업 폴더 (지정 안 하면 홈 폴더 — 어떤 프로젝트 일이든 맡길 수 있다) */
  cwd: string
  /** 직접 지정한 작업 폴더 ('' = 지정 안 함) */
  ownCwd?: string
  cwdSource?: 'own' | 'none'
  systemPrompt: string
  approvalMode: ApprovalMode
  sessionId: string | null
  teamId: string | null
  /** 소속 랩(프로젝트 팀) — 여러 개 가능 */
  labIds: string[]
  /** 참고 문서 절대 경로 — 작업 전에 먼저 읽는다 (없으면 빈 목록) */
  refDocs?: string[]
  equipment: Equipment
  /** 외부 직원의 Claude Code 프로세스 (해고·채용용) */
  pid: number | null
  status: StaffStatus
  activity: string
  approvals: Approval[]
  costUsd: number
  tokensIn: number
  tokensOut: number
  deskIndex: number
  hiredAt: number
  stats: StaffStats
  /** 회의 중이면 회의 id */
  meetingId: string | null
  /** 지금 상태가 시작된 시각 (대시보드 "12분째"). 앱이 켜진 뒤 처음 본 상태는 그때부터 센다 */
  statusSince: number
  /** 오늘 완료한 업무 수 */
  todayDone: number
}

/** 부서. 고용 직원 팀은 사용자가 만들고, 외부 직원은 프로젝트 폴더별 가상 팀(proj:)으로 묶는다 */
export interface Team {
  id: string
  name: string
  color: string
  leadId: string | null
  kind: 'hired' | 'project'
  /** 이 팀에 교육한 프로세스 매뉴얼 이름 */
  manuals?: string[]
  /** 팀원 모두가 작업 전에 읽는 참고 문서 */
  refDocs?: string[]
  /** 팀 자리가 있는 층 (없으면 1층). 이 레벨에 없는 층이면 그릴 때 1층으로 보정한다 */
  floor?: number
}

export type RefDocTarget = { kind: 'staff' | 'team' | 'lab'; id: string }
export interface RefDocsSaveResult {
  docs: string[]
  rejected: { input: string; reason: RefDocReject }[]
}

/** 랩: 여러 팀에서 한 명씩 뽑아 꾸리는 프로젝트 팀 (팀과 교차) */
export interface Lab {
  id: string
  name: string
  color: string
  goal: string
  cwd: string | null
  leadId: string | null
  memberIds: string[]
  /** 이 랩에 교육한 프로세스 매뉴얼 이름 */
  manuals?: string[]
  /** 랩 멤버 모두가 작업 전에 읽는 참고 문서 */
  refDocs?: string[]
}

/** 업무 매뉴얼 = Claude Code 스킬. 개인 매뉴얼은 직원에게, 프로세스 매뉴얼은 팀·랩에 교육한다 */
export type ManualKind = 'personal' | 'process'
export type ManualScope = 'project' | 'user'

/** 프로세스 매뉴얼의 한 단계 — 담당은 역할(직무 키워드)로 정하고 실행 때 그 랩·팀의 해당 직원이 맡는다 */
export interface ProcessStep {
  id: string
  title: string
  /** 직원 직무에 이 말이 들어 있으면 담당 (예: "리뷰어", "QA", "팀장") */
  role: string
  instruction: string
  /** 끝나면 내 확인을 받고 넘어간다 */
  needsMyCheck: boolean
  /** 결과가 "판정: revise"면 이 단계로 되돌아간다 */
  onRevise: string | null
  maxLoops: number
}

export interface Manual {
  name: string
  description: string
  kind: ManualKind
  scope: ManualScope
  /** project일 때 그 프로젝트 폴더 */
  projectDir: string | null
  path: string
  body: string
  steps: ProcessStep[]
}

export interface ManualInput {
  name: string
  description: string
  kind: ManualKind
  scope: ManualScope
  projectDir: string | null
  body: string
  steps: ProcessStep[]
}

export type RunStatus = 'running' | 'checking' | 'done' | 'failed' | 'stopped'

export interface RunStepRecord {
  stepId: string
  staffId: string | null
  staffName: string
  output: string
  verdict: 'approve' | 'revise' | 'done'
  ts: number
}

/** 프로세스 매뉴얼 한 번 실행 */
export interface ProcessRun {
  id: string
  manualName: string
  manualTitle: string
  steps: ProcessStep[]
  /** 담당을 찾을 범위 */
  scope: { kind: 'lab' | 'team'; id: string; name: string }
  input: string
  attachments?: Attachment[]
  taskId: string | null
  status: RunStatus
  stepIndex: number
  currentStaffId: string | null
  history: RunStepRecord[]
  loops: Record<string, number>
  /** checking일 때 확인을 기다리는 단계 결과 */
  pendingOutput: string
  createdAt: number
  updatedAt: number
}

/** 직원에게 지급하는 장비: MCP 서버·스킬·도구 권한·월 예산 */
export interface Equipment {
  mcpServers: string[]
  /** 'all'이면 쓸 수 있는 스킬 전부 */
  skills: string[] | 'all'
  allowedTools: string[]
  disallowedTools: string[]
  /** 0이면 제한 없음 */
  monthlyBudgetUsd: number
}

export interface EquipmentCatalog {
  mcpServers: { name: string; source: string; detail: string }[]
  skills: { name: string; source: string; description: string }[]
}

export const DEFAULT_EQUIPMENT: Equipment = { mcpServers: [], skills: 'all', allowedTools: [], disallowedTools: [], monthlyBudgetUsd: 0 }

/** 회사 레벨 — 직원 수·실적으로 오르고, 오를수록 사무실이 커진다 */
export interface Company {
  level: number
  xp: number
  progress: number
  nextXp: number
  title: string
}

// 레벨표는 shared/officeLevel.ts의 LEVEL_TABLE 한 곳에 있다 (예전 이름 COMPANY_LEVELS도 거기서 계산해 내보낸다)
export { COMPANY_LEVELS } from './officeLevel.ts'

/** 첫 실행 점검: 앱에 든 Claude Code 로그인 상태와, 터미널용 claude 설치 여부 */
export interface ClaudeStatus {
  isLoggedIn: boolean
  email: string
  authMethod: string
  hasTerminalClaude: boolean
}

export interface ChangeFile {
  path: string
  status: string
  additions: number
  deletions: number
}

export interface WorkChanges {
  cwd: string
  isGit: boolean
  branch: string
  files: ChangeFile[]
  diff: string
  hasGh: boolean
  ahead: number
}

export type LogType = 'instruction' | 'reply' | 'tool' | 'approval' | 'status' | 'result' | 'error' | 'delegate' | 'commit'

export interface LogEntry {
  id: number
  staffId: string
  ts: number
  type: LogType
  text: string
  attachments?: Attachment[]
}

export type TaskStatus = 'todo' | 'doing' | 'review' | 'done'

export interface Task {
  id: string
  title: string
  detail: string
  status: TaskStatus
  assigneeId: string | null
  teamId: string | null
  labId: string | null
  attachments?: Attachment[]
  result: string
  createdAt: number
  updatedAt: number
  /** 리드가 나눈 하위 업무면 상위 카드 */
  parentId?: string | null
  /** 리드의 기획안 (대표 확인 → 하위 업무 배정 → 취합) */
  plan?: TaskPlan | null
  /** 회의 결과 카드면 그 회의 — 기획안을 올릴 때 결정 섹션을 이 회의의 원본으로 덮어쓴다 */
  meetingId?: string | null
}

export interface PlanSubtask {
  title: string
  detail: string
  assigneeId: string | null
  assigneeName: string
}

/** waiting: 대표 확인 대기 · revise: 피드백 받고 다시 기획 중 · approved: 하위 업무 진행 중 */
export type PlanStatus = 'waiting' | 'revise' | 'approved'

export interface TaskPlan {
  spec: string
  subtasks: PlanSubtask[]
  status: PlanStatus
  feedback: string
  /** 하위 업무가 다 끝나 리드에게 취합을 맡겼는지 */
  isAggregating: boolean
  /** 대표가 기획 진행을 멈춤 — 다시 진행을 누를 때까지 다음 하위 업무를 시작하지 않는다 */
  isPaused?: boolean
  /** 승인 후 만든 하위 카드 — 이 순서대로 하나씩 진행한다 */
  childIds?: string[]
  /** 이 기획이 대신 처리하는 보드 카드 (회의에서 나온 할 일 등) — 기획이 끝나면 함께 완료 */
  absorbedIds?: string[]
  proposedAt: number
}

export interface MeetingMessage {
  staffId: string | null
  name: string
  text: string
  ts: number
}

/** 회의 중 참석자가 대표(사용자)에게 묻는 결정 */
export interface MeetingDecision {
  id: string
  askedBy: string
  askedByName: string
  /** 골라낸 질문 전문 (자르지 않는다) */
  question: string
  options: string[]
  /** null = 대기 · '' = 위임("알아서 정해") 또는 회의 끝내기로 풀림 · 그 밖 = 대표의 답. 옛 화면·폰이 읽으므로 뜻을 바꾸지 않는다 */
  answer: string | null
  /** 물은 시각 */
  ts: number
  // 아래는 모두 선택 — 옛 데이터·옛 PC에는 없다. 읽을 때는 shared/meetingDecisions의 decisionView로 보정한다
  /** 결정 유형 (답한 뒤 채움) */
  kind?: 'direct' | 'delegated'
  /** 결정한 사람: 'me' = 대표, 위임이면 정한 직원 id */
  decidedById?: string
  decidedByName?: string
  /** 최종 선택값 — direct면 answer와 같고, delegated면 직원이 고른 값 */
  choice?: string
  /** 위임 결정의 이유 한 줄 */
  reason?: string
  /** 결정 시각 (direct = 답한 때, delegated = 직원이 정한 때) */
  decidedAt?: number
  /** "[결정 요청] …" 줄 원문 그대로 (골라내기 전) */
  raw?: string
  /** 대표가 답하지 않은 채 회의를 끝내 풀린 결정 — 위임이 아니다 */
  endedByMeeting?: true
}

export interface Meeting {
  id: string
  topic: string
  participantIds: string[]
  rounds: number
  /** waiting = 결정 대기로 멈춤 · stopped = 대표가 중간에 끝냄(회의록 없이) */
  status: 'running' | 'waiting' | 'done' | 'failed' | 'stopped'
  decisions?: MeetingDecision[]
  messages: MeetingMessage[]
  summary: string
  createdAt: number
}

export interface Schedule {
  id: string
  staffId: string
  label: string
  /** HH:MM */
  time: string
  /** 0=일 ~ 6=토 */
  weekdays: number[]
  instruction: string
  enabled: boolean
  lastRunDate: string | null
}

/** 지시·보고·단체방·업무 카드에 붙는 파일 (앱 첨부 폴더에 복사해 둔다) */
export interface Attachment {
  id: string
  name: string
  path: string
  mime: string
  size: number
}

/** 화면에서 고른 파일을 main으로 보낼 때 */
export interface UploadFile {
  name: string
  mime: string
  data: ArrayBuffer
}

export const isImageAttachment = (a: Attachment) => a.mime.startsWith('image/')
/** 화면에서 첨부를 보여 주는 주소 (main이 office-file 프로토콜로 내어 준다) */
// 첨부 주소: PC는 office-file 스킴, 모바일 빌드는 안드로이드 셸이 가로채는 같은 출처 경로 (vite define, 없으면 PC 값)
const OFFICE_FILE_BASE = typeof __OFFICE_FILE_BASE__ === 'undefined' ? 'office-file://file/' : __OFFICE_FILE_BASE__
export const attachmentUrl = (a: Attachment) => `${OFFICE_FILE_BASE}${a.id}`

export interface ChatMessage {
  id: number
  ts: number
  /** 'me' 또는 직원 id */
  from: string
  text: string
  attachments?: Attachment[]
}

export type ThemeId = 'wood' | 'mint' | 'night' | 'pastel'
export type DayNight = 'auto' | 'day' | 'night'

export type BudgetPeriod = 'day' | 'week' | 'month'
/** 기간별 토큰 상한 (0 = 제한 없음) */
export type TokenBudget = Record<BudgetPeriod, number>

export interface Settings {
  /** 월 비용 예산 — 토큰 예산과 함께 보조 지표로 남긴다 */
  monthlyBudgetUsd: number
  tokenBudget: TokenBudget
  theme: ThemeId
  dayNight: DayNight
  plants: number
  /** 휴게실 수다 말풍선 */
  isChatterOn: boolean
  /** 근무시간 밖이면 쉬던 직원은 퇴근한다 */
  workHours: { isEnabled: boolean; start: string; end: string }
  /** 꾸미기 모드에서 옮긴 소품 위치 (소품 키 → 기본 위치에서의 이동량) */
  layout: Record<string, { dx: number; dy: number }>
  /** 메뉴바 아이콘 */
  isTrayOn: boolean
  /** 첫 실행 안내를 마쳤는지 */
  isOnboarded: boolean
  /** 업무 모드: 회사에 띄워 둘 때 게임 요소(자금·상점·레벨·말풍선)를 숨기고 대시보드로 시작한다 */
  isWorkMode: boolean
  /** 0.9.0 안내("이제 연결된 휴대폰이 PC를 전부 조작할 수 있어요")를 봤는지 — 한 번만 띄운다 */
  isFullAccessNoticeSeen: boolean
  /** 앱 언어 — 'auto'면 기기 언어를 따른다(지원하지 않으면 영어). 직원 안내문·안드로이드 앱도 이 값을 읽는다 */
  language: LangSetting
}

export interface OfficeSnapshot {
  staff: Staff[]
  teams: Team[]
  labs: Lab[]
  company: Company
  runs: ProcessRun[]
  tasks: Task[]
  meetings: Meeting[]
  schedules: Schedule[]
  settings: Settings
  monthCostUsd: number
  /** Claude 구독 사용률 (직원이 일할 때 Claude가 알려 준 마지막 값) */
  planUsage: PlanUsage[]
  /** 회사 자금 잔액 (원) */
  funds: number
  shop: ShopState
  /** 받을 수 있는 미션·업적 보상 수 */
  claimable: number
  /** 자동결재(대표 부재 중) 상태 — 앱 상단·메뉴바·설정이 같은 값을 본다 */
  autoApprove: AutoApproveState
  /** 비서 대화·확인 카드 (옛 main이면 비어 있을 수 있다) — 휴대폰 앱도 스냅샷으로 같이 받는다 */
  secretary?: SecretaryState
}

/** 자동결재가 대신 처리한 한 건 (결재함 "자동 처리됨" 목록) */
export interface AutoHandled {
  id: string
  at: number
  staffId: string
  staffName: string
  /** approval = 대신 승인, answer = 질문에 대신 답함 */
  kind: 'approval' | 'answer'
  toolName: string
  /** 승인한 도구 요약, 또는 "질문 → 답" */
  summary: string
  /** 요약 집계용 (수정·명령·기타). 질문은 'other' */
  category: AutoKind
}

export interface AutoApproveState {
  config: AutoApproveConfig
  /** 지금 대신 결재하는 중인지 */
  isActive: boolean
  /** 켜져 있으면 끝나는 시각 */
  endsAt: number | null
  /** 매일 시간대인데 지금은 밖이면 다음 시작 시각 */
  startsAt: number | null
  /** 이번에 켜진 뒤 대신 처리한 수 (켜질 때마다 0부터). waited = 대기로 넘긴 건수(반려 여부와 무관) */
  counts: { edit: number; command: number; other: number; answered: number; waited: number }
}

/** Claude 플랜 사용 한도 — 토큰 수가 아니라 사용률(%)과 리셋 시각만 제공된다 */
export interface PlanUsage {
  /** five_hour · seven_day · seven_day_opus · seven_day_sonnet … */
  type: string
  /** 0~100, 모르면 null */
  percent: number | null
  /** ms, 모르면 null */
  resetsAt: number | null
  status: 'allowed' | 'allowed_warning' | 'rejected'
  updatedAt: number
}

/** 플랜 한도 이름 (사용률 창 종류) */
export const PLAN_WINDOW_LABEL: Record<string, string> = {
  five_hour: '5시간',
  seven_day: '7일',
  seven_day_opus: '7일 · Opus',
  seven_day_sonnet: '7일 · Sonnet',
  seven_day_overage_included: '7일 (추가 사용 포함)',
  overage: '추가 사용',
}

export interface HireInput {
  name: string
  role: string
  avatar: number
  model: ModelChoice
  cwd: string
  systemPrompt: string
  approvalMode: ApprovalMode
  teamId: string | null
  labIds?: string[]
}

export interface AgentTemplate {
  name: string
  description: string
  model: ModelChoice
  prompt: string
  source: string
}

export interface DailyRecord {
  staffId: string
  logs: LogEntry[]
  costUsd: number
  tokensIn: number
  tokensOut: number
}

export interface PayslipRow {
  staffId: string
  name: string
  role: string
  avatar: number
  costUsd: number
  tokensIn: number
  tokensOut: number
  tasksDone: number
}

export interface PeriodUsage {
  period: BudgetPeriod
  usedTokens: number
  limitTokens: number
}

export interface Payslip {
  month: string
  rows: PayslipRow[]
  totalUsd: number
  budgetUsd: number
  /** 그 달의 예산 토큰 (budgetTokens 기준) */
  totalTokens: number
  /** 일·주는 지금 기준, 월은 조회한 달 기준 */
  periods: PeriodUsage[]
}

export interface HooksStatus {
  installed: boolean
  /** 외부 직원 질문을 사무실에서 받는 hook */
  isAskInstalled: boolean
  port: number
}

// ── 원격 접속 (휴대폰) — 화면에 보내는 상태에는 비밀(토큰·해시·키)이 없다 ──
/** 최근 접속 기록 한 줄 (토큰·본문은 남기지 않는다) */
export interface AccessEntry {
  at: number
  ip: string
  method: string
  /** 쿼리 문자열은 뺀 경로 */
  path: string
  status: number
  /** 오류면 오류 코드 */
  error?: string
}

export type UpnpState =
  { state: 'off' } | { state: 'trying' } | { state: 'ok'; externalAddress: string | null; isCarrierShared: boolean; isDoubleNat: boolean } | { state: 'failed'; reason: 'no_gateway' | 'refused' }

/** 화면에 보내는 원격 상태 — 비밀(토큰·해시·키)은 없다 */
export interface RemoteStatus {
  isEnabled: boolean
  isListening: boolean
  port: number
  host: string
  /** 휴대폰이 실제로 붙을 주소 (직접 입력 → 공유기 외부 주소 → 이 PC의 내부 주소 순) */
  connectHost: string | null
  /** 내부 주소밖에 몰라 같은 와이파이에서만 붙을 수 있는지 */
  isLanOnly: boolean
  fingerprint: string | null
  upnp: UpnpState
  /** 켜기 실패 (포트를 이미 다른 프로그램이 씀 등) */
  error: 'port_in_use' | 'start_failed' | null
  /** 잠금(한 곳 또는 전체)이 걸려 있으면 가장 늦게 풀리는 시각 */
  lockedUntil: number | null
  recentAccess: AccessEntry[]
  /** 지금 토큰으로 휴대폰이 붙은 적이 있는지 (있으면 새 휴대폰은 QR 다시 만들기로) */
  isTokenUsed: boolean
  /** 저장된 연결 키를 읽지 못해 새로 만들었는지 — 휴대폰은 새 QR로 다시 연결해야 한다 */
  isKeyRegenerated: boolean
  /** 항상 true — 전체 기능 스위치는 없앴다(원격이 켜져 있으면 v2를 바로 쓴다). 모바일 미리보기 셸이 이 모양으로 상태를 만들고, 이미 나간 화면 묶음이 읽어도 깨지지 않게 남긴다 */
  isFullAccess: true
  /** QR을 지금 보여 줄 수 있는지 (토큰 원문이 메모리에 있음) */
  isQrReady: boolean
}

/** 지금 보여 줄 연결 QR (토큰이 담겨 있으므로 화면에만, 파일·클립보드로 남기지 않는다) */
export interface RemoteQr {
  image: string
  host: string
  /** 같은 와이파이에서 쓰는 이 PC의 주소 (외부 주소와 같으면 null) */
  lan: string | null
  port: number
  /** 이 시각이 지나면 가린다 */
  until: number
}

export interface OfficeApi {
  /** 앱이 도는 OS (process.platform: 'darwin' · 'win32' …) — 화면 문구·여백을 OS에 맞춘다 */
  readonly platform: string

  /** 원격 접속(휴대폰): 상태·켜기/끄기·QR 다시 만들기(이전 토큰 폐기)·지금 QR·연결 주소 */
  remoteStatus(): Promise<RemoteStatus>
  setRemoteEnabled(isEnabled: boolean, port?: number): Promise<RemoteStatus>
  regenerateRemoteQr(): Promise<RemoteStatus>
  remoteQr(): Promise<RemoteQr | null>
  setRemoteHost(host: string): Promise<RemoteStatus>

  /** 비서 (docs/specs/secretary.md): 말 보내기 · 확인 카드 실행(첨삭은 고른 수정본·고친 값과 함께) · 카드 취소 · 대화 지우기. 대화는 스냅샷 secretary로 받는다 */
  secretaryAsk(text: string): Promise<void>
  secretaryRun(cardId: string, options?: SecretaryRunOptions): Promise<SecretaryCard | null>
  secretaryCancel(cardId: string): Promise<void>
  secretaryClear(): Promise<void>
  onRemoteStatus(cb: (status: RemoteStatus) => void): () => void
  snapshot(): Promise<OfficeSnapshot>
  hire(input: HireInput): Promise<Staff>
  fire(staffId: string): Promise<void>
  updateStaff(staffId: string, patch: { teamId?: string | null; name?: string; role?: string; model?: ModelChoice; avatar?: number; systemPrompt?: string; cwd?: string }): Promise<void>
  instruct(staffId: string, text: string, attachments?: Attachment[]): Promise<void>
  saveAttachments(files: UploadFile[]): Promise<Attachment[]>
  openAttachment(id: string): Promise<void>
  /** 하던 일을 멈춘다. 지시를 같이 주면 멈춘 뒤 바로 그 지시를 받는다 (끼어들기) */
  interrupt(staffId: string, text?: string, attachments?: Attachment[]): Promise<void>
  /** 직원 대화를 Claude Code(터미널)에서 이어서 연다. 못 열면 이유 문장, 열었으면 '' */
  resumeInTerminal(staffId: string): Promise<string>
  decide(approvalId: string, allow: boolean): Promise<void>
  getRecord(staffId: string): Promise<DailyRecord>
  listAgentTemplates(cwd: string): Promise<AgentTemplate[]>
  pickFolder(): Promise<string | null>
  hooksStatus(): Promise<HooksStatus>
  setHooksInstalled(installed: boolean): Promise<HooksStatus>
  setAskHookInstalled(installed: boolean): Promise<HooksStatus>

  createTeam(name: string, color: string): Promise<Team>
  updateTeam(teamId: string, patch: { name?: string; color?: string; leadId?: string | null; floor?: number }): Promise<void>
  deleteTeam(teamId: string): Promise<void>

  // 참고 문서는 setRefDocs로만 바꾼다 (경로 검사·상한·세션 다시 열기를 한 곳에서)
  createLab(input: Omit<Lab, 'id' | 'refDocs'>): Promise<Lab>
  updateLab(labId: string, patch: Partial<Omit<Lab, 'id' | 'refDocs'>>): Promise<void>
  deleteLab(labId: string): Promise<void>

  /** 참고 문서 목록 전체를 저장한다. 저장된(정규화된) 목록과 받지 않은 입력을 돌려준다 */
  setRefDocs(target: RefDocTarget, docs: string[]): Promise<RefDocsSaveResult>
  /** 참고 문서로 쓸 파일 고르기 (여러 개) */
  pickFiles(): Promise<string[]>
  /** 이 중 없는 파일 */
  missingFiles(paths: string[]): Promise<string[]>

  fireExternal(staffId: string): Promise<boolean>
  recruitExternal(staffId: string, input: { role: string; model: ModelChoice; teamId: string | null; approvalMode: ApprovalMode }): Promise<Staff | null>

  equipmentCatalog(cwd: string): Promise<EquipmentCatalog>
  setEquipment(staffId: string, equipment: Equipment): Promise<void>

  claudeStatus(): Promise<ClaudeStatus>
  openClaudeLogin(): Promise<void>
  /** 외부 직원의 대화를 복사한 분신에게 지시 (원래 창은 그대로) */
  forkExternal(staffId: string, text: string, attachments?: Attachment[]): Promise<Staff | null>

  listManuals(): Promise<Manual[]>
  saveManual(input: ManualInput, previousPath?: string): Promise<Manual>
  deleteManual(path: string): Promise<void>
  /** 직원에게 매뉴얼 초안을 맡긴다 (저장하지 않고 양식에 채울 내용을 돌려줌) */
  draftManual(staffId: string, request: string, kind: ManualKind): Promise<Pick<ManualInput, 'name' | 'description' | 'body' | 'steps'>>
  /** 개인 매뉴얼 교육: 직원 목록을 통째로 정한다 */
  trainStaff(manualName: string, staffIds: string[]): Promise<void>
  /** 프로세스 매뉴얼 교육: 랩·팀 목록을 통째로 정한다 */
  trainGroups(manualName: string, labIds: string[], teamIds: string[]): Promise<void>
  startRun(input: { manualName: string; scope: { kind: 'lab' | 'team'; id: string }; input: string; attachments?: Attachment[]; taskId?: string | null }): Promise<ProcessRun | null>
  /** 확인 단계: approve = 다음으로, 피드백을 주면 그 단계를 다시 */
  reviewRun(runId: string, approve: boolean, feedback: string): Promise<void>
  stopRun(runId: string): Promise<void>

  workChanges(staffId: string): Promise<WorkChanges>
  suggestCommitMessage(staffId: string): Promise<string>
  commitChanges(staffId: string, message: string): Promise<{ ok: boolean; output: string }>
  pushAndCreatePr(staffId: string, title: string, body: string): Promise<{ ok: boolean; output: string }>

  createTask(input: { title: string; detail: string; teamId: string | null; labId?: string | null; attachments?: Attachment[] }): Promise<Task>
  updateTask(taskId: string, patch: Partial<Pick<Task, 'title' | 'detail' | 'status' | 'teamId' | 'labId' | 'assigneeId'>>): Promise<void>
  assignTask(taskId: string, staffId: string): Promise<void>
  deleteTask(taskId: string): Promise<void>

  startMeeting(input: { topic: string; participantIds: string[]; rounds: number }): Promise<Meeting>
  answerMeetingDecision(meetingId: string, decisionId: string, answer: string): Promise<void>
  /** 진행 중인 회의를 끝낸다. wrapup이면 지금까지 나온 이야기로 회의록·결과 카드를 만들고, discard면 아무것도 남기지 않는다 */
  endMeeting(meetingId: string, mode: 'wrapup' | 'discard'): Promise<void>
  /** 진행 중인 카드를 멈춰 할 일로 되돌린다 (기획 카드면 기획 전체를 멈춤) */
  stopTask(taskId: string): Promise<void>
  /** 멈춘 기획을 다시 진행한다 */
  resumePlan(taskId: string): Promise<void>
  reviewPlan(taskId: string, isApproved: boolean, feedback: string): Promise<void>
  /** 직원 질문에 답한다 (질문 문장 → 답, 여러 개 고르면 쉼표로). 답하지 않고 넘기려면 decide(id, false) */
  answerQuestion(approvalId: string, answers: Record<string, string>): Promise<void>
  /** 자동결재(대표 부재 중): 지금 상태 · 켜기(N시간·매일 시간대)/끄기 · 대신 처리한 목록(최근 것부터) */
  autoApproveStatus(): Promise<AutoApproveState>
  setAutoApprove(plan: AutoApprovePlan): Promise<AutoApproveState>
  autoApproveLog(): Promise<AutoHandled[]>
  /** haiku를 한 번 짧게 불러 Claude 플랜 사용률을 지금 값으로 받아 온다 */
  refreshPlanUsage(): Promise<PlanUsage[]>
  /** 회사 자금 입출금 내역 (최근 순) */
  ledger(): Promise<LedgerRow[]>
  buyItem(itemId: string): Promise<{ ok: boolean; message: string }>
  /** 구역 벽지·바닥 적용 (null = 레벨 기본으로) */
  applySurface(zone: Zone, slot: 'wallpaper' | 'floor', itemId: string | null): Promise<void>
  /** 산 가구를 맵에 꺼내 놓는다 (x·y 생략 시 빈 곳) */
  placeItem(itemId: string, x?: number, y?: number): Promise<void>
  moveItem(uid: string, x: number, y: number): Promise<void>
  /** 배치한 가구를 창고로 돌려놓는다 (칸 배치·예전 배치 둘 다) */
  storeItem(uid: string): Promise<void>
  /** 서랍의 가구를 칸에 놓는다 (floor는 1부터, rot 0~3). 막히면 거절 — 원격은 422 blocked { reason } */
  placeGridItem(itemId: string, floor: number, gx: number, gy: number, rot: number): Promise<{ uid: string }>
  /** 놓인 칸 가구를 옮기거나 돌린다. 막히면 거절 — 원격은 422 blocked { reason } */
  moveGridItem(uid: string, floor: number, gx: number, gy: number, rot: number): Promise<void>
  /** 전부 치우기: floor 0 = 건물 전체. 놓인 가구를 한 번에 서랍으로 넣고 치운 가구를 돌려준다 */
  stowAllGrid(floor: number, keepSeats: boolean): Promise<GridItem[]>
  /** 전부 치우기 되돌리기: 치우기 전 가구를 다시 놓는다 */
  restoreGridItems(items: GridItem[]): Promise<void>
  /** 직원 책상·의자 적용 (null = 기본) */
  setGear(staffId: string, slot: 'desk' | 'chair', itemId: string | null): Promise<void>
  missions(): Promise<MissionsView>
  claimMission(key: string): Promise<{ ok: boolean; message: string }>
  /** 담당자가 정해진 할 일 카드를 한꺼번에 시작(지시) */
  startTasks(taskIds: string[]): Promise<void>

  saveSchedule(schedule: Omit<Schedule, 'lastRunDate'>): Promise<void>
  deleteSchedule(scheduleId: string): Promise<void>
  runScheduleNow(scheduleId: string): Promise<void>

  chatHistory(): Promise<ChatMessage[]>
  sendChat(text: string, attachments?: Attachment[]): Promise<void>

  timeline(sinceMs: number): Promise<LogEntry[]>
  dailyReport(dateMs: number): Promise<string>
  payslip(month: string): Promise<Payslip>
  updateSettings(patch: Partial<Settings>): Promise<void>

  onSnapshot(cb: (snapshot: OfficeSnapshot) => void): () => void
  onLog(cb: (entry: LogEntry) => void): () => void
  onChat(cb: (message: ChatMessage) => void): () => void
  onFocus(cb: (staffId: string) => void): () => void
}

export const ROLE_PRESETS = ['팀장', '프론트엔드 개발자', '백엔드 개발자', '코드 리뷰어', 'QA', '기획자', '리서처', '자유 직무'] as const
export const TEAM_COLORS = ['#e8925a', '#4a7fe0', '#58b07a', '#9b6ad6', '#e0c04a', '#e05a7a', '#46b8c0', '#8a8a9c'] as const
export const HOOK_PORT = 47823
/** 자동결재 꺼짐 상태 (스냅샷을 받기 전 화면 초기값) */
export const AUTO_APPROVE_OFF: AutoApproveState = { config: { mode: 'off' }, isActive: false, endsAt: null, startsAt: null, counts: { edit: 0, command: 0, other: 0, answered: 0, waited: 0 } }

export const DEFAULT_SETTINGS: Settings = {
  monthlyBudgetUsd: 50,
  tokenBudget: { day: 0, week: 0, month: 0 },
  theme: 'wood',
  dayNight: 'auto',
  plants: 3,
  isChatterOn: true,
  workHours: { isEnabled: false, start: '09:00', end: '19:00' },
  layout: {},
  isTrayOn: true,
  isOnboarded: false,
  isWorkMode: false,
  isFullAccessNoticeSeen: false,
  language: 'auto',
}

/** 저장된(또는 옛 버전) 설정의 빈 칸을 기본값으로 채운다 — 토큰 예산이 없던 설정은 USD 예산은 두고 토큰 한도를 "제한 없음"으로 */
export function withSettingsDefaults(saved: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...saved, tokenBudget: { ...DEFAULT_SETTINGS.tokenBudget, ...saved.tokenBudget } }
}

/** 토큰 수 짧게 (999,950 이상은 반올림하면 1000.0K가 되므로 M으로 올린다) */
export function formatTokens(n: number) {
  if (n >= 999_950) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/** 레벨 n → n+1 필요 XP = 100 × n */
export function levelFromXp(xp: number) {
  let level = 1
  let need = 100
  let rest = xp
  while (rest >= need) {
    rest -= need
    level++
    need = 100 * level
  }
  return { level, progress: rest / need }
}

/** levelMax: 지금까지 오른 최고 레벨 — 레벨은 내려가지 않는다 (경험치가 그 문턱보다 적으면 진행률 0) */
export function companyFromXp(xp: number, levelMax = 1): Company {
  const level = companyLevelOf(xp, levelMax)
  const cur = COMPANY_LEVELS[level - 1].xp
  const next = COMPANY_LEVELS[level]?.xp ?? cur
  return { level, xp, nextXp: next, progress: next > cur ? Math.max(0, (xp - cur) / (next - cur)) : 1, title: COMPANY_LEVELS[level - 1].title }
}

/** 진행 중(발언 중이거나 결정 대기)인 회의 */
export const isMeetingLive = (m: Meeting) => m.status === 'running' || m.status === 'waiting'

// ── 비서 ────────────────────────────────────────────

export type SecretaryStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

/** 확인 카드의 한 단계 = OfficeApi 호출 하나 (앞 단계 결과는 "$1.id"처럼 참조) */
export interface SecretaryStep {
  method: string
  /** 하는 일 — 쉬운 말 (예: "팀 만들기 — 개발팀") */
  label: string
  /** 핵심 값 한 줄 */
  detail: string
  args: unknown[]
  status: SecretaryStepStatus
  error?: string
  /** 카드에서 고칠 수 있는 글자 값: 이름 → 지금 값 (예: { 이름: "김프론트" }) */
  editable?: Record<string, string>
  /** 실행 결과에서 뒤 단계가 참조하는 값 (id·이름) */
  result?: Record<string, string>
  /** 비서(모델)가 붙인 설명 — 보조로만 보인다. 카드의 본문(detail)은 앱이 실제 인자로 만든다 */
  note?: string
  /** 이 단계의 위험도와 이유 (인자 값으로 정한다) */
  risk?: 'normal' | 'caution' | 'danger'
  riskReason?: string
}

export interface SecretaryEdit {
  /** 무엇을 다듬는지 (예: "오큐에이 업무 지침") */
  targetLabel: string
  original: string
  revised: string
  /** 바꾼 이유 (최대 3줄) */
  reasons: string[]
  /** 적용한 뒤 원문 (복사용) */
  appliedOriginal?: string
}

export interface SecretaryCard {
  id: string
  kind: 'confirm' | 'edit'
  title: string
  steps: SecretaryStep[]
  risk: 'normal' | 'caution' | 'danger'
  /** 앱이 확인한 주의할 점 (이름 겹침·위험한 값 등) */
  warnings: string[]
  /** 비서(모델)가 적은 참고 — 앱 확인이 아니라서 따로 보인다 */
  notes?: string[]
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled' | 'expired' | 'replaced' | 'stale'
  createdAt: number
  edit?: SecretaryEdit
}

export interface SecretaryRunOptions {
  /** 실패한 단계부터 이어서 */
  fromStep?: number
  /** [고치기]로 바꾼 값: 단계 번호 → { 이름: 새 값 } */
  edits?: Record<number, Record<string, string>>
  /** 첨삭 [일부 적용]으로 고른 최종 글 */
  revised?: string
}

export interface SecretaryMessage {
  id: number
  ts: number
  role: 'me' | 'secretary' | 'notice'
  text: string
  card?: SecretaryCard
  /** 이번 답에 쓴 토큰 (도구를 여러 번 쓴 답만) */
  tokens?: number
  isError?: boolean
}

export interface SecretaryState {
  messages: SecretaryMessage[]
  isBusy: boolean
  /** 답 쓰는 중 한 줄 ("직원 목록을 보는 중…") */
  activity: string
  usageTodayTokens: number
  /** 토큰 한도에 닿아 조회·사용법만 답하는 중 */
  isLimited: boolean
}

export const EMPTY_SECRETARY: SecretaryState = { messages: [], isBusy: false, activity: '', usageTodayTokens: 0, isLimited: false }

/** 사용량(usage) 표에서 비서 몫을 가리키는 id — 직원 id와 겹치지 않는다 */
export const SECRETARY_ID = 'secretary'

/** 메뉴바 "비서에게 말하기" → 화면에 비서 빠른 창을 열라는 표시 (onFocus로 온다, 직원 id와 겹치지 않는다) */
export const SECRETARY_FOCUS = '__secretary__'
