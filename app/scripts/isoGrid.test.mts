// 아이소메트릭 칸 좌표 (기술 설계 1-1절) — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TILE_H, TILE_W, miniFocus, toGrid, toWorld } from '../src/shared/iso/grid.ts'

const o = { x: 320, y: 120 }

test('칸 가운데를 세계 좌표로 바꿨다 되돌리면 같은 칸', () => {
  for (const [gx, gy] of [[0, 0], [3, 7], [23, 23], [23, 0], [0, 23]]) {
    const p = toWorld(o, gx + 0.5, gy + 0.5)
    assert.deepEqual(toGrid(o, p.x, p.y), { gx, gy })
  }
})

test('칸 하나는 64×32 마름모: 오른쪽 아래·왼쪽 아래 꼭짓점', () => {
  assert.deepEqual(toWorld(o, 0, 0), o)
  assert.deepEqual(toWorld(o, 1, 0), { x: o.x + TILE_W / 2, y: o.y + TILE_H / 2 })
  assert.deepEqual(toWorld(o, 0, 1), { x: o.x - TILE_W / 2, y: o.y + TILE_H / 2 })
  assert.deepEqual(toWorld(o, 1, 1, 10), { x: o.x, y: o.y + TILE_H - 10 })
})

test('칸 경계: 꼭짓점 바로 안쪽은 그 칸, 바깥은 이웃 칸', () => {
  // (2,3) 칸의 네 꼭짓점 안쪽으로 1px
  const top = toWorld(o, 2, 3)
  assert.deepEqual(toGrid(o, top.x, top.y + 1), { gx: 2, gy: 3 })
  assert.deepEqual(toGrid(o, top.x, top.y - 1), { gx: 1, gy: 2 })
  const right = toWorld(o, 3, 3)
  assert.deepEqual(toGrid(o, right.x - 1, right.y), { gx: 2, gy: 3 })
  assert.deepEqual(toGrid(o, right.x + 1, right.y), { gx: 3, gy: 2 })
  const bottom = toWorld(o, 3, 4)
  assert.deepEqual(toGrid(o, bottom.x, bottom.y - 1), { gx: 2, gy: 3 })
  assert.deepEqual(toGrid(o, bottom.x, bottom.y + 1), { gx: 3, gy: 4 })
  // 바닥 밖(음수 칸)도 계산은 된다 — 범위 판단은 놓기 검사가
  assert.deepEqual(toGrid(o, o.x, o.y - 5), { gx: -1, gy: -1 })
})

test('미니 뷰 기준점: 앞 두 변에 붙은 칸(입구·대기)은 방 안으로 당기고, 안쪽·뒤쪽은 그대로', () => {
  const room = { cols: 13, rows: 13 }
  // 입구 (⌊13/2⌋, 12) 칸 가운데 → 앞 변에서 1.5칸 안
  assert.deepEqual(miniFocus(room, 6.5, 12.5), { x: 6.5, y: 11.5 })
  assert.deepEqual(miniFocus(room, 12.5, 12.5), { x: 11.5, y: 11.5 })
  assert.deepEqual(miniFocus(room, 3.5, 4.5), { x: 3.5, y: 4.5 })
  assert.deepEqual(miniFocus(room, 0.5, 0.5), { x: 0.5, y: 0.5 })
  // 아주 작은 방은 가운데를 넘어 당기지 않는다
  assert.deepEqual(miniFocus({ cols: 2, rows: 2 }, 1.5, 1.5), { x: 1, y: 1 })
})
