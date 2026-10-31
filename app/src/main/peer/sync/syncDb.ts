// 파일 복사본·변경 묶음의 영속 데이터: peer_workspace · peer_changeset (4번 자기 표만)
// 표마다 (id, data JSON) 한 줄 — peerStore와 같은 방식. 테스트는 메모리 구현, 앱은 office.db(db.ts가 ensureSyncTables 한 줄)

import type { DatabaseSync } from 'node:sqlite'
import type { Change, Manifest, Skipped } from '../../../shared/peerSync'

export interface WorkspaceRecord {
  id: string
  /** a: 보낸 쪽(A컴) · b: 받은 쪽(B컴) */
  side: 'a' | 'b'
  /** A컴: 실제 루트(realpath) */
  root?: string
  peerId?: string
  /** B컴: 이 복사본을 올린 피어 슬롯 */
  slotId?: string
  manifest: Manifest
  /** prepared(A, 목록만) → pushed(A) / uploading(B) → ready(B, 폴더가 만들어짐) */
  state: 'prepared' | 'pushed' | 'uploading' | 'ready'
  bytes: number
  createdAt: number
}

export interface ChangesetRecord {
  id: string
  side: 'a' | 'b'
  workspaceId: string
  jobId: string
  slotId?: string
  baseRev: string
  changes: Change[]
  skipped: Skipped[]
  bytes: number
  /** B: collected · A: pending → applied / partial / rejected (막힘·실패는 pending 그대로) */
  state: 'collected' | 'pending' | 'applied' | 'partial' | 'rejected'
  createdAt: number
  decidedAt?: number
}

export interface SyncTable<T extends { id: string }> {
  get(id: string): T | undefined
  put(row: T): void
  delete(id: string): void
  list(): T[]
}

export interface SyncStore {
  workspaces: SyncTable<WorkspaceRecord>
  changesets: SyncTable<ChangesetRecord>
}

class MemoryTable<T extends { id: string }> implements SyncTable<T> {
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

export const memorySyncStore = (): SyncStore => ({ workspaces: new MemoryTable(), changesets: new MemoryTable() })

const TABLES = ['peer_workspace', 'peer_changeset'] as const

/** office.db에 표를 만든다 (db.ts가 한 줄로 부른다) */
export function ensureSyncTables(db: DatabaseSync) {
  for (const t of TABLES) db.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`)
}

class SqliteTable<T extends { id: string }> implements SyncTable<T> {
  private db: DatabaseSync
  private table: string
  constructor(db: DatabaseSync, table: (typeof TABLES)[number]) {
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

export const sqliteSyncStore = (db: DatabaseSync): SyncStore => ({ workspaces: new SqliteTable(db, 'peer_workspace'), changesets: new SqliteTable(db, 'peer_changeset') })
