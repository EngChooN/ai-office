// PC 두 대 통합 시험 (실제 HTTPS·SSE, 한 프로세스): B컴 = RemoteService + PeerHost(가짜 직원), A컴 = PeerManager(진짜 통로)
// 짝짓기 → 원격 직원 → delegate → 실시간 진행 → [팀원 보고] → 결재 중계 → 연결 끊김·자동 재전달 → 해제 + 권한 범위
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import https from 'node:https'
import net from 'node:net'
import { test } from 'node:test'
import { newToken } from '../src/main/remote/auth.ts'
import { DEFAULT_REMOTE_CONFIG, RemoteService, type RemoteConfig } from '../src/main/remote/service.ts'
import { PeerHost, peerSnapshotShape, type PeerHostOffice } from '../src/main/peer/peerHost.ts'
import { PeerManager, type PeerOfficePort } from '../src/main/peer/peerManager.ts'
import { memoryPeerStore, type InboxJob, type PeerJob } from '../src/main/peer/peerStore.ts'
import { memoryTokenVault } from '../src/main/peer/peerRegistry.ts'
import { createOpenStream, createPairTransport, createPeerHttp } from '../src/main/peer/peerTransport.ts'
import { relayId } from '../src/main/peer/approvalRelay.ts'
import { remoteStaffBase } from '../src/main/peer/remoteStaffView.ts'
import { createSelfSignedCert } from '../src/main/remote/cert.ts'
import { pairWithHost, type PairFailure } from '../src/main/peer/pairing.ts'
import { PeerSync } from '../src/main/peer/sync/peerSyncService.ts'
import { memorySyncStore } from '../src/main/peer/sync/syncDb.ts'
import type { SyncHttp } from '../src/shared/peerSync.ts'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
const J_SYNC = '99999999-9999-4999-8999-999999999999'
import os from 'node:os'
import path from 'node:path'

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

/** B컴: 실제 RemoteService + PeerHost. 직원은 가짜 */
function makeB(port: number, now?: () => number) {
  const phoneToken = newToken()
  let config: RemoteConfig = { ...DEFAULT_REMOTE_CONFIG, port, host: '127.0.0.1', mode: 'router', tokenHash: null, isTokenUsed: true, isLanNoticeSeen: true, isTsNoticeSeen: true }
  let keys = createSelfSignedCert()
  const store = memoryPeerStore()
  const started: InboxJob[] = []
  const decided: [string, boolean][] = []
  const approvalJobs = new Map<string, string>()
  const calls: string[] = []
  const canceled: string[] = []
  let svc: RemoteService
  const office: PeerHostOffice = {
    staffBriefs: () => [
      { id: 'kim', name: '김배포', role: '배포', avatar: 3, provider: 'claude', model: 'default', status: 'idle', thought: '대기 중' },
      { id: 'auto', name: '자동수정', role: '개발', avatar: 4, provider: 'claude', model: 'default', status: 'idle', isAutoEdit: true },
    ],
    startJob: (j) => (started.push(j), 'ok'),
    cancelJob: (j) => void canceled.push(j.id),
    decide: (id, allow) => (decided.push([id, allow]), true),
    answerQuestion: () => true,
    pendingApprovals: () => [...approvalJobs].map(([approvalId, jobId]) => ({ jobId, approvalId, staffId: 'kim', toolName: 'Bash', summary: 'deploy.sh', createdAt: Date.now() })),
    approvalJob: (id) => approvalJobs.get(id) ?? null,
  }
  // 피어가 올린 첨부: 진짜 파일로 저장한다 (휴대폰 올리기와 같은 saveUpload 자리)
  const attachDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peer-b-att-'))
  const saveUpload = (name: string, mime: string, data: Buffer) => {
    const id = crypto.randomUUID()
    const file = path.join(attachDir, `${id}__${name}`)
    fs.writeFileSync(file, data)
    return { id, name, path: file, mime, size: data.length }
  }
  const syncB = new PeerSync({ baseDir: fs.mkdtempSync(path.join(os.tmpdir(), 'peer-b-')), store: memorySyncStore(), registeredRoots: () => [] })
  const host = new PeerHost({ store, office, publish: (slot, event, data) => svc.publishToSlot(slot, event as 'job' | 'approval', data), workspaceReady: (id, slot) => syncB.workspaces.record(id)?.slotId === slot && syncB.workspaces.record(id)?.state === 'ready', saveUpload })
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
    peer: { host, sync: syncB, ownName: () => 'B컴', shapePeer: (slot, ev, data) => (ev === 'snapshot' ? peerSnapshotShape(data, host.watchedBy(slot)) : null), onSlotRemoved: (slot) => host.dropSlot(slot) },
  })
  void phoneToken
  return { svc, host, store, started, decided, approvalJobs, calls, canceled, config: () => config, sync: syncB }
}

/** A컴: 진짜 통로 + 메모리 저장소 */
function makeA() {
  const reports: { job: PeerJob; info: { name: string; role: string; text: string } }[] = []
  const labs = new Map<string, string[]>()
  let changes = 0
  const office: PeerOfficePort = {
    report: (job, info) => reports.push({ job, info }),
    changed: () => changes++,
    context: () => ({ lead: { name: '리더', role: '리드' }, lab: { name: '배포랩', goal: '배포' } }),
    addToLab: (labId, staffId) => labs.set(labId, [...(labs.get(labId) ?? []), staffId]),
    removeFromLabs: (ids) => {
      for (const [k, v] of labs) labs.set(k, v.filter((x) => !ids.includes(x)))
    },
    ownName: () => 'A컴',
  }
  const store = memoryPeerStore()
  const vault = memoryTokenVault()
  const mgr = new PeerManager({
    store,
    vault,
    office,
    net: { pair: createPairTransport, http: (p, t) => createPeerHttp(p, t), stream: (p, t) => createOpenStream(p, t) },
    isHostAllowed: (h) => h === '127.0.0.1',
    clientOptions: { retryMs: [30, 30], offlineAfterMs: 150, idleMs: 10_000 },
    text: (key, params) => `${key}:${JSON.stringify(params ?? {})}`,
  })
  return { mgr, store, vault, reports, labs, changes: () => changes }
}

test('PC 두 대: 짝짓기 → 원격 직원 → delegate → 진행 → 보고 → 결재 → 끊김·재전달 → 해제', { timeout: 30_000 }, async () => {
  const port = await freePort()
  const B = makeB(port)
  const A = makeA()
  try {
    await B.svc.enable(port)
    assert.equal(B.svc.status().isListening, true)

    // ── ① 짝짓기: 틀린 코드는 거절, 맞는 코드면 토큰 교환
    const win = await B.svc.openPairing('peer')
    assert.ok(win && /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(win.code))
    assert.equal(win!.fingerprint.length, 8)
    assert.equal(win!.copyText, `127.0.0.1:${port} ${win!.code}`)
    assert.match(win!.qr ?? '', /^data:image\/svg\+xml;base64,/)
    const wrong = win!.code === '0000-0000-0000' ? '1111-1111-1111' : '0000-0000-0000'
    await assert.rejects(A.mgr.pairConnect('127.0.0.1', port, wrong), (e: PairFailure) => e.code === 'wrong_code' && e.remaining === 2)
    await assert.rejects(A.mgr.pairConnect('8.8.8.8', port, win!.code), (e: PairFailure) => e.code === 'bad_host')
    const paired = await A.mgr.pairConnect('127.0.0.1', port, win!.code)
    assert.equal(paired.name, 'B컴')
    assert.equal(paired.fingerprint, win!.fingerprint)
    assert.equal(B.svc.pairingView(), null) // 코드는 1회용 — 창이 닫혔다
    assert.equal(B.svc.peerSlots().length, 1)
    assert.equal(B.svc.peerSlots()[0].label, 'A컴')
    // B컴 설정에는 토큰 원문이 없다 (해시만), A컴 금고에는 있다
    const token = A.vault.load(paired.id) as string
    assert.ok(token && !JSON.stringify(B.config()).includes(token))
    // 같은 코드로 다시는 안 된다
    await assert.rejects(A.mgr.pairConnect('127.0.0.1', port, win!.code), (e: PairFailure) => e.code === 'closed')

    // ── 4번 연결: 파일 복사본 경로가 404가 아니고, 실제 HTTPS로 파일 바이트가 올라가 B컴에 복사본 폴더가 만들어진다
    assert.notEqual((await rawReq(port, '/v2/peer/workspaces', token, 'POST', { manifest: 'bad' })).status, 404)
    const rootA = await fsp.mkdtemp(path.join(os.tmpdir(), 'peer-a-root-'))
    await fsp.writeFile(path.join(rootA, 'a.txt'), '안녕')
    const syncA = new PeerSync({ baseDir: await fsp.mkdtemp(path.join(os.tmpdir(), 'peer-a-')), store: memorySyncStore(), registeredRoots: () => [rootA] })
    const peerRec = A.mgr.registry.getPeer(paired.id)!
    const rawHttp = createPeerHttp({ host: '127.0.0.1', port, spki: peerRec.spki }, token)
    const sh: SyncHttp = { call: (m, p, b) => rawHttp.call(m, p, b), putBytes: (p, d) => rawHttp.putBytes!(p, d), getBytes: (p, l) => rawHttp.getBytes!(p, l) }
    const prepared = await syncA.prepareWorkspace(rootA, { peerId: paired.id })
    await syncA.pushWorkspace(sh, prepared.workspaceId)
    const wsDir = B.sync.workspaceDir(prepared.workspaceId)
    assert.ok(wsDir)
    assert.equal(await fsp.readFile(path.join(wsDir!, 'a.txt'), 'utf8'), '안녕')
    // B컴에서 바꾼 파일이 변경 묶음이 되고, A컴이 같은 통로로 받아 카드를 만든다
    await fsp.writeFile(path.join(wsDir!, 'a.txt'), '바뀜')
    const collected = await B.sync.collectChanges(J_SYNC, prepared.workspaceId)
    assert.ok('changesetId' in collected)
    const csView = await syncA.fetchChangeSet(sh, (collected as { changesetId: string }).changesetId, prepared.workspaceId)
    const syncCard = await syncA.approvalCard(csView)
    assert.deepEqual(syncCard.files.map((f) => [f.op, f.path, f.verdict]), [['modify', 'a.txt', 'apply']])
    assert.equal((await syncA.applyChangeSet(csView.changesetId, { mode: 'all' })).status, 'applied')
    assert.equal(await fsp.readFile(path.join(rootA, 'a.txt'), 'utf8'), '바뀜')

    // ── ② 연결 상태 online + 원격 직원 목록·랩에 넣기
    await until(() => A.mgr.linkState(paired.id) === 'online', 'online')
    const choices = await A.mgr.remoteStaff(paired.id)
    assert.deepEqual(choices.map((c) => [c.id, c.isAdded]), [['kim', false], ['auto', false]])
    await assert.rejects(A.mgr.addStaff(paired.id, 'auto'), (e: { code: string }) => e.code === 'auto_edit') // 자동 수정 직원은 못 넣는다
    await assert.rejects(A.mgr.addStaff(paired.id, 'nobody'), (e: { code: string }) => e.code === 'no_staff')
    const rec = await A.mgr.addStaff(paired.id, 'kim', 'lab1')
    assert.equal(rec.id, `p:${paired.id}:kim`)
    assert.deepEqual(A.labs.get('lab1'), [rec.id])
    assert.equal((await A.mgr.remoteStaff(paired.id)).find((c) => c.id === 'kim')?.isAdded, true)
    await until(() => B.host.isWatched(B.svc.peerSlots()[0].id, 'kim'), 'watch')
    // 화면용 목록: 원격 표시와 연결 상태
    const view = A.mgr.staffViews((r) => remoteStaffBase(r, 5, ['lab1']))
    assert.deepEqual([view[0].id, view[0].remote?.state, view[0].remote?.peerName], [rec.id, 'online', 'B컴'])
    assert.equal(A.mgr.list()[0].staffCount, 1)

    // ── ③ delegate → B컴에서 실행 → 실시간 진행 → [팀원 보고]
    const job = A.mgr.delegate(rec.id, '배포해 줘', { leadId: 'lead', room: 'room1' })
    await until(() => B.started.length === 1, 'B가 일을 받음')
    assert.deepEqual([B.started[0].id, B.started[0].instruction, B.started[0].lead, B.started[0].lab?.name], [job.id, '배포해 줘', { name: '리더', role: '리드' }, '배포랩'])
    await until(() => A.mgr.jobs()[0].state === 'running', 'running')
    // 실시간 진행: B컴 snapshot이 고른 직원만, 줄인 모양으로 와서 활동이 보인다
    B.svc.publish('snapshot', { staff: [{ id: 'kim', name: '김배포', role: '배포', avatar: 3, provider: 'claude', model: 'default', status: 'working', activity: '배포 스크립트 실행 중', cwd: '/secret' }], company: { secret: 1 } })
    await until(() => A.mgr.staffViews((r) => remoteStaffBase(r, 5, []))[0].activity === '배포 스크립트 실행 중', 'thought')
    assert.equal(A.mgr.staffViews((r) => remoteStaffBase(r, 5, []))[0].status, 'working')

    // ── ⑤ 결재: B컴 직원의 결재가 A컴에 뜨고, 승인하면 B컴에 반영
    B.approvalJobs.set('ap1', job.id)
    B.host.onApproval({ jobId: job.id, approvalId: 'ap1', staffId: 'kim', toolName: 'Bash', summary: './deploy.sh', createdAt: Date.now() })
    await until(() => A.mgr.relay.approvalsOf(rec.id).length === 1, '결재 도착')
    const card = A.mgr.relay.approvalsOf(rec.id)[0]
    assert.equal(card.id, relayId(paired.id, 'ap1'))
    assert.match(card.summary, /\[원격: B컴\] \.\/deploy\.sh/)
    assert.equal(A.mgr.isRelayedApproval(card.id), true)
    assert.equal(A.mgr.decide(card.id, true), true)
    await until(() => B.decided.length === 1, 'B에 결정 반영')
    assert.deepEqual(B.decided[0], ['ap1', true])
    assert.equal(A.mgr.relay.approvalsOf(rec.id).length, 0)
    B.approvalJobs.delete('ap1')

    // 결과 → [팀원 보고]
    B.host.finish(job.id, '배포 완료했어요')
    await until(() => A.reports.length === 1, '보고')
    assert.deepEqual([A.reports[0].job.leadId, A.reports[0].job.room, A.reports[0].info.name, A.reports[0].info.role], ['lead', 'room1', '김배포', '배포'])
    assert.match(A.reports[0].info.text, /^\[tag:\{"name":"B컴"\}\] 배포 완료했어요$/)
    await until(() => B.store.inbox.get(job.id)?.ackedAt !== undefined, 'ack')

    // ── ⑥ 연결 끊김: 일은 연결 대기로 남고, 다시 붙으면 자동으로 한 번만 전달
    await B.svc.disable()
    await until(() => A.mgr.linkState(paired.id) !== 'online', '끊김 감지')
    await until(() => A.mgr.linkState(paired.id) === 'offline', 'offline(회색)')
    const waiting = A.mgr.delegate(rec.id, '재배포', { leadId: 'lead', room: 'room1' })
    await wait(80)
    assert.equal(A.mgr.jobs().find((j) => j.id === waiting.id)?.state, 'queued')
    assert.equal(A.mgr.list()[0].queued, 1)
    assert.equal(B.started.length, 1)
    // 끊긴 동안에도 결정이 큐에 남는다
    B.approvalJobs.set('ap2', waiting.id)
    await B.svc.enable(port)
    await until(() => A.mgr.linkState(paired.id) === 'online', '재연결')
    await until(() => B.started.length === 2, '자동 전달')
    assert.equal(B.started[1].id, waiting.id)
    await wait(150)
    assert.equal(B.started.length, 2) // 두 번 보내지 않았다
    assert.equal(B.store.inbox.list().length, 2)
    B.approvalJobs.delete('ap2')

    // ── 이 일 멈추기: 원격 직원의 진행 중인 일을 취소하고 B컴에 취소를 보내며, 그 일의 결재 카드도 닫는다
    B.approvalJobs.set('ap3', waiting.id)
    B.host.onApproval({ jobId: waiting.id, approvalId: 'ap3', staffId: 'kim', toolName: 'Bash', summary: 'rm', createdAt: Date.now() })
    await until(() => A.mgr.relay.approvalsOf(rec.id).length === 1, '멈출 일의 결재 도착')
    assert.equal(A.mgr.stopStaff(rec.id), 1)
    assert.equal(A.mgr.jobs().find((j) => j.id === waiting.id)?.state, 'canceled')
    assert.equal(A.mgr.relay.approvalsOf(rec.id).length, 0)
    await until(() => B.canceled.includes(waiting.id), 'B에 취소 전달')
    assert.equal(A.mgr.stopStaff(rec.id), 0) // 멈출 일이 없으면 0
    B.approvalJobs.delete('ap3')

    // ── 권한 범위: 피어 토큰으로는 그 밖의 어떤 기능도 못 쓴다
    assert.equal((await rawReq(port, '/v1/status', token)).status, 403)
    assert.equal((await rawReq(port, '/v1/status', token)).body.error, 'scope_denied')
    for (const method of ['hire', 'fire', 'snapshot', 'setRemoteEnabled', 'instruct', 'pickFolder']) {
      const r = await rawReq(port, '/v2/call', token, 'POST', { method, args: [] })
      assert.deepEqual([r.status, r.body.error], [403, 'scope_denied'], method)
    }
    // 자기 일의 결재만: 모르는 결재는 alreadyDecided(풀리지 않음)
    const other = await rawReq(port, '/v2/call', token, 'POST', { method: 'decide', args: ['not-mine', true] })
    assert.deepEqual([other.status, other.body.result, other.body.alreadyDecided], [200, false, true])
    assert.equal(B.decided.length, 1)
    // 피어 경로: 휴대폰 토큰이 아닌 피어 토큰만, 알 수 없는 경로는 404
    assert.equal((await rawReq(port, '/v2/peer/nope', token)).status, 404)
    assert.equal((await rawReq(port, '/v2/peer/jobs', 'wrong-token-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).status, 401)

    // ── 해제: A컴에서 끊으면 B컴 슬롯도 사라지고 토큰은 쓸 수 없다
    await A.mgr.unpair(paired.id)
    assert.equal(A.mgr.list().length, 0)
    assert.equal(A.vault.load(paired.id), null)
    assert.deepEqual(A.labs.get('lab1'), [])
    await until(() => B.svc.peerSlots().length === 0, 'B 슬롯 삭제')
    assert.equal((await rawReq(port, '/v2/peer/staff', token)).body.error, 'token_revoked')
    assert.equal(A.mgr.jobs().filter((j) => j.state === 'running' || j.state === 'queued').length, 0)
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

test('SSE 연결은 피어마다 1개, 휴대폰 이벤트(remoteStatus·log)는 피어에 나가지 않는다', { timeout: 20_000 }, async () => {
  const port = await freePort()
  const B = makeB(port)
  const A = makeA()
  try {
    await B.svc.enable(port)
    const win = (await B.svc.openPairing('peer'))!
    const paired = await A.mgr.pairConnect('127.0.0.1', port, win.code)
    await until(() => A.mgr.linkState(paired.id) === 'online', 'online')
    const token = A.vault.load(paired.id) as string
    // 같은 슬롯으로 SSE를 하나 더 열면 먼저 것이 replaced로 밀려난다 (A컴 연결은 재연결로 돌아오고, 그 사이 이벤트 종류만 본다)
    const seen: string[] = []
    await new Promise<void>((resolve) => {
      const r = https.request({ host: '127.0.0.1', port, path: '/v2/events', rejectUnauthorized: false, agent: false, headers: { Authorization: `Bearer ${token}` } }, (res) => {
        res.setEncoding('utf8')
        res.on('data', (c: string) => {
          for (const m of c.matchAll(/^event: (\w+)$/gm)) seen.push(m[1])
          if (seen.includes('snapshot')) (r.destroy(), resolve())
        })
      })
      r.on('error', () => resolve())
      r.end()
    })
    assert.ok(seen.includes('hello') && seen.includes('snapshot'))
    assert.equal(seen.includes('remoteStatus'), false)
    B.svc.publish('log', { id: 1, staffId: 'kim', text: '비밀 로그' })
    B.svc.publish('chat', { id: 1, sender: 'kim', text: '비밀 대화' })
    await wait(100)
    assert.equal(seen.includes('log') || seen.includes('chat'), false)
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
    // 맞는 지문이면 통과
    const good = createPeerHttp({ host: '127.0.0.1', port, spki: A.mgr.registry.getPeer(paired.id)!.spki }, token)
    assert.equal((await good.call('GET', '/v2/peer/staff')).status, 200)
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

/** 바이트 올리기 (헤더를 마음대로 — 길이 없음·거짓 길이 시험용) */
function rawPut(port: number, path: string, token: string, data: Buffer | null, headers: Record<string, string | number>): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const r = https.request({ host: '127.0.0.1', port, path, method: 'PUT', rejectUnauthorized: false, agent: false, headers: { Authorization: `Bearer ${token}`, ...headers } }, (res) => {
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
    if (data) r.write(data)
    r.end()
  })
}

test('첨부: A컴 파일을 올리고 일과 함께 보내면 B컴 직원 지시에 실린다 · 다른 슬롯 id는 버린다 · 한도', { timeout: 30_000 }, async () => {
  const port = await freePort()
  const B = makeB(port)
  const A = makeA()
  const A2 = makeA()
  try {
    await B.svc.enable(port)
    const paired = await A.mgr.pairConnect('127.0.0.1', port, (await B.svc.openPairing('peer'))!.code)
    await until(() => A.mgr.linkState(paired.id) === 'online', 'online')
    const rec = await A.mgr.addStaff(paired.id, 'kim')
    const token = A.vault.load(paired.id) as string
    const slotA = B.svc.peerSlots()[0].id

    // ── 업로드 → 일 수락 → startJob에 첨부(B컴 파일)가 실린다. 사라진 파일은 빼고 보내고 지시·보고에 알린다
    const dirA = await fsp.mkdtemp(path.join(os.tmpdir(), 'peer-a-att-'))
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
    await fsp.writeFile(path.join(dirA, '화면.png'), png)
    const job = A.mgr.delegate(rec.id, '이 그림 봐 줘', {
      leadId: null,
      attachments: [
        { path: path.join(dirA, '화면.png'), name: '화면.png', mime: 'image/png' },
        { path: path.join(dirA, 'gone.txt'), name: 'gone.txt', mime: 'text/plain' },
      ],
    })
    await until(() => B.started.length === 1, 'B가 일을 받음')
    const got = B.started[0]
    assert.equal(got.id, job.id)
    assert.deepEqual(got.attachments?.map((a) => [a.name, a.mime, a.size]), [['화면.png', 'image/png', png.length]])
    assert.deepEqual(await fsp.readFile(got.attachments![0].path), png)
    assert.equal(got.droppedAttachments, undefined)
    assert.match(got.instruction, /^이 그림 봐 줘\n\nattachDropped:\{"files":"gone.txt"\}$/)
    // A컴 일에는 올린 B컴 id와 뺀 이유가 남는다 (다시 보낼 때 올린 것은 건너뛴다)
    const saved = A.mgr.jobs().find((j) => j.id === job.id)!
    assert.deepEqual(saved.attachments?.map((a) => [a.name, Boolean(a.remoteId), a.dropped]), [['화면.png', true, undefined], ['gone.txt', false, 'missing']])
    B.host.finish(job.id, '봤어요')
    await until(() => A.reports.length === 1, '보고')
    assert.match(A.reports[0].info.text, /attachFailed:\{"files":"gone.txt"\}$/)

    // ── 다른 슬롯이 올린 id는 쓸 수 없다: A2가 올린 첨부 id를 A가 보내면 버리고 수만 남긴다
    const paired2 = await A2.mgr.pairConnect('127.0.0.1', port, (await B.svc.openPairing('peer'))!.code)
    const token2 = A2.vault.load(paired2.id) as string
    const up2 = await rawPut(port, '/v2/peer/attachments', token2, Buffer.from('비밀'), { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength('비밀'), 'X-File-Name': encodeURIComponent('남의.txt') })
    assert.equal(up2.status, 201)
    assert.deepEqual(Object.keys(up2.body.attachment).sort(), ['id', 'mime', 'name', 'size']) // B컴 경로는 나가지 않는다
    assert.equal(up2.body.attachment.name, '남의.txt')
    const otherJob = crypto.randomUUID()
    const r = await rawReq(port, '/v2/peer/jobs', token, 'POST', { jobId: otherJob, staffId: 'kim', instruction: '이것도', lead: { name: '', role: '' }, attachmentIds: [up2.body.attachment.id, 'no-such-id'] })
    assert.equal(r.status, 202)
    const stolen = B.started.find((j) => j.id === otherJob)!
    assert.deepEqual([stolen.attachments, stolen.droppedAttachments], [undefined, 2])
    assert.equal(B.store.inbox.get(otherJob)?.slotId, slotA)

    // ── 한도: 파일당 크기(밝힌 길이로 본문 전에 거절)·길이 없음·일 하나당 개수·메서드·휴대폰 토큰
    const big = await rawPut(port, '/v2/peer/attachments', token, null, { 'Content-Type': 'image/png', 'Content-Length': 20 * 1024 * 1024 + 1 })
    assert.deepEqual([big.status, big.body?.error], [413, 'payload_too_large'])
    const chunked = await rawPut(port, '/v2/peer/attachments', token, Buffer.from('x'), { 'Transfer-Encoding': 'chunked' })
    assert.deepEqual([chunked.status, chunked.body?.error], [411, 'length_required'])
    const ids: string[] = []
    for (let i = 0; i < 6; i++) ids.push((await rawPut(port, '/v2/peer/attachments', token, Buffer.from(`f${i}`), { 'Content-Length': 2, 'X-File-Name': `f${i}.txt` })).body.attachment.id)
    const tooMany = await rawReq(port, '/v2/peer/jobs', token, 'POST', { jobId: crypto.randomUUID(), staffId: 'kim', instruction: '많다', lead: { name: '', role: '' }, attachmentIds: ids })
    assert.deepEqual([tooMany.status, tooMany.body.error, tooMany.body.message], [400, 'invalid_request', 'too_many_attachments'])
    const five = await rawReq(port, '/v2/peer/jobs', token, 'POST', { jobId: crypto.randomUUID(), staffId: 'kim', instruction: '다섯', lead: { name: '', role: '' }, attachmentIds: ids.slice(0, 5) })
    assert.equal(five.status, 202)
    assert.equal(B.started.at(-1)!.attachments?.length, 5)
    assert.equal((await rawReq(port, '/v2/peer/attachments', token, 'POST', {})).status, 405)
    // A컴 일 큐도 6번째부터는 빼고 보낸다
    const many = A.mgr.delegate(rec.id, '여섯 개', { leadId: null, room: '', attachments: Array.from({ length: 6 }, () => ({ path: path.join(dirA, '화면.png'), name: '화면.png', mime: 'image/png' })) })
    await until(() => B.started.some((j) => j.id === many.id), '여섯 개 일')
    assert.equal(B.started.find((j) => j.id === many.id)!.attachments?.length, 5)
    assert.equal(A.mgr.jobs().find((j) => j.id === many.id)!.attachments?.[5].dropped, 'too_many')
    assert.equal(A.mgr.jobs().find((j) => j.id === many.id)!.room, '', '전체 방(\'\')은 일 큐에서 버려지지 않는다')
    // 슬롯을 해제하면 그 슬롯이 올린 첨부 기록도 지운다
    B.svc.revokePeerSlot(B.svc.peerSlots().find((s) => s.id !== slotA)!.id)
    assert.equal(B.store.uploads.get(up2.body.attachment.id), undefined)
  } finally {
    A.mgr.dispose()
    A2.mgr.dispose()
    await B.svc.disable()
  }
})
