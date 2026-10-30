// 단체방 @태그 응답 누락 재현 — pnpm test
// 원인: 직원이 일하는 중에 받은 지시는 Claude SDK가 입력 스트림에서 바로 가져가서, 앱이 inbox 길이로 센 "남은 지시"가 0이었다.
// 그래서 앞 일의 결과가 오면 손이 빈 것으로 보고, 이어서 온 그 지시의 결과를 '지시와 상관없는 결과'로 버렸다(단체방 답 없음).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PendingSends, splitFinished } from '../src/main/ai/pendingSends.ts'

test('일하는 중에 받은 지시: 앞 결과가 와도 남은 지시로 세고, 그 지시의 결과가 와야 0', () => {
  const p = new PendingSends()
  p.add('a') // 하던 일
  p.add('b') // 일하는 중에 단체방에서 @태그
  p.settle(['a'])
  assert.equal(p.count, 1) // 예전: inbox가 비어 0 → 다음 결과(b의 답)를 버림
  p.settle(['b'])
  assert.equal(p.count, 0)
})

test('CLI가 일하던 턴에 끼워 넣어 한 결과로 답하면 함께 지운다', () => {
  const p = new PendingSends()
  p.add('a')
  p.add('b')
  p.settle(['a', 'b'])
  assert.equal(p.count, 0)
})

test('결과에 지시 표시가 없으면(옛 CLI·로컬 명령) 가장 먼저 보낸 하나만 지운다', () => {
  const p = new PendingSends()
  p.add('a')
  p.add('b')
  p.settle(undefined)
  assert.equal(p.count, 1)
  p.settle([])
  assert.equal(p.count, 0)
  p.settle(undefined) // 남은 게 없어도 괜찮다
  assert.equal(p.count, 0)
})

test('세션이 닫히면 이미 넘긴 지시는 버리고, 아직 넘기지 않은 지시만 남긴다', () => {
  const p = new PendingSends()
  p.add('a')
  p.add('b')
  p.keepOnly(['b'])
  assert.equal(p.count, 1)
})

test('끝난 턴의 받은 일 나누기: 아직 답하지 않은 지시(나중에 받은 것)는 다음 결과 몫으로 남겨 지시가 온 방에 답이 간다', () => {
  const origins = [{ kind: 'task', taskId: 't1' }, { kind: 'chat', room: 'team-a' }]
  assert.deepEqual(splitFinished(origins, 1), { done: [origins[0]], keep: [origins[1]] })
  assert.deepEqual(splitFinished(origins, 0), { done: origins, keep: [] })
  // 받은 일보다 남은 지시가 많아도(같은 카드 재지시 등) 넘치지 않는다
  assert.deepEqual(splitFinished(origins, 5), { done: [], keep: origins })
})
