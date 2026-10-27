// 연결 도구(MCP) 출처 읽기 — 이 컴퓨터 곳곳에 등록된 MCP 서버를 모아 출처·상태를 붙인다 (electron 없이 돌아 단위 테스트한다)
// 직원 세션은 strictMcpConfig라 SDK가 플러그인·설정 파일을 스스로 읽지 않는다 → 여기서 읽은 설정을 mcpServers로 직접 넘긴다

import fs from 'node:fs'
import path from 'node:path'
import { checkConfig, type CustomMcp, type McpConfig } from '../shared/customMcp.ts'
import type { McpSourceKind, McpStatusReason } from '../shared/types.ts'

export interface McpEntry {
  name: string
  kind: McpSourceKind
  /** 플러그인 이름 등 출처 꼬리표 */
  origin?: string
  status: 'ok' | 'auth' | 'unsupported'
  reason?: McpStatusReason
  /** unsupported면 없다 */
  config?: McpConfig
  detail: string
}

export interface McpSourceInput {
  home: string
  cwd: string
  /** Claude Desktop 설정 파일 (맥·윈도우 경로가 다르다) */
  desktopConfig: string
  custom: CustomMcp[]
  /** 마지막 확인(새로 고침)에서 알게 된 것 — 없으면 ~/.claude.json 기록만 쓴다 */
  probe?: { connectors: string[]; needsAuth: string[] } | null
}

type Json = Record<string, unknown>

function readJson(file: string): Json | null {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null
  } catch {
    return null
  }
}

const asRecord = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function describeConfig(config: McpConfig) {
  if ('url' in config) return config.url
  return [config.command, ...(config.args ?? [])].join(' ')
}

/** 플러그인 안 경로 변수(${CLAUDE_PLUGIN_ROOT})를 실제 설치 폴더로 */
function withPluginRoot(raw: unknown, root: string): unknown {
  const sub = (s: string) => s.replaceAll('${CLAUDE_PLUGIN_ROOT}', root)
  const r = asRecord(raw)
  return {
    ...r,
    ...(typeof r.command === 'string' ? { command: sub(r.command) } : {}),
    ...(Array.isArray(r.args) ? { args: r.args.map((a) => (typeof a === 'string' ? sub(a) : a)) } : {}),
    ...(r.env && typeof r.env === 'object' ? { env: Object.fromEntries(Object.entries(asRecord(r.env)).map(([k, v]) => [k, typeof v === 'string' ? sub(v) : v])) } : {}),
  }
}

/** 켜진 플러그인이 싣고 있는 MCP 서버 (.mcp.json · plugin.json의 mcpServers) */
export function pluginServers(home: string, cwd: string): { plugin: string; name: string; raw: unknown }[] {
  const enabled = new Map<string, boolean>()
  // 사용자 < 프로젝트 < 로컬 순으로 덮는다 (Claude Code 설정 우선순위와 같다)
  for (const file of [path.join(home, '.claude', 'settings.json'), path.join(cwd, '.claude', 'settings.json'), path.join(cwd, '.claude', 'settings.local.json')]) {
    for (const [id, on] of Object.entries(asRecord(readJson(file)?.enabledPlugins))) enabled.set(id, on === true)
  }
  const installed = asRecord(readJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'))?.plugins)
  const out: { plugin: string; name: string; raw: unknown }[] = []
  for (const [id, installs] of Object.entries(installed)) {
    if (!enabled.get(id)) continue
    // 프로젝트·로컬 범위 설치는 그 폴더에서만
    const install = (Array.isArray(installs) ? installs : []).map(asRecord).find((i) => i.scope === 'user' || i.projectPath === cwd)
    const root = typeof install?.installPath === 'string' ? install.installPath : null
    if (!root) continue
    const plugin = id.split('@')[0]
    const manifest = readJson(path.join(root, '.claude-plugin', 'plugin.json'))
    const fromManifest = typeof manifest?.mcpServers === 'string' ? asRecord(readJson(path.resolve(root, manifest.mcpServers))?.mcpServers ?? readJson(path.resolve(root, manifest.mcpServers))) : asRecord(manifest?.mcpServers)
    const mcpJson = readJson(path.join(root, '.mcp.json'))
    const fromFile = asRecord(mcpJson?.mcpServers ?? mcpJson)
    for (const [name, raw] of Object.entries({ ...fromFile, ...fromManifest })) out.push({ plugin, name, raw: withPluginRoot(raw, root) })
  }
  return out
}

/**
 * 출처별 MCP 서버 — 이름이 겹치면 나중 출처가 앞을 덮는다:
 * Claude Desktop < settings.json < 플러그인 < 내 계정(~/.claude.json) < 이 폴더(로컬) < 프로젝트 .mcp.json < 직접 추가.
 * claude.ai 커넥터는 직원 세션에 붙일 수 없어 '불러올 수 없음'으로 맨 뒤에 둔다
 */
export function readMcpSources(input: McpSourceInput): McpEntry[] {
  const { home, cwd } = input
  const global = readJson(path.join(home, '.claude.json'))
  const needsAuth = new Set([...strings(global?.mcpNeedsAuthNoticed), ...(input.probe?.needsAuth ?? [])])
  const out = new Map<string, McpEntry>()
  // authKey: Claude Code가 인증 필요 목록에 쓰는 이름 (플러그인은 plugin:플러그인:서버)
  const put = (name: string, raw: unknown, kind: McpSourceKind, origin?: string, authKey = name) => {
    let config: McpConfig
    try {
      config = checkConfig(raw)
    } catch {
      out.set(name, { name, kind, origin, status: 'unsupported', reason: 'badConfig', detail: '' })
      return
    }
    const auth = needsAuth.has(authKey)
    out.set(name, { name, kind, origin, status: auth ? 'auth' : 'ok', ...(auth ? { reason: 'needsAuth' as const } : {}), config, detail: describeConfig(config) })
  }
  const addAll = (servers: unknown, kind: McpSourceKind) => {
    for (const [name, raw] of Object.entries(asRecord(servers))) put(name, raw, kind)
  }
  addAll(readJson(input.desktopConfig)?.mcpServers, 'desktop')
  addAll(readJson(path.join(home, '.claude', 'settings.json'))?.mcpServers, 'settings')
  for (const p of pluginServers(home, cwd)) put(p.name, p.raw, 'plugin', p.plugin, `plugin:${p.plugin}:${p.name}`)
  addAll(global?.mcpServers, 'user')
  addAll(asRecord(asRecord(global?.projects)[cwd]).mcpServers, 'local')
  addAll(readJson(path.join(cwd, '.mcp.json'))?.mcpServers, 'project')
  for (const m of input.custom) put(m.name, m.config, 'custom')
  // claude.ai 커넥터: 새로 고침에서 받은 목록, 없으면 한 번이라도 연결했던 기록
  const connectors = input.probe?.connectors ?? strings(global?.claudeAiMcpEverConnected)
  const listed = [...out.values()]
  for (const name of new Set(connectors)) listed.push({ name, kind: 'claudeai', status: 'unsupported', reason: 'claudeai', detail: '' })
  return listed
}
