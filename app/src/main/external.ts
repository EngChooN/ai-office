import fs from 'node:fs'
import { t } from '../shared/i18n/index.ts'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_EQUIPMENT, HOOK_PORT, type Approval, type StaffQuestion, type StaffStatus } from '../shared/types'
import type { StoredStaff as Staff } from './db'
import { scanCodexSessions, type CodexExternalSession } from './ai/codexExternal'

// 사무실 밖에서 띄운 Claude Code 세션 = "외부 직원". 설정 변경 없이 세션 레지스트리를 읽고,
// 사용자가 hooks 연결을 켜면 권한 대기·도구 사용까지 실시간으로 받는다.

const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const REGISTRY_DIR = path.join(CLAUDE_DIR, 'sessions')
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json')
const POLL_MS = 2000
/** 훅 요청 본문 상한 — 로컬 포트로 들어오는 과대 요청이 메모리를 채우지 않게 한다 */
const MAX_BODY = 4 * 1024 * 1024
const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions')
/** Codex 세션 파일 훑기는 폴링 몇 번에 한 번만 */
const CODEX_SCAN_MS = 6000
const HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse', 'Notification', 'Stop', 'SessionEnd'] as const
const HOOK_MARKER = `127.0.0.1:${HOOK_PORT}/hook`
const HOOK_COMMAND = `curl -s -m 1 -X POST -H 'content-type: application/json' --data-binary @- http://${HOOK_MARKER} >/dev/null 2>&1 || true`
const ACTIVITY_MAX = 80
// 질문 받기(옵트인): AskUserQuestion 직전 hook이 사무실의 답을 기다린다. 사무실이 꺼져 있거나
// 원래 창에서 답하기로 넘기면 빈 응답 → 원래 창에 질문이 그대로 뜬다
const ASK_MARKER = `127.0.0.1:${HOOK_PORT}/ask`
/** hook 기본 제한(600초)보다 먼저 놓아 원래 창으로 돌려보낸다 */
const ASK_WAIT_MS = 540_000
const ASK_HOOK_TIMEOUT_S = 600
/**
 * 고용 직원 세션(CLAUDE_OFFICE_HIRED=1)은 건너뛴다 — 사용자 설정을 읽는 고용 직원에게도 이 hook이 돌아서,
 * 다른 AI Office(설치본·개발 앱)가 포트를 잡고 있으면 그 앱이 외부 직원 질문으로 붙잡아 최대 9분 멈췄다 (QA: 대신 답하기 6분)
 * Claude 데스크톱 앱 세션도 건너뛴다 — 앱 자체 질문 UI를 쓰는데 이 hook이 질문을 사무실로 가져가 버렸다
 */
export const HIRED_ENV = 'CLAUDE_OFFICE_HIRED'
const DESKTOP_ENTRYPOINT = 'claude-desktop'
export const ASK_COMMAND = `[ -n "$${HIRED_ENV}" ] || [ "$CLAUDE_CODE_ENTRYPOINT" = "${DESKTOP_ENTRYPOINT}" ] || curl -s -m ${ASK_HOOK_TIMEOUT_S - 10} -X POST -H 'content-type: application/json' --data-binary @- http://${ASK_MARKER} 2>/dev/null || true`
const QUESTION_TOOL = 'AskUserQuestion'

interface PendingAsk {
  approval: Approval
  input: Record<string, unknown>
  res: http.ServerResponse
  timer: NodeJS.Timeout
}

interface RegistryEntry {
  pid: number
  sessionId: string
  cwd: string
  name?: string
  status?: string
  entrypoint?: string
  startedAt?: number
}

interface HookPayload {
  session_id: string
  hook_event_name: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  message?: string
  cwd?: string
}

export interface ExternalHooks {
  sync(external: Staff[]): void
  waiting(staff: Staff, message: string): void
  asked(staff: Staff, approval: Approval): void
}

/** AskUserQuestion 입력에서 화면에 띄울 질문만 꺼낸다 */
export function toQuestions(input: Record<string, unknown>): StaffQuestion[] {
  const list = Array.isArray(input.questions) ? (input.questions as Partial<StaffQuestion>[]) : []
  return list.map((q) => ({
    question: String(q.question ?? ''),
    header: String(q.header ?? ''),
    options: (q.options ?? []).map((o) => ({ label: String(o.label ?? ''), description: String(o.description ?? '') })),
    multiSelect: Boolean(q.multiSelect),
  }))
}

export class ExternalWatcher {
  private staff = new Map<string, Staff>()
  /** hooks로 받은 상태가 레지스트리보다 세밀하므로 잠시 우선한다 */
  private hookOverride = new Map<string, { status: StaffStatus; activity: string }>()
  private timer: NodeJS.Timeout | null = null
  private server: http.Server | null = null
  private asks = new Map<string, PendingAsk>()
  private codexScan: { at: number; list: CodexExternalSession[] } = { at: 0, list: [] }
  /** 촬영용 데모 세션 (main/demoLive.ts) — 레지스트리에 없어도 이 앱 프로세스로 살아 있는 것처럼 '일하는 중'으로 보인다 */
  private demoSessions: RegistryEntry[] = []

  constructor(
    private hooks: ExternalHooks,
    private isOwnSession: (sessionId: string) => boolean,
    private takenDesks: () => Set<number>,
  ) {}

  start() {
    this.poll()
    this.timer = setInterval(() => this.poll(), POLL_MS)
    this.server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/ask') return this.onAsk(req, res)
      if (req.method !== 'POST' || req.url !== '/hook') return res.writeHead(404).end()
      let body = ''
      req.on('data', (c) => {
        body += c
        if (body.length > MAX_BODY) {
          res.writeHead(413).end()
          req.destroy()
        }
      })
      req.on('end', () => {
        res.writeHead(204).end()
        try {
          this.onHook(JSON.parse(body) as HookPayload)
        } catch {
          // 잘못된 페이로드는 무시
        }
      })
    })
    this.server.on('error', () => (this.server = null))
    this.server.listen(HOOK_PORT, '127.0.0.1')
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    for (const id of [...this.asks.keys()]) this.release(id)
    this.server?.close()
  }

  /** 외부 세션의 질문을 받아 둔다 — 응답은 답하거나 놓을 때까지 미룬다 */
  private onAsk(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > MAX_BODY) {
        res.writeHead(413).end()
        req.destroy()
      }
    })
    req.on('end', () => {
      let p: HookPayload
      try {
        p = JSON.parse(body) as HookPayload
      } catch {
        return res.writeHead(200).end()
      }
      const staff = this.staff.get(`ext:${p.session_id}`)
      if (p.tool_name !== QUESTION_TOOL || !p.tool_input || !staff || this.isOwnSession(p.session_id)) return res.writeHead(200).end()
      const questions = toQuestions(p.tool_input)
      const approval: Approval = { id: `ask:${crypto.randomUUID()}`, staffId: staff.id, toolName: QUESTION_TOOL, summary: questions.map((q) => q.question).join(' / '), createdAt: Date.now(), questions }
      const timer = setTimeout(() => this.release(approval.id), ASK_WAIT_MS)
      this.asks.set(approval.id, { approval, input: p.tool_input, res, timer })
      // 원래 창에서 세션을 멈추면(Esc) 연결이 끊긴다
      res.on('close', () => this.drop(approval.id))
      this.hookOverride.set(p.session_id, { status: 'waiting', activity: '대표 답변 대기' })
      this.poll()
      this.hooks.asked(this.staff.get(staff.id) ?? staff, approval)
    })
  }

  /** 사무실에서 고른 답으로 질문 도구를 이어가게 한다 */
  answer(approvalId: string, answers: Record<string, string>) {
    const a = this.asks.get(approvalId)
    if (!a) return false
    const out = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { ...a.input, answers } } }
    a.res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out))
    this.drop(approvalId)
    return true
  }

  /** 답하지 않고 놓는다 — 빈 응답이면 원래 창에 질문이 뜬다 */
  release(approvalId: string) {
    const a = this.asks.get(approvalId)
    if (!a) return false
    if (!a.res.writableEnded) a.res.writeHead(200).end()
    this.drop(approvalId)
    return true
  }

  private drop(approvalId: string) {
    const a = this.asks.get(approvalId)
    if (!a) return
    clearTimeout(a.timer)
    this.asks.delete(approvalId)
    const sessionId = a.approval.staffId.replace(/^ext:/, '')
    if (![...this.asks.values()].some((x) => x.approval.staffId === a.approval.staffId)) this.hookOverride.delete(sessionId)
    this.poll()
  }

  list() {
    return [...this.staff.values()]
  }

  setDemoSessions(list: { sessionId: string; cwd: string; name: string; startedAt: number }[]) {
    this.demoSessions = list.map((e) => ({ ...e, pid: process.pid, status: 'busy', entrypoint: 'cli' }))
    this.poll()
  }

  private poll() {
    const entries = [...readRegistry(), ...this.demoSessions].filter((e) => isAlive(e.pid) && !this.isOwnSession(e.sessionId))
    const seen = new Set<string>()
    // 고용 직원 자리 + 이미 앉은 외부 직원 자리를 피해 빈 책상을 순서대로 배정한다
    const taken = this.takenDesks()
    for (const e of entries) {
      const existing = this.staff.get(`ext:${e.sessionId}`)
      if (existing) taken.add(existing.deskIndex)
    }
    const nextDesk = () => {
      let i = 0
      while (taken.has(i)) i++
      taken.add(i)
      return i
    }
    for (const e of entries) {
      const id = `ext:${e.sessionId}`
      seen.add(id)
      const override = this.hookOverride.get(e.sessionId)
      const status: StaffStatus = override?.status ?? (e.status === 'busy' ? 'working' : 'idle')
      const prev = this.staff.get(id)
      this.staff.set(id, {
        id,
        kind: 'external',
        provider: 'claude',
        name: e.name || path.basename(e.cwd),
        role: e.entrypoint === 'claude-desktop' ? t('external.roleDesktop') : t('external.roleTerminal'),
        avatar: hashOf(e.sessionId),
        model: 'default',
        cwd: e.cwd,
        systemPrompt: '',
        approvalMode: 'ask',
        sessionId: e.sessionId,
        teamId: null,
        equipment: DEFAULT_EQUIPMENT,
        pid: e.pid,
        status,
        activity: override?.activity ?? (status === 'working' ? t('external.working') : ''),
        approvals: [...this.asks.values()].filter((a) => a.approval.staffId === id).map((a) => a.approval),
        costUsd: 0,
        tokensIn: 0,
        tokensOut: 0,
        deskIndex: prev?.deskIndex ?? nextDesk(),
        hiredAt: e.startedAt ?? Date.now(),
      })
    }
    // Codex 터미널·앱 세션: 훅이 없어 기록 파일 상태로만 본다 (보기 전용)
    for (const e of this.codexSessions()) {
      const id = `ext:${e.threadId}`
      if (seen.has(id) || this.isOwnSession(e.threadId)) continue
      seen.add(id)
      const prev = this.staff.get(id)
      this.staff.set(id, {
        id,
        kind: 'external',
        provider: 'codex',
        name: path.basename(e.cwd),
        role: 'Codex',
        avatar: hashOf(e.threadId),
        model: 'default',
        cwd: e.cwd,
        systemPrompt: '',
        approvalMode: 'ask',
        sessionId: e.threadId,
        teamId: null,
        equipment: DEFAULT_EQUIPMENT,
        pid: null,
        status: e.status === 'working' ? 'working' : 'idle',
        activity: e.status === 'working' ? t('external.working') : '',
        approvals: [],
        costUsd: 0,
        tokensIn: 0,
        tokensOut: 0,
        deskIndex: prev?.deskIndex ?? nextDesk(),
        hiredAt: e.startedAt,
      })
    }
    for (const id of this.staff.keys()) if (!seen.has(id)) this.staff.delete(id)
    this.hooks.sync(this.list())
  }

  private codexSessions() {
    const now = Date.now()
    if (now - this.codexScan.at >= CODEX_SCAN_MS) this.codexScan = { at: now, list: scanCodexSessions(CODEX_SESSIONS_DIR, now) }
    return this.codexScan.list
  }

  private onHook(p: HookPayload) {
    if (this.isOwnSession(p.session_id)) return
    const set = (status: StaffStatus, activity: string) => this.hookOverride.set(p.session_id, { status, activity: activity.slice(0, ACTIVITY_MAX) })
    switch (p.hook_event_name) {
      case 'UserPromptSubmit':
        set('working', '지시 확인 중')
        break
      case 'PreToolUse':
        set('working', `${p.tool_name ?? ''} ${summarize(p.tool_input)}`)
        break
      case 'Notification': {
        set('waiting', p.message ?? '확인을 기다리는 중')
        const s = this.staff.get(`ext:${p.session_id}`)
        if (s) this.hooks.waiting(s, p.message ?? '확인을 기다리는 중')
        break
      }
      case 'Stop':
      case 'SessionEnd':
        this.hookOverride.delete(p.session_id)
        break
    }
    this.poll()
  }
}

function readRegistry(): RegistryEntry[] {
  let files: string[]
  try {
    files = fs.readdirSync(REGISTRY_DIR).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  const out: RegistryEntry[] = []
  for (const f of files) {
    try {
      const e = JSON.parse(fs.readFileSync(path.join(REGISTRY_DIR, f), 'utf8')) as RegistryEntry
      if (e.pid && e.sessionId && e.cwd) out.push(e)
    } catch {
      // 쓰는 도중인 파일은 다음 폴링에서 읽는다
    }
  }
  return out
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function hashOf(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

function summarize(input?: Record<string, unknown>) {
  if (!input) return ''
  const key = ['command', 'file_path', 'path', 'pattern', 'url'].find((k) => typeof input[k] === 'string')
  return key ? String(input[key]) : ''
}

// ── 전역 hooks 연결 (옵트인) ─────────────────────────────

type HookEntry = { matcher?: string; hooks?: { type: string; command?: string; timeout?: number }[] }
type Settings = { hooks?: Record<string, HookEntry[]> } & Record<string, unknown>

function readSettings(): Settings {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) as Settings
  } catch {
    return {}
  }
}

const isOurs = (entry: HookEntry) => entry.hooks?.some((h) => h.command?.includes(HOOK_MARKER)) ?? false

const isAsk = (entry: HookEntry) => entry.hooks?.some((h) => h.command?.includes(ASK_MARKER)) ?? false

export function askHookInstalled() {
  return readSettings().hooks?.PreToolUse?.some(isAsk) ?? false
}

/** 예전 질문 받기 hook(고용 직원도 붙잡던 것)이 깔려 있으면 지금 명령으로 바꿔 둔다 (앱을 켤 때) */
export function upgradeAskHook() {
  const entries = readSettings().hooks?.PreToolUse ?? []
  const isOld = entries.some((e) => isAsk(e) && e.hooks?.some((h) => h.command?.includes(ASK_MARKER) && h.command !== ASK_COMMAND))
  if (isOld) setAskHookInstalled(true)
  return isOld
}

/** 질문 받기 hook(AskUserQuestion 전용)을 넣거나 뺀다 */
export function setAskHookInstalled(installed: boolean) {
  const s = readSettings()
  if (fs.existsSync(SETTINGS_PATH)) fs.copyFileSync(SETTINGS_PATH, `${SETTINGS_PATH}.claude-office.bak`)
  const hooks = { ...(s.hooks ?? {}) }
  const rest = (hooks.PreToolUse ?? []).filter((e) => !isAsk(e))
  hooks.PreToolUse = installed ? [...rest, { matcher: QUESTION_TOOL, hooks: [{ type: 'command', command: ASK_COMMAND, timeout: ASK_HOOK_TIMEOUT_S }] }] : rest
  if (hooks.PreToolUse.length === 0) delete hooks.PreToolUse
  const next: Settings = { ...s, hooks }
  if (Object.keys(hooks).length === 0) delete next.hooks
  fs.writeFileSync(SETTINGS_PATH, `${JSON.stringify(next, null, 2)}\n`)
  return askHookInstalled()
}

export function hooksInstalled() {
  const s = readSettings()
  return HOOK_EVENTS.every((ev) => s.hooks?.[ev]?.some(isOurs))
}

/** ~/.claude/settings.json에 사무실 hooks를 넣거나 뺀다. 바꾸기 전에 백업을 남긴다 */
export function setHooksInstalled(installed: boolean) {
  const s = readSettings()
  if (fs.existsSync(SETTINGS_PATH)) fs.copyFileSync(SETTINGS_PATH, `${SETTINGS_PATH}.claude-office.bak`)
  const hooks = { ...(s.hooks ?? {}) }
  for (const ev of HOOK_EVENTS) {
    const rest = (hooks[ev] ?? []).filter((e) => !isOurs(e))
    hooks[ev] = installed ? [...rest, { hooks: [{ type: 'command', command: HOOK_COMMAND }] }] : rest
    if (hooks[ev].length === 0) delete hooks[ev]
  }
  const next: Settings = { ...s, hooks }
  if (Object.keys(hooks).length === 0) delete next.hooks
  fs.writeFileSync(SETTINGS_PATH, `${JSON.stringify(next, null, 2)}\n`)
  return hooksInstalled()
}
