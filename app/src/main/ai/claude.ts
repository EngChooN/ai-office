// Claude 공급자: Agent SDK 호출은 이 파일 안에만 있다 (직원 세션 ClaudeRuntime, 앱 내부 AI ClaudeBackend)
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import type { Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { Attachment, ModelChoice } from '../../shared/types'
import type { RawCommand } from '../../shared/slashCommands.ts'
import { t } from '../../shared/i18n/index.ts'
import { HIRED_ENV } from '../external'
import { contextOf } from '../sessionRotate'
import { exeName } from '../platform'
import type { AgentRuntime, AiBackend, AskOptions, AskResult, RuntimeEvent, RuntimeStartOpts, SecretaryEvent, SecretaryRun, SecretaryRunOpts } from './types'

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

const MODEL_ID: Record<ModelChoice, string | undefined> = {
  default: undefined,
  opus: 'opus',
  sonnet: 'sonnet',
  haiku: 'haiku',
}
export const claudeModelId = (m: ModelChoice) => MODEL_ID[m]

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

/** 지시 없이 세션만 띄워 두는 입력 (명령 목록·연결 상태를 묻고 닫는 용도) */
function idleInput() {
  let release = () => {}
  const idle = new Promise<void>((r) => (release = r))
  async function* nothing(): AsyncGenerator<SDKUserMessage> {
    await idle
  }
  return { prompt: nothing(), release: () => release() }
}

const usageTotals = (modelUsage: Record<string, { inputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number; outputTokens: number }>) =>
  Object.values(modelUsage).reduce(
    (acc, u) => ({ tokensIn: acc.tokensIn + u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens, tokensOut: acc.tokensOut + u.outputTokens }),
    { tokensIn: 0, tokensOut: 0 },
  )

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/** 직원 1명 = 스트리밍 입력 query 1개. 지시가 오면 큐에 넣는다 */
export class ClaudeRuntime implements AgentRuntime {
  readonly provider = 'claude' as const
  private inbox: SDKUserMessage[] = []
  private wake: (() => void) | null = null
  private closed = false
  /** 세션을 다시 열 때마다 올려서 이전 입력 스트림을 끝낸다 */
  private generation = 0
  private q: Query | null = null

  constructor(private onEvent: (e: RuntimeEvent) => void) {}

  get isOpen() {
    return this.q !== null
  }
  get queued() {
    return this.inbox.length
  }

  send(text: string, attachments: Attachment[]) {
    this.inbox.push({ type: 'user', message: { role: 'user', content: toContent(text, attachments) }, parent_tool_use_id: null })
    this.wake?.()
  }

  async interrupt() {
    await this.q?.interrupt()
  }

  setModel(modelId: string | undefined) {
    void this.q?.setModel(modelId)
  }

  close() {
    this.generation++
    this.wake?.()
    this.q?.close()
    this.q = null
  }

  dispose() {
    this.closed = true
    this.wake?.()
    this.q?.close()
  }

  async loadCommands(opts: { cwd: string; skills: string[] | 'all' | undefined }): Promise<RawCommand[]> {
    if (this.q) return this.q.supportedCommands()
    const idle = idleInput()
    const probe = sdk.query({
      prompt: idle.prompt,
      options: {
        cwd: opts.cwd,
        pathToClaudeCodeExecutable: CLAUDE_BINARY,
        persistSession: false,
        settingSources: ['user', 'project', 'local'],
        skills: opts.skills,
        env: { ...process.env, [HIRED_ENV]: '1' },
      },
    })
    try {
      return await probe.supportedCommands()
    } finally {
      idle.release()
      probe.close()
    }
  }

  private async *messages(gen: number): AsyncGenerator<SDKUserMessage> {
    while (!this.closed && gen === this.generation) {
      if (this.inbox.length === 0) await new Promise<void>((r) => (this.wake = r))
      while (this.inbox.length && gen === this.generation) yield this.inbox.shift()!
    }
  }

  start(o: RuntimeStartOpts) {
    const q = sdk.query({
      prompt: this.messages(this.generation),
      options: {
        cwd: o.cwd,
        pathToClaudeCodeExecutable: CLAUDE_BINARY,
        model: o.modelId,
        resume: o.resumeId ?? undefined,
        permissionMode: o.approvalMode === 'acceptEdits' ? 'acceptEdits' : 'default',
        systemPrompt: { type: 'preset', preset: 'claude_code', append: o.systemPromptAppend },
        settingSources: ['user', 'project', 'local'],
        // 고용 직원 표시: 사용자 설정의 "질문 받기" hook이 이 세션은 건너뛴다 (질문은 canUseTool → 결재함·대신 답하기로)
        env: { ...process.env, [HIRED_ENV]: '1' },
        mcpServers: o.mcpServers,
        // 사용자·프로젝트 .mcp.json과 claude.ai 커넥터(Gmail·Slack 등)는 붙이지 않는다 — 장비 탭에서 켠 것만 (도구 설명이 매 호출마다 문맥에 실린다)
        // 플러그인·Claude Desktop·직접 추가 MCP도 strict에선 SDK가 읽지 않으므로 equipment가 설정을 읽어 위 mcpServers로 넘긴다.
        // claude.ai 커넥터는 mcpServers로 넘길 수 있는 형식(stdio·http·sse·sdk)이 아니라 붙일 수 없다 (장비 탭에 '불러올 수 없음')
        strictMcpConfig: true,
        skills: o.skills,
        disallowedTools: o.disallowedTools,
        canUseTool: (toolName, input, { signal }) => o.canUseTool(toolName, input, signal),
        hooks: {
          PreToolUse: [
            {
              hooks: [
                async (input) => {
                  if (input.hook_event_name === 'PreToolUse') {
                    const verdict = o.onToolUse(input.tool_name, input.tool_input)
                    if (verdict) return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: verdict.deny } }
                  }
                  return {}
                },
              ],
            },
          ],
        },
      },
    })
    this.q = q
    void this.consume(q)
    q.supportedCommands().then(
      (raw) => this.q === q && this.onEvent({ type: 'commands', commands: raw }),
      () => {}, // 목록을 못 받아도 지시는 그대로 된다
    )
  }

  private async consume(q: Query) {
    try {
      for await (const m of q) this.translate(m)
    } catch (e) {
      this.onEvent({ type: 'error', error: e })
    } finally {
      if (this.q === q) this.q = null
    }
  }

  private translate(m: SDKMessage) {
    const emit = this.onEvent
    if (m.type === 'rate_limit_event') return emit({ type: 'rateLimit', info: m.rate_limit_info })
    if (m.type === 'system' && m.subtype === 'commands_changed') return emit({ type: 'commands', commands: m.commands })
    if (m.type === 'system' && m.subtype === 'background_tasks_changed') return emit({ type: 'backgroundTasks', tasks: m.tasks.filter((task) => !task.ambient).map((task) => task.description) })
    if (m.type === 'system' && m.subtype === 'init') return emit({ type: 'init', sessionId: m.session_id, terminalOnly: m.terminal_slash_commands ?? [] })
    if (m.type === 'assistant') {
      const ctx = contextOf(m.message.usage)
      if (ctx) emit({ type: 'context', tokens: ctx })
      for (const b of m.message.content) {
        if (b.type === 'text' && b.text.trim()) emit({ type: 'text', text: b.text })
        if (b.type === 'tool_use' && EDIT_TOOLS.has(b.name)) {
          const input = b.input as Record<string, unknown>
          const file = input.file_path ?? input.notebook_path
          if (typeof file === 'string') emit({ type: 'fileTouched', path: file })
        }
      }
      return
    }
    if (m.type === 'result') {
      emit({ type: 'result', ok: m.subtype === 'success', subtype: m.subtype, text: m.subtype === 'success' ? m.result : '', numTurns: m.num_turns, costUsd: m.total_cost_usd, ...usageTotals(m.modelUsage) })
    }
  }
}

const tierModel = (o: { tier: 'light' | 'standard'; model?: ModelChoice }): ModelChoice => o.model ?? (o.tier === 'light' ? 'haiku' : 'default')

export class ClaudeBackend implements AiBackend {
  readonly provider = 'claude' as const

  /** 도구 없이 한 번만 답을 받는 호출 (회의 발언·보고서 요약). 비용은 호출한 쪽에서 기록한다 */
  async ask(opts: AskOptions): Promise<AskResult> {
    const q = sdk.query({
      prompt: opts.prompt,
      options: {
        cwd: opts.cwd,
        pathToClaudeCodeExecutable: CLAUDE_BINARY,
        model: claudeModelId(tierModel(opts)),
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
        ;({ tokensIn, tokensOut } = usageTotals(m.modelUsage))
      }
    }
    return { text: text.trim(), costUsd, tokensIn, tokensOut }
  }

  /** 비서: 질문 하나 = 새 query 하나 (세션을 이어 쓰지 않는다) */
  secretary(o: SecretaryRunOpts): SecretaryRun {
    const q = sdk.query({
      prompt: o.prompt,
      options: {
        cwd: o.cwd,
        pathToClaudeCodeExecutable: app.isPackaged ? claudeBinaryPath() : undefined,
        persistSession: false,
        // 모델 고정(사용자 기본값이 비싼 모델일 수 있다)·턴·비용 상한 (한리뷰 M1)
        model: claudeModelId(tierModel(o)),
        maxTurns: o.maxTurns,
        maxBudgetUsd: o.maxBudgetUsd,
        // 기본 도구(파일 읽기·쓰기·Bash·웹)는 하나도 주지 않는다 — 비서 MCP 도구만
        tools: [],
        settingSources: [],
        mcpServers: { [o.toolsName]: o.tools },
        systemPrompt: o.system,
        canUseTool: async (toolName) => (toolName.startsWith(`mcp__${o.toolsName}__`) ? { behavior: 'allow' } : { behavior: 'deny', message: '비서는 이 도구를 쓸 수 없어요.' }),
      },
    })
    async function* events(): AsyncGenerator<SecretaryEvent> {
      for await (const m of q) {
        if (m.type === 'assistant') {
          for (const b of m.message.content) {
            if (b.type === 'text' && b.text.trim()) yield { type: 'text', text: b.text.trim() }
            if (b.type === 'tool_use') yield { type: 'tool', name: b.name, input: b.input as Record<string, unknown> }
          }
        } else if (m.type === 'result') {
          const subtype = m.subtype === 'success' ? 'success' : m.subtype === 'error_max_turns' ? 'max_turns' : m.subtype === 'error_max_budget_usd' ? 'max_budget' : 'error'
          yield { type: 'result', subtype, costUsd: m.total_cost_usd, ...usageTotals(m.modelUsage) }
        }
      }
    }
    return { events: events(), close: () => q.close() }
  }
}

/**
 * 연결 도구 확인 (Claude 전용 — claude.ai 커넥터): 장비 제한 없이 Claude를 잠깐 띄워 MCP 서버 상태를 묻고 닫는다.
 * 지시를 보내지 않아 모델 비용은 들지 않는다. 한 번도 못 받으면 null (그때까지 받은 마지막 목록을 돌려준다)
 */
export async function probeMcpStatus(cwd: string, timeoutMs = 20_000) {
  const idle = idleInput()
  const probe = sdk.query({
    prompt: idle.prompt,
    options: { cwd, pathToClaudeCodeExecutable: CLAUDE_BINARY, persistSession: false, settingSources: ['user', 'project', 'local'], env: { ...process.env, [HIRED_ENV]: '1' } },
  })
  // claude.ai 커넥터는 띄우고 1~2초 뒤에야 목록에 오른다 — 3초가 지나고 연결 중(pending)이 없고 두 번 연달아 같으면 끝
  const startedAt = Date.now()
  let last: Awaited<ReturnType<Query['mcpServerStatus']>> | null = null
  try {
    while (Date.now() - startedAt < timeoutMs) {
      const now = await probe.mcpServerStatus()
      const same = last !== null && last.map((m) => `${m.name}:${m.status}`).join() === now.map((m) => `${m.name}:${m.status}`).join()
      last = now
      if (Date.now() - startedAt >= 3000 && same && now.every((m) => m.status !== 'pending')) break
      await new Promise((r) => setTimeout(r, 1000))
    }
    return last
  } catch {
    return last
  } finally {
    idle.release()
    probe.close()
  }
}
