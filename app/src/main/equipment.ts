import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import type { EquipmentCatalog } from '../shared/types'

// 장비 창고: 이 맥에 설정된 MCP 서버와 스킬을 모아 직원에게 지급할 수 있게 한다

const HOME = os.homedir()

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/** 이름 → MCP 설정 (나중 출처가 앞을 덮는다: 내 계정 < 프로젝트) */
export function mcpConfigs(cwd: string) {
  const out = new Map<string, { config: McpServerConfig; source: string }>()
  const add = (servers: unknown, source: string) => {
    if (!servers || typeof servers !== 'object') return
    for (const [name, config] of Object.entries(servers as Record<string, McpServerConfig>)) out.set(name, { config, source })
  }
  const global = readJson(path.join(HOME, '.claude.json'))
  add(global?.mcpServers, '내 계정')
  const projects = global?.projects as Record<string, { mcpServers?: unknown }> | undefined
  add(projects?.[cwd]?.mcpServers, '이 폴더(로컬)')
  add(readJson(path.join(cwd, '.mcp.json'))?.mcpServers, '프로젝트 .mcp.json')
  return out
}

function describe(config: McpServerConfig) {
  if ('url' in config && config.url) return String(config.url)
  if ('command' in config) return [config.command, ...(config.args ?? [])].join(' ')
  return ''
}

function listSkills(dir: string, source: string) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        let description = ''
        try {
          const md = fs.readFileSync(path.join(dir, d.name, 'SKILL.md'), 'utf8')
          description = md.match(/^description:\s*(.+)$/m)?.[1]?.replace(/^["']|["']$/g, '').slice(0, 120) ?? ''
        } catch {
          // SKILL.md 없는 폴더
        }
        return { name: d.name, source, description }
      })
  } catch {
    return []
  }
}

export function equipmentCatalog(cwd: string): EquipmentCatalog {
  const mcp = [...mcpConfigs(cwd)].map(([name, { config, source }]) => ({ name, source, detail: describe(config) }))
  const userDir = path.join(HOME, '.claude', 'skills')
  const projectDir = path.join(cwd, '.claude', 'skills')
  // 폴더 지정 없는 직원은 홈에서 일해서 프로젝트 스킬 폴더가 내 계정 폴더와 같다 — 두 번 읽지 않는다
  const skills = [...listSkills(userDir, '내 계정'), ...(projectDir === userDir ? [] : listSkills(projectDir, '프로젝트'))]
  return { mcpServers: mcp, skills }
}
