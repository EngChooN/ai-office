import fs from 'node:fs'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import { HIRED_ENV } from '../external'
import { codexBinaryPath } from './codex'
import { codexMcpConfig } from './codexMcp'
import { approvalResponse, approvalTool, CODEX_APPROVAL_METHODS, newCodexState, toolOfItem, translateNotification, type CodexState } from './codexEvents'
import { codexCostUsd } from './codexPricing'
import { codexTierModel } from './aiSelect'
import type { AiBackend, AskOptions, AskResult, RuntimeEvent, RuntimeMcpServer, SecretaryEvent, SecretaryRun, SecretaryRunOpts, AiTier } from './types'

// 앱 내부 AI의 Codex 백엔드: 질문 하나 = app-server 프로세스 하나 + 임시 스레드 하나. 읽기 전용·승인 없음(never)으로 돌고 끝나면 프로세스를 닫는다.

type Json = Record<string, unknown>
interface Rpc {
  id?: number | string
  method?: string
  result?: unknown
  error?: { message?: string }
  params?: Json
}

/** 한 번의 Codex 턴 실행 옵션 */
export interface OneShotOpts {
  cwd: string
  system: string
  prompt: string
  tier: AiTier
  mcpServers?: Record<string, RuntimeMcpServer>
  /** MCP 도구 호출 승인: true면 허용. 명령·파일 변경 승인은 항상 거절한다 */
  allowTool?: (toolName: string) => boolean
  /** 중립 이벤트 (text·result·error) */
  onEvent: (e: RuntimeEvent) => void
  /** 도구 호출이 시작될 때 */
  onToolStart?: (name: string, input: Record<string, unknown>) => void
  /** 모델 호출 중간의 누적 비용 확인 — true를 돌려주면 턴을 끊는다 */
  shouldStop?: (e: { toolCalls: number; costUsd: number }) => boolean
  signal?: AbortSignal
}

/** 턴 하나를 돌리고 끝나면 프로세스를 닫는다. 실패하면 던진다 (호출한 쪽이 폴백) */
export function runCodexOneShot(o: OneShotOpts): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const binary = codexBinaryPath()
    if (!fs.existsSync(binary)) return reject(new Error('Codex 실행 파일을 찾지 못했습니다'))
    const mcp = codexMcpConfig(o.mcpServers ?? {})
    let child: ChildProcessByStdio<Writable, Readable, null>
    try {
      child = spawn(binary, mcp.args, { cwd: o.cwd, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, env: { ...process.env, ...mcp.env, [HIRED_ENV]: '1' } })
    } catch (e) {
      return reject(e)
    }
    let finished = false
    let threadId = ''
    let turnId = ''
    let toolCalls = 0
    let stopped = false
    const state = newCodexState()
    const pending = new Map<number, (r: Rpc) => void>()
    let nextId = 0
    const end = (e?: unknown) => {
      if (finished) return
      finished = true
      o.signal?.removeEventListener('abort', onAbort)
      child.kill()
      if (e) reject(e instanceof Error ? e : new Error(String(e)))
      else resolve()
    }
    const onAbort = () => end(new Error('abort'))
    if (o.signal?.aborted) return end(new Error('abort'))
    o.signal?.addEventListener('abort', onAbort)
    const write = (m: object) => child.stdin.write(`${JSON.stringify(m)}\n`)
    const call = (method: string, params?: object) =>
      new Promise<Rpc>((res) => {
        const id = ++nextId
        pending.set(id, res)
        write({ id, method, ...(params ? { params } : {}) })
      })
    const interrupt = () => {
      if (stopped || !threadId || !turnId) return
      stopped = true
      void call('turn/interrupt', { threadId, turnId })
    }
    child.stdin.on('error', () => {})
    child.on('error', (e) => end(e))
    child.on('exit', (code) => end(new Error(`Codex가 종료됐습니다 (${code ?? '신호'})`)))
    let buf = ''
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        let m: Rpc
        try {
          m = JSON.parse(line) as Rpc
        } catch {
          continue
        }
        onMessage(m)
      }
    })

    const onMessage = (m: Rpc) => {
      if (m.id !== undefined && !m.method) {
        pending.get(m.id as number)?.(m)
        pending.delete(m.id as number)
        return
      }
      const method = m.method ?? ''
      const params = m.params ?? {}
      if (m.id !== undefined) {
        // 서버→클라이언트 요청: MCP 도구 승인만 조건부 허용, 나머지는 거절
        const tool = (CODEX_APPROVAL_METHODS as readonly string[]).includes(method) ? approvalTool(method, params, state) : null
        if (!tool) return write({ id: m.id, error: { code: -32601, message: `지원하지 않는 요청: ${method}` } })
        const allowed = tool.toolName.startsWith('mcp__') && (o.allowTool?.(tool.toolName) ?? false)
        write({ id: m.id, result: approvalResponse(allowed ? { behavior: 'allow' } : { behavior: 'deny', message: '이 도구는 쓸 수 없어요.' }, method) })
        return
      }
      if (method === 'turn/started') turnId = String((params.turn as Json | undefined)?.id ?? '')
      if (method === 'item/started') {
        const item = params.item as Json | undefined
        const t = item?.type === 'mcpToolCall' ? toolOfItem(item) : null
        if (t) {
          toolCalls++
          o.onToolStart?.(t.toolName, t.input)
        }
      }
      for (const e of translateNotification(method, params, state)) {
        o.onEvent(e)
        if (e.type === 'error') return end(new Error(String(e.error)))
        if (e.type === 'result') return end()
      }
      if (o.shouldStop?.({ toolCalls, costUsd: translateCost(state) })) interrupt()
    }

    void (async () => {
      const init = await call('initialize', { clientInfo: { name: 'ai-office', title: 'AI Office', version: '0' }, capabilities: { experimentalApi: true } })
      if (init.error) return end(new Error(init.error.message ?? 'Codex 초기화 실패'))
      write({ method: 'initialized' })
      const list = ((await call('model/list', {})).result as { data?: { id: string; isDefault?: boolean; hidden?: boolean }[] } | undefined)?.data ?? []
      const visible = list.filter((x) => !x.hidden)
      const model = codexTierModel(o.tier, visible.map((x) => x.id), (visible.find((x) => x.isDefault) ?? visible[0])?.id ?? '')
      state.model = model
      const t = await call('thread/start', { cwd: o.cwd, model, // MCP 도구를 쓸 때만 승인 요청을 받아야 도구 호출이 열린다(never면 막힌다). 명령·파일 변경 승인은 아래에서 모두 거절
        approvalPolicy: o.mcpServers && Object.keys(o.mcpServers).length ? 'on-request' : 'never', sandbox: 'read-only', developerInstructions: o.system, ephemeral: true })
      const thread = (t.result as { thread?: { id?: string } } | undefined)?.thread
      if (!thread?.id) return end(new Error(t.error?.message ?? '대화를 열지 못했습니다'))
      threadId = thread.id
      const r = await call('turn/start', { threadId, model, input: [{ type: 'text', text: o.prompt, text_elements: [] }] })
      if (r.error) end(new Error(r.error.message ?? '지시를 보내지 못했습니다'))
    })()
  })
}

const translateCost = (s: CodexState) => codexCostUsd(s.model, s.usage)

export class CodexBackend implements AiBackend {
  readonly provider = 'codex' as const

  /** 도구 없이 한 번만 답을 받는 호출. 읽기 전용·승인 없음 */
  async ask(opts: AskOptions): Promise<AskResult> {
    let text = ''
    let res: AskResult = { text: '', costUsd: 0, tokensIn: 0, tokensOut: 0 }
    await runCodexOneShot({
      cwd: opts.cwd,
      system: opts.system,
      prompt: opts.prompt,
      tier: opts.tier,
      signal: opts.abortController?.signal,
      onEvent: (e) => {
        if (e.type === 'result') {
          text = e.ok ? e.text : ''
          res = { text: text.trim(), costUsd: e.costUsd, tokensIn: e.tokensIn, tokensOut: e.tokensOut }
        }
      },
    })
    return res
  }

  /** 비서: 질문 하나 = 새 스레드 하나. 비서 도구(MCP)만 허용하고 턴·비용 상한은 앱이 센다 */
  secretary(o: SecretaryRunOpts): SecretaryRun {
    const queue: SecretaryEvent[] = []
    let wake: (() => void) | null = null
    let done = false
    const push = (e: SecretaryEvent) => {
      queue.push(e)
      wake?.()
    }
    const ac = new AbortController()
    let limit: 'max_turns' | 'max_budget' | null = null
    let lastUsage = { costUsd: 0, tokensIn: 0, tokensOut: 0 }
    const prefix = `mcp__${o.toolsName}__`
    void runCodexOneShot({
      cwd: o.cwd,
      system: o.system,
      prompt: o.prompt,
      tier: o.tier,
      mcpServers: { [o.toolsName]: o.tools },
      allowTool: (name) => name.startsWith(prefix),
      signal: ac.signal,
      onToolStart: (name, input) => push({ type: 'tool', name, input }),
      shouldStop: ({ toolCalls, costUsd }) => {
        if (limit) return false
        if (toolCalls > o.maxTurns) limit = 'max_turns'
        else if (costUsd > o.maxBudgetUsd) limit = 'max_budget'
        return limit !== null
      },
      onEvent: (e) => {
        if (e.type === 'text') push({ type: 'text', text: e.text.trim() })
        if (e.type === 'result') {
          lastUsage = { costUsd: e.costUsd, tokensIn: e.tokensIn, tokensOut: e.tokensOut }
          push({ type: 'result', subtype: limit ?? (e.ok ? 'success' : 'error'), ...lastUsage })
        }
      },
    })
      .catch(() => {
        if (!queue.some((x) => x.type === 'result')) push({ type: 'result', subtype: 'error', ...lastUsage })
      })
      .finally(() => {
        done = true
        wake?.()
      })
    async function* events(): AsyncGenerator<SecretaryEvent> {
      while (true) {
        if (queue.length) yield queue.shift()!
        else if (done) return
        else await new Promise<void>((r) => (wake = r))
      }
    }
    return { events: events(), close: () => ac.abort() }
  }
}
