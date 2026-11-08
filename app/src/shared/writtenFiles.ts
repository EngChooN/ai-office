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
  /** 대상 위치를 다 알 수 없는 쓰기(Bash 등)가 있었다 — 상위 폴더 기록이라도 하위 폴더 전체에 적용한다 */
  unplaced: boolean
}

export const emptyWritten = (): WrittenRecord => ({ files: new Set(), scripts: new Set(), allScripts: false, makeTargets: new Set(), allMake: false, makeDefault: '', scriptValues: {}, runnable: false, unplaced: false })

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
export function bashWrites(command: string, depth = 0): { writes: boolean; targets: string[] } {
  const targets: string[] = []
  let writes = false
  const unknownTarget = (t: string) => /[$`*?]/.test(t)
  for (const seg of lexSegments(command)) {
    const toks = seg.tokens.filter((t) => t !== '')
    for (let k = 0; k < toks.length; k++) {
      // 낱말 안 어디서든 `>`를 본다 (echo x>file) — `=>`·`->`·`<<`·`>(`는 제외
      const m = /^(?:[^<>=-]|[^<>]*[^<>=\s-])??(?:\d*|&)(?:>>|>\||>&|>|&>>|&>)(?![(])(.*)$/.exec(toks[k]) ?? REDIRECT_OUT.exec(toks[k])
      if (!m) continue
      const t = m[m.length - 1] || toks[k + 1] || ''
      if (/^(\d+|-|&\d*)$/.test(t) || t.startsWith('/dev/')) continue
      writes = true
      if (t && !unknownTarget(t)) targets.push(t)
    }
    const { cmd, args } = resolveCommand(seg)
    if (!cmd) continue
    const name = base(cmd).toLowerCase()
    const pos = args.filter((a) => !a.startsWith('-') && !/^\d*<|^<</.test(a)).map((a) => a.replace(/^of=/, ''))
    const hasFlag = (re: RegExp) => args.some((a) => re.test(a))
    // 셸 -c: 안의 문자열을 다시 검사한다
    if (['bash', 'sh', 'zsh', 'dash', 'ksh'].includes(name)) {
      const i = args.findIndex((a) => /^-[A-Za-z]*c/.test(a))
      if (i >= 0 && args[i + 1] !== undefined && depth < 4) {
        const inner = bashWrites(args[i + 1], depth + 1)
        if (inner.writes) writes = true
        targets.push(...inner.targets)
      } else if (i >= 0) writes = true
      continue
    }
    // 인터프리터 한 줄·표준입력(heredoc): 무엇을 쓰는지 알 수 없어 쓰기로 본다. `node a.js` 같은 파일 실행은 기존 규칙이 본다
    if (/^(python[\d.]*|node|nodejs|deno|bun|ruby|perl|php)$/.test(name)) {
      const inline = hasFlag(/^-[A-Za-z]*[ecpi]$|^-[A-Za-z]*[ei]|^--(eval|print)$/) && !hasFlag(/^-m$/)
      if (inline || (args.includes('-') || (pos.length === 0 && !hasFlag(/^(-[Vvm]|--version|--help)$/)))) writes = true
      continue
    }
    if (name === 'curl') {
      if (hasFlag(/^-[A-Za-z]*[oO]|^--(output|remote-name)/)) writes = true
      for (let k = 0; k < args.length; k++) if (/^-[A-Za-z]*o$|^--output$/.test(args[k]) && args[k + 1] && !unknownTarget(args[k + 1])) targets.push(args[k + 1])
      continue
    }
    if (name === 'wget') {
      writes = true
      for (let k = 0; k < args.length; k++) if (/^-[A-Za-z]*O$|^--output-document$/.test(args[k]) && args[k + 1] && !unknownTarget(args[k + 1])) targets.push(args[k + 1])
      continue
    }
    if (name === 'sed' && !hasFlag(/^-[A-Za-z]*[iI]|^--in-place/)) continue // sed -i 만 쓰기
    if ((name === 'sort' || name === 'base64') && !hasFlag(/^-[A-Za-z]*o|^--output/)) continue
    if ((name === 'tar' && !hasFlag(/^-?[A-Za-z]*x|^--extract|^-[A-Za-z]*c|^--create/)) || (name === 'unzip' && hasFlag(/^-[A-Za-z]*[lpvt]/))) continue
    if (name === 'npm' || name === 'pnpm' || name === 'yarn') {
      if (pos[0] === 'pkg' && (pos[1] === 'set' || pos[1] === 'delete' || pos[1] === 'fix')) (writes = true), targets.push('package.json')
      continue
    }
    if (name === 'git') {
      const sub = pos[0]
      // checkout -b·stash list/show 는 작업 파일을 바꾸지 않는다 (결재 과다 방지)
      if (sub === 'apply' || sub === 'am' || sub === 'restore') writes = true
      else if (sub === 'checkout' && !hasFlag(/^-[bB]$|^--orphan/)) writes = true
      else if (sub === 'stash' && !['list', 'show'].includes(pos[1] ?? '')) writes = true
      continue
    }
    if (!BASH_WRITERS.has(name)) continue
    writes = true
    targets.push(...(LAST_ARG.has(name) ? pos.slice(-1) : pos).filter((a) => !unknownTarget(a)))
  }
  return { writes, targets }
}

/** 자동 허용된 Bash 쓰기를 기록한다 — 경로를 뽑으면 그 경로도, 항상 runnable을 켜 이후 스크립트·러너 실행을 기다리게 한다 */
export function recordBashWrite(rec: WrittenRecord, command: string): boolean {
  const { writes, targets } = bashWrites(command)
  if (!writes) return false
  for (const t of targets) recordWrite(rec, t, null, null, false)
  // 로그·메모·임시 폴더로만 쓰는 명령(`pnpm test > out.log`, `| tee run.txt`)은 러너를 막지 않는다 — 대상을 다 알고 전부 그런 곳일 때만
  const harmless = targets.length > 0 && targets.every((t) => /\.(log|txt|md|out)$/i.test(t) || normWrittenPath(t).startsWith('/tmp/'))
  if (!harmless) rec.runnable = rec.unplaced = true
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
  // `../a/x.mts`는 작업 폴더를 몰라도 `a/x.mts`로 끝나는 기록과 맞춘다 (더 기다리는 쪽)
  const tail = n.replace(/^(\.\.\/)+/, '')
  if (!tail || tail === '..') return false
  for (const f of rec.files) if (f === tail || f.endsWith('/' + tail)) return true
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
  if (!command || (!rec.files.size && !rec.scripts.size && !rec.allScripts && !rec.makeTargets.size && !rec.allMake && !rec.runnable)) return null
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
    }
    // 파일을 특정 못 한 쓰기(Bash 등)도 runnable이면 스크립트·테스트 러너 실행은 기다린다
    if (rec.runnable && ((NPM_RUNNERS.has(lname) && !installOnly && npmWords.length > 0) || TEST_RUNNERS.has(lname))) return 'written-file'
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

/** 폴더당 고친 파일 기록 상한 — 넘으면 러너 실행을 기다린다 */
export const WRITTEN_FILES_MAX = 500

/** 여러 패키지를 돌리는 모노레포 러너 */
const MONO_RUNNERS = new Set(['turbo', 'nx', 'lerna', 'rush', 'rushx', 'moon', 'wireit', 'ultra'])
/** 다른 폴더를 대상으로 실행하는 옵션 (npm·pnpm·yarn·make) */
const DIR_FLAG = /^(-C|--prefix|--dir|--cwd|--directory|-w|--workspaces?|-ws|-r|--recursive|--filter|-F|-g|--global|--include-workspace-root)(=|$)|^-C./
/**
 * 명령이 작업 폴더 밖을 대상으로 러너를 돌릴 수 있는가 — `cd`·`pushd`, `-C`·`--prefix`·`-r` 같은 폴더 옵션,
 * `npm_config_*` 대입, 모노레포 러너, 아무 명령 인자의 절대·상위·홈 경로. 그러면 모든 폴더의 기록을 합쳐 본다
 */
export function movesDir(command: string): boolean {
  for (const seg of lexSegments(command.replace(/\\/g, '/'))) {
    const { cmd, args, assigns, via } = resolveCommand(seg)
    if (via.some((v) => base(v).toLowerCase() === 'env') && seg.tokens.some((t) => /^-[A-Za-z]*C/.test(t))) return true
    if (assigns.some((a) => /^npm_config_|^(pwd|init_cwd)=/i.test(a))) return true
    if (!cmd) continue
    const lname = base(cmd).replace(/\.(exe|cmd)$/i, '').toLowerCase()
    if (lname === 'cd' || lname === 'pushd' || lname === 'popd') return true
    if (seg.tokens.some((t) => /^--chdir(=|$)/.test(t))) return true
    // 셸 -c 안의 문자열도 본다
    if (['bash', 'sh', 'zsh', 'dash', 'ksh'].includes(lname)) {
      const i = args.findIndex((a) => /^-[A-Za-z]*c/.test(a))
      if (i >= 0 && (args[i + 1] === undefined || movesDir(args[i + 1]))) return true
      continue
    }
    // 모노레포 러너는 다른 패키지를 돌린다
    if (MONO_RUNNERS.has(lname)) return true
    // find -exec·-execdir 뒤 명령도 본다
    const ex = args.findIndex((a) => /^-(exec|execdir|ok|okdir)$/.test(a))
    if (lname === 'find' && ex >= 0 && movesDir(args.slice(ex + 1).filter((a) => a !== ';' && a !== '+').join(' '))) return true
    // 어떤 명령이든 절대·홈·상위 경로 인자는 다른 폴더 파일을 가리킬 수 있다 (`node /repo/scripts/e.mts`)
    if (args.some((a) => /^(\/|~|\.\.(\/|$))|=(\/|~|\.\.)/.test(a) || a.includes('/../'))) return true
    if ((NPM_RUNNERS.has(lname) || TEST_RUNNERS.has(lname) || ['make', 'gmake', 'npx', 'pnpx', 'bunx'].includes(lname)) && args.some((a) => DIR_FLAG.test(a))) return true
  }
  return false
}

/** 두 폴더 키가 같거나 한쪽이 다른 쪽 안에 있는가 (`/` 루트는 모든 절대 경로의 조상) */
const nested = (a: string, b: string) => a === b || a.startsWith(b === '/' ? '/' : b + '/') || b.startsWith(a === '/' ? '/' : a + '/')

/** 작업 폴더(정규화 경로) 단위 기록 보관소 — 업무·직원이 바뀌어도, 시간이 지나도 비우지 않는다 (만료가 곧 우회) */
export class WrittenStore {
  private byFolder = new Map<string, WrittenRecord>()
  /** resolve: 폴더 실경로 풀이 (심볼릭 링크·macOS `/tmp`→`/private/tmp`). 메인 프로세스가 realpath를 넘긴다 */
  private resolve: (cwd: string) => string
  constructor(resolve: (cwd: string) => string = (c) => c) {
    this.resolve = resolve
  }
  key(cwd: string) {
    let p = cwd
    try {
      p = this.resolve(cwd)
    } catch {
      // 없는 폴더 등은 원래 경로로
    }
    return normWrittenPath(p)
  }
  /** 같은 폴더와 상위·하위 폴더의 기록을 합쳐 본다 — 모노레포에서 `/repo` 직원이 고친 `app/package.json`을 `/repo/app` 직원이 실행해도 기다리게.
   *  다른 폴더 기록의 상대 경로는 그 폴더 기준 절대 경로로 풀어 합친다 (더 기다리는 쪽) */
  get(cwd: string, command = ''): WrittenRecord | undefined {
    const k = this.key(cwd)
    const all = command !== '' && movesDir(command)
    const abs = (f: string, p: string) => (p.startsWith('/') || !f.startsWith('/') ? p : normWrittenPath(f + '/' + p))
    const under = (p: string, d: string) => p === d || p.startsWith(d === '/' ? '/' : d + '/')
    // 이 폴더 안의 파일이거나, 이 폴더까지 오는 길목 폴더에 바로 놓인 파일(상위 package.json·Makefile·설정 — npm은 위로 올라가며 찾는다)
    const relevant = (p: string) => under(p, k) || under(k, p.slice(0, p.lastIndexOf('/')) || '/')
    // 상위 폴더 기록은 관련 파일이 있거나 위치 불명 쓰기가 있을 때만 — 홈 폴더 직원이 proj1을 고쳐도 proj2는 기다리지 않게.
    // 명령이 다른 폴더로 옮겨 가면(cd·-C·--prefix 등) 모든 폴더의 기록을 본다
    const hits = [...this.byFolder].filter(([f, r]) => all || (nested(f, k) && (under(f, k) || r.unplaced || [...r.files].some((p) => relevant(abs(f, p))))))
    if (!hits.length) return undefined
    if (hits.length === 1 && hits[0][0] === k) return hits[0][1]
    const m = emptyWritten()
    for (const [f, r] of hits) {
      for (const p of r.files) m.files.add(abs(f, p))
      for (const s of r.scripts) m.scripts.add(s)
      for (const t of r.makeTargets) m.makeTargets.add(t)
      m.allScripts ||= r.allScripts
      m.allMake ||= r.allMake
      m.runnable ||= r.runnable
      m.unplaced ||= r.unplaced
      // 기본 타깃이 폴더마다 다를 수 있다 — 바뀐 Makefile이 둘 이상이면 `make`만 써도 기다린다
      if (r.makeDefault) {
        if (m.makeDefault && m.makeDefault !== r.makeDefault) m.allMake = true
        m.makeDefault = r.makeDefault
      }
      Object.assign(m.scriptValues, r.scriptValues)
    }
    return m
  }
  /** 고친 파일의 절대 경로를 쓴 그대로와 실경로 둘 다 돌려준다 — 폴더 키는 실경로(`/private/tmp/…`)인데 직원은 `/tmp/…`로 쓰기도 해서.
   *  둘 다 기록하면 실경로 폴더 비교와 명령 글자 비교가 모두 맞는다 */
  aliases(filePath: string): string[] {
    const p = normWrittenPath(filePath)
    if (!p.startsWith('/')) return [filePath]
    // 아직 없는 폴더에 새 파일을 쓰기도 한다(Write가 폴더를 만든다) — 있는 가장 가까운 조상까지 올라가 풀고 나머지를 붙인다
    let dir = p
    let tail = ''
    let real = ''
    while (dir !== '/' && dir !== '') {
      const i = dir.lastIndexOf('/')
      tail = dir.slice(i) + tail
      dir = dir.slice(0, i) || '/'
      try {
        real = normWrittenPath(this.resolve(dir).replace(/\/+$/, '') + tail)
        break
      } catch {
        // 없는 폴더 — 한 단계 위로
      }
    }
    return real && real !== p ? [filePath, real] : [filePath]
  }
  /** 기록을 꺼내거나 새로 만든다 (상한을 넘으면 보수적으로 runnable) */
  rec(cwd: string): WrittenRecord {
    const k = this.key(cwd)
    let r = this.byFolder.get(k)
    if (!r) this.byFolder.set(k, (r = emptyWritten()))
    if (r.files.size > WRITTEN_FILES_MAX) r.runnable = true
    return r
  }
}
