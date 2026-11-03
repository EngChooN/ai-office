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

/** 오류 글 가리기: 홈 경로 → ~, 이메일·사용자 이름·컴퓨터 이름 → ***, 그다음 비밀값 가리기 두 가지(토큰·키·절대 경로·긴 무작위 문자열) */
export function scrubErrorText(text: string, env: ScrubEnv): string {
  let s = text.slice(0, RAW_MAX)
  if (env.home.length > 1) {
    // 윈도우는 \와 / 둘 다, 대소문자 구분 없이
    for (const home of new Set([env.home, env.home.replaceAll('\\', '/')])) s = s.replace(new RegExp(escapeRe(home), 'gi'), '~')
  }
  s = s.replace(EMAIL, MASK)
  // 짧은 이름(2자 이하)은 보통 낱말까지 가려 버려 뺀다
  for (const name of env.names) if (name.length >= 3) s = s.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRe(name)}(?![A-Za-z0-9])`, 'gi'), MASK)
  // 가림 표시는 ***로 맞춘다 (redactPeerText의 ‹가림› — 다시 가려도 같은 글이 되게)
  s = redactPeerText(maskSecrets(s)).replaceAll(PEER_MASK, MASK)
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
