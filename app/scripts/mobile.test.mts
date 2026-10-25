// 휴대폰 앱 화면 묶음 (모바일 빌드): 원격 어댑터·셸 메시지 통로·폰 배치 경계·XSS·CSP·빌드 결과
// 어댑터·통로는 DOM 없이 가짜 셸로 돌린다. 계약은 docs/specs/android-bridge.md

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { OFFICE_EVENTS, OFFICE_METHODS } from '../src/shared/officeApiShape.ts'
import { createBridge, parseShellMessage, type Bridge, type BridgeRequest, type ShellMessage } from '../src/renderer/mobile/bridge.ts'
import { createRemoteOffice, fillOldSnapshot, normalizeArgs, PC_ONLY_TEXT, pcUpdateText, RemoteCallError, SCREEN_CAPABILITIES, type RemoteHandlers } from '../src/renderer/mobile/remoteOffice.ts'
import { recentFolders } from '../src/renderer/mobile/recentFolders.ts'
import { pinchStep } from '../src/renderer/map/gestures.ts'
import { createLayoutTracker } from '../src/renderer/layout/layoutState.ts'

const APP = path.resolve(import.meta.dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(APP, p), 'utf8')

// ── 가짜 셸 ───────────────────────────────────────────

/** 셸 대신: 요청을 기록하고 reply가 정한 값으로 답한다 */
function fakeBridge(reply: (msg: BridgeRequest) => unknown = () => null) {
  const sent: BridgeRequest[] = []
  const handlers = new Set<(m: ShellMessage) => void>()
  const bridge: Bridge = {
    request: async (msg) => {
      sent.push(msg)
      return reply(msg)
    },
    notify: () => {},
    on: (h) => {
      handlers.add(h)
      return () => void handlers.delete(h)
    },
  }
  return { bridge, sent, emit: (m: ShellMessage) => handlers.forEach((h) => h(m)) }
}

function handlers(over: Partial<RemoteHandlers> = {}) {
  const notices: string[] = []
  const confirms: string[] = []
  const paths: string[] = []
  const h: RemoteHandlers = {
    enterPath: async (kind) => {
      paths.push(kind)
      return kind === 'folder' ? '  ~/projects/app  ' : ['~/a.md', '~/b.md']
    },
    notice: (t) => void notices.push(t),
    confirm: (m) => (confirms.push(m), true),
    ...over,
  }
  return { h, notices, confirms, paths }
}

const OVERRIDDEN = ['saveAttachments', 'openAttachment', 'pickFolder', 'pickFiles', 'resumeInTerminal', 'openClaudeLogin', 'remoteQr']

// ── 어댑터 ────────────────────────────────────────────

test('어댑터: OfficeApi 메서드·이벤트가 빠짐없이 있고 platform은 android', () => {
  const { office } = createRemoteOffice(fakeBridge().bridge, handlers().h)
  for (const m of [...OFFICE_METHODS, ...OFFICE_EVENTS]) assert.equal(typeof (office as unknown as Record<string, unknown>)[m], 'function', m)
  assert.equal(office.platform, 'android')
})

test('어댑터: PC 전용·올리기를 뺀 모든 메서드는 그 이름 그대로 /v2/call로 간다 (자동 연결)', async () => {
  const f = fakeBridge()
  const { office } = createRemoteOffice(f.bridge, handlers().h)
  const api = office as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>
  const plain = OFFICE_METHODS.filter((m) => !OVERRIDDEN.includes(m))
  for (const m of plain) await api[m]('a', 1)
  assert.deepEqual(
    f.sent.map((s) => (s.type === 'call' ? s.method : s.type)),
    plain,
  )
  assert.ok(f.sent.every((s) => s.type === 'call' && JSON.stringify(s.args) === '["a",1]' && !('confirm' in s)))
})

test('어댑터: 끝에 붙은 undefined는 빼고 중간 undefined는 null (PC가 남는 인자를 거절하므로)', async () => {
  assert.deepEqual(normalizeArgs(['s1', 'hi', undefined]), ['s1', 'hi'])
  assert.deepEqual(normalizeArgs(['a', undefined, 'b']), ['a', null, 'b'])
  const f = fakeBridge()
  const { office } = createRemoteOffice(f.bridge, handlers().h)
  await office.setRemoteEnabled(true)
  await office.instruct('s1', '지시')
  assert.deepEqual(
    f.sent.map((s) => (s as { args: unknown[] }).args),
    [[true], ['s1', '지시']],
  )
})

test('어댑터: confirm_required면 확인창을 한 번 띄우고 동의하면 confirm:true로 다시, 취소면 다시 보내지 않는다', async () => {
  const reply = (m: BridgeRequest) => {
    if (m.type === 'call' && !m.confirm) throw { status: 400, code: 'confirm_required', message: '이 휴대폰의 연결이 끊어져요' }
    return { isEnabled: true }
  }
  const yes = fakeBridge(reply)
  const y = handlers()
  const { office } = createRemoteOffice(yes.bridge, y.h)
  assert.deepEqual(await office.regenerateRemoteQr(), { isEnabled: true })
  assert.equal(y.confirms.length, 1)
  assert.match(y.confirms[0], /이 휴대폰 연결이 바로 끊겨요/)
  assert.deepEqual(
    yes.sent.map((s) => (s as { confirm?: boolean }).confirm ?? false),
    [false, true],
  )

  const no = fakeBridge(reply)
  const n = handlers({ confirm: () => false })
  const cancelled = createRemoteOffice(no.bridge, n.h).office.setRemoteEnabled(false)
  await assert.rejects(cancelled, (e: RemoteCallError) => e.code === 'confirm_cancelled')
  assert.equal(no.sent.length, 1)
})

test('어댑터: 실패는 RemoteCallError(status·code·method 보존)로 reject, pc_only면 "PC에서 열어 주세요" 안내', async () => {
  const f = fakeBridge((m) => {
    // 서버가 pc_only로 답하는 경우 (화면 쪽 대체가 없는 메서드로 확인)
    if (m.type === 'call' && m.method === 'hooksStatus') throw { status: 422, code: 'pc_only', message: 'PC에서', alternative: 'open_on_pc' }
    throw { status: 409, code: 'already_decided', message: '이미 처리됐어요' }
  })
  const x = handlers()
  const { office } = createRemoteOffice(f.bridge, x.h)
  await assert.rejects(office.decide('a1', true), (e: RemoteCallError) => e instanceof Error && e.status === 409 && e.code === 'already_decided' && e.method === 'decide' && e.message === '이미 처리됐어요')
  assert.deepEqual(x.notices, [])
  await assert.rejects(office.hooksStatus(), (e: RemoteCallError) => e.code === 'pc_only' && e.alternative === 'open_on_pc')
  assert.deepEqual(x.notices, [PC_ONLY_TEXT.generic])
})

// ── 아이소 사무실 능력 (office-iso-tech.md 4-3절) ─────────

const tick = () => new Promise((r) => setTimeout(r, 0))

test('어댑터: 연결될 때마다(처음·재연결·resync) hello로 PC 능력을 확인한다 — 새 PC면 칸 배치를 그대로 보낸다', async () => {
  const f = fakeBridge((m) => (m.type === 'call' && m.method === 'hello' ? { capabilities: ['iso-office'] } : { uid: 'g1' }))
  const checked: boolean[] = []
  const s = createRemoteOffice(f.bridge, handlers({ pcChecked: (v) => void checked.push(v) }).h)
  assert.equal(s.isoOffice(), null)
  f.emit({ type: 'connection', state: 'open' })
  await tick()
  assert.equal(s.isoOffice(), true)
  assert.deepEqual(checked, [true])
  assert.deepEqual(f.sent[0], { type: 'call', method: 'hello', args: [{ capabilities: ['iso-office'] }] })
  assert.deepEqual(await s.office.placeGridItem('plant', 1, 2, 3, 1), { uid: 'g1' })
  f.emit({ type: 'connection', state: 'reconnecting' })
  f.emit({ type: 'connection', state: 'open' })
  f.emit({ type: 'resync' })
  await tick()
  assert.equal(f.sent.filter((m) => m.type === 'call' && m.method === 'hello').length, 3)
  // 겹친 hello는 마지막 응답만 판정에 쓴다 (재연결·resync가 연달아 와도 스냅샷을 한 번만 다시 읽음)
  assert.deepEqual(checked, [true, true])
})

test('어댑터: 예전 PC(hello 404)면 칸 배치를 보내지 않고 "PC를 업데이트" 안내, 다른 메서드는 그대로', async () => {
  const f = fakeBridge((m) => {
    if (m.type === 'call' && m.method === 'hello') throw { status: 404, code: 'unknown_method', message: '알 수 없는 메서드' }
    return null
  })
  const checked: boolean[] = []
  const x = handlers({ pcChecked: (v) => void checked.push(v) })
  const s = createRemoteOffice(f.bridge, x.h)
  f.emit({ type: 'connection', state: 'open' })
  await tick()
  assert.equal(s.isoOffice(), false)
  assert.deepEqual(checked, [false])
  await assert.rejects(s.office.moveGridItem('u1', 1, 0, 0, 0), (e: RemoteCallError) => e.code === 'pc_update_required' && e.method === 'moveGridItem')
  assert.deepEqual(x.notices, [pcUpdateText()])
  assert.ok(!f.sent.some((m) => m.type === 'call' && m.method === 'moveGridItem'))
  await s.office.storeItem('u1')
  assert.ok(f.sent.some((m) => m.type === 'call' && m.method === 'storeItem'))
  // 연결 실패 같은 다른 오류는 예전 PC로 단정하지 않는다
  const g = fakeBridge(() => {
    throw { status: 0, code: 'unreachable', message: 'PC에 닿지 않아요' }
  })
  const t = createRemoteOffice(g.bridge, handlers().h)
  g.emit({ type: 'connection', state: 'open' })
  await tick()
  assert.equal(t.isoOffice(), null)
})

test('어댑터: 확인 전에 보낸 칸 배치가 unknown_method면 그때 예전 PC로 보고 안내, 막힌 이유(reason)는 그대로 전한다', async () => {
  const f = fakeBridge((m) => {
    if (m.type === 'call' && m.method === 'placeGridItem') throw { status: 404, code: 'unknown_method', message: '알 수 없는 메서드' }
    if (m.type === 'call' && m.method === 'moveGridItem') throw { status: 422, code: 'blocked', message: '길을 막아요', reason: 'blocks_path' }
    return null
  })
  const x = handlers()
  const s = createRemoteOffice(f.bridge, x.h)
  await assert.rejects(s.office.moveGridItem('u1', 1, 0, 0, 0), (e: RemoteCallError) => e.code === 'blocked' && e.reason === 'blocks_path' && e.status === 422)
  assert.equal(s.isoOffice(), null)
  await assert.rejects(s.office.placeGridItem('plant', 1, 0, 0, 0), (e: RemoteCallError) => e.code === 'pc_update_required')
  assert.equal(s.isoOffice(), false)
  assert.deepEqual(x.notices, [pcUpdateText()])
})

test('설치: 새 PC로 확인되면 스냅샷을 다시 읽고(hello 전에 Lv.10으로 줄어 왔을 수 있음), 예전 PC면 꾸미기 서랍이 "PC를 업데이트" 안내', () => {
  const install = read('src/renderer/mobile/install.ts')
  assert.match(install, /pcChecked: \(isoOffice\) => \{\s*useMobileUi\.setState\(\{ isPcOutdated: !isoOffice \}\)\s*if \(isoOffice\) void window\.office\.snapshot\(\)\.then\(useOffice\.getState\(\)\.setSnapshot\)/)
  const drawer = read('src/renderer/map/DecorDrawer.tsx')
  assert.match(drawer, /if \(isPcOutdated\)[\s\S]*?<Bar tone="warn" text=\{pcUpdateText\(\)\} \/>/)
})

test('레벨업 축하: 칭호는 PC가 보낸 company.title — 표를 레벨 숫자로 바로 읽지 않는다 (표보다 큰 레벨에서 빈 화면)', () => {
  const src = read('src/renderer/features/LevelUp.tsx')
  assert.doesNotMatch(src, /COMPANY_LEVELS\[level - 1\]/)
  assert.match(src, /useOffice\(\(s\) => s\.company\.title\)/)
})

test('개편 안내: 예전 레벨보다 낮을 때만 "낮아 보여도", 올랐으면 새 레벨 보상을 안내한다', () => {
  const src = read('src/renderer/features/LevelUp.tsx')
  assert.match(src, /legacyLevelOfXp\(xp\)/)
  assert.match(src, /level < revampFrom \?[\s\S]*?levelUp\.revamp\.lowerBold[\s\S]*?level > revampFrom \?[\s\S]*?levelUp\.revamp\.higherAfter/)
  assert.match(src, /levelUp\.reward\.newLevels/)
})

test('설치: ready에 iso-office를 알린다 — 셸이 /v2/call·/v2/events 헤더로 PC에 싣는다 (없으면 PC가 Lv.10으로 줄여 보냄)', () => {
  assert.deepEqual([...SCREEN_CAPABILITIES], ['iso-office'])
  assert.match(read('src/renderer/mobile/install.ts'), /notify\(\{ type: 'ready', features: \['ime', \.\.\.SCREEN_CAPABILITIES\] \}\)/)
})

test('PC 전용: 폴더·파일 고르기는 경로 입력 시트, 터미널·로그인·QR은 안내 — 서버에 보내지 않는다', async () => {
  const f = fakeBridge()
  const x = handlers()
  const { office } = createRemoteOffice(f.bridge, x.h)
  assert.equal(await office.pickFolder(), '~/projects/app')
  assert.deepEqual(await office.pickFiles(), ['~/a.md', '~/b.md'])
  assert.equal(await office.resumeInTerminal('s1'), PC_ONLY_TEXT.resumeInTerminal)
  assert.equal(await office.remoteQr(), null)
  await office.openClaudeLogin()
  assert.deepEqual(x.paths, ['folder', 'files'])
  assert.deepEqual(x.notices, [PC_ONLY_TEXT.remoteQr, PC_ONLY_TEXT.openClaudeLogin])
  assert.equal(f.sent.length, 0)
  // 취소·빈 입력은 PC처럼 null / []
  const empty = createRemoteOffice(f.bridge, handlers({ enterPath: async () => null }).h).office
  assert.equal(await empty.pickFolder(), null)
  assert.deepEqual(await empty.pickFiles(), [])
})

test('첨부: 파일마다 upload(base64) 한 번 → Attachment[] (PC 경로는 비움), 열기는 휴대폰에 저장', async () => {
  let n = 0
  const f = fakeBridge((m) => (m.type === 'upload' ? { id: `id-${++n}`, name: m.name, mime: m.mime, size: 3 } : 'a.png'))
  const x = handlers()
  const { office } = createRemoteOffice(f.bridge, x.h)
  const bytes = new TextEncoder().encode('abc').buffer as ArrayBuffer
  const saved = await office.saveAttachments([
    { name: 'a.txt', mime: 'text/plain', data: bytes },
    { name: 'b.png', mime: 'image/png', data: bytes },
  ])
  assert.deepEqual(saved, [
    { id: 'id-1', name: 'a.txt', mime: 'text/plain', size: 3, path: '' },
    { id: 'id-2', name: 'b.png', mime: 'image/png', size: 3, path: '' },
  ])
  assert.deepEqual(f.sent[0], { type: 'upload', name: 'a.txt', mime: 'text/plain', base64: 'YWJj' })
  await office.openAttachment('11111111-2222-4333-8444-555555555555')
  assert.deepEqual(f.sent[2], { type: 'download', fileId: '11111111-2222-4333-8444-555555555555', name: '' })
  assert.deepEqual(x.notices, [PC_ONLY_TEXT.saved])
})

test('어댑터: 예전 PC 스냅샷(shop.grid 없음)은 grid를 빈 배열로 채운다 — 꾸미기·상점이 grid를 읽다가 빈 화면이 되지 않게', async () => {
  const old = { company: { level: 10 }, shop: { owned: { plant: 1 }, placed: [], gear: {} } }
  const f = fakeBridge((m) => (m.type === 'call' && m.method === 'snapshot' ? old : null))
  const s = createRemoteOffice(f.bridge, handlers().h)
  const snap = (await s.office.snapshot()) as unknown as typeof old & { shop: { grid: unknown[] } }
  assert.deepEqual(snap.shop.grid, [])
  assert.deepEqual(snap.shop.owned, { plant: 1 })
  assert.ok(f.sent.some((m) => m.type === 'call' && m.method === 'snapshot'))
  const got: unknown[] = []
  s.office.onSnapshot((v) => void got.push(v))
  f.emit({ type: 'event', name: 'snapshot', data: old })
  assert.deepEqual((got[0] as { shop: { grid: unknown[] } }).shop.grid, [])
  // 새 PC가 보낸 grid는 그대로
  const grid = [{ uid: 'g1', itemId: 'plant', floor: 1, gx: 1, gy: 1, rot: 0 }]
  f.emit({ type: 'event', name: 'snapshot', data: { ...old, shop: { ...old.shop, grid } } })
  assert.equal((got[1] as { shop: { grid: unknown[] } }).shop.grid, grid)
  assert.equal(fillOldSnapshot(null), null)
})

test('이벤트: 5종 구독·해제, 폰 배치에서는 focus를 넘기지 않고, resync는 구독자에게', () => {
  const f = fakeBridge()
  let isPhone = true
  const session = createRemoteOffice(f.bridge, handlers({ shouldDeliverFocus: () => !isPhone }).h)
  const got: string[] = []
  const off = session.office.onSnapshot(() => got.push('snapshot'))
  session.office.onLog(() => got.push('log'))
  session.office.onChat(() => got.push('chat'))
  session.office.onRemoteStatus(() => got.push('remoteStatus'))
  session.office.onFocus((id) => got.push(`focus:${id}`))
  let resyncs = 0
  session.onResync(() => resyncs++)
  for (const name of ['snapshot', 'log', 'chat', 'remoteStatus', 'focus', 'unknown']) f.emit({ type: 'event', name, data: 's1' })
  isPhone = false
  f.emit({ type: 'event', name: 'focus', data: 's2' })
  off()
  f.emit({ type: 'event', name: 'snapshot', data: {} })
  f.emit({ type: 'resync' })
  assert.deepEqual(got, ['snapshot', 'log', 'chat', 'remoteStatus', 'focus:s2'])
  assert.equal(resyncs, 1)
})

// ── 셸 메시지 통로 ────────────────────────────────────

function fakePort() {
  const out: Record<string, unknown>[] = []
  const port = { onmessage: null as ((e: { data: string }) => void) | null, postMessage: (t: string) => void out.push(JSON.parse(t)) }
  const send = (m: unknown) => port.onmessage?.({ data: typeof m === 'string' ? m : JSON.stringify(m) })
  return { port, out, send }
}

test('통로: 요청마다 새 id, 결과는 그 id에만, 실패는 셸이 준 오류 그대로', async () => {
  const p = fakePort()
  const bridge = createBridge(p.port)
  const a = bridge.request({ type: 'call', method: 'snapshot', args: [] })
  const b = bridge.request({ type: 'call', method: 'decide', args: ['x', true] })
  const [idA, idB] = p.out.map((m) => m.id as string)
  assert.notEqual(idA, idB)
  assert.match(idA, /^[A-Za-z0-9_.:-]{1,64}$/)
  p.send({ type: 'result', id: idB, ok: false, error: { status: 422, code: 'pc_only', message: 'PC에서', alternative: 'open_on_pc' } })
  p.send({ type: 'result', id: idA, ok: true, result: { staff: [] } })
  p.send({ type: 'result', id: 'nobody', ok: true, result: 1 })
  assert.deepEqual(await a, { staff: [] })
  await assert.rejects(b, { status: 422, code: 'pc_only', message: 'PC에서', alternative: 'open_on_pc' })
  bridge.notify({ type: 'ready' })
  assert.deepEqual(p.out.at(-1), { type: 'ready' })
})

test('통로: 모양이 틀리거나 모르는 메시지는 버리고, 답이 없으면 시간이 지나 reject', async () => {
  assert.equal(parseShellMessage('{'), null)
  assert.equal(parseShellMessage('{"type":"hack"}'), null)
  assert.equal(parseShellMessage('{"type":"result","ok":true}'), null)
  assert.equal(parseShellMessage('{"type":"event"}'), null)
  assert.equal(parseShellMessage(42), null)
  assert.deepEqual(parseShellMessage('{"type":"back"}'), { type: 'back' })
  const p = fakePort()
  const bridge = createBridge(p.port, { timeoutMs: 20 })
  const seen: string[] = []
  bridge.on((m) => seen.push(m.type))
  p.send('not json')
  p.send({ type: 'hack' })
  p.send({ type: 'connection', state: 'open' })
  assert.deepEqual(seen, ['connection'])
  await assert.rejects(bridge.request({ type: 'call', method: 'snapshot', args: [] }), { code: 'bridge_timeout' })
})

// ── 화면 도우미 ───────────────────────────────────────

test('최근 폴더: 직원 작업 폴더(최근 순) → 랩 폴더, 중복 없이, 홈 폴더만 쓰는 직원은 뺀다', () => {
  const staff = [
    { cwd: '/w/a', cwdSource: 'own' as const, statusSince: 1 },
    { cwd: '/home', cwdSource: 'none' as const, statusSince: 9 },
    { cwd: '/w/b', cwdSource: 'own' as const, statusSince: 5 },
    { cwd: '/w/a', cwdSource: 'own' as const, statusSince: 3 },
  ]
  assert.deepEqual(recentFolders(staff, [{ cwd: '/lab' }, { cwd: null }, { cwd: '/w/b' }]), ['/w/b', '/w/a', '/lab'])
})

test('두 손가락 확대: 손가락 사이가 2배가 되면 2배, 기준점은 두 손가락의 가운데', () => {
  const r = pinchStep(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
  )
  assert.deepEqual(r, { factor: 2, center: { x: 10, y: 0 } })
  assert.equal(pinchStep([{ x: 1, y: 1 }, { x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: 5, y: 5 }]).factor, 1)
})

// ── 경계·보안 ─────────────────────────────────────────

const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(APP, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(tsx?|mts)$/.test(e.name) ? [path.join(dir, e.name)] : []))

test('폰 배치 분기는 틀·UI 부품·phone: 변형에서만 — feature·지도·부품 화면은 useLayout을 쓰지 않는다', () => {
  const offenders = ['src/renderer/features', 'src/renderer/map', 'src/renderer/components'].flatMap(walk).filter((f) => /layout\/useLayout/.test(read(f)))
  assert.deepEqual(offenders, [])
})

test('데스크톱은 그대로: 데스크톱 진입·설정에는 모바일 상수가 없고, phone: 변형은 모바일 빌드 표시(data-shell)가 있어야만 적용', () => {
  assert.match(read('index.html'), /src="\/src\/renderer\/main\.tsx"/)
  assert.doesNotMatch(read('vite.renderer.config.mts'), /__OFFICE_SHELL__|__OFFICE_FILE_BASE__/)
  // phone:·short:는 모바일 판정이 붙인 <html data-layout>만 본다 (화면 높이 미디어 쿼리 X — 키보드로 WebView가 줄어도 안 바뀐다)
  const css = read('src/renderer/index.css')
  assert.match(css, /@custom-variant phone \(&:where\(\[data-layout=phone\] \*\)\);/)
  assert.match(css, /@custom-variant short \(&:where\(\[data-layout=phone\]\[data-short\] \*\)\);/)
  assert.doesNotMatch(css, /@media \([^)]*height/)
  const layoutSetters = walk('src/renderer').filter((f) => /dataset\.layout\s*=/.test(read(f)))
  assert.deepEqual(layoutSetters, ['src/renderer/mobile/install.ts'])
  // data-shell은 모바일 설치(install.ts)만 붙인다
  const setters = walk('src/renderer').filter((f) => /dataset\.shell\s*=/.test(read(f)))
  assert.deepEqual(setters, ['src/renderer/mobile/install.ts'])
})

test('XSS: 화면 어디에도 HTML 문자열을 그대로 넣는 곳이 없고, 마크다운은 HTML을 글자로 둔다', () => {
  const risky = walk('src/renderer').filter((f) => /dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|rehype-raw|new Function\(|\beval\(/.test(read(f)))
  assert.deepEqual(risky, [])
  const md = read('src/renderer/components/markdown.tsx')
  // react-markdown 기본값: 원문 HTML은 글자로, javascript: 같은 주소는 비운다 — 이 기본값을 끄지 않는다
  assert.doesNotMatch(md, /rehypePlugins|skipHtml=\{false\}|urlTransform|allowDangerousHtml/)
})

test('CSP: mobile.html의 CSP가 안드로이드 셸 머리글과 같고, 인라인 스크립트·외부 연결을 막는다', () => {
  const meta = read('mobile.html').match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1]
  assert.ok(meta)
  const kotlin = fs.readFileSync(path.join(APP, '../android/app/src/main/java/com/claudeoffice/remote/web/WebShell.kt'), 'utf8')
  const shell = [...kotlin.matchAll(/internal const val CSP = ([\s\S]*?)\n\n/g)][0]?.[1]
  const shellCsp = [...(shell ?? '').matchAll(/"([^"]*)"/g)].map((m) => m[1]).join('')
  assert.equal(meta, shellCsp)
  const script = meta!.match(/script-src ([^;]+)/)![1]
  assert.equal(script.trim(), "'self'")
  assert.match(meta!, /connect-src 'self'/)
  assert.match(meta!, /object-src 'none'/)
  assert.match(meta!, /base-uri 'none'/)
})

test('빌드 결과(dist-mobile): 상대 경로·인라인 스크립트 없음·미리보기 가짜 셸 없음', { skip: !fs.existsSync(path.join(APP, 'dist-mobile/mobile.html')) && 'pnpm build:mobile 뒤에 확인' }, () => {
  const html = read('dist-mobile/mobile.html')
  assert.match(html, /src="\.\/assets\/[^"]+\.js"/)
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/)
  const js = fs.readdirSync(path.join(APP, 'dist-mobile/assets')).filter((f) => f.endsWith('.js'))
  for (const f of js) {
    const code = read(`dist-mobile/assets/${f}`)
    assert.doesNotMatch(code, /1\.1\.0-preview|ipcRenderer/)
    assert.match(code, /appassets\.androidplatform\.net\/office-file\//)
  }
  assert.ok(!fs.readdirSync(path.join(APP, 'dist-mobile')).some((f) => f.endsWith('.map')))
})

// ── 배치 판정과 키보드 (폴드 펼친 화면에서 입력칸 포커스가 풀리던 버그) ──

test('배치: 폭 840 미만 = 폰, 키보드를 뺀 높이 500 미만 = 가로 폰, 그 밖 = 태블릿(PC 배치)', () => {
  assert.deepEqual(createLayoutTracker({ width: 390, height: 844 }).get(), { isPhone: true, isShort: false, isKeyboardOpen: false })
  assert.deepEqual(createLayoutTracker({ width: 844, height: 390 }).get(), { isPhone: true, isShort: true, isKeyboardOpen: false })
  assert.deepEqual(createLayoutTracker({ width: 1600, height: 1000 }).get(), { isPhone: false, isShort: false, isKeyboardOpen: false })
})

test('배치: 태블릿(1600×1000)에서 입력칸을 눌러 키보드가 WebView를 450으로 줄여도 PC 배치 그대로, 키보드는 열림', () => {
  const t = createLayoutTracker({ width: 1600, height: 1000 })
  // 포커스 → 셸이 WebView를 줄임(adjustResize) → resize
  assert.equal(t.update({ width: 1600, height: 1000, ime: 0, isTyping: true }).isPhone, false)
  assert.deepEqual(t.update({ width: 1600, height: 450, ime: 0, isTyping: true }), { isPhone: false, isShort: false, isKeyboardOpen: true })
  // 셸이 WebView를 줄이지 않고 ime로 알려 줘도 같다
  const u = createLayoutTracker({ width: 1600, height: 1000 })
  assert.deepEqual(u.update({ width: 1600, height: 1000, ime: 550, isTyping: true }), { isPhone: false, isShort: false, isKeyboardOpen: true })
  // 입력이 끝나 키보드가 내려가면 다시 원래 판정
  assert.deepEqual(t.update({ width: 1600, height: 1000, ime: 0, isTyping: false }), { isPhone: false, isShort: false, isKeyboardOpen: false })
})

test('배치: 입력 중이 아니면 높이 변화를 따르고(창 크기 바꾸기), 입력 중이라도 폭이 바뀌면(회전·폴드 접기) 새로 판정', () => {
  const t = createLayoutTracker({ width: 1600, height: 1000 })
  assert.equal(t.update({ width: 1600, height: 450, ime: 0, isTyping: false }).isShort, true)
  const f = createLayoutTracker({ width: 1600, height: 1000 })
  f.update({ width: 1600, height: 1000, ime: 0, isTyping: true })
  assert.deepEqual(f.update({ width: 700, height: 1500, ime: 0, isTyping: true }), { isPhone: true, isShort: false, isKeyboardOpen: false })
  // 세로 폰에서도 키보드로 높이가 줄면 가로 폰(헤더 접기)으로 바뀌지 않는다
  const p = createLayoutTracker({ width: 390, height: 844 })
  assert.deepEqual(p.update({ width: 390, height: 420, ime: 0, isTyping: true }), { isPhone: true, isShort: false, isKeyboardOpen: true })
})

test('통로: insets는 ime(0 이상 숫자)만 있으면 받는다 — 셸 1.1.0 형식 {type, ime}', () => {
  assert.deepEqual(parseShellMessage('{"type":"insets","ime":259}'), { type: 'insets', ime: 259 })
  assert.deepEqual(parseShellMessage('{"type":"insets","ime":0}'), { type: 'insets', ime: 0 })
  assert.equal(parseShellMessage('{"type":"insets"}'), null)
  assert.equal(parseShellMessage('{"type":"insets","ime":-1}'), null)
  assert.equal(parseShellMessage('{"type":"insets","ime":"259"}'), null)
})

test('키보드 ime 방식: ready에 features:["ime"]를 보내고, WebView 높이가 그대로여도 ime > 0이면 키보드 열림 · 배치는 그대로', () => {
  assert.match(read('src/renderer/mobile/install.ts'), /bridge\.notify\(\{ type: 'ready', features: \['ime'(, [^\]]*)?\] \}\)/)
  const tablet = createLayoutTracker({ width: 1600, height: 1000 })
  assert.deepEqual(tablet.update({ width: 1600, height: 1000, ime: 259, isTyping: true }), { isPhone: false, isShort: false, isKeyboardOpen: true })
  assert.deepEqual(tablet.update({ width: 1600, height: 1000, ime: 0, isTyping: true }), { isPhone: false, isShort: false, isKeyboardOpen: false })
  // 가로 폰도 키보드 높이를 더해 "가로 폰 아님"으로 바뀌지 않는다
  const land = createLayoutTracker({ width: 844, height: 390 })
  assert.deepEqual(land.update({ width: 844, height: 390, ime: 259, isTyping: false }), { isPhone: true, isShort: true, isKeyboardOpen: true })
  // 화면은 --ime만큼 비킨다 (본문 아래 여백·시트·직원 패널)
  assert.match(read('src/renderer/index.css'), /\[data-shell='mobile'\] #root \{[^}]*padding-bottom: var\(--ime, 0px\)/)
  assert.match(read('src/renderer/components/ui/dialog.tsx'), /phone:bottom-\[var\(--ime,0px\)\]/)
  assert.match(read('src/renderer/features/StaffPanel.tsx'), /phone:bottom-\[var\(--ime,0px\)\]/)
})
