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
  /** 고친 package.json에서 본 scripts 전체 (이름 → 값) — 연쇄 스크립트·고친 파일을 부르는 스크립트를 찾는 데 쓴다 */
  scriptValues: Record<string, string>
  /** 고친 파일이 테스트(*.test.*·*.spec.*)이거나 scripts/ 아래라 스크립트·테스트 러너가 부를 수 있다 */
  runnable: boolean
}

export const emptyWritten = (): WrittenRecord => ({ files: new Set(), scripts: new Set(), allScripts: false, makeTargets: new Set(), allMake: false, makeDefault: '', scriptValues: {}, runnable: false })

/** `//`·`/./`·`..`·역슬래시를 정리한 경로 (소문자 — macOS 기본 파일 시스템은 대소문자를 구분하지 않는다) */
export function normWrittenPath(raw: string): string {
  // 따옴표로 감싼 경로·윈도우 드라이브 문자(C:)는 벗기고 절대 경로로 본다
  let p = raw.trim().replace(/^(["'])(.*)\1$/, '$2').replace(/\\/g, '/')
  const drive = /^[a-zA-Z]:(?=\/|$)/.test(p)
  if (drive) p = p.slice(2)
  const abs = p.startsWith('/') || drive
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

const REDIRECT_OUT = /^(?:\d*|&)(?:>>|>\||>&|>|&>>|&>)(.*)$/
/** 파일을 쓰는 명령 (인자가 쓰기 대상) */
const BASH_WRITERS = new Set(['tee', 'cp', 'mv', 'ln', 'install', 'sed', 'touch', 'truncate', 'dd', 'rsync', 'patch', 'tar', 'unzip', 'zip', 'xxd', 'sort', 'split', 'csplit', 'base64'])
/** 마지막 인자만 쓰기 대상인 명령 */
const LAST_ARG = new Set(['cp', 'mv', 'install', 'rsync'])

/**
 * Bash 명령이 파일을 쓰는지 본다 (리다이렉트 >·>>, tee·cp·mv·sed -i 등). 읽기 명령은 writes=false.
 * targets는 뽑을 수 있었던 대상 경로 — 못 뽑아도 writes=true면 보수적으로 쓰기로 본다.
 */
export function bashWrites(command: string): { writes: boolean; targets: string[] } {
  const targets: string[] = []
  let writes = false
  for (const seg of lexSegments(command)) {
    const toks = seg.tokens.filter((t) => t !== '')
    for (let k = 0; k < toks.length; k++) {
      const m = REDIRECT_OUT.exec(toks[k])
      if (!m) continue
      const t = m[1] || toks[k + 1] || ''
      if (/^(\d+|-|&\d*)$/.test(t) || t.startsWith('/dev/')) continue
      writes = true
      if (t && !/[$`*?]/.test(t)) targets.push(t)
    }
    const { cmd, args } = resolveCommand(seg)
    if (!cmd) continue
    const name = base(cmd)
    const pos = args.filter((a) => !a.startsWith('-')).map((a) => a.replace(/^of=/, ''))
    if (name === 'sed' && !args.some((a) => /^-[A-Za-z]*[iI]|^--in-place/.test(a))) continue // sed -i 만 쓰기
    if (name === 'sort' && !args.some((a) => /^-[A-Za-z]*o|^--output/.test(a))) continue
    if (name === 'base64' && !args.some((a) => /^-[A-Za-z]*o|^--output/.test(a))) continue
    if ((name === 'tar' && !args.some((a) => /^-?[A-Za-z]*x|^--extract|^-[A-Za-z]*c|^--create/.test(a))) || (name === 'unzip' && args.some((a) => /^-[A-Za-z]*[lpvt]/.test(a)))) continue
    if (name === 'npm' || name === 'pnpm' || name === 'yarn') {
      if (pos[0] === 'pkg' && (pos[1] === 'set' || pos[1] === 'delete' || pos[1] === 'fix')) (writes = true), targets.push('package.json')
      continue
    }
    if (name === 'git') {
      if (pos[0] === 'apply' || pos[0] === 'am' || pos[0] === 'checkout' || pos[0] === 'restore' || pos[0] === 'stash') writes = true
      continue
    }
    if (!BASH_WRITERS.has(name)) continue
    writes = true
    targets.push(...(LAST_ARG.has(name) ? pos.slice(-1) : pos).filter((a) => !/[$`*?]/.test(a)))
  }
  return { writes, targets }
}

/** 자동 허용된 Bash 쓰기를 기록한다 — 경로를 뽑으면 그 경로도, 항상 runnable을 켜 이후 스크립트·러너 실행을 기다리게 한다 */
export function recordBashWrite(rec: WrittenRecord, command: string): boolean {
  const { writes, targets } = bashWrites(command)
  if (!writes) return false
  for (const t of targets) recordWrite(rec, t, null, null, false)
  // 로그·메모·임시 폴더로만 쓰는 명령(`pnpm test > out.log`, `| tee run.txt`)은 러너를 막지 않는다 — 대상을 다 알고 전부 그런 곳일 때만
  const harmless = targets.length > 0 && targets.every((t) => /\.(log|txt|md|out)$/i.test(t) || /^\/tmp\//.test(t))
  if (!harmless) rec.runnable = true
  return true
}

/** 직원이 파일을 고쳤다고 기록한다. before·after는 고치기 전·후 내용 (알 수 없으면 null) */
export function recordWrite(rec: WrittenRecord, filePath: string, before: string | null, after: string | null, afterKnown = true) {
  const p = normWrittenPath(filePath)
  if (!p) return
  rec.files.add(p)
  const name = base(p)
  if (/\.(test|spec)\.[^/]+$/.test(name) || /(^|\/)(scripts|__tests__|tests?)\//.test(p)) rec.runnable = true
  if (name === 'package.json') {
    const names = afterKnown ? changedScripts(before, after) : null
    if (!names) rec.allScripts = true
    else for (const n of names) rec.scripts.add(n)
    const vals = afterKnown ? scriptsOf(after) : null
    if (vals) Object.assign(rec.scriptValues, vals)
  } else if (isMakefile(name)) {
    if (!afterKnown) rec.allMake = true
    else {
      const c = changedMakeTargets(before, after)
      if (c.all) rec.allMake = true
      for (const n of c.targets) rec.makeTargets.add(n)
      if (c.first) rec.makeDefault = c.first
    }
  }
  closeScripts(rec)
}

/** 스크립트 값 안의 npm·pnpm·yarn 호출이 부르는 스크립트 이름들. 대상을 특정 못 하면 unknown */
function scriptRefs(value: string, known: Set<string>): { names: string[]; unknown: boolean } {
  const names: string[] = []
  let unknown = /\$\{?npm_execpath/i.test(value)
  for (const part of value.split(/&&|\|\||[;|&\n]/)) {
    const words = part.trim().split(/\s+/).filter((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w))
    if (!words.length) continue
    const runner = base(words[0].replace(/^["']|["']$/g, '')).replace(/\.(cmd|exe)$/i, '').toLowerCase()
    if (!['npm', 'pnpm', 'yarn', 'bun'].includes(runner)) continue
    const rest = words.slice(1).map((w) => w.replace(/^["']|["']$/g, '')).filter((w) => !w.startsWith('-'))
    const hit = rest.map((w) => NPM_BUILTIN_SCRIPTS[w] ?? w).filter((w) => known.has(w) || NPM_BUILTIN_SCRIPTS[w])
    names.push(...hit)
    // 대상이 스크립트 이름도 설치 동사도 아니면(`pnpm exec x`·변수 등) 특정 못 함
    if (!hit.length && !rest.some((w) => INSTALL_VERBS.has(w)) || rest.some((w) => /[$%]/.test(w))) unknown = true
  }
  return { names, unknown }
}

const globRe = (g: string) => new RegExp('(^|/)' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '(.*/)?') + '$')

/** 스크립트 값이 고친 파일의 경로·파일명을 쓰거나 glob(`scripts/*.test.mts`)에 걸리는가 */
function valueTouchesFile(rec: WrittenRecord, value: string): boolean {
  for (const w0 of value.split(/\s+/)) {
    const w = w0.replace(/^["']|["']$/g, '')
    if (!w || w.startsWith('-') && !w.includes('=')) continue
    const word = w.startsWith('-') ? w.slice(w.indexOf('=') + 1) : w
    if (/[*?]/.test(word)) {
      const re = globRe(normWrittenPath(word).replace(/^\//, ''))
      for (const f of rec.files) if (re.test(f)) return true
    } else if (pointsAt(rec, word)) return true
  }
  return false
}

/** 바뀐 스크립트를 값 안에서 부르는 스크립트, 고친 파일을 부르는 스크립트도 영향 대상으로 (고정점 반복) */
function closeScripts(rec: WrittenRecord) {
  const vals = rec.scriptValues
  const known = new Set(Object.keys(vals))
  if (!known.size) return
  for (let changed = true; changed;) {
    changed = false
    for (const [n, v] of Object.entries(vals)) {
      if (rec.scripts.has(n)) continue
      const refs = scriptRefs(v, known)
      if (valueTouchesFile(rec, v) || refs.names.some((r) => scriptAffected(rec, r)) || (refs.unknown && rec.scripts.size > 0)) {
        rec.scripts.add(n)
        changed = true
      }
    }
  }
}

// ── 명령 판정 ─────────────────────────────────────

/** 경로 없이 이름만 써도 그 파일을 실행하는 윈도우 확장자 */
const RUNNABLE_EXT = /\.(cmd|bat|ps1|exe|com|vbs|wsf)$/i
const NPM_RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'bun'])
const NPM_BUILTIN_SCRIPTS: Record<string, string> = { test: 'test', t: 'test', tst: 'test', start: 'start', stop: 'stop', restart: 'restart' }
const INSTALL_LIFECYCLE = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'prepack', 'postpack', 'version', 'preversion', 'postversion']
const INSTALL_VERBS = new Set(['install', 'i', 'ci', 'add', 'update', 'up', 'rebuild', 'link', 'install-test', 'it', 'cit', 'install-ci-test', 'ln', 'version'])
/** 고친 파일을 가리켜도 실행하지 않는 무해한 명령 (읽기·검색·git 기록 등) */
const HARMLESS = new Set(['cat', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ls', 'head', 'tail', 'wc', 'less', 'more', 'file', 'stat', 'diff', 'cmp', 'echo', 'printf', 'which', 'tree', 'nl', 'sort', 'uniq', 'realpath', 'basename', 'dirname', 'shasum', 'md5', 'md5sum', 'sha256sum', 'rm', 'cp', 'mv', 'touch', 'mkdir', 'open', 'code', 'type', 'dir', 'findstr', 'select-string', 'get-content', 'test', '['])
const HARMLESS_GIT = new Set(['add', 'diff', 'status', 'log', 'show', 'blame', 'ls-files', 'rm', 'restore', 'reset', 'commit', 'check-ignore', 'stash', 'mv'])
/** 인자 없이도 고친 테스트를 돌릴 수 있는 테스트 러너 */
const TEST_RUNNERS = new Set(['vitest', 'jest', 'mocha', 'pytest', 'py.test', 'ava', 'tap', 'playwright', 'cypress', 'phpunit', 'rspec', 'tsx', 'ts-node'])
/** PowerShell 인코딩 실행·식 실행 — 실행 내용을 명령줄에서 읽을 수 없다 */
const OPAQUE_EXEC = /^-(e|ec|en|enc|enco|encod|encode|encoded|encodedc|encodedco|encodedcom|encodedcomm|encodedcomma|encodedcomman|encodedcommand)$/i

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
  if (rec.allScripts || rec.scripts.has(name) || rec.scripts.has('pre' + name) || rec.scripts.has('post' + name)) return true
  // 대소문자만 다른 이름도 같은 스크립트로 본다 (대소문자 구분 없는 파일 시스템·러너 대비)
  const l = name.toLowerCase()
  for (const n of rec.scripts) {
    const m = n.toLowerCase()
    if (m === l || m === 'pre' + l || m === 'post' + l) return true
  }
  return false
}

/** 윈도우 실행 방식을 위해 원문과 `\`→`/` 판본을 둘 다 본다 (렉서는 `\`를 이스케이프로 지운다). 더 많이 기다리는 쪽 */
export function writtenWaitReason(rec: WrittenRecord, command: string): ApprovalWaitReason | null {
  if (!command || (!rec.files.size && !rec.scripts.size && !rec.allScripts && !rec.makeTargets.size && !rec.allMake)) return null
  const win = command.replace(/\\/g, '/')
  return scanWritten(rec, command) ?? (win !== command ? scanWritten(rec, win) : null)
}

/** 인자 하나 또는 그 안의 공백으로 나뉜 낱말이 기록된 파일을 가리키는가 (`cmd /c "x.bat a"`, `powershell -Command ".\\x.ps1"`) */
const argPoints = (rec: WrittenRecord, a: string) => pointsAt(rec, a) || (/\s/.test(a) && a.split(/\s+/).some((w) => pointsAt(rec, w)))

/** 인자 모양만으로 실행 내용을 못 믿는 경우: `%VAR%`·`$VAR`·인코딩 실행·iex·`\\?\\` 경로 */
const opaqueArg = (a: string) => /%[^%\s]+%|\$[A-Za-z_{(]/.test(a) || OPAQUE_EXEC.test(a) || /^(iex|invoke-expression)$/i.test(a) || a.includes('//?/') || a.includes('\\\\?\\')

function scanWritten(rec: WrittenRecord, command: string): ApprovalWaitReason | null {
  let buildHit = false
  for (const seg of lexSegments(command)) {
    const { cmd, args } = resolveCommand(seg)
    if (!cmd) continue
    const name = base(cmd).replace(/\.exe$/i, '')
    const lname = name.toLowerCase()
    const npmWords = NPM_RUNNERS.has(lname) ? args.filter((a) => !a.startsWith('-')) : []
    const installOnly = npmWords.length > 0 && npmWords.every((w) => INSTALL_VERBS.has(w))
    const harmless = HARMLESS.has(lname) || (lname === 'git' && HARMLESS_GIT.has(args.find((a) => !a.startsWith('-')) ?? ''))
    // 1) 고친 파일을 직접 실행 (./x · /abs/x · x.cmd) 하거나 다른 명령(러너·인터프리터)의 인자로 넘김 — 무해한 명령만 제외
    if (rec.files.size) {
      if ((cmd.includes('/') || RUNNABLE_EXT.test(cmd)) && pointsAt(rec, cmd)) return 'written-file'
      if (!harmless && args.some((a) => argPoints(rec, a) || (a.startsWith('-') && a.includes('=') && argPoints(rec, a.slice(a.indexOf('=') + 1))))) return 'written-file'
      // 변수·인코딩 실행·iex·`\\?\` 경로는 무엇을 실행하는지 알 수 없다
      if (!harmless && (args.some(opaqueArg) || /^(iex|invoke-expression)$/i.test(lname))) return 'written-file'
      // 고친 파일이 테스트이거나 scripts/ 아래면 스크립트·테스트 러너 실행은 그 파일을 부를 수 있다
      if (rec.runnable && ((NPM_RUNNERS.has(lname) && !installOnly && npmWords.length > 0) || TEST_RUNNERS.has(lname))) return 'written-file'
    }
    // 2) 바뀐 package.json 스크립트 실행
    if ((rec.scripts.size || rec.allScripts) && NPM_RUNNERS.has(lname)) {
      const words = npmWords
      const hits =
        words.some((w) => scriptAffected(rec, NPM_BUILTIN_SCRIPTS[w] ?? w)) ||
        (!installOnly && words.some((w) => w.includes('/'))) ||
        (words.some((w) => INSTALL_VERBS.has(w)) && INSTALL_LIFECYCLE.some((n) => scriptAffected(rec, n))) ||
        // 인자 없는 `yarn`은 설치
        (lname === 'yarn' && words.length === 0 && INSTALL_LIFECYCLE.some((n) => scriptAffected(rec, n)))
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
