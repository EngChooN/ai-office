import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import type { EquipmentCatalog, EquipmentMcp, McpSourceKind } from '../shared/types'
import { BROWSER_EQUIPMENT } from '../shared/browserTools.ts'
import { loadCustomMcp, type CustomMcp } from '../shared/customMcp.ts'
import { t } from '../shared/i18n/index.ts'
import type { TKey } from '../shared/i18n/index.ts'
import { browserUnavailable } from './browser'
import * as db from './db'
import { readMcpSources, type McpEntry, type McpSourceInput } from './mcpSources'

// 장비 창고: 이 컴퓨터에 설정된 MCP 서버(출처는 mcpSources)와 스킬을 모아 직원에게 지급할 수 있게 한다

const HOME = os.homedir()

/** Claude Desktop 설정 파일 위치 */
const DESKTOP_CONFIG =
  process.platform === 'win32'
    ? path.join(process.env.APPDATA ?? path.join(HOME, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
    : path.join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')

/** 마지막 새로 고침에서 받은 claude.ai 커넥터·인증 필요 목록 (앱을 켠 동안만 기억) */
let probed: McpSourceInput['probe'] = null

export function setMcpProbe(probe: McpSourceInput['probe']) {
  probed = probe
}

export function customMcpList(): CustomMcp[] {
  return loadCustomMcp(db.loadCustomMcpRaw())
}

export function saveCustomMcpList(list: CustomMcp[]) {
  db.saveCustomMcpRaw(JSON.stringify(list))
}

/** 모든 출처의 연결 도구와 상태 */
export function mcpEntries(cwd: string): McpEntry[] {
  return readMcpSources({ home: HOME, cwd, desktopConfig: DESKTOP_CONFIG, custom: customMcpList(), probe: probed })
}

/** 이름 → 직원 세션에 넘길 MCP 설정 (불러올 수 없는 것은 뺀다. 덮는 순서는 readMcpSources) */
export function mcpConfigs(cwd: string) {
  const out = new Map<string, { config: McpServerConfig; source: McpSourceKind }>()
  for (const e of mcpEntries(cwd)) if (e.config && e.status !== 'unsupported') out.set(e.name, { config: e.config, source: e.kind })
  return out
}

function sourceLabel(e: McpEntry) {
  return e.kind === 'plugin' ? t('equip.source.plugin', { name: e.origin ?? '' }) : t(`equip.source.${e.kind}` as TKey)
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
  const unavailable = browserUnavailable()
  // 앱 기본 장비 '브라우저'는 사용자 MCP 카탈로그와 별개로 늘 첫 줄에 (같은 이름의 사용자 MCP는 가린다)
  const browser = { name: BROWSER_EQUIPMENT, source: t('equip.browser.source'), detail: t('equip.browser.desc'), isBuiltin: true, ...(unavailable ? { unavailable } : {}) }
  const mcp: EquipmentMcp[] = [
    { ...browser, sourceKind: 'builtin', status: unavailable ? 'unsupported' : 'ok' },
    ...mcpEntries(cwd)
      .filter((e) => e.name !== BROWSER_EQUIPMENT)
      .map((e) => ({ name: e.name, source: sourceLabel(e), detail: e.detail, sourceKind: e.kind, status: e.status, ...(e.reason ? { reason: e.reason, reasonText: t(`equip.reason.${e.reason}`) } : {}) })),
  ]
  const userDir = path.join(HOME, '.claude', 'skills')
  const projectDir = path.join(cwd, '.claude', 'skills')
  // 폴더 지정 없는 직원은 홈에서 일해서 프로젝트 스킬 폴더가 내 계정 폴더와 같다 — 두 번 읽지 않는다
  const skills = [...listSkills(userDir, t('equip.source.user')), ...(projectDir === userDir ? [] : listSkills(projectDir, t('equip.source.project')))]
  return { mcpServers: mcp, skills }
}
