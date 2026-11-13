// 기기 추가 창 4장의 상태 (무엇을 → 어디서 → 준비물 → 연결) — 화면은 이 상태를 그리기만 한다
// 세 갈래가 같은 장을 쓴다: pc = 다른 PC 보기(어디 있나요·Tailscale 안내·코드 입력+이름·색) · phone = 휴대폰(연결 방식·Tailscale 안내·켜기+QR) · host = 이 PC 보여 주기(연결 방식·안내·켜기+코드)
// React·DOM을 쓰지 않는다 (scripts/workspace.test.mts)

import { cleanWorkspaceName, WORKSPACE_NAME_MAX, type WorkspaceColor } from '../../../shared/workspace.ts'

export type WizardStep = 'what' | 'where' | 'prep' | 'connect'
export const WIZARD_STEPS: readonly WizardStep[] = ['what', 'where', 'prep', 'connect']

export type WizardWhat = 'pc' | 'phone' | 'host'

export interface WizardState {
  step: WizardStep
  what: WizardWhat | null
  /** pc 갈래: 같은 와이파이 · 다른 곳 — 준비물 안내만 달라진다 (휴대폰·이 PC 보여 주기는 이 PC의 연결 방식을 고른다) */
  where: 'same' | 'away' | null
  /** 짝지은(또는 고른) PC */
  peerId: string | null
  name: string
  color: WorkspaceColor
  error: string | null
}

export type WizardAction =
  | { type: 'pickWhat'; what: WizardWhat }
  | { type: 'pickWhere'; where: 'same' | 'away' }
  | { type: 'next'; isThisPcReady?: boolean }
  /** 이 PC 연결이 이미 켜져 준비가 끝났으면 휴대폰·이 PC 보여 주기는 바로 연결 장으로 */
  | { type: 'skipToConnect' }
  | { type: 'back' }
  | { type: 'paired'; peerId: string; name: string }
  | { type: 'setName'; name: string }
  | { type: 'setColor'; color: WorkspaceColor }
  | { type: 'fail'; error: string }

export const initialWizard = (color: WorkspaceColor): WizardState => ({ step: 'what', what: null, where: null, peerId: null, name: '', color, error: null })

/** 다음 장으로 갈 수 있는지. 휴대폰·이 PC 보여 주기의 준비물 장은 이 PC의 준비(Tailscale)가 끝나야 넘어간다 */
export function canNext(s: WizardState, isThisPcReady = true): boolean {
  if (s.step === 'what') return s.what !== null
  if (s.step === 'where') return s.what !== 'pc' || s.where !== null
  if (s.step === 'prep') return s.what === 'pc' || isThisPcReady
  return false
}

/** 마지막에 '추가'를 누를 수 있는지 (다른 PC 보기만 — 휴대폰·이 PC 보여 주기는 '완료'로 닫는다) */
export const canFinish = (s: WizardState) => s.step === 'connect' && s.what === 'pc' && s.peerId !== null && s.name.trim() !== ''

export function wizardReducer(s: WizardState, a: WizardAction): WizardState {
  switch (a.type) {
    case 'pickWhat':
      return { ...s, what: a.what, where: a.what === s.what ? s.where : null, error: null }
    case 'pickWhere':
      return { ...s, where: a.where, error: null }
    case 'next': {
      if (!canNext(s, a.isThisPcReady)) return s
      const i = WIZARD_STEPS.indexOf(s.step)
      return { ...s, step: WIZARD_STEPS[i + 1], error: null }
    }
    case 'skipToConnect':
      return s.what && s.what !== 'pc' ? { ...s, step: 'connect', error: null } : s
    case 'back': {
      const i = WIZARD_STEPS.indexOf(s.step)
      if (i <= 0) return s
      // 연결 장에서 뒤로 가면 짝지은 결과는 두고(이미 기존 목록에 있다) 오류만 지운다
      return { ...s, step: WIZARD_STEPS[i - 1], error: null }
    }
    case 'paired':
      return { ...s, peerId: a.peerId, name: s.name.trim() ? s.name : cleanWorkspaceName(a.name, a.name), error: null }
    case 'setName':
      return { ...s, name: a.name.slice(0, WORKSPACE_NAME_MAX) }
    case 'setColor':
      return { ...s, color: a.color }
    case 'fail':
      return { ...s, error: a.error }
  }
}
