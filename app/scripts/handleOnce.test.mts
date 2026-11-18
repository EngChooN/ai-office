import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleOnce } from '../src/main/workspace/handleOnce.ts'

const fakeProtocol = () => {
  const handled = new Set<string>()
  let calls = 0
  return {
    calls: () => calls,
    isProtocolHandled: (s: string) => handled.has(s),
    handle: (s: string) => {
      if (handled.has(s)) throw new Error('이미 등록됨')
      handled.add(s)
      calls++
    },
  }
}

test('같은 저장 영역에는 한 번만 등록한다 (두 번째 창도 오류 없음)', () => {
  const session = {}
  const p = fakeProtocol()
  const h = () => new Response('x')
  assert.equal(handleOnce(session, p, 'office-file', h), true)
  assert.equal(handleOnce(session, p, 'office-file', h), false)
  assert.equal(p.calls(), 1)
})

test('다른 저장 영역은 각자 등록하고, 이미 등록돼 있으면 건너뛴다', () => {
  const p1 = fakeProtocol()
  const p2 = fakeProtocol()
  const h = () => new Response('x')
  assert.equal(handleOnce({}, p1, 'office-file', h), true)
  assert.equal(handleOnce({}, p2, 'office-file', h), true)
  const p3 = fakeProtocol()
  p3.handle('office-file')
  assert.equal(handleOnce({}, p3, 'office-file', h), false)
})
