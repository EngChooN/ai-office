// 파일 복사본·변경 묶음 통합 시험 (설계서 7절): 한 맥에서 B컴 경로(SyncRoutes)를 HTTP 서버로 띄우고 A컴 PeerSync가 붙는다
// 보내기(처음 전체·이후 차이) → B컴에서 일 → 변경 묶음 회수 → 결재 카드 → 반영·충돌·민감 경로·되돌리기·금지 경로·한도
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { manifestRev, sha256Of } from '../src/main/peer/sync/manifest.ts'
import { PeerSync } from '../src/main/peer/sync/peerSyncService.ts'
import { memorySyncStore } from '../src/main/peer/sync/syncDb.ts'
import { SyncRoutes } from '../src/main/remote/syncRoutes.ts'
import { SyncError, SYNC_LIMITS, SYNC_PATHS, type SyncHttp } from '../src/shared/peerSync.ts'

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'peersync-e2e-'))
const read = (p: string) => fs.readFile(p, 'utf8')
const exists = (p: string) => fs.lstat(p).then(() => true, () => false)
const code = (c: string) => (e: unknown) => e instanceof SyncError && e.code === c

/** B컴 서버 — 테스트에서는 X-Slot 헤더가 피어 토큰의 슬롯 자리 */
async function startB(sync: PeerSync) {
  const routes = new SyncRoutes(sync)
  const server = http.createServer((req, res) => {
    const p = (req.url ?? '/').split('?')[0]
    if (!SyncRoutes.isSyncPath(p)) return void res.writeHead(404).end()
    void routes.handle(req, res, p, (req.headers['x-slot'] as string) || null, () => {})
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return { server, port: (server.address() as AddressInfo).port }
}

/** 3번 peerTransport 대신 쓰는 평문 HTTP 통로 (모양은 SyncHttp) */
function client(port: number, slot: string | null) {
  const counts = { put: 0 }
  const req = (method: string, p: string, body: Buffer | null, type: string) =>
    new Promise<{ status: number; data: Buffer }>((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { ...(slot ? { 'X-Slot': slot } : {}), ...(body ? { 'Content-Type': type, 'Content-Length': body.length } : {}) } }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, data: Buffer.concat(chunks) }))
        res.on('error', reject)
      })
      r.on('error', reject)
      if (body) r.write(body)
      r.end()
    })
  const asJson = (d: Buffer) => {
    try {
      return JSON.parse(d.toString('utf8') || '{}')
    } catch {
      return {}
    }
  }
  const h: SyncHttp = {
    call: async (m, p, body) => {
      const r = await req(m, p, body === undefined ? null : Buffer.from(JSON.stringify(body)), 'application/json')
      return { status: r.status, body: asJson(r.data) }
    },
    putBytes: async (p, data) => {
      counts.put++
      const r = await req('PUT', p, data, 'application/octet-stream')
      return { status: r.status, body: asJson(r.data) }
    },
    getBytes: async (p) => {
      const r = await req('GET', p, null, '')
      return { status: r.status, data: r.status === 200 ? r.data : null }
    },
  }
  return { h, counts }
}

async function setup() {
  const base = await tmp()
  const home = path.join(base, 'home')
  const root = path.join(base, 'lab')
  await fs.mkdir(home)
  await fs.mkdir(path.join(root, 'src'), { recursive: true })
  await fs.writeFile(path.join(root, 'a.txt'), 'line1\nline2\n')
  await fs.writeFile(path.join(root, 'src', 'b.js'), 'export const b = 1\n')
  await fs.writeFile(path.join(root, 'run.sh'), '#!/bin/sh\necho hi\n', { mode: 0o755 })
  await fs.writeFile(path.join(root, '.env'), 'TOKEN=secret')
  await fs.mkdir(path.join(root, '.git'))
  await fs.writeFile(path.join(root, '.git', 'config'), '[core]')
  await fs.mkdir(path.join(root, 'node_modules', 'x'), { recursive: true })
  await fs.writeFile(path.join(root, 'node_modules', 'x', 'i.js'), '1')
  const A = new PeerSync({ baseDir: path.join(base, 'userA'), store: memorySyncStore(), registeredRoots: () => [root], home })
  const bStore = memorySyncStore()
  const B = new PeerSync({ baseDir: path.join(base, 'userB'), store: bStore, registeredRoots: () => [], home })
  const { server, port } = await startB(B)
  const c = client(port, 'slot1')
  const realRoot = await fs.realpath(root)
  return { base, root: realRoot, A, B, bStore, port, c, close: () => new Promise((r) => server.close(r)) }
}

/** 보내기 → B컴 폴더 */
async function pushed(s: Awaited<ReturnType<typeof setup>>) {
  const prep = await s.A.prepareWorkspace(s.root)
  await s.A.pushWorkspace(s.c.h, prep.workspaceId)
  const dir = s.B.workspaceDir(prep.workspaceId)
  assert.ok(dir)
  return { ...prep, dir: dir! }
}

test('보내기: 처음은 전체, 이후는 없는 내용만 — .git·node_modules·.env는 보내지 않는다', async (t) => {
  const s = await setup()
  t.after(s.close)
  const w = await pushed(s)
  assert.deepEqual(w.manifest.entries.map((e) => e.path).sort(), ['a.txt', 'run.sh', 'src/b.js'])
  assert.deepEqual(w.excluded.sort(), ['.env', '.git', 'node_modules'])
  assert.equal(s.c.counts.put, 3)
  assert.equal(await read(path.join(w.dir, 'a.txt')), 'line1\nline2\n')
  assert.equal((await fs.stat(path.join(w.dir, 'run.sh'))).mode & 0o777, 0o755)
  assert.equal(await exists(path.join(w.dir, '.env')), false)
  assert.equal(await exists(path.join(w.dir, '.git')), false)
  // 두 번째 일: 바뀐 파일 하나만 올린다
  await fs.writeFile(path.join(s.root, 'a.txt'), 'line1\nline2\nline3\n')
  const w2 = await pushed(s)
  assert.equal(s.c.counts.put, 4)
  assert.notEqual(w2.workspaceId, w.workspaceId)
  assert.equal(await read(path.join(w2.dir, 'a.txt')), 'line1\nline2\nline3\n')
})

test('반영: B컴의 추가·수정·삭제가 결재 카드로 오고, 승인하면 A컴 폴더에 반영된다', async (t) => {
  const s = await setup()
  t.after(s.close)
  const w = await pushed(s)
  // B컴 직원이 복사본에서 일한다 (링크와 git init은 가져오지 않는다)
  await fs.writeFile(path.join(w.dir, 'a.txt'), 'line1\nline2 changed\n')
  await fs.mkdir(path.join(w.dir, 'docs'))
  await fs.writeFile(path.join(w.dir, 'docs', 'new.md'), '# new\n')
  await fs.rm(path.join(w.dir, 'src', 'b.js'))
  await fs.chmod(path.join(w.dir, 'run.sh'), 0o644)
  await fs.mkdir(path.join(w.dir, '.git'))
  await fs.writeFile(path.join(w.dir, '.git', 'HEAD'), 'ref')
  await fs.symlink('/etc/hosts', path.join(w.dir, 'hosts'))
  const col = await s.B.collectChanges('job-1', w.workspaceId)
  assert.ok('changesetId' in col)
  assert.equal(col.files, 4)

  const view = await s.A.fetchChangeSet(s.c.h, col.changesetId)
  // 받기만 했고 A컴 폴더는 아직 그대로
  assert.equal(await read(path.join(s.root, 'a.txt')), 'line1\nline2\n')
  const card = await s.A.approvalCard(view)
  assert.deepEqual(card.counts, { add: 1, modify: 2, delete: 1, conflict: 0, same: 0, sensitive: 1 })
  assert.deepEqual(card.skipped, [{ path: 'hosts', reason: 'symlink' }])
  const a = card.files.find((f) => f.path === 'a.txt')!
  assert.ok(Array.isArray(a.diff) && a.diff.some((h) => h.kind === 'change' && h.add.includes('line2 changed')))
  assert.ok(card.files.find((f) => f.path === 'run.sh')!.isSensitive)

  const r = await s.A.applyChangeSet(col.changesetId, { mode: 'all', sensitiveOk: ['run.sh'] })
  assert.equal(r.status, 'applied')
  assert.deepEqual(r.applied.sort(), ['a.txt', 'docs/new.md', 'run.sh', 'src/b.js'])
  assert.equal(await read(path.join(s.root, 'a.txt')), 'line1\nline2 changed\n')
  assert.equal(await read(path.join(s.root, 'docs', 'new.md')), '# new\n')
  assert.equal(await exists(path.join(s.root, 'src', 'b.js')), false)
  assert.equal((await fs.stat(path.join(s.root, 'run.sh'))).mode & 0o777, 0o644)
  assert.equal(await read(path.join(s.root, '.git', 'config')), '[core]', 'A컴 .git은 그대로')
  assert.equal(await exists(path.join(s.root, 'hosts')), false)
  // 두 번 반영되지 않는다
  await assert.rejects(s.A.applyChangeSet(col.changesetId, { mode: 'all' }), code('already_decided'))
  // 정리: B컴 복사본 삭제
  await s.B.discardWorkspace(w.workspaceId)
  assert.equal(s.B.workspaceDir(w.workspaceId), null)
  assert.equal(await exists(w.dir), false)
})

test('민감 경로: 따로 체크하지 않으면 남기고 나머지만 반영(partial)', async (t) => {
  const s = await setup()
  t.after(s.close)
  const w = await pushed(s)
  await fs.writeFile(path.join(w.dir, 'package.json'), '{"scripts":{"postinstall":"curl evil"}}')
  await fs.writeFile(path.join(w.dir, 'a.txt'), 'x\n')
  const col = await s.B.collectChanges('job-1', w.workspaceId)
  assert.ok('changesetId' in col)
  await s.A.fetchChangeSet(s.c.h, col.changesetId)
  const r = await s.A.applyChangeSet(col.changesetId, { mode: 'all' })
  assert.equal(r.status, 'partial')
  assert.deepEqual([r.applied, r.held], [['a.txt'], ['package.json']])
  assert.equal(await exists(path.join(s.root, 'package.json')), false)
})

test('충돌: 그사이 A컴에서도 바뀐 파일은 덮어쓰지 않는다 — 전체 반영은 막고, 충돌 없는 것만 반영은 나머지만', async (t) => {
  const s = await setup()
  t.after(s.close)
  const w = await pushed(s)
  await fs.writeFile(path.join(w.dir, 'a.txt'), 'from B\n')
  await fs.writeFile(path.join(w.dir, 'src', 'b.js'), 'export const b = 2\n')
  await fs.writeFile(path.join(w.dir, 'c.txt'), 'new from B\n')
  const col = await s.B.collectChanges('job-1', w.workspaceId)
  assert.ok('changesetId' in col)
  await s.A.fetchChangeSet(s.c.h, col.changesetId)
  // A컴에서도 a.txt를 고치고, 같은 이름의 c.txt를 만든다
  await fs.writeFile(path.join(s.root, 'a.txt'), 'from A\n')
  await fs.writeFile(path.join(s.root, 'c.txt'), 'new from A\n')
  const card = await s.A.changesetDetail(col.changesetId)
  assert.deepEqual(card.files.filter((f) => f.verdict === 'conflict').map((f) => [f.path, f.conflict]), [['a.txt', 'changed_here'], ['c.txt', 'exists_here']])

  const blocked = await s.A.applyChangeSet(col.changesetId, { mode: 'all' })
  assert.equal(blocked.status, 'blocked')
  assert.deepEqual(blocked.applied, [])
  assert.equal(await read(path.join(s.root, 'a.txt')), 'from A\n')
  assert.equal(await read(path.join(s.root, 'src', 'b.js')), 'export const b = 1\n', '막히면 아무것도 쓰지 않는다')
  // B컴 버전은 따로 보관
  assert.equal(await read(path.join(blocked.conflictDir!, 'a.txt')), 'from B\n')

  const safe = await s.A.applyChangeSet(col.changesetId, { mode: 'safe' })
  assert.equal(safe.status, 'partial')
  assert.deepEqual(safe.applied, ['src/b.js'])
  assert.deepEqual(safe.conflicts.map((c) => c.path), ['a.txt', 'c.txt'])
  assert.equal(await read(path.join(s.root, 'a.txt')), 'from A\n')
  assert.equal(await read(path.join(s.root, 'c.txt')), 'new from A\n')
  assert.equal(await read(path.join(s.root, 'src', 'b.js')), 'export const b = 2\n')
})

test('충돌: 이미 같은 내용이면 건너뛰고, A컴에서 지운 파일의 수정은 충돌', async (t) => {
  const s = await setup()
  t.after(s.close)
  const w = await pushed(s)
  await fs.writeFile(path.join(w.dir, 'a.txt'), 'same\n')
  await fs.writeFile(path.join(w.dir, 'src', 'b.js'), 'changed\n')
  const col = await s.B.collectChanges('job-1', w.workspaceId)
  assert.ok('changesetId' in col)
  await s.A.fetchChangeSet(s.c.h, col.changesetId)
  await fs.writeFile(path.join(s.root, 'a.txt'), 'same\n')
  await fs.rm(path.join(s.root, 'src', 'b.js'))
  const r = await s.A.applyChangeSet(col.changesetId, { mode: 'safe' })
  assert.deepEqual([r.same, r.conflicts], [['a.txt'], [{ path: 'src/b.js', reason: 'deleted_here' }]])
  assert.equal(await exists(path.join(s.root, 'src', 'b.js')), false)
})

test('심볼릭 링크: A컴에서 링크인 자리·링크 폴더 안으로는 쓰지 않는다 (폴더 밖 파일 보호)', async (t) => {
  const s = await setup()
  t.after(s.close)
  const outside = await tmp()
  await fs.writeFile(path.join(outside, 'victim.txt'), 'safe')
  const w = await pushed(s)
  await fs.mkdir(path.join(w.dir, 'out'))
  await fs.writeFile(path.join(w.dir, 'out', 'victim.txt'), 'pwned')
  await fs.writeFile(path.join(w.dir, 'ln.txt'), 'pwned')
  const col = await s.B.collectChanges('job-1', w.workspaceId)
  assert.ok('changesetId' in col)
  await s.A.fetchChangeSet(s.c.h, col.changesetId)
  // 받은 뒤 A컴에 링크가 생겼다
  await fs.symlink(outside, path.join(s.root, 'out'))
  await fs.symlink(path.join(outside, 'victim.txt'), path.join(s.root, 'ln.txt'))
  const r = await s.A.applyChangeSet(col.changesetId, { mode: 'safe' })
  assert.deepEqual(r.conflicts.map((c) => [c.path, c.reason]).sort(), [['ln.txt', 'not_a_file'], ['out/victim.txt', 'not_a_file']])
  assert.equal(await read(path.join(outside, 'victim.txt')), 'safe')
  assert.ok((await fs.lstat(path.join(s.root, 'ln.txt'))).isSymbolicLink())
})

test('되돌리기: 반영 중 하나라도 실패하면 이미 쓴 파일을 원래대로 돌리고 다시 고를 수 있다', async (t) => {
  const s = await setup()
  t.after(s.close)
  const w = await pushed(s)
  await fs.writeFile(path.join(w.dir, 'a.txt'), 'from B\n')
  await fs.writeFile(path.join(w.dir, 'src', 'new.js'), 'new\n')
  const col = await s.B.collectChanges('job-1', w.workspaceId)
  assert.ok('changesetId' in col)
  await s.A.fetchChangeSet(s.c.h, col.changesetId)
  await fs.chmod(path.join(s.root, 'src'), 0o555)
  t.after(() => fs.chmod(path.join(s.root, 'src'), 0o755))
  const r = await s.A.applyChangeSet(col.changesetId, { mode: 'all' })
  assert.equal(r.status, 'failed')
  assert.equal(await read(path.join(s.root, 'a.txt')), 'line1\nline2\n', 'a.txt는 되돌려졌다')
  await fs.chmod(path.join(s.root, 'src'), 0o755)
  const again = await s.A.applyChangeSet(col.changesetId, { mode: 'all' })
  assert.equal(again.status, 'applied')
  assert.equal(await read(path.join(s.root, 'src', 'new.js')), 'new\n')
})

test('금지 경로: B컴이 .git·폴더 밖 경로를 섞어 보내면 묶음 전체를 거절하고 아무것도 남기지 않는다', async (t) => {
  const s = await setup()
  t.after(s.close)
  const w = await pushed(s)
  await fs.writeFile(path.join(w.dir, 'a.txt'), 'ok\n')
  for (const evil of ['.git/hooks/pre-commit', '../outside.sh', '.GIT/config', 'src/.g‍it/HEAD']) {
    const col = await s.B.collectChanges('job-1', w.workspaceId)
    assert.ok('changesetId' in col)
    // 침해된 B컴이 변경 목록에 악성 경로를 끼워 넣었다
    const rec = s.bStore.changesets.get(col.changesetId)!
    const data = Buffer.from('#!/bin/sh\nrm -rf ~\n')
    await s.B.blobs.put(sha256Of(data), data)
    s.bStore.changesets.put({ ...rec, changes: [...rec.changes, { op: 'add', path: evil, size: data.length, sha256: sha256Of(data), exec: true }] })
    await assert.rejects(s.A.fetchChangeSet(s.c.h, col.changesetId), code('changes_rejected'), evil)
    await assert.rejects(s.A.applyChangeSet(col.changesetId, { mode: 'all' }), code('changeset_not_found'))
  }
  assert.equal(await read(path.join(s.root, 'a.txt')), 'line1\nline2\n')
  assert.equal(await read(path.join(s.root, '.git', 'config')), '[core]')
  assert.deepEqual(await fs.readdir(path.join(s.base, 'userA', 'peer-staging')).catch(() => []), [])
})

test('내용 변조: 받은 내용의 해시가 목록과 다르면 전체 거절', async (t) => {
  const s = await setup()
  t.after(s.close)
  const w = await pushed(s)
  await fs.writeFile(path.join(w.dir, 'a.txt'), 'honest\n')
  const col = await s.B.collectChanges('job-1', w.workspaceId)
  assert.ok('changesetId' in col)
  const sha = s.bStore.changesets.get(col.changesetId)!.changes[0].sha256!
  await fs.writeFile(s.B.blobs.pathOf(sha), 'tampered\n')
  await assert.rejects(s.A.fetchChangeSet(s.c.h, col.changesetId), code('blob_mismatch'))
})

test('다른 복사본: 이 일에 보낸 복사본이 아닌 묶음은 거절', async (t) => {
  const s = await setup()
  t.after(s.close)
  const w1 = await pushed(s)
  const w2 = await pushed(s)
  await fs.writeFile(path.join(w2.dir, 'a.txt'), 'other job\n')
  const col = await s.B.collectChanges('job-2', w2.workspaceId)
  assert.ok('changesetId' in col)
  await assert.rejects(s.A.fetchChangeSet(s.c.h, col.changesetId, w1.workspaceId), code('changes_rejected'))
  assert.equal((await s.A.fetchChangeSet(s.c.h, col.changesetId, w2.workspaceId)).workspaceId, w2.workspaceId)
  assert.equal(await read(path.join(s.root, 'a.txt')), 'line1\nline2\n')
})

test('B컴 경로: 슬롯마다 자기 것만, 휴대폰 토큰(슬롯 없음)은 거부', async (t) => {
  const s = await setup()
  t.after(s.close)
  const w = await pushed(s)
  await fs.writeFile(path.join(w.dir, 'a.txt'), 'x\n')
  const col = await s.B.collectChanges('job-1', w.workspaceId)
  assert.ok('changesetId' in col)
  const sha = s.bStore.changesets.get(col.changesetId)!.changes[0].sha256!
  const other = client(s.port, 'slot2').h
  assert.equal((await other.call('GET', SYNC_PATHS.changeset(col.changesetId))).status, 404)
  assert.equal((await other.getBytes(SYNC_PATHS.blob(sha), 100)).status, 404)
  assert.equal((await other.call('POST', SYNC_PATHS.commit(w.workspaceId), {})).status, 404)
  // 목록에 없는 내용은 올릴 수 없다 (아무 내용이나 쌓지 못하게)
  const junk = Buffer.from('junk')
  assert.equal((await other.putBytes(SYNC_PATHS.blob(sha256Of(junk)), junk)).status, 404)
  const phone = client(s.port, null).h
  assert.equal((await phone.call('GET', SYNC_PATHS.changeset(col.changesetId))).status, 403)
  // 주소와 내용이 다르면 거절
  assert.equal((await s.c.h.putBytes(SYNC_PATHS.blob('0'.repeat(64)), junk)).status, 404)
})

test('한도: 20MB 넘는 내용 올리기는 413, 잘못된 목록은 422, B컴 복사본 합계 5GB를 넘으면 workspace_quota', async (t) => {
  const s = await setup()
  t.after(s.close)
  const big = Buffer.alloc(SYNC_LIMITS.fileMax + 1)
  // 서버는 본문을 읽기 전에 413으로 끊는다 — 보내는 쪽은 응답 대신 연결 끊김을 볼 수도 있다
  const put = await s.c.h.putBytes(SYNC_PATHS.blob(sha256Of(big)), big).then((r) => r.status, (e: NodeJS.ErrnoException) => e.code)
  assert.ok([413, 'EPIPE', 'ECONNRESET'].includes(put as number | string), String(put))
  assert.equal(await s.B.blobs.has(sha256Of(big)), false)
  const bad = { workspaceId: '33333333-3333-4333-8333-333333333333', rootName: 'x', createdAt: 1, entries: [{ path: '../x', size: 1, sha256: 'a'.repeat(64), exec: false }] }
  assert.equal((await s.c.h.call('POST', SYNC_PATHS.workspaces, { manifest: { ...bad, rev: manifestRev(bad.entries) } })).status, 422)
  // 500MB짜리 목록 11개 = 5.5GB (내용은 올리지 않고 목록만)
  const entries = Array.from({ length: 25 }, (_, i) => ({ path: `f${i}`, size: SYNC_LIMITS.fileMax, sha256: (i % 10).toString().repeat(64), exec: false }))
  const statuses: number[] = []
  for (let i = 0; i < 11; i++) {
    const id = `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`
    statuses.push((await s.c.h.call('POST', SYNC_PATHS.workspaces, { manifest: { workspaceId: id, rootName: 'x', createdAt: 1, rev: manifestRev(entries), entries } })).status)
  }
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200))
  assert.equal(statuses[10], 507)
  // A컴: 등록되지 않은 폴더는 보내지 않는다
  await assert.rejects(s.A.prepareWorkspace(s.base), code('root_not_allowed'))
})

test('변경 없음: 아무것도 안 바꾸면 변경 묶음을 만들지 않는다', async (t) => {
  const s = await setup()
  t.after(s.close)
  const w = await pushed(s)
  assert.deepEqual(await s.B.collectChanges('job-1', w.workspaceId), { none: true })
})

test('거절: 반영하지 않고 받은 내용을 지운다', async (t) => {
  const s = await setup()
  t.after(s.close)
  const w = await pushed(s)
  await fs.writeFile(path.join(w.dir, 'a.txt'), 'nope\n')
  const col = await s.B.collectChanges('job-1', w.workspaceId)
  assert.ok('changesetId' in col)
  const view = await s.A.fetchChangeSet(s.c.h, col.changesetId)
  const sha = view.changes[0].sha256!
  assert.equal(await s.A.staging.has(sha), true)
  const r = await s.A.applyChangeSet(col.changesetId, { mode: 'reject' })
  assert.equal(r.status, 'rejected')
  assert.equal(await s.A.staging.has(sha), false)
  assert.equal(await read(path.join(s.root, 'a.txt')), 'line1\nline2\n')
})
