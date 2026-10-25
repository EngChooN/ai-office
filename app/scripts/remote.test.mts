// 원격 API(프로토콜 v1) 테스트 — pnpm test
// 순수 처리(handleRequest)와 실제 HTTPS 서버를 함께 확인한다: 기본 꺼짐, 4종 외 거절, 401 세 종류, 잠금, 끄면 포트가 닫힘
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import { test } from 'node:test'
import { AUTH_LIMITS, AuthGuard, bearerToken, hashToken, newToken, sameHash } from '../src/main/remote/auth.ts'
import { createSelfSignedCert, spkiFingerprint } from '../src/main/remote/cert.ts'
import { handleRequest, type RemoteOfficePort, type RemoteRequest } from '../src/main/remote/handler.ts'
import { BODY_MAX_BYTES, decisionsBody, FREE_ACTIVITY, remoteActivity, statusBody } from '../src/main/remote/protocol.ts'
import { MAX_CONNECTIONS, MAX_CONNECTIONS_PER_ADDRESS, RemoteServer } from '../src/main/remote/server.ts'
import { AVATAR_LIMIT, canonicalAvatar, decodeLook } from '../src/shared/look.ts'
import { isLanAddress, isValidQrPayload, lanForQr, qrImage, qrText } from '../src/main/remote/qr.ts'
import { DEFAULT_REMOTE_CONFIG, RemoteService, SHUTDOWN_WAIT_MS, type RemoteConfig, type RemoteDeps } from '../src/main/remote/service.ts'
import { isCarrierShared, isGatewayLocation, isPrivateIpv4, parseIgdDescription, parseSsdpLocation, request as upnpRequest, RESPONSE_MAX_BYTES, soapEnvelope, soapValue } from '../src/main/remote/upnp.ts'

const NOW = 1_800_000_000_000
const IP = '203.0.113.7'

// ── 가짜 사무실 ────────────────────────────────────────
function makeStaff(over: Record<string, unknown> = {}) {
  return {
    id: 'kim',
    kind: 'hired',
    name: '김기획',
    role: '기획자',
    avatar: 3,
    model: 'default',
    cwd: '/Users/me/secret-project',
    ownCwd: '/Users/me/secret-project',
    cwdSource: 'own',
    systemPrompt: '비밀 지침',
    approvalMode: 'ask',
    sessionId: 'sess-1',
    teamId: 't1',
    labIds: ['l1'],
    refDocs: ['/Users/me/CONTEXT.md'],
    equipment: { mcpServers: [], skills: 'all', allowedTools: [], disallowedTools: [], monthlyBudgetUsd: 0 },
    pid: 123,
    status: 'waiting',
    activity: 'Edit /Users/me/secret-project/a.ts',
    approvals: [{ id: 'kim:ap1', staffId: 'kim', toolName: 'Edit', summary: 'a.ts 수정', createdAt: NOW - 5000 }],
    costUsd: 1.5,
    tokensIn: 100,
    tokensOut: 50,
    deskIndex: 0,
    hiredAt: 1,
    stats: { tasksDone: 0, toolCalls: 0, approvals: 0, xp: 0, level: 1, progress: 0 },
    meetingId: null,
    statusSince: NOW - 60_000,
    todayDone: 0,
    ...over,
  }
}

function makeOffice() {
  const staff: any[] = [
    makeStaff(),
    makeStaff({ id: 'lee', name: '이디자', status: 'idle', approvals: [{ id: 'lee:q1', staffId: 'lee', toolName: 'AskUserQuestion', summary: '색?', createdAt: NOW - 9000, questions: [{ question: '어떤 색?', header: '색', options: [{ label: '파랑', description: '' }], multiSelect: false }] }] }),
    makeStaff({ id: 'ext', kind: 'external', name: '외부', approvals: [{ id: 'ext:a', staffId: 'ext', toolName: 'Bash', summary: 'ls', createdAt: NOW }] }),
  ]
  const tasks: any[] = [{ id: 'task1', title: '기획 카드', detail: '', status: 'doing', assigneeId: 'kim', teamId: null, result: '', createdAt: 0, updatedAt: 0, plan: { spec: '명세', subtasks: [{ title: '하위', detail: 'd', assigneeId: 'lee', assigneeName: '이디자' }], status: 'waiting', feedback: '', isAggregating: false, proposedAt: NOW - 1000 } }]
  const calls: string[] = []
  const port: RemoteOfficePort = {
    view: () => ({ staff, tasks }),
    decide: (id, allow) => {
      calls.push(`decide:${id}:${allow}`)
      for (const s of staff) s.approvals = s.approvals.filter((a: any) => a.id !== id)
      return true
    },
    answerQuestion: (id, answers) => {
      calls.push(`answer:${id}:${JSON.stringify(answers)}`)
      return true
    },
    reviewPlan: (taskId, ok, fb) => {
      calls.push(`plan:${taskId}:${ok}:${fb}`)
      return true
    },
    instruct: (id, text) => void calls.push(`instruct:${id}:${text}`),
  }
  return { port, calls, staff, tasks }
}

function setup() {
  const office = makeOffice()
  const guard = new AuthGuard({ tokenHash: null, revoked: [] })
  const { token } = guard.rotate()
  let now = NOW
  const call = (r: Partial<RemoteRequest> & { body?: unknown; json?: boolean }, auth: string | null = token) =>
    handleRequest(
      {
        method: r.method ?? 'GET',
        url: r.url ?? '/v1/status',
        authorization: auth === null ? undefined : `Bearer ${auth}`,
        contentType: r.contentType ?? (r.body !== undefined ? 'application/json' : undefined),
        ip: r.ip ?? IP,
        body: r.body === undefined ? null : Buffer.from(typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
        isBodyTooLarge: r.isBodyTooLarge,
      },
      { guard, office: office.port, serverVersion: '0.8.0', now, isReady: true },
    )
  return { ...office, guard, token, call, tick: (ms: number) => (now += ms) }
}

// ── 토큰·비교 ──────────────────────────────────────────
test('토큰: 32바이트 base64url 43자, 해시끼리 상수 시간 비교, Bearer만 읽는다', () => {
  const t = newToken()
  assert.match(t, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(sameHash(hashToken(t), hashToken(t)), true)
  assert.equal(sameHash(hashToken(t), hashToken(newToken())), false)
  assert.equal(sameHash('', ''), false)
  assert.equal(bearerToken(`Bearer ${t}`), t)
  assert.equal(bearerToken(`bearer ${t}`), null)
  assert.equal(bearerToken(`Basic ${t}`), null)
  assert.equal(bearerToken(undefined), null)
})

// ── 4종 외 거절 ────────────────────────────────────────
test('정한 4종만 통과하고 그 밖의 경로는 404, 메서드가 틀리면 405', () => {
  const { call } = setup()
  assert.equal(call({ url: '/v1/status' }).status, 200)
  assert.equal(call({ url: '/v1/decisions' }).status, 200)
  for (const url of ['/', '/v1', '/v1/', '/v1/files', '/v1/staff', '/v1/settings', '/v1/hire', '/v1/../etc/passwd', '/v1/status/x', '/v1/decisions/a.x/extra', '/v1/instructions/x', '/status'])
    assert.deepEqual([url, call({ url }).body.error], [url, 'not_found'])
  const wrong = call({ method: 'POST', url: '/v1/status', body: {} })
  assert.equal(wrong.status, 405)
  assert.equal(wrong.headers.Allow, 'GET')
  assert.equal(call({ method: 'GET', url: '/v1/instructions' }).headers.Allow, 'POST')
  assert.equal(call({ method: 'DELETE', url: '/v1/decisions/a.kim:ap1' }).status, 405)
})

test('버전이 다르면 인증 전에 426과 지원 버전', () => {
  const { call } = setup()
  // 0.9.0부터 v2도 지원한다 → 모르는 버전 예시는 v3
  const r = call({ url: '/v3/status' }, null)
  assert.equal(r.status, 426)
  assert.deepEqual(r.body.supported, [1, 2])
})

// ── 401 세 종류 ────────────────────────────────────────
test('401: 토큰이 없거나 틀리면 unauthorized, 다시 만든 QR의 이전 토큰은 token_revoked', () => {
  const s = setup()
  assert.equal(s.call({}, null).body.error, 'unauthorized')
  assert.equal(s.call({}, newToken()).body.error, 'unauthorized')
  const old = s.token
  const { token: fresh } = s.guard.rotate()
  const revoked = s.call({}, old)
  assert.equal(revoked.status, 401)
  assert.equal(revoked.body.error, 'token_revoked')
  assert.equal(s.call({}, fresh).status, 200)
})

test('401: 폐기된 토큰은 실패 횟수에 세지 않는다', () => {
  const s = setup()
  const old = s.token
  const { token: fresh } = s.guard.rotate()
  for (let i = 0; i < AUTH_LIMITS.IP_FAILURES_MAX * 3; i++) assert.equal(s.call({}, old).body.error, 'token_revoked')
  assert.equal(s.call({}, fresh).status, 200)
})

// ── 잠금 ───────────────────────────────────────────────
test('잠금: 한 IP에서 5번 틀리면 15분 auth_locked(retryAt), 맞는 토큰도 막고, 다른 IP는 그대로', () => {
  const s = setup()
  for (let i = 0; i < AUTH_LIMITS.IP_FAILURES_MAX - 1; i++) assert.equal(s.call({}, 'wrong').body.error, 'unauthorized')
  const locked = s.call({}, 'wrong')
  assert.equal(locked.status, 401)
  assert.equal(locked.body.error, 'auth_locked')
  assert.equal(locked.body.retryAt, NOW + AUTH_LIMITS.LOCK_MS)
  // 잠금 중에는 맞는 토큰으로도 같은 응답 (토큰이 맞는지 알려 주지 않는다)
  assert.equal(s.call({}).body.error, 'auth_locked')
  assert.equal(s.call({ ip: '198.51.100.9' }).status, 200)
  s.tick(AUTH_LIMITS.LOCK_MS)
  assert.equal(s.call({}).status, 200)
})

test('M3 잠금: 여러 IP 합쳐 20번 틀리면 PC에 알리기만 하고 잠그지 않는다 (맞는 토큰은 그대로 통과)', () => {
  const alerts: string[] = []
  const guard = new AuthGuard({ tokenHash: null, revoked: [] }, (scope) => alerts.push(scope))
  const { token } = guard.rotate()
  for (let i = 0; i < AUTH_LIMITS.GLOBAL_FAILURES_MAX; i++) guard.check('wrong', `10.0.${i}.1`, NOW)
  assert.deepEqual(alerts, ['global'])
  assert.deepEqual(guard.check(token, '192.0.2.1', NOW + 1), { ok: true })
  assert.equal(guard.latestLock(NOW + 1), null)
})

test('M3 실패 횟수: 헤더가 없거나 Bearer 형식이 틀린 요청은 401만 주고 세지 않는다', () => {
  const s = setup()
  const raw = (authorization: string | undefined) =>
    handleRequest({ method: 'GET', url: '/v1/status', authorization, ip: IP, body: null }, { guard: s.guard, office: s.port, serverVersion: 'x', now: NOW, isReady: true })
  for (let i = 0; i < AUTH_LIMITS.IP_FAILURES_MAX * 4; i++) {
    for (const h of [undefined, '', 'Basic abc', 'Bearer', 'bearer x', 'Bearer a b', `Bearer ${'x'.repeat(300)}`]) assert.equal(raw(h).body.error, 'unauthorized', String(h))
  }
  assert.equal(s.call({}).status, 200)
  // 형식이 맞는 틀린 토큰은 센다
  for (let i = 0; i < AUTH_LIMITS.IP_FAILURES_MAX; i++) s.call({}, 'well-formed-but-wrong')
  assert.equal(s.call({}).body.error, 'auth_locked')
})

test('잠금: 10분이 지난 실패는 세지 않는다', () => {
  const guard = new AuthGuard({ tokenHash: null, revoked: [] })
  const { token } = guard.rotate()
  for (let i = 0; i < AUTH_LIMITS.IP_FAILURES_MAX - 1; i++) guard.check('x', IP, NOW)
  guard.check('x', IP, NOW + AUTH_LIMITS.WINDOW_MS + 1)
  assert.equal(guard.check(token, IP, NOW + AUTH_LIMITS.WINDOW_MS + 2).ok, true)
})

test('QR 다시 만들기는 잠금·실패 횟수를 초기화하고, 폐기 목록은 최근 20개만', () => {
  const guard = new AuthGuard({ tokenHash: null, revoked: [] })
  for (let i = 0; i < AUTH_LIMITS.IP_FAILURES_MAX; i++) guard.check('x', IP, NOW)
  assert.ok(guard.lockedUntil(IP, NOW))
  const { token } = guard.rotate()
  assert.equal(guard.lockedUntil(IP, NOW), null)
  assert.equal(guard.check(token, IP, NOW).ok, true)
  for (let i = 0; i < 30; i++) guard.rotate()
  assert.equal(guard.current.revoked.length, AUTH_LIMITS.REVOKED_KEEP)
})

test('속도 제한: 토큰당 분당 300회(v2 규격, v1도 같은 한도)를 넘으면 429와 Retry-After', () => {
  const s = setup()
  for (let i = 0; i < AUTH_LIMITS.RATE_MAX; i++) assert.equal(s.call({}).status, 200)
  const r = s.call({})
  assert.equal(r.status, 429)
  assert.ok(Number(r.headers['Retry-After']) >= 1)
  s.tick(60_000)
  assert.equal(s.call({}).status, 200)
})

// ── 응답 내용 ──────────────────────────────────────────
test('상태: 고용 직원만, 정한 필드만 (작업 폴더·지침·비용·세션·장비 없음)', () => {
  const s = setup()
  const body = s.call({}).body as any
  assert.equal(body.protocolVersion, 1)
  assert.equal(body.serverVersion, '0.8.0')
  assert.deepEqual(body.staff.map((x: any) => x.id), ['kim', 'lee'])
  for (const x of body.staff) assert.deepEqual(Object.keys(x).sort(), ['activity', 'avatar', 'id', 'name', 'pendingDecisions', 'role', 'status', 'statusSince'])
  assert.equal(body.staff[0].pendingDecisions, 2)
  assert.deepEqual(body.summary, { working: 0, waiting: 1, error: 0, idle: 1, offline: 0 })
  // 활동 문장(직원이 쓴 글)은 화면 표시용으로 담고, 그 밖에는 작업 폴더·지침·세션·문서·비용이 하나도 없어야 한다
  const text = JSON.stringify({ ...body, staff: body.staff.map(({ activity: _, ...rest }: any) => rest) })
  for (const secret of ['secret-project', '비밀 지침', 'sess-1', 'CONTEXT.md', 'costUsd', 'tokensIn', 'equipment', 'systemPrompt', 'cwd']) assert.equal(text.includes(secret), false, secret)
  assert.equal(statusBody(s.staff, s.tasks, 'x').staff[0].activity.length <= 200, true)
})

test('대기 결정: 결재·질문·기획을 오래된 순으로, 외부 직원 결재는 빼고', () => {
  const s = setup()
  const body = decisionsBody(s.staff, s.tasks) as any
  assert.deepEqual(body.decisions.map((d: any) => [d.kind, d.id]), [['question', 'a.lee:q1'], ['approval', 'a.kim:ap1'], ['plan', 'p.task1']])
  assert.equal(body.total, 3)
  assert.deepEqual(body.decisions[2].subtasks, [{ title: '하위', detail: 'd', assigneeName: '이디자' }])
})

// ── 결정 응답·지시 ─────────────────────────────────────
test('결정 응답: 결재 승인, 질문 답, 기획 반려(피드백 선택), 종류에 안 맞는 action은 400', () => {
  const s = setup()
  const post = (id: string, body: unknown) => s.call({ method: 'POST', url: `/v1/decisions/${encodeURIComponent(id)}`, body })
  assert.equal(post('a.kim:ap1', { action: 'answer' }).body.error, 'invalid_action')
  assert.deepEqual(post('a.kim:ap1', { action: 'approve', extra: 'ignored' }).body.result, 'approved')
  // 이미 처리한 결정은 409
  assert.equal(post('a.kim:ap1', { action: 'approve' }).status, 409)
  assert.equal(post('a.nope', { action: 'approve' }).status, 409)
  assert.equal(post('a.lee:q1', { action: 'answer', answers: { '모르는 질문': 'x' } }).body.error, 'invalid_request')
  assert.equal(post('a.lee:q1', { action: 'answer', answers: { '어떤 색?': '초록' } }).body.result, 'answered')
  assert.equal(post('p.task1', { action: 'reject' }).body.result, 'rejected')
  assert.deepEqual(s.calls, ['decide:kim:ap1:true', 'answer:lee:q1:{"어떤 색?":"초록"}', 'plan:task1:false:'])
})

test('결정 응답: JSON이 아니면 415·400, 16KB를 넘으면 413', () => {
  const s = setup()
  const url = '/v1/decisions/a.kim:ap1'
  assert.equal(s.call({ method: 'POST', url, body: '{"action":"approve"}', contentType: 'text/plain' }).status, 415)
  assert.equal(s.call({ method: 'POST', url, body: '{oops' }).body.error, 'invalid_request')
  assert.equal(s.call({ method: 'POST', url, body: {}, isBodyTooLarge: true }).status, 413)
})

test('지시: 고용 직원에게만, 글자 수 1~4000자, 예약 필드 target은 400', () => {
  const s = setup()
  const post = (body: unknown) => s.call({ method: 'POST', url: '/v1/instructions', body })
  const okRes = post({ staffId: 'kim', text: '회의록 정리해 주세요' })
  assert.equal(okRes.status, 202)
  assert.equal(okRes.body.accepted, true)
  assert.equal(post({ staffId: 'ext', text: 'hi' }).body.error, 'staff_not_found')
  assert.equal(post({ staffId: 'nobody', text: 'hi' }).body.error, 'staff_not_found')
  assert.equal(post({ staffId: 'kim', text: '   ' }).status, 400)
  assert.equal(post({ staffId: 'kim', text: 'x'.repeat(4001) }).status, 400)
  assert.equal(post({ staffId: 'kim', text: 'hi', target: 'chat' }).status, 400)
  assert.deepEqual(s.calls, ['instruct:kim:회의록 정리해 주세요'])
})

// ── 인증서·QR ──────────────────────────────────────────
test('인증서: Node가 읽고 자기 키로 검증되며, 지문은 sha256/base64 44자', () => {
  const { certPem, keyPem } = createSelfSignedCert()
  const x = new crypto.X509Certificate(certPem)
  assert.equal(x.verify(x.publicKey), true)
  assert.equal(x.checkPrivateKey(crypto.createPrivateKey(keyPem)), true)
  assert.match(spkiFingerprint(certPem), /^sha256\/[A-Za-z0-9+/]{43}=$/)
})

test('QR: 규격 필드 5개만 담고, 모양이 틀리면 만들지 않는다', () => {
  const { certPem } = createSelfSignedCert()
  const p = { v: 1, host: '203.0.113.10', port: 47900, token: newToken(), spki: spkiFingerprint(certPem) }
  assert.equal(isValidQrPayload(p), true)
  assert.deepEqual(Object.keys(JSON.parse(qrText(p))), ['v', 'host', 'port', 'token', 'spki'])
  assert.match(qrImage(p), /^data:image\/svg\+xml;base64,/)
  assert.equal(isValidQrPayload({ ...p, port: 80 }), false)
  assert.equal(isValidQrPayload({ ...p, host: 'a b' }), false)
  assert.equal(isValidQrPayload({ ...p, token: 'short' }), false)
})

// ── UPnP 해석 ──────────────────────────────────────────
test('UPnP: SSDP 위치·제어 주소·SOAP 값·주의할 외부 주소', () => {
  assert.equal(parseSsdpLocation('HTTP/1.1 200 OK\r\nLOCATION: http://192.168.0.1:5000/rootDesc.xml\r\nST: x\r\n'), 'http://192.168.0.1:5000/rootDesc.xml')
  const xml = '<root><device><serviceList><service><serviceType>urn:schemas-upnp-org:service:Layer3Forwarding:1</serviceType><controlURL>/l3f</controlURL></service><service><serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType><controlURL>/ctl/IPConn</controlURL></service></serviceList></device></root>'
  assert.deepEqual(parseIgdDescription(xml, 'http://192.168.0.1:5000/rootDesc.xml'), { controlUrl: 'http://192.168.0.1:5000/ctl/IPConn', serviceType: 'urn:schemas-upnp-org:service:WANIPConnection:1' })
  assert.equal(parseIgdDescription('<root/>', 'http://x/'), null)
  assert.match(soapEnvelope('urn:x', 'AddPortMapping', { NewPortMappingDescription: '<a&b>' }), /&#60;a&#38;b&#62;/)
  assert.equal(soapValue('<s:Body><u:R><NewExternalIPAddress>203.0.113.5</NewExternalIPAddress></u:R></s:Body>', 'NewExternalIPAddress'), '203.0.113.5')
  assert.equal(isCarrierShared('100.64.1.2'), true)
  assert.equal(isCarrierShared('100.128.0.1'), false)
  assert.equal(isPrivateIpv4('192.168.1.1'), true)
  assert.equal(isPrivateIpv4('203.0.113.5'), false)
})

// ── 실제 서버: 기본 꺼짐 · 끄면 포트 닫힘 · 평문 거절 ──────
function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port
      s.close(() => resolve(port))
    })
  })
}

function httpsGet(port: number, path: string, token?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = https.get({ host: '127.0.0.1', port, path, rejectUnauthorized: false, headers: token ? { Authorization: `Bearer ${token}` } : {}, agent: false }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') }))
    })
    req.on('error', reject)
  })
}

const refused = (port: number) =>
  new Promise<string>((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.on('connect', () => (s.destroy(), resolve('open')))
    s.on('error', (e: NodeJS.ErrnoException) => resolve(e.code ?? 'error'))
  })

type Keys = { keyPem: string; certPem: string }

function makeService(port: number, saved: Partial<RemoteConfig> = {}, savedKeys: Keys | 'unreadable' | null = null, extra: { upnp?: RemoteDeps['upnp'] } = {}) {
  let config: RemoteConfig = { ...DEFAULT_REMOTE_CONFIG, port, ...saved }
  let keys = savedKeys
  const alerts: string[] = []
  const svc = new RemoteService({
    office: makeOffice().port,
    serverVersion: '0.8.0',
    loadConfig: () => config,
    saveConfig: (c) => (config = c),
    loadKeys: () => keys,
    saveKeys: (k) => (keys = k),
    alert: (title) => void alerts.push(title),
    changed: () => {},
    upnp: extra.upnp ?? null,
    listenHost: '127.0.0.1',
  })
  return { svc, config: () => config, keys: () => keys, alerts }
}

test('기본 꺼짐: 처음에는 원격이 꺼져 있고 포트가 열리지 않는다', async () => {
  const port = await freePort()
  const { svc, config } = makeService(port, { port })
  await svc.init()
  assert.equal(DEFAULT_REMOTE_CONFIG.isEnabled, false)
  assert.equal(config().isEnabled, false)
  assert.equal(svc.status().isListening, false)
  assert.equal(await refused(port), 'ECONNREFUSED')
})

test('켜면 HTTPS로 응답하고(토큰 없으면 401), 끄면 포트가 닫힌다', async () => {
  const port = await freePort()
  const { svc, config } = makeService(port)
  await svc.enable(port)
  assert.equal(svc.status().isListening, true)
  assert.equal(svc.status().isQrReady, true)
  assert.ok(config().tokenHash)
  const r = await httpsGet(port, '/v1/status')
  assert.deepEqual([r.status, r.body.error], [401, 'unauthorized'])
  const nf = await httpsGet(port, '/v1/../../etc/passwd')
  assert.equal(nf.status, 401)
  await svc.disable()
  assert.equal(svc.status().isListening, false)
  assert.equal(config().isEnabled, false)
  assert.equal(await refused(port), 'ECONNREFUSED')
  // 껐다 켜도 토큰은 그대로
  const hash = config().tokenHash
  await svc.enable(port)
  assert.equal(config().tokenHash, hash)
  await svc.disable()
})

test('평문 HTTP 요청에는 HTTP 응답을 하지 않는다', async () => {
  const port = await freePort()
  const { svc } = makeService(port)
  await svc.enable(port)
  const outcome = await new Promise<string>((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/v1/status', agent: false, timeout: 3000 }, (res) => resolve(`status ${res.statusCode}`))
    req.on('error', (e: NodeJS.ErrnoException) => resolve(e.code ?? 'error'))
    req.on('timeout', () => (req.destroy(), resolve('timeout')))
  })
  assert.ok(!outcome.startsWith('status'), outcome)
  await svc.disable()
})

test('QR 다시 만들기: 지난번에 켜 두었으면 앱을 켤 때 다시 열고, 재발급하면 토큰 해시가 바뀌고 이전 것은 폐기 목록에', async () => {
  const port = await freePort()
  const first = makeService(port)
  await first.svc.enable(port)
  const before = first.config().tokenHash
  await first.svc.regenerate()
  assert.notEqual(first.config().tokenHash, before)
  assert.equal(first.config().revoked[0], before)
  assert.equal(first.svc.status().isListening, true)
  await first.svc.disable()
  // 켜 둔 채 앱을 다시 켜는 경우
  const again = makeService(port, { ...first.config(), isEnabled: true })
  await again.svc.init()
  assert.equal(again.svc.status().isListening, true)
  await again.svc.shutdown()
  assert.equal(await refused(port), 'ECONNREFUSED')
})

test('켜져 있을 때 다시 켜면: 같은 포트는 그대로, 다른 포트면 옛 포트를 닫고 새 포트로 연다', async () => {
  const [a, b] = [await freePort(), await freePort()]
  const { svc } = makeService(a)
  await svc.enable(a)
  await svc.enable(a)
  assert.deepEqual([svc.status().isListening, svc.status().error], [true, null])
  await svc.enable(b)
  assert.equal(svc.status().port, b)
  assert.equal(await refused(a), 'ECONNREFUSED')
  assert.equal((await httpsGet(b, '/v1/status')).status, 401)
  await svc.disable()
  assert.equal(await refused(b), 'ECONNREFUSED')
})

test('포트를 다른 프로그램이 쓰면 켜기 실패를 port_in_use로 알린다', async () => {
  const port = await freePort()
  const blocker = net.createServer().listen(port, '127.0.0.1')
  await new Promise((r) => blocker.once('listening', r))
  const { svc } = makeService(port)
  await svc.enable(port)
  assert.deepEqual([svc.status().isListening, svc.status().error], [false, 'port_in_use'])
  await svc.disable()
  blocker.close()
})

test('인증서: 일련번호·정수 인코딩이 항상 가장 짧은 꼴 (300번 만들어도 모두 읽힌다)', () => {
  for (let i = 0; i < 300; i++) {
    const { certPem } = createSelfSignedCert()
    const x = new crypto.X509Certificate(certPem)
    assert.equal(x.verify(x.publicKey), true)
    assert.match(x.serialNumber, /^[4-7][0-9A-F]{31}$/)
  }
})

// ── 숫자 범위 (규격 3-4) ───────────────────────────────
const INT32_MAX = 2 ** 31 - 1

test('avatar가 큰 직원(외부에서 데려온 직원의 세션 해시)이 있어도 응답 avatar는 규격 범위 안이고 생김새는 그대로', () => {
  const s = setup()
  const big = [3730355052, 2 ** 32 - 1, 2 ** 31, 7_776_024, 24, 23, 0]
  s.staff.splice(0, s.staff.length, ...big.map((avatar, i) => makeStaff({ id: `s${i}`, avatar, approvals: [] })))
  const body = s.call({}).body as any
  for (const [i, x] of body.staff.entries()) {
    assert.ok(Number.isInteger(x.avatar) && x.avatar >= 0 && x.avatar < AVATAR_LIMIT && x.avatar <= INT32_MAX, `${big[i]} → ${x.avatar}`)
    assert.deepEqual(decodeLook(x.avatar), decodeLook(big[i]))
  }
  assert.equal(canonicalAvatar(3730355052) <= INT32_MAX, true)
  assert.equal(canonicalAvatar(-5), 5)
  assert.equal(canonicalAvatar(Number.NaN), 0)
})

test('응답의 시각·개수는 모두 0 이상 정수이고 2^53 미만 (64비트 정수로 받을 수 있음)', () => {
  const s = setup()
  const ints: number[] = []
  const walk = (v: unknown, key = '') => {
    if (Array.isArray(v)) v.forEach((x) => walk(x))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
    else if (typeof v === 'number') ints.push(v), assert.ok(Number.isSafeInteger(v) && v >= 0, `${key}=${v}`)
  }
  walk(s.call({}).body)
  walk(s.call({ url: '/v1/decisions' }).body)
  assert.ok(ints.length > 5)
})

test('원격 상태의 잠금 시각: 한 곳(IP)만 잠겨도 PC 화면에 보인다', async () => {
  const port = await freePort()
  const { svc, config } = makeService(port)
  await svc.enable(port)
  assert.equal(svc.status().lockedUntil, null)
  for (let i = 0; i < AUTH_LIMITS.IP_FAILURES_MAX; i++) await httpsGet(port, '/v1/status', 'wrong-token')
  const until = svc.status().lockedUntil
  assert.ok(until && until > Date.now())
  assert.ok(config().tokenHash)
  await svc.disable()
})

test('저장된 인증서를 읽을 수 없으면 새로 만든다 (켜기가 계속 실패하지 않게)', async () => {
  const port = await freePort()
  const good = createSelfSignedCert()
  const broken = { keyPem: good.keyPem, certPem: '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n' }
  const { svc, keys } = makeService(port, {}, broken)
  await svc.enable(port)
  assert.deepEqual([svc.status().isListening, svc.status().error], [true, null])
  assert.notEqual(keys()?.certPem, broken.certPem)
  await svc.disable()
})

// ── 보안 리뷰 Round 1 · QA 3차 반영 ─────────────────────

test('H1: 요약이 잘린 결재는 isTruncated, 원격 승인은 review_on_pc로 거부하고 반려는 받는다', () => {
  const s = setup()
  s.staff[0].approvals = [
    { id: 'kim:long', staffId: 'kim', toolName: 'Bash', summary: 'x'.repeat(2001), createdAt: NOW - 1 },
    { id: 'kim:short', staffId: 'kim', toolName: 'Bash', summary: 'ls', createdAt: NOW },
  ]
  s.staff[1].approvals[0].summary = '질문 '.repeat(800)
  const list = (s.call({ url: '/v1/decisions' }).body as any).decisions
  const byId = Object.fromEntries(list.map((d: any) => [d.id, d]))
  assert.equal(byId['a.kim:long'].isTruncated, true)
  assert.equal(byId['a.kim:long'].summary.length, 2000)
  assert.equal('isTruncated' in byId['a.kim:short'], false)
  assert.equal(byId['a.lee:q1'].isTruncated, true)
  const post = (id: string, body: unknown) => s.call({ method: 'POST', url: `/v1/decisions/${encodeURIComponent(id)}`, body })
  const denied = post('a.kim:long', { action: 'approve' })
  assert.deepEqual([denied.status, denied.body.error], [400, 'review_on_pc'])
  assert.match(String(denied.body.message), /PC에서 전체를 확인/)
  assert.equal(post('a.kim:long', { action: 'reject' }).body.result, 'rejected')
  assert.equal(post('a.kim:short', { action: 'approve' }).body.result, 'approved')
  assert.deepEqual(s.calls, ['decide:kim:long:false', 'decide:kim:short:true'])
})

test('M1: 공유기 설명 문서 — 다른 호스트의 URLBase·제어 주소, 인터넷 주소, https는 거부', () => {
  const svc = (control: string, base = '') =>
    `<root>${base ? `<URLBase>${base}</URLBase>` : ''}<device><serviceList><service><serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType><controlURL>${control}</controlURL></service></serviceList></device></root>`
  const loc = 'http://192.168.0.1:5000/rootDesc.xml'
  assert.equal(parseIgdDescription(svc('/ctl', 'http://192.168.0.1:5000/'), loc)?.controlUrl, 'http://192.168.0.1:5000/ctl')
  // 다른 호스트의 URLBase는 거부
  assert.equal(parseIgdDescription(svc('/ctl', 'http://203.0.113.9/'), loc), null)
  assert.equal(parseIgdDescription(svc('/ctl', 'http://192.168.0.2:5000/'), loc), null)
  // 제어 주소가 절대 주소로 다른 곳을 가리켜도 거부
  assert.equal(parseIgdDescription(svc('http://169.254.169.254/latest/meta-data'), loc), null)
  assert.equal(parseIgdDescription(svc('http://localhost:47900/v1/status'), loc), null)
  // 설명 문서 위치 자체가 사설 IPv4의 http가 아니면 거부
  for (const bad of ['http://203.0.113.1/desc.xml', 'http://127.0.0.1/desc.xml', 'https://192.168.0.1/desc.xml', 'http://router.local/desc.xml', 'file:///etc/passwd'])
    assert.equal(parseIgdDescription(svc('/ctl'), bad), null, bad)
  assert.equal(isGatewayLocation(loc), true)
  assert.equal(isGatewayLocation('http://8.8.8.8/x'), false)
})

test('M1: 공유기 응답 본문이 256KB를 넘으면 끊는다', async () => {
  const big = http.createServer((_q, r) => {
    r.writeHead(200)
    r.end(Buffer.alloc(RESPONSE_MAX_BYTES + 1024, 'a'))
  })
  await new Promise<void>((r) => big.listen(0, '127.0.0.1', () => r()))
  const port = (big.address() as net.AddressInfo).port
  await assert.rejects(upnpRequest(`http://127.0.0.1:${port}/`))
  const small = await new Promise<string>((resolve) => {
    const s2 = http.createServer((_q, r) => r.end('ok')).listen(0, '127.0.0.1', async () => {
      const r = await upnpRequest(`http://127.0.0.1:${(s2.address() as net.AddressInfo).port}/`)
      s2.close()
      resolve(r.text)
    })
  })
  assert.equal(small, 'ok')
  big.close()
})

/** TLS로 직접 붙어 요청 바이트를 그대로 보낸다 (본문 크기·나눠 보내기 확인용) */
function rawTls(port: number, head: string, body?: Buffer): Promise<{ text: string; isClosed: boolean }> {
  return new Promise((resolve) => {
    const sock = tls.connect({ host: '127.0.0.1', port, rejectUnauthorized: false }, () => {
      sock.write(head)
      if (body) sock.write(body)
    })
    let text = ''
    sock.on('data', (c) => (text += c.toString()))
    sock.on('error', () => {})
    sock.on('close', () => resolve({ text, isClosed: true }))
    setTimeout(() => (sock.destroy(), resolve({ text, isClosed: false })), 4000).unref()
  })
}

test('M2: Content-Length가 16KB를 넘으면 본문을 읽지 않고 413 + 연결 닫기, 나눠 보내다 16KB를 넘기면 끊는다', async () => {
  const port = await freePort()
  const { svc } = makeService(port)
  await svc.enable(port)
  const declared = await rawTls(port, `POST /v1/instructions HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: ${BODY_MAX_BYTES + 1}\r\n\r\n`)
  assert.match(declared.text, /^HTTP\/1\.1 413/)
  assert.match(declared.text, /connection: close/i)
  assert.equal(declared.isClosed, true)
  const chunk = Buffer.alloc(4096, 'a')
  const chunks = Buffer.concat(Array.from({ length: 6 }, () => Buffer.concat([Buffer.from(`${chunk.length.toString(16)}\r\n`), chunk, Buffer.from('\r\n')])))
  const streamed = await rawTls(port, 'POST /v1/instructions HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n', chunks)
  assert.equal(streamed.isClosed, true)
  assert.equal(streamed.text, '')
  await svc.disable()
})

test('N1: 한 주소가 연결 한도(8개)를 채워도 다른 주소의 정상 요청은 통과, 붙들기만 한 연결은 5초 뒤 끊긴다', async () => {
  assert.deepEqual([MAX_CONNECTIONS, MAX_CONNECTIONS_PER_ADDRESS], [64, 8])
  const { certPem, keyPem } = createSelfSignedCert()
  const guard = new AuthGuard({ tokenHash: null, revoked: [] })
  const { token } = guard.rotate()
  const office = makeOffice().port
  const server = new RemoteServer()
  // IPv4(127.0.0.1)와 IPv6(::1)를 둘 다 받아 "서로 다른 두 주소"를 만든다
  const port = await server.start({ keyPem, certPem, port: 0, host: '::', handle: (req) => handleRequest(req, { guard, office, serverVersion: 't', now: Date.now(), isReady: true }) })
  try {
    // 한 주소(127.0.0.1)에서 40개를 붙들어도 8개만 남고 나머지는 바로 끊긴다
    const held: net.Socket[] = []
    for (let i = 0; i < 40; i++) {
      const s2 = net.connect(port, '127.0.0.1')
      s2.on('error', () => {})
      held.push(s2)
    }
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(held.filter((x) => !x.destroyed && x.readyState === 'open').length, MAX_CONNECTIONS_PER_ADDRESS)
    // 다른 주소(::1)의 휴대폰은 정상으로 붙는다
    const status = await new Promise<number>((resolve, reject) => {
      const r = https.get({ host: '::1', port, path: '/v1/status', rejectUnauthorized: false, agent: false, headers: { Authorization: `Bearer ${token}` } }, (res) => (res.resume(), resolve(res.statusCode ?? 0)))
      r.on('error', reject)
    })
    assert.equal(status, 200)
    // 같은 주소도 붙들던 연결이 풀리면 다시 붙을 수 있다 (핸드셰이크 없이 붙들면 5초 안팎에 서버가 끊는다)
    const started = Date.now()
    await new Promise((r) => held.find((x) => !x.destroyed)!.once('close', r))
    assert.ok(Date.now() - started < 7000)
    for (const x of held) x.destroy()
  } finally {
    await server.stop()
  }
})

test('M4: 실패를 기억하는 IP는 5000개까지, 10분 지난 항목은 가끔 쓸어낸다', () => {
  const guard = new AuthGuard({ tokenHash: null, revoked: [] })
  const { token } = guard.rotate()
  for (let i = 0; i < 6000; i++) guard.check('wrong', `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`, NOW)
  assert.ok(guard.trackedIps <= AUTH_LIMITS.IP_TRACK_MAX, String(guard.trackedIps))
  // 10분 뒤에는 맞는 요청만 와도 몇 번에 한 번 쓸어내서 비워진다
  for (let i = 0; i < AUTH_LIMITS.SWEEP_EVERY; i++) guard.check(token, '192.0.2.1', NOW + AUTH_LIMITS.WINDOW_MS + 1)
  assert.equal(guard.trackedIps, 0)
})

test('QA: 지금 하는 일에는 도구 이름만 (명령 전문·경로는 보내지 않는다)', () => {
  const s = setup()
  s.staff[0].status = 'working'
  s.staff[0].activity = 'Bash S=/private/tmp/q.sh && python3 run.py --token abc'
  s.staff[1].activity = '회의록을 /Users/me/secret/a.md 에 정리 중'
  const [kim, lee] = (s.call({}).body as any).staff
  assert.equal(kim.activity, 'Bash 실행 중')
  // N4: 도구 호출이 아닌 자유 문장은 내용 없이 "작업 중"
  assert.equal(lee.activity, FREE_ACTIVITY)
  assert.equal(remoteActivity('working', '지시 확인 중'), '작업 중')
  assert.equal(remoteActivity('working', 'let me check the token abc'), '작업 중')
  assert.equal(remoteActivity('idle', ''), '')
  assert.equal(remoteActivity('working', 'mcp__office__delegate 김기획'), 'delegate 실행 중')
  assert.equal(remoteActivity('error', 'Error: ENOENT /Users/me/x'), '오류가 났어요')
})

test('QA: 원격을 다시 켜면 QR이 준비된다 — 붙은 휴대폰이 없으면 새 토큰, 있으면 토큰을 지킨다', async () => {
  const port = await freePort()
  // 같은 실행 안에서 껐다 켜면(QR 5분 안) 보이던 QR을 그대로 쓴다
  const same = makeService(port)
  try {
    await same.svc.enable(port)
    await same.svc.disable()
    const shown = same.config().tokenHash
    await same.svc.enable(port)
    assert.deepEqual([same.svc.status().isQrReady, same.config().tokenHash], [true, shown])
  } finally {
    await same.svc.disable()
  }
  // 앱을 다시 켠 뒤(토큰 원문 없음) 아직 아무 휴대폰도 안 붙은 토큰이면 새 토큰으로 QR을 보여 준다
  const old = hashToken(newToken())
  const unused = makeService(port, { tokenHash: old, isTokenUsed: false }, createSelfSignedCert())
  try {
    await unused.svc.enable(port)
    assert.equal(unused.svc.status().isQrReady, true)
    assert.notEqual(unused.config().tokenHash, old)
    assert.equal(unused.config().revoked[0], old)
  } finally {
    await unused.svc.disable()
  }
  // 이미 휴대폰이 붙어 쓰는 토큰이면 껐다 켜도 그대로 (휴대폰이 끊기지 않게), QR은 다시 만들어야 보인다
  const used = makeService(port, { tokenHash: old, isTokenUsed: true }, createSelfSignedCert())
  try {
    await used.svc.enable(port)
    assert.equal(used.config().tokenHash, old)
    assert.deepEqual([used.svc.status().isQrReady, used.svc.status().isTokenUsed], [false, true])
  } finally {
    await used.svc.disable()
  }
})

function fakeUpnp(removeDelayMs = 0) {
  const calls: string[] = []
  const gw = { controlUrl: 'http://192.168.0.1/ctl', serviceType: 'urn:x', localAddress: '192.168.0.5' }
  const upnp: NonNullable<RemoteDeps['upnp']> = {
    find: async () => gw,
    add: async (_g, p) => void calls.push(`add:${p}`),
    remove: (_g, p) => new Promise<void>((r) => setTimeout(() => (calls.push(`remove:${p}`), r()), removeDelayMs).unref()),
    external: async () => '203.0.113.5',
  }
  return { upnp, calls }
}

const waitFor = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 10))
}

test('L2: 공유기 매핑 — 켜면 열고, 끄면 지운다', async () => {
  const port = await freePort()
  const { upnp, calls } = fakeUpnp()
  const { svc } = makeService(port, {}, null, { upnp })
  await svc.enable(port)
  await waitFor(() => svc.status().upnp.state === 'ok')
  assert.deepEqual(svc.status().upnp, { state: 'ok', externalAddress: '203.0.113.5', isCarrierShared: false, isDoubleNat: false })
  await svc.disable()
  assert.deepEqual(calls, [`add:${port}`, `remove:${port}`])
  assert.equal(svc.status().upnp.state, 'off')
})

test('L1: 앱을 끝낼 때 공유기가 답이 없어도 정해진 시간만 기다리고 포트는 닫는다', async () => {
  const port = await freePort()
  const { upnp } = fakeUpnp(10_000)
  const { svc } = makeService(port, {}, null, { upnp })
  await svc.enable(port)
  await waitFor(() => svc.status().upnp.state === 'ok')
  const started = Date.now()
  await svc.shutdown(200)
  assert.ok(Date.now() - started < 1000)
  assert.equal(await refused(port), 'ECONNREFUSED')
  assert.equal(SHUTDOWN_WAIT_MS, 3000)
})

test('L4: 저장된 키를 읽지 못하면(복호화 실패) 새로 만들고 PC 화면에 알리며 새 QR을 준비한다', async () => {
  const port = await freePort()
  const { svc, keys } = makeService(port, { tokenHash: hashToken(newToken()), isTokenUsed: true }, 'unreadable')
  await svc.enable(port)
  const st = svc.status()
  assert.deepEqual([st.isListening, st.isKeyRegenerated, st.isQrReady], [true, true, true])
  assert.ok(keys() && keys() !== 'unreadable')
  await svc.disable()
  // 처음 켜는 경우(저장된 키 없음)는 안내하지 않는다
  const first = makeService(await freePort())
  await first.svc.enable(first.config().port)
  assert.equal(first.svc.status().isKeyRegenerated, false)
  await first.svc.disable()
})

test('N2: 1000번 실패해도 PC 알림은 10분에 1번, 다음 알림에 그 사이 횟수를 합친다', () => {
  const calls: [string, number][] = []
  const guard = new AuthGuard({ tokenHash: hashToken(newToken()), revoked: [] }, (scope, _until, count) => void calls.push([scope, count]))
  let t = NOW
  for (let i = 0; i < 1000; i++) guard.check('w'.repeat(43), `2001:db8::${i}`, (t += 5))
  assert.deepEqual(calls, [['global', AUTH_LIMITS.GLOBAL_FAILURES_MAX]])
  // 10분이 지나 다시 한도를 넘으면 그 사이 쌓인 것까지 합쳐 한 번
  for (let i = 0; i < AUTH_LIMITS.GLOBAL_FAILURES_MAX; i++) guard.check('w'.repeat(43), `2001:db8::1:${i}`, t + AUTH_LIMITS.ALERT_INTERVAL_MS + i)
  assert.equal(calls.length, 2)
  // 첫 알림 뒤 참았던 980번 + 새로 넘긴 20번
  assert.equal(calls[1][1], 1000)
  // IP 잠금 알림도 같은 간격: 30곳을 잠가도 알림은 1번
  const ipCalls: [string, number][] = []
  const g2 = new AuthGuard({ tokenHash: hashToken(newToken()), revoked: [] }, (scope, _u, count) => void ipCalls.push([scope, count]))
  for (let ip = 0; ip < 30; ip++) for (let k = 0; k < AUTH_LIMITS.IP_FAILURES_MAX; k++) g2.check('w'.repeat(43), `198.51.100.${ip}`, NOW + ip)
  assert.deepEqual(ipCalls.filter(([s2]) => s2 === 'ip'), [['ip', 1]])
})

test('N3: 잠근 IP도 5000개까지 — 넘으면 가장 먼저 잠근 것부터 버린다', () => {
  const guard = new AuthGuard({ tokenHash: hashToken(newToken()), revoked: [] })
  for (let i = 0; i < 6000; i++) {
    const ip = `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`
    for (let k = 0; k < AUTH_LIMITS.IP_FAILURES_MAX; k++) guard.check('w'.repeat(43), ip, NOW + i)
  }
  assert.ok(guard.lockedIps <= AUTH_LIMITS.IP_TRACK_MAX, String(guard.lockedIps))
  // 가장 최근에 잠근 곳은 남아 있고, 가장 먼저 잠근 곳은 버려졌다
  assert.ok(guard.lockedUntil('10.0.23.111', NOW + 6000))
  assert.equal(guard.lockedUntil('10.0.0.0', NOW + 6000), null)
})


// ── 같은 와이파이 주소(lan) — 공유기가 외부 주소로 되돌아 들어오기(헤어핀)를 못 하는 집 ──
test('QR lan: 외부 주소와 다를 때만 넣고, 검증은 사설 IPv4 lan을 허용한다', () => {
  const { certPem } = createSelfSignedCert()
  const base = { v: 1, host: '203.0.113.10', port: 47900, token: newToken(), spki: spkiFingerprint(certPem) }
  const withLan = { ...base, lan: '192.168.0.24' }
  assert.equal(isValidQrPayload(withLan), true)
  assert.deepEqual(Object.keys(JSON.parse(qrText(withLan))), ['v', 'host', 'port', 'token', 'spki', 'lan'])
  assert.equal(JSON.parse(qrText(withLan)).lan, '192.168.0.24')
  // lan이 없으면 예전 5개 필드 그대로 (옛 앱 호환)
  assert.deepEqual(Object.keys(JSON.parse(qrText(base))), ['v', 'host', 'port', 'token', 'spki'])
  assert.equal(isValidQrPayload(base), true)
  // lan은 사설 IPv4이고 host와 달라야 한다
  for (const lan of ['203.0.113.11', '192.168.0.300', 'myhost.local', '::1', '']) assert.equal(isValidQrPayload({ ...base, lan }), false, lan)
  assert.equal(isValidQrPayload({ ...base, host: '192.168.0.24', lan: '192.168.0.24' }), false)
  // 넣을지 고르기: host와 같거나 사설 주소가 아니면 빼기
  assert.equal(lanForQr('203.0.113.10', '192.168.0.24'), '192.168.0.24')
  assert.equal(lanForQr('192.168.0.24', '192.168.0.24'), undefined)
  assert.equal(lanForQr('203.0.113.10', '100.64.1.2'), undefined)
  assert.equal(lanForQr('203.0.113.10', null), undefined)
  assert.equal(isLanAddress('10.0.0.5'), true)
  assert.equal(isLanAddress('172.31.255.1'), true)
  assert.equal(isLanAddress('8.8.8.8'), false)
})

test('QR lan: 공유기 자동 설정이 되면 QR에 외부 주소(host)와 이 PC의 같은 와이파이 주소(lan)를 함께 넣는다', async () => {
  const port = await freePort()
  const { upnp } = fakeUpnp()
  const { svc } = makeService(port, {}, null, { upnp })
  try {
    await svc.enable(port)
    await waitFor(() => svc.status().upnp.state === 'ok')
    const qr = svc.qr()
    assert.ok(qr)
    assert.deepEqual([qr.host, qr.lan, qr.port], ['203.0.113.5', '192.168.0.5', port])
  } finally {
    await svc.disable()
  }
  // 주소를 직접 넣었어도(DDNS) lan은 같이 들어간다
  const ddns = makeService(port, { host: 'myoffice.iptime.org' }, null, { upnp: fakeUpnp().upnp })
  try {
    await ddns.svc.enable(port)
    await waitFor(() => ddns.svc.status().upnp.state === 'ok')
    assert.deepEqual([ddns.svc.qr()?.host, ddns.svc.qr()?.lan], ['myoffice.iptime.org', '192.168.0.5'])
  } finally {
    await ddns.svc.disable()
  }
})
