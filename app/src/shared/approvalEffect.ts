// 결재 카드 제목의 "결과 한 줄": 도구 입력을 사람이 읽는 효과 문장(키+인자)으로 (electron 없이 테스트한다)
// 확실히 풀 수 있을 때만 만들고, 조금이라도 애매하면 null — 틀린 해설은 원문보다 위험하다. 허용 판정에는 쓰지 않는다 (규칙·일회 허용은 summary)

import { tk, tr, trOr, type I18nText } from './i18n/index.ts'
import { base, lexSegments, resolveCommand } from './commandScan.ts'
import { maskSecrets } from './redact.ts'
import type { Approval } from './types'

/** 이보다 긴 경로는 문장으로 만들지 않는다 (잘라 놓은 경로는 다른 파일처럼 읽힌다) */
const PATH_MAX = 200

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
    case 'WebFetch': {
      const host = typeof input.url === 'string' ? hostOf(input.url) : null
      return host ? tk('approval.effect.webFetch', { host }) : null
    }
    case 'Bash':
      return typeof input.command === 'string' ? bashEffect(input.command) : null
    default:
      return null
  }
}

/** 한 줄 글만 들어가는 곳(알림 제목·펫 말풍선)의 제목: 효과 문장 → 번역 원문 → 원문 */
export const approvalHeadline = (a: Pick<Approval, 'summary' | 'summaryI18n' | 'effectI18n'>) => (a.effectI18n ? tr(a.effectI18n) : trOr(a.summaryI18n, a.summary))

const fileEffect = (key: 'approval.effect.fileWrite' | 'approval.effect.fileEdit', path: unknown) => (isPath(path) ? tk(key, { path: maskSecrets(path) }) : null)

const isPath = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= PATH_MAX && !HIDDEN_CHARS.test(v)

/** 화면에서 안 보이거나 글 순서·줄을 바꾸는 글자(제어문자·양방향 제어·폭 없는 글자) — 문장에 넣으면 실제와 다르게 읽힌다 */
const HIDDEN_CHARS = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/

/** http(s) 주소의 호스트만 (경로·쿼리·계정 정보는 비밀이 섞일 수 있어 문장에 넣지 않는다) */
function hostOf(url: string): string | null {
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
function unquoted(cmd: string): string | null {
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

function bashEffect(command: string): I18nText | null {
  if (HIDDEN_CHARS.test(command)) return null
  const bare = unquoted(command)
  if (bare === null || SHELL_META.test(bare)) return null
  const segs = lexSegments(command)
  if (segs.length !== 1 || segs[0].hasSubst) return null
  const { cmd, args, localScript, via, assigns } = resolveCommand(segs[0])
  // sudo·env·xargs 같은 앞말, 변수 대입, 이 폴더의 스크립트는 효과를 단정할 수 없다
  if (!cmd || localScript || via.length || assigns.length) return null
  const run = COMMANDS[base(cmd)]
  return run ? run(args) : null
}

const COMMANDS: Record<string, (args: string[]) => I18nText | null> = {
  rm: rmEffect,
  // 전역 옵션(-c·-C·--git-dir 등)은 도착지·저장소를 바꿀 수 있어 하위 명령이 맨 앞일 때만 푼다
  git: (args) => (args[0] === 'push' ? gitPushEffect(args.slice(1)) : null),
  curl: curlEffect,
  wget: wgetEffect,
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
