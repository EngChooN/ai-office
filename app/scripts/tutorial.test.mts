// 연습 튜토리얼 모의 진행 엔진 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DONE_STEP,
  endTutorial,
  enterEffects,
  IDLE_TUTORIAL,
  mainProgress,
  onEvent,
  remainingWait,
  skipStep,
  startScenario,
  stepsOf,
  TUTORIAL_REWARD,
  tutorialSnapshot,
  type TutorialEvent,
  type TutorialState,
  type Transition,
} from '../src/shared/tutorial.ts'

const NOW = 1_000_000

/** 이벤트를 차례로 넣어 본다 (받아들이지 않은 이벤트가 있으면 실패) */
function play(state: TutorialState, events: TutorialEvent[]) {
  const effects: Transition['effects'] = []
  for (const event of events) {
    const tr = onEvent(state, event, NOW)
    assert.ok(tr, `${state.step}에서 ${JSON.stringify(event)}를 받아야 한다`)
    state = tr.state
    effects.push(...tr.effects)
  }
  return { state, effects }
}

const kinds = (effects: Transition['effects']) => effects.map((e) => e.kind).filter((k) => k !== 'bubbles')

test('업무 맡기기: 사무실 보기 → 단체방 지시 → 기획안 결재 → 팀원 작업 → 단체방 결과 보고에서 완료, 보상을 준다', () => {
  const start = startScenario(IDLE_TUTORIAL, 'task', NOW)
  assert.equal(start.state.step, 'p1')
  const { state, effects } = play(start.state, [
    { type: 'ack' },
    { type: 'chatSent' },
    { type: 'timer' },
    { type: 'view', view: 'inbox' },
    { type: 'planApproved' },
    { type: 'timer' },
    { type: 'taskDone' },
  ])
  assert.equal(state.step, DONE_STEP)
  assert.deepEqual(state.completed, ['task'])
  assert.equal(state.reward, TUTORIAL_REWARD)
  // 리드의 답 → 기획안(카드에 먼저 붙이고 단체방에 확인 요청) → 팀원 작업 → 결과(카드 검토 칸 뒤 단체방 보고)
  assert.deepEqual(kinds(effects), ['chat', 'proposePlan', 'chat', 'work', 'work', 'chat', 'complete'])
  assert.deepEqual(
    effects.flatMap((e) => (e.kind === 'chat' ? [e.line] : [])),
    ['ack', 'plan', 'report'],
  )
  assert.deepEqual(effects.find((e) => e.kind === 'complete'), { kind: 'complete', scenario: 'task', amount: TUTORIAL_REWARD })
})

test('업무 맡기기: AI를 부르는 효과가 없다 — 카드 만들기·담당자 지정 단계도 없다 (단체방 흐름 하나)', () => {
  const kindsInScript = stepsOf('task').flatMap((st) => [...(st.enter ?? []), ...(st.skip ?? [])].map((e) => e.kind))
  for (const k of kindsInScript) assert.ok(['chat', 'sendChat', 'proposePlan', 'approvePlan', 'work', 'finishTask'].includes(k), k)
  assert.deepEqual(
    stepsOf('task').map((st) => st.until),
    ['ack', 'chatSent', 'timer', 'view', 'planApproved', 'timer', 'taskDone'],
  )
})

test('진행 표시: 직접 하는 단계만 센다 — 업무 연습 4단계, 기다리는 단계는 앞 번호', () => {
  const at = (step: string) => mainProgress('task', step)
  assert.deepEqual(at('p1'), { n: 1, total: 4 })
  assert.deepEqual(at('p2'), { n: 2, total: 4 })
  assert.deepEqual(at('p2wait'), { n: 2, total: 4 })
  assert.deepEqual(at('p3'), { n: 2, total: 4 })
  assert.deepEqual(at('a5'), { n: 3, total: 4 })
  assert.deepEqual(at('a5wait'), { n: 3, total: 4 })
  assert.deepEqual(at('p6'), { n: 4, total: 4 })
  assert.deepEqual(mainProgress('meeting', 'b1'), { n: 1, total: 5 })
  assert.deepEqual(mainProgress('meeting', 'b2say2'), { n: 2, total: 5 })
})

test('회의 열기: 발언 3개 → 정리 → 결정을 할 일 카드로 → 끝', () => {
  const start = startScenario(IDLE_TUTORIAL, 'meeting', NOW)
  const { state, effects } = play(start.state, [
    { type: 'view', view: 'meeting' },
    { type: 'meetingStarted' },
    { type: 'timer' },
    { type: 'timer' },
    { type: 'timer' },
    { type: 'timer' },
    { type: 'todosCreated' },
    { type: 'view', view: 'board' },
    { type: 'finish' },
  ])
  assert.equal(state.step, DONE_STEP)
  const talks = effects.flatMap((e) => (e.kind === 'talk' ? [e.count] : []))
  assert.deepEqual(talks, [1, 2, 3, 3])
  assert.deepEqual(kinds(effects).slice(-2), ['wrapMeeting', 'complete'])
})

test('지금 단계와 상관없는 일·다른 화면은 무시한다 (막지 않고 그대로)', () => {
  const { state } = startScenario(IDLE_TUTORIAL, 'task', NOW)
  assert.equal(onEvent(state, { type: 'view', view: 'inbox' }, NOW), null)
  assert.equal(onEvent(state, { type: 'taskDone' }, NOW), null)
  assert.equal(onEvent(state, { type: 'chatSent' }, NOW), null, 'P1에서 보낸 말은 아직 연습으로 받지 않는다')
  assert.equal(onEvent(IDLE_TUTORIAL, { type: 'view', view: 'board' }, NOW), null)
})

test('건너뛰기: 사용자 대신 누를 일을 먼저 하고 다음 단계로', () => {
  let state = play(startScenario(IDLE_TUTORIAL, 'task', NOW).state, [{ type: 'ack' }]).state
  const p2 = skipStep(state, NOW)!
  assert.equal(p2.state.step, 'p2wait')
  // 대신 보낸 지시가 먼저, 그다음 리드의 답
  assert.deepEqual(kinds(p2.effects), ['sendChat', 'chat'])
  state = play(p2.state, [{ type: 'timer' }, { type: 'view', view: 'inbox' }]).state
  const a5 = skipStep(state, NOW)!
  // 승인(하위 카드 생성)이 팀원 작업 시작보다 먼저
  assert.deepEqual(kinds(a5.effects), ['approvePlan', 'work'])
  state = play(a5.state, [{ type: 'timer' }]).state
  assert.deepEqual(kinds(skipStep(state, NOW)!.effects), ['finishTask', 'complete'])
  // 축하 화면에서는 더 건너뛸 단계가 없다
  let s = startScenario(IDLE_TUTORIAL, 'meeting', NOW).state
  for (let i = 0; i < stepsOf('meeting').length; i++) s = skipStep(s, NOW)!.state
  assert.equal(s.step, DONE_STEP)
  assert.equal(skipStep(s, NOW), null)
})

test('보상은 시나리오마다 처음 끝낼 때 한 번', () => {
  const finish = (state: TutorialState) => {
    let s = startScenario(state, 'task', NOW).state
    while (s.step !== DONE_STEP) s = skipStep(s, NOW)!.state
    return s
  }
  const first = finish(IDLE_TUTORIAL)
  assert.equal(first.reward, TUTORIAL_REWARD)
  const again = finish(endTutorial(first))
  assert.equal(again.reward, 0)
  assert.deepEqual(again.completed, ['task'])
  assert.deepEqual(enterEffects(again).find((e) => e.kind === 'complete'), { kind: 'complete', scenario: 'task', amount: 0 })
})

test('대기 단계: 남은 시간 · 지난 시간이 넘으면 0 · 다른 단계는 null', () => {
  const s = play(startScenario(IDLE_TUTORIAL, 'task', NOW).state, [{ type: 'ack' }, { type: 'chatSent' }]).state
  assert.equal(s.step, 'p2wait')
  assert.equal(remainingWait(s, NOW + 1_000), 3_000)
  assert.equal(remainingWait(s, NOW + 60_000), 0)
  assert.equal(remainingWait(startScenario(IDLE_TUTORIAL, 'task', NOW).state, NOW), null)
})

test('다시 켜면 지금 단계 효과를 한 번 더 (말풍선은 단계마다 통째로 맞춘다)', () => {
  const s = play(startScenario(IDLE_TUTORIAL, 'meeting', NOW).state, [{ type: 'view', view: 'meeting' }, { type: 'meetingStarted' }, { type: 'timer' }]).state
  assert.equal(s.step, 'b2say2')
  assert.deepEqual(enterEffects(s), [
    { kind: 'talk', count: 2 },
    { kind: 'bubbles', lines: { designer: 'tutorial.meeting.say.designer' } },
  ])
  // 끝내면 시나리오는 비우고 해 본 기록만 남는다
  const ended = endTutorial({ ...s, completed: ['task'] })
  assert.deepEqual(ended, { ...IDLE_TUTORIAL, completed: ['task'] })
  assert.deepEqual(enterEffects(ended), [])
})

test('스냅샷: 지금 단계의 안내·조건·대기 시간', () => {
  const s = play(startScenario(IDLE_TUTORIAL, 'task', NOW).state, [{ type: 'ack' }, { type: 'chatSent' }]).state
  const snap = tutorialSnapshot(s, { hasPractice: true, cast: null, taskId: 't1', meetingId: null, chatRoom: '' })
  assert.equal(snap.hint, 'tutorial.task.auto1.hint')
  assert.equal(snap.until, 'timer')
  assert.equal(snap.waitMs, 4_000)
  assert.equal(snap.taskId, 't1')
  const b4 = tutorialSnapshot({ scenario: 'meeting', step: 'b4', stepAt: NOW, completed: [], reward: 0 }, { hasPractice: true, cast: null, taskId: null, meetingId: 'm1', chatRoom: null })
  assert.equal(b4.view, 'board')
  assert.equal(b4.note, 'tutorial.meeting.b4.note')
})

test('대본 시간 예산: 업무 맡기기 대기 12초(리드 답 4초 + 팀원 작업 8초) · 회의 열기 대기 15초', () => {
  const waits = (scenario: 'task' | 'meeting') => stepsOf(scenario).reduce((sum, st) => sum + (st.waitMs ?? 0), 0)
  assert.equal(waits('task'), 12_000)
  assert.equal(waits('meeting'), 15_000)
})
