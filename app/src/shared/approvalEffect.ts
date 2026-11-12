// 결재 카드 제목의 "결과 한 줄": 도구 입력을 사람이 읽는 효과 문장(키+인자)으로 (electron 없이 테스트한다)
// 확실히 풀 수 있을 때만 만들고, 조금이라도 애매하면 null — 틀린 해설은 원문보다 위험하다. 허용 판정에는 쓰지 않는다 (규칙·일회 허용은 summary)

import { tk, tr, trOr, type I18nText } from './i18n/index.ts'
import { base, lexSegments, resolveCommand, type Segment } from './commandScan.ts'
import { maskSecrets } from './redact.ts'
import { uiEffect } from './approvalEffectUi.ts'
import { hintVerbs, verbList } from './approvalGuess.ts'
import type { Approval } from './types'

/** 이보다 긴 경로는 문장으로 만들지 않는다 (잘라 놓은 경로는 다른 파일처럼 읽힌다) */
const PATH_MAX = 200
/** 검색어·패턴·스크립트 이름 길이 상한 (넘으면 자르지 않고 null) */
const TEXT_MAX = 80

/** 이 결재가 하는 일을 한 문장으로. 풀 수 없으면 null (화면은 원문 그대로) */
export function effectOf(toolName: string, input: Record<string, unknown>): I18nText | null {
  switch (toolName) {
    case 'Write':
      return fileEffect('approval.effect.fileWrite', input.file_path)
    case 'Edit':
    case 'MultiEdit':
      return fileEffect('approval.effect.fileEdit', input.file_path)
    case 'NotebookEdit':
      return fileEffect('approval.effect.fileEdit', input.notebook_path)
    case 'Read':
      return isPath(input.file_path) ? tk(SECRET_PATH.test(input.file_path) ? 'approval.effect.readSecret' : 'approval.effect.read', { path: maskSecrets(input.file_path) }) : null
    case 'Glob':
      return isText(input.pattern) ? tk('approval.effect.glob', { pattern: maskSecrets(input.pattern) }) : null
    case 'Grep':
      return isText(input.pattern) ? tk('approval.effect.grep', { pattern: maskSecrets(input.pattern) }) : null
    case 'WebSearch':
      return isText(input.query) ? tk('approval.effect.webSearch', { query: maskSecrets(input.query) }) : null
    case 'WebFetch': {
      const host = typeof input.url === 'string' ? hostOf(input.url) : null
      return host ? tk('approval.effect.webFetch', { host }) : null
    }
    case 'Bash':
      return typeof input.command === 'string' ? bashEffect(input.command) : null
    default:
      return uiEffect(toolName, input)
  }
}

/** 결과를 미리 알 수 없다고 솔직히 말하는 문장의 키 접두 — 이런 줄 옆에서는 원문을 접지 않는다 */
const UNKNOWN_PREFIX = 'approval.effect.unknown.'
export const effectKeepsRawOpen = (e: I18nText) => e.key.startsWith(UNKNOWN_PREFIX)

/** 비밀이 들어 있을 수 있는 파일 경로 (읽기 결재에서 따로 알린다) */
const SECRET_PATH = /(^|\/)\.env(\.|$)|(^|\/)\.(ssh|aws|gnupg|kube|docker)\/|(^|\/)(id_rsa|id_ed25519|id_ecdsa)|(^|\/)\.(npmrc|netrc|pgpass)$|\.(pem|key|p12|pfx)$|credentials|secrets?\.(json|ya?ml|toml)$/i

/** 한 줄 글만 들어가는 곳(알림 제목·펫 말풍선)의 제목: 효과 문장 → 번역 원문 → 원문 */
export const approvalHeadline = (a: Pick<Approval, 'summary' | 'summaryI18n' | 'effectI18n'>) => (a.effectI18n ? tr(a.effectI18n) : trOr(a.summaryI18n, a.summary))

const fileEffect = (key: 'approval.effect.fileWrite' | 'approval.effect.fileEdit', path: unknown) => (isPath(path) ? tk(key, { path: maskSecrets(path) }) : null)

export const isPath = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= PATH_MAX && !HIDDEN_CHARS.test(v)
export const isText = (v: unknown, max = TEXT_MAX): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= max && !HIDDEN_CHARS.test(v)

/** 화면에서 안 보이거나 글 순서·줄을 바꾸는 글자(제어문자·양방향 제어·폭 없는 글자) — 문장에 넣으면 실제와 다르게 읽힌다 */
export const HIDDEN_CHARS = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/

/** http(s) 주소의 호스트만 (경로·쿼리·계정 정보는 비밀이 섞일 수 있어 문장에 넣지 않는다) */
export function hostOf(url: string): string | null {
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? u.hostname : null
  } catch {
    return null
  }
}

/** 셸이 무언가를 펼치거나 잇는 글자 — 따옴표 밖에 하나라도 있으면 풀지 않는다 (파이프·연결·리다이렉트·치환·변수·글롭·중괄호·~·백그라운드·주석) */
const SHELL_META = /[|;&()<>{}$`*?[\]~!#\n\\]/

/** 따옴표 밖 글자만 남긴다. 큰따옴표 안의 $·백틱·\ 는 펼쳐지므로 null */
export function unquoted(cmd: string): string | null {
  let out = ''
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]
    if (c === "'" || c === '"') {
      const end = cmd.indexOf(c, i + 1)
      if (end < 0) return null
      if (c === '"' && /[$`\\]/.test(cmd.slice(i + 1, end))) return null
      i = end
      out += ' '
    } else out += c
  }
  return out
}

/** 규칙 문장 → (못 풀면) 글자에서 찾은 위험 동작 줄 → null */
function bashEffect(command: string): I18nText | null {
  if (HIDDEN_CHARS.test(command)) return null
  const rule = bashRule(command)
  if (rule) return rule
  const verbs = hintVerbs(command)
  return verbs.length ? tk('approval.effect.unknown.hint', { verbs: verbList(verbs) }) : null
}

function bashRule(command: string): I18nText | null {
  const bare = unquoted(command)
  if (bare === null) return null
  // 파이프만 있는 경우: 읽기 전용 명령끼리 이은 것이면 "읽기만" (목록이 보증한다)
  if (SHELL_META.test(bare)) return PIPE_ONLY.test(bare) && !SHELL_META_NO_PIPE.test(bare) && isReadOnlyChain(lexSegments(command)) ? tk('approval.effect.readOnly') : null
  const segs = lexSegments(command)
  if (segs.length !== 1 || segs[0].hasSubst) return null
  const { cmd, args, localScript, via, assigns } = resolveCommand(segs[0])
  // sudo·env·xargs 같은 앞말, 변수 대입은 효과를 단정할 수 없다
  if (!cmd || via.length || assigns.length) return null
  if (localScript) return isText(cmd) ? tk('approval.effect.unknown.script', { name: maskSecrets(cmd) }) : null
  const name = base(cmd)
  if (INTERPRETERS.has(name)) return interpreterEffect(name, args)
  if (READ_ONLY.has(name) && isReadOnlyArgs(name, args)) return tk('approval.effect.readOnly')
  const run = COMMANDS[name]
  return run ? run(args) : null
}

/** 파일을 읽거나 목록만 보는 명령 (쓰기·실행 옵션이 있는 sort -o·rg --pre·find·awk·sed 등은 넣지 않는다) */
export const READ_ONLY = new Set(['cat', 'ls', 'grep', 'head', 'tail', 'wc', 'cut', 'tr', 'pwd', 'du', 'df', 'stat', 'file', 'which', 'sort'])
/** sort -o(파일 쓰기)·--compress-program(프로그램 실행)·-T(임시 파일), file -C(매직 파일 컴파일)는 읽기만이 아니다 */
const isReadOnlyArgs = (name: string, args: string[]) =>
  !(name === 'sort' && args.some((a) => /^-[a-zA-Z]*[oT]|^--(output|compress-program|temporary-directory)/.test(a))) &&
  !(name === 'file' && args.some((a) => /^-[a-zA-Z]*C|^--compile/.test(a)))
/** 토막 전부가 앞말·대입·치환 없는 읽기 전용 명령인가 */
export function isReadOnlyChain(segs: Segment[]): boolean {
  return (
    segs.length > 0 &&
    segs.every((seg) => {
      if (seg.hasSubst) return false
      const { cmd, args, localScript, via, assigns } = resolveCommand(seg)
      return !!cmd && !localScript && !via.length && !assigns.length && READ_ONLY.has(base(cmd)) && isReadOnlyArgs(base(cmd), args)
    })
  )
}
const PIPE_ONLY = /\|/
const SHELL_META_NO_PIPE = /[;&()<>{}$`*?[\]~!#\n\\]/

/** 스크립트를 읽어 실행하는 프로그램 — 파일 이름이나 한 줄 코드를 받는다 */
const INTERPRETERS = new Set(['bash', 'sh', 'zsh', 'python', 'python3', 'node', 'ruby', 'perl', 'deno', 'bun'])
const INLINE_FLAGS = new Set(['-c', '-e', '--eval', '-p', '--print'])
function interpreterEffect(name: string, args: string[]): I18nText | null {
  if (!args.length) return null
  if (INLINE_FLAGS.has(args[0])) return tk('approval.effect.unknown.inlineCode', { name })
  const file = args[0]
  return !file.startsWith('-') && isText(file) ? tk('approval.effect.unknown.script', { name: maskSecrets(`${name} ${file}`) }) : null
}

const COMMANDS: Record<string, (args: string[]) => I18nText | null> = {
  rm: rmEffect,
  unlink: (args) => (args.length === 1 && !args[0].startsWith('-') && isPath(args[0]) ? tk('approval.effect.rmOne', { path: maskSecrets(args[0]) }) : null),
  rmdir: (args) => pathsEffect(args, /^$/, 'approval.effect.rmdir', 'approval.effect.rmdirMany'),
  mkdir: (args) => pathsEffect(args, /^-[pv]+$/, 'approval.effect.mkdir', 'approval.effect.mkdirMany'),
  touch: (args) => pathsEffect(args, /^$/, 'approval.effect.touch', 'approval.effect.touchMany'),
  mv: (args) => moveEffect(args, false),
  cp: (args) => moveEffect(args, true),
  // 전역 옵션(-c·-C·--git-dir 등)은 도착지·저장소를 바꿀 수 있어 하위 명령이 맨 앞일 때만 푼다
  git: (args) => {
    const run = GIT[args[0] ?? '']
    return run ? run(args.slice(1)) : null
  },
  curl: curlEffect,
  npm: scriptRunEffect('npm'),
  pnpm: scriptRunEffect('pnpm'),
  yarn: scriptRunEffect('yarn'),
  wget: wgetEffect,
}

/** 옵션(아는 것만)과 경로 여러 개: 하나면 one, 여럿이면 "첫 대상 등 n개" */
function pathsEffect(args: string[], flags: RegExp, one: 'approval.effect.rmdir' | 'approval.effect.mkdir' | 'approval.effect.touch', many: 'approval.effect.rmdirMany' | 'approval.effect.mkdirMany' | 'approval.effect.touchMany'): I18nText | null {
  const paths: string[] = []
  for (const a of args) {
    if (a.startsWith('-')) {
      if (!flags.test(a)) return null
    } else paths.push(a)
  }
  if (!paths.length || !paths.every(isPath)) return null
  const path = maskSecrets(paths[0])
  return paths.length === 1 ? tk(one, { path }) : tk(many, { path, n: paths.length })
}

/** mv·cp <대상…> <도착>. -f·-i·-n 중 마지막이 -n이면 덮어쓰지 않는다, cp -r·-R·-a는 폴더째 */
function moveEffect(args: string[], isCopy: boolean): I18nText | null {
  let clobber = ''
  let recursive = false
  const paths: string[] = []
  for (const a of args) {
    if (/^-[fivn]+$/.test(a) || (isCopy && /^-[fivnrRap]+$/.test(a))) {
      // 묶음(-fn)도 앞에서부터: 나중 것이 앞의 것을 덮는다 (man mv: -f overrides any previous -i or -n)
      for (const ch of a.slice(1)) if (ch === 'f' || ch === 'i' || ch === 'n') clobber = ch
      recursive ||= /[rRa]/.test(a)
    } else if (a.startsWith('-')) return null
    else paths.push(a)
  }
  if (paths.length < 2 || !paths.every(isPath)) return null
  const src = maskSecrets(paths[0])
  const dst = maskSecrets(paths[paths.length - 1])
  const verb = isCopy ? (recursive ? 'cpDir' : 'cp') : 'mv'
  const tail = clobber === 'n' ? 'Keep' : ''
  if (paths.length === 2) return tk(`approval.effect.${verb}${tail}` as TKeyOf<'approval.effect.'>, { src, dst })
  return tk(`approval.effect.${verb}Many${tail}` as TKeyOf<'approval.effect.'>, { src, dst, n: paths.length - 1 })
}
type TKeyOf<P extends string> = Extract<Parameters<typeof tk>[0], `${P}${string}`>

/** npm|pnpm|yarn run <이름> · npm test|start — 이 폴더의 스크립트를 돌린다 */
function scriptRunEffect(tool: string) {
  return (args: string[]): I18nText | null => {
    const [sub, name] = args
    const label = sub === 'run' && name && !name.startsWith('-') ? `${tool} run ${name}` : ['test', 'start'].includes(sub ?? '') ? `${tool} ${sub}` : null
    return label && isText(label) ? tk('approval.effect.unknown.script', { name: maskSecrets(label) }) : null
  }
}

const GIT: Record<string, (args: string[]) => I18nText | null> = {
  push: gitPushEffect,
  commit: gitCommitEffect,
  add: gitAddEffect,
  pull: gitPullEffect,
  reset: gitResetEffect,
  clean: gitCleanEffect,
}

/** git commit -m "…" [-a] [--amend] [-q]. 그 밖의 옵션(--no-verify 등)은 null */
function gitCommitEffect(args: string[]): I18nText | null {
  let all = false
  let amend = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-m' || a === '--message') {
      if (args[++i] === undefined) return null
    } else if (a === '-a' || a === '--all') all = true
    else if (a === '--amend') amend = true
    else if (a === '-q' || a === '--quiet' || a === '-v') continue
    else if (/^-[am]+$/.test(a) && a.endsWith('m')) {
      all ||= a.includes('a')
      if (args[++i] === undefined) return null
    } else return null
  }
  return tk(amend ? 'approval.effect.gitCommitAmend' : all ? 'approval.effect.gitCommitAll' : 'approval.effect.gitCommit')
}

/** git add <경로…> · git add . / -A */
function gitAddEffect(args: string[]): I18nText | null {
  if (args.length === 1 && ['.', '-A', '--all'].includes(args[0])) return tk('approval.effect.gitAddAll')
  if (!args.length || args.some((a) => a.startsWith('-')) || !args.every(isPath)) return null
  const path = maskSecrets(args[0])
  return args.length === 1 ? tk('approval.effect.gitAdd', { path }) : tk('approval.effect.gitAddMany', { path, n: args.length })
}

/** git pull <원격> [<브랜치>]. 인자가 없으면 어디서 받는지 입력만으로 몰라 null */
function gitPullEffect(args: string[]): I18nText | null {
  if (args.some((a) => a.startsWith('-') || a.includes(':')) || args.length < 1 || args.length > 2) return null
  const [remote, branch] = args
  return branch ? tk('approval.effect.gitPullBranch', { remote, branch }) : tk('approval.effect.gitPull', { remote })
}

/** git reset --hard [<기록>]만 — 저장 안 한 변경을 버린다. 다른 reset은 null */
function gitResetEffect(args: string[]): I18nText | null {
  if (args[0] !== '--hard' || args.length > 2) return null
  const ref = args[1]
  if (ref === undefined) return tk('approval.effect.gitResetHard')
  return /^[\w./~^@{}-]{1,60}$/.test(ref) && !ref.startsWith('-') ? tk('approval.effect.gitResetHardTo', { ref }) : null
}

/** git clean -f[d][x|X] · -n(목록만). 경로나 다른 옵션이 붙으면 null */
function gitCleanEffect(args: string[]): I18nText | null {
  if (args.length !== 1 || !/^-[fdxXnq]+$/.test(args[0])) return null
  const f = args[0]
  if (f.includes('n')) return tk('approval.effect.gitCleanDry')
  if (!f.includes('f')) return null
  return tk(/[xX]/.test(f) ? 'approval.effect.gitCleanIgnored' : 'approval.effect.gitClean')
}

/** rm: 플래그는 -r -R -f -v -i (묶음 포함)·긴 이름 몇 개만 안다 */
function rmEffect(args: string[]): I18nText | null {
  let recursive = false
  const paths: string[] = []
  let ended = false
  for (const a of args) {
    if (!ended && a === '--') ended = true
    else if (!ended && /^-[rRfvi]+$/.test(a)) recursive ||= /[rR]/.test(a)
    else if (!ended && (a === '--recursive' || a === '--force' || a === '--verbose')) recursive ||= a === '--recursive'
    else if (!ended && a.startsWith('-')) return null
    else paths.push(a)
  }
  if (!paths.length || !paths.every(isPath)) return null
  const path = maskSecrets(paths[0])
  if (paths.length === 1) return tk(recursive ? 'approval.effect.rmDir' : 'approval.effect.rmOne', { path })
  return tk(recursive ? 'approval.effect.rmDirMany' : 'approval.effect.rmMany', { path, n: paths.length })
}

/** git push [-f|--force|--force-with-lease] [-u] <원격> [<브랜치>]. 원격을 모르거나(인자 없음)·삭제·refspec이면 null */
function gitPushEffect(args: string[]): I18nText | null {
  let force = false
  const pos: string[] = []
  for (const a of args) {
    if (a === '-f' || a === '--force' || a === '--force-with-lease' || a.startsWith('--force-with-lease=')) force = true
    else if (['-u', '--set-upstream', '-v', '--verbose', '-q', '--quiet'].includes(a)) continue
    else if (a.startsWith('-') || a.includes(':') || a.startsWith('+')) return null
    else pos.push(a)
  }
  if (pos.length < 1 || pos.length > 2) return null
  const [remote, branch] = pos
  if (force) return tk('approval.effect.gitPushForce', { target: branch ? `${remote}/${branch}` : remote })
  return branch ? tk('approval.effect.gitPush', { remote, branch }) : tk('approval.effect.gitPushRemote', { remote })
}

/** 값을 다음 낱말로 받는 curl 옵션 중 "보내기"인 것 */
const CURL_SEND_VALUE = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '-F', '--form', '-T', '--upload-file'])
/** 출력·동작에 영향이 없는(읽기 그대로인) curl 플래그 */
const CURL_QUIET = /^-[sSLfI]+$|^--(silent|show-error|location|fail|head|compressed)$/

/** curl <주소> 하나. -o 처럼 모르는 옵션(파일 쓰기 등)이 있으면 null */
function curlEffect(args: string[]): I18nText | null {
  let send = false
  const urls: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (CURL_QUIET.test(a)) continue
    if (a === '-X' || a === '--request') {
      const m = (args[++i] ?? '').toUpperCase()
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) return null
      send ||= m !== 'GET'
    } else if (CURL_SEND_VALUE.has(a)) {
      if (args[++i] === undefined) return null
      send = true
    } else if (a === '-H' || a === '--header') {
      if (args[++i] === undefined) return null
    } else if (a.startsWith('-')) return null
    else urls.push(a)
  }
  const host = urls.length === 1 ? hostOf(urls[0]) : null
  return host ? tk(send ? 'approval.effect.fetchSend' : 'approval.effect.fetchGet', { host }) : null
}

/** wget <주소> 하나 (-q만 안다 — -O 등은 파일을 어디에 쓸지 바뀌어 null) */
function wgetEffect(args: string[]): I18nText | null {
  const urls = args.filter((a) => a !== '-q' && a !== '--quiet')
  if (urls.some((a) => a.startsWith('-'))) return null
  const host = urls.length === 1 ? hostOf(urls[0]) : null
  return host ? tk('approval.effect.fetchGet', { host }) : null
}
