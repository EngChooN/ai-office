// 직원끼리 도움 요청 — 대상 계산·제한 장치·자율 이어받기 단위 테스트 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HELP_MAX_DEPTH, HELP_MAX_PER_TASK, HELP_TEXT_MAX, checkHelpRequest, helpDepthOf, helpTargetIds } from '../src/shared/helpRequest.ts'
import { resolveAutonomy } from '../src/shared/autonomy.ts'

const hired = (...ids: string[]) => (id: string) => ids.includes(id)

test('대상: 같은 팀·같은 랩 직원, 본인 제외, 중복 제거', () => {
  const ids = helpTargetIds('a', { teamMemberIds: ['a', 'b', 'c'], labMemberIds: [['a', 'c', 'd']], isLead: false }, hired('a', 'b', 'c', 'd'))
  assert.deepEqual(ids.sort(), ['b', 'c', 'd'])
})

test('대상: 팀장·랩 리드는 없음(delegate 사용), 고용 안 된 직원·다른 PC 직원은 뺀다', () => {
  assert.deepEqual(helpTargetIds('a', { teamMemberIds: ['a', 'b'], labMemberIds: [], isLead: true }, hired('a', 'b')), [])
  assert.deepEqual(helpTargetIds('a', { teamMemberIds: ['a', 'b', 'remote'], labMemberIds: [], isLead: false }, hired('a', 'b')), ['b'])
  assert.deepEqual(helpTargetIds('a', { teamMemberIds: [], labMemberIds: [], isLead: false }, hired('a')), [])
})

test('깊이: 도움 요청 출처가 없으면 0, 있으면 가장 깊은 단계', () => {
  assert.equal(helpDepthOf([{ kind: 'user' }, { kind: 'task' }]), 0)
  assert.equal(helpDepthOf([{ kind: 'help', depth: 1 }, { kind: 'help', depth: 2 }]), 2)
})

const base = { staffId: 'a', text: '사진 추가해 주세요', requesterOrigins: [], targetOrigins: [], sentCount: 0 }

test('제한: 정상 요청은 통과', () => {
  assert.equal(checkHelpRequest(base), null)
})

test('제한: 요청문 800자 초과 거절, 800자는 통과', () => {
  assert.equal(checkHelpRequest({ ...base, text: 'x'.repeat(HELP_TEXT_MAX) }), null)
  assert.equal(checkHelpRequest({ ...base, text: 'x'.repeat(HELP_TEXT_MAX + 1) }), 'tooLong')
})

test('제한: 2단계까지 허용, 3번째 단계 요청은 거절', () => {
  assert.equal(checkHelpRequest({ ...base, requesterOrigins: [{ kind: 'help', fromId: 'z', depth: 1 }] }), null, '받은 일에서 한 번 더')
  assert.equal(checkHelpRequest({ ...base, requesterOrigins: [{ kind: 'help', fromId: 'z', depth: HELP_MAX_DEPTH }] }), 'tooDeep')
})

test('제한: 같은 대상에게 처리 중인 내 요청이 있으면 거절, 남의 요청은 무관', () => {
  assert.equal(checkHelpRequest({ ...base, targetOrigins: [{ kind: 'help', fromId: 'a', depth: 1 }] }), 'duplicate')
  assert.equal(checkHelpRequest({ ...base, targetOrigins: [{ kind: 'help', fromId: 'other', depth: 1 }, { kind: 'delegate' }] }), null)
})

test('제한: 업무당 3건까지, 4번째는 거절', () => {
  assert.equal(checkHelpRequest({ ...base, sentCount: HELP_MAX_PER_TASK - 1 }), null)
  assert.equal(checkHelpRequest({ ...base, sentCount: HELP_MAX_PER_TASK }), 'tooMany')
})

test('자율: 자율 표시가 붙은 도움 요청 출처는 받은 직원도 자율로 이어 간다', () => {
  const none = () => false
  assert.equal(resolveAutonomy({ isFull: false, origins: [{ kind: 'help', isAutonomous: true }], isTaskAutonomous: none }), true)
  assert.equal(resolveAutonomy({ isFull: false, origins: [{ kind: 'help' }], isTaskAutonomous: none }), false)
})
