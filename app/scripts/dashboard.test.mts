// 대시보드 상황판 계산 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attentionItems, countByStatus, currentTask, formatAgo, formatElapsed, initials, usageRatio } from '../src/shared/dashboard.ts'

const MIN = 60_000

test('경과 시간 표기', () => {
  assert.equal(formatElapsed(30_000), '방금')
  assert.equal(formatElapsed(12 * MIN), '12분째')
  assert.equal(formatElapsed(65 * MIN), '1시간 5분째')
  assert.equal(formatElapsed(120 * MIN), '2시간째')
  assert.equal(formatElapsed(49 * 60 * MIN), '2일째')
})

test('활동 피드 상대 시각', () => {
  const now = new Date(2026, 9, 21, 15, 0).getTime()
  assert.equal(formatAgo(now - 10_000, now), '방금')
  assert.equal(formatAgo(now - 3 * MIN, now), '3분 전')
  assert.equal(formatAgo(now - 2 * 60 * MIN, now), '2시간 전')
  assert.equal(formatAgo(new Date(2026, 9, 20, 9, 5).getTime(), now), '10/20 09:05')
})

test('이니셜: 한글 뒤 2글자, 영문 단어 첫 글자', () => {
  assert.equal(initials('이디자'), '디자')
  assert.equal(initials('새로운 폴더 및 프로젝트·분신'), '분신')
  assert.equal(initials('민수'), '민수')
  assert.equal(initials('claude-office'), 'CO')
  assert.equal(initials('Alice'), 'AL')
})

test('요약 줄은 퇴근을 세지 않는다', () => {
  const counts = countByStatus([{ status: 'working' }, { status: 'waiting' }, { status: 'idle' }, { status: 'offline' }, { status: 'working' }])
  assert.deepEqual(counts, { working: 2, waiting: 1, error: 0, idle: 1 })
})

test('확인 필요: 오류가 맨 위, 결재·질문은 오래된 것부터, 예산은 80% 이상만', () => {
  const approval = (id: string, createdAt: number, isQuestion = false) => ({ id, staffId: 'a', toolName: 'Bash', summary: 'ls', createdAt, ...(isQuestion ? { questions: [] } : {}) })
  const items = attentionItems(
    [
      { id: 'a', status: 'waiting', statusSince: 0, approvals: [approval('new', 200), approval('old', 100, true)] },
      { id: 'b', status: 'error', statusSince: 300, approvals: [] },
      { id: 'c', status: 'idle', statusSince: 0, approvals: [] },
    ],
    new Map([['c', 0.87], ['a', 0.5]]),
  )
  assert.deepEqual(items.map((i) => i.key), ['error:b', 'approval:old', 'approval:new', 'budget:c'])
  assert.equal(items[1].kind, 'question')
  assert.equal(items[3].ratio, 0.87)
})

test('맡은 업무: 진행 중 가장 최근 것 + 나머지 수', () => {
  const tasks = [
    { title: 'A', status: 'doing' as const, assigneeId: 's', updatedAt: 1 },
    { title: 'B', status: 'doing' as const, assigneeId: 's', updatedAt: 5 },
    { title: 'C', status: 'todo' as const, assigneeId: 's', updatedAt: 9 },
  ]
  assert.deepEqual(currentTask(tasks, 's'), { title: 'B', more: 1 })
  assert.equal(currentTask(tasks, 'x'), null)
})

test('사용 비율: 한도가 없으면 null', () => {
  assert.equal(usageRatio(50, 100), 0.5)
  assert.equal(usageRatio(50, 0), null)
})
