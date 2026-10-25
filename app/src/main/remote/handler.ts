// 원격 요청 하나를 처리하는 순수 함수 — 서버(HTTPS)와 테스트가 같은 함수를 부른다
// 판단 순서(규격 v1 2-4 · v2 9절): 버전(426) → 잠금 → 인증 → 속도 → 경로·메서드(404·405) → 본문(415·413·400) → 처리
// v1 경로는 아래 4개뿐이다. v2(/v2/*)는 같은 앞단(preflight)을 거친 뒤 service.ts가 처리한다

import type { Staff, Task } from '../../shared/types'
import type { AuthGuard } from './auth.ts'
import type { Capabilities } from './capabilities.ts'
import { bearerToken } from './auth.ts'
import {
  BODY_MAX_BYTES,
  decisionsBody,
  fail,
  findDecision,
  ok,
  parseDecisionBody,
  parseInstructionBody,
  statusBody,
  SUPPORTED_VERSIONS,
  type RemoteResponse,
} from './protocol.ts'

/** 원격이 사무실에 할 수 있는 일 전부 (이 밖의 Office 기능은 타입으로도 닿지 않는다) */
export interface RemoteOfficePort {
  view(): { staff: Staff[]; tasks: Task[] }
  /** 처리했으면 true (이미 끝난 결정이면 false → 409) */
  decide(approvalId: string, allow: boolean): boolean
  answerQuestion(approvalId: string, answers: Record<string, string>): boolean
  reviewPlan(taskId: string, isApproved: boolean, feedback: string): boolean
  instruct(staffId: string, text: string): void
}

export interface RemoteRequest {
  method: string
  /** 경로 (쿼리 문자열 포함일 수 있음 — 쓰지 않는다) */
  url: string
  authorization?: string
  contentType?: string
  /** v2 같은 요청 다시 보내기 키 (헤더 Idempotency-Key) */
  idempotencyKey?: string
  /** v2 화면이 이 요청에 실은 능력 (헤더 X-Office-Capabilities, remote/capabilities.ts). 없으면 예전 폰 */
  capabilities?: Capabilities
  ip: string
  body: Buffer | null
  /** 읽는 도중 16KB를 넘었으면 true (나머지는 버렸다) */
  isBodyTooLarge?: boolean
  /** 서버가 본문을 읽기 전에 앞단(preflight)을 이미 통과시켰으면 true — 다시 세지 않는다(속도 제한·실패 횟수) */
  isPrechecked?: boolean
}

export interface RemoteContext {
  guard: AuthGuard
  office: RemoteOfficePort
  serverVersion: string
  now: number
  /** 앱이 켜지는 중·끝나는 중이면 false → 503 */
  isReady: boolean
}

const RETRY_SEC_WHEN_UNAVAILABLE = 5
const STATUS_PATH = '/v1/status'
const DECISIONS_PATH = '/v1/decisions'
const INSTRUCTIONS_PATH = '/v1/instructions'
const DECISION_ID = /^\/v1\/decisions\/([^/]{1,300})$/

type Route = { name: 'status' | 'decisions' | 'instruction' } | { name: 'decision'; id: string } | null

function route(path: string): { route: Route; allow: string } {
  if (path === STATUS_PATH) return { route: { name: 'status' }, allow: 'GET' }
  if (path === DECISIONS_PATH) return { route: { name: 'decisions' }, allow: 'GET' }
  if (path === INSTRUCTIONS_PATH) return { route: { name: 'instruction' }, allow: 'POST' }
  const m = path.match(DECISION_ID)
  if (m) {
    try {
      return { route: { name: 'decision', id: decodeURIComponent(m[1]) }, allow: 'POST' }
    } catch {
      return { route: null, allow: '' }
    }
  }
  return { route: null, allow: '' }
}

function readJson(req: RemoteRequest): { value: unknown } | RemoteResponse {
  if (!/^application\/json\b/i.test(req.contentType ?? '')) return fail('unsupported_media_type')
  if (req.isBodyTooLarge || (req.body?.length ?? 0) > BODY_MAX_BYTES) return fail('payload_too_large')
  try {
    return { value: JSON.parse(req.body?.toString('utf8') || '') }
  } catch {
    return fail('invalid_request')
  }
}

/** 모든 경로(v1·v2)가 처음에 거치는 검사. 통과하면 null, 아니면 오류 응답 */
export function preflight(req: Pick<RemoteRequest, 'url' | 'authorization' | 'ip'>, ctx: Pick<RemoteContext, 'guard' | 'now' | 'isReady'>): RemoteResponse | null {
  const { guard, now } = ctx
  const path = req.url.split('?')[0]
  // ② 버전: /v<n>/…인데 지원하지 않는 버전이면 인증 전에 알려 준다 (비밀 정보 없음)
  const version = path.match(/^\/v(\d+)(\/|$)/)
  if (version && !SUPPORTED_VERSIONS.includes(Number(version[1]))) return fail('protocol_unsupported', { supported: SUPPORTED_VERSIONS })
  // ③④ 잠금·인증 (잠금 중이면 맞는 토큰도 auth_locked)
  const auth = guard.check(bearerToken(req.authorization), req.ip, now)
  if (!auth.ok) return auth.code === 'auth_locked' ? fail('auth_locked', { retryAt: auth.retryAt }) : fail(auth.code)
  const retryAfterSec = guard.rateLimit(now)
  if (retryAfterSec !== null) return fail('rate_limited', { retryAfterSec })
  if (!ctx.isReady) return fail('office_unavailable', { retryAfterSec: RETRY_SEC_WHEN_UNAVAILABLE })
  return null
}

export function handleRequest(req: RemoteRequest, ctx: RemoteContext): RemoteResponse {
  const { office, now } = ctx
  const path = req.url.split('?')[0]
  const blocked = preflight(req, ctx)
  if (blocked) return blocked
  // ⑤ 경로·메서드
  const { route: r, allow } = route(path)
  if (!r) return fail('not_found')
  if (req.method !== allow) return fail('method_not_allowed', { allow })

  const { staff, tasks } = office.view()
  if (r.name === 'status') return ok(200, statusBody(staff, tasks, ctx.serverVersion), now)
  if (r.name === 'decisions') return ok(200, decisionsBody(staff, tasks), now)

  // ⑥ 본문
  const json = readJson(req)
  if (!('value' in json)) return json

  if (r.name === 'instruction') {
    const input = parseInstructionBody(json.value)
    if (!input) return fail('invalid_request')
    if (!staff.some((s) => s.id === input.staffId && s.kind === 'hired')) return fail('staff_not_found')
    office.instruct(input.staffId, input.text)
    return ok(202, { accepted: true, staffId: input.staffId }, now)
  }

  if (r.name !== 'decision') return fail('not_found')
  const decision = findDecision(r.id, staff, tasks)
  if (!decision) return fail('already_decided')
  const action = parseDecisionBody(json.value, decision)
  if (action === 'invalid_request' || action === 'invalid_action') return fail(action)
  // 요약이 잘려 휴대폰에서 전체를 못 본 결재는 승인하지 못한다 (반려는 안전하므로 받는다)
  if (decision.kind === 'approval' && decision.isTruncated && action.action === 'approve') return fail('review_on_pc')
  // ⑦ 처리 — 데스크톱과 같은 Office 기능을 부른다
  let result: 'approved' | 'rejected' | 'answered' | 'skipped'
  let isHandled: boolean
  if (decision.kind === 'plan') {
    const isApproved = action.action === 'approve'
    isHandled = office.reviewPlan(decision.taskId, isApproved, 'feedback' in action ? action.feedback : '')
    result = isApproved ? 'approved' : 'rejected'
  } else if (action.action === 'answer') {
    isHandled = office.answerQuestion(decision.approvalId, action.answers)
    result = 'answered'
  } else {
    const allow = action.action === 'approve'
    isHandled = office.decide(decision.approvalId, allow)
    result = action.action === 'skip' ? 'skipped' : allow ? 'approved' : 'rejected'
  }
  if (!isHandled) return fail('already_decided')
  return ok(200, { decisionId: r.id, result }, now)
}
