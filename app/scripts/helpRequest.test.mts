// 직원끼리 도움 요청 — 대상 계산·제한 장치·자율 이어받기 단위 테스트 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HELP_TEXT_MAX, HelpLedger, mustUseHelp, helpDepthOf, helpTargetIds, inHelpContext, type HelpCtx } from '../src/shared/helpRequest.ts'
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
