import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Manual, ManualInput, ProcessStep } from '../shared/types'

// 업무 매뉴얼 = Claude Code 스킬(SKILL.md). 개인 매뉴얼은 표준 스킬 그대로,
// 프로세스 매뉴얼은 frontmatter에 kind: process를 두고 본문 끝의 office-process 블록에 단계를 JSON으로 적는다.

const USER_DIR = path.join(os.homedir(), '.claude', 'skills')
const STEPS_FENCE = 'office-process'
const NAME_RE = /^[a-z0-9][a-z0-9-]{1,62}$/

export const projectSkillsDir = (projectDir: string) => path.join(projectDir, '.claude', 'skills')
export const isValidManualName = (name: string) => NAME_RE.test(name)

/** YAML 값의 따옴표를 벗긴다 ("..."는 JSON 문자열로 읽는다) */
function unquote(v: string) {
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v) as string
    } catch {
      /* 그대로 둔다 */
    }
  }
  return v.replace(/^["']|["']$/g, '')
}

function parse(file: string, scope: Manual['scope'], projectDir: string | null): Manual | null {
  const raw = fs.readFileSync(file, 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return null
  const meta: Record<string, string> = {}
  let blockKey: string | null = null
  for (const line of m[1].split('\n')) {
    // "description: |" 처럼 여러 줄 값이면 들여쓴 다음 줄들을 이어 붙인다
    if (blockKey && /^\s+\S/.test(line)) {
      meta[blockKey] = [meta[blockKey], line.trim()].filter(Boolean).join(' ')
      continue
    }
    blockKey = null
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/)
    if (!kv) continue
    if (/^[|>][-+]?$/.test(kv[2])) {
      blockKey = kv[1]
      meta[blockKey] = ''
    } else meta[kv[1]] = unquote(kv[2])
  }
  const name = meta.name || path.basename(path.dirname(file))
  let body = m[2]
  let steps: ProcessStep[] = []
  const fence = body.match(new RegExp('```' + STEPS_FENCE + '\\n([\\s\\S]*?)\\n```'))
  if (fence) {
    try {
      steps = JSON.parse(fence[1]) as ProcessStep[]
    } catch {
      steps = []
    }
    body = body.replace(fence[0], '')
  }
  return { name, description: meta.description ?? '', kind: meta.kind === 'process' ? 'process' : 'personal', scope, projectDir, path: file, body: body.trim(), steps }
}

function listIn(dir: string, scope: Manual['scope'], projectDir: string | null): Manual[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap((d) => {
    const file = path.join(dir, d.name, 'SKILL.md')
    if (!d.isDirectory() || !fs.existsSync(file)) return []
    try {
      const m = parse(file, scope, projectDir)
      return m ? [m] : []
    } catch {
      return []
    }
  })
}

/** 내 계정 + 직원·랩이 쓰는 프로젝트 폴더들의 매뉴얼 */
export function listManuals(projectDirs: string[]): Manual[] {
  // 폴더 지정 없는 직원은 홈 폴더에서 일하므로, 홈의 .claude/skills(= 내 계정)를 프로젝트로 또 읽지 않는다
  const dirs = [...new Set(projectDirs)].filter((d) => projectSkillsDir(d) !== USER_DIR)
  return [...listIn(USER_DIR, 'user', null), ...dirs.flatMap((d) => listIn(projectSkillsDir(d), 'project', d))]
}

function render(input: ManualInput) {
  const front = ['---', `name: ${input.name}`, `description: ${JSON.stringify(input.description.replace(/\n/g, ' '))}`, ...(input.kind === 'process' ? ['kind: process'] : []), '---', '']
  const steps = input.kind === 'process' ? ['', '```' + STEPS_FENCE, JSON.stringify(input.steps, null, 2), '```', ''] : []
  return [...front, input.body.trim(), ...steps].join('\n')
}

export function saveManual(input: ManualInput, previousPath?: string): Manual {
  if (!isValidManualName(input.name)) throw new Error('매뉴얼 이름은 영문 소문자·숫자·하이픈(-)으로 2~63자여야 해요.')
  const root = input.scope === 'user' ? USER_DIR : projectSkillsDir(input.projectDir ?? '')
  if (input.scope === 'project' && !input.projectDir) throw new Error('프로젝트 폴더를 골라 주세요.')
  const file = path.join(root, input.name, 'SKILL.md')
  if (previousPath && previousPath !== file) removeManual(previousPath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, render(input))
  return parse(file, input.scope, input.projectDir)!
}

/** 매뉴얼 폴더를 지운다 — skills 폴더 아래의 SKILL.md인 경우만 */
export function removeManual(file: string) {
  if (path.basename(file) !== 'SKILL.md' || path.basename(path.dirname(path.dirname(file))) !== 'skills') return
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
}
