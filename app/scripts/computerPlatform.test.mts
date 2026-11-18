// 윈도우 화면 캡처·컴퓨터 조작 맥·윈도우 번갈아 가정 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computerVerdict, isComputerSupported } from '../src/shared/computerTools.ts'
import { captureScreenPng, physicalSize, type CaptureDeps } from '../src/main/screenCaptureCore.ts'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

test('컴퓨터 조작 장비는 맥·윈도우에서 쓰고 리눅스는 뺀다', () => {
  assert.equal(isComputerSupported('darwin'), true)
  assert.equal(isComputerSupported('win32'), true)
  assert.equal(isComputerSupported('linux'), false)
})

test('결재 규칙은 맥·윈도우 같다: 스크린샷·커서 위치만 결재 없이, 나머지는 결재함', () => {
  for (const platform of ['darwin', 'win32']) {
    assert.ok(isComputerSupported(platform))
    const tool = 'mcp__office-computer__computer'
    for (const action of ['get_screenshot', 'get_cursor_position']) assert.equal(computerVerdict(tool, { action }), 'allow')
    for (const action of ['mouse_move', 'left_click', 'type', 'key', 'scroll', 'left_click_drag', 'new_action']) assert.equal(computerVerdict(tool, { action }), 'wait')
    assert.equal(computerVerdict(tool, {}), 'wait')
    assert.equal(computerVerdict('Bash', { action: 'get_screenshot' }), null)
  }
})

test('화면 배율(DPI)을 곱한 실제 크기로 찍는다 (맥 2배·윈도우 1·1.25·1.5배)', () => {
  assert.deepEqual(physicalSize({ width: 1440, height: 900, scaleFactor: 2 }), { width: 2880, height: 1800 })
  assert.deepEqual(physicalSize({ width: 1920, height: 1080, scaleFactor: 1 }), { width: 1920, height: 1080 })
  assert.deepEqual(physicalSize({ width: 1536, height: 864, scaleFactor: 1.25 }), { width: 1920, height: 1080 })
  assert.deepEqual(physicalSize({ width: 1707, height: 960, scaleFactor: 1.5 }), { width: 2561, height: 1440 })
  assert.deepEqual(physicalSize({ width: 800, height: 600, scaleFactor: 0 }), { width: 800, height: 600 })
})

function fakeDeps(platform: 'darwin' | 'win32', over: Partial<{ ids: string[]; png: Buffer }> = {}): CaptureDeps & { asked: { width: number; height: number }[] } {
  const asked: { width: number; height: number }[] = []
  const scale = platform === 'win32' ? 1.5 : 2
  return {
    asked,
    primary: () => ({ id: '2', width: 1000, height: 500, scaleFactor: scale }),
    async sources(size) {
      asked.push(size)
      return (over.ids ?? ['1', '2']).map((id) => ({ displayId: id, toPng: () => (id === '2' ? (over.png ?? PNG) : Buffer.from([1])) }))
    },
  }
}

test('맥·윈도우 모두 주 화면을 골라 PNG로 돌려준다', async () => {
  for (const platform of ['darwin', 'win32'] as const) {
    const deps = fakeDeps(platform)
    const png = await captureScreenPng(deps)
    assert.deepEqual(png, PNG)
    assert.deepEqual(deps.asked[0], platform === 'win32' ? { width: 1500, height: 750 } : { width: 2000, height: 1000 })
  }
})

test('주 화면 id를 못 찾으면 첫 화면, 화면이 없거나 빈 이미지면 null', async () => {
  assert.deepEqual(await captureScreenPng(fakeDeps('win32', { ids: ['9'] })), Buffer.from([1]))
  assert.equal(await captureScreenPng(fakeDeps('win32', { ids: [] })), null)
  assert.equal(await captureScreenPng(fakeDeps('darwin', { png: Buffer.alloc(0) })), null)
})
