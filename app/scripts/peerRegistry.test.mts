// 피어 기록·토큰 금고·저장소(설계서 1-5·2절): 토큰은 파일에만(0600), 읽지 못하면 unreadable
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { fileTokenVault, memoryTokenVault, PeerRegistry } from '../src/main/peer/peerRegistry.ts'
import { ensurePeerTables, memoryPeerStore, sqlitePeerStore } from '../src/main/peer/peerStore.ts'

test('토큰 금고: 암호화 파일 0600·폴더 0700, 읽지 못하면 unreadable, 없으면 null, 지우면 사라진다', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'peer-vault-')), 'peers')
  const crypt = { encrypt: (s: string) => Buffer.from(s.split('').reverse().join('')), decrypt: (b: Buffer) => b.toString().split('').reverse().join('') }
  const v = fileTokenVault(dir, crypt)
  assert.equal(v.load('p1'), null)
  v.save('p1', 'SECRET-TOKEN')
  assert.equal(v.load('p1'), 'SECRET-TOKEN')
  const file = path.join(dir, 'p1.token.enc')
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700)
  assert.equal(fs.readFileSync(file, 'utf8').includes('SECRET-TOKEN'), false) // 평문이 아니다
  // 다른 키체인(복호화 실패)이면 unreadable — 몰래 새로 만들지 않는다
  const broken = fileTokenVault(dir, { encrypt: crypt.encrypt, decrypt: () => { throw new Error('bad key') } })
  assert.equal(broken.load('p1'), 'unreadable')
  v.remove('p1')
  assert.equal(v.load('p1'), null)
  // 경로 문자는 쓰지 않는다
  v.save('../evil', 'x')
  assert.equal(fs.existsSync(path.join(dir, '..', 'evil.token.enc')), false)
  fs.rmSync(path.dirname(dir), { recursive: true, force: true })
})

test('피어 저장: 같은 주소로 다시 짝지으면 같은 피어(토큰만 교체), 해제하면 기록·토큰이 함께 지워진다', () => {
  const vault = memoryTokenVault()
  const reg = new PeerRegistry(memoryPeerStore(), vault, () => 1000)
  const a = reg.addPeer({ name: 'B컴', host: '100.64.0.2', port: 47900, spki: 'sha256/x', slotId: 's1', token: 'T1' })
  const again = reg.addPeer({ name: 'B컴', host: '100.64.0.2', port: 47900, spki: 'sha256/x', slotId: 's2', token: 'T2' })
  assert.equal(again.id, a.id)
  assert.equal(reg.listPeers().length, 1)
  assert.equal(reg.tokenOf(a.id), 'T2')
  reg.removePeer(a.id)
  assert.deepEqual([reg.listPeers().length, reg.tokenOf(a.id)], [0, null])
})

test('SQLite 저장소: office.db와 같은 DatabaseSync에 짝 기록 표 하나, 넣고 빼고 덮어쓰기', () => {
  const db = new DatabaseSync(':memory:')
  ensurePeerTables(db)
  ensurePeerTables(db) // 두 번 불러도 괜찮다
  const store = sqlitePeerStore(db)
  assert.deepEqual((db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map((r) => r.name), ['peer'])
  store.peers.put({ id: 'p1', name: 'B', host: 'h', port: 1, spki: 's', slotId: '', pairedAt: 1, lastSeenAt: null })
  store.peers.put({ id: 'p1', name: "B2 ' \" 따옴표", host: 'h', port: 1, spki: 's', slotId: '', pairedAt: 1, lastSeenAt: null })
  assert.equal(sqlitePeerStore(db).peers.get('p1')?.name, "B2 ' \" 따옴표")
  assert.equal(store.peers.list().length, 1)
  store.peers.delete('p1')
  assert.equal(store.peers.get('p1'), undefined)
})
