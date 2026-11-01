// 코치마크 설명 상자 자리: 폭 min(340, 화면-24), 오른쪽→왼쪽→아래→위, 언제나 화면 안 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isVisibleBox, placeTip, tipWidth, TIP_MARGIN } from '../src/renderer/features/coachTip.ts'

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height })
const isInside = (p: { left: number; top: number; width: number }, h: number, w: number, vh: number) =>
  p.left >= TIP_MARGIN && p.top >= TIP_MARGIN && p.left + p.width <= w - TIP_MARGIN && p.top + h <= vh - TIP_MARGIN

test('폭은 340을 넘지 않고, 좁은 화면에서는 양옆 12px씩 남긴다', () => {
  assert.equal(tipWidth(1280), 340)
  assert.equal(tipWidth(390), 340)
  assert.equal(tipWidth(320), 296)
})

test('PC: 사이드바 메뉴는 오른쪽에 둔다', () => {
  const p = placeTip(box(0, 200, 180, 36), 220, 1280, 800)
  assert.equal(p.left, 180 + 14)
  assert.equal(p.top, 200)
})

test('PC: 오른쪽 끝 버튼은 왼쪽에 두되 위아래로 화면 밖에 나가지 않는다', () => {
  const p = placeTip(box(1180, 700, 90, 32), 220, 1280, 800)
  assert.equal(p.left, 1180 - 14 - 340)
  assert.ok(isInside(p, 220, 1280, 800))
})

test('폰 폭 390: 맨 아래 탭은 위쪽에 두고 화면 안에 들어온다', () => {
  const tab = box(100, 844 - 64, 78, 56)
  const p = placeTip(tab, 260, 390, 844)
  assert.ok(p.top + 260 <= tab.top - 14, '탭 위에 있어야 한다')
  assert.ok(isInside(p, 260, 390, 844))
})

test('폰 폭 390: 맨 위 버튼은 아래에 둔다', () => {
  const hire = box(340, 8, 40, 40)
  const p = placeTip(hire, 260, 390, 844)
  assert.equal(p.top, 8 + 40 + 14)
  assert.ok(isInside(p, 260, 390, 844))
})

test('대상이 화면을 거의 다 덮어도 상자는 화면 안 (버튼이 보이게)', () => {
  const p = placeTip(box(0, 40, 390, 780), 260, 390, 844)
  assert.ok(isInside(p, 260, 390, 844))
})

test('대상이 없으면 가운데', () => {
  const p = placeTip(null, 200, 1000, 800)
  assert.equal(p.left, (1000 - 340) / 2)
  assert.equal(p.top, 300)
})

test('상자가 화면보다 높으면 위 여백에 붙인다 (상자 안에서 스크롤)', () => {
  const p = placeTip(null, 900, 390, 600)
  assert.equal(p.top, TIP_MARGIN)
})

test('크기 0인 숨은 요소는 보이지 않는 것으로 친다', () => {
  assert.equal(isVisibleBox({ width: 0, height: 0 }), false)
  assert.equal(isVisibleBox({ width: 80, height: 0 }), false)
  assert.equal(isVisibleBox({ width: 80, height: 32 }), true)
})
