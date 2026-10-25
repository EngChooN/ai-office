// 외관 땅 한 판 (docs/specs/office-iso-spaces.md 2-2절) — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { artExteriorBoard, FH } from '../src/renderer/map/iso/exteriorArt.ts'
import { MAX_LEVEL } from '../src/shared/officeLevel.ts'

test('외관: 모든 레벨에서 건물이 땅 판 그림 안에 있고, 출입문 앞면은 건물 그림 위다', () => {
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const { cv, building: b, door } = artExteriorBoard(level, false)
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.cv.w <= cv.w && b.y + b.cv.h <= cv.h, `Lv.${level} 건물이 판 밖으로 나감`)
    // 문 앞면 가운데(높이 절반)를 누르면 건물이다 = 들어가기 판정이 문에서 된다
    const x = Math.round((door[0][0] + door[2][0]) / 2) - b.x
    const y = Math.round((door[0][1] + door[2][1]) / 2) - b.y
    assert.ok(b.cv.has(y * b.cv.w + x), `Lv.${level} 문이 건물 그림 위에 없음`)
  }
})

test('외관: 층수만큼 건물이 높아진다 (평면을 층마다 쌓음)', () => {
  const height = (level: number) => artExteriorBoard(level, false).building.cv.h
  assert.ok(height(6) - height(5) > FH / 2, '2층이 생기면 높아진다')
  assert.ok(height(18) > height(14), '5층 > 4층')
})
