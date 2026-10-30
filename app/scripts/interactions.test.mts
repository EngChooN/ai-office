// 직원 상호작용 7종: 스냅샷 변화 → 이벤트, 쿨다운·큐, 연출 단계, 업무 수다, 칸 고르기 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { behindCell, besideCell, cancel, chatLine, COFFEE_AFTER_MS, detectEvents, dropHelpFor, emptyDirector, fallbackOf, finish, involvedIds, meetPair, offer, pickHelper, QUEUE_MAX, QUEUE_TTL_MS, startNext, stepsOf, type Interaction, type IxSnap } from '../src/shared/iso/interactions.ts'

const NOW = 1_000_000_000
const person = (id: string, over: Partial<IxSnap['staff'][number]> = {}): IxSnap['staff'][number] => ({ id, name: id.toUpperCase(), status: 'idle', teamId: 't1', statusSince: NOW, ...over })
const task = (id: string, over: Partial<IxSnap['tasks'][number]> = {}): IxSnap['tasks'][number] => ({ id, title: id, status: 'todo', assigneeId: null, parentId: null, updatedAt: NOW, ...over })
const snap = (over: Partial<IxSnap> = {}): IxSnap => ({
  staff: [person('lead'), person('a'), person('b')],
  teams: [{ id: 't1', leadId: 'lead' }],
  tasks: [],
  logs: [],
  companyLevel: 3,
  selectedId: null,
  ...over,
})
const kinds = (events: { kind: string }[]) => events.map((e) => e.kind).sort()
const detect = (prev: IxSnap, next: IxSnap, memo = new Map<string, string>()) => detectEvents(prev, next, memo, NOW)

test('위임 기록 → 팀장이 팀원에게 일 넘겨주기, 팀원이 끝내고 쉬면 팀장에게 보고', () => {
  const log = { id: 5, staffId: 'lead', type: 'delegate' as const, textI18n: { key: 'log.delegate' as const, params: { name: 'A', text: '화면 고치기' } } }
  const r1 = detect(snap({ staff: [person('lead'), person('a', { status: 'working' }), person('b')] }), snap({ staff: [person('lead'), person('a', { status: 'working' }), person('b')], logs: [log] }))
  assert.deepEqual(r1.events, [{ kind: 'handoff', actor: 'lead', target: 'a', at: NOW }])
  assert.equal(r1.memo.get('a'), 'lead')
  // 같은 기록을 다시 보면 또 내지 않는다
  assert.equal(detect(snap({ logs: [log] }), snap({ logs: [log] }), r1.memo).events.length, 0)
  const r2 = detect(snap({ staff: [person('lead'), person('a', { status: 'working' }), person('b')] }), snap(), r1.memo)
  assert.deepEqual(r2.events, [{ kind: 'report', actor: 'a', target: 'lead', at: NOW }])
  assert.equal(r2.memo.has('a'), false)
})

test('하위 업무 진행 → 넘겨주기, 검토 → 👀, 승인 → 👍, 바로 완료 → 보고', () => {
  const parent = task('p', { assigneeId: 'lead', status: 'doing' })
  const kid = (status: IxSnap['tasks'][number]['status']) => task('k', { parentId: 'p', assigneeId: 'a', status })
  assert.deepEqual(detect(snap({ tasks: [parent, kid('todo')] }), snap({ tasks: [parent, kid('doing')] })).events, [{ kind: 'handoff', actor: 'lead', target: 'a', at: NOW }])
  assert.deepEqual(kinds(detect(snap({ tasks: [parent, kid('doing')] }), snap({ tasks: [parent, kid('review')] })).events), ['review'])
  const approve = detect(snap({ tasks: [parent, kid('review')] }), snap({ tasks: [parent, kid('done')] })).events
  assert.ok(approve.some((e) => e.kind === 'approve' && 'actor' in e && e.actor === 'lead'))
  const report = detect(snap({ tasks: [parent, kid('doing')] }), snap({ tasks: [parent, kid('done')] })).events
  assert.ok(report.some((e) => e.kind === 'report' && 'actor' in e && e.actor === 'a' && e.target === 'lead'))
})

test('상위 업무가 없으면 팀장에게, 팀장이 자기 일을 끝내면 보고하지 않는다', () => {
  const r = detect(snap({ tasks: [task('x', { assigneeId: 'b', status: 'doing' })] }), snap({ tasks: [task('x', { assigneeId: 'b', status: 'done' })] }))
  assert.deepEqual(r.events, [{ kind: 'report', actor: 'b', target: 'lead', at: NOW }])
  const own = detect(snap({ tasks: [task('x', { assigneeId: 'lead', status: 'doing' })] }), snap({ tasks: [task('x', { assigneeId: 'lead', status: 'done' })] }))
  assert.equal(own.events.length, 0)
  // 상위 업무 없이 보드에서 바로 맡긴 일은 넘겨주기 연출이 없다
  assert.equal(detect(snap({ tasks: [task('x', { assigneeId: 'b' })] }), snap({ tasks: [task('x', { assigneeId: 'b', status: 'doing' })] })).events.length, 0)
})

test('하위 업무가 모두 끝나면 팀장과 팀원 하이파이브 (한 번만)', () => {
  const parent = task('p', { assigneeId: 'lead', status: 'doing' })
  const kids = (s2: 'doing' | 'done') => [task('k1', { parentId: 'p', assigneeId: 'a', status: 'done' }), task('k2', { parentId: 'p', assigneeId: 'b', status: s2 })]
  const r = detect(snap({ tasks: [parent, ...kids('doing')] }), snap({ tasks: [parent, ...kids('done')] }))
  const fives = r.events.filter((e) => e.kind === 'highFive') as Interaction[]
  assert.deepEqual(fives.map((e) => [e.actor, e.target]), [['lead', 'a'], ['lead', 'b']])
  assert.equal(detect(snap({ tasks: [parent, ...kids('done')] }), snap({ tasks: [parent, ...kids('done')] })).events.length, 0)
})

test('결재 대기·오류 → 막힘, 레벨업 → 모두 박수, 클릭 → 손 흔들기, 오래 일하고 끝내면 커피', () => {
  const prev = snap({ staff: [person('lead', { status: 'working' }), person('a', { status: 'working', statusSince: NOW - COFFEE_AFTER_MS }), person('b', { status: 'working' })] })
  const next = snap({ staff: [person('lead', { status: 'waiting' }), person('a'), person('b', { status: 'error' })], companyLevel: 4, selectedId: 'b' })
  const r = detect(prev, next).events
  assert.deepEqual(r.filter((e) => e.kind === 'stuck').map((e) => ('target' in e ? e.target : '')), ['lead', 'b'])
  assert.equal(r.filter((e) => e.kind === 'clap').length, 3)
  assert.ok(r.some((e) => e.kind === 'wave' && 'actor' in e && e.actor === 'b'))
  assert.deepEqual(r.filter((e) => e.kind === 'coffee').map((e) => ('actor' in e ? e.actor : '')), ['a'])
  // 잠깐 일하고 끝냈으면 커피 없음
  const short = detect(snap({ staff: [person('a', { status: 'working', statusSince: NOW - 1000 })] }), snap({ staff: [person('a')] })).events
  assert.equal(short.length, 0)
})

test('쿨다운: 같은 연출을 바로 다시 받지 않고, 시간이 지나면 받는다', () => {
  const ix: Interaction = { kind: 'wave', actor: 'a', at: NOW }
  let d = offer(emptyDirector(), ix, NOW)
  assert.equal(d.queue.a.length, 1)
  d = startNext(d, 'a', NOW).d
  d = finish(d, 'a')
  assert.equal(offer(d, { ...ix, at: NOW + 1000 }, NOW + 1000), d)
  assert.equal(offer(d, { ...ix, at: NOW + 5000 }, NOW + 5000).queue.a.length, 1)
  // 막힘 도움은 막힌 사람 기준 — 다른 사람이 도우러 와도 쿨다운
  const h = offer(emptyDirector(), { kind: 'help', actor: 'x', target: 'a', at: NOW }, NOW)
  assert.equal(offer(h, { kind: 'help', actor: 'y', target: 'a', at: NOW }, NOW + 10), h)
  // 상대가 있는 연출은 두 사람 한 쌍 기준 — 팀장이 팀원 여럿과 하이파이브
  let f = offer(emptyDirector(), { kind: 'highFive', actor: 'lead', target: 'a', at: NOW }, NOW)
  f = offer(f, { kind: 'highFive', actor: 'lead', target: 'b', at: NOW }, NOW)
  assert.deepEqual(f.queue.lead.map((x) => x.target), ['a', 'b'])
  assert.equal(offer(f, { kind: 'highFive', actor: 'lead', target: 'a', at: NOW + 10 }, NOW + 10), f)
})

test('다른 층 말풍선: 이 층 쪽(holder) 큐에 넣고 같은 쿨다운을 쓴다', () => {
  const ix: Interaction = { kind: 'review', actor: 'lead', target: 'a', at: NOW }
  let d = offer(emptyDirector(), ix, NOW, 'a')
  assert.equal(d.queue.a.length, 1)
  assert.equal(d.queue.lead, undefined)
  assert.equal(offer(d, { ...ix, at: NOW + 10 }, NOW + 10, 'a'), d)
  d = startNext(d, 'a', NOW).d
  assert.deepEqual([...involvedIds(d)], ['a'])
})

test('직원별 큐: 하나씩 차례로, 꽉 차면 버리고, 오래된 것은 건너뛴다', () => {
  let d = emptyDirector()
  const kinds = ['handoff', 'report', 'review', 'coffee'] as const
  kinds.forEach((kind, i) => (d = offer(d, { kind, actor: 'a', target: 'b', at: NOW + i }, NOW + i)))
  assert.equal(d.queue.a.length, QUEUE_MAX)
  const first = startNext(d, 'a', NOW + 10)
  assert.equal(first.ix?.kind, 'handoff')
  // 연출 중에는 다음을 꺼내지 않는다
  assert.equal(startNext(first.d, 'a', NOW + 10).ix, null)
  assert.deepEqual([...involvedIds(first.d)], ['a'])
  d = finish(first.d, 'a')
  assert.equal(startNext(d, 'a', NOW + QUEUE_TTL_MS + 100).ix, null)
})

test('직원별 큐: 실행이 막힌 채 꽉 찬 큐도 오래된 것을 버리고 새 연출을 받는다', () => {
  let d = emptyDirector()
  const kinds = ['handoff', 'report', 'review'] as const
  kinds.forEach((kind, i) => (d = offer(d, { kind, actor: 'a', target: 'b', at: NOW + i }, NOW + i)))
  assert.equal(d.queue.a.length, QUEUE_MAX)
  const later = NOW + QUEUE_TTL_MS + 100
  d = offer(d, { kind: 'wave', actor: 'a', at: later }, later)
  assert.deepEqual(d.queue.a.map((x) => x.kind), ['wave'])
})

test('막힘이 풀리면 그 사람을 도우러 가려던 대기 연출만 모든 큐에서 버린다', () => {
  let d = offer(emptyDirector(), { kind: 'help', actor: 'h1', target: 'x', at: NOW }, NOW)
  d = offer(d, { kind: 'wave', actor: 'h1', at: NOW }, NOW)
  d = offer(d, { kind: 'help', actor: 'h2', target: 'y', at: NOW }, NOW)
  d = dropHelpFor(d, 'x')
  assert.deepEqual(d.queue.h1.map((x) => x.kind), ['wave'])
  assert.equal(d.queue.h2.length, 1)
  d = dropHelpFor(d, 'y')
  assert.equal(d.queue.h2, undefined)
  // 해당 없으면 그대로
  assert.equal(dropHelpFor(d, 'z'), d)
})

test('새 일이 오면 하던 연출과 큐를 모두 버린다 · 하이파이브 상대도 연출 중', () => {
  let d = offer(emptyDirector(), { kind: 'highFive', actor: 'lead', target: 'a', at: NOW }, NOW)
  d = offer(d, { kind: 'clap', actor: 'lead', at: NOW }, NOW)
  d = startNext(d, 'lead', NOW).d
  assert.deepEqual([...involvedIds(d)].sort(), ['a', 'lead'])
  d = cancel(d, 'lead')
  assert.equal(d.running.lead, undefined)
  assert.equal(d.queue.lead, undefined)
  assert.equal(involvedIds(d).size, 0)
})

test('연출 단계: 7종 모두 단계가 있고, 걷는 연출은 자리로 돌아가며 끝난다', () => {
  for (const kind of ['handoff', 'report', 'review', 'help', 'highFive'] as const) {
    const steps = stepsOf({ kind, actor: 'a', target: 'b', at: NOW })
    assert.equal(steps[0].do, 'walk', kind)
    assert.deepEqual(steps.at(-1), { do: 'walk', to: 'home' }, kind)
  }
  assert.equal(stepsOf({ kind: 'handoff', actor: 'a', target: 'b', at: NOW })[0].do === 'walk' && (stepsOf({ kind: 'handoff', actor: 'a', target: 'b', at: NOW })[0] as { carry?: string }).carry, 'paper')
  // 커피: 컵을 놓아 줄 동료가 있으면 그 자리에 들른다
  assert.equal(stepsOf({ kind: 'coffee', actor: 'a', at: NOW }).length, 3)
  assert.ok(stepsOf({ kind: 'coffee', actor: 'a', target: 'b', at: NOW }).some((s) => s.do === 'act' && s.anim === 'cupPut'))
  // 클릭: 서 있으면 손 흔들기, 앉아 있으면 돌아보기
  assert.deepEqual(stepsOf({ kind: 'wave', actor: 'a', at: NOW }).map((s) => s.do === 'act' && s.anim), ['wave'])
  assert.deepEqual(stepsOf({ kind: 'wave', actor: 'a', at: NOW }, { isSitting: true }).map((s) => s.do === 'act' && s.anim), ['turn'])
  assert.deepEqual(stepsOf({ kind: 'chat', actor: 'a', text: '로그인 화면', at: NOW }), [{ do: 'act', anim: 'keep', ms: 2600, say: '로그인 화면' }])
  // 다른 층이면 말풍선만
  assert.deepEqual(fallbackOf({ kind: 'handoff', actor: 'a', target: 'b', at: NOW }, 'actor', 'B'), { say: '📄 → B' })
  assert.deepEqual(fallbackOf({ kind: 'review', actor: 'a', target: 'b', at: NOW }, 'target', 'A'), { emote: '👀' })
})

test('업무 수다: 최근 업무 제목을 20자 안팎으로 자른 한 줄', () => {
  const tasks = [task('old', { assigneeId: 'a', title: '예전 일', updatedAt: NOW - 10 }), task('new', { assigneeId: 'a', title: '  설정 화면이 좁을 때\n분류 메뉴를 위쪽 가로 탭으로 바꾸기  ', updatedAt: NOW }), task('other', { assigneeId: 'b', title: '남의 일', updatedAt: NOW + 5 })]
  assert.equal(chatLine('a', tasks), '설정 화면이 좁을 때 분류 메뉴를 위…')
  assert.equal(chatLine('b', tasks), '남의 일')
  assert.equal(chatLine('c', tasks), null)
})

test('칸 고르기: 가까운 쉬는 동료, 옆 칸, 의자 뒤, 하이파이브 두 칸', () => {
  assert.equal(pickHelper({ gx: 0, gy: 0 }, [{ id: 'far', gx: 5, gy: 5 }, { id: 'near', gx: 1, gy: 1 }]), 'near')
  assert.equal(pickHelper({ gx: 0, gy: 0 }, []), null)
  const blocked = new Set(['3,2', '2,3'])
  const isFree = (c: { gx: number; gy: number }) => c.gx >= 0 && c.gy >= 0 && c.gx < 8 && c.gy < 8 && !blocked.has(`${c.gx},${c.gy}`)
  assert.deepEqual(besideCell({ gx: 2, gy: 2 }, { gx: 0, gy: 2 }, isFree), { gx: 1, gy: 2 })
  // 앞(+gy)을 보고 앉은 사람의 뒤는 -gy
  assert.deepEqual(behindCell({ gx: 4, gy: 4, face: 0 }, { gx: 4, gy: 0 }, isFree), { gx: 4, gy: 3 })
  assert.deepEqual(behindCell({ gx: 2, gy: 4, face: 0 }, { gx: 0, gy: 0 }, (c) => isFree(c) && !(c.gx === 2 && c.gy === 3)), { gx: 1, gy: 3 })
  const pair = meetPair({ gx: 3, gy: 3 }, isFree)!
  assert.equal(pair[1].gx - pair[0].gx, 1)
  assert.equal(pair[0].gy, pair[1].gy)
  assert.ok(isFree(pair[0]) && isFree(pair[1]))
  assert.equal(meetPair({ gx: 3, gy: 3 }, () => false), null)
})
