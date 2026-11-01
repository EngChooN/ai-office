// PC 간 연결의 영속 데이터 (A컴: peer·peer_staff·peer_job·peer_outbox / B컴: peer_inbox·peer_upload)
// 표마다 (id, data JSON) 한 줄 — 모양은 코드가 정한다. 테스트는 메모리 구현, 앱은 office.db 구현을 쓴다

import type { DatabaseSync } from 'node:sqlite'
import type { PeerJobState } from '../../shared/peerProtocol'
import type { Attachment } from '../../shared/types'

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
  /** 함께 보낼 첨부 (A컴 첨부 폴더의 파일). 보낼 때 하나씩 올려 remoteId를 채운다 */
  attachments?: PeerJobAttachment[]
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

/** A컴 일에 붙은 첨부 한 개 — 올렸으면 remoteId(B컴 첨부 id), 못 보내 뺐으면 그 이유 */
export interface PeerJobAttachment {
  path: string
  name: string
  mime: string
  remoteId?: string
  dropped?: 'missing' | 'too_large' | 'too_many' | 'rejected'
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
  /** 이 슬롯이 올린 첨부 (B컴 첨부 폴더의 파일) */
  attachments?: Attachment[]
  /** 요청에 있었지만 이 슬롯이 올린 것이 아니라 버린 첨부 수 — 지시 끝에 안내한다 */
  droppedAttachments?: number
  state: PeerJobState
  result?: string
  error?: string
  changesetId?: string
  createdAt: number
  finishedAt?: number
  ackedAt?: number
}

/** B컴: 피어가 올린 첨부 — 올린 슬롯만 그 id를 일에 쓸 수 있다 */
export interface PeerUpload {
  /** B컴 첨부 id */
  id: string
  slotId: string
  attachment: Attachment
  createdAt: number
  /** 이 첨부를 붙여 받은 일 — 있으면 정리할 때 기록만 지우고 파일은 남긴다 (일·기록이 가리키므로) */
  usedBy?: string
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
  uploads: PeerTable<PeerUpload>
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
  return { peers: new MemoryTable(), staff: new MemoryTable(), jobs: new MemoryTable(), outbox: new MemoryTable(), inbox: new MemoryTable(), uploads: new MemoryTable() }
}

const TABLES = ['peer', 'peer_staff', 'peer_job', 'peer_outbox', 'peer_inbox', 'peer_upload'] as const

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
    uploads: new SqliteTable(db, 'peer_upload'),
  }
}
