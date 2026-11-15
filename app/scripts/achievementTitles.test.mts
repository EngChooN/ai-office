// 새 업적 종류(연속 출근·야근·꾸미기)·숨은 업적·칭호 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ACHIEVEMENTS, activeTitle, isNightHour, longestStreak, unlockedTitles } from '../src/shared/economy.ts'
import { DICT } from '../src/shared/i18n/dict/index.ts'

test('연속 출근: 가장 길게 이어진 날 수 (월말·중복·순서 섞임도)', () => {
  assert.equal(longestStreak([]), 0)
  assert.equal(longestStreak(['2026-11-01']), 1)
  assert.equal(longestStreak(['2026-11-03', '2026-11-01', '2026-11-02', '2026-11-02', '2026-11-10']), 3)
  assert.equal(longestStreak(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-03']), 3)
})

test('야근: 22시~6시', () => {
  assert.deepEqual([21, 22, 23, 0, 5, 6].map(isNightHour), [false, true, true, true, true, false])
})

test('칭호 해금: 받은 업적(ach: 키)에서만 열린다', () => {
  assert.deepEqual(unlockedTitles(new Set()), [])
  assert.deepEqual(unlockedTitles(new Set(['ach:tasks10', 'ach:streak3'])), [])
  const ids = unlockedTitles(new Set(['ach:streak7', 'ach:night5'])).map((x) => x.id)
  assert.deepEqual(ids.sort(), ['attendance', 'owl'])
})

test('사라진 칭호 id·안 열린 칭호는 표시하지 않는다', () => {
  const titles = unlockedTitles(new Set(['ach:streak7']))
  assert.equal(activeTitle('attendance', titles), 'attendance')
  assert.equal(activeTitle('owl', titles), null)
  assert.equal(activeTitle('gone-id', titles), null)
  assert.equal(activeTitle(null, titles), null)
  assert.equal(activeTitle(undefined, titles), null)
})

test('칭호 이름이 사전에 모두 있다 (ko·en·ja·zh), 숨은 업적도 있다', () => {
  const keys = ACHIEVEMENTS.flatMap((a) => (a.title ? [`title.${a.title}`] : []))
  assert.ok(keys.length >= 3)
  for (const k of keys) for (const l of ['ko', 'en', 'ja', 'zh'] as const) assert.ok((DICT as Record<string, Record<string, string>>)[k]?.[l], `${k}.${l}`)
  assert.ok(ACHIEVEMENTS.some((a) => a.hidden))
})

test('옛 저장 데이터 호환: 기존 업적 줄은 hidden·title 없이 그대로', () => {
  for (const id of ['tasks10', 'level20', 'earned20b']) {
    const a = ACHIEVEMENTS.find((x) => x.id === id)!
    assert.equal(a.hidden, undefined)
    assert.equal(a.title, undefined)
  }
})
