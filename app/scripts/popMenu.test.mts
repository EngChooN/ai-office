// 분할 화면 ＋·⋯ 메뉴: 스크롤 상자·좁은 칸에 잘리지 않게 body에 고정 위치로 띄우고, 눌러도 입력칸 포커스를 빼앗지 않는다 — npm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { MENU_WIDTH, menuPosition } from '../src/renderer/lib/menuPosition.ts'

const view = { width: 900, height: 700 }

test('위로 열면 버튼 바로 위에 붙고, 버튼 위 남은 높이로 줄어든다', () => {
  const pos = menuPosition({ top: 600, bottom: 636, left: 220 }, 'up', view)
  assert.equal(pos.bottom, 700 - 600 + 4)
  assert.equal(pos.left, 220)
  assert.equal(pos.maxHeight, 700 * 0.6)
  assert.equal(menuPosition({ top: 120, bottom: 156, left: 220 }, 'up', view).maxHeight, 120 - 4 - 8)
})

test('아래로 열면 버튼 바로 아래에 붙고, 아래 남은 높이로 줄어든다', () => {
  const pos = menuPosition({ top: 10, bottom: 46, left: 160 }, 'down', view)
  assert.equal(pos.top, 50)
  assert.equal(pos.maxHeight, 700 * 0.6)
  assert.equal(menuPosition({ top: 500, bottom: 536, left: 160 }, 'down', view).maxHeight, 700 - 536 - 4 - 8)
})

test('200px 왼쪽 칸 끝의 ⋯도 화면 안에 들어오고, 화면 오른쪽 끝이면 왼쪽으로 당긴다', () => {
  assert.equal(menuPosition({ top: 10, bottom: 46, left: 160 }, 'down', view).left, 160)
  const nearRight = menuPosition({ top: 10, bottom: 46, left: 880 }, 'down', view)
  assert.equal(nearRight.left, 900 - MENU_WIDTH - 8)
  assert.equal(menuPosition({ top: 10, bottom: 46, left: -20 }, 'down', view).left, 8)
})

test('PopMenu는 body 포털·고정 위치로 띄우고, 버튼을 눌러도 포커스를 옮기지 않는다', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '../src/renderer/components/pop-menu.tsx'), 'utf8')
  assert.match(src, /createPortal\(/)
  assert.match(src, /document\.body/)
  assert.match(src, /\bfixed\b/)
  assert.doesNotMatch(src, /bottom-full|top-full/)
  assert.match(src, /onMouseDown=\{keepFocus\}/)
})
