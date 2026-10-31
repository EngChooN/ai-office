// 바탕화면 비서: 위치 보정·펼침 창 배치·끌기/클릭 구분·결재 중복 처리·말풍선 우선순위 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import {
  addSettled,
  checkPetDecide,
  clampToArea,
  defaultPetBounds,
  InFlight,
  isDragMove,
  listenAll,
  PANEL_SIZE,
  petAlignFor,
  petCharRect,
  petDecide,
  petLayout,
  petOpacity,
  petSize,
  pickBubble,
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
import { DEFAULT_SETTINGS, type Approval, type AutoHandled, type Staff } from '../src/shared/types.ts'

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
  const big = resizePet(right, AREA, 160)
  assert.equal(big.x + big.width, right.x + right.width)
  assert.equal(big.y + big.height, right.y + right.height)
  const left = { ...petLayout(112).window, x: 0, y: 25 }
  const leftBig = resizePet(left, AREA, 160)
  assert.equal(leftBig.x, 0)
  // 화면 위쪽 끝에서 키우면 아래로 밀지 않고 화면 안으로
  assert.ok(inside(leftBig, AREA))
  for (const size of [80, 112, 160]) for (const b of [right, left, { ...right, x: 1300, y: 800 }]) assert.ok(inside(resizePet(b, AREA, size), AREA), `${size}`)
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

const pa = (id: string): PetApproval => ({ ...approval(id), staffName: '김직원' })

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
