// 외관 화면 누르기 판정·골목 이음새 (docs/specs/office-iso-spaces.md 2-2절) — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { artGround, artNeighbors, P, type Pt } from '../src/renderer/map/iso/exteriorArt.ts'
import { dioramaFit, dioramaLayout, isOnOffice, type DioramaLayout } from '../src/renderer/map/exteriorLayout.ts'
import { LEVEL_TABLE, MAX_LEVEL } from '../src/shared/officeLevel.ts'

/** 외관 단계(E1~E7)마다 첫 레벨 */
const STAGE_LEVELS = [...new Set(LEVEL_TABLE.slice(0, MAX_LEVEL).map((r) => r.exterior))].map((e) => LEVEL_TABLE.findIndex((r) => r.exterior === e) + 1)
const LAWN = new Set(['143,207,122', '154,216,132'])
/** 골목 차도 (낮) */
const ROAD = '142,147,168'

const originOf = (L: DioramaLayout): Pt => [L.ox + L.board.o[0], L.oy + L.board.o[1]]

/** 판정에 쓸 점들 (논리 px): 건물 가운데 · 부지 땅 · 이웃 건물 · 잔디 · 큰길 */
function spotsOf(L: DioramaLayout) {
  const { board, body, pin, W, H } = L
  const O = originOf(L)
  const inBody = (x: number, y: number) => x >= body.x && x < body.x + body.w && y >= body.y && y < body.y + body.h
  // 이웃 건물: 부지 위·거리 건너편에 얹힌 이웃 건물 그림의 불투명 픽셀 (건물 사각형 밖)
  let neighbor: Pt | null = null
  for (const layer of ['front', 'side'] as const) {
    const cv = artNeighbors(W, H, false, O, board, layer)
    for (let i = 0; i < W * H && !neighbor; i += 7) if (cv.has(i) && !inBody(i % W, Math.floor(i / W))) neighbor = [i % W + 0.5, Math.floor(i / W) + 0.5]
  }
  return {
    building: [pin.x + 0.5, body.y + body.h / 2] as Pt,
    lot: P(O, 0.3, board.GY - 3.3, 0),
    neighbor,
    // 부지 왼쪽 멀리 잔디 틈(큰길 건너편 인도와 블록 사이) · 큰길 차도
    lawn: P(O, -board.GX, board.GY + 1.25, 0),
    road: P(O, -6, board.GY - 1, 0),
  }
}

test('외관 누르기: 모든 단계에서 내 건물·부지만 들어가고 이웃 건물·잔디·큰길은 반응 없다', () => {
  for (const level of STAGE_LEVELS) {
    const { W, H } = dioramaFit(level, 1440, 900)
    for (const isNight of [false, true]) {
      const L = dioramaLayout(level, isNight, W, H)
      const s = spotsOf(L)
      assert.ok(L.hit(...s.building), `Lv.${level} 건물 가운데`)
      assert.ok(L.hit(...s.lot), `Lv.${level} 부지 땅`)
      assert.ok(s.neighbor, `Lv.${level} 이웃 건물이 화면에 있다`)
      assert.equal(L.hit(...s.neighbor), false, `Lv.${level} 이웃 건물 ${s.neighbor}`)
      assert.equal(L.hit(...s.lawn), false, `Lv.${level} 잔디`)
      assert.equal(L.hit(...s.road), false, `Lv.${level} 큰길`)
    }
  }
})

test('외관 누르기: 화면 px → 논리 px 변환이 배율·축소·잘림에 맞다', () => {
  for (const level of [STAGE_LEVELS[0], STAGE_LEVELS.at(-1)!]) {
    for (const [hostW, hostH] of [
      [1440, 900],
      [700, 500],
    ]) {
      const { W, H, scale } = dioramaFit(level, hostW, hostH)
      const L = dioramaLayout(level, false, W, H)
      const s = spotsOf(L)
      const rects = [
        // 정수 배율 그대로, 가운데 정렬로 왼쪽이 화면 밖으로 잘림
        { left: (hostW - W * scale) / 2 + 120, top: 44, width: W * scale, height: H * scale },
        { left: -37, top: -12, width: W * scale, height: H * scale },
        // CSS로 창보다 작게·크게 늘어난 경우 (배율이 정수가 아님)
        { left: 10, top: 20, width: W * scale * 0.75, height: H * scale * 0.75 },
        { left: -200, top: -90, width: W * scale * 1.6, height: H * scale * 1.6 },
      ]
      for (const r of rects) {
        const client = ([x, y]: Pt): Pt => [r.left + (x * r.width) / W, r.top + (y * r.height) / H]
        const tag = `Lv.${level} ${hostW}×${hostH} 화면 ${r.width}×${r.height}@${r.left},${r.top}`
        assert.ok(isOnOffice(L, r, ...client(s.building)), `${tag} 건물`)
        assert.ok(isOnOffice(L, r, ...client(s.lot)), `${tag} 부지`)
        assert.equal(isOnOffice(L, r, ...client(s.neighbor!)), false, `${tag} 이웃 건물`)
        assert.equal(isOnOffice(L, r, ...client(s.lawn)), false, `${tag} 잔디`)
        assert.equal(isOnOffice(L, r, ...client(s.road)), false, `${tag} 큰길`)
      }
    }
  }
})

test('외관 골목: 모든 단계에서 골목 차도가 큰길 앞 틈·인도를 지나 큰길에 닿는다 (잔디에서 끊기지 않음)', () => {
  for (const level of STAGE_LEVELS) {
    const { W, H } = dioramaFit(level, 1440, 900)
    const L = dioramaLayout(level, false, W, H)
    const O = originOf(L)
    const { GX, GY } = L.board
    const ground = artGround(W, H, false, O, L.board)
    const colorAt = ([x, y]: Pt) => {
      const px = Math.floor(x)
      const py = Math.floor(y)
      return px < 0 || py < 0 || px >= W || py >= H ? null : ground.read(py * W + px).slice(0, 3).join(',')
    }
    let mouths = 0
    // 블록 열 i의 가운데 줄 (골목이면 차도 가운데). 골목은 세 열에 하나
    for (let i = -12; i <= 12; i++) {
      const gx = GX + 0.5 + i * 4 + 1.5
      const at = (gy: number) => colorAt(P(O, gx, gy, 0))
      // 블록 줄(큰길 건너편 GY+2.5 · 큰길 뒤 GY−5)이 골목 차도면 그 어귀(틈·큰길 인도)도 잔디가 아니어야 한다
      for (const [blockGy, mouthGys] of [
        [GY + 2.5, [GY + 1.25, GY + 0.1]],
        [GY - 5, [GY - 3.25, GY - 2.9]],
      ] as const) {
        if (at(blockGy) !== ROAD || mouthGys.some((gy) => at(gy) === null)) continue
        mouths++
        for (const gy of mouthGys) assert.ok(!LAWN.has(at(gy)!), `Lv.${level} 골목 열 ${i} gy=${gy}가 잔디`)
      }
    }
    assert.ok(mouths > 0, `Lv.${level} 화면에 골목 어귀가 하나는 있다`)
  }
})
