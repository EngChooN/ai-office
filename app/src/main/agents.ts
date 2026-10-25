import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AgentTemplate, ModelChoice } from '../shared/types'

// 고용 화면의 "에이전트 불러오기": <작업 폴더>/.claude/agents 와 ~/.claude/agents 의 정의를 읽는다

const MODELS: ModelChoice[] = ['opus', 'sonnet', 'haiku']

function parse(file: string, source: string): AgentTemplate | null {
  const raw = fs.readFileSync(file, 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return null
  const meta: Record<string, string> = {}
  let lastKey = ''
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/)
    if (kv) {
      lastKey = kv[1]
      meta[lastKey] = kv[2].replace(/^["']|["']$/g, '').replace(/^\|$|^>$/, '')
    } else if (lastKey && line.startsWith(' ')) {
      meta[lastKey] = `${meta[lastKey]} ${line.trim()}`.trim()
    }
  }
  if (!meta.name) return null
  const model = MODELS.find((x) => meta.model?.includes(x)) ?? 'default'
  return { name: meta.name, description: meta.description ?? '', model, prompt: m[2].trim(), source }
}

export function listAgentTemplates(cwd: string): AgentTemplate[] {
  const dirs = [
    { dir: path.join(cwd, '.claude', 'agents'), source: '프로젝트' },
    { dir: path.join(os.homedir(), '.claude', 'agents'), source: '내 계정' },
  ]
  const out: AgentTemplate[] = []
  for (const { dir, source } of dirs) {
    let files: string[]
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
    } catch {
      continue
    }
    for (const f of files) {
      try {
        const t = parse(path.join(dir, f), source)
        if (t) out.push(t)
      } catch {
        // 읽을 수 없는 정의는 건너뜀
      }
    }
  }
  return out
}
