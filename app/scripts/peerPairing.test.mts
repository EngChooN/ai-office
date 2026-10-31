// PC 간 짝짓기(설계서 1절)·주소 규칙·피어 토큰 권한 범위(8-1절)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AuthGuard, hashToken, PEER_SLOTS_MAX } from '../src/main/remote/auth.ts'
import { isPeerPathAllowed, preflight } from '../src/main/remote/handler.ts'
import { checkPairInput, fingerprintShort, PairFailure, pairProof, PairingWindow, pairWithHost, type PairTransport } from '../src/main/peer/pairing.ts'
import { isPairCode, isPeerHostAllowed, isPeerStaffId, parsePeerStaffId, peerStaffId, PEER_LIMITS } from '../src/shared/peerProtocol.ts'

const NOW = 1_800_000_000_000
const SPKI = 'sha256/' + 'A'.repeat(43) + '='

test('주소 규칙: Tailscale·사설 IPv4·*.ts.net만, 공인 IP와 그 밖의 이름은 거절', () => {
  for (const ok of ['100.64.0.1', '100.127.255.254', '10.0.0.5', '172.16.0.1', '172.31.9.9', '192.168.0.10', 'mac-b.tail1234.ts.net', 'MAC.TS.NET']) assert.equal(isPeerHostAllowed(ok), true, ok)
  for (const bad of ['8.8.8.8', '100.63.0.1', '100.128.0.1', '172.32.0.1', '192.169.0.1', '256.1.1.1', 'example.com', 'evil.ts.net.example.com', '', ' ', 'localhost', '1.2.3', 'a_b.ts.net', '-x.ts.net']) assert.equal(isPeerHostAllowed(bad), false, bad)
})

test('코드는 숫자 6자리, 원격 직원 id는 p:<피어>:<원격id>', () => {
  assert.equal(isPairCode('482913'), true)
  for (const bad of ['48291', '4829133', 'abcdef', '48 913', 482913, null]) assert.equal(isPairCode(bad), false)
  const id = peerStaffId('ab12', 'uuid-1')
  assert.equal(id, 'p:ab12:uuid-1')
  assert.deepEqual(parsePeerStaffId(id), { peerId: 'ab12', remoteId: 'uuid-1' })
  assert.equal(isPeerStaffId('11111111-2222-4333-8444-555555555555'), false)
  assert.equal(parsePeerStaffId('p::x'), null)
})

test('proof는 코드·nonce·지문에 모두 묶인다 (하나라도 다르면 다른 값)', () => {
  const base = pairProof('123456', 'nonceA', 'nonceB', SPKI)
  assert.match(base, /^[0-9a-f]{64}$/)
  assert.equal(base, pairProof('123456', 'nonceA', 'nonceB', SPKI))
  for (const other of [pairProof('123457', 'nonceA', 'nonceB', SPKI), pairProof('123456', 'nonceX', 'nonceB', SPKI), pairProof('123456', 'nonceA', 'nonceY', SPKI), pairProof('123456', 'nonceA', 'nonceB', 'sha256/' + 'B'.repeat(43) + '=')]) assert.notEqual(base, other)
  assert.equal(fingerprintShort(SPKI), 'AAAAAAAA')
})

/** B컴 서버 흉내: 같은 PairingWindow를 PairTransport로 감싼다 (seen = 실제 본 지문) */
function fakeHost(win: PairingWindow, seen: string | null) {
  const hits: string[] = []
  const t: PairTransport = {
    seenSpki: () => seen,
    post: async (path, body) => {
      hits.push(path)
      if (path === '/v2/pair/hello') {
        const h = win.hello(body.nonceA)
        if (h === 'pair_closed') return { status: 410, body: { error: 'pair_closed' } }
        if (h === 'invalid') return { status: 400, body: {} }
        return { status: 200, body: { ...h } }
      }
      const r = win.confirm(body)
      if (!r.ok) return { status: r.code === 'pair_closed' ? 410 : 401, body: { error: r.code, remaining: r.remaining } }
      return { status: 200, body: { token: 'T'.repeat(43), slotId: 'slot1', peerName: 'B컴' } }
    },
  }
  return { t, hits }
}

test('짝짓기 성공: 코드가 맞으면 토큰을 받고 창은 닫힌다 (코드는 1회용)', async () => {
  const win = new PairingWindow({ now: () => NOW })
  const view = win.open('peer', { host: '100.64.0.2', port: 47900, spki: SPKI }, '482913')
  assert.deepEqual([view.code, view.fingerprint, view.until], ['482913', 'AAAAAAAA', NOW + PEER_LIMITS.pairWindowMs])
  const { t } = fakeHost(win, SPKI)
  const r = await pairWithHost(t, { code: '482913', clientName: 'A컴', kind: 'peer' })
  assert.deepEqual([r.slotId, r.peerName, r.spki, r.fingerprint], ['slot1', 'B컴', SPKI, 'AAAAAAAA'])
  assert.equal(win.isOpen, false)
  // 같은 코드로 다시 → 닫힘
  await assert.rejects(pairWithHost(fakeHost(win, SPKI).t, { code: '482913', clientName: 'A컴', kind: 'peer' }), (e: PairFailure) => e.code === 'closed')
})

test('틀린 코드 3번이면 창이 닫힌다 (남은 횟수를 알려 준다)', async () => {
  const win = new PairingWindow({ now: () => NOW })
  win.open('peer', { host: '100.64.0.2', port: 47900, spki: SPKI }, '111111')
  const attempt = () => pairWithHost(fakeHost(win, SPKI).t, { code: '222222', clientName: 'A', kind: 'peer' })
  await assert.rejects(attempt(), (e: PairFailure) => e.code === 'wrong_code' && e.remaining === 2)
  await assert.rejects(attempt(), (e: PairFailure) => e.code === 'wrong_code' && e.remaining === 1)
  await assert.rejects(attempt(), (e: PairFailure) => e.code === 'wrong_code' && e.remaining === 0)
  assert.equal(win.isOpen, false)
  // 이제는 맞는 코드도 소용없다
  await assert.rejects(pairWithHost(fakeHost(win, SPKI).t, { code: '111111', clientName: 'A', kind: 'peer' }), (e: PairFailure) => e.code === 'closed')
})

test('5분이 지나면 창이 닫힌다', () => {
  let now = NOW
  const win = new PairingWindow({ now: () => now })
  win.open('peer', { host: 'h', port: 1, spki: SPKI }, '123456')
  now += PEER_LIMITS.pairWindowMs - 1
  assert.equal(win.isOpen, true)
  now += 2
  assert.equal(win.isOpen, false)
  assert.equal(win.hello('A'.repeat(20)), 'pair_closed')
})

test('중간자: 연결에서 본 인증서 지문이 B컴이 말한 지문과 다르면 코드를 보내지 않고 중단', async () => {
  const win = new PairingWindow({ now: () => NOW })
  win.open('peer', { host: 'h', port: 1, spki: SPKI }, '123456')
  const other = 'sha256/' + 'Z'.repeat(43) + '='
  const { t, hits } = fakeHost(win, other)
  await assert.rejects(pairWithHost(t, { code: '123456', clientName: 'A', kind: 'peer' }), (e: PairFailure) => e.code === 'spki_mismatch')
  // confirm은 보내지 않았다 (코드로 만든 proof가 가로채는 쪽에 가지 않는다)
  assert.deepEqual(hits, ['/v2/pair/hello'])
  assert.equal(win.isOpen, true)
})

test('proof를 코드 없이 만든 요청과 hello 없이 온 confirm은 실패로 센다', () => {
  const win = new PairingWindow({ now: () => NOW })
  win.open('peer', { host: 'h', port: 1, spki: SPKI }, '123456')
  const h = win.hello('A'.repeat(20)) as { nonceB: string }
  // 코드를 모르는 중간자의 proof
  assert.deepEqual(win.confirm({ nonceA: 'A'.repeat(20), nonceB: h.nonceB, proof: pairProof('000000', 'A'.repeat(20), h.nonceB, SPKI) }), { ok: false, code: 'pair_failed', remaining: 2 })
  // 다른 nonceA로 (hello에서 받은 짝이 아님)
  assert.equal(win.confirm({ nonceA: 'B'.repeat(20), nonceB: h.nonceB, proof: pairProof('123456', 'B'.repeat(20), h.nonceB, SPKI) }).ok, false)
  // 모양이 틀린 값
  assert.equal(win.confirm({}).ok, false)
  assert.equal(win.isOpen, false)
})

test('입력 검사: 연결 시도 전에 공인 IP·잘못된 코드를 막는다', () => {
  assert.throws(() => checkPairInput('8.8.8.8', '123456'), (e: PairFailure) => e.code === 'bad_host')
  assert.throws(() => checkPairInput('100.64.0.2', '12345'), (e: PairFailure) => e.code === 'bad_code')
  assert.doesNotThrow(() => checkPairInput('100.64.0.2', '123456'))
})

test('휴대폰용 창도 같은 길 — kind만 다르다', async () => {
  const win = new PairingWindow({ now: () => NOW })
  win.open('phone', { host: 'h', port: 1, spki: SPKI }, '654321')
  const hello = win.hello('A'.repeat(20)) as { nonceB: string }
  const r = win.confirm({ nonceA: 'A'.repeat(20), nonceB: hello.nonceB, proof: pairProof('654321', 'A'.repeat(20), hello.nonceB, SPKI), peerLabel: '내 폰' })
  assert.deepEqual(r, { ok: true, kind: 'phone', label: '내 폰' })
})

// ── 피어 토큰 슬롯과 권한 범위 ──

const slotGuard = () => new AuthGuard({ tokenHash: null, revoked: [] })

test('슬롯: 피어 토큰은 해시만 저장되고 휴대폰 토큰과 따로 인증된다', () => {
  const g = slotGuard()
  const phone = g.rotate().token
  const made = g.addPeerSlot('디자인 맥', NOW)!
  assert.equal(g.current.peers![0].tokenHash, hashToken(made.token))
  assert.equal(JSON.stringify(g.current).includes(made.token), false)
  assert.deepEqual(g.check(phone, '1.1.1.1', NOW), { ok: true, slot: 'phone' })
  assert.deepEqual(g.check(made.token, '1.1.1.1', NOW), { ok: true, slot: `peer:${made.slot.id}` })
  assert.equal(g.current.peers![0].lastSeenAt, NOW)
  assert.equal(g.isValidHash(hashToken(made.token)), true)
  assert.equal(g.peerSlotOf(hashToken(phone)), null)
})

test('휴대폰 QR 재발급은 피어를 끊지 않고, 슬롯을 지우면 그 토큰만 token_revoked', () => {
  const g = slotGuard()
  g.rotate()
  const a = g.addPeerSlot('A', NOW)!
  const b = g.addPeerSlot('B', NOW)!
  g.rotate()
  assert.equal(g.check(a.token, '1.1.1.1', NOW).ok, true)
  assert.ok(g.removePeerSlot(a.slot.id))
  assert.deepEqual(g.check(a.token, '1.1.1.1', NOW), { ok: false, code: 'token_revoked' })
  assert.equal(g.check(b.token, '1.1.1.1', NOW).ok, true)
  assert.equal(g.removePeerSlot('nope'), null)
})

test('슬롯은 최대 8개, 같은 IP의 틀린 시도 잠금은 슬롯과 상관없이 그대로', () => {
  const g = slotGuard()
  g.rotate()
  for (let i = 0; i < PEER_SLOTS_MAX; i++) assert.ok(g.addPeerSlot(`p${i}`, NOW))
  assert.equal(g.addPeerSlot('9th', NOW), null)
  for (let i = 0; i < 5; i++) g.check('wrong-token-but-well-formed', '9.9.9.9', NOW)
  const first = g.current.peers![0]
  assert.equal(g.check('x', '9.9.9.9', NOW).ok, false)
  assert.equal((g.check(first.tokenHash, '9.9.9.9', NOW) as { code?: string }).code, 'auth_locked')
})

test('속도 제한은 토큰 칸마다 따로 센다', () => {
  const g = slotGuard()
  g.rotate()
  const a = g.addPeerSlot('A', NOW)!
  for (let i = 0; i < 300; i++) assert.equal(g.rateLimit(NOW, `peer:${a.slot.id}`), null)
  assert.ok(g.rateLimit(NOW, `peer:${a.slot.id}`)! > 0)
  assert.equal(g.rateLimit(NOW, 'phone'), null)
})

test('preflight: 피어 토큰은 허용 목록 밖 경로(v1·/v2/attachments·/v2/files…)에서 403 scope_denied', () => {
  const g = slotGuard()
  const phone = g.rotate().token
  const peer = g.addPeerSlot('B', NOW)!.token
  const run = (url: string, token: string) => preflight({ url, authorization: `Bearer ${token}`, ip: '1.1.1.1' }, { guard: g, now: NOW, isReady: true })
  const allowed = ['/v2/events', '/v2/call', '/v2/peer/jobs', '/v2/peer/staff', '/v2/peer/jobs/abc/cancel']
  const denied = ['/v1/status', '/v1/decisions', '/v1/instructions', '/v1/decisions/x', '/v2/attachments', '/v2/files/11111111-2222-4333-8444-555555555555', '/v2/other', '/v2/pair/hello']
  for (const u of allowed) assert.equal(run(u, peer), null, u)
  for (const u of denied) assert.equal(run(u, peer)?.body.error, 'scope_denied', u)
  // 휴대폰 토큰은 그대로 (v1·v2 모두)
  for (const u of [...allowed, '/v1/status', '/v2/attachments']) assert.equal(run(u, phone), null, u)
  assert.equal(isPeerPathAllowed('/v2/peerx'), false)
})
