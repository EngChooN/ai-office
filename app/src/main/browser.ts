import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import { t } from '../shared/i18n/index.ts'
import { IS_WINDOWS, toolEnv } from './platform'

// 브라우저 장비: 직원 전용 크롬 창(Playwright MCP)을 세션에 붙인다. 대표의 크롬·로그인과는 프로필을 나눈다

/** 받아 실행할 MCP 패키지 버전 — @latest는 새 판이 나오면 말없이 바뀌므로 확인한 버전으로 고정한다 */
const PLAYWRIGHT_MCP_VERSION = '0.0.83'
/** 받아 실행할 MCP 패키지 (npx가 처음 한 번 내려받는다) */
const PLAYWRIGHT_MCP = `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`

const HOME = os.homedir()

/** PATH 밖에 흔히 node가 깔리는 곳 (Finder·탐색기로 앱을 열면 PATH가 짧다) */
function nodeDirs() {
  const dirs = IS_WINDOWS
    ? [path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs'), path.join(process.env.APPDATA ?? path.join(HOME, 'AppData', 'Roaming'), 'npm'), path.join(HOME, 'AppData', 'Local', 'Volta', 'bin')]
    : [path.join(HOME, '.volta', 'bin'), path.join(HOME, '.local', 'share', 'fnm', 'aliases', 'default', 'bin')]
  // nvm: 가장 높은 버전 하나
  const nvm = IS_WINDOWS ? process.env.NVM_SYMLINK : path.join(HOME, '.nvm', 'versions', 'node')
  if (nvm && !IS_WINDOWS) {
    try {
      const latest = fs
        .readdirSync(nvm)
        .filter((v) => /^v\d+/.test(v))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0]
      if (latest) dirs.push(path.join(nvm, latest, 'bin'))
    } catch {
      // nvm 없음
    }
  } else if (nvm) dirs.push(nvm)
  return dirs
}

/** 실행할 명령 앞부분: 맥은 npx, 윈도우는 node + npx-cli.js (npx.cmd를 cmd로 감싸면 빈칸 든 경로의 따옴표가 깨진다) */
let found: { command: string; prefix: string[]; dir: string } | null = null

/** npx와 node가 같이 있는 폴더를 찾는다 (npx는 node로 도는 스크립트라 둘 다 필요). 찾으면 기억하고, 못 찾으면 다음에 다시 본다(그사이 설치할 수 있다) */
function findNpx() {
  if (found) return found
  const searchPath = (toolEnv().PATH ?? '').split(path.delimiter)
  const dirs = [...searchPath, ...nodeDirs()].filter(Boolean)
  for (const dir of dirs) {
    if (IS_WINDOWS) {
      const cli = path.join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js')
      if (fs.existsSync(path.join(dir, 'node.exe')) && fs.existsSync(cli)) found = { command: path.join(dir, 'node.exe'), prefix: [cli], dir }
    } else if (fs.existsSync(path.join(dir, 'npx')) && fs.existsSync(path.join(dir, 'node'))) found = { command: path.join(dir, 'npx'), prefix: [], dir }
    if (found) break
  }
  return found
}

/** 이 컴퓨터에서 브라우저 장비를 못 쓰는 이유 (쓸 수 있으면 null) */
export function browserUnavailable(): string | null {
  return findNpx() ? null : t('equip.browser.needNode')
}

/** 직원별 브라우저 프로필 폴더 — 한 번 로그인하면 다음에도 유지된다 */
export function browserProfileDir(staffId: string) {
  return path.join(app.getPath('userData'), 'browser', staffId)
}

/** 스크린샷이 저장되는 폴더 (보고에 이미지로 붙일 때 이 경로를 쓴다) */
export function browserOutputDir(staffId: string) {
  return path.join(browserProfileDir(staffId), 'output')
}

/** 세션 mcpServers에 넣을 Playwright MCP 설정. 실행 환경이 없으면 null */
export function browserMcpConfig(staffId: string): McpServerConfig | null {
  const npx = findNpx()
  if (!npx) return null
  const profile = path.join(browserProfileDir(staffId), 'profile')
  const output = browserOutputDir(staffId)
  fs.mkdirSync(profile, { recursive: true })
  fs.mkdirSync(output, { recursive: true })
  const args = ['-y', PLAYWRIGHT_MCP, '--user-data-dir', profile, '--output-dir', output]
  const env = { ...toolEnv(), PATH: [npx.dir, toolEnv().PATH].filter(Boolean).join(path.delimiter) } as Record<string, string>
  return { type: 'stdio', command: npx.command, args: [...npx.prefix, ...args], env }
}
