// 빌려주기·데려오기(1.3.1까지) 없앤 뒤 1회 정리 — 옛 표·폴더·데려온 직원 id를 지우고, 짝 기록은 남기고, 몇 번 불러도 같다
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { cleanupLegacyPeerData, LEGACY_PEER_DIRS, LEGACY_PEER_TABLES } from '../src/main/peer/legacyPeerCleanup.ts'

const tables = (db: DatabaseSync) => (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map((r) => r.name)

/** 1.3.1 사용자 DB 모양: 짝 기록 + 데려온 직원 2명 + 진행 중 일 1·끝난 일 1 + 반영 안 한 변경 1 + 그 직원이 든 랩·카드·기록 */
function oldDb() {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE lab (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL)')
  db.exec('CREATE TABLE task (id TEXT PRIMARY KEY, assignee_id TEXT)')
  db.exec('CREATE TABLE log (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT NOT NULL, text TEXT NOT NULL)')
  for (const t of ['peer', ...LEGACY_PEER_TABLES]) db.exec(`CREATE TABLE ${t} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`)
  const put = (t: string, row: Record<string, unknown>) => db.prepare(`INSERT INTO ${t} (id, data) VALUES (?, ?)`).run(String(row.id), JSON.stringify(row))
  put('peer', { id: 'pc1', name: '회사 PC' })
  put('peer_staff', { id: 'p:pc1:kim', name: '김배포' })
  put('peer_staff', { id: 'p:pc1:lee', name: '이검토' })
  put('peer_job', { id: 'j1', peerId: 'pc1', remoteStaffId: 'kim', state: 'running' })
  put('peer_job', { id: 'j2', peerId: 'pc1', remoteStaffId: 'lee', state: 'done' })
  put('peer_job', { id: 'j3', peerId: 'pc1', remoteStaffId: 'kim', state: 'queued' })
  put('peer_changeset', { id: 'c1', side: 'a', state: 'pending' })
  put('peer_changeset', { id: 'c2', side: 'a', state: 'applied' })
  db.prepare('INSERT INTO lab (id, data, created_at) VALUES (?, ?, 1)').run('lab1', JSON.stringify({ id: 'lab1', memberIds: ['local-1', 'p:pc1:kim'] }))
  db.prepare('INSERT INTO task (id, assignee_id) VALUES (?, ?), (?, ?)').run('t1', 'p:pc1:kim', 't2', 'local-1')
  db.prepare('INSERT INTO log (staff_id, text) VALUES (?, ?), (?, ?)').run('p:pc1:kim', 'x', 'local-1', 'y')
  return db
}

test('옛 데이터: 진행 중 일·반영 안 한 변경을 세고, 옛 표·폴더·데려온 직원 id를 지우고, 짝 기록·내 직원은 그대로', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-peer-'))
  for (const d of LEGACY_PEER_DIRS) fs.mkdirSync(path.join(dir, d, 'x'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'peers'))
  const db = oldDb()
  const r = cleanupLegacyPeerData(db, dir)
  assert.deepEqual(r, { closedJobs: 2, staffNames: ['김배포'], closedChanges: 1, errors: [] })
  assert.deepEqual(tables(db), ['lab', 'log', 'peer', 'sqlite_sequence', 'task'])
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM peer').get() as { n: number }).n, 1)
  assert.deepEqual(JSON.parse((db.prepare('SELECT data FROM lab').get() as { data: string }).data).memberIds, ['local-1'])
  assert.deepEqual(db.prepare('SELECT id, assignee_id FROM task ORDER BY id').all().map((x) => ({ ...x })), [{ id: 't1', assignee_id: null }, { id: 't2', assignee_id: 'local-1' }])
  assert.deepEqual(db.prepare('SELECT staff_id FROM log').all().map((x) => (x as { staff_id: string }).staff_id), ['local-1'])
  for (const d of LEGACY_PEER_DIRS) assert.equal(fs.existsSync(path.join(dir, d)), false)
  assert.equal(fs.existsSync(path.join(dir, 'peers')), true) // 토큰 폴더는 워크스페이스가 쓴다
  // 다시 불러도 같다 — 알릴 것 없음, 오류 없음
  assert.deepEqual(cleanupLegacyPeerData(db, dir), { closedJobs: 0, staffNames: [], closedChanges: 0, errors: [] })
  fs.rmSync(dir, { recursive: true, force: true })
})

test('새로 설치한 DB(옛 표 없음)와 깨진 행: 아무 일 없이 지나가고 앱을 멈추지 않는다', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE peer (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
  assert.deepEqual(cleanupLegacyPeerData(db, os.tmpdir() + '/no-such-legacy-dir'), { closedJobs: 0, staffNames: [], closedChanges: 0, errors: [] })
  const broken = oldDb()
  broken.prepare("INSERT INTO peer_job (id, data) VALUES ('bad', 'not json')").run()
  const r = cleanupLegacyPeerData(broken, os.tmpdir() + '/no-such-legacy-dir')
  assert.equal(r.closedJobs, 2)
  assert.deepEqual(r.errors, [])
  assert.equal(tables(broken).includes('peer_job'), false)
})

test('깨진 랩 줄: 다른 랩은 계속 고치고, 고쳐 쓰기에 실패한 줄이 있으면 옛 표를 남겨 다음 실행에서 마저 한다', () => {
  const db = oldDb()
  const putLab = (id: string, data: string) => db.prepare('INSERT INTO lab (id, data, created_at) VALUES (?, ?, 2)').run(id, data)
  putLab('lab0', 'not json') // 읽을 수 없는 줄 — 건너뛴다 (실패로 세지 않는다)
  putLab('lab2', JSON.stringify({ id: 'lab2', memberIds: ['p:pc1:lee', 'local-2'] }))
  putLab('lab3', JSON.stringify({ id: 'lab3', memberIds: ['p:pc1:kim'] }))
  // lab2 고쳐 쓰기만 실패하게
  db.exec("CREATE TRIGGER lab2_fail BEFORE UPDATE ON lab WHEN NEW.id = 'lab2' BEGIN SELECT RAISE(ABORT, 'boom'); END")
  const labMembers = (id: string) => JSON.parse((db.prepare('SELECT data FROM lab WHERE id = ?').get(id) as { data: string }).data).memberIds

  const r1 = cleanupLegacyPeerData(db, os.tmpdir() + '/no-such-legacy-dir')
  assert.equal(r1.errors.length, 1)
  assert.match(r1.errors[0], /^labs: lab2 /)
  assert.deepEqual(labMembers('lab1'), ['local-1']) // 깨진 줄 앞뒤 랩은 고쳐졌다
  assert.deepEqual(labMembers('lab3'), [])
  assert.deepEqual(labMembers('lab2'), ['p:pc1:lee', 'local-2'])
  assert.deepEqual(db.prepare('SELECT staff_id FROM log').all().map((x) => (x as { staff_id: string }).staff_id), ['local-1']) // 다른 단계는 계속했다
  for (const t of LEGACY_PEER_TABLES) assert.equal(tables(db).includes(t), true) // 옛 표는 남긴다

  // 다음 실행: 실패 원인이 사라지면 마저 고치고 옛 표를 지운다 (알림도 그때 한 번 더 센다)
  db.exec('DROP TRIGGER lab2_fail')
  const r2 = cleanupLegacyPeerData(db, os.tmpdir() + '/no-such-legacy-dir')
  assert.deepEqual(r2, { closedJobs: 2, staffNames: ['김배포'], closedChanges: 1, errors: [] })
  assert.deepEqual(labMembers('lab2'), ['local-2'])
  assert.equal((db.prepare("SELECT data FROM lab WHERE id = 'lab0'").get() as { data: string }).data, 'not json')
  for (const t of LEGACY_PEER_TABLES) assert.equal(tables(db).includes(t), false)
})

test('랩 리드가 데려온 직원이면 비우고, 되돌리기·충돌 사본은 14일 지난 것만 지운다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-peer-keep-'))
  const now = Date.now()
  for (const [d, name, ageDays] of [['peer-undo', 'old', 20], ['peer-conflicts', 'new', 2]] as const) {
    const p = path.join(dir, d, name)
    fs.mkdirSync(p, { recursive: true })
    const t = new Date(now - ageDays * 86_400_000)
    fs.utimesSync(p, t, t)
  }
  const db = oldDb()
  db.prepare('UPDATE lab SET data = ? WHERE id = ?').run(JSON.stringify({ id: 'lab1', memberIds: ['p:pc1:kim'], leadId: 'p:pc1:kim' }), 'lab1')
  assert.deepEqual(cleanupLegacyPeerData(db, dir, now).errors, [])
  assert.deepEqual(JSON.parse((db.prepare('SELECT data FROM lab').get() as { data: string }).data), { id: 'lab1', memberIds: [], leadId: null })
  assert.equal(fs.existsSync(path.join(dir, 'peer-undo')), false) // 비면 폴더도 지운다
  assert.equal(fs.existsSync(path.join(dir, 'peer-conflicts', 'new')), true)
  fs.rmSync(dir, { recursive: true, force: true })
})
