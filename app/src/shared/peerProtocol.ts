// PC 간 연결(짝짓기·연결 유지)의 경로·상태·한도 — docs/specs/multi-pc-protocol.md 의 계약
// 화면(renderer)·메인·테스트가 같은 값을 쓴다. 다른 PC 직원에게 일 맡기기(빌려주기·데려오기)는 1.3.2에서 없앴다

/** 피어 능력 문자열 — hello 능력에 들어 있어야 짝지은 PC로 쓸 수 있다 (설계서 T17). 옛 앱이 확인하므로 값은 그대로 */
export const PEER_CAPABILITY = 'peer-v1'

export const PEER_PATHS = {
  pairHello: '/v2/pair/hello',
  pairConfirm: '/v2/pair/confirm',
  unpair: '/v2/peer/unpair',
} as const

/** 1.3.1까지 일 주고받기에 쓰던 경로 — 옛 앱이 부르면 410 peer_feature_removed로 답한다 (계속 기다리지 않게) */
export const RETIRED_PEER_PATH_PREFIXES = ['/v2/peer/staff', '/v2/peer/watch', '/v2/peer/jobs', '/v2/peer/attachments', '/v2/peer/approvals', '/v2/peer/workspaces', '/v2/peer/blobs', '/v2/peer/changesets'] as const
export const isRetiredPeerPath = (path: string) => RETIRED_PEER_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))

/** 숫자 한도는 모두 초기값 (설계서 O-12) */
export const PEER_LIMITS = {
  pairCodeLength: 12,
  pairMaxWrong: 3,
  maxSlots: 8,
  /** 8초 넘게 못 붙으면 offline (화면이 깜빡이지 않게) */
  offlineAfterMs: 8000,
  retryMs: [1000, 2000, 4000, 8000, 16_000, 30_000],
  /** 서버 SSE 전체 한도 (휴대폰 + 피어) */
  sseTotal: 8,
} as const

/** 화면에 보이는 짝지은 PC 연결 상태 (메모리 값, 설계서 2-2) */
export type PeerLinkState = 'online' | 'connecting' | 'offline' | 'unpaired'

/** 짝짓기 종류 */
/** view: 다른 PC가 이 PC의 사무실 화면을 보는 열쇠 ('화면 보기' 권한을 처음부터 가진 슬롯). peer: 옛 앱과 같은 값(권한은 hello로 요청) */
export type PairKind = 'peer' | 'phone' | 'view'

/** 짝짓기 창 상태 (B컴 화면에 보이는 값 — 코드는 화면에만) */
export interface PairWindowView {
  kind: PairKind
  code: string
  host: string
  port: number
  /** 인증서 지문 앞 8자리 (눈으로 확인용) */
  fingerprint: string
  /** 짝짓기 창은 시간 제한이 없다 — 연결 성공·닫기·앱 종료·코드 3번 틀림에만 닫힌다 (예전 앱과 모양을 맞추려 남긴 칸, 늘 null) */
  until: null
  /** 다른 PC 짝짓기용 QR 그림(SVG data URL) — 토큰은 없고 1회용 코드만 든다 (휴대폰용은 기존 QR을 쓴다) */
  qr?: string
  /** "연결 정보 복사"로 클립보드에 넣을 한 줄 (주소:포트 코드) — 코드와 같은 수명 (창이 닫히면 못 쓴다) */
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
}

/** B컴 화면의 피어 슬롯 한 줄 (토큰·해시는 보내지 않는다) */
export interface PeerSlotView {
  id: string
  label: string
  createdAt: number
  lastSeenAt: number | null
  /** '화면 보기' 권한 허락 여부 */
  view: boolean
  /** 허락을 기다리는 중 (저쪽이 hello로 요청했고 이 PC 앞에서 아직 정하지 않음) */
  viewPending: boolean
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

/** 표기: XXXX-XXXX-XXXX (메인이 이미 꾸민 코드를 화면이 다시 꾸며도 같게) */
export const formatPairCode = (code12: string) => code12.replace(/-/g, '').replace(/(.{4})(?=.)/g, '$1-') // 이미 하이픈이 있어도 같은 결과
export const isPairCode = (s: unknown): s is string => normalizePairCode(s) !== null

/** 붙여 넣은 연결 정보("주소:포트 코드", 줄바꿈·공백·http:// 섞여도 됨)를 나눈다. 못 찾은 칸은 null, 포트가 범위를 벗어나면 port=null */
export function parsePeerInvite(raw: string, defaultPort: number): { host: string | null; port: number | null; code: string | null } {
  const tokens = raw.split(/\s+/).filter(Boolean)
  const hostOf = (tok: string) => tok.replace(/^https?:\/\//i, '').replace(/\/+$/, '').match(/^([^\s:/]+)(?::(\d{1,5}))?$/)
  // 주소는 점·콜론이 있거나 localhost인 토큰. 없으면(짧은 기기 이름) 나머지가 코드가 되는 첫 토큰을 주소로 본다
  let i = tokens.findIndex((tok) => !isPairCode(tok) && /[.:]|^localhost$/i.test(tok) && hostOf(tok))
  if (i < 0) i = tokens.findIndex((tok, k) => hostOf(tok) && !isPairCode(tok) && isPairCode(tokens.filter((_, j) => j !== k).join('')))
  const m = i >= 0 ? hostOf(tokens[i]) : null
  const port = m?.[2] ? Number(m[2]) : defaultPort
  return {
    host: m ? m[1] : null,
    port: port >= 1 && port <= 65535 ? port : null,
    code: normalizePairCode(tokens.filter((_, j) => j !== i).join('')),
  }
}
