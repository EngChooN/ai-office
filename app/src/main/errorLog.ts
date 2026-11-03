// 최근 오류 기록 (피드백에 붙인다): 처리되지 않은 예외·화면 오류·직원 실행 실패를 최근 20건까지 모아 데이터 폴더의 작은 파일에 둔다
// 공개 이슈로 나갈 수 있어 넣을 때 한 번 가린다 — 파일·화면에는 가려진 글만 둔다 (electron을 읽지 않는다: 경로는 index가 넘긴다)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { maskSecrets } from '../shared/redact.ts'
import { ERROR_LOG_MAX, ERROR_MESSAGE_MAX, type ErrorEntry, type ErrorSource } from '../shared/errorReport.ts'
import { redactPeerText } from './peer/redact.ts'

const MASK = '***'
const PEER_MASK = '‹가림›'
/** 가리기 전에 읽는 길이 상한 (아주 긴 글에서 느려지지 않게) */
const RAW_MAX = 20_000
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g

export interface ScrubEnv {
  /** 홈 폴더 (→ ~) */
  home: string
  /** 사용자 이름·컴퓨터 이름처럼 그대로 나가면 안 되는 낱말 */
  names: string[]
}

/**
 * 경로 시작(file://·smb:// 같은 파일 URL, \\server·\\?\ 같은 UNC, C:\, ~/, 낱말 경계 뒤의 /)부터 그 줄의 마지막 / 또는 \ 까지 (구분자가 하나 더 있어야 경로로 본다).
 * 폴더 이름에 공백·괄호·따옴표가 있어도 폴더가 남지 않게 줄 끝 쪽 마지막 구분자까지 넓게 지운다 (공개 이슈라 덜 남기는 쪽)
 */
const PATH = /(?:\b(?:file|smb|afp|nfs|cifs|webdavs?):\/+|\\\\|(?<![A-Za-z0-9])[A-Za-z]:[\\/]|(?<![^\s"'`(=:,[])~[\\/]|(?<![^\s"'`(=:,[])\/(?![\s/]))[^\n]*[\\/]/gi

/**
 * 가린 경로 뒤 마지막 이름 (따옴표·괄호·쉼표·`:줄번호`·줄 끝 앞까지). 파일 이름이 아니면 폴더 이름일 수 있어(cwd=/Volumes/Work/SecretProj) 그것도 가린다.
 * 파일 이름(x.ts·secret business plan.ts)과 그 뒤 같은 줄 글(c.ts of undefined)은 오류 위치·내용을 알아보는 데 필요해 남긴다
 */
const PATH_TAIL = /…\/([^\n'"`)\],]+?)(?=:\d|['"`)\],]|$)/gm
/** 흔한 파일 확장자만 파일로 본다 — 점이 든 폴더 이름(/Volumes/Acme.Inc·v2.0)은 파일이 아니라 가린다 */
const FILE_EXT =
  'js|mjs|cjs|jsx|ts|mts|cts|tsx|json|jsonc|md|mdx|txt|log|html?|css|scss|less|vue|svelte|py|rb|go|rs|java|kts?|swift|c|cc|cpp|cxx|h|hpp|cs|php|sh|bash|zsh|ps1|bat|cmd|ya?ml|toml|ini|env|xml|csv|tsv|sql|lock|plist|gradle|asar|node|wasm|map|png|jpe?g|gif|svg|webp|ico|pdf|zip|gz|tar|dmg|exe|dll|so|dylib|apk|app|db|sqlite3?'
/** 이름 앞쪽이 파일 이름으로 끝나는가 (공백이 든 파일 이름 → 확장자 뒤가 공백이거나 끝) */
const FILE_NAME = new RegExp(`^.*?\\.(?:${FILE_EXT})(?=\\s|$)`, 'i')

/** 자른 자리에 걸친 낱말을 버린다 — 마지막 공백 뒤, 공백이 없으면 토큰에 쓰이지 않는 마지막 글자 뒤. 정규식 \S+$ 는 긴 낱말에서 느려 뒤에서부터 찾는다 */
function cutAtSpace(s: string): string {
  for (let i = s.length - 1; i >= 0; i--) if (/\s/.test(s[i])) return s.slice(0, i + 1)
  for (let i = s.length - 1; i >= 0; i--) if (!/[A-Za-z0-9_-]/.test(s[i])) return s.slice(0, i + 1)
  // 통째로 토큰 글자뿐인 긴 글은 비밀값일 수 있어 가림 표시만 남긴다
  return MASK
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function defaultScrubEnv(): ScrubEnv {
  let user = ''
  try {
    user = os.userInfo().username
  } catch {
    // 계정 정보를 못 읽는 환경 — 홈 경로·이메일·비밀값 가리기는 그대로 한다
  }
  return { home: os.homedir(), names: [user, os.hostname().replace(/\.local$/i, '')] }
}

/** 오류 글 가리기: 홈 경로 → ~, 경로는 파일 이름만, 비밀값 가리기 두 가지(토큰·키·긴 무작위 문자열), 마지막에 이메일·사용자 이름·컴퓨터 이름 → *** */
export function scrubErrorText(text: string, env: ScrubEnv): string {
  // 자른 자리에 걸친 낱말은 버린다 (잘린 토큰 앞부분이 짧아져 비밀값 가리기의 최소 길이에 안 걸린 채 남지 않게)
  let s = text.length > RAW_MAX ? cutAtSpace(text.slice(0, RAW_MAX)) : text
  if (env.home.length > 1) {
    // 윈도우는 \와 / 둘 다, 대소문자 구분 없이
    for (const home of new Set([env.home, env.home.replaceAll('\\', '/')])) s = s.replace(new RegExp(escapeRe(home), 'gi'), '~')
  }
  s = s.replace(PATH, '…/').replace(PATH_TAIL, (m, tail: string) => (FILE_NAME.test(tail) ? m : `…/${MASK}`))
  // 토큰·키를 이름보다 먼저 가린다 (sk-alice-… 를 이름으로 먼저 끊으면 토큰 모양이 깨져 나머지가 남는다). 가림 표시는 ***로 맞춘다 (redactPeerText의 ‹가림› — 다시 가려도 같은 글이 되게)
  s = redactPeerText(maskSecrets(s)).replaceAll(PEER_MASK, MASK)
  s = s.replace(EMAIL, MASK)
  // 짧은 이름(2자 이하)은 보통 낱말까지 가려 버려 뺀다
  for (const name of env.names) if (name.length >= 3) s = s.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRe(name)}(?![A-Za-z0-9])`, 'gi'), MASK)
  return s.length > ERROR_MESSAGE_MAX ? `${s.slice(0, ERROR_MESSAGE_MAX)}…` : s
}

export function errorText(err: unknown): string {
  if (err instanceof Error) return err.stack || `${err.name}: ${err.message}`
  return typeof err === 'string' ? err : String(err)
}

export class ErrorLog {
  private entries: ErrorEntry[] = []
  private file: string | null = null
  private readonly env: ScrubEnv
  private readonly now: () => number

  constructor(env: ScrubEnv = defaultScrubEnv(), now = () => Date.now()) {
    this.env = env
    this.now = now
  }

  /** 데이터 폴더의 파일을 읽어 이어 붙인다 — 그 전에 난 오류(메모리)가 앞에 온다. 파일 글도 한 번 더 가린다 */
  open(file: string) {
    this.file = file
    let saved: ErrorEntry[] = []
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
      if (Array.isArray(raw)) saved = raw.filter(isEntry).map((e) => ({ ...e, message: scrubErrorText(e.message, this.env) }))
    } catch {
      // 없거나 깨진 파일은 빈 기록으로 시작한다
    }
    this.entries = [...this.entries, ...saved].slice(0, ERROR_LOG_MAX)
    if (this.entries.length) this.save()
  }

  record(source: ErrorSource, err: unknown) {
    const message = scrubErrorText(errorText(err), this.env).trim()
    if (!message) return
    const [last] = this.entries
    // 같은 오류가 이어서 나면 한 건으로 세어 다른 기록을 밀어내지 않는다
    if (last && last.source === source && last.message === message) this.entries[0] = { ...last, at: this.now(), count: last.count + 1 }
    else this.entries = [{ at: this.now(), source, message, count: 1 }, ...this.entries].slice(0, ERROR_LOG_MAX)
    this.save()
  }

  /** 새것이 앞 */
  list(): ErrorEntry[] {
    return this.entries.map((e) => ({ ...e }))
  }

  private save() {
    if (!this.file) return
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.entries))
      fs.renameSync(tmp, this.file)
    } catch {
      // 기록 실패가 다른 일을 막지 않게 한다 (메모리에는 남아 있다)
    }
  }
}

function isEntry(v: unknown): v is ErrorEntry {
  const e = v as ErrorEntry
  return !!e && typeof e.at === 'number' && typeof e.message === 'string' && typeof e.count === 'number' && (e.source === 'main' || e.source === 'renderer' || e.source === 'staff')
}

/** 앱 전체가 함께 쓰는 기록 (index가 데이터 폴더를 연다) */
export const errorLog = new ErrorLog()
