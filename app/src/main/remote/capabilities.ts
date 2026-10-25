// 폰 화면이 알린 능력 (docs/specs/office-iso-tech.md 4-3절, 임안드 A4 점검)
// 예전 폰 웹 번들은 회사 레벨 11 이상을 받으면 화면이 하얗게 멈추고 복구되지 않는다 — COMPANY_LEVELS(10행)[level - 1]을 바로 읽는다.
// 새 화면(과 함께 나가는 셸)은 요청마다 헤더 X-Office-Capabilities: iso-office를 싣는다 — /v2/call은 요청마다, /v2/events는 연결할 때.
// 능력은 토큰에 저장하지 않는다: 같은 토큰을 새 폰과 예전 폰이 함께 쓸 수 있어서, 요청·연결 단위로만 판정한다 (한리뷰 1-1).
// 헤더가 없는 요청·연결(예전 폰)에는 회사 레벨 관련 값을 Lv.10 기준으로 줄여 보낸다.
// hello(/v2/call { method: 'hello', args: [{ capabilities: [...] }] })는 상태를 남기지 않는 확인용 — 서버가 아는 능력을 돌려준다.
// 예전 PC는 hello에 404 unknown_method → 새 화면은 칸 배치를 쓰지 않는다

import { COMPANY_LEVELS } from '../../shared/officeLevel.ts'

export const ISO_OFFICE = 'iso-office'
/** 지금 서버가 아는 능력 (모르는 값은 받아도 버린다) */
export const KNOWN_CAPABILITIES: readonly string[] = [ISO_OFFICE]
/** 요청·이벤트 스트림 연결에 능력을 싣는 헤더 (쉼표로 여러 개) */
export const CAPABILITIES_HEADER = 'x-office-capabilities'
/** 예전 폰 번들의 회사 레벨 표 길이 */
export const LEGACY_MAX_COMPANY_LEVEL = 10
export const HELLO_METHOD = 'hello'
const CAPABILITY_MAX = 32

export type Capabilities = ReadonlySet<string>
export const NO_CAPABILITIES: Capabilities = new Set()

/** 헤더 값에서 아는 능력만 고른다 (없거나 틀리면 빈 집합 = 예전 폰) */
export function parseCapabilities(header: string | string[] | undefined): Capabilities {
  const raw = Array.isArray(header) ? header.join(',') : header
  if (!raw) return NO_CAPABILITIES
  const list = raw.split(',', CAPABILITY_MAX).map((c) => c.trim().toLowerCase())
  return new Set(KNOWN_CAPABILITIES.filter((c) => list.includes(c)))
}

/** hello 인자에서 아는 능력만 골라 돌려준다 (저장하지 않는다). 인자 모양이 틀리면 null */
export function acceptHello(args: unknown[]): string[] | null {
  const first = args[0]
  const list = typeof first === 'object' && first !== null && !Array.isArray(first) ? (first as { capabilities?: unknown }).capabilities : undefined
  if (args.length !== 1 || !Array.isArray(list) || list.length > CAPABILITY_MAX || !list.every((c) => typeof c === 'string')) return null
  return KNOWN_CAPABILITIES.filter((c) => list.includes(c))
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * 예전 화면용으로 회사 레벨 관련 값을 Lv.10 기준으로 맞춘다 — 레벨·칭호·다음 문턱·진행률을 함께 (한리뷰 1-3).
 * Lv.10은 예전 표의 마지막 단계라 "최고 레벨"처럼 보낸다: 칭호는 10행, 다음 문턱 = 10행 문턱, 진행률 1 (companyFromXp의 마지막 레벨과 같은 모양).
 * 회사 레벨은 스냅샷의 company 한 곳에만 실린다 (snapshot 응답·snapshot 이벤트, 결과에 company를 싣는 다른 메서드도 같은 모양이면 같이 줄인다). 바꿀 게 없으면 같은 값을 돌려준다
 */
export function clampCompanyLevel<T>(value: T): T {
  if (!isPlainObject(value) || !isPlainObject(value.company)) return value
  const level = value.company.level
  if (typeof level !== 'number' || level <= LEGACY_MAX_COMPANY_LEVEL) return value
  const row = COMPANY_LEVELS[LEGACY_MAX_COMPANY_LEVEL - 1]
  return { ...value, company: { ...value.company, level: LEGACY_MAX_COMPANY_LEVEL, title: row.title, nextXp: row.xp, progress: 1 } }
}

/** 이 요청·연결에 보낼 모양 — iso-office를 알리지 않았으면 회사 레벨을 줄인다 */
export function shapeFor<T>(capabilities: Capabilities, value: T): T {
  return capabilities.has(ISO_OFFICE) ? value : clampCompanyLevel(value)
}
