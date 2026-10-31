// PC 간 연결(여러 PC 한 랩)의 경로·상태·이벤트·한도 — docs/specs/multi-pc-protocol.md 의 계약
// 화면(renderer)·메인·테스트가 같은 값을 쓴다. 파일 복사본(4번)의 타입은 shared/peerSync.ts

/** 피어 능력 문자열 — hello 능력에 들어 있어야 피어로 쓸 수 있다 (설계서 T17) */
export const PEER_CAPABILITY = 'peer-v1'

export const PEER_PATHS = {
  pairHello: '/v2/pair/hello',
  pairConfirm: '/v2/pair/confirm',
  staff: '/v2/peer/staff',
  watch: '/v2/peer/watch',
  jobs: '/v2/peer/jobs',
  approvals: '/v2/peer/approvals',
  unpair: '/v2/peer/unpair',
} as const

/** 숫자 한도는 모두 초기값 (설계서 O-12) */
export const PEER_LIMITS = {
  pairWindowMs: 5 * 60_000,
  pairCodeLength: 12,
  pairMaxWrong: 3,
  maxSlots: 8,
  /** 피어당 연결 대기 일 수 */
  queueMax: 50,
  /** 연결 대기 수명 (O-3) */
  queueTtlMs: 24 * 60 * 60_000,
  instructionMax: 20_000,
  resultMax: 20_000,
  /** B컴 수신함 보관: ack 뒤 / ack 없이 */
  inboxAckedKeepMs: 30 * 24 * 60 * 60_000,
  inboxKeepMs: 90 * 24 * 60 * 60_000,
  /** 8초 넘게 못 붙으면 offline (화면이 깜빡이지 않게) */
  offlineAfterMs: 8000,
  retryMs: [1000, 2000, 4000, 8000, 16_000, 30_000],
  /** 서버 SSE 전체 한도 (휴대폰 + 피어) */
  sseTotal: 8,
} as const

/** A컴 기준 일 상태 (설계서 3-3) */
export type PeerJobState = 'queued' | 'sending' | 'accepted' | 'running' | 'done' | 'failed' | 'canceled'
export const PEER_JOB_ACTIVE: readonly PeerJobState[] = ['queued', 'sending', 'accepted', 'running']
export const isPeerJobActive = (s: PeerJobState) => PEER_JOB_ACTIVE.includes(s)

/** 화면에 보이는 원격 직원 연결 상태 (메모리 값, 설계서 2-2) */
export type PeerLinkState = 'online' | 'connecting' | 'offline' | 'unpaired'

/** 원격 직원 id: p:<peerId>:<remoteId> — 로컬 직원 uuid와 겹치지 않는 접두사 */
const STAFF_ID = /^p:([A-Za-z0-9_-]{1,64}):(.{1,200})$/
export const peerStaffId = (peerId: string, remoteId: string) => `p:${peerId}:${remoteId}`
export const parsePeerStaffId = (id: string): { peerId: string; remoteId: string } | null => {
  const m = STAFF_ID.exec(id)
  return m ? { peerId: m[1], remoteId: m[2] } : null
}
export const isPeerStaffId = (id: string) => STAFF_ID.test(id)

/** B컴이 A컴에 알려 주는 얇은 직원 정보 — systemPrompt·cwd·refDocs·장비는 보내지 않는다 (설계서 2-1) */
export interface PeerStaffBrief {
  id: string
  name: string
  role: string
  avatar: number
  provider: string
  model: string
  status: string
  thought?: string
  /** 파일 수정을 결재 없이 하는 직원 — 원격 일을 받을 수 없다 (자동 승인이 세션 안에서 일어나 A컴이 막을 수 없어서) */
  isAutoEdit?: boolean
}

/** SSE `job` 이벤트·일 조회 응답 */
export interface PeerJobEvent {
  jobId: string
  state: PeerJobState
  result?: string
  error?: string
  changesetId?: string
}

/** SSE `approval` 이벤트 — alwaysRule은 싣지 않는다 (원격에서 "항상 승인" 규칙을 B컴에 만들지 못하게) */
export interface PeerApprovalEvent {
  jobId: string
  approvalId: string
  staffId: string
  toolName: string
  summary: string
  summaryI18n?: unknown
  createdAt: number
  questions?: unknown
}
export interface PeerApprovalGone {
  approvalId: string
  gone: true
}

/** 일 보내기 요청 본문 (POST /v2/peer/jobs) */
export interface PeerJobRequest {
  jobId: string
  staffId: string
  instruction: string
  lead: { name: string; role: string }
  lab?: { name: string; goal?: string }
  workspaceId?: string
  isAutonomous?: boolean
}

/** 짝짓기 종류 */
export type PairKind = 'peer' | 'phone'

/** 짝짓기 창 상태 (B컴 화면에 보이는 값 — 코드는 화면에만) */
export interface PairWindowView {
  kind: PairKind
  code: string
  host: string
  port: number
  /** 인증서 지문 앞 8자리 (눈으로 확인용) */
  fingerprint: string
  until: number
  /** 다른 PC 짝짓기용 QR 그림(SVG data URL) — 토큰은 없고 1회용 코드만 든다 (휴대폰용은 기존 QR을 쓴다) */
  qr?: string
  /** "연결 정보 복사"로 클립보드에 넣을 한 줄 (주소:포트 코드) — 코드와 같은 5분 수명 */
  copyText: string
}

/** A컴 화면의 피어 한 줄 */
export interface PeerView {
  id: string
  name: string
  host: string
  port: number
  pairedAt: number
  state: PeerLinkState
  /** 연결 대기 중인 일 수 */
  queued: number
  /** 이 피어에서 랩에 넣은 직원 수 */
  staffCount: number
}

/** B컴 화면의 피어 슬롯 한 줄 (토큰·해시는 보내지 않는다) */
export interface PeerSlotView {
  id: string
  label: string
  createdAt: number
  lastSeenAt: number | null
}

/** 랩에 넣을 수 있는 B컴 직원 (목록 가져오기 결과) */
export interface RemoteStaffChoice extends PeerStaffBrief {
  isAdded: boolean
}

// ── 주소 규칙 ─────────────────────────────────────────

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/
const octets = (ip: string) => (IPV4.test(ip) ? ip.split('.').map(Number) : null)

/** Tailscale 100.64.0.0/10 · 사설 IPv4 · *.ts.net 만 허용 (공인 IP·그 밖의 이름은 거절, 설계서 1-3) */
export function isPeerHostAllowed(raw: string): boolean {
  const host = raw.trim().toLowerCase()
  if (!host || host.length > 255) return false
  const o = octets(host)
  if (o) {
    if (o.some((n) => n > 255)) return false
    const [a, b] = o
    if (a === 100 && b >= 64 && b <= 127) return true
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.ts\.net$/.test(host)
}

/** 짝짓기 코드: 12자 Crockford base32 (I·L·O·U 없음, 설계서 1-4) */
export const PAIR_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** 입력 정규화: 공백·하이픈 제거 → 대문자 → O→0, I·L→1. 12글자·알파벳 안이 아니면 null (키 유도에는 이 값을 쓴다) */
export function normalizePairCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const c = input.replace(/[\s-]/g, '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1')
  return c.length === PEER_LIMITS.pairCodeLength && [...c].every((ch) => PAIR_CODE_ALPHABET.includes(ch)) ? c : null
}

/** 표기: XXXX-XXXX-XXXX */
export const formatPairCode = (code12: string) => code12.replace(/(.{4})(?=.)/g, '$1-')
export const isPairCode = (s: unknown): s is string => normalizePairCode(s) !== null

/** 일 id: UUID v4 모양 (jobId는 UUID) */
export const isJobId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/** 일 상태 오류 중 다시 보내도 소용없는 것 (400/403/404·토큰 폐기 — 설계서 6-1) */
export const isPermanentPeerStatus = (status: number) => status === 400 || status === 401 || status === 403 || status === 404 || status === 410 || status === 422
