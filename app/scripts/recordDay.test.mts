// 기록 › 보고서 하루 보기: 종류 나누기·결재 결과 읽기·요약 숫자·걸러보기·직원별 묶음 단위 테스트 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendLive, approvalOutcome, filterDay, groupByStaff, oneLine, shiftDay, summarizeDay } from '../src/shared/recordDay.ts'
import { tk } from '../src/shared/i18n/index.ts'
import type { LogEntry } from '../src/shared/types.ts'

let id = 0
const log = (staffId: string, type: LogEntry['type'], ts: number, text = '', extra: Partial<LogEntry> = {}): LogEntry => ({ id: ++id, staffId, type, ts, text, ...extra })

test('결재 결과: 번역 키 줄(대표·휴대폰 감싼 줄·자동)', () => {
  assert.equal(approvalOutcome(log('a', 'approval', 1, '승인: Edit x', { textI18n: { list: ['', tk('log.approved'), ': Edit ', 'x'], sep: '' } })), 'approved')
  assert.equal(approvalOutcome(log('a', 'approval', 1, '📱 원격 반려: Bash y', { textI18n: { list: ['📱 원격 ', { list: ['', tk('log.rejected'), ': Bash ', 'y'], sep: '' }], sep: '' } })), 'rejected')
  assert.equal(approvalOutcome(log('a', 'approval', 1, '', { textI18n: tk('log.autoApprove', { tool: 'Edit', summary: 'x' }) })), 'auto')
  assert.equal(approvalOutcome(log('a', 'approval', 1, '', { textI18n: tk('log.ruleApprove', { tool: 'Edit', summary: 'x' }) })), 'auto')
})

test('결재 결과: 글자만 남은 예전 줄은 4개 언어 라벨로 읽고, 안내 줄은 null', () => {
  assert.equal(approvalOutcome(log('a', 'approval', 1, '승인: Edit a.ts')), 'approved')
  assert.equal(approvalOutcome(log('a', 'approval', 1, '📱 원격 반려: Bash rm')), 'rejected')
  assert.equal(approvalOutcome(log('a', 'approval', 1, 'Approved: Edit a.ts')), 'approved')
  assert.equal(approvalOutcome(log('a', 'approval', 1, '답변: 색은? → 파랑')), 'answered')
  assert.equal(approvalOutcome(log('a', 'approval', 1, '🤖 자동결재 승인: Edit a.ts')), 'auto')
  assert.equal(approvalOutcome(log('a', 'approval', 1, '취소됨: Edit a.ts')), null)
  assert.equal(approvalOutcome(log('a', 'reply', 1, '승인: x')), null, '결재 줄이 아니면 null')
})

test('요약: 끝낸 일·지시(위임 포함)·결재 결과별·문제·결과물', () => {
  const art = { id: 'f', name: 'a.html', path: '/a', mime: 'text/html', size: 1, artifact: { id: 'x', version: 1 } } as never
  const s = summarizeDay([
    log('a', 'result', 1, 'done', { attachments: [art] }),
    log('a', 'result', 2),
    log('a', 'instruction', 3),
    log('b', 'delegate', 4),
    log('a', 'approval', 5, '승인: Edit'),
    log('a', 'approval', 6, '반려: Edit'),
    log('a', 'approval', 7, '🤖 자동결재 승인: Edit x'),
    log('a', 'approval', 8, '취소됨: Edit x'),
    log('b', 'error', 9),
    log('b', 'tool', 10),
  ])
  assert.deepEqual(s, { done: 2, instruction: 2, approval: { total: 3, approved: 1, rejected: 1, answered: 0, auto: 1 }, error: 1, artifacts: 1 })
})

test('걸러보기: 기본은 도구 숨김·최신 먼저, 종류·직원으로 거른다', () => {
  const logs = [log('a', 'result', 1), log('a', 'tool', 2), log('b', 'error', 3), log('b', 'reply', 4)]
  assert.deepEqual(filterDay(logs, { filter: 'all', staffId: null, isToolsShown: false }).map((l) => l.ts), [4, 3, 1])
  assert.deepEqual(filterDay(logs, { filter: 'all', staffId: null, isToolsShown: true }).map((l) => l.ts), [4, 3, 2, 1])
  assert.deepEqual(filterDay(logs, { filter: 'error', staffId: null, isToolsShown: false }).map((l) => l.ts), [3])
  assert.deepEqual(filterDay(logs, { filter: 'all', staffId: 'a', isToolsShown: false }).map((l) => l.ts), [1])
})

test('직원별 묶음: 문제 있는 직원 먼저, 그다음 기록 많은 순, 묶음 안은 최신 먼저', () => {
  const logs = [log('a', 'result', 1), log('a', 'result', 2), log('a', 'reply', 3), log('b', 'error', 4), log('c', 'result', 5), log('c', 'instruction', 6)]
  const g = groupByStaff(logs)
  assert.deepEqual(g.map((x) => x.staffId), ['b', 'a', 'c'])
  assert.deepEqual(g[1].items.map((l) => l.ts), [3, 2, 1])
  assert.deepEqual(g[1].counts, { done: 2, instruction: 0, approval: 0, error: 0 })
})

test('한 줄 글: 빈 줄·마크다운 머리 기호를 뗀 첫 줄', () => {
  assert.equal(oneLine('\n## 결과\n본문'), '결과')
  assert.equal(oneLine('- 첫 항목\n- 둘'), '첫 항목')
  assert.equal(oneLine('그냥 글'), '그냥 글')
})

test('날짜 이동: 그날 0시 기준으로 하루씩', () => {
  const d = new Date(2026, 10, 13).getTime()
  assert.equal(shiftDay(d, -1), new Date(2026, 10, 12).getTime())
  assert.equal(shiftDay(d, 1), new Date(2026, 10, 14).getTime())
  assert.equal(shiftDay(new Date(2026, 10, 30).getTime(), 1), new Date(2026, 11, 1).getTime())
})

test('새 기록 붙이기: 이날 것·처음 보는 id만, 새 것이 없으면 같은 목록', () => {
  const day0 = new Date(2026, 10, 13).getTime()
  const day1 = shiftDay(day0, 1)
  const a = log('a', 'reply', day0 + 10)
  const b = log('a', 'reply', day0 + 20)
  const day = [a, b]
  const next = log('a', 'reply', day0 + 30)
  const tomorrow = log('a', 'reply', day1 + 1)
  assert.deepEqual(appendLive(day, [a, b, next, tomorrow], day0, day1).map((l) => l.id), [a.id, b.id, next.id])
  assert.equal(appendLive(day, [a, b], day0, day1), day)
  // 지난 날짜를 보는 중에는 오늘 기록이 붙지 않는다
  assert.equal(appendLive(day, [tomorrow], shiftDay(day0, -1), day0), day)
})
