// 업적 'items'·'sets'는 레벨 기본 지급(무료)을 빼고 센다 (한리뷰 3라운드 낮음 지적) — pnpm test
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { earnedOwned, grantedCounts, isSetComplete, LEVEL_GRANTS, type ShopSet } from '../src/shared/economy.ts'
import { grantedLevels, levelGrantKey } from '../src/main/isoMigrate.ts'

const count = (owned: Record<string, number>) => Object.keys(owned).length

test('무료 지급만 있는 품목은 물건 N종에 들지 않는다', () => {
  const granted = grantedCounts([1, 2, 3])
  const owned = { ...LEVEL_GRANTS[1], ...LEVEL_GRANTS[2], ...LEVEL_GRANTS[3], desk: 1 }
  assert.deepEqual(earnedOwned(owned, granted), { desk: 1 })
  assert.equal(count(earnedOwned(owned, granted)), 1)
})

test('지급받은 품목을 따로 더 사면 그 품목은 센다 (사고 나서 지급받아도 같다)', () => {
  // 화이트보드: Lv.4 지급 1개 + 상점에서 산 1개
  const granted = grantedCounts([1, 4])
  assert.equal(earnedOwned({ whiteboard: 2 }, granted).whiteboard, 1)
  assert.equal(earnedOwned({ whiteboard: 1 }, granted).whiteboard, undefined)
  // 아직 지급 전이면 산 것만 있다
  assert.equal(earnedOwned({ whiteboard: 1 }, grantedCounts([1])).whiteboard, 1)
})

test('세트: 무료 지급분만으로 채운 세트·섞어 채운 세트는 완성이 아니다, 모두 직접 산 것이면 완성', () => {
  const set: ShopSet = { id: 't', name: '시험 세트', emoji: '🧪', itemIds: ['lv-meeting-table', 'whiteboard', 'desk'], reward: 1 }
  const granted = grantedCounts([3, 4])
  // 전부 지급분
  assert.equal(isSetComplete(set, earnedOwned({ 'lv-meeting-table': 1, whiteboard: 1 }, granted)), false)
  // 지급분 + 산 것 섞음
  assert.equal(isSetComplete(set, earnedOwned({ 'lv-meeting-table': 1, whiteboard: 2, desk: 1 }, granted)), false)
  // 품목마다 지급분을 넘는 산 것이 있으면 완성
  assert.equal(isSetComplete(set, earnedOwned({ 'lv-meeting-table': 2, whiteboard: 2, desk: 1 }, granted)), true)
  // 지급을 빼지 않으면 예전처럼 완성으로 잡혔다
  assert.equal(isSetComplete(set, { 'lv-meeting-table': 1, whiteboard: 1, desk: 1 }), true)
})

test('받은 레벨은 levelgrant:{n} 키에서 읽는다', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT)')
  const insert = db.prepare('INSERT INTO setting (key, value) VALUES (?, ?)')
  for (const lv of [1, 4, 10]) insert.run(levelGrantKey(lv), '{}')
  insert.run('companyLevelMax', '12')
  insert.run('levelgrant:x', '{}')
  assert.deepEqual(grantedLevels(db).sort((a, b) => a - b), [1, 4, 10])
  assert.deepEqual(grantedCounts(grantedLevels(db)).whiteboard, 1)
})
