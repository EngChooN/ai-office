// 직원끼리 도움 요청 — 대상 계산·제한 장치·자율 이어받기 단위 테스트 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HELP_TEXT_MAX, HelpLedger, isHelpWaiting, mustUseHelp, helpDepthOf, helpTargetIds, inHelpContext, type HelpCtx } from '../src/shared/helpRequest.ts'
import { resolveAutonomy } from '../src/shared/autonomy.ts'

const hired = (...ids: string[]) => (id: string) => ids.includes(id)

test('대상: 같은 팀·같은 랩 직원, 본인 제외, 중복 제거', () => {
  const ids = helpTargetIds('a', { teamMemberIds: ['a', 'b', 'c'], labMemberIds: [['a', 'c', 'd']], isLabLead: false, isTeamLead: false }, hired('a', 'b', 'c', 'd'))
  assert.deepEqual(ids.sort(), ['b', 'c', 'd'])
})

test('대상: 팀장·랩 리드는 없음(delegate 사용), 고용 안 된 직원·다른 PC 직원은 뺀다', () => {
  assert.deepEqual(helpTargetIds('a', { teamMemberIds: ['a', 'b'], labMemberIds: [], isLabLead: true, isTeamLead: false }, hired('a', 'b')), [])
  // 팀장은 자기 팀원(b)을 빼고 같은 랩의 다른 팀·팀 없는 직원(d)에게만 도움 요청
  assert.deepEqual(helpTargetIds('a', { teamMemberIds: ['a', 'b'], labMemberIds: [['a', 'b', 'd']], isLabLead: false, isTeamLead: true }, hired('a', 'b', 'd')), ['d'])
  assert.deepEqual(helpTargetIds('a', { teamMemberIds: ['a', 'b', 'remote'], labMemberIds: [], isLabLead: false, isTeamLead: false }, hired('a', 'b')), ['b'])
  assert.deepEqual(helpTargetIds('a', { teamMemberIds: [], labMemberIds: [], isLabLead: false, isTeamLead: false }, hired('a')), [])
})

type O = { kind: string; fromId?: string; reqId?: string; help?: HelpCtx }

/** office.ts의 request_help 도구 → instruct → onFinished 연결을 그대로 옮긴 작은 사무실 (같은 장부 호출 순서) */
function mini() {
  const ledger = new HelpLedger()
  const origins = new Map<string, O[]>()
  const reports: { to: string; from: string; help?: HelpCtx }[] = []
  const get = (id: string) => origins.get(id) ?? []
  const tool = (from: string, to: string, text = '부탁') => {
    const rejected = ledger.check({ staffId: from, targetId: to, text, requesterOrigins: get(from), targetOrigins: get(to) })
    if (rejected) return rejected
    const o = ledger.open(from, to, get(from))
    origins.set(to, [...get(to), { kind: 'help', fromId: from, reqId: o.reqId, help: o.help }])
    return null
  }
  const start = (id: string) => origins.set(id, [...get(id), { kind: 'user' }])
  const finish = (id: string) => {
    const done = get(id)
    origins.set(id, [])
    for (const o of done) {
      const ctx = o.kind === 'help' ? ledger.close(o.reqId) : null
      if (o.kind === 'help') {
        reports.push({ to: o.fromId!, from: id, help: ctx ?? undefined })
        origins.set(o.fromId!, [...get(o.fromId!), { kind: 'user', ...(ctx ? { help: ctx } : {}) }])
      }
    }
    ledger.release(id, [], (r) => [...origins.values()].some((os) => os.some((o) => o.reqId === r)))
  }
  return { tool, start, finish, reports, get, ledger }
}

test('깊이: 도움 요청 출처가 없으면 0, 사슬 길이만큼 깊어진다', () => {
  assert.equal(helpDepthOf([{ kind: 'user' }, { kind: 'task' }]), 0)
  assert.equal(helpDepthOf([{ kind: 'help', help: { rootId: 'r', path: ['a', 'b'] } }, { kind: 'help', help: { rootId: 'r', path: ['a', 'b', 'c'] } }]), 2)
})

test('제한: 요청문 800자 초과 거절, 800자는 통과', () => {
  const m = mini()
  m.start('a')
  assert.equal(m.tool('a', 'b', 'x'.repeat(HELP_TEXT_MAX + 1)), 'tooLong')
  assert.equal(m.tool('a', 'b', 'x'.repeat(HELP_TEXT_MAX)), null)
})

test('제한: 1단계까지 허용(A→B), 받은 부탁을 다시 넘기기(B→C)는 거절', () => {
  const m = mini()
  m.start('a')
  assert.equal(m.tool('a', 'b'), null)
  assert.equal(m.tool('b', 'c'), 'tooDeep')
})

test('제한: 같은 대상에 처리 중인 내 요청이 있으면 거절', () => {
  const m = mini()
  m.start('a')
  assert.equal(m.tool('a', 'b'), null)
  assert.equal(m.tool('a', 'b'), 'duplicate')
})

test('제한: 업무당 3건, 결과로 재개돼도 횟수가 이어진다 (A가 먼저 끝나도 0으로 돌아가지 않음)', () => {
  const m = mini()
  m.start('a')
  assert.equal(m.tool('a', 'b'), null)
  m.finish('a') // A가 먼저 턴 종료
  m.finish('b') // B 보고 → A 재개
  assert.equal(m.tool('a', 'b'), null)
  m.finish('b')
  assert.equal(m.tool('a', 'c'), null)
  assert.equal(m.tool('a', 'd'), 'tooMany', '재개된 뒤에도 4번째는 거절')
})

test('제한: 원업무가 완전히 끝나면 횟수를 새로 센다', () => {
  const m = mini()
  m.start('a')
  m.tool('a', 'b')
  m.finish('a')
  m.finish('b')
  m.finish('a') // 재개된 일까지 마침
  m.start('a')
  for (const t of ['b', 'c', 'd']) assert.equal(m.tool('a', t), null)
})

test('되돌림: 부탁받은 B는 A에게도 다시 부탁하지 못한다 (단계 제한이 순환도 막는다)', () => {
  const m = mini()
  m.start('a')
  m.tool('a', 'b')
  assert.equal(m.tool('b', 'a'), 'tooDeep')
  assert.equal(helpDepthOf(m.get('b')), 1)
})

test('왕복 세탁 차단: B가 보고해 재개된 A의 깊이는 0이 아니라 사슬을 이어 센다', () => {
  const m = mini()
  m.start('a')
  m.tool('a', 'b')
  m.finish('b')
  assert.deepEqual(m.get('a').at(-1)?.help?.path, ['a'])
  assert.equal(m.reports.at(-1)?.help?.rootId, m.get('a').at(-1)?.help?.rootId)
})

test('동시: A,C가 같은 B에게 보내면 두 번째는 거절 — 한 턴에 합쳐 결과가 섞이지 않는다', () => {
  const m = mini()
  m.start('a')
  m.start('c')
  assert.equal(m.tool('a', 'b'), null)
  assert.equal(m.tool('c', 'b'), 'busy')
  m.finish('b')
  assert.deepEqual(m.reports.map((r) => r.to), ['a'], '결과는 A에게만')
  assert.equal(m.tool('c', 'b'), null, 'B가 끝난 뒤에는 C의 요청도 가능')
  m.finish('b')
  assert.deepEqual(m.reports.map((r) => r.to), ['a', 'c'])
})

test('동시: 한 사람이 서로 다른 대상 둘에게 보내도 각 결과는 요청별 사슬로 돌아간다', () => {
  const m = mini()
  m.start('a')
  m.tool('a', 'b')
  m.tool('a', 'c')
  m.finish('b')
  m.finish('c')
  assert.deepEqual(m.reports.map((r) => [r.from, r.to]), [['b', 'a'], ['c', 'a']])
  assert.equal(new Set(m.reports.map((r) => r.help?.rootId)).size, 1, '같은 원업무')
})

test('우회 차단: 도움 사슬 안의 일은 위임·카드·기획안 도구를 못 쓴다', () => {
  assert.equal(inHelpContext([{ kind: 'user' }]), false)
  assert.equal(inHelpContext([{ kind: 'help' }]), true)
  assert.equal(inHelpContext([{ kind: 'user', help: { rootId: 'r', path: ['a'] } }]), true, '결과로 재개된 일도 포함')
})

test('자율: 자율 표시가 붙은 도움 요청 출처는 받은 직원도 자율로 이어 간다', () => {
  const none = () => false
  assert.equal(resolveAutonomy({ isFull: false, origins: [{ kind: 'help', isAutonomous: true }], isTaskAutonomous: none }), true)
  assert.equal(resolveAutonomy({ isFull: false, origins: [{ kind: 'help' }], isTaskAutonomous: none }), false)
})

test('제한: 결과 수신 전 4번째 요청 거절 (사슬 없는 첫 요청자)', () => {
  const m = mini()
  m.start('a')
  assert.equal(m.tool('a', 'b'), null)
  assert.equal(m.tool('a', 'c'), null)
  assert.equal(m.tool('a', 'd'), null)
  assert.equal(m.tool('a', 'e'), 'tooMany')
})

test('add_task: 팀원(위임 대상 없음·도움 대상 있음)은 막고 팀장·혼자 일하는 직원은 허용', () => {
  assert.equal(mustUseHelp(0, 2), true)
  assert.equal(mustUseHelp(3, 0), false)
  assert.equal(mustUseHelp(0, 0), false)
})

test('실패·중지: 열린 요청을 닫아 같은 대상에게 다시 부탁할 수 있고, 부탁한 사람은 사슬을 이어 재개한다', () => {
  const l = new HelpLedger()
  const a: O[] = []
  const c1 = l.check({ staffId: 'a', targetId: 'b', text: 'x', requesterOrigins: a, targetOrigins: [] })
  assert.equal(c1, null)
  const o = l.open('a', 'b', a)
  const bOrigins: O[] = [{ kind: 'help', fromId: 'a', reqId: o.reqId, help: o.help }]
  // 대상이 일하는 중이면 중복
  assert.equal(l.check({ staffId: 'a', targetId: 'b', text: 'x', requesterOrigins: a, targetOrigins: bOrigins }), 'duplicate')
  // b가 오류로 끝남 — office.failHelpRequests와 같은 호출 순서
  const ctx = l.close(o.reqId)
  assert.deepEqual(ctx, { rootId: o.help.rootId, path: ['a'] })
  l.release('b', [], () => false)
  // 다시 부탁 가능, 같은 원업무로 센다
  assert.equal(l.check({ staffId: 'a', targetId: 'b', text: 'x', requesterOrigins: [{ kind: 'user', help: ctx! }], targetOrigins: [] }), null)
  assert.equal(l.close('없는요청'), null)
})

test('리더 대상: 팀장·랩 리드는 다른 프로젝트·팀 리더에게 요청 가능, 팀원은 불가', () => {
  const S = (x: object) => ({ teamMemberIds: [] as string[], labMemberIds: [] as string[][], isLabLead: false, isTeamLead: false, ...x })
  assert.deepEqual(helpTargetIds('a', S({ isLabLead: true, leaderPeerIds: ['x', 'a', 'gone'] }), hired('a', 'x')), ['x'])
  assert.deepEqual(helpTargetIds('a', S({ isTeamLead: true, teamMemberIds: ['a', 'b'], leaderPeerIds: ['x'] }), hired('a', 'b', 'x')), ['x'])
  assert.deepEqual(helpTargetIds('m', S({ teamMemberIds: ['m', 'b'], leaderPeerIds: ['x'] }), hired('m', 'b', 'x')), ['b'])
})

test('리더 사슬: 리더→리더 요청 후 받은 리더의 재위임 1회만 허용, 그다음 단계·비리더·남의 사람은 거절', () => {
  const l = new HelpLedger()
  const base = { text: 'x', targetOrigins: [] as O[] }
  assert.equal(l.check({ ...base, staffId: 'A', targetId: 'B', requesterOrigins: [], requesterIsLeader: true }), null)
  const o1 = l.open('A', 'B', [], true)
  const b: O[] = [{ kind: 'help', fromId: 'A', reqId: o1.reqId, help: o1.help }]
  assert.equal(o1.help.leaderChain, true)
  assert.equal(l.check({ ...base, staffId: 'B', targetId: 'C', requesterOrigins: b, requesterIsLeader: true, targetIsOwnMember: true }), null)
  assert.equal(l.check({ ...base, staffId: 'B', targetId: 'D', requesterOrigins: b, requesterIsLeader: true, targetIsOwnMember: false }), 'tooDeep')
  assert.equal(l.check({ ...base, staffId: 'B', targetId: 'C', requesterOrigins: b, requesterIsLeader: false, targetIsOwnMember: true }), 'tooDeep')
  const o2 = l.open('B', 'C', b, false)
  assert.deepEqual(o2.help.path, ['A', 'B', 'C'])
  assert.equal(o2.help.leaderChain, true)
  const c: O[] = [{ kind: 'help', fromId: 'B', reqId: o2.reqId, help: o2.help }]
  assert.equal(l.check({ ...base, staffId: 'C', targetId: 'E', requesterOrigins: c, requesterIsLeader: true, targetIsOwnMember: true }), 'tooDeep')
  assert.equal(l.check({ ...base, staffId: 'B', targetId: 'A', requesterOrigins: b, requesterIsLeader: true, targetIsOwnMember: true }), 'cycle')
  assert.deepEqual(l.close(o2.reqId), { rootId: o1.help.rootId, path: ['A', 'B'], leaderChain: true })
})

test('리더 사슬: 일반 팀원 요청 사슬에서는 리더도 재위임 못 한다 (우회 방지)', () => {
  const l = new HelpLedger()
  const o = l.open('m', 'lead', [], false)
  const lead: O[] = [{ kind: 'help', fromId: 'm', reqId: o.reqId, help: o.help }]
  assert.equal(l.check({ text: 'x', targetOrigins: [], staffId: 'lead', targetId: 'z', requesterOrigins: lead, requesterIsLeader: true, targetIsOwnMember: true }), 'tooDeep')
})

test('리더 사슬: 800자·동시 3건·대상 바쁨 한도는 그대로', () => {
  const l = new HelpLedger()
  assert.equal(l.check({ staffId: 'A', targetId: 'B', text: 'x'.repeat(HELP_TEXT_MAX + 1), requesterOrigins: [], targetOrigins: [], requesterIsLeader: true }), 'tooLong')
  for (const t of ['B', 'C', 'D']) l.open('A', t, [], true)
  assert.equal(l.check({ staffId: 'A', targetId: 'E', text: 'x', requesterOrigins: [], targetOrigins: [], requesterIsLeader: true }), 'tooMany')
  assert.equal(l.check({ staffId: 'Z', targetId: 'B', text: 'x', requesterOrigins: [], targetOrigins: [{ kind: 'help', fromId: 'A' }], requesterIsLeader: true }), 'busy')
})

test('결과 취합: 재위임한 리더는 하위 결과가 모두 돌아올 때까지 열린 요청이 있고, 닫히면 요청한 리더용 사슬이 유지된다', () => {
  const l = new HelpLedger()
  const o1 = l.open('A', 'B', [], true)
  const b: O[] = [{ kind: 'help', fromId: 'A', reqId: o1.reqId, help: o1.help }]
  assert.equal(l.hasOpenFrom('B', o1.help.rootId), false)
  const c1 = l.open('B', 'C', b, false)
  const c2 = l.open('B', 'D', b, false)
  assert.equal(l.hasOpenFrom('B', o1.help.rootId), true)
  assert.equal(l.hasOpenFrom('A', o1.help.rootId), true) // A→B 요청 자체도 A가 연 열린 요청
  l.close(c1.reqId)
  assert.equal(l.hasOpenFrom('B', o1.help.rootId), true) // D가 아직 안 돌아옴
  assert.deepEqual(l.close(c2.reqId), { rootId: o1.help.rootId, path: ['A', 'B'], leaderChain: true })
  assert.equal(l.hasOpenFrom('B', o1.help.rootId), false) // 모두 돌아옴 → B가 A에게 취합 보고
  assert.deepEqual(l.close(o1.reqId), { rootId: o1.help.rootId, path: ['A'], leaderChain: true })
  assert.equal(l.hasOpenFrom('A', o1.help.rootId), false)
})

test('거절: 받은 요청을 닫으면 요청한 리더에게 사슬이 이어지고 같은 대상에게 다시 요청할 수 있다', () => {
  const l = new HelpLedger()
  const o = l.open('A', 'B', [], true)
  assert.equal(l.check({ staffId: 'A', targetId: 'B', text: 'x', requesterOrigins: [], targetOrigins: [{ kind: 'help', fromId: 'A', reqId: o.reqId }], requesterIsLeader: true }), 'duplicate')
  assert.deepEqual(l.close(o.reqId), { rootId: o.help.rootId, path: ['A'], leaderChain: true })
  assert.equal(l.check({ staffId: 'A', targetId: 'B', text: 'x', requesterOrigins: [{ kind: 'user', help: { rootId: o.help.rootId, path: ['A'], leaderChain: true } }], targetOrigins: [], requesterIsLeader: true }), null)
})

test('보고 보류: 하위 요청이 열려 있거나, 돌아온 하위 결과를 아직 처리하지 않았으면 위로 보고하지 않는다', () => {
  const l = new HelpLedger()
  const o1 = l.open('A', 'B', [], true)
  const c = l.open('B', 'C', [{ kind: 'help', fromId: 'A', reqId: o1.reqId, help: o1.help }])
  const root = o1.help.rootId
  assert.equal(isHelpWaiting('B', root, [], l), true, '하위 요청이 열려 있다')
  const back = l.close(c.reqId)!
  assert.equal(isHelpWaiting('B', root, [{ kind: 'user', help: back }], l), true, '결과가 대기열에 남아 있다')
  assert.equal(isHelpWaiting('B', root, [], l), false, '결과를 처리한 턴')
  assert.equal(isHelpWaiting('B', root, [{ kind: 'user', help: { rootId: 'other', path: ['X'] } }], l), false, '다른 원업무 결과는 상관없다')
})
