// 파티션·가벽 (docs/specs/partition-items.md · 파티션-3): 상품·규격, 길막음, 높은 가벽 반투명
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shopItem } from '../src/shared/economy.ts'
import { cellsOf, specOf, type GridItem } from '../src/shared/iso/furniture.ts'
import { buildWalkMap, findPath } from '../src/shared/iso/path.ts'
import { canPlace, fixedTilesFor, type FloorState } from '../src/shared/iso/place.ts'
import { hidesMover } from '../src/shared/iso/depth.ts'
import { PROP_MOTION } from '../src/shared/iso/propMotion.ts'

const IDS = { 'partition-low-fabric': [2, false], 'partition-low-glass': [3, false], 'partition-wall-white': [1, true], 'partition-wall-wood': [3, true] } as const

test('상품: 상점에서 팔고(가격·해금), 일자형 크기, 높은 것만 가벽, 회전하면 1×L, 연출 표에는 없다(움직이지 않음)', () => {
  for (const [id, [L, isTall]] of Object.entries(IDS)) {
    const item = shopItem(id)
    assert.ok(item && item.category === 'furniture' && item.price > 0 && item.minLevel >= 2, id)
    const s = specOf(id)
    assert.deepEqual([s.size, s.layer, s.kind, s.spots], [[L, 1], 'object', 'deco', undefined], id)
    assert.equal(Boolean(s.isTallWall), isTall, id)
    assert.equal(cellsOf({ itemId: id, gx: 0, gy: 0, rot: 1 }).every((c) => c.gx === 0), true, `${id} 회전`)
    assert.equal(PROP_MOTION[id], undefined)
  }
})

const room = { cols: 10, rows: 10 }
// 회의실 (6..9, 0..2)·문 (7,2), 출입구 (5,9)
const fixed = fixedTilesFor(room, { meetingCapacity: 8, hasStairs: false })
let n = 0
const it = (itemId: string, gx: number, gy: number, rot: 0 | 1 | 2 | 3 = 0): GridItem => ({ uid: `p${++n}`, itemId, floor: 1, gx, gy, rot })
const floorOf = (items: GridItem[]): FloorState => ({ level: 3, floor: 1, items, room, fixed })

test('길막음: 파티션 칸은 지나가지 못하고 돌아간다 (낮은 것도)', () => {
  const m = buildWalkMap(room, [it('partition-low-glass', 2, 5)])
  const path = findPath(m, { gx: 3, gy: 7 }, { gx: 3, gy: 3 })!
  assert.ok(path)
  assert.ok(path.every((c) => !(c.gy === 5 && c.gx >= 2 && c.gx <= 4)), '파티션 칸을 밟지 않는다')
  assert.ok(path.length > 4, '돌아서 간다')
})

test('길막음: 출입구에서 자리로 가는 길을 완전히 막으면 거부, 틈을 두면 놓인다', () => {
  // y=6 줄: 원목 가벽 3칸 ×3 (x 0..8) — x=9만 남으면 지나가고, 마지막 칸을 가벽으로 막으면 위쪽 의자(2,2)에 못 간다
  const chair = it('chair', 2, 2)
  const walls = [0, 3, 6].map((x) => it('partition-wall-wood', x, 6))
  assert.equal(canPlace(floorOf([chair, ...walls.slice(0, 2)]), walls[2]).ok, true)
  const r = canPlace(floorOf([chair, ...walls]), { itemId: 'partition-wall-white', gx: 9, gy: 6, rot: 0 })
  assert.equal((r as { reason: string }).reason, 'blocks_path')
  // 세로로 돌려 놓으면 막지 않는다
  assert.equal(canPlace(floorOf([chair, ...walls.slice(0, 2)]), { itemId: 'partition-low-fabric', gx: 8, gy: 7, rot: 1 }).ok, true)
})

test('가려짐: 높은 가벽 뒤(−y)에 선 직원만 반투명, 앞이나 옆은 그대로', () => {
  // 원목 가벽 3×1 (gx 2..5, gy 5) — isoArt dividerWall의 상자: 칸 가운데 0.18칸 두께, 40px
  const wall = { x: 2.02, y: 5.41, w: 2.96, d: 0.18, z: 0, h: 40 }
  const person = (x: number, y: number) => ({ x: x - 0.18, y: y - 0.18, w: 0.36, d: 0.36, z: 0, h: 24 })
  assert.equal(hidesMover(wall, [person(3.5, 4.5)]), true, '뒤 칸')
  assert.equal(hidesMover(wall, [person(3.5, 6.5)]), false, '앞 칸')
  assert.equal(hidesMover(wall, [person(8.5, 4.5)]), false, '멀리 옆')
})
