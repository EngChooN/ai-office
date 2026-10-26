import { createRequire } from 'node:module'
import path from 'node:path'
import { app } from 'electron'
import type { McpServerConfig, Query, SDKMessage, SDKRateLimitInfo, SDKUserMessage, PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import type { Approval, Attachment, Staff, StaffQuestion } from '../shared/types'
import { findRiskyCommand, isBashPolicyMark, isReadOnlyCommand, READ_ONLY_BASH, RISKY_BASH } from '../shared/bashPolicy'
import { HIRED_ENV, toQuestions } from './external'
import { isRefDocRead } from '../shared/refDocs'
import { t } from '../shared/i18n/index.ts'
import os from 'node:os'
import fs from 'node:fs'
import { insertUsage, saveSessionId } from './db'
import { CONTEXT_ROTATE_TOKENS, contextOf, findSessionFile, handoffText, readSessionTail } from './sessionRotate'
import { exeName } from './platform'
import { BROWSER_EQUIPMENT, browserVerdict } from '../shared/browserTools.ts'
import { parseSlash, type RawCommand } from '../shared/slashCommands.ts'
import { browserOutputDir } from './browser'

// SDK는 ESM 전용이라 externals로 두고 require(esm)로 불러온다
export const sdk = createRequire(__filename)('@anthropic-ai/claude-agent-sdk') as typeof import('@anthropic-ai/claude-agent-sdk')

/** 설치본에서는 asar 밖으로 풀어 둔 claude 실행 파일을 직접 가리킨다 (asar 안의 파일은 실행할 수 없다) */
const CLAUDE_BINARY = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', `claude-agent-sdk-${process.platform}-${process.arch}`, exeName('claude'))
  : undefined

/** 앱에 들어 있는 claude CLI 경로 (로그인 확인·로그인 창 띄우기용) */
export function claudeBinaryPath() {
  if (CLAUDE_BINARY) return CLAUDE_BINARY
  const pkg = createRequire(__filename).resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`)
  return path.join(path.dirname(pkg), exeName('claude'))
}

const ACTIVITY_MAX = 80
const MODEL_ID: Record<Staff['model'], string | undefined> = {
  default: undefined,
  opus: 'opus',
  sonnet: 'sonnet',
  haiku: 'haiku',
}

export interface HiredHooks {
  update(staffId: string, patch: Partial<Staff>): void
  log(staffId: string, type: 'reply' | 'tool' | 'result' | 'error' | 'status', text: string): void
  requestApproval(approval: Approval): void
  /**
   * 자동결재(대표 부재 중): 결재함에 올리기 전에 대표 대신 판정한다. null이면 평소처럼 결재함.
   * 질문이면 answers(질문 → 답)를 채워 돌려준다
   */
  autoDecide(staffId: string, toolName: string, input: Record<string, unknown>, summary: string, questions?: StaffQuestion[]): Promise<{ answers?: Record<string, string> }> | null
  /** Claude 구독 사용률 알림 (값이 바뀔 때만 온다) */
  rateLimit(info: SDKRateLimitInfo): void
  /** 세션이 결재 요청을 거둬들임 (취소·세션 재시작) */
  cancelApproval(approvalId: string): void
  /** backgroundTasks: 턴이 끝날 때 세션에 아직 돌고 있는 백그라운드 작업 설명 (끝나도 직원을 다시 깨우지 않으니 점검용) */
  finished(staffId: string, summary: string, backgroundTasks: string[]): void
  /** 대표가 하던 일을 멈춤 (보고 없이 끝남) */
  stopped(staffId: string): void
  /** 사무실 MCP 도구(팀 조회·위임·보드). 직원마다 같은 서버를 붙이고 권한은 도구 안에서 판단한다 */
  officeTools(staffId: string): McpServerConfig
  /** 세션 시작 시 덧붙이는 팀 맥락 */
  context(staffId: string): string
  /** 세션 시작 시 정하는 참고 문서: 프롬프트 안내와 결재 없이 읽을 경로 (둘이 어긋나지 않게 한 번에 받는다) */
  refDocs(staffId: string): { prompt: string; paths: string[] }
  /** 지급된 MCP 서버 설정 (장비) */
  equippedMcp(staffId: string): Record<string, McpServerConfig>
  /** 세션이 알려 준 /명령어 목록 (세션을 열 때·목록이 바뀔 때·미리 불러올 때). terminalOnly = 터미널 화면 전용 명령 이름 */
  commands(staffId: string, raw: RawCommand[], terminalOnly: string[]): void
}

const OFFICE_TOOL_PREFIX = 'mcp__office__'
const QUESTION_TOOL = 'AskUserQuestion'

/** 직원 1명 = 스트리밍 입력 query 1개. 지시가 오면 큐에 넣고, 결재는 canUseTool에서 대기한다 */
class Worker {
  private inbox: SDKUserMessage[] = []
  private wake: (() => void) | null = null
  private closed = false
  /** 세션을 다시 열 때마다 올려서 이전 입력 스트림을 끝낸다 */
  private generation = 0
  private q: Query | null = null
  private pending = new Map<string, (r: PermissionResult) => void>()
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
  }

  send(text: string, attachments: Attachment[] = []) {
    const slash = parseSlash(text)
    if (slash && !this.isRunning) this.slashPending = slash.name
    // 손이 빈 상태에서 받은 새 지시만 — 일하는 중 끼어든 말은 같은 대화에 이어야 한다. /명령은 앞에 인수인계를 붙이면 명령이 깨지므로 넘기지 않는다
    if (!this.isRunning && !slash) text = this.rotateIfLong(text)
    this.inbox.push({ type: 'user', message: { role: 'user', content: toContent(text, attachments) }, parent_tool_use_id: null })
    this.wake?.()
    if (!this.q) this.start()
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

  async interrupt(followUp?: { text: string; attachments: Attachment[] }) {
    if (!this.isRunning || !this.q) {
      // 이미 손이 빈 직원이면 끊을 턴이 없다 — 붙들린 업무 카드만 정리한다
      if (followUp) this.send(followUp.text, followUp.attachments)
      else this.hooks.stopped(this.staff.id)
      return
    }
    this.stopping = followUp ? 'resume' : 'stop'
    await this.q.interrupt()
    if (followUp) this.send(followUp.text, followUp.attachments)
  }

  /** 대화가 길어졌으면 새 대화로 시작하고, 지시 앞에 직전 보고를 인수인계로 붙인다 (이전 대화는 기록에 그대로 남는다) */
  private rotateIfLong(text: string) {
    const sessionId = this.staff.sessionId
    if (!sessionId) return text
    if (this.contextTokens === null) {
      const file = findSessionFile(path.join(os.homedir(), '.claude', 'projects'), sessionId)
      const tail = file ? readSessionTail(file) : { contextTokens: 0, lastText: '' }
      this.contextTokens = tail.contextTokens
      if (!this.lastReport) this.lastReport = tail.lastText
    }
    if (this.contextTokens < CONTEXT_ROTATE_TOKENS) return text
    this.hooks.log(this.staff.id, 'status', t('log.rotated', { k: Math.round(this.contextTokens / 1000) }))
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
    for (const id of this.pending.keys()) this.hooks.cancelApproval(id)
    for (const resolve of this.pending.values()) resolve({ behavior: 'deny', message: t('staff.deny.equip'), interrupt: true })
    this.pending.clear()
    this.generation++
    this.wake?.()
    this.q?.close()
    this.q = null
  }

  stop() {
    this.closed = true
    this.wake?.()
    for (const resolve of this.pending.values()) resolve({ behavior: 'deny', message: t('staff.deny.fired'), interrupt: true })
    this.pending.clear()
    this.q?.close()
  }

  /**
   * /명령어 목록을 불러온다. 세션이 열려 있으면 그 세션에 묻고, 없으면 같은 폴더·설정으로 잠깐 띄워 묻고 닫는다 (지시를 보내지 않아 비용이 들지 않는다)
   */
  async loadCommands() {
    if (this.q) {
      this.hooks.commands(this.staff.id, await this.q.supportedCommands(), this.terminalOnly)
      return
    }
    let release = () => {}
    const idle = new Promise<void>((r) => (release = r))
    async function* nothing(): AsyncGenerator<SDKUserMessage> {
      await idle
    }
    const probe = sdk.query({
      prompt: nothing(),
      options: {
        cwd: this.staff.cwd,
        pathToClaudeCodeExecutable: CLAUDE_BINARY,
        persistSession: false,
        settingSources: ['user', 'project', 'local'],
        skills: this.staff.equipment.skills,
        env: { ...process.env, [HIRED_ENV]: '1' },
      },
    })
    try {
      const raw = await probe.supportedCommands()
      // 그사이 진짜 세션이 열렸으면 그쪽 목록이 더 정확하다
      if (!this.q) this.hooks.commands(this.staff.id, raw, this.terminalOnly)
    } finally {
      release()
      probe.close()
    }
  }

  private async *messages(gen: number): AsyncGenerator<SDKUserMessage> {
    while (!this.closed && gen === this.generation) {
      if (this.inbox.length === 0) await new Promise<void>((r) => (this.wake = r))
      while (this.inbox.length && gen === this.generation) yield this.inbox.shift()!
    }
  }

  private start() {
    const s = this.staff
    const refDocs = this.hooks.refDocs(s.id)
    const refDocPaths = new Set(refDocs.paths)
    const mcpServers = this.hooks.equippedMcp(s.id)
    const browserGuide = mcpServers[BROWSER_EQUIPMENT] ? t('staff.browser.guide', { dir: browserOutputDir(s.id) }) : ''
    // 백그라운드 작업 목록은 CLI 프로세스 단위라 새로 열면 비운다
    this.backgroundTasks = []
    this.q = sdk.query({
      prompt: this.messages(this.generation),
      options: {
        cwd: s.cwd,
        pathToClaudeCodeExecutable: CLAUDE_BINARY,
        model: MODEL_ID[s.model],
        resume: s.sessionId ?? undefined,
        permissionMode: s.approvalMode === 'acceptEdits' ? 'acceptEdits' : 'default',
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: [t('staff.identity', { name: s.name, role: s.role }), t('staff.language'), this.hooks.context(s.id), refDocs.prompt, browserGuide, s.systemPrompt].filter(Boolean).join('\n'),
        },
        settingSources: ['user', 'project', 'local'],
        // 고용 직원 표시: 사용자 설정의 "질문 받기" hook이 이 세션은 건너뛴다 (질문은 canUseTool → 결재함·대신 답하기로)
        env: { ...process.env, [HIRED_ENV]: '1' },
        mcpServers: { ...mcpServers, office: this.hooks.officeTools(s.id) },
        skills: s.equipment.skills,
        disallowedTools: s.equipment.disallowedTools.filter((t) => !isBashPolicyMark(t)),
        canUseTool: (toolName, input, { signal }) => {
          // 브라우저 조회(스냅샷·스크린샷·탭 목록)는 결재 없이. 이동·클릭·입력 등은 아래 평소 흐름(결재함·자동결재 판정)으로
          if (browserVerdict(toolName, input) === 'allow') return Promise.resolve({ behavior: 'allow' })
          const command = toolName === 'Bash' && typeof input.command === 'string' ? input.command : null
          // 사무실 내부 도구(팀 조회·위임)와 장비로 허용한 도구는 결재 없이 쓴다
          // 화면 캡처는 대표 화면이 그대로 찍히므로, 장비에서 "화면 캡처 자율"을 켠 직원만 결재 없이 찍는다
          const isAllowed =
            (toolName.startsWith(OFFICE_TOOL_PREFIX) && (toolName !== `${OFFICE_TOOL_PREFIX}capture_screen` || s.equipment.allowedTools.includes(toolName))) ||
            s.equipment.allowedTools.some((t) => toolName === t || toolName.startsWith(`mcp__${t}__`)) ||
            (command !== null && s.equipment.allowedTools.includes(READ_ONLY_BASH) && isReadOnlyCommand(command)) ||
            // 등록된 참고 문서를 읽는 건 결재 없이 ("모두 결재" 직원도)
            isRefDocRead(toolName, input, refDocPaths, os.homedir())
          if (isAllowed) return Promise.resolve({ behavior: 'allow' })
          const questions = toolName === QUESTION_TOOL ? toQuestions(input) : undefined
          const auto = this.hooks.autoDecide(s.id, toolName, input, summarizeInput(input), questions)
          if (!auto) return this.askApproval(toolName, input, signal, questions)
          // 대신 답(비서 등)을 만들다 실패하면 평소처럼 대표를 기다린다
          return auto.then(
            (r): PermissionResult => (r.answers ? { behavior: 'allow', updatedInput: { ...input, answers: r.answers } } : { behavior: 'allow' }),
            () => this.askApproval(toolName, input, signal, questions),
          )
        },
        hooks: {
          PreToolUse: [
            {
              hooks: [
                async (input) => {
                  if (input.hook_event_name === 'PreToolUse') {
                    // "위험 명령 금지"는 결재 판단보다 앞서 막는다 (settings.json 허용 규칙·자율 장비로도 못 뚫게)
                    const command = input.tool_name === 'Bash' ? (input.tool_input as { command?: unknown }).command : undefined
                    const risky = typeof command === 'string' && s.equipment.disallowedTools.includes(RISKY_BASH) ? findRiskyCommand(command) : null
                    if (risky) {
                      this.hooks.log(s.id, 'tool', `막힘 (${risky}): ${command}`.slice(0, ACTIVITY_MAX))
                      return {
                        hookSpecificOutput: {
                          hookEventName: 'PreToolUse',
                          permissionDecision: 'deny',
                          permissionDecisionReason: t('staff.deny.risky', { risky }),
                        },
                      }
                    }
                    const text = `${input.tool_name} ${summarizeInput(input.tool_input)}`.slice(0, ACTIVITY_MAX)
                    this.hooks.update(s.id, { activity: text })
                    this.hooks.log(s.id, 'tool', text)
                  }
                  return {}
                },
              ],
            },
          ],
        },
      },
    })
    void this.consume(this.q)
    const q = this.q
    q.supportedCommands().then(
      (raw) => this.q === q && this.hooks.commands(s.id, raw, this.terminalOnly),
      () => {}, // 목록을 못 받아도 지시는 그대로 된다
    )
  }

  private askApproval(toolName: string, input: Record<string, unknown>, signal: AbortSignal, questions?: StaffQuestion[]) {
    const approval: Approval = {
      id: `${this.staff.id}:${crypto.randomUUID()}`,
      staffId: this.staff.id,
      toolName,
      summary: questions ? questions.map((q) => q.question).join(' / ') : summarizeInput(input),
      createdAt: Date.now(),
      questions,
    }
    return new Promise<PermissionResult>((resolve) => {
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

  private async consume(q: Query) {
    try {
      for await (const m of q) this.handle(m)
    } catch (e) {
      this.isRunning = false
      this.hooks.update(this.staff.id, { status: 'error', activity: String(e).slice(0, ACTIVITY_MAX) })
      this.hooks.log(this.staff.id, 'error', String(e))
    } finally {
      if (this.q === q) this.q = null
    }
  }

  private handle(m: SDKMessage) {
    const id = this.staff.id
    if (m.type === 'rate_limit_event') {
      this.hooks.rateLimit(m.rate_limit_info)
      return
    }
    if (m.type === 'system' && m.subtype === 'commands_changed') {
      this.hooks.commands(id, m.commands, this.terminalOnly)
      return
    }
    if (m.type === 'system' && m.subtype === 'background_tasks_changed') {
      this.backgroundTasks = m.tasks.filter((task) => !task.ambient).map((task) => task.description)
      return
    }
    if (m.type === 'system' && m.subtype === 'init') {
      this.terminalOnly = m.terminal_slash_commands ?? []
      if (m.session_id !== this.staff.sessionId) {
        if (this.staff.sessionId) this.baseline = { cost: 0, tokensIn: 0, tokensOut: 0 }
        this.staff.sessionId = m.session_id
        saveSessionId(id, m.session_id)
        this.hooks.update(id, { sessionId: m.session_id })
      }
      return
    }
    if (m.type === 'assistant') {
      const ctx = contextOf(m.message.usage)
      if (ctx) this.contextTokens = ctx
      for (const b of m.message.content) {
        if (b.type === 'text' && b.text.trim()) {
          this.hooks.log(id, 'reply', b.text)
          this.hooks.update(id, { activity: b.text.replace(/\s+/g, ' ').slice(0, ACTIVITY_MAX) })
        }
      }
      return
    }
    if (m.type === 'result') {
      // total_cost_usd·modelUsage는 query 단위 누적값 → 직전 기록과의 차이만 저장
      const totals = Object.values(m.modelUsage).reduce(
        (acc, u) => ({
          tokensIn: acc.tokensIn + u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens,
          tokensOut: acc.tokensOut + u.outputTokens,
        }),
        { tokensIn: 0, tokensOut: 0 },
      )
      const delta = {
        cost: Math.max(0, m.total_cost_usd - this.baseline.cost),
        tokensIn: Math.max(0, totals.tokensIn - this.baseline.tokensIn),
        tokensOut: Math.max(0, totals.tokensOut - this.baseline.tokensOut),
      }
      this.baseline = { cost: m.total_cost_usd, ...totals }
      insertUsage(id, delta.cost, delta.tokensIn, delta.tokensOut)
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
      if (!this.isRunning || (m.subtype === 'success' && m.num_turns === 0 && !slash)) {
        this.hooks.update(id, { costUsd: this.staff.costUsd, tokensIn: this.staff.tokensIn, tokensOut: this.staff.tokensOut })
        return
      }

      const isError = m.subtype !== 'success'
      // /compact처럼 답 글이 없는 명령은 "실행했어요"로 보고한다
      const summary = m.subtype === 'success' ? m.result || (slash ? t('slash.ran', { name: slash }) : '') : `오류로 중단 (${m.subtype})`
      if (!isError && summary.trim()) this.lastReport = summary
      // 성공 보고 본문은 이미 assistant 텍스트로 기록됐으므로 완료 로그는 짧게 남긴다
      this.hooks.log(id, isError ? 'error' : 'result', isError ? summary : t('log.taskDone', { n: m.num_turns }))
      this.hooks.update(id, {
        status: isError ? 'error' : this.inbox.length ? 'working' : 'idle',
        activity: isError ? summary : '',
        costUsd: this.staff.costUsd,
        tokensIn: this.staff.tokensIn,
        tokensOut: this.staff.tokensOut,
      })
      this.isRunning = this.inbox.length > 0
      this.hooks.finished(id, summary, isError ? [] : this.backgroundTasks)
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

const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
type ImageType = (typeof IMAGE_TYPES)[number]

/** 지시 + 첨부 → 메시지 내용. 이미지는 직원이 직접 보도록 이미지 블록으로, 나머지는 경로를 알려 읽게 한다 */
function toContent(text: string, attachments: Attachment[]): SDKUserMessage['message']['content'] {
  if (attachments.length === 0) return text
  const images = attachments.filter((a) => (IMAGE_TYPES as readonly string[]).includes(a.mime) && a.size <= IMAGE_MAX_BYTES)
  const files = attachments.filter((a) => !images.includes(a))
  const note = [
    text,
    images.length ? `\n${t('staff.attach.images', { n: images.length, paths: images.map((a) => a.path).join(', ') })}` : '',
    files.length ? `\n${t('staff.attach.files')}\n${files.map((a) => `- ${a.name}: ${a.path}`).join('\n')}` : '',
  ].join('')
  return [
    { type: 'text', text: note },
    ...images.map((a) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: a.mime as ImageType, data: fs.readFileSync(a.path).toString('base64') } })),
  ]
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  const key = ['skill', 'command', 'file_path', 'path', 'pattern', 'url', 'query', 'description'].find((k) => typeof o[k] === 'string')
  return key ? String(o[key]) : JSON.stringify(o).slice(0, ACTIVITY_MAX)
}

/** 도구 없이 한 번만 답을 받는 호출 (회의 발언·보고서 요약). 비용은 호출한 쪽에서 기록한다 */
export async function askOnce(opts: { prompt: string; system: string; model: Staff['model']; cwd: string; onRateLimit?: (info: SDKRateLimitInfo) => void; abortController?: AbortController }) {
  const q = sdk.query({
    prompt: opts.prompt,
    options: {
      cwd: opts.cwd,
      pathToClaudeCodeExecutable: CLAUDE_BINARY,
      model: MODEL_ID[opts.model],
      tools: [],
      maxTurns: 1,
      persistSession: false,
      // 기다리는 쪽이 시간 초과로 포기하면 호출도 멈춘다 (비서 대신 답하기)
      abortController: opts.abortController,
      permissionMode: 'dontAsk',
      settingSources: [],
      systemPrompt: opts.system,
    },
  })
  let text = ''
  let costUsd = 0
  let tokensIn = 0
  let tokensOut = 0
  for await (const m of q) {
    if (m.type === 'rate_limit_event') opts.onRateLimit?.(m.rate_limit_info)
    if (m.type === 'result') {
      if (m.subtype === 'success') text = m.result
      costUsd = m.total_cost_usd
      for (const u of Object.values(m.modelUsage)) {
        tokensIn += u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens
        tokensOut += u.outputTokens
      }
    }
  }
  return { text: text.trim(), costUsd, tokensIn, tokensOut }
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

  instruct(staffId: string, text: string, attachments: Attachment[] = []) {
    this.workers.get(staffId)?.send(text, attachments)
  }

  interrupt(staffId: string, followUp?: { text: string; attachments: Attachment[] }) {
    return this.workers.get(staffId)?.interrupt(followUp)
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
