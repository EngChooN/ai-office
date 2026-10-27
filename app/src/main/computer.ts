import { systemPreferences } from 'electron'
import type { McpConfig } from '../shared/customMcp.ts'
import { t } from '../shared/i18n/index.ts'
import { findNpx } from './browser'
import { toolEnv } from './platform'
import path from 'node:path'

// 컴퓨터 조작 장비: 맥에서 마우스·키보드·스크린샷을 다루는 MCP(computer-use-mcp, MIT, npx로 받아 실행)를 세션에 붙인다

/** 받아 실행할 MCP 패키지 버전 — 새 판이 말없이 바뀌지 않게 확인한 버전으로 고정한다 */
const COMPUTER_MCP = 'computer-use-mcp@1.8.0'

/** 맥에서만 쓴다 (윈도우는 장비 목록에서 뺀다) */
export const isComputerSupported = () => process.platform === 'darwin'

/** 이 컴퓨터에서 컴퓨터 조작 장비를 못 쓰는 이유 (쓸 수 있으면 null) */
export function computerUnavailable(): string | null {
  return findNpx() ? null : t('equip.browser.needNode')
}

/** 맥 손쉬운 사용·화면 기록 권한이 빠졌을 때 안내 (둘 다 있으면 null). 권한은 앱(개발 중엔 앱을 연 터미널)에 주어진다 */
export function computerPermissionNotice(): string | null {
  if (!isComputerSupported()) return null
  const isAccessible = systemPreferences.isTrustedAccessibilityClient(false)
  const isScreenOk = systemPreferences.getMediaAccessStatus('screen') === 'granted'
  if (isAccessible && isScreenOk) return null
  return t(!isAccessible && !isScreenOk ? 'equip.computer.needBoth' : !isAccessible ? 'equip.computer.needAccess' : 'equip.computer.needScreen')
}

/** 세션 mcpServers에 넣을 computer-use-mcp 설정. 맥이 아니거나 실행 환경이 없으면 null */
export function computerMcpConfig(): McpConfig | null {
  const npx = findNpx()
  if (!npx || !isComputerSupported()) return null
  const env = { ...toolEnv(), PATH: [npx.dir, toolEnv().PATH].filter(Boolean).join(path.delimiter) } as Record<string, string>
  return { type: 'stdio', command: npx.command, args: [...npx.prefix, '-y', COMPUTER_MCP], env }
}
