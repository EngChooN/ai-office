// 회사 지식 창고: 직원이 배운 점·대표 피드백·결정을 쌓고, 일을 시작할 때 관련 있는 몇 개만 짧게 붙인다 — electron 없이 테스트한다
// 토큰 절약 원칙: 붙이는 건 상위 KNOWLEDGE_PICK개, 합쳐서 KNOWLEDGE_BRIEF_MAX자까지. 긴 내용은 연결한 참고 문서 경로로만 알려 준다

import { t, type Lang } from './i18n/index.ts'

export type KnowledgeKind = 'learning' | 'feedback' | 'decision'

export interface KnowledgeEntry {
  id: string
  kind: KnowledgeKind
  title: string
  body: string
  tags: string[]
  /** 남긴 직원 (대표가 직접 쓴 것·피드백·결정은 null) */
  staffId: string | null
  staffName: string
  /** 연결한 참고 문서 (자세한 내용은 이 파일에) */
  docPath: string | null
  createdAt: number
  updatedAt: number
}

/** 화면·직원 도구에서 받는 입력 (id가 있으면 고치기) */
export interface KnowledgeInput {
  id?: string
  kind: KnowledgeKind
  title: string
  body: string
  tags?: string[]
  docPath?: string | null
}

export const KNOWLEDGE_KINDS: readonly KnowledgeKind[] = ['learning', 'feedback', 'decision']
export const KNOWLEDGE_TITLE_MAX = 80
export const KNOWLEDGE_BODY_MAX = 1000
export const KNOWLEDGE_TAGS_MAX = 5
/** 저장 상한 — 넘으면 오래된 것부터 지운다 */
export const KNOWLEDGE_MAX = 500
/** 일 시작 때 붙이는 수와 글자 수 */
export const KNOWLEDGE_PICK = 3
export const KNOWLEDGE_BRIEF_MAX = 600
const LINE_BODY_MAX = 140
/** 이보다 덜 겹치면 관련 없다고 본다 */
const MIN_SCORE = 2

/** 입력을 다듬는다. 제목·내용이 비었거나 종류가 틀리면 null */
export function normalizeKnowledge(input: KnowledgeInput): Required<Omit<KnowledgeInput, 'id'>> & { id?: string } | null {
  const title = (input.title ?? '').trim().slice(0, KNOWLEDGE_TITLE_MAX)
  const body = (input.body ?? '').trim().slice(0, KNOWLEDGE_BODY_MAX)
  if (!title || !body || !KNOWLEDGE_KINDS.includes(input.kind)) return null
  const tags = [...new Set((input.tags ?? []).map((g) => g.trim().replace(/^#/, '')).filter(Boolean))].slice(0, KNOWLEDGE_TAGS_MAX)
  const docPath = input.docPath?.trim() || null
  return { ...(input.id ? { id: input.id } : {}), kind: input.kind, title, body, tags, docPath }
}

const CJK = /[぀-ヿ㐀-鿿가-힯]/

/** 찾기용 낱말: 영문·숫자는 2글자 이상 낱말, 한중일 글자는 두 글자씩 (조사가 붙어도 겹치게) */
export function terms(text: string): Set<string> {
  const out = new Set<string>()
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue
    if (CJK.test(word)) {
      for (let i = 0; i + 1 < word.length; i++) out.add(word.slice(i, i + 2))
    } else if (word.length >= 2) out.add(word)
  }
  return out
}

/** 업무와 얼마나 관련 있는지: 태그 3 · 제목 2 · 내용 1 (겹친 낱말마다) */
export function knowledgeScore(entry: KnowledgeEntry, query: Set<string>): number {
  let score = 0
  const tagTerms = terms(entry.tags.join(' '))
  const titleTerms = terms(entry.title)
  const bodyTerms = terms(entry.body)
  for (const q of query) {
    if (tagTerms.has(q)) score += 3
    else if (titleTerms.has(q)) score += 2
    else if (bodyTerms.has(q)) score += 1
  }
  return score
}

/** 업무 글(제목·내용)과 관련 있는 상위 몇 개 — 점수가 같으면 최근 것 */
export function pickKnowledge(entries: readonly KnowledgeEntry[], taskText: string, limit = KNOWLEDGE_PICK): KnowledgeEntry[] {
  const query = terms(taskText)
  if (query.size === 0) return []
  return entries
    .map((e) => ({ e, score: knowledgeScore(e, query) }))
    .filter((x) => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || b.e.updatedAt - a.e.updatedAt)
    .slice(0, limit)
    .map((x) => x.e)
}

const oneLine = (s: string, max: number) => {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** 종류 이름 (화면·안내 공용) */
export function knowledgeKindLabel(kind: KnowledgeKind, lang?: Lang) {
  return kind === 'learning' ? t('knowledge.kind.learning', undefined, lang) : kind === 'feedback' ? t('knowledge.kind.feedback', undefined, lang) : t('knowledge.kind.decision', undefined, lang)
}

/** 지시 뒤에 붙이는 짧은 안내. 고른 게 없으면 빈 문자열 */
export function knowledgeBrief(picked: readonly KnowledgeEntry[], lang?: Lang): string {
  if (picked.length === 0) return ''
  const lines = [t('knowledge.brief.header', undefined, lang)]
  for (const e of picked) {
    const doc = e.docPath ? ` (${t('knowledge.brief.doc', { path: e.docPath }, lang)})` : ''
    const line = `- [${knowledgeKindLabel(e.kind, lang)}] ${e.title}: ${oneLine(e.body, LINE_BODY_MAX)}${doc}`
    if (lines.join('\n').length + line.length + 1 > KNOWLEDGE_BRIEF_MAX) break
    lines.push(line)
  }
  return lines.length > 1 ? lines.join('\n') : ''
}
