// PC 간 파일 복사본·변경 묶음(4번)의 계약 — docs/specs/multi-pc-protocol.md 7절·9-2
// 3번(연결·위임)은 이 파일을 읽기만 한다. 의존은 3 → 4 한 방향

import type { Hunk } from './textDiff'

/** 복사본 목록의 파일 한 줄 — 일반 파일만. 폴더는 path로 암시 */
export interface SyncEntry {
  /** 작업 폴더 기준 상대 경로, `/` 구분, NFC */
  path: string
  size: number
  sha256: string
  exec: boolean
}

export interface Manifest {
  workspaceId: string
  rootName: string
  createdAt: number
  /** sha256(정렬된 entries 직렬화) */
  rev: string
  entries: SyncEntry[]
}

export type ChangeOp = 'add' | 'modify' | 'delete'

export interface Change {
  op: ChangeOp
  path: string
  size?: number
  sha256?: string
  baseSha256?: string
  exec?: boolean
}

/** 복사본·변경 묶음에 넣지 않은 항목 (숨기지 않고 카드에 보인다) */
export type SkipReason = 'symlink' | 'special' | 'too_large' | 'bad_name'
export interface Skipped {
  path: string
  reason: SkipReason
}

export interface ChangeSet {
  changesetId: string
  workspaceId: string
  baseRev: string
  jobId: string
  changes: Change[]
  skipped: Skipped[]
}

/** 크기 한도 (설계서 7-2, 초기값) */
export const SYNC_LIMITS = {
  fileMax: 20 * 1024 * 1024,
  workspaceBytes: 500 * 1024 * 1024,
  workspaceFiles: 20_000,
  changesBytes: 200 * 1024 * 1024,
  changesFiles: 2_000,
  manifestJson: 4 * 1024 * 1024,
  pathMax: 1024,
  componentMax: 255,
  /** B컴 복사본 합계 */
  hostQuotaBytes: 5 * 1024 * 1024 * 1024,
  /** 동시 올리기/받기 */
  concurrency: 4,
  /** 카드에 줄 단위 비교를 붙이는 텍스트 파일 크기 */
  diffMax: 256 * 1024,
  /** 보관: B컴 복사본·A컴 되돌리기·충돌 7일, A컴 받은 변경 14일 */
  keepMs: 7 * 24 * 60 * 60_000,
  stagingKeepMs: 14 * 24 * 60 * 60_000,
} as const

export const SYNC_PATHS = {
  workspaces: '/v2/peer/workspaces',
  commit: (id: string) => `/v2/peer/workspaces/${encodeURIComponent(id)}/commit`,
  blob: (sha: string) => `/v2/peer/blobs/${sha}`,
  changeset: (id: string) => `/v2/peer/changesets/${encodeURIComponent(id)}`,
} as const

/** 오류 코드 — 화면 문구는 peerSync.error.<code> */
export const SYNC_ERROR_CODES = [
  'root_not_allowed',
  'workspace_too_large',
  'workspace_quota',
  'workspace_not_found',
  'changes_too_large',
  'changes_rejected',
  'changeset_not_found',
  'blob_mismatch',
  'blob_missing',
  'transfer_failed',
  'already_decided',
  'apply_failed',
] as const
export type SyncErrorCode = (typeof SYNC_ERROR_CODES)[number]

/** 오류 글(IPC를 건너오면 class가 사라진다)에서 코드만 꺼낸다 — 경로 같은 자세한 내용은 화면에 내지 않는다 */
export function syncErrorCode(e: unknown): SyncErrorCode | null {
  const msg = e instanceof Error ? e.message : String(e)
  return SYNC_ERROR_CODES.find((c) => new RegExp(`(^|[^a-z_])${c}([^a-z_]|$)`).test(msg)) ?? null
}

export class SyncError extends Error {
  code: SyncErrorCode
  detail?: string
  constructor(code: SyncErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
    this.detail = detail
  }
}

export const isSha256 = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)
/** workspaceId·changesetId: UUID */
export const isSyncId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/** A컴 지금 파일과 비교한 판정 (설계서 7-5 표) */
export type Verdict = 'apply' | 'same' | 'conflict'
export type ConflictReason = 'changed_here' | 'deleted_here' | 'exists_here' | 'not_a_file'

/** 카드 한 줄 */
export interface CardFile {
  op: ChangeOp
  path: string
  size?: number
  verdict: Verdict
  conflict?: ConflictReason
  /** 따로 체크해야 반영되는 경로 (.claude/·CI·빌드 설정 등) */
  isSensitive: boolean
  /** 텍스트면 줄 단위 비교, 아니면 이유 */
  diff?: Hunk[] | 'binary' | 'too_large'
}

/** Approval.peerChanges 본문 (toolName: 'PeerChanges') */
export interface PeerChangesCard {
  changesetId: string
  workspaceId: string
  jobId: string
  rootName: string
  files: CardFile[]
  counts: { add: number; modify: number; delete: number; conflict: number; same: number; sensitive: number }
  bytes: number
  skipped: Skipped[]
}

/** A컴이 받아 스테이징까지 마친 변경 묶음 */
export interface ChangeSetView {
  changesetId: string
  workspaceId: string
  jobId: string
  root: string
  rootName: string
  changes: Change[]
  skipped: Skipped[]
  bytes: number
}

/**
 * 반영 선택 (설계서 7-5)
 * - all: 전체 반영. 충돌이 하나라도 있으면 아무것도 쓰지 않고 blocked
 * - safe: 충돌이 없는 것만 반영 (충돌 파일은 B컴 버전을 보관만)
 * - files: 고른 파일만 (고른 파일에 충돌이 있으면 blocked)
 * - reject: 거절 — 아무것도 쓰지 않고 받은 내용을 지운다
 * 민감 경로는 sensitiveOk에 따로 넣어야 반영된다 (기본 해제)
 */
export interface ApplyChoice {
  mode: 'all' | 'safe' | 'files' | 'reject'
  files?: string[]
  sensitiveOk?: string[]
}

export interface ApplyResult {
  status: 'applied' | 'partial' | 'blocked' | 'rejected' | 'failed'
  applied: string[]
  /** 이미 같은 내용이라 건너뜀 */
  same: string[]
  conflicts: { path: string; reason: ConflictReason }[]
  /** 고르지 않았거나 민감 경로 체크가 없어 남긴 것 */
  held: string[]
  /** 충돌한 B컴 버전을 보관한 폴더 (충돌이 있을 때) */
  conflictDir?: string
  error?: SyncErrorCode
}

/** 4번이 쓰는 B컴 호출 통로 — JSON 호출은 3번 PeerHttp.call과 같은 모양, 파일 바이트는 따로 (3번 peerTransport가 제공) */
export interface SyncHttp {
  call(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }>
  putBytes(path: string, data: Buffer): Promise<{ status: number; body: Record<string, unknown> }>
  getBytes(path: string, limit: number): Promise<{ status: number; data: Buffer | null }>
}

/** 3번이 부르는 함수 (설계서 9-2) */
export interface SyncApi {
  // A컴: 일 시작 전
  prepareWorkspace(root: string, opts?: { exclude?: string[]; peerId?: string }): Promise<{ workspaceId: string; manifest: Manifest; skipped: Skipped[]; excluded: string[] }>
  pushWorkspace(http: SyncHttp, workspaceId: string): Promise<void>
  // B컴: 일 실행 직후
  workspaceDir(workspaceId: string): string | null
  collectChanges(jobId: string, workspaceId: string): Promise<{ changesetId: string; files: number; bytes: number } | { none: true }>
  // A컴: 결과 회수 후
  /** expectWorkspaceId: 이 일에 보낸 복사본 id — B컴이 다른 복사본을 가리키면 거절 */
  fetchChangeSet(http: SyncHttp, changesetId: string, expectWorkspaceId?: string): Promise<ChangeSetView>
  approvalCard(view: ChangeSetView): Promise<PeerChangesCard>
  applyChangeSet(changesetId: string, choice: ApplyChoice): Promise<ApplyResult>
  discardWorkspace(workspaceId: string): Promise<void>
}
