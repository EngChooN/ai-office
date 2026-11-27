// 팀원이 오류·중지로 못 끝낸 위임 → 맡긴 리더에게 통보 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DELEGATE_FAIL_REASON_MAX, delegateFailNotices, failReasonOf } from '../src/shared/delegateFail.ts'

type O = { kind: string; leadId?: string; room?: string; isAutonomous?: boolean }

/** office.ts의 onFailed→settleFailed, onStopped→dropWork, delegateFrom(replace) 순서를 그대로 옮긴 작은 사무실 */
function mini(hired = ['lead', 'b']) {
  const alive = new Set(hired)
  const origins = new Map<string, O[]>()
  const sent: { to: string; why: 'error' | 'stopped'; reason: string }[] = []
  const get = (id: string) => origins.get(id) ?? []
  const fail = (id: string, os: readonly O[], why: 'error' | 'stopped', error = '') => {
    for (const n of delegateFailNotices(os, (x) => alive.has(x))) sent.push({ to: n.leadId, why, reason: failReasonOf(error) })
  }
  const delegate = (lead: string, to: string) => origins.set(to, [...get(to), { kind: 'delegate', leadId: lead, room: 'team-1' }])
  // 오류: 받은 일을 비운 뒤 정리(settleFailed)에서 통보
  const error = (id: string, msg: string) => {
    const os = get(id)
    origins.set(id, [])
    fail(id, os, 'error', msg)
  }
  // 중지: dropWork에서 받은 일을 비우며 통보 (replace는 끈다)
  const drop = (id: string, notifyLeads = true) => {
    const os = get(id)
    origins.set(id, [])
    if (notifyLeads) fail(id, os, 'stopped')
  }
  // 실패 결과로 끝난 턴(실행 횟수 초과 등 — onFinished isError): 보고 대신 통보
  const reports: string[] = []
  const finish = (id: string, isError: boolean) => {
    const os = get(id)
    origins.set(id, [])
    for (const o of os) if (o.kind === 'delegate' && !isError) reports.push(o.leadId!)
    if (isError) fail(id, os, 'error', 'max turns')
  }
  // 연결 대기 중 replace: 보관을 풀며 정리하되 통보는 끈다 (cancelNetPark notifyLeads:false)
  const parked = new Map<string, O[]>()
  const park = (id: string) => (parked.set(id, get(id)), origins.set(id, []))
  const cancelPark = (id: string, notifyLeads = true) => {
    const os = parked.get(id) ?? []
    parked.delete(id)
    if (notifyLeads) fail(id, os, 'error', 'offline')
  }
  return { delegate, error, drop, finish, park, cancelPark, reports, sent, alive }
}

test('오류: 맡긴 리더에게 한 번, 사유는 오류 첫 줄', () => {
  const m = mini()
  m.delegate('lead', 'b')
  m.error('b', 'API Error: overloaded\n    at foo (bar.js:1)')
  assert.deepEqual(m.sent, [{ to: 'lead', why: 'error', reason: 'API Error: overloaded' }])
})

test('중지: 맡긴 리더에게 한 번', () => {
  const m = mini()
  m.delegate('lead', 'b')
  m.drop('b')
  assert.deepEqual(m.sent.map((s) => [s.to, s.why]), [['lead', 'stopped']])
})

test('리더가 일을 바꿔 맡긴(replace) 경우는 통보하지 않는다', () => {
  const m = mini()
  m.delegate('lead', 'b')
  m.drop('b', false)
  assert.equal(m.sent.length, 0)
})

test('오류 뒤 중지 처리가 겹쳐도 통보는 한 번', () => {
  const m = mini()
  m.delegate('lead', 'b')
  m.error('b', 'boom')
  m.drop('b')
  assert.equal(m.sent.length, 1)
})

test('리더가 해고돼 없으면 건너뛰고, 같은 리더의 위임이 여러 건이어도 한 번', () => {
  const m = mini()
  m.delegate('lead', 'b')
  m.delegate('lead', 'b')
  m.alive.delete('lead')
  m.error('b', 'boom')
  assert.equal(m.sent.length, 0)
  const m2 = mini()
  m2.delegate('lead', 'b')
  m2.delegate('lead', 'b')
  m2.drop('b')
  assert.equal(m2.sent.length, 1)
})

test('위임이 아닌 출처(대표 지시·업무 카드·도움 요청)는 통보 대상이 아니다', () => {
  assert.deepEqual(delegateFailNotices([{ kind: 'user' }, { kind: 'task' }, { kind: 'help' }], () => true), [])
})

test('사유: 빈 줄을 건너뛴 첫 줄, 100자 넘으면 자른다', () => {
  assert.equal(failReasonOf('\n\n  첫 줄  \n둘째'), '첫 줄')
  assert.equal(failReasonOf('x'.repeat(150)), `${'x'.repeat(DELEGATE_FAIL_REASON_MAX)}…`)
  assert.equal(failReasonOf(''), '')
})

test('실패 결과로 끝난 턴: 일반 보고 없이 통보 한 번, 이어 중지가 와도 한 번', () => {
  const m = mini()
  m.delegate('lead', 'b')
  m.finish('b', true)
  m.drop('b')
  assert.deepEqual(m.reports, [])
  assert.deepEqual(m.sent.map((s) => [s.to, s.why, s.reason]), [['lead', 'error', 'max turns']])
  const ok = mini()
  ok.delegate('lead', 'b')
  ok.finish('b', false)
  assert.deepEqual([ok.reports, ok.sent.length], [['lead'], 0])
})

test('연결 대기 중 리더가 일을 바꾸면 통보하지 않고, 그냥 보관 포기면 통보한다', () => {
  const m = mini()
  m.delegate('lead', 'b')
  m.park('b')
  m.cancelPark('b', false)
  assert.equal(m.sent.length, 0)
  const m2 = mini()
  m2.delegate('lead', 'b')
  m2.park('b')
  m2.cancelPark('b')
  assert.equal(m2.sent.length, 1)
})
