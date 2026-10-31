// 바탕화면 비서: 위치 보정·펼침 창 배치·끌기/클릭 구분·결재 중복 처리·말풍선 우선순위 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPetDecide, clampToArea, defaultPetBounds, InFlight, isDragMove, PANEL_SIZE, PET_SIZE, petDecide, pickBubble, placePanel, SCREEN_MARGIN } from '../src/shared/deskPet.ts'
import type { Approval, Staff } from '../src/shared/types.ts'

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
  const b = defaultPetBounds(AREA)
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
