// 직원 질문(AskUserQuestion)에 답을 고르고 묶는 규칙 — 앱(QuestionBox)과 바탕화면 비서 펼침 창이 함께 쓴다
// 테스트: scripts/deskPet.test.mts

import type { StaffQuestion } from './types'

/** 질문별로 고른 선택지 */
export type Picked = Record<string, string[]>
/** 질문별로 직접 적은 답 */
export type Custom = Record<string, string>

/** 선택지를 누른다: 여러 개 고르기면 넣고 빼기, 하나 고르기면 바꾸기(같은 것을 다시 누르면 풀기) */
export function togglePick(picked: Picked, question: string, label: string, isMulti: boolean): Picked {
  const cur = picked[question] ?? []
  const next = isMulti ? (cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]) : cur.includes(label) ? [] : [label]
  return { ...picked, [question]: next }
}

/** 직접 적은 답이 있으면 그것을, 아니면 고른 선택지를 쉼표로 묶는다 */
export const answerOf = (picked: Picked, custom: Custom, question: string) => custom[question]?.trim() || (picked[question] ?? []).join(', ')

/** 모든 질문에 답이 있으면 보낼 답 ({ 질문 문장: 답 }), 하나라도 비면 null */
export function collectAnswers(questions: StaffQuestion[], picked: Picked, custom: Custom): Record<string, string> | null {
  const entries = questions.map((q) => [q.question, answerOf(picked, custom, q.question)] as const)
  return entries.every(([, a]) => a) ? Object.fromEntries(entries) : null
}

/** 받은 답이 질문과 꼭 맞는지 — 질문마다 빈칸 없는 문자열 하나, 모르는 질문 없음 (바탕화면 비서 창에서 온 답을 main이 확인) */
export function isCompleteAnswer(questions: StaffQuestion[], answers: unknown): answers is Record<string, string> {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return false
  const keys = Object.keys(answers)
  if (keys.length !== new Set(questions.map((q) => q.question)).size) return false
  return questions.every((q) => {
    const v = (answers as Record<string, unknown>)[q.question]
    return typeof v === 'string' && v.trim() !== ''
  })
}
