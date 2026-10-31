// 바탕화면 비서: 위치 보정·펼침 창 배치·끌기/클릭 구분·결재 중복 처리·질문 답하기·말풍선 우선순위·표정 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import {
  addSettled,
  FLASH_MS,
  nextFaceChange,
  outcomeFace,
  PET_FACE,
  pickFace,
  type PetFaceState,
  canPetMove,
  checkPetAnswer,
  checkPetDecide,
  checkPetQuestion,
  fitsPetPanel,
  clampToArea,
  defaultPetBounds,
  InFlight,
  isDragMove,
  listenAll,
  mergeAct,
  nextIdleDelay,
  PANEL_SIZE,
  petAlignFor,
  petCharRect,
  petAnswer,
  petDecide,
  petSkipQuestion,
  PET_QUESTION_LIMIT,
  petLayout,
  petOpacity,
  petSize,
  pickBubble,
  pickIdleAct,
  PET_MOTION,
  petMotionVars,
  placePanel,
  pruneSettled,
  recentAuto,
  REFIT_EVENTS,
  resizePet,
  SCREEN_MARGIN,
  settlePet,
  settleVanished,
  SETTLED_MS,
  SNAP_DISTANCE,
  type PetApproval,
  type Rect,
} from '../src/shared/deskPet.ts'
import { DEFAULT_SETTINGS, type Approval, type AutoHandled, type Staff, type StaffQuestion } from '../src/shared/types.ts'
import { collectAnswers, isCompleteAnswer, togglePick } from '../src/shared/questionAnswer.ts'

const PET_SIZE = petLayout(112).window

const AREA = { x: 0, y: 25, width: 1440, height: 875 }

test('위치 보정: 화면 밖으로 나간 창을 안으로 되돌린다', () => {
  const b = { x: 2000, y: -50, ...PET_SIZE }
  assert.deepEqual(clampToArea(b, AREA), { ...b, x: 1440 - PET_SIZE.width, y: 25 })
  // 안에 있으면 그대로
  const inside = { x: 100, y: 200, ...PET_SIZE }
  assert.deepEqual(clampToArea(inside, AREA), inside)
  // 모니터를 빼서 왼쪽 음수 좌표에 남은 경우
  assert.equal(clampToArea({ x: -1800, y: 300, ...PET_SIZE }, AREA).x, 0)
})

test('위치 보정: 기본 위치는 오른쪽 아래 여백 안', () => {
  const b = defaultPetBounds(AREA, 112)
  assert.equal(b.x + b.width, AREA.x + AREA.width - SCREEN_MARGIN)
  assert.equal(b.y + b.height, AREA.y + AREA.height - SCREEN_MARGIN)
})

test('펼침 창: 왼쪽에 자리가 있으면 왼쪽, 없으면 오른쪽', () => {
  const right = placePanel({ x: 1100, y: 600, ...PET_SIZE }, AREA)
  assert.equal(right.x, 1100 - PANEL_SIZE.width - SCREEN_MARGIN)
  const left = placePanel({ x: 20, y: 600, ...PET_SIZE }, AREA)
  assert.equal(left.x, 20 + PET_SIZE.width + SCREEN_MARGIN)
})

test('펼침 창: 화면 안·여백 12px 안에 들어가고, 낮은 화면이면 높이를 줄인다', () => {
  for (const pet of [{ x: 1100, y: 30, ...PET_SIZE }, { x: 0, y: 700, ...PET_SIZE }, { x: 600, y: 400, ...PET_SIZE }]) {
    const p = placePanel(pet, AREA)
    assert.ok(p.x >= AREA.x + SCREEN_MARGIN && p.x + p.width <= AREA.x + AREA.width - SCREEN_MARGIN, `x ${p.x}`)
    assert.ok(p.y >= AREA.y + SCREEN_MARGIN && p.y + p.height <= AREA.y + AREA.height - SCREEN_MARGIN, `y ${p.y}`)
  }
  const low = { x: 0, y: 0, width: 1440, height: 400 }
  assert.equal(placePanel({ x: 1100, y: 100, ...PET_SIZE }, low).height, 400 - SCREEN_MARGIN * 2)
})

test('펼침 창: 좁은 화면(양옆 모두 400px이 안 남음)에서도 화면 안에 들어간다', () => {
  const narrow = { x: 0, y: 0, width: 700, height: 600 }
  for (const x of [0, 250, 300, 628]) {
    const p = placePanel({ x, y: 400, ...PET_SIZE }, narrow)
    assert.equal(p.width, PANEL_SIZE.width)
    assert.ok(p.x >= SCREEN_MARGIN && p.x + p.width <= narrow.width - SCREEN_MARGIN, `x ${p.x}`)
  }
})

test('끌기와 클릭: 기준 거리 이하면 클릭, 넘으면 끌기', () => {
  assert.equal(isDragMove(0, 0), false)
  assert.equal(isDragMove(3, 3), false)
  assert.equal(isDragMove(5, 0), false)
  assert.equal(isDragMove(6, 0), true)
  assert.equal(isDragMove(-4, -4), true)
})

const approval = (id: string, extra: Partial<Approval> = {}): Approval => ({ id, staffId: 's1', toolName: 'Bash', summary: 'ls', createdAt: 1, ...extra })
const staffWith = (approvals: Approval[], kind: Staff['kind'] = 'hired') => [{ id: 's1', kind, name: '김직원', approvals } as unknown as Staff]

test('결재 확인: 대기 중이면 ok, 없으면 already, 질문이면 question, 외부 직원은 already', () => {
  const staff = staffWith([approval('a1'), approval('q1', { questions: [{ question: '?', header: 'h', options: [], multiSelect: false }] })])
  assert.equal(checkPetDecide(staff, 'a1'), 'ok')
  assert.equal(checkPetDecide(staff, 'zz'), 'already')
  assert.equal(checkPetDecide(staff, 'q1'), 'question')
  assert.equal(checkPetDecide(staffWith([approval('a1')], 'external'), 'a1'), 'already')
})

test('결재 중복: 같은 결재를 동시에 두 번 누르면 한 번만 처리한다', async () => {
  let pending = [approval('a1')]
  const calls: string[] = []
  let release: () => void = () => {}
  const gate = new Promise<void>((r) => (release = r))
  const deps = {
    staff: () => staffWith(pending),
    inFlight: new InFlight(),
    decide: async (id: string) => {
      calls.push(id)
      await gate
      const had = pending.some((a) => a.id === id)
      pending = pending.filter((a) => a.id !== id)
      return had
    },
  }
  const first = petDecide(deps, 'a1', true)
  const second = await petDecide(deps, 'a1', true)
  assert.equal(second, 'busy')
  release()
  assert.equal(await first, 'done')
  assert.deepEqual(calls, ['a1'])
  // 끝난 뒤 다시 누르면 이미 처리됨 — 처리 함수를 부르지 않는다
  assert.equal(await petDecide(deps, 'a1', false), 'already')
  assert.deepEqual(calls, ['a1'])
})

test('결재 중복: 확인 뒤 다른 곳에서 먼저 처리돼 처리 함수가 false면 already', async () => {
  const deps = { staff: () => staffWith([approval('a1')]), inFlight: new InFlight(), decide: () => false }
  assert.equal(await petDecide(deps, 'a1', true), 'already')
  // 실패해도 처리 중 표시가 남지 않는다
  assert.equal(deps.inFlight.begin('a1'), true)
})

test('결재 우회 방지: 질문은 처리 함수를 부르지 않는다', async () => {
  let isCalled = false
  const deps = { staff: () => staffWith([approval('q1', { questions: [{ question: '?', header: 'h', options: [], multiSelect: false }] })]), inFlight: new InFlight(), decide: () => (isCalled = true) }
  assert.equal(await petDecide(deps, 'q1', true), 'question')
  assert.equal(isCalled, false)
})

test('처리 함수가 예외를 내도 처리 중 표시가 풀린다', async () => {
  const deps = {
    staff: () => staffWith([approval('a1')]),
    inFlight: new InFlight(),
    decide: () => {
      throw new Error('boom')
    },
  }
  await assert.rejects(petDecide(deps, 'a1', true))
  assert.equal(deps.inFlight.begin('a1'), true)
})

const opt = (label: string, description = '') => ({ label, description })
const q = (question: string, n = 2, extra: Partial<StaffQuestion> = {}): StaffQuestion => ({ question, header: '', options: Array.from({ length: n }, (_, i) => opt(`선택${i + 1}`)), multiSelect: false, ...extra })

test('질문 답 묶기(앱과 같은 규칙): 하나 고르기는 바꾸고 다시 누르면 풀림, 여러 개는 쉼표로, 직접 적은 답이 우선', () => {
  let p = togglePick({}, 'A?', 'x', false)
  p = togglePick(p, 'A?', 'y', false)
  assert.deepEqual(p['A?'], ['y'])
  assert.deepEqual(togglePick(p, 'A?', 'y', false)['A?'], [])
  let m = togglePick({}, 'B?', 'x', true)
  m = togglePick(m, 'B?', 'y', true)
  const qs = [q('A?'), q('B?', 2, { multiSelect: true })]
  assert.deepEqual(collectAnswers(qs, { ...p, ...m }, {}), { 'A?': 'y', 'B?': 'x, y' })
  assert.deepEqual(collectAnswers(qs, { ...p, ...m }, { 'A?': '  직접  ' }), { 'A?': '직접', 'B?': 'x, y' })
  // 하나라도 비면 보낼 수 없다 (빈칸만 적은 기타도 빈 답)
  assert.equal(collectAnswers(qs, m, { 'A?': '   ' }), null)
})

test('질문 답 확인: 질문마다 빈칸 없는 문자열 하나, 모르는 질문·빠진 질문·문자열 아닌 값은 거른다', () => {
  const qs = [q('A?'), q('B?')]
  assert.equal(isCompleteAnswer(qs, { 'A?': '1', 'B?': '2' }), true)
  assert.equal(isCompleteAnswer(qs, { 'A?': '1' }), false)
  assert.equal(isCompleteAnswer(qs, { 'A?': '1', 'B?': ' ' }), false)
  assert.equal(isCompleteAnswer(qs, { 'A?': '1', 'C?': '2' }), false)
  assert.equal(isCompleteAnswer(qs, { 'A?': '1', 'B?': '2', 'C?': '3' }), false)
  assert.equal(isCompleteAnswer(qs, { 'A?': '1', 'B?': 2 }), false)
  for (const bad of [null, 'A', ['A?'], undefined]) assert.equal(isCompleteAnswer(qs, bad), false)
})

test('펼침 창 질문: 질문 1~2개·선택지 2~4개·짧은 글이면 여기서, 넘으면 앱에서 열기', () => {
  const L = PET_QUESTION_LIMIT
  assert.equal(fitsPetPanel([q('A?', 2)]), true)
  assert.equal(fitsPetPanel([q('A?', 4), q('B?', 3, { multiSelect: true })]), true)
  assert.equal(fitsPetPanel([]), false)
  assert.equal(fitsPetPanel([q('A?', 1)]), false)
  assert.equal(fitsPetPanel([q('A?', 5)]), false)
  assert.equal(fitsPetPanel([q('A?'), q('B?'), q('C?')]), false)
  assert.equal(fitsPetPanel([q('가'.repeat(L.question))]), true)
  assert.equal(fitsPetPanel([q('가'.repeat(L.question + 1))]), false)
  assert.equal(fitsPetPanel([{ ...q('A?'), options: [opt('가'.repeat(L.label)), opt('b')] }]), true)
  assert.equal(fitsPetPanel([{ ...q('A?'), options: [opt('가'.repeat(L.label + 1)), opt('b')] }]), false)
  assert.equal(fitsPetPanel([{ ...q('A?'), options: [opt('a', '가'.repeat(L.description)), opt('b')] }]), true)
  assert.equal(fitsPetPanel([{ ...q('A?'), options: [opt('a', '가'.repeat(L.description + 1)), opt('b')] }]), false)
  // 이모지는 한 글자로 센다
  assert.equal(fitsPetPanel([q('😀'.repeat(L.question))]), true)
  // 하나하나는 괜찮아도 합치면 길면 앱에서
  const long = (n: string) => ({ ...q(n, 4), question: '가'.repeat(100), options: Array.from({ length: 4 }, (_, i) => opt(`${n}${i}`, '나'.repeat(60))) })
  assert.equal(fitsPetPanel([long('A')]), true)
  assert.equal(fitsPetPanel([long('A'), long('B')]), false)
})

test('질문 확인: 평소 결재는 답하기 길로 못 가고, 질문은 승인 길로 못 간다', () => {
  const staff = staffWith([approval('a1'), approval('q1', { questions: [q('A?')] }), approval('q2', { questions: [q('A?', 6)] })])
  assert.equal(checkPetQuestion(staff, 'q1'), 'ok')
  assert.equal(checkPetQuestion(staff, 'a1'), 'notQuestion')
  assert.equal(checkPetQuestion(staff, 'q2'), 'tooComplex')
  assert.equal(checkPetQuestion(staff, 'zz'), 'already')
  assert.equal(checkPetAnswer(staff, 'q1', { 'A?': '선택1' }), 'ok')
  assert.equal(checkPetAnswer(staff, 'q1', { 'A?': '' }), 'invalid')
  assert.equal(checkPetAnswer(staff, 'a1', { 'A?': 'x' }), 'notQuestion')
  assert.equal(checkPetAnswer(staff, 'q2', { 'A?': 'x' }), 'tooComplex')
  assert.equal(checkPetAnswer(staff, 'zz', { 'A?': 'x' }), 'already')
  assert.equal(checkPetAnswer(staffWith([approval('q1', { questions: [q('A?')] })], 'external'), 'q1', { 'A?': 'x' }), 'already')
  assert.equal(checkPetDecide(staff, 'q1'), 'question')
})

test('질문 답하기: 앱과 같은 처리 함수로 한 번만, 다른 곳에서 먼저 답했으면 already, 거른 질문은 처리 함수를 부르지 않는다', async () => {
  let pending = [approval('q1', { questions: [q('A?')] }), approval('a1')]
  const calls: string[] = []
  let release: () => void = () => {}
  const gate = new Promise<void>((r) => (release = r))
  const inFlight = new InFlight()
  const deps = {
    staff: () => staffWith(pending),
    inFlight,
    answerQuestion: async (id: string, answers: Record<string, string>) => {
      calls.push(`${id}:${answers['A?']}`)
      await gate
      const had = pending.some((a) => a.id === id)
      pending = pending.filter((a) => a.id !== id)
      return had
    },
  }
  const first = petAnswer(deps, 'q1', { 'A?': '선택1' })
  // 답하는 중 같은 질문을 다시 답하거나 넘기면 busy (결재와 같은 InFlight)
  assert.equal(await petAnswer(deps, 'q1', { 'A?': '선택2' }), 'busy')
  assert.equal(await petSkipQuestion({ staff: deps.staff, inFlight, decide: () => true }, 'q1'), 'busy')
  release()
  assert.equal(await first, 'done')
  assert.deepEqual(calls, ['q1:선택1'])
  assert.equal(await petAnswer(deps, 'q1', { 'A?': '선택1' }), 'already')
  assert.equal(await petAnswer(deps, 'a1', { 'A?': 'x' }), 'notQuestion')
  assert.deepEqual(calls, ['q1:선택1'])
  // 확인 뒤 다른 곳(앱·휴대폰)에서 먼저 답해 처리 함수가 false면 already, 처리 중 표시는 풀린다
  const other = { staff: () => staffWith([approval('q3', { questions: [q('A?')] })]), inFlight: new InFlight(), answerQuestion: () => false }
  assert.equal(await petAnswer(other, 'q3', { 'A?': '선택1' }), 'already')
  assert.equal(other.inFlight.begin('q3'), true)
})

test('질문 답하기: 답이 없거나 질문과 맞지 않으면 처리 함수를 부르기 전에 invalid (질문 대기가 풀리지 않는다)', async () => {
  const calls: unknown[] = []
  const deps = {
    staff: () => staffWith([approval('q1', { questions: [q('A?')] })]),
    inFlight: new InFlight(),
    answerQuestion: (_id: string, answers: Record<string, string>) => (calls.push(answers), true),
  }
  const bad: unknown[] = [
    undefined, // 답이 빠진 요청 (IPC로 답 없이 옴)
    null,
    {}, // 빈 객체
    { 'A?': '   ' }, // 빈칸
    { 'A?': 5 }, // 범위 밖 선택지 번호 — 답은 글자로만 (선택지에 없는 글은 직접 답하기로 받는다)
    { 'A?': ['선택1'] },
    { 'A?': '선택1', 'B?': '선택2' }, // 모르는 질문
    { 'B?': '선택1' },
    ['선택1'],
    '선택1',
  ]
  for (const answers of bad) assert.equal(await petAnswer(deps, 'q1', answers), 'invalid', JSON.stringify(answers))
  // 모르는 결재 id는 답이 맞아도 already
  assert.equal(await petAnswer(deps, 'zz', { 'A?': '선택1' }), 'already')
  assert.deepEqual(calls, [])
  // 처리 중 표시도 남지 않는다
  assert.equal(deps.inFlight.begin('q1'), true)
})

test('질문 넘기기: 앱의 넘기기와 같은 decide(id, false), 평소 결재는 이 길로 반려되지 않는다, 예외에도 처리 중 표시가 풀린다', async () => {
  const decided: [string, boolean][] = []
  const deps = { staff: () => staffWith([approval('q1', { questions: [q('A?')] }), approval('a1')]), inFlight: new InFlight(), decide: (id: string, allow: boolean) => (decided.push([id, allow]), true) }
  assert.equal(await petSkipQuestion(deps, 'q1'), 'done')
  assert.equal(await petSkipQuestion(deps, 'a1'), 'notQuestion')
  assert.deepEqual(decided, [['q1', false]])
  const boom = { ...deps, decide: () => { throw new Error('boom') } }
  await assert.rejects(petSkipQuestion(boom, 'q1'))
  assert.equal(boom.inFlight.begin('q1'), true)
})

test('처리 결과: 답하는 중인 질문이 스냅샷에서 먼저 빠져도 "다른 곳에서 처리됨"이 아니라 답함', () => {
  const a = { ...approval('q1', { questions: [q('A?')] }), staffName: '김직원', staffRole: '개발' } as PetApproval
  const now = 1000
  const vanished = settleVanished([], [a], [], new Set(['q1']), now)
  assert.equal(vanished.length, 0)
  const mine = addSettled(vanished, a, 'answered', now)
  assert.deepEqual(mine.map((x) => x.kind), ['answered'])
  assert.equal(settleVanished(mine, [a], [], new Set(), now).length, 1)
  assert.deepEqual(addSettled(mine, a, 'skipped', now).map((x) => x.kind), ['skipped'])
})

test('말풍선 우선순위: 대답 중 → 답 → 새 결재 → 직원 업무', () => {
  const base = { isBusy: false, reply: null, newApproval: null, workingCount: 0, isWorkShown: false }
  assert.equal(pickBubble(base), null)
  assert.deepEqual(pickBubble({ ...base, workingCount: 2, isWorkShown: true }), { kind: 'working', count: 2 })
  assert.equal(pickBubble({ ...base, workingCount: 2, isWorkShown: false }), null)
  const na = { count: 1, title: 't' }
  assert.equal(pickBubble({ ...base, newApproval: na, workingCount: 2, isWorkShown: true })?.kind, 'approval')
  assert.equal(pickBubble({ ...base, reply: { text: 'r', isError: false }, newApproval: na })?.kind, 'reply')
  assert.equal(pickBubble({ ...base, isBusy: true, reply: { text: 'r', isError: false }, newApproval: na })?.kind, 'thinking')
})

// ── Round 2: 크기·가장자리 붙기·모니터/배율/복귀·처리 결과 ──────────────

const inside = (b: Rect, area: Rect) => b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height

test('설정 기본값: 설치하면 켜져 있고 크기 112·투명도 100', () => {
  assert.equal(DEFAULT_SETTINGS.isDeskPetOn, true)
  assert.equal(DEFAULT_SETTINGS.deskPetSize, 112)
  assert.equal(DEFAULT_SETTINGS.deskPetOpacity, 100)
})

test('크기·투명도 설정값은 범위·단계에 맞추고 잘못된 값은 기본값', () => {
  assert.equal(petSize(undefined), 112)
  assert.equal(petSize('big'), 112)
  assert.equal(petSize(40), 80)
  assert.equal(petSize(500), 160)
  assert.equal(petSize(115), 112)
  assert.equal(petSize(117), 120)
  assert.equal(petOpacity(10), 40)
  assert.equal(petOpacity(Number.NaN), 100)
})

test('크기: 80·112·160에서 그림·창·장식이 함께 커지고 비율이 원본(60×94)과 같다', () => {
  const [s, m, l] = [80, 112, 160].map(petLayout)
  assert.deepEqual(m.char, { width: 72, height: 112 })
  assert.equal(s.char.height, 80)
  assert.equal(l.char.height, 160)
  for (const x of [s, m, l]) {
    assert.ok(Math.abs(x.char.width / x.char.height - 60 / 94) < 0.01)
    // 캐릭터와 장식이 창 안에, 창 높이는 캐릭터 + 말풍선 자리
    assert.ok(x.char.width + x.pad * 2 <= x.window.width)
    assert.equal(x.window.height, x.char.height + 128)
  }
  assert.ok(s.pad < m.pad && m.pad < l.pad)
  assert.ok(s.scale < 1 && l.scale > 1)
})

test('크기 바꾸기: 캐릭터가 선 쪽 가장자리·아래쪽을 지키고 화면 밖으로 나가지 않는다', () => {
  const right = defaultPetBounds(AREA, 112)
  const big = resizePet(right, AREA, 160, 'right')
  assert.equal(big.x + big.width, right.x + right.width)
  assert.equal(big.y + big.height, right.y + right.height)
  const left = { ...petLayout(112).window, x: 0, y: 25 }
  const leftBig = resizePet(left, AREA, 160, 'left')
  assert.equal(leftBig.x, 0)
  // 화면 위쪽 끝에서 키우면 아래로 밀지 않고 화면 안으로
  assert.ok(inside(leftBig, AREA))
  for (const size of [80, 112, 160]) for (const b of [right, left, { ...right, x: 1300, y: 800 }]) for (const align of ['left', 'right'] as const) assert.ok(inside(resizePet(b, AREA, size, align), AREA), `${size}`)
})

test('캐릭터 위치: 가까운 가장자리 쪽에 서고, 펼침 창은 창이 아니라 캐릭터 옆 12px', () => {
  const b = defaultPetBounds(AREA, 112)
  assert.equal(petAlignFor(b, AREA), 'right')
  const char = petCharRect(b, 112, 'right')
  const { pad } = petLayout(112)
  assert.equal(char.x + char.width, b.x + b.width - pad)
  assert.equal(char.y + char.height, b.y + b.height - 4)
  const panel = placePanel(char, AREA)
  assert.equal(panel.x + panel.width, char.x - SCREEN_MARGIN)
  const leftChar = petCharRect({ ...b, x: 0 }, 112, 'left')
  assert.equal(leftChar.x, pad)
  assert.equal(placePanel(leftChar, AREA).x, leftChar.x + leftChar.width + SCREEN_MARGIN)
})

test('가장자리 붙기: 가까이 놓으면 붙고, 멀면 그 자리, 화면 밖이면 안으로', () => {
  const w = petLayout(112).window
  const near = settlePet({ ...w, x: AREA.width - w.width - SNAP_DISTANCE + 1, y: 300 }, AREA, 112, 'right')
  assert.equal(near.bounds.x, AREA.width - w.width)
  assert.equal(near.align, 'right')
  const nearBottom = settlePet({ ...w, x: 600, y: AREA.y + AREA.height - w.height - 10 }, AREA, 112, 'right')
  assert.equal(nearBottom.bounds.y, AREA.y + AREA.height - w.height)
  const nearLeft = settlePet({ ...w, x: 20, y: 300 }, AREA, 112, 'left')
  assert.equal(nearLeft.bounds.x, 0)
  const free = settlePet({ ...w, x: 400, y: 300 }, AREA, 112, 'left')
  assert.deepEqual(free.bounds, { ...w, x: 400, y: 300 })
  const out = settlePet({ ...w, x: -500, y: 2000 }, AREA, 112, 'right')
  assert.ok(inside(out.bounds, AREA))
})

test('가장자리 붙기: 서는 쪽이 바뀌어도 캐릭터는 놓은 자리에 있다 (창만 옮긴다)', () => {
  const w = petLayout(112).window
  // 오른쪽에 서 있던 캐릭터를 화면 왼쪽 절반 가운데쯤에 놓음
  const dropped = { ...w, x: 400, y: 300 }
  const before = petCharRect(dropped, 112, 'right')
  const r = settlePet(dropped, AREA, 112, 'right')
  assert.equal(r.align, 'left')
  assert.equal(petCharRect(r.bounds, 112, r.align).x, before.x)
})

test('가장자리 붙기: 화면 가운데를 가로질러 놓아도 캐릭터가 튀지 않고, 창 위치와 서는 쪽이 맞는다', () => {
  const area = { x: 0, y: 0, width: 1440, height: 900 }
  for (const size of [80, 112, 160]) {
    const w = petLayout(size).window
    for (const prevAlign of ['left', 'right'] as const) {
      // 화면 왼쪽 끝에서 오른쪽 끝까지 끌어 놓기 (가운데 근처는 촘촘히)
      for (let x = -w.width; x <= area.width; x += 4) {
        const dropped = { ...w, x, y: 300 }
        const before = petCharRect(dropped, size, prevAlign)
        const r = settlePet(dropped, area, size, prevAlign)
        const after = petCharRect(r.bounds, size, r.align)
        const msg = `${size}px ${prevAlign} x=${x}`
        // 가장자리 붙기·화면 안으로 넣기 말고는 캐릭터가 놓은 자리에 있다 (붙기는 SNAP_DISTANCE 안)
        const isAdjusted = r.bounds.x === area.x || r.bounds.x === area.width - w.width
        if (!isAdjusted) assert.equal(after.x, before.x, msg)
        else assert.ok(Math.abs(after.x - before.x) <= SNAP_DISTANCE || dropped.x < 0 || dropped.x > area.width - w.width, msg)
        // 서는 쪽은 캐릭터가 화면 어느 쪽 절반에 있는지와 같다
        assert.equal(r.align, after.x + after.width / 2 < area.width / 2 ? 'left' : 'right', msg)
        // 다시 맞춰도(화면 변경·잠자기 복귀) 그대로 — 두 번째 보정에서 튀지 않는다
        assert.deepEqual(settlePet(r.bounds, area, size, r.align), r, msg)
      }
    }
  }
  // 리뷰 재현값: 오른쪽에 서 있던 캐릭터를 가운데 조금 왼쪽에 놓음
  const w = petLayout(112).window
  const dropped = { ...w, x: 580, y: 300 }
  const r = settlePet(dropped, area, 112, 'right')
  assert.equal(petCharRect(r.bounds, 112, r.align).x, petCharRect(dropped, 112, 'right').x)
})

test('모니터: 왼쪽 보조 모니터(음수 좌표)에서도 그 화면 안에 붙고, 모니터를 빼면 남은 화면 안으로', () => {
  const left = { x: -1920, y: 0, width: 1920, height: 1050 }
  const w = petLayout(112).window
  const r = settlePet({ ...w, x: -1910, y: 500 }, left, 112, 'left')
  assert.equal(r.bounds.x, -1920)
  assert.equal(r.align, 'left')
  assert.ok(inside(r.bounds, left))
  // 보조 모니터를 빼면 main은 getDisplayMatching으로 남은 화면을 찾아 같은 함수로 보정한다
  const back = settlePet({ ...w, x: -1500, y: 500 }, AREA, 112, 'left')
  assert.ok(inside(back.bounds, AREA))
})

test('배율·해상도 변경: 작업 영역이 줄어도 세 크기 모두 화면 안', () => {
  const small = { x: 0, y: 25, width: 1024, height: 640 }
  for (const size of [80, 112, 160]) {
    const was = { ...petLayout(size).window, x: 1300, y: 700 }
    assert.ok(inside(settlePet(was, small, size, 'right').bounds, small), `${size}`)
    assert.ok(inside(placePanel(petCharRect(settlePet(was, small, size, 'right').bounds, size, 'right'), small), small))
  }
})

test('화면·전원 이벤트: 켤 때 모두 걸고(모니터 연결·분리·배율·잠자기 복귀·잠금 해제), 끌 때 빠짐없이 뗀다', () => {
  const screen = new EventEmitter()
  const power = new EventEmitter()
  let n = 0
  const off = listenAll(
    [
      [screen, REFIT_EVENTS.screen],
      [power, REFIT_EVENTS.power],
    ],
    () => n++,
  )
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.emit(ev)
  for (const ev of ['resume', 'unlock-screen']) power.emit(ev)
  assert.equal(n, 5)
  off()
  for (const ev of REFIT_EVENTS.screen) assert.equal(screen.listenerCount(ev), 0)
  for (const ev of REFIT_EVENTS.power) assert.equal(power.listenerCount(ev), 0)
  screen.emit('display-removed')
  power.emit('resume')
  assert.equal(n, 5)
})

const pa = (id: string): PetApproval => ({ ...approval(id), staffName: '김직원', staffRole: '개발' })

test('처리 결과: 다른 곳에서 처리돼 빠진 결재는 "다른 곳에서 처리됨"으로 4초만 남는다', () => {
  const t0 = 1000
  const l = settleVanished([], [pa('a'), pa('b')], [pa('b')], new Set(), t0)
  assert.deepEqual(
    l.map((x) => [x.approval.id, x.kind]),
    [['a', 'elsewhere']],
  )
  assert.equal(pruneSettled(l, t0 + SETTLED_MS - 1).length, 1)
  assert.equal(pruneSettled(l, t0 + SETTLED_MS).length, 0)
})

test('처리 결과: 연속 스냅샷에서도 각 항목이 자기 시간에 빠지고, 빠진 게 없는 스냅샷이 와도 쌓이지 않는다', () => {
  let l = settleVanished([], [pa('a'), pa('b'), pa('c')], [pa('b'), pa('c')], new Set(), 0)
  // 빠진 게 없는 스냅샷 여러 번 (예전에는 이때 정리 타이머가 취소돼 쌓였다)
  for (let t = 100; t < 2000; t += 100) l = settleVanished(l, [pa('b'), pa('c')], [pa('b'), pa('c')], new Set(), t)
  l = settleVanished(l, [pa('b'), pa('c')], [pa('c')], new Set(), 2000)
  assert.deepEqual(
    l.map((x) => x.approval.id),
    ['a', 'b'],
  )
  // a는 4초에, b는 6초에 빠진다 (그 사이 아무 스냅샷이 없어도 pruneSettled 한 번이면)
  assert.deepEqual(
    pruneSettled(l, SETTLED_MS).map((x) => x.approval.id),
    ['b'],
  )
  assert.equal(pruneSettled(l, 2000 + SETTLED_MS).length, 0)
  // 같은 결재가 두 번 빠진 것으로 보여도 한 번만
  assert.equal(settleVanished(l, [pa('a')], [], new Set(), 2100).filter((x) => x.approval.id === 'a').length, 1)
})

test('처리 결과: 내 결과보다 스냅샷이 먼저 와도 내 결재는 "다른 곳에서 처리됨"이 아니라 승인함', () => {
  const busy = new Set(['a'])
  let l = settleVanished([], [pa('a')], [], busy, 0)
  assert.equal(l.length, 0)
  l = addSettled(l, pa('a'), 'approved', 10)
  assert.deepEqual(
    l.map((x) => x.kind),
    ['approved'],
  )
  // 결과가 먼저 오고 스냅샷이 나중에 와도 그대로
  const l2 = settleVanished(addSettled([], pa('b'), 'rejected', 0), [pa('b')], [], new Set(), 5)
  assert.deepEqual(
    l2.map((x) => x.kind),
    ['rejected'],
  )
})

test('처리 결과: 한꺼번에 많이 빠져도 최대 10건만 남긴다', () => {
  const many = Array.from({ length: 30 }, (_, i) => pa(`x${i}`))
  assert.equal(settleVanished([], many, [], new Set(), 0).length, 10)
})

test('자동결재 기록: 최근 10분 것만 최근 순으로 5건까지', () => {
  const h = (id: string, at: number): AutoHandled => ({ id, at, staffId: 's1', staffName: '김직원', kind: 'approval', toolName: 'Bash', summary: 'ls', category: 'command' })
  const now = 1_000_000
  const log = [h('old', now - 11 * 60_000), ...Array.from({ length: 7 }, (_, i) => h(`n${i}`, now - i * 1000))]
  assert.deepEqual(
    recentAuto(log, now).map((x) => x.id),
    ['n0', 'n1', 'n2', 'n3', 'n4'],
  )
})

test('움직임: 가끔 동작은 15~30초 사이, 두리번·폴짝 반반', () => {
  assert.equal(nextIdleDelay(0), 15_000)
  assert.ok(nextIdleDelay(0.9999) < 30_000)
  assert.equal(nextIdleDelay(0.5), 22_500)
  assert.equal(pickIdleAct(0), 'look')
  assert.equal(pickIdleAct(0.49), 'look')
  assert.equal(pickIdleAct(0.5), 'hop')
  assert.equal(pickIdleAct(0.99), 'hop')
  // 숨쉬기는 대표 지시 2~3초 안
  assert.ok(PET_MOTION.breatheMs >= 2000 && PET_MOTION.breatheMs <= 3000)
  // 결재 알림은 폴짝 두 번, 약 0.7초
  assert.equal(PET_MOTION.alertHopMs * PET_MOTION.alertHops, 700)
  // CSS는 PET_MOTION 값을 변수로 받는다 (시간 값이 두 곳에서 어긋나지 않게)
  assert.deepEqual(petMotionVars(), { '--pet-breathe': '2400ms', '--pet-look': '900ms', '--pet-hop': '400ms', '--pet-alert-hop': '350ms', '--pet-alert-hops': '2' })
})

test('움직임: 겹치면 결재 알림이 이기고, 동작 중 가끔 동작은 버리며, 결재가 연달아 와도 알림은 하나', () => {
  assert.equal(mergeAct(null, 'hop'), 'hop')
  assert.equal(mergeAct(null, 'alert'), 'alert')
  assert.equal(mergeAct('look', 'alert'), 'alert')
  assert.equal(mergeAct('hop', 'alert'), 'alert')
  assert.equal(mergeAct('alert', 'look'), 'alert')
  assert.equal(mergeAct('look', 'hop'), 'look')
  assert.equal(mergeAct('alert', 'alert'), 'alert')
})

test('움직임: 움직임 줄이기·창이 안 보임·끄는 중 하나라도면 멈춘다', () => {
  assert.equal(canPetMove({ isReduced: false, isHidden: false, isDragging: false }), true)
  for (const k of ['isReduced', 'isHidden', 'isDragging'] as const) assert.equal(canPetMove({ isReduced: false, isHidden: false, isDragging: false, [k]: true }), false)
})

const calm = (over: Partial<PetFaceState> = {}): PetFaceState => ({
  now: 1_000_000,
  until: { surprised: 0, happy: 0, worried: 0 },
  isThinking: false,
  isWorking: false,
  hasApproval: false,
  quietSince: 1_000_000,
  ...over,
})

test('표정: 상황마다 맞는 표정, 아무 일 없으면 평소', () => {
  const now = 1_000_000
  assert.equal(pickFace(calm()), 'idle')
  assert.equal(pickFace(calm({ until: { surprised: now + 1, happy: 0, worried: 0 } })), 'surprised')
  assert.equal(pickFace(calm({ until: { surprised: 0, happy: now + 1, worried: 0 } })), 'happy')
  assert.equal(pickFace(calm({ until: { surprised: 0, happy: 0, worried: now + 1 } })), 'worried')
  assert.equal(pickFace(calm({ isThinking: true })), 'thinking')
  assert.equal(pickFace(calm({ isWorking: true })), 'focused')
  assert.equal(pickFace(calm({ quietSince: now - PET_FACE.sleepyMs })), 'sleepy')
})

test('표정: 겹치면 놀람 → 걱정 → 기쁨 → 생각 중 → 집중 → 졸림 순', () => {
  const now = 1_000_000
  const on = (faces: string[]) =>
    calm({
      until: { surprised: faces.includes('surprised') ? now + 1 : 0, happy: faces.includes('happy') ? now + 1 : 0, worried: faces.includes('worried') ? now + 1 : 0 },
      isThinking: faces.includes('thinking'),
      isWorking: faces.includes('focused'),
      quietSince: faces.includes('sleepy') ? now - PET_FACE.sleepyMs : now,
    })
  const order = ['surprised', 'worried', 'happy', 'thinking', 'focused', 'sleepy'] as const
  for (let i = 0; i < order.length - 1; i++) assert.equal(pickFace(on([order[i], order[i + 1]])), order[i], `${order[i]} > ${order[i + 1]}`)
  assert.equal(pickFace(on([...order])), 'surprised')
})

test('표정: 잠깐 표정은 정해진 시간이 지나면 아래 표정으로 돌아간다', () => {
  const at = 1_000_000
  const s = (now: number) => calm({ now, isWorking: true, until: { surprised: at + FLASH_MS.surprised, happy: 0, worried: at + FLASH_MS.worried } })
  assert.equal(FLASH_MS.surprised, 1500)
  assert.equal(FLASH_MS.worried, 3000)
  assert.equal(pickFace(s(at + 1499)), 'surprised')
  assert.equal(pickFace(s(at + 1500)), 'worried')
  assert.equal(pickFace(s(at + 2999)), 'worried')
  assert.equal(pickFace(s(at + 3000)), 'focused')
  assert.equal(nextFaceChange(s(at)), at + 1500)
  assert.equal(nextFaceChange(s(at + 1500)), at + 3000)
  assert.equal(nextFaceChange(s(at + 3000)), null, '일하는 중이면 졸 때가 없다')
})

test('표정: 10분 조용하면 졸고, 결재·대답·직원 작업이 있으면 졸지 않는다', () => {
  const now = 1_000_000
  assert.equal(pickFace(calm({ quietSince: now - PET_FACE.sleepyMs + 1 })), 'idle')
  assert.equal(pickFace(calm({ quietSince: now - PET_FACE.sleepyMs })), 'sleepy')
  assert.equal(nextFaceChange(calm({ quietSince: now - 1000 })), now - 1000 + PET_FACE.sleepyMs)
  assert.equal(nextFaceChange(calm({ quietSince: now - PET_FACE.sleepyMs })), null, '이미 졸고 있으면 더 바뀔 때가 없다')
  const long = now - PET_FACE.sleepyMs * 2
  assert.equal(pickFace(calm({ quietSince: long, hasApproval: true })), 'idle')
  assert.equal(pickFace(calm({ quietSince: long, isThinking: true })), 'thinking')
  assert.equal(pickFace(calm({ quietSince: long, isWorking: true })), 'focused')
  assert.equal(nextFaceChange(calm({ hasApproval: true })), null)
})

test('표정: 펼침 창 처리는 해내면 기쁨, 못 하면 걱정, 이미 처리됨·다른 곳에서 처리 중은 표정 없음', () => {
  assert.equal(outcomeFace('done'), 'happy')
  assert.equal(outcomeFace('already'), null)
  assert.equal(outcomeFace('busy'), null)
  for (const r of ['question', 'notQuestion', 'tooComplex', 'invalid'] as const) assert.equal(outcomeFace(r), 'worried')
})
