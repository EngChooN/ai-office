// 자동결재(대표 부재 중): 결재 요청을 대신 판정하는 규칙과 켜 둔 기간 계산 — electron 없이 테스트한다
// 대표 결정(2026-10-23): 위험 명령을 뺀 전부 자동 승인. 위험 명령(RISKY_BASH)과 푸시·외부 전송은 대표를 기다린다

import { findRiskyCommand } from './bashPolicy.ts'
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
}

/** 저장하는 설정 (hours는 끝나는 시각으로 바꿔 둔다 — 앱을 다시 켜도 그 시각에 끝난다) */
export type AutoApproveConfig = { mode: 'off' } | { mode: 'hours'; until: number } | { mode: 'daily'; start: string; end: string }

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

const firstNonOpt = (args: string[]) => args.find((a) => !a.startsWith('-'))
/** 이름에 `:`·`-`·`_`로 붙은 배포·게시 낱말이 있으면 true (npm run deploy:prod·build:publish, A3) */
const isOutboundName = (s: string) => s.split(/[:_-]/).some((p) => OUTBOUND_VERBS.has(p))
/** 옵션 이름을 `=` 앞에서 자른다 (--post-data=x → --post-data, A3) */
const optName = (a: string) => a.split('=')[0]
/** 치환·변수·입력 리다이렉트가 있으면 밖으로 데이터를 실어 보낼 수 있다 */
const hasExfilSyntax = (seg: Segment) => seg.hasSubst || /\$[A-Za-z_{]/.test(seg.raw) || seg.raw.includes('<')

/** 인터프리터가 파일·인라인 코드·표준입력으로 임의 코드를 실행하는가 (버전 확인 같은 옵션만이면 아니다) */
function interpreterRuns(args: string[]) {
  if (args.length === 0) return true // 표준입력(파이프)으로 실행
  if (args.some((a) => INLINE_CODE_FLAGS.has(a) || a === '-m')) return true
  return args.some((a) => !a.startsWith('-')) // 파일 인자
}

/** 한 토막이 대표를 기다려야 하는 명령인가 (위험 명령은 findRiskyCommand가 따로 본다) */
function segmentWaits(seg: Segment): boolean {
  const { cmd, args, localScript } = resolveCommand(seg)
  if (!cmd) return false
  // 명령 이름을 변수·명령 치환으로 감추거나 eval·source·. 로 임의 코드를 실행 (M1)
  if (cmd.startsWith('$') || cmd.includes('$(') || cmd.includes('`')) return true
  const name = base(cmd)
  if (name === 'eval' || name === 'source' || name === '.') return true
  if (BUILD_WRAPPERS.has(name)) {
    const sub = firstNonOpt(args)
    return sub ? isOutboundName(sub) : false
  }
  if (localScript) return true // ./deploy.sh 처럼 로컬 파일을 실행
  if (INTERPRETERS.has(name)) return interpreterRuns(args)
  if (PKG.has(name)) {
    // npx·bunx·pnpm dlx·npm exec·yarn dlx·bun x — 임의 패키지를 받아 실행 (A2)
    if (name === 'npx' || name === 'pnpx' || name === 'bunx') return true
    const sub = firstNonOpt(args)
    if (sub === 'dlx' || sub === 'exec' || sub === 'x') return true
    if (sub === 'publish' || sub === 'deploy') return true
    if (sub === 'run') return isOutboundName(args[args.indexOf('run') + 1] ?? '')
    return false
  }
  if (name === 'find') return args.some((a) => ['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprintf', '-fprint', '-fls'].includes(a))
  if (name === 'rsync') return args.some((a) => !a.startsWith('-') && a.includes(':')) // host:/path 로 외부 전송
  if (name === 'git') {
    const { sub, rest } = gitSubcommand(args)
    if (!sub || /[$`]/.test(sub)) return true // 하위 명령을 변수·치환으로 감춤 (M1)
    if (sub === 'push') return true
    if (sub === 'config' && rest.some((a) => a.startsWith('alias.'))) return true // 별칭 정의 (M1)
    return false
  }
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

/** 대표를 기다려야 하는 명령인가 (위험 명령·푸시·외부 전송·스크립트 실행·명령 숨기기). 이어 붙인 명령 중 하나라도 걸리면 true */
export function commandWaits(command: string): boolean {
  if (!command.trim()) return true
  if (findRiskyCommand(command)) return true
  return lexSegments(command).some(segmentWaits)
}

/** 실행 위험 경로에 쓰는 파일인지 (셸 rc·git 훅·.claude·.ssh·CI 설정 등 — H2) */
const DANGEROUS_WRITE = [
  /(^|\/)\.(bash|zsh|prof)[a-z_]*$/i, // .bashrc .zshrc .bash_profile .profile .zprofile .zshenv
  /(^|\/)\.(git\/hooks|claude|ssh|aws|npmrc|pypirc|netrc|config\/gh)(\/|$)/i,
  /(^|\/)\.claude(\/|$)/i,
  /\/\.git\/hooks\//i,
  /(^|\/)(Library\/LaunchAgents|LaunchDaemons)\//i,
  /(^|\/)(crontab|cron\.d)(\/|$)/i,
  /\.github\/workflows\//i,
  /(^|\/)(\.gitlab-ci\.yml|\.circleci\/|azure-pipelines\.yml|Jenkinsfile|\.travis\.yml|bitbucket-pipelines\.yml)/i,
  // A4: git 설정·훅 관리자·디렉터리 환경·에디터 작업
  /(^|\/)\.gitconfig$/i,
  /\/\.git\/config$/i,
  /(^|\/)\.husky(\/|$)/i,
  /(^|\/)\.envrc$/i,
  /\.vscode\/tasks\.json$/i,
]
/** 홈 바로 밑 셸 rc 도 본다 */
function isDangerousWritePath(p: string, content: string) {
  if (DANGEROUS_WRITE.some((re) => re.test(p))) return true
  // #! 로 시작하는(실행되는) 파일
  if (content.trimStart().startsWith('#!')) return true
  return false
}

/**
 * 자동결재 판정: 'allow'면 대표 대신 승인, 'wait'면 평소처럼 결재함에서 대표를 기다린다.
 * 대기 = 위험 명령 · 푸시·외부 전송 · 스크립트 실행 · 실행 위험 경로 쓰기 · 화면 캡처. 질문(AskUserQuestion)은 따로 답한다
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
  if (plan.mode === 'off') return { mode: 'off' }
  if (plan.mode === 'hours') {
    const h = plan.hours
    if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0 || h > 24) return null
    return { mode: 'hours', until: now + Math.round(h * 3600_000) }
  }
  if (plan.mode === 'daily') {
    const start = plan.start ?? AUTO_DAILY_DEFAULT.start
    const end = plan.end ?? AUTO_DAILY_DEFAULT.end
    if (!HHMM.test(start) || !HHMM.test(end) || start === end) return null
    return { mode: 'daily', start, end }
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
  return { config: config.mode === 'hours' && !w.isActive ? { mode: 'off' } : config, isActive: w.isActive, event }
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
