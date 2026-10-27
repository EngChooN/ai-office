// 공급자 중립 계약 — 직원 세션(AgentRuntime)과 앱 내부 AI(AiBackend). 구현은 공급자별 파일(claude.ts …)에 둔다.
import type { McpConfig } from '../../shared/customMcp.ts'
import type { AiProvider, Attachment, ModelChoice } from '../../shared/types'
import type { RawCommand } from '../../shared/slashCommands.ts'

export type { AiProvider }
/** 직원 세션에 붙이는 MCP 서버 (stdio·http·sse — 공급자별 설정 형식으로는 각 런타임이 바꾼다) */
export type RuntimeMcpServer = McpConfig

/** 플랜 사용률 이벤트. 사용률은 0~1 비율, 리셋 시각은 초 단위. unifiedWindows는 창별 값(five_hour·seven_day …) */
export interface RateLimitInfo {
  status: 'allowed' | 'allowed_warning' | 'rejected'
  resetsAt?: number
  rateLimitType?: string
  utilization?: number
  unifiedWindows?: Record<string, { utilization?: number; resetsAt?: number }>
}

/** 도구 사용 판정 (결재 결과) */
export type ToolDecision = { behavior: 'allow'; updatedInput?: Record<string, unknown> } | { behavior: 'deny'; message: string; interrupt?: boolean }

/** 공급자가 돌려주는 중립 이벤트 */
export type RuntimeEvent =
  | { type: 'init'; sessionId: string; terminalOnly: string[] }
  | { type: 'rateLimit'; info: RateLimitInfo }
  | { type: 'commands'; commands: RawCommand[] }
  | { type: 'backgroundTasks'; tasks: string[] }
  /** 직전 모델 호출에 실은 문맥 크기 */
  | { type: 'context'; tokens: number }
  | { type: 'text'; text: string }
  | { type: 'fileTouched'; path: string }
  /** 한 턴의 끝. costUsd·tokens는 세션 시작부터의 누적 */
  | { type: 'result'; ok: boolean; subtype: string; text: string; numTurns: number; costUsd: number; tokensIn: number; tokensOut: number }
  | { type: 'error'; error: unknown }

export interface RuntimeStartOpts {
  cwd: string
  /** 공급자 모델 id (undefined = 공급자 기본) */
  modelId: string | undefined
  /** 이어받을 세션 id */
  resumeId: string | null
  approvalMode: 'ask' | 'acceptEdits'
  /** 공급자 기본 지침 뒤에 덧붙이는 글 */
  systemPromptAppend: string
  mcpServers: Record<string, RuntimeMcpServer>
  skills: string[] | 'all' | undefined
  disallowedTools: string[]
  /** 도구 사용 전 결재 */
  canUseTool(toolName: string, input: Record<string, unknown>, signal: AbortSignal): Promise<ToolDecision>
  /** 도구 실행 직전: deny 사유를 돌려주면 막는다 */
  onToolUse(toolName: string, input: unknown): { deny: string } | null
}

/** 직원 1명 = 세션 1개 */
export interface AgentRuntime {
  readonly provider: AiProvider
  /** 세션이 열려 있나 */
  readonly isOpen: boolean
  /** 아직 처리하지 않은 지시 수 */
  readonly queued: number
  start(opts: RuntimeStartOpts): void
  send(text: string, attachments: Attachment[]): void
  /** 지금 턴을 끊는다 (결과는 result 이벤트로 온다) */
  interrupt(): Promise<void>
  setModel(modelId: string | undefined): void
  /** 세션만 닫는다 — 다음 send 때 다시 열 수 있다 */
  close(): void
  /** 영구 종료 */
  dispose(): void
  /** 슬래시 명령 목록 (세션이 없으면 잠깐 띄워 묻고 닫는다) */
  loadCommands(opts: { cwd: string; skills: string[] | 'all' | undefined }): Promise<RawCommand[]>
}

export type AiTier = 'light' | 'standard'

export interface AskOptions {
  prompt: string
  system: string
  /** light = 요약·분류, standard = 계획·정리. 공급자별 실제 모델은 백엔드가 정한다 */
  tier: AiTier
  /** 특정 직원의 모델로 돌려야 할 때의 힌트 (Claude 별칭) */
  model?: ModelChoice
  cwd: string
  onRateLimit?: (info: RateLimitInfo) => void
  abortController?: AbortController
}
export interface AskResult {
  text: string
  costUsd: number
  tokensIn: number
  tokensOut: number
}

export interface SecretaryRunOpts {
  prompt: string
  system: string
  cwd: string
  tier: AiTier
  model?: ModelChoice
  maxTurns: number
  maxBudgetUsd: number
  /** 비서 도구 서버 이름 — 이 이름의 도구만 허용한다 */
  toolsName: string
  tools: RuntimeMcpServer
}
export type SecretaryEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; input: Record<string, unknown> }
  | { type: 'result'; subtype: 'success' | 'max_turns' | 'max_budget' | 'error'; costUsd: number; tokensIn: number; tokensOut: number }
export interface SecretaryRun {
  events: AsyncIterable<SecretaryEvent>
  close(): void
}

/** 앱 내부 AI (비서·요약·askOnce) */
export interface AiBackend {
  readonly provider: AiProvider
  ask(opts: AskOptions): Promise<AskResult>
  secretary(opts: SecretaryRunOpts): SecretaryRun
}
