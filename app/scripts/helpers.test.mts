// 도우미(서브에이전트) — 엔진 이벤트로 목록 고치기·표시 규칙(2명 이상·스위치·Claude만)·도우미 안 도구 막기 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HELPER_SHOW_MIN, helperBadgeCount, helperElapsed, helperEnded, helperHeadline, helperStarted, isHelperBarredTool, isHelpersOn, isHelperTask, pruneEnded } from '../src/shared/helpers.ts'
import type { Equipment, HelperRun, Staff } from '../src/shared/types.ts'

const EQ: Equipment = { mcpServers: [], skills: 'all', allowedTools: [], disallowedTools: [], monthlyBudgetUsd: 0 }
const who = (helpers: HelperRun[], over: Partial<Pick<Staff, 'provider'>> & { on?: boolean } = {}): Pick<Staff, 'provider' | 'equipment' | 'helpers'> => ({
  provider: over.provider ?? 'claude',
  equipment: { ...EQ, helpers: over.on ?? true },
  helpers,
})
const run = (id: string, endedAt?: number): HelperRun => ({ id, title: `일 ${id}`, startedAt: 0, ...(endedAt === undefined ? {} : { endedAt }) })

test('도우미 작업만 센다 — 셸 백그라운드·관리 작업은 뺀다', () => {
  assert.equal(isHelperTask({ task_type: 'local_agent', subagent_type: 'general-purpose' }), true)
  assert.equal(isHelperTask({ task_type: 'local_bash' }), false)
  assert.equal(isHelperTask({ task_type: 'local_workflow' }), false)
  assert.equal(isHelperTask({ task_type: 'local_agent', ambient: true }), false)
  assert.equal(isHelperTask({ task_type: 'local_agent', skip_transcript: true }), false)
  // 옛 CLI: task_type 없이 subagent_type만
  assert.equal(isHelperTask({ subagent_type: 'Explore' }), true)
  assert.equal(isHelperTask({}), false)
})

test('시작·끝·턴 끝 정리 — 모르는 id는 같은 배열', () => {
  let list: HelperRun[] = []
  list = helperStarted(list, { id: 'a', title: '  파일 찾기 ', at: 10 })
  list = helperStarted(list, { id: 'b', title: '', at: 20 })
  assert.deepEqual(list, [{ id: 'a', title: '파일 찾기', startedAt: 10 }, { id: 'b', title: '…', startedAt: 20 }])
  assert.equal(helperStarted(list, { id: 'a', title: 'x', at: 30 }), list, '같은 id는 두 번 넣지 않는다')
  assert.equal(helperEnded(list, 'shell-1', 40), list, '셸 작업 끝 알림은 무시')
  const ended = helperEnded(list, 'a', 50)
  assert.equal(ended[0].endedAt, 50)
  assert.equal(helperEnded(ended, 'a', 60), ended, '두 번 끝나지 않는다')
  assert.deepEqual(pruneEnded(ended).map((h) => h.id), ['b'], '턴이 끝나면 끝난 도우미만 지운다')
  assert.equal(pruneEnded(list), list)
})

test('숫자 표시: 2명 이상·스위치 켬·Claude 직원만, 끝난 도우미는 빼고 센다', () => {
  assert.equal(HELPER_SHOW_MIN, 2)
  assert.equal(helperBadgeCount(who([run('a')])), 0, '1명은 표시 안 함')
  assert.equal(helperBadgeCount(who([run('a'), run('b')])), 2)
  assert.equal(helperBadgeCount(who([run('a'), run('b'), run('c', 5)])), 2)
  assert.equal(helperBadgeCount(who([run('a'), run('b'), run('c', 5), run('d', 6)].slice(1))), 0, '도는 건 1명')
  assert.equal(helperBadgeCount(who([run('a'), run('b')], { on: false })), 0, '스위치가 꺼진 직원')
  assert.equal(helperBadgeCount(who([run('a'), run('b')], { provider: 'codex' })), 0, 'GPT 직원')
  assert.equal(helperBadgeCount({ ...who([]), helpers: undefined }), 0)
  assert.equal(isHelpersOn({ provider: 'claude', equipment: EQ }), false, '기본은 꺼짐')
})

test('머리말: 도는 중 N명 / 모두 끝남 / 1명만 돌면 숨김', () => {
  assert.deepEqual(helperHeadline(who([run('a'), run('b'), run('c', 1)]))?.kind, 'running')
  assert.equal(helperHeadline(who([run('a'), run('b'), run('c', 1)]))?.n, 2)
  const done = helperHeadline(who([run('a', 1), run('b', 2), run('c', 3)]))
  assert.equal(done?.kind, 'allDone')
  assert.equal(done?.n, 3)
  assert.equal(done?.list.length, 3, '펼침에는 끝난 도우미도 보인다')
  assert.equal(helperHeadline(who([run('a'), run('b', 2)])), null)
  assert.equal(helperHeadline(who([run('a', 1)])), null, '이번 턴에 1명만 썼으면 표시 안 함')
  assert.equal(helperHeadline(who([run('a'), run('b')], { on: false })), null)
})

test('도우미 안에서 막는 도구: 사무실 도구·또 다른 도우미', () => {
  const office = 'mcp__office__'
  for (const name of ['mcp__office__delegate', 'mcp__office__report_image', 'Agent', 'Task']) assert.equal(isHelperBarredTool(name, office), true, name)
  for (const name of ['Read', 'Bash', 'Grep', 'mcp__playwright__browser_click', 'WebSearch']) assert.equal(isHelperBarredTool(name, office), false, name)
})

test('경과 시간 표기', () => {
  assert.equal(helperElapsed(0), '0:00')
  assert.equal(helperElapsed(42_400), '0:42')
  assert.equal(helperElapsed(65_000), '1:05')
  assert.equal(helperElapsed(3_725_000), '1:02:05')
  assert.equal(helperElapsed(-5), '0:00', 'PC·휴대폰 시계가 어긋나도 음수 없음')
})
