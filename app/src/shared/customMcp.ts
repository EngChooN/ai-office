// 직접 추가한 연결 도구(MCP): 입력(명령·URL·JSON 붙여넣기) 검사와 목록 고치기 — main 저장·장비 탭 입력 폼이 같이 쓴다
// 대표의 ~/.claude.json은 건드리지 않고 앱 저장소(setting 'customMcp')에만 둔다

import { InvalidArgsError } from './errors.ts'
import { BROWSER_EQUIPMENT } from './browserTools.ts'
import { COMPUTER_EQUIPMENT } from './computerTools.ts'
import { t } from './i18n/index.ts'
import type { TKey } from './i18n/index.ts'

/** 직원 세션에 그대로 넘기는 설정 (Agent SDK McpServerConfig의 stdio·http·sse와 같은 모양) */
export type McpConfig =
  | { type?: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'http' | 'sse'; url: string; headers?: Record<string, string> }

export interface CustomMcp {
  name: string
  config: McpConfig
  addedAt: number
}

export type CustomMcpInput =
  | { kind: 'command'; name: string; command: string; args?: string[]; env?: Record<string, string> }
  | { kind: 'url'; name: string; url: string; transport?: 'http' | 'sse'; headers?: Record<string, string> }
  /** {"mcpServers": {...}} · {"이름": {...}} · 설정 하나(이때는 name 필요) */
  | { kind: 'json'; json: string; name?: string }

export const CUSTOM_MCP_MAX = 50
const JSON_MAX = 100_000
const TEXT_MAX = 2000
const LIST_MAX = 50
/** 도구 이름(mcp__이름__도구)에 그대로 들어가므로 영문·숫자·_·-만 */
const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const HEADER_KEY_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
/** 사무실 내부 도구·앱 기본 장비와 이름이 겹치면 안 된다 */
const RESERVED = new Set(['office', BROWSER_EQUIPMENT, COMPUTER_EQUIPMENT])

const fail = (key: TKey, vars?: Record<string, string | number>): never => {
  throw new InvalidArgsError(t(key, vars))
}

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const oneLine = (v: unknown): v is string => typeof v === 'string' && v.length <= TEXT_MAX && !/[\r\n\0]/.test(v)

export function checkName(name: unknown): string {
  const n = typeof name === 'string' ? name.trim() : ''
  if (!NAME_RE.test(n)) fail('mcp.err.name')
  if (RESERVED.has(n)) fail('mcp.err.reserved', { name: n })
  return n
}

function checkMap(v: unknown, keyRe: RegExp, what: TKey): Record<string, string> | undefined {
  if (v === undefined) return undefined
  if (!isRecord(v)) return fail(what)
  const entries = Object.entries(v)
  if (entries.length > LIST_MAX || entries.some(([k, x]) => !keyRe.test(k) || !oneLine(x))) fail(what)
  return entries.length ? Object.fromEntries(entries) as Record<string, string> : undefined
}

/** 알려진 필드만 남긴 설정 — 형식이 틀리면 InvalidArgsError */
export function checkConfig(raw: unknown): McpConfig {
  if (!isRecord(raw)) return fail('mcp.err.config')
  const type = raw.type ?? (typeof raw.url === 'string' && raw.command === undefined ? 'http' : 'stdio')
  if (type === 'stdio') {
    if (!oneLine(raw.command) || !raw.command.trim()) fail('mcp.err.command')
    const args: string[] = raw.args === undefined ? [] : Array.isArray(raw.args) && raw.args.length <= LIST_MAX && raw.args.every(oneLine) ? raw.args : fail('mcp.err.args')
    const env = checkMap(raw.env, ENV_KEY_RE, 'mcp.err.env')
    return { command: (raw.command as string).trim(), ...(args.length ? { args: [...args] } : {}), ...(env ? { env } : {}) }
  }
  if (type === 'http' || type === 'sse') {
    let url: URL | null = null
    try {
      url = oneLine(raw.url) ? new URL(raw.url.trim()) : null
    } catch {
      url = null
    }
    if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) fail('mcp.err.url')
    const headers = checkMap(raw.headers, HEADER_KEY_RE, 'mcp.err.headers')
    return { type, url: (raw.url as string).trim(), ...(headers ? { headers } : {}) }
  }
  return fail('mcp.err.type', { type: String(type).slice(0, 40) })
}

/** 입력 하나 → 저장할 항목들 (JSON은 여러 개일 수 있다) */
export function parseCustomMcp(input: CustomMcpInput, now: number): CustomMcp[] {
  if (!isRecord(input)) return fail('mcp.err.config')
  if (input.kind === 'command') {
    return [{ name: checkName(input.name), config: checkConfig({ type: 'stdio', command: input.command, args: input.args, env: input.env }), addedAt: now }]
  }
  if (input.kind === 'url') {
    return [{ name: checkName(input.name), config: checkConfig({ type: input.transport ?? 'http', url: input.url, headers: input.headers }), addedAt: now }]
  }
  if (input.kind !== 'json') return fail('mcp.err.config')
  if (typeof input.json !== 'string' || input.json.length > JSON_MAX) fail('mcp.err.json')
  let data: unknown
  try {
    data = JSON.parse(input.json)
  } catch {
    return fail('mcp.err.json')
  }
  if (!isRecord(data)) return fail('mcp.err.json')
  // 설정 하나만 붙여 넣은 경우 — 이름은 따로 받는다
  if (typeof data.command === 'string' || typeof data.url === 'string') return [{ name: checkName(input.name), config: checkConfig(data), addedAt: now }]
  const servers = isRecord(data.mcpServers) ? data.mcpServers : data
  const entries = Object.entries(servers)
  if (!entries.length) fail('mcp.err.json')
  if (entries.length > CUSTOM_MCP_MAX) fail('mcp.err.tooMany', { max: CUSTOM_MCP_MAX })
  const out = entries.map(([name, config]) => ({ name: checkName(name), config: checkConfig(config), addedAt: now }))
  if (new Set(out.map((m) => m.name)).size !== out.length) fail('mcp.err.dupe')
  return out
}

/** 추가·수정: prevName이 있으면 그 항목을 바꾼다. 같은 이름의 다른 항목이 이미 있으면 거절 */
export function upsertCustomMcp(list: CustomMcp[], items: CustomMcp[], prevName?: string): CustomMcp[] {
  if (prevName !== undefined && !list.some((m) => m.name === prevName)) fail('mcp.err.missing', { name: prevName })
  const rest = list.filter((m) => m.name !== prevName)
  const clash = items.find((m) => rest.some((r) => r.name === m.name))
  if (clash) fail('mcp.err.exists', { name: clash.name })
  // 고칠 때는 처음 추가한 시각과 자리를 지킨다
  const prev = list.find((m) => m.name === prevName)
  const fixed = prev ? items.map((m, i) => (i === 0 ? { ...m, addedAt: prev.addedAt } : m)) : items
  const at = prev ? list.indexOf(prev) : rest.length
  const next = [...rest.slice(0, at), ...fixed, ...rest.slice(at)]
  if (next.length > CUSTOM_MCP_MAX) fail('mcp.err.tooMany', { max: CUSTOM_MCP_MAX })
  return next
}

export function removeCustomMcp(list: CustomMcp[], name: string): CustomMcp[] {
  if (!list.some((m) => m.name === name)) fail('mcp.err.missing', { name })
  return list.filter((m) => m.name !== name)
}

/** 저장소에서 읽은 값 — 손상된 항목은 조용히 버린다 */
export function loadCustomMcp(raw: string | undefined | null): CustomMcp[] {
  let data: unknown
  try {
    data = raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  return data.flatMap((m) => {
    try {
      return isRecord(m) ? [{ name: checkName(m.name), config: checkConfig(m.config), addedAt: typeof m.addedAt === 'number' ? m.addedAt : 0 }] : []
    } catch {
      return []
    }
  })
}
