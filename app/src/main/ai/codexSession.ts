import fs from 'node:fs'
import path from 'node:path'

// Codex 세션 기록(롤아웃 jsonl) 읽기: ~/.codex/sessions/YYYY/MM/DD/rollout-<시각>-<threadId>.jsonl
// 앱을 다시 켠 뒤 첫 지시에서 문맥 크기·마지막 답(인수인계용)을 얻는 데 쓴다. electron 없이 돈다.

const TAIL_BYTES = 400_000

/** threadId로 롤아웃 파일 찾기: 날짜 폴더를 최신부터 훑는다 */
export function findCodexRollout(sessionsDir: string, threadId: string) {
  const sub = (dir: string) => {
    try {
      return fs.readdirSync(dir).sort().reverse()
    } catch {
      return []
    }
  }
  for (const y of sub(sessionsDir))
    for (const m of sub(path.join(sessionsDir, y)))
      for (const d of sub(path.join(sessionsDir, y, m))) {
        const dir = path.join(sessionsDir, y, m, d)
        const hit = sub(dir).find((f) => f.endsWith(`-${threadId}.jsonl`))
        if (hit) return path.join(dir, hit)
      }
  return null
}

/** 기록 끝부분에서 마지막 문맥 크기(직전 모델 호출의 입력 토큰)와 마지막 답을 읽는다 */
export function readCodexTail(file: string): { contextTokens: number; lastText: string } {
  let text = ''
  try {
    const size = fs.statSync(file).size
    const fd = fs.openSync(file, 'r')
    const length = Math.min(size, TAIL_BYTES)
    const buf = Buffer.alloc(length)
    fs.readSync(fd, buf, 0, length, size - length)
    fs.closeSync(fd)
    text = buf.toString('utf8')
  } catch {
    return { contextTokens: 0, lastText: '' }
  }
  let contextTokens = 0
  let lastText = ''
  for (const line of text.split('\n')) {
    if (!line.includes('"event_msg"')) continue
    try {
      const d = JSON.parse(line) as { type?: string; payload?: { type?: string; info?: { last_token_usage?: { input_tokens?: number } } | null; last_agent_message?: string | null } }
      if (d.type !== 'event_msg' || !d.payload) continue
      if (d.payload.type === 'token_count') contextTokens = d.payload.info?.last_token_usage?.input_tokens ?? contextTokens
      if (d.payload.type === 'task_complete' && d.payload.last_agent_message?.trim()) lastText = d.payload.last_agent_message.trim()
    } catch {
      // 잘려서 시작한 첫 줄 등은 건너뛴다
    }
  }
  return { contextTokens, lastText }
}
