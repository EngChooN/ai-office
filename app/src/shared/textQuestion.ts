// 글로 쓴 질문 감지 — 직원이 AskUserQuestion 없이 답변 글을 질문으로 끝내면 앱이 결재함 질문으로 대신 올린다

import type { StaffQuestion } from './types'

const QUESTION_MAX = 300
const OPTION_MAX = 4
const OPTION_LABEL_MAX = 80
const SCAN_LINES = 14

/** 질문으로 끝나는 줄: ? / ？ 뒤에 따옴표·괄호·이모지만 허용, 또는 한국어 의문 어미(~까요) */
const ENDS_QUESTION = /(?:[?？]|까요|나요|십니까|습니까|할까|있을까|ですか|でしょうか|ますか|吗|呢)[\s"'”’)）\]」』*_~.!！…\p{Extended_Pictographic}️]*$/u
/** "더 필요한 거 있으면 말씀하세요"류 맺음 인사는 질문이 아니다 */
const COURTESY = /(추가로|더|다른|혹시|궁금|필요한|도움|문의|있으시면|있으면|말씀|anything else|let me know|feel free|any other|any questions|need anything|他にも|何かあれば|還有|还有什么|有其他|如有)/i
const LIST_ITEM = /^\s*(?:\d{1,2}[.)]|[-*•·]|[A-Za-z][.)]|[①②③④⑤])\s+(.+)$/
const FENCE = /```[\s\S]*?```/g

export interface TextQuestion {
  question: string
  options: string[]
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const clean = (s: string) => s.replace(/[*_`]/g, '').trim()

/** 답변 글이 질문으로 끝났으면 질문 문장과 선택지(목록)를 돌려준다. 보고·맺음 인사·코드는 null */
export function detectTextQuestion(summary: string): TextQuestion | null {
  const lines = summary.replace(FENCE, '\n').split('\n').map((l) => l.trimEnd())
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  if (!lines.length) return null
  const tail = lines.slice(-SCAN_LINES)
  // 질문 줄 = 끝에서부터 처음 만나는 질문으로 끝나는 줄. 그 뒤엔 목록 말고 다른 글이 없어야 한다
  let qi = -1
  for (let i = tail.length - 1; i >= 0; i--) {
    const line = tail[i].trim()
    if (!line) continue
    if (ENDS_QUESTION.test(line)) {
      qi = i
      break
    }
    if (!LIST_ITEM.test(tail[i])) return null
  }
  if (qi < 0) return null
  const question = clean(tail[qi].replace(LIST_ITEM, '$1'))
  if (question.length < 4 || COURTESY.test(question)) return null
  const after = tail.slice(qi + 1).filter((l) => l.trim())
  const before: string[] = []
  for (let i = qi - 1; i >= 0; i--) {
    const m = LIST_ITEM.exec(tail[i])
    if (m) before.unshift(m[1])
    else if (tail[i].trim()) break
    else if (before.length) break
  }
  const items = (after.length ? after : before).map((l) => clean(l.replace(LIST_ITEM, '$1'))).filter(Boolean)
  const options = items.length >= 2 && items.length <= OPTION_MAX ? items.map((o) => clip(o, OPTION_LABEL_MAX)) : []
  return { question: clip(question, QUESTION_MAX), options }
}

/** 결재함 질문으로 올릴 형태 */
export function toTextQuestions(q: TextQuestion): StaffQuestion[] {
  return [{ question: q.question, header: '', options: q.options.map((label) => ({ label, description: '' })), multiSelect: false }]
}
