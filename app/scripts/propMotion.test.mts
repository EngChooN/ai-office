// 소품 연출 공통 규칙 (shared/iso/propMotion.ts) + B 켜짐 저장 (main/shopGrid.ts) — 연출④-3
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { EMPTY_SHOP, shopItem, type ShopState } from '../src/shared/economy.ts'
import { specOf } from '../src/shared/iso/furniture.ts'
import { InvalidArgsError } from '../src/shared/errors.ts'
import { HH, HW } from '../src/shared/iso/grid.ts'
import {
  enterClipOf,
  isBeside,
  isToggleable,
  loopFrame,
  pickNearest,
  PROP_MOTION,
  sheetFrameOf,
  sheetsFor,
  stateOf,
  stillFrameOf,
  triggerFrame,
  workersOf,
  type MotionKind,
  type MotionSheet,
} from '../src/shared/iso/propMotion.ts'
import { moveGridItem, restoreGrid, setGridItemOn } from '../src/main/shopGrid.ts'

const MANIFEST = JSON.parse(fs.readFileSync(new URL('../src/renderer/map/iso/motion/manifest.json', import.meta.url), 'utf8')) as Record<string, MotionSheet> & { scale: number }
const sheet = (id: string) => MANIFEST[id]

/** 종류마다 시트에 꼭 있어야 하는 상태 클립 */
const NEEDED: Partial<Record<MotionKind, string[]>> = { A: ['loop'], B: ['off', 'on'], C: ['idle', 'use'], D: ['off', 'work'], G: ['day', 'night'] }

test('상품 표: 시트가 있고, 종류별 클립이 있고, 칸 크기가 그 상품 크기와 맞는다 (같은 시트를 함께 쓰는 상품 포함)', () => {
  for (const [itemId, m] of Object.entries(PROP_MOTION)) {
    const s = sheet(m.sheet)
    assert.ok(s, `${itemId}: 시트 ${m.sheet}`)
    assert.ok(fs.existsSync(new URL(`../src/renderer/map/iso/motion/${s.file}`, import.meta.url)), `${s.file} 파일`)
    for (const k of m.kinds) for (const clip of NEEDED[k] ?? []) assert.ok(s.clips[clip], `${itemId} ${k}: ${clip} 클립`)
    const spec = specOf(itemId)
    // 칸 가로 = (w+d)×HW + 6 아트 px (가이드 3절) — 크기가 다른 상품에 시트를 붙이면 어긋난다
    const [w, d] = spec.size
    assert.equal(s.cell[0], (w + d) * HW + 6, `${itemId}: 칸 가로`)
    assert.ok(s.cell[1] >= (w + d) * HH + 6, `${itemId}: 칸 세로`)
    assert.equal(s.rowFrames.length, s.anchors.length)
  }
  assert.ok(shopItem('tv'), 'TV는 상점 상품')
})

test('바탕 상태: 상태 종류(B·C·D·G)가 A보다 먼저, 순간 종류만이면 멈춘 그림', () => {
  assert.equal(stateOf(['A'], {}), 'loop')
  assert.equal(stateOf(['B'], {}), 'off', '저장된 상태가 없으면 꺼짐')
  assert.equal(stateOf(['B', 'F'], { isOn: true }), 'on')
  assert.equal(stateOf(['A', 'C'], { isUsed: true }), 'use')
  assert.equal(stateOf(['A', 'G'], { isNight: true }), 'night')
  assert.equal(stateOf(['E'], {}), null)
})

test('겹친 종류: 켜 둔 B가 이기고, 꺼 둔 B는 C·D·G를 따른다 (자동 켜짐은 isOn이 아니다)', () => {
  const lamp = PROP_MOTION['floor-lamp'].kinds
  const jukebox = PROP_MOTION.jukebox.kinds
  // B가 꺼진 상태에서 밤이면 켜짐 (스탠드·아크 조명·네온)
  for (const id of ['floor-lamp', 'arc-lamp', 'neon-sign']) assert.equal(stateOf(PROP_MOTION[id].kinds, { isNight: true }), 'night', id)
  assert.equal(stateOf(lamp, {}), 'day')
  // B가 꺼진 상태에서 직원이 쓰면 켜짐 (주크박스·오락기·자판기·피아노)
  for (const id of ['jukebox', 'arcade', 'lv-vending', 'piano']) assert.equal(stateOf(PROP_MOTION[id].kinds, { isUsed: true }), 'use', id)
  assert.equal(stateOf(jukebox, {}), 'idle')
  // B가 켜진 상태면 낮이어도·아무도 안 써도 켜짐 유지
  assert.equal(stateOf(lamp, { isOn: true, isNight: false }), 'on')
  assert.equal(stateOf(jukebox, { isOn: true, isUsed: false }), 'on')
  // 넘겨받을 C·D·G가 없으면 그대로 꺼짐 (A는 받지 않는다)
  assert.equal(stateOf(PROP_MOTION.aquarium.kinds, {}), 'off')
  // 자동 켜짐 그림도 시트에 있다 — 움직임 줄이기 때 상태별 한 장
  assert.equal(stillFrameOf(sheet('floor-lamp'), 'night'), stillFrameOf(sheet('floor-lamp'), 'on'))
  assert.equal(stillFrameOf(sheet('jukebox'), 'use'), stillFrameOf(sheet('jukebox'), 'on'))
  // 쉬는 상태에서 손으로 켜면 켜는 순간 장, 자동으로 켜진 뒤 켜면 없음
  assert.equal(enterClipOf(sheet('floor-lamp'), 'day', 'on'), 'turnOn')
  assert.equal(enterClipOf(sheet('jukebox'), 'idle', 'on'), 'turnOn')
  assert.equal(enterClipOf(sheet('floor-lamp'), 'night', 'on'), null)
})

test('켜는 순간 클립은 켤 때만 (끌 때는 바로 꺼짐 장), 처음 붙일 때는 없음', () => {
  const tv = sheet('tv')
  assert.equal(enterClipOf(tv, 'off', 'on'), 'turnOn')
  assert.equal(enterClipOf(tv, 'on', 'off'), null)
  assert.equal(enterClipOf(tv, null, 'on'), null)
  assert.equal(enterClipOf(sheet('coffee-machine'), 'idle', 'use'), null, '시트에 없는 클립')
})

test('반복 프레임·움직임 줄이기 한 장·짧은 행(TV 뒷면)', () => {
  const f = sheet('lv-fountain')
  assert.deepEqual([0, 499, 500, 2999, 3000].map((t) => loopFrame(f.clips.loop, t)), [0, 0, 1, 5, 0])
  assert.equal(stillFrameOf(f, 'loop'), 0)
  const tv = sheet('tv')
  assert.equal(stillFrameOf(tv, 'off'), 0)
  assert.equal(stillFrameOf(tv, 'on'), 2)
  assert.equal(stillFrameOf(sheet('coffee-machine'), 'use'), 1)
  // r0: 0행, r1: 1행(1장뿐) — 켜짐 프레임 3은 그 행에 없어 0번 칸
  assert.equal(sheetFrameOf(tv, 0, 3), 3)
  assert.equal(sheetFrameOf(tv, 1, 3), tv.cols)
  assert.equal(sheetFrameOf(tv, 3, 3), 3 * tv.cols + 3)
  assert.equal(sheetFrameOf(f, 2, 4), 4, '분수는 네 방향이 한 행')
})

test('동시 동작 상한: 넘치면 가운데에서 가까운 것부터', () => {
  const cands = Array.from({ length: 6 }, (_, i) => ({ id: i, x: i * 10, y: 0 }))
  assert.deepEqual(
    pickNearest(cands, { x: 31, y: 0 }, 3).map((c) => c.id),
    [3, 4, 2],
  )
  assert.equal(pickNearest(cands, { x: 0, y: 0 }, 10).length, 6)
})

test('시트는 이 층에 놓인 상품 것만 (같은 시트는 한 번)', () => {
  assert.deepEqual([...sheetsFor(['fern', 'prop-fountain', 'lv-fountain', 'tv'])].sort(), ['lv-fountain', 'tv'])
  assert.equal(sheetsFor(['fern', 'desk']).size, 0)
})

test('B 켜짐 저장: shop.grid에 남고, 옮기기·되돌리기에도 따라가고, B가 아니면 거절', () => {
  const tv = { uid: 'tv1', itemId: 'tv', floor: 1, gx: 1, gy: 1, rot: 0 as const }
  let shop: ShopState = { ...EMPTY_SHOP, owned: { tv: 1, fern: 1 }, grid: [tv, { uid: 'f1', itemId: 'fern', floor: 1, gx: 5, gy: 5, rot: 0 }] }
  assert.equal(isToggleable('tv'), true)
  assert.equal(isToggleable('fern'), false)
  shop = setGridItemOn(shop, 'tv1', true)
  assert.equal(shop.grid[0].isOn, true)
  shop = moveGridItem(shop, 5, 'tv1', 1, 2, 3, 1)
  assert.equal(shop.grid[0].isOn, true, '옮겨도 켜짐 그대로')
  // 전부 치우기 되돌리기: 켜짐도 다시 놓는다 (B가 아닌 가구의 isOn은 버린다)
  const restored = restoreGrid({ ...shop, grid: [] }, 5, [shop.grid[0], { ...shop.grid[1], isOn: true }])
  assert.equal(restored.grid.find((g) => g.uid === 'tv1')?.isOn, true)
  assert.equal(restored.grid.find((g) => g.uid === 'f1')?.isOn, undefined)
  shop = setGridItemOn(shop, 'tv1', false)
  assert.equal('isOn' in shop.grid[0], false, '꺼짐은 필드를 지운다')
  assert.throws(() => setGridItemOn(shop, 'f1', true), InvalidArgsError)
  assert.throws(() => setGridItemOn(shop, 'nope', true), InvalidArgsError)
  assert.throws(() => setGridItemOn(shop, 'tv1', 'yes' as unknown as boolean), InvalidArgsError)
})

test('순간 종류: E는 한 번, F는 1초 간격 3번, 사이·끝난 뒤는 바탕 그림(null)', () => {
  const clip = { frames: [7, 8], ms: 100 }
  assert.deepEqual([0, 150, 200].map((t) => triggerFrame(clip, 'E', t)), [7, 8, null])
  assert.deepEqual([0, 199, 500, 1000, 2150, 3000].map((t) => triggerFrame(clip, 'F', t)), [7, 8, null, 7, 8, null])
  assert.equal(triggerFrame({ frames: [0] }, 'F', 0), null, '한 장짜리는 재생하지 않는다')
})

test('E 지나가면: 가구 바로 옆 칸(대각선 포함)만, 가구 칸 위·두 칸 밖은 아니다', () => {
  // 2×1 가구 (gx 3~4, gy 5)
  const tv = { itemId: 'tv', gx: 3, gy: 5, rot: 0 as const }
  const [w, d] = specOf('tv').size
  assert.deepEqual([w, d], [2, 1])
  assert.equal(isBeside(tv, { gx: 2, gy: 4 }), true)
  assert.equal(isBeside(tv, { gx: 5, gy: 6 }), true)
  assert.equal(isBeside(tv, { gx: 4, gy: 5 }), false)
  assert.equal(isBeside(tv, { gx: 6, gy: 5 }), false)
})

test('D 업무 상태: 자리가 그 가구를 바라보는 직원, 아무도 없으면 이 층 전체', () => {
  const desk = { itemId: 'tv', gx: 3, gy: 5, rot: 0 as const }
  // r0은 gy+1을 바라본다 (FACE_STEP)
  const owner = { id: 'a', seat: { gx: 4, gy: 4, face: 0 as const } }
  const other = { id: 'b', seat: { gx: 0, gy: 0, face: 0 as const } }
  const standing = { id: 'c', seat: null }
  assert.deepEqual(workersOf(desk, [owner, other, standing]).map((s) => s.id), ['a'])
  assert.deepEqual(workersOf(desk, [other, standing]).map((s) => s.id), ['b', 'c'], '공용 가구')
})
