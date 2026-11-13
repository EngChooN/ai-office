// PC 두 대 통합 시험 (실제 HTTPS·SSE, 한 프로세스): B컴 = RemoteService, A컴 = PeerManager(진짜 통로)
// 짝짓기 → 연결 유지 → 해제 + 권한 범위. 1.3.1까지의 일 주고받기 경로는 410 peer_feature_removed
import assert from 'node:assert/strict'
import https from 'node:https'
import net from 'node:net'
import { test } from 'node:test'
import { DEFAULT_REMOTE_CONFIG, RemoteService, type RemoteConfig } from '../src/main/remote/service.ts'
import { PeerManager, type PeerOfficePort } from '../src/main/peer/peerManager.ts'
import { memoryPeerStore } from '../src/main/peer/peerStore.ts'
import { memoryTokenVault } from '../src/main/peer/peerRegistry.ts'
import { createOpenStream, createPairTransport, createPeerHttp } from '../src/main/peer/peerTransport.ts'
import { createSelfSignedCert } from '../src/main/remote/cert.ts'
import { pairWithHost, type PairFailure } from '../src/main/peer/pairing.ts'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(cond: () => boolean, label = '', ms = 4000) {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error(`시간 초과: ${label}`)
    await wait(10)
  }
}
const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port
      s.close(() => resolve(port))
    })
  })

function rawReq(port: number, path: string, token: string, method = 'GET', body?: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body))
    const r = https.request({ host: '127.0.0.1', port, path, method, rejectUnauthorized: false, agent: false, headers: { Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}) } }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        let b: any = null
        try {
          b = JSON.parse(Buffer.concat(chunks).toString())
        } catch {}
        resolve({ status: res.statusCode ?? 0, body: b })
      })
    })
    r.on('error', reject)
    if (payload) r.write(payload)
    r.end()
  })
}

/** B컴: 실제 RemoteService (짝짓기·슬롯·이벤트) */
function makeB(port: number, now?: () => number) {
  let config: RemoteConfig = { ...DEFAULT_REMOTE_CONFIG, port, host: '127.0.0.1', mode: 'router', tokenHash: null, isTokenUsed: true, isLanNoticeSeen: true, isTsNoticeSeen: true }
  let keys = createSelfSignedCert()
  const calls: string[] = []
  let svc: RemoteService
  svc = new RemoteService({
    office: { view: () => ({ staff: [], tasks: [] }), decide: () => true, answerQuestion: () => true, reviewPlan: () => true, instruct: () => {} },
    serverVersion: 'test',
    loadConfig: () => config,
    saveConfig: (c) => (config = c),
    loadKeys: () => keys,
    saveKeys: (k) => (keys = k),
    alert: () => {},
    changed: () => {},
    upnp: null,
    listenHost: '127.0.0.1',
    now,
    v2: {
      call: (m) => (calls.push(m), m === 'snapshot' ? { company: { level: 1 }, tasks: [], staff: [{ id: 'kim', name: '김배포', role: '배포', avatar: 3, provider: 'claude', model: 'default', status: 'working', activity: '배포 중', cwd: '/secret', systemPrompt: '비밀' }] } : m === 'remoteStatus' ? svc.status() : undefined),
      attachment: () => null,
      saveUpload: () => ({ id: 'x', name: 'x', path: '/x', mime: '', size: 0 }),
    },
    peer: { ownName: () => 'B컴' },
  })
  return { svc, calls, config: () => config }
}

/** A컴: 진짜 통로 + 메모리 저장소 */
function makeA() {
  let changes = 0
  const office: PeerOfficePort = { changed: () => changes++, ownName: () => 'A컴' }
  const store = memoryPeerStore()
  const vault = memoryTokenVault()
  const mgr = new PeerManager({
    store,
    vault,
    office,
    net: { pair: createPairTransport, http: (p, t) => createPeerHttp(p, t), stream: (p, t) => createOpenStream(p, t) },
    isHostAllowed: (h) => h === '127.0.0.1',
    clientOptions: { retryMs: [30, 30], offlineAfterMs: 150, idleMs: 10_000 },
  })
  return { mgr, store, vault, changes: () => changes }
}

test('PC 두 대: 짝짓기 → online → 옛 일 경로는 410 · /v2/call은 hello만 → A컴이 해제하면 B컴 슬롯도 사라진다', { timeout: 20_000 }, async () => {
  const port = await freePort()
  const B = makeB(port)
  const A = makeA()
  try {
    await B.svc.enable(port)
    const win = (await B.svc.openPairing('peer'))!
    const paired = await A.mgr.pairConnect('127.0.0.1', port, win.code)
    assert.equal(paired.name, 'B컴')
    await until(() => A.mgr.linkState(paired.id) === 'online', 'online')
    assert.deepEqual(A.mgr.list().map((p) => [p.id, p.state]), [[paired.id, 'online']])
    assert.equal(B.svc.peerSlots().length, 1)
    const token = A.vault.load(paired.id) as string
    // 1.3.1 앱이 일·직원·첨부·파일 복사본을 보내면 410으로 거절한다 (계속 기다리지 않게)
    for (const [method, p] of [['GET', '/v2/peer/staff'], ['POST', '/v2/peer/jobs'], ['GET', '/v2/peer/approvals'], ['POST', '/v2/peer/jobs/abc/cancel'], ['POST', '/v2/peer/workspaces']] as const) {
      const r = await rawReq(port, p, token, method, method === 'POST' ? {} : undefined)
      assert.deepEqual([r.status, r.body?.error], [410, 'peer_feature_removed'], p)
    }
    assert.equal((await rawReq(port, '/v2/peer/nothing', token)).status, 404)
    // 화면 보기 권한이 없는 열쇠는 hello 말고는 부를 수 없다 (예전의 decide 허용도 없다)
    assert.equal((await rawReq(port, '/v2/call', token, 'POST', { method: 'decide', args: ['x', true] })).body.error, 'scope_denied')
    assert.equal((await rawReq(port, '/v2/call', token, 'POST', { method: 'hello', args: [{ capabilities: [] }] })).status, 200)
    await A.mgr.unpair(paired.id)
    assert.deepEqual([A.mgr.list().length, A.vault.load(paired.id)], [0, null])
    await until(() => B.svc.peerSlots().length === 0, 'B 슬롯 해제')
  } finally {
    A.mgr.dispose()
    await B.svc.disable()
  }
})

test('B컴에서 이 PC 연결을 해제하면 A컴은 unpaired(다시 짝짓기)로 표시하고 재연결을 멈춘다', { timeout: 20_000 }, async () => {
  const port = await freePort()
  const B = makeB(port)
  const A = makeA()
  try {
    await B.svc.enable(port)
    const win = (await B.svc.openPairing('peer'))!
    const paired = await A.mgr.pairConnect('127.0.0.1', port, win.code)
    await until(() => A.mgr.linkState(paired.id) === 'online', 'online')
    B.svc.revokePeerSlot(B.svc.peerSlots()[0].id)
    await until(() => A.mgr.linkState(paired.id) === 'unpaired', 'unpaired')
  } finally {
    A.mgr.dispose()
    await B.svc.disable()
  }
})

test('화면 보기 권한이 없는 PC 열쇠의 SSE에는 hello·keep-alive만 — 사무실 내용(snapshot·log·chat·remoteStatus)은 나가지 않는다', { timeout: 20_000 }, async () => {
  const port = await freePort()
  const B = makeB(port)
  const A = makeA()
  try {
    await B.svc.enable(port)
    const win = (await B.svc.openPairing('peer'))!
    const paired = await A.mgr.pairConnect('127.0.0.1', port, win.code)
    await until(() => A.mgr.linkState(paired.id) === 'online', 'online')
    const token = A.vault.load(paired.id) as string
    // A컴 연결을 멈춰 둔다 (슬롯당 연결 1줄이라 A컴이 다시 붙으면 이 연결이 밀려난다)
    A.mgr.dispose()
    const seen: string[] = []
    const req = https.request({ host: '127.0.0.1', port, path: '/v2/events', rejectUnauthorized: false, agent: false, headers: { Authorization: `Bearer ${token}` } }, (res) => {
      res.setEncoding('utf8')
      res.on('data', (c: string) => {
        for (const m of c.matchAll(/^event: (\w+)$/gm)) seen.push(m[1])
      })
    })
    req.on('error', () => {})
    req.end()
    await until(() => seen.includes('hello'), 'hello')
    B.svc.publish('log', { id: 1, staffId: 'kim', text: '비밀 로그' })
    B.svc.publish('chat', { id: 1, sender: 'kim', text: '비밀 대화' })
    await wait(150)
    req.destroy()
    assert.deepEqual(seen, ['hello'])
  } finally {
    A.mgr.dispose()
    await B.svc.disable()
  }
})

test('인증서 고정: 지문이 다른 서버에는 요청 내용을 보내지 않고 끊는다 (SPKI_MISMATCH)', { timeout: 20_000 }, async () => {
  const port = await freePort()
  const B = makeB(port)
  const A = makeA()
  try {
    await B.svc.enable(port)
    const win = (await B.svc.openPairing('peer'))!
    const paired = await A.mgr.pairConnect('127.0.0.1', port, win.code)
    await until(() => A.mgr.linkState(paired.id) === 'online', 'online')
    const token = A.vault.load(paired.id) as string
    const before = B.svc.status().recentAccess.length
    const wrongPin = createPeerHttp({ host: '127.0.0.1', port, spki: `sha256/${'Z'.repeat(43)}=` }, token)
    await assert.rejects(wrongPin.call('POST', '/v2/peer/jobs', { jobId: 'x' }), (e: { code?: string }) => e.code === 'SPKI_MISMATCH')
    await wait(50)
    // B컴은 그 요청을 받은 적이 없다 (접속 기록에 /v2/peer/jobs POST 없음)
    assert.equal(B.svc.status().recentAccess.slice(0, Math.max(0, B.svc.status().recentAccess.length - before)).some((a) => a.path === '/v2/peer/jobs' && a.method === 'POST'), false)
    // 맞는 지문이면 B컴까지 닿는다 (옛 경로라 410)
    const good = createPeerHttp({ host: '127.0.0.1', port, spki: A.mgr.registry.getPeer(paired.id)!.spki }, token)
    assert.equal((await good.call('GET', '/v2/peer/staff')).status, 410)
  } finally {
    A.mgr.dispose()
    await B.svc.disable()
  }
})

test('휴대폰 IP 입력: 같은 짝짓기 길(/v2/pair/*)로 휴대폰 토큰을 받고, 코드 없이는 못 받는다', { timeout: 20_000 }, async () => {
  const port = await freePort()
  const B = makeB(port)
  try {
    await B.svc.enable(port)
    // 창이 닫혀 있으면 410
    const closed = await createPairTransport('127.0.0.1', port).post('/v2/pair/hello', { nonceA: 'A'.repeat(22) })
    assert.deepEqual([closed.status, closed.body.error], [410, 'pair_closed'])
    const win = (await B.svc.openPairing('phone'))!
    assert.equal(win.kind, 'phone')
    const wrong = win.code === '0000-0000-0000' ? '1111-1111-1111' : '0000-0000-0000'
    await assert.rejects(pairWithHost(createPairTransport('127.0.0.1', port), { code: wrong, clientName: '내 폰', kind: 'phone' }), (e: PairFailure) => e.code === 'wrong_code')
    // 오답 한 번 뒤에도 창은 살아 있다 (3번 틀려야 닫힌다)
    const r = await pairWithHost(createPairTransport('127.0.0.1', port), { code: win.code, clientName: '내 폰', kind: 'phone' })
    assert.equal(r.slotId, '') // 휴대폰은 피어 슬롯이 아니다
    assert.equal(B.svc.peerSlots().length, 0)
    // 받은 토큰은 휴대폰 토큰: /v2/call hello가 통하고 v1도 열린다
    const hello = await rawReq(port, '/v2/call', r.token, 'POST', { method: 'hello', args: [{ capabilities: ['iso-office'] }] })
    assert.equal(hello.status, 200)
    assert.equal((await rawReq(port, '/v1/status', r.token)).status, 200)
    // 휴대폰 토큰으로는 피어 경로를 못 쓴다
    assert.equal((await rawReq(port, '/v2/peer/staff', r.token)).body.error, 'scope_denied')
  } finally {
    await B.svc.disable()
  }
})

const HOUR = 60 * 60_000

test('짝짓기 창은 시간 제한이 없다: 5분·1시간이 지나도 열려 있고, 연결에 성공하면 닫힌다', { timeout: 20_000 }, async () => {
  const port = await freePort()
  let clock = Date.now()
  const B = makeB(port, () => clock)
  try {
    await B.svc.enable(port)
    const win = (await B.svc.openPairing('peer'))!
    assert.equal(win.until, null)
    clock += 5 * 60_000 + 1
    assert.equal(B.svc.pairingView()?.code, win.code)
    clock += HOUR
    assert.deepEqual([B.svc.pairingView()?.code, B.svc.status().pairOpen], [win.code, 'peer'])
    const r = await pairWithHost(createPairTransport('127.0.0.1', port), { code: win.code, clientName: 'A컴', kind: 'peer' })
    assert.ok(r.slotId)
    assert.deepEqual([B.svc.pairingView(), B.svc.status().pairOpen], [null, null])
  } finally {
    await B.svc.disable()
  }
})

test('짝짓기 창은 코드를 3번 틀리면 닫힌다 (시간이 지나도 보호는 그대로)', { timeout: 20_000 }, async () => {
  const port = await freePort()
  let clock = Date.now()
  const B = makeB(port, () => clock)
  try {
    await B.svc.enable(port)
    const win = (await B.svc.openPairing('peer'))!
    clock += HOUR
    const wrong = win.code === '0000-0000-0000' ? '1111-1111-1111' : '0000-0000-0000'
    for (const left of [2, 1, 0]) await assert.rejects(pairWithHost(createPairTransport('127.0.0.1', port), { code: wrong, clientName: 'A', kind: 'peer' }), (e: PairFailure) => e.code === 'wrong_code' && e.remaining === left)
    assert.deepEqual([B.svc.pairingView(), B.svc.status().pairOpen], [null, null])
    await assert.rejects(pairWithHost(createPairTransport('127.0.0.1', port), { code: win.code, clientName: 'A', kind: 'peer' }), (e: PairFailure) => e.code === 'closed')
  } finally {
    await B.svc.disable()
  }
})

test('휴대폰 연결도 시간 제한이 없다: 1시간 뒤에도 같은 QR 토큰으로 코드 연결이 되고, 붙으면 QR을 거둔다', { timeout: 20_000 }, async () => {
  const port = await freePort()
  let clock = Date.now()
  const B = makeB(port, () => clock)
  try {
    await B.svc.enable(port)
    const win = (await B.svc.openPairing('phone'))!
    const tokenHash = B.config().tokenHash
    assert.equal(B.svc.status().isQrReady, true)
    clock += 5 * 60_000 + 1
    assert.ok(B.svc.qr(), '5분 뒤에도 QR이 보인다')
    clock += HOUR
    // 창을 다시 열어도 QR 토큰을 새로 만들지 않는다 (예전에는 5분이 지나면 새 토큰 → 붙어 있던 휴대폰이 끊겼다)
    const again = (await B.svc.openPairing('phone'))!
    assert.notEqual(again.code, win.code)
    assert.equal(B.config().tokenHash, tokenHash)
    assert.deepEqual([B.svc.status().isQrReady, B.svc.status().pairOpen], [true, 'phone'])
    const r = await pairWithHost(createPairTransport('127.0.0.1', port), { code: again.code, clientName: '내 폰', kind: 'phone' })
    assert.equal(B.svc.status().pairOpen, null)
    assert.equal((await rawReq(port, '/v1/status', r.token)).status, 200)
    // 이 토큰으로 휴대폰이 붙었으니 QR(토큰 원문)은 거둔다
    assert.deepEqual([B.svc.status().isQrReady, B.svc.status().isTokenUsed, B.svc.qr()], [false, true, null])
  } finally {
    await B.svc.disable()
  }
})

test('피어 슬롯이 가득 차면(8개) 새 짝짓기는 409 full', { timeout: 30_000 }, async () => {
  const port = await freePort()
  const B = makeB(port)
  try {
    await B.svc.enable(port)
    // 짝짓기 속도 제한(주소당 분당 12번)에 걸리지 않게 슬롯 8개는 인증 상태에 직접 채운다
    const guard = (B.svc as unknown as { guard: { addPeerSlot(label: string, now: number): unknown } }).guard
    for (let i = 0; i < 8; i++) assert.ok(guard.addPeerSlot(`PC${i}`, Date.now()))
    assert.equal(B.svc.peerSlots().length, 8)
    const win = (await B.svc.openPairing('peer'))!
    await assert.rejects(pairWithHost(createPairTransport('127.0.0.1', port), { code: win.code, clientName: '9번째', kind: 'peer' }), (e: PairFailure) => e.code === 'full')
  } finally {
    await B.svc.disable()
  }
})

test('인증 전 짝짓기 호출은 한 주소에서 분당 12번까지만 (그 뒤는 429)', { timeout: 20_000 }, async () => {
  const port = await freePort()
  const B = makeB(port)
  try {
    await B.svc.enable(port)
    const t = createPairTransport('127.0.0.1', port)
    const codes: number[] = []
    for (let i = 0; i < 14; i++) codes.push((await t.post('/v2/pair/hello', { nonceA: 'A'.repeat(22) })).status)
    assert.deepEqual([codes.slice(0, 12).every((c) => c === 410), codes[12], codes[13]], [true, 429, 429])
  } finally {
    await B.svc.disable()
  }
})
