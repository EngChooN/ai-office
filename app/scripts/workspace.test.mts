// 워크스페이스(다른 PC 화면 보기) 1단계: 상태 판정·읽기/쓰기 표·저장·창 묶음·총괄·마법사·구조 보장(의존 방향·통로·PC 전용 잠금)
// 설계: docs/design-refresh/connect-workspace/impl-design-decision.md

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { OFFICE_METHODS } from '../src/shared/officeApiShape.ts'
import {
  accessOf,
  canAddWorkspace,
  canOpenWindow,
  gateCall,
  leastRecentlyUsed,
  METHOD_ACCESS,
  nextFreeColor,
  statusOf,
  WORKSPACE_MAX,
  WORKSPACE_MIN_PEER_PROTOCOL,
  WORKSPACE_OFFLINE_GRACE_MS,
  type StatusInput,
  type Workspace,
  type WorkspacesState,
  type WorkspaceStatus,
} from '../src/shared/workspace.ts'
import { createWorkspaceStore } from '../src/main/workspace/workspaceStore.ts'
import { createWindowHub, partitionOf, type Bounds, type HubWindow } from '../src/main/workspace/workspaceWindows.ts'
import { createWorkspaceService, noLinks, parseRemotePost, type WorkspaceLinks } from '../src/main/workspace/workspaceService.ts'
import { canFinish, canNext, initialWizard, wizardReducer } from '../src/renderer/features/workspace/wizard.ts'

const APP = path.resolve(import.meta.dirname, '..')
const SRC = path.join(APP, 'src')
const read = (p: string) => fs.readFileSync(path.join(APP, p), 'utf8')
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []))

// ── 상태 판정 statusOf ─────────────────────────────────

const HELLO_OK = { protocol: WORKSPACE_MIN_PEER_PROTOCOL, canView: true, grant: 'granted' as const }
const base: StatusInput = { link: 'online', hasBeenOnline: true, hello: HELLO_OK, now: 100_000 }

test('statusOf: 상태 표', () => {
  const rows: [string, Partial<StatusInput>, WorkspaceStatus][] = [
    ['연결·확인 통과', {}, 'ready'],
    ['online인데 hello 전', { hello: null }, 'connecting'],
    ['처음 붙는 중', { link: 'connecting', hasBeenOnline: false, hello: null, downSince: 99_000 }, 'connecting'],
    ['처음부터 못 붙고 8초 지남 = 꺼져 있음', { link: 'offline', hasBeenOnline: false, hello: null, downSince: 100_000 - WORKSPACE_OFFLINE_GRACE_MS }, 'offline'],
    ['처음부터 못 붙고 8초 전', { link: 'offline', hasBeenOnline: false, hello: null, downSince: 100_000 - WORKSPACE_OFFLINE_GRACE_MS + 1 }, 'connecting'],
    ['끊긴 지 8초 직전 = 깜빡임 방지', { link: 'offline', downSince: 100_000 - WORKSPACE_OFFLINE_GRACE_MS + 1 }, 'reconnecting'],
    ['끊긴 지 8초', { link: 'offline', downSince: 100_000 - WORKSPACE_OFFLINE_GRACE_MS }, 'offline'],
    ['다시 붙는 중(connecting)도 유예 안이면 reconnecting', { link: 'connecting', downSince: 99_000 }, 'reconnecting'],
    ['옛 PC 프로토콜', { hello: { ...HELLO_OK, protocol: WORKSPACE_MIN_PEER_PROTOCOL - 1 } }, 'peerOutdated'],
    ['새 PC 프로토콜', { hello: { ...HELLO_OK, protocol: WORKSPACE_MIN_PEER_PROTOCOL + 5 } }, 'ready'],
    ['화면 보기 권한 없음', { hello: { ...HELLO_OK, canView: false } }, 'peerOutdated'],
    ['허락 대기', { hello: { ...HELLO_OK, grant: 'pending' } }, 'grantPending'],
    ['거절', { hello: { ...HELLO_OK, grant: 'denied' } }, 'grantDenied'],
    ['이쪽이 옛 버전', { error: 'protocol_unsupported' }, 'selfOutdated'],
    ['열쇠 폐기', { error: 'token_revoked' }, 'unpaired'],
    ['인증서 바뀜', { link: 'offline', error: 'SPKI_MISMATCH' }, 'unpaired'],
    ['저쪽 열쇠 칸 꽉 참', { link: 'offline', hasBeenOnline: false, error: 'slots_full' }, 'peerFull'],
  ]
  for (const [name, patch, want] of rows) assert.equal(statusOf({ ...base, ...patch }), want, name)
})

test('창은 확인을 통과했거나 한 번 열었던 상태에서만 연다', () => {
  assert.deepEqual(
    (['connecting', 'ready', 'reconnecting', 'offline', 'grantPending', 'grantDenied', 'peerOutdated', 'selfOutdated', 'unpaired', 'peerFull'] as WorkspaceStatus[]).filter(canOpenWindow),
    ['ready', 'reconnecting', 'offline'],
  )
})

// ── 읽기/쓰기 표 · 쓰기 막기 ───────────────────────────

test('읽기/쓰기 표: OfficeApi 메서드 전부, 결재·지시·고용·설정은 쓰기', () => {
  assert.deepEqual(Object.keys(METHOD_ACCESS).sort(), [...OFFICE_METHODS].sort())
  for (const m of ['decide', 'answerQuestion', 'instruct', 'sendChat', 'hire', 'fire', 'updateSettings', 'setAutoApprove', 'setAutoFull', 'createTask', 'remoteQr', 'peerPairStart', 'pickFolder'] as const) assert.equal(METHOD_ACCESS[m], 'write', m)
  for (const m of ['snapshot', 'chatHistory', 'timeline', 'getRecord'] as const) assert.equal(METHOD_ACCESS[m], 'read', m)
})

test('accessOf: 표에 없는 이름·프로토타입 이름은 쓰기로 (막히는 쪽)', () => {
  for (const m of ['brandNewMethod', '', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(accessOf(m), 'write', m)
  assert.equal(accessOf('snapshot'), 'read')
})

test('gateCall: ready만 쓰기, 끊김·붙는 중은 읽기만, 그 밖은 모두 막음', () => {
  assert.deepEqual(gateCall('decide', 'ready'), { ok: true })
  for (const s of ['connecting', 'reconnecting', 'offline'] as const) {
    assert.deepEqual(gateCall('snapshot', s), { ok: true }, s)
    assert.deepEqual(gateCall('decide', s), { ok: false, code: 'workspace_offline' }, s)
    assert.deepEqual(gateCall('unknownThing', s), { ok: false, code: 'workspace_offline' }, s)
  }
  for (const s of ['grantPending', 'grantDenied', 'peerOutdated', 'selfOutdated', 'unpaired', 'peerFull'] as const) assert.deepEqual(gateCall('snapshot', s), { ok: false, code: 'workspace_not_ready' }, s)
})

// ── 한도·색 ───────────────────────────────────────────

const ws = (id: string, over: Partial<Workspace> = {}): Workspace => ({ id, peerId: `p-${id}`, name: id, color: 'teal', order: 0, lastUsedAt: 0, ...over })

test('한도 3대 · 가장 오래 안 쓴 PC · 안 쓴 색', () => {
  assert.equal(WORKSPACE_MAX, 3)
  assert.equal(canAddWorkspace([ws('a'), ws('b')]), true)
  assert.equal(canAddWorkspace([ws('a'), ws('b'), ws('c')]), false)
  assert.equal(leastRecentlyUsed([ws('a', { lastUsedAt: 5 }), ws('b', { lastUsedAt: 2 }), ws('c', { lastUsedAt: 9 })])?.id, 'b')
  assert.equal(leastRecentlyUsed([]), null)
  assert.equal(nextFreeColor([ws('a', { color: 'teal' })]), 'orange')
  assert.equal(nextFreeColor([ws('a', { color: 'teal' }), ws('b', { color: 'orange' }), ws('c', { color: 'blue' })]), 'teal')
})

// ── 저장 ──────────────────────────────────────────────

function memFile(initial: string | null = null) {
  const f = { text: initial, writes: 0 }
  return { f, file: { read: () => f.text, write: (t: string) => ((f.text = t), f.writes++) } }
}

test('저장: 추가·중복·꽉 참·수정·삭제·사용 시각, 다시 읽어도 같다', () => {
  const { f, file } = memFile()
  let n = 0
  const store = createWorkspaceStore(file, { now: () => 1000, newId: () => `w${++n}` })
  assert.deepEqual(store.list(), [])
  const a = store.add({ peerId: 'p1', name: '  회사\nPC  ', color: 'teal' }, '기본')
  assert.ok(a.ok)
  assert.equal(a.ok && a.workspace.name, '회사 PC')
  assert.deepEqual(store.add({ peerId: 'p1', name: 'x', color: 'blue' }, '기본'), { ok: false, code: 'duplicate' })
  assert.equal(store.add({ peerId: 'p2', name: '', color: 'orange' }, '집 맥북').ok && store.get('w2')?.name, '집 맥북')
  assert.ok(store.add({ peerId: 'p3', name: 'c', color: 'blue' }, 'c').ok)
  assert.deepEqual(store.add({ peerId: 'p4', name: 'd', color: 'blue' }, 'd'), { ok: false, code: 'full' })
  assert.equal(store.update('w1', { name: '사무실', color: 'purple' }), true)
  assert.equal(store.get('w1')?.color, 'teal', '모르는 색은 무시')
  assert.equal(store.get('w1')?.name, '사무실')
  store.touch('w2', 5000)
  assert.equal(store.remove('w3'), true)
  assert.equal(store.remove('w3'), false)
  const again = createWorkspaceStore(file)
  assert.deepEqual(
    again.list().map((w) => [w.id, w.name, w.lastUsedAt]),
    [
      ['w1', '사무실', 1000],
      ['w2', '집 맥북', 5000],
    ],
  )
  assert.ok(f.writes > 0)
})

test('저장: 깨진 파일·모양이 틀린 항목은 버린다', () => {
  assert.deepEqual(createWorkspaceStore(memFile('{not json').file).list(), [])
  const mixed = JSON.stringify({ workspaces: [ws('ok'), { id: 'bad', peerId: 1 }, { ...ws('c2'), color: 'red' }] })
  assert.deepEqual(
    createWorkspaceStore(memFile(mixed).file)
      .list()
      .map((w) => w.id),
    ['ok'],
  )
})

// ── 창 묶음 ───────────────────────────────────────────

function fakeWin(senderId: number, bounds: Bounds = { x: 0, y: 0, width: 1360, height: 860 }) {
  const w = {
    senderId,
    bounds,
    isShown: false,
    isGone: false,
    sent: [] as [string, unknown][],
    show: () => void (w.isShown = true),
    hide: () => void (w.isShown = false),
    focus: () => {},
    isDestroyed: () => w.isGone,
    isVisible: () => w.isShown,
    getBounds: () => w.bounds,
    setBounds: (b: Bounds) => void (w.bounds = b),
    send: (c: string, p: unknown) => void w.sent.push([c, p]),
    destroy: () => void (w.isGone = true),
  }
  return w satisfies HubWindow
}

function fakeHub() {
  const local = fakeWin(1, { x: 10, y: 20, width: 1400, height: 900 })
  local.isShown = true
  const created: { id: string; partition: string; win: ReturnType<typeof fakeWin>; onClosed: () => void }[] = []
  let next = 100
  const hub = createWindowHub({
    local: () => (local.isGone ? null : local),
    showLocal: () => local.show(),
    create: (id, partition, onClosed) => {
      const win = fakeWin(next++)
      created.push({ id, partition, win, onClosed })
      return win
    },
  })
  return { hub, local, created }
}

test('창: 필요할 때만 만들고, 전환하면 위치·크기를 이어받고 이전 창을 숨긴다', () => {
  const { hub, local, created } = fakeHub()
  assert.equal(created.length, 0, '목록이 있어도 열기 전엔 창이 없다')
  hub.switchTo('a')
  assert.equal(created.length, 1)
  assert.deepEqual(created[0].win.bounds, local.bounds)
  assert.equal(created[0].win.isShown, true)
  assert.equal(local.isShown, false)
  assert.equal(hub.current(), 'a')
  created[0].win.bounds = { x: 50, y: 60, width: 1200, height: 800 }
  hub.switchTo('b')
  assert.deepEqual(created[1].win.bounds, { x: 50, y: 60, width: 1200, height: 800 })
  assert.equal(created[0].win.isShown, false)
  hub.switchTo('a')
  assert.equal(created.length, 2, '숨긴 창을 다시 쓴다')
  hub.switchTo('self')
  assert.equal(local.isShown, true)
  assert.deepEqual(local.bounds, { x: 50, y: 60, width: 1200, height: 800 })
})

test('창: 파티션은 PC마다 따로, 보낸 창 id로 PC를 찾는다', () => {
  const { hub, created } = fakeHub()
  hub.switchTo('a')
  hub.switchTo('b')
  assert.deepEqual(
    created.map((c) => c.partition),
    [partitionOf('a'), partitionOf('b')],
  )
  assert.notEqual(partitionOf('a'), partitionOf('b'))
  assert.ok(partitionOf('a').startsWith('persist:ws-'))
  assert.equal(hub.ownerOf(created[1].win.senderId), 'b')
  assert.equal(hub.ownerOf(1), null, '이 PC 창은 원격 창이 아니다')
  assert.equal(hub.isLocal(1), true)
  assert.equal(hub.isLocal(created[0].win.senderId), false)
})

test('창: 보던 원격 창을 닫거나 목록에서 빼면 이 PC로 돌아가고, closeAll은 모두 닫는다', () => {
  const { hub, local, created } = fakeHub()
  hub.switchTo('a')
  created[0].win.isGone = true
  created[0].onClosed()
  assert.equal(hub.current(), 'self')
  assert.equal(local.isShown, true)
  assert.equal(hub.ownerOf(created[0].win.senderId), null)
  hub.switchTo('b')
  hub.close('b')
  assert.equal(created[1].win.isGone, true)
  assert.equal(hub.current(), 'self')
  hub.switchTo('c')
  assert.equal(hub.showCurrent(), true)
  hub.closeAll()
  assert.equal(created[2].win.isGone, true)
  assert.equal(hub.showCurrent(), false)
})

test('창: 트레이·알림으로 이 PC 창을 띄우면 보던 원격 창을 숨기고 이 PC로 돌아온다', () => {
  const { hub, created } = fakeHub()
  hub.switchTo('a')
  hub.localShown()
  assert.equal(hub.current(), 'self')
  assert.equal(created[0].win.isShown, false)
  assert.equal(hub.showCurrent(), false, 'Dock으로 다시 열면 이 PC 창')
  hub.switchTo('a')
  assert.equal(created.length, 1, '숨긴 원격 창을 다시 쓴다')
  assert.equal(created[0].win.isShown, true)
})

test('창: 닫힌 창·다시 만든 창·이 PC 창이 닫힌 뒤에도 보낸 창 판정이 맞다', () => {
  const { hub, local, created } = fakeHub()
  hub.switchTo('a')
  const old = created[0].win
  old.isGone = true
  assert.equal(hub.ownerOf(old.senderId), null, '닫힌 원격 창은 어느 PC도 아니다')
  hub.switchTo('a')
  assert.equal(created.length, 2, '닫힌 창은 새로 만든다')
  assert.equal(hub.ownerOf(created[1].win.senderId), 'a')
  assert.equal(hub.ownerOf(old.senderId), null)
  // 늦게 온 옛 창의 닫힘 처리가 새 창을 지우지 않는다
  created[0].onClosed()
  assert.equal(hub.ownerOf(created[1].win.senderId), 'a')
  assert.equal(hub.current(), 'a')
  local.isGone = true
  assert.equal(hub.isLocal(1), false, '닫힌 이 PC 창은 이 PC 창이 아니다')
  assert.equal(hub.isLocalWindowId(), null)
  assert.equal(hub.isLocal(created[1].win.senderId), false)
})

test('창: closeAll 중 원격 창의 닫힘 처리가 이 PC 창을 다시 띄우지 않는다 (앱 종료)', () => {
  const { hub, local, created } = fakeHub()
  hub.switchTo('a')
  // Electron처럼 destroy가 곧바로 closed(onClosed)를 부르게 한다
  const c = created[0]
  c.win.destroy = () => {
    c.win.isGone = true
    c.onClosed()
  }
  local.isGone = true
  let shownLocal = 0
  local.show = () => void shownLocal++
  hub.closeAll()
  assert.equal(c.win.isGone, true)
  assert.equal(shownLocal, 0)
  assert.equal(hub.current(), 'self')
})

// ── 총괄(서비스) ──────────────────────────────────────

function fakeService(links: WorkspaceLinks = noLinks) {
  const { hub, local, created } = fakeHub()
  let n = 0
  const store = createWorkspaceStore(memFile().file, { now: () => 1, newId: () => `w${++n}` })
  const emitted: [number, WorkspacesState][] = []
  const peers: Record<string, string> = { p1: '회사 PC', p2: '집 PC' }
  const service = createWorkspaceService({ store, hub, links, peerName: (id) => peers[id] ?? null, emit: (id, s) => void emitted.push([id, s]), now: () => 42 })
  return { service, hub, local, created, store, emitted }
}

const readyLinks = (requests: unknown[] = []): WorkspaceLinks => ({
  status: () => 'ready',
  pending: () => 2,
  request: async (_id, req) => (requests.push(req), { ok: 'fine' }),
  sync: () => {},
})

test('총괄: 추가·수정·삭제는 이 PC 창만, 짝 목록에 없는 PC는 거절', () => {
  const { service, emitted } = fakeService()
  assert.deepEqual(service.add(999, { peerId: 'p1' }), { ok: false, code: 'unknown_peer' })
  assert.deepEqual(service.add(1, { peerId: 'nope' }), { ok: false, code: 'unknown_peer' })
  const r = service.add(1, { peerId: 'p1', name: '', color: 'orange' })
  assert.ok(r.ok)
  assert.equal(r.ok && r.workspace.name, '회사 PC', '이름이 비면 짝 이름')
  assert.equal(emitted.at(-1)?.[0], 1)
  assert.equal(emitted.at(-1)?.[1].list[0].status, 'connecting', '연결 전(0단계 전)에는 연결 중')
  assert.equal(service.update(999, 'w1', { name: 'x' }), false)
  assert.equal(service.remove(999, 'w1'), false)
  assert.equal(service.state(999), null, '모르는 창은 목록도 못 본다')
})

test('총괄: 확인 전(연결 중)에는 창을 열지 않고, ready면 열고 사용 시각을 남긴다', () => {
  const blocked = fakeService()
  blocked.service.add(1, { peerId: 'p1' })
  assert.equal(blocked.service.switchTo(1, 'w1'), false)
  assert.equal(blocked.created.length, 0)

  const ok = fakeService(readyLinks())
  ok.service.add(1, { peerId: 'p1' })
  assert.equal(ok.service.switchTo(1, 'w1'), true)
  assert.equal(ok.created.length, 1)
  assert.equal(ok.store.get('w1')?.lastUsedAt, 42)
  assert.equal(ok.service.state(ok.created[0].win.senderId)?.current, 'w1')
  assert.equal(ok.service.switchTo(1, 'missing'), false)
  assert.equal(ok.service.switchTo(999, 'self'), false, '모르는 창은 전환 못 함')
  // 원격 창에서 이 PC로 돌아가기
  assert.equal(ok.service.switchTo(ok.created[0].win.senderId, 'self'), true)
  assert.equal(ok.hub.current(), 'self')
})

test('총괄: ws:post — 원격 창이 아니면 버리고, 끊김·연결 중에는 쓰기를 메인에서 막는다', async () => {
  const { service, store, created, hub } = fakeService()
  service.add(1, { peerId: 'p1' })
  // 이 PC 창이 ws:post를 보내도 아무 일도 없다
  await service.post(1, JSON.stringify({ type: 'call', id: 'x', method: 'decide', args: [] }))
  // 연결 중 상태의 원격 창을 직접 연다 (테스트용 — 서비스는 확인 전엔 열지 않는다)
  hub.switchTo(store.list()[0].id)
  const win = created[0].win
  await service.post(win.senderId, JSON.stringify({ type: 'call', id: 'r1', method: 'decide', args: ['a', true] }))
  assert.deepEqual(JSON.parse(String(win.sent.at(-1)?.[1])), { type: 'result', id: 'r1', ok: false, error: { status: 0, code: 'workspace_offline', message: '' } })
  await service.post(win.senderId, JSON.stringify({ type: 'upload', id: 'r2', name: 'a.png', mime: 'image/png', base64: 'AA' }))
  assert.equal(JSON.parse(String(win.sent.at(-1)?.[1])).error.code, 'workspace_offline', '올리기도 쓰기')
  await service.post(win.senderId, JSON.stringify({ type: 'call', id: 'r3', method: 'snapshot', args: [] }))
  assert.equal(JSON.parse(String(win.sent.at(-1)?.[1])).error.code, 'workspace_offline', '읽기는 통과해 연결(noLinks)에서 끊김 오류')
  assert.ok(win.sent.every(([c]) => c === 'ws:msg'))
})

test('총괄: ready면 요청을 저쪽으로 넘기고 결과를 그 창에만 돌려준다', async () => {
  const requests: unknown[] = []
  const { service, created } = fakeService(readyLinks(requests))
  service.add(1, { peerId: 'p1' })
  service.add(1, { peerId: 'p2' })
  service.switchTo(1, 'w1')
  service.switchTo(1, 'w2')
  const [w1, w2] = created.map((c) => c.win)
  const before = w2.sent.length
  await service.post(w1.senderId, JSON.stringify({ type: 'call', id: 'q', method: 'decide', args: ['a1', true] }))
  assert.deepEqual(requests, [{ type: 'call', method: 'decide', args: ['a1', true] }])
  assert.deepEqual(JSON.parse(String(w1.sent.filter(([c]) => c === 'ws:msg').at(-1)?.[1])), { type: 'result', id: 'q', ok: true, result: { ok: 'fine' } })
  assert.equal(w2.sent.filter(([c]) => c === 'ws:msg').length, before, '다른 PC 창에는 가지 않는다')
})

test('parseRemotePost: 모양이 틀리면 버린다', () => {
  assert.equal(parseRemotePost('nope'), null)
  assert.equal(parseRemotePost(42), null)
  assert.equal(parseRemotePost(JSON.stringify({ type: 'call', method: 'x', args: [] })), null, 'id 없음')
  assert.equal(parseRemotePost(JSON.stringify({ type: 'call', id: 'a', method: 'x', args: 'no' })), null)
  assert.equal(parseRemotePost(JSON.stringify({ type: 'call', id: 'a'.repeat(65), method: 'x', args: [] })), null)
  assert.equal(parseRemotePost(JSON.stringify({ type: 'wipe', id: 'a' })), null)
  assert.deepEqual(parseRemotePost(JSON.stringify({ type: 'ready', features: ['iso-office', 3] })), { type: 'ready', features: ['iso-office'] })
  assert.deepEqual(parseRemotePost(JSON.stringify({ type: 'download', id: 'd', fileId: 'f', name: 'n' })), { type: 'download', id: 'd', fileId: 'f', name: 'n' })
})

// ── 마법사 ────────────────────────────────────────────

test('기기 추가 창: 휴대폰·이 PC 보여 주기도 같은 4장 — 준비물 장은 이 PC 준비가 끝나야 넘어가고, 켜져 있으면 바로 연결 장', () => {
  let s = wizardReducer(initialWizard('orange'), { type: 'pickWhat', what: 'phone' })
  assert.equal(canNext(s), true)
  s = wizardReducer(s, { type: 'next' })
  assert.equal(s.step, 'where')
  assert.equal(canNext(s), true, '휴대폰은 연결 방식(이미 하나가 골라져 있음)')
  s = wizardReducer(s, { type: 'next' })
  assert.equal(s.step, 'prep')
  assert.equal(wizardReducer(s, { type: 'next', isThisPcReady: false }).step, 'prep', 'Tailscale이 안 되면 못 넘어감')
  s = wizardReducer(s, { type: 'next', isThisPcReady: true })
  assert.equal(s.step, 'connect')
  assert.equal(canFinish(s), false, '휴대폰은 추가 단추가 아니라 완료로 닫는다')
  const host = wizardReducer(wizardReducer(initialWizard('teal'), { type: 'pickWhat', what: 'host' }), { type: 'skipToConnect' })
  assert.equal(host.step, 'connect')
  assert.equal(wizardReducer(wizardReducer(initialWizard('teal'), { type: 'pickWhat', what: 'pc' }), { type: 'skipToConnect' }).step, 'what', '다른 PC 보기는 건너뛰지 않는다')
})

test('마법사: 다른 PC 보기 4장 이동·뒤로·이름·색', () => {
  let s = initialWizard('orange')
  assert.equal(canNext(s), false)
  s = wizardReducer(s, { type: 'pickWhat', what: 'pc' })
  s = wizardReducer(s, { type: 'next' })
  assert.equal(s.step, 'where')
  assert.equal(canNext(s), false)
  s = wizardReducer(wizardReducer(s, { type: 'pickWhere', where: 'away' }), { type: 'next' })
  assert.equal(s.step, 'prep')
  s = wizardReducer(s, { type: 'next' })
  assert.equal(s.step, 'connect')
  assert.equal(wizardReducer(s, { type: 'next' }).step, 'connect', '마지막 장 다음은 없다')
  assert.equal(canFinish(s), false)
  s = wizardReducer(s, { type: 'paired', peerId: 'p1', name: '회사 PC' })
  assert.equal(s.name, '회사 PC')
  assert.equal(canFinish(s), true)
  s = wizardReducer(s, { type: 'setName', name: '   ' })
  assert.equal(canFinish(s), false, '이름이 비면 못 끝낸다')
  s = wizardReducer(s, { type: 'setName', name: 'x'.repeat(80) })
  assert.equal(s.name.length, 30)
  s = wizardReducer(s, { type: 'fail', error: '꽉 참' })
  s = wizardReducer(s, { type: 'back' })
  assert.equal(s.step, 'prep')
  assert.equal(s.error, null, '뒤로 가면 오류를 지운다')
  assert.equal(s.peerId, 'p1', '짝지은 결과는 남는다')
  assert.equal(s.color, 'orange')
  assert.equal(wizardReducer(initialWizard('teal'), { type: 'back' }).step, 'what')
})

// ── 구조 보장 ─────────────────────────────────────────

test('의존 방향: main/peer·main/remote·office.ts는 main/workspace를 import하지 않는다', () => {
  const files = [...walk(path.join(SRC, 'main/peer')), ...walk(path.join(SRC, 'main/remote')), path.join(SRC, 'main/office.ts')]
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /from ['"][^'"]*\/workspace\//, path.relative(APP, f))
  // 원격·휴대폰 쪽 OfficeApi에도 워크스페이스를 넣지 않는다
  assert.doesNotMatch(read('src/shared/officeApiShape.ts'), /workspace/i)
})

test('통로: 원격 창 preload는 office:* 채널을 열지 않고, 이 PC 핸들러는 보낸 창을 확인한다', () => {
  const remote = read('src/remotePreload.ts')
  assert.doesNotMatch(remote, /['"`](office|pet|errors|pack|scene|update|window):/)
  assert.doesNotMatch(remote, /workspace:(add|update|remove)/, '원격 창은 목록을 바꾸지 못한다')
  const main = read('src/main/index.ts')
  assert.match(main, /ipcMain\.handle\(`office:\$\{name\}`, \(e, \.\.\.args\) => \{\s*if \(!isLocalSender\(e\.sender\)\)/)
  assert.match(main, /'window:isShown', \(e\) => isLocalSender\(e\.sender\)/)
  // 원격 창은 따로 만든 통로·파티션으로만 연다
  const glue = read('src/main/workspace/index.ts')
  assert.match(glue, /preload: deps\.preloadPath, partition/)
  assert.match(glue, /sandbox: true/)
})

test('PC 전용 잠금: IS_MOBILE_SHELL은 배치 판정(useLayout·App 틀 고르기)에만, 잠금은 IS_REMOTE_SCREEN', () => {
  // 원격 창(다른 PC 화면)에서도 PC 전용 기능을 잠가야 한다 — 새 잠금 분기가 IS_MOBILE_SHELL을 쓰면 원격 창에서 열려 버린다
  const ALLOWED: Record<string, number> = { 'src/renderer/App.tsx': 1, 'src/renderer/layout/useLayout.ts': 6 }
  const found: Record<string, number> = {}
  for (const f of walk(path.join(SRC, 'renderer'))) {
    const rel = path.relative(APP, f)
    if (rel === 'src/renderer/shell.ts' || rel.startsWith('src/renderer/mobile/')) continue
    const n = fs.readFileSync(f, 'utf8').split('\n').filter((l) => /\bIS_MOBILE_SHELL\b/.test(l) && !/^\s*import /.test(l)).length
    if (n) found[rel] = n
  }
  assert.deepEqual(found, ALLOWED)
  const shell = read('src/renderer/shell.ts')
  assert.match(shell, /export const IS_REMOTE_SCREEN = SHELL !== 'desktop'/)
  assert.match(read('vite.remote.config.mts'), /__OFFICE_SHELL__: JSON\.stringify\('remote'\)/)
})

test('원격 창 진입은 mobile/install.ts를 쓰지 않는다 (휴대폰 회귀 0)', () => {
  const install = read('src/renderer/remote/install.ts')
  assert.doesNotMatch(install, /from ['"][^'"]*mobile\/install/)
  assert.match(read('src/renderer/remote/main.tsx'), /import '\.\/install'\s*\nimport '\.\.\/main'/)
  assert.match(read('remote.html'), /src="\/src\/renderer\/remote\/main\.tsx"/)
  assert.match(read('forge.config.mts'), /name: 'remote_window', config: 'vite\.remote\.config\.mts'/)
  assert.match(read('forge.config.mts'), /entry: 'src\/remotePreload\.ts'/)
})
