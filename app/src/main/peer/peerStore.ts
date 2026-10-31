// PC 간 연결의 영속 데이터 (A컴: peer·peer_staff·peer_job·peer_outbox / B컴: peer_inbox)
// 표마다 (id, data JSON) 한 줄 — 모양은 코드가 정한다. 테스트는 메모리 구현, 앱은 office.db 구현을 쓴다

import type { DatabaseSync } from 'node:sqlite'
import type { PeerJobState } from '../../shared/peerProtocol'

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

export interface PeerStaffRecord {
  /** p:<peerId>:<remoteId> */
  id: string
  peerId: string
  remoteId: string
  name: string
  role: string
  avatar: number
  provider: string
  model: string
  lastKnownStatus: string
  lastSeenAt: number | null
  addedAt: number
  /** B컴 목록에서 사라졌다 */
  isGone?: boolean
}

export interface PeerJob {
  id: string
  peerId: string
  remoteStaffId: string
  /** 보고를 받을 리더 (대표가 직접 지시했으면 null) */
  leadId: string | null
  room?: string
  isAutonomous?: boolean
  instruction: string
  workspaceId?: string
  /** 복사본으로 보낼 A컴 폴더 (랩 폴더). 보낼 때 복사본을 만들어 workspaceId를 채운다 */
  workspaceRoot?: string
  /** 복사본을 B컴에 올리는 일이 끝났는가 */
  isWorkspacePushed?: boolean
  /** 복사본을 못 만들어 그냥 보냈다면 그 이유(오류 코드) — 보고에 알린다 */
  workspaceNote?: string
  /** 돌아온 변경 묶음을 A컴이 받아 결재함에 올렸는가 (실패하면 다시 붙을 때 다시 받는다) */
  changesState?: 'fetched' | 'failed'
  state: PeerJobState
  attempts: number
  nextTryAt: number
  createdAt: number
  sentAt?: number
  finishedAt?: number
  result?: string
  error?: string
  changesetId?: string
  /** 리더에게 [팀원 보고]를 이미 냈는지 (재연결로 같은 결과가 다시 와도 한 번만) */
  isReported?: boolean
}

/** 보낼 것 (결재 결정·취소·ack) — 일과 같은 큐 규칙 */
export interface PeerOutbox {
  id: string
  peerId: string
  kind: 'decide' | 'answer' | 'cancel' | 'ack'
  /** Idempotency-Key */
  key: string
  payload: Record<string, unknown>
  createdAt: number
  attempts: number
  nextTryAt: number
}

/** B컴 수신함 — jobId가 기본키라 같은 일을 두 번 실행하지 않는다 (재시작 뒤에도) */
export interface InboxJob {
  id: string
  slotId: string
  staffId: string
  instruction: string
  lead: { name: string; role: string }
  lab?: { name: string; goal?: string }
  workspaceId?: string
  isAutonomous?: boolean
  state: PeerJobState
  result?: string
  error?: string
  changesetId?: string
  createdAt: number
  finishedAt?: number
  ackedAt?: number
}

export interface PeerTable<T extends { id: string }> {
  get(id: string): T | undefined
  put(row: T): void
  delete(id: string): void
  list(): T[]
}

export interface PeerStore {
  peers: PeerTable<PeerRecord>
  staff: PeerTable<PeerStaffRecord>
  jobs: PeerTable<PeerJob>
  outbox: PeerTable<PeerOutbox>
  inbox: PeerTable<InboxJob>
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
  return { peers: new MemoryTable(), staff: new MemoryTable(), jobs: new MemoryTable(), outbox: new MemoryTable(), inbox: new MemoryTable() }
}

const TABLES = ['peer', 'peer_staff', 'peer_job', 'peer_outbox', 'peer_inbox'] as const

/** office.db에 표를 만든다 (db.ts가 한 줄로 부른다) */
export function ensurePeerTables(db: DatabaseSync) {
  for (const t of TABLES) db.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`)
}

class SqliteTable<T extends { id: string }> implements PeerTable<T> {
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

export function sqlitePeerStore(db: DatabaseSync): PeerStore {
  return {
    peers: new SqliteTable(db, 'peer'),
    staff: new SqliteTable(db, 'peer_staff'),
    jobs: new SqliteTable(db, 'peer_job'),
    outbox: new SqliteTable(db, 'peer_outbox'),
    inbox: new SqliteTable(db, 'peer_inbox'),
  }
}
