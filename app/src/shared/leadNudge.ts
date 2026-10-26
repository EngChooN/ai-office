// 멈춤 방지 자동 점검 — 리드가 "맡길게요"처럼 할 일만 적고 실제로 맡기지 않았거나,
// 직원이 백그라운드 작업을 남긴 채 턴을 끝냈는지 판단한다 (턴이 끝나면 앱이 다시 깨우지 않는다)

const HANGUL_BASE = 0xac00
const JONG_COUNT = 28
const JONG_RIEUL = 8 // ㄹ 받침
const JONG_SSANGSIOT = 20 // ㅆ 받침

const jongOf = (ch: string | undefined) => {
  if (!ch) return -1
  const code = ch.charCodeAt(0) - HANGUL_BASE
  return code >= 0 && code < 11172 ? code % JONG_COUNT : -1
}

/** ㄹ 받침 + 게요 (할게요·맡길게요·볼게요) / ㄹ 받침 + 거예요·겁니다·예정 (할 거예요·확인할 겁니다) — 단 "했을 거예요" 같은 추측은 뺀다 */
const KO_ENDING = /([가-힣])\s?(게요|거예요|거에요|겁니다|예정입니다|예정이에요)/g
const KO_FIXED = /(하|기|드리|보|두|키)겠(습니다|어요)/
const EN = /\b(i'll|i will|we'll|we will|(?:i'm|we're|i am|we are) going to|will (?:check|review|handle|follow up|delegate|assign))\b/i
const JA = /(しておきます|任せます|依頼します|予定です|つもりです|進めます|確認します|対応します|渡します|させます)/
const ZH = /(我会|我将|我们会|我们将|将会|会让|打算|准备|稍后|接下来会)/

function hasKoPromise(text: string) {
  if (KO_FIXED.test(text)) return true
  for (const m of text.matchAll(KO_ENDING)) {
    const verb = m[1]
    const before = text[(m.index ?? 0) - 1]
    if (jongOf(verb) !== JONG_RIEUL) continue
    if (verb === '을' && jongOf(before) === JONG_SSANGSIOT) continue // 했을/됐을 거예요 = 추측
    return true
  }
  return false
}

/** 보고 문장에 앞으로 할 일을 약속하는 표현이 있는지 (4개 언어) */
export function hasPromise(text: string): boolean {
  return hasKoPromise(text) || EN.test(text) || JA.test(text) || ZH.test(text)
}

export interface LeadTurnState {
  /** 맡길 사람이 있는 직원(리드)인지 */
  isLeader: boolean
  /** 이번 턴이 자동 점검 지시로 시작됐는지 — 그렇다면 다시 점검하지 않는다 */
  isAutoCheckTurn: boolean
  /** 턴이 끝난 직후 리드에게 이어서 시작된 일이 있는지 (다음 업무 배정 등) */
  isBusy: boolean
  /** 리드가 맡긴 일 중 진행 중이거나 대기 중인 것이 있는지 */
  hasOpenDelegation: boolean
  /** 대표 승인을 기다리는 기획안이 있는지 */
  hasWaitingPlan: boolean
  summary: string
}

/** 리드에게 "[자동 점검]"을 다시 지시해야 하는지 */
export function shouldNudgeLead(s: LeadTurnState): boolean {
  if (!s.isLeader || s.isAutoCheckTurn || s.isBusy) return false
  if (s.hasOpenDelegation || s.hasWaitingPlan) return false
  return hasPromise(s.summary)
}

export interface BackgroundTurnState {
  /** 이번 턴이 자동 점검 지시로 시작됐는지 — 그렇다면 다시 점검하지 않는다 */
  isAutoCheckTurn: boolean
  /** 턴이 끝난 직후 이어서 시작된 일이 있는지 */
  isBusy: boolean
  /** 턴이 끝날 때 세션에 남아 있는 백그라운드 작업 */
  backgroundTasks: string[]
}

/** 끝나지 않은 백그라운드 작업을 남기고 턴을 끝낸 직원에게 "[자동 점검]"을 다시 지시해야 하는지 */
export function shouldNudgeBackground(s: BackgroundTurnState): boolean {
  return !s.isAutoCheckTurn && !s.isBusy && s.backgroundTasks.length > 0
}
