// 예전 기록(log type='approval' 줄)을 결재 기록으로 옮길 때 줄 하나를 읽는다 — 읽을 수 없는 줄은 null
// 번역 키가 남은 줄은 구조로, 글자만 남은 줄은 4개 언어의 라벨로 읽는다. 요청 시각·쉬운 요약·(휴대폰 표시 말고는) 결재한 쪽은 원래 줄에 없어 비운다

import { LANGS, tk, tr, type I18nArg, type I18nText, type Lang } from '../shared/i18n/index.ts'
import type { ApprovalActor, ApprovalResult } from '../shared/types.ts'
import { REMOTE_MARK } from './remoteContext.ts'

export interface LegacyApproval {
  result: ApprovalResult
  actor: ApprovalActor
  toolName: string
  summary: string
  summaryI18n?: I18nArg
  answer?: string
}

const isText = (v: I18nArg | undefined): v is I18nText => typeof v === 'object' && v !== null && 'key' in v
const str = (v: I18nArg | undefined) => (v === undefined ? '' : tr(v, 'ko'))
const dropColon = (s: string) => s.replace(/^\s*[:：]\s*/, '')

/** 자동으로 처리한 줄: 번역 키 → 결과·결재한 쪽 */
const AUTO_KEYS: Record<string, { result: ApprovalResult; actor: ApprovalActor }> = {
  'log.autoApprove': { result: 'approved', actor: 'auto' },
  'log.ruleApprove': { result: 'approved', actor: 'rule' },
  'log.autonomousSkip': { result: 'skipped', actor: 'auto' },
}
const AUTO_ANSWER_KEYS = new Set(['log.autoAnswer', 'log.autonomousAnswer', 'log.pastDecision'])
const ASK_TOOL = 'AskUserQuestion'

function fromKey(i18n: I18nText): LegacyApproval | null {
  const p = i18n.params ?? {}
  const auto = AUTO_KEYS[i18n.key]
  if (auto) {
    const summary = p.summary
    return { ...auto, toolName: typeof p.tool === 'string' ? p.tool : '', summary: str(summary), ...(summary !== undefined && typeof summary !== 'string' && typeof summary !== 'number' ? { summaryI18n: summary } : {}) }
  }
  if (AUTO_ANSWER_KEYS.has(i18n.key)) return { result: 'answered', actor: 'auto', toolName: ASK_TOOL, summary: '', answer: str(p.text) }
  return null
}

const RESULT_KEYS: Record<string, ApprovalResult> = { 'log.approved': 'approved', 'log.rejected': 'rejected' }

/** 대표가 처리한 줄: { list: [휴대폰 표시, 승인|반려|답변, ': 도구 ', 요약], sep: '' } */
function fromList(list: I18nArg[]): LegacyApproval | null {
  const [via, what, ...rest] = list
  if (typeof via !== 'string') return null
  const actor: ApprovalActor = via.startsWith(REMOTE_MARK) ? 'phone' : ''
  let result: ApprovalResult | null = null
  let answer: string | undefined
  if (isText(what)) result = RESULT_KEYS[what.key] ?? null
  else if (typeof what === 'object' && what !== null && 'list' in what && isText(what.list[0]) && what.list[0].key === 'log.answered') {
    result = 'answered'
    answer = dropColon(what.list.slice(1).map(str).join(''))
  }
  if (!result) return null
  // 도구 이름이 있는 줄은 ': 도구 ' 다음에 요약, 글 질문·되살린 질문은 ': ' 다음에 요약
  const head = typeof rest[0] === 'string' ? rest[0] : ''
  const toolName = dropColon(head).trim()
  const summaryArg = rest[1]
  const summary = summaryArg === undefined ? '' : str(summaryArg)
  return {
    result,
    actor,
    toolName,
    summary,
    ...(summaryArg !== undefined && typeof summaryArg !== 'string' && typeof summaryArg !== 'number' ? { summaryI18n: summaryArg } : {}),
    ...(answer ? { answer } : {}),
  }
}

// ── 글자만 남은 줄 ─────────────────────────────────────

const SENT_A = '\u0001'
const SENT_B = '\u0002'
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SEP = '[:：]\\s*'

interface Pattern {
  re: RegExp
  result: ApprovalResult
  actor: ApprovalActor
  /** 두 번째 묶음이 도구 이름+요약이면 'tool', 답변 글이면 'answer' */
  kind: 'tool' | 'answer'
}

function buildPatterns(): Pattern[] {
  const out: Pattern[] = []
  for (const lang of LANGS as readonly Lang[]) {
    const label = (key: 'log.approved' | 'log.rejected' | 'log.answered') => escapeRe(tr(tk(key), lang))
    out.push({ re: new RegExp(`^(?:${escapeRe(REMOTE_MARK)} )?${label('log.approved')}${SEP}([\\s\\S]*)$`), result: 'approved', actor: '', kind: 'tool' })
    out.push({ re: new RegExp(`^(?:${escapeRe(REMOTE_MARK)} )?${label('log.rejected')}${SEP}([\\s\\S]*)$`), result: 'rejected', actor: '', kind: 'tool' })
    out.push({ re: new RegExp(`^(?:${escapeRe(REMOTE_MARK)} )?${label('log.answered')}${SEP}([\\s\\S]*)$`), result: 'answered', actor: '', kind: 'answer' })
    for (const [key, info] of Object.entries(AUTO_KEYS)) {
      if (key === 'log.autonomousSkip') continue
      const tpl = tr({ key, params: { tool: SENT_A, summary: SENT_B } }, lang)
      const a = tpl.indexOf(SENT_A)
      const b = tpl.indexOf(SENT_B)
      if (a < 0 || b < a) continue
      out.push({ re: new RegExp(`^${escapeRe(tpl.slice(0, a))}(\\S+)${escapeRe(tpl.slice(a + 1, b))}([\\s\\S]*)$`), result: info.result, actor: info.actor, kind: 'tool' })
    }
  }
  // 앱이 한국어 글로만 남기던 취소 줄 ("취소됨: 도구 요약", "이미 끝난 결재: 도구 요약")
  out.push({ re: /^(?:취소됨|이미 끝난 결재): ([\s\S]*)$/, result: 'canceled', actor: '', kind: 'tool' })
  return out
}

let patterns: Pattern[] | null = null

/** "도구 요약" → [도구, 요약] (도구 이름은 공백 없는 한 단어) */
function splitTool(rest: string): [string, string] {
  const m = rest.match(/^(\S+)(?: ([\s\S]*))?$/)
  return m ? [m[1], m[2] ?? ''] : ['', rest]
}

function fromText(text: string): LegacyApproval | null {
  patterns ??= buildPatterns()
  for (const p of patterns) {
    const m = p.re.exec(text)
    if (!m) continue
    const actor: ApprovalActor = p.actor || (text.startsWith(REMOTE_MARK) ? 'phone' : '')
    // 자동으로 처리한 줄은 첫 묶음이 도구, 둘째가 요약
    if (m.length === 3) return { result: p.result, actor, toolName: m[1], summary: m[2] }
    if (p.kind === 'answer') return { result: 'answered', actor, toolName: ASK_TOOL, summary: '', answer: m[1] }
    const [toolName, summary] = splitTool(m[1])
    return { result: p.result, actor, toolName, summary }
  }
  return null
}

/** log 줄 하나(글·번역 키)를 결재 기록 칸으로 — 결재와 상관없는 줄(규칙 추가·자동결재 안내·대기 알림 등)은 null */
export function parseLegacyApproval(text: string, textI18n?: I18nArg): LegacyApproval | null {
  if (textI18n && typeof textI18n === 'object') {
    if ('list' in textI18n) return fromList(textI18n.list) ?? fromText(text)
    if (isText(textI18n)) return fromKey(textI18n)
  }
  return fromText(text)
}
