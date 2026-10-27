// 원격 프로토콜 v1 (docs/specs/remote-protocol-v1.md) — 응답 모양·오류 코드·요청 검사
// 휴대폰으로 나가는 값은 여기서 필드 이름을 하나씩 골라 만든다. 원본 객체를 펼치지 않아 새 필드가 저절로 새 나가지 않는다

import type { Approval, Staff, StaffQuestion, Task } from '../../shared/types'
import { canonicalAvatar } from '../../shared/look.ts'

export const PROTOCOL_VERSION = 1
/** 이 서버가 제공하는 프로토콜 (v1 4종 + v2 OfficeApi 전체) — v1 /status의 supportedProtocols, 426의 supported */
export const SUPPORTED_VERSIONS = [PROTOCOL_VERSION, 2]

/** 요청 본문·글자 수 한도 (규격 3-3) */
export const BODY_MAX_BYTES = 16 * 1024
export const INSTRUCTION_MAX = 4000
export const FEEDBACK_MAX = 2000
export const ANSWER_MAX = 1000
const SUMMARY_MAX = 2000
const SPEC_MAX = 10_000
const DECISIONS_MAX = 100

export type ErrorCode =
  | 'invalid_request'
  | 'invalid_action'
  | 'unauthorized'
  | 'token_revoked'
  | 'auth_locked'
  | 'not_found'
  | 'staff_not_found'
  | 'method_not_allowed'
  | 'already_decided'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'protocol_unsupported'
  | 'rate_limited'
  | 'internal_error'
  | 'office_unavailable'
  | 'review_on_pc'

const ERROR_STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  invalid_action: 400,
  unauthorized: 401,
  token_revoked: 401,
  auth_locked: 401,
  not_found: 404,
  staff_not_found: 404,
  method_not_allowed: 405,
  already_decided: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  protocol_unsupported: 426,
  rate_limited: 429,
  internal_error: 500,
  office_unavailable: 503,
  review_on_pc: 400,
}

/** 화면에 그대로 써도 되는 한국어 설명 (토큰·경로·내부 오류 문장은 넣지 않는다) */
const ERROR_MESSAGE: Record<ErrorCode, string> = {
  invalid_request: '요청 내용을 확인해 주세요',
  invalid_action: '이 결정에 맞지 않는 응답이에요',
  unauthorized: '다시 연결이 필요해요',
  token_revoked: 'PC에서 QR을 다시 만들었어요. 새 QR로 다시 연결하세요',
  auth_locked: '인증 실패가 많아 잠시 잠겼어요',
  not_found: '없는 기능이에요',
  staff_not_found: '직원을 찾을 수 없어요',
  method_not_allowed: '지원하지 않는 방식이에요',
  already_decided: '이미 처리됐어요',
  payload_too_large: '글이 너무 길어요',
  unsupported_media_type: '지원하지 않는 형식이에요',
  protocol_unsupported: '버전이 맞지 않아요. 업데이트해 주세요',
  rate_limited: '요청이 너무 잦아요. 잠시 뒤에 다시 시도하세요',
  internal_error: 'PC에서 문제가 생겼어요',
  office_unavailable: 'PC의 AI Office가 준비 중이에요',
  review_on_pc: '내용이 길어 휴대폰에는 일부만 보였어요. PC에서 전체를 확인해 주세요',
}

export interface RemoteResponse {
  status: number
  headers: Record<string, string>
  body: Record<string, unknown>
}

export function ok(status: number, body: Record<string, unknown>, now: number): RemoteResponse {
  return { status, headers: {}, body: { protocolVersion: PROTOCOL_VERSION, serverTime: now, ...body } }
}

export function fail(code: ErrorCode, extra: { retryAt?: number; retryAfterSec?: number; supported?: number[]; allow?: string } = {}): RemoteResponse {
  const headers: Record<string, string> = {}
  if (extra.retryAfterSec !== undefined) headers['Retry-After'] = String(extra.retryAfterSec)
  if (extra.allow) headers.Allow = extra.allow
  const body: Record<string, unknown> = { protocolVersion: PROTOCOL_VERSION, error: code, message: ERROR_MESSAGE[code] }
  if (extra.retryAt !== undefined) body.retryAt = extra.retryAt
  if (extra.retryAfterSec !== undefined) body.retryAfterSec = extra.retryAfterSec
  if (extra.supported) body.supported = extra.supported
  return { status: ERROR_STATUS[code], headers, body }
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s)

// 지금 하는 일(activity)에는 도구 인자(명령 전문·파일 경로)가 섞인다 → 휴대폰에는 도구 이름 수준만 보낸다
// 도구 호출은 "<도구> <인자>" 꼴(hired.ts의 PreToolUse), MCP 도구는 mcp__<서버>__<도구>
const TOOL_ACTIVITY = /^(?:mcp__[\w-]+__([\w-]+)|([A-Z][A-Za-z]+))(?:\s|$)/

/** 도구 호출이 아닌 활동(직원이 쓴 문장·내부 안내)은 내용 없이 이 문구로 */
export const FREE_ACTIVITY = '작업 중'

/** 원격으로 보내는 활동 문장: 도구 호출은 "Bash 실행 중"처럼 이름만, 오류는 "오류가 났어요", 그 밖의 글은 내용 없이 "작업 중" */
export function remoteActivity(status: Staff['status'], activity: string) {
  if (!activity) return ''
  if (status === 'error') return '오류가 났어요'
  const tool = activity.match(TOOL_ACTIVITY)
  return tool ? `${tool[1] ?? tool[2]} 실행 중` : FREE_ACTIVITY
}

// ── 응답 모양 ────────────────────────────────────────────

/** 원격에 보여 줄 직원: 고용 직원만, 필드는 이름으로 골라 담는다 (작업 폴더·지침·비용·세션·장비 등은 빼고) */
export function toRemoteStaff(s: Staff, pendingPlans: number) {
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    // 외부에서 데려온 직원은 세션 해시(최대 2^32 근처)를 avatar로 써서 32비트 정수를 넘는다 → 같은 생김새의 작은 번호로 (규격 5-1)
    avatar: canonicalAvatar(s.avatar),
    status: s.status,
    activity: remoteActivity(s.status, s.activity),
    statusSince: s.statusSince,
    pendingDecisions: s.approvals.length + pendingPlans,
  }
}

/** v1 상태 응답. 0.9.0부터 선택 필드 supportedProtocols·fullAccess를 더한다 (v1 앱은 무시 — v2 규격 2-1절).
 * 전체 기능 스위치는 없앴다(원격이 켜져 있으면 v2를 바로 쓴다) — fullAccess는 1.0.x·1.1 앱 호환을 위해 항상 true */
export function statusBody(staff: Staff[], tasks: Task[], serverVersion: string) {
  const hired = staff.filter((s) => s.kind === 'hired')
  const plans = waitingPlans(tasks)
  const summary = { working: 0, waiting: 0, error: 0, idle: 0, offline: 0 }
  for (const s of hired) summary[s.status]++
  return {
    serverVersion,
    staff: hired.map((s) => toRemoteStaff(s, plans.filter((t) => t.assigneeId === s.id).length)),
    summary,
    supportedProtocols: SUPPORTED_VERSIONS,
    fullAccess: true,
  }
}

/** 대표 확인을 기다리는 기획 카드 */
const waitingPlans = (tasks: Task[]) => tasks.filter((t) => t.plan?.status === 'waiting' && t.assigneeId)

// 결정 id는 종류가 섞여도 겹치지 않게 접두어를 붙인다 (앱은 내용을 해석하지 않는다)
const APPROVAL_PREFIX = 'a.'
const PLAN_PREFIX = 'p.'

export type DecisionRef = { kind: 'approval' | 'question'; approvalId: string; isTruncated?: boolean } | { kind: 'plan'; taskId: string }

const toQuestion = (q: StaffQuestion) => ({
  question: q.question,
  header: q.header,
  options: q.options.map((o) => ({ label: o.label, description: o.description })),
  multiSelect: q.multiSelect,
})

/** 결재 요약이 휴대폰에 다 못 보낼 만큼 긴지 — 이런 결재는 원격 승인을 받지 않는다 (반려는 된다) */
const isLongSummary = (a: Approval) => a.summary.length > SUMMARY_MAX

function approvalDecision(a: Approval, staffName: string) {
  const base = {
    id: `${APPROVAL_PREFIX}${a.id}`,
    staffId: a.staffId,
    staffName,
    summary: clip(a.summary, SUMMARY_MAX),
    ...(isLongSummary(a) ? { isTruncated: true } : {}),
    createdAt: a.createdAt,
  }
  return a.questions ? { ...base, kind: 'question' as const, questions: a.questions.map(toQuestion) } : { ...base, kind: 'approval' as const, toolName: a.toolName }
}

function planDecision(t: Task, staffName: string) {
  const plan = t.plan!
  const isTruncated = plan.spec.length > SPEC_MAX
  return {
    id: `${PLAN_PREFIX}${t.id}`,
    kind: 'plan' as const,
    staffId: t.assigneeId!,
    staffName,
    summary: clip(t.title, SUMMARY_MAX),
    title: t.title,
    spec: clip(plan.spec, SPEC_MAX),
    subtasks: plan.subtasks.map((st) => ({ title: st.title, detail: st.detail, assigneeName: st.assigneeName })),
    ...(isTruncated ? { isTruncated } : {}),
    createdAt: plan.proposedAt,
  }
}

/** 대기 결정 목록: 고용 직원의 결재·질문 + 대표 확인 대기 기획. 오래 기다린 것부터, 최대 100건 */
export function decisionsBody(staff: Staff[], tasks: Task[]) {
  const hired = staff.filter((s) => s.kind === 'hired')
  const nameOf = (id: string) => hired.find((s) => s.id === id)?.name ?? ''
  const all = [
    ...hired.flatMap((s) => s.approvals.map((a) => approvalDecision(a, s.name))),
    ...waitingPlans(tasks)
      .filter((t) => hired.some((s) => s.id === t.assigneeId))
      .map((t) => planDecision(t, nameOf(t.assigneeId!))),
  ].sort((a, b) => a.createdAt - b.createdAt)
  return { total: all.length, decisions: all.slice(0, DECISIONS_MAX) }
}

/** 경로의 결정 id → 지금 기다리는 결정 (없거나 이미 처리됐으면 null → 409) */
export function findDecision(id: string, staff: Staff[], tasks: Task[]): (DecisionRef & { questions?: StaffQuestion[] }) | null {
  if (id.startsWith(APPROVAL_PREFIX)) {
    const approvalId = id.slice(APPROVAL_PREFIX.length)
    const a = staff.filter((s) => s.kind === 'hired').flatMap((s) => s.approvals).find((x) => x.id === approvalId)
    if (!a) return null
    return a.questions ? { kind: 'question', approvalId, questions: a.questions } : { kind: 'approval', approvalId, isTruncated: isLongSummary(a) }
  }
  if (id.startsWith(PLAN_PREFIX)) {
    const taskId = id.slice(PLAN_PREFIX.length)
    return waitingPlans(tasks).some((t) => t.id === taskId) ? { kind: 'plan', taskId } : null
  }
  return null
}

// ── 요청 검사 ────────────────────────────────────────────

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export type DecisionAction =
  | { action: 'approve' | 'reject'; feedback: string }
  | { action: 'answer'; answers: Record<string, string> }
  | { action: 'skip' }

/** 결정 응답 본문 검사. 종류에 맞지 않는 action은 invalid_action, 모양이 틀리면 invalid_request (모르는 필드는 무시) */
export function parseDecisionBody(body: unknown, decision: { kind: DecisionRef['kind']; questions?: StaffQuestion[] }): DecisionAction | 'invalid_request' | 'invalid_action' {
  if (!isPlainObject(body) || typeof body.action !== 'string') return 'invalid_request'
  const { action } = body
  if (decision.kind === 'approval') return action === 'approve' || action === 'reject' ? { action, feedback: '' } : 'invalid_action'
  if (decision.kind === 'plan') {
    if (action !== 'approve' && action !== 'reject') return 'invalid_action'
    if (body.feedback !== undefined && (typeof body.feedback !== 'string' || body.feedback.length > FEEDBACK_MAX)) return 'invalid_request'
    return { action, feedback: (body.feedback as string | undefined) ?? '' }
  }
  if (action === 'skip') return { action }
  if (action !== 'answer') return 'invalid_action'
  if (!isPlainObject(body.answers)) return 'invalid_request'
  const known = new Set((decision.questions ?? []).map((q) => q.question))
  const entries = Object.entries(body.answers)
  if (entries.length === 0) return 'invalid_request'
  for (const [q, a] of entries) if (!known.has(q) || typeof a !== 'string' || !a.trim() || a.length > ANSWER_MAX) return 'invalid_request'
  return { action, answers: Object.fromEntries(entries) as Record<string, string> }
}

/** 지시 본문 검사: staffId·text만 쓴다. 예약 필드 target은 아직 받지 않는다 */
export function parseInstructionBody(body: unknown): { staffId: string; text: string } | null {
  if (!isPlainObject(body) || 'target' in body) return null
  const { staffId, text } = body
  if (typeof staffId !== 'string' || !staffId || staffId.length > 200 || typeof text !== 'string') return null
  if (!text.trim() || text.length > INSTRUCTION_MAX) return null
  return { staffId, text }
}
