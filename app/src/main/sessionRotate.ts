// 대화가 길어지면 새 대화로 넘긴다 (토큰·속도)
// 같은 세션을 계속 이어 받으면 도구를 한 번 부를 때마다 지금까지의 대화 전체(수십만 토큰)를 다시 보낸다.
// 그래서 한 번 부를 때 보내는 양(문맥)이 기준을 넘으면, 다음 지시는 새 대화로 시작하고 직전 보고만 인수인계로 넘긴다.
// 이전 대화는 지워지지 않는다 — 터미널에서 이어 하기로 그대로 볼 수 있다

import { t } from '../shared/i18n/index.ts'
import fs from 'node:fs'
import path from 'node:path'

/** 한 번 부를 때 보내는 문맥이 이만큼을 넘으면 다음 지시부터 새 대화 */
export const CONTEXT_ROTATE_TOKENS = 80_000
/** 인수인계로 넘길 직전 보고 길이 */
const HANDOFF_MAX = 4000
/** 세션 기록 끝부분만 읽는다 (수십 MB짜리 기록도 있다) */
const TAIL_BYTES = 512 * 1024

type Usage = { input_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

/** 모델을 한 번 부를 때 실제로 보낸 문맥 크기 (캐시로 읽은 것 포함) */
export function contextOf(usage: Usage | null | undefined) {
  if (!usage) return 0
  return (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
}

/** 세션 기록 파일 찾기: ~/.claude/projects/<폴더 이름>/<세션>.jsonl (폴더 이름 규칙에 기대지 않고 세션 id로 찾는다) */
export function findSessionFile(projectsDir: string, sessionId: string) {
  try {
    for (const dir of fs.readdirSync(projectsDir)) {
      const file = path.join(projectsDir, dir, `${sessionId}.jsonl`)
      if (fs.existsSync(file)) return file
    }
  } catch {
    // 폴더가 없으면 기록도 없다
  }
  return null
}

/** 기록 끝부분에서 마지막 문맥 크기와 마지막 답(인수인계용)을 읽는다. 앱을 다시 켠 뒤 첫 지시에서 쓴다 */
export function readSessionTail(file: string): { contextTokens: number; lastText: string } {
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
    if (!line.includes('"assistant"')) continue
    try {
      const d = JSON.parse(line) as { type?: string; message?: { usage?: Usage; content?: unknown } }
      if (d.type !== 'assistant' || !d.message) continue
      const ctx = contextOf(d.message.usage)
      if (ctx) contextTokens = ctx
      const parts = Array.isArray(d.message.content) ? d.message.content : []
      const said = parts.flatMap((b: { type?: string; text?: string }) => (b?.type === 'text' && b.text?.trim() ? [b.text.trim()] : [])).join('\n')
      if (said) lastText = said
    } catch {
      // 잘려서 시작한 첫 줄 등은 건너뛴다
    }
  }
  return { contextTokens, lastText }
}

/** 새 대화의 첫 지시: 왜 새로 시작하는지 + 직전 보고 + 원래 지시 */
export function handoffText(lastReport: string, instruction: string) {
  const report = lastReport.trim()
  const clipped = report.length > HANDOFF_MAX ? `…${report.slice(-HANDOFF_MAX)}` : report
  return [
    t('staff.rotate.intro'),
    clipped && `${t('staff.rotate.last')}\n${clipped}`,
    `${t('staff.rotate.now')}\n${instruction}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}
