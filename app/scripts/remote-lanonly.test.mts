// 같은 네트워크 전용 모드 + 대역 필터 테스트 — 기본값 분기, 대역·게이트웨이 판정, UPnP 미호출, TLS 전 차단, QR·hello, 주소 변경
import assert from 'node:assert/strict'
import net from 'node:net'
import { test } from 'node:test'
import { createSelfSignedCert } from '../src/main/remote/cert.ts'
import { isAllowedClient, parseLinuxGateway, parseMacGateway, parseWindowsGateway, pickLanAddress } from '../src/main/remote/lan.ts'
import { qrText } from '../src/main/remote/qr.ts'
import { DEFAULT_REMOTE_CONFIG, RemoteService, type RemoteConfig, type RemoteDeps } from '../src/main/remote/service.ts'
import { RemoteServer } from '../src/main/remote/server.ts'

const iface = (address: string, over: Record<string, unknown> = {}) => ({ address, family: 'IPv4', internal: false, mac: 'aa:bb:cc:00:11:22', netmask: '255.255.255.0', cidr: null, ...over }) as any

test('대역 판정: 사설 대역(VPN 포함)·루프백만 허용, 밖과 공유기는 거절', () => {
  const gw = '192.168.0.1'
  for (const ip of ['192.168.0.20', '10.1.2.3', '172.16.0.5', '172.31.255.1', '127.0.0.1', '::1', '::ffff:192.168.0.20', '::ffff:127.0.0.1']) assert.equal(isAllowedClient(ip, gw), true, ip)
  for (const ip of ['203.0.113.7', '8.8.8.8', '172.32.0.1', '172.15.0.1', '100.64.0.1', '169.254.1.1', '::ffff:203.0.113.7', 'fe80::1', '2001:db8::1', '']) assert.equal(isAllowedClient(ip, gw), false, ip)
  assert.equal(isAllowedClient('192.168.0.1', gw), false)
  assert.equal(isAllowedClient('::ffff:192.168.0.1', gw), false)
  // 게이트웨이를 못 읽으면 거절 없이 사설 대역만
  assert.equal(isAllowedClient('192.168.0.1', null), true)
  assert.equal(isAllowedClient('203.0.113.7', null), false)
})

test('게이트웨이 읽기: 맥·윈도우·리눅스 출력 해석', () => {
  assert.equal(parseMacGateway('   route to: default\ndestination: default\n       mask: default\n    gateway: 192.168.0.1\n  interface: en0\n'), '192.168.0.1')
  assert.equal(parseMacGateway('route: writing to routing socket: not in table'), null)
  const win = 'Network Destination        Netmask          Gateway       Interface  Metric\n          0.0.0.0          0.0.0.0     192.168.0.1    192.168.0.20     35\n          0.0.0.0          0.0.0.0       10.0.0.1       10.0.0.9     5\n'
  assert.equal(parseWindowsGateway(win), '10.0.0.1')
  assert.equal(parseWindowsGateway('없음'), null)
  assert.equal(parseLinuxGateway('default via 192.168.1.1 dev eth0 proto dhcp'), '192.168.1.1')
})

test('내부 주소 고르기: VPN·가상 카드보다 실제 카드를 먼저', () => {
  const vpn = iface('10.8.0.2', { mac: '00:00:00:00:00:00' })
  assert.equal(pickLanAddress({ utun4: [vpn], en0: [iface('192.168.0.20')] }), '192.168.0.20')
  assert.equal(pickLanAddress({ 'Tailscale': [iface('10.9.0.2')], 'Wi-Fi': [iface('172.20.1.5')] }), '172.20.1.5')
  assert.equal(pickLanAddress({ utun4: [vpn] }), '10.8.0.2')
  assert.equal(pickLanAddress({ en0: [iface('203.0.113.7')], lo0: [iface('127.0.0.1', { internal: true })] }), null)
})

test('QR: 전용 모드면 lo:true가 들어가고 PROTOCOL 버전은 그대로', () => {
  const { certPem } = createSelfSignedCert()
  const base = { v: 1, host: '192.168.0.20', port: 47900, token: 'a'.repeat(43), spki: 'sha256/' + 'A'.repeat(43) + '=' }
  assert.equal(JSON.parse(qrText({ ...base, lo: true })).lo, true)
  assert.equal('lo' in JSON.parse(qrText(base)), false)
  assert.ok(certPem)
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
    networkWatchMs: 60_000,
    ...over,
  })
  return { svc, config: () => config }
}

const wifi = { en0: [iface('192.168.0.20')] }

test('기본값 분기: 저장된 설정이 없으면 Tailscale 모드 + 안내 없음, 예전 설정은 해제 + 안내 대기', () => {
  // 신규 설치의 기본은 Tailscale 모드 (lanOnly는 false)
  assert.equal(make({}, () => wifi).svc.status().mode, 'tailscale')
  assert.equal(make({}, () => wifi).svc.status().lanOnly, false)
  assert.equal(make({}, () => wifi).svc.status().isLanNoticePending, false)
  const old = make({ isEnabled: true, port: 47900, host: '', tokenHash: 'x', revoked: [], isTokenUsed: true }, () => wifi)
  assert.equal(old.svc.status().lanOnly, false)
  assert.equal(old.svc.status().isLanNoticePending, true)
  assert.equal(old.svc.dismissLanNotice().isLanNoticePending, false)
  assert.equal(old.config().isLanNoticeSeen, true)
  assert.equal(make({ ...DEFAULT_REMOTE_CONFIG, lanOnly: true }, () => wifi).svc.status().lanOnly, true)
})

test('전용 모드: UPnP를 부르지 않고, 주소는 내부 주소만 쓰며, QR에 lo가 들어간다', async () => {
  upnpCalls.length = 0
  const port = await freePort()
  const { svc } = make({ port, lanOnly: true }, () => wifi)
  await svc.enable(port)
  await new Promise((r) => setTimeout(r, 50))
  assert.deepEqual(upnpCalls, [])
  const st = svc.status()
  assert.equal(st.isListening, true)
  assert.equal(st.connectHost, '192.168.0.20')
  assert.equal(st.upnp.state, 'off')
  svc.setHost('example.com')
  assert.equal(svc.status().connectHost, '192.168.0.20')
  assert.ok(svc.qr())
  await svc.disable()
})

test('앱 시작: 전용 모드면 이전 실행의 포트 매핑을 한 번 닫고, 아니면 건드리지 않는다', async () => {
  const port = await freePort()
  upnpCalls.length = 0
  await make({ port, lanOnly: true }, () => wifi).svc.init()
  assert.deepEqual(upnpCalls, ['find', 'remove'])
  upnpCalls.length = 0
  await make({ port, ...DEFAULT_REMOTE_CONFIG, lanOnly: false }, () => wifi).svc.init()
  assert.deepEqual(upnpCalls, [])
  // 공유기가 없거나 거부해도 시작은 멈추지 않는다
  const failing = { ...fakeUpnp, find: async () => { throw new Error('x') } }
  await make({ port, lanOnly: true }, () => wifi, { upnp: failing }).svc.init()
})

test('전용 모드를 끄면 공유기 포트를 시도하고, 켜면 열린 매핑을 닫는다', async () => {
  upnpCalls.length = 0
  const port = await freePort()
  const { svc } = make({ port, ...DEFAULT_REMOTE_CONFIG, lanOnly: false }, () => wifi)
  await svc.enable(port)
  await new Promise((r) => setTimeout(r, 50))
  assert.deepEqual(upnpCalls.slice(0, 2), ['find', 'add'])
  assert.equal(svc.status().upnp.state, 'ok')
  upnpCalls.length = 0
  await svc.setLanOnly(true)
  assert.deepEqual(upnpCalls, ['remove'])
  assert.equal(svc.status().upnp.state, 'off')
  assert.equal(svc.status().lanOnly, true)
  assert.equal(svc.status().isListening, true)
  upnpCalls.length = 0
  await svc.setLanOnly(false)
  await new Promise((r) => setTimeout(r, 50))
  assert.deepEqual(upnpCalls.slice(0, 2), ['find', 'add'])
  await svc.disable()
})

test('서버: 허용하지 않은 주소는 TLS 전에 끊긴다 (연결 수·잠금에도 안 셈)', async () => {
  const { keyPem, certPem } = createSelfSignedCert()
  const server = new RemoteServer()
  const seen: string[] = []
  const port = await server.start({ keyPem, certPem, port: 0, host: '127.0.0.1', handle: () => ({ status: 200, headers: {}, body: {} }), isAllowed: (ip) => (seen.push(ip), false) })
  const closed = await new Promise<boolean>((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.on('close', () => resolve(true))
    s.on('error', () => {})
    s.write('x')
    setTimeout(() => resolve(false), 1500)
  })
  assert.equal(closed, true)
  assert.ok(seen.length >= 1)
  await server.stop()
})

test('주소 변경: 카드 주소가 바뀌면 새 주소로 다시 열고 토큰은 유지', async () => {
  let current: any = wifi
  const port = await freePort()
  const { svc, config } = make({ port, lanOnly: true }, () => current)
  await svc.enable(port)
  const token = config().tokenHash
  assert.ok(token)
  current = { en0: [iface('10.0.0.7')] }
  assert.equal(svc.status().connectHost, '10.0.0.7')
  await svc.checkNetwork()
  assert.equal(config().tokenHash, token)
  current = {}
  await svc.checkNetwork()
  assert.equal(svc.status().error, 'no_network')
  assert.equal(svc.status().isListening, false)
  await svc.disable()
})
