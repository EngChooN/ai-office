import path from 'node:path'
import type { AiProvider, Approval, Attachment, Staff, StaffQuestion } from '../shared/types'
import { findRiskyCommand, isBashPolicyMark, isReadOnlyCommand, READ_ONLY_BASH, RISKY_BASH } from '../shared/bashPolicy'
import { toQuestions } from './external'
import { isRefDocRead } from '../shared/refDocs'
import { ruleDraftFor } from '../shared/approvalRules'
import { t, tk, type I18nArg } from '../shared/i18n/index.ts'
import os from 'node:os'
import { insertUsage, saveSessionId } from './db'
import { findCodexRollout, readCodexTail } from './ai/codexSession'
import { CONTEXT_ROTATE_TOKENS, findSessionFile, handoffText, readSessionTail } from './sessionRotate'
import { BROWSER_EQUIPMENT, browserVerdict } from '../shared/browserTools.ts'
import { COMPUTER_EQUIPMENT, computerSummary, computerSummaryI18n, computerVerdict, toolDisplayName } from '../shared/computerTools.ts'
import { parseSlash, type RawCommand } from '../shared/slashCommands.ts'
import { browserOutputDir } from './browser'
import { createRuntime, modelIdFor, type AgentRuntime, type RateLimitInfo, type RuntimeEvent, type RuntimeMcpServer, type ToolDecision } from './ai'

const ACTIVITY_MAX = 80
/** 새 업무 카드를 받을 때 새 대화로 넘기는 최소 문맥 (이보다 짧으면 넘겨도 아끼는 게 없다) */
const CARD_ROTATE_MIN_TOKENS = 20_000
/** 인수인계 글이 차지하는 토큰 (직전 보고 상한 4000자 안팎) */
const HANDOFF_TOKENS = 2_000
/** 한 번 지시에 모델을 부르는 평균 횟수 — 아낀 양은 "문맥 × 이 횟수"로 보수적으로 추정한다 */
const SAVED_CALLS_PER_TURN = 5
/** 시스템 프롬프트에 덧붙이는 글 전체·직원 지침 길이 상한 (글자) */
const PROMPT_MAX = 8000
const PERSONA_MAX = 4000
const capPrompt = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n…` : text)

/** 간단한 업무로 보는 업무 카드: 짧고, 분류·요약·정리 말이 있고, 만들기·고치기 말이 없다 */
const LIGHT_WORDS = /분류|요약|정리|취합|집계|번역|classif|summar|tidy|organi[sz]e|translat|分類|要約|整理|分类|摘要/i
const HEAVY_WORDS = /구현|수정|개발|코드|버그|리뷰|테스트|설계|디버|리팩|implement|refactor|debug|\bfix\b|\bcode\b|\bbuild\b|review|test|design|実装|修正|开发|修复/i
const LIGHT_TEXT_MAX = 800
export function isLightTask(text: string) {
  const mark = `[${t('staff.msg.boardMark')}]`
  return text.startsWith(mark) && text.length <= LIGHT_TEXT_MAX && LIGHT_WORDS.test(text) && !HEAVY_WORDS.test(text)
}
export interface HiredHooks {
  update(staffId: string, patch: Partial<Staff>): void
  log(staffId: string, type: 'reply' | 'tool' | 'result' | 'error' | 'status', text: Exclude<I18nArg, number>): void
  requestApproval(approval: Approval): void
  /**
   * 자동결재(대표 부재 중): 결재함에 올리기 전에 대표 대신 판정한다. null이면 평소처럼 결재함.
   * 질문이면 answers(질문 → 답)를 채워 돌려준다. deny가 있으면 결재함에 올리지 않고 그 사유로 거부한다 (자율 진행의 위험 작업)
   */
  autoDecide(staffId: string, toolName: string, input: Record<string, unknown>, summary: string, questions?: StaffQuestion[]): Promise<{ answers?: Record<string, string>; deny?: string }> | null
  /** 지금 자율 진행 중인가 (위험 명령 금지를 강제로 켠다) */
  isAutonomous(staffId: string): boolean
  /** Claude 구독 사용률 알림 (값이 바뀔 때만 온다) */
  rateLimit(info: RateLimitInfo, provider: AiProvider): void
  /** 세션이 결재 요청을 거둬들임 (취소·세션 재시작) */
  cancelApproval(approvalId: string): void
  /**
   * backgroundTasks: 턴이 끝날 때 세션에 아직 돌고 있는 백그라운드 작업 설명 (끝나도 직원을 다시 깨우지 않으니 점검용).
   * pending: 일하는 중에 받아 아직 답하지 않은 지시 수 (다음 결과로 이어서 답한다)
   */
  finished(staffId: string, summary: string, backgroundTasks: string[], pending: number): void
  /** 손이 빈 직원이 새 지시를 받아 일을 시작함 (작업 전 상태를 기록하는 시점) */
  workStarted(staffId: string): void
  /** 직원이 파일 수정 도구로 건드린 파일 경로 (같은 폴더를 쓰는 다른 직원의 변경과 가르는 용도) */
  touched(staffId: string, filePath: string): void
  /** 한 턴에 쓴 토큰·비용 (업무 카드별 비용에 더한다) */
  usage(staffId: string, delta: { cost: number; tokensIn: number; tokensOut: number }): void
  /** 앱 구조로 아낀 토큰(추정)을 급여 명세서용으로 기록 */
  saved(staffId: string, tokens: number): void
  /** 대표가 하던 일을 멈춤 (보고 없이 끝남) */
  stopped(staffId: string): void
  /** 실행 중 예외로 멈춤 (보고 없이 끝남 — 받은 일 정리·대화방 알림) */
  failed(staffId: string, error: string): void
  /** 사무실 MCP 도구(팀 조회·위임·보드). 직원마다 같은 서버를 붙이고 권한은 도구 안에서 판단한다 */
  officeTools(staffId: string): RuntimeMcpServer
  /** 세션 시작 시 덧붙이는 팀 맥락 */
  context(staffId: string): string
  /** 세션 시작 시 정하는 참고 문서: 프롬프트 안내와 결재 없이 읽을 경로 (둘이 어긋나지 않게 한 번에 받는다) */
  refDocs(staffId: string): { prompt: string; paths: string[] }
  /** 지급된 MCP 서버 설정 (장비) */
  /** 설정의 '직원 화면 캡처 허용' (꺼지면 장비로 지급받은 직원만 캡처) */
  isScreenCaptureOn(): boolean
  equippedMcp(staffId: string): Record<string, RuntimeMcpServer>
  /** 세션이 알려 준 /명령어 목록 (세션을 열 때·목록이 바뀔 때·미리 불러올 때). terminalOnly = 터미널 화면 전용 명령 이름 */
  commands(staffId: string, raw: RawCommand[], terminalOnly: string[]): void
}

const OFFICE_TOOL_PREFIX = 'mcp__office__'
const QUESTION_TOOL = 'AskUserQuestion'

/** 직원 1명 = 세션(AgentRuntime) 1개. 지시가 오면 세션에 넘기고, 결재는 canUseTool에서 대기한다 */
class Worker {
  private rt: AgentRuntime
  private pending = new Map<string, (r: ToolDecision) => void>()
  /** 답을 기다리는 질문 도구의 원래 입력 */
  private questionInputs = new Map<string, Record<string, unknown>>()
  /** 지시를 받아 결과가 나오기 전까지 — 이때 세션을 닫으면 하던 일이 끊긴다 */
  private isRunning = false
  /** 일하는 중에 장비·지침·폴더가 바뀌면 끝난 뒤에 적용한다 */
  private pendingRestart: 'restart' | 'reset' | null = null
  /** 중단을 요청한 뒤 끊긴 결과를 기다리는 중 — resume이면 끊고 바로 새 지시를 이어 받는다 (끼어들기) */
  private stopping: 'stop' | 'resume' | null = null
  private baseline: { cost: number; tokensIn: number; tokensOut: number }
  /** 직전에 모델을 부를 때 보낸 문맥 크기 (null: 아직 모름 — 앱을 켠 뒤 첫 지시 때 기록 끝부분에서 읽는다) */
  private contextTokens: number | null = null
  /** 지금 세션이 쓰는 모델 (간단한 업무 카드는 직원 모델 대신 가벼운 모델) */
  private modelNow: Staff['model']
  /** 새 대화로 넘길 때 인수인계로 붙일 직전 보고 */
  private lastReport = ''
  /** 보낸 /명령 이름 (결과가 올 때까지) — /compact처럼 모델이 돌지 않는 명령도 끝난 보고로 친다 */
  private slashPending: string | null = null
  /** 세션 init이 알려 준 터미널 화면 전용 명령 */
  private terminalOnly: string[] = []
  /** 세션에서 돌고 있는 백그라운드 작업 (SDK background_tasks_changed — 받을 때마다 통째로 바꾼다) */
  private backgroundTasks: string[] = []

  constructor(
    private staff: Staff,
    private hooks: HiredHooks,
  ) {
    // 이어받는 세션의 첫 result는 이전 누적을 포함하므로, 이미 기록한 값부터 차감한다
    this.baseline = { cost: staff.costUsd, tokensIn: staff.tokensIn, tokensOut: staff.tokensOut }
    this.modelNow = staff.model
    this.rt = createRuntime(staff.provider, (e) => this.handle(e))
  }

  private modelId(m: Staff['model']) {
    return modelIdFor(this.staff.provider, m)
  }

  private pickModel(text: string): Staff['model'] {
    const s = this.staff
    // 가벼운 일 → Haiku 전환은 Claude 직원만 (Codex 모델 고르기는 M3 모델 추천에서)
    return s.provider !== 'claude' || s.equipment.lightModelOff || s.model === 'haiku' || !isLightTask(text) ? s.model : 'haiku'
  }

  /** fresh: 업무 카드를 새로 받는 지시 — 이전 대화가 길지 않아도 새 대화로 시작하고 직전 보고만 넘긴다 */
  send(text: string, attachments: Attachment[] = [], fresh = false) {
    const slash = parseSlash(text)
    if (slash && !this.isRunning) this.slashPending = slash.name
    // 손이 빈 상태에서 받은 새 지시만 — 일하는 중 끼어든 말은 같은 대화에 이어야 한다. /명령은 앞에 인수인계를 붙이면 명령이 깨지므로 넘기지 않는다
    // 모델 판정은 인수인계를 붙이기 전 원문 지시로 한다 (붙인 뒤엔 길이·단어 규칙이 깨진다)
    const light = !this.isRunning && !slash ? this.pickModel(text) : this.modelNow
    if (!this.isRunning && !slash) text = this.rotateIfLong(text, fresh)
    if (light !== this.modelNow) {
      this.modelNow = light
      this.rt.setModel(this.modelId(light))
    }
    if (!this.isRunning && !slash) this.hooks.workStarted(this.staff.id)
    this.rt.send(text, attachments)
    if (!this.rt.isOpen) this.start()
    this.isRunning = true
    this.hooks.update(this.staff.id, { status: 'working', activity: '지시 확인 중' })
  }

  decide(approvalId: string, allow: boolean) {
    const resolve = this.pending.get(approvalId)
    if (!resolve) return false
    this.pending.delete(approvalId)
    const isQuestion = this.questionInputs.delete(approvalId)
    resolve(allow ? { behavior: 'allow' } : { behavior: 'deny', message: isQuestion ? t('staff.deny.skipped') : t('staff.deny.rejected') })
    return true
  }

  /** 질문 도구는 답(질문 문장 → 답)을 입력에 채워 허용하면 그 답으로 이어간다 */
  answer(approvalId: string, answers: Record<string, string>) {
    const resolve = this.pending.get(approvalId)
    const input = this.questionInputs.get(approvalId)
    if (!resolve || !input) return false
    this.pending.delete(approvalId)
    this.questionInputs.delete(approvalId)
    resolve({ behavior: 'allow', updatedInput: { ...input, answers } })
    return true
  }

  /** 대표가 직접 새 지시를 해서 기다리던 결재를 거둔다 — 거부로 돌려주며 사유를 전한다. 기다리던 게 있었으면 true */
  withdraw() {
    const had = this.pending.size > 0
    for (const resolve of this.pending.values()) resolve({ behavior: 'deny', message: t('staff.deny.withdrawn') })
    this.pending.clear()
    this.questionInputs.clear()
    return had
  }

  async interrupt(followUp?: { text: string; attachments: Attachment[] }) {
    if (!this.isRunning || !this.rt.isOpen) {
      // 이미 손이 빈 직원이면 끊을 턴이 없다 — 붙들린 업무 카드만 정리한다
      if (followUp) this.send(followUp.text, followUp.attachments)
      else this.hooks.stopped(this.staff.id)
      return
    }
    this.stopping = followUp ? 'resume' : 'stop'
    await this.rt.interrupt()
    if (followUp) this.send(followUp.text, followUp.attachments)
  }

  /** 대화가 길어졌으면 새 대화로 시작하고, 지시 앞에 직전 보고를 인수인계로 붙인다 (이전 대화는 기록에 그대로 남는다) */
  private rotateIfLong(text: string, fresh: boolean) {
    const sessionId = this.staff.sessionId
    if (!sessionId) return text
    if (this.contextTokens === null) {
      const codex = this.staff.provider === 'codex'
      const file = codex ? findCodexRollout(path.join(os.homedir(), '.codex', 'sessions'), sessionId) : findSessionFile(path.join(os.homedir(), '.claude', 'projects'), sessionId)
      const tail = file ? (codex ? readCodexTail(file) : readSessionTail(file)) : { contextTokens: 0, lastText: '' }
      this.contextTokens = tail.contextTokens
      if (!this.lastReport) this.lastReport = tail.lastText
    }
    // 새 업무 카드는 짧은 이전 대화도 넘기지 않는다 (인수인계 몫 정도는 남겨 두고 세 본다)
    if (this.contextTokens < (fresh ? CARD_ROTATE_MIN_TOKENS : CONTEXT_ROTATE_TOKENS)) return text
    this.hooks.saved(this.staff.id, (this.contextTokens - HANDOFF_TOKENS) * SAVED_CALLS_PER_TURN)
    this.hooks.log(this.staff.id, 'status', tk('log.rotated', { k: Math.round(this.contextTokens / 1000) }))
    this.resetSession()
    this.hooks.update(this.staff.id, { sessionId: null })
    return handoffText(this.lastReport, text)
  }

  /** 작업 폴더가 바뀌면 그 폴더에서 새 대화로 시작한다 (대화 기록은 폴더별로 저장돼 이어받을 수 없다) */
  resetSession() {
    if (this.isRunning) {
      this.pendingRestart = 'reset'
      return
    }
    this.closeSession()
    this.staff.sessionId = null
    this.baseline = { cost: 0, tokensIn: 0, tokensOut: 0 }
    this.contextTokens = 0
    saveSessionId(this.staff.id, null)
  }

  /** 장비가 바뀌면 세션을 닫아 두고, 다음 지시 때 같은 대화를 새 설정으로 이어서 연다 */
  restart() {
    if (this.isRunning) {
      if (!this.pendingRestart) this.pendingRestart = 'restart'
      return
    }
    this.closeSession()
  }

  /** 다음 지시 때 새 설정으로 다시 열리도록 세션을 닫는다 (결재 대기는 취소) */
  private closeSession() {
    this.modelNow = this.staff.model
    for (const id of this.pending.keys()) this.hooks.cancelApproval(id)
    for (const resolve of this.pending.values()) resolve({ behavior: 'deny', message: t('staff.deny.equip'), interrupt: true })
    this.pending.clear()
    this.rt.close()
  }

  stop() {
    for (const resolve of this.pending.values()) resolve({ behavior: 'deny', message: t('staff.deny.fired'), interrupt: true })
    this.pending.clear()
    this.rt.dispose()
  }

  /**
   * /명령어 목록을 불러온다. 세션이 열려 있으면 그 세션에 묻고, 없으면 같은 폴더·설정으로 잠깐 띄워 묻고 닫는다 (지시를 보내지 않아 비용이 들지 않는다)
   */
  async loadCommands() {
    const wasOpen = this.rt.isOpen
    const raw = await this.rt.loadCommands({ cwd: this.staff.cwd, skills: this.staff.equipment.skills })
    // 그사이 진짜 세션이 열렸으면 그쪽 목록이 더 정확하다
    if (wasOpen || !this.rt.isOpen) this.hooks.commands(this.staff.id, raw, this.terminalOnly)
  }

  private start() {
    const s = this.staff
    const refDocs = this.hooks.refDocs(s.id)
    const refDocPaths = new Set(refDocs.paths)
    const mcpServers = this.hooks.equippedMcp(s.id)
    const browserGuide = mcpServers[BROWSER_EQUIPMENT] ? t('staff.browser.guide', { dir: browserOutputDir(s.id) }) : ''
    const computerGuide = mcpServers[COMPUTER_EQUIPMENT] ? t('staff.computer.guide') : ''
    // 백그라운드 작업 목록은 CLI 프로세스 단위라 새로 열면 비운다
    this.backgroundTasks = []
    this.rt.start({
      cwd: s.cwd,
      modelId: this.modelId(this.modelNow),
      resumeId: s.sessionId,
      approvalMode: s.approvalMode === 'acceptEdits' ? 'acceptEdits' : 'ask',
      systemPromptAppend: capPrompt([t('staff.identity', { name: s.name, role: s.role }), t('staff.language'), this.hooks.context(s.id), refDocs.prompt, browserGuide, computerGuide, t('staff.captureGuide'), capPrompt(s.systemPrompt, PERSONA_MAX)].filter(Boolean).join('\n'), PROMPT_MAX),
      mcpServers: { ...mcpServers, office: this.hooks.officeTools(s.id) },
      selectedMcp: s.equipment.mcpServers,
      skills: s.equipment.skills,
      disallowedTools: s.equipment.disallowedTools.filter((t) => !isBashPolicyMark(t)),
      canUseTool: (toolName, input, signal) => {
        // 브라우저 조회(스냅샷·스크린샷·탭 목록)는 결재 없이. 이동·클릭·입력 등은 아래 평소 흐름(결재함·자동결재 판정)으로
        if (browserVerdict(toolName, input) === 'allow' || computerVerdict(toolName, input) === 'allow') return Promise.resolve<ToolDecision>({ behavior: 'allow' })
        const command = toolName === 'Bash' && typeof input.command === 'string' ? input.command : null
        // 사무실 내부 도구(팀 조회·위임)와 장비로 허용한 도구는 결재 없이 쓴다
        // 화면 캡처는 대표 화면이 그대로 찍히므로, 설정의 '직원 화면 캡처 허용'이 켜져 있으면(기본) 모두, 꺼지면 장비에서 "화면 캡처 자율"을 켠 직원만 결재 없이 찍는다
        const isAllowed =
          (toolName.startsWith(OFFICE_TOOL_PREFIX) && (toolName !== `${OFFICE_TOOL_PREFIX}capture_screen` || this.hooks.isScreenCaptureOn() || s.equipment.allowedTools.includes(toolName))) ||
          s.equipment.allowedTools.some((t) => toolName === t || toolName.startsWith(`mcp__${t}__`)) ||
          (command !== null && s.equipment.allowedTools.includes(READ_ONLY_BASH) && isReadOnlyCommand(command)) ||
          // 등록된 참고 문서를 읽는 건 결재 없이 ("모두 결재" 직원도)
          isRefDocRead(toolName, input, refDocPaths, os.homedir())
        if (isAllowed) return Promise.resolve<ToolDecision>({ behavior: 'allow' })
        const questions = toolName === QUESTION_TOOL ? toQuestions(input) : undefined
        const auto = this.hooks.autoDecide(s.id, toolName, input, summarizeInput(input, toolName), questions)
        if (!auto) return this.askApproval(toolName, input, signal, questions)
        // 대신 답(비서 등)을 만들다 실패하면 평소처럼 대표를 기다린다
        return auto.then(
          (r): ToolDecision => (r.deny ? { behavior: 'deny', message: r.deny } : r.answers ? { behavior: 'allow', updatedInput: { ...input, answers: r.answers } } : { behavior: 'allow' }),
          () => this.askApproval(toolName, input, signal, questions),
        )
      },
      onToolUse: (toolName, toolInput) => {
        // "위험 명령 금지"는 결재 판단보다 앞서 막는다 (settings.json 허용 규칙·자율 장비로도 못 뚫게). 자율 진행 중에는 장비 설정과 상관없이 켠다
        const command = toolName === 'Bash' ? (toolInput as { command?: unknown }).command : undefined
        const risky = typeof command === 'string' && (s.equipment.disallowedTools.includes(RISKY_BASH) || this.hooks.isAutonomous(s.id)) ? findRiskyCommand(command) : null
        // GPT 엔진은 disallowedTools를 엔진이 알지 못하니 여기서 막는다 (도구 이름은 Claude 이름으로 맞춰져 온다)
        const barred = s.provider === 'codex' ? s.equipment.disallowedTools.find((x) => !isBashPolicyMark(x) && (toolName === x || toolName.startsWith(`mcp__${x}__`))) : undefined
        if (barred) {
          this.hooks.log(s.id, 'tool', `막힘 (${barred}): ${toolName}`.slice(0, ACTIVITY_MAX))
          return { deny: t('staff.deny.risky', { risky: barred }) }
        }
        if (risky) {
          this.hooks.log(s.id, 'tool', `막힘 (${risky}): ${command}`.slice(0, ACTIVITY_MAX))
          // 자율 진행 중이면 대표에게 부탁하라는 대신 건너뛰고 보고에 남기라고 알린다
          return { deny: this.hooks.isAutonomous(s.id) ? t('staff.deny.autonomous', { action: `${risky}: ${String(command).slice(0, 200)}` }) : t('staff.deny.risky', { risky }) }
        }
        const text = `${toolDisplayName(toolName)} ${summarizeInput(toolInput, toolName)}`.slice(0, ACTIVITY_MAX)
        this.hooks.update(s.id, { activity: text })
        this.hooks.log(s.id, 'tool', text)
        return null
      },
    })
  }

  private askApproval(toolName: string, input: Record<string, unknown>, signal: AbortSignal, questions?: StaffQuestion[]) {
    const approval: Approval = {
      id: `${this.staff.id}:${crypto.randomUUID()}`,
      staffId: this.staff.id,
      toolName,
      summary: questions ? questions.map((q) => q.question).join(' / ') : summarizeInput(input, toolName),
      // 화면 언어가 바뀌어도 다시 번역되게 (컴퓨터 조작 요약만 — 나머지 요약은 입력 원문이라 번역할 게 없다)
      summaryI18n: (!questions && computerSummaryI18n(toolName, input)) || undefined,
      createdAt: Date.now(),
      questions,
      // 결재 카드의 "앞으로 항상 승인" — 위험 명령·질문이면 붙지 않는다
      alwaysRule: questions ? undefined : (ruleDraftFor(toolName, input) ?? undefined),
    }
    return new Promise<ToolDecision>((resolve) => {
      this.pending.set(approval.id, resolve)
      if (questions) this.questionInputs.set(approval.id, input)
      signal.addEventListener('abort', () => {
        this.pending.delete(approval.id)
        this.questionInputs.delete(approval.id)
        this.hooks.cancelApproval(approval.id)
        resolve({ behavior: 'deny', message: t('staff.deny.cancelled') })
      })
      this.hooks.requestApproval(approval)
    })
  }

  get pendingCount() {
    return this.rt.queued
  }

  private handle(m: RuntimeEvent) {
    const id = this.staff.id
    if (m.type === 'error') {
      this.isRunning = false
      this.hooks.update(id, { status: 'error', activity: String(m.error).slice(0, ACTIVITY_MAX) })
      this.hooks.log(id, 'error', String(m.error))
      this.hooks.failed(id, String(m.error))
      return
    }
    if (m.type === 'rateLimit') {
      this.hooks.rateLimit(m.info, this.staff.provider)
      return
    }
    if (m.type === 'commands') {
      this.hooks.commands(id, m.commands, this.terminalOnly)
      return
    }
    if (m.type === 'backgroundTasks') {
      this.backgroundTasks = m.tasks
      return
    }
    if (m.type === 'init') {
      this.terminalOnly = m.terminalOnly
      if (m.sessionId !== this.staff.sessionId) {
        if (this.staff.sessionId) this.baseline = { cost: 0, tokensIn: 0, tokensOut: 0 }
        this.staff.sessionId = m.sessionId
        saveSessionId(id, m.sessionId)
        this.hooks.update(id, { sessionId: m.sessionId })
      }
      return
    }
    if (m.type === 'context') {
      this.contextTokens = m.tokens
      return
    }
    if (m.type === 'text') {
      this.hooks.log(id, 'reply', m.text)
      this.hooks.update(id, { activity: m.text.replace(/\s+/g, ' ').slice(0, ACTIVITY_MAX) })
      return
    }
    if (m.type === 'fileTouched') {
      this.hooks.touched(id, m.path)
      return
    }
    if (m.type === 'result') {
      // costUsd·tokens는 세션 단위 누적값 → 직전 기록과의 차이만 저장
      const totals = { tokensIn: m.tokensIn, tokensOut: m.tokensOut }
      const delta = {
        cost: Math.max(0, m.costUsd - this.baseline.cost),
        tokensIn: Math.max(0, totals.tokensIn - this.baseline.tokensIn),
        tokensOut: Math.max(0, totals.tokensOut - this.baseline.tokensOut),
      }
      this.baseline = { cost: m.costUsd, ...totals }
      insertUsage(id, delta.cost, delta.tokensIn, delta.tokensOut)
      this.hooks.usage(id, delta)
      this.staff.costUsd += delta.cost
      this.staff.tokensIn += delta.tokensIn
      this.staff.tokensOut += delta.tokensOut

      // 중단으로 끊긴 결과는 보고로 치지 않는다 — 끼어들기면 이어 보낸 지시를 계속하고, 그냥 중단이면 손을 놓는다
      if (this.stopping) {
        const kind = this.stopping
        this.stopping = null
        if (kind === 'resume') {
          this.hooks.update(id, { costUsd: this.staff.costUsd, tokensIn: this.staff.tokensIn, tokensOut: this.staff.tokensOut })
          return
        }
        this.isRunning = false
        this.hooks.update(id, { status: 'idle', activity: '', costUsd: this.staff.costUsd, tokensIn: this.staff.tokensIn, tokensOut: this.staff.tokensOut })
        this.hooks.stopped(id)
        this.applyPendingRestart()
        return
      }

      // 지시와 상관없는 결과는 사용량만 남긴다 — 손이 빈 뒤 끝난 백그라운드 작업이 연 턴, 모델이 한 번도 돌지 않은 0턴.
      // 이걸 완료로 치면 새 지시가 바로 끝난 것처럼 빈 보고가 가고, 일하는 중인데 대기로 보인다
      const slash = this.slashPending
      this.slashPending = null
      if (!this.isRunning || (m.ok && m.numTurns === 0 && !slash)) {
        this.hooks.update(id, { costUsd: this.staff.costUsd, tokensIn: this.staff.tokensIn, tokensOut: this.staff.tokensOut })
        return
      }

      const isError = !m.ok
      // /compact처럼 답 글이 없는 명령은 "실행했어요"로 보고한다
      const summary = m.ok ? m.text || (slash ? t('slash.ran', { name: slash }) : '') : `오류로 중단 (${m.subtype})`
      if (!isError && summary.trim()) this.lastReport = summary
      // 성공 보고 본문은 이미 assistant 텍스트로 기록됐으므로 완료 로그는 짧게 남긴다
      this.hooks.log(id, isError ? 'error' : 'result', isError ? summary : tk('log.taskDone', { n: m.numTurns }))
      this.hooks.update(id, {
        status: isError ? 'error' : this.rt.queued ? 'working' : 'idle',
        activity: isError ? summary : '',
        costUsd: this.staff.costUsd,
        tokensIn: this.staff.tokensIn,
        tokensOut: this.staff.tokensOut,
      })
      this.isRunning = this.rt.queued > 0
      this.hooks.finished(id, summary, isError ? [] : this.backgroundTasks, this.rt.queued)
      this.applyPendingRestart()
    }
  }

  /** 일하는 동안 미뤄 둔 재시작은 손이 비었을 때 적용한다 (finished에서 다음 업무가 왔으면 또 미룬다) */
  private applyPendingRestart() {
    if (this.isRunning || !this.pendingRestart) return
    const kind = this.pendingRestart
    this.pendingRestart = null
    if (kind === 'reset') this.resetSession()
    else this.closeSession()
  }
}

function summarizeInput(input: unknown, toolName = ''): string {
  if (!input || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  const computer = computerSummary(toolName, o)
  if (computer) return computer
  const key = ['skill', 'command', 'file_path', 'path', 'pattern', 'url', 'query', 'description'].find((k) => typeof o[k] === 'string')
  return key ? String(o[key]) : JSON.stringify(o).slice(0, ACTIVITY_MAX)
}

export class HiredStaffManager {
  private workers = new Map<string, Worker>()

  constructor(private hooks: HiredHooks) {}

  add(staff: Staff) {
    this.workers.set(staff.id, new Worker(staff, this.hooks))
  }

  remove(staffId: string) {
    this.workers.get(staffId)?.stop()
    this.workers.delete(staffId)
  }

  instruct(staffId: string, text: string, attachments: Attachment[] = [], fresh = false) {
    this.workers.get(staffId)?.send(text, attachments, fresh)
  }

  interrupt(staffId: string, followUp?: { text: string; attachments: Attachment[] }) {
    return this.workers.get(staffId)?.interrupt(followUp)
  }

  /** 아직 답하지 않은 지시 수 (처리 중인 것 포함) */
  pendingCount(staffId: string) {
    return this.workers.get(staffId)?.pendingCount ?? 0
  }

  withdraw(staffId: string) {
    return this.workers.get(staffId)?.withdraw() ?? false
  }

  restart(staffId: string) {
    this.workers.get(staffId)?.restart()
  }

  resetSession(staffId: string) {
    this.workers.get(staffId)?.resetSession()
  }

  loadCommands(staffId: string) {
    return this.workers.get(staffId)?.loadCommands()
  }

  decide(approvalId: string, allow: boolean) {
    for (const w of this.workers.values()) if (w.decide(approvalId, allow)) return true
    return false
  }

  answer(approvalId: string, answers: Record<string, string>) {
    for (const w of this.workers.values()) if (w.answer(approvalId, answers)) return true
    return false
  }

  stopAll() {
    for (const w of this.workers.values()) w.stop()
  }
}
