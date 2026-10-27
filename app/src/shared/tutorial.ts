// 첫 업무 튜토리얼 — 모의 진행 엔진 (docs/specs/tutorial-scenario.md)
// AI를 부르지 않고 대본대로 단계를 넘긴다. 이 파일은 "지금 어느 단계이고, 다음엔 무엇을 해야 하나"만 정하고,
// 실제 카드·기획안·회의 데이터는 main/tutorial.ts가 효과(TutorialEffect)를 받아 바꾼다.

import type { TKey } from './i18n/dict/index.ts'

export type TutorialScenario = 'task' | 'meeting'
export type TutorialView = 'board' | 'inbox' | 'meeting' | 'office'
export type CastRole = 'lead' | 'designer' | 'dev'

/** 사용자가 진짜 화면에서 한 일 (화면이 알려 주거나, office가 카드·회의를 처리하며 알려 준다). timer = 대기가 끝남·"지금 보기" */
export type TutorialEvent =
  | { type: 'view'; view: TutorialView }
  | { type: 'taskCreated' | 'taskStarted' | 'planApproved' | 'resultOpened' | 'taskDone' | 'meetingStarted' | 'todosCreated' | 'finish' | 'timer' }

/** 화면이 보내는 진행 입력: 본 화면·연 카드 · 끝내기 버튼(B5) · 회의 결정 '할 일로 올리기'(B3) · 건너뛰기 · 지금 보기 · 튜토리얼 끝내기 */
export type TutorialInput =
  | { type: 'view'; view: TutorialView }
  | { type: 'resultOpened' }
  | { type: 'finish' }
  | { type: 'createTodos' }
  | { type: 'skipStep' }
  | { type: 'showNow' }
  | { type: 'end' }

/**
 * 대본이 사무실에 일으키는 일. 모두 여러 번 해도 결과가 같아야 한다 — 앱을 다시 켜면 지금 단계의 효과를 한 번 더 한다.
 * createTask·startTask·approvePlan·finishTask·startMeeting·createTodos는 "이 단계 건너뛰기"에서 사용자 대신 누르는 일
 */
export type TutorialEffect =
  | { kind: 'createTask' | 'startTask' | 'proposePlan' | 'approvePlan' | 'finishTask' | 'startMeeting' | 'wrapMeeting' | 'createTodos' }
  | { kind: 'work'; phase: 'start' | 'done' }
  /** 회의 발언을 대본 앞에서부터 count개로 맞춘다 */
  | { kind: 'talk'; count: number }
  /** 연습 직원 말풍선 — 적지 않은 직원은 말풍선을 지운다 */
  | { kind: 'bubbles'; lines: Partial<Record<CastRole, TKey>> }
  /** 축하 화면 — amount가 0보다 크면 회사 자금을 준다 (시나리오마다 처음 한 번) */
  | { kind: 'complete'; scenario: TutorialScenario; amount: number }

interface StepDef {
  id: string
  /** 화면 위 안내 한 줄 */
  hint: TKey
  /** 넘어가는 조건 */
  until: TutorialEvent['type']
  /** until이 view면 열려야 할 화면 */
  view?: TutorialView
  /** until이 timer면 기다리는 시간 */
  waitMs?: number
  /** 이 단계에 들어올 때 */
  enter?: TutorialEffect[]
  /** 말풍선 (단계마다 통째로 맞춘다) */
  bubbles?: Partial<Record<CastRole, TKey>>
  /** "이 단계 건너뛰기" — 사용자 대신 누르는 일 */
  skip?: TutorialEffect[]
  /** 단계 안내 아래 덧붙이는 한 줄 (토스트·메모) */
  note?: TKey
}

const SAY_MS = 4_000

const STEPS: Record<TutorialScenario, StepDef[]> = {
  task: [
    { id: 'a1', hint: 'tutorial.task.a1.hint', until: 'view', view: 'board' },
    { id: 'a2', hint: 'tutorial.task.a2.hint', note: 'tutorial.task.a2.note', until: 'taskCreated', skip: [{ kind: 'createTask' }] },
    { id: 'a3', hint: 'tutorial.task.a3.hint', until: 'taskStarted', skip: [{ kind: 'startTask' }] },
    { id: 'a3wait', hint: 'tutorial.task.auto1.hint', until: 'timer', waitMs: 4_000, bubbles: { lead: 'tutorial.task.a3.bubble' } },
    { id: 'a4', hint: 'tutorial.task.a4.hint', until: 'view', view: 'inbox', enter: [{ kind: 'proposePlan' }], bubbles: { lead: 'tutorial.task.auto1.bubble' } },
    { id: 'a5', hint: 'tutorial.task.a5.hint', until: 'planApproved', skip: [{ kind: 'approvePlan' }] },
    {
      id: 'a5wait',
      hint: 'tutorial.task.auto2.hint',
      until: 'timer',
      waitMs: 12_000,
      note: 'tutorial.task.a5.toast',
      enter: [{ kind: 'work', phase: 'start' }],
      bubbles: { designer: 'tutorial.task.designer.working', dev: 'tutorial.task.dev.working' },
    },
    {
      id: 'a6',
      hint: 'tutorial.task.a6.hint',
      until: 'resultOpened',
      enter: [{ kind: 'work', phase: 'done' }],
      bubbles: { designer: 'tutorial.task.designer.done', dev: 'tutorial.task.dev.done', lead: 'tutorial.task.lead.wrap' },
    },
    { id: 'a7', hint: 'tutorial.task.a7.hint', until: 'taskDone', skip: [{ kind: 'finishTask' }] },
  ],
  meeting: [
    { id: 'b1', hint: 'tutorial.meeting.b1.hint', until: 'view', view: 'meeting' },
    { id: 'b2', hint: 'tutorial.meeting.b2.hint', until: 'meetingStarted', skip: [{ kind: 'startMeeting' }] },
    { id: 'b2say1', hint: 'tutorial.meeting.auto.hint', until: 'timer', waitMs: SAY_MS, enter: [{ kind: 'talk', count: 1 }], bubbles: { lead: 'tutorial.meeting.say.lead' } },
    { id: 'b2say2', hint: 'tutorial.meeting.auto.hint', until: 'timer', waitMs: SAY_MS, enter: [{ kind: 'talk', count: 2 }], bubbles: { designer: 'tutorial.meeting.say.designer' } },
    { id: 'b2say3', hint: 'tutorial.meeting.auto.hint', until: 'timer', waitMs: SAY_MS, enter: [{ kind: 'talk', count: 3 }], bubbles: { dev: 'tutorial.meeting.say.dev' } },
    { id: 'b2wrap', hint: 'tutorial.meeting.wrap.hint', until: 'timer', waitMs: 3_000, enter: [{ kind: 'talk', count: 3 }], bubbles: { lead: 'tutorial.meeting.wrap.bubble' } },
    { id: 'b3', hint: 'tutorial.meeting.b3.hint', until: 'todosCreated', enter: [{ kind: 'wrapMeeting' }], skip: [{ kind: 'createTodos' }] },
    { id: 'b4', hint: 'tutorial.meeting.b4.hint', until: 'view', view: 'board', note: 'tutorial.meeting.b4.note' },
    { id: 'b5', hint: 'tutorial.meeting.b5.hint', until: 'finish' },
  ],
}

/** 시나리오를 처음 끝냈을 때 주는 회사 자금 (시나리오마다 한 번) */
export const TUTORIAL_REWARD = 5_000_000

/** 마지막 단계 다음 = 축하 화면 */
export const DONE_STEP = 'done'

export interface TutorialState {
  /** 진행 중인 시나리오 (null = 튜토리얼 밖) */
  scenario: TutorialScenario | null
  /** 지금 단계 id · 다 끝났으면 DONE_STEP */
  step: string | null
  /** 지금 단계에 들어온 시각 (대기 단계의 남은 시간 계산) */
  stepAt: number
  /** 끝까지 해 본 시나리오 (보상은 이 목록에 처음 들어갈 때 한 번) */
  completed: TutorialScenario[]
  /** 이번에 끝낸 시나리오로 받은 회사 자금 (축하 화면 보상 줄 — 이미 해 본 시나리오면 0) */
  reward: number
}

export const IDLE_TUTORIAL: TutorialState = { scenario: null, step: null, stepAt: 0, completed: [], reward: 0 }

export interface Transition {
  state: TutorialState
  effects: TutorialEffect[]
}

export const stepsOf = (scenario: TutorialScenario) => STEPS[scenario]

export function currentStep(state: TutorialState): StepDef | null {
  if (!state.scenario) return null
  return STEPS[state.scenario].find((s) => s.id === state.step) ?? null
}

/** 단계에 들어올 때 할 일 — 다시 켰을 때도 이걸 한 번 더 한다 */
export function enterEffects(state: TutorialState): TutorialEffect[] {
  if (!state.scenario) return []
  if (state.step === DONE_STEP) return [{ kind: 'bubbles', lines: {} }, { kind: 'complete', scenario: state.scenario, amount: state.reward }]
  const step = currentStep(state)
  if (!step) return []
  return [...(step.enter ?? []), { kind: 'bubbles', lines: step.bubbles ?? {} }]
}

function goTo(state: TutorialState, scenario: TutorialScenario, step: string, now: number, before: TutorialEffect[] = []): Transition {
  const isFirstDone = step === DONE_STEP && !state.completed.includes(scenario)
  const completed = isFirstDone ? [...state.completed, scenario] : state.completed
  const next: TutorialState = { scenario, step, stepAt: now, completed, reward: isFirstDone ? TUTORIAL_REWARD : 0 }
  return { state: next, effects: [...before, ...enterEffects(next)] }
}

function nextStepId(scenario: TutorialScenario, stepId: string) {
  const steps = STEPS[scenario]
  const i = steps.findIndex((s) => s.id === stepId)
  return steps[i + 1]?.id ?? DONE_STEP
}

/** 시나리오를 처음부터 시작한다 (진행 중이던 시나리오가 있어도 새로) */
export function startScenario(state: TutorialState, scenario: TutorialScenario, now: number): Transition {
  return goTo(state, scenario, STEPS[scenario][0].id, now)
}

/** 일어난 일이 지금 단계의 넘어가는 조건이면 다음 단계로. 상관없는 일이면 null (엉뚱한 곳을 눌러도 막지 않고 그대로 둔다) */
export function onEvent(state: TutorialState, event: TutorialEvent, now: number): Transition | null {
  const step = currentStep(state)
  if (!step || !state.scenario || step.until !== event.type) return null
  if (event.type === 'view' && event.view !== step.view) return null
  return goTo(state, state.scenario, nextStepId(state.scenario, step.id), now)
}

/** "이 단계 건너뛰기" — 사용자 대신 누를 일을 하고 다음 단계로 */
export function skipStep(state: TutorialState, now: number): Transition | null {
  const step = currentStep(state)
  if (!step || !state.scenario) return null
  return goTo(state, state.scenario, nextStepId(state.scenario, step.id), now, step.skip ?? [])
}

/** 튜토리얼 끝내기 (끝낸 시나리오 기록은 남긴다) */
export const endTutorial = (state: TutorialState): TutorialState => ({ ...IDLE_TUTORIAL, completed: state.completed })

/** 대기 단계면 남은 시간 (그 밖엔 null) */
export function remainingWait(state: TutorialState, now: number): number | null {
  const step = currentStep(state)
  if (!step || step.until !== 'timer') return null
  return Math.max(0, (step.waitMs ?? 0) - (now - state.stepAt))
}

/** 화면에 보내는 진행 상태 (스냅샷 tutorial) */
export interface TutorialSnapshot {
  scenario: TutorialScenario | null
  step: string | null
  stepAt: number
  hint: TKey | null
  note: TKey | null
  /** 넘어가는 조건 — timer면 "지금 보기", view면 그 화면을 하이라이트 */
  until: TutorialEvent['type'] | null
  view: TutorialView | null
  waitMs: number | null
  completed: TutorialScenario[]
  /** 이번에 끝낸 시나리오로 받은 회사 자금 (0 = 이미 해 본 시나리오) */
  reward: number
  /** 연습 회사(랩·팀·직원·카드·회의)가 남아 있는지 — "연습 회사 정리" 버튼 */
  hasPractice: boolean
  /** 연습 회사 구성원 (화면이 담당자·참석자를 미리 채울 때) */
  cast: PracticeCast | null
  /** 시나리오 A의 연습 카드 · 시나리오 B의 연습 회의 */
  taskId: string | null
  meetingId: string | null
}

export interface PracticeCast {
  labId: string
  teamId: string
  leadId: string
  designerId: string
  devId: string
}

export function tutorialSnapshot(state: TutorialState, extra: Pick<TutorialSnapshot, 'hasPractice' | 'cast' | 'taskId' | 'meetingId'>): TutorialSnapshot {
  const step = currentStep(state)
  return {
    scenario: state.scenario,
    step: state.step,
    stepAt: state.stepAt,
    hint: step?.hint ?? null,
    note: step?.note ?? null,
    until: step?.until ?? null,
    view: step?.view ?? null,
    waitMs: step?.waitMs ?? null,
    completed: state.completed,
    reward: state.reward,
    ...extra,
  }
}
