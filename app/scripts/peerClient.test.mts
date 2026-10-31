// A컴의 B컴 연결(설계서 4절): SSE 해석, 연결 상태(online/connecting/offline/unpaired), 재연결·재시도 없는 끝
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PeerClient, SseParser, type OpenStream, type StreamHandlers } from '../src/main/peer/peerClient.ts'
import type { PeerLinkState } from '../src/shared/peerProtocol.ts'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(cond: () => boolean, ms = 1500) {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('시간 초과')
    await wait(5)
  }
}

test('SSE 해석: 조각난 입력·여러 줄 data·주석·id', () => {
  const p = new SseParser()
  const out: unknown[] = []
  const feed = (s: string) => p.feed(s, (e) => out.push(e))
  feed('retry: 3000\n\nid: ab:1\nevent: hel')
  feed('lo\ndata: {"a":1}\n\n: keep-alive\n\nevent: x\ndata: l1\ndata: l2\n\n')
  feed('data: 이름없음\r\n\r\n')
  assert.deepEqual(out, [
    { event: 'hello', data: '{"a":1}', id: 'ab:1' },
    { event: 'x', data: 'l1\nl2' },
    { event: 'message', data: '이름없음' },
  ])
})

/** 가짜 스트림: 열 때마다 시나리오를 돌려준다 */
function fakeStream(steps: ((h: StreamHandlers, headers: Record<string, string>) => void)[]) {
  let i = 0
  const opened: Record<string, string>[] = []
  const handlers: StreamHandlers[] = []
  const open: OpenStream = (_path, headers, h) => {
    opened.push(headers)
    handlers.push(h)
    const step = steps[Math.min(i++, steps.length - 1)]
    queueMicrotask(() => step(h, headers))
    return { close: () => {} }
  }
  return { open, opened, handlers }
}

const hello = (h: StreamHandlers, id = 'ep:1') => {
  h.onOpen(200)
  h.onEvent('hello', JSON.stringify({ epoch: 'ep', resync: true }), id)
}

function makeClient(open: OpenStream, over: Record<string, unknown> = {}) {
  const states: PeerLinkState[] = []
  const events: [string, unknown][] = []
  let onlineCount = 0
  const c = new PeerClient({ peerId: 'p1', openStream: open, onState: (s) => states.push(s), onEvent: (n, d) => events.push([n, d]), onOnline: () => onlineCount++, retryMs: [10, 10], offlineAfterMs: 60, idleMs: 5000, random: () => 0.5, ...over })
  return { c, states, events, online: () => onlineCount }
}

test('붙으면 online, hello 뒤 이벤트를 JSON으로 풀어 전달하고 onOnline을 부른다', async () => {
  const s = fakeStream([(h) => (hello(h), h.onEvent('job', JSON.stringify({ jobId: 'j', state: 'done' }), 'ep:2'))])
  const t = makeClient(s.open)
  t.c.start()
  await until(() => t.events.some(([n]) => n === 'job'))
  assert.equal(t.c.state, 'online')
  assert.equal(t.online(), 1)
  assert.deepEqual(t.events.find(([n]) => n === 'job')![1], { jobId: 'j', state: 'done' })
  assert.equal(s.opened[0]['X-Office-Capabilities'], 'iso-office')
  t.c.stop()
})

test('끊기면 connecting(깜빡임 없이) → 8초(여기선 60ms) 넘으면 offline → 다시 붙으면 online, Last-Event-ID로 이어 붙는다', async () => {
  const s = fakeStream([
    (h) => (hello(h, 'ep:7'), h.onClose({ code: 'ECONNRESET' })),
    (h) => h.onClose({ code: 'ECONNREFUSED' }),
    (h) => h.onClose({ code: 'ECONNREFUSED' }),
    (h) => h.onClose({ code: 'ECONNREFUSED' }),
    (h) => h.onClose({ code: 'ECONNREFUSED' }),
    (h) => h.onClose({ code: 'ECONNREFUSED' }),
    (h) => h.onClose({ code: 'ECONNREFUSED' }),
    (h) => h.onClose({ code: 'ECONNREFUSED' }),
    (h) => hello(h, 'ep:9'),
  ])
  const t = makeClient(s.open)
  t.c.start()
  await until(() => t.states.includes('offline'))
  assert.deepEqual(t.states.slice(0, 3), ['online', 'connecting', 'offline'])
  await until(() => t.c.state === 'online' && t.online() === 2)
  assert.equal(s.opened[1]['Last-Event-ID'], 'ep:7')
  t.c.stop()
})

test('토큰 폐기(401·bye token_revoked)·권한 없음(403)·버전(426)이면 다시 붙지 않고 unpaired', async () => {
  for (const close of [(h: StreamHandlers) => (h.onOpen(401), h.onClose({ status: 401 })), (h: StreamHandlers) => (h.onOpen(403), h.onClose({ status: 403 })), (h: StreamHandlers) => (h.onOpen(426), h.onClose({ status: 426 })), (h: StreamHandlers) => (hello(h), h.onEvent('bye', JSON.stringify({ reason: 'token_revoked' })), h.onClose({}))]) {
    const s = fakeStream([close])
    const t = makeClient(s.open)
    t.c.start()
    await until(() => t.c.state === 'unpaired')
    await wait(60)
    assert.equal(s.opened.length, 1)
    t.c.stop()
  }
})

test('인증서 지문이 달라졌으면(SPKI_MISMATCH) unpaired — 다시 짝지어야 한다', async () => {
  const s = fakeStream([(h) => h.onClose({ code: 'SPKI_MISMATCH' })])
  const t = makeClient(s.open)
  t.c.start()
  await until(() => t.c.state === 'unpaired')
  t.c.stop()
})

test('원격 끄기(bye remote_disabled)는 계속 다시 붙어 본다, stop 뒤에는 아무 일도 없다', async () => {
  const s = fakeStream([(h) => (hello(h), h.onEvent('bye', JSON.stringify({ reason: 'remote_disabled' })), h.onClose({})), (h) => hello(h)])
  const t = makeClient(s.open)
  t.c.start()
  await until(() => t.online() === 2)
  t.c.stop()
  const n = s.opened.length
  await wait(60)
  assert.equal(s.opened.length, n)
})

test('같은 연결이 onClose를 두 번 불러도 재시도는 한 번만', async () => {
  const s = fakeStream([(h) => (h.onClose({ code: 'X' }), h.onClose({ code: 'X' })), (h) => hello(h)])
  const t = makeClient(s.open)
  t.c.start()
  await until(() => t.online() === 1)
  assert.equal(s.opened.length, 2)
  t.c.stop()
})
