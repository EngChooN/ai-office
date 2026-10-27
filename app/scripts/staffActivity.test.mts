// 멈춘 직원 진단: 읽기 전용 조회의 모양·분류·비서 글
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildStaffActivity, compactStaffActivity } from '../src/shared/staffActivity.ts'
import { SECRETARY_SIGNATURES, SECRETARY_TOOLS } from '../src/shared/secretaryTools.ts'
import { V2_METHODS } from '../src/main/remote/v2.ts'
import type { LogEntry, Staff } from '../src/shared/types.ts'

const NOW = 10_000_000
const log = (id: number, ts: number, type: LogEntry['type'], text: string): LogEntry => ({ id, staffId: 'kim', ts, type, text })
const staff = (over: Partial<Staff> = {}) => ({ id: 'kim', name: '김개발', status: 'working', statusSince: NOW - 30 * 60_000, activity: '', approvals: [], ...over }) as Pick<Staff, 'id' | 'name' | 'status' | 'statusSince' | 'activity' | 'approvals'>

test('분류: 조회(read)·인자 모양·원격 R', () => {
  assert.equal(SECRETARY_TOOLS.staffActivity.kind, 'read')
  assert.equal(SECRETARY_SIGNATURES.staffActivity, '(staffId)')
  assert.equal(V2_METHODS.staffActivity.cls, 'R')
})

test('활동 모으기: 마지막 활동·최근 도구 5건·오류 3건·결재·대기열', () => {
  const logs = [...Array.from({ length: 8 }, (_, i) => log(i, NOW - 100_000 + i * 1000, 'tool', `Bash ${i}`)), ...Array.from({ length: 4 }, (_, i) => log(20 + i, NOW - 50_000 + i, 'error', `오류 ${i}`))]
  const approvals = [{ id: 'a1', staffId: 'kim', toolName: 'AskUserQuestion', summary: '무엇을?', createdAt: NOW - 60_000, questions: [{ question: 'q', header: 'h', options: [], multiSelect: false }] }]
  const a = buildStaffActivity(staff({ approvals }), logs, [{ taskId: 't1', title: '대기 카드' }], NOW)
  assert.equal(a.lastActivityAt, NOW - 50_000 + 3)
  assert.equal(a.idleMs, 50_000 - 3)
  assert.deepEqual(a.recentTools.map((t) => t.text), ['Bash 3', 'Bash 4', 'Bash 5', 'Bash 6', 'Bash 7'])
  assert.deepEqual(a.recentErrors.map((t) => t.text), ['오류 1', '오류 2', '오류 3'])
  assert.equal(a.pendingApprovals[0].isQuestion, true)
  assert.deepEqual(a.queue, [{ taskId: 't1', title: '대기 카드' }])
})

test('기록이 없으면 마지막 활동 null, 입력을 바꾸지 않는다', () => {
  const logs: LogEntry[] = []
  const s = staff()
  const before = JSON.stringify(s)
  const a = buildStaffActivity(s, logs, [], NOW)
  assert.deepEqual([a.lastActivityAt, a.idleMs], [null, null])
  assert.equal(JSON.stringify(s), before)
  assert.equal(logs.length, 0)
})

test('비서 글: 결재 대기·오래 조용한 작업·최근 활동을 구분한다', () => {
  const waiting = buildStaffActivity(staff({ status: 'waiting', approvals: [{ id: 'a1', staffId: 'kim', toolName: 'Bash', summary: 'npm test', createdAt: NOW - 1000 }] }), [], [], NOW)
  assert.match(compactStaffActivity(waiting, NOW), /결재·질문 대기 때문에 멈춰/)
  const quiet = buildStaffActivity(staff(), [log(1, NOW - 20 * 60_000, 'tool', 'Read')], [], NOW)
  assert.match(compactStaffActivity(quiet, NOW), /10분 넘게/)
  const live = buildStaffActivity(staff(), [log(1, NOW - 20_000, 'tool', 'Read')], [], NOW)
  assert.match(compactStaffActivity(live, NOW), /최근에 활동이 있어/)
})
