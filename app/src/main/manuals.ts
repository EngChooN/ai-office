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

/** 단계 JSON 검증 — 배열이고 각 단계에 필수 문자열 필드가 있어야 한다. 문제가 있으면 사유를 돌려준다 */
export function validateSteps(v: unknown): string | null {
  if (!Array.isArray(v)) return '단계가 배열이 아니에요.'
  for (let i = 0; i < v.length; i++) {
    const s = v[i] as Record<string, unknown> | null
    if (!s || typeof s !== 'object') return `${i + 1}번째 단계가 올바르지 않아요.`
    for (const k of ['id', 'title', 'role', 'instruction']) if (typeof s[k] !== 'string') return `${i + 1}번째 단계에 ${k} 값이 없어요.`
    if (s.maxLoops !== undefined && (typeof s.maxLoops !== 'number' || !Number.isFinite(s.maxLoops))) return `${i + 1}번째 단계의 maxLoops가 숫자가 아니에요.`
    if (s.onRevise !== undefined && s.onRevise !== null && typeof s.onRevise !== 'string') return `${i + 1}번째 단계의 onRevise가 올바르지 않아요.`
  }
  return null
}

function parse(file: string, scope: Manual['scope'], projectDir: string | null): Manual | null {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n') // CRLF로 저장된 파일도 읽는다
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
  let error: string | undefined
  const fence = body.match(new RegExp('```' + STEPS_FENCE + '\\n([\\s\\S]*?)\\n```'))
  if (fence) {
    try {
      const parsed: unknown = JSON.parse(fence[1])
      const bad = validateSteps(parsed)
      if (bad) error = bad
      else steps = parsed as ProcessStep[]
    } catch {
      error = '단계 JSON을 읽지 못했어요.'
    }
    body = body.replace(fence[0], '')
  }
  return { name, description: meta.description ?? '', kind: meta.kind === 'process' ? 'process' : 'personal', scope, projectDir, path: file, body: body.trim(), steps, ...(error ? { error } : {}) }
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
  const moving = !!previousPath && !sameFolder(path.dirname(previousPath), path.dirname(file))
  // 새로 만들거나 이름을 바꿀 때 같은 이름의 매뉴얼이 이미 있으면 덮어쓰지 않는다 (같은 폴더를 고치는 경우만 덮어쓴다)
  if ((!previousPath || moving) && fs.existsSync(path.dirname(file))) throw new Error('같은 이름의 매뉴얼이 이미 있어요. 다른 이름을 골라 주세요.')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, render(input))
  const saved = parse(file, input.scope, input.projectDir)
  if (!saved) throw new Error('매뉴얼을 저장했지만 다시 읽지 못했어요.')
  // 새 위치에 저장하고 읽어 본 뒤에만 원본을 정리한다. 보조 파일은 새 폴더로 옮기고, 옮기지 못하면 원본을 남긴다
  if (moving && previousPath) {
    try {
      const from = path.dirname(previousPath)
      for (const d of fs.readdirSync(from)) {
        if (d === 'SKILL.md') continue
        const to = path.join(path.dirname(file), d)
        if (!fs.existsSync(to)) fs.cpSync(path.join(from, d), to, { recursive: true })
      }
      removeManual(previousPath)
    } catch (e) {
      console.warn('[manuals] 보조 파일을 옮기지 못해 원본을 남겨 둬요:', e)
    }
  }
  return saved
}

/** 두 폴더가 실제로 같은 폴더인지 (심볼릭 링크·/tmp↔/private/tmp·대소문자만 다른 경로 포함) */
function sameFolder(a: string, b: string) {
  if (a === b) return true
  try {
    const sa = fs.statSync(a)
    const sb = fs.statSync(b)
    return sa.dev === sb.dev && sa.ino === sb.ino
  } catch {
    return false
  }
}

/** 매뉴얼 폴더를 지운다 — skills 폴더 아래의 SKILL.md인 경우만 */
export function removeManual(file: string) {
  if (path.basename(file) !== 'SKILL.md' || path.basename(path.dirname(path.dirname(file))) !== 'skills') return
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
}
