// Tailscale 모드 테스트 — 100.64/10 판정, 상태 감지, 설정 넘겨받기, QR ts, UPnP 미호출, 100.x가 아닌 연결은 TLS 전에 거절
import assert from 'node:assert/strict'
import net from 'node:net'
import { test } from 'node:test'
import { createSelfSignedCert } from '../src/main/remote/cert.ts'
import { detectTailscale, isTailscaleClient, parseTailscaleStatus, pickTailscaleAddress, tailscaleCliPaths } from '../src/main/remote/lan.ts'
import { isTailscaleAddress, isValidQrPayload, qrText } from '../src/main/remote/qr.ts'
import { RemoteServer } from '../src/main/remote/server.ts'
import { DEFAULT_REMOTE_CONFIG, RemoteService, type RemoteConfig, type RemoteDeps } from '../src/main/remote/service.ts'

const iface = (address: string, over: Record<string, unknown> = {}) => ({ address, family: 'IPv4', internal: false, mac: 'aa:bb:cc:00:11:22', netmask: '255.255.255.0', cidr: null, ...over }) as any
const base = { v: 1, host: '100.101.102.103', port: 47900, token: 'a'.repeat(43), spki: 'sha256/' + 'A'.repeat(43) + '=' }

test('Tailscale 주소 판정: 100.64.0.0 ~ 100.127.255.255만', () => {
  for (const ip of ['100.64.0.0', '100.101.102.103', '100.127.255.255', '::ffff:100.64.1.1']) assert.equal(isTailscaleClient(ip), true, ip)
  for (const ip of ['100.63.255.255', '100.128.0.0', '99.64.0.1', '101.64.0.1', '192.168.0.20', '10.0.0.1', '8.8.8.8', '127.0.0.1', '::1', 'fd7a:115c:a1e0::1', '100.64.0.256', '']) assert.equal(isTailscaleClient(ip), false, ip)
  assert.equal(isTailscaleAddress('100.64.0.1'), true)
  assert.equal(isTailscaleAddress('100.64.0'), false)
})

test('카드에서 Tailscale 주소 고르기', () => {
  assert.equal(pickTailscaleAddress({ en0: [iface('192.168.0.20')], utun5: [iface('100.101.102.103')] }), '100.101.102.103')
  assert.equal(pickTailscaleAddress({ en0: [iface('192.168.0.20')], lo0: [iface('127.0.0.1', { internal: true })] }), null)
})

test('상태 감지: CLI 결과와 카드 주소로 4가지 상태, CLI가 없으면 주소만으로 판단', () => {
  const ts = { utun5: [iface('100.101.102.103')] }
  const none = { en0: [iface('192.168.0.20')] }
  const cli = (j: object) => ({ kind: 'ok' as const, out: JSON.stringify(j) })
  const run = detectTailscale(none, cli({ BackendState: 'Running', Self: { TailscaleIPs: ['fd7a:115c:a1e0::1', '100.90.1.2'], DNSName: 'pc.tail1234.ts.net.' } }))
  assert.deepEqual(run, { state: 'running', address: '100.90.1.2', name: 'pc.tail1234.ts.net' })
  assert.equal(detectTailscale(none, cli({ BackendState: 'NeedsLogin' })).state, 'needsLogin')
  assert.equal(detectTailscale(none, cli({ BackendState: 'Stopped' })).state, 'stopped')
  assert.equal(detectTailscale(none, cli({ BackendState: 'Running', Self: { TailscaleIPs: [] } })).state, 'stopped')
  // CLI 없음/실패/깨진 출력 → 주소만으로
  assert.deepEqual(detectTailscale(ts, { kind: 'missing' }), { state: 'running', address: '100.101.102.103', name: null })
  assert.equal(detectTailscale(ts, { kind: 'failed' }).state, 'running')
  assert.equal(detectTailscale(ts, { kind: 'ok', out: 'garbage' }).state, 'running')
  assert.equal(detectTailscale(none, { kind: 'missing' }).state, 'notInstalled')
  assert.equal(detectTailscale(none, { kind: 'failed' }).state, 'stopped')
  assert.equal(parseTailscaleStatus('{}'), null)
})

test('CLI 경로: 맥·윈도우 후보', () => {
  assert.deepEqual(tailscaleCliPaths('darwin'), ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'])
  assert.deepEqual(tailscaleCliPaths('win32', { ProgramFiles: 'D:\\Programs' }), ['tailscale', 'D:\\Programs\\Tailscale\\tailscale.exe'])
  assert.deepEqual(tailscaleCliPaths('linux'), ['tailscale'])
})

test('QR: ts 필드 — true일 때만 들어가고, host는 100.x, lan·lo와 함께 못 씀', () => {
  assert.equal(JSON.parse(qrText({ ...base, pv: 2, ts: true })).ts, true)
  assert.equal('ts' in JSON.parse(qrText(base)), false)
  assert.equal(isValidQrPayload({ ...base, ts: true }), true)
  assert.equal(isValidQrPayload(base), true)
  assert.equal(isValidQrPayload({ ...base, ts: false }), false)
  assert.equal(isValidQrPayload({ ...base, host: '192.168.0.20', ts: true }), false)
  assert.equal(isValidQrPayload({ ...base, host: 'pc.tail1234.ts.net', ts: true }), false)
  assert.equal(isValidQrPayload({ ...base, ts: true, lan: '192.168.0.20' }), false)
  assert.equal(isValidQrPayload({ ...base, ts: true, lo: true }), false)
})

// ── 서버: 100.x가 아닌 연결은 TLS 전에 끊김 ───────────────
test('서버: Tailscale 판정을 걸면 100.x가 아닌 주소(루프백 포함)는 TLS 없이 끊긴다', async () => {
  const { keyPem, certPem } = createSelfSignedCert()
  const server = new RemoteServer()
  const port = await server.start({ keyPem, certPem, port: 0, host: '127.0.0.1', handle: () => ({ status: 200, headers: {}, body: {} }), isAllowed: isTailscaleClient })
  const r = await new Promise<{ closed: boolean; got: number }>((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    let got = 0
    s.on('data', (d) => (got += d.length))
    s.on('close', () => resolve({ closed: true, got }))
    s.on('error', () => {})
    s.write('x')
    setTimeout(() => resolve({ closed: false, got }), 1500)
  })
  assert.equal(r.closed, true)
  assert.equal(r.got, 0)
  await server.stop()
})

// ── 서비스 ─────────────────────────────────────────────
const upnpCalls: string[] = []
const fakeUpnp: NonNullable<RemoteDeps['upnp']> = {
  find: async () => (upnpCalls.push('find'), { localAddress: '192.168.0.20' } as any),
  add: async () => void upnpCalls.push('add'),
  remove: async () => void upnpCalls.push('remove'),
  external: async () => '203.0.113.5',
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port
      s.close(() => resolve(port))
    })
  })
}

function make(saved: Partial<RemoteConfig>, ifaces: () => any, over: Partial<RemoteDeps> = {}) {
  let config: Partial<RemoteConfig> = saved
  let keys: any = null
  const svc = new RemoteService({
    office: {} as any,
    serverVersion: '0',
    loadConfig: () => config,
    saveConfig: (c) => (config = c),
    loadKeys: () => keys,
    saveKeys: (k) => (keys = k),
    alert: () => {},
    changed: () => {},
    upnp: fakeUpnp,
    listenHost: '127.0.0.1',
    networkInterfaces: ifaces,
    gateway: async () => '192.168.0.1',
    tailscaleCli: async () => ({ kind: 'missing' }),
    networkWatchMs: 60_000,
    ...over,
  })
  return { svc, config: () => config }
}

const tsNic = { en0: [iface('192.168.0.20')], utun5: [iface('100.101.102.103')] }
const wifi = { en0: [iface('192.168.0.20')] }
const old = { isEnabled: true, port: 47900, host: '', tokenHash: 'x', revoked: [], isTokenUsed: true }

test('설정 넘겨받기: 신규=tailscale, 예전=쓰던 방식 유지 + 안내 1회, 저장된 mode는 그대로', () => {
  const fresh = make({}, () => wifi).svc.status()
  assert.equal(fresh.mode, 'tailscale')
  assert.equal(fresh.isTsNoticePending, false)
  const router = make(old, () => wifi)
  assert.equal(router.svc.status().mode, 'router')
  assert.equal(router.svc.status().isTsNoticePending, true)
  assert.equal(router.svc.dismissTsNotice().isTsNoticePending, false)
  assert.equal(router.config().isTsNoticeSeen, true)
  const lan = make({ ...old, lanOnly: true }, () => wifi).svc.status()
  assert.equal(lan.mode, 'lan')
  assert.equal(lan.lanOnly, true)
  assert.equal(lan.isTsNoticePending, true)
  assert.equal(make({ ...old, mode: 'tailscale', lanOnly: false }, () => wifi).svc.status().mode, 'tailscale')
})

test('Tailscale 모드: UPnP 안 부름, 100.x에만 열고, QR에 ts가 들어가며 lan·lo는 없음, hello는 ts·tsHost', async () => {
  upnpCalls.length = 0
  const port = await freePort()
  const { svc, config } = make({ port, mode: 'tailscale' }, () => tsNic)
  await svc.enable(port)
  await new Promise((r) => setTimeout(r, 50))
  assert.deepEqual(upnpCalls, [])
  const st = svc.status()
  assert.equal(st.isListening, true)
  assert.equal(st.tsState, 'running')
  assert.equal(st.tsAddress, '100.101.102.103')
  assert.equal(st.connectHost, '100.101.102.103')
  assert.equal(st.upnp.state, 'off')
  svc.setHost('example.com')
  assert.equal(svc.status().connectHost, '100.101.102.103')
  const qr = svc.qr()
  assert.ok(qr)
  assert.equal(qr.host, '100.101.102.103')
  assert.equal(qr.lan, null)
  assert.equal(config().mode, 'tailscale')
  assert.equal(config().lanOnly, false)
  await svc.disable()
})

test('Tailscale 모드: 100.x 주소가 없으면 열지 않고 기다리다가, 주소가 생기면 자동으로 연다 (토큰 유지)', async () => {
  let nics: any = wifi
  const port = await freePort()
  const { svc, config } = make({ port, mode: 'tailscale' }, () => nics, { tailscaleCli: async () => ({ kind: 'ok', out: JSON.stringify({ BackendState: nics === wifi ? 'NeedsLogin' : 'Running' }) }) })
  await svc.enable(port)
  assert.equal(svc.status().isListening, false)
  assert.equal(svc.status().error, 'no_network')
  assert.equal(svc.status().tsState, 'needsLogin')
  const token = config().tokenHash
  assert.equal(svc.qr(), null)
  nics = tsNic
  const st = await svc.refreshTailscale()
  assert.equal(st.isListening, true)
  assert.equal(st.error, null)
  assert.equal(st.tsState, 'running')
  assert.equal(config().tokenHash, token)
  // 주소가 바뀌면 다시 바인딩
  nics = { utun5: [iface('100.90.0.5')] }
  assert.equal((await svc.refreshTailscale()).tsAddress, '100.90.0.5')
  assert.equal(svc.status().isListening, true)
  await svc.disable()
})

test('Tailscale 모드: 100.x가 아닌 주소에서 온 연결은 TLS 전에 끊긴다 (서비스 경유)', async () => {
  const port = await freePort()
  const { svc } = make({ port, mode: 'tailscale' }, () => tsNic)
  await svc.enable(port)
  const r = await new Promise<{ closed: boolean; got: number }>((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    let got = 0
    s.on('data', (d) => (got += d.length))
    s.on('close', () => resolve({ closed: true, got }))
    s.on('error', () => {})
    s.write('x')
    setTimeout(() => resolve({ closed: false, got }), 1500)
  })
  assert.deepEqual(r, { closed: true, got: 0 })
  assert.equal(svc.status().lockedUntil, null)
  assert.equal(svc.status().recentAccess.length, 0)
  await svc.disable()
})

test('모드 전환: router→tailscale은 매핑을 닫고, tailscale→router는 UPnP를 다시 시도, 앱 시작 시 tailscale이면 이전 매핑을 닫는다', async () => {
  const port = await freePort()
  upnpCalls.length = 0
  const { svc, config } = make({ port, ...DEFAULT_REMOTE_CONFIG, mode: 'router' }, () => tsNic)
  await svc.enable(port)
  await new Promise((r) => setTimeout(r, 50))
  assert.deepEqual(upnpCalls.slice(0, 2), ['find', 'add'])
  upnpCalls.length = 0
  await svc.setMode('tailscale')
  assert.deepEqual(upnpCalls, ['remove'])
  assert.equal(svc.status().mode, 'tailscale')
  assert.equal(svc.status().isListening, true)
  assert.equal(config().lanOnly, false)
  upnpCalls.length = 0
  await svc.setMode('router')
  await new Promise((r) => setTimeout(r, 50))
  assert.deepEqual(upnpCalls.slice(0, 2), ['find', 'add'])
  await svc.setMode('lan')
  assert.equal(config().lanOnly, true)
  await svc.disable()
  upnpCalls.length = 0
  await make({ port, mode: 'tailscale' }, () => tsNic).svc.init()
  assert.deepEqual(upnpCalls, ['find', 'remove'])
})
