// 메뉴 묶음: View → 묶음, 묶음 배지 합, 업무 모드 숨김, 마지막 탭 기억, 투어 대상 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GAME_VIEWS, NAV_GROUP_DEFS, groupBadge, groupEntryView, groupOfView, rememberTab, tourTarget, visibleGroups, visibleTabs } from '../src/renderer/features/navGroups.ts'

const ALL_VIEWS = ['secretary', 'map', 'dashboard', 'org', 'board', 'inbox', 'chat', 'meeting', 'manuals', 'knowledge', 'gallery', 'schedule', 'report', 'payroll', 'settings', 'updates', 'shop'] as const
const group = (id: string) => NAV_GROUP_DEFS.find((g) => g.id === id)!

test('사이드바는 10개 묶음, 모든 화면이 정확히 한 묶음에 들어 있다', () => {
  assert.deepEqual(
    NAV_GROUP_DEFS.map((g) => g.id),
    ['secretary', 'map', 'staff', 'work', 'inbox', 'talk', 'knowhow', 'records', 'shop', 'config'],
  )
  for (const v of ALL_VIEWS) assert.equal(NAV_GROUP_DEFS.filter((g) => g.tabs.some((x) => x.view === v)).length, 1, v)
})

test('View에서 묶음 찾기', () => {
  assert.equal(groupOfView(NAV_GROUP_DEFS, 'payroll')?.id, 'records')
  assert.equal(groupOfView(NAV_GROUP_DEFS, 'meeting')?.id, 'talk')
  assert.equal(groupOfView(NAV_GROUP_DEFS, 'chat')?.id, 'talk')
  assert.equal(groupOfView(NAV_GROUP_DEFS, 'updates')?.id, 'config')
  assert.equal(groupOfView(NAV_GROUP_DEFS, 'gallery')?.id, 'work')
  assert.equal(groupOfView(NAV_GROUP_DEFS, 'org')?.id, 'staff')
  assert.equal(groupOfView(NAV_GROUP_DEFS, 'inbox')?.id, 'inbox')
})

test('묶음 배지는 탭 배지의 합 (회의실 배지는 대화 묶음에)', () => {
  const badges = { inbox: 3, meeting: 2, board: 4, shop: 1 }
  assert.equal(groupBadge(group('talk'), badges, false), 2)
  assert.equal(groupBadge(group('work'), badges, false), 4)
  assert.equal(groupBadge(group('inbox'), badges, false), 3)
  assert.equal(groupBadge(group('records'), badges, false), 0)
  assert.equal(groupBadge(group('talk'), { chat: 1, meeting: 2 }, false), 3)
  // 업무 모드에선 상점 배지를 세지 않는다
  assert.equal(groupBadge(group('shop'), badges, true), 0)
})

test('업무 모드: 사무실·상점 묶음을 빼고, 다른 묶음 탭은 그대로', () => {
  const ids = visibleGroups(NAV_GROUP_DEFS, true).map((g) => g.id)
  assert.ok(!ids.includes('map') && !ids.includes('shop'))
  assert.equal(ids.length, 8)
  assert.equal(visibleGroups(NAV_GROUP_DEFS, false).length, 10)
  for (const g of NAV_GROUP_DEFS) for (const x of visibleTabs(g, true)) assert.ok(!GAME_VIEWS.has(x.view))
})

test('묶음을 누르면 마지막으로 본 탭, 처음이면 첫 탭', () => {
  let last = rememberTab({}, NAV_GROUP_DEFS, 'payroll')
  assert.equal(groupEntryView(group('records'), last, false), 'payroll')
  assert.equal(groupEntryView(group('talk'), last, false), 'chat')
  last = rememberTab(last, NAV_GROUP_DEFS, 'meeting')
  assert.equal(groupEntryView(group('talk'), last, false), 'meeting')
  assert.equal(groupEntryView(group('records'), last, false), 'payroll')
  // 같은 화면이면 같은 객체
  assert.equal(rememberTab(last, NAV_GROUP_DEFS, 'meeting'), last)
})

test('투어 대상: 묶음 안 화면은 탭 → 묶음 순, 탭 하나짜리는 그 메뉴', () => {
  assert.equal(tourTarget(NAV_GROUP_DEFS, 'meeting'), 'nav-meeting|nav-talk')
  assert.equal(tourTarget(NAV_GROUP_DEFS, 'settings'), 'nav-settings|nav-config')
  assert.equal(tourTarget(NAV_GROUP_DEFS, 'inbox'), 'nav-inbox')
  assert.equal(tourTarget(NAV_GROUP_DEFS, 'map'), 'nav-map')
})
