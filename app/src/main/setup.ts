import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { ClaudeStatus, ProvidersStatus } from '../shared/types'
import { claudeBinaryPath } from './ai/claude'
import { codexBinaryPath } from './ai/codex'
import { classifyClaude, probeCodex } from './ai/providerStatus'
import { IS_WINDOWS, toolEnv, WHICH } from './platform'

// 첫 실행 점검: 로그인 상태 확인과 로그인 창 띄우기

const run = promisify(execFile)
const STATUS_TIMEOUT_MS = 15_000
const HOME = os.homedir()
/** 공식 설치 스크립트·npm 전역 설치가 claude를 두는 곳들 */
const TERMINAL_CLAUDE_PATHS = IS_WINDOWS
  ? [path.join(HOME, '.local', 'bin', 'claude.exe'), path.join(process.env.APPDATA ?? path.join(HOME, 'AppData', 'Roaming'), 'npm', 'claude.cmd')]
  : [path.join(HOME, '.local', 'bin', 'claude'), path.join(HOME, '.claude', 'local', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude']

export async function claudeStatus(): Promise<ClaudeStatus> {
  const hasTerminalClaude = TERMINAL_CLAUDE_PATHS.some((p) => fs.existsSync(p)) || (await whichClaude())
  try {
    const { stdout } = await run(claudeBinaryPath(), ['auth', 'status'], { timeout: STATUS_TIMEOUT_MS })
    const s = JSON.parse(stdout) as { loggedIn?: boolean; email?: string; authMethod?: string }
    return { isLoggedIn: Boolean(s.loggedIn), email: s.email ?? '', authMethod: s.authMethod ?? '', hasTerminalClaude }
  } catch {
    return { isLoggedIn: false, email: '', authMethod: '', hasTerminalClaude }
  }
}

/** 공급자(Claude·Codex)별 설치·로그인 상태 — 설정 화면 카드·온보딩 게이트용 */
export async function providerStatus(): Promise<ProvidersStatus> {
/** 마지막으로 감지한 공급자 상태 — 앱 내부 AI가 쓸 공급자·폴백을 정할 때 본다 (아직 모르면 null) */
let lastProviders: ProvidersStatus | null = null
export const lastProviderStatus = () => lastProviders

  const bin = claudeBinaryPath()
  const claude = (async () => {
    if (!fs.existsSync(bin)) return classifyClaude(false, null)
    try {
      const { stdout } = await run(bin, ['auth', 'status'], { timeout: STATUS_TIMEOUT_MS })
      return classifyClaude(true, JSON.parse(stdout))
    } catch (e) {
      return classifyClaude(true, null, e instanceof Error ? e.message : String(e))
    }
  })()
  const [c, x] = await Promise.all([claude, probeCodex(codexBinaryPath())])
  lastProviders = { claude: c, codex: x }
  return lastProviders
}

async function whichClaude() {
  try {
    // 맥은 로그인 셸의 PATH(.zshrc 등)까지 봐야 해서 zsh로 찾는다
    if (IS_WINDOWS) await run(WHICH, ['claude'], { timeout: STATUS_TIMEOUT_MS, env: toolEnv() })
    else await run('/bin/zsh', ['-lc', 'command -v claude'], { timeout: STATUS_TIMEOUT_MS })
    return true
  } catch {
    return false
  }
}

/** 로그인은 브라우저 인증이 오가는 대화형 과정이라 터미널 창에서 연다 */
export async function openClaudeLogin() {
  // 윈도우: 따로 떼어 낸(detached) 콘솔 프로그램은 자기 명령 창을 띄운다
  if (IS_WINDOWS) {
    const child = spawn(claudeBinaryPath(), ['auth', 'login'], { detached: true, stdio: 'ignore' })
    // 실행 파일이 없거나 못 띄우면 main 프로세스가 죽지 않게 기록만 남긴다 (화면은 "다시 확인"으로 상태를 본다)
    child.on('error', (e) => console.error('[setup] 로그인 창을 열지 못했습니다:', e))
    child.unref()
    return
  }
  const cmd = `'${claudeBinaryPath().replaceAll("'", "'\\''")}' auth login`
  const script = `tell application "Terminal"\nactivate\ndo script "${cmd.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"\nend tell`
  await run('osascript', ['-e', script])
}

/** 터미널에서 쓸 claude: 사용자가 설치한 것이 있으면 그것, 없으면 앱에 들어 있는 것 */
function terminalClaude() {
  return TERMINAL_CLAUDE_PATHS.find((p) => fs.existsSync(p)) ?? claudeBinaryPath()
}

/** 사무실 직원의 대화를 Claude Code(터미널)에서 이어서 연다. 세션은 시작한 폴더 기준으로 저장돼 있어 그 폴더에서 --resume 한다 */
export async function openResumeInTerminal(cwd: string, sessionId: string) {
  const bin = terminalClaude()
  if (IS_WINDOWS) {
    const child = spawn(bin, ['--resume', sessionId], { cwd, detached: true, stdio: 'ignore', env: toolEnv() })
    child.on('error', (e) => console.error('[setup] 이어서 열 창을 열지 못했습니다:', e))
    child.unref()
    return
  }
  const quote = (v: string) => `'${v.replaceAll("'", "'\\''")}'`
  const cmd = `cd ${quote(cwd)} && ${quote(bin)} --resume ${quote(sessionId)}`
  const script = `tell application "Terminal"\nactivate\ndo script "${cmd.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"\nend tell`
  await run('osascript', ['-e', script])
}
