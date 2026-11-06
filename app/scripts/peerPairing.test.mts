// PC 간 짝짓기(설계서 1절)·주소 규칙·피어 토큰 권한 범위(8-1절)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AuthGuard, hashToken, PEER_SLOTS_MAX } from '../src/main/remote/auth.ts'
import { isPeerPathAllowed, preflight } from '../src/main/remote/handler.ts'
import { checkPairInput, clientProofOf, deriveKey, pairSalt, serverProofOf, fingerprintShort, PairFailure, PairingWindow, pairWithHost, type PairTransport } from '../src/main/peer/pairing.ts'
import { formatPairCode, isPairCode, normalizePairCode, isPeerHostAllowed, isPeerStaffId, parsePeerStaffId, peerStaffId, PEER_LIMITS } from '../src/shared/peerProtocol.ts'

const NOW = 1_800_000_000_000
const SPKI = 'sha256/' + 'A'.repeat(43) + '='

test('주소 규칙: Tailscale·사설 IPv4·*.ts.net만, 공인 IP와 그 밖의 이름은 거절', () => {
  for (const ok of ['100.64.0.1', '100.127.255.254', '10.0.0.5', '172.16.0.1', '172.31.9.9', '192.168.0.10', 'mac-b.tail1234.ts.net', 'MAC.TS.NET']) assert.equal(isPeerHostAllowed(ok), true, ok)
  for (const bad of ['8.8.8.8', '100.63.0.1', '100.128.0.1', '172.32.0.1', '192.169.0.1', '256.1.1.1', 'example.com', 'evil.ts.net.example.com', '', ' ', 'localhost', '1.2.3', 'a_b.ts.net', '-x.ts.net']) assert.equal(isPeerHostAllowed(bad), false, bad)
})

test('코드는 12자 Crockford base32(하이픈·소문자·O/I/L 보정), 원격 직원 id는 p:<피어>:<원격id>', () => {
  assert.equal(isPairCode('7M3Q-H9XK-2VTB'), true)
  assert.equal(normalizePairCode(' 7m3q-h9xk-2vtb '), '7M3QH9XK2VTB')
  assert.equal(normalizePairCode('OIL0-0000-0000'), '0110' + '00000000')
  assert.equal(formatPairCode('7M3QH9XK2VTB'), '7M3Q-H9XK-2VTB')
  for (const bad of ['123456', '7M3QH9XK2VT', '7M3QH9XK2VTBB', '7M3QH9XK2VTU', '7M3Q H9XK 2VT!', 482913, null]) assert.equal(isPairCode(bad), false, String(bad))
  const id = peerStaffId('ab12', 'uuid-1')
  assert.equal(id, 'p:ab12:uuid-1')
  assert.deepEqual(parsePeerStaffId(id), { peerId: 'ab12', remoteId: 'uuid-1' })
  assert.equal(isPeerStaffId('11111111-2222-4333-8444-555555555555'), false)
  assert.equal(parsePeerStaffId('p::x'), null)
})

test('테스트 벡터(설계서 1-4): salt·K·clientProof·serverProof가 문서와 같다', async () => {
  const nA = 'AAECAwQFBgcICQoLDA0ODw'
  const nB = 'EBESExQVFhcYGRobHB0eHw'
  const spki = 'sha256/q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s='
  const salt = pairSalt(nA, nB, spki)!
  assert.equal(salt.toString('hex'), '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f' + 'ab'.repeat(32))
  const k = await deriveKey('7M3QH9XK2VTB', salt)
  assert.equal(k.toString('hex'), 'eecc54457136acf3bc7f7dd3ab4f2b95ef43be799c31e8c5423e439bcf966238')
  const cp = clientProofOf(k, salt)
  assert.equal(cp.toString('hex'), '1c1728fc7f1a6dc43cac178fcf2a35a51690be716a2ddf965b93704dfeb37e48')
  assert.equal(serverProofOf(k, salt, cp).toString('hex'), '65767af5031f2c8c6dc71acaafe8a2c877d53cb7a557f02a5991c1e5cf4749e9')
  // 모양이 틀린 nonce·지문은 salt를 만들지 않는다
  assert.equal(pairSalt('short', nB, spki), null)
  assert.equal(pairSalt(nA, nB, 'sha256/xx'), null)
  assert.equal(fingerprintShort(SPKI), 'AAAAAAAA')
})

/** B컴 서버 흉내: 같은 PairingWindow를 PairTransport로 감싼다 (seen = 실제 본 지문) */
function fakeHost(win: PairingWindow, seen: string | null, forgeServerProof = false) {
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
      const r = await win.confirm(body)
      if (!r.ok) return { status: r.code === 'pair_closed' ? 410 : 401, body: { error: r.code, remaining: r.remaining } }
      return { status: 200, body: { token: 'T'.repeat(43), slotId: 'slot1', peerName: 'B컴', serverProof: forgeServerProof ? 'f'.repeat(64) : r.serverProof } }
    },
  }
  return { t, hits }
}

test('짝짓기 성공: 코드가 맞으면 토큰을 받고 창은 닫힌다 (코드는 1회용)', async () => {
  const win = new PairingWindow()
  const view = win.open('peer', { host: '100.64.0.2', port: 47900, spki: SPKI }, '7M3Q-H9XK-2VTB')
  assert.deepEqual([view.code, view.fingerprint, view.until], ['7M3Q-H9XK-2VTB', 'AAAAAAAA', null])
  const { t } = fakeHost(win, SPKI)
  const r = await pairWithHost(t, { code: '7M3Q-H9XK-2VTB', clientName: 'A컴', kind: 'peer' })
  assert.deepEqual([r.slotId, r.peerName, r.spki, r.fingerprint], ['slot1', 'B컴', SPKI, 'AAAAAAAA'])
  assert.equal(win.isOpen, false)
  // 같은 코드로 다시 → 닫힘
  await assert.rejects(pairWithHost(fakeHost(win, SPKI).t, { code: '7M3Q-H9XK-2VTB', clientName: 'A컴', kind: 'peer' }), (e: PairFailure) => e.code === 'closed')
})

test('틀린 코드 3번이면 창이 닫힌다 (남은 횟수를 알려 준다)', async () => {
  const win = new PairingWindow()
  win.open('peer', { host: '100.64.0.2', port: 47900, spki: SPKI }, '1111-1111-1111')
  const attempt = () => pairWithHost(fakeHost(win, SPKI).t, { code: '2222-2222-2222', clientName: 'A', kind: 'peer' })
  await assert.rejects(attempt(), (e: PairFailure) => e.code === 'wrong_code' && e.remaining === 2)
  await assert.rejects(attempt(), (e: PairFailure) => e.code === 'wrong_code' && e.remaining === 1)
  await assert.rejects(attempt(), (e: PairFailure) => e.code === 'wrong_code' && e.remaining === 0)
  assert.equal(win.isOpen, false)
  // 이제는 맞는 코드도 소용없다
  await assert.rejects(pairWithHost(fakeHost(win, SPKI).t, { code: '1111-1111-1111', clientName: 'A', kind: 'peer' }), (e: PairFailure) => e.code === 'closed')
})

test('시간 제한 없음: 창은 닫기를 눌러야 닫히고, 닫히면 hello도 받지 않는다', () => {
  const win = new PairingWindow()
  win.open('peer', { host: 'h', port: 1, spki: SPKI }, '7M3Q-H9XK-2VTB')
  assert.equal(win.view()?.until, null)
  assert.equal(win.kind, 'peer')
  assert.notEqual(win.hello('A'.repeat(22)), 'pair_closed')
  win.close()
  assert.equal(win.isOpen, false)
  assert.equal(win.kind, null)
  assert.equal(win.hello('A'.repeat(22)), 'pair_closed')
})

test('중간자: 연결에서 본 인증서 지문이 B컴이 말한 지문과 다르면 코드를 보내지 않고 중단', async () => {
  const win = new PairingWindow()
  win.open('peer', { host: 'h', port: 1, spki: SPKI }, '7M3Q-H9XK-2VTB')
  const other = 'sha256/' + 'Z'.repeat(43) + '='
  const { t, hits } = fakeHost(win, other)
  await assert.rejects(pairWithHost(t, { code: '7M3Q-H9XK-2VTB', clientName: 'A', kind: 'peer' }), (e: PairFailure) => e.code === 'spki_mismatch')
  // confirm은 보내지 않았다 (코드로 만든 proof가 가로채는 쪽에 가지 않는다)
  assert.deepEqual(hits, ['/v2/pair/hello'])
  assert.equal(win.isOpen, true)
})

const proofFor = async (code12: string, nA: string, nB: string) => {
  const salt = pairSalt(nA, nB, SPKI)!
  return clientProofOf(await deriveKey(code12, salt), salt).toString('hex')
}

test('코드 없이 만든 proof와 hello 없이 온 confirm은 실패로 센다', async () => {
  const win = new PairingWindow()
  win.open('peer', { host: 'h', port: 1, spki: SPKI }, '7M3Q-H9XK-2VTB')
  const A = 'A'.repeat(22)
  const B = 'B'.repeat(22)
  const h = win.hello(A) as { nonceB: string }
  // 코드를 모르는 중간자의 proof
  assert.deepEqual(await win.confirm({ nonceA: A, nonceB: h.nonceB, clientProof: await proofFor('000000000000', A, h.nonceB) }), { ok: false, code: 'pair_failed', remaining: 2 })
  // 다른 nonceA로 (hello에서 받은 짝이 아님)
  assert.equal((await win.confirm({ nonceA: B, nonceB: h.nonceB, clientProof: await proofFor('7M3QH9XK2VTB', B, h.nonceB) })).ok, false)
  // 모양이 틀린 값
  assert.equal((await win.confirm({})).ok, false)
  assert.equal(win.isOpen, false)
})

test('입력 검사: 연결 시도 전에 공인 IP·잘못된 코드를 막는다', () => {
  assert.throws(() => checkPairInput('8.8.8.8', '7M3Q-H9XK-2VTB'), (e: PairFailure) => e.code === 'bad_host')
  assert.throws(() => checkPairInput('100.64.0.2', '123456'), (e: PairFailure) => e.code === 'bad_code')
  assert.doesNotThrow(() => checkPairInput('100.64.0.2', '7M3Q-H9XK-2VTB'))
})

test('휴대폰용 창도 같은 길 — kind만 다르다', async () => {
  const win = new PairingWindow()
  win.open('phone', { host: 'h', port: 1, spki: SPKI }, '6543-2ABC-DEFG')
  const A = 'A'.repeat(22)
  const hello = win.hello(A) as { nonceB: string }
  const r = await win.confirm({ nonceA: A, nonceB: hello.nonceB, clientProof: await proofFor('65432ABCDEFG', A, hello.nonceB), peerLabel: '내 폰' })
  assert.equal(r.ok && r.kind, 'phone')
  assert.equal(r.ok && r.label, '내 폰')
  assert.match(r.ok ? r.serverProof : '', /^[0-9a-f]{64}$/)
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

test('가짜 서버: serverProof가 틀리면 토큰을 저장하지 않고 중단', async () => {
  const win = new PairingWindow()
  win.open('peer', { host: 'h', port: 1, spki: SPKI }, '7M3Q-H9XK-2VTB')
  await assert.rejects(pairWithHost(fakeHost(win, SPKI, true).t, { code: '7M3Q-H9XK-2VTB', clientName: 'A', kind: 'peer' }), (e: PairFailure) => e.code === 'server_proof_mismatch')
})

test('동시에 여러 confirm을 보내도 3번까지만 시험된다 (시도는 계산 전에 센다)', async () => {
  const win = new PairingWindow()
  win.open('peer', { host: 'h', port: 1, spki: SPKI }, '1111-1111-1111')
  const hs = Array.from({ length: 6 }, (_, i) => win.hello(`${String(i).repeat(22)}`) as { nonceB: string })
  const rs = await Promise.all(hs.map((h, i) => win.confirm({ nonceA: String(i).repeat(22), nonceB: h.nonceB, clientProof: '0'.repeat(64) })))
  assert.equal(rs.every((r) => !r.ok), true)
  assert.equal(win.isOpen, false)
})

test('같은 hello 짝은 한 번만 쓸 수 있다 (재전송 방지)', async () => {
  const win = new PairingWindow()
  win.open('peer', { host: 'h', port: 1, spki: SPKI }, '1111-1111-1111')
  const nA = 'A'.repeat(22)
  const h = win.hello(nA) as { nonceB: string }
  const salt = pairSalt(nA, h.nonceB, SPKI)!
  const k = await deriveKey('111111111111', salt)
  const body = { nonceA: nA, nonceB: h.nonceB, clientProof: clientProofOf(k, salt).toString('hex') }
  const first = await win.confirm(body)
  assert.equal(first.ok, true)
})
