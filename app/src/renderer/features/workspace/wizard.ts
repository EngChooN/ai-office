// PC 추가 마법사 4장의 상태 (무엇을 → 어디서 → 준비물 → 연결 + 이름·색) — 화면은 이 상태를 그리기만 한다
// React·DOM을 쓰지 않는다 (scripts/workspace.test.mts)

import { cleanWorkspaceName, WORKSPACE_NAME_MAX, type WorkspaceColor } from '../../../shared/workspace.ts'

export type WizardStep = 'what' | 'where' | 'prep' | 'connect'
export const WIZARD_STEPS: readonly WizardStep[] = ['what', 'where', 'prep', 'connect']

export interface WizardState {
  step: WizardStep
  /** pc = 다른 PC 화면 보기 · phone = 휴대폰으로 이 PC 보기(기존 QR 안내로) · host = 다른 PC가 이 PC를 보게 코드 보여 주기 */
  what: 'pc' | 'phone' | 'host' | null
  /** 같은 와이파이 · 밖(다른 네트워크) — 준비물 안내만 달라진다 */
  where: 'same' | 'away' | null
  /** 짝지은(또는 고른) PC */
  peerId: string | null
  name: string
  color: WorkspaceColor
  error: string | null
}

export type WizardAction =
  | { type: 'pickWhat'; what: 'pc' | 'phone' | 'host' }
  | { type: 'pickWhere'; where: 'same' | 'away' }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'paired'; peerId: string; name: string }
  | { type: 'setName'; name: string }
  | { type: 'setColor'; color: WorkspaceColor }
  | { type: 'fail'; error: string }

export const initialWizard = (color: WorkspaceColor): WizardState => ({ step: 'what', what: null, where: null, peerId: null, name: '', color, error: null })

/** 다음 장으로 갈 수 있는지 (휴대폰·이 PC 보여 주기는 첫 장에서 끝난다) */
export function canNext(s: WizardState): boolean {
  if (s.step === 'what') return s.what === 'pc'
  if (s.step === 'where') return s.where !== null
  return s.step === 'prep'
}

/** 마지막에 '추가'를 누를 수 있는지 */
export const canFinish = (s: WizardState) => s.step === 'connect' && s.peerId !== null && s.name.trim() !== ''

export function wizardReducer(s: WizardState, a: WizardAction): WizardState {
  switch (a.type) {
    case 'pickWhat':
      return { ...s, what: a.what, error: null }
    case 'pickWhere':
      return { ...s, where: a.where, error: null }
    case 'next': {
      if (!canNext(s)) return s
      const i = WIZARD_STEPS.indexOf(s.step)
      return { ...s, step: WIZARD_STEPS[i + 1], error: null }
    }
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
