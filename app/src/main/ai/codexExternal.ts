import fs from 'node:fs'
import path from 'node:path'

// 사무실 밖에서 쓰는 Codex 세션 감시: Claude처럼 세션 레지스트리·훅이 없어 ~/.codex/sessions 롤아웃 파일(jsonl)의 수정 시각과 끝 이벤트로 본다.
// 이 앱이 연 세션(originator = ai-office)은 직원으로 이미 있어 뺀다. electron 없이 돈다.

/** 이 시간 안에 기록이 바뀐 세션만 "열려 있는" 것으로 본다 */
export const EXTERNAL_ACTIVE_MS = 10 * 60_000
/** 마지막 기록이 이 시간 안이고 턴이 끝나지 않았으면 일하는 중 */
const WORKING_MS = 90_000
const TAIL_BYTES = 64_000
const MAX_TAIL_BYTES = 16_000_000
const HEAD_BYTES = 8_000

export interface CodexExternalSession {
  threadId: string
  cwd: string
  startedAt: number
  /** 마지막 기록 시각 */
  updatedAt: number
  status: 'working' | 'idle'
}

const parse = (line: string) => {
  try {
    return JSON.parse(line) as { timestamp?: string; type?: string; payload?: Record<string, unknown> }
  } catch {
    return null
  }
}

function readRange(file: string, start: number, length: number) {
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(length)
    const n = fs.readSync(fd, buf, 0, length, start)
    return buf.subarray(0, n).toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
}

/** 파일 하나 → 세션. 이 앱이 연 세션·읽을 수 없는 파일·오래된 파일은 null */
export function readExternalSession(file: string, now: number): CodexExternalSession | null {
  let stat: fs.Stats
  try {
    stat = fs.statSync(file)
  } catch {
    return null
  }
  if (now - stat.mtimeMs > EXTERNAL_ACTIVE_MS) return null
  let meta: Record<string, unknown> | undefined
  try {
    // 첫 줄(session_meta)은 지침 전문이 실려 길 수 있어 줄 끝까지 읽는다
    const head = readRange(file, 0, Math.min(stat.size, HEAD_BYTES * 8))
    const first = head.slice(0, head.indexOf('\n') < 0 ? undefined : head.indexOf('\n'))
    const m = parse(first)
    if (m?.type === 'session_meta') meta = m.payload
  } catch {
    return null
  }
  const threadId = typeof meta?.id === 'string' ? meta.id : ''
  const cwd = typeof meta?.cwd === 'string' ? meta.cwd : ''
  if (!threadId || !cwd || meta?.originator === 'ai-office') return null
  // 끝부분에서 마지막 턴 이벤트: task_started 뒤에 task_complete·turn_aborted가 없으면 진행 중
  let open = false
  try {
    // 큰 도구 출력으로 턴 시작 줄이 끝부분 밖으로 밀려날 수 있어, 턴 이벤트가 나올 때까지 창을 두 배씩 넓힌다
    for (let size = TAIL_BYTES; ; size *= 2) {
      const len = Math.min(stat.size, size)
      const tail = readRange(file, stat.size - len, len)
      let last: string | null = null
      for (const line of tail.split('\n')) {
        if (!line.includes('"event_msg"')) continue
        const e = parse(line)
        const t = e?.type === 'event_msg' ? e.payload?.type : null
        if (t === 'task_started' || t === 'turn_started') last = 'open'
        else if (t === 'task_complete' || t === 'turn_complete' || t === 'turn_aborted') last = 'closed'
      }
      if (last || len >= stat.size || len >= MAX_TAIL_BYTES) {
        open = last === 'open'
        break
      }
    }
  } catch {
    /* 못 읽으면 쉬는 중으로 */
  }
  const startedAt = Date.parse(String(meta?.timestamp ?? '')) || stat.birthtimeMs
  return { threadId, cwd, startedAt, updatedAt: stat.mtimeMs, status: open && now - stat.mtimeMs < WORKING_MS ? 'working' : 'idle' }
}

/** 오늘·어제 날짜 폴더(YYYY/MM/DD)의 최근 롤아웃들을 훑는다 */
export function scanCodexSessions(sessionsDir: string, now: number): CodexExternalSession[] {
  const days = [now, now - 24 * 3600_000].map((t) => {
    const d = new Date(t)
    return path.join(sessionsDir, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'))
  })
  const out: CodexExternalSession[] = []
  for (const dir of new Set(days)) {
    let files: string[]
    try {
      files = fs.readdirSync(dir).filter((f) => f.startsWith('rollout-') && f.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const f of files) {
      const s = readExternalSession(path.join(dir, f), now)
      if (s) out.push(s)
    }
  }
  return out
}
