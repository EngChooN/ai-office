// 전부 치우기·되돌리기·다시 깔리지 않음 (사무실 가구 전부 치우기 기획서 요구 3~5)

import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { drawerCount, type ShopState } from '../src/shared/economy.ts'
import { stowTargets } from '../src/shared/iso/stowTargets.ts'
import { runIsoMigration, runLevelGrants } from '../src/main/isoMigrate.ts'
import { restoreGrid, settleGrid, stowAll } from '../src/main/shopGrid.ts'

const LEVEL = 8

function setup() {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  runIsoMigration(db, { level: 1 })
  runLevelGrants(db, 1)
  // 실제 앱처럼 레벨이 오른 뒤 평면에 맞게 정리한 저장분
  const shop = settleGrid(runLevelGrants(db, LEVEL)!, LEVEL).shop
  return { db, shop }
}
const keys = (db: DatabaseSync) => (db.prepare("SELECT key FROM setting WHERE key LIKE '%grant:%' ORDER BY key").all() as { key: string }[]).map((r) => r.key)
const isSeat = (itemId: string) => /desk|chair/.test(itemId)
const dump = (shop: ShopState) => JSON.stringify([...shop.grid].sort((a, b) => a.uid.localeCompare(b.uid)))

test('전부 치우기: 건물 전체(자리 포함)면 grid가 비고 서랍 개수가 놓였던 만큼 늘고, owned·gear는 그대로', () => {
  const { shop } = setup()
  assert.ok(shop.grid.length > 0)
  const before = Object.fromEntries(Object.keys(shop.owned).map((id) => [id, drawerCount(shop, id)]))
  const r = stowAll(shop, null, false)
  assert.equal(r.shop.grid.length, 0)
  assert.equal(r.stowed.length, shop.grid.length)
  for (const id of Object.keys(shop.owned)) assert.equal(drawerCount(r.shop, id), before[id] + shop.grid.filter((g) => g.itemId === id).length, id)
  assert.deepEqual(r.shop.owned, shop.owned)
  assert.deepEqual(r.shop.gear, shop.gear)
})

test('전부 치우기: 직원 자리 남기기·이 층만 범위를 지킨다', () => {
  const { shop } = setup()
  const keep = stowAll(shop, null, true)
  assert.ok(keep.stowed.every((g) => !isSeat(g.itemId)))
  assert.ok(keep.shop.grid.length > 0 && keep.shop.grid.every((g) => isSeat(g.itemId)))
  assert.equal(stowTargets(shop.grid, null, true).length, keep.stowed.length)
  const f1 = stowAll(shop, 1, false)
  assert.ok(f1.shop.grid.every((g) => g.floor !== 1))
  assert.equal(f1.shop.grid.length, shop.grid.filter((g) => g.floor !== 1).length)
  // 치울 게 없으면 그대로
  assert.equal(stowAll(f1.shop, 1, false).shop, f1.shop)
})

test('되돌리기: 치우기 전 배치와 똑같아진다', () => {
  const { shop } = setup()
  const r = stowAll(shop, null, false)
  assert.equal(dump(restoreGrid(r.shop, LEVEL, r.stowed)), dump(shop))
  // 일부만 치웠을 때도
  const part = stowAll(shop, null, true)
  assert.equal(dump(restoreGrid(part.shop, LEVEL, part.stowed)), dump(shop))
})

test('다시 깔리지 않음: 치운 뒤 몇 번 켜도 레벨·구역 지급이 다시 돌지 않고 지급 기록은 그대로', () => {
  const { db, shop } = setup()
  const grants = keys(db)
  assert.ok(grants.some((k) => k.startsWith('zonegrant:')) && grants.some((k) => k.startsWith('levelgrant:')))
  const r = stowAll(shop, null, false)
  db.prepare("UPDATE setting SET value = ? WHERE key = 'shop'").run(JSON.stringify(r.shop))
  for (let i = 0; i < 3; i++) assert.equal(runLevelGrants(db, LEVEL), null)
  assert.deepEqual(JSON.parse((db.prepare("SELECT value FROM setting WHERE key = 'shop'").get() as { value: string }).value), r.shop)
  assert.deepEqual(keys(db), grants)
})
