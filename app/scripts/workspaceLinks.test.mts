// 화면 보기 연결 부품(workspaceLinks·linkModel): 허락 확인·사유별 상태·끊김 유예·창 메시지·요청 전달
// 핵심 보장: 어떤 실패에서도 '연결하는 중'에 머물지 않는다 (hello 시간 초과·8초 유예 뒤 사유 있는 상태)
// 설계: docs/design-refresh/connect-workspace/links-design-decision.md

import assert from 'node:assert/strict'
import path from 'node:path'
import { mock, test } from 'node:test'
import type { PeerLinkState } from '../src/shared/peerProtocol.ts'
import { WORKSPACE_OFFLINE_GRACE_MS } from '../src/shared/workspace.ts'
import type { PeerLinkEvent } from '../src/main/peer/peerManager.ts'
import type { PeerHttp, PeerHttpResponse } from '../src/main/peer/peerTransport.ts'
import { failureOf, freeFileName, helloFromResult, pendingFromSnapshot } from '../src/main/workspace/linkModel.ts'
import { createWorkspaceLinks, sniffMime } from '../src/main/workspace/workspaceLinks.ts'
import { fileNameOf } from '../src/main/peer/peerTransport.ts'

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))
}

const helloOk = (view: string, extra: Record<string, unknown> = {}): PeerHttpResponse => ({ status: 200, body: { ok: true, result: { protocol: 2, permissions: { key: 'peer', view }, ...extra } } })

function setup(opts: { link?: PeerLinkState; hello?: (body: unknown) => Promise<PeerHttpResponse>; noHttp?: boolean; helloTimeoutMs?: number } = {}) {
  let clock = 1_000_000
  const link = new Map<string, PeerLinkState>([['p1', opts.link ?? 'connecting']])
  let watcher: ((peerId: string, e: PeerLinkEvent) => void) | null = null
  const helloBodies: { requestView: boolean }[] = []
  const calls: unknown[] = []
  let reply = opts.hello ?? (async () => helloOk('granted'))
  let callReply: (body: unknown) => Promise<PeerHttpResponse> = async () => ({ status: 200, body: { ok: true, result: { done: 1 } } })
  const uploads: { path: string; size: number; headers?: Record<string, string> }[] = []
  const saved: string[] = []
  const gets: string[] = []
  let getReply: (p: string) => Awaited<ReturnType<NonNullable<PeerHttp['getBytes']>>> = () => ({ status: 200, data: Buffer.from('hi'), fileName: '보고서.pdf' })
  const http: PeerHttp = {
    call: async (_m, _p, body) => {
      const b = body as { method: string; args: { requestView: boolean }[] }
      if (b.method === 'hello') {
        helloBodies.push({ requestView: b.args[0].requestView })
        return reply(body)
      }
      calls.push(body)
      return callReply(body)
    },
    postBytes: async (path, data, headers) => (uploads.push({ path, size: data.length, headers }), { status: 201, body: { attachment: { id: 'a1', name: 'x.png' } } }),
    getBytes: async (p) => (gets.push(p), getReply(p)),
  }
  const changes: number[] = []
  const messages: [string, Record<string, unknown>][] = []
  const links = createWorkspaceLinks({
    peers: {
      linkState: (id) => link.get(id) ?? 'unpaired',
      http: () => (opts.noHttp ? null : http),
      watch: (fn) => ((watcher = fn), () => (watcher = null)),
    },
    peerIdOf: (id) => (id === 'w1' ? 'p1' : null),
    saveDownload: async (name) => (saved.push(name), name),
    appVersion: '9.9.9',
    platform: 'darwin',
    now: () => clock,
    helloTimeoutMs: opts.helloTimeoutMs ?? 50,
    retryMs: [60_000],
  })
  links.listen({ changed: () => void changes.push(clock), message: (id, m) => void messages.push([id, m as Record<string, unknown>]) })
  const setLink = async (s: PeerLinkState) => {
    link.set('p1', s)
    watcher!('p1', { type: 'state', state: s })
    await flush()
  }
  return {
    links,
    setLink,
    event: (name: string, data: unknown) => watcher!('p1', { type: 'event', name, data }),
    advance: (ms: number) => void (clock += ms),
    setReply: (f: typeof reply) => void (reply = f),
    setCallReply: (f: typeof callReply) => void (callReply = f),
    helloBodies,
    calls,
    uploads,
    saved,
    gets,
    setGetReply: (f: typeof getReply) => void (getReply = f),
    changes,
    messages,
    hasWatcher: () => watcher !== null,
  }
}

// ── 순수 판단 ──────────────────────────────────────────

test('helloFromResult: 허락 3종·허락 상태 없는 옛 PC·모양 오류', () => {
  assert.deepEqual(helloFromResult({ protocol: 2, permissions: { key: 'peer', view: 'granted' } }), { protocol: 2, canView: true, grant: 'granted' })
  assert.deepEqual(helloFromResult({ protocol: 2, permissions: { key: 'peer', view: 'pending' } }), { protocol: 2, canView: true, grant: 'pending' })
  assert.deepEqual(helloFromResult({ protocol: 2, permissions: { key: 'peer', view: 'none' } }), { protocol: 2, canView: true, grant: 'none' })
  assert.equal(helloFromResult({ protocol: 2 })?.canView, false, '허락 상태가 없으면 화면 보기를 모르는 옛 PC')
  assert.equal(helloFromResult({ protocol: 2, permissions: { key: 'phone', view: 'granted' } })?.canView, false)
  assert.equal(helloFromResult(null), null)
  assert.equal(helloFromResult({ permissions: {} }), null)
})

test('failureOf: 426은 이 PC 업데이트, 401·폐기는 다시 짝짓기, 그 밖은 사유 없음(다시 시도)', () => {
  assert.equal(failureOf(426, { error: 'protocol_unsupported' }), 'protocol_unsupported')
  assert.equal(failureOf(401, {}), 'unauthorized')
  assert.equal(failureOf(200, { error: 'token_revoked' }), 'unauthorized')
  assert.equal(failureOf(403, { error: 'forbidden' }), 'forbidden')
  assert.equal(failureOf(429, { error: 'rate_limited' }), null)
  assert.equal(failureOf(503, {}), null)
})

test('pendingFromSnapshot: 직원별 결재 합, 모양이 달라도 0', () => {
  assert.equal(pendingFromSnapshot({ staff: [{ approvals: [1, 2] }, { approvals: [] }, { approvals: [3] }] }), 3)
  assert.equal(pendingFromSnapshot({ staff: [{}] }), 0)
  assert.equal(pendingFromSnapshot('x'), 0)
})

test('파일 이름: Content-Disposition 읽기·다운로드 폴더에서 겹치지 않는 이름', () => {
  assert.equal(fileNameOf(`attachment; filename*=UTF-8''${encodeURIComponent('보고서 1.pdf')}`), '보고서 1.pdf')
  assert.equal(fileNameOf('inline'), undefined)
  assert.equal(fileNameOf("attachment; filename*=UTF-8''%E0%A4%A"), undefined)
  const have = new Set([path.join('/d', 'a.txt'), path.join('/d', 'a (2).txt')])
  assert.equal(freeFileName('/d', 'a.txt', (p) => have.has(p)), 'a (3).txt')
  assert.equal(freeFileName('/d', '../../etc/x:y', () => false), 'x_y')
  assert.equal(freeFileName('/d', '', () => false), 'file')
})

// ── 연결 흐름 ──────────────────────────────────────────

test('붙으면 hello로 허락을 확인해 ready, 창에는 연결됨을 알린다', async () => {
  const t = setup()
  t.links.sync(['w1'])
  assert.equal(t.links.status('w1'), 'connecting')
  await t.setLink('online')
  assert.equal(t.links.status('w1'), 'ready')
  assert.deepEqual(t.helloBodies, [{ requestView: false }], '자동 확인은 허락을 요청하지 않는다')
  assert.deepEqual(t.messages.at(-1), ['w1', { type: 'connection', state: 'open' }])
  assert.ok(t.changes.length > 0)
  // 창이 ready를 보내면 hello와 지금 상태를 다시 알려 준다
  t.links.ready('w1')
  assert.equal(t.messages.at(-2)?.[1].type, 'hello')
  assert.deepEqual(t.messages.at(-1), ['w1', { type: 'connection', state: 'open' }])
})

test('요청한 적 없는 none은 요청 전(grantNone), 요청한 뒤의 none은 거절(grantDenied)', async () => {
  const t = setup({ link: 'online', hello: async () => helloOk('none') })
  t.links.sync(['w1'])
  await flush()
  assert.equal(t.links.status('w1'), 'grantNone', '새로 짝지어 아직 요청하지 않았으면 거절이 아니다')
  t.links.requestGrant('w1')
  await flush()
  assert.equal(t.links.status('w1'), 'grantDenied', '요청한 뒤에도 허락이 없으면 거절')
  await t.setLink('connecting')
  await t.setLink('online')
  assert.equal(t.links.status('w1'), 'grantDenied', '다시 붙어도 거절은 거절로')
})

test('허락 요청은 추가·다시 요청 때 한 번만 싣고, 대기 → 허락되면 ready', async () => {
  const t = setup({ link: 'online', hello: async () => helloOk('pending') })
  t.links.sync(['w1'])
  t.links.requestGrant('w1')
  await flush()
  assert.equal(t.links.status('w1'), 'grantPending')
  assert.ok(t.helloBodies.some((b) => b.requestView), '요청을 실었다')
  // 저쪽에서 허락하면 서버가 줄을 닫고 다시 붙는다 → 다시 확인
  t.setReply(async () => helloOk('granted'))
  await t.setLink('connecting')
  await t.setLink('online')
  assert.equal(t.links.status('w1'), 'ready')
  assert.equal(t.helloBodies.at(-1)?.requestView, false, '다시 붙을 때는 요청하지 않는다 (거절 뒤 카드가 계속 뜨지 않게)')
})

test('허락 없음(none)이어도 자동 확인은 요청을 싣지 않고, 허락 요청을 누를 때만 싣는다', async () => {
  const t = setup({ link: 'online', hello: async () => helloOk('none') })
  t.links.sync(['w1'])
  await flush()
  assert.equal(t.links.status('w1'), 'grantNone')
  const n = t.helloBodies.length
  t.links.requestGrant('w1')
  await flush()
  assert.deepEqual(t.helloBodies.slice(n), [{ requestView: true }])
})

test('실패 사유별 상태 — 어느 것도 연결하는 중에 머물지 않는다', async () => {
  const never = () => new Promise<PeerHttpResponse>(() => {})
  const rows: [string, () => Promise<PeerHttpResponse>, string][] = [
    ['허락 상태 없는 옛 PC', async () => ({ status: 200, body: { ok: true, result: { protocol: 2 } } }), 'peerOutdated'],
    ['hello를 모르는 옛 PC', async () => ({ status: 404, body: { error: 'unknown_method' } }), 'peerOutdated'],
    ['PC 열쇠에 hello를 안 열던 PC', async () => ({ status: 403, body: { error: 'scope_denied' } }), 'peerOutdated'],
    ['열쇠 폐기', async () => ({ status: 401, body: { error: 'unauthorized' } }), 'unpaired'],
    ['이 PC가 낡음', async () => ({ status: 426, body: { error: 'protocol_unsupported' } }), 'selfOutdated'],
    ['잠시 막힘', async () => ({ status: 429, body: { error: 'rate_limited' } }), 'offline'],
    ['네트워크 오류', async () => Promise.reject(new Error('ECONNRESET')), 'offline'],
    ['응답 없음(시간 초과)', never, 'offline'],
  ]
  for (const [name, hello, want] of rows) {
    const t = setup({ link: 'online', hello })
    t.links.sync(['w1'])
    await new Promise((r) => setTimeout(r, 80))
    await flush()
    assert.equal(t.links.status('w1'), want, name)
  }
})

test('짝이 풀리면(줄이 unpaired) 사유를 hello로 가린다 — 426이면 이 PC 업데이트', async () => {
  const t = setup({ link: 'online' })
  t.links.sync(['w1'])
  await flush()
  t.setReply(async () => ({ status: 426, body: { error: 'protocol_unsupported' } }))
  await t.setLink('unpaired')
  assert.equal(t.links.status('w1'), 'selfOutdated')
  t.setReply(async () => ({ status: 401, body: {} }))
  await t.setLink('unpaired')
  assert.equal(t.links.status('w1'), 'unpaired')
})

test('앱을 켠 직후(연결 시작 전) hello가 막혀도 다시 짝짓기를 띄우지 않는다 — 짝 풀림 알림 뒤에는 그대로', async () => {
  const t = setup({ link: 'unpaired', hello: async () => Promise.reject(new Error('ECONNREFUSED')) })
  t.links.sync(['w1'])
  await flush()
  assert.equal(t.links.status('w1'), 'connecting')
  assert.ok(!t.messages.some(([, m]) => m.type === 'connection' && m.state === 'closed'))
  await t.setLink('unpaired')
  assert.equal(t.links.status('w1'), 'unpaired', '진짜 짝 풀림 알림이면 다시 짝짓기')
})

test('열쇠를 못 읽으면(통로 없음) 다시 짝짓기', async () => {
  const t = setup({ link: 'online', noHttp: true })
  t.links.sync(['w1'])
  await flush()
  assert.equal(t.links.status('w1'), 'unpaired')
  await assert.rejects(t.links.request('w1', { type: 'call', method: 'snapshot', args: [] }), { code: 'workspace_not_ready' })
})

test('끊기면 8초 동안 다시 연결 중, 그 뒤 끊김 — 시계 타이머가 목록을 다시 보낸다', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const t = setup({ link: 'online' })
    t.links.sync(['w1'])
    await flush()
    assert.equal(t.links.status('w1'), 'ready')
    await t.setLink('connecting')
    assert.equal(t.links.status('w1'), 'reconnecting')
    assert.deepEqual(t.messages.at(-1)?.[1], { type: 'connection', state: 'reconnecting' })
    const before = t.changes.length
    t.advance(WORKSPACE_OFFLINE_GRACE_MS)
    mock.timers.tick(WORKSPACE_OFFLINE_GRACE_MS + 50)
    assert.equal(t.links.status('w1'), 'offline')
    assert.ok(t.changes.length > before, '8초가 되면 스스로 다시 알린다')
    assert.deepEqual(t.messages.at(-1)?.[1], { type: 'connection', state: 'closed' })
  } finally {
    mock.timers.reset()
  }
})

test('처음부터 못 붙는 PC도 8초 뒤 끊김', () => {
  const t = setup({ link: 'connecting' })
  t.links.sync(['w1'])
  assert.equal(t.links.status('w1'), 'connecting')
  t.advance(WORKSPACE_OFFLINE_GRACE_MS)
  assert.equal(t.links.status('w1'), 'connecting', '줄이 아직 connecting이면 PeerClient가 offline으로 바꿀 때까지')
  t.links.sync([])
  const u = setup({ link: 'offline' })
  u.links.sync(['w1'])
  u.advance(WORKSPACE_OFFLINE_GRACE_MS)
  assert.equal(u.links.status('w1'), 'offline')
})

test('이벤트: 스냅샷은 결재 수를 세고 창에 넘기고, resync는 다시 붙을 때만, bye는 넘기지 않는다', async () => {
  const t = setup({ link: 'online' })
  t.links.sync(['w1'])
  await flush()
  t.event('snapshot', { staff: [{ approvals: [1, 2] }] })
  assert.equal(t.links.pending('w1'), 2)
  assert.deepEqual(t.messages.at(-1), ['w1', { type: 'event', name: 'snapshot', data: { staff: [{ approvals: [1, 2] }] } }])
  t.event('log', { id: 1 })
  assert.deepEqual(t.messages.at(-1)?.[1], { type: 'event', name: 'log', data: { id: 1 } })
  const n = t.messages.length
  t.event('bye', { reason: 'permission_changed' })
  assert.equal(t.messages.length, n)
  t.event('hello', { resync: true })
  assert.deepEqual(t.messages.at(-1)?.[1], { type: 'resync' })
})

test('요청: call 결과·실패(대체 동작 포함)·올리기 20MB·내려받기 이름', async () => {
  const t = setup({ link: 'online' })
  t.links.sync(['w1'])
  await flush()
  assert.deepEqual(await t.links.request('w1', { type: 'call', method: 'snapshot', args: [], confirm: true }), { done: 1 })
  assert.deepEqual(t.calls.at(-1), { method: 'snapshot', args: [], confirm: true })
  t.setCallReply(async () => ({ status: 422, body: { error: 'pc_only', message: 'PC에서', alternative: 'open_on_pc' } }))
  await assert.rejects(t.links.request('w1', { type: 'call', method: 'openAttachment', args: [] }), { status: 422, code: 'pc_only', message: 'PC에서', alternative: 'open_on_pc' })
  t.setCallReply(async () => Promise.reject(new Error('ECONNRESET')))
  await assert.rejects(t.links.request('w1', { type: 'call', method: 'snapshot', args: [] }), { status: 0, code: 'unreachable' })

  assert.deepEqual(await t.links.request('w1', { type: 'upload', name: '그림 1.png', mime: 'image/png', base64: Buffer.from('abc').toString('base64') }), { id: 'a1', name: 'x.png' })
  assert.deepEqual(t.uploads.at(-1), { path: '/v2/attachments', size: 3, headers: { 'Content-Type': 'image/png', 'X-File-Name': encodeURIComponent('그림 1.png') } })
  const big = Buffer.alloc(20 * 1024 * 1024 + 1).toString('base64')
  await assert.rejects(t.links.request('w1', { type: 'upload', name: 'big', mime: '', base64: big }), { status: 413, code: 'payload_too_large' })

  assert.equal(await t.links.request('w1', { type: 'download', fileId: '123e4567-e89b-12d3-a456-426614174000', name: '' }), '보고서.pdf')
  await assert.rejects(t.links.request('w1', { type: 'download', fileId: '../x', name: '' }), { code: 'invalid_request' })
})

test('결과물: 내려받기·미리보기는 결과물 길로만 받고, 5MB 넘음·없음을 나눠 알린다', async () => {
  const t = setup({ link: 'online' })
  t.links.sync(['w1'])
  await flush()
  const id = '123e4567-e89b-12d3-a456-426614174000'
  t.setGetReply(() => ({ status: 200, data: Buffer.from('<h1>안녕</h1>'), fileName: 'a.html' }))
  assert.equal(await t.links.request('w1', { type: 'download', fileId: id, name: '', kind: 'artifact' }), 'a.html')
  assert.deepEqual(await t.links.request('w1', { type: 'read', fileId: id, version: 2 }), { name: 'a.html', text: '<h1>안녕</h1>' })
  assert.deepEqual(t.gets, [`/v2/artifacts/${id}`, `/v2/artifacts/${id}/2`])
  t.setGetReply(() => ({ status: 413, data: null }))
  await assert.rejects(t.links.request('w1', { type: 'read', fileId: id }), { code: 'payload_too_large' })
  t.setGetReply(() => ({ status: 404, data: null }))
  await assert.rejects(t.links.request('w1', { type: 'download', fileId: id, name: '', kind: 'artifact' }), { code: 'file_not_found' })
  // 경로 문자가 섞인 id는 저쪽으로 보내지 않는다
  const before = t.gets.length
  await assert.rejects(t.links.request('w1', { type: 'read', fileId: '../../etc/passwd' }), { code: 'invalid_request' })
  await assert.rejects(t.links.request('w1', { type: 'download', fileId: `${id}/../x`, name: '', kind: 'artifact' }), { code: 'invalid_request' })
  assert.equal(t.gets.length, before)
})

test('첨부 그림: 그 PC에서 받아 종류를 알아본다 — 모르는 id·실패는 null', async () => {
  const t = setup({ link: 'online' })
  t.links.sync(['w1'])
  await flush()
  const id = '123e4567-e89b-12d3-a456-426614174000'
  t.setGetReply(() => ({ status: 200, data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]) }))
  const got = await t.links.readFile!('w1', id)
  assert.equal(got?.mime, 'image/png')
  assert.deepEqual(t.gets, [`/v2/files/${id}`])
  assert.equal(await t.links.readFile!('w1', '../x'), null)
  assert.equal(await t.links.readFile!('nope', id), null)
  t.setGetReply(() => ({ status: 404, data: null }))
  assert.equal(await t.links.readFile!('w1', id), null)
  assert.equal(sniffMime(Buffer.from('%PDF-1.4')), 'application/pdf')
  assert.equal(sniffMime(Buffer.from('<svg onload=x>')), 'application/octet-stream', 'svg·html은 그림으로 내주지 않는다')
})

test('요청: 한 PC에 동시에 5개까지, 나머지는 차례를 기다린다', async () => {
  const t = setup({ link: 'online' })
  t.links.sync(['w1'])
  await flush()
  let running = 0
  let peak = 0
  const gates: (() => void)[] = []
  t.setCallReply(async () => {
    running++
    peak = Math.max(peak, running)
    await new Promise<void>((r) => gates.push(r))
    running--
    return { status: 200, body: { ok: true, result: null } }
  })
  const all = Array.from({ length: 8 }, () => t.links.request('w1', { type: 'call', method: 'snapshot', args: [] }))
  await flush()
  assert.equal(peak, 5)
  while (gates.length) {
    gates.shift()!()
    await flush()
  }
  await Promise.all(all)
  assert.equal(peak, 5)
})

test('목록에서 빼면 기록을 지우고, dispose는 구독을 끊는다', async () => {
  const t = setup({ link: 'online' })
  t.links.sync(['w1'])
  await flush()
  t.links.sync([])
  assert.equal(t.links.pending('w1'), 0)
  await assert.rejects(t.links.request('w1', { type: 'call', method: 'snapshot', args: [] }), { code: 'workspace_not_ready' })
  t.links.dispose()
  assert.equal(t.hasWatcher(), false)
})
