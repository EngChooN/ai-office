import { spawn, type ChildProcessByStdio } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Readable, Writable } from 'node:stream'
import type { RawCommand } from '../../shared/slashCommands.ts'
import type { RateLimitInfo } from './types.ts'

// Codex 쪽 스킬·MCP 원천·사용량 읽기. app-server에 한 번 물어 오고 끝낸다 (electron 없이 돌아 단위 테스트한다).
// 보안: config/read 응답에는 토큰·env가 들어 있을 수 있다 → 서버 이름·종류·켜짐 여부만 남기고 값은 어디에도 두지 않는다.

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export interface CodexSkill {
  name: string
  description: string
  path: string
  /** user · repo · system · plugin … (app-server가 준 값) */
  scope: string
  enabled: boolean
}
/** Codex 설정(~/.codex/config.toml)에 있는 MCP 서버 — 이름·전송 방식·켜짐만 */
export interface CodexMcpServer {
  name: string
  transport: 'stdio' | 'http'
  enabled: boolean
}

/** skills/list 응답 → 스킬 목록 (여러 cwd 묶음을 합치고 같은 경로는 한 번만) */
export function parseSkills(result: unknown): CodexSkill[] {
  const out = new Map<string, CodexSkill>()
  const data = obj(result).data
  for (const group of Array.isArray(data) ? data : []) {
    const skills = obj(group).skills
    for (const raw of Array.isArray(skills) ? skills : []) {
      const s = obj(raw)
      const name = str(s.name)
      const path = str(s.path)
      if (!name || !path || out.has(path)) continue
      out.set(path, { name, description: str(s.description), path, scope: str(s.scope), enabled: s.enabled !== false })
    }
  }
  return [...out.values()]
}

/** config/read 응답 → MCP 서버 이름·종류. url이 있으면 http, command가 있으면 stdio — 나머지 값은 읽지 않는다 */
export function parseMcpServers(result: unknown): CodexMcpServer[] {
  const servers = obj(obj(obj(result).config).mcp_servers)
  return Object.entries(servers).flatMap(([name, raw]) => {
    const s = obj(raw)
    const transport = 'url' in s && s.url ? 'http' : 'command' in s && s.command ? 'stdio' : null
    return transport ? [{ name, transport, enabled: s.enabled !== false }] : []
  })
}

/** 사용률 창 길이(분) → 창 이름. 무료 플랜은 30일 창 하나, 유료는 5시간·주간 */
export function windowKey(mins: number | null | undefined) {
  if (mins === 300) return 'five_hour'
  if (mins === 10_080) return 'seven_day'
  if (mins === 43_200) return 'thirty_day'
  return mins ? `${mins}m` : 'primary'
}

/** account/rateLimits/read 응답 → 앱 공통 사용률 이벤트 (사용률 0~1, 리셋 초). 창 정보가 없으면 null */
export function parseRateLimits(result: unknown): RateLimitInfo | null {
  const r = obj(result)
  const rl = obj(r.rateLimits)
  const unified: NonNullable<RateLimitInfo['unifiedWindows']> = {}
  let primaryKey: string | undefined
  for (const slot of ['primary', 'secondary'] as const) {
    const w = obj(rl[slot])
    const used = w.usedPercent
    if (typeof used !== 'number') continue
    const key = windowKey(typeof w.windowDurationMins === 'number' ? w.windowDurationMins : null)
    primaryKey ??= key
    unified[key] = { utilization: used / 100, ...(typeof w.resetsAt === 'number' ? { resetsAt: w.resetsAt } : {}) }
  }
  if (!primaryKey) return null
  const worst = Math.max(...Object.values(unified).map((w) => w.utilization ?? 0))
  const blocked = r.ordinaryUsageAllowed === false || Boolean(rl.rateLimitReachedType)
  return { status: blocked ? 'rejected' : worst >= 0.8 ? 'allowed_warning' : 'allowed', rateLimitType: primaryKey, utilization: unified[primaryKey].utilization, resetsAt: unified[primaryKey].resetsAt, unifiedWindows: unified }
}

/** Codex는 슬래시 명령이 없어 스킬 목록으로 대신한다 (이름·설명을 자동완성에 그대로) */
export function skillsAsCommands(skills: CodexSkill[]): RawCommand[] {
  return skills.filter((s) => s.enabled).map((s) => ({ name: s.name, description: s.description.split('\n')[0].slice(0, 160), argumentHint: '' }))
}

/** app-server를 띄워 요청 몇 개를 차례로 보내고 응답(result)을 모아 돌려준다. 실패한 요청은 null */
export function codexQuery(binary: string, calls: [string, object?][], timeoutMs = 15_000): Promise<unknown[]> {
  return new Promise((resolve) => {
    if (!fs.existsSync(binary)) return resolve(calls.map(() => null))
    let child: ChildProcessByStdio<Writable, Readable, null>
    try {
      child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
    } catch {
      return resolve(calls.map(() => null))
    }
    const results: unknown[] = calls.map(() => null)
    let done = false
    let nextId = 0
    let buf = ''
    const pending = new Map<number, (r: unknown) => void>()
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.kill()
      resolve(results)
    }
    const timer = setTimeout(finish, timeoutMs)
    const send = (o: object) => child.stdin.write(`${JSON.stringify(o)}\n`)
    const call = (method: string, params?: object) =>
      new Promise<unknown>((res) => {
        const id = ++nextId
        pending.set(id, res)
        send({ id, method, ...(params ? { params } : {}) })
      })
    child.on('error', finish)
    child.on('exit', finish)
    child.stdin.on('error', () => {})
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        try {
          const m = JSON.parse(line) as { id?: number; method?: string; result?: unknown }
          if (m.id !== undefined && !m.method) pending.get(m.id)?.(m.result ?? null)
        } catch {
          /* 로그 줄은 무시 */
        }
      }
    })
    void (async () => {
      await call('initialize', { clientInfo: { name: 'ai-office', title: 'AI Office', version: '0' }, capabilities: { experimentalApi: true } })
      send({ method: 'initialized' })
      for (let i = 0; i < calls.length; i++) results[i] = await call(calls[i][0], calls[i][1])
      finish()
    })()
  })
}

/** 마지막으로 읽은 Codex 스킬·MCP 서버 (동기 코드가 쓴다). 아직 못 읽었으면 빈 목록 */
export const codexAssets = { skills: [] as CodexSkill[], mcp: [] as CodexMcpServer[] }

/** 스킬 목록과 설정의 MCP 서버를 새로 읽는다. cwds = 스킬을 찾을 작업 폴더들(프로젝트 스킬 포함) */
export async function refreshCodexAssets(binary: string, cwds: string[]) {
  const [skills, config] = await codexQuery(binary, [['skills/list', { cwds }], ['config/read', { includeLayers: false }]])
  if (skills) codexAssets.skills = parseSkills(skills)
  if (config) codexAssets.mcp = parseMcpServers(config)
  return codexAssets
}

/** 계정 사용량(5시간·주간, 무료는 30일 하나). 못 읽으면 null */
/** 사용률을 못 읽은 이유 (화면 안내용 쉬운 말) */
export const CODEX_USAGE_NOTES = {
  binary: 'Codex 실행 파일을 찾지 못해 사용률을 읽지 못했어요.',
  noResponse: 'Codex가 사용률 요청에 답하지 않았어요. 잠시 뒤 새로고침해 보세요.',
  noWindow: '이 로그인 방식(API 키 등)은 5시간·주간 사용률을 알려 주지 않아요.',
} as const

export async function readCodexRateLimits(binary: string): Promise<{ info: RateLimitInfo | null; note?: string }> {
  if (!fs.existsSync(binary)) return { info: null, note: CODEX_USAGE_NOTES.binary }
  const [r] = await codexQuery(binary, [['account/rateLimits/read']])
  if (r === null || r === undefined) return { info: null, note: CODEX_USAGE_NOTES.noResponse }
  const info = parseRateLimits(r)
  return info ? { info } : { info: null, note: CODEX_USAGE_NOTES.noWindow }
}

/**
 * 직원에게 줄 Claude 형식 스킬 폴더 → Codex가 추가로 읽을 스킬 루트 (skills/extraRoots/set).
 * 'all'이면 ~/.claude/skills와 프로젝트 .claude/skills를 그대로, 이름 목록이면 고른 것만 임시 폴더에 링크해 그 폴더 하나만 준다.
 * Codex 자체 스킬(~/.codex/skills)은 Codex가 항상 읽으므로 여기서 다루지 않는다. cleanup은 세션을 닫을 때 부른다
 */
export function codexSkillRoots(cwd: string, selection: string[] | 'all' | undefined, home = os.homedir()): { roots: string[]; cleanup: () => void } {
  const isDir = (d: string) => {
    try {
      return fs.statSync(d).isDirectory()
    } catch {
      return false
    }
  }
  const user = path.join(home, '.claude', 'skills')
  const project = path.join(cwd, '.claude', 'skills')
  if (selection === 'all' || selection === undefined) return { roots: [...new Set([user, project])].filter(isDir), cleanup: () => {} }
  if (!selection.length) return { roots: [], cleanup: () => {} }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-skills-'))
  for (const name of selection) {
    // 이름에 경로 문자가 들어 있으면 건너뛴다 (폴더 밖을 가리키지 못하게)
    if (name !== path.basename(name) || name.startsWith('.')) continue
    const src = [project, user].map((d) => path.join(d, name)).find((d) => isDir(d))
    if (!src) continue
    try {
      fs.symlinkSync(src, path.join(tmp, name), 'junction')
    } catch {
      /* 링크를 못 만들면 그 스킬은 건너뛴다 */
    }
  }
  return { roots: [tmp], cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) }
}
