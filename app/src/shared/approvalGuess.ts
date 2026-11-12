// 규칙으로 못 푸는 셸 명령에서 "들어 있는 동작"(삭제·보내기·실행…)을 글자로만 찾는다 (electron 없이 테스트한다)
// 결과를 단정하지 않고 위험 방향만 알린다. AI 추정(approvalAiGuess.ts)은 이 낱말에 더할 수만 있고 뺄 수는 없다

import { tk, type I18nArg } from './i18n/index.ts'
import { base, lexSegments, resolveCommand } from './commandScan.ts'
import type { EffectVerb } from './types'

/** 위험한 것부터 — 화면에 이 순서로 보인다 */
export const VERB_ORDER: readonly EffectVerb[] = ['delete', 'send', 'run', 'system', 'install', 'modify', 'create', 'fetch', 'read']
export const isEffectVerb = (v: unknown): v is EffectVerb => typeof v === 'string' && (VERB_ORDER as readonly string[]).includes(v)
export const sortVerbs = (verbs: Iterable<EffectVerb>) => VERB_ORDER.filter((v) => new Set(verbs).has(v))

/** 낱말 목록을 화면 문장의 인자로 ("삭제 · 밖으로 보내기") */
export const verbList = (verbs: readonly EffectVerb[]): I18nArg => ({ list: sortVerbs(verbs).map((v) => tk(`approval.verb.${v}`)), sep: ' · ' })

const DELETE = new Set(['rm', 'unlink', 'shred', 'rmdir', 'srm'])
const MODIFY = new Set(['mv', 'cp', 'tee', 'dd', 'truncate', 'ln', 'rsync'])
const CREATE = new Set(['mkdir', 'touch'])
const SEND = new Set(['scp', 'sftp', 'ftp', 'nc', 'ncat', 'ssh', 'telnet'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'fish', 'python', 'python3', 'node', 'ruby', 'perl', 'deno', 'bun', 'php', 'osascript'])
const RUN = new Set(['eval', 'source', '.', 'npx', 'make', 'exec'])
const SYSTEM = new Set(['chmod', 'chown', 'chgrp', 'kill', 'killall', 'pkill', 'launchctl', 'systemctl', 'service', 'crontab', 'shutdown', 'reboot', 'diskutil', 'mount', 'umount', 'csrutil', 'spctl', 'defaults'])
const PKG = new Set(['npm', 'pnpm', 'yarn', 'bun', 'pip', 'pip3', 'brew', 'apt', 'apt-get', 'gem', 'cargo', 'go'])
const INSTALL_SUB = new Set(['install', 'i', 'add', 'ci', 'upgrade', 'update'])
const CURL_SEND = /^(-d|--data.*|-F|--form.*|-T|--upload-file|--post-data|--post-file)$/
/** sudo에서 값을 다음 토큰으로 받는 옵션 (-u root 등) */
const SUDO_VALUES = new Set(['-u', '-g', '-C', '-h', '-p', '-r', '-t', '-T', '-U', '-D', '-R', '--user', '--group', '--close-from', '--host', '--prompt', '--role', '--type', '--command-timeout', '--other-user', '--chdir', '--chroot'])
/** git 하위 명령 앞에 오는 전역 옵션 중 값을 다음 토큰으로 받는 것 */
const GIT_GLOBAL_VALUES = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env', '--super-prefix'])
const GIT_MODIFY = new Set(['checkout', 'restore', 'stash', 'rebase', 'merge', 'commit', 'add', 'apply', 'cherry-pick', 'revert', 'switch'])

/** 따옴표 안 글자를 지운 원문 (리다이렉트 판정용) */
const outsideQuotes = (raw: string) => raw.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, ' ')
/** 버리는 출력(/dev/null)·표준 출력 합치기(2>&1)를 뺀 뒤에도 > 가 남으면 파일에 쓴다 */
const writesFile = (raw: string) => /(^|[^<])>/.test(outsideQuotes(raw).replace(/&?\d*>>?\s*\/dev\/null|\d*>&\d/g, ' '))

/** 명령 글자에 실제로 있는 동작 낱말. 아무것도 못 찾으면 빈 배열 (안전하다는 뜻이 아니다) */
export function hintVerbs(command: string): EffectVerb[] {
  const found = new Set<EffectVerb>()
  for (const seg of lexSegments(command)) {
    const { cmd, args, via, localScript } = resolveCommand(seg)
    if (via.includes('doas')) found.add('system')
    if (writesFile(seg.raw)) found.add('modify')
    if (!cmd) continue
    const name = base(cmd)
    // sudo는 래퍼 목록에 없어 직접 벗긴다: 관리자 권한 + 안쪽 명령의 동작 (-u root처럼 값을 받는 옵션은 값까지 건너뛴다)
    if (name === 'sudo') {
      found.add('system')
      let k = 0
      while (k < args.length && args[k].startsWith('-')) {
        if (args[k] === '--') {
          k++
          break
        }
        k += SUDO_VALUES.has(args[k]) ? 2 : 1
      }
      if (k < args.length) hintVerbs(args.slice(k).join(' ')).forEach((v) => found.add(v))
      continue
    }
    if (localScript || SHELLS.has(name) || RUN.has(name)) found.add('run')
    if (DELETE.has(name)) found.add('delete')
    if (MODIFY.has(name)) found.add('modify')
    if (CREATE.has(name)) found.add('create')
    if (SEND.has(name)) found.add('send')
    if (SYSTEM.has(name)) found.add('system')
    if ((name === 'sed' || name === 'perl') && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) found.add('modify')
    if (name === 'find') {
      if (args.includes('-delete')) found.add('delete')
      const exec = args.findIndex((a) => a === '-exec' || a === '-execdir' || a === '-ok')
      if (exec >= 0) found.add(DELETE.has(base(args[exec + 1] ?? '')) ? 'delete' : 'run')
    }
    if (name === 'curl' || name === 'wget') {
      const x = args.findIndex((a) => a === '-X' || a === '--request')
      const method = x >= 0 ? (args[x + 1] ?? '').toUpperCase() : 'GET'
      found.add(args.some((a) => CURL_SEND.test(a)) || method !== 'GET' ? 'send' : 'fetch')
    }
    if (PKG.has(name) && INSTALL_SUB.has(args[0] ?? '')) found.add('install')
    if (PKG.has(name) && (args[0] === 'run' || args[0] === 'exec' || args[0] === 'test' || args[0] === 'start')) found.add('run')
    if (name === 'git') {
      // git -C dir·-c k=v 같은 전역 옵션을 건너뛰고 하위 명령을 본다
      let k = 0
      while (k < args.length && args[k].startsWith('-')) k += GIT_GLOBAL_VALUES.has(args[k]) ? 2 : 1
      const sub = args[k] ?? ''
      const rest = args.slice(k + 1)
      if (sub === 'push') found.add('send')
      else if (sub === 'clone' || sub === 'fetch' || sub === 'pull') found.add('fetch')
      else if (sub === 'clean' || sub === 'rm' || (sub === 'reset' && rest.includes('--hard'))) found.add('delete')
      else if (sub === 'branch' && rest.some((a) => /^-[a-zA-Z]*[dD]|^--delete/.test(a))) found.add('delete')
      else if (sub === 'stash' && (rest[0] === 'drop' || rest[0] === 'clear')) found.add('delete')
      else if (GIT_MODIFY.has(sub) || sub === 'reset') found.add('modify')
    }
  }
  return sortVerbs(found)
}
