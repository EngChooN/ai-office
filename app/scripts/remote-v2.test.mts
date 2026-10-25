// 원격 프로토콜 v2 (docs/specs/remote-protocol-v2.md): /v2/call · /v2/events(SSE) · /v2/attachments · /v2/files/{id}
// 실제 HTTPS 서버(127.0.0.1)와 가짜 사무실로 돌린다. v1 회귀는 remote.test.mts가 그대로 지킨다

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { test } from 'node:test'
import { OFFICE_METHODS } from '../src/shared/officeApiShape.ts'
import type { Attachment } from '../src/shared/types.ts'
import { hashToken, newToken } from '../src/main/remote/auth.ts'
import { handleRequest } from '../src/main/remote/handler.ts'
import { AuthGuard } from '../src/main/remote/auth.ts'
import { DEFAULT_REMOTE_CONFIG, RemoteService, type RemoteConfig } from '../src/main/remote/service.ts'
import { MAX_CONNECTIONS_PER_ADDRESS } from '../src/main/remote/server.ts'
import { EventHub } from '../src/main/remote/events.ts'
import { checkArgs, handleV2Call, pickFields, PORT_CHANGE_NOTICE, stripAttachmentPaths, V2_CALL_BODY_MAX, V2_FIELDS, V2_METHODS, type V2CallDeps } from '../src/main/remote/v2.ts'
import type { V2Office } from '../src/main/remote/v2routes.ts'
import { REMOTE_MARK, remoteMarked, runAsRemote } from '../src/main/remoteContext.ts'
import { BlockedError, InvalidArgsError } from '../src/shared/errors.ts'
import { acceptHello, clampCompanyLevel, parseCapabilities, shapeFor } from '../src/main/remote/capabilities.ts'
import { COMPANY_LEVELS } from '../src/shared/officeLevel.ts'
import { planToConfig } from '../src/shared/autoApprove.ts'

const NOW = 1_800_000_000_000
const ATT_ID = '11111111-2222-4333-8444-555555555555'
const ATT: Attachment = { id: ATT_ID, name: 'a.png', path: '/Users/me/Library/attachments/x__a.png', mime: 'image/png', size: 3 }

// ── 분류표 ─────────────────────────────────────────────

test('분류표: OfficeApi 메서드와 빠짐없이 같은 이름 (더하거나 빠진 것 없음)', () => {
  assert.deepEqual(Object.keys(V2_METHODS).sort(), [...OFFICE_METHODS].sort())
  assert.equal(new Set(OFFICE_METHODS).size, OFFICE_METHODS.length)
  const count: Record<string, number> = {}
  for (const s of Object.values(V2_METHODS)) count[s.cls] = (count[s.cls] ?? 0) + 1
  assert.deepEqual(count, { R: 67, S: 17, P: 6, C: 2, U: 1 })
  // PC 전용은 모두 대신할 길(alternative)을 알려 준다
  for (const [name, s] of Object.entries(V2_METHODS)) if (s.cls === 'P') assert.ok(s.alternative, name)
})

test('인자 검사: 개수·자리별 타입, 선택 자리는 생략·null, 남는 인자는 거절', () => {
  assert.equal(checkArgs('s s a?', ['kim', '하이']), null)
  assert.equal(checkArgs('s s a?', ['kim', '하이', null]), null)
  assert.equal(checkArgs('s s a?', ['kim', 3]), 'args[1]')
  assert.equal(checkArgs('s s a?', ['kim']), 'args[1]')
  assert.equal(checkArgs('s', ['a', 'b']), 'args[1]')
  assert.equal(checkArgs('s s ~s', ['a', 'b', null]), null)
  assert.equal(checkArgs('S', [['a', 1]]), 'args[0]')
  assert.equal(checkArgs('o', [[]]), 'args[0]')
  assert.equal(checkArgs('n', [Infinity]), 'args[0]')
})

// ── /v2/call 처리 (서버 없이) ─────────────────────────────

function callDeps(over: Partial<V2CallDeps> = {}) {
  const calls: { method: string; args: unknown[] }[] = []
  const deps: V2CallDeps = {
    call: (method, args) => {
      calls.push({ method, args })
      if (method === 'remoteStatus') return { isEnabled: true }
      if (method === 'decide') return args[0] === 'live'
      if (method === 'instruct') return undefined
      if (method === 'getRecord') return { logs: [{ attachments: [ATT] }], manual: { path: '/Users/me/manuals/a.md' } }
      return { ok: method }
    },
    attachment: (id) => (id === ATT_ID ? ATT : null),
    manualPaths: async () => ['/Users/me/manuals/a.md'],
    currentPort: () => 47900,
    now: NOW,
    ...over,
  }
  return { deps, calls }
}

const call = (body: unknown, over: Partial<V2CallDeps> = {}) => {
  const d = callDeps(over)
  return handleV2Call(body, d.deps).then((r) => ({ ...r, calls: d.calls }))
}

test('pc_only: PC 전용 동작은 부르지 않고 422와 대신할 길', async () => {
  for (const [method, alternative] of [
    ['pickFolder', 'enter_path'],
    ['pickFiles', 'enter_path'],
    ['openAttachment', 'download_file'],
    ['resumeInTerminal', 'open_on_pc'],
    ['openClaudeLogin', 'open_on_pc'],
    ['remoteQr', 'open_on_pc'],
  ]) {
    const r = await call({ method, args: [] })
    assert.deepEqual([r.response.status, r.response.body.error, r.response.body.alternative, r.calls.length], [422, 'pc_only', alternative, 0], method)
  }
})

test('없는 메서드·이상한 본문·올리기 전용·인자 틀림', async () => {
  for (const method of ['nope', '__proto__', 'constructor', 'toString']) assert.equal((await call({ method })).response.body.error, 'unknown_method', method)
  assert.equal((await call({ method: 'snapshot', args: {} })).response.body.error, 'invalid_args')
  assert.equal((await call([])).response.body.error, 'invalid_request')
  assert.equal((await call({ method: 'snapshot', confirm: 'yes' })).response.body.error, 'invalid_request')
  assert.equal((await call({ method: 'saveAttachments', args: [[]] })).response.body.error, 'use_upload')
  const bad = await call({ method: 'instruct', args: ['kim', 5] })
  assert.deepEqual([bad.response.status, bad.response.body.error, bad.calls.length], [400, 'invalid_args', 0])
})

test('첨부: id만 믿고 저장소 값으로 바꾼다 — 폰이 보낸 경로는 버리고, 없는 id·UUID 아닌 id는 거절', async () => {
  const r = await call({ method: 'instruct', args: ['kim', '봐 줘', [{ id: ATT_ID, path: '/etc/passwd', name: 'x', size: 1 }]] })
  assert.equal(r.response.status, 200)
  assert.deepEqual(r.calls[0].args[2], [ATT])
  const task = await call({ method: 'createTask', args: [{ title: 't', attachments: [{ id: ATT_ID, path: '/etc/passwd' }] }] })
  assert.deepEqual((task.calls[0].args[0] as { attachments: unknown }).attachments, [ATT])
  for (const id of ['../../etc/passwd', '99999999-2222-4333-8444-555555555555']) {
    const no = await call({ method: 'instruct', args: ['kim', 'x', [{ id }]] })
    assert.deepEqual([no.response.status, no.response.body.error, no.calls.length], [400, 'invalid_attachment', 0], id)
  }
})

test('응답: 첨부의 PC 경로는 빼고, 매뉴얼 경로처럼 첨부가 아닌 path는 그대로', async () => {
  const r = await call({ method: 'getRecord', args: ['kim'] })
  const result = r.response.body.result as any
  assert.deepEqual(result.logs[0].attachments[0], { id: ATT_ID, name: 'a.png', mime: 'image/png', size: 3 })
  assert.equal(result.manual.path, '/Users/me/manuals/a.md')
  assert.deepEqual(stripAttachmentPaths([ATT]), [{ id: ATT_ID, name: 'a.png', mime: 'image/png', size: 3 }])
})

test('사무실 파일 폴더 밖: 매뉴얼은 지금 있는 매뉴얼 경로만 지우고 덮어쓴다', async () => {
  const del = await call({ method: 'deleteManual', args: ['/Users/me/.ssh/id_ed25519'] })
  assert.deepEqual([del.response.body.error, del.calls.length], ['invalid_args', 0])
  const save = await call({ method: 'saveManual', args: [{ title: 'x' }, '/etc/hosts'] })
  assert.deepEqual([save.response.body.error, save.calls.length], ['invalid_args', 0])
  assert.equal((await call({ method: 'deleteManual', args: ['/Users/me/manuals/a.md'] })).response.status, 200)
  // 새 매뉴얼(경로 없음)은 그대로 만든다
  assert.equal((await call({ method: 'saveManual', args: [{ title: 'x' }] })).response.status, 200)
})

test('연결이 끊기는 설정은 confirm이 있어야 하고, 응답을 보낸 뒤에 바꾼다', async () => {
  for (const body of [{ method: 'regenerateRemoteQr' }, { method: 'setRemoteEnabled', args: [false] }, { method: 'setRemoteEnabled', args: [true, 50000] }]) {
    const r = await call(body)
    assert.deepEqual([r.response.status, r.response.body.error, r.calls.length], [400, 'confirm_required', 0], body.method)
    const yes = await call({ ...body, confirm: true })
    assert.equal(yes.response.status, 200)
    assert.deepEqual(yes.calls.map((c) => c.method), ['remoteStatus'])
    assert.ok(yes.after)
  }
  // 같은 포트로 켜기는 끊기지 않으니 바로 처리한다
  const same = await call({ method: 'setRemoteEnabled', args: [true, 47900] })
  assert.deepEqual([same.response.status, same.after, same.calls.map((c) => c.method)], [200, undefined, ['setRemoteEnabled']])
})

test('처리 함수가 InvalidArgsError를 던지면 400 invalid_args (잘못된 setAutoApprove, QA)', async () => {
  // office.setAutoApprove와 같은 검증: planToConfig가 null이면 InvalidArgsError → 400 (500 아님)
  const setAutoApprove = (plan: unknown) => {
    if (!planToConfig(plan as never, 0)) throw new InvalidArgsError('자동결재 기간이 맞지 않아요')
    return { ok: true }
  }
  for (const plan of [{ mode: 'hours', hours: 99 }, { mode: 'always' }, { mode: 'daily', start: '25:99', end: 'abc' }]) {
    const bad = await call({ method: 'setAutoApprove', args: [plan] }, { call: (m, a) => (m === 'setAutoApprove' ? setAutoApprove((a as unknown[])[0]) : null) })
    assert.deepEqual([bad.response.status, bad.response.body.error], [400, 'invalid_args'], JSON.stringify(plan))
  }
  // 맞는 값은 정상 처리
  const ok = await call({ method: 'setAutoApprove', args: [{ mode: 'hours', hours: 4 }] }, { call: (m, a) => (m === 'setAutoApprove' ? setAutoApprove((a as unknown[])[0]) : null) })
  assert.equal(ok.response.status, 200)
  // 일반 예외는 그대로 500 call_failed
  const boom = await call({ method: 'snapshot' }, { call: () => { throw new Error('boom') } })
  assert.deepEqual([boom.response.status, boom.response.body.error], [500, 'call_failed'])
})

test('결정: 이미 끝난 결정은 409, 실패는 경로·긴 토큰을 가린 첫 줄만, 오래 걸리면 504', async () => {
  assert.equal((await call({ method: 'decide', args: ['live', true] })).response.status, 200)
  assert.equal((await call({ method: 'decide', args: ['gone', true] })).response.body.error, 'already_decided')
  const failed = await call(
    { method: 'snapshot' },
    {
      call: () => {
        throw new Error(`열 수 없어요 /Users/me/secret/a.txt ${'x'.repeat(40)}\n    at stack`)
      },
    },
  )
  assert.equal(failed.response.status, 500)
  assert.equal(failed.response.body.message, '열 수 없어요 … …')
  const slow = await call({ method: 'snapshot' }, { call: () => new Promise(() => {}), timeoutMs: 20 })
  assert.deepEqual([slow.response.status, slow.response.body.error], [504, 'call_timeout'])
})

test('원격 표시: 원격 호출 안의 지시·결재 기록에만 📱 원격을 붙인다', () => {
  assert.equal(remoteMarked('instruction', '하이'), '하이')
  runAsRemote(() => {
    assert.equal(remoteMarked('instruction', '하이'), `${REMOTE_MARK} 하이`)
    assert.equal(remoteMarked('approval', '✅ 허용'), `${REMOTE_MARK} ✅ 허용`)
    // 직원이 남기는 기록과 이미 붙은 기록은 그대로
    assert.equal(remoteMarked('tool', 'Read'), 'Read')
    assert.equal(remoteMarked('instruction', `${REMOTE_MARK} 하이`), `${REMOTE_MARK} 하이`)
  })
})

// ── 실제 서버 ──────────────────────────────────────────

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port
      s.close(() => resolve(port))
    })
  })
}

type Res = { status: number; headers: Record<string, unknown>; text: string; body: any }

function req(port: number, opts: { method?: string; path: string; token?: string | null; headers?: Record<string, string | number>; body?: Buffer | string; chunked?: boolean }): Promise<Res> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = { ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}), ...opts.headers }
    const r = https.request({ host: '127.0.0.1', port, path: opts.path, method: opts.method ?? 'GET', rejectUnauthorized: false, agent: false, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString()
        let body: any = null
        try {
          body = JSON.parse(text)
        } catch {}
        resolve({ status: res.statusCode ?? 0, headers: res.headers, text, body })
      })
    })
    r.on('error', reject)
    if (opts.body !== undefined) r.write(opts.body)
    r.end()
  })
}

const v2call = (port: number, token: string | null, body: unknown, headers: Record<string, string> = {}) =>
  req(port, { method: 'POST', path: '/v2/call', token, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

type SseEvent = { id?: string; event: string; data: any }

/** SSE 연결: 받은 이벤트를 모으고, 조건이 맞을 때까지 기다릴 수 있다 */
function openSse(port: number, token: string | null, lastEventId?: string, extraHeaders: Record<string, string> = {}) {
  const events: SseEvent[] = []
  let status = 0
  let isClosed = false
  let buf = ''
  let error: any = null
  const r = https.get({ host: '127.0.0.1', port, path: '/v2/events', rejectUnauthorized: false, agent: false, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}), ...extraHeaders } }, (res) => {
    status = res.statusCode ?? 0
    res.setEncoding('utf8')
    res.on('data', (chunk: string) => {
      buf += chunk
      let at: number
      while ((at = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, at)
        buf = buf.slice(at + 2)
        const e: Partial<SseEvent> = {}
        for (const line of block.split('\n')) {
          if (line.startsWith('id: ')) e.id = line.slice(4)
          else if (line.startsWith('event: ')) e.event = line.slice(7)
          else if (line.startsWith('data: ')) e.data = JSON.parse(line.slice(6))
        }
        if (e.event) events.push(e as SseEvent)
        else if (status >= 400 && block.startsWith('{')) error = JSON.parse(block)
      }
      if (status >= 400) error ??= (() => {
        try {
          return JSON.parse(buf)
        } catch {
          return null
        }
      })()
    })
    res.on('end', () => (isClosed = true))
    res.on('close', () => (isClosed = true))
  })
  r.on('error', () => (isClosed = true))
  const until = async (cond: () => boolean, ms = 3000) => {
    const end = Date.now() + ms
    while (!cond()) {
      if (Date.now() > end) throw new Error(`SSE 기다리다 시간 초과: ${JSON.stringify(events.map((e) => e.event))}`)
      await new Promise((r) => setTimeout(r, 10))
    }
  }
  return { events, until, status: () => status, isClosed: () => isClosed, error: () => error, close: () => r.destroy() }
}

function makeV2Service(port: number, saved: Partial<RemoteConfig> = {}, over: Partial<V2Office> = {}) {
  const token = newToken()
  let config: RemoteConfig = { ...DEFAULT_REMOTE_CONFIG, port, tokenHash: hashToken(token), isTokenUsed: true, ...saved }
  let keys: { keyPem: string; certPem: string } | null = null
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-v2-'))
  const store = new Map<string, Attachment>()
  const calls: { method: string; args: unknown[]; isRemote: boolean }[] = []
  const office: V2Office = {
    call: (method, args) => {
      calls.push({ method, args, isRemote: remoteMarked('instruction', '') !== '' })
      if (method === 'snapshot') return { staff: [{ id: 'kim', name: '김기획' }], tasks: [] }
      if (method === 'listManuals') return []
      if (method === 'remoteStatus') return svc.status()
      if (method === 'instruct') return undefined
      return { called: method }
    },
    attachment: (id) => store.get(id) ?? null,
    saveUpload: (name, mime, data) => {
      const id = crypto.randomUUID()
      const file = path.join(dir, `${id}__${name.replace(/[/\\]/g, '_')}`)
      fs.writeFileSync(file, data)
      const a = { id, name, path: file, mime: mime || 'application/octet-stream', size: data.length }
      store.set(id, a)
      return a
    },
    ...over,
  }
  const svc = new RemoteService({
    office: { view: () => ({ staff: [], tasks: [] }), decide: () => true, answerQuestion: () => true, reviewPlan: () => true, instruct: () => {} },
    serverVersion: '0.9.0',
    loadConfig: () => config,
    saveConfig: (c) => (config = c),
    loadKeys: () => keys,
    saveKeys: (k) => (keys = k),
    alert: () => {},
    changed: () => {},
    upnp: null,
    listenHost: '127.0.0.1',
    v2: { ...office, call: (m, a) => runAsRemote(() => office.call(m, a)) },
  })
  const cleanup = async () => {
    await svc.disable()
    fs.rmSync(dir, { recursive: true, force: true })
  }
  return { svc, token, calls, store, dir, config: () => config, cleanup }
}

test('/v2/call: PC 화면과 같은 처리 함수를 원격 표시 안에서 부르고, pc_only·404·405·415', async () => {
  const port = await freePort()
  const t = makeV2Service(port)
  try {
    await t.svc.enable(port)
    const snap = await v2call(port, t.token, { method: 'snapshot', args: [] })
    assert.deepEqual([snap.status, snap.body.ok, snap.body.protocolVersion, snap.body.result.staff[0].id], [200, true, 2, 'kim'])
    const ins = await v2call(port, t.token, { method: 'instruct', args: ['kim', '휴대폰에서'] })
    assert.equal(ins.status, 200)
    assert.deepEqual(t.calls.at(-1), { method: 'instruct', args: ['kim', '휴대폰에서'], isRemote: true })
    const pc = await v2call(port, t.token, { method: 'pickFolder' })
    assert.deepEqual([pc.status, pc.body.error, pc.body.alternative], [422, 'pc_only', 'enter_path'])
    // 없앤 전체 기능 스위치는 이제 없는 메서드
    assert.equal((await v2call(port, t.token, { method: 'setRemoteFullAccess', args: [false] })).body.error, 'unknown_method')
    assert.equal((await req(port, { method: 'POST', path: '/v2/other', token: t.token, headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404)
    assert.equal((await req(port, { path: '/v2/call', token: t.token })).status, 405)
    assert.equal((await req(port, { method: 'POST', path: '/v2/call', token: t.token, headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415)
    assert.equal((await req(port, { method: 'POST', path: '/v2/call', token: t.token, headers: { 'Content-Type': 'application/json' }, body: '{' })).body.error, 'invalid_request')
  } finally {
    await t.cleanup()
  }
})

test('/v2/call: 같은 Idempotency-Key는 한 번만 처리하고 같은 응답, 다른 본문이면 400', async () => {
  const port = await freePort()
  const t = makeV2Service(port)
  try {
    await t.svc.enable(port)
    const body = { method: 'instruct', args: ['kim', '한 번만'] }
    const a = await v2call(port, t.token, body, { 'Idempotency-Key': 'k1' })
    const b = await v2call(port, t.token, body, { 'Idempotency-Key': 'k1' })
    assert.deepEqual([a.status, b.status], [200, 200])
    assert.equal(t.calls.filter((c) => c.method === 'instruct').length, 1)
    const other = await v2call(port, t.token, { ...body, args: ['kim', '다른 글'] }, { 'Idempotency-Key': 'k1' })
    assert.equal(other.status, 400)
    await v2call(port, t.token, body, { 'Idempotency-Key': 'k2' })
    assert.equal(t.calls.filter((c) => c.method === 'instruct').length, 2)
  } finally {
    await t.cleanup()
  }
})

test('/v2/events: hello → snapshot → remoteStatus, PC 이벤트를 그대로 보내고, 다시 붙으면 놓친 것을 따라잡는다', async () => {
  const port = await freePort()
  const t = makeV2Service(port)
  try {
    await t.svc.enable(port)
    const s = openSse(port, t.token)
    await s.until(() => s.events.length >= 3)
    assert.equal(s.status(), 200)
    assert.deepEqual(s.events.slice(0, 3).map((e) => e.event), ['hello', 'snapshot', 'remoteStatus'])
    const hello = s.events[0].data
    assert.equal(hello.protocolVersion, 2)
    assert.equal(s.events[1].data.staff[0].id, 'kim')

    t.svc.publish('log', { id: 1, staffId: 'kim', type: 'instruction', text: '하이', attachments: [ATT] })
    t.svc.publish('chat', { id: 2, text: '안녕' })
    t.svc.publish('focus', 'kim')
    await s.until(() => s.events.some((e) => e.event === 'focus'))
    const log = s.events.find((e) => e.event === 'log')!
    assert.match(log.id!, new RegExp(`^${hello.epoch}:\\d+$`))
    // 첨부의 PC 경로는 이벤트에서도 뺀다
    assert.deepEqual(log.data.attachments, [{ id: ATT_ID, name: 'a.png', mime: 'image/png', size: 3 }])
    // snapshot은 묶어서 마지막 값만
    t.svc.publish('snapshot', { n: 1 })
    t.svc.publish('snapshot', { n: 2 })
    await s.until(() => s.events.filter((e) => e.event === 'snapshot').length >= 2)
    assert.deepEqual(s.events.filter((e) => e.event === 'snapshot').at(-1)!.data, { n: 2 })
    s.close()

    // 로그 이후를 놓친 상태로 다시 붙기 → chat·focus를 먼저 받는다
    const again = openSse(port, t.token, log.id)
    await again.until(() => again.events.some((e) => e.event === 'remoteStatus'))
    assert.deepEqual(again.events.slice(0, 3).map((e) => e.event), ['hello', 'chat', 'focus'])
    assert.equal(again.events[0].data.resync, false)
    // 모르는 epoch이면 resync
    const other = openSse(port, t.token, 'deadbeef:1')
    await other.until(() => other.events.length >= 1)
    assert.equal(other.events[0].data.resync, true)
    other.close()

    // 원격을 끄면 bye(remote_disabled)로 닫는다
    await t.svc.disable()
    await again.until(() => again.isClosed())
    assert.deepEqual(again.events.at(-1), { event: 'bye', data: { reason: 'remote_disabled' } })
  } finally {
    await t.cleanup()
  }
})

test('/v2/events: 인증 실패는 401, QR을 다시 만들면 bye(token_revoked)', async () => {
  const port = await freePort()
  const t = makeV2Service(port)
  try {
    await t.svc.enable(port)
    const none = openSse(port, null)
    await none.until(() => none.isClosed())
    assert.deepEqual([none.status(), none.events.length], [401, 0])
    const bad = openSse(port, newToken())
    await bad.until(() => bad.isClosed())
    assert.equal(bad.status(), 401)
    const s = openSse(port, t.token)
    await s.until(() => s.events.length >= 3)
    await t.svc.regenerate()
    await s.until(() => s.isClosed())
    assert.equal(s.events.at(-1)!.data.reason, 'token_revoked')
    // 옛 토큰으로는 다시 못 붙는다
    assert.equal((await v2call(port, t.token, { method: 'snapshot' })).body.error, 'token_revoked')
  } finally {
    await t.cleanup()
  }
})

test('첨부 올리기·받기: 201로 id를 주고(경로 없음), id로만 받는다 — 사무실 파일 폴더 밖 경로는 거절', async () => {
  const port = await freePort()
  const t = makeV2Service(port)
  try {
    await t.svc.enable(port)
    const data = Buffer.from('hello phone')
    const up = await req(port, { method: 'POST', path: '/v2/attachments', token: t.token, headers: { 'Content-Type': 'text/plain', 'Content-Length': data.length, 'X-File-Name': encodeURIComponent('메모.txt') }, body: data })
    assert.equal(up.status, 201)
    const a = up.body.attachment
    assert.deepEqual(Object.keys(a).sort(), ['id', 'mime', 'name', 'size'])
    assert.deepEqual([a.name, a.size], ['메모.txt', data.length])

    const got = await req(port, { path: `/v2/files/${a.id}`, token: t.token })
    assert.deepEqual([got.status, got.text, got.headers['x-content-type-options']], [200, 'hello phone', 'nosniff'])
    // 올린 첨부를 지시에 붙이면 저장소 값(PC 경로 포함)으로 바뀌어 처리 함수에 간다
    await v2call(port, t.token, { method: 'instruct', args: ['kim', '파일', [{ id: a.id }]] })
    assert.equal((t.calls.at(-1)!.args[2] as Attachment[])[0].path, t.store.get(a.id)!.path)

    for (const p of ['/v2/files/..%2F..%2Fetc%2Fpasswd', '/v2/files/%2Fetc%2Fpasswd', '/v2/files/../../etc/passwd', `/v2/files/${a.id}.txt`]) {
      const r = await req(port, { path: p, token: t.token })
      assert.ok([400, 404].includes(r.status), `${p} → ${r.status}`)
      assert.notEqual(r.text, 'hello phone')
    }
    assert.equal((await req(port, { path: `/v2/files/${crypto.randomUUID()}`, token: t.token })).body.error, 'file_not_found')
    assert.equal((await req(port, { path: `/v2/files/${a.id}` })).status, 401)
  } finally {
    await t.cleanup()
  }
})

test('첨부 올리기: 길이를 밝히지 않으면 411, 20MB를 넘으면 본문을 읽지 않고 413, GET은 405', async () => {
  const port = await freePort()
  const t = makeV2Service(port)
  try {
    await t.svc.enable(port)
    const chunked = await req(port, { method: 'POST', path: '/v2/attachments', token: t.token, headers: { 'Content-Type': 'text/plain', 'Transfer-Encoding': 'chunked' }, body: 'abc' })
    assert.deepEqual([chunked.status, chunked.body.error], [411, 'length_required'])
    const big = await req(port, { method: 'POST', path: '/v2/attachments', token: t.token, headers: { 'Content-Type': 'text/plain', 'Content-Length': 21 * 1024 * 1024 } })
    assert.deepEqual([big.status, big.body.error], [413, 'payload_too_large'])
    assert.equal((await req(port, { path: '/v2/attachments', token: t.token })).status, 405)
    assert.equal(t.store.size, 0)
  } finally {
    await t.cleanup()
  }
})

test('v1 회귀: v2 처리기가 붙어 있어도 v1 경로·판단 순서는 그대로', () => {
  const guard = new AuthGuard({ tokenHash: null, revoked: [] })
  const { token } = guard.rotate()
  const office = { view: () => ({ staff: [], tasks: [] }), decide: () => true, answerQuestion: () => true, reviewPlan: () => true, instruct: () => {} }
  const r = (url: string, method = 'GET') => handleRequest({ method, url, authorization: `Bearer ${token}`, ip: '203.0.113.7', body: null }, { guard, office, serverVersion: '0.9.0', now: NOW, isReady: true })
  assert.equal(r('/v1/status').status, 200)
  assert.equal(r('/v1/decisions').status, 200)
  assert.equal(r('/v1/status', 'POST').status, 405)
  assert.equal(r('/v1/nothing').status, 404)
  assert.equal(r('/v4/status').status, 426)
  // v2 경로를 v1 처리기로 보내도 v1 기능은 열리지 않는다
  assert.equal(r('/v2/call', 'GET').body.error, 'not_found')
  // 전체 기능 스위치는 없앴다 — 1.0.x·1.1 앱 호환을 위해 fullAccess는 항상 true
  assert.equal(r('/v1/status').body.fullAccess, true)
})

// ── 보안 리뷰(한리뷰) · QA 1.1 반영 ─────────────────────────

/** TLS로 머리만 보내고(본문 없이) 서버가 무엇을 하는지 본다 */
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
    setTimeout(() => (sock.destroy(), resolve({ text, isClosed: false })), 3000).unref()
  })
}

test('M1: /v2/call은 본문보다 인증이 먼저 — 토큰 없이 1MB를 밝히면 본문을 읽지 않고 401 + 연결 닫기, 인증된 요청만 1MB까지', async () => {
  const port = await freePort()
  const t = makeV2Service(port)
  try {
    await t.svc.enable(port)
    // 본문은 한 바이트도 보내지 않는다 — 서버가 본문을 기다리면 응답이 오지 않는다
    for (const auth of ['', 'Authorization: Bearer wrongwrongwrongwrongwrongwrongwrongwrong\r\n']) {
      const r = await rawTls(port, `POST /v2/call HTTP/1.1\r\nHost: x\r\n${auth}Content-Type: application/json\r\nContent-Length: ${V2_CALL_BODY_MAX}\r\n\r\n`)
      assert.match(r.text, /^HTTP\/1\.1 401/, auth || '토큰 없음')
      assert.match(r.text, /connection: close/i)
      assert.match(r.text, /"protocolVersion":2/)
      assert.equal(r.isClosed, true)
    }
    // 길이를 밝히지 않고 나눠 보내도 같다
    const chunked = await rawTls(port, 'POST /v2/call HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n')
    assert.match(chunked.text, /^HTTP\/1\.1 401/)
    assert.equal(chunked.isClosed, true)
    assert.equal(t.calls.length, 0)
    // 인증된 요청은 1MB 가까운 본문도 받는다, 넘으면 413(v2 본문)
    const big = await v2call(port, t.token, { method: 'instruct', args: ['kim', 'a'.repeat(V2_CALL_BODY_MAX - 200)] })
    assert.equal(big.status, 200)
    const over = await rawTls(port, `POST /v2/call HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer ${t.token}\r\nContent-Type: application/json\r\nContent-Length: ${V2_CALL_BODY_MAX + 1}\r\n\r\n`)
    assert.match(over.text, /^HTTP\/1\.1 413/)
    assert.match(over.text, /"protocolVersion":2/)
    // 앞단을 서버에서 한 번만 센다 — 요청 1번이 속도 제한 2번으로 세어지지 않는다(정상 응답이 이어서 온다)
    assert.equal((await v2call(port, t.token, { method: 'snapshot' })).status, 200)
  } finally {
    await t.cleanup()
  }
})

test('M2: 한 주소에서 SSE 2개를 연 채로 동시 호출 5개가 모두 200 (주소당 연결 8개)', async () => {
  assert.equal(MAX_CONNECTIONS_PER_ADDRESS, 8)
  const port = await freePort()
  const t = makeV2Service(port)
  try {
    await t.svc.enable(port)
    const a = openSse(port, t.token)
    const b = openSse(port, t.token)
    await a.until(() => a.events.length >= 3)
    await b.until(() => b.events.length >= 3)
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => v2call(port, t.token, { method: 'instruct', args: ['kim', `동시 ${i}`] })))
    assert.deepEqual(results.map((r) => r.status), [200, 200, 200, 200, 200])
    assert.equal(a.isClosed() || b.isClosed(), false)
    a.close()
    b.close()
  } finally {
    await t.cleanup()
  }
})

test('L1: 파일 받기 — 폴더·지워진 파일·읽을 수 없는 파일은 404로 답하고 서버는 계속 돈다', async () => {
  const port = await freePort()
  const t = makeV2Service(port)
  try {
    await t.svc.enable(port)
    const put = (name: string, file: string) => {
      const id = crypto.randomUUID()
      t.store.set(id, { id, name, path: file, mime: 'text/plain', size: 1 })
      return id
    }
    const folder = put('폴더', t.dir)
    const gone = put('지운 파일', path.join(t.dir, 'gone.txt'))
    const lockedFile = path.join(t.dir, 'locked.txt')
    fs.writeFileSync(lockedFile, 'secret')
    fs.chmodSync(lockedFile, 0o000)
    const locked = put('못 읽는 파일', lockedFile)
    for (const id of [folder, gone, ...(process.getuid?.() === 0 ? [] : [locked])]) {
      const r = await req(port, { path: `/v2/files/${id}`, token: t.token })
      assert.deepEqual([r.status, r.body?.error, r.body?.protocolVersion], [404, 'file_not_found', 2], id)
    }
    // 서버는 살아 있다
    assert.equal((await v2call(port, t.token, { method: 'snapshot' })).status, 200)
  } finally {
    await t.cleanup()
  }
})

test('L1: 첨부 올리기 — 저장하다 실패하면(디스크 가득 참) 500으로 답하고 경로는 보내지 않는다', async () => {
  const port = await freePort()
  const t = makeV2Service(port, {}, {
    saveUpload: () => {
      throw Object.assign(new Error('ENOSPC: no space left on device, write /Users/me/Library/attachments/x'), { code: 'ENOSPC' })
    },
  })
  try {
    await t.svc.enable(port)
    const data = Buffer.from('hello')
    const up = await req(port, { method: 'POST', path: '/v2/attachments', token: t.token, headers: { 'Content-Type': 'text/plain', 'Content-Length': data.length }, body: data })
    assert.deepEqual([up.status, up.body.error, up.body.protocolVersion], [500, 'call_failed', 2])
    assert.doesNotMatch(up.text, /\/Users/)
    assert.equal((await v2call(port, t.token, { method: 'snapshot' })).status, 200)
  } finally {
    await t.cleanup()
  }
})

test('L2: 객체 인자는 메서드별 허용 필드만 — updateTask에 id·첨부 path를 끼워도 버린다', async () => {
  const r = await call({ method: 'updateTask', args: ['t1', { title: '새 제목', status: 'done', id: 'other', attachments: [{ id: ATT_ID, path: '/etc/passwd' }], plan: { status: 'approved' } }] })
  assert.equal(r.response.status, 200)
  assert.deepEqual(r.calls[0].args, ['t1', { title: '새 제목', status: 'done' }])
  // 첨부를 받는 자리는 남기되 id로 저장소 값으로 바뀐다
  const task = await call({ method: 'createTask', args: [{ title: 't', detail: '', teamId: null, id: 'x', attachments: [{ id: ATT_ID, path: '/etc/passwd' }] }] })
  assert.deepEqual(task.calls[0].args[0], { title: 't', detail: '', teamId: null, attachments: [ATT] })
  assert.deepEqual(pickFields('updateSettings', [{ theme: 'dark', remote: { isEnabled: true } }]), [{ theme: 'dark' }])
  // 객체를 받는 자리는 모두 허용 필드 표가 있다 (answerQuestion은 질문 → 답 표라 제외)
  for (const [name, spec] of Object.entries(V2_METHODS)) {
    spec.args.split(' ').forEach((slot, i) => {
      if (slot.replace(/[?~]/g, '') !== 'o' || name === 'answerQuestion') return
      assert.ok((V2_FIELDS as Record<string, Record<number, string[]>>)[name]?.[i], `${name} args[${i}]`)
    })
  }
  assert.deepEqual(V2_FIELDS.updateTask![1].sort(), ['assigneeId', 'detail', 'labId', 'status', 'teamId', 'title'])
})

test('L3: remoteStatus도 snapshot처럼 500ms로 묶어 마지막 값만 보낸다', async () => {
  const hub = new EventHub({ snapshot: () => ({}), remoteStatus: () => ({ n: 0 }), isTokenValid: () => true })
  const writes: string[] = []
  const res = { destroyed: false, writableLength: 0, writeHead: () => {}, write: (t: string) => (writes.push(t), true), on: () => {}, end: () => {} }
  hub.open(res as never, 'h', undefined)
  writes.length = 0
  for (let n = 1; n <= 20; n++) hub.publish('remoteStatus', { n })
  hub.publish('log', { id: 1 })
  // log는 바로, remoteStatus는 아직
  assert.deepEqual(writes.map((w) => w.match(/event: (\w+)/)?.[1]), ['log'])
  await new Promise((r) => setTimeout(r, 650))
  const status = writes.filter((w) => w.includes('event: remoteStatus'))
  assert.equal(status.length, 1)
  assert.match(status[0], /data: \{"n":20\}/)
  hub.closeAll('shutdown')
})

test('전체 기능 스위치 없음: 원격이 켜져 있으면 v2를 바로 쓰고(저장된 옛 isFullAccess:false도 무시), 끄면 v1·v2 모두 포트가 닫힌다', async () => {
  const port = await freePort()
  const t = makeV2Service(port, { isFullAccess: false } as Partial<RemoteConfig>)
  try {
    await t.svc.enable(port)
    assert.equal('isFullAccess' in t.config(), false)
    assert.equal(t.svc.status().isFullAccess, true)
    const snap = await v2call(port, t.token, { method: 'snapshot' })
    assert.deepEqual([snap.status, snap.body.ok], [200, true])
    const s = openSse(port, t.token)
    await s.until(() => s.events.length >= 3)
    assert.equal(s.status(), 200)
    const status = await req(port, { path: '/v1/status', token: t.token })
    assert.deepEqual([status.status, status.body.supportedProtocols, status.body.fullAccess], [200, [1, 2], true])
    assert.equal((await req(port, { path: '/v3/status', token: t.token })).status, 426)

    await t.svc.disable()
    await s.until(() => s.isClosed())
    for (const p of ['/v1/status', '/v2/events']) await assert.rejects(req(port, { path: p, token: t.token }), /ECONNREFUSED/, p)
    await assert.rejects(v2call(port, t.token, { method: 'snapshot' }), /ECONNREFUSED/)
  } finally {
    await t.cleanup()
  }
})

test('포트 바꾸기: 휴대폰에서는 확인 문구와 함께 confirm을 받고, 바꾼 포트는 저장되어 다시 켜도 그 포트로 연다', async () => {
  const ask = await call({ method: 'setRemoteEnabled', args: [true, 50000] })
  assert.deepEqual([ask.response.status, ask.response.body.error, ask.response.body.message], [400, 'confirm_required', PORT_CHANGE_NOTICE])
  // 끄기는 포트 안내 없이 기본 문구
  assert.notEqual((await call({ method: 'setRemoteEnabled', args: [false] })).response.body.message, PORT_CHANGE_NOTICE)

  const port = await freePort()
  const next = await freePort()
  const t = makeV2Service(port)
  try {
    await t.svc.enable(port)
    await t.svc.enable(next)
    assert.deepEqual([t.config().port, t.config().isEnabled, t.svc.status().port], [next, true, next])
    await assert.rejects(req(port, { path: '/v1/status', token: t.token }), /ECONNREFUSED/)
    // 앱을 다시 켠 것처럼: 저장된 설정으로 새 서비스를 만들어 init
    await t.svc.shutdown(0)
    const again = new RemoteService({
      office: { view: () => ({ staff: [], tasks: [] }), decide: () => true, answerQuestion: () => true, reviewPlan: () => true, instruct: () => {} },
      serverVersion: '0.9.0',
      loadConfig: () => t.config(),
      saveConfig: () => {},
      loadKeys: () => null,
      saveKeys: () => {},
      alert: () => {},
      changed: () => {},
      upnp: null,
      listenHost: '127.0.0.1',
    })
    await again.init()
    try {
      assert.deepEqual([again.status().isListening, again.status().port], [true, next])
      assert.equal((await req(next, { path: '/v1/status', token: t.token })).status, 200)
    } finally {
      await again.disable()
    }
  } finally {
    await t.cleanup()
  }
})

// ── 칸 배치 메서드 · 예전 폰 화면 호환 (docs/specs/office-iso-tech.md 4절) ──

test('칸 배치: placeGridItem·moveGridItem은 표에 R(s n n n n), 놓기 검사가 막으면 422 blocked + reason', async () => {
  assert.deepEqual(V2_METHODS.placeGridItem, { cls: 'R', args: 's n n n n' })
  assert.deepEqual(V2_METHODS.moveGridItem, { cls: 'R', args: 's n n n n' })
  assert.equal(checkArgs(V2_METHODS.placeGridItem.args, ['fern', 1, 2, 3]), 'args[4]')
  assert.equal(checkArgs(V2_METHODS.placeGridItem.args, ['fern', 1, 2, 3, 0]), null)
  const placed = await call({ method: 'placeGridItem', args: ['fern', 1, 2, 3, 0] }, { call: () => ({ uid: 'u1' }) })
  assert.deepEqual([placed.response.status, placed.response.body.result], [200, { uid: 'u1' }])
  const no = await call({ method: 'moveGridItem', args: ['u1', 1, 9, 9, 0] }, { call: () => { throw new BlockedError('overlap') } })
  assert.deepEqual([no.response.status, no.response.body.error, no.response.body.reason, no.response.body.method], [422, 'blocked', 'overlap', 'moveGridItem'])
  // 예전 placeItem: 자리가 없으면 같은 422 blocked (no_space)
  const full = await call({ method: 'placeItem', args: ['fern'] }, { call: () => { throw new BlockedError('no_space', '1층에 놓을 빈자리가 없어요') } })
  assert.deepEqual([full.response.status, full.response.body.reason, full.response.body.message], [422, 'no_space', '1층에 놓을 빈자리가 없어요'])
})

test('capabilities: 헤더에서 아는 능력만 받고, hello는 저장 없이 확인만, 회사 레벨 11 이상은 레벨·칭호·문턱·진행률을 Lv.10 기준으로', () => {
  assert.deepEqual([...parseCapabilities('iso-office')], ['iso-office'])
  assert.deepEqual([...parseCapabilities(' ISO-Office , future-x')], ['iso-office'])
  assert.deepEqual([...parseCapabilities(['future-x', 'iso-office'])], ['iso-office'])
  assert.deepEqual([...parseCapabilities(undefined)], [])
  assert.deepEqual([...parseCapabilities('')], [])
  assert.deepEqual(acceptHello([{ capabilities: ['iso-office', 'future-x'] }]), ['iso-office'])
  assert.equal(acceptHello([{ capabilities: 'iso-office' }]), null)
  assert.equal(acceptHello([]), null)
  assert.equal(acceptHello([{ capabilities: [1] }]), null)
  assert.deepEqual(acceptHello([{ capabilities: [] }]), [])

  const snap = { staff: [], company: { level: 14, xp: 999_999, progress: 0.5, nextXp: 1_000_000, title: '20단계 칭호' } }
  const row10 = COMPANY_LEVELS[9]
  assert.deepEqual(clampCompanyLevel(snap), { ...snap, company: { level: 10, xp: 999_999, progress: 1, nextXp: row10.xp, title: row10.title } })
  assert.equal(snap.company.level, 14)
  const low = { company: { level: 10, title: 'x' } }
  assert.equal(clampCompanyLevel(low), low)
  assert.equal(clampCompanyLevel(null), null)
  assert.deepEqual(clampCompanyLevel({ uid: 'u1' }), { uid: 'u1' })
  assert.equal(shapeFor(parseCapabilities('iso-office'), snap), snap)
  assert.equal(shapeFor(parseCapabilities(undefined), snap).company.level, 10)
})

test('capabilities: 같은 토큰으로 예전 폰과 새 폰이 함께 붙어도 예전 폰은 끝까지 Lv.10 이하, 새 폰은 실제 레벨 (한리뷰 1-1)', async () => {
  const port = await freePort()
  let level = 14
  const company = () => ({ level, xp: 1, progress: 0.3, nextXp: 2, title: '20단계 칭호' })
  const t = makeV2Service(port, {}, { call: (method) => (method === 'snapshot' ? { staff: [], company: company() } : method === 'listManuals' ? [] : { called: method }) })
  const NEW = { 'X-Office-Capabilities': 'iso-office' }
  const snaps = (s: ReturnType<typeof openSse>) => s.events.filter((e) => e.event === 'snapshot').map((e) => e.data.company)
  try {
    await t.svc.enable(port)
    const old = openSse(port, t.token)
    const neu = openSse(port, t.token, undefined, NEW)
    await old.until(() => snaps(old).length >= 1)
    await neu.until(() => snaps(neu).length >= 1)
    assert.deepEqual([snaps(old)[0].level, snaps(old)[0].title, snaps(old)[0].progress], [10, COMPANY_LEVELS[9].title, 1])
    assert.equal(snaps(neu)[0].level, 14)

    // 새 폰이 hello를 보내도 아무것도 저장하지 않는다 — 예전 폰의 스트림·응답은 그대로 줄어든다
    const hello = await v2call(port, t.token, { method: 'hello', args: [{ capabilities: ['iso-office', 'zzz'] }] }, NEW)
    assert.deepEqual([hello.status, hello.body.protocolVersion, hello.body.result], [200, 2, { capabilities: ['iso-office'] }])
    assert.equal((await v2call(port, t.token, { method: 'hello', args: ['iso-office'] })).body.error, 'invalid_args')
    assert.equal((await v2call(port, t.token, { method: 'snapshot' })).body.result.company.level, 10)
    assert.equal((await v2call(port, t.token, { method: 'snapshot' }, NEW)).body.result.company.level, 14)

    t.svc.publish('snapshot', { company: { ...company(), level: 16 } })
    await old.until(() => snaps(old).length >= 2)
    await neu.until(() => snaps(neu).length >= 2)
    assert.equal(snaps(neu).at(-1)!.level, 16)
    // 예전 폰이 받은 모든 레벨이 10 이하
    assert.ok(snaps(old).every((c) => c.level <= 10 && c.title === COMPANY_LEVELS[9].title), JSON.stringify(snaps(old)))
    assert.equal(snaps(old).length, 2)

    // 새 폰이 다시 붙어도(재연결) 헤더를 실으면 실제 레벨, 예전 폰은 계속 10
    neu.close()
    const neu2 = openSse(port, t.token, undefined, NEW)
    await neu2.until(() => snaps(neu2).length >= 1)
    assert.equal(snaps(neu2)[0].level, 14)
    // 레벨 10 이하는 헤더가 없어도 그대로
    level = 7
    assert.deepEqual((await v2call(port, t.token, { method: 'snapshot' })).body.result.company, company())
    old.close()
    neu2.close()
  } finally {
    await t.cleanup()
  }
})

test('capabilities: 이벤트 스트림은 연결마다 모양을 따로 — 같은 값이면 문자열을 한 번만 만든다', async () => {
  const hub = new EventHub({
    snapshot: () => ({ company: { level: 15 } }),
    remoteStatus: () => ({}),
    isTokenValid: () => true,
    shape: (event, data, capabilities) => (event === 'snapshot' ? shapeFor(capabilities, data) : data),
  })
  const sink = () => {
    const out: string[] = []
    const res = { writeHead: () => {}, write: (c: string) => (out.push(c), true), on: () => {}, end: () => {}, destroyed: false, writableLength: 0 }
    return { res, out }
  }
  const a = sink()
  const b = sink()
  // 같은 토큰, 다른 연결
  hub.open(a.res as never, 'same', undefined)
  hub.open(b.res as never, 'same', undefined, parseCapabilities('iso-office'))
  const levelOf = (out: string[]) => out.filter((c) => c.includes('event: snapshot')).map((c) => JSON.parse(c.split('data: ')[1]).company.level)
  assert.deepEqual([levelOf(a.out), levelOf(b.out)], [[10], [15]])
  hub.publish('snapshot', { company: { level: 16 } })
  await new Promise((r) => setTimeout(r, 600))
  assert.deepEqual([levelOf(a.out), levelOf(b.out)], [[10, 10], [15, 16]])
  // log처럼 레벨이 없는 이벤트는 그대로
  hub.publish('log', { id: 1 })
  assert.ok(a.out.at(-1)!.includes('"id":1') && b.out.at(-1)!.includes('"id":1'))
  hub.closeAll('shutdown')
})
