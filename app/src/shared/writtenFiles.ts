// 자동결재·자율 진행 중 직원이 고친 파일 기록과 "그 파일을 실행하는 명령인가" 판정 (H2·A4)
// 경로 전체가 같고 실제로 실행할 때만 기다린다. package.json은 scripts가 바뀐 이름만, Makefile은 바뀐 타깃만 막는다.
import { base, lexSegments, resolveCommand } from './commandScan.ts'
import type { ApprovalWaitReason } from './types.ts'

export interface WrittenRecord {
  /** 고친 파일의 정리된 전체 경로 (소문자) */
  files: Set<string>
  /** package.json에서 바뀐 scripts 이름 */
  scripts: Set<string>
  /** scripts를 알 수 없게 바뀐 경우(파싱 실패 등) — 모든 스크립트 실행을 막는다 */
  allScripts: boolean
  /** Makefile에서 바뀐 타깃 (의존 타깃 포함) */
  makeTargets: Set<string>
  /** Makefile에서 변수·include 등 타깃 밖이 바뀌었거나 알 수 없는 경우 */
  allMake: boolean
  /** 기본 타깃(첫 타깃) — `make`만 쓴 명령이 어느 타깃인지 */
  makeDefault: string
}

export const emptyWritten = (): WrittenRecord => ({ files: new Set(), scripts: new Set(), allScripts: false, makeTargets: new Set(), allMake: false, makeDefault: '' })

/** `//`·`/./`·`..`·역슬래시를 정리한 경로 (소문자 — macOS 기본 파일 시스템은 대소문자를 구분하지 않는다) */
export function normWrittenPath(raw: string): string {
  const p = raw.replace(/\\/g, '/')
  const abs = p.startsWith('/')
  const out: string[] = []
  for (const part of p.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else if (!abs) out.push('..')
      continue
    }
    out.push(part)
  }
  return ((abs ? '/' : '') + out.join('/')).toLowerCase()
}

// ── package.json ──────────────────────────────────

function scriptsOf(text: string | null): Record<string, string> | null {
  if (text === null) return {}
  try {
    const j = JSON.parse(text) as { scripts?: unknown }
    const s = j && typeof j === 'object' ? j.scripts : undefined
    if (s === undefined) return {}
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null
    return Object.fromEntries(Object.entries(s as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
  } catch {
    return null
  }
}

/** 고치기 전·후 package.json에서 scripts 값이 바뀐 이름 (알 수 없으면 null) */
export function changedScripts(before: string | null, after: string | null): Set<string> | null {
  const a = scriptsOf(before)
  const b = scriptsOf(after)
  if (!a || !b) return null
  const names = new Set<string>()
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) names.add(k)
  return names
}

// ── Makefile ──────────────────────────────────────

interface MakeModel {
  header: string
  first: string
  rules: Map<string, { recipe: string; deps: Set<string> }>
}

function parseMake(text: string | null): MakeModel {
  const m: MakeModel = { header: '', first: '', rules: new Map() }
  if (text === null) return m
  const header: string[] = []
  let current: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith('\t')) {
      const line = raw.trim()
      if (!current.length) header.push(raw)
      else for (const n of current) m.rules.get(n)!.recipe += line + '\n'
      continue
    }
    const line = raw.replace(/(^|\s)#.*$/, '').trim()
    if (!line) continue
    const rule = /^([^\s:=][^:=]*?)\s*:(?![:=])\s*([^;]*)(?:;(.*))?$/.exec(line)
    if (!rule) {
      header.push(line)
      current = []
      continue
    }
    const names = rule[1].split(/\s+/).filter(Boolean)
    const deps = new Set(rule[2].split(/\s+/).filter((d) => d && !d.startsWith('|')))
    current = names
    for (const n of names) {
      const r = m.rules.get(n) ?? { recipe: '', deps: new Set<string>() }
      for (const d of deps) r.deps.add(d)
      if (rule[3]) r.recipe += rule[3].trim() + '\n'
      m.rules.set(n, r)
      if (!m.first && !n.startsWith('.')) m.first = n
    }
  }
  m.header = header.join('\n')
  return m
}

/** 고치기 전·후 Makefile에서 레시피나 의존이 바뀐 타깃 (그 타깃에 기대는 타깃 포함). all=변수·include 등 타깃 밖이 바뀜 */
export function changedMakeTargets(before: string | null, after: string | null): { all: boolean; targets: Set<string>; first: string } {
  const a = parseMake(before)
  const b = parseMake(after)
  if (before === null || a.header !== b.header) return { all: true, targets: new Set(), first: b.first }
  const changed = new Set<string>()
  for (const n of new Set([...a.rules.keys(), ...b.rules.keys()])) {
    const x = a.rules.get(n)
    const y = b.rules.get(n)
    if (!x || !y || x.recipe !== y.recipe || [...x.deps].sort().join(' ') !== [...y.deps].sort().join(' ')) changed.add(n)
  }
  // 바뀐 타깃에 기대는 타깃도 바뀐 것으로 본다
  for (let grew = true; grew; ) {
    grew = false
    for (const [n, r] of b.rules) if (!changed.has(n) && [...r.deps].some((d) => changed.has(d))) (changed.add(n), (grew = true))
  }
  return { all: false, targets: changed, first: b.first }
}

// ── 기록 ──────────────────────────────────────────

const isMakefile = (name: string) => /^(gnumakefile|makefile)$/i.test(name)

/** 직원이 파일을 고쳤다고 기록한다. before·after는 고치기 전·후 내용 (알 수 없으면 null) */
export function recordWrite(rec: WrittenRecord, filePath: string, before: string | null, after: string | null, afterKnown = true) {
  const p = normWrittenPath(filePath)
  if (!p) return
  rec.files.add(p)
  const name = base(p)
  if (name === 'package.json') {
    const names = afterKnown ? changedScripts(before, after) : null
    if (!names) rec.allScripts = true
    else for (const n of names) rec.scripts.add(n)
  } else if (isMakefile(name)) {
    if (!afterKnown) rec.allMake = true
    else {
      const c = changedMakeTargets(before, after)
      if (c.all) rec.allMake = true
      for (const n of c.targets) rec.makeTargets.add(n)
      if (c.first) rec.makeDefault = c.first
    }
  }
}

// ── 명령 판정 ─────────────────────────────────────

const INTERPRETERS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'source', '.', 'node', 'nodejs', 'python', 'python2', 'python3', 'ruby', 'perl', 'php', 'tsx', 'ts-node', 'deno', 'bun', 'npx', 'bunx', 'pnpx', 'osascript', 'pwsh', 'powershell'])
const NPM_RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'bun'])
const NPM_BUILTIN_SCRIPTS: Record<string, string> = { test: 'test', t: 'test', tst: 'test', start: 'start', stop: 'stop', restart: 'restart' }
const INSTALL_LIFECYCLE = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish']
const INSTALL_VERBS = new Set(['install', 'i', 'ci', 'add', 'update', 'up', 'rebuild', 'link'])

/** 인자가 기록된 파일과 같은 경로인가 — 절대 경로는 전체 일치, 상대 경로는 기록된 경로의 끝부분과 일치 (작업 폴더를 몰라도 안전한 쪽으로) */
function pointsAt(rec: WrittenRecord, arg: string): boolean {
  if (!arg || arg.startsWith('-')) return false
  const n = normWrittenPath(arg)
  if (!n) return false
  if (n.startsWith('/')) return rec.files.has(n)
  for (const f of rec.files) if (f === n || f.endsWith('/' + n)) return true
  return false
}

function scriptAffected(rec: WrittenRecord, name: string): boolean {
  return rec.allScripts || rec.scripts.has(name) || rec.scripts.has('pre' + name) || rec.scripts.has('post' + name)
}

/** 이 명령이 방금 쓴 파일을 실행하거나, 그 파일이 바꾼 스크립트·타깃을 돌리면 이유를, 아니면 null */
export function writtenWaitReason(rec: WrittenRecord, command: string): ApprovalWaitReason | null {
  if (!command || (!rec.files.size && !rec.scripts.size && !rec.allScripts && !rec.makeTargets.size && !rec.allMake)) return null
  let buildHit = false
  for (const seg of lexSegments(command)) {
    const { cmd, args } = resolveCommand(seg)
    if (!cmd) continue
    const name = base(cmd)
    // 1) 고친 파일을 직접 실행 (./x · /abs/x) 하거나 인터프리터에 넘김
    if (rec.files.size) {
      if (cmd.includes('/') && pointsAt(rec, cmd)) return 'written-file'
      if (INTERPRETERS.has(name) && args.some((a) => pointsAt(rec, a))) return 'written-file'
    }
    // 2) 바뀐 package.json 스크립트 실행
    if ((rec.scripts.size || rec.allScripts) && NPM_RUNNERS.has(name)) {
      const words = args.filter((a) => !a.startsWith('-'))
      const verbs = new Set(words)
      const hits = words.some((w) => scriptAffected(rec, NPM_BUILTIN_SCRIPTS[w] ?? w)) || ([...verbs].some((w) => INSTALL_VERBS.has(w)) && INSTALL_LIFECYCLE.some((n) => scriptAffected(rec, n)))
      if (hits) buildHit = true
    }
    // 3) 바뀐 Makefile 타깃 실행
    if ((rec.makeTargets.size || rec.allMake) && ['make', 'gmake'].includes(name)) {
      const goals = args.filter((a) => !a.startsWith('-') && !a.includes('='))
      if (rec.allMake || (goals.length ? goals : [rec.makeDefault]).some((g) => rec.makeTargets.has(g))) buildHit = true
    }
  }
  return buildHit ? 'build-script' : null
}
