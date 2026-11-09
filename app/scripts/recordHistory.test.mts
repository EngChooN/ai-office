// 업무 패널 이전 기록: 날짜와 상관없는 최근 기록·이전 기록 커서 조회(DB·외부 세션)·합치기·날짜 구분 (src/main/db.ts logsPage, src/shared/recordLogs.ts, src/main/transcript.ts)
// db.ts는 electron의 app.getPath만 쓰므로 가짜 app으로 임시 폴더의 실제 sqlite 파일을 연다

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { after, mock, test } from 'node:test'
import type { LogEntry } from '../src/shared/types.ts'
import { clampRecordLimit, dayKey, dayStarts, mergeLogs, mergeRecent, pageLogs, RECORD_PAGE, RECORD_PAGE_MAX, RECORD_RECENT } from '../src/shared/recordLogs.ts'
import { readCodexExternalDay } from '../src/main/transcript.ts'

register('./dbLoaderHooks.mjs', import.meta.url)
const g = globalThis as unknown as { __testUserData: string }
const dbm = await import('../src/main/db.ts')

const dirs: string[] = []
const freshDb = () => {
  dbm.closeDb()
  g.__testUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'record-history-'))
  dirs.push(g.__testUserData)
  dbm.openDb()
}
after(() => {
  dbm.closeDb()
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true })
})

const DAY = 86_400_000
const log = (id: number, ts = id * 1000): LogEntry => ({ id, staffId: 's1', ts, type: 'reply', text: `#${id}` })
const ids = (logs: readonly LogEntry[]) => logs.map((l) => l.id)

test('DB: 최근 기록은 날짜와 상관없이 마지막 N개, 이전 기록은 커서 앞에서 이어진다', () => {
  freshDb()
  const today0 = new Date(2026, 10, 9).getTime()
  mock.timers.enable({ apis: ['Date'], now: today0 - 3 * DAY })
  for (let i = 0; i < 5; i++) dbm.insertLog('s1', 'reply', `금요일 ${i}`)
  dbm.insertUsage('s1', 1, 100, 10)
  mock.timers.setTime(today0 + 3_600_000)
  for (let i = 0; i < 3; i++) dbm.insertLog('s1', 'instruction', `월요일 ${i}`)
  dbm.insertLog('s2', 'reply', '다른 직원')
  dbm.insertUsage('s1', 2, 200, 20)
  mock.timers.reset()

  // 오늘 0시 조건이 없으니 금요일 기록도 온다
  const recent = dbm.logsPage('s1', 300)
  assert.equal(recent.logs.length, 8)
  assert.equal(recent.hasMore, false)
  assert.deepEqual(recent.logs.map((l) => l.text).slice(0, 2), ['금요일 0', '금요일 1'])
  assert.ok(recent.logs.every((l, i, a) => i === 0 || a[i - 1].id < l.id), 'id 오름차순')
  assert.ok(recent.logs.every((l) => l.staffId === 's1'), '다른 직원 기록은 섞이지 않는다')

  // 사용량은 지금처럼 오늘 0시부터
  assert.deepEqual(dbm.usageSince('s1', today0), { costUsd: 2, tokensIn: 200, tokensOut: 20 })

  // 최근 3개 → 그 앞 3개 → 남은 2개(끝)
  const p1 = dbm.logsPage('s1', 3)
  assert.deepEqual(p1.logs.map((l) => l.text), ['월요일 0', '월요일 1', '월요일 2'])
  assert.equal(p1.hasMore, true)
  const p2 = dbm.logsPage('s1', 3, p1.logs[0].id)
  assert.deepEqual(p2.logs.map((l) => l.text), ['금요일 2', '금요일 3', '금요일 4'])
  assert.equal(p2.hasMore, true)
  const p3 = dbm.logsPage('s1', 3, p2.logs[0].id)
  assert.deepEqual(p3.logs.map((l) => l.text), ['금요일 0', '금요일 1'])
  assert.equal(p3.hasMore, false)
})

test('DB 경계: 딱 limit개면 더 없음, 가장 오래된 id 앞·없는 직원은 빈 결과', () => {
  freshDb()
  for (let i = 0; i < 4; i++) dbm.insertLog('s1', 'reply', `${i}`)
  const all = dbm.logsPage('s1', 4)
  assert.equal(all.logs.length, 4)
  assert.equal(all.hasMore, false, 'limit과 개수가 같으면 더 없음')
  assert.equal(dbm.logsPage('s1', 3).hasMore, true)
  assert.deepEqual(dbm.logsPage('s1', 10, all.logs[0].id), { logs: [], hasMore: false })
  assert.deepEqual(dbm.logsPage('nobody', 10), { logs: [], hasMore: false })
  // 커서는 그 id를 빼고 앞만 (겹치지 않는다)
  assert.deepEqual(ids(dbm.logsPage('s1', 10, all.logs[2].id).logs), ids(all.logs.slice(0, 2)))
})

test('DB: 기록 수천 개에서도 페이지 조회가 빠르고 빠짐·겹침 없이 처음까지 이어진다', () => {
  freshDb()
  const N = 5000
  // 한 줄씩 넣으면 느려서 같은 파일을 따로 열어 한 번에 넣는다
  const raw = new DatabaseSync(path.join(g.__testUserData, 'office.db'))
  raw.exec('BEGIN')
  const insert = raw.prepare('INSERT INTO log (staff_id, ts, type, text) VALUES (?, ?, ?, ?)')
  for (let i = 0; i < N; i++) insert.run(i % 5 === 0 ? 'other' : 's1', 1_000_000 + i, 'tool', `${i}`)
  raw.exec('COMMIT')
  // 직원별 id 색인을 타서 정렬 없이 읽는다
  const plan = raw.prepare('EXPLAIN QUERY PLAN SELECT * FROM log WHERE staff_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all('s1', 100, 10) as { detail: string }[]
  assert.match(plan.map((p) => p.detail).join(' | '), /log_staff_id/)
  assert.doesNotMatch(plan.map((p) => p.detail).join(' | '), /TEMP B-TREE/)
  raw.close()
  const total = N - N / 5
  const started = performance.now()
  let page = dbm.logsPage('s1', RECORD_RECENT)
  const seen = [...page.logs]
  let rounds = 0
  while (page.hasMore) {
    page = dbm.logsPage('s1', RECORD_PAGE, seen[0].id)
    seen.unshift(...page.logs)
    rounds++
  }
  const ms = performance.now() - started
  assert.equal(seen.length, total)
  assert.equal(new Set(ids(seen)).size, total, '겹침 없음')
  assert.ok(seen.every((l, i, a) => i === 0 || a[i - 1].id < l.id), '순서 유지')
  assert.equal(rounds, Math.ceil((total - RECORD_RECENT) / RECORD_PAGE))
  assert.ok(ms < 2000, `페이지 조회 ${ms.toFixed(0)}ms`)
})

test('pageLogs: 외부 세션 기록 배열을 같은 규칙으로 자른다', () => {
  const logs = Array.from({ length: 10 }, (_, i) => log(i))
  assert.deepEqual(pageLogs(logs, 3), { logs: logs.slice(7), hasMore: true })
  assert.deepEqual(pageLogs(logs, 3, 7), { logs: logs.slice(4, 7), hasMore: true })
  assert.deepEqual(pageLogs(logs, 3, 2), { logs: logs.slice(0, 2), hasMore: false })
  assert.deepEqual(pageLogs(logs, 10), { logs, hasMore: false })
  assert.deepEqual(pageLogs(logs, 3, 0), { logs: [], hasMore: false })
  assert.deepEqual(pageLogs([], 3), { logs: [], hasMore: false })
  // 커서 id가 배열에 없어도(사이 값) 그보다 앞선 것만
  const gappy = [log(1), log(5), log(9)]
  assert.deepEqual(ids(pageLogs(gappy, 5, 6).logs), [1, 5])
})

test('clampRecordLimit: 없거나 이상한 값은 기본값, 너무 크면 상한', () => {
  assert.equal(clampRecordLimit(undefined, RECORD_PAGE), RECORD_PAGE)
  assert.equal(clampRecordLimit(Number.NaN, RECORD_PAGE), RECORD_PAGE)
  assert.equal(clampRecordLimit(0, RECORD_PAGE), 1)
  assert.equal(clampRecordLimit(1e9, RECORD_PAGE), RECORD_PAGE_MAX)
  assert.equal(clampRecordLimit(12.7, RECORD_PAGE), 12)
})

test('mergeLogs: 앞·뒤에 붙이기, 겹침은 한 번만, 새것이 없으면 같은 배열', () => {
  const a = [log(3), log(4), log(5)]
  assert.deepEqual(ids(mergeLogs(a, [log(6), log(7)])), [3, 4, 5, 6, 7])
  assert.deepEqual(ids(mergeLogs(a, [log(1), log(2)])), [1, 2, 3, 4, 5])
  assert.deepEqual(ids(mergeLogs(a, [log(4), log(5), log(6)])), [3, 4, 5, 6])
  assert.deepEqual(ids(mergeLogs(a, [log(2), log(4)])), [2, 3, 4, 5])
  assert.equal(mergeLogs(a, [log(4), log(5)]), a, '다시 읽어도 바뀐 게 없으면 다시 그리지 않는다')
  assert.equal(mergeLogs(a, []), a)
  // 이전 기록을 불러온 뒤 최근 기록을 다시 읽어도 이전 기록이 남는다
  const older = mergeLogs(a, [log(1), log(2)])
  assert.deepEqual(ids(mergeLogs(older, [log(4), log(5), log(6)])), [1, 2, 3, 4, 5, 6])
})

test('mergeRecent: 새 줄이 한 번에 많아 사이가 비면 최근 기록부터 새로 시작한다', () => {
  const prev = { logs: [log(1), log(2), log(3)], hasMore: false }
  // 겹치거나 바로 이어지면(더 이전 없음) 합친다
  assert.deepEqual(ids(mergeRecent(prev, { logs: [log(3), log(4)], hasMore: true }).logs), [1, 2, 3, 4])
  assert.deepEqual(ids(mergeRecent(prev, { logs: [log(4), log(5)], hasMore: false }).logs), [1, 2, 3, 4, 5])
  // 겹치지 않는데 앞에 더 있으면 틈 — 이어 붙이지 않는다
  const gap = mergeRecent(prev, { logs: [log(500), log(501)], hasMore: true })
  assert.deepEqual(ids(gap.logs), [500, 501])
  assert.equal(gap.hasMore, true)
  assert.equal(mergeRecent(prev, { logs: [log(2), log(3)], hasMore: true }), prev, '바뀐 게 없으면 같은 객체')
  assert.deepEqual(ids(mergeRecent(null, { logs: [log(9)], hasMore: true }).logs), [9])
})

test('dayStarts: 날짜가 바뀌는 첫 줄마다 구분선 (자정 경계)', () => {
  const fri = new Date(2026, 10, 6, 23, 59, 59).getTime()
  const sat = new Date(2026, 10, 7, 0, 0, 0).getTime()
  const mon = new Date(2026, 10, 9, 9).getTime()
  const logs = [log(1, fri - 1000), log(2, fri), log(3, sat), log(4, mon), log(5, mon + 60_000)]
  assert.deepEqual([...dayStarts(logs)], [1, 3, 4])
  assert.notEqual(dayKey(fri), dayKey(sat))
  assert.deepEqual([...dayStarts([])], [])
  // '지시·보고만'처럼 일부만 보여도 보이는 줄 기준으로 나눈다
  assert.deepEqual([...dayStarts([log(2, fri), log(5, mon)])], [2, 5])
})

test('합치기·날짜 구분: 기록 수천 개도 빠르다', () => {
  const N = 6000
  const base = new Date(2026, 9, 1).getTime()
  const logs = Array.from({ length: N }, (_, i) => log(i + 1, base + i * 600_000))
  const started = performance.now()
  let acc: readonly LogEntry[] = logs.slice(-RECORD_RECENT)
  while (acc[0].id > 1) acc = mergeLogs(acc, pageLogs(logs, RECORD_PAGE, acc[0].id).logs)
  for (let i = 0; i < 50; i++) acc = mergeLogs(acc, logs.slice(-RECORD_RECENT))
  const starts = dayStarts(acc)
  const ms = performance.now() - started
  assert.equal(acc.length, N)
  assert.equal(starts.size, new Set(logs.map((l) => dayKey(l.ts))).size)
  assert.ok(ms < 500, `합치기·구분 ${ms.toFixed(0)}ms`)
})

test('외부 Codex 세션: 기록은 어제 것도 읽고(logSince=0), 토큰은 오늘 몫만', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-codex-'))
  dirs.push(dir)
  const now = new Date()
  const day = path.join(dir, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'))
  fs.mkdirSync(day, { recursive: true })
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const at = (ms: number) => new Date(ms).toISOString()
  const msg = (ms: number, role: string, text: string) => JSON.stringify({ timestamp: at(ms), type: 'response_item', payload: { type: 'message', role, content: [{ type: 'input_text', text }] } })
  const tokens = (ms: number, input: number, output: number) => JSON.stringify({ timestamp: at(ms), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, output_tokens: output } } } })
  fs.writeFileSync(
    path.join(day, 'rollout-x-sid1.jsonl'),
    [msg(today0 - DAY, 'user', '어제 지시'), msg(today0 - DAY + 1000, 'assistant', '어제 답'), tokens(today0 - DAY + 2000, 100, 10), msg(today0 + 1000, 'user', '오늘 지시'), tokens(today0 + 2000, 150, 30)].join('\n'),
  )
  const todayOnly = readCodexExternalDay('x', 'sid1', today0, dir)
  assert.deepEqual(todayOnly.logs.map((l) => l.text), ['오늘 지시'])
  const all = readCodexExternalDay('x', 'sid1', today0, dir, 0)
  assert.deepEqual(all.logs.map((l) => l.text), ['어제 지시', '어제 답', '오늘 지시'])
  assert.deepEqual(ids(all.logs), [0, 1, 2], '줄 순서 id라 커서로 이어 부를 수 있다')
  assert.equal(all.tokensIn, 50)
  assert.equal(all.tokensOut, 20)
  assert.deepEqual(pageLogs(all.logs, 1, all.logs[2].id).logs.map((l) => l.text), ['어제 답'])
})
