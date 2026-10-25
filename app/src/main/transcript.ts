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
