import type { ToolDecision, RuntimeEvent } from './types.ts'
import { codexCostUsd, type CodexUsage } from './codexPricing.ts'

// Codex app-server 알림·승인 요청 → 공급자 중립 이벤트/도구 판정. 프로세스 없이 테스트할 수 있게 순수 함수로 둔다.
// 이름·필드는 app-server 0.164 실측 기준 (스키마 생성기가 번들에 없어 실제 응답으로 확인했다).

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export const CODEX_APPROVAL_METHODS = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'] as const

/** 한 세션(스레드)의 변환 상태 */
export interface CodexState {
  model: string | undefined
  /** 스레드 시작부터의 누적 토큰 (재개해도 이어진다) */
  usage: CodexUsage
  /** 진행 중인 파일 변경 아이템 → 바뀌는 경로 (승인 요청에는 경로가 없다) */
  fileChanges: Map<string, string[]>
}

export const newCodexState = (model?: string): CodexState => ({
  model,
  usage: { inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0 },
  fileChanges: new Map(),
})

const usageOf = (v: unknown): CodexUsage => {
  const u = obj(v)
  return { inputTokens: num(u.inputTokens), cachedInputTokens: num(u.cachedInputTokens), cacheWriteInputTokens: num(u.cacheWriteInputTokens), outputTokens: num(u.outputTokens) }
}

const changePaths = (item: Json): string[] => (Array.isArray(item.changes) ? item.changes.map((c) => str(obj(c).path)).filter(Boolean) : [])

/** 도구 이름·입력을 결재 흐름(Claude 도구 이름)에 맞춘다. 직원 장비·결재 규칙이 그대로 통하도록 */
export function toolOfItem(item: Json): { toolName: string; input: Record<string, unknown> } | null {
  switch (item.type) {
    case 'commandExecution':
      return { toolName: 'Bash', input: { command: commandText(item) } }
    case 'fileChange': {
      const paths = changePaths(item)
      return { toolName: 'Edit', input: { file_path: paths[0] ?? '', ...(paths.length > 1 ? { files: paths } : {}) } }
    }
    case 'mcpToolCall':
      return { toolName: `mcp__${str(item.server)}__${str(item.tool)}`, input: obj(item.arguments) }
    case 'webSearch':
      return { toolName: 'WebSearch', input: { query: str(item.query) } }
    default:
      return null
  }
}

/** 명령 문자열: 셸 감싸기(`/bin/zsh -lc "…"`)를 벗기고 실제 명령만 보인다 */
export function commandText(item: Json): string {
  const actions = Array.isArray(item.commandActions) ? item.commandActions.map((a) => str(obj(a).command)).filter(Boolean) : []
  return actions.length ? actions.join(' && ') : str(item.command)
}

/** 승인 요청 → 도구 판정 입력. 알 수 없는 요청이면 null (호출한 쪽이 거절한다) */
export function approvalTool(method: string, params: Json, state: CodexState): { toolName: string; input: Record<string, unknown> } | null {
  if (method === 'item/commandExecution/requestApproval') return toolOfItem({ type: 'commandExecution', command: params.command, commandActions: params.commandActions })
  if (method === 'item/fileChange/requestApproval') {
    const paths = state.fileChanges.get(str(params.itemId)) ?? []
    return toolOfItem({ type: 'fileChange', changes: paths.map((path) => ({ path })) })
  }
  return null
}

/** 결재 결과 → app-server 응답. 거절(+중단)이면 턴을 끊는 cancel */
export function approvalResponse(d: ToolDecision) {
  if (d.behavior === 'allow') return { decision: 'accept' }
  return { decision: d.interrupt ? 'cancel' : 'decline' }
}

/** 직원 결재 방식 → Codex 승인 정책. 파일 쓰기는 작업 폴더 안으로 가둔다 */
export function approvalSettings(mode: 'ask' | 'acceptEdits') {
  return { approvalPolicy: mode === 'acceptEdits' ? 'on-request' : 'untrusted', sandbox: 'workspace-write' } as const
}

/** model/list 결과에서 모델을 고른다: 요청한 모델이 목록에 있으면 그것, 아니면 기본(isDefault), 그것도 없으면 첫 번째 */
export function pickModel(list: { id: string; isDefault?: boolean; hidden?: boolean }[], wanted: string | undefined): string | undefined {
  if (wanted && list.some((m) => m.id === wanted)) return wanted
  const visible = list.filter((m) => !m.hidden)
  return (visible.find((m) => m.isDefault) ?? list.find((m) => m.isDefault) ?? visible[0] ?? list[0])?.id
}

/** 한 턴의 상태 → result 이벤트의 subtype */
export const turnSubtype = (status: string) => (status === 'completed' ? 'success' : status === 'interrupted' ? 'interrupted' : 'error')

/** 알림 하나 → 중립 이벤트들 (상태는 state에 쌓는다) */
export function translateNotification(method: string, params: Json, state: CodexState): RuntimeEvent[] {
  if (method === 'item/started') {
    const item = obj(params.item)
    if (item.type === 'fileChange') state.fileChanges.set(str(item.id), changePaths(item))
    return []
  }
  if (method === 'item/completed') {
    const item = obj(params.item)
    if (item.type === 'agentMessage') return str(item.text).trim() ? [{ type: 'text', text: str(item.text) }] : []
    if (item.type === 'fileChange') {
      const paths = changePaths(item)
      state.fileChanges.delete(str(item.id))
      return item.status === 'completed' ? paths.map((path) => ({ type: 'fileTouched' as const, path })) : []
    }
    return []
  }
  if (method === 'thread/tokenUsage/updated') {
    const tu = obj(params.tokenUsage)
    state.usage = usageOf(tu.total)
    const last = usageOf(tu.last)
    return last.inputTokens ? [{ type: 'context', tokens: last.inputTokens }] : []
  }
  if (method === 'turn/completed') {
    const turn = obj(params.turn)
    const status = str(turn.status)
    const items = Array.isArray(turn.items) ? turn.items.map(obj) : []
    const finals = items.filter((i) => i.type === 'agentMessage' && str(i.text).trim())
    const final = finals.find((i) => i.phase === 'final_answer') ?? finals[finals.length - 1]
    return [
      {
        type: 'result',
        ok: status === 'completed',
        subtype: turnSubtype(status),
        text: status === 'completed' ? str(final?.text) : '',
        numTurns: 1,
        costUsd: codexCostUsd(state.model, state.usage),
        tokensIn: state.usage.inputTokens + state.usage.cacheWriteInputTokens,
        tokensOut: state.usage.outputTokens,
      },
    ]
  }
  if (method === 'error') {
    const err = obj(params.error)
    // 재시도 예정이면 곧 이어지는 알림을 기다린다
    return params.willRetry ? [] : [{ type: 'error', error: str(err.message) || '알 수 없는 Codex 오류' }]
  }
  return []
}
