// 자동결재(대표 부재 중): 결재 요청을 대신 판정하는 규칙과 켜 둔 기간 계산 — electron 없이 테스트한다
// 대표 결정(2026-10-23): 위험 명령을 뺀 전부 자동 승인. 위험 명령(RISKY_BASH)과 푸시·외부 전송은 대표를 기다린다

import { findRiskyCommand } from './bashPolicy.ts'
import { browserVerdict } from './browserTools.ts'
import { computerVerdict } from './computerTools.ts'
import { base, gitSubcommand, lexSegments, resolveCommand, type Segment } from './commandScan.ts'
import { t } from './i18n/index.ts'

export type AutoVerdict = 'allow' | 'wait'
/** 요약에 쓰는 종류: 파일 수정·명령·그 밖 */
export type AutoKind = 'edit' | 'command' | 'other'

/** 기간 고르기: 지금부터 N시간 · 매일 시간대(HH:MM–HH:MM, 자정을 넘겨도 됨) · 끄기 */
export interface AutoApprovePlan {
  mode: 'off' | 'hours' | 'daily'
  /** mode 'hours': 1·4·8·12 */
  hours?: number
  /** mode 'daily': 예 '23:00' → '08:00' */
  start?: string
  end?: string
  /** '완전 자율' 단계: 기간 동안 모든 고용 직원이 묻지 않고 끝까지 (위험 작업은 건너뛰고 보고). 없으면 지금 설정을 따른다 */
  isFull?: boolean
}

/** 저장하는 설정 (hours는 끝나는 시각으로 바꿔 둔다 — 앱을 다시 켜도 그 시각에 끝난다) */
export type AutoApproveConfig = ({ mode: 'off' } | { mode: 'hours'; until: number } | { mode: 'daily'; start: string; end: string }) & {
  /** '완전 자율' 단계 (꺼져 있을 때도 다음에 켤 단계로 남는다) */
  isFull?: boolean
}

export const AUTO_HOURS = [1, 4, 8, 12] as const
export const AUTO_DAILY_DEFAULT = { start: '23:00', end: '08:00' }
/** 대표 부재 중 질문에 하는 답 (비서가 생기기 전까지) */
export const AWAY_ANSWER = '대표 부재 중, 알아서 판단하고 진행'

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

// ── 명령 판정 (낱말로 나눠 본다 — commandScan) ────────────────────

/** 파일·인라인 코드·표준입력으로 임의 코드를 실행하는 인터프리터 */
const INTERPRETERS = new Set(['bash', 'sh', 'zsh', 'ksh', 'dash', 'fish', 'csh', 'tcsh', 'python', 'python2', 'python3', 'pypy', 'node', 'nodejs', 'deno', 'ruby', 'perl', 'php', 'osascript', 'Rscript', 'lua', 'tclsh', 'tsx', 'ts-node'])
const INLINE_CODE_FLAGS = new Set(['-c', '-e', '--eval', '--command', '--exec'])
/** 하위 명령으로 판정하는 빌드 래퍼 (배포·게시만 기다리고 빌드·테스트는 허용) */
const BUILD_WRAPPERS = new Set(['make', 'gradle', 'gradlew', 'mvn', 'mvnw', 'rake'])
// npm·pnpm·yarn·bun 의 설치·갱신 별칭 (오타 별칭 포함)
const PKG_INSTALL_WORDS = new Set(['install', 'i', 'in', 'ins', 'inst', 'insta', 'instal', 'isnt', 'isnta', 'isntal', 'isntall', 'add', 'a', 'update', 'up', 'upgrade', 'udpate', 'upd', 'upda', 'updat', 'upg', 'upgr', 'upgra', 'upgrad', 'install-test', 'it'])
// 값을 따로 받는 옵션 (--filter web 의 web 을 패키지 이름으로 보지 않게). -w·--workspace 는 npm 만 값을 받고 pnpm 은 값 없는 옵션이다
const PKG_OPT_WITH_VALUE = new Set(['--filter', '-F', '--registry', '--prefix', '--cwd', '--dir', '-C', '--tag', '--loglevel', '--cache', '--omit', '--include', '--otp', '--scope', '--fetch-retries', '--network-timeout', '--cpu', '--os', '--libc', '--location'])
const NPM_ONLY_VALUE = new Set(['--workspace', '-w'])
/** 설치가 아닌 것이 확실한 하위 명령 — 이 밖의 알 수 없는 하위 명령 뒤에 설치 낱말이 있으면 옵션 값을 잘못 읽었을 수 있어 기다린다 */
const PKG_PLAIN_SUBS = new Set(['run', 'run-script', 'rum', 'urn', 'test', 't', 'tst', 'start', 'stop', 'restart', 'ci', 'ls', 'list', 'll', 'la', 'outdated', 'view', 'pack', 'rebuild', 'prune', 'dedupe', 'audit', 'why', 'version', 'help', 'build', 'dev', 'lint', 'cache', 'config', 'get', 'root', 'bin', 'prefix', 'whoami', 'ping', 'doctor', 'fund', 'search', 'info'])
const isGlobalFlag = (a: string) => a === '--global' || a === '--global=true' || /^--g(l(o(b(a(l)?)?)?)?)?(=true)?$/.test(a) || /^-[A-Za-z]*g[A-Za-z]*$/.test(a) || a === '--location=global'
function installsPackages(args: string[], pm = 'npm'): boolean {
  const dd = args.indexOf('--')
  const head = dd === 0 ? args.slice(1) : args // npm -- install lodash: 앞의 -- 는 건너뛴다
  const dd2 = head.indexOf('--')
  const words = dd2 < 0 ? head : head.slice(0, dd2)
  const takesValue = (a: string) => PKG_OPT_WITH_VALUE.has(a) || (pm === 'npm' && NPM_ONLY_VALUE.has(a))
  if (words.some(isGlobalFlag)) return true // 전역 설치
  const loc = words.indexOf('--location')
  if (loc >= 0 && words[loc + 1] === 'global') return true
  let at = -1
  for (let k = 0; k < words.length; k++) {
    if (words[k].startsWith('-')) { if (takesValue(words[k])) k++ } else { at = k; break }
  }
  if (at < 0) return false
  const sub = words[at]
  if (/[$`]/.test(sub)) return true // 하위 명령이 변수·치환이면 무엇인지 확정할 수 없다
  if (sub === 'global' && words.slice(at + 1).some((a) => ['add', 'upgrade', 'install'].includes(a))) return true // yarn global add
  if (!PKG_INSTALL_WORDS.has(sub)) {
    // 알 수 없는 옵션이 값을 받았을 가능성: 뒤에 설치 낱말이 있으면 기다린다
    return !PKG_PLAIN_SUBS.has(sub) && words.slice(at + 1).some((a) => PKG_INSTALL_WORDS.has(a))
  }
  if (dd2 >= 0 && head.slice(dd2 + 1).some((a) => !a.startsWith('-'))) return true // npm i -- pkg
  for (let k = at + 1; k < words.length; k++) {
    if (takesValue(words[k])) k++
    else if (!words[k].startsWith('-')) return true
  }
  return false
}

const PKG = new Set(['npm', 'pnpm', 'yarn', 'bun', 'npx', 'pnpx', 'bunx'])
/** 호스트에 붙는 전송 도구 — 쓰면 기다린다 */
const NET_SENDERS = new Set(['ssh', 'scp', 'sftp', 'telnet', 'nc', 'ncat', 'netcat', 'socat', 'rclone'])
const CLOUD = new Set(['vercel', 'netlify', 'firebase', 'fly', 'flyctl', 'wrangler', 'heroku', 'serverless', 'sls', 'eb', 'amplify', 'surge'])
const MAIL = new Set(['sendmail', 'mail', 'mailx', 'mutt'])
const DNS = new Set(['nslookup', 'host', 'dig'])
/** 배포·게시·푸시·올리기 하위 명령 (빌드 래퍼·패키지 매니저 run 대상) */
const OUTBOUND_VERBS = new Set(['deploy', 'publish', 'push', 'release', 'upload'])

/** 확장 문자(중괄호·glob) — 명령 이름·하위 명령에 있으면 실제로 무엇이 실행될지 알 수 없다 */
const hasExpansion = (s: string) => /[{}*?[\]]/.test(s)
/** 이 목록의 명령은 하위 명령을 보고 판정하므로 하위 명령 자리의 확장 문자도 막는다 */
const SUBCOMMAND_TOOLS = new Set(['git', 'gh', 'glab', 'docker', 'docker-compose', 'kubectl', 'helm', 'terraform', 'aws', 'gsutil', 'cargo', 'gem', 'twine', 'poetry', 'flit', 'pod', 'fastlane', 'make', ...['gradle', 'gradlew', 'mvn', 'mvnw', 'rake'], ...['npm', 'pnpm', 'yarn', 'bun', 'npx', 'pnpx', 'bunx']])
/** xargs 뒤에 올 수 있는 읽기 전용 명령 (그 밖은 인자로 하위 명령이 만들어질 수 있어 기다린다) */
const XARGS_SAFE = new Set(['echo', 'cat', 'ls', 'grep', 'egrep', 'fgrep', 'rg', 'wc', 'head', 'tail', 'file', 'stat', 'basename', 'dirname', 'du', 'sort', 'uniq', 'diff', 'md5', 'md5sum', 'shasum', 'sha256sum', 'cksum', 'realpath', 'readlink', 'printf'])
/** 알고 있는 안전한 명령 — 목록에 없는 명령(xcrun·arch·script·su·parallel·entr …)은 무엇을 실행할지 몰라 기다린다 (fail closed) */
const SAFE_COMMANDS = new Set([
  'ls', 'cat', 'echo', 'printf', 'pwd', 'cd', 'pushd', 'popd', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'tr', 'tee', 'sed', 'awk', 'gawk', 'diff', 'cmp', 'comm', 'paste', 'column', 'fold', 'nl', 'rev', 'tac', 'jq', 'yq', 'xxd', 'od', 'hexdump', 'strings',
  'file', 'stat', 'du', 'df', 'ps', 'pgrep', 'date', 'uname', 'whoami', 'id', 'hostname', 'which', 'type', 'whereis', 'basename', 'dirname', 'realpath', 'readlink', 'tree', 'less', 'more', 'man', 'help', 'history', 'clear', 'cal', 'bc', 'expr', 'seq', 'printenv', 'tput', 'lsof', 'netstat', 'ping', 'mdfind', 'pbcopy', 'pbpaste',
  'mkdir', 'touch', 'cp', 'mv', 'ln', 'chmod', 'rm', 'rmdir', 'mktemp', 'true', 'false', 'test', '[', '[[', 'export', 'unset', 'set', 'read', 'sleep', 'wait', 'exit', 'return', 'break', 'continue', 'shift', 'local', 'declare', 'typeset', 'readonly', 'umask', 'ulimit', 'unalias', 'sw_vers',
  'tar', 'zip', 'unzip', 'gzip', 'gunzip', 'bzip2', 'xz', 'zcat', 'base64', 'md5', 'md5sum', 'shasum', 'sha256sum', 'cksum', 'iconv', 'split', 'patch', 'sqlite3', 'brew', 'ffmpeg', 'kill', 'pkill', 'killall',
  'tsc', 'eslint', 'prettier', 'vitest', 'jest', 'mocha', 'playwright', 'vite', 'webpack', 'esbuild', 'next', 'nuxt', 'biome', 'turbo', 'nx', 'electron', 'electron-forge', 'go', 'rustc', 'rustup', 'pip', 'pip3', 'pipx', 'uv', 'bundle', 'java', 'javac', 'kotlinc', 'swift', 'swiftc', 'dotnet', 'ruff', 'pytest', 'mypy', 'black', 'adb', 'gradle',
])
/** 판정 규칙이 따로 있는 명령(하위 명령·옵션을 보고 정한다)도 아는 명령이다 */
const RULE_COMMANDS = new Set(['nvm', 'xcrun', 'find', 'rsync', 'git', 'curl', 'wget', 'http', 'https', 'xh', 'gh', 'glab', 'docker', 'docker-compose', 'kubectl', 'helm', 'terraform', 'aws', 'gsutil', 'cargo', 'gem', 'twine', 'poetry', 'flit', 'pod', 'fastlane', 'open', 'nslookup', 'host', 'dig'])
const isKnownCommand = (name: string) =>
  SAFE_COMMANDS.has(name) || RULE_COMMANDS.has(name) || BUILD_WRAPPERS.has(name) || PKG.has(name) || INTERPRETERS.has(name) || NET_SENDERS.has(name) || CLOUD.has(name) || MAIL.has(name) || DNS.has(name)

/** `git -c key=값`으로 안전하게 넘길 수 있는 설정 키 (색·사용자·표시 옵션). 이 밖의 키는 명령 실행으로 이어질 수 있어 기다린다 */
const GIT_SAFE_CONFIG = /^(color\.[a-z0-9.-]+|user\.(name|email|signingkey)|core\.(quotepath|autocrlf|safecrlf|whitespace|abbrev|filemode|ignorecase|precomposeunicode|longpaths|untrackedcache)|advice\.[a-z.]+|init\.defaultbranch|pull\.(rebase|ff)|push\.(default|followtags|autosetupremote)|merge\.(ff|conflictstyle)|diff\.(algorithm|colormoved|renames|context)|log\.(date|abbrevcommit)|status\.[a-z.]+|fetch\.prune|branch\.sort|column\.ui|help\.autocorrect)$/i
/** `git config 키`로 건드리면 명령이 실행되는 키 (별칭·pager·editor·훅·외부 diff·필터·자격 증명 등) */
const GIT_RISKY_KEY = /^(alias\.|core\.(sshcommand|pager|editor|fsmonitor|hookspath|askpass|gitproxy|attributesfile)|credential|include|url\.|protocol\.|pager\.|diff\.([^.]+\.)?(external|textconv|command)|merge\.[^.]+\.(driver|recursivedriver)|filter\.|gpg\.([^.]+\.)?program|sequence\.editor|browser\.|web\.browser|difftool\.|mergetool\.|man\.|sendemail\.|receive\.|uploadpack\.|ssh\.|trailer\.|interactive\.difffilter|format\.pager|remote\.[^.]+\.(uploadpack|receivepack|vcs|proxy)|submodule\.[^.]+\.update|core\.alternaterefscommand|core\.alternaterefsprefixes|core\.worktree)/i

const GIT_CONFIG_READ_FLAGS = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', '-l', '--list', '--get-color', '--get-colorbool', '--show-origin', '--show-scope', '--name-only'])
const GIT_CONFIG_WRITE_FLAGS = new Set(['--add', '--replace-all', '--unset', '--unset-all', '--rename-section', '--remove-section', '-e', '--edit', 'set', 'unset', 'edit'])
const GIT_CONFIG_VALUE_FLAGS = new Set(['-f', '--file', '--blob', '--default', '--type', '--comment'])
/** `git config`: 위험 키를 건드리거나, 값을 쓰는데 안전 키가 아니면 true. 읽기(--get·--list·키 하나)는 위험 키가 아니면 통과 */
function gitConfigWaits(rest: string[]) {
  const pos: string[] = []
  for (let k = 0; k < rest.length; k++) {
    const a = rest[k]
    if (a.startsWith('-')) {
      if (GIT_CONFIG_VALUE_FLAGS.has(a)) k++
    } else pos.push(a)
  }
  if (pos.some((a) => GIT_RISKY_KEY.test(a))) return true
  if (rest.some((a) => a === '-e' || a === '--edit' || a === 'edit')) return true
  const reading = rest.some((a) => GIT_CONFIG_READ_FLAGS.has(a))
  const writing = rest.some((a) => GIT_CONFIG_WRITE_FLAGS.has(a)) || pos.length >= 2
  if (!writing || reading) return false
  const key = pos[0] === 'set' || pos[0] === 'unset' ? pos[1] : pos[0]
  return !GIT_SAFE_CONFIG.test(key ?? '')
}

const GIT_GLOBAL_BAD = ['git-dir', 'work-tree', 'config-env', 'bare']
/** 하위 명령 어디서든 외부 프로그램을 실행하게 하는 옵션 */
const GIT_EXEC_OPTS = ['upload-pack', 'receive-pack', 'exec', 'upload-archive', 'extcmd', 'exec-path']
/** git 전역 옵션 `-c`가 안전 목록 밖의 키이거나 `--config-env`가 있는가 */
function gitRunsConfigCommand(args: string[]) {
  const safe = (kv: string) => GIT_SAFE_CONFIG.test(kv.split('=')[0])
  for (let i = 0; i < args.length && args[i].startsWith('-'); i++) {
    const a = args[i]
    // 저장소 위치·실행 경로·bare 를 바꾸면 방금 만든(설정을 심은) 디렉터리가 저장소로 쓰인다 (줄임말 --git-d·--work-t·--config-e·--bar 포함)
    if (isLongOpt(a, GIT_GLOBAL_BAD)) return true
    if (a === '-c') {
      if (!safe(args[i + 1] ?? '')) return true
      i++
    } else if (a.startsWith('-c') && a.length > 2 && !a.startsWith('--') && !safe(a.slice(2))) return true
    else if (['-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix'].includes(a)) i++
  }
  return false
}

/** 환경 변수 대입 중 다른 프로그램·설정을 실행하게 만드는 것 (GIT_CONFIG_*·LESSOPEN·PAGER·EDITOR·LD_PRELOAD …) */
const DANGEROUS_NAME = /^(GIT_[A-Za-z0-9_]*|LESSOPEN|LESSCLOSE|PAGER|MANPAGER|EDITOR|VISUAL|BASH_ENV|ENV|LD_[A-Z_]+|DYLD_[A-Z_]+|NODE_OPTIONS|PYTHONSTARTUP|PERL5OPT|RUBYOPT|PROMPT_COMMAND|HOME|XDG_[A-Za-z0-9_]*|PS[1-4]|PROMPT[A-Za-z0-9_]*|OLDPWD|PWD|[nN][pP][mM]_[cC][oO][nN][fF][iI][gG]_[A-Za-z0-9_]*|SHELL|ZDOTDIR|MAKE[A-Z]*|MFLAGS|GNUMAKEFLAGS)$/
const DANGEROUS_ENV = new RegExp(`${DANGEROUS_NAME.source.slice(0, -2)})\\+?=`)
/** 실행될 프로그램을 찾는 경로 변수 (zsh 소문자 포함) */
const PATH_NAME = /^(PATH|CDPATH|FPATH|path|cdpath|fpath|module_path)$/
/** PATH에 더해도 되는 항목: `$PATH` 자체, nvm node bin, 흔한 시스템 bin, 프로젝트 node_modules/.bin (글자 그대로일 때만) */
const SAFE_PATH_ITEM = /^(\$PATH|\$\{PATH\}|\/opt\/homebrew\/bin|\/usr\/local\/bin|\/usr\/bin|\/bin)$/
const NVM_PATH_ITEM = /^(?:\$HOME|\$\{HOME\}|~)\/\.nvm\/versions\/node\/(v\d+(?:\.\d+)*)\/bin$/
/** `~/.nvm/versions/node/` 아래에 실제로 설치된 버전 폴더 이름들. 읽을 수 없으면(렌더러 등) null — 그러면 nvm 경로는 믿지 않는다 */
let nvmVersionsOverride: string[] | null = null
export const setInstalledNodeVersions = (v: string[] | null) => {
  nvmVersionsOverride = v
}
function installedNodeVersions(): string[] | null {
  if (nvmVersionsOverride) return nvmVersionsOverride
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined>; getBuiltinModule?: (id: string) => unknown } }).process
    const fs = proc?.getBuiltinModule?.('node:fs') as { readdirSync(p: string): string[] } | undefined
    const home = proc?.env?.HOME
    return fs && home ? fs.readdirSync(`${home}/.nvm/versions/node`) : null
  } catch {
    return null
  }
}
const nvmItemOk = (x: string) => {
  const m = NVM_PATH_ITEM.exec(x)
  return !!m && !!installedNodeVersions()?.includes(m[1])
}
const PATH_SELF = /^(\$PATH|\$\{PATH\})$/
/** 프로젝트가 쓸 수 있는 `./node_modules/.bin`은 기존 `$PATH` 뒤에 붙일 때만 (맨 앞에 두면 가짜 git 이 먼저 실행된다) */
const pathValueOk = (v: string) => {
  let seenSelf = false
  for (const x of v.split(':')) {
    if (PATH_SELF.test(x)) seenSelf = true
    else if (x === './node_modules/.bin' ? !seenSelf : !(SAFE_PATH_ITEM.test(x) || nvmItemOk(x))) return false
  }
  return true
}
/**
 * 값의 `$PATH`·`$HOME`·`~`가 진짜 확장인가 — tokens 는 따옴표·이스케이프를 벗긴 글이라 `'$PATH'`·`\$PATH`·`$'$PATH'`도 `$PATH`로 보인다.
 * 원문에서 `PATH=` 뒤 값을 다시 보아 작은따옴표·역슬래시가 있으면(글자 그대로일 수 있다) 믿지 않고, `~`는 따옴표 없이 쓴 것만 인정한다
 */
const pathExpansionsReal = (value: string, raw: string) => {
  if (!/[$~]/.test(value)) return true
  const raws = [...raw.matchAll(/\bPATH\+?=([^\s;&|]*)/g)].map((m) => m[1])
  if (!raws.length) return false
  return raws.every((r) => !/['\\]/.test(r) && !(r.includes('~') && r.includes('"')) && !r.includes('$"'))
}
const ASSIGN_TOK = /^([A-Za-z_][A-Za-z0-9_]*)(\[[^\]]*\])?(\+?)=([\s\S]*)$/
/** 인자로 `이름=값`을 받아 변수를 만드는 내장 명령 */
const ASSIGN_CMDS = new Set(['export', 'declare', 'typeset', 'local', 'readonly'])
interface Assignment {
  name: string
  value: string
  /** 명령 앞의 임시 환경 변수 (`i=5 cmd`) — 현재 셸의 변수가 아니다 */
  temp: boolean
  /** `이름[첨자]=값` — 배열 원소 대입도 산술에서 그 이름을 읽을 때 값을 바꾼다 */
  subscripted?: boolean
}
/** 토막에서 변수에 값을 넣는 곳: 명령 앞 대입과 export·declare 등의 `이름=값` 인자 */
function assignmentsOf(r: ReturnType<typeof resolveCommand>): Assignment[] {
  const out: Assignment[] = []
  for (const a of r.assigns) {
    const m = ASSIGN_TOK.exec(a)
    if (m) out.push({ name: m[1], value: m[4], temp: r.cmd !== null, subscripted: !!m[2] })
  }
  if (r.cmd && ASSIGN_CMDS.has(base(r.cmd))) {
    for (const a of r.args) {
      const m = a.startsWith('-') ? null : ASSIGN_TOK.exec(a)
      if (m) out.push({ name: m[1], value: m[4], temp: false, subscripted: !!m[2] })
    }
  }
  return out
}
/** `for NAME in …` · `select NAME in …`의 반복 변수와 목록 (`in`이 없으면 items 없음) */
function loopVar(seg: Segment): { name: string; items?: string[] } | null {
  const t = seg.tokens
  const k = t.findIndex((x) => x === 'for' || x === 'select')
  if (k < 0 || !t.slice(0, k).every((x) => ['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{', '}'].includes(x)) || !t[k + 1]) return null
  return { name: t[k + 1], items: t[k + 2] === 'in' ? t.slice(k + 3) : undefined }
}
/** 변수 이름을 받는 내장 명령 — `read GIT_SSH_COMMAND`·`export LD_PRELOAD`처럼 `=` 없이도 위험 변수를 건드린다 (PATH 포함) */
const VAR_NAMING_CMDS = new Set(['read', 'export', 'declare', 'typeset', 'readonly', 'local', 'printf', 'unset', 'let', 'mapfile', 'readarray', 'getopts'])
/** 변수 첨자에 든 `$(…)`·백틱 (a[$(git push)]) — 산술 평가 때 실행된다 */
const SUBSCRIPT_INJECTION = /[A-Za-z0-9_]\[[^\]]*(\$\(|`)/
/** 산술식 안이 숫자·연산자뿐인가 (16진수 포함) */
const isLiteralArith = (body: string) => /^[\s0-9+\-*/%()<>=!&|^~?:,]*$/.test(body.replace(/\b0[xX][0-9a-fA-F]+\b/g, '0'))
/**
 * 산술 문맥의 글이 안전한가: 숫자·연산자뿐이거나, 값이 늘 정수인 특수 매개변수(`$#` `$?` `$!` `$$` `${#arr[@]}`)뿐일 때.
 * 변수 이름·`$변수`가 하나라도 있으면 값이 a[$(…)]일 때 평가되며 명령이 실행되므로 기다린다 (변수 값이 언제 바뀌는지 따라갈 수 없다)
 */
const arithSafe = (body: string) => {
  let b = body.replace(/\$\{#[A-Za-z_]\w*(\[[@*]\])?\}|\$\{#\}|\$[#?!$]|\$\{[?!$]\}/g, '0')
  for (let prev = ''; prev !== b; ) {
    prev = b
    b = b.replace(/\$\(\(([^()$]*)\)\)/g, '($1)') // 숫자뿐인 안쪽 $((…))는 괄호로 푼다
  }
  return isLiteralArith(b)
}
/** 변수에 넣는 값이 숫자이거나 숫자뿐인 산술(`$((…))`)인가 */
const valueSafe = (v: string) => {
  if (NUM_LIT.test(v)) return true
  const m = /^\$\(\(([\s\S]*)\)\)$/.exec(v)
  return !!m && arithSafe(m[1])
}
const NUM_LIT = /^-?\d+$/
/** 낱말 속 `$((…))`·`$[…]` 산술 확장·`${a[…]}`·`a[…]=` 첨자·`${s:오프셋}`(`${@:x}` 포함)의 안쪽 글들 */
function arithBodies(tok: string): string[] {
  const out: string[] = []
  for (let j = tok.indexOf('$(('); j >= 0; j = tok.indexOf('$((', j + 3)) {
    let d = 0
    let k = j + 1
    for (; k < tok.length; k++) {
      if (tok[k] === '(') d++
      else if (tok[k] === ')' && --d === 0) break
    }
    out.push(tok.slice(j + 3, Math.max(j + 3, k - 1)))
  }
  for (const m of tok.matchAll(/\$\[([^\]]*)\]/g)) out.push(m[1])
  for (const m of tok.matchAll(/(?:\$\{[!#]?\w+|\$\w+|^\w+)\[([^\]]*)\]/g)) if (!/^\s*[@*]\s*$/.test(m[1])) out.push(m[1])
  for (const m of tok.matchAll(/\$\{[!#]?(?:\w+|[@*])(?:\[[^\]]*\])?:([^}]*)\}/g)) if (!/^[-=+?]/.test(m[1])) out.push(m[1])
  return out
}
/** 산술 비교의 피연산자가 숫자뿐인 안전한 글인가 */
const operandSafe = (o: string | undefined) => !!o && arithSafe(o)
const ARITH_TEST_OPS = new Set(['-eq', '-ne', '-lt', '-le', '-gt', '-ge'])
/** 변수에 담았다가 산술 평가로 명령을 실행하게 만들 수 있는 문맥이 명령 어딘가에 있는가 */
const ARITH_CONTEXT = /\(\(|\blet\b|\s-(eq|ne|lt|le|gt|ge)\s|\b(declare|typeset|local|export|readonly|printf|read|unset|kill)\b|\w\[/

const firstNonOpt = (args: string[]) => args.find((a) => !a.startsWith('-'))
/** 이름에 `:`·`-`·`_`로 붙은 배포·게시 낱말이 있으면 true (npm run deploy:prod·build:publish, A3) */
const isOutboundName = (s: string) => s.split(/[:_-]/).some((p) => OUTBOUND_VERBS.has(p))
/** 옵션 이름을 `=` 앞에서 자른다 (--post-data=x → --post-data, A3) */
const optName = (a: string) => a.split('=')[0]
/** 치환·변수·입력 리다이렉트가 있으면 밖으로 데이터를 실어 보낼 수 있다 */
const hasExfilSyntax = (seg: Segment) => seg.hasSubst || /\$[A-Za-z_{]/.test(seg.raw) || seg.raw.includes('<')

const INFO_FLAGS = /^(--version|-v|-V|--help|-h|-version)$/
/** 인터프리터가 파일·인라인 코드·표준입력으로 임의 코드를 실행하는가. 버전 확인 옵션만이고 표준입력도 없을 때만 아니다 */
function interpreterRuns(args: string[], seg: Segment) {
  if (args.length === 0) return true // 표준입력(파이프)으로 실행
  if (args.some((a) => INLINE_CODE_FLAGS.has(a) || a === '-m' || a === '-s' || a === '-')) return true
  if (args.some((a) => !a.startsWith('-'))) return true // 파일 인자
  // 옵션만: -c'…'·-e'…'·--eval=…·-x 처럼 붙여 쓴 코드나 해석 못 하는 옵션은 기다린다
  return !args.every((a) => INFO_FLAGS.test(a)) || seg.piped || seg.raw.includes('<')
}

/** 변수 이름을 받는 내장 명령의 인자에서 이름 자리만 (read -p 프롬프트 같은 옵션 값은 뺀다) */
function namingArgs(name: string, args: string[]): string[] {
  if (name === 'printf') {
    const v = args.findIndex((a) => /^-[A-Za-z]*v/.test(a))
    return v < 0 ? [] : [args[v].length > 2 ? args[v].slice(2) : (args[v + 1] ?? '')]
  }
  const out: string[] = []
  for (let k = 0; k < args.length; k++) {
    const a = args[k]
    if (a.startsWith('-')) {
      if (name === 'read' && /^-[A-Za-z]*[pdinNtu]$/.test(a)) k++ // 옵션 값은 다음 낱말
      continue
    }
    out.push(a.split('=')[0])
  }
  return out
}
/** 긴 옵션이 names 중 하나의 이름이거나 그 앞부분(줄임말)인가 — git·GNU 도구는 --upl=·--templ 처럼 줄여 써도 받아들인다 */
const isLongOpt = (a: string, names: string[]) => {
  if (!a.startsWith('--')) return false
  const nm = a.slice(2).split('=')[0]
  return nm.length > 0 && names.some((n) => n.startsWith(nm))
}

/** 한 토막이 대표를 기다려야 하는 명령인가 (위험 명령은 findRiskyCommand가 따로 본다) */
function segmentWaits(seg: Segment): boolean {
  // 명령을 실행하게 만드는 환경 변수 대입은 명령 없이 따로 있어도(다음 토막에서 쓰인다) 기다린다
  if (seg.tokens.some((t) => DANGEROUS_ENV.test(t))) return true
  // 산술식 `((…))`: 숫자·연산자뿐일 때만 허용 (변수 값이 a[$(…)] 이면 평가 때 명령이 실행된다). 반복 변수를 숫자로 대입하는 for 머리만 예외
  if (seg.tokens[0] === '((') return !arithSafe(seg.tokens[1] ?? '')
  // $((…))·$[…]·${a[…]}·a[…]=·${s:오프셋} 도 변수 이름이 끼면 같다
  // (작은따옴표 안 글은 평가되지 않으므로 가려 둔 plain 낱말로 본다 — grep 'error[s]')
  if (seg.tokens.some((t, i) => arithBodies(seg.plain?.[i] ?? t).some((b) => !arithSafe(b)))) return true
  // ${!x} 간접 참조·zsh ${(e)…}·${(P)x} 는 변수 값을 이름·코드로 쓴다
  if ((seg.plain ?? seg.tokens).some((t) => /\$\{![A-Za-z_0-9]\w*(?![\w*@])|\$\{\(/.test(t))) return true
  // 변수 첨자에 든 $(…)·백틱은 어떤 명령에서든 산술 평가로 실행될 수 있다
  if (seg.tokens.some((t) => SUBSCRIPT_INJECTION.test(t))) return true
  if (writesDangerousPath(seg)) return true
  const resolved = resolveCommand(seg)
  const { cmd, args, localScript, via } = resolved
  // PATH 대입은 실행될 프로그램을 바꾼다 (명령 앞 대입·export·declare 인자·for 변수). `$PATH`를 잇거나 아는 bin 경로만 더하는 것은 통과
  for (const a of assignmentsOf(resolved)) {
    if (PATH_NAME.test(a.name) && (a.name !== 'PATH' || !pathValueOk(a.value) || !pathExpansionsReal(a.value, seg.raw))) return true
    // 이름[첨자]=값 은 그 이름을 산술에서 읽을 때 값이 평가된다 — 값이 숫자·안전한 산술이 아니면 기다린다
    if (a.subscripted && !valueSafe(a.value)) return true
  }
  const lv = loopVar(seg)
  if (lv && (PATH_NAME.test(lv.name) || DANGEROUS_NAME.test(lv.name))) return true
  if (!cmd) return false
  // 변수 이름을 받는 내장 명령: 위험 변수·PATH 이름을 `=` 없이 건드리거나(read GIT_SSH_COMMAND; export LD_PRELOAD; printf -v NAME),
  // 이름 자리에 $·백틱·확장이 있으면(read $v · export $v=… · printf -v $v) 어떤 변수를 건드릴지 알 수 없다
  if (VAR_NAMING_CMDS.has(base(cmd))) {
    const names = namingArgs(base(cmd), args)
    // `export PATH=값`은 위의 대입 규칙(값 검사)이 본다 — 값 없이 이름만 건드리는 경우만 여기서 막는다
    const withValue = new Set(ASSIGN_CMDS.has(base(cmd)) ? args.filter((a) => !a.startsWith('-') && a.includes('=')).map((a) => a.split('=')[0]) : [])
    if (names.some((nm) => DANGEROUS_NAME.test(nm) || (PATH_NAME.test(nm) && !withValue.has(nm)) || /[$`{}*?]/.test(nm))) return true
  }
  // let · declare -i 등 산술 평가 명령 (declare -n 은 다른 변수의 별칭 — 위험 변수를 숨길 수 있다)
  if (base(cmd) === 'let') return !args.every((a) => arithSafe(a))
  if (['declare', 'typeset', 'local'].includes(base(cmd)) && args.some((a) => /^-[A-Za-z]*[in]/.test(a))) return true
  if (['shift', 'return', 'exit', 'break', 'continue'].includes(base(cmd)) && args.some((a) => !arithSafe(a))) return true
  // [ x -eq 1 ] · test x -eq 1 도 [[ ]] 처럼 산술 비교다
  if (cmd === '[' || base(cmd) === 'test') {
    const t = [cmd, ...args]
    for (let k = 0; k < t.length; k++) if (ARITH_TEST_OPS.has(t[k]) && !(operandSafe(t[k - 1]) && operandSafe(t[k + 1]))) return true
  }
  // [[ x -eq 1 ]]: 산술 비교의 피연산자가 숫자 글자가 아니면 변수 값이 평가된다
  if (cmd === '[[') {
    const t = seg.tokens
    for (let k = 0; k < t.length; k++) if (ARITH_TEST_OPS.has(t[k]) && !(operandSafe(t[k - 1]) && operandSafe(t[k + 1]))) return true
  }
  // 명령 이름의 중괄호·glob 확장 ({git,push}·/usr/bin/gi?)은 실제 실행 대상을 알 수 없다
  if (cmd !== '[' && cmd !== '[[' && hasExpansion(cmd)) return true
  // 명령 이름을 변수·명령 치환으로 감추거나 eval·source·. 로 임의 코드를 실행 (M1)
  if (cmd.startsWith('$') || cmd.includes('$(') || cmd.includes('`')) return true
  const name = base(cmd)
  if (!localScript && !isKnownCommand(name) && name !== 'eval' && name !== 'source' && name !== '.') return true // 모르는 명령은 기다린다 (fail closed)
  if (via.includes('xargs') && !XARGS_SAFE.has(name)) return true // xargs 뒤 명령은 인자로 하위 명령이 만들어질 수 있다 (xargs -I% git %)
  if (SUBCOMMAND_TOOLS.has(name) && (name === 'git' ? false : hasExpansion(firstNonOpt(args) ?? ''))) return true
  if (name === 'eval' || name === 'source' || name === '.') return true
  if (BUILD_WRAPPERS.has(name)) {
    // make -f·--file·--makefile·-C·--directory·-I·--include-dir 와 MAKEFILES=·MAKEFLAGS= 변수는 다른 makefile 을 읽게 한다
    if (name === 'make' && (args.some((a) => /^-[A-Za-z]*[fI]/.test(a) || (a.startsWith('--') && isLongOpt(a, ['file', 'makefile', 'include-dir'])) || /^(MAKEFILES|MAKEFLAGS|MFLAGS|GNUMAKEFLAGS|MAKE)\s*[:+?]?=/.test(a)) || [...optValues(args, 'C', ['directory'])].some((v) => !plainSubdir(v)) || args.some((a) => /^-[A-Za-z]*C./.test(a) && !a.startsWith('--') && !plainSubdir(a.slice(a.indexOf('C') + 1))))) return true
    // make --eval·변수로 넘긴 $(shell …)·SHELL= 은 임의 명령을 실행한다
    if (name === 'make' && args.some((a) => /^--eval|\$\((shell|eval|call)\b|(^|\s)\.?SHELL(FLAGS)?\s*[:+?]?=|^-f-?$/.test(a))) return true
    // make -C dir deploy · make -j 4 deploy 처럼 옵션 값이 앞에 와도 놓치지 않게 옵션이 아닌 낱말 전부를 본다
    return args.some((a) => !a.startsWith('-') && isOutboundName(a))
  }
  if (localScript) return true // ./deploy.sh 처럼 로컬 파일을 실행
  if (INTERPRETERS.has(name)) return interpreterRuns(args, seg)
  if (PKG.has(name)) {
    // npx·bunx·pnpm dlx·npm exec·yarn dlx·bun x — 임의 패키지를 받아 실행 (A2)
    if (name === 'npx' || name === 'pnpx' || name === 'bunx') return true
    const sub = firstNonOpt(args)
    // 셸·설정 파일·작업 폴더·node 옵션을 바꾸는 플래그 (--script-shell·--userconfig·--globalconfig·--prefix·--node-options·--*shell*·--*config*). `--` 뒤는 스크립트 인자라 보지 않는다
    const dd = args.indexOf('--')
    const before = dd < 0 ? args : args.slice(0, dd)
    if (before.some((a, k) => /^--?[A-Za-z0-9-]*(shell|config|node-options)[A-Za-z0-9-]*(=|$)/i.test(a) || (/^--(prefix|cwd|dir)(=|$)|^-C$/.test(a) && !plainSubdir(a.includes('=') ? a.slice(a.indexOf('=') + 1) : before[k + 1])))) return true
    // pnpm --filter x exec … 처럼 옵션 값이 앞에 와도 놓치지 않게 낱말 전체를 본다. npm explore·create·init <패키지> 도 임의 코드를 실행한다
    if (args.some((a) => ['dlx', 'exec', 'x', 'explore', 'create', 'publish', 'deploy'].includes(a))) return true
    if ((args.includes('pkg') && args.some((a) => ['set', 'delete', 'fix'].includes(a))) || (['config', 'set'].includes(sub ?? '') && !args.some((a) => ['get', 'list', 'ls'].includes(a)))) return true // package.json 스크립트·npm 설정(script-shell 등) 변경
    if (args.includes('init') && args.length > args.indexOf('init') + 1 && !args[args.indexOf('init') + 1].startsWith('-')) return true
    if (installsPackages(args, name)) return true // 패키지 이름이 붙은 설치·갱신·전역 설치는 남의 코드를 실행하므로 대표 확인
    const runAt = args.findIndex((a) => ['run', 'run-script', 'rum', 'urn'].includes(a))
    if (runAt >= 0) return isOutboundName(args[runAt + 1] ?? '')
    return sub !== undefined && isOutboundName(sub) && ['yarn', 'bun'].includes(name)
  }
  if (name === 'find') return args.some((a) => ['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprintf', '-fprint', '-fls'].includes(a))
  if (name === 'rsync') return args.some((a) => (!a.startsWith('-') && a.includes(':')) || /^--(rsh|rsync-path)/.test(a) || /^-[A-Za-z]*e/.test(a)) // host:/path 전송, -e 로 명령 실행 // host:/path 로 외부 전송
  if (name === 'git') {
    const { sub, rest } = gitSubcommand(args)
    if (!sub || /[$`]/.test(sub) || hasExpansion(sub)) return true // 하위 명령을 변수·치환·확장 문자로 감춤 (M1)
    if (gitRunsConfigCommand(args)) return true
    if (sub === 'push') return true
    if (args.some((a) => isLongOpt(a, GIT_EXEC_OPTS) || a.includes('ext::'))) return true // 외부 프로그램·ext 전송 (줄임말 포함)
    if (sub === 'clone' && rest.some((a) => /^-[A-Za-z]*u/.test(a))) return true // clone -u = --upload-pack
    // 설정·훅을 심을 수 있는 저장소를 만든다 (줄임말 포함. --config 는 아래에서 키를 따로 본다)
    if ((sub === 'init' || sub === 'clone') && rest.some((a) => isLongOpt(a, ['bare', 'mirror', 'template', 'separate-git-dir', 'git-dir', 'work-tree', 'config']) && a.split('=')[0] !== '--config')) return true
    if (sub === 'clone' || sub === 'init') {
      // clone -c key=값 · --config key=값 으로 설정을 심는다
      for (let k = 0; k < rest.length; k++) {
        const a = rest[k]
        if (a === '-c' || a === '--config') {
          if (!GIT_SAFE_CONFIG.test((rest[k + 1] ?? '').split('=')[0])) return true
        } else if (/^--config=/.test(a) && !GIT_SAFE_CONFIG.test(a.slice(9).split('=')[0])) return true
      }
    }
    if ((sub === 'rebase' || sub === 'pull') && rest.some((a) => /^-x|^--exec|^-[A-Za-z]*x/.test(a))) return true // rebase -x: 명령 실행
    if (sub === 'bisect' && rest.includes('run')) return true
    if (sub === 'submodule' && rest.includes('foreach')) return true
    if (['filter-branch', 'difftool', 'mergetool', 'instaweb', 'daemon'].includes(sub)) return true
    if (sub === 'grep' && rest.some((a) => /^-O|^--open-files-in-pager/.test(a))) return true
    if (sub === 'config' && gitConfigWaits(rest)) return true // 별칭·sshCommand·pager 등 명령 설정
    return false
  }
  if (name === 'awk' || name === 'gawk') return args.some((a) => /system|getline|^-f|^--(file|source|include|load)|^-[il]$|@(include|load)/.test(a) || /(^|[^|])\|([^|]|$)|\bprintf?\b[^;}]*>/.test(awkNoStrings(a))) // system()·파이프로 명령 실행
  if (name === 'sed') return args.some((a) => /(^|[;{}\s])\d*\$?e(\s|$)|\/[a-zA-Z]*e[a-zA-Z]*$/.test(a)) // e 명령·s///e 는 셸을 실행한다
  if (name === 'sqlite3') return seg.piped || seg.raw.includes('<') || args.some((a) => /(^|[\s;])\.[a-z]/i.test(a) || a === '-init') // .shell·.system 등 점 명령과 표준입력
  // tar: 풀기(-x·--extract)·디렉터리 이동(-C)·치환(-s)과 명령을 실행하는 옵션은 기다린다. 만들기·목록(-c·-t)은 통과
  if (name === 'tar') return args.some((a, i) => isLongOpt(a, ['extract', 'get', 'directory', 'transform', 'xform', 'use-compress-program', 'to-command', 'checkpoint-action', 'info-script', 'new-volume-script', 'rmt-command', 'rsh-command']) || /^-[A-Za-z]*[IFxsC]/.test(a) || (i === 0 && !a.startsWith('-') && /^[A-Za-z]+$/.test(a) && /[IFxsC]/.test(a)))
  if (name === 'unzip') return true // 압축 풀기는 어디에 무엇을 쓸지 알 수 없다
  if (name === 'zip') return args.some((a) => a.startsWith('-TT') || a === '--unzip-command')
  if (name === 'man') return args.some((a) => a.startsWith('-') && !/^-[afkw]+$/.test(a)) // man -P 는 pager 명령을 실행한다
  if (name === 'brew') return ['ruby', 'irb', 'sh', 'exec'].includes(firstNonOpt(args) ?? '')
  if (name === 'xcrun') {
    const nonOpts = args.filter((a) => !a.startsWith('-'))
    return !(nonOpts[0] === 'simctl' && nonOpts[1] === 'list')
  }
  if (name === 'nvm') return !['ls', 'list', 'current', 'version', 'which', 'use', 'alias', 'ls-remote', 'help', undefined].includes(firstNonOpt(args))
  if (NET_SENDERS.has(name)) return true
  if (name === 'curl' || name === 'wget') {
    if (hasExfilSyntax(seg)) return true
    const upload = new Set(['-X', '--request', '-d', '--data', '--data-binary', '--data-raw', '--data-urlencode', '-F', '--form', '-T', '--upload-file', '--json', '--post-file', '--post-data', '--body-data', '--body-file', '--method'])
    // 긴 옵션(--post-data=x 처럼 =로 이어 써도, A3), 또는 짧은 옵션 묶음(-sd·-sXPOST)에 d·F·T·X가 섞이면 보내기로 본다
    return args.some((a) => upload.has(optName(a)) || optName(a).startsWith('--data') || /^-[A-Za-z]*[dFTX]/.test(a))
  }
  if (name === 'http' || name === 'https' || name === 'xh') return args.some((a) => /^(POST|PUT|PATCH|DELETE)$/i.test(a)) || hasExfilSyntax(seg)
  if (DNS.has(name)) return hasExfilSyntax(seg)
  if (name === 'gh') {
    const sub = firstNonOpt(args)
    if (sub && ['pr', 'release', 'issue', 'repo', 'gist'].includes(sub)) return ['create', 'merge', 'comment', 'review', 'edit', 'close', 'delete', 'note'].includes(args[args.indexOf(sub) + 1] ?? '')
    if (sub === 'api') return args.some((a) => /^(-X|--method|-f|-F|--field|--raw-field|--input)$/.test(a) || /^-[A-Za-z]*[fF]/.test(a))
    return false
  }
  if (name === 'glab') {
    const sub = firstNonOpt(args)
    return !!sub && ['mr', 'release', 'issue'].includes(sub) && ['create', 'merge', 'note'].includes(args[args.indexOf(sub) + 1] ?? '')
  }
  if (name === 'docker') return firstNonOpt(args) === 'push' || (firstNonOpt(args) === 'compose' && args.includes('push'))
  if (name === 'docker-compose') return args.includes('push')
  if (CLOUD.has(name)) return args.some((a) => a === 'deploy' || a === 'publish' || a === '--prod') || (name === 'vercel' && !firstNonOpt(args))
  if (name === 'kubectl' || name === 'helm') return ['apply', 'install', 'upgrade', 'delete', 'rollout', 'create', 'replace', 'patch', 'edit', 'scale'].includes(firstNonOpt(args) ?? '')
  if (name === 'terraform') return ['apply', 'destroy'].includes(firstNonOpt(args) ?? '')
  if (name === 'aws') {
    const nonOpts = args.filter((a) => !a.startsWith('-'))
    const op = nonOpts[1]
    return !!op && (['cp', 'sync', 'mv', 'put-object', 'deploy', 'publish'].includes(op) || op.startsWith('send') || op.startsWith('put'))
  }
  if (name === 'gsutil') return ['cp', 'rsync', 'mv'].includes(firstNonOpt(args) ?? '')
  if (['cargo', 'gem', 'twine', 'poetry', 'flit'].includes(name)) return OUTBOUND_VERBS.has(firstNonOpt(args) ?? '')
  if (name === 'pod') return firstNonOpt(args) === 'trunk' && args.includes('push')
  if (name === 'fastlane') return ['deploy', 'release', 'pilot', 'deliver', 'supply', 'upload'].includes(firstNonOpt(args) ?? '')
  if (MAIL.has(name)) return true
  if (name === 'open') return args.some((a) => a.startsWith('mailto:'))
  return false
}

const REDIRECT_OUT = /^(?:\d*|&)(?:>>|>\||>&|>|&>>|&>)(.*)$/
/** 파일을 쓰는 명령 — 인자가 실행 위험 경로(.git/config·훅·셸 rc …)면 기다린다 */
const FILE_WRITERS = new Set(['tee', 'cp', 'mv', 'ln', 'install', 'sed', 'touch', 'truncate', 'dd', 'rsync', 'patch', 'tar', 'unzip', 'zip', 'xxd'])
/** 마지막 인자가 쓰기 대상인 명령 (그 앞 인자는 읽기 원본) — `-t 디렉터리`가 있으면 전부 본다 */
const LAST_ARG_TARGET = new Set(['cp', 'mv', 'install', 'rsync'])
/** `//`·`/./`·`..`를 정리한 경로 (.git//config · .git/./config · a/../.git/config 도 같은 곳으로 본다) */
function normPath(raw: string) {
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
  return (abs ? '/' : '') + out.join('/')
}
/** `.git` 디렉터리 자체이거나 그 안인가 (macOS 기본 파일 시스템은 대소문자를 구분하지 않아 `.GIT`도 같다) */
const insideGitDir = (raw: string) => /(^|\/)\.git(\/|$)/i.test(normPath(raw))
/** 직접 만든 bare 저장소의 핵심 파일 (HEAD·config·packed-refs·objects/·refs/) — 쓰면 `git -C r …`가 그 설정을 따른다 */
const GIT_META = /(^|\/)(head|config|packed-refs|objects|refs)(\/|$)/i
/** 다음 npm·make·pip 실행이 읽어 명령을 실행하는 설정 파일 */
const EXEC_CONFIG = /(^|\/)(package\.json|makefile|gnumakefile|justfile|\.justfile|\.npmrc|\.yarnrc(\.[a-z]+)?|\.pnpmfile\.c?js|pyproject\.toml|setup\.py|setup\.cfg|tox\.ini|noxfile\.py|rakefile|gemfile|conftest\.py|bunfig\.toml|build\.gradle(\.kts)?|pom\.xml)$/i
/** 값이 고정이라 경로로 믿어도 되는 확장: $HOME·$PWD·$(pwd)·$(git rev-parse --show-toplevel) (HOME·PWD 대입은 따로 막는다) */
const SAFE_EXPANSIONS = /\$HOME(?![A-Za-z0-9_])|\$PWD(?![A-Za-z0-9_])|\$\{(?:HOME|PWD)\}|\$\((?:pwd|git rev-parse --show-toplevel)\)/g
/** 경로 낱말에서 믿을 수 있는 확장을 `_`로 바꾼다 (맨 앞 `~`·`~/`는 홈) */
function canonTarget(t: string) {
  const s = t.replace(SAFE_EXPANSIONS, '_')
  return /^~(\/|$)/.test(s) ? '_' + s.slice(1) : s
}
/** 글자 그대로 확정되지 않는 경로인가 (glob·중괄호·변수·치환·`~`) — 실제로 어디를 가리킬지 알 수 없다 */
const unsureTarget = (t: string) => /[*?[\]{}$`~]/.test(canonTarget(t))
/** PATH 허용 목록의 폴더 (nvm bin·node_modules/.bin·homebrew·/usr/local/bin·/usr/bin·/bin) — 여기에 파일을 쓰면 가짜 git·npm 이 실행된다 */
const PATH_DIR = /(^|\/)node_modules\/\.bin(\/|$)|(^|\/)\.nvm\/versions\/node\/[^/]+\/bin(\/|$)|^\/(usr\/local|usr|opt\/homebrew)?\/?s?bin(\/|$)|^\/opt\/homebrew\/s?bin(\/|$)/i
/** PATH 허용 폴더의 상위 폴더 (node_modules·.nvm·/usr/local·/opt/homebrew …) — 여기에 디렉터리를 합치거나 옮기면 그 안의 bin 이 바뀐다 */
const PATH_ANCESTOR = /(^|\/)node_modules$|(^|\/)\.nvm(\/versions(\/node(\/[^/]+)?)?)?$|^\/(usr(\/local)?|opt(\/homebrew)?)?$/i
/** 쓰기 대상이 위험한가: 확정 안 됨 · 실행 위험 경로 · .git 안 · bare 저장소 파일 · 실행 설정 파일 · PATH 폴더 */
function dangerousTarget(t: string) {
  if (unsureTarget(t)) return true
  const s = canonTarget(t)
  const n = normPath(s)
  return isDangerousWritePath(s, '') || insideGitDir(s) || GIT_META.test(n) || EXEC_CONFIG.test(n) || PATH_DIR.test(n) || PATH_ANCESTOR.test(n)
}
/** 글자 그대로의 상대 하위 폴더(app·packages/web)이고 .git·node_modules·PATH 폴더가 아닌가 — `npm --prefix app test`·`make -C app` */
const plainSubdir = (v: string | undefined) => !!v && /^[A-Za-z0-9_@][A-Za-z0-9_@.-]*(\/[A-Za-z0-9_@.-]+)*$/.test(v) && !normPath(v).startsWith('..') && !dangerousTarget(v)
/** 옵션이 받는 값들: 짧은 옵션 글자(shorts, `-ofile`·`-so file`처럼 묶음 포함)와 긴 옵션 이름(줄임말 포함) */
function optValues(args: string[], shorts: string, longs: string[]): string[] {
  const out: string[] = []
  for (let k = 0; k < args.length; k++) {
    const a = args[k]
    if (a === '--') break
    if (a.startsWith('--')) {
      if (isLongOpt(a, longs)) out.push(a.includes('=') ? a.slice(a.indexOf('=') + 1) : (args[++k] ?? ''))
    } else if (a.startsWith('-') && a.length > 1) {
      for (let i = 1; i < a.length; i++) {
        if (shorts.includes(a[i])) {
          out.push(a.slice(i + 1) || (args[++k] ?? ''))
          break
        }
      }
    }
  }
  return out
}
/** 옵션을 빼고 남은 자리 인자들 (값을 받는 옵션의 값은 건너뛴다 — 값과 같은 이름의 파일 인자는 지우지 않는다) */
function positionalArgs(args: string[], valueShorts = '', valueLongs: string[] = []): string[] {
  const out: string[] = []
  for (let k = 0; k < args.length; k++) {
    const a = args[k]
    if (a === '--') {
      out.push(...args.slice(k + 1))
      break
    }
    if (a.startsWith('--')) {
      if (!a.includes('=') && isLongOpt(a, valueLongs)) k++
    } else if (a.startsWith('-') && a.length > 1) {
      for (let i = 1; i < a.length; i++) {
        if (valueShorts.includes(a[i])) {
          if (i === a.length - 1) k++
          break
        }
      }
    } else out.push(a)
  }
  return out
}
/** URL 의 마지막 이름 (curl -O·wget 이 저장할 파일 이름) */
const urlBase = (u: string) => u.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? ''
/** sed 스크립트 낱말들: -e·--expression 값, 없으면 첫 옵션 아닌 낱말. -f 파일은 내용을 알 수 없다(null). -l N·--line-length 의 값은 스크립트가 아니다 */
function sedScripts(args: string[], bsd = false, suffixes?: string[]): string[] | null {
  const out: string[] = []
  let hasE = false
  let first: string | null = null
  let positional = 0
  const bsdSuffix: string[] = []
  for (let k = 0; k < args.length; k++) {
    const a = args[k]
    if (a === '--') {
      positional += args.length - k - 1
      if (first === null && k + 1 < args.length) first = args[k + 1]
      break
    }
    if (a.startsWith('--')) {
      if (isLongOpt(a, ['file'])) return null
      if (isLongOpt(a, ['expression'])) {
        hasE = true
        out.push(a.includes('=') ? a.slice(a.indexOf('=') + 1) : (args[++k] ?? ''))
      } else if (isLongOpt(a, ['line-length']) && !a.includes('=')) k++
    } else if (a.startsWith('-') && a.length > 1) {
      for (let i = 1; i < a.length; i++) {
        const c = a[i]
        if (c === 'f') return null
        if (c === 'e') {
          hasE = true
          out.push(a.slice(i + 1) || (args[++k] ?? ''))
          break
        }
        if (c === 'l') {
          if (i === a.length - 1) k++
          break
        }
        if (c === 'i' || c === 'I') {
          // GNU: 나머지는 백업 접미사. BSD(macOS): `-i`·`-I`가 낱말 끝이면 바로 다음 낱말이 접미사다 (`sed -i '' -n 'w f' x`의 스크립트는 'w f')
          if (bsd && i === a.length - 1) bsdSuffix.push(args[++k] ?? '')
          else suffixes?.push(a.slice(i + 1))
          break
        }
      }
    } else {
      positional++
      if (first === null) first = a
    }
  }
  // BSD 해석은 접미사를 뺀 뒤 고칠 파일이 하나 이상 남을 때만 성립한다 (`sed -i 's/a/b/' f` 는 BSD 에서 오류 = GNU 로만 읽는다)
  if (bsdSuffix.length) {
    if (positional - (hasE ? 0 : 1) < 1) return []
    suffixes?.push(...bsdSuffix)
  }
  return hasE ? out : first === null ? [] : [first]
}
/** 정규식 글에 닫히지 않은 `[` 가 있는가 (구분자가 대괄호 안에 있는 경우 GNU·BSD sed 가 다르게 읽는다) */
function openBracket(t: string) {
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\') i++
    else if (t[i] === '[') {
      let j = i + 1
      if (t[j] === '^') j++
      if (t[j] === ']') j++
      const e = t.indexOf(']', j)
      if (e < 0) return true
      i = e
    }
  }
  return false
}
/** `d` 구분자로 닫히는 위치 (역슬래시는 다음 글자를 건너뛴다). 없으면 -1 */
function sedDelimEnd(t: string, from: number, d: string) {
  for (let i = from; i < t.length; i++) {
    if (t[i] === '\\') i++
    else if (t[i] === d) return openBracket(t.slice(from, i)) ? -1 : i
  }
  return -1
}
/**
 * sed 스크립트가 파일에 쓰거나(`w`·`W`·`s///w`) 해석이 불확실하면 true.
 * 명령 단위(`;`·줄바꿈)로 나눠 주소(`/re/`·숫자·`$`) 뒤 명령 글자와 `s` 의 플래그만 본다 — 정규식·치환 속 `w` 는 쓰기가 아니다
 */
function sedWritesOrUnsure(sc: string): boolean {
  let i = 0
  const n = sc.length
  const toEol = () => {
    const e = sc.indexOf('\n', i)
    i = e < 0 ? n : e + 1
  }
  while (i < n) {
    while (i < n && /[\s;]/.test(sc[i])) i++
    if (i >= n) break
    if (sc[i] === '#') {
      toEol()
      continue
    }
    // 주소: 숫자·first~step·$·/re/·\cREc , 두 번째 주소, ! 와 공백
    for (let guard = 0; guard < 2; guard++) {
      if (/\d/.test(sc[i] ?? '')) {
        while (/[\d~]/.test(sc[i] ?? '')) i++
      } else if (sc[i] === '$') i++
      else if (sc[i] === '/' || sc[i] === '\\') {
        const d = sc[i] === '\\' ? sc[i + 1] : '/'
        if (!d || /[\s\\]/.test(d)) return true
        const from = i + (sc[i] === '\\' ? 2 : 1)
        const e = sedDelimEnd(sc, from, d)
        if (e < 0) return true
        i = e + 1
        while (/[IM]/.test(sc[i] ?? '')) i++
      } else break
      while (sc[i] === ' ') i++
      if (sc[i] === ',') {
        i++
        while (sc[i] === ' ') i++
      } else break
    }
    while (i < n && /[\s!]/.test(sc[i])) i++
    const c = sc[i++]
    if (c === undefined) break
    if (c === 'w' || c === 'W' || c === 'e') return true
    if (c === 's' || c === 'y') {
      const d = sc[i]
      if (!d || /[\s\;]/.test(d)) return true
      const e1 = sedDelimEnd(sc, i + 1, d)
      if (e1 < 0) return true
      const e2 = sedDelimEnd(sc, e1 + 1, d)
      if (e2 < 0) return true
      i = e2 + 1
      if (c === 's') {
        while (i < n && !/[\s;}#]/.test(sc[i])) {
          if (!/[gpiImM0-9]/.test(sc[i])) return true // w·e 와 모르는 플래그
          i++
        }
      }
    } else if ('aic'.includes(c) || 'rR'.includes(c)) toEol()
    else if ('btT:'.includes(c)) {
      while (i < n && sc[i] !== ';' && sc[i] !== '\n') i++
    } else if ('{}=dDgGhHnNpPxzF'.includes(c)) continue
    else if ('lLqQ'.includes(c)) while (/\d/.test(sc[i] ?? '')) i++
    else return true
    while (i < n && sc[i] === ' ') i++
    if (i < n && !/[;}\n#]/.test(sc[i]) && sc[i - 1] !== '\n') {
      if (sc[i] === '{') continue
      return true
    }
  }
  return false
}
/** awk 스크립트에서 큰따옴표 문자열 리터럴 안의 내용을 비운다 (그 속의 `>`·`|` 는 연산자가 아니다) */
const awkNoStrings = (a: string) => a.replace(/"(?:[^"\\]|\\.)*"/g, '""')
/** cp·mv·install의 대상 경로들: `-t DIR`·`-tDIR`·`--target-directory=DIR`(줄임말 포함)가 있으면 그 값과 모든 인자, 없으면 마지막 인자 */
function copyTargets(args: string[], paths: string[]) {
  const vals: string[] = []
  let hasT = false
  for (let k = 0; k < args.length; k++) {
    const a = args[k]
    if (a.startsWith('--')) {
      if (isLongOpt(a, ['target-directory'])) {
        hasT = true
        vals.push(a.includes('=') ? a.slice(a.indexOf('=') + 1) : (args[++k] ?? ''))
      }
      continue
    }
    const m = /^-[A-Za-z]*t(.*)$/.exec(a)
    if (m) {
      hasT = true
      vals.push(m[1] || (args[++k] ?? ''))
    }
  }
  return hasT ? [...vals, ...paths] : paths.slice(-1)
}
/** git 이 만들 폴더(clone 대상·init 대상)를 같은 명령 줄 안에서 바로 쓰는지 보려고 모아 둔다 */
function gitCreatedDirs(args: string[]): string[] {
  const { sub, rest } = gitSubcommand(args)
  const pos = positionalArgs(rest, 'bcoujC', ['branch', 'config', 'origin', 'depth', 'reference', 'template', 'separate-git-dir', 'jobs'])
  if (sub === 'clone' && pos[0]) return [pos[1] ?? urlBase(pos[0]).replace(/\.git$/, '')]
  if (sub === 'init' && pos[0]) return [pos[0]]
  return []
}
/** git 하위 명령이 쓰는 경로가 위험한가: mv 대상·clone/init 대상·archive -o·format-patch -o·bundle create·checkout/restore 의 경로·update-index --cacheinfo.
 * 파일을 만들어 내지만 경로를 정적으로 알 수 없는 checkout-index·worktree·apply·am·read-tree·update-index --index-info 는 기다린다 */
function gitWritesDangerous(args: string[]): boolean {
  const { sub, rest } = gitSubcommand(args)
  if (!sub) return false
  const pos = rest.filter((a) => !a.startsWith('-'))
  if (sub === 'mv') return pos.length > 1 && (dangerousTarget(pos[pos.length - 1]) || pos.some((a) => insideGitDir(a)))
  if (['checkout-index', 'worktree', 'apply', 'am', 'unpack-file', 'read-tree'].includes(sub)) return true
  if (sub === 'clone' || sub === 'init') return gitCreatedDirs(args).some(dangerousTarget)
  // 되돌리기·복원: 경로 자리 인자가 .git 안이거나 bare 저장소 파일 이름(HEAD·config·objects·refs·packed-refs)이면 기다린다
  if (sub === 'restore' || sub === 'checkout') {
    const dd = rest.indexOf('--')
    const paths = dd >= 0 ? rest.slice(dd + 1) : sub === 'restore' ? positionalArgs(rest, 'sS', ['source']) : positionalArgs(rest, 'bBq', ['branch', 'orphan']).slice(1)
    if (paths.some(dangerousTarget)) return true
  }
  if (sub === 'update-index') {
    if (rest.some((a) => isLongOpt(a, ['index-info']))) return true
    const ci = rest.findIndex((a) => isLongOpt(a, ['cacheinfo']))
    if (ci >= 0) {
      const v = rest[ci].includes('=') ? [rest[ci].slice(rest[ci].indexOf('=') + 1)] : rest.slice(ci + 1, ci + 4)
      if (v.flatMap((x) => x.split(',')).some((x, i, all) => i >= Math.min(2, all.length - 1) && dangerousTarget(x)) || v.length === 0) return true
    }
    if (positionalArgs(rest).some(dangerousTarget)) return true
  }
  if (sub === 'submodule' && pos[0] === 'add') return true
  if (sub === 'archive' && rest.some((a) => isLongOpt(a, ['remote']))) return true
  const outs = optValues(rest, sub === 'archive' || sub === 'format-patch' ? 'o' : '', ['output', 'output-directory', 'export-marks'])
  if (sub === 'bundle' && pos[0] === 'create' && pos[1]) outs.push(pos[1])
  return outs.some(dangerousTarget)
}

/** 리다이렉트 대상이나 파일 쓰는 명령의 인자가 실행 위험 경로인가 (.git 디렉터리 자체·안쪽 쓰기 포함) */
function writesDangerousPath(seg: Segment) {
  const toks = seg.tokens.filter((t) => t !== '')
  for (let k = 0; k < toks.length; k++) {
    const m = REDIRECT_OUT.exec(toks[k])
    if (!m) continue
    const target = m[1] || toks[k + 1] || ''
    if (!/^(\d+|-)$/.test(target) && dangerousTarget(target)) return true
  }
  const { cmd, args } = resolveCommand(seg)
  if (!cmd) return false
  const name = base(cmd)
  // cd .git 한 뒤 상대 경로로 쓰는 것도 막는다. cd - (OLDPWD)·glob·변수·치환으로 가리키는 곳도 알 수 없어 기다린다
  if (name === 'cd' || name === 'pushd') return args.some((a) => a === '-' || (!a.startsWith('-') && (unsureTarget(a) || insideGitDir(canonTarget(a)) || PATH_DIR.test(normPath(canonTarget(a))) || PATH_ANCESTOR.test(normPath(canonTarget(a))))))
  // FILE_WRITERS 밖이어도 출력 경로를 받는 옵션·인자가 있는 명령
  const pos = args.filter((a) => !a.startsWith('-'))
  if (name === 'sort') return optValues(args, 'o', ['output']).some(dangerousTarget)
  if (name === 'uniq') {
    const p = positionalArgs(args, 'fsw', ['skip-fields', 'skip-chars', 'check-chars'])
    return p[1] !== undefined && dangerousTarget(p[1]) // 두 번째 자리 인자는 출력 파일
  }
  if (name === 'xxd') {
    const p = positionalArgs(args, 'lcsgoEn', ['len', 'cols', 'seek', 'groupsize', 'offset'])
    return p.length > 1 && dangerousTarget(p[1]) // xxd [-r] 입력 출력
  }
  if (name === 'base64') return optValues(args, 'o', ['output']).some(dangerousTarget)
  if (name === 'split' || name === 'csplit') return [...pos, ...optValues(args, 'fb', ['prefix', 'suffix-format', 'additional-suffix'])].some(dangerousTarget)
  if (name === 'curl') {
    // 설정 파일(-K·--config)·응답 부가 저장(--etag-save·--hsts·--alt-svc·-D·-c·--trace*)·-w '%output{…}'·-o '#1' 은 어디에 쓰는지 알 수 없다
    if (args.some((a) => /^-[A-Za-z]*[KDc]/.test(a) || isLongOpt(a, ['config', 'etag-save', 'hsts', 'alt-svc', 'dump-header', 'cookie-jar', 'trace', 'trace-ascii', 'libcurl', 'stderr']) || a.includes('%output'))) return true
    if (optValues(args, 'o', ['output']).some((v) => v.includes('#'))) return true
    const outs = [...optValues(args, 'o', ['output', 'output-dir'])]
    if (args.some((a) => a === '-O' || /^-[A-Za-z]*O/.test(a) || isLongOpt(a, ['remote-name', 'remote-name-all']))) outs.push(...pos.map(urlBase))
    return outs.some(dangerousTarget)
  }
  if (name === 'wget') return [...optValues(args, 'OPoa', ['output-document', 'directory-prefix', 'output-file', 'append-output']), ...pos.map(urlBase)].some(dangerousTarget)
  if (name === 'chmod' || name === 'chown') return pos.some(dangerousTarget)
  if (name === 'patch') return true // 쓸 파일이 패치 내용 안에 있어 알 수 없다
  if (name === 'sed') {
    // GNU·BSD 해석이 다르다 (-i 다음 낱말이 접미사인가 스크립트인가) — 둘 다 검사하고, 백업 접미사가 경로(`/`)면 다른 폴더에 쓴다
    const sc = sedScripts(args)
    const scBsd = sedScripts(args, true, [])
    const suffixes: string[] = []
    sedScripts(args, true, suffixes)
    sedScripts(args, false, suffixes)
    if (sc === null || scBsd === null || [...sc, ...scBsd].some(sedWritesOrUnsure) || suffixes.some((x) => /[/\\]|\.\./.test(x))) return true
    // 스크립트 낱말에 $·백틱이 있으면(따옴표 없이·큰따옴표 안) 변수 값이 스크립트가 된다 — 작은따옴표 속은 글자 그대로
    if (sc.some((x) => seg.tokens.some((t, i) => t.endsWith(x) && /\$[A-Za-z_{(0-9@*#?!-]|`/.test(seg.plain?.[i] ?? t)))) return true
  }
  if (name === 'git') return gitWritesDangerous(args)
  if (!FILE_WRITERS.has(name)) return false
  const paths = args.filter((a) => !a.startsWith('-')).map((a) => a.replace(/^of=/, ''))
  if (paths.some((a) => isDangerousWritePath(a, ''))) return true
  if (name === 'dd') return args.filter((a) => a.startsWith('of=')).some((a) => dangerousTarget(a.slice(3)))
  if (['tee', 'touch', 'truncate', 'ln'].includes(name)) return paths.some(dangerousTarget) // ln: .git을 가리키는 링크(ln -s .git g)도 .git 쓰기다
  // 디렉터리를 통째로 현재 폴더(.·..)에 합치면 그 안의 .git 이 덮어써진다 (cp -r evil/. . · rsync -a evil/ ./)
  const recursive = args.some((a) => /^-[A-Za-z]*[rRa]|^--(recursive|archive)/.test(a))
  const intoCwd = recursive && paths.length > 1 && ['', '..', '_'].includes(normPath(canonTarget(paths[paths.length - 1])))
  if (name === 'cp' || name === 'mv' || name === 'install') return intoCwd || copyTargets(args, paths).some(dangerousTarget)
  if (name === 'rsync') return intoCwd || paths.slice(-1).some(dangerousTarget)
  // sed -i: 고쳐 쓰는 파일이 bare 저장소 파일·실행 설정 파일인가 (스크립트·읽기 전용 sed는 보지 않는다)
  if (name === 'sed' && args.some((a) => /^-[A-Za-z]*[iI]|^--in-place/.test(a))) return paths.some((a) => GIT_META.test(normPath(a)) || EXEC_CONFIG.test(normPath(a)))
  return false
}

/** 대표를 기다려야 하는 명령인가 (위험 명령·푸시·외부 전송·스크립트 실행·명령 숨기기). 이어 붙인 명령 중 하나라도 걸리면 true */
export function commandWaits(command: string): boolean {
  if (!command.trim()) return true
  if (findRiskyCommand(command)) return true
  const segs = lexSegments(command)
  // 글자 그대로 남긴 $(…)·백틱(따옴표·이스케이프 속)이 있고 산술 평가가 될 만한 문맥도 있으면 변수 경유 우회로 보고 기다린다
  if (segs.some((s) => s.literalSubst) && ARITH_CONTEXT.test(command)) return true
  const fresh: string[] = []
  for (const seg of segs) {
    if (segmentWaits(seg)) return true
    if (usesFreshDir(seg, fresh)) return true
    fresh.push(...createdDirs(seg))
  }
  return false
}

/** 이 토막이 만들거나 쓰는 폴더: git clone·init 대상, cp·mv·rsync·tar·curl 이 쓰는 폴더, 리다이렉트 대상의 상위 */
function createdDirs(seg: Segment): string[] {
  const { cmd, args } = resolveCommand(seg)
  const out: string[] = []
  if (cmd && base(cmd) === 'git') out.push(...gitCreatedDirs(args))
  if (cmd && ['cp', 'mv', 'rsync', 'install'].includes(base(cmd))) out.push(...positionalArgs(args).slice(-1))
  return out.map((d) => normPath(canonTarget(d))).filter((d) => d && d !== '_' && !d.startsWith('..'))
}
const under = (p: string, d: string) => p === d || p.startsWith(d + '/')
/** 앞 토막이 방금 만들거나 채운 폴더에 들어가 `git -C 폴더`·`cd 폴더 && npm test`·`npm --prefix 폴더`·`make -C 폴더` 로 바로 이어 실행하는가 (그 안의 HEAD·config·package.json 을 읽는다) */
function usesFreshDir(seg: Segment, fresh: string[]): boolean {
  if (!fresh.length) return false
  const { cmd, args } = resolveCommand(seg)
  if (!cmd) return false
  const name = base(cmd)
  const hit = (v: string | undefined) => {
    if (!v) return false
    const p = normPath(canonTarget(v))
    return fresh.some((d) => under(p, d) || under(d, p))
  }
  if (name === 'cd' || name === 'pushd') return args.some((a) => !a.startsWith('-') && hit(a))
  if (name === 'git') {
    for (let k = 0; k < args.length && args[k].startsWith('-'); k++) {
      if (args[k] === '-C' && hit(args[k + 1])) return true
      if (GIT_VALUE_OPTS_SET.has(args[k])) k++
    }
    return false
  }
  if (['npm', 'yarn', 'pnpm', 'bun', 'make'].includes(name)) return [...optValues(args, 'C', ['prefix', 'cwd', 'dir', 'directory'])].some(hit)
  return false
}
const GIT_VALUE_OPTS_SET = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env'])


/** 실행 위험 경로에 쓰는 파일인지 (셸 rc·git 훅·.claude·.ssh·CI 설정 등 — H2) */
const DANGEROUS_WRITE = [
  /(^|\/)\.(bash|zsh|prof)[a-z_]*$/i, // .bashrc .zshrc .bash_profile .profile .zprofile .zshenv
  /(^|\/)\.(git\/hooks|claude|ssh|aws|npmrc|pypirc|netrc|config\/gh)(\/|$)/i,
  /(^|\/)\.claude(\/|$)/i,
  /\/\.git\/hooks\//i,
  /(^|\/)(Library\/LaunchAgents|LaunchDaemons)\//i,
  /(^|\/)(crontab|cron\.d)(\/|$)/i,
  /Start Menu\/Programs\/Startup(\/|$)/i, // 윈도우 시작프로그램
  /(^|\/)(Windows)?PowerShell\/(v[\d.]+\/)?[^/]*profile\.ps1$/i, // PowerShell 프로필
  /\.github\/workflows\//i,
  /(^|\/)(\.gitlab-ci\.yml|\.circleci\/|azure-pipelines\.yml|Jenkinsfile|\.travis\.yml|bitbucket-pipelines\.yml)/i,
  // A4: git 설정·훅 관리자·디렉터리 환경·에디터 작업
  /(^|\/)\.gitconfig$/i,
  /(^|\/)\.git\/(config|info\/|hooks\/|modules\/.+\/config$)/i,
  /(^|\/)\.husky(\/|$)/i,
  /(^|\/)\.envrc$/i,
  /\.vscode\/tasks\.json$/i,
]
/** 홈 바로 밑 셸 rc 도 본다 */
function isDangerousWritePath(rawPath: string, content: string) {
  const p = normPath(rawPath) // 윈도우 역슬래시·`//`·`/./`·`..` 도 같은 규칙으로 본다
  if (DANGEROUS_WRITE.some((re) => re.test(p))) return true
  // #! 로 시작하는(실행되는) 파일
  if (content.trimStart().startsWith('#!')) return true
  return false
}

/**
 * 자동결재 판정: 'allow'면 대표 대신 승인, 'wait'면 평소처럼 결재함에서 대표를 기다린다.
 * 대기 = 위험 명령 · 푸시·외부 전송 · 스크립트 실행 · 실행 위험 경로 쓰기 · 화면 캡처 · 브라우저 조작. 질문(AskUserQuestion)은 따로 답한다
 */
export function autoApprove(tool: string, input: Record<string, unknown>): AutoVerdict {
  if (tool === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : ''
    return commandWaits(command) ? 'wait' : 'allow'
  }
  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    const p = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
    const content = typeof input.content === 'string' ? input.content : typeof input.new_string === 'string' ? input.new_string : ''
    return isDangerousWritePath(p, content) ? 'wait' : 'allow'
  }
  if (tool === 'WebSearch') return 'allow'
  if (tool === 'WebFetch') {
    const url = typeof input.url === 'string' ? input.url : ''
    return /[?#]/.test(url) ? 'wait' : 'allow'
  }
  if (tool === 'mcp__office__capture_screen') return 'wait'
  // 브라우저 장비: 조회만 허용, 이동·클릭·입력·업로드·제출은 대표를 기다린다 (결재 판정과 같은 기준 — browserTools)
  const browser = browserVerdict(tool, input)
  if (browser) return browser
  // 컴퓨터 조작 장비: 화면 보기만 허용, 이동·클릭·입력·스크롤은 대표를 기다린다 (computerTools)
  const computer = computerVerdict(tool, input)
  if (computer) return computer
  if (tool.startsWith('mcp__')) {
    const name = tool.slice(tool.indexOf('__', 5) + 2)
    // 이름의 모든 낱말을 본다 (camelCase·_·- 로 쪼갬). 쓰기 동사가 하나라도 섞이면 기다린다 (A5 — get_or_create 등)
    const words = name
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[^A-Za-z]+/)
      .filter(Boolean)
      .map((w) => w.toLowerCase())
    if (words.some((w) => WRITE_VERBS.has(w))) return 'wait'
    return words.some((w) => READ_VERBS.has(w)) ? 'allow' : 'wait'
  }
  return 'allow'
}

/** 자동으로 허용하는 MCP 읽기 동사 (나머지는 기다린다 — 대표 결정). `query`는 임의 SQL이 될 수 있어 뺀다 (A5) */
const READ_VERBS = new Set(['get', 'list', 'read', 'search', 'fetch', 'describe', 'view', 'show'])
/** 쓰기·전송 동사 — 이름에 섞이면 기다린다 (A5) */
const WRITE_VERBS = new Set([
  'create', 'update', 'delete', 'remove', 'write', 'post', 'send', 'put', 'patch', 'set', 'add', 'insert', 'upload', 'publish', 'deploy', 'merge', 'close', 'edit', 'rename', 'move', 'copy', 'exec', 'execute', 'run', 'trigger', 'invoke',
  'cancel', 'approve', 'reject', 'share', 'invite', 'revoke', 'grant', 'drop', 'truncate', 'modify', 'replace', 'archive', 'restore', 'reset', 'fork', 'push', 'comment', 'reply', 'mail', 'message', 'star', 'subscribe',
])

export function autoKindOf(tool: string): AutoKind {
  if (EDIT_TOOLS.has(tool)) return 'edit'
  if (tool === 'Bash') return 'command'
  return 'other'
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const minutesOf = (hhmm: string) => {
  const m = hhmm.match(HHMM)!
  return Number(m[1]) * 60 + Number(m[2])
}

/** 고른 기간을 저장할 설정으로 바꾼다. 맞지 않는 값이면 null */
export function planToConfig(plan: AutoApprovePlan, now: number): AutoApproveConfig | null {
  const full = plan.isFull ? { isFull: true } : {}
  if (plan.mode === 'off') return { mode: 'off', ...full }
  if (plan.mode === 'hours') {
    const h = plan.hours
    if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0 || h > 24) return null
    return { mode: 'hours', until: now + Math.round(h * 3600_000), ...full }
  }
  if (plan.mode === 'daily') {
    const start = plan.start ?? AUTO_DAILY_DEFAULT.start
    const end = plan.end ?? AUTO_DAILY_DEFAULT.end
    if (!HHMM.test(start) || !HHMM.test(end) || start === end) return null
    return { mode: 'daily', start, end, ...full }
  }
  return null
}

/**
 * 지금 자동결재가 켜져 있는지와 끝나는 시각. 매일 시간대는 자정을 넘겨도 된다(23:00–08:00).
 * 시간대 밖이면 다음 시작 시각(startsAt)을 알려 준다
 */
export function autoWindow(config: AutoApproveConfig, now: number): { isActive: boolean; endsAt: number | null; startsAt: number | null } {
  if (config.mode === 'off') return { isActive: false, endsAt: null, startsAt: null }
  if (config.mode === 'hours') return now < config.until ? { isActive: true, endsAt: config.until, startsAt: null } : { isActive: false, endsAt: null, startsAt: null }
  const d = new Date(now)
  const at = (dayOffset: number, minutes: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, Math.floor(minutes / 60), minutes % 60).getTime()
  const start = minutesOf(config.start)
  const end = minutesOf(config.end)
  // 자정부터 지난 시간(서머타임 때 한 시간 어긋남)이 아니라 지금 시각의 시·분으로 비교한다 (M3)
  const nowMin = d.getHours() * 60 + d.getMinutes()
  if (start < end) {
    if (nowMin >= start && nowMin < end) return { isActive: true, endsAt: at(0, end), startsAt: null }
    return {
      isActive: false,
      endsAt: null,
      startsAt: nowMin < start ? at(0, start) : at(1, start),
    }
  }
  // 자정을 넘기는 시간대: 오늘 start 이후이거나 end 이전
  if (nowMin >= start) return { isActive: true, endsAt: at(1, end), startsAt: null }
  if (nowMin < end) return { isActive: true, endsAt: at(0, end), startsAt: null }
  return { isActive: false, endsAt: null, startsAt: at(0, start) }
}

/**
 * 시간이 흐를 때의 전환: 시간대에 들어가면 'start'(수를 0부터), 나가면 'end'(요약). N시간이 지났으면 설정을 끈다.
 * wasActive = 지난번에 켜져 있었는지
 */
export function autoStep(config: AutoApproveConfig, wasActive: boolean, now: number): { config: AutoApproveConfig; isActive: boolean; event: 'start' | 'end' | null } {
  const w = autoWindow(config, now)
  const event = w.isActive && !wasActive ? 'start' : !w.isActive && wasActive ? 'end' : null
  return { config: config.mode === 'hours' && !w.isActive ? { mode: 'off', ...(config.isFull ? { isFull: true } : {}) } : config, isActive: w.isActive, event }
}

/** 남은 시간 "3시간 12분" / "8분" */
export function formatRemaining(ms: number) {
  const totalMin = Math.max(0, Math.ceil(ms / 60_000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h ? t('time.hours', { h }) + (m ? ` ${t('time.minutes', { m })}` : '') : t('time.minutes', { m })
}

/** 끝났을 때 요약 문장 */
export function autoSummaryText(counts: { edit: number; command: number; other: number; waiting: number; answered: number }) {
  const total = counts.edit + counts.command + counts.other
  const parts = [counts.edit && t('auto.part.edit', { n: counts.edit }), counts.command && t('auto.part.command', { n: counts.command }), counts.other && t('auto.part.other', { n: counts.other })].filter(Boolean)
  return t('auto.summary', { total, parts: parts.length ? `(${parts.join('·')})` : '', waiting: counts.waiting, answered: counts.answered })
}
