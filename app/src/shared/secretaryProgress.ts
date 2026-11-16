// 비서가 턴·비용 상한에 걸려 멈췄을 때: 어디까지 했는지 한 줄 + [이어서 하기] (docs/specs/secretary.md)
// 질문마다 새 query라(세션을 이어 쓰지 않는다) 이어 하기도 새 query — 앞 시도에서 한 일을 프롬프트에 넣어 준다

import { t, type Lang } from './i18n/index.ts'

/** 이어 하기 최대 횟수 (원 질문 1번 + 이어 하기 2번 — 상한을 사실상 없애지 않게) */
export const MAX_RESUMES = 2

export type ProgressKind = 'look' | 'guide' | 'card' | 'web'
const KINDS: ProgressKind[] = ['look', 'guide', 'card', 'web']
export type ProgressSteps = Partial<Record<ProgressKind, number>>

/** 멈춘 안내에 붙는 이어 하기 정보 (DB에 함께 저장 — 앱을 다시 켜도 이어 할 수 있다) */
export interface SecretaryResume {
  /** 대표의 원래 질문 */
  question: string
  /** 지금까지(앞 시도 모두) 쓴 도구 수 */
  steps: ProgressSteps
  /** 지금까지 만든 확인 카드 제목 — 이어 할 때 다시 만들지 않게 */
  cards: string[]
  /** 몇 번째 멈춤인지 (1부터) */
  round: number
  /** [이어서 하기]를 눌렀다 */
  used?: boolean
}

export type SecretaryResumeFail = 'gone' | 'busy' | 'rate'
export type SecretaryResumeResult = { ok: true } | { ok: false; reason: SecretaryResumeFail }

/** 도구 이름 → 진행 종류 (Claude는 mcp__secretary__이름, 웹은 WebSearch·WebFetch) */
export function toolKind(name: string): ProgressKind {
  const short = name.split('__').at(-1) ?? name
  if (/^(propose|propose_edit|arrange_office)$/.test(short)) return 'card'
  if (/^(read_guide|read_manual)$/.test(short)) return 'guide'
  if (/^web/i.test(short)) return 'web'
  return 'look'
}

export const addStep = (steps: ProgressSteps, kind: ProgressKind): ProgressSteps => ({ ...steps, [kind]: (steps[kind] ?? 0) + 1 })

export const mergeSteps = (a: ProgressSteps, b: ProgressSteps): ProgressSteps => Object.fromEntries(KINDS.filter((k) => (a[k] ?? 0) + (b[k] ?? 0) > 0).map((k) => [k, (a[k] ?? 0) + (b[k] ?? 0)]))

/** "사무실 조회 3번 · 확인 카드 만들기 1번 했어요." — 한 일이 없으면 빈 글 */
export function progressText(steps: ProgressSteps, lang?: Lang): string {
  const parts = KINDS.filter((k) => (steps[k] ?? 0) > 0).map((k) => t(`secretary.resume.kind.${k}`, { n: steps[k] ?? 0 }, lang))
  return parts.length ? parts.join(' · ') + t('secretary.resume.doneTail', undefined, lang) : ''
}

/** 이번 멈춤의 이어 하기 정보 — 앞 시도(prev)가 있으면 한 일·카드를 이어 붙인다 */
export const nextResume = (prev: SecretaryResume | null, question: string, attempt: ProgressSteps, cards: string[]): SecretaryResume => ({
  question: prev?.question ?? question,
  steps: mergeSteps(prev?.steps ?? {}, attempt),
  cards: [...(prev?.cards ?? []), ...cards],
  round: (prev?.round ?? 0) + 1,
})

/** 버튼을 줄지: 이번 시도에서 도구를 하나라도 썼고(진전 없이 같은 자리에서 돈만 쓰지 않게) 이어 하기를 다 쓰지 않았을 때 */
export const canOfferResume = (r: SecretaryResume, attemptTools: number) => attemptTools > 0 && r.round <= MAX_RESUMES

/** 멈춘 안내 글 */
export function stopNotice(r: SecretaryResume, isOffered: boolean): string {
  const done = progressText(r.steps)
  if (!done) return t('secretary.resume.stoppedPlain')
  return t(isOffered ? 'secretary.resume.stopped' : 'secretary.resume.stoppedSplit', { done })
}

/** [이어서 하기]를 아직 누를 수 있는지 — 안 눌렀고, 그 뒤에 대표가 새 질문을 하지 않았다 (화면과 PC가 같은 판단) */
export function isResumable(messages: readonly { id: number; role: string; resume?: SecretaryResume }[], noticeId: number): boolean {
  const i = messages.findIndex((m) => m.id === noticeId)
  const m = messages[i]
  if (!m || m.role !== 'notice' || !m.resume || m.resume.used) return false
  return !messages.slice(i + 1).some((x) => x.role === 'me')
}

/** [이어서 하기]를 누른 안내를 '썼음'으로 — 비서가 실제로 일을 시작했을 때만 부른다 (한리뷰: 시작 전에 실패하면 버튼을 남긴다). 바꿀 게 없으면 null */
export function markResumeUsed<M extends { id: number; resume?: SecretaryResume }>(messages: readonly M[], noticeId: number): M | null {
  const m = messages.find((x) => x.id === noticeId)
  if (!m?.resume || m.resume.used) return null
  return { ...m, resume: { ...m.resume, used: true } }
}

/** 이 이벤트가 나오면 이어 하기가 실제로 시작된 것 (답 글이나 도구 — 시작 전 오류·결과만 온 경우는 아님) */
export const startsWork = (type: string) => type === 'text' || type === 'tool'

/** DB에 저장된 이어 하기 정보 — 깨졌거나 모양이 다르면 버튼만 빼고 대화는 그대로 읽는다 (한리뷰) */
export function parseResume(raw: string): SecretaryResume | undefined {
  try {
    const r = JSON.parse(raw) as Partial<SecretaryResume> | null
    if (!r || typeof r.question !== 'string' || typeof r.round !== 'number' || !r.steps || typeof r.steps !== 'object' || !Array.isArray(r.cards)) return undefined
    return r as SecretaryResume
  } catch {
    return undefined
  }
}

/** 원 질문이 앞 대화에 이미 그대로 있으면 다시 싣지 않고 앞부분만 가리킨다 (토큰 중복 — 한리뷰) */
const QUESTION_HINT = 40

/** 이어 하기 query의 마지막 줄 (비서 지침과 같은 한국어) */
export function resumePrompt(r: SecretaryResume, isQuestionInContext = false): string {
  const done = progressText(r.steps, 'ko')
  const cards = r.cards.length ? `\n이미 만든 확인 카드: ${r.cards.map((c) => `"${c}"`).join(', ')} — 같은 카드를 다시 만들지 않습니다.` : ''
  const question = isQuestionInContext && r.question.length > QUESTION_HINT ? `앞 대화에 있는 "${r.question.slice(0, QUESTION_HINT)}…"로 시작하는 질문` : r.question
  return [
    `대표의 질문(이어서 하기): ${question}`,
    `앞선 시도가 도구 사용 한도에 걸려 중간에 멈췄습니다.${done ? ` 그때까지 ${done}` : ''}${cards}`,
    '앞선 조회 결과는 남아 있지 않으니 꼭 필요한 조회만 다시 하고, 남은 부분부터 답을 마무리합니다. 앞 대화에 이미 쓴 내용은 되풀이하지 않습니다.',
  ].join('\n')
}
