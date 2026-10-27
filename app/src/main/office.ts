import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import { fmtDate, getLang, resolveLang, setLang, t, tx, type Lang } from '../shared/i18n/index.ts'
import {
  companyFromXp,
  COMPANY_LEVELS,
  isImageAttachment,
  isMeetingLive,
  DEFAULT_EQUIPMENT,
  levelFromXp,
  type Equipment,
  type Lab,
  type Manual,
  type ManualInput,
  type ManualKind,
  type ProcessRun,
  type ProcessStep,
  type ModelChoice,
  type ApprovalMode,
  type Attachment,
  TEAM_COLORS,
  type Approval,
  type AutoApproveState,
  type AutoHandled,
  type ChatMessage,
  type DailyRecord,
  type HireInput,
  type LogEntry,
  type LogType,
  type Meeting,
  type MeetingDecision,
  type OfficeSnapshot,
  type Payslip,
  type BudgetPeriod,
  type PeriodUsage,
  type Schedule,
  type Settings,
  type Staff,
  type StaffActivity,
  type StaffQuestion,
  type StaffStats,
  type Task,
  type TaskPlan,
  type PlanUsage,
  type Team,
  type RefDocsSaveResult,
  type RefDocTarget,
  type SecretaryState,
  SECRETARY_ID,
  PLAN_WINDOW_LABEL,
  type ChatApproval,
  ChangeFile,
  WorkRevertInfo,
} from '../shared/types'
import { buildStaffActivity } from '../shared/staffActivity'
import { answersText } from '../shared/chatApproval'
import { openResumeInTerminal } from './setup'
import { decisionSections, decisionSectionsOf, decisionsContext, delegatedPrompt, parseDelegatedChoice, recordAnswer, recordDelegated, splitDecision, withDecisionSections } from '../shared/meetingDecisions'
import { isAbsorbedOpen, matchAbsorbed, meetingCardItems, meetingResultCard, pickPlanCard } from '../shared/planTasks'
import { shouldNudgeBackground, shouldNudgeLead } from '../shared/leadNudge'
import { NO_HOLD, planHold, type HeldItem, type PlanHoldState } from '../shared/planHold'
import { detectTextQuestion, toTextQuestions } from '../shared/textQuestion'
import { mentionTargets, OFFICE_SENDER, parseMentions, pickResponder } from '../shared/mention'
import { mergeRefDocs, normalizeRefDocPath, refDocKey, refDocsPrompt, sanitizeRefDocs } from '../shared/refDocs'
import { draftCovered, isSameRule, matchRule, ruleLabel, type ApprovalRule } from '../shared/approvalRules'
import { KNOWLEDGE_MAX, knowledgeBrief, normalizeKnowledge, pickKnowledge, type KnowledgeEntry, type KnowledgeInput } from '../shared/knowledge'
import { maskSecrets } from '../shared/redact'
import { abortable, demoOutcome, addPraise, cleanSpeech, settleStaleMeeting, dateKeyOf, DEMO_COMMENT_MAX, DEMO_REACTIONS, demoPhaseMs, type DemoPhase, type DemoReaction, type DemoStage, type Praise, demoCoverImages, demoEntries, demoImages, demoLine, demoPresentInput, demoSummary, extractLinks, GALLERY_FILES_MAX, GALLERY_IMAGES_MAX, GALLERY_MAX, galleryBody, groupByStaff, isDemoDue, summarize, type GalleryEntry } from '../shared/gallery'
import { InvalidArgsError } from '../shared/errors'
import { planBoardCleanup, type BoardCleanupPlan } from '../shared/boardCleanup'
import { plansToAdvanceOnStart, shouldReopenForAnswer, tasksToReturnToTodo } from '../shared/taskResume'
import { remoteSafeEquipment } from '../shared/staffPack'
import * as shopGrid from './shopGrid'
import { MAX_FLOORS, meetingRoomOf } from '../shared/officeLevel'
import { BUDGET_PERIODS, budgetTokens, nextBudgetAlert, periodStart, pruneAlertKeys } from '../shared/budget'
import { importFile, mimeOf } from './attachments'
import type { RemoteOfficePort } from './remote/handler.ts'
import { isRemoteAutoAllowed, isRemoteManualDirAllowed, isRemoteManualScopeAllowed, isRemoteRuleBlocked } from './remoteGuard'
import { pickStaffPatch, type StaffPatch } from './staffPatch'
import { isRemoteCall, REMOTE_MARK, remoteMarked } from './remoteContext'
import * as db from './db'
import { legacyLevelOfXp } from './isoMigrate'
import type { GridItem, SeatSetPart } from '../shared/iso/furniture'
import { ExternalWatcher, upgradeAskHook } from './external'
import { customMcpList, equipmentCatalog, mcpConfigs, saveCustomMcpList, setMcpProbe } from './equipment'
import { parseCustomMcp, removeCustomMcp, upsertCustomMcp, type CustomMcpInput } from '../shared/customMcp.ts'
import { browserMcpConfig } from './browser'
import { computerMcpConfig } from './computer'
import { COMPUTER_EQUIPMENT } from '../shared/computerTools.ts'
import { BROWSER_EQUIPMENT } from '../shared/browserTools.ts'
import { parseTranslations, pendingDescriptions, slashAction, toStaffCommands, translationPrompt, type RawCommand, type StaffCommand } from '../shared/slashCommands.ts'
import { listManuals, removeManual, saveManual } from './manuals'
import {
  ACHIEVEMENTS,
  dailyMissions,
  formatWon,
  isInSeason,
  isSetComplete,
  earnedOwned,
  grantedCounts,
  LEVEL_REWARD_UNIT,
  priceOf,
  isGridCategory,
  SHOP_SETS,
  shopItem,
  TASK_BONUS,
  todayKey,
  WON_PER_TOKEN,
  type LedgerRow,
  type Metric,
  type MissionDef,
  type MissionProgress,
  type MissionsView,
  type ShopState,
  type Zone,
} from '../shared/economy'
import { HiredStaffManager } from './hired'
import { askOnce, type RateLimitInfo } from './ai'
import { probeMcpStatus, sdk } from './ai/claude'
import { defineTool, registerLocalMcp, type LocalMcpHandle } from './mcp/localMcp'
import { autoApprove, autoKindOf, autoStep, autoSummaryText, autoWindow, AWAY_ANSWER, formatRemaining, planToConfig, type AutoApprovePlan } from '../shared/autoApprove'
import { commitAll, folderState, pushAndPr, repoRoot, restoreFiles, snapshotTree, treeDiff, workBaseStillValid, workChanges } from './review'
import { readExternalDay } from './transcript'
import { Tutorial } from './tutorial'

const SCHEDULE_TICK_MS = 30_000
const CHAT_HISTORY = 300
const CHAT_TEXT_MAX = 600
/** 결재함 "자동 처리됨" 목록에 남기는 수 */
const AUTO_LOG_MAX = 300
/** 자동 승인한 MCP 호출 인자를 남기는 길이 상한 (L1) */
const AUTO_MCP_SUMMARY_MAX = 2048
/** 자동 승인이 몰릴 때 로그 저장을 묶는 간격 (L4) */
const AUTO_SAVE_DEBOUNCE_MS = 1500
/** 요약에 적는 대신 답한 질문 수 */
const AUTO_SUMMARY_ANSWERS = 5
/** 업무 카드 보고는 상세 창에서 전체를 보므로 넉넉히 남긴다 */
const TASK_RESULT_MAX = 20_000
const PLAN_CONTEXT_MAX = 8_000
const PREV_RESULT_MAX = 3_000
const LEDGER_DAYS = 60
const LEDGER_MAX = 300
/** 새로 꺼낸 가구를 놓는 자리 (맵 좌표) */
const MEETING_KEEP = 20
const DEMO_AI_TIMEOUT_MS = 30_000
/** 데모데이 발표: 직원 한 명당 머무는 시간 (회의실 연출) */
const RUN_KEEP = 40
/** 프로세스 단계 지시에 넘겨주는 이전 단계 결과 길이 */
const STEP_CONTEXT_MAX = 2500
const VERDICT_REVISE = /판정\s*[:：]\s*(revise|수정|반려)/i
/** 회의 한 번에 대표에게 묻는 결정 수 상한 */
const MEETING_DECISIONS_MAX = 3
const REPORT_TEXT_MAX = 160
const XP: Partial<Record<LogType, number>> = { result: 30, delegate: 10, approval: 5, tool: 2, instruction: 1 }
/** t가 지역 변수(업무 t 등)에 가려지는 곳용 */
const tr = t

/** 지시가 어디서 왔는지 — 턴이 끝나면 출처에 따라 보드 갱신·팀장 보고를 한다 */

type Origin = { kind: 'user' | 'chat' | 'schedule' } | { kind: 'task'; taskId: string } | { kind: 'delegate'; leadId: string } | { kind: 'process'; runId: string; stepId: string }

type Counters = Partial<Record<LogType, number>>

/** 사무실 상태의 단일 소스. 고용 직원(SDK)과 외부 직원(관찰)을 합쳐 renderer에 보낸다 */
export class Office extends EventEmitter<{
  snapshot: [OfficeSnapshot]
  log: [LogEntry]
  chat: [ChatMessage]
  /** 이미 올린 메시지가 바뀜 (결재 처리 결과) — PC 화면만 받는다 */
  chatUpdate: [ChatMessage]
  notify: [{ title: string; body: string; staffId: string }]
}> {
  private hired = new Map<string, db.StoredStaff>()
  private external: db.StoredStaff[] = []
  private teams = new Map<string, Team>()
  private labs = new Map<string, Lab>()
  private runs: ProcessRun[] = []
  private companyLevel = 0
  private tasks = new Map<string, Task>()
  /** 이번 턴에 AskUserQuestion으로 이미 물은 직원 — 글 질문 자동 등록에서 중복을 막는다 */
  private askedInTurn = new Set<string>()
  /** 글 질문으로 올린 결재 id → 직원·질문 문장 (답하면 새 지시로 보낸다) */
  private textAsks = new Map<string, { staffId: string; question: string; taskId: string | null }>()
  /** 직원별로 마지막에 글 질문으로 올린 문장 — 같은 질문을 되풀이해 올리지 않는다 */
  private lastTextAsk = new Map<string, string>()
  /** 플랜 한도 때문에 보류 중인 예약·기획 하위 업무 (다시 계산되므로 저장하지 않는다) */
  private heldJobs: (HeldItem & { parentId?: string })[] = []
  /** 대표가 "바로 시작"한 뒤 이 시각까지는 보류하지 않는다 */
  private holdBypassUntil = 0
  private meetings: Meeting[] = []
  private schedules = new Map<string, Schedule>()
  private settings!: Settings
  private counters = new Map<string, Counters>()
  /** 직원별 마지막으로 본 상태와 그 상태가 시작된 시각 */
  private statusSeen = new Map<string, { status: Staff['status']; since: number }>()
  /** 마지막으로 스냅샷을 낸 날 (자정 갱신용) */
  private snapshotDay = startOfDay(new Date())
  private origins = new Map<string, Origin[]>()
  /** 직원별로 직전에 끝낸 업무 카드 — 같은 카드의 반려 피드백이면 대화를 이어 가기 위해 */
  private lastDoneTask = new Map<string, string>()
  /** 직원별 /명령어: raw = 세션 원본(별칭·기본 명령 판정용), list = 자동완성 목록(스냅샷으로 나간다) */
  private commands = new Map<string, { raw: RawCommand[]; list: StaffCommand[] }>()
  /** 목록을 불러오는 중인 직원 (같은 요청이 겹치지 않게) */
  private commandsLoading = new Set<string>()
  /** /명령 설명 번역 (키: 원문 해시 + 언어 → 번역, null = DB에도 없음). 번역 중인 키는 원문 그대로 둔다 */
  private commandText = new Map<string, string | null>()
  private commandTextBusy = new Set<string>()
  private planUsage: PlanUsage[] = []
  private shop!: ShopState
  /** 레벨업 보상을 어디까지 챙겼는지 (매 갱신마다 DB를 두드리지 않게) */
  private rewardedLevel = 0
  /** 기본 지급을 확인한 레벨 (메모리 — 중복은 DB 키 levelgrant:{n}이 막는다) */
  private grantedLevel = 0
  /** 지금까지 오른 최고 회사 레벨 (직원을 내보내도 레벨이 내려가지 않게) */
  private companyLevelMax = 0
  /** 업무 카드는 한 사람에게 한 번에 하나씩 — 일하는 중이면 끝날 때까지 기다리는 카드 */
  private taskQueue = new Map<string, { taskId: string; context: string }[]>()
  /** 대화하려고 멈춘 직원 → 멈춘 업무 카드. 그 직원과 이야기가 끝나면 이어서 맡긴다 */
  private resumeAfterTalk = new Map<string, string[]>()
  /** 자동 점검 지시를 받은 직원 — 그 턴이 끝나면 다시 점검하지 않는다 (무한 반복 방지) */
  private autoChecked = new Set<string>()
  /** 업무 보드에서 직접 멈춘 직원 — 저절로 이어 하지 않는다 */
  private hardStops = new Set<string>()
  /** 회의 결정 대기: 결정 id → 답을 기다리는 회의 진행 */
  /** 대기 중인 회의 결정 → 답을 넣는 함수 (ended = 회의 끝내기로 풀림) */
  private pendingDecisions = new Map<string, (answer: string, ended?: boolean) => void>()
  /** 대표가 끝내라고 한 회의 — 지금 발언이 끝나면 멈춘다 */
  private meetingStops = new Map<string, 'wrapup' | 'discard'>()
  /** 데모데이가 진행 중인지 (두 번째 시작을 막는다) */
  private isDemoRunning = false
  /** 데모데이 회의별 진행 중인 AI 호출 — 끝내기 때 바로 끊는다 */
  private demoAborts = new Map<string, Set<AbortController>>()
  private budgetWarned = new Set<string>()
  private manager: HiredStaffManager
  /** 첫 업무 튜토리얼 (모의 진행 — 연습 직원은 세션 없이 대본대로) */
  readonly tutorial: Tutorial
  private watcher: ExternalWatcher
  private emitTimer: NodeJS.Timeout | null = null
  private scheduleTimer: NodeJS.Timeout | null = null
  /** 자동결재(대표 부재 중) 상태 */
  private auto: db.StoredAutoApprove = { config: { mode: 'off' }, counts: { edit: 0, command: 0, other: 0, answered: 0, waited: 0 }, wasActive: false, log: [] }
  /** 대표가 결재 옆에서 만든 "앞으로 항상 승인" 규칙 */
  private rules: ApprovalRule[] = []
  /** 회사 지식 창고 (최근에 고친 순) */
  private knowledge: KnowledgeEntry[] = []
  /** 결과물 갤러리 (끝낸 순) */
  private gallery: GalleryEntry[] = []
  /** 업무 카드를 시작한 시각 — 갤러리에 그 동안 올린 캡처만 모은다 (앱을 다시 켜면 카드 만든 시각) */
  private taskStartedAt = new Map<string, number>()
  /** 마지막 데모데이 (같은 날 두 번 열지 않고, 다음엔 그 뒤에 끝낸 업무만) */
  private demoDayLast: { date: string; at: number } | null = null
  private praise: Record<string, Praise> = {}
  /** 이번 자동결재 기간에 대신 승인해 준 쓰기의 파일 경로·이름 (그 파일을 실행하는 명령은 기다린다, H2) */
  private autoWritten = new Set<string>()
  /** 이번 기간에 package.json·Makefile을 자동 승인으로 썼는지 (이후 npm run·make 실행은 기다린다, A4) */
  private autoWroteBuildFile = false
  /**
   * 자동결재 중 직원 질문에 답하는 자리 — 비서 기획에서 이 함수를 바꿔 끼운다 (질문 → 답 표를 돌려준다).
   * 비서가 생기기 전까지는 모든 질문에 "대표 부재 중, 알아서 판단하고 진행"
   */
  /** 비서 대화·카드 — 비서(secretary.ts)가 바꿔 끼운다. 스냅샷으로 PC 화면·휴대폰에 같이 간다 */
  secretaryState: () => SecretaryState | undefined = () => undefined

  /** 비서 대화가 바뀌면 화면에 다시 보낸다 */
  secretaryChanged() {
    this.scheduleEmit()
  }

  /**
   * 자동결재 중 직원 질문에 대신 답한다 — 비서가 바꿔 끼운다. null이면 답하지 않고 대표를 기다린다(결재함 질문으로 남는다).
   * 고정 답 AWAY_ANSWER는 비서가 아예 없을 때만 (리드 결정 · 한리뷰 Round 2 B1)
   */
  answerWhileAway: (staff: Staff, questions: StaffQuestion[]) => Promise<Record<string, string> | null> = async (_staff, questions) =>
    Object.fromEntries(questions.map((q) => [q.question, AWAY_ANSWER]))

  constructor() {
    super()
    this.manager = new HiredStaffManager({
      update: (id, patch) => this.patch(id, patch),
      log: (id, type, text) => this.log(id, type, text),
      requestApproval: (a) => this.addApproval(a),
      autoDecide: (id, toolName, input, summary, questions) => this.autoDecide(id, toolName, input, summary, questions),
      cancelApproval: (id) => this.dropApproval(id, '취소됨'),
      rateLimit: (info) => this.onRateLimit(info),
      finished: (id, summary, backgroundTasks) => this.onFinished(id, summary, backgroundTasks),
      stopped: (id) => this.onStopped(id),
      officeTools: (id) => this.officeTools(id),
      context: (id) => this.teamContext(id),
      saved: (id, tokens) => db.insertSaving(id, tokens),
      usage: (id, delta) => this.addTaskUsage(id, delta),
      workStarted: (id) => void this.recordWorkStart(id),
      touched: (id, file) => this.recordTouched(id, file),
      refDocs: (id) => {
        const merged = this.refDocsFor(id)
        // 작업 폴더의 CLAUDE.md는 세션이 알아서 읽어 들이므로 안내 목록에서 뺀다 (읽기 허용 경로에는 그대로 둔다)
        const cwd = this.hired.get(id)?.cwd.replace(/[\\/]+$/, '')
        const listed = merged.docs.filter((d) => !cwd || ![`${cwd}/CLAUDE.md`, `${cwd}\\CLAUDE.md`].some((p) => refDocKey(p) === refDocKey(d.path)))
        return { prompt: refDocsPrompt({ ...merged, docs: listed }), paths: merged.docs.map((d) => d.path) }
      },
      isScreenCaptureOn: () => this.settings.isStaffCaptureOn,
      equippedMcp: (id) => {
        const s = this.hired.get(id)
        if (!s) return {}
        const catalog = mcpConfigs(s.cwd)
        return Object.fromEntries(
          s.equipment.mcpServers.flatMap((name) => {
            // 기본 장비 '브라우저': 직원별 프로필로 Playwright MCP를 붙인다 (실행 환경이 없으면 빼고 연다)
            if (name === BROWSER_EQUIPMENT) {
              const config = browserMcpConfig(s.id)
              return config ? [[name, config]] : []
            }
            // 기본 장비 '컴퓨터 조작'(맥 전용)
            if (name === COMPUTER_EQUIPMENT) {
              const config = computerMcpConfig()
              return config ? [[name, config]] : []
            }
            return catalog.has(name) ? [[name, catalog.get(name)!.config]] : []
          }),
        )
      },
      commands: (id, raw, terminalOnly) => {
        if (!this.hired.has(id)) return
        this.commands.set(id, { raw, list: toStaffCommands(raw, terminalOnly) })
        this.scheduleEmit()
        void this.translateCommands(id)
      },
    })
    this.watcher = new ExternalWatcher(
      {
        sync: (external) => {
          this.external = external
          this.scheduleEmit()
        },
        waiting: (s, message) => this.emit('notify', { title: t('notify.attention', { name: s.name }), body: message, staffId: s.id }),
        asked: (s, a) => {
          this.postChat(s.id, `질문이 있어요 ❓ ${a.summary}`.slice(0, CHAT_TEXT_MAX), undefined, { id: a.id })
          this.emit('notify', { title: t('notify.question', { name: s.name }), body: a.summary.slice(0, 120), staffId: s.id })
        },
      },
      (sessionId) => [...this.hired.values()].some((s) => s.sessionId === sessionId),
      () => new Set([...this.hired.values()].map((s) => s.deskIndex)),
    )
    this.tutorial = new Tutorial({
      hirePractice: (input) => this.hire(input, true).id,
      createPracticeTeam: (name) => {
        const team: Team = { id: crypto.randomUUID(), name, color: TEAM_COLORS[this.teams.size % TEAM_COLORS.length], leadId: null, kind: 'hired', isPractice: true }
        db.insertTeam(team)
        this.teams.set(team.id, team)
        return team
      },
      createPracticeLab: (input) => {
        const lab: Lab = { ...input, id: crypto.randomUUID(), refDocs: [] }
        this.saveLabObj(lab)
        return lab
      },
      setTeamLead: (teamId, leadId) => {
        const team = this.teams.get(teamId)
        if (!team) return
        team.leadId = leadId
        db.updateTeamRow(team)
      },
      staffExists: (id) => this.hired.has(id),
      staffName: (id) => this.hired.get(id)?.name ?? '',
      task: (id) => this.tasks.get(id),
      saveTask: (task) => this.saveTask(task),
      createPracticeTask: ({ meetingId, ...input }) => {
        const task: Task = { ...this.createTask(input), meetingId: meetingId ?? null, isPractice: true }
        this.saveTask(task)
        return task
      },
      approvePlan: (taskId) => void this.reviewPlan(taskId, true, ''),
      meeting: (id) => this.meetings.find((m) => m.id === id),
      saveMeeting: (meeting) => {
        const i = this.meetings.findIndex((m) => m.id === meeting.id)
        this.meetings = i < 0 ? [meeting, ...this.meetings].slice(0, MEETING_KEEP) : this.meetings.map((m) => (m.id === meeting.id ? meeting : m))
        db.saveMeeting(meeting)
        this.scheduleEmit()
      },
      setBubble: (staffId, text) => this.patch(staffId, { activity: text, status: text ? 'working' : 'idle' }),
      addFunds: (amount, label, key) => db.addLedger(amount, 'bonus', label, key),
      hasPracticeData: () => this.hasPracticeData(),
      clearPracticeData: () => this.clearPracticeData(),
      changed: () => this.scheduleEmit(),
    })
  }

  start() {
    this.settings = db.loadSettings()
    this.applyLanguage()
    // 재시작해도 이번 기간에 이미 보낸 예산 알림은 다시 보내지 않는다
    this.budgetWarned = new Set(pruneAlertKeys(db.loadBudgetAlerts(), new Date()))
    for (const t of db.loadTeams()) this.teams.set(t.id, t)
    for (const l of db.loadLabs()) this.labs.set(l.id, l)
    // 앱이 꺼지면 진행 중이던 단계의 지시 연결이 끊기므로, 다시 켜면 이어서 할지 확인을 받는다
    this.runs = db
      .loadRuns(RUN_KEEP)
      .map((r) => (r.status === 'running' ? { ...r, status: 'checking', pendingOutput: '앱이 다시 켜졌어요. 이 단계를 다시 진행하거나(반려·다시) 다음 단계로 넘길 수 있어요.' } : r))
    for (const t of db.loadTasks()) this.tasks.set(t.id, this.restoreTaskResult(t))
    this.planUsage = db.loadPlanUsage()
    this.auto = { ...this.auto, ...db.loadAutoApprove() }
    this.rules = db.loadApprovalRules()
    this.knowledge = db.loadKnowledge()
    this.gallery = db.loadGallery()
    this.demoDayLast = db.loadDemoDayLast()
    this.praise = db.loadPraise()
    this.shop = db.loadShop()
    this.companyLevelMax = db.loadCompanyLevelMax()
    for (const s of db.loadSchedules()) this.schedules.set(s.id, s)
    this.meetings = db.loadMeetings(MEETING_KEEP).map((m) => {
      const settled = settleStaleMeeting(m, Date.now())
      // 데모데이는 닫은 결과를 저장까지 해서 다시 켜도 진행 표시(3/7 등)가 남지 않게 한다
      if (settled !== m && m.kind === 'demo') db.saveMeeting(settled)
      return settled
    })
    for (const { staffId, type, n } of db.logCounts()) this.counters.set(staffId, { ...this.counters.get(staffId), [type]: n })
    // 저장해 둔 되돌리기 기록은 폴더가 그대로일 때만 복원한다 (꺼져 있는 동안 파일·커밋·브랜치가 바뀌었으면 버린다)
    const storedBases = [...db.loadWorkBases()]
    this.workBaseCheck = Promise.all(
      storedBases.map(async ([id, { touched, ...base }]) => {
        if (await workBaseStillValid(base)) {
          this.workBases.set(id, base)
          if (touched.length) this.touchedFiles.set(id, new Set(touched))
        } else {
          this.staleWork.add(id)
          db.removeWorkBase(id)
        }
      }),
    ).then(() => undefined)
    for (const s of db.loadHiredStaff()) {
      this.hired.set(s.id, s)
      // 익힌 매뉴얼 목록에 중복이 저장된 직원은 한 번 정리해 둔다
      if (Array.isArray(s.equipment.skills) && new Set(s.equipment.skills).size !== s.equipment.skills.length) {
        s.equipment = { ...s.equipment, skills: [...new Set(s.equipment.skills)] }
        db.saveEquipment(s.id, s.equipment)
      }
      const dir = this.workDirOf(s)
      s.cwd = dir.cwd
      s.cwdSource = dir.source
      // 연습 직원은 세션을 만들지 않는다 (지시가 가도 AI를 부르지 않게)
      if (!s.isPractice) this.manager.add(this.liveStaff(s))
    }
    // 칸 배치로 옮기기 (shop.schema가 2가 아닐 때 한 번만) — 회사 레벨이 필요해 직원·기록을 읽은 뒤에
    try {
      const c = this.company()
      this.shop = db.migrateShopToGrid(c.level, legacyLevelOfXp(c.xp))
    } catch (e) {
      console.error('[office] migrateShopToGrid', e)
    }
    // 평면이 바뀌어 바닥 밖이 된 가구는 서랍으로 (지급보다 먼저 — 새로 놓일 가구는 건드리지 않는다)
    this.settleShop(false)
    // 이미 도달한 레벨의 기본 지급 가구 (처음 한 번: Lv.1 책상·의자는 기본 자리 위치에 놓는다)
    this.grantLevelItems(this.company().level)
    this.watcher.start()
    // 예전 "질문 받기" hook은 고용 직원 질문까지 붙잡았다 — 깔려 있으면 고용 직원을 건너뛰는 명령으로 바꾼다
    try {
      upgradeAskHook()
    } catch (e) {
      console.error('[office] upgradeAskHook', e)
    }
    this.resumeTasks()
    this.tutorial.load()
    // 앱이 꺼져 있는 동안 기간이 끝났으면 켜자마자 요약한다
    this.syncAutoWindow()
    this.scheduleTimer = setInterval(() => {
      this.releaseHeldIfRecovered()
      this.runDueSchedules()
      this.runDemoDayIfDue()
      // 자동결재: 기간이 끝나면 저절로 끄고 요약, 켜져 있으면 남은 시간을 새로 보낸다
      if (this.syncAutoWindow()) this.scheduleEmit()
      // 직원 상태가 그대로면 스냅샷이 안 나가므로, 자정이 지나면 한 번 내보내 "오늘 완료"를 새로 센다
      const day = startOfDay(new Date())
      if (day !== this.snapshotDay) {
        this.snapshotDay = day
        this.scheduleEmit()
      }
    }, SCHEDULE_TICK_MS)
    this.scheduleEmit()
  }

  stop() {
    if (this.scheduleTimer) clearInterval(this.scheduleTimer)
    this.tutorial.stop()
    this.watcher.stop()
    this.manager.stopAll()
  }

  // ── 스냅샷 ────────────────────────────────────────────

  snapshot(): OfficeSnapshot {
    const monthStart = startOfMonth(new Date())
    const monthCostUsd = db.usageByStaffBetween(monthStart, Date.now() + 1).reduce((sum, r) => sum + r.c, 0)
    const projectTeams = new Map<string, Team>()
    const external = this.external.map((s) => {
      const id = `proj:${s.cwd}`
      if (!projectTeams.has(id)) projectTeams.set(id, { id, name: path.basename(s.cwd) || s.cwd, color: TEAM_COLORS[hash(s.cwd) % TEAM_COLORS.length], leadId: null, kind: 'project' })
      return { ...s, teamId: id }
    })
    return {
      staff: [...[...this.hired.values()].map((s) => this.liveStaff(s)), ...external.map((s) => this.liveStaff(s))],
      teams: [...this.teams.values(), ...projectTeams.values()],
      labs: [...this.labs.values()],
      runs: this.runs,
      company: this.company(),
      tasks: [...this.tasks.values()],
      meetings: this.meetings,
      schedules: [...this.schedules.values()],
      settings: this.settings,
      monthCostUsd,
      planUsage: this.planUsage,
      planHold: this.planHoldState(),
      funds: this.funds(),
      claimable: this.claimableCount(),
      shop: this.shop,
      autoApprove: this.autoApproveStatus(),
      secretary: this.secretaryState(),
      staffCommands: Object.fromEntries([...this.commands].map(([id, c]) => [id, c.list.map((cmd) => ({ ...cmd, localizedDescription: this.describeCommand(cmd) }))])),
      tutorial: this.tutorial.snapshot(),
    }
  }

  /** 실제 작업 폴더: 직접 지정한 폴더, 지정 안 했으면 홈 폴더(범용 — 지시에 나온 어느 프로젝트든 오간다) */
  private workDirOf(s: db.StoredStaff): { cwd: string; source: 'own' | 'none' } {
    if (s.ownCwd && fs.existsSync(s.ownCwd)) return { cwd: s.ownCwd, source: 'own' }
    return { cwd: os.homedir(), source: 'none' }
  }

  /** 작업 폴더가 바뀐 직원은 쉬는 중일 때 그 폴더에서 새 대화로 다시 연다 (일하는 중이면 끝난 뒤 다음 갱신 때) */
  private syncWorkDirs() {
    for (const s of this.hired.values()) {
      const dir = this.workDirOf(s)
      if (dir.cwd === s.cwd) {
        s.cwdSource = dir.source
        continue
      }
      if (s.status === 'working' || s.approvals.length) continue
      s.cwd = dir.cwd
      s.cwdSource = dir.source
      this.manager.resetSession(s.id)
      this.commands.delete(s.id) // 폴더마다 스킬·명령이 다르다
      this.log(s.id, 'status', t('log.cwdChanged', { dir: dir.cwd }))
    }
  }

  private liveStaff(s: db.StoredStaff): Staff {
    const meeting = this.meetings.find((m) => isMeetingLive(m) && m.participantIds.includes(s.id))
    // Worker가 같은 객체를 계속 갱신하도록 원본에 덧붙여 돌려준다
    const labIds = [...this.labs.values()].filter((l) => l.memberIds.includes(s.id)).map((l) => l.id)
    // 스냅샷을 낼 때마다 상태가 바뀌었는지 보고 바뀐 시각을 남긴다 (고용·외부 직원 공통)
    const seen = this.statusSeen.get(s.id)
    const statusSince = seen && seen.status === s.status ? seen.since : Date.now()
    if (seen?.since !== statusSince) this.statusSeen.set(s.id, { status: s.status, since: statusSince })
    const todayDone = db.resultCountBetween(s.id, startOfDay(new Date()), Date.now() + 1)
    return Object.assign(s, { stats: this.statsOf(s.id), meetingId: meeting?.id ?? null, labIds, statusSince, todayDone, praise: this.praise[s.id] }) as Staff
  }

  /** 회사 경험치 = 고용 직원 경험치 합 + 직원 1명당 100. 레벨은 지금까지 오른 최고 레벨 아래로 내려가지 않는다 */
  private company() {
    // 연습 직원은 회사 경험치에 넣지 않는다 (연습만으로 레벨·레벨업 보상이 생기지 않게)
    const hired = [...this.hired.values()].filter((s) => !s.isPractice)
    return companyFromXp(hired.reduce((sum, s) => sum + this.statsOf(s.id).xp, 0) + hired.length * 100, this.companyLevelMax)
  }

  /** 회사 레벨이 오르면 축하하고 사무실을 넓힌다 (맵은 스냅샷의 company.level로 다시 그린다) */
  private checkCompanyLevel() {
    const c = this.company()
    if (this.companyLevel && c.level > this.companyLevel) {
      this.postChat('me', `🎉 회사가 성장했어요! Lv.${c.level} ${c.title} — 사무실이 넓어졌습니다.`)
      if (!this.settings.isWorkMode) this.emit('notify', { title: t('notify.levelUp'), body: `Lv.${c.level} ${c.title}`, staffId: '' })
    }
    this.companyLevel = c.level
    if (c.level > this.companyLevelMax) {
      this.companyLevelMax = c.level
      db.saveCompanyLevelMax(c.level)
    }
    // 도달한 레벨마다 한 번씩 보상 (10단계로 바뀌기 전에 오른 레벨도 처음 켤 때 챙겨 준다)
    if (c.level > this.rewardedLevel) {
      for (let lv = 2; lv <= c.level; lv++) db.addLedger(lv * LEVEL_REWARD_UNIT, 'levelup', `Lv.${lv} ${COMPANY_LEVELS[lv - 1].title} 달성 보상`, `levelup:${lv}`)
      this.rewardedLevel = c.level
    }
    this.settleShop(true)
    this.grantLevelItems(c.level)
  }

  /** 바닥 밖·고정 칸에 걸린 가구를 서랍에 넣고 알린다. 앱 시작 때는 소식 한 줄, 레벨업 때는 알림도 (멱등 — 다시 불러도 뺄 게 없다) */
  private settleShop(isLevelUp: boolean) {
    if (this.shop.schema !== 2) return
    try {
      const { shop, count } = db.settleShopGrid(this.company().level)
      if (!count) return
      this.shop = shop
      const text = t('notify.stowedBody', { count })
      this.postChat('me', `📦 ${text}`)
      if (isLevelUp && !this.settings.isWorkMode) this.emit('notify', { title: t('notify.stowedTitle'), body: text, staffId: '' })
      this.scheduleEmit()
    } catch (e) {
      console.error('[office] settleShop', e)
    }
  }

  /** 도달한 레벨의 기본 지급 가구를 서랍에 (레벨마다 한 번). 칸 배치로 옮기기 전이면 미룬다 */
  private grantLevelItems(level: number) {
    if (level <= this.grantedLevel || this.shop.schema !== 2) return
    try {
      const next = db.grantLevelItems(level)
      this.grantedLevel = level
      if (!next) return
      this.shop = next
      this.scheduleEmit()
    } catch (e) {
      console.error('[office] grantLevelItems', e)
    }
  }

  private statsOf(id: string): StaffStats {
    const c = this.counters.get(id) ?? {}
    const xp = Object.entries(XP).reduce((sum, [type, w]) => sum + (c[type as LogType] ?? 0) * w, 0)
    return { tasksDone: c.result ?? 0, toolCalls: c.tool ?? 0, approvals: c.approval ?? 0, xp, ...levelFromXp(xp) }
  }

  // ── 직원 ──────────────────────────────────────────────

  /** isPractice: 튜토리얼 연습 직원 (세션·인사·기록 없음). 첫 실제 고용이면 남아 있는 연습 회사를 먼저 지운다 */
  hire(input: HireInput, isPractice = false): Staff {
    if (!isPractice && this.hasPracticeData()) this.tutorial.cleanup()
    const id = crypto.randomUUID()
    const hiredAt = Date.now()
    const deskIndex = this.nextDesk()
    db.insertStaff(id, input, deskIndex, hiredAt, isPractice)
    const staff: db.StoredStaff = {
      id,
      kind: 'hired',
      ...input,
      provider: input.provider ?? 'claude',
      ownCwd: input.cwd,
      sessionId: null,
      status: 'idle',
      activity: '',
      approvals: [],
      costUsd: 0,
      tokensIn: 0,
      tokensOut: 0,
      deskIndex,
      hiredAt,
      // 새 직원은 교육받은 매뉴얼만 쓴다 (매뉴얼실에서 교육)
      equipment: { ...DEFAULT_EQUIPMENT, skills: [] },
      pid: null,
      ...(isPractice ? { isPractice: true } : {}),
    }
    this.hired.set(id, staff)
    for (const labId of input.labIds ?? []) {
      const lab = this.labs.get(labId)
      if (lab) this.saveLabObj({ ...lab, memberIds: [...lab.memberIds, id] })
    }
    // 폴더를 안 고르면 홈 폴더에서 범용으로 일한다
    const dir = this.workDirOf(staff)
    staff.cwd = dir.cwd
    staff.cwdSource = dir.source
    const live = this.liveStaff(staff)
    if (isPractice) {
      this.scheduleEmit()
      return live
    }
    this.manager.add(live)
    if (input.teamId && /팀장/.test(input.role)) {
      const team = this.teams.get(input.teamId)
      if (team && !team.leadId) this.updateTeam(team.id, { leadId: id })
    }
    this.log(id, 'status', t('log.hired', { role: input.role }))
    this.postChat(id, t('chat.hiredGreeting', { role: input.role, name: input.name }))
    this.scheduleEmit()
    return live
  }

  /** 직원 대화를 Claude Code에서 이어서 연다. 일하는 중이면 막고, 열기 전에 사무실 쪽 세션을 닫아 다음 지시 때 터미널 대화까지 이어받게 한다 */
  async resumeInTerminal(staffId: string): Promise<string> {
    const s = this.hired.get(staffId)
    if (!s) return '고용 직원만 열 수 있어요.'
    if (!s.sessionId) return '아직 대화가 없어요. 한 번 지시한 뒤에 열 수 있어요.'
    if (s.status === 'working' || s.status === 'waiting') return '일하는 중에는 열 수 없어요. 일이 끝난 뒤에 열어 주세요.'
    this.manager.restart(staffId)
    await openResumeInTerminal(s.cwd, s.sessionId)
    return ''
  }

  fire(staffId: string) {
    const s = this.hired.get(staffId)
    this.manager.remove(staffId)
    this.hired.delete(staffId)
    this.commands.delete(staffId)
    db.deleteStaff(staffId)
    this.workBases.delete(staffId)
    this.staleWork.delete(staffId)
    this.touchedFiles.delete(staffId)
    for (const t of this.teams.values()) if (t.leadId === staffId) t.leadId = null
    for (const l of this.labs.values()) {
      if (l.memberIds.includes(staffId) || l.leadId === staffId) this.saveLabObj({ ...l, memberIds: l.memberIds.filter((m) => m !== staffId), leadId: l.leadId === staffId ? null : l.leadId })
    }
    for (const t of this.tasks.values()) if (t.assigneeId === staffId) t.assigneeId = null
    for (const sc of [...this.schedules.values()]) if (sc.staffId === staffId) this.schedules.delete(sc.id)
    if (s) this.postChat('me', `${s.name} 님이 퇴사했습니다.`)
    this.scheduleEmit()
  }

  updateStaff(staffId: string, input: StaffPatch) {
    const s = this.hired.get(staffId)
    if (!s) return
    // 결재 방식·장비 같은 다른 필드가 섞여 들어와도(비서 카드) 반영하지 않는다
    const patch = pickStaffPatch(input)
    db.updateStaffRow(staffId, patch)
    if (patch.teamId !== undefined && patch.teamId !== s.teamId) {
      for (const t of this.teams.values()) if (t.leadId === staffId && t.id !== patch.teamId) this.updateTeam(t.id, { leadId: null })
    }
    const { cwd, ...rest } = patch
    Object.assign(s, rest)
    if (cwd !== undefined) s.ownCwd = cwd
    // 이름·직무·모델·업무 지침은 세션을 열 때 정해지므로, 바뀌면 다음 지시부터 새 값으로 이어간다
    if (patch.systemPrompt !== undefined || patch.name !== undefined || patch.role !== undefined || patch.model !== undefined) this.manager.restart(staffId)
    this.scheduleEmit()
  }

  /** via: 원격(휴대폰)에서 온 지시면 기록 앞에 붙일 표시 (직원에게 가는 지시 글에는 넣지 않는다) */
  instruct(staffId: string, text: string, origin: Origin = { kind: 'user' }, attachments: Attachment[] = [], via = '') {
    // 직전에 끝낸 같은 카드로 돌아온 대표 피드백(검토 반려)은 새 카드가 아니다 — 대화를 이어 간다
    const isNewCard =
      origin.kind === 'task' &&
      this.lastDoneTask.get(staffId) !== origin.taskId &&
      !(this.origins.get(staffId) ?? []).some((o) => o.kind === 'task' && o.taskId === origin.taskId)
    const s = this.hired.get(staffId)
    // 연습 직원은 AI를 부르지 않는다 (튜토리얼 진행은 대본이 맡는다)
    if (!s || s.isPractice) return
    this.log(staffId, 'instruction', via ? `${via} ${text}` : text, attachments)
    if (this.handleSlash(staffId, text, origin)) return
    const origins = this.origins.get(staffId) ?? []
    // 같은 카드는 받은 업무에 한 번만 (피드백으로 다시 보낼 때도 카드는 하나)
    const isSameTask = origin.kind === 'task' && origins.some((o) => o.kind === 'task' && o.taskId === origin.taskId)
    if (!isSameTask) this.origins.set(staffId, [...origins, origin])
    this.manager.instruct(staffId, text, attachments, isNewCard)
  }

  /**
   * 앱이 직접 처리하는 /명령: /clear(새 대화)와 막힌 기본 명령(안내만). 처리했으면 true — 나머지 /명령은 세션에 그대로 간다
   */
  private handleSlash(staffId: string, text: string, origin: Origin) {
    const action = slashAction(text, this.commands.get(staffId)?.raw)
    if (action.kind !== 'clear' && action.kind !== 'blocked') return false
    const notice = action.kind === 'clear' ? t('slash.cleared') : t('slash.blocked', { name: action.name })
    if (action.kind === 'clear') {
      this.manager.resetSession(staffId)
      this.scheduleEmit()
    }
    this.log(staffId, 'status', notice)
    if (origin.kind === 'chat') this.postChat(OFFICE_SENDER, `${this.hired.get(staffId)?.name}: ${notice}`)
    return true
  }

  /** 앱 언어로 보여 줄 명령 설명 — 기본 명령은 사전, 나머지는 번역 캐시 (없으면 원문) */
  private describeCommand(cmd: StaffCommand): string {
    if (cmd.isBuiltin) return tx(`slash.desc.${cmd.name}`, cmd.description)
    return this.cachedCommandText(cmd.description, getLang()) ?? cmd.description
  }

  private cachedCommandText(text: string, lang: Lang): string | null {
    const key = commandTextKey(text, lang)
    if (!this.commandText.has(key)) this.commandText.set(key, db.loadTranslation(key))
    return this.commandText.get(key) ?? null
  }

  /** 이 직원 목록에서 아직 번역 안 된 스킬·커스텀 명령 설명을 Haiku 한 번으로 번역해 캐시하고 스냅샷을 갱신한다 */
  private async translateCommands(staffId: string) {
    const list = this.commands.get(staffId)?.list
    if (!list) return
    const lang = getLang()
    const texts = pendingDescriptions(list, lang, (text) => this.commandTextBusy.has(commandTextKey(text, lang)) || this.cachedCommandText(text, lang) !== null)
    if (!texts.length) return
    const keys = texts.map((text) => commandTextKey(text, lang))
    keys.forEach((k) => this.commandTextBusy.add(k))
    try {
      const { system, prompt } = translationPrompt(texts, lang)
      const r = await askOnce({ prompt, system, tier: 'light', cwd: os.homedir(), onRateLimit: (info) => this.onRateLimit(info) })
      this.recordUsage(staffId, r)
      const done = parseTranslations(texts, r.text)
      texts.forEach((text, i) => {
        const translated = done.get(text)
        // 실패한 설명은 이번 실행 동안 원문으로 두고 다시 묻지 않는다 (다음 실행에 한 번 더)
        this.commandText.set(keys[i], translated ?? text)
        if (translated) db.saveTranslation(keys[i], translated)
      })
    } catch {
      keys.forEach((k, i) => this.commandText.set(k, texts[i]))
    } finally {
      keys.forEach((k) => this.commandTextBusy.delete(k))
      this.scheduleEmit()
    }
  }

  /** 이 직원의 /명령어 목록이 없으면 불러온다 (결과는 스냅샷 staffCommands) */
  async loadStaffCommands(staffId: string) {
    if (!this.hired.has(staffId) || this.commands.has(staffId) || this.commandsLoading.has(staffId)) return
    this.commandsLoading.add(staffId)
    try {
      await this.manager.loadCommands(staffId)
    } catch (e) {
      this.log(staffId, 'error', t('slash.loadFailed', { error: String(e).slice(0, 120) }))
      // 빈 목록이라도 보내야 메뉴가 '불러오는 중…'에 멈추지 않는다. 다음에 세션을 열면 commands 콜백이 덮어쓴다
      if (this.hired.has(staffId) && !this.commands.has(staffId)) {
        this.commands.set(staffId, { raw: [], list: [] })
        this.scheduleEmit()
      }
    } finally {
      this.commandsLoading.delete(staffId)
    }
  }

  /** 하던 일을 멈춘다. 지시를 같이 주면 멈춘 뒤 그 지시를 바로 받는다 (끼어들기 — 하던 업무 카드는 그대로 이어 간다) */
  async interrupt(staffId: string, text?: string, attachments: Attachment[] = []) {
    const s = this.hired.get(staffId)
    if (!s) return
    if (text?.trim()) {
      this.log(staffId, 'status', t('log.interrupted'))
      this.log(staffId, 'instruction', text, attachments)
      await this.manager.interrupt(staffId, { text, attachments })
      return
    }
    await this.manager.interrupt(staffId)
    this.log(staffId, 'status', t('log.stopped'))
  }

  /** 중단된 직원의 업무 카드는 할 일로 되돌리고, 기획 하위 업무였으면 기획도 멈춰 둔다 (다음 단계가 저절로 시작되지 않게) */
  private onStopped(staffId: string) {
    this.officeMcp.get(staffId)?.dispose()
    this.officeMcp.delete(staffId)
    void this.persistWork(staffId) // 마지막 수정까지 반영한 폴더 상태로 다시 저장
    const origins = this.origins.get(staffId) ?? []
    const queued = this.taskQueue.get(staffId) ?? []
    this.origins.set(staffId, [])
    this.taskQueue.set(staffId, [])
    const taskIds = [...origins.flatMap((o) => (o.kind === 'task' ? [o.taskId] : [])), ...queued.map((q) => q.taskId)]
    for (const id of taskIds) this.returnToTodo(id)
    for (const o of origins) if (o.kind === 'process') this.stopRun(o.runId)
    // Esc·중단 버튼은 대개 말을 걸려고 멈춘 것 — 이야기가 끝나면 하던 카드(기획이면 기획째)를 이어 간다
    const isHard = this.hardStops.delete(staffId)
    if (!isHard && taskIds.length) {
      this.resumeAfterTalk.set(staffId, taskIds)
      this.postChat(staffId, '하던 일을 멈췄어요. 이야기가 끝나면 하던 업무를 이어서 할게요. (완전히 멈추려면 업무 보드에서 멈추기)')
    } else this.postChat(staffId, '하던 일을 멈췄어요. 다시 시켜 주시면 이어서 할게요.')
  }

  private returnToTodo(taskId: string) {
    const t = this.tasks.get(taskId)
    if (!t || t.status !== 'doing') return
    // 승인된 기획 카드(하위 진행·취합 중)는 기획째 멈춰 두고, 나머지는 할 일로 되돌린다
    if (t.plan?.status === 'approved') return this.pausePlan(t.id)
    // 확인 대기·다시 기획 중이던 기획안은 접는다 (결재함에 남지 않게)
    this.saveTask({ ...t, status: 'todo', plan: t.plan ? null : t.plan, updatedAt: Date.now() })
    if (t.parentId) this.pausePlan(t.parentId)
  }

  private pausePlan(taskId: string) {
    const t = this.tasks.get(taskId)
    if (!t?.plan || t.plan.status !== 'approved' || t.plan.isPaused) return
    this.saveTask({ ...t, plan: { ...t.plan, isPaused: true }, updatedAt: Date.now() })
    this.postChat('me', `⏸ "${t.title}" 기획을 멈췄어요. 업무 보드에서 "다시 진행"을 누르면 이어서 해요.`.slice(0, CHAT_TEXT_MAX))
  }

  /** 세션 쪽에서 사라진 결재는 카드도 지운다 (안 지우면 눌러도 반응 없는 카드가 남는다) */
  private dropApproval(approvalId: string, reason: string) {
    for (const s of this.hired.values()) {
      const a = s.approvals.find((x) => x.id === approvalId)
      if (!a) continue
      s.approvals = s.approvals.filter((x) => x.id !== approvalId)
      this.log(s.id, 'approval', `${reason}: ${a.toolName} ${a.summary}`)
      this.patch(s.id, { status: s.approvals.length ? 'waiting' : 'working' })
      this.settleChat({ id: approvalId, result: 'canceled' })
    }
  }

  /** 결재를 처리했으면 true (이미 끝난 결재면 false — 원격은 409로 알린다). via: 원격 표시 */
  decide(approvalId: string, allow: boolean, via = '') {
    // 글 질문 카드의 "넘기기" = 답 없이 닫기 (이미 끝난 턴이라 이어갈 도구 호출이 없다)
    if (this.textAsks.has(approvalId)) return this.closeTextAsk(approvalId, null, via)
    // 외부 직원 질문은 "넘기기" = 원래 창에서 답하도록 놓아 준다
    if (this.watcher.release(approvalId)) {
      this.settleChat({ id: approvalId, result: 'skipped' })
      return true
    }
    if (!this.manager.decide(approvalId, allow)) {
      this.dropApproval(approvalId, '이미 끝난 결재')
      return false
    }
    for (const s of this.hired.values()) {
      const a = s.approvals.find((x) => x.id === approvalId)
      if (!a) continue
      s.approvals = s.approvals.filter((x) => x.id !== approvalId)
      this.log(s.id, 'approval', `${via ? `${via} ` : ''}${allow ? t('log.approved') : t('log.rejected')}: ${a.toolName} ${a.summary}`)
      this.patch(s.id, { status: s.approvals.length ? 'waiting' : 'working' })
      // 질문을 반려 = 넘기기 (답 없이 알아서 판단)
      this.settleChat({ id: approvalId, result: a.questions ? 'skipped' : allow ? 'approved' : 'rejected' })
    }
    return true
  }

  answerQuestion(approvalId: string, answers: Record<string, string>, via = '') {
    if (this.textAsks.has(approvalId)) return this.closeTextAsk(approvalId, answers, via)
    if (!this.watcher.answer(approvalId, answers) && !this.manager.answer(approvalId, answers)) return false
    this.settleChat({ id: approvalId, result: 'answered', answer: answersText(answers) })
    for (const s of this.hired.values()) {
      const a = s.approvals.find((x) => x.id === approvalId)
      if (!a) continue
      s.approvals = s.approvals.filter((x) => x.id !== approvalId)
      this.log(
        s.id,
        'approval',
        `${via ? `${via} ` : ''}답변: ${Object.entries(answers)
          .map(([q, ans]) => `${q} → ${ans}`)
          .join(' / ')}`,
      )
      this.patch(s.id, { status: s.approvals.length ? 'waiting' : 'working' })
    }
    return true
  }

  /** 원격(휴대폰)이 사무실에 할 수 있는 일 전부 — 상태 보기·결재·질문 답·기획 확인·지시 (그 밖의 기능은 여기로 닿지 않는다) */
  /** 글 질문 카드를 닫는다. 답이 있으면 "질문 → 답"을 그 직원에게 새 지시로 보내 이어 가게 한다 */
  private closeTextAsk(approvalId: string, answers: Record<string, string> | null, via: string) {
    const ask = this.textAsks.get(approvalId)
    if (!ask) return false
    this.textAsks.delete(approvalId)
    const s = this.hired.get(ask.staffId)
    if (s) {
      const a = s.approvals.find((x) => x.id === approvalId)
      s.approvals = s.approvals.filter((x) => x.id !== approvalId)
      this.log(s.id, 'approval', `${via ? `${via} ` : ''}${answers ? `답변: ${answersText(answers)}` : t('log.rejected')}: ${a?.summary ?? ask.question}`)
      this.patch(s.id, { status: s.approvals.length ? 'waiting' : 'idle', activity: '' })
    }
    this.settleChat(answers ? { id: approvalId, result: 'answered', answer: answersText(answers) } : { id: approvalId, result: 'skipped' })
    if (answers) {
      // 질문으로 끝난 첫 턴은 카드를 검토로 넘겼다 — 답으로 이어지는 턴이 같은 카드의 결과·비용이 되게 다시 진행 중으로 돌리고 그 카드로 지시한다
      const card = ask.taskId ? this.tasks.get(ask.taskId) : undefined
      const isReopened = Boolean(card) && shouldReopenForAnswer(card)
      if (card && isReopened) this.saveTask({ ...card, status: 'doing', updatedAt: Date.now() })
      this.instruct(ask.staffId, t('staff.msg.textAnswer', { question: ask.question, answer: Object.values(answers).join(' / ') }), card && isReopened ? { kind: 'task', taskId: card.id } : { kind: 'user' })
    }
    return true
  }

  /**
   * 직원이 AskUserQuestion 없이 글로 물으며 턴을 끝냈으면 결재함 질문으로 대신 올린다.
   * 오탐·중복 방지: 이번 턴에 도구로 물었거나, 점검 턴·팀원 보고·열린 결재가 있거나, 같은 질문이 이미 올라가 있으면 안 올린다
   */
  private registerTextQuestion(staffId: string, summary: string, origins: Origin[], isAutoCheckTurn: boolean) {
    const s = this.hired.get(staffId)
    const asked = this.askedInTurn.delete(staffId)
    if (!s || asked || isAutoCheckTurn || s.approvals.length) return
    // 팀원 보고는 리드에게 가는 글이고, 예약·프로세스 단계는 대표가 지켜보지 않는다
    if (origins.some((o) => o.kind === 'delegate' || o.kind === 'process' || o.kind === 'schedule')) return
    const found = detectTextQuestion(summary)
    if (!found || this.lastTextAsk.get(staffId) === found.question) return
    this.lastTextAsk.set(staffId, found.question)
    const approval: Approval = { id: `text:${crypto.randomUUID()}`, staffId, toolName: 'AskUserQuestion', summary: found.question, createdAt: Date.now(), questions: toTextQuestions(found) }
    this.textAsks.set(approval.id, { staffId, question: found.question, taskId: origins.flatMap((o) => (o.kind === 'task' ? [o.taskId] : []))[0] ?? null })
    this.addApproval(approval)
  }

  remotePort(): RemoteOfficePort {
    return {
      view: () => ({ staff: [...this.hired.values()].map((s) => this.liveStaff(s)), tasks: [...this.tasks.values()] }),
      decide: (id, allow) => this.decide(id, allow, REMOTE_MARK),
      answerQuestion: (id, answers) => this.answerQuestion(id, answers, REMOTE_MARK),
      reviewPlan: (taskId, isApproved, feedback) => this.reviewPlan(taskId, isApproved, feedback, REMOTE_MARK),
      instruct: (staffId, text) => this.instruct(staffId, text, { kind: 'user' }, [], REMOTE_MARK),
    }
  }

  /** 멈춘 직원 진단: 읽기만 한다 (고용 직원만, 최근 24시간 기록 기준) */
  staffActivity(staffId: string): StaffActivity {
    const s = this.hired.get(staffId)
    if (!s) throw new InvalidArgsError('고용 직원만 활동을 볼 수 있어요')
    const now = Date.now()
    const queue = (this.taskQueue.get(staffId) ?? []).map((q) => ({ taskId: q.taskId, title: this.tasks.get(q.taskId)?.title ?? q.taskId }))
    return buildStaffActivity(this.liveStaff(s), db.logsSince(staffId, now - 24 * 3_600_000), queue, now)
  }

  getRecord(staffId: string): DailyRecord {
    const since = startOfDay(new Date())
    const hired = this.hired.get(staffId)
    if (hired) return { staffId, logs: db.logsSince(staffId, since), ...db.usageSince(staffId, since) }
    const ext = this.external.find((s) => s.id === staffId)
    if (!ext?.sessionId) return { staffId, logs: [], costUsd: 0, tokensIn: 0, tokensOut: 0 }
    return { staffId, costUsd: 0, ...readExternalDay(staffId, ext.cwd, ext.sessionId, since) }
  }

  private onFinished(staffId: string, summary: string, backgroundTasks: string[] = []) {
    void this.persistWork(staffId) // 마지막 수정까지 반영한 폴더 상태로 다시 저장
    const s = this.hired.get(staffId)
    if (!s) return
    const isAutoCheckTurn = this.autoChecked.delete(staffId)
    const origins = this.origins.get(staffId) ?? []
    this.origins.set(staffId, [])
    const doneTask = origins.find((o) => o.kind === 'task')
    if (doneTask && doneTask.kind === 'task') this.lastDoneTask.set(staffId, doneTask.taskId)
    else this.lastDoneTask.delete(staffId)
    const short = summary.length > CHAT_TEXT_MAX ? `${summary.slice(0, CHAT_TEXT_MAX)}…` : summary
    for (const o of origins) {
      if (o.kind === 'task') {
        const t = this.tasks.get(o.taskId)
        // 리드의 기획안이 확인 대기·하위 업무 진행 중이면 아직 끝난 게 아니다 (취합 보고가 끝나야 검토로)
        const isPlanOpen = Boolean(t?.plan) && !t?.plan?.isAggregating
        if (t && t.status === 'doing' && !isPlanOpen) {
          this.saveTask({ ...t, status: 'review', result: summary.slice(0, TASK_RESULT_MAX), updatedAt: Date.now() })
          // 리드가 취합 보고를 올리면 하위 업무·묶은 카드는 확인이 끝난 셈이다 — 대표는 이 카드 하나만 검토한다
          if (t.plan?.isAggregating) this.completeChildren(t.id)
          db.addLedger(TASK_BONUS, 'bonus', `업무 완료: ${t.title}`, `task:${t.id}`)
          void this.recordGallery(t, s, summary)
          if (t.parentId) this.advancePlan(t.parentId)
        }
      }
      if (o.kind === 'process') this.onStepDone(o.runId, o.stepId, s, summary)
      if (o.kind === 'delegate' && this.hired.has(o.leadId)) {
        this.instruct(o.leadId, t('staff.msg.memberReport', { name: s.name, role: s.role, text: short }), { kind: 'user' })
      }
    }
    this.postChat(staffId, short || t('notify.chatDone'))
    this.emit('notify', { title: t('notify.report', { name: s.name }), body: short.slice(0, 120) || t('notify.reportDone'), staffId })
    this.registerTextQuestion(staffId, summary, origins, isAutoCheckTurn)
    const queued = this.taskQueue.get(staffId) ?? []
    const nextTask = queued.shift()
    this.taskQueue.set(staffId, queued)
    if (nextTask) this.assignTask(nextTask.taskId, staffId, nextTask.context)
    else if (!origins.some((o) => o.kind === 'task')) this.resumeStopped(staffId)
    this.checkStall(staffId, summary, isAutoCheckTurn, backgroundTasks)
  }

  /**
   * 멈춤 방지: 턴이 끝나면 앱이 다시 깨우지 않으니, 백그라운드 작업을 남겼거나
   * 리드가 "맡길게요"라고만 하고 실제로 맡긴 일·승인 대기 기획안이 없으면 한 번 다시 지시한다
   */
  private checkStall(staffId: string, summary: string, isAutoCheckTurn: boolean, backgroundTasks: string[]) {
    const isBusy = (this.origins.get(staffId)?.length ?? 0) > 0
    if (shouldNudgeBackground({ isAutoCheckTurn, isBusy, backgroundTasks })) {
      this.autoChecked.add(staffId)
      this.instruct(staffId, t('staff.msg.backgroundNudge', { tasks: backgroundTasks.join(', ') }), { kind: 'user' })
      return
    }
    const delegates = this.delegatesOf(staffId)
    const memberIds = new Set(delegates.map((m) => m.id))
    const tasks = [...this.tasks.values()]
    const hasOpenDelegation =
      delegates.some((m) => (this.origins.get(m.id) ?? []).some((o) => o.kind === 'delegate' && o.leadId === staffId) || (this.taskQueue.get(m.id)?.length ?? 0) > 0) ||
      tasks.some((task) => task.assigneeId && memberIds.has(task.assigneeId) && (task.status === 'todo' || task.status === 'doing'))
    const hasWaitingPlan = tasks.some((task) => task.assigneeId === staffId && task.plan?.status === 'waiting')
    const isNudge = shouldNudgeLead({
      isLeader: delegates.length > 0,
      isAutoCheckTurn,
      isBusy,
      hasOpenDelegation,
      hasWaitingPlan,
      summary,
    })
    if (!isNudge) return
    this.autoChecked.add(staffId)
    this.instruct(staffId, t('staff.msg.leadNudge'), { kind: 'user' })
  }

  /** 대화하려고 멈췄던 업무를 이어 간다: 기획 하위 업무면 멈춘 기획을 다시 진행하고, 아니면 카드를 다시 맡긴다 */
  private resumeStopped(staffId: string) {
    const taskIds = this.resumeAfterTalk.get(staffId)
    if (!taskIds) return
    this.resumeAfterTalk.delete(staffId)
    for (const id of taskIds) {
      const t = this.tasks.get(id)
      if (!t || t.status !== 'todo' || t.assigneeId !== staffId) continue
      const parent = t.parentId ? this.tasks.get(t.parentId) : undefined
      if (parent?.plan?.isPaused) this.resumePlan(parent.id)
      else if (!t.parentId) this.assignTask(t.id, staffId)
    }
  }

  private addApproval(a: Approval) {
    const s = this.hired.get(a.staffId)
    if (!s) return
    s.approvals = [...s.approvals, a]
    if (a.questions) {
      this.patch(s.id, { status: 'waiting', activity: '대표 답변 대기' })
      this.postChat(s.id, `질문이 있어요 ❓ ${a.summary}`.slice(0, CHAT_TEXT_MAX), undefined, { id: a.id })
      this.emit('notify', { title: t('notify.question', { name: s.name }), body: a.summary.slice(0, 120), staffId: s.id })
      return
    }
    this.patch(s.id, { status: 'waiting', activity: `결재 대기: ${a.toolName}` })
    this.postChat(s.id, `결재 부탁드려요 🙏 ${a.toolName} ${a.summary}`.slice(0, CHAT_TEXT_MAX), undefined, { id: a.id })
    this.emit('notify', { title: t('notify.approval', { name: s.name }), body: `${a.toolName} ${a.summary}`.slice(0, 120), staffId: s.id })
  }

  // ── 자동결재 (대표 부재 중) ───────────────────────────

  autoApproveStatus(): AutoApproveState {
    const w = autoWindow(this.auto.config, Date.now())
    return { config: this.auto.config, ...w, counts: this.auto.counts }
  }

  /** 켜기(N시간·매일 시간대)·끄기. 켜져 있던 것을 끄면 그때까지의 요약을 보낸다 */
  setAutoApprove(plan: AutoApprovePlan): AutoApproveState {
    // 휴대폰에서는 끄기만 — 켜기·범위 넓히기는 PC에서만 (토큰만으로 결재 없이 명령이 돌지 않게)
    if (isRemoteCall()) {
      if (!isRemoteAutoAllowed(plan)) throw new InvalidArgsError('자동결재는 PC에서만 켤 수 있어요')
      this.notifyRemoteChange('notify.remoteAuto')
    }
    const config = planToConfig(plan, Date.now())
    if (!config) throw new InvalidArgsError('자동결재 기간이 맞지 않아요')
    this.auto = { ...this.auto, config }
    this.saveAuto()
    this.syncAutoWindow()
    this.scheduleEmit()
    return this.autoApproveStatus()
  }

  /** 결재함 "자동 처리됨" 목록 (최근 것부터) */
  autoApproveLog(): AutoHandled[] {
    // 명령에 섞인 비밀값은 가려서 (예전에 저장된 기록도) — 화면·휴대폰에 오래 남는다
    return [...this.auto.log].reverse().map((h) => ({ ...h, summary: maskSecrets(h.summary) }))
  }

  private saveAuto() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer)
      this.autoSaveTimer = null
    }
    db.saveAutoApprove(this.auto)
  }

  /** 자동 승인이 몰릴 때 호출마다 쓰지 않고 1.5초로 묶어 저장한다 (L4) */
  private autoSaveTimer: NodeJS.Timeout | null = null
  private saveAutoSoon() {
    if (this.autoSaveTimer) return
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null
      db.saveAutoApprove(this.auto)
    }, AUTO_SAVE_DEBOUNCE_MS)
    this.autoSaveTimer.unref?.()
  }

  /**
   * 기간에 들어가고 나가는 순간을 챙긴다: 들어가면 수를 0부터, 나가면 요약을 보내고 N시간 설정은 끈다.
   * 켜져 있으면 true (남은 시간을 화면에 다시 보내려고)
   */
  private syncAutoWindow() {
    const step = autoStep(this.auto.config, this.auto.wasActive, Date.now())
    if (step.event === 'start') {
      this.auto = { ...this.auto, wasActive: true, counts: { edit: 0, command: 0, other: 0, answered: 0, waited: 0 } }
      this.autoWritten.clear()
      this.autoWroteBuildFile = false
      const endsAt = autoWindow(step.config, Date.now()).endsAt
      const until = endsAt ? new Date(endsAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : ''
      this.postChat('me', `🤖 자동결재를 시작해요${until ? ` (${until}까지, ${formatRemaining(endsAt! - Date.now())})` : ''}. 위험 명령·푸시·외부 전송은 기다렸다가 결재함에 남겨요.`)
    } else if (step.event === 'end') this.finishAutoWindow()
    // N시간이 지났으면 설정도 끈다 (다시 켜면 새로 고른다)
    if (step.event || step.config !== this.auto.config) {
      this.auto = { ...this.auto, config: step.config }
      this.saveAuto()
    }
    return step.isActive
  }

  /** 자동결재가 끝났을 때: 단체방·알림으로 요약 (대신 답한 질문은 무엇이라 답했는지도) */
  private finishAutoWindow() {
    const c = this.auto.counts
    // "기다리는 것 N건" = 자동결재 기간에 대기로 넘긴 건수 (반려 여부와 무관, QA)
    const text = autoSummaryText({ ...c, waiting: c.waited })
    const answers = this.auto.log
      .filter((h) => h.kind === 'answer')
      .slice(-c.answered)
      .slice(-AUTO_SUMMARY_ANSWERS)
    const lines = [`🤖 자동결재를 마쳤어요 — ${text}`, ...answers.map((h) => `· ${h.staffName}: ${h.summary}`)]
    if (c.answered > answers.length) lines.push(`· 그 밖 ${c.answered - answers.length}건은 결재함 "자동 처리됨"에서 볼 수 있어요`)
    this.postChat('me', lines.join('\n').slice(0, CHAT_TEXT_MAX * 2))
    this.emit('notify', { title: t('notify.autoSummary'), body: text, staffId: '' })
    this.auto = { ...this.auto, wasActive: false }
    this.saveAuto()
  }

  /**
   * 결재 요청을 대표 대신 판정한다 (hired.ts가 결재함에 올리기 전에 부른다). 자동결재 밖이거나 기다려야 하면 null → 평소처럼 결재함.
   * 질문은 answerWhileAway로 답을 만들어 돌려준다
   */
  private autoDecide(staffId: string, toolName: string, input: Record<string, unknown>, summary: string, questions?: StaffQuestion[]): Promise<{ answers?: Record<string, string> }> | null {
    if (questions?.length) this.askedInTurn.add(staffId)
    // 대표가 만든 "앞으로 항상 승인" 규칙 — 자동결재 기간과 상관없이 (위험 명령은 matchRule이 늘 거른다)
    if (!questions?.length && matchRule(this.rules, staffId, toolName, input)) {
      this.log(staffId, 'approval', t('log.ruleApprove', { tool: toolName, summary }))
      return Promise.resolve({})
    }
    const s = this.hired.get(staffId)
    if (!s || !this.syncAutoWindow()) return null
    const record = (h: Omit<AutoHandled, 'id' | 'at' | 'staffId' | 'staffName'>) => {
      this.auto = { ...this.auto, log: [...this.auto.log, { id: crypto.randomUUID(), at: Date.now(), staffId, staffName: s.name, ...h, summary: maskSecrets(h.summary) }].slice(-AUTO_LOG_MAX) }
      this.saveAutoSoon()
      this.scheduleEmit()
    }
    if (questions?.length) {
      // 질문을 받은 때부터 답까지 걸린 시간을 기록에 남긴다 (QA: 대신 답하기 지연 측정)
      const askedAt = Date.now()
      const took = () => `${Math.round((Date.now() - askedAt) / 1000)}초`
      return this.answerWhileAway(this.liveStaff(s), questions).then((answers) => {
        // 비서가 답하지 못했으면(위험한 질문·근거 없음·실패) 결재함에 올려 대표를 기다린다 — hired.ts는 거절된 약속을 평소 결재로 받는다
        if (!answers) {
          this.auto.counts = { ...this.auto.counts, waited: this.auto.counts.waited + 1 }
          this.saveAutoSoon()
          this.log(staffId, 'approval', t('log.autoWait', { took: took() }))
          throw new Error('대표를 기다림')
        }
        const text = Object.entries(answers)
          .map(([q, a]) => `${q} → ${a}`)
          .join(' / ')
        this.auto.counts = { ...this.auto.counts, answered: this.auto.counts.answered + 1 }
        record({ kind: 'answer', toolName, summary: `${text} (${took()})`, category: 'other' })
        this.log(staffId, 'approval', t('log.autoAnswer', { took: took(), text }))
        return { answers }
      })
    }
    // 자동결재 중에 직원이 쓴 파일을 실행하는 명령은 기다린다 (H2 — 승인된 쓰기 + 실행으로 대기 규칙을 우회하지 못하게)
    const command = toolName === 'Bash' && typeof input.command === 'string' ? input.command : ''
    const runsWrittenFile = command !== '' && [...this.autoWritten].some((p) => p && command.includes(p))
    // A4: package.json·Makefile 쓰기는 허용하되, 그 기간에 쓴 뒤 npm run·make 등으로 실행하면 기다린다 (스크립트에 푸시·배포를 심을 수 있어서)
    const runsBuildFile = command !== '' && this.autoWroteBuildFile && /(^|[^\w.])(npm|pnpm|yarn|bun|npx|make|rake|gradle|mvn|\.\/gradlew|\.\/mvnw)(\s|$)/.test(command)
    if (runsWrittenFile || runsBuildFile || autoApprove(toolName, input) === 'wait') {
      // 대기로 넘긴 건수 — 요약의 "기다리는 것 N건"
      this.auto.counts = { ...this.auto.counts, waited: this.auto.counts.waited + 1 }
      this.saveAutoSoon()
      return null
    }
    // 자동 승인한 쓰기의 파일 경로·이름을 기억해 둔다 (위에서 실행 명령을 걸러내려고)
    if (autoKindOf(toolName) === 'edit') {
      const p = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
      if (p) {
        this.autoWritten.add(p)
        const b = p.split('/').pop()
        if (b) this.autoWritten.add(b)
        // 빌드 설정 파일을 썼으면 기억 (이후 npm run·make 실행은 기다림, A4)
        if (b === 'package.json' || b === 'Makefile' || b === 'makefile') this.autoWroteBuildFile = true
      }
    }
    const category = autoKindOf(toolName)
    this.auto.counts = { ...this.auto.counts, [category]: this.auto.counts[category] + 1 }
    // 자동 승인한 MCP 호출은 인자를 2KB까지 남긴다 (L1 — 짧은 요약으로 묻히지 않게)
    const logSummary = toolName.startsWith('mcp__') ? `${summary} ${JSON.stringify(input)}`.slice(0, AUTO_MCP_SUMMARY_MAX) : summary
    record({ kind: 'approval', toolName, summary: logSummary, category })
    this.log(staffId, 'approval', t('log.autoApprove', { tool: toolName, summary }))
    return Promise.resolve({})
  }

  // ── 앞으로 항상 승인 규칙 ──────────────────────────

  /** 규칙 목록 (해고한 직원의 규칙은 빼고) */
  approvalRules(): ApprovalRule[] {
    return this.rules.filter((r) => this.hired.has(r.staffId))
  }

  /** 결재를 승인하면서 규칙을 만든다. 같은 규칙에 들어가는 이 직원의 다른 대기 결재도 함께 승인한다 */
  approveAlways(approvalId: string, via = '') {
    const s = [...this.hired.values()].find((x) => x.approvals.some((a) => a.id === approvalId))
    const draft = s?.approvals.find((a) => a.id === approvalId)?.alwaysRule
    if (!s || !draft) return false
    // 휴대폰에서는 승인만 — Bash 규칙은 만들지 않는다 (한 번 누른 승인이 앞으로의 모든 명령 허가가 되지 않게)
    if (isRemoteCall() && isRemoteRuleBlocked(draft.toolName)) return this.decide(approvalId, true, via)
    if (!this.rules.some((r) => isSameRule(r, { ...draft, staffId: s.id }))) {
      this.rules = [...this.rules, { id: crypto.randomUUID(), staffId: s.id, toolName: draft.toolName, patterns: draft.patterns, createdAt: Date.now() }]
      db.saveApprovalRules(this.rules)
      this.log(s.id, 'approval', t('log.ruleAdded', { rule: ruleLabel(draft) }))
      this.notifyRemoteChange('notify.remoteRule')
    }
    const covered = s.approvals.filter((a) => a.alwaysRule && draftCovered(this.rules, s.id, a.alwaysRule)).map((a) => a.id)
    let isDone = false
    for (const id of covered) {
      const ok = this.decide(id, true, via)
      if (id === approvalId) isDone = ok
    }
    return isDone
  }

  deleteApprovalRule(ruleId: string) {
    // 해고한 직원의 규칙도 이때 함께 정리한다
    this.rules = this.rules.filter((r) => r.id !== ruleId && this.hired.has(r.staffId))
    db.saveApprovalRules(this.rules)
    this.notifyRemoteChange('notify.remoteRule')
  }

  // ── 회사 지식 창고 ─────────────────────────────────

  knowledgeList(): KnowledgeEntry[] {
    return this.knowledge
  }

  /** 쓰기·고치기 (id가 있으면 고치기). by = 남긴 직원 (대표가 쓰면 null) */
  saveKnowledge(input: KnowledgeInput, by: db.StoredStaff | null = null): KnowledgeEntry {
    const n = normalizeKnowledge(input)
    if (!n) throw new InvalidArgsError(t('knowledge.error.invalid'))
    const docPath = n.docPath ? normalizeRefDocPath(n.docPath, os.homedir()) : null
    if (n.docPath && !docPath) throw new InvalidArgsError(t('knowledge.error.docPath'))
    const prev = n.id ? this.knowledge.find((e) => e.id === n.id) : undefined
    if (n.id && !prev) throw new InvalidArgsError(t('knowledge.error.missing'))
    const now = Date.now()
    const fields = { kind: n.kind, title: n.title, body: n.body, tags: n.tags, docPath }
    const entry: KnowledgeEntry = prev ? { ...prev, ...fields, updatedAt: now } : { id: crypto.randomUUID(), ...fields, staffId: by?.id ?? null, staffName: by?.name ?? '', createdAt: now, updatedAt: now }
    db.saveKnowledgeRow(entry)
    const all = [entry, ...this.knowledge.filter((e) => e.id !== entry.id)]
    // 상한을 넘으면 오래 손대지 않은 것부터 지운다
    for (const old of all.slice(KNOWLEDGE_MAX)) db.deleteKnowledgeRow(old.id)
    this.knowledge = all.slice(0, KNOWLEDGE_MAX)
    return entry
  }

  deleteKnowledge(id: string) {
    this.knowledge = this.knowledge.filter((e) => e.id !== id)
    db.deleteKnowledgeRow(id)
  }

  /** 대표 피드백·결정을 지식 창고에 남긴다 (비었거나 맞지 않으면 조용히 넘어간다) */
  private rememberKnowledge(input: KnowledgeInput) {
    try {
      this.saveKnowledge(input)
    } catch {
      // 지식 창고에 못 남겨도 피드백·결정 자체는 그대로 전달된다
    }
  }

  /** 메뉴바 "전체 멈추기": 일하는 직원을 모두 멈춘다 (업무 카드는 할 일로 — 저절로 이어 하지 않는다) */
  stopAllWork() {
    const working = [...this.hired.values()].filter((s) => s.status === 'working' || s.status === 'waiting')
    for (const s of working) {
      this.hardStops.add(s.id)
      void this.interrupt(s.id)
    }
    // 비상 정지 — 자동결재도 함께 끈다 (멈춘 직후 들어오는 예약·휴대폰 지시가 다시 자동 승인되지 않게, M4)
    const autoWasOn = this.auto.config.mode !== 'off'
    if (autoWasOn) this.setAutoApprove({ mode: 'off' })
    return { stopped: working.length, autoWasOn }
  }

  /** 메뉴바 요약: 오늘 끝낸 업무 수·오늘 비용 */
  todaySummary() {
    const since = startOfDay(new Date())
    const done = [...this.hired.values()].reduce((n, s) => n + db.resultCountBetween(s.id, since, Date.now() + 1), 0)
    return { done, costUsd: db.usageTotalBetween(since, Date.now() + 1).costUsd }
  }

  // ── 팀 ────────────────────────────────────────────────

  createTeam(name: string, color: string): Team {
    const team: Team = { id: crypto.randomUUID(), name, color, leadId: null, kind: 'hired' }
    db.insertTeam(team)
    this.teams.set(team.id, team)
    this.scheduleEmit()
    return team
  }

  updateTeam(teamId: string, patch: { name?: string; color?: string; leadId?: string | null; floor?: number }) {
    const t = this.teams.get(teamId)
    if (!t) return
    // 층은 가장 큰 건물의 층수 안에서만 저장한다 (지금 레벨에 없는 층은 그릴 때 1층으로 보정 — 레벨 미리보기로도 미리 정해 둘 수 있게)
    if (patch.floor !== undefined && !(Number.isInteger(patch.floor) && patch.floor >= 1 && patch.floor <= MAX_FLOORS)) delete patch.floor
    Object.assign(t, patch)
    db.updateTeamRow(t)
    if (patch.leadId) {
      const lead = this.hired.get(patch.leadId)
      if (lead && lead.teamId !== teamId) this.updateStaff(lead.id, { teamId })
      if (lead) this.postChat('me', `${lead.name} 님을 ${t.name} 팀장으로 임명했습니다.`)
    }
    this.scheduleEmit()
  }

  deleteTeam(teamId: string) {
    db.deleteTeamRow(teamId)
    this.teams.delete(teamId)
    for (const s of this.hired.values()) if (s.teamId === teamId) s.teamId = null
    for (const t of this.tasks.values()) if (t.teamId === teamId) t.teamId = null
    this.scheduleEmit()
  }

  /** from 팀의 직원·카드를 into 팀으로 옮긴 뒤 from 팀을 없앤다 (비서 '팀 합치기' 한 장의 카드) */
  mergeTeams(fromTeamId: string, intoTeamId: string) {
    const from = this.teams.get(fromTeamId)
    const into = this.teams.get(intoTeamId)
    if (!from || !into || from.id === into.id || from.kind !== 'hired' || into.kind !== 'hired') throw new InvalidArgsError('합칠 팀 두 개를 골라 주세요')
    if (from.isPractice || into.isPractice) throw new InvalidArgsError('연습 팀은 합칠 수 없어요')
    const members = this.membersOf(from.id)
    for (const s of members) this.updateStaff(s.id, { teamId: into.id })
    const tasks = [...this.tasks.values()].filter((x) => x.teamId === from.id)
    for (const x of tasks) this.saveTask({ ...x, teamId: into.id })
    this.deleteTeam(from.id)
    this.postChat('me', t('org.mergeTeams.chat', { from: from.name, into: into.name, n: members.length }))
    return { movedStaff: members.length, movedTasks: tasks.length }
  }

  /** 직원 배치 바꾸기 — 팀 옮기기와 랩 넣고 빼기 (랩은 더하고 빼기만이라 여러 직원을 묶어 옮겨도 서로 덮어쓰지 않는다) */
  moveStaff(staffId: string, move: { teamId?: string | null; joinLabIds?: string[]; leaveLabIds?: string[] }) {
    const s = this.hired.get(staffId)
    if (!s) throw new InvalidArgsError('직원을 찾지 못했어요')
    if (s.isPractice) throw new InvalidArgsError('연습 직원은 옮길 수 없어요')
    if (move.teamId && !this.teams.get(move.teamId)) throw new InvalidArgsError('옮길 팀을 찾지 못했어요')
    if (move.teamId !== undefined && move.teamId !== s.teamId) this.updateStaff(staffId, { teamId: move.teamId })
    for (const id of move.joinLabIds ?? []) {
      const lab = this.labs.get(id)
      if (lab && !lab.isPractice && !lab.memberIds.includes(staffId)) this.saveLabObj({ ...lab, memberIds: [...lab.memberIds, staffId] })
    }
    for (const id of move.leaveLabIds ?? []) {
      const lab = this.labs.get(id)
      if (lab?.memberIds.includes(staffId)) this.saveLabObj({ ...lab, memberIds: lab.memberIds.filter((m) => m !== staffId), leadId: lab.leadId === staffId ? null : lab.leadId })
    }
  }

  private teamOf(staffId: string) {
    const s = this.hired.get(staffId)
    return s?.teamId ? this.teams.get(s.teamId) : undefined
  }

  private membersOf(teamId: string) {
    return [...this.hired.values()].filter((s) => s.teamId === teamId)
  }

  private labsOf(staffId: string) {
    return [...this.labs.values()].filter((l) => l.memberIds.includes(staffId) || l.leadId === staffId)
  }

  /** 이 직원의 리드: 참여한 랩의 리드, 없으면 팀장. 스스로 랩 리드면 없음 */
  private leadOf(staffId: string): string | null {
    if ([...this.labs.values()].some((l) => l.leadId === staffId)) return null
    const labLead = this.labsOf(staffId).find((l) => l.leadId && l.leadId !== staffId && this.hired.has(l.leadId))?.leadId
    if (labLead) return labLead
    const teamLead = this.teamOf(staffId)?.leadId
    return teamLead && teamLead !== staffId && this.hired.has(teamLead) ? teamLead : null
  }

  /** 이 직원이 일을 맡길 수 있는 사람: 팀장이면 팀원, 랩 리드면 랩 멤버 */
  private delegatesOf(staffId: string) {
    const out = new Map<string, db.StoredStaff>()
    const team = this.teamOf(staffId)
    if (team?.leadId === staffId) for (const m of this.membersOf(team.id)) out.set(m.id, m)
    for (const lab of this.labs.values()) {
      if (lab.leadId !== staffId) continue
      for (const id of lab.memberIds) {
        const m = this.hired.get(id)
        if (m) out.set(m.id, m)
      }
    }
    out.delete(staffId)
    return [...out.values()]
  }

  private teamContext(staffId: string) {
    const team = this.teamOf(staffId)
    const labs = this.labsOf(staffId)
    const lines = [t('staff.ctx.intro')]
    if (team) lines.push(t('staff.ctx.team', { name: team.name, lead: team.leadId === staffId ? t('staff.ctx.leadTeam') : '' }))
    for (const lab of labs)
      lines.push(
        t('staff.ctx.lab', {
          name: lab.name,
          lead: lab.leadId === staffId ? t('staff.ctx.leadLab') : '',
          goal: lab.goal || t('staff.ctx.goalNone'),
          cwd: lab.cwd ? t('staff.ctx.labCwd', { cwd: lab.cwd }) : '',
        }),
      )
    if (!this.hired.get(staffId)?.ownCwd) lines.push(t('staff.ctx.noCwd'))
    lines.push(this.delegatesOf(staffId).length ? t('staff.ctx.leaderGuide') : t('staff.ctx.memberGuide'))
    lines.push(t('staff.ctx.askGuide'))
    return lines.join('\n')
  }

  /** 직원별 사무실 MCP 등록 (해고·종료 때 토큰을 폐기한다) */
  private officeMcp = new Map<string, LocalMcpHandle>()

  /** 직원 세션에 붙는 사무실 MCP 서버 (로컬 HTTP, 직원별 토큰) */
  private officeTools(staffId: string) {
    const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
    const describe = (m: db.StoredStaff) => `- ${m.name} (${m.role}): ${m.status}${m.activity ? ` — ${m.activity}` : ''}`
    const handle = registerLocalMcp(staffId, 'office', [
        defineTool('team', t('staff.tool.team.desc'), {}, async () => {
          const team = this.teamOf(staffId)
          const parts: string[] = []
          if (team)
            parts.push(
              `${t('staff.tool.team.teamHeader', { name: team.name })}\n${this.membersOf(team.id)
                .map((m) => `${describe(m)}${team.leadId === m.id ? t('staff.tool.team.tagLead') : ''}`)
                .join('\n')}`,
            )
          for (const lab of this.labsOf(staffId)) {
            const members = lab.memberIds.map((id) => this.hired.get(id)).filter((m): m is db.StoredStaff => Boolean(m))
            parts.push(`${t('staff.tool.team.labHeader', { name: lab.name, goal: lab.goal || t('staff.ctx.goalNone') })}\n${members.map((m) => `${describe(m)}${lab.leadId === m.id ? t('staff.tool.team.tagLabLead') : ''}`).join('\n')}`)
          }
          return text(parts.join('\n\n') || t('staff.tool.team.none'))
        }),
        defineTool(
          'delegate',
          t('staff.tool.delegate.desc'),
          { member: z.string().describe(t('staff.tool.delegate.member')), instruction: z.string().describe(t('staff.tool.delegate.instruction')) },
          async ({ member, instruction }) => {
            const candidates = this.delegatesOf(staffId)
            if (candidates.length === 0) return text(t('staff.tool.delegate.notLeader'))
            const target = candidates.find((m) => m.name === member)
            if (!target) return text(t('staff.tool.notFound', { name: member }))
            const lead = this.hired.get(staffId)!
            this.log(staffId, 'delegate', t('log.delegate', { name: target.name, text: instruction }))
            this.postChat(staffId, `@${target.name} ${instruction}`.slice(0, CHAT_TEXT_MAX))
            this.instruct(target.id, t('staff.msg.delegated', { lead: lead.name, instruction }), { kind: 'delegate', leadId: staffId })
            return text(t('staff.tool.delegate.done', { name: target.name }))
          },
        ),
        defineTool(
          'save_learning',
          t('staff.tool.learning.desc'),
          { title: z.string().describe(t('staff.tool.learning.title')), body: z.string().describe(t('staff.tool.learning.body')), tags: z.array(z.string()).optional().describe(t('staff.tool.learning.tags')) },
          async ({ title, body, tags }) => {
            try {
              const entry = this.saveKnowledge({ kind: 'learning', title, body, tags }, this.hired.get(staffId) ?? null)
              this.log(staffId, 'status', t('log.learningSaved', { title: entry.title }))
              return text(t('staff.tool.learning.done'))
            } catch {
              return text(t('staff.tool.learning.invalid'))
            }
          },
        ),
        defineTool(
          'report_image',
          t('staff.tool.image.desc'),
          { path: z.string().describe(t('staff.tool.image.path')), caption: z.string().describe(t('staff.tool.caption')) },
          async ({ path: file, caption }) => {
            if (!fs.existsSync(file) || !mimeOf(file).startsWith('image/')) return text(t('staff.tool.image.missing'))
            const att = importFile(file)
            this.log(staffId, 'reply', caption, [att])
            this.postChat(staffId, caption, [att])
            return text(t('staff.tool.image.done'))
          },
        ),
        defineTool(
          'capture_screen',
          t('staff.tool.screen.desc'),
          { caption: z.string().describe(t('staff.tool.caption')) },
          async ({ caption }) => {
            // 윈도우 화면 캡처는 2차 (screencapture는 맥 전용 명령)
            if (process.platform === 'win32') return text(t('staff.tool.screen.noWin'))
            const file = path.join(os.tmpdir(), `claude-office-capture-${Date.now()}.png`)
            try {
              await new Promise<void>((resolve, reject) => execFile('screencapture', ['-x', file], (e) => (e ? reject(e) : resolve())))
            } catch {
              return text(t('staff.tool.screen.fail'))
            }
            const att = importFile(file)
            fs.rmSync(file, { force: true })
            this.log(staffId, 'reply', caption, [att])
            this.postChat(staffId, caption, [att])
            return text(t('staff.tool.screen.done'))
          },
        ),
        defineTool(
          'propose_plan',
          t('staff.tool.plan.desc'),
          {
            spec: z.string().describe(t('staff.tool.plan.spec')),
            subtasks: z
              .array(z.object({ title: z.string(), detail: z.string().describe(t('staff.tool.plan.detail')), assignee: z.string().describe(t('staff.tool.plan.assignee')) }))
              .min(1),
            task: z.string().optional().describe(t('staff.tool.plan.task', { mark: t('staff.msg.boardMark') })),
            title: z.string().optional().describe(t('staff.tool.plan.title')),
            absorbs: z.array(z.string()).optional().describe(t('staff.tool.plan.absorbs')),
          },
          async ({ spec, subtasks, task: taskTitle, title, absorbs }) => {
            const candidates = this.delegatesOf(staffId)
            if (candidates.length === 0) return text(t('staff.tool.plan.notLeader'))
            const unknown = subtasks.filter((st) => !candidates.some((m) => m.name === st.assignee)).map((st) => st.assignee)
            if (unknown.length) return text(t('staff.tool.plan.unknown', { names: unknown.join(', ') }))
            // 한 번에 여러 업무를 받았을 수 있으니 카드 제목으로 어느 업무의 기획안인지 고른다
            const myTasks = (this.origins.get(staffId) ?? []).flatMap((o) => (o.kind === 'task' && this.tasks.get(o.taskId)) || [])
            const picked = pickPlanCard(myTasks, { task: taskTitle, title })
            if ('error' in picked) return text(picked.error)
            let task = picked.card
            if (!task) {
              const lab = this.labsOf(staffId).find((l) => l.leadId === staffId) ?? null
              task = {
                ...this.createTask({
                  title:
                    title ||
                    spec
                      .split('\n')[0]
                      .replace(/^#+\s*/, '')
                      .slice(0, 60) ||
                    '리드 업무',
                  detail: '',
                  teamId: this.teamOf(staffId)?.id ?? null,
                  labId: lab?.id ?? null,
                }),
                assigneeId: staffId,
                status: 'doing',
              }
              this.origins.set(staffId, [...(this.origins.get(staffId) ?? []), { kind: 'task', taskId: task.id }])
            }
            // 회의 결과 카드에 이미 들어 있는 할 일은 따로 카드가 없다 — 못 찾았다고 알리지 않는다
            const ownItems = meetingCardItems(task.detail)
            const isOwnItem = (a: string) => ownItems.some((it) => it === a.trim() || it.includes(a.trim()) || a.includes(it))
            const absorbed = matchAbsorbed((absorbs ?? []).filter((a) => !isOwnItem(a)), [...this.tasks.values()], task.id)
            // 회의 결과 카드의 기획안이면 결정 섹션을 회의 원본으로 덮어쓴다 (회의 기록이 지워졌으면 카드에 넣어 둔 섹션)
            const meeting = task.meetingId ? this.meetings.find((x) => x.id === task.meetingId) : undefined
            const sections = meeting ? decisionSections(meeting) : task.meetingId ? decisionSectionsOf(task.detail) : null
            const plan: TaskPlan = {
              spec: sections ? withDecisionSections(spec, sections) : spec,
              subtasks: subtasks.map((st) => {
                const m = candidates.find((c) => c.name === st.assignee)!
                return { title: st.title, detail: st.detail, assigneeId: m.id, assigneeName: m.name }
              }),
              status: 'waiting',
              feedback: '',
              isAggregating: false,
              proposedAt: Date.now(),
              absorbedIds: absorbed.ids,
            }
            this.saveTask({ ...task, plan, status: 'doing', updatedAt: Date.now() })
            const lead = this.hired.get(staffId)!
            this.postChat(staffId, t('staff.tool.plan.posted', { title: task.title, n: plan.subtasks.length }))
            this.emit('notify', { title: t('notify.planConfirm', { name: lead.name }), body: task.title, staffId })
            const absorbNote = absorbs?.length
              ? `${t('staff.tool.plan.absorbFound', { n: absorbed.ids.length })}${absorbed.unmatched.length ? t('staff.tool.plan.absorbMissing', { titles: absorbed.unmatched.join(', ') }) : ''}`
              : ''
            return text(t('staff.tool.plan.asked', { note: absorbNote }))
          },
        ),
        defineTool(
          'add_task',
          t('staff.tool.add.desc'),
          { title: z.string(), detail: z.string().optional(), assignee: z.string().optional().describe(t('staff.tool.add.assignee')) },
          async ({ title, detail, assignee }) => {
            const lab = this.labsOf(staffId).find((l) => l.leadId === staffId) ?? null
            const card = this.createTask({ title, detail: detail ?? '', teamId: this.teamOf(staffId)?.id ?? null, labId: lab?.id ?? null })
            const named = assignee?.trim() ? [...this.hired.values()].find((s) => s.name === assignee.trim()) : undefined
            // 담당이 없으면 내 리드에게 (리드가 올린 카드는 보드에 남겨 두고 대표·리드가 배정)
            const toId = named?.id ?? this.leadOf(staffId)
            if (!toId) return text(t('staff.tool.add.posted', { title: card.title, note: assignee ? t('staff.tool.add.postedNoMatch', { name: assignee }) : '' }))
            this.assignTask(card.id, toId)
            return text(t('staff.tool.add.assigned', { name: this.hired.get(toId)?.name ?? '', title: card.title, note: assignee && !named ? t('staff.tool.add.sentToLead', { name: assignee }) : '' }))
          },
        ),
    ])
    this.officeMcp.set(staffId, handle)
    return handle.config
  }

  // ── 랩 ────────────────────────────────────────────────

  createLab(input: Omit<Lab, 'id' | 'refDocs' | 'isPractice'>): Lab {
    const lab: Lab = { ...input, refDocs: [], id: crypto.randomUUID(), memberIds: [...new Set([...input.memberIds, ...(input.leadId ? [input.leadId] : [])])] }
    this.saveLabObj(lab)
    const names = lab.memberIds.map((id) => this.hired.get(id)?.name).filter(Boolean)
    this.postChat('me', `🧪 ${lab.name} 랩을 꾸렸어요: ${names.join(', ')}${lab.goal ? ` — 목표: ${lab.goal}` : ''}`)
    return lab
  }

  updateLab(labId: string, patch: Partial<Omit<Lab, 'id' | 'refDocs' | 'isPractice'>>) {
    const lab = this.labs.get(labId)
    if (!lab) return
    // 참고 문서는 setRefDocs로만 바꾼다
    const next = { ...lab, ...patch, refDocs: lab.refDocs }
    if (next.leadId && !next.memberIds.includes(next.leadId)) next.memberIds = [...next.memberIds, next.leadId]
    this.saveLabObj(next)
  }

  deleteLab(labId: string) {
    db.deleteLabRow(labId)
    this.labs.delete(labId)
    for (const t of this.tasks.values()) if (t.labId === labId) t.labId = null
    this.scheduleEmit()
  }

  private saveLabObj(lab: Lab) {
    db.saveLab(lab)
    this.labs.set(lab.id, lab)
    this.scheduleEmit()
  }

  // ── 참고 문서 ─────────────────────────────────────────

  /** 직원·팀·랩의 참고 문서 목록을 통째로 바꾼다. 실제로 바뀌면 영향받는 직원 세션을 다시 연다(일하는 중이면 끝난 뒤) */
  setRefDocs(target: RefDocTarget, inputs: string[]): RefDocsSaveResult {
    const { docs, rejected } = sanitizeRefDocs(inputs, os.homedir())
    const prev = target.kind === 'staff' ? this.hired.get(target.id)?.refDocs : target.kind === 'team' ? this.teams.get(target.id)?.refDocs : this.labs.get(target.id)?.refDocs
    if (JSON.stringify(prev ?? []) === JSON.stringify(docs)) return { docs, rejected }
    const affected = new Set<string>()
    if (target.kind === 'staff') {
      const s = this.hired.get(target.id)
      if (!s) return { docs: [], rejected }
      s.refDocs = docs
      db.saveStaffRefDocs(s.id, docs)
      affected.add(s.id)
    } else if (target.kind === 'team') {
      const t = this.teams.get(target.id)
      if (!t) return { docs: [], rejected }
      t.refDocs = docs
      db.updateTeamRow(t)
      for (const m of this.membersOf(t.id)) affected.add(m.id)
    } else {
      const lab = this.labs.get(target.id)
      if (!lab) return { docs: [], rejected }
      this.saveLabObj({ ...lab, refDocs: docs })
      for (const id of [...lab.memberIds, ...(lab.leadId ? [lab.leadId] : [])]) affected.add(id)
    }
    for (const id of affected) this.manager.restart(id)
    this.scheduleEmit()
    return { docs, rejected }
  }

  /** 세션을 열 때 이 직원에게 닿는 참고 문서: 개인 → 팀 → 랩 순, 없는 파일은 빼고 합계 상한까지 */
  private refDocsFor(staffId: string) {
    const team = this.teamOf(staffId)
    return mergeRefDocs(
      [
        { label: '개인', docs: this.hired.get(staffId)?.refDocs ?? [] },
        ...(team ? [{ label: `팀 ${team.name}`, docs: team.refDocs ?? [] }] : []),
        ...this.labsOf(staffId).map((l) => ({ label: `랩 ${l.name}`, docs: l.refDocs ?? [] })),
      ],
      isFile,
    )
  }

  missingFiles(paths: string[]) {
    return paths.filter((p) => !isFile(p))
  }

  // ── 외부 직원: 해고·정식 채용 ─────────────────────────

  /** 외부 Claude Code 프로세스를 끝낸다 (원래 창의 작업도 멈춘다) */
  fireExternal(staffId: string) {
    const s = this.external.find((x) => x.id === staffId)
    if (!s?.pid) return false
    try {
      process.kill(s.pid, 'SIGTERM')
    } catch {
      return false
    }
    this.postChat('me', `${s.name} 세션을 종료했습니다.`)
    return true
  }

  /** 외부 세션을 사무실 직원으로 데려와 같은 대화를 이어받는다. 원래 프로세스는 먼저 끝낸다 */
  recruitExternal(staffId: string, input: { role: string; model: ModelChoice; teamId: string | null; approvalMode: ApprovalMode }) {
    const s = this.external.find((x) => x.id === staffId)
    if (!s?.sessionId) return null
    if (s.pid) {
      try {
        process.kill(s.pid, 'SIGTERM')
      } catch {
        // 이미 끝난 프로세스
      }
    }
    const staff = this.hire({ name: s.name, role: input.role, avatar: s.avatar, model: input.model, cwd: s.cwd, systemPrompt: '', approvalMode: input.approvalMode, teamId: input.teamId })
    db.saveSessionId(staff.id, s.sessionId)
    const stored = this.hired.get(staff.id)!
    stored.sessionId = s.sessionId
    this.log(staff.id, 'status', t('log.externalHired'))
    this.scheduleEmit()
    return this.liveStaff(stored)
  }

  /** 외부 직원의 대화를 복사(포크)한 분신을 고용해 지시한다. 원래 창의 대화·프로세스는 건드리지 않는다 */
  async forkExternal(staffId: string, text: string, attachments: Attachment[] = []) {
    const s = this.external.find((x) => x.id === staffId)
    if (!s?.sessionId) return null
    const fork = await sdk.forkSession(s.sessionId, { dir: s.cwd, title: `${s.name} (사무실 분신)` })
    const clone = this.hire({ name: `${s.name}·분신`, role: '분신', avatar: s.avatar, model: 'default', cwd: s.cwd, systemPrompt: '', approvalMode: 'ask', teamId: null })
    db.saveSessionId(clone.id, fork.sessionId)
    const stored = this.hired.get(clone.id)!
    stored.sessionId = fork.sessionId
    this.log(clone.id, 'status', t('log.cloned', { name: s.name }))
    this.instruct(clone.id, text, { kind: 'user' }, attachments)
    return this.liveStaff(stored)
  }

  // ── 업무 매뉴얼 ───────────────────────────────────────

  /** 매뉴얼을 찾을 프로젝트 폴더: 고용 직원·랩의 작업 폴더 */
  private projectDirs() {
    return [...[...this.hired.values()].map((s) => s.cwd), ...[...this.labs.values()].flatMap((l) => (l.cwd ? [l.cwd] : []))].filter((d) => fs.existsSync(d))
  }

  listManuals(): Manual[] {
    return listManuals(this.projectDirs())
  }

  saveManual(input: ManualInput, previousPath?: string) {
    // 휴대폰에서 프로젝트 매뉴얼은 등록된 랩 폴더(또는 고치는 매뉴얼이 이미 있는 폴더)에만 — 아무 폴더에 파일을 만들지 못하게
    if (isRemoteCall()) {
      // 전역 매뉴얼(~/.claude/skills)은 모든 프로젝트에 영향 — 만들기·고치기·프로젝트로 옮기기 모두 PC에서만
      const prev = previousPath ? this.listManuals().find((x) => x.path === previousPath) : undefined
      if (!isRemoteManualScopeAllowed(input.scope, prev?.scope)) throw new InvalidArgsError('전역 매뉴얼은 PC에서 해 주세요 (프로젝트·랩 폴더 매뉴얼만 휴대폰에서 할 수 있어요)')
    }
    if (isRemoteCall() && input.scope === 'project') {
      const own = previousPath ? this.listManuals().find((x) => x.path === previousPath)?.projectDir : null
      const labDirs = [...this.labs.values()].flatMap((l) => (l.cwd ? [l.cwd] : []))
      const isAllowed = isRemoteManualDirAllowed(input.projectDir, labDirs, own)
      if (!isAllowed) throw new InvalidArgsError('매뉴얼은 등록된 랩 폴더에만 만들 수 있어요')
    }
    const m = saveManual(input, previousPath)
    this.scheduleEmit()
    return m
  }

  deleteManual(file: string) {
    const m = this.listManuals().find((x) => x.path === file)
    removeManual(file)
    if (m) {
      for (const s of this.hired.values())
        if (Array.isArray(s.equipment.skills) && s.equipment.skills.includes(m.name)) this.setEquipment(s.id, { ...s.equipment, skills: s.equipment.skills.filter((n) => n !== m.name) })
      this.trainGroups(m.name, [], [])
    }
  }

  /** 직원에게 매뉴얼 초안을 맡긴다 — 파일은 쓰지 않고 양식에 채울 내용만 돌려준다 */
  async draftManual(staffId: string, request: string, kind: ManualKind) {
    const s = this.hired.get(staffId)
    if (!s) throw new Error('직원을 찾을 수 없어요.')
    const roles = [...new Set([...this.hired.values()].map((x) => x.role))].join(', ')
    const r = await askOnce({
      cwd: s.cwd,
      tier: 'standard',
      model: s.model,
      system: `당신은 ${s.name}(${s.role})입니다. ${s.systemPrompt}\n회사 업무 매뉴얼(Claude Code 스킬)을 작성합니다. 바로 따라 할 수 있게 구체적으로 씁니다.\n${t('staff.language')}`,
      prompt: [
        `요청: ${request}`,
        kind === 'process'
          ? `여러 사람이 차례로 넘겨받는 "프로세스 매뉴얼"을 만드세요. 사무실 직무 목록: ${roles}. 각 단계 role은 위 직무에 들어 있는 짧은 키워드(예: "기획자", "리뷰어", "QA", "팀장")로 쓰세요. 리뷰·QA처럼 되돌려 보낼 수 있는 단계는 onRevise에 되돌아갈 단계 id를 쓰세요.`
          : '한 사람이 이 일을 어떤 순서로 하는지 적은 "개인 매뉴얼"을 만드세요.',
        '아래 JSON 하나만 출력하세요 (코드 블록 없이):',
        '{"name":"영문-소문자-하이픈","description":"언제 쓰는지 한두 문장","body":"마크다운 본문(절차·주의점)","steps":[{"id":"s1","title":"단계 이름","role":"직무 키워드","instruction":"이 단계 담당에게 줄 지시","needsMyCheck":false,"onRevise":null,"maxLoops":2}]}',
        kind === 'personal' ? 'steps는 빈 배열로 두세요.' : '',
      ].join('\n'),
    })
    this.recordUsage(staffId, r)
    const json = r.text.slice(r.text.indexOf('{'), r.text.lastIndexOf('}') + 1)
    const d = JSON.parse(json) as { name: string; description: string; body: string; steps?: ProcessStep[] }
    return { name: d.name, description: d.description, body: d.body, steps: kind === 'process' ? (d.steps ?? []) : [] }
  }

  /** 개인 매뉴얼 교육: 이 매뉴얼을 쓸 수 있는 직원을 정한다 (기존 "전부 사용" 직원은 빼면 나머지 매뉴얼만 남긴다) */
  trainStaff(manualName: string, staffIds: string[]) {
    const all = this.listManuals()
      .filter((m) => m.kind === 'personal')
      .map((m) => m.name)
    for (const s of this.hired.values()) {
      const want = staffIds.includes(s.id)
      const cur = s.equipment.skills
      // 예전 목록에 같은 이름이 두 번 들어간 경우가 있어 늘 중복을 뺀다
      const list = [...new Set(cur === 'all' ? all : cur)]
      const has = cur === 'all' || cur.includes(manualName)
      if (want === has) continue
      const next = want ? [...new Set([...list, manualName])] : list.filter((n) => n !== manualName)
      this.setEquipment(s.id, { ...s.equipment, skills: next })
      if (want) this.postChat(s.id, `📘 "${manualName}" 매뉴얼 교육을 받았어요!`)
    }
  }

  /** 프로세스 매뉴얼 교육: 이 매뉴얼로 일할 랩·팀을 정한다 */
  trainGroups(manualName: string, labIds: string[], teamIds: string[]) {
    for (const l of this.labs.values()) {
      const has = (l.manuals ?? []).includes(manualName)
      const want = labIds.includes(l.id)
      if (has !== want) this.saveLabObj({ ...l, manuals: want ? [...(l.manuals ?? []), manualName] : (l.manuals ?? []).filter((n) => n !== manualName) })
    }
    for (const t of this.teams.values()) {
      const has = (t.manuals ?? []).includes(manualName)
      const want = teamIds.includes(t.id)
      if (has === want) continue
      t.manuals = want ? [...(t.manuals ?? []), manualName] : (t.manuals ?? []).filter((n) => n !== manualName)
      db.updateTeamRow(t)
    }
    this.scheduleEmit()
  }

  // ── 프로세스 실행 ─────────────────────────────────────

  private scopeMembers(scope: ProcessRun['scope']) {
    if (scope.kind === 'lab') return (this.labs.get(scope.id)?.memberIds ?? []).map((id) => this.hired.get(id)).filter((m): m is db.StoredStaff => Boolean(m))
    return this.membersOf(scope.id)
  }

  /** 단계 역할에 맞는 직원: 직무에 역할 키워드가 들어 있는 사람 중 지금 쉬는 사람 먼저 */
  private staffForStep(run: ProcessRun, step: ProcessStep) {
    const members = this.scopeMembers(run.scope)
    const key = step.role.trim().toLowerCase()
    const matches = members.filter((m) => m.role.toLowerCase().includes(key) || m.name === step.role)
    return matches.sort((a, b) => Number(a.status !== 'idle') - Number(b.status !== 'idle'))[0]
  }

  startRun(input: { manualName: string; scope: { kind: 'lab' | 'team'; id: string }; input: string; attachments?: Attachment[]; taskId?: string | null }) {
    const manual = this.listManuals().find((m) => m.name === input.manualName && m.kind === 'process')
    const scopeName = input.scope.kind === 'lab' ? this.labs.get(input.scope.id)?.name : this.teams.get(input.scope.id)?.name
    if (!manual || manual.steps.length === 0 || !scopeName) return null
    const now = Date.now()
    const run: ProcessRun = {
      id: crypto.randomUUID(),
      manualName: manual.name,
      manualTitle: manual.description.split(/[.。]/)[0] || manual.name,
      steps: manual.steps,
      scope: { ...input.scope, name: scopeName },
      input: input.input,
      attachments: input.attachments,
      taskId: input.taskId ?? null,
      status: 'running',
      stepIndex: 0,
      currentStaffId: null,
      history: [],
      loops: {},
      pendingOutput: '',
      createdAt: now,
      updatedAt: now,
    }
    this.runs = [run, ...this.runs].slice(0, RUN_KEEP)
    if (run.taskId) {
      const t = this.tasks.get(run.taskId)
      if (t) this.saveTask({ ...t, status: 'doing', updatedAt: now })
    }
    this.postChat('me', `▶️ ${scopeName}에서 "${manual.name}" 프로세스를 시작했어요 (${manual.steps.length}단계)`)
    this.runStep(run)
    return run
  }

  private saveRunObj(run: ProcessRun) {
    run.updatedAt = Date.now()
    db.saveRun(run)
    this.scheduleEmit()
  }

  private runStep(run: ProcessRun, feedback = '') {
    const step = run.steps[run.stepIndex]
    const staff = this.staffForStep(run, step)
    if (!staff) {
      run.status = 'checking'
      run.pendingOutput = `"${step.role}" 역할을 맡을 직원이 ${run.scope.name}에 없어요. 직원을 배치한 뒤 "다시"를 누르거나 다음 단계로 넘겨 주세요.`
      this.saveRunObj(run)
      return
    }
    run.status = 'running'
    run.currentStaffId = staff.id
    const projectDir = run.scope.kind === 'lab' ? this.labs.get(run.scope.id)?.cwd : null
    const recent = run.history.slice(-3).map((h) => `### ${h.staffName} (${run.steps.find((x) => x.id === h.stepId)?.title ?? h.stepId})\n${h.output.slice(0, STEP_CONTEXT_MAX)}`)
    const text = [
      `[프로세스 "${run.manualName}" · ${run.stepIndex + 1}/${run.steps.length}단계: ${step.title}]`,
      step.instruction,
      '',
      `## 일감\n${run.input}`,
      projectDir ? `\n프로젝트 폴더: ${projectDir}` : '',
      recent.length ? `\n## 앞 단계 결과\n${recent.join('\n\n')}` : '',
      feedback ? `\n## 대표 피드백 (반영해서 다시)\n${feedback}` : '',
      step.onRevise ? '\n마지막 줄에 반드시 "판정: approve" 또는 "판정: revise"를 쓰세요. revise면 무엇을 고쳐야 하는지 위에 적으세요.' : '',
    ].join('\n')
    this.saveRunObj(run)
    this.instruct(staff.id, text, { kind: 'process', runId: run.id, stepId: step.id }, run.stepIndex === 0 ? (run.attachments ?? []) : [])
  }

  private onStepDone(runId: string, stepId: string, staff: db.StoredStaff, output: string) {
    const run = this.runs.find((r) => r.id === runId)
    if (!run || run.status !== 'running') return
    const step = run.steps[run.stepIndex]
    if (!step || step.id !== stepId) return
    const isRevise = Boolean(step.onRevise) && VERDICT_REVISE.test(output)
    run.history.push({ stepId, staffId: staff.id, staffName: staff.name, output, verdict: step.onRevise ? (isRevise ? 'revise' : 'approve') : 'done', ts: Date.now() })
    if (isRevise && step.onRevise) {
      const loops = (run.loops[step.id] ?? 0) + 1
      const back = run.steps.findIndex((x) => x.id === step.onRevise)
      if (loops <= step.maxLoops && back >= 0) {
        run.loops[step.id] = loops
        run.stepIndex = back
        this.postChat(staff.id, `↩️ ${step.title}: 수정이 필요해서 "${run.steps[back].title}" 단계로 되돌려요 (${loops}/${step.maxLoops})`)
        this.runStep(run, output.slice(0, STEP_CONTEXT_MAX))
        return
      }
      return this.askCheck(run, `되돌리기를 ${step.maxLoops}번 했는데도 수정이 필요하대요. 확인해 주세요.\n\n${output}`)
    }
    if (step.needsMyCheck) return this.askCheck(run, output)
    this.advanceRun(run)
  }

  private askCheck(run: ProcessRun, output: string) {
    run.status = 'checking'
    run.pendingOutput = output
    const step = run.steps[run.stepIndex]
    this.saveRunObj(run)
    this.postChat(run.currentStaffId ?? 'me', `🙋 "${run.manualName}" ${step.title} 단계를 확인해 주세요 (업무 보드·결재함)`)
    this.emit('notify', { title: t('notify.processConfirm', { title: step.title }), body: output.slice(0, 120), staffId: run.currentStaffId ?? '' })
  }

  private advanceRun(run: ProcessRun) {
    run.stepIndex++
    if (run.stepIndex < run.steps.length) return this.runStep(run)
    run.status = 'done'
    run.currentStaffId = null
    const last = run.history.at(-1)?.output ?? ''
    if (run.taskId) {
      const t = this.tasks.get(run.taskId)
      if (t) this.saveTask({ ...t, status: 'review', result: last.slice(0, CHAT_TEXT_MAX), updatedAt: Date.now() })
    }
    this.saveRunObj(run)
    this.postChat('me', `🏁 "${run.manualName}" 프로세스를 마쳤어요 (${run.scope.name})`)
    this.emit('notify', { title: t('notify.processDone'), body: `${run.manualName} · ${run.scope.name}`, staffId: '' })
  }

  reviewRun(runId: string, approve: boolean, feedback: string) {
    const run = this.runs.find((r) => r.id === runId)
    if (!run || run.status !== 'checking') return
    run.pendingOutput = ''
    if (approve) this.advanceRun(run)
    else this.runStep(run, feedback.trim())
  }

  stopRun(runId: string) {
    const run = this.runs.find((r) => r.id === runId)
    if (!run || run.status === 'done') return
    run.status = 'stopped'
    run.currentStaffId = null
    this.saveRunObj(run)
  }

  // ── 장비 ──────────────────────────────────────────────

  equipmentCatalog(cwd: string) {
    return equipmentCatalog(cwd)
  }

  /** claude.ai 커넥터·인증 상태를 Claude에 물어 다시 확인한다 (실패하면 지난 확인·기록으로 둔다) */
  async refreshEquipment(cwd: string) {
    const status = await probeMcpStatus(cwd || os.homedir())
    if (status) {
      setMcpProbe({
        connectors: status.filter((m) => m.scope === 'claudeai' || m.source === 'claudeai').map((m) => m.name),
        needsAuth: status.filter((m) => m.status === 'needs-auth').map((m) => m.name),
      })
    }
    return { ...equipmentCatalog(cwd), ...(status ? {} : { isProbeFailed: true }) }
  }

  customMcpList() {
    return customMcpList()
  }

  saveCustomMcp(input: CustomMcpInput, prevName?: string) {
    const next = upsertCustomMcp(customMcpList(), parseCustomMcp(input, Date.now()), prevName)
    // 이름을 바꾸거나 지우면 그 이름을 지급받은 직원에게선 다음 세션부터 빠진다 (equippedMcp가 없는 이름을 건너뛴다)
    saveCustomMcpList(next)
    return next
  }

  deleteCustomMcp(name: string) {
    const next = removeCustomMcp(customMcpList(), name)
    saveCustomMcpList(next)
    return next
  }

  setEquipment(staffId: string, equipment: Equipment) {
    const s = this.hired.get(staffId)
    if (!s) return
    // 휴대폰이 보낸 값은 Bash 허용을 걸러 내고 "위험 명령 금지"를 못 빼게 한다 (PC 쪽 방어 — 가져온 장비와 같은 규칙)
    if (isRemoteCall()) {
      equipment = remoteSafeEquipment(s.equipment, equipment)
      this.notifyRemoteChange('notify.remoteEquipment', { name: s.name })
    }
    s.equipment = equipment
    db.saveEquipment(staffId, equipment)
    this.manager.restart(staffId)
    this.commands.delete(staffId) // 지급한 스킬이 바뀌면 목록도 바뀐다 — 다음에 세션을 열거나 /를 칠 때 다시 받는다
    this.log(
      staffId,
      'status',
      `장비를 바꿨습니다: MCP ${equipment.mcpServers.length}개 · 스킬 ${equipment.skills === 'all' ? '전부' : `${equipment.skills.length}개`}${equipment.monthlyBudgetUsd ? ` · 월 예산 $${equipment.monthlyBudgetUsd}` : ''}`,
    )
    this.scheduleEmit()
  }

  /** 휴대폰에서 장비·자동결재·규칙이 바뀌면 PC에 알린다 (원격 호출 안에서만) */
  private notifyRemoteChange(bodyKey: 'notify.remoteEquipment' | 'notify.remoteAuto' | 'notify.remoteRule', vars: Record<string, string> = {}) {
    if (!isRemoteCall()) return
    this.emit('notify', { title: t('notify.remoteChange'), body: t(bodyKey, vars), staffId: '' })
  }

  // ── 작업 결과 검토 ────────────────────────────────────

  private cwdOf(staffId: string) {
    const s = this.hired.get(staffId) ?? this.external.find((x) => x.id === staffId)
    return s && fs.existsSync(s.cwd) ? s.cwd : null
  }

  async workChanges(staffId: string) {
    const cwd = this.cwdOf(staffId)
    return cwd ? workChanges(cwd) : { cwd: '', isGit: false, branch: '', files: [], diff: '', hasGh: false, ahead: 0 }
  }

  // 작업 전 되돌리기: 직원별로 "일을 시작한 시점의 폴더 상태"(git 트리)와 직접 고친 파일을 기억한다 (office.db에 저장해 앱을 다시 켜도 남는다)
  private workBases = new Map<string, { cwd: string; root: string; tree: string; at: number; state?: { head: string; branch: string; snap: string } }>()
  private workBaseCheck: Promise<void> = Promise.resolve()
  /** 앱을 다시 켜는 사이 폴더가 바뀌어 기록을 버린 직원 */
  private staleWork = new Set<string>()
  private async persistWork(staffId: string) {
    const base = this.workBases.get(staffId)
    if (!base) return db.removeWorkBase(staffId)
    const touched = [...(this.touchedFiles.get(staffId) ?? [])]
    const state = (await folderState(base.cwd)) ?? undefined
    // 기다리는 사이 기록이 지워졌으면 되살리지 않는다
    if (this.workBases.get(staffId) === base) db.saveWorkBase(staffId, { ...base, state }, touched)
  }
  private touchedFiles = new Map<string, Set<string>>()

  /** 손이 빈 직원이 새 일을 받을 때 호출. 이전 일의 변경이 아직 남아 있으면 그 시점을 그대로 둔다 (그래야 한꺼번에 되돌릴 수 있다) */
  private async recordWorkStart(staffId: string) {
    const cwd = this.cwdOf(staffId)
    if (!cwd) return
    try {
      const prev = this.workBases.get(staffId)
      const now = await snapshotTree(cwd)
      const root = await repoRoot(cwd)
      if (!now || !root) return
      if (prev && prev.cwd === cwd && (await treeDiff(root, prev.tree, now)).length > 0) return
      this.workBases.set(staffId, { cwd, root, tree: now, at: Date.now() })
      this.touchedFiles.delete(staffId)
      await this.persistWork(staffId)
      this.staleWork.delete(staffId)
    } catch {
      // 기록하지 못하면 되돌리기만 쓸 수 없다
    }
  }

  private recordTouched(staffId: string, file: string) {
    const base = this.workBases.get(staffId)
    const cwd = base?.root
    if (!cwd) return
    const rel = path.relative(cwd, path.resolve(cwd, file))
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return
    const set = this.touchedFiles.get(staffId) ?? new Set<string>()
    set.add(rel.split(path.sep).join('/'))
    this.touchedFiles.set(staffId, set)
    void this.persistWork(staffId)
  }

  /** 되돌릴 파일과 건드리지 않을 파일. 같은 폴더를 쓰는 다른 직원이 있으면 이 직원이 직접 고친 파일만, 다른 직원도 고친 파일은 제외 */
  private async revertPlan(staffId: string) {
    await this.workBaseCheck
    const none = { available: false, stale: this.staleWork.has(staffId), startedAt: 0, files: [] as ChangeFile[], skipped: [] as string[], base: '', cwd: '', root: '' }
    const base = this.workBases.get(staffId)
    if (!base || !fs.existsSync(base.cwd)) return none
    const now = await snapshotTree(base.cwd)
    if (!now) return none
    const diff = await treeDiff(base.root, base.tree, now)
    const mine = this.touchedFiles.get(staffId) ?? new Set<string>()
    const others = [...this.workBases.entries()].filter(([id, b]) => id !== staffId && b.root === base.root)
    const sharesFolder = others.length > 0 || [...this.hired.values(), ...this.external].some((s) => s.id !== staffId && s.cwd.startsWith(base.root))
    const othersTouched = new Set(others.flatMap(([id]) => [...(this.touchedFiles.get(id) ?? [])]))
    const files: ChangeFile[] = []
    const skipped: string[] = []
    for (const f of diff) {
      if (!sharesFolder) files.push(f)
      else if (mine.has(f.path) && !othersTouched.has(f.path)) files.push(f)
      else skipped.push(f.path)
    }
    return { available: true, stale: false, startedAt: base.at, files, skipped, base: base.tree, cwd: base.cwd, root: base.root }
  }

  async workRevertInfo(staffId: string): Promise<WorkRevertInfo> {
    const { available, stale, startedAt, files, skipped } = await this.revertPlan(staffId)
    return { available, stale, startedAt, files, skipped }
  }

  async revertWork(staffId: string) {
    const st = this.hired.get(staffId)
    if (st && (st.status === 'working' || st.status === 'waiting')) return { ok: false, output: t('review.revert.busy'), restored: 0 }
    const plan = await this.revertPlan(staffId)
    if (!plan.available) return { ok: false, output: t('review.revert.unavailable'), restored: 0 }
    if (plan.files.length === 0) return { ok: true, output: t('review.revert.nothing'), restored: 0 }
    const r = await restoreFiles(plan.root, plan.base, plan.files.map((f) => f.path))
    // 남은 변경(건드리지 않은 파일)은 다음 일의 출발점이 되도록 기준을 새로 잡는다
    const fresh = await snapshotTree(plan.cwd)
    if (fresh && r.failed.length === 0) this.workBases.set(staffId, { cwd: plan.cwd, root: plan.root, tree: fresh, at: Date.now() })
    this.touchedFiles.delete(staffId)
    await this.persistWork(staffId)
    if (this.hired.has(staffId)) this.log(staffId, 'status', t('review.revert.log', { n: r.restored }))
    return { ok: r.failed.length === 0, output: r.failed.length ? t('review.revert.partial', { n: r.restored, failed: r.failed.join(', ') }) : t('review.revert.done', { n: r.restored }), restored: r.restored }
  }

  async suggestCommitMessage(staffId: string) {
    const s = this.hired.get(staffId)
    const changes = await this.workChanges(staffId)
    if (!s || !changes.diff.trim()) return ''
    const r = await askOnce({
      cwd: s.cwd,
      tier: 'light',
      system: '커밋 메시지 작성자입니다. 첫 줄은 50자 안의 요약, 빈 줄 뒤에 필요하면 "- " 글머리표로 2~4줄. 메시지 본문만 출력합니다.',
      prompt: `다음 변경의 커밋 메시지를 한국어로 써 주세요.\n\n${changes.diff.slice(0, 30_000)}`,
    })
    this.recordUsage(staffId, r)
    return r.text.replace(/^```\w*\n?|```$/g, '').trim()
  }

  async commitChanges(staffId: string, message: string) {
    const cwd = this.cwdOf(staffId)
    if (!cwd) return { ok: false, output: '작업 폴더를 찾을 수 없습니다.' }
    const r = await commitAll(cwd, message)
    if (r.ok) {
      this.workBases.delete(staffId)
      this.touchedFiles.delete(staffId)
      void this.persistWork(staffId)
    }
    if (r.ok && this.hired.has(staffId)) {
      this.log(staffId, 'commit', t('log.commit', { text: message.split('\n')[0] }))
      this.postChat(staffId, `✅ 커밋을 결재받았어요: ${message.split('\n')[0]}`)
    }
    return r
  }

  async pushAndCreatePr(staffId: string, title: string, body: string) {
    const cwd = this.cwdOf(staffId)
    if (!cwd) return { ok: false, output: '작업 폴더를 찾을 수 없습니다.' }
    const r = await pushAndPr(cwd, title, body)
    if (r.ok && this.hired.has(staffId)) {
      this.log(staffId, 'commit', t('log.pr', { text: title }))
      this.postChat(staffId, `🚀 PR을 올렸어요: ${title}`)
    }
    return r
  }

  // ── 회사 자금·상점 ────────────────────────────────────

  /** 잔액 = 토큰 수당 + 보너스·보상 − 구매 */
  private funds() {
    return Math.round(db.tokenTotal() * WON_PER_TOKEN + db.ledgerSum())
  }

  ledger(): LedgerRow[] {
    const wages: LedgerRow[] = db
      .tokensByDay(LEDGER_DAYS)
      .map((d) => ({ ts: d.ts, amount: d.t * WON_PER_TOKEN, kind: 'wage', label: `업무 수당 · ${d.day} (토큰 ${Math.round(d.t / 1000).toLocaleString('ko-KR')}K)` }))
    return [...wages, ...db.ledgerEntries(LEDGER_MAX)].sort((a, b) => b.ts - a.ts)
  }

  private saveShopState(next: ShopState) {
    this.shop = next
    db.saveShop(next)
    this.scheduleEmit()
  }

  buyItem(itemId: string) {
    const item = shopItem(itemId)
    if (!item) return { ok: false, message: '없는 물건이에요.' }
    const level = this.company().level
    if (level < item.minLevel) return { ok: false, message: `회사 Lv.${item.minLevel}부터 살 수 있어요.` }
    if (!isInSeason(item)) return { ok: false, message: `${item.season?.name} 시즌에만 팔아요.` }
    // 벽지·바닥·책상·의자는 한 번 사면 여러 곳에 쓴다 — 가구만 여러 개 산다
    if (!isGridCategory(item.category) && this.shop.owned[itemId]) return { ok: false, message: '이미 가지고 있어요.' }
    const funds = this.funds()
    // 오늘의 특가면 할인된 값으로
    const price = priceOf(item)
    if (funds < price) return { ok: false, message: `자금이 ${formatWon(price - funds)} 모자라요.` }
    db.addLedger(-price, 'purchase', `구매: ${item.name}${price < item.price ? ' (특가)' : ''}`)
    const owned = { ...this.shop.owned, [itemId]: (this.shop.owned[itemId] ?? 0) + 1 }
    this.saveShopState({ ...this.shop, owned })
    // 이번 구매로 세트를 다 모으면 완성 보상 (세트마다 한 번)
    const completed = SHOP_SETS.filter((set) => set.itemIds.includes(itemId) && isSetComplete(set, owned))
    for (const set of completed) db.addLedger(set.reward, 'bonus', `세트 완성: ${set.emoji} ${set.name}`, `set:${set.id}`)
    const bonus = completed.length ? ` ${completed.map((c) => `${c.emoji} ${c.name}`).join(', ')} 완성! +${formatWon(completed.reduce((s, c) => s + c.reward, 0))}` : ''
    // 가구는 서랍으로 간다 (김기획 문서 6-1절)
    const where = isGridCategory(item.category) ? " 서랍에 넣었어요. 사무실 '꾸미기'에서 꺼내 놓으세요." : ''
    return { ok: true, message: `${item.name}을(를) 샀어요.${where}${bonus}` }
  }

  applySurface(zone: Zone, slot: 'wallpaper' | 'floor', itemId: string | null) {
    if (itemId && (!this.shop.owned[itemId] || shopItem(itemId)?.category !== slot)) return
    this.saveShopState({ ...this.shop, surfaces: { ...this.shop.surfaces, [zone]: { ...this.shop.surfaces[zone], [slot]: itemId ?? undefined } } })
  }

  /** 서랍의 가구 하나를 칸에 놓는다. 메인에서 다시 검사(소유·레벨 포함) — 막히면 BlockedError(원격 422 blocked) */
  placeGridItem(itemId: string, floor: number, gx: number, gy: number, rot: number): { uid: string } {
    const uid = crypto.randomUUID()
    this.saveShopState(shopGrid.placeGridItem(this.shop, this.company().level, uid, itemId, floor, gx, gy, rot))
    return { uid }
  }

  moveGridItem(uid: string, floor: number, gx: number, gy: number, rot: number) {
    this.saveShopState(shopGrid.moveGridItem(this.shop, this.company().level, uid, floor, gx, gy, rot))
  }

  /** 눌러서 켜고 끄는 소품(연출 B)의 켜짐 — 가구 배치와 같이 shop.grid에 저장해 앱을 다시 열어도 남는다 */
  setGridItemOn(uid: string, isOn: boolean) {
    this.saveShopState(shopGrid.setGridItemOn(this.shop, uid, isOn))
  }

  /** 예전 "놓기"(D2): 1층 첫 빈칸에 자동 배치. 자리가 없으면 BlockedError('no_space') */
  placeItem(itemId: string, _x?: number, _y?: number) {
    const next = shopGrid.placeLegacyItem(this.shop, this.company().level, crypto.randomUUID(), itemId)
    if (next) this.saveShopState(next)
  }

  /** 예전 픽셀 옮기기. 칸 배치 가구면 아무것도 안 하고 성공 */
  moveItem(uid: string, x: number, y: number) {
    const next = shopGrid.moveLegacyItem(this.shop, uid, x, y)
    if (next) this.saveShopState(next)
  }

  storeItem(uid: string) {
    this.saveShopState(shopGrid.storeItem(this.shop, uid))
  }

  /** 전부 치우기: 범위(floor 0 = 건물 전체)의 가구를 한 번에 서랍으로. 치운 가구 목록을 돌려준다(되돌리기용) */
  stowAllGrid(floor: number, keepSeats: boolean): GridItem[] {
    const r = shopGrid.stowAll(this.shop, floor > 0 ? floor : null, keepSeats)
    if (r.stowed.length) this.saveShopState(r.shop)
    return r.stowed
  }

  /** 전부 치우기 되돌리기: 치우기 전 배치로 다시 놓는다 */
  restoreGridItems(items: GridItem[]) {
    if (!Array.isArray(items)) return
    this.saveShopState(shopGrid.restoreGrid(this.shop, this.company().level, items))
  }

  /** 책상 세트 옮기기 (책상+의자 한 번에). 겹침·길 막힘은 놓기와 같은 규칙 */
  moveSeatSet(floor: number, parts: SeatSetPart[]) {
    this.saveShopState(shopGrid.moveSeatSet(this.shop, this.company().level, floor, parts))
  }

  setGear(staffId: string, slot: 'desk' | 'chair', itemId: string | null) {
    if (itemId && (!this.shop.owned[itemId] || shopItem(itemId)?.category !== slot)) return
    this.saveShopState({ ...this.shop, gear: { ...this.shop.gear, [staffId]: { ...this.shop.gear[staffId], [slot]: itemId ?? undefined } } })
  }

  // ── 일일 미션·업적 ─────────────────────────────────────

  private metricValue(metric: Metric, since: number) {
    switch (metric) {
      case 'tasks':
        return db.countLedgerKeys('task:', since)
      case 'tokens':
        return db.tokensSince(since)
      case 'meetings':
        return db.countMeetings(since)
      case 'approvals':
        return db.countLogs('approval', since)
      case 'instructions':
        return db.countLogs('instruction', since)
      case 'purchases':
        return db.countLedgerKind('purchase', since)
      case 'staff':
        return [...this.hired.values()].filter((s) => !s.isPractice).length
      case 'level':
        return this.company().level
      // 레벨 기본 지급(무료)은 빼고 센다. 세트는 품목마다 직접 산 것이 있어야 완성 — 이미 받은 업적은 그대로(ach: 키)
      case 'items':
        return Object.keys(this.earnedOwned()).length
      case 'sets': {
        const earned = this.earnedOwned()
        return SHOP_SETS.filter((set) => isSetComplete(set, earned)).length
      }
      case 'earned':
        return db.tokenTotal() * WON_PER_TOKEN
    }
  }

  /** 업적이 세는 보유 (무료 기본 지급분을 뺌) */
  private earnedOwned() {
    return earnedOwned(this.shop.owned, grantedCounts(db.loadGrantedLevels(), db.loadGrantedZones()))
  }

  missions(): MissionsView {
    const claimed = db.ledgerKeys('mission:')
    for (const k of db.ledgerKeys('ach:')) claimed.add(k)
    const view = (defs: MissionDef[], keyOf: (d: MissionDef) => string, since: number): MissionProgress[] =>
      defs.map((d) => {
        const key = keyOf(d)
        return { ...d, key, progress: Math.min(d.target, this.metricValue(d.metric, since)), isClaimed: claimed.has(key) }
      })
    const today = todayKey()
    return {
      daily: view(dailyMissions(), (d) => `mission:${today}:${d.id}`, startOfDay(new Date())),
      achievements: view(ACHIEVEMENTS, (d) => `ach:${d.id}`, 0),
    }
  }

  /** 받을 수 있는 보상 수 (사이드바 배지) */
  private claimableCount() {
    const { daily, achievements } = this.missions()
    return [...daily, ...achievements].filter((m) => !m.isClaimed && m.progress >= m.target).length
  }

  claimMission(key: string) {
    const m = [...this.missions().daily, ...this.missions().achievements].find((x) => x.key === key)
    if (!m || m.isClaimed || m.progress < m.target) return { ok: false, message: '아직 받을 수 없어요.' }
    db.addLedger(m.reward, 'bonus', `${key.startsWith('ach:') ? '업적' : '오늘의 미션'}: ${m.emoji} ${m.label}`, key)
    this.scheduleEmit()
    return { ok: true, message: `${m.emoji} ${m.label} — ${formatWon(m.reward)} 받았어요.` }
  }

  // ── Claude 플랜 사용률 ────────────────────────────────

  /**
   * 사용률은 0~1 비율, 리셋 시각은 초 단위로 온다.
   * 창별 값은 타입에 없는 unifiedWindows(five_hour·seven_day …)에 함께 오므로 그것을 우선 읽는다 (2026-10 CLI에서 확인)
   */
  private onRateLimit(info: RateLimitInfo) {
    const windows = info.unifiedWindows
    const entries = windows ? Object.entries(windows) : info.rateLimitType ? [[info.rateLimitType, { utilization: info.utilization, resetsAt: info.resetsAt }] as const] : []
    if (entries.length === 0) return
    const now = Date.now()
    const next = entries.map(([type, w]): PlanUsage => {
      const percent = w.utilization === undefined ? null : Math.round(w.utilization * 1000) / 10
      // 막힌 창은 이벤트의 status가 알려 주고, 나머지는 사용률로 판단한다
      const status = type === info.rateLimitType ? info.status : percent !== null && percent >= 100 ? 'rejected' : 'allowed'
      return { type, percent, resetsAt: w.resetsAt ? w.resetsAt * 1000 : null, status, updatedAt: now }
    })
    this.planUsage = [...this.planUsage.filter((p) => !next.some((n) => n.type === p.type)), ...next]
    db.savePlanUsage(this.planUsage)
    this.checkPlanUsage()
    this.releaseHeldIfRecovered()
    this.scheduleEmit()
  }

  /** 사용률은 Claude를 부를 때만 오므로, 가장 짧은 호출(haiku 한 번)로 지금 값을 받아 온다 */
  async refreshPlanUsage() {
    // 비용은 1센트도 안 되고 특정 직원 몫이 아니라 급여 명세서에는 넣지 않는다
    await askOnce({ prompt: '.', system: 'Reply with a single dot.', tier: 'light', cwd: os.homedir(), onRateLimit: (info) => this.onRateLimit(info) })
    return this.planUsage
  }

  // ── 업무 보드 ─────────────────────────────────────────

  /** 앱이 꺼지면 직원 세션도 끊기므로, 진행 중이던 카드는 할 일로 돌리고 승인된 기획안은 다음 단계부터 이어간다 */
  private resumeTasks() {
    // 연습 카드는 튜토리얼이 이어 간다
    const all = [...this.tasks.values()]
    for (const id of tasksToReturnToTodo(all)) this.saveTask({ ...this.tasks.get(id)!, status: 'todo', updatedAt: Date.now() })
    for (const id of plansToAdvanceOnStart(all)) this.advancePlan(id)
  }

  /** 예전엔 보고를 단체방 길이로 잘라 저장했다 — 직원 기록에 남은 원문으로 되살린다 */
  private restoreTaskResult(t: Task): Task {
    if (!t.assigneeId || !t.result.endsWith('…') || t.result.length !== CHAT_TEXT_MAX + 1) return t
    const head = t.result.slice(0, -1)
    const full = db
      .logsSince(t.assigneeId, t.createdAt)
      .filter((l) => l.type === 'reply' && l.ts <= t.updatedAt && l.text.length > head.length && l.text.startsWith(head))
      .at(-1)?.text
    if (!full) return t
    const restored = { ...t, result: full.slice(0, TASK_RESULT_MAX) }
    db.upsertTask(restored)
    return restored
  }

  createTask(input: { title: string; detail: string; teamId: string | null; labId?: string | null; attachments?: Attachment[] }): Task {
    const now = Date.now()
    const task: Task = { id: crypto.randomUUID(), ...input, labId: input.labId ?? null, status: 'todo', assigneeId: null, result: '', createdAt: now, updatedAt: now }
    this.saveTask(task)
    return task
  }

  updateTask(taskId: string, patch: Partial<Pick<Task, 'title' | 'detail' | 'status' | 'teamId' | 'labId' | 'assigneeId'>>) {
    const t = this.tasks.get(taskId)
    if (!t) return
    this.saveTask({ ...t, ...patch, updatedAt: Date.now() })
    if (t.parentId && patch.status) this.advancePlan(t.parentId)
    if (t.isPractice && patch.status === 'done') this.tutorial.notify('taskDone', taskId)
  }

  assignTask(taskId: string, staffId: string, context = '') {
    const task = this.tasks.get(taskId)
    const s = this.hired.get(staffId)
    if (!task || !s) return
    // 연습 카드·연습 직원은 AI 대신 튜토리얼로 (둘 중 하나만 연습이면 시작하지 않는다)
    if (task.isPractice || s.isPractice) {
      if (task.isPractice && s.isPractice) this.tutorial.notify('taskStarted', taskId)
      return
    }
    // 이미 이 카드를 하는 중이면 다시 보내지 않는다 (시작을 두 번 눌러도 지시는 한 번)
    if (this.isWorkingOn(staffId, taskId)) return
    this.taskStartedAt.set(taskId, Date.now())
    // 이미 다른 카드를 하는 중이면 대기열에 넣는다 (같이 보내면 한 응답으로 뭉쳐 두 카드가 같은 보고로 끝난다)
    const isBusyWithTask = (this.origins.get(staffId) ?? []).some((o) => o.kind === 'task' && o.taskId !== taskId)
    if (isBusyWithTask) {
      this.taskQueue.set(staffId, [...(this.taskQueue.get(staffId) ?? []).filter((q) => q.taskId !== taskId), { taskId, context }])
      this.saveTask({ ...task, assigneeId: staffId, status: 'doing', result: '', plan: task.parentId ? task.plan : null, updatedAt: Date.now() })
      this.log(staffId, 'status', t('log.queued', { title: task.title }))
      return
    }
    // 다시 돌리는 카드면 지난 보고·기획안을 비우고 새로 시작한다
    this.saveTask({ ...task, assigneeId: staffId, status: 'doing', result: '', plan: null, updatedAt: Date.now() })
    const leadGuide = !task.parentId && this.delegatesOf(staffId).length ? `\n\n${t('staff.leadGuide')}` : ''
    // 지식 창고에서 이 업무와 관련 있는 상위 몇 개만 짧게 (토큰 절약 — 없으면 아무것도 붙이지 않는다)
    const brief = knowledgeBrief(pickKnowledge(this.knowledge, `${task.title}\n${task.detail}`))
    const knowledge = brief ? `\n\n${brief}` : ''
    this.instruct(staffId, `${t('staff.msg.board', { title: task.title })}${task.detail ? `\n${task.detail}` : ''}${context}${knowledge}${leadGuide}`, { kind: 'task', taskId }, task.attachments ?? [])
  }

  /** 진행 중인 카드를 멈춰 할 일로 되돌린다. 기획 카드면 진행 중인 하위 업무·취합까지 기획 전체를 멈춘다 */
  stopTask(taskId: string) {
    const t = this.tasks.get(taskId)
    if (!t || t.status !== 'doing') return
    if (t.plan?.status === 'approved') {
      this.pausePlan(t.id)
      for (const c of this.tasks.values()) if (c.parentId === t.id && c.status === 'doing') this.stopTask(c.id)
      if (t.plan.isAggregating && t.assigneeId && this.isWorkingOn(t.assigneeId, t.id)) {
        this.hardStops.add(t.assigneeId)
        void this.interrupt(t.assigneeId)
      }
      return
    }
    const staffId = t.assigneeId
    const queue = staffId ? (this.taskQueue.get(staffId) ?? []) : []
    if (staffId && queue.some((q) => q.taskId === taskId)) {
      // 아직 차례를 기다리던 카드는 대기열에서만 뺀다
      this.taskQueue.set(
        staffId,
        queue.filter((q) => q.taskId !== taskId),
      )
      this.returnToTodo(taskId)
    } else if (staffId && this.isWorkingOn(staffId, taskId)) {
      this.hardStops.add(staffId)
      void this.interrupt(staffId)
    } else this.returnToTodo(taskId)
  }

  private isWorkingOn(staffId: string, taskId: string) {
    return (this.origins.get(staffId) ?? []).some((o) => o.kind === 'task' && o.taskId === taskId)
  }

  resumePlan(taskId: string) {
    const t = this.tasks.get(taskId)
    if (!t?.plan?.isPaused) return
    // 취합 중에 멈췄으면 하위가 다 끝난 상태라 advancePlan이 취합을 다시 맡긴다
    this.saveTask({ ...t, plan: { ...t.plan, isPaused: false, isAggregating: false }, updatedAt: Date.now() })
    this.postChat('me', `▶️ "${t.title}" 기획을 다시 진행해요.`.slice(0, CHAT_TEXT_MAX))
    this.advancePlan(t.id)
  }

  /** 대표가 리드의 기획안을 승인하면 하위 업무를 만들어 배정하고, 다시를 누르면 피드백과 함께 리드에게 돌려보낸다 */
  /** 기획을 처리했으면 true (이미 확인했거나 사라진 기획이면 false). via: 원격 표시 */
  reviewPlan(taskId: string, isApproved: boolean, feedback: string, via = '') {
    const t = this.tasks.get(taskId)
    if (!t?.plan || t.plan.status !== 'waiting' || !t.assigneeId) return false
    if (t.isPractice) return this.reviewPracticePlan(t, isApproved)
    const leadId = t.assigneeId
    if (via) this.log(leadId, 'status', tr('log.planVia', { via, title: t.title, result: isApproved ? tr('log.planApproved') : tr('log.planRedo') }))
    // 대표 피드백은 지식 창고에도 남겨 다음 업무에 참고하게 한다
    if (feedback.trim()) this.rememberKnowledge({ kind: 'feedback', title: t.title, body: feedback, tags: [] })
    if (!isApproved) {
      this.saveTask({ ...t, plan: { ...t.plan, status: 'revise', feedback }, updatedAt: Date.now() })
      this.instruct(
        leadId,
        `[대표 피드백] "${t.title}" 기획안을 다시 봐 주세요.\n${feedback || '(구체적인 피드백 없음 — 기획을 다듬어 주세요)'}\n고친 뒤 mcp__office__propose_plan으로 다시 올리세요.`,
        { kind: 'task', taskId },
      )
      return true
    }
    // 하위 카드는 리드가 적은 순서대로 하나씩 진행한다 (설계 → 구현 → 리뷰처럼 앞 결과가 다음 입력)
    const childIds = t.plan.subtasks.map((st) => {
      const child = this.createTask({ title: st.title, detail: st.detail, teamId: t.teamId, labId: t.labId })
      this.saveTask({ ...child, parentId: t.id, assigneeId: st.assigneeId && this.hired.has(st.assigneeId) ? st.assigneeId : null })
      return child.id
    })
    // 다시 올려 승인한 기획이면 앞 회차 하위 업무는 새 하위로 대체됐으니 닫는다
    const now = Date.now()
    for (const old of this.tasks.values()) {
      if (old.parentId === t.id && old.status !== 'done' && !childIds.includes(old.id) && !t.plan.absorbedIds?.includes(old.id))
        this.saveTask({ ...old, status: 'done', result: `(대체됨) 다시 올린 기획안의 하위 업무로 바뀌었어요.\n${old.result}`.slice(0, TASK_RESULT_MAX), updatedAt: now })
    }
    // 기획이 대신 처리하는 카드는 기획 아래로 넣는다 (보드 칸에선 숨고, 기획이 끝나면 함께 완료)
    for (const id of t.plan.absorbedIds ?? []) {
      const card = this.tasks.get(id)
      if (card && card.status === 'todo' && !card.parentId) this.saveTask({ ...card, parentId: t.id, updatedAt: now })
    }
    this.saveTask({ ...t, plan: { ...t.plan, status: 'approved', feedback, childIds }, updatedAt: now })
    this.postChat('me', `✅ "${t.title}" 기획안 승인 — 하위 업무 ${childIds.length}건을 순서대로 진행해요.${feedback ? ` 코멘트: ${feedback}` : ''}`.slice(0, CHAT_TEXT_MAX))
    this.advancePlan(t.id)
    return true
  }

  /** 연습 기획안: 승인하면 연습 하위 카드를 만들고 튜토리얼에 알린다 (다시 쓰기는 대본에 없어 그대로 둔다 — 단체방·지식 창고에도 남기지 않는다) */
  private reviewPracticePlan(t: Task, isApproved: boolean) {
    if (!isApproved || !t.plan) return false
    const childIds = t.plan.subtasks.map((st) => {
      const child: Task = { ...this.createTask({ title: st.title, detail: st.detail, teamId: t.teamId, labId: t.labId }), parentId: t.id, assigneeId: st.assigneeId, isPractice: true }
      this.saveTask(child)
      return child.id
    })
    this.saveTask({ ...t, plan: { ...t.plan, status: 'approved', childIds }, updatedAt: Date.now() })
    this.tutorial.notify('planApproved', t.id)
    return true
  }

  /** 기획에 딸린 카드(하위 업무·묶은 카드·앞 회차 하위)를 모두 완료로 */
  private completeChildren(parentId: string) {
    const now = Date.now()
    for (const c of this.tasks.values()) if (c.parentId === parentId && c.status !== 'done') this.saveTask({ ...c, status: 'done', updatedAt: now })
  }

  /** 기획안의 다음 하위 업무를 시작하고, 모두 끝나면 리드에게 결과를 모아 보내 취합 보고를 맡긴다 */
  private advancePlan(parentId: string) {
    const parent = this.tasks.get(parentId)
    if (!parent?.plan || parent.plan.status !== 'approved' || parent.plan.isAggregating || parent.plan.isPaused || !parent.assigneeId) return
    const children = (parent.plan.childIds ?? []).flatMap((id) => this.tasks.get(id) ?? [])
    const isFinished = (c: Task) => c.status === 'review' || c.status === 'done'
    const next = children.find((c) => !isFinished(c))
    if (next) {
      // 진행 중이거나 담당이 없으면(대표가 직접 배정) 기다린다
      if (next.status !== 'todo' || !next.assigneeId) return
      // 한도가 거의 찼으면 다음 하위 업무를 보류 — 회복되면 이어서 시작한다
      if (this.holdJob({ kind: 'task', id: next.id, label: next.title, staffId: next.assigneeId, parentId })) return
      const lead = this.hired.get(parent.assigneeId)
      const prev = children.filter(isFinished).map((c) => `### ${c.title} — ${this.hired.get(c.assigneeId ?? '')?.name ?? ''}\n${c.result.slice(0, PREV_RESULT_MAX)}`)
      const context = [
        `\n\n---\n${t('staff.msg.parent', { parent: parent.title, lead: lead?.name ?? '', i: children.indexOf(next) + 1, n: children.length })}`,
        `\n${t('staff.msg.spec')}\n${parent.plan.spec.slice(0, PLAN_CONTEXT_MAX)}`,
        parent.plan.feedback ? `\n${t('staff.msg.feedback')}\n${parent.plan.feedback}` : '',
        prev.length ? `\n${t('staff.msg.prev')}\n${prev.join('\n\n')}` : '',
      ].join('\n')
      this.assignTask(next.id, next.assigneeId, context)
      return
    }
    if (children.length === 0) return
    this.saveTask({ ...parent, plan: { ...parent.plan, isAggregating: true }, updatedAt: Date.now() })
    const results = children.map((c) => `### ${c.title} — ${this.hired.get(c.assigneeId ?? '')?.name ?? t('staff.msg.noAssignee')}\n${c.result || t('staff.msg.noReport')}`).join('\n\n')
    this.instruct(
      parent.assigneeId,
      `${t('staff.msg.subDone', { title: parent.title })}\n\n${results}`,
      { kind: 'task', taskId: parent.id },
    )
  }

  deleteTask(taskId: string) {
    db.deleteTaskRow(taskId)
    this.tasks.delete(taskId)
    this.scheduleEmit()
  }

  /** 중복 카드를 keep 하나로 — 시작 안 한 카드만 합친다 (기획·하위·진행 중·연습 카드는 그대로 둔다) */
  mergeTasks(keepId: string, mergeIds: string[]) {
    const keep = this.tasks.get(keepId)
    if (!keep || keep.isPractice) throw new InvalidArgsError('남길 카드를 찾지 못했어요')
    const merged = mergeIds
      .flatMap((id) => this.tasks.get(id) ?? [])
      .filter((x) => x.id !== keep.id && x.status === 'todo' && !x.isPractice && !x.plan && !x.parentId && !this.isBusyTask(x.id))
    if (merged.length === 0) throw new InvalidArgsError('합칠 수 있는 카드가 없어요 (시작 안 한 카드만 합쳐요)')
    const notes = merged.map((x) => [t('board.merge.from', { title: x.title }), x.detail.trim()].filter(Boolean).join('\n'))
    const attachments = [...(keep.attachments ?? []), ...merged.flatMap((x) => x.attachments ?? [])]
    this.saveTask({
      ...keep,
      detail: [keep.detail.trim(), ...notes].filter(Boolean).join('\n\n---\n'),
      teamId: keep.teamId ?? merged.find((x) => x.teamId)?.teamId ?? null,
      labId: keep.labId ?? merged.find((x) => x.labId)?.labId ?? null,
      ...(attachments.length ? { attachments } : {}),
      updatedAt: Date.now(),
    })
    for (const x of merged) this.deleteTask(x.id)
  }

  boardCleanupPlan(): BoardCleanupPlan {
    const busyTaskIds = new Set([...this.tasks.keys()].filter((id) => this.isBusyTask(id)))
    return planBoardCleanup({ tasks: [...this.tasks.values()], staff: [...this.hired.values()], labs: [...this.labs.values()], busyTaskIds, now: Date.now() })
  }

  /** 어느 직원이든 이 카드를 하고 있거나 대기열에 넣어 두었는지 */
  private isBusyTask(taskId: string) {
    return [...this.origins.values()].some((list) => list.some((o) => o.kind === 'task' && o.taskId === taskId))
  }

  // ── 튜토리얼 연습 회사 ────────────────────────────────

  private hasPracticeData() {
    const all = [...this.hired.values(), ...this.teams.values(), ...this.labs.values(), ...this.tasks.values(), ...this.meetings]
    return all.some((x) => x.isPractice)
  }

  /** 연습 표시가 붙은 카드·회의·직원·랩·팀을 모두 지운다 (직원이 남긴 기록·단체방 글도) — 퇴사 안내 없이 조용히 */
  private clearPracticeData() {
    const staffIds = [...this.hired.values()].filter((s) => s.isPractice).map((s) => s.id)
    for (const t of [...this.tasks.values()]) {
      if (t.isPractice) this.deleteTask(t.id)
      else if (t.assigneeId && staffIds.includes(t.assigneeId)) this.saveTask({ ...t, assigneeId: null })
    }
    for (const m of this.meetings) if (m.isPractice) db.deleteMeetingRow(m.id)
    this.meetings = this.meetings.filter((m) => !m.isPractice)
    for (const id of staffIds) {
      this.manager.remove(id)
      this.hired.delete(id)
      this.counters.delete(id)
      db.deleteStaff(id)
      for (const sc of [...this.schedules.values()]) if (sc.staffId === id) this.schedules.delete(sc.id)
    }
    db.deleteStaffTraces(staffIds)
    for (const l of [...this.labs.values()]) {
      if (l.isPractice) this.deleteLab(l.id)
      else if (l.memberIds.some((m) => staffIds.includes(m))) this.saveLabObj({ ...l, memberIds: l.memberIds.filter((m) => !staffIds.includes(m)), leadId: l.leadId && staffIds.includes(l.leadId) ? null : l.leadId })
    }
    for (const team of [...this.teams.values()]) {
      if (team.isPractice) this.deleteTeam(team.id)
      else if (team.leadId && staffIds.includes(team.leadId)) this.updateTeam(team.id, { leadId: null })
    }
    this.scheduleEmit()
  }

  /** 직원이 맡고 있는 업무 카드에 이번 턴 사용량을 더한다 (여러 장이면 처음 맡은 카드 — 지금 하는 일) */
  private addTaskUsage(staffId: string, delta: { cost: number; tokensIn: number; tokensOut: number }) {
    const origin = (this.origins.get(staffId) ?? []).find((o) => o.kind === 'task')
    const t = origin?.kind === 'task' ? this.tasks.get(origin.taskId) : undefined
    const tokens = delta.tokensIn + delta.tokensOut
    if (!t || (tokens === 0 && delta.cost === 0)) return
    this.saveTask({ ...t, usage: { tokens: (t.usage?.tokens ?? 0) + tokens, costUsd: (t.usage?.costUsd ?? 0) + delta.cost } })
  }

  private saveTask(t: Task) {
    db.upsertTask(t)
    this.tasks.set(t.id, t)
    this.scheduleEmit()
  }

  // ── 결과물 갤러리·데모데이 ─────────────────────────────

  galleryList(): GalleryEntry[] {
    return this.gallery
  }

  deleteGalleryEntry(id: string) {
    this.gallery = this.gallery.filter((e) => e.id !== id)
    db.deleteGalleryRow(id)
  }

  /** 업무 카드가 검토로 넘어가면 보고·캡처·바뀐 파일을 한 장으로 남긴다 (같은 카드를 다시 끝내면 덮어쓴다) */
  private async recordGallery(task: Task, s: db.StoredStaff, report: string) {
    try {
      const since = this.taskStartedAt.get(task.id) ?? task.createdAt
      this.taskStartedAt.delete(task.id)
      const images = db
        .logsSince(s.id, since)
        .flatMap((l) => l.attachments ?? [])
        .filter(isImageAttachment)
        .slice(-GALLERY_IMAGES_MAX)
      const revert = await this.revertPlan(s.id).catch(() => null)
      const files = (revert?.available ? revert.files : []).slice(0, GALLERY_FILES_MAX).map((f) => ({ path: f.path, added: f.additions, removed: f.deletions }))
      const entry: GalleryEntry = {
        id: task.id,
        title: task.title,
        staffId: s.id,
        staffName: s.name,
        teamId: task.teamId ?? this.teamOf(s.id)?.id ?? null,
        labId: task.labId,
        summary: summarize(maskSecrets(report)),
        body: galleryBody(maskSecrets(report)),
        links: extractLinks(report),
        images,
        files,
        finishedAt: Date.now(),
      }
      db.saveGalleryRow(entry)
      const next = [entry, ...this.gallery.filter((e) => e.id !== entry.id)]
      for (const old of next.slice(GALLERY_MAX)) db.deleteGalleryRow(old.id)
      this.gallery = next.slice(0, GALLERY_MAX)
    } catch (e) {
      console.error('[office] recordGallery', e)
    }
  }

  runDemoDayNow() {
    this.runDemoDay(new Date())
  }

  private runDemoDayIfDue() {
    const now = new Date()
    if (isDemoDue(this.settings.demoDay, this.demoDayLast?.date ?? null, now)) this.runDemoDay(now)
  }

  /** 데모데이: 지난번 이후 끝낸 업무를 직원별로 회의실에서 차례로 보여 주고(작업물 사진 첨부, 직원별 haiku 한 번 AI 발표 — 설정에서 끄면 정해진 문장·토큰 0), 단체방에 요약·대표 사진·갤러리 링크를 올린다 */
  private runDemoDay(now: Date) {
    if (this.isDemoRunning || this.meetings.some((m) => m.kind === 'demo' && isMeetingLive(m))) return void this.postChat(OFFICE_SENDER, t('gallery.demo.already'))
    const entries = demoEntries(this.gallery, this.demoDayLast?.at ?? null, now.getTime())
    this.demoDayLast = { date: dateKeyOf(now), at: now.getTime() }
    db.saveDemoDayLast(this.demoDayLast)
    const link = `[${t('gallery.demo.link')}](#view=gallery)`
    if (entries.length === 0) {
      this.postChat('me', `🎬 ${t('gallery.demo.empty')}\n${link}`)
      return
    }
    const groups = groupByStaff(entries)
    const summary = demoSummary(entries)
    const meeting: Meeting = {
      id: crypto.randomUUID(),
      topic: t('gallery.demo.topic', { date: fmtDate(now, { month: 'numeric', day: 'numeric' }) }),
      participantIds: groups.map((g) => g.staffId).filter((id) => this.hired.has(id)).slice(0, meetingRoomOf(this.company().level).capacity),
      rounds: 1,
      status: 'running',
      messages: [],
      summary: '',
      createdAt: now.getTime(),
      kind: 'demo',
    }
    meeting.demo = { presenterId: null, phase: 'enter', slides: [], cardTitle: '', index: 0, total: groups.length, startedAt: now.getTime(), durationMs: demoPhaseMs('enter'), mvpId: null }
    this.meetings = [meeting, ...this.meetings].slice(0, MEETING_KEEP)
    db.saveMeeting(meeting)
    this.postChat('me', `🎬 ${t('gallery.demo.start')}`)
    this.scheduleEmit()
    const total = groups.length
    // 끝내기·중단 신호가 오면 남은 시간을 기다리지 않고 바로 깨어난다 (0.5초 단위로 확인, 타이머는 항상 정리)
    const wait = async (ms: number) => {
      const until = Date.now() + ms
      while (Date.now() < until && isLive()) await new Promise<void>((r) => setTimeout(r, Math.min(500, Math.max(0, until - Date.now()))))
    }
    const isLive = () => {
      const m = this.meetings.find((x) => x.id === meeting.id)
      return m && m.status === 'running' && !this.meetingStops.get(m.id) ? m : null
    }
    const setStage = (m: Meeting, patch: Partial<DemoStage> & { phase: DemoPhase }, ms: number) => {
      m.demo = { ...(m.demo as DemoStage), ...patch, startedAt: Date.now(), durationMs: ms }
      db.saveMeeting(m)
      this.scheduleEmit()
    }
    const run = async () => {
      this.isDemoRunning = true
      try {
        await body()
      } finally {
        this.isDemoRunning = false
        // 오류·중단으로 빠져나왔는데 아직 진행 중이면 반드시 마무리한다
        const m = this.meetings.find((x) => x.id === meeting.id)
        this.meetingStops.delete(meeting.id)
        if (m && m.status === 'running') {
          m.status = 'done'
          m.summary = m.summary || summary
          if (m.demo) m.demo = { ...m.demo, presenterId: null, phase: 'remark', slides: [], cardTitle: '', startedAt: Date.now(), durationMs: 0 }
          db.saveMeeting(m)
          this.scheduleEmit()
        }
      }
    }
    const body = async () => {
      for (let i = 0; i < total; i++) {
        const g = groups[i]
        let m = isLive()
        if (!m) break
        const slides = demoImages(g.items)
        // 걸어 나오는 동안 발표 문장을 미리 만든다 (haiku 한 번)
        const speech = this.demoSpeech(meeting.id, g.staffId, g.items)
        setStage(m, { presenterId: g.staffId, phase: 'enter', slides, cardTitle: g.items[0]?.title ?? '', index: i + 1, total }, demoPhaseMs('enter'))
        const [text] = await Promise.all([speech, wait(demoPhaseMs('enter'))])
        m = isLive()
        if (!m) break
        m.messages.push({ staffId: this.hired.has(g.staffId) ? g.staffId : null, name: g.staffName, text, ts: Date.now(), ...(slides.length ? { attachments: slides } : {}) })
        setStage(m, { phase: 'present' }, demoPhaseMs('present', text))
        await wait(demoPhaseMs('present', text))
        m = isLive()
        if (!m) break
        setStage(m, { phase: 'clap' }, demoPhaseMs('clap'))
        await wait(demoPhaseMs('clap'))
      }
      let m = this.meetings.find((x) => x.id === meeting.id)
      if (!m || m.status !== 'running') return
      // 끝내기 신호는 마무리할 때까지 지우지 않는다 (총평 AI·대기 도중에 들어온 신호도 반영하려고 다시 읽는다 — 지우는 건 run의 finally)
      let remark = this.meetingStops.get(m.id) ? null : await this.demoLeadRemark(m.id, groups, entries.length)
      m = this.meetings.find((x) => x.id === meeting.id)
      if (!m || m.status !== 'running') return
      if (this.meetingStops.get(m.id)) remark = null
      if (remark) {
        m.messages.push({ staffId: remark.id, name: remark.name, text: remark.text, ts: Date.now() })
        setStage(m, { presenterId: remark.id, phase: 'remark', slides: [], cardTitle: '' }, demoPhaseMs('remark'))
        await wait(demoPhaseMs('remark'))
        m = this.meetings.find((x) => x.id === meeting.id)
        if (!m || m.status !== 'running') return
      }
      const stop = this.meetingStops.get(m.id)
      const end = demoOutcome(stop, remark)
      remark = end.remark
      m.status = end.status
      m.summary = remark ? `${summary}\n\n💬 ${remark.name}: ${remark.text}` : summary
      if (m.demo) m.demo = { ...m.demo, presenterId: null, phase: 'remark', startedAt: Date.now(), durationMs: 0 }
      db.saveMeeting(m)
      if (end.isSaved) this.postChat('me', `🎬 ${m.summary}\n${link}`.slice(0, CHAT_TEXT_MAX * 2), demoCoverImages(entries))
      this.scheduleEmit()
    }
    void run().catch((e) => console.error('[office] demoDay', e))
  }

  /** 창을 닫으면(맥 Dock·윈도우 트레이에 남아 PC는 계속 돈다) 진행 중인 데모데이를 정리해 끝낸다 — 다시 열었을 때 발표가 이어지지 않게 */
  endLiveDemos() {
    for (const m of this.meetings) if (m.kind === 'demo' && isMeetingLive(m)) this.endMeeting(m.id, 'wrapup')
  }

  /** 대표 반응: 박수·MVP는 칭찬 배지(회의당 MVP 1명, 단체방 축하), 한마디는 지식 창고 피드백. AI 호출 없음 */
  demoReact(meetingId: string, staffId: string, kind: DemoReaction, text?: string) {
    const m = this.meetings.find((x) => x.id === meetingId)
    if (!m || m.kind !== 'demo' || !m.demo) throw new InvalidArgsError(t('gallery.demo.error.noMeeting'))
    if (!DEMO_REACTIONS.includes(kind) || !m.participantIds.includes(staffId)) throw new InvalidArgsError(t('gallery.demo.error.invalid'))
    const name = this.hired.get(staffId)?.name ?? m.messages.find((x) => x.staffId === staffId)?.name ?? ''
    if (kind === 'comment') {
      const body = (text ?? '').trim().slice(0, DEMO_COMMENT_MAX)
      if (!body) throw new InvalidArgsError(t('gallery.demo.error.emptyComment'))
      this.saveKnowledge({ kind: 'feedback', title: t('gallery.demo.feedbackTitle', { name }), body, tags: ['demoday'] })
      return
    }
    if (kind === 'mvp') {
      if (m.demo.mvpId) throw new InvalidArgsError(t('gallery.demo.error.mvpDone'))
      m.demo = { ...m.demo, mvpId: staffId }
      db.saveMeeting(m)
      this.postChat('me', `🏆 ${t('gallery.demo.mvpChat', { name })}`)
    }
    this.praise[staffId] = addPraise(this.praise[staffId], kind)
    db.savePraise(this.praise)
    this.scheduleEmit()
  }

  /** AI 발표를 쓸 수 있는지: 설정이 켜져 있고 플랜 사용량 보류 중이 아닐 때 */
  private canDemoAi() {
    return this.settings.demoDay.isAi && !this.currentHold().isHeld
  }

  /** 데모데이용 AI 호출 — 응답이 안 오면 DEMO_AI_TIMEOUT_MS 뒤에 끊고 실패로 처리한다 (진행이 영영 멈추지 않게) */
  private async askDemoOnce(meetingId: string, opts: Omit<Parameters<typeof askOnce>[0], 'abortController'>) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), DEMO_AI_TIMEOUT_MS)
    // 끝내기가 오면 endMeeting이 이 회의의 호출을 바로 끊는다
    const set = this.demoAborts.get(meetingId) ?? new Set<AbortController>()
    set.add(ac)
    this.demoAborts.set(meetingId, set)
    try {
      return await abortable(askOnce({ ...opts, abortController: ac }), ac)
    } finally {
      clearTimeout(timer)
      set.delete(ac)
      if (!set.size) this.demoAborts.delete(meetingId)
    }
  }

  /** 직원 한 명의 발표 문장 — haiku 한 번 (입력은 갤러리 요약만). 꺼짐·보류·실패·빈 답이면 정해진 문장 */
  private async demoSpeech(meetingId: string, staffId: string, items: GalleryEntry[]): Promise<string> {
    const fallback = demoLine(items)
    const s = this.hired.get(staffId)
    if (!s || !this.canDemoAi()) return fallback
    try {
      const r = await this.askDemoOnce(meetingId, {
        cwd: os.homedir(),
        tier: 'light',
        system: `당신은 ${s.name}(${s.role})입니다. ${s.systemPrompt}\n데모데이 회의실에서 동료들에게 자기가 끝낸 일을 발표합니다. 2~4문장, 자기 말투로, 무엇을 했고 결과가 뭔지만 말하세요. 인사·목록·제목 없이 발표 문장만 출력합니다.\n${t('staff.language')}`,
        prompt: demoPresentInput(items),
        onRateLimit: (info) => this.onRateLimit(info),
      })
      this.recordUsage(staffId, r)
      return cleanSpeech(r.text) ?? fallback
    } catch {
      return fallback
    }
  }

  /** 리드의 한 줄 총평 (데모데이 끝). AI 꺼짐·보류·실패·리드 없음이면 null → 기존 요약만 */
  private async demoLeadRemark(meetingId: string, groups: { staffName: string; items: GalleryEntry[] }[], count: number): Promise<{ id: string; name: string; text: string } | null> {
    const lead = [...this.teams.values()].map((tm) => (tm.leadId ? this.hired.get(tm.leadId) : undefined)).find(Boolean)
    if (!lead || !this.canDemoAi()) return null
    try {
      const r = await this.askDemoOnce(meetingId, {
        cwd: os.homedir(),
        tier: 'light',
        system: `당신은 ${lead.name}(${lead.role})입니다. ${lead.systemPrompt}\n데모데이를 마치며 팀에 한 줄(한 문장) 총평을 합니다. 따뜻하고 구체적으로, 인사·목록 없이 문장만 출력합니다.\n${t('staff.language')}`,
        prompt: groups.map((g) => `${g.staffName}: ${g.items.slice(0, 3).map((e) => e.title).join(', ')}`).join('\n').slice(0, 1500) + `\n(총 ${count}건)`,
        onRateLimit: (info) => this.onRateLimit(info),
      })
      this.recordUsage(lead.id, r)
      const text = cleanSpeech(r.text, 200)
      return text ? { id: lead.id, name: lead.name, text } : null
    } catch {
      return null
    }
  }

  // ── 회의실 ────────────────────────────────────────────

  startMeeting(input: { topic: string; participantIds: string[]; rounds: number }): Meeting {
    const meeting: Meeting = {
      id: crypto.randomUUID(),
      topic: input.topic,
      // 회의실 크기(레벨별 최대 인원)를 넘으면 앞에서부터 그만큼만
      participantIds: [...new Set(input.participantIds)].filter((id) => this.hired.has(id)).slice(0, meetingRoomOf(this.company().level).capacity),
      rounds: input.rounds,
      status: 'running',
      messages: [],
      summary: '',
      createdAt: Date.now(),
    }
    if (meeting.participantIds.some((id) => this.hired.get(id)?.isPractice)) return this.startPracticeMeeting(meeting)
    this.meetings = [meeting, ...this.meetings].slice(0, MEETING_KEEP)
    db.saveMeeting(meeting)
    this.postChat('me', `📋 회의 시작: ${meeting.topic}`)
    this.scheduleEmit()
    void this.runMeeting(meeting)
    return meeting
  }

  /** 연습 직원이 낀 회의는 AI 대신 튜토리얼 대본이 발언한다. 튜토리얼이 받지 않으면(회의 단계가 아님) 바로 닫는다 */
  private startPracticeMeeting(meeting: Meeting) {
    const practice: Meeting = { ...meeting, isPractice: true }
    this.meetings = [practice, ...this.meetings].slice(0, MEETING_KEEP)
    db.saveMeeting(practice)
    if (!this.tutorial.notify('meetingStarted', practice.id)) {
      practice.status = 'stopped'
      db.saveMeeting(practice)
    }
    this.scheduleEmit()
    return practice
  }

  private async runMeeting(m: Meeting) {
    const people = m.participantIds.map((id) => this.hired.get(id)).filter((s): s is db.StoredStaff => Boolean(s))
    m.decisions = m.decisions ?? []
    // 진행자 = 팀장·랩 리드인 참석자, 없으면 첫 참석자. 회의록을 쓰고 위임된 결정을 정한다
    const chair = people.find((p) => this.teamOf(p.id)?.leadId === p.id || this.labsOf(p.id).some((l) => l.leadId === p.id)) ?? people[0]
    const transcript = () => {
      const decided = decisionsContext(m)
      return [m.messages.map((x) => `${x.name}: ${x.text}`).join('\n') || '(아직 발언 없음)', decided && `\n${decided}`].filter(Boolean).join('\n')
    }
    try {
      rounds: for (let round = 0; round < m.rounds; round++) {
        for (const p of people) {
          if (this.meetingStops.has(m.id)) break rounds
          this.patch(p.id, { activity: '회의 중 발언 준비' })
          const canAsk = m.decisions.length < MEETING_DECISIONS_MAX
          const r = await askOnce({
            cwd: p.cwd,
            tier: 'standard',
      model: p.model,
            system: [
              `당신은 ${p.name}(${p.role})입니다. ${p.systemPrompt}`,
              t('staff.language'),
              '사무실 회의에 참석 중입니다. 자기 직무 관점에서 2~4문장으로 짧게 말하세요. 다른 사람 의견에 동의·반박·보완하세요.',
              canAsk
                ? '대표(사용자)의 판단이 꼭 필요한 결정(방향·범위·우선순위·비용처럼 직원끼리 정하면 안 되는 것)이 있을 때만, 발언 맨 끝 줄에 `[결정 요청] 질문 | 선택지1 | 선택지2 | 선택지3` 형식으로 하나만 남기세요. 사소한 건 묻지 말고, 이미 대표가 결정한 건 다시 묻지 마세요.'
                : '대표에게 더 묻지 말고, 이미 내린 결정을 따르세요.',
            ].join('\n'),
            prompt: `회의 주제: ${m.topic}\n\n지금까지:\n${transcript()}\n\n${p.name}로서 발언하세요.`,
          })
          this.recordUsage(p.id, r)
          const { text, decision } = splitDecision(r.text)
          m.messages.push({ staffId: p.id, name: p.name, text: text || '(발언 없음)', ts: Date.now() })
          this.patch(p.id, { activity: text.slice(0, 80) })
          db.saveMeeting(m)
          this.scheduleEmit()
          if (decision && canAsk) {
            const d = await this.askDecision(m, p, decision)
            // 정리하고 끝내기 중이어도 회의록에 들어가도록 정한다 (그냥 끝내기면 생략)
            if (d.kind === 'delegated' && chair && this.meetingStops.get(m.id) !== 'discard') await this.decideDelegated(m, d, chair, transcript())
          }
        }
      }
      // "그냥 끝내기"거나 아직 아무도 말하지 않았으면 회의록·결과 카드 없이 끝낸다
      const isDiscarded = this.meetingStops.get(m.id) === 'discard' || (this.meetingStops.has(m.id) && m.messages.length === 0)
      if (isDiscarded) {
        m.status = 'stopped'
        m.summary = '대표가 회의를 중간에 끝냈어요.'
      } else if (chair) {
        const names = people.map((p) => `${p.name}(${p.role})`).join(', ')
        const r = await askOnce({
          cwd: chair.cwd,
          tier: 'standard',
      model: chair.model,
          system: '회의록 작성자입니다. 한국어로 간결하게 씁니다.',
          prompt: `회의 주제: ${m.topic}\n참석자: ${names}\n\n${transcript()}\n\n아래 형식으로 회의록을 써 주세요. 대표가 내린 결정·위임 결정은 앱이 따로 붙이니 쓰지 마세요.\n결론: (한두 문장)\n합의 사항:\n- (참석자끼리 합의한 내용, 없으면 "없음")\n할 일:\n- [할 일] 제목 (담당: 참석자 이름 중 한 명)\n할 일이 없으면 "할 일: 없음".`,
        })
        this.recordUsage(chair.id, r)
        // 결정은 AI가 다시 쓰지 않는다 — 저장된 결정으로 앱이 만든 섹션을 회의록 뒤에 붙인다
        const decisions = m.decisions.length ? decisionSections(m) : ''
        m.summary = [r.text.trim(), decisions].filter(Boolean).join('\n\n')
        const lab = this.labsOf(chair.id).find((l) => people.every((p) => l.memberIds.includes(p.id)))
        const items = parseActionItems(r.text)
        if (items.length && this.delegatesOf(chair.id).length) {
          // 진행자가 리드면 할 일을 낱장으로 뿌리지 않는다 — 선행 관계를 모른 채 "모두 시작"으로 한꺼번에 돌지 않게,
          // 결과 카드 한 장을 리드에게 주고 리드가 순서를 정해 기획안으로 올린다 (시작은 사용자가 보드에서)
          const card = meetingResultCard(
            m.topic,
            r.text,
            items.map((it) => ({ title: it.title, assignee: people.find((p) => it.assignee && it.assignee.includes(p.name))?.name ?? null })),
            decisionSections(m),
          )
          const task = this.createTask({ ...card, teamId: this.teamOf(chair.id)?.id ?? null, labId: lab?.id ?? null })
          // 시작은 지금처럼 대표가 보드에서 누른다
          this.saveTask({ ...task, assigneeId: chair.id, meetingId: m.id })
        } else
          for (const item of items) {
            const assignee = people.find((p) => item.assignee && item.assignee.includes(p.name))
            const task = this.createTask({ title: item.title, detail: `회의 "${m.topic}"에서 나온 할 일`, teamId: this.teamOf(assignee?.id ?? chair.id)?.id ?? null, labId: lab?.id ?? null })
            // 리드가 없는 회의는 예전처럼 담당 제안만 채워 둔다 (시작은 보드에서 사용자가)
            if (assignee) this.saveTask({ ...task, assigneeId: assignee.id })
          }
      }
      if (!isDiscarded) {
        m.status = 'done'
        this.postChat(chair?.id ?? 'me', `📋 회의록 — ${m.topic}\n${m.summary}`.slice(0, CHAT_TEXT_MAX * 2))
      }
    } catch (e) {
      m.status = 'failed'
      m.summary = `회의가 중단됐습니다: ${String(e)}`
    }
    this.meetingStops.delete(m.id)
    for (const p of people) this.patch(p.id, { activity: '' })
    db.saveMeeting(m)
    this.scheduleEmit()
  }

  /** 회의를 멈추고 대표의 답을 기다린다 */
  private askDecision(m: Meeting, p: db.StoredStaff, { question, options, raw }: { question: string; options: string[]; raw: string }) {
    const decision: MeetingDecision = { id: crypto.randomUUID(), askedBy: p.id, askedByName: p.name, question, options, answer: null, ts: Date.now(), raw }
    m.decisions = [...(m.decisions ?? []), decision]
    m.status = 'waiting'
    db.saveMeeting(m)
    this.patch(p.id, { activity: `결정 요청: ${question}`.slice(0, 80) })
    this.postChat(p.id, `🙋 회의 "${m.topic}" 결정 부탁드려요: ${question}${options.length ? ` (${options.join(' / ')})` : ''}`)
    this.emit('notify', { title: t('notify.meetingDecision', { topic: m.topic }), body: question.slice(0, 120), staffId: p.id })
    this.scheduleEmit()
    return new Promise<MeetingDecision>((resolve) => {
      this.pendingDecisions.set(decision.id, (answer, ended) => {
        recordAnswer(decision, answer, Boolean(ended), Date.now())
        m.status = 'running'
        db.saveMeeting(m)
        if (!this.meetingStops.has(m.id)) this.postChat('me', `✅ 결정: ${question} → ${answer || '알아서 정해 주세요'}`)
        this.scheduleEmit()
        resolve(decision)
      })
    })
  }

  /** 대표가 "알아서 정해"라고 한 결정을 진행자가 바로 한 번 정한다 — 결정자·최종 선택·이유를 남기고 다음 발언부터 그 값을 따른다 */
  private async decideDelegated(m: Meeting, d: MeetingDecision, chair: db.StoredStaff, transcript: string) {
    this.patch(chair.id, { activity: '위임된 결정 정하는 중' })
    this.scheduleEmit()
    try {
      const r = await askOnce({
        cwd: chair.cwd,
        tier: 'standard',
      model: chair.model,
        system: `당신은 ${chair.name}(${chair.role})이고 이 회의의 진행자입니다. ${chair.systemPrompt}\n${t('staff.language')}`,
        prompt: `회의 주제: ${m.topic}\n\n지금까지:\n${transcript}\n\n${delegatedPrompt(d.question, d.options)}`,
      })
      this.recordUsage(chair.id, r)
      const picked = parseDelegatedChoice(r.text, d.options)
      if (!picked) return
      recordDelegated(d, chair, picked, Date.now())
      db.saveMeeting(m)
      this.postChat(chair.id, `🤝 위임 결정(${chair.name}): ${d.question} → ${picked.choice}${picked.reason ? ` — ${picked.reason}` : ''}`.slice(0, CHAT_TEXT_MAX))
    } catch {
      // 정하지 못하면 "위임 · 아직 정하지 않음"으로 남고 회의는 이어진다
    } finally {
      this.patch(chair.id, { activity: '' })
      this.scheduleEmit()
    }
  }

  answerMeetingDecision(meetingId: string, decisionId: string, answer: string) {
    const resolve = this.pendingDecisions.get(decisionId)
    if (!resolve || !this.meetings.some((m) => m.id === meetingId)) return
    this.pendingDecisions.delete(decisionId)
    // 대표가 내린 결정은 지식 창고에 남긴다
    const decision = this.meetings.find((m) => m.id === meetingId)?.decisions?.find((d) => d.id === decisionId)
    if (decision && answer.trim()) this.rememberKnowledge({ kind: 'decision', title: decision.question, body: answer, tags: [] })
    resolve(answer.trim())
  }

  /** 진행 중인 회의를 끝낸다 — 지금 하는 발언이 끝나는 대로 멈추고, 결정 대기 중이면 바로 풀어 준다 */
  endMeeting(meetingId: string, mode: 'wrapup' | 'discard') {
    const m = this.meetings.find((x) => x.id === meetingId)
    if (!m || (m.status !== 'running' && m.status !== 'waiting')) return
    if (m.isPractice) {
      m.status = 'stopped'
      db.saveMeeting(m)
      this.scheduleEmit()
      return
    }
    this.meetingStops.set(m.id, mode)
    for (const ac of this.demoAborts.get(m.id) ?? []) ac.abort()
    for (const d of m.decisions ?? []) {
      const resolve = d.answer === null ? this.pendingDecisions.get(d.id) : undefined
      if (!resolve) continue
      this.pendingDecisions.delete(d.id)
      resolve('', true)
    }
    this.postChat('me', `⏹ 회의를 끝내요${mode === 'wrapup' ? ' — 지금까지 이야기로 회의록을 정리할게요' : ''}: ${m.topic}`.slice(0, CHAT_TEXT_MAX))
  }

  startTasks(taskIds: string[]) {
    for (const id of taskIds) {
      const t = this.tasks.get(id)
      if (t?.status === 'todo' && t.assigneeId && !isAbsorbedOpen(t, this.tasks.get(t.parentId ?? ''))) this.assignTask(t.id, t.assigneeId)
    }
  }

  private recordUsage(staffId: string, r: { costUsd: number; tokensIn: number; tokensOut: number }) {
    db.insertUsage(staffId, r.costUsd, r.tokensIn, r.tokensOut)
    const s = this.hired.get(staffId)
    if (s) {
      s.costUsd += r.costUsd
      s.tokensIn += r.tokensIn
      s.tokensOut += r.tokensOut
    }
  }

  // ── 예약 업무 ─────────────────────────────────────────

  saveSchedule(input: Omit<Schedule, 'lastRunDate'>) {
    const prev = this.schedules.get(input.id)
    const s: Schedule = { ...input, lastRunDate: prev?.lastRunDate ?? null }
    db.upsertSchedule(s)
    this.schedules.set(s.id, s)
    this.scheduleEmit()
  }

  deleteSchedule(id: string) {
    db.deleteScheduleRow(id)
    this.schedules.delete(id)
    this.scheduleEmit()
  }

  // ── 플랜 한도 보류 ────────────────────────────────────

  private currentHold() {
    return planHold(this.planUsage, Date.now(), this.holdBypassUntil)
  }

  private planHoldState(): PlanHoldState {
    return { ...this.currentHold(), items: this.heldJobs.map(({ parentId: _p, ...item }) => item) }
  }

  /** 보류해야 하면 목록에 넣고 true (처음 보류될 때 단체방에 한 번 알린다) */
  private holdJob(job: HeldItem & { parentId?: string }) {
    const hold = this.currentHold()
    if (!hold.isHeld) return false
    if (this.heldJobs.some((j) => j.kind === job.kind && j.id === job.id)) return true
    const isFirst = this.heldJobs.length === 0
    this.heldJobs = [...this.heldJobs, job]
    this.log(job.staffId, 'status', t('log.planHeld', { label: job.label }))
    if (isFirst) {
      const body = t('notify.planHeldBody', { percent: Math.round(hold.percent ?? 100), when: fmtDate(hold.resumeAt ?? 0, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })
      this.emit('notify', { title: t('notify.planHeld'), body, staffId: '' })
      this.postChat('me', `⏳ ${body}`)
    }
    this.scheduleEmit()
    return true
  }

  /** 한도가 회복됐으면 보류했던 일을 시작한다 */
  private releaseHeldIfRecovered() {
    if (this.heldJobs.length === 0 || this.currentHold().isHeld) return
    const jobs = this.heldJobs
    this.heldJobs = []
    const today = dateKey(new Date())
    for (const j of jobs) {
      if (j.kind === 'schedule') {
        const sc = this.schedules.get(j.id)
        if (sc?.enabled && sc.lastRunDate !== today) this.runSchedule(sc, today)
      } else if (j.parentId) this.advancePlan(j.parentId)
    }
    this.postChat('me', `▶️ ${t('notify.planResumed', { n: jobs.length })}`)
    this.scheduleEmit()
  }

  /** 대표가 "바로 시작": 보류 중인 일을 지금 시작하고, 원래 회복 시각까지는 다시 보류하지 않는다 */
  releasePlanHold() {
    const hold = this.currentHold()
    if (hold.resumeAt) this.holdBypassUntil = hold.resumeAt
    this.releaseHeldIfRecovered()
  }

  runScheduleNow(id: string) {
    const s = this.schedules.get(id)
    if (s) this.runSchedule(s, dateKey(new Date()))
  }

  private runDueSchedules() {
    const now = new Date()
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const today = dateKey(now)
    for (const s of this.schedules.values()) {
      if (!s.enabled || s.lastRunDate === today || !s.weekdays.includes(now.getDay()) || s.time > hhmm) continue
      // 한도가 거의 찼으면 오늘 한 것으로 치지 않고 보류 — 회복되면 같은 날 안에 자동으로 돈다
      if (this.holdJob({ kind: 'schedule', id: s.id, label: s.label, staffId: s.staffId })) continue
      this.runSchedule(s, today)
    }
  }

  private runSchedule(s: Schedule, today: string) {
    if (!this.hired.has(s.staffId)) return
    const next = { ...s, lastRunDate: today }
    db.upsertSchedule(next)
    this.schedules.set(s.id, next)
    this.instruct(s.staffId, `[예약 업무 · ${s.label}] ${s.instruction}`, { kind: 'schedule' })
    this.scheduleEmit()
  }

  // ── 단체방 ────────────────────────────────────────────

  chatHistory() {
    return db.recentChat(CHAT_HISTORY)
  }

  /** @이름 으로 부르면 그 직원에게 지시로 전달한다 */
  /** 단체방: @직원·@팀·@랩·@전체 구성원에게 지시하고, 멘션이 없으면 알맞은 직원 한 명이 받는다 */
  sendChat(text: string, attachments: Attachment[] = []) {
    this.postChat('me', text, attachments)
    // 앱이 직접 처리하는 단체방 명령: /데모데이
    if (/^\/(데모데이|demoday)$/i.test(text.trim())) return this.runDemoDayNow()
    // 튜토리얼 연습 직원·팀·랩은 단체방 대상에서 뺀다 (AI 호출 없음)
    const hired = [...this.hired.values()].filter((s) => !s.isPractice)
    if (hired.length === 0) return this.postChat(OFFICE_SENDER, '고용한 직원이 없어 아무에게도 전달하지 못했어요.')
    const teams = [...this.teams.values()].filter((t) => !t.isPractice)
    const labs = [...this.labs.values()].filter((l) => !l.isPractice)
    const { matched, recipientIds, body } = parseMentions(text, mentionTargets(hired, teams, labs))
    // 멘션만 있고 할 말이 없으면 여러 명에게 빈 지시가 가지 않게 막는다. 첨부만 있으면 첨부를 보라고 전한다
    if (!body && attachments.length === 0) return this.postChat(OFFICE_SENDER, '내용이 없어 전달하지 않았어요.')
    // `@이름 /명령`은 머리말 없이 그대로 보내야 세션이 명령으로 알아듣는다
    const message = body.startsWith('/') ? body : `[단체방] ${body || '첨부 파일을 확인해 주세요.'}`
    if (matched.length === 0) {
      const leadIds = new Set([...teams, ...labs].map((g) => g.leadId))
      const id = pickResponder(
        body,
        hired.map((s) => ({ id: s.id, role: s.role, status: s.status, isOverBudget: false, isLead: leadIds.has(s.id) })),
      )
      if (!id) return this.postChat(OFFICE_SENDER, '모든 직원이 이번 달 예산을 다 써서 전달하지 못했어요.')
      this.postChat(OFFICE_SENDER, `${this.hired.get(id)?.name} 님이 받았어요.`)
      return this.instruct(id, message, { kind: 'chat' }, attachments)
    }
    const empty = matched.filter((t) => t.memberIds.length === 0).map((t) => t.name)
    if (empty.length) this.postChat(OFFICE_SENDER, `${empty.join(', ')}에는 고용 직원 구성원이 없어요.`)
    // 직원 한 명만 부른 예전 방식은 안내 줄 없이 그대로
    const isSingleStaff = matched.length === 1 && matched[0].kind === 'staff'
    if (recipientIds.length > 0 && !isSingleStaff) {
      const groups = matched.filter((t) => t.kind !== 'staff' && t.memberIds.length > 0).map((t) => t.name)
      this.postChat(OFFICE_SENDER, `${groups.length ? `${groups.join(', ')} 포함 ` : ''}${recipientIds.length}명에게 전달했어요.`)
    }
    for (const id of recipientIds) this.instruct(id, message, { kind: 'chat' }, attachments)
  }

  private postChat(from: string, text: string, attachments?: Attachment[], approval?: ChatApproval) {
    this.emit('chat', db.insertChat(from, text, attachments, approval))
  }

  /** 결재·질문 처리 결과를 단체방 메시지에 남긴다 (어디서 처리했든 — 결재함·단체방·휴대폰) */
  private settleChat(approval: ChatApproval) {
    const m = db.settleChatApproval(approval)
    if (m) this.emit('chatUpdate', m)
  }

  // ── 기록·급여·보고서 ──────────────────────────────────

  timeline(since: number) {
    return db.allLogsBetween(since, Date.now() + 1)
  }

  /** month: "YYYY-MM" 또는 지금 기준 "day"(오늘)·"week"(이번 주) */
  payslip(month: string): Payslip {
    const [y, mo] = month.split('-').map(Number)
    const isPeriod = month === 'day' || month === 'week'
    const since = isPeriod ? periodStart(month, new Date()) : new Date(y, mo - 1, 1).getTime()
    const until = isPeriod ? Date.now() + 1 : new Date(y, mo, 1).getTime()
    const rows = db.usageByStaffBetween(since, until).map((r) => {
      const s = this.hired.get(r.staff_id)
      // 비서 사용량은 "비서" 한 줄로 (한도 합계에는 같이 든다 — 같은 계정 사용량)
      const isSecretary = r.staff_id === SECRETARY_ID
      return {
        staffId: r.staff_id,
        name: isSecretary ? '비서' : (s?.name ?? '퇴사자'),
        role: isSecretary ? '말로 앱을 쓰는 AI 비서' : (s?.role ?? ''),
        avatar: s?.avatar ?? 0,
        costUsd: r.c,
        tokensIn: r.i,
        tokensOut: r.o,
        tasksDone: db.resultCountBetween(r.staff_id, since, until),
      }
    })
    rows.sort((a, b) => b.costUsd - a.costUsd)
    const totalTokens = rows.reduce((sum, r) => sum + budgetTokens(r), 0)
    const periods = BUDGET_PERIODS.map((period) => (period === 'month' ? { period, usedTokens: totalTokens, limitTokens: this.settings.tokenBudget.month } : this.periodUsage(period)))
    return { month, rows, totalUsd: rows.reduce((sum, r) => sum + r.costUsd, 0), budgetUsd: this.settings.monthlyBudgetUsd, totalTokens, periods, savedTokens: db.savedTokensBetween(since, until) }
  }

  /** 지금이 속한 일·주·월의 예산 토큰 사용량 */
  private periodUsage(period: BudgetPeriod, now = new Date()): PeriodUsage {
    return { period, usedTokens: budgetTokens(db.usageTotalBetween(periodStart(period, now), Date.now() + 1)), limitTokens: this.settings.tokenBudget[period] }
  }

  /** 하루치 로그·보드·사용량으로 만드는 일일 보고서 (AI 호출 없음) */
  dailyReport(dateMs: number) {
    const day = new Date(dateMs)
    const since = startOfDay(day)
    const until = since + 24 * 60 * 60 * 1000
    const logs = db.allLogsBetween(since, until)
    const lines = [`# ${tr('report.title', { date: fmtDate(day, { month: 'long', day: 'numeric', weekday: 'short' }) })}`, '']
    let total = 0
    for (const s of this.hired.values()) {
      const mine = logs.filter((l) => l.staffId === s.id)
      const usage = db.usageSince(s.id, since, until)
      total += usage.costUsd
      if (mine.length === 0) continue
      const count = (t: LogType) => mine.filter((l) => l.type === t).length
      lines.push(`## ${s.name} · ${s.role}`)
      lines.push(tr('report.counts', { i: count('instruction'), r: count('result'), t: count('tool'), a: count('approval'), cost: `$${usage.costUsd.toFixed(3)}` }))
      for (const l of mine.filter((x) => x.type === 'instruction')) lines.push(tr('report.instruction', { text: l.text.replace(/\s+/g, ' ').slice(0, REPORT_TEXT_MAX) }))
      const lastReply = mine.filter((x) => x.type === 'reply').at(-1)
      if (lastReply) lines.push(tr('report.lastReply', { text: lastReply.text.replace(/\s+/g, ' ').slice(0, REPORT_TEXT_MAX) }))
      lines.push('')
    }
    const doneTasks = [...this.tasks.values()].filter((t) => t.updatedAt >= since && t.updatedAt < until && (t.status === 'review' || t.status === 'done'))
    if (doneTasks.length) {
      lines.push(tr('report.board'))
      for (const t of doneTasks) lines.push(`- [${t.status === 'done' ? tr('report.done') : tr('report.review')}] ${t.title}`)
      lines.push('')
    }
    lines.push(tr('report.totalCost', { cost: `$${total.toFixed(3)}` }))
    return lines.join('\n')
  }

  updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch }
    db.saveSettings(this.settings)
    if (patch.language !== undefined) this.applyLanguage()
    this.scheduleEmit()
  }

  /** 설정의 언어를 main 쪽 t()에 반영 (auto면 기기 언어). 화면(navigator.language)과 같은 기준인 app.getLocale()을 쓴다 —
   *  Node의 Intl 로케일은 Finder로 켜면 LANG이 비어 영어로 떨어져 화면과 main 문구 언어가 갈린다 */
  private applyLanguage() {
    setLang(resolveLang(this.settings.language, app.getLocale()))
    // 언어를 바꾸면 그 언어 번역이 없는 /명령 설명만 새로 번역한다
    for (const id of this.commands.keys()) void this.translateCommands(id)
  }

  /** 실제 한도는 Claude 플랜이 정한다 — 앱이 정한 토큰·비용 한도 대신 플랜 사용률이 80%·100%를 넘을 때 알린다 */
  private checkPlanUsage() {
    for (const p of this.planUsage) {
      if (p.percent === null) continue
      this.warnBudget(
        `plan:${p.type}:${p.resetsAt ?? 0}`,
        p.percent / 100,
        (ratio) =>
          t('notify.planUsageBody', { window: tx(`planUsage.window.${p.type}`, PLAN_WINDOW_LABEL[p.type] ?? p.type), percent: Math.round(ratio * 100) }) + (p.resetsAt ? t('notify.planReset', { when: fmtDate(p.resetsAt, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }) : ''),
      )
    }
  }

  /** 80%·100% 문턱마다 한 번씩만, 한 번에 둘 다 넘으면 높은 쪽만 알린다 */
  private warnBudget(scope: string, used: number, message: (ratio: number) => string) {
    const alert = nextBudgetAlert(scope, used, this.budgetWarned)
    if (!alert) return
    for (const key of alert.keys) this.budgetWarned.add(key)
    this.budgetWarned = new Set(pruneAlertKeys(this.budgetWarned, new Date()))
    db.saveBudgetAlerts([...this.budgetWarned])
    const body = message(alert.ratio)
    this.emit('notify', { title: t('notify.planUsage'), body, staffId: '' })
    this.postChat('me', `📊 ${body}`)
  }

  // ── 공통 ──────────────────────────────────────────────

  private patch(id: string, patch: Partial<db.StoredStaff>) {
    const s = this.hired.get(id)
    if (!s) return
    Object.assign(s, patch)
    this.scheduleEmit()
  }

  private log(staffId: string, type: LogType, text: string, attachments?: Attachment[]) {
    const c = this.counters.get(staffId) ?? {}
    c[type] = (c[type] ?? 0) + 1
    this.counters.set(staffId, c)
    this.emit('log', db.insertLog(staffId, type, remoteMarked(type, text), attachments))
    this.scheduleEmit()
  }

  private nextDesk() {
    const used = new Set([...this.hired.values(), ...this.external].map((s) => s.deskIndex))
    let i = 0
    while (used.has(i)) i++
    return i
  }

  /** 스트림 이벤트가 몰려도 renderer 갱신은 50ms에 한 번 */
  private scheduleEmit() {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.syncWorkDirs()
      this.checkCompanyLevel()
      this.emit('snapshot', this.snapshot())
    }, 50)
  }
}

/** 회의록의 "할 일:" 아래 글머리표를 카드로 뽑는다 ([할 일]·[ ]·굵게 표시는 걷어내고 "(담당: 이름)"은 따로) */
function parseActionItems(text: string) {
  const items: { title: string; assignee: string | null }[] = []
  let isInTodo = false
  for (const raw of text.split('\n')) {
    const line = raw.replaceAll('**', '').trim()
    if (/^할 일\s*:/.test(line)) {
      isInTodo = !/없음/.test(line)
      continue
    }
    const bullet = line.match(/^[-*•]\s*(?:\[[^\]]*\]\s*)?(.+)$/)
    if (isInTodo && bullet) {
      const m = bullet[1].match(/^(.*?)\s*\((?:담당|담당 제안)\s*[:：]?\s*([^)]*)\)\s*$/)
      items.push(m ? { title: m[1].trim(), assignee: m[2].trim() || null } : { title: bullet[1].trim(), assignee: null })
    } else if (isInTodo && line && !bullet) isInTodo = false
  }
  return items
}

function isFile(p: string) {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hash(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/** 번역 캐시 키 — 같은 설명·같은 언어면 직원·명령이 달라도 한 번만 번역한다 */
function commandTextKey(text: string, lang: Lang) {
  return `${lang}:${createHash('sha256').update(text).digest('hex').slice(0, 32)}`
}
