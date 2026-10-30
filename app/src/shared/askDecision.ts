// 답한 결재 질문을 지식 창고 '결정'으로 남기고, 비슷한 질문이 다시 오면 같은 답을 찾는다 — electron 없이 테스트한다
// 엄격한 기준: 최근 30일 · 선택지가 똑같고 · 질문이 거의 같고 · 지난 답이 지금 선택지 안에 있고 · 겹친 결정끼리 답이 같을 때만

import type { StaffQuestion } from './types'
import { KNOWLEDGE_TITLE_MAX, terms, type KnowledgeEntry, type KnowledgeInput } from './knowledge.ts'
import { t, type Lang } from './i18n/index.ts'

/** 결재 질문 답으로 남긴 결정에 붙는 태그 (회의 결정·직접 쓴 결정과 가른다) */
export const ASK_DECISION_TAG = 'ask'
/** 이 기간보다 오래된 결정은 따르지 않는다 */
export const ASK_DECISION_MAX_AGE_MS = 30 * 24 * 3_600_000
/** 질문 낱말이 이만큼 겹쳐야 같은 질문으로 본다 (자카드) */
export const ASK_SIMILAR_MIN = 0.9
/** 낱말이 이보다 적은 짧은 질문은 글자가 똑같을 때만 같은 질문으로 본다 */
const SHORT_TERMS = 4
/** 여러 개 고른 답은 화면(QuestionBox)에서 이렇게 잇는다 */
const MULTI_SEP = ', '
const OPTIONS_SEP = ' | '

export interface AskDecision {
  question: string
  options: string[]
  answer: string
}

const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
const norm = (s: string) => flat(s).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '')

/** 지식 창고에 넣을 결정: 제목은 질문, 내용은 질문·답·선택지 세 줄 (줄 순서로 다시 읽는다 — 이름표는 화면 언어) */
export function askDecisionInput(q: StaffQuestion, answer: string, lang?: Lang): KnowledgeInput {
  const question = flat(q.question)
  const lines = [
    `${t('knowledge.ask.question', undefined, lang)}: ${question}`,
    `${t('knowledge.ask.answer', undefined, lang)}: ${flat(answer)}`,
    `${t('knowledge.ask.options', undefined, lang)}: ${q.options.map((o) => flat(o.label)).join(OPTIONS_SEP)}`,
  ]
  return { kind: 'decision', title: question.slice(0, KNOWLEDGE_TITLE_MAX), body: lines.join('\n'), tags: [ASK_DECISION_TAG] }
}

/** 결재 질문으로 남긴 결정이면 질문·선택지·답을 꺼낸다 (모양이 깨졌으면 null — 대표가 고쳤거나 잘렸다) */
export function parseAskDecision(e: KnowledgeEntry): AskDecision | null {
  if (e.kind !== 'decision' || !e.tags.includes(ASK_DECISION_TAG)) return null
  const lines = e.body.split('\n')
  if (lines.length !== 3 || lines.some((l) => !l.includes(': '))) return null
  const [question, answer, options] = lines.map((l) => l.slice(l.indexOf(': ') + 2).trim())
  const list = options.split(OPTIONS_SEP).map((o) => o.trim()).filter(Boolean)
  if (!question || !answer || list.length === 0) return null
  return { question, options: list, answer }
}

/** 두 질문이 거의 같은지: 글자가 같거나, 낱말이 충분히 많고 ASK_SIMILAR_MIN 이상 겹친다 */
export function isSameQuestion(a: string, b: string): boolean {
  if (norm(a) === norm(b)) return true
  const ta = terms(a)
  const tb = terms(b)
  if (ta.size < SHORT_TERMS || tb.size < SHORT_TERMS) return false
  let both = 0
  for (const x of ta) if (tb.has(x)) both++
  return both / (ta.size + tb.size - both) >= ASK_SIMILAR_MIN
}

/** 지난 답을 지금 선택지 이름으로 바꾼다. 선택지 밖의 답(직접 쓴 답)·여러 개 못 고르는데 여러 개면 null */
function answerFor(q: StaffQuestion, past: AskDecision): string | null {
  const labels = new Map(q.options.map((o) => [norm(o.label), o.label]))
  const picked = past.answer.split(MULTI_SEP).map((p) => labels.get(norm(p)))
  if (picked.some((p) => p === undefined) || (!q.multiSelect && picked.length !== 1)) return null
  return picked.join(MULTI_SEP)
}

export interface PastDecisionMatch {
  answer: string
  /** 이 결정을 받은 직원 이름 */
  staffName: string
  entry: KnowledgeEntry
}

/** 같은 질문(선택지가 똑같고 질문이 거의 같음)으로 남긴 결정이면 꺼낸 내용, 아니면 null */
function sameAsk(e: KnowledgeEntry, q: StaffQuestion): AskDecision | null {
  const options = new Set(q.options.map((o) => norm(o.label)))
  if (options.size === 0 || options.size !== q.options.length) return null
  const past = parseAskDecision(e)
  if (!past || past.options.length !== options.size || past.options.some((o) => !options.has(norm(o)))) return null
  return isSameQuestion(past.question, q.question) ? past : null
}

/** 새 답을 남기기 전에 지울 같은 질문의 예전 결정 (기간과 상관없이 — 같은 질문은 최신 답 하나만 둔다) */
export function sameAskDecisions(entries: readonly KnowledgeEntry[], q: StaffQuestion): KnowledgeEntry[] {
  return entries.filter((e) => sameAsk(e, q))
}

/** 질문 하나에 따를 지난 결정. 맞는 결정끼리 답이 다르면(애매) null */
export function matchPastDecision(entries: readonly KnowledgeEntry[], q: StaffQuestion, now: number): PastDecisionMatch | null {
  const found: PastDecisionMatch[] = []
  for (const e of entries) {
    if (now - e.updatedAt > ASK_DECISION_MAX_AGE_MS) continue
    const past = sameAsk(e, q)
    if (!past) continue
    const answer = answerFor(q, past)
    if (answer) found.push({ answer, staffName: e.staffName, entry: e })
  }
  if (found.length === 0 || found.some((f) => f.answer !== found[0].answer)) return null
  return found.reduce((a, b) => (b.entry.updatedAt > a.entry.updatedAt ? b : a))
}

/** 질문 전부에 지난 결정이 있을 때만 답(질문 → 답)을 돌려준다. 하나라도 없으면 null (평소처럼 결재함) */
export function matchPastDecisions(entries: readonly KnowledgeEntry[], questions: readonly StaffQuestion[], now: number): { question: string; match: PastDecisionMatch }[] | null {
  if (questions.length === 0) return null
  const out: { question: string; match: PastDecisionMatch }[] = []
  for (const q of questions) {
    const match = matchPastDecision(entries, q, now)
    if (!match) return null
    out.push({ question: q.question, match })
  }
  return out
}
