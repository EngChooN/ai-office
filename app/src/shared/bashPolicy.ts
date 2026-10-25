// 장비 "읽기 명령 자율"·"위험 명령 금지"가 Bash 명령을 판단하는 규칙
// 장비 목록에는 실제 도구 이름 대신 이 표식을 넣고, 결재 판단(canUseTool)에서 명령 내용을 보고 결정한다

import { base, gitSubcommand, lexSegments, resolveCommand } from './commandScan.ts'

/** allowedTools에 넣는 표식: 읽기만 하는 명령은 결재 없이 */
export const READ_ONLY_BASH = 'Bash:readonly'
/** disallowedTools에 넣는 표식: 되돌리기 어려운 명령은 막는다 (SDK에는 넘기지 않는다) */
export const RISKY_BASH = 'Bash:risky'

/** 사무실 전용 표식인지 (SDK의 도구 목록에는 넘기지 않는다) */
export const isBashPolicyMark = (t: string) => t === READ_ONLY_BASH || t === RISKY_BASH

const READ_ONLY_COMMANDS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find', 'pwd', 'echo', 'which', 'file', 'stat', 'du', 'df', 'tree', 'diff', 'date', 'whoami'])
const READ_ONLY_GIT = new Set(['status', 'diff', 'log', 'show', 'blame', 'rev-parse', 'ls-files'])
// find는 이 옵션으로 파일을 지우거나 명령을 실행할 수 있다
const FIND_WRITE_FLAGS = /(^|\s)-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)\b/
// git diff·log는 결과를 파일로 쓰거나 외부 프로그램을 부를 수 있다
const GIT_WRITE_FLAGS = /(^|\s)--(output|ext-diff)\b/
// 리다이렉트·명령 치환·백그라운드 실행은 읽기라고 볼 수 없다
const UNSAFE_SYNTAX = /[<>`\n]|\$\(|(^|[^&])&($|[^&])/

function isReadOnlySegment(segment: string) {
  const words = segment.trim().split(/\s+/)
  const [cmd, ...args] = words
  if (!cmd) return false
  if (cmd === 'git') {
    const sub = args.find((a) => a !== '--no-pager')
    return sub !== undefined && READ_ONLY_GIT.has(sub) && !GIT_WRITE_FLAGS.test(segment)
  }
  if (cmd === 'find') return !FIND_WRITE_FLAGS.test(segment)
  // A6: 읽기 명령에 섞인 쓰기·실행 옵션을 거른다 (rg --pre = 외부 프로그램 실행, tree -o = 파일 쓰기, date -s = 시계 변경)
  if (cmd === 'rg' && /(^|\s)--pre(-glob)?\b/.test(segment)) return false
  if (cmd === 'tree' && /(^|\s)-[oO]\b/.test(segment)) return false
  if (cmd === 'date' && /(^|\s)(-s|--set)\b/.test(segment)) return false
  return READ_ONLY_COMMANDS.has(cmd)
}

/** 읽기만 하는 명령인지. 파이프·&&·;로 이어 붙였으면 모든 부분이 읽기여야 한다 */
export function isReadOnlyCommand(command: string) {
  if (!command.trim() || UNSAFE_SYNTAX.test(command)) return false
  return command.split(/&&|\|\||[;|]/).every(isReadOnlySegment)
}

const hasFlag = (args: string[], re: RegExp) => args.some((a) => a.startsWith('-') && re.test(a))

/** 한 토막이 위험 명령이면 라벨, 아니면 null. 명령은 이미 낱말로 나뉘어 있다(따옴표·git 전역 옵션 처리됨) */
function riskyOfSegment(cmd: string, args: string[]): string | null {
  const name = base(cmd)
  if (name === 'rm' && (hasFlag(args, /[rRf]/) || args.includes('--recursive') || args.includes('--force'))) return 'rm -r/-f'
  if (name === 'sudo') return 'sudo'
  if (name === 'mkfs' || name.startsWith('mkfs.')) return 'mkfs'
  if (name === 'dd' && args.some((a) => a.startsWith('of='))) return 'dd of='
  if (name === 'git') {
    const { sub, rest } = gitSubcommand(args)
    if (sub === 'push' && (hasFlag(rest, /^-(f|-force)/) || rest.some((a) => a.startsWith('+')))) return 'git push --force'
    if (sub === 'reset' && rest.includes('--hard')) return 'git reset --hard'
    if (sub === 'clean' && hasFlag(rest, /f/)) return 'git clean -f'
    if (sub === 'branch' && rest.includes('-D')) return 'git branch -D'
  }
  return null
}

/** 위험 명령이면 어떤 규칙에 걸렸는지 돌려준다 (이어 붙인 명령 안에 있어도 찾는다) */
export function findRiskyCommand(command: string): string | null {
  for (const seg of lexSegments(command)) {
    const { cmd, args } = resolveCommand(seg)
    if (!cmd) continue
    const label = riskyOfSegment(cmd, args)
    if (label) return label
  }
  return null
}
