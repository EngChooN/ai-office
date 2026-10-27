import path from 'node:path'
import fs from 'node:fs'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import { app } from 'electron'
import type { Attachment } from '../../shared/types'
import type { RawCommand } from '../../shared/slashCommands.ts'
import { HIRED_ENV } from '../external'
import { exeName } from '../platform'
import { codexMcpConfig } from './codexMcp'
import { codexAssets, codexQuery, codexSkillRoots, parseRateLimits, parseSkills, skillsAsCommands } from './codexAssets'
import { approvalResponse, approvalSettings, approvalTool, newCodexState, pickModel, toolOfItem, translateNotification, CODEX_APPROVAL_METHODS, type CodexState } from './codexEvents'
import type { AgentRuntime, RuntimeEvent, RuntimeStartOpts } from './types'

/** Codex app-server 패키지 폴더 (bin/codex-app-server + bin/codex-code-mode-host + codex-path/rg).
 * 설치본: Resources/codex. 개발: AI_OFFICE_CODEX_DIR 또는 app/vendor/codex/<플랫폼>-<arch> (scripts/fetch-codex.mts 가 받는다) */
export function codexPackageDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'codex')
  return process.env.AI_OFFICE_CODEX_DIR ?? path.join(app.getAppPath(), 'vendor', 'codex', `${process.platform}-${process.arch}`)
}

export const codexBinaryPath = () => path.join(codexPackageDir(), 'bin', exeName('codex-app-server'))

const CLIENT_INFO = { name: 'ai-office', title: 'AI Office', version: '0' }
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

type Json = Record<string, unknown>
interface Rpc {
  id?: number | string
  method?: string
  result?: unknown
  error?: { message?: string }
  params?: Json
}

/** 지시 + 첨부 → turn/start 입력. 이미지는 직접 보게, 나머지는 경로를 알려 읽게 한다 */
export function toCodexInput(text: string, attachments: Attachment[]) {
  const files = attachments.filter((a) => !IMAGE_TYPES.includes(a.mime))
  const note = files.length ? `${text}\n\n${files.map((a) => `- ${a.name}: ${a.path}`).join('\n')}` : text
  return [
    { type: 'text', text: note, text_elements: [] },
    ...attachments.filter((a) => IMAGE_TYPES.includes(a.mime)).map((a) => ({ type: 'localImage', path: a.path })),
  ]
}

/** 직원 1명 = app-server 프로세스 1개 + 스레드 1개. 지시는 큐에 쌓고 턴이 끝나면 다음을 보낸다 */
export class CodexRuntime implements AgentRuntime {
  readonly provider = 'codex' as const
  private child: ChildProcessByStdio<Writable, Readable, null> | null = null
  private inbox: { text: string; attachments: Attachment[] }[] = []
  private opts: RuntimeStartOpts | null = null
  private modelId: string | undefined
  private state: CodexState = newCodexState()
  private threadId: string | null = null
  private turnId: string | null = null
  private turnActive = false
  /** 세션을 다시 열 때마다 올려서 이전 프로세스의 늦은 이벤트를 버린다 */
  private generation = 0
  private nextId = 0
  private pending = new Map<number, (r: Rpc) => void>()
  /** onToolUse가 막으라고 한 아이템 → 사유 (승인 요청에서 거절한다) */
  private denied = new Map<string, string>()
  private aborts = new Set<AbortController>()
  private skillCleanup: (() => void) | null = null
  private skillRoots: string[] = []

  constructor(private onEvent: (e: RuntimeEvent) => void) {}

  get isOpen() {
    return this.child !== null
  }
  get queued() {
    return this.inbox.length
  }

  send(text: string, attachments: Attachment[]) {
    this.inbox.push({ text, attachments })
    void this.pump()
  }

  async interrupt() {
    if (!this.threadId || !this.turnId) return
    await this.call('turn/interrupt', { threadId: this.threadId, turnId: this.turnId }).catch(() => {})
  }

  setModel(modelId: string | undefined) {
    this.modelId = modelId
  }

  close() {
    this.generation++
    for (const a of this.aborts) a.abort()
    this.aborts.clear()
    this.child?.kill()
    this.child = null
    this.skillCleanup?.()
    this.skillCleanup = null
    this.threadId = null
    this.turnId = null
    this.turnActive = false
    for (const r of this.pending.values()) r({ error: { message: 'closed' } })
    this.pending.clear()
  }

  dispose() {
    this.inbox = []
    this.close()
  }

  /** Codex에는 슬래시 명령이 없다 — 스킬 목록으로 대체한다 (프로젝트 스킬까지 보려고 작업 폴더로 한 번 묻는다) */
  async loadCommands(opts: { cwd: string }): Promise<RawCommand[]> {
    const [r] = await codexQuery(codexBinaryPath(), [['skills/list', { cwds: [opts.cwd] }]])
    return skillsAsCommands(r ? parseSkills(r) : codexAssets.skills)
  }

  start(o: RuntimeStartOpts) {
    this.opts = o
    this.modelId = o.modelId
    this.state = newCodexState(o.modelId)
    const gen = this.generation
    try {
      const binary = codexBinaryPath()
      if (!fs.existsSync(binary)) throw new Error('Codex 실행 파일을 찾지 못했습니다')
      // 장비·office MCP는 -c 인자로 넘기고 비밀 값은 환경 변수로 (사용자 config.toml의 MCP는 Codex가 따로 읽는다)
      // 사용자 Codex 설정의 MCP 서버는 장비로 고른 것만 켠다
      const mcp = codexMcpConfig(o.mcpServers, codexAssets.mcp.filter((m) => !o.selectedMcp.includes(m.name)).map((m) => m.name))
      // 장비의 Claude 형식 스킬을 Codex가 읽도록 (open에서 skills/extraRoots/set)
      this.skillCleanup?.()
      const skills = codexSkillRoots(o.cwd, o.skills)
      this.skillRoots = skills.roots
      this.skillCleanup = skills.cleanup
      const child = spawn(binary, mcp.args, { cwd: o.cwd, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, env: { ...process.env, ...mcp.env, [HIRED_ENV]: '1' } })
      this.child = child
      let buf = ''
      child.stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8')
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl)
          buf = buf.slice(nl + 1)
          try {
            this.onMessage(JSON.parse(line) as Rpc, gen)
          } catch {
            /* 로그 줄은 무시 */
          }
        }
      })
      child.stdin.on('error', () => {})
      child.on('error', (e) => this.failed(gen, e))
      child.on('exit', (code) => this.failed(gen, new Error(`Codex가 종료됐습니다 (${code ?? '신호'})`)))
    } catch (e) {
      this.failed(gen, e)
      return
    }
    void this.open(o, gen)
  }

  /** 프로세스가 죽으면 세션을 닫고 오류를 알린다 (닫은 뒤의 종료는 무시) */
  private failed(gen: number, e: unknown) {
    if (gen !== this.generation || !this.child) return
    this.close()
    this.onEvent({ type: 'error', error: e instanceof Error ? e.message : e })
  }

  private write(o: object) {
    this.child?.stdin.write(`${JSON.stringify(o)}\n`)
  }

  private call(method: string, params?: object): Promise<Rpc> {
    return new Promise((resolve) => {
      const id = ++this.nextId
      this.pending.set(id, resolve)
      this.write({ id, method, ...(params ? { params } : {}) })
    })
  }

  /** initialize → 모델 고르기 → 스레드 시작/재개. 끝나면 쌓인 지시를 보낸다 */
  private async open(o: RuntimeStartOpts, gen: number) {
    const live = () => gen === this.generation
    await this.call('initialize', { clientInfo: CLIENT_INFO, capabilities: { experimentalApi: true } })
    if (!live()) return
    this.write({ method: 'initialized' })
    // 스킬 루트는 실패해도 일은 계속 (스킬만 빠진다)
    if (this.skillRoots.length) await this.call('skills/extraRoots/set', { extraRoots: this.skillRoots })
    if (!live()) return
    const model = await this.resolveModel(this.modelId)
    if (!live()) return
    this.state.model = model
    const settings = { cwd: o.cwd, model, ...approvalSettings(o.approvalMode) }
    let r = o.resumeId ? await this.call('thread/resume', { threadId: o.resumeId, ...settings }) : null
    // 이어받을 기록이 사라졌으면 새 대화로 시작한다 (새 id가 init으로 알려지고 누적 기준이 초기화된다)
    if (!r || r.error) r = await this.call('thread/start', { ...settings, developerInstructions: o.systemPromptAppend })
    if (!live()) return
    const thread = (r.result as { thread?: { id?: string } } | undefined)?.thread
    if (!thread?.id) return this.failed(gen, new Error(r.error?.message ?? '대화를 열지 못했습니다'))
    this.threadId = thread.id
    this.onEvent({ type: 'init', sessionId: thread.id, terminalOnly: [] })
    void this.pump()
  }

  /** model/list에서 모델을 골라 항상 명시한다 (목록을 못 받으면 요청값 그대로, 없으면 Codex 기본) */
  private async resolveModel(wanted: string | undefined) {
    const r = await this.call('model/list', {})
    const data = (r.result as { data?: { id: string; isDefault?: boolean; hidden?: boolean }[] } | undefined)?.data
    return data?.length ? pickModel(data, wanted) : wanted
  }

  private async pump() {
    if (!this.threadId || this.turnActive || !this.inbox.length) return
    const next = this.inbox.shift()!
    this.turnActive = true
    const gen = this.generation
    const model = this.modelId && this.modelId !== this.state.model ? await this.resolveModel(this.modelId) : this.state.model
    if (gen !== this.generation) return
    this.state.model = model
    const r = await this.call('turn/start', { threadId: this.threadId, model, input: toCodexInput(next.text, next.attachments) })
    if (gen !== this.generation) return
    if (r.error) {
      this.turnActive = false
      this.onEvent({ type: 'error', error: r.error.message ?? '지시를 보내지 못했습니다' })
    }
  }

  private onMessage(m: Rpc, gen: number) {
    if (gen !== this.generation) return
    if (m.id !== undefined && !m.method) {
      this.pending.get(m.id as number)?.(m)
      this.pending.delete(m.id as number)
      return
    }
    const method = m.method ?? ''
    const params = m.params ?? {}
    if (m.id !== undefined) return void this.onRequest(m.id, method, params, gen)
    if (method === 'turn/started') {
      this.turnActive = true
      this.turnId = String((params.turn as Json | undefined)?.id ?? '')
    }
    // 계정 사용량이 바뀌면 알려 준다 (app-server가 보내는 알림 — 없으면 새로 고침 때 읽는다)
    if (method === 'account/rateLimits/updated') {
      const info = parseRateLimits({ rateLimits: params.rateLimits, ordinaryUsageAllowed: true })
      if (info) this.onEvent({ type: 'rateLimit', info })
    }
    if (method === 'item/started') this.onItemStarted(params.item as Json | undefined)
    for (const e of translateNotification(method, params, this.state)) this.onEvent(e)
    if (method === 'turn/completed') {
      this.turnActive = false
      this.turnId = null
      this.denied.clear()
      void this.pump()
    }
  }

  /** 도구 실행 시작: 활동 표시·위험 명령 판정 (결재 전에 한 번) */
  private onItemStarted(item: Json | undefined) {
    const tool = item ? toolOfItem(item) : null
    if (!item || !tool || !this.opts) return
    const verdict = this.opts.onToolUse(tool.toolName, tool.input)
    if (verdict) this.denied.set(String(item.id), verdict.deny)
  }

  /** 서버→클라이언트 요청: 승인은 결재 흐름으로, 모르는 요청은 오류로 돌려준다 */
  private async onRequest(id: number | string, method: string, params: Json, gen: number) {
    const reply = (result: object) => gen === this.generation && this.write({ id, result })
    if (!(CODEX_APPROVAL_METHODS as readonly string[]).includes(method) || !this.opts) {
      if (gen === this.generation) this.write({ id, error: { code: -32601, message: `지원하지 않는 요청: ${method}` } })
      return
    }
    const deny = this.denied.get(String(params.itemId))
    if (deny) return void reply(approvalResponse({ behavior: 'deny', message: deny }, method))
    const tool = approvalTool(method, params, this.state)
    if (!tool) return void reply(approvalResponse({ behavior: 'deny', message: '알 수 없는 승인 요청' }, method))
    const ac = new AbortController()
    this.aborts.add(ac)
    try {
      reply(approvalResponse(await this.opts.canUseTool(tool.toolName, tool.input, ac.signal), method))
    } catch {
      reply(approvalResponse({ behavior: 'deny', message: '결재를 처리하지 못했습니다' }, method))
    } finally {
      this.aborts.delete(ac)
    }
  }
}
