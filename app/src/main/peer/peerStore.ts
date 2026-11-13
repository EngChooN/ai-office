// PC 간 연결의 영속 데이터 (A컴: 짝지은 PC 기록 peer)
// 표마다 (id, data JSON) 한 줄 — 모양은 코드가 정한다. 테스트는 메모리 구현, 앱은 office.db 구현을 쓴다
// 1.3.1까지 있던 데려온 직원·일·수신함 표는 legacyPeerCleanup.ts가 지운다

import type { DatabaseSync } from 'node:sqlite'

export interface PeerRecord {
  id: string
  name: string
  host: string
  port: number
  /** B컴 인증서 지문 (sha256/…) — 짝지을 때 고정, 바뀌면 연결을 거부한다 */
  spki: string
  /** B컴이 내준 슬롯 id (B컴에서 해제할 때 대조용) */
  slotId: string
  pairedAt: number
  lastSeenAt: number | null
  /** hello 답으로 알게 된 가장 최근 주소 */
  lastHost?: string
}

export interface PeerTable<T extends { id: string }> {
  get(id: string): T | undefined
  put(row: T): void
  delete(id: string): void
  list(): T[]
}

export interface PeerStore {
  peers: PeerTable<PeerRecord>
}

class MemoryTable<T extends { id: string }> implements PeerTable<T> {
  private rows = new Map<string, string>()
  get(id: string) {
    const v = this.rows.get(id)
    return v === undefined ? undefined : (JSON.parse(v) as T)
  }
  put(row: T) {
    this.rows.set(row.id, JSON.stringify(row))
  }
  delete(id: string) {
    this.rows.delete(id)
  }
  list() {
    return [...this.rows.values()].map((v) => JSON.parse(v) as T)
  }
}

export function memoryPeerStore(): PeerStore {
  return { peers: new MemoryTable() }
}

/** office.db에 표를 만든다 (db.ts가 한 줄로 부른다) */
export function ensurePeerTables(db: DatabaseSync) {
  db.exec('CREATE TABLE IF NOT EXISTS peer (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
}

class SqliteTable<T extends { id: string }> implements PeerTable<T> {
  private db: DatabaseSync
  private table: string
  constructor(db: DatabaseSync, table: 'peer') {
    this.db = db
    this.table = table
  }
  get(id: string) {
    const r = this.db.prepare(`SELECT data FROM ${this.table} WHERE id = ?`).get(id) as { data: string } | undefined
    return r ? (JSON.parse(r.data) as T) : undefined
  }
  put(row: T) {
    this.db.prepare(`INSERT INTO ${this.table} (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`).run(row.id, JSON.stringify(row))
  }
  delete(id: string) {
    this.db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id)
  }
  list() {
    return (this.db.prepare(`SELECT data FROM ${this.table}`).all() as { data: string }[]).map((r) => JSON.parse(r.data) as T)
  }
}

export function sqlitePeerStore(db: DatabaseSync): PeerStore {
  return { peers: new SqliteTable(db, 'peer') }
}
