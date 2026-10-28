import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { LogEntry } from '../shared/types'

// 외부 직원의 "오늘 한 일"은 Claude Code 트랜스크립트(jsonl)에서 읽는다

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects')
// 직원 패널에서 마크다운으로 전체를 보여 주므로 넉넉히 읽는다
const TEXT_MAX = 20_000

interface Line {
  type: string
  timestamp?: string
  requestId?: string
  isSidechain?: boolean
  message?: {
    content?: string | { type: string; text?: string; name?: string }[]
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
  }
}

function transcriptPath(cwd: string, sessionId: string) {
  return path.join(PROJECTS_DIR, cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${sessionId}.jsonl`)
}

export function readExternalDay(staffId: string, cwd: string, sessionId: string, since: number) {
  const logs: LogEntry[] = []
  let tokensIn = 0
  let tokensOut = 0
  let raw: string
  try {
    raw = fs.readFileSync(transcriptPath(cwd, sessionId), 'utf8')
  } catch {
    return { logs, tokensIn, tokensOut }
  }
  const countedRequests = new Set<string>()
  let seq = 0
  for (const l of raw.split('\n')) {
    if (!l) continue
    let line: Line
    try {
      line = JSON.parse(l) as Line
    } catch {
      continue
    }
    const ts = line.timestamp ? Date.parse(line.timestamp) : 0
    if (ts < since || line.isSidechain) continue
    const content = line.message?.content
    if (line.type === 'user' && typeof content === 'string' && !content.startsWith('<')) {
      logs.push({ id: seq++, staffId, ts, type: 'instruction', text: content.slice(0, TEXT_MAX) })
    }
    if (line.type === 'assistant') {
      // 한 API 응답이 블록마다 줄로 나뉘어 같은 usage가 반복되므로 requestId로 한 번만 센다
      const u = line.message?.usage
      if (u && line.requestId && !countedRequests.has(line.requestId)) {
        countedRequests.add(line.requestId)
        tokensIn += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
        tokensOut += u.output_tokens ?? 0
      }
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b.type === 'text' && b.text?.trim()) logs.push({ id: seq++, staffId, ts, type: 'reply', text: b.text.slice(0, TEXT_MAX) })
          if (b.type === 'tool_use' && b.name) logs.push({ id: seq++, staffId, ts, type: 'tool', text: b.name })
        }
      }
    }
  }
  return { logs, tokensIn, tokensOut }
}

// ── Codex 외부 세션: ~/.codex/sessions/YYYY/MM/DD/rollout-<시각>-<세션id>.jsonl ──

const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions')
/** 파일 이름의 날짜는 세션을 연 날이라, 며칠 전에 연 세션도 찾도록 거슬러 올라가는 일수 */
const CODEX_LOOKBACK_DAYS = 14

interface CodexLine {
  timestamp?: string
  type?: string
  payload?: { type?: string; role?: string; name?: string; content?: { type?: string; text?: string }[]; info?: { total_token_usage?: { input_tokens?: number; output_tokens?: number } } | null }
}

function findCodexFile(dir: string, sessionId: string) {
  const now = new Date()
  for (let i = 0; i <= CODEX_LOOKBACK_DAYS; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const day = path.join(dir, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'))
    try {
      const f = fs.readdirSync(day).find((n) => n.startsWith('rollout-') && n.endsWith(`-${sessionId}.jsonl`))
      if (f) return path.join(day, f)
    } catch {
      /* 그 날 폴더 없음 */
    }
  }
  return null
}

/** Codex 외부 세션의 오늘 한 일 (지시·답·도구 이름, 오늘 쓴 토큰). 기록을 못 찾으면 빈 결과 */
export function readCodexExternalDay(staffId: string, sessionId: string, since: number, dir = CODEX_SESSIONS_DIR) {
  const logs: LogEntry[] = []
  let tokensIn = 0
  let tokensOut = 0
  const file = findCodexFile(dir, sessionId)
  let raw = ''
  try {
    raw = file ? fs.readFileSync(file, 'utf8') : ''
  } catch {
    /* 못 읽으면 빈 결과 */
  }
  // 토큰은 누적값으로 오므로 오늘 0시 직전 값을 빼서 오늘 몫만 센다
  let baseIn = 0
  let baseOut = 0
  let lastIn = 0
  let lastOut = 0
  let seq = 0
  for (const l of raw.split('\n')) {
    if (!l) continue
    let line: CodexLine
    try {
      line = JSON.parse(l) as CodexLine
    } catch {
      continue
    }
    const ts = line.timestamp ? Date.parse(line.timestamp) : 0
    const p = line.payload
    if (!p) continue
    const usage = p.type === 'token_count' ? p.info?.total_token_usage : undefined
    if (usage) {
      lastIn = usage.input_tokens ?? 0
      lastOut = usage.output_tokens ?? 0
      if (ts < since) {
        baseIn = lastIn
        baseOut = lastOut
      }
    }
    if (ts < since || line.type !== 'response_item') continue
    if (p.type === 'message') {
      const text = (p.content ?? []).map((c) => c.text ?? '').join('').trim()
      if (!text) continue
      if (p.role === 'user' && !text.startsWith('<')) logs.push({ id: seq++, staffId, ts, type: 'instruction', text: text.slice(0, TEXT_MAX) })
      if (p.role === 'assistant') logs.push({ id: seq++, staffId, ts, type: 'reply', text: text.slice(0, TEXT_MAX) })
    } else if ((p.type === 'function_call' || p.type === 'custom_tool_call') && p.name) {
      logs.push({ id: seq++, staffId, ts, type: 'tool', text: p.name })
    }
  }
  tokensIn = Math.max(0, lastIn - baseIn)
  tokensOut = Math.max(0, lastOut - baseOut)
  return { logs, tokensIn, tokensOut }
}
