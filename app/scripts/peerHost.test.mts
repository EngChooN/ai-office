// B컴 쪽(설계서 3·5·6·8절): 일 받기·중복 방지·슬롯 소속·결재 중계·사영(허용 목록), A컴의 결재 중계 카드
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApprovalRelay, parseRelayId, relayId } from '../src/main/peer/approvalRelay.ts'
import { PeerHost, peerSnapshotShape, type PeerHostOffice } from '../src/main/peer/peerHost.ts'
import { memoryPeerStore, type InboxJob, type PeerJob } from '../src/main/peer/peerStore.ts'
import { PEER_LIMITS, type PeerApprovalEvent } from '../src/shared/peerProtocol.ts'

const T0 = 1_800_000_000_000
const J1 = '11111111-1111-4111-8111-111111111111'
const J2 = '22222222-2222-4222-8222-222222222222'
const req = (over: Record<string, unknown> = {}) => ({ jobId: J1, staffId: 'kim', instruction: '배포해 줘', lead: { name: '리더', role: '리드' }, ...over })

function makeHost() {
  let now = T0
  const store = memoryPeerStore()
  const started: InboxJob[] = []
  const canceled: string[] = []
  const decided: [string, boolean][] = []
  const published: { slot: string; event: string; data: any }[] = []
  let startResult: 'ok' | 'no_staff' | 'auto_edit' = 'ok'
  const approvalJobs = new Map<string, string>()
  const office: PeerHostOffice = {
    staffBriefs: () => [{ id: 'kim', name: '김기획', role: '기획', avatar: 1, provider: 'claude', model: 'default', status: 'idle' }],
    startJob: (j) => (startResult === 'ok' ? (started.push(j), 'ok') : startResult),
    cancelJob: (j) => void canceled.push(j.id),
    decide: (id, allow) => (decided.push([id, allow]), true),
    answerQuestion: () => true,
    pendingApprovals: () => [...approvalJobs].map(([approvalId, jobId]) => ({ jobId, approvalId, staffId: 'kim', toolName: 'Bash', summary: 'ls', createdAt: T0 })),
    approvalJob: (id) => approvalJobs.get(id) ?? null,
  }
  const host = new PeerHost({ store, office, publish: (slot, event, data) => published.push({ slot, event, data }), now: () => now })
  return { host, store, started, canceled, decided, published, approvalJobs, setStart: (r: typeof startResult) => (startResult = r), advance: (ms: number) => (now += ms) }
}

test('일 받기: 202로 접수하고 수신함(DB)에 jobId로 저장, 직원에게 시킨다', () => {
  const h = makeHost()
  const r = h.host.accept('slotA', req())
  assert.deepEqual([r.status, r.body], [202, { jobId: J1, state: 'running' }])
  assert.equal(h.started.length, 1)
  assert.deepEqual([h.store.inbox.get(J1)?.slotId, h.store.inbox.get(J1)?.state], ['slotA', 'running'])
})

test('같은 jobId는 새로 만들지 않고 현재 상태를 돌려준다 (재시작·재전송 뒤에도)', () => {
  const h = makeHost()
  h.host.accept('slotA', req())
  const again = h.host.accept('slotA', req())
  assert.equal(again.status, 200)
  assert.equal(again.body.state, 'running')
  assert.equal(h.started.length, 1)
  // 일이 끝난 뒤 다시 보내도 결과를 돌려주고 다시 실행하지 않는다
  h.host.finish(J1, '배포 끝')
  const done = h.host.accept('slotA', req())
  assert.deepEqual([done.status, done.body.state, done.body.result], [200, 'done', '배포 끝'])
  assert.equal(h.started.length, 1)
  // 같은 DB로 새 PeerHost를 만들어도(앱 재시작) 같다
  const host2 = new PeerHost({ store: h.store, office: { ...({} as PeerHostOffice), startJob: () => assert.fail('다시 실행하면 안 된다') } as PeerHostOffice, publish: () => {} })
  assert.equal(host2.accept('slotA', req()).body.state, 'done')
})

test('다른 슬롯은 남의 일을 보지도 취소하지도 못한다', () => {
  const h = makeHost()
  h.host.accept('slotA', req())
  assert.equal(h.host.accept('slotB', req()).status, 404)
  assert.equal(h.host.cancel('slotB', J1).status, 404)
  assert.equal(h.host.ack('slotB', J1).status, 404)
  assert.deepEqual(h.host.jobs('slotB', J1).body, { jobs: [] })
  assert.equal((h.host.jobs('slotA', J1).body.jobs as unknown[]).length, 1)
})

test('입력 검사: jobId는 UUID, 지시는 비어 있지 않고 20,000자 이하, 모르는 직원 404, 자동 수정 직원 422', () => {
  const h = makeHost()
  for (const bad of [req({ jobId: 'abc' }), req({ instruction: '  ' }), req({ instruction: 'x'.repeat(PEER_LIMITS.instructionMax + 1) }), req({ staffId: 5 }), null, 'x']) assert.equal(h.host.accept('s', bad).status, 400, JSON.stringify(bad)?.slice(0, 40))
  h.setStart('no_staff')
  assert.equal(h.host.accept('s', req()).status, 404)
  assert.equal(h.store.inbox.get(J1), undefined) // 실패한 일은 수신함에 남지 않는다 (다시 보낼 수 있다)
  h.setStart('auto_edit')
  const r = h.host.accept('s', req())
  assert.deepEqual([r.status, r.body.error], [422, 'peer_auto_edit'])
})

test('완료·실패는 그 슬롯에만 job 이벤트로 알리고, 끝난 일은 한 번만 처리', () => {
  const h = makeHost()
  h.host.accept('slotA', req())
  h.host.finish(J1, '결과', 'cs1')
  h.host.finish(J1, '두 번째') // 무시
  h.host.fail(J1, 'boom') // 무시
  assert.equal(h.published.length, 1)
  assert.deepEqual(h.published[0], { slot: 'slotA', event: 'job', data: { jobId: J1, state: 'done', result: '결과', changesetId: 'cs1' } })
  h.host.accept('slotA', req({ jobId: J2 }))
  h.host.fail(J2, 'e '.repeat(450))
  assert.equal(h.store.inbox.get(J2)?.error?.length, 500)
})

test('취소: 상태를 먼저 닫고 세션을 멈춘다 (멈춤이 실패로 덮어쓰지 못한다)', () => {
  const h = makeHost()
  h.host.accept('slotA', req())
  const r = h.host.cancel('slotA', J1)
  assert.equal(r.body.state, 'canceled')
  assert.deepEqual(h.canceled, [J1])
  h.host.fail(J1, 'stopped') // 세션 중단이 뒤늦게 돌려주는 실패
  assert.equal(h.store.inbox.get(J1)?.state, 'canceled')
})

test('결재 중계: 그 슬롯이 보낸 일의 결재만 풀 수 있다', () => {
  const h = makeHost()
  h.host.accept('slotA', req())
  h.approvalJobs.set('ap1', J1)
  assert.deepEqual(h.host.decide('slotA', 'decide', ['ap1', true]).body, { ok: true, result: true })
  assert.deepEqual(h.decided, [['ap1', true]])
  // 다른 슬롯·피어 일이 아닌 결재·이미 사라진 결재는 풀지 않고 alreadyDecided
  for (const [slot, id] of [['slotB', 'ap1'], ['slotA', 'ap-local'], ['slotA', 'gone']] as const) assert.deepEqual(h.host.decide(slot, 'decide', [id, true]).body, { ok: true, result: false, alreadyDecided: true })
  assert.equal(h.decided.length, 1)
  assert.equal(h.host.decide('slotA', 'decide', [5, true]).status, 400)
  // 미결재 목록도 슬롯별
  assert.equal((h.host.approvals('slotA').body.approvals as unknown[]).length, 1)
  assert.equal((h.host.approvals('slotB').body.approvals as unknown[]).length, 0)
})

test('결재 이벤트: 일의 슬롯에만 나가고 alwaysRule은 싣지 않는다', () => {
  const h = makeHost()
  h.host.accept('slotA', req())
  const ev: PeerApprovalEvent = { jobId: J1, approvalId: 'ap1', staffId: 'kim', toolName: 'Edit', summary: 'a.ts', createdAt: T0 }
  h.host.onApproval({ ...ev, ...({ alwaysRule: { toolName: 'Edit', patterns: [] } } as object) } as PeerApprovalEvent)
  h.host.onApprovalGone('ap1', J1)
  h.host.onApproval({ ...ev, jobId: J2 }) // 수신함에 없는 일
  assert.equal(h.published.length, 2)
  assert.ok(h.published.every((p) => p.slot === 'slotA' && p.event === 'approval'))
  assert.deepEqual(h.published[1].data, { approvalId: 'ap1', gone: true })
})

test('슬롯이 사라지면 그 슬롯의 진행 중 일이 취소되고, 재시작 때 진행 중이던 일은 interrupted로 닫힌다', () => {
  const h = makeHost()
  h.host.accept('slotA', req())
  h.host.accept('slotB', req({ jobId: J2 }))
  h.host.dropSlot('slotA')
  assert.equal(h.store.inbox.get(J1)?.state, 'canceled')
  assert.deepEqual(h.canceled, [J1])
  h.host.recover()
  assert.deepEqual([h.store.inbox.get(J2)?.state, h.store.inbox.get(J2)?.error], ['failed', 'interrupted'])
})

test('수신함 정리: ack 뒤 30일, ack 없이 90일', () => {
  const h = makeHost()
  h.host.accept('s', req())
  h.host.accept('s', req({ jobId: J2 }))
  h.host.finish(J1, 'a')
  h.host.finish(J2, 'b')
  h.host.ack('s', J1)
  h.advance(PEER_LIMITS.inboxAckedKeepMs + 1)
  h.host.prune()
  assert.deepEqual([h.store.inbox.get(J1), h.store.inbox.get(J2)?.id], [undefined, J2])
  h.advance(PEER_LIMITS.inboxKeepMs)
  h.host.prune()
  assert.equal(h.store.inbox.get(J2), undefined)
})

test('watch: 고른 직원만 기억하고 모양이 틀리면 400', () => {
  const h = makeHost()
  assert.equal(h.host.watch('slotA', ['kim', 'lee']).status, 200)
  assert.equal(h.host.isWatched('slotA', 'kim'), true)
  assert.equal(h.host.isWatched('slotB', 'kim'), false)
  assert.equal(h.host.watch('slotA', [1]).status, 400)
  assert.equal(h.host.watch('slotA', 'kim').status, 400)
})

test('snapshot 사영: 고른 직원의 허용 필드만 — 지침·작업 폴더·장비·비용·회사 상태는 나가지 않는다', () => {
  const snapshot = {
    company: { level: 9 },
    settings: { defaultCwd: '/Users/me' },
    tasks: [{ id: 't' }],
    staff: [
      { id: 'kim', name: '김', role: '기획', avatar: 1, provider: 'claude', model: 'opus', status: 'working', activity: '파일 읽는 중', cwd: '/Users/me/secret', systemPrompt: '비밀 지침', refDocs: ['/a'], equipment: { mcpServers: ['x'] }, costUsd: 3, sessionId: 's1', approvals: [{ id: 'a' }] },
      { id: 'lee', name: '이', role: '개발', avatar: 2, provider: 'codex', model: 'm', status: 'idle', cwd: '/x' },
    ],
  }
  const out = peerSnapshotShape(snapshot, new Set(['kim']))
  assert.deepEqual(out, { staff: [{ id: 'kim', name: '김', role: '기획', avatar: 1, provider: 'claude', model: 'opus', status: 'working', thought: '파일 읽는 중' }] })
  const text = JSON.stringify(out)
  for (const leak of ['비밀 지침', '/Users/me', 'costUsd', 'sessionId', 'equipment', 'company', 'approvals']) assert.equal(text.includes(leak), false, leak)
  assert.deepEqual(peerSnapshotShape(null, new Set(['kim'])), { staff: [] })
})

// ── A컴의 결재 중계 ──

function makeRelay() {
  const store = memoryPeerStore()
  const sent: { peerId: string; kind: string; key: string; payload: any }[] = []
  let changes = 0
  const relay = new ApprovalRelay({ store, send: (peerId, kind, key, payload) => sent.push({ peerId, kind, key, payload }), peerName: () => '디자인 맥', onChange: () => changes++ })
  store.staff.put({ id: 'p:p1:kim', peerId: 'p1', remoteId: 'kim', name: '김', role: '기획', avatar: 1, provider: 'claude', model: 'm', lastKnownStatus: 'idle', lastSeenAt: T0, addedAt: T0 })
  const job: PeerJob = { id: J1, peerId: 'p1', remoteStaffId: 'kim', leadId: 'lead', instruction: 'x', state: 'running', attempts: 0, nextTryAt: 0, createdAt: T0 }
  store.jobs.put(job)
  const ev = (over: Partial<PeerApprovalEvent> = {}): PeerApprovalEvent => ({ jobId: J1, approvalId: 'ap1', staffId: 'kim', toolName: 'Bash', summary: 'rm -rf build', createdAt: T0, ...over })
  return { relay, store, sent, ev, changes: () => changes }
}

test('결재 중계: A컴 결재함에 p:<피어>:<id>로 올라오고 제목에 [원격: 피어명]이 붙는다', () => {
  const r = makeRelay()
  assert.equal(r.relay.onApproval('p1', r.ev()), true)
  const list = r.relay.approvalsOf('p:p1:kim')
  assert.equal(list.length, 1)
  assert.deepEqual([list[0].id, list[0].staffId, list[0].toolName], [relayId('p1', 'ap1'), 'p:p1:kim', 'Bash'])
  assert.match(list[0].summary, /^\[원격: 디자인 맥\] rm -rf build/)
  assert.equal(list[0].alwaysRule, undefined)
  assert.deepEqual(parseRelayId('p:p1:ap1'), { peerId: 'p1', approvalId: 'ap1' })
})

test('입력 불신: 모르는 jobId·다른 피어의 일·끝난 일·모르는 직원의 결재는 받지 않는다', () => {
  const r = makeRelay()
  assert.equal(r.relay.onApproval('p1', r.ev({ jobId: J2 })), false)
  assert.equal(r.relay.onApproval('p2', r.ev()), false)
  r.store.jobs.put({ ...r.store.jobs.get(J1)!, state: 'done' })
  assert.equal(r.relay.onApproval('p1', r.ev()), false)
  r.store.jobs.put({ ...r.store.jobs.get(J1)!, state: 'running' })
  r.store.staff.delete('p:p1:kim')
  assert.equal(r.relay.onApproval('p1', r.ev()), false)
  assert.equal(r.relay.approvalsOf('p:p1:kim').length, 0)
})

test('승인·거절은 B컴으로 보낼 큐에 쌓이고(키 appr:<id>:<allow>) 카드는 사라진다', () => {
  const r = makeRelay()
  r.relay.onApproval('p1', r.ev())
  assert.equal(r.relay.decide(relayId('p1', 'ap1'), false), true)
  assert.deepEqual(r.sent, [{ peerId: 'p1', kind: 'decide', key: 'appr:ap1:false', payload: { method: 'decide', args: ['ap1', false] } }])
  assert.equal(r.relay.approvalsOf('p:p1:kim').length, 0)
  assert.equal(r.relay.decide(relayId('p1', 'ap1'), true), false) // 이미 처리
  assert.equal(r.relay.decide('p:p1:모름', true), false)
})

test('질문 답, B컴에서 먼저 처리(gone), 일 끝남, 재연결 대조', () => {
  const r = makeRelay()
  r.relay.onApproval('p1', r.ev({ approvalId: 'q1', toolName: 'AskUserQuestion', questions: [{ question: '?', header: 'h', options: [], multiSelect: false }] }))
  assert.equal(r.relay.answer(relayId('p1', 'q1'), { '?': 'A' }), true)
  assert.deepEqual(r.sent[0].payload, { method: 'answerQuestion', args: ['q1', { '?': 'A' }] })
  r.relay.onApproval('p1', r.ev({ approvalId: 'x1' }))
  r.relay.onGone('p1', 'x1')
  r.relay.onGone('p2', 'x1') // 다른 피어가 지우지 못한다
  assert.equal(r.relay.approvalsOf('p:p1:kim').length, 0)
  r.relay.onApproval('p1', r.ev({ approvalId: 'y1' }))
  r.relay.dropJob(J1)
  assert.equal(r.relay.approvalsOf('p:p1:kim').length, 0)
  // 재연결: B컴의 미결재 목록과 맞춘다 (없어진 것은 지우고 새 것은 올린다)
  r.relay.onApproval('p1', r.ev({ approvalId: 'old' }))
  r.relay.reconcile('p1', [r.ev({ approvalId: 'new' })])
  assert.deepEqual(r.relay.approvalsOf('p:p1:kim').map((a) => a.id), [relayId('p1', 'new')])
  r.relay.dropPeer('p1')
  assert.equal(r.relay.approvalsOf('p:p1:kim').length, 0)
})

test('첨부 정리: 일에 쓰이지 않은 첨부는 기간이 지나거나 슬롯을 해제하면 파일까지 지우고, 쓰인 파일은 남긴다', () => {
  let now = T0
  let n = 0
  const removed: string[] = []
  const store = memoryPeerStore()
  const office = { startJob: () => 'ok' } as unknown as PeerHostOffice
  const host = new PeerHost({
    store,
    office,
    publish: () => {},
    now: () => now,
    saveUpload: (name, mime, data) => ({ id: `u${++n}`, name, path: `/att/u${n}`, mime, size: data.length }),
    removeUpload: (id) => void removed.push(id),
  })
  const put = (slot: string, size = 1) => host.upload(slot, 'a.txt', 'text/plain', Buffer.alloc(size))
  const used = put('slotA').body.attachment as { id: string }
  const orphan = put('slotA').body.attachment as { id: string }
  assert.equal(host.accept('slotA', req({ attachmentIds: [used.id] })).status, 202)
  assert.equal(store.uploads.get(used.id)?.usedBy, J1)
  now += PEER_LIMITS.attachmentKeepMs + 1
  put('slotB') // 다음 올리기 때 오래된 기록을 정리한다
  assert.deepEqual([store.uploads.get(used.id), store.uploads.get(orphan.id), removed], [undefined, undefined, [orphan.id]])
  // 슬롯 해제: 쓰이지 않은 그 슬롯 첨부는 파일까지
  host.dropSlot('slotB')
  assert.deepEqual(removed, [orphan.id, 'u3'])
  // 슬롯마다 쓰이지 않은 첨부 수·용량 상한 → 413 (A컴은 그 첨부만 빼고 보낸다)
  for (let i = 0; i < PEER_LIMITS.uploadsPendingMax; i++) assert.equal(put('slotC').status, 201)
  assert.deepEqual([put('slotC').status, put('slotC').body.error], [413, 'upload_quota_exceeded'])
  assert.equal(put('slotD').status, 201) // 다른 슬롯은 따로 센다
  assert.equal(put('slotE', PEER_LIMITS.uploadsPendingBytesMax).status, 413)
})
