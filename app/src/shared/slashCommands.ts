// /명령어: 직원 세션이 알려 준 명령 목록을 앱에서 쓸 것만 추리고, 보낸 글이 어떤 명령인지 판정한다
// main(지시 전달)·PC 화면·휴대폰 자동완성이 같은 함수를 쓴다 (electron 없이 테스트한다)
import type { Lang } from './i18n/index.ts'

/** 자동완성 한 줄 — 스냅샷 staffCommands[직원 id]로 PC 화면·휴대폰(remote v2)에 같이 간다 */
export interface StaffCommand {
  /** 앞의 / 없이 (예: 'compact', 'review', 'my-skill', 'plugin:cmd') */
  name: string
  /** 세션이 알려 준 원문 설명 (대개 영어) */
  description: string
  /** 앱 언어로 보여 줄 설명 — 기본 명령은 사전, 스킬·커스텀 명령은 번역 캐시. 번역 전·실패면 원문과 같다 */
  localizedDescription: string
  /** 인자 힌트 (예: '<file>'), 없으면 '' */
  argumentHint: string
  /** Claude Code 기본 명령이면 true, 스킬·.claude/commands·플러그인이면 false */
  isBuiltin: boolean
}

/** SDK supportedCommands() 한 줄 (SDK 타입에 묶이지 않게 쓰는 칸만) */
export interface RawCommand {
  name: string
  description: string
  argumentHint: string
  aliases?: string[]
  builtin?: boolean
}

/** 앱에서 그대로 쓸 수 있는 기본 명령 — 나머지 기본 명령은 목록에서 빼고, 직접 치면 안내만 한다 */
export const APP_BUILTINS = new Set([
  'compact', 'clear', 'init', 'review', 'security-review', 'pr-comments', 'context', 'goal',
  // 작업형 명령 (스킬이 builtin으로 온다)
  'deep-research', 'dataviz', 'verify', 'debug', 'code-review', 'simplify', 'batch', 'schedule', 'claude-api', 'workflow-authoring', 'run',
  'run-skill-generator', 'plugin-authoring', 'design-sync', 'insights', 'recap', 'team-onboarding', 'skill-doctor', 'list-agents',
  // 안전한 설정 명령 (앱의 결재를 우회하지 않는 것만)
  'reload-skills', 'reload-plugins', 'autocompact', 'doctor', 'output-style',
  // 앱 설정에 연결하는 명령 (SETTING_COMMANDS)
  'model', 'effort', 'fast', 'advisor',
])

/** 앱 설정으로 처리하는 명령 — /model은 직원 모델을 바꾸고, 나머지는 앱에 대응 설정이 없어 안내만 한다 (Claude 직원만) */
export const SETTING_COMMANDS = new Set(['model', 'effort', 'fast', 'advisor'])

/** 세션이 인자 안내를 비워 보내지만 인자가 꼭 필요한 기본 명령 — 목록에서 Enter가 바로 보내지 않고 채우기만 하게 */
const BUILTIN_HINTS: Record<string, string> = { goal: '<condition>' }

/**
 * 목록을 받기 전에도 막는 기본 명령 — 로그인·설정·터미널 화면 전용이거나 앱이 따로 관리하는 것(모델·권한·장비).
 * 목록을 받은 뒤에는 isBuiltin이면서 APP_BUILTINS에 없는 것도 막는다
 */
export const BLOCKED_COMMANDS = new Set([
  'login', 'logout', 'config', 'settings', 'theme', 'vim', 'terminal-setup', 'exit', 'quit', 'ide', 'install-github-app', 'install-slack-app',
  'mcp', 'permissions', 'allowed-tools', 'hooks', 'agents', 'statusline', 'status', 'resume', 'continue', 'rewind', 'checkpoint',
  'add-dir', 'memory', 'export', 'upgrade', 'bug', 'feedback', 'privacy-settings', 'release-notes', 'plugin', 'plugins', 'migrate-installer', 'keybindings',
  'sandbox', 'help', 'tasks', 'bashes', 'todos', 'rename', 'copy', 'mobile', 'desktop', 'chrome', 'remote-env', 'login-method', 'extra-usage', 'usage', 'cost',
  // 앱의 결재를 우회할 수 있어 막는 설정 명령 (목록을 받기 전에도 같게)
  'update-config', 'fewer-permission-prompts', 'auto-mode-setup', 'import',
  // 끝없이 되풀이하는 작업(5분 주기 등)을 세션 안에 만들어 앱이 모르는 사이 토큰을 쓰고, 앱에서는 끌 방법이 없어서 막는다 (/proactive는 별칭)
  'loop', 'proactive',
])

const CLEAR_ALIASES = new Set(['clear', 'reset', 'new'])

/** 세션 목록 → 자동완성 목록: 막힌 기본 명령·터미널 전용 명령을 빼고, 같은 이름은 기본 명령 쪽 하나만(실제로 실행되는 쪽) 남긴다 */
export function toStaffCommands(raw: RawCommand[], terminalOnly: string[] = []): StaffCommand[] {
  const terminal = new Set(terminalOnly)
  const nameOf = (c: RawCommand) => c.name.replace(/^\//, '').trim()
  // 기본 명령과 이름이 겹치는 커스텀 명령은 실행되지 않으므로 뺀다 (slashAction과 같은 기준)
  const builtinNames = new Set(raw.filter((c) => c.builtin).map(nameOf))
  const byName = new Map<string, StaffCommand>()
  for (const c of raw) {
    const name = nameOf(c)
    if (!name || terminal.has(name) || byName.has(name)) continue
    const isBuiltin = c.builtin === true
    if (isBuiltin ? !APP_BUILTINS.has(name) : builtinNames.has(name)) continue
    const description = (c.description ?? '').trim()
    const argumentHint = (c.argumentHint ?? '').trim() || (isBuiltin ? (BUILTIN_HINTS[name] ?? '') : '')
    byName.set(name, { name, description, localizedDescription: description, argumentHint, isBuiltin })
  }
  return [...byName.values()].sort((a, b) => Number(b.isBuiltin) - Number(a.isBuiltin) || a.name.localeCompare(b.name))
}

/** 글이 /명령으로 시작하면 이름과 나머지. 경로(/Users/…)·빈 / 는 명령이 아니다 */
export function parseSlash(text: string): { name: string; args: string } | null {
  const m = text.trimStart().match(/^\/([A-Za-z0-9][\w.:-]*)(?=\s|$)([\s\S]*)$/)
  return m ? { name: m[1], args: m[2].trim() } : null
}

export type SlashAction =
  /** 명령이 아님 — 평소 지시 */
  | { kind: 'none' }
  /** 세션에 그대로 보낸다 (스킬·커스텀 명령·/compact 등. 목록에 없는 /이름도 그대로) */
  | { kind: 'pass'; name: string }
  /** 앱의 세션 초기화(새 대화)로 처리 */
  | { kind: 'clear' }
  /** 앱 설정으로 처리 (/model 등) — 세션에 보내지 않는다. args는 명령 뒤 글 */
  | { kind: 'setting'; name: 'model' | 'effort' | 'fast' | 'advisor'; args: string }
  /** 앱에서 쓸 수 없는 기본 명령 — 보내지 않고 안내만 */
  | { kind: 'blocked'; name: string }

/**
 * 보낸 글 판정. commands는 이 직원 세션의 원본 목록(있으면 별칭·기본 명령 여부를 본다).
 * 기본 명령이 같은 이름을 가지면 그쪽이 실행되므로, 커스텀 명령과 이름이 겹쳐도 막는다
 */
export function slashAction(text: string, raw: RawCommand[] = [], provider: 'claude' | 'codex' = 'claude'): SlashAction {
  const parsed = parseSlash(text)
  if (!parsed) return { kind: 'none' }
  const typed = parsed.name
  const builtin = raw.find((c) => c.builtin && (c.name === typed || c.aliases?.includes(typed)))
  const name = builtin?.name ?? typed
  if (CLEAR_ALIASES.has(name) && (builtin || name === 'clear')) return { kind: 'clear' }
  if (SETTING_COMMANDS.has(name)) {
    // 설정 명령은 Claude 직원만 — Codex 직원에게는 앱이 모델을 따로 관리하므로 안내만. 목록 수신 전(raw 없음)에도 같게
    if (provider === 'codex') return { kind: 'blocked', name: typed }
    if (builtin || !raw.length) return { kind: 'setting', name: name as 'model' | 'effort' | 'fast' | 'advisor', args: parsed.args }
  }
  if (BLOCKED_COMMANDS.has(name) && (builtin || !raw.some((c) => c.name === name))) return { kind: 'blocked', name: typed }
  if (builtin && !APP_BUILTINS.has(name)) return { kind: 'blocked', name: typed }
  return { kind: 'pass', name }
}

/** /model 뒤 글 → 직원 모델. 앱이 아는 별칭(default·opus·sonnet·haiku, 대소문자 무관)만 받고 나머지는 null */
export const CLAUDE_MODEL_CHOICES = ['default', 'opus', 'sonnet', 'haiku'] as const
export function parseModelArg(args: string): (typeof CLAUDE_MODEL_CHOICES)[number] | null {
  const v = args.trim().toLowerCase()
  return CLAUDE_MODEL_CHOICES.find((m) => m === v) ?? null
}

/**
 * 목록에서 Enter 한 번에 바로 보낼 명령인가 — 꼭 넣어야 하는 인자가 없으면 true.
 * 인자 안내가 비었거나, 'optional'이 들어 있거나(/compact의 `<optional custom summarization instructions>`),
 * 전부 [ ]로 감싼 선택 인자면(/clear의 `[name]`, `[<condition> | clear]`) 바로 보낸다. `<path>`·`key=value`는 채우기만
 */
export function runsOnEnter(c: Pick<StaffCommand, 'argumentHint'>): boolean {
  let hint = c.argumentHint.trim()
  if (/optional/i.test(hint)) return true
  // 안쪽 [ ]부터 지워 겹친 대괄호([prompt-audit [<path>]])도 선택 인자로 본다
  while (/\[[^[\]]*\]/.test(hint)) hint = hint.replace(/\[[^[\]]*\]/g, '')
  return hint.trim() === ''
}

/** 자동완성 거르기: '/' 뒤에 친 글자로 이름 앞부분 일치 → 이름 안 일치 → 설명 일치 순 */
export function matchCommands(commands: StaffCommand[], query: string, limit = 50): StaffCommand[] {
  const q = query.replace(/^\//, '').toLowerCase()
  if (!q) return commands.slice(0, limit)
  // 친 이름이 막힌 명령이면 비운다 — 안 비우면 퍼지 매치(/config → /autocompact)가 Enter·Tab으로 엉뚱한 명령을 보낸다. PC·휴대폰 공통
  if (slashAction(`/${q}`).kind === 'blocked') return []
  const rank = (c: StaffCommand) => {
    const n = c.name.toLowerCase()
    if (n.startsWith(q)) return 0
    if (n.includes(q)) return 1
    // 예전 PC가 보낸 목록(휴대폰 원격)에는 localizedDescription이 없을 수 있다 — 없으면 원문 설명으로 (#12)
    if (c.description.toLowerCase().includes(q) || (c.localizedDescription ?? '').toLowerCase().includes(q)) return 2
    return -1
  }
  return commands
    .map((c) => ({ c, r: rank(c) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r)
    .slice(0, limit)
    .map((x) => x.c)
}

// ── 설명 번역: 기본 명령은 사전(slash.desc.*), 스킬·커스텀 명령은 Haiku로 한 번 번역해 DB에 캐시한다 ──

const HANGUL = /[가-힣]/
const KANA = /[぀-ヿ]/
const HAN = /[一-鿿]/

/** 이 설명을 앱 언어로 번역해야 하나 — 빈 설명·글자 없는 설명·이미 그 언어 글자로 쓴 설명은 건너뛴다 */
export function needsTranslation(text: string, lang: Lang): boolean {
  if (!/\p{L}/u.test(text)) return false
  const hasHangul = HANGUL.test(text)
  const hasKana = KANA.test(text)
  const hasHan = HAN.test(text)
  if (lang === 'ko') return !hasHangul
  if (lang === 'ja') return !hasKana
  if (lang === 'zh') return !hasHan || hasKana || hasHangul
  return hasHangul || hasKana || hasHan
}

/** 이번에 번역할 원문 — 기본 명령(사전에 있음)·캐시에 있는(또는 번역 중인) 것·이미 앱 언어인 것을 빼고 중복 없이 */
export function pendingDescriptions(list: StaffCommand[], lang: Lang, isKnown: (text: string) => boolean): string[] {
  const texts = new Set<string>()
  for (const c of list) if (!c.isBuiltin && needsTranslation(c.description, lang) && !isKnown(c.description)) texts.add(c.description)
  return [...texts]
}

const LANG_FOR_PROMPT: Record<Lang, string> = { ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Simplified Chinese' }

/** 목록 단위로 한 번에 묻는 번역 요청 (답은 같은 순서·개수의 JSON 문자열 배열) */
export function translationPrompt(texts: string[], lang: Lang): { system: string; prompt: string } {
  return {
    system:
      `You translate short descriptions of developer commands into ${LANG_FOR_PROMPT[lang]} for a menu in an app. ` +
      'Use plain, easy words. Keep command names, file names, code and placeholders like <file> unchanged. ' +
      'Reply with only a JSON array of strings, in the same order and with the same count as the input.',
    prompt: JSON.stringify(texts),
  }
}

/** Claude 답 → 원문별 번역. 배열이 아니거나 개수가 안 맞으면 하나도 쓰지 않는다 (빈 칸은 건너뜀) */
export function parseTranslations(texts: string[], reply: string): Map<string, string> {
  const out = new Map<string, string>()
  const json = reply.slice(reply.indexOf('['), reply.lastIndexOf(']') + 1)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return out
  }
  if (!Array.isArray(parsed) || parsed.length !== texts.length) return out
  parsed.forEach((v, i) => {
    if (typeof v === 'string' && v.trim()) out.set(texts[i], v.trim())
  })
  return out
}
