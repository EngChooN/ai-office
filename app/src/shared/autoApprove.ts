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

/** git 전역 옵션 `-c`가 안전 목록 밖의 키이거나 `--config-env`가 있는가 */
function gitRunsConfigCommand(args: string[]) {
  const safe = (kv: string) => GIT_SAFE_CONFIG.test(kv.split('=')[0])
  for (let i = 0; i < args.length && args[i].startsWith('-'); i++) {
    const a = args[i]
    if (a === '--config-env' || a.startsWith('--config-env=')) return true
    if (a === '-c') {
      if (!safe(args[i + 1] ?? '')) return true
      i++
    } else if (a.startsWith('-c') && a.length > 2 && !a.startsWith('--') && !safe(a.slice(2))) return true
    else if (['-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix'].includes(a)) i++
  }
  return false
}

/** 환경 변수 대입 중 다른 프로그램·설정을 실행하게 만드는 것 (GIT_CONFIG_*·LESSOPEN·PAGER·EDITOR·LD_PRELOAD …) */
const DANGEROUS_NAME = /^(GIT_[A-Za-z0-9_]*|LESSOPEN|LESSCLOSE|PAGER|MANPAGER|EDITOR|VISUAL|BASH_ENV|ENV|LD_[A-Z_]+|DYLD_[A-Z_]+|NODE_OPTIONS|PYTHONSTARTUP|PERL5OPT|RUBYOPT|PROMPT_COMMAND)$/
const DANGEROUS_ENV = new RegExp(`${DANGEROUS_NAME.source.slice(0, -2)})=`)
/** 변수 이름을 받는 내장 명령 — `read GIT_SSH_COMMAND`·`export LD_PRELOAD`처럼 `=` 없이도 위험 변수를 건드린다 (PATH 포함) */
const VAR_NAMING_CMDS = new Set(['read', 'export', 'declare', 'typeset', 'readonly', 'local', 'printf', 'unset', 'let', 'mapfile', 'readarray', 'getopts'])
/** 변수 첨자에 든 `$(…)`·백틱 (a[$(git push)]) — 산술 평가 때 실행된다 */
const SUBSCRIPT_INJECTION = /[A-Za-z0-9_]\[[^\]]*(\$\(|`)/
/** 산술식 안이 숫자·연산자뿐인가 (16진수 포함) */
const isLiteralArith = (body: string) => /^[\s0-9+\-*/%()<>=!&|^~?:,]*$/.test(body.replace(/\b0[xX][0-9a-fA-F]+\b/g, '0'))
/** 산술식의 변수가 모두 그 식 안에서 대입·증감되는 것뿐인가 (i++ · i=0). `$`·백틱·`[`가 있거나 읽기만 하는 변수가 있으면 false */
function isSelfContainedArith(body: string) {
  if (/[$`[\]]/.test(body)) return false
  const ids = body.replace(/\b0[xX][0-9a-fA-F]+\b/g, '0').match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
  return ids.every((id) => new RegExp(`(\\+\\+|--)${id}\\b|\\b${id}\\s*(\\+\\+|--|[-+*/%&|^]?=(?!=)|<<=|>>=)`).test(body))
}
const NUM = /^-?\d+$/
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

/** 한 토막이 대표를 기다려야 하는 명령인가 (위험 명령은 findRiskyCommand가 따로 본다) */
function segmentWaits(seg: Segment): boolean {
  // 명령을 실행하게 만드는 환경 변수 대입은 명령 없이 따로 있어도(다음 토막에서 쓰인다) 기다린다
  if (seg.tokens.some((t) => DANGEROUS_ENV.test(t))) return true
  // 산술식 `((…))`: 숫자·연산자뿐이거나 그 식 안에서 대입하는 변수만 허용 (변수 값이 a[$(…)] 이면 평가 때 명령이 실행된다)
  if (seg.tokens[0] === '((') return !(isLiteralArith(seg.tokens[1] ?? '') || isSelfContainedArith(seg.tokens[1] ?? ''))
  // 변수 첨자에 든 $(…)·백틱은 어떤 명령에서든 산술 평가로 실행될 수 있다
  if (seg.tokens.some((t) => SUBSCRIPT_INJECTION.test(t))) return true
  if (writesDangerousPath(seg)) return true
  const { cmd, args, localScript, via } = resolveCommand(seg)
  if (!cmd) return false
  // PATH 앞 대입(PATH=/x git …)은 실행될 프로그램을 바꾼다 (export PATH=… 는 허용)
  const cmdAt = seg.tokens.filter((t) => t !== '').length - args.length - 1
  if (seg.tokens.filter((t) => t !== '').slice(0, Math.max(cmdAt, 0)).some((t) => /^PATH=/.test(t))) return true
  // read·export 등으로 위험 변수 이름을 `=` 없이 건드림 (read GIT_SSH_COMMAND; export LD_PRELOAD), printf -v NAME
  if (VAR_NAMING_CMDS.has(base(cmd)) && args.some((a) => DANGEROUS_NAME.test(a.replace(/^-v/, '')) || (base(cmd) !== 'printf' && /^PATH$/.test(a)) || (base(cmd) === 'printf' && /^(-v)?PATH$/.test(a)))) return true
  // let · declare -i 등 산술 평가 명령
  if (base(cmd) === 'let') return !args.every((a) => isLiteralArith(a) || isSelfContainedArith(a))
  if (['declare', 'typeset', 'local'].includes(base(cmd)) && args.some((a) => /^-[A-Za-z]*i/.test(a))) return true
  // [[ x -eq 1 ]]: 산술 비교의 피연산자가 숫자 글자가 아니면 변수 값이 평가된다
  if (cmd === '[[') {
    const t = seg.tokens
    for (let k = 0; k < t.length; k++) if (ARITH_TEST_OPS.has(t[k]) && !(NUM.test(t[k - 1] ?? '') && NUM.test(t[k + 1] ?? ''))) return true
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
    // pnpm --filter x exec … 처럼 옵션 값이 앞에 와도 놓치지 않게 낱말 전체를 본다. npm explore·create·init <패키지> 도 임의 코드를 실행한다
    if (args.some((a) => ['dlx', 'exec', 'x', 'explore', 'create', 'publish', 'deploy'].includes(a))) return true
    if ((args.includes('pkg') && args.some((a) => ['set', 'delete', 'fix'].includes(a))) || (['config', 'set'].includes(sub ?? '') && !args.some((a) => ['get', 'list', 'ls'].includes(a)))) return true // package.json 스크립트·npm 설정(script-shell 등) 변경
    if (args.includes('init') && args.length > args.indexOf('init') + 1 && !args[args.indexOf('init') + 1].startsWith('-')) return true
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
    if (args.some((a) => /^--(upload-pack|receive-pack|exec|upload-archive|extcmd)/.test(a) || a.includes('ext::'))) return true // 외부 프로그램·ext 전송
    if (sub === 'clone' && rest.some((a) => /^-[A-Za-z]*u/.test(a))) return true // clone -u = --upload-pack
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
  if (name === 'awk' || name === 'gawk') return args.some((a) => /system|getline|(^|[^|])\|([^|]|$)|^-f|^--(file|source|include|load)|^-[il]$|@(include|load)/.test(a)) // system()·파이프로 명령 실행
  if (name === 'sed') return args.some((a) => /(^|[;{}\s])\d*\$?e(\s|$)|\/[a-zA-Z]*e[a-zA-Z]*$/.test(a)) // e 명령·s///e 는 셸을 실행한다
  if (name === 'sqlite3') return seg.piped || seg.raw.includes('<') || args.some((a) => /(^|[\s;])\.[a-z]/i.test(a) || a === '-init') // .shell·.system 등 점 명령과 표준입력
  if (name === 'tar') return args.some((a, i) => /^--(use-compress-program|to-command|checkpoint-action|info-script|new-volume-script|rmt-command|rsh-command)/.test(a) || /^-[A-Za-z]*[IF]/.test(a) || (i === 0 && !a.startsWith('-') && /[IF]/.test(a)))
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
const FILE_WRITERS = new Set(['tee', 'cp', 'mv', 'ln', 'install', 'sed', 'touch', 'truncate', 'dd', 'rsync', 'patch', 'tar', 'unzip', 'zip'])
/** 리다이렉트 대상이나 파일 쓰는 명령의 인자가 실행 위험 경로인가 (.git/config·hooks/·info/ 직접 쓰기 포함) */
function writesDangerousPath(seg: Segment) {
  const toks = seg.tokens.filter((t) => t !== '')
  for (let k = 0; k < toks.length; k++) {
    const m = REDIRECT_OUT.exec(toks[k])
    if (!m) continue
    const target = m[1] || toks[k + 1] || ''
    if (!/^(\d+|-)$/.test(target) && isDangerousWritePath(target, '')) return true
  }
  const { cmd, args } = resolveCommand(seg)
  if (cmd && FILE_WRITERS.has(base(cmd))) return args.some((a) => !a.startsWith('-') && isDangerousWritePath(a.replace(/^of=/, ''), ''))
  return false
}

/** 대표를 기다려야 하는 명령인가 (위험 명령·푸시·외부 전송·스크립트 실행·명령 숨기기). 이어 붙인 명령 중 하나라도 걸리면 true */
export function commandWaits(command: string): boolean {
  if (!command.trim()) return true
  if (findRiskyCommand(command)) return true
  const segs = lexSegments(command)
  // 글자 그대로 남긴 $(…)·백틱(따옴표·이스케이프 속)이 있고 산술 평가가 될 만한 문맥도 있으면 변수 경유 우회로 보고 기다린다
  if (segs.some((s) => s.literalSubst) && ARITH_CONTEXT.test(command)) return true
  return segs.some(segmentWaits)
}

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
  const p = rawPath.replace(/\\/g, '/') // 윈도우 역슬래시 경로도 같은 규칙으로 본다
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
