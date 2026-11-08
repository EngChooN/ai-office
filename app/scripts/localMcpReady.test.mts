// 앱 시작 직후 지시: 로컬 MCP 서버가 뜰 때까지 기다리는 whenLocalMcpReady의 준비 전·후·실패 시험
import assert from 'node:assert/strict'
import http from 'node:http'
import { afterEach, test } from 'node:test'
import { startLocalMcp, stopLocalMcp, whenLocalMcpReady } from '../src/main/mcp/localMcp.ts'

afterEach(() => stopLocalMcp())

test('준비 후: 이미 떠 있으면 바로 true', async () => {
  await startLocalMcp()
  assert.equal(await whenLocalMcpReady(50), true)
})

test('준비 전: 아직 안 떴어도 기다렸다가 true (시작을 직접 건다)', async () => {
  stopLocalMcp()
  const pending = whenLocalMcpReady(5000)
  assert.equal(await pending, true)
})

test('앱이 시작 중인 약속과 같은 서버를 쓴다 (두 번 띄우지 않는다)', async () => {
  const first = startLocalMcp()
  const second = startLocalMcp()
  assert.equal(first, second)
  await first
})

test('실패: 시작이 실패하면 false, 이후 다시 시작을 시도해 성공한다', async () => {
  const real = http.createServer
  http.createServer = ((..._a: unknown[]) => {
    const s = real()
    s.listen = ((..._l: unknown[]) => {
      queueMicrotask(() => s.emit('error', new Error('EADDRINUSE')))
      return s
    }) as typeof s.listen
    return s
  }) as typeof http.createServer
  try {
    assert.equal(await whenLocalMcpReady(1000), false)
  } finally {
    http.createServer = real
  }
  assert.equal(await whenLocalMcpReady(2000), true)
})

test('시간 초과: 끝내 안 뜨면 false', async () => {
  const real = http.createServer
  http.createServer = ((..._a: unknown[]) => {
    const s = real()
    s.listen = (() => s) as typeof s.listen
    return s
  }) as typeof http.createServer
  try {
    assert.equal(await whenLocalMcpReady(50), false)
  } finally {
    http.createServer = real
  }
})
