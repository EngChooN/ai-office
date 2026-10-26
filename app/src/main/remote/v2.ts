// 원격 프로토콜 v2 (docs/specs/remote-protocol-v2.md) — POST /v2/call: OfficeApi 전체를 PC 화면과 같은 처리 함수(officeHandlers)로 보낸다
// 메서드마다 분류(R·S·P·C·U)와 인자 모양을 한 표에 둔다. OfficeApi에 메서드가 생기면 이 표에도 넣어야 tsc가 통과한다

import type { OfficeMethod } from '../../shared/officeApiShape'
import type { Attachment, OfficeApi } from '../../shared/types'
import { BODY_MAX_BYTES } from './protocol.ts'
import type { RemoteResponse } from './protocol.ts'
import { isBlocked, isInvalidArgs } from '../../shared/errors.ts'

export const V2_PROTOCOL_VERSION = 2
/** /v2/call 요청 본문 상한 */
export const V2_CALL_BODY_MAX = 1024 * 1024
/** /v2/call 응답 본문 상한 */
export const V2_RESPONSE_MAX = 16 * 1024 * 1024
/** 한 호출 처리 시간 상한 */
export const V2_CALL_TIMEOUT_MS = 120_000
/** 한 토큰에서 동시에 처리 중인 호출 수 */
export const V2_CONCURRENT_MAX = 8
const IDEMPOTENCY_TTL_MS = 10 * 60_000
/** 이보다 큰 응답은 저장하지 않는다 (두 번째 요청은 duplicate_call) */
const IDEMPOTENCY_STORE_MAX = 256 * 1024
const IDEMPOTENCY_KEYS_MAX = 500
const MESSAGE_MAX = 300

// v1 본문 상한(16KB)과 헷갈리지 않게 함께 둔다
export const BODY_LIMITS = { v1: BODY_MAX_BYTES, v2Call: V2_CALL_BODY_MAX }

/**
 * R = 그대로 · S = PC 파일·명령에 영향(PC 화면과 같은 검사) · P = PC 전용(422 pc_only) · C = 이 폰 연결이 끊김(confirm 필요) · U = 올리기 경로로(400 use_upload)
 */
export type V2Class = 'R' | 'S' | 'P' | 'C' | 'U'
export type PcOnlyAlternative = 'enter_path' | 'download_file' | 'open_on_pc'

/**
 * 인자 모양 (자리마다 한 글자): s 문자열 · n 숫자 · b 불리언 · o 객체 · a 배열 · S 문자열 배열 · x 아무 JSON 값.
 * 뒤에 ? = 선택(생략·null 가능), 앞에 ~ = null도 받음(필수 자리에서). 첨부 자리는 attach에 따로 적는다
 */
interface MethodSpec {
  cls: V2Class
  args: string
  alternative?: PcOnlyAlternative
  /** Attachment[]를 받는 자리: 숫자 = args[n], 'n.attachments' = args[n] 객체의 attachments */
  attach?: (number | `${number}.attachments`)[]
}

const R = (args = '', attach?: MethodSpec['attach']): MethodSpec => ({ cls: 'R', args, ...(attach ? { attach } : {}) })
const S = (args = ''): MethodSpec => ({ cls: 'S', args })
const P = (alternative: PcOnlyAlternative, args = ''): MethodSpec => ({ cls: 'P', args, alternative })

/** OfficeApi 전체 분류 (규격 5-3절 표). 키가 OfficeMethod와 정확히 같아야 한다 */
export const V2_METHODS: Record<OfficeMethod, MethodSpec> = {
  remoteStatus: R(),
  setRemoteEnabled: { cls: 'C', args: 'b n?' },
  regenerateRemoteQr: { cls: 'C', args: '' },
  remoteQr: P('open_on_pc'),
  setRemoteHost: R('s'),
  snapshot: R(),
  hire: S('o'),
  fire: R('s'),
  updateStaff: S('s o'),
  instruct: R('s s a?', [2]),
  loadStaffCommands: R('s'),
  saveAttachments: { cls: 'U', args: 'a' },
  openAttachment: P('download_file', 's'),
  interrupt: R('s s? a?', [2]),
  resumeInTerminal: P('open_on_pc', 's'),
  decide: R('s b'),
  getRecord: R('s'),
  listAgentTemplates: S('s'),
  pickFolder: P('enter_path'),
  hooksStatus: R(),
  setHooksInstalled: S('b'),
  setAskHookInstalled: S('b'),
  createTeam: R('s s'),
  updateTeam: R('s o'),
  deleteTeam: R('s'),
  createLab: S('o'),
  updateLab: S('s o'),
  deleteLab: R('s'),
  setRefDocs: S('o S'),
  pickFiles: P('enter_path'),
  missingFiles: S('S'),
  fireExternal: S('s'),
  recruitExternal: R('s o'),
  equipmentCatalog: S('s'),
  setEquipment: R('s o'),
  claudeStatus: R(),
  openClaudeLogin: P('open_on_pc'),
  forkExternal: R('s s a?', [2]),
  listManuals: R(),
  saveManual: S('o s?'),
  deleteManual: S('s'),
  draftManual: R('s s s'),
  trainStaff: R('s S'),
  trainGroups: R('s S S'),
  startRun: R('o', ['0.attachments']),
  reviewRun: R('s b s'),
  stopRun: R('s'),
  workChanges: S('s'),
  suggestCommitMessage: R('s'),
  commitChanges: S('s s'),
  pushAndCreatePr: S('s s s'),
  createTask: R('o', ['0.attachments']),
  updateTask: R('s o'),
  assignTask: R('s s'),
  deleteTask: R('s'),
  startMeeting: R('o'),
  answerMeetingDecision: R('s s s'),
  endMeeting: R('s s'),
  stopTask: R('s'),
  resumePlan: R('s'),
  reviewPlan: R('s b s'),
  answerQuestion: R('s o'),
  // 자동결재: 휴대폰에서도 켜고 끈다 (기획서 — 대표가 밖에서 켜 두고 잠들 수 있게)
  autoApproveStatus: R(),
  setAutoApprove: R('o'),
  autoApproveLog: R(),
  refreshPlanUsage: R(),
  ledger: R(),
  buyItem: R('s'),
  applySurface: R('s s ~s'),
  placeItem: R('s n? n?'),
  moveItem: R('s n n'),
  storeItem: R('s'),
  placeGridItem: R('s n n n n'),
  moveGridItem: R('s n n n n'),
  setGridItemOn: R('s b'),
  stowAllGrid: R('n b'),
  restoreGridItems: R('a'),
  setGear: R('s s ~s'),
  missions: R(),
  claimMission: R('s'),
  startTasks: R('S'),
  saveSchedule: R('o'),
  deleteSchedule: R('s'),
  runScheduleNow: R('s'),
  chatHistory: R(),
  sendChat: R('s a?', [1]),
  timeline: R('n'),
  dailyReport: R('n'),
  payslip: R('s'),
  updateSettings: S('o'),
  // 비서: 말 보내기·카드 실행(대표가 [실행]을 누른 것)·취소·지우기 — 휴대폰에서도 같은 화면
  secretaryAsk: R('s'),
  secretaryRun: R('s o?'),
  secretaryCancel: R('s'),
  secretaryClear: R(),
}

// ── 객체 인자: 메서드별 허용 필드 ─────────────────────────

/** args[I]의 객체 타입 (선택 자리면 undefined를 뺀다) */
type ObjectArg<M extends OfficeMethod, I extends number> = NonNullable<Parameters<OfficeApi[M]>[I]>
/** 그 자리 타입의 필드를 빠짐없이·더하지 않고 적게 한다 (OfficeApi 타입이 바뀌면 tsc가 알려 준다) */
const fieldsOf = <M extends OfficeMethod, I extends number>(_method: M, _index: I, fields: Record<keyof ObjectArg<M, I>, true>) => Object.keys(fields)

/**
 * 객체를 받는 자리마다 남길 필드 (폰이 보낸 나머지 필드는 버린다 — 병합 메서드에 id·첨부 path 같은 필드가 끼어들지 않게).
 * 한 단계(맨 위 필드)만 고른다. answerQuestion(질문 → 답 표)은 키가 질문이라 고르지 않는다
 */
export const V2_FIELDS: Partial<Record<OfficeMethod, Record<number, string[]>>> = {
  hire: { 0: fieldsOf('hire', 0, { name: true, role: true, avatar: true, model: true, cwd: true, systemPrompt: true, approvalMode: true, teamId: true, labIds: true }) },
  updateStaff: { 1: fieldsOf('updateStaff', 1, { teamId: true, name: true, role: true, model: true, avatar: true, systemPrompt: true, cwd: true }) },
  updateTeam: { 1: fieldsOf('updateTeam', 1, { name: true, color: true, leadId: true, floor: true }) },
  createLab: { 0: fieldsOf('createLab', 0, { name: true, color: true, goal: true, cwd: true, leadId: true, memberIds: true, manuals: true }) },
  updateLab: { 1: fieldsOf('updateLab', 1, { name: true, color: true, goal: true, cwd: true, leadId: true, memberIds: true, manuals: true }) },
  setRefDocs: { 0: fieldsOf('setRefDocs', 0, { kind: true, id: true }) },
  recruitExternal: { 1: fieldsOf('recruitExternal', 1, { role: true, model: true, teamId: true, approvalMode: true }) },
  setEquipment: { 1: fieldsOf('setEquipment', 1, { mcpServers: true, skills: true, allowedTools: true, disallowedTools: true, monthlyBudgetUsd: true }) },
  saveManual: { 0: fieldsOf('saveManual', 0, { name: true, description: true, kind: true, scope: true, projectDir: true, body: true, steps: true }) },
  startRun: { 0: fieldsOf('startRun', 0, { manualName: true, scope: true, input: true, attachments: true, taskId: true }) },
  createTask: { 0: fieldsOf('createTask', 0, { title: true, detail: true, teamId: true, labId: true, attachments: true }) },
  updateTask: { 1: fieldsOf('updateTask', 1, { title: true, detail: true, status: true, teamId: true, labId: true, assigneeId: true }) },
  setAutoApprove: { 0: fieldsOf('setAutoApprove', 0, { mode: true, hours: true, start: true, end: true }) },
  startMeeting: { 0: fieldsOf('startMeeting', 0, { topic: true, participantIds: true, rounds: true }) },
  saveSchedule: { 0: fieldsOf('saveSchedule', 0, { id: true, staffId: true, label: true, time: true, weekdays: true, instruction: true, enabled: true }) },
  secretaryRun: { 1: fieldsOf('secretaryRun', 1, { fromStep: true, edits: true, revised: true }) },
  updateSettings: {
    0: fieldsOf('updateSettings', 0, { monthlyBudgetUsd: true, tokenBudget: true, theme: true, dayNight: true, plants: true, isChatterOn: true, workHours: true, layout: true, isTrayOn: true, isOnboarded: true, isWorkMode: true, isFullAccessNoticeSeen: true, language: true }),
  },
}

/** 객체 자리에서 허용 필드만 남긴다 (없는 필드는 만들지 않는다) */
export function pickFields(method: OfficeMethod, args: unknown[]): unknown[] {
  const table = V2_FIELDS[method]
  if (!table) return args
  return args.map((v, i) => {
    const allowed = table[i]
    if (!allowed || !isPlainObject(v)) return v
    return Object.fromEntries(allowed.filter((k) => Object.hasOwn(v, k)).map((k) => [k, v[k]]))
  })
}

/** 결과가 "이미 처리됐는지" 알려 주는 결정 호출 — false면 409 already_decided (v1과 같은 판정) */
const DECISION_METHODS = new Set<OfficeMethod>(['decide', 'answerQuestion', 'reviewPlan'])

// ── 인자 검사 ────────────────────────────────────────────

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function matches(kind: string, v: unknown) {
  switch (kind) {
    case 's':
      return typeof v === 'string'
    case 'n':
      return typeof v === 'number' && Number.isFinite(v)
    case 'b':
      return typeof v === 'boolean'
    case 'o':
      return isPlainObject(v)
    case 'a':
      return Array.isArray(v)
    case 'S':
      return Array.isArray(v) && v.every((x) => typeof x === 'string')
    default:
      return true
  }
}

/** 인자 개수·자리별 타입 검사. 틀린 자리(예: "args[1]")를 돌려주고, 맞으면 null. 선택 자리는 생략·null 가능, 남는 인자는 거절 */
export function checkArgs(spec: string, args: unknown[]): string | null {
  const slots = spec ? spec.split(' ') : []
  if (args.length > slots.length) return `args[${slots.length}]`
  for (const [i, slot] of slots.entries()) {
    const isOptional = slot.endsWith('?')
    const isNullable = slot.startsWith('~')
    const kind = slot.replace(/[?~]/g, '')
    const v = args[i]
    if (v === undefined || v === null) {
      if (isOptional || (isNullable && v === null)) continue
      return `args[${i}]`
    }
    if (!matches(kind, v)) return `args[${i}]`
  }
  return null
}

// ── 첨부: id만 믿는다 ────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** 저장소에서 id로 첨부를 찾는다 (없으면 null) — 이름·mime·크기·경로는 저장소 값을 쓴다 */
export type AttachmentLookup = (id: string) => Attachment | null

/**
 * 인자 안의 첨부를 저장소 값으로 바꾼다. 폰이 보낸 path·name·mime·size는 버리고 id만 쓴다.
 * id가 UUID가 아니거나 저장소에 없으면 그 자리("args[2]")를 돌려준다
 */
export function resolveAttachments(args: unknown[], spec: MethodSpec, lookup: AttachmentLookup): { args: unknown[] } | { bad: string } {
  const out = [...args]
  for (const where of spec.attach ?? []) {
    const [indexText, field] = String(where).split('.')
    const index = Number(indexText)
    const holder = field ? out[index] : null
    const list = field ? (isPlainObject(holder) ? holder[field] : undefined) : out[index]
    if (list === undefined || list === null) continue
    if (!Array.isArray(list)) return { bad: `args[${index}]` }
    const resolved: Attachment[] = []
    for (const item of list) {
      const id = isPlainObject(item) ? item.id : undefined
      const found = typeof id === 'string' && UUID.test(id) ? lookup(id) : null
      if (!found) return { bad: `args[${index}]` }
      resolved.push(found)
    }
    if (field) out[index] = { ...(holder as Record<string, unknown>), [field]: resolved }
    else out[index] = resolved
  }
  return { args: out }
}

// ── 응답에서 첨부 경로 빼기 ───────────────────────────────

const isAttachment = (o: Record<string, unknown>) => typeof o.id === 'string' && typeof o.name === 'string' && typeof o.mime === 'string' && typeof o.size === 'number' && 'path' in o

/** 값 전체를 돌며 Attachment 모양의 객체에서 path(PC의 절대 경로)를 뺀다. 매뉴얼 path 같은 다른 path는 그대로 */
export function stripAttachmentPaths<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripAttachmentPaths(v)) as T
  if (!isPlainObject(value)) return value
  const out: Record<string, unknown> = {}
  const drop = isAttachment(value)
  for (const [k, v] of Object.entries(value)) if (!(drop && k === 'path')) out[k] = stripAttachmentPaths(v)
  return out as T
}

// ── 같은 요청 다시 보내기 (Idempotency-Key) ──────────────

type Stored = { hash: string; at: number; response: RemoteResponse | null; isDone: boolean }

/** (토큰, 키)마다 10분 동안 한 번만 처리하고, 두 번째부터는 저장한 응답을 돌려준다 */
export class IdempotencyStore {
  private items = new Map<string, Stored>()

  private sweep(now: number) {
    for (const [k, v] of this.items) if (now - v.at > IDEMPOTENCY_TTL_MS) this.items.delete(k)
    while (this.items.size >= IDEMPOTENCY_KEYS_MAX) this.items.delete(this.items.keys().next().value!)
  }

  /** 새 요청이면 'new'(자리를 잡는다), 처리 중이면 'in_progress', 끝났으면 저장한 응답(못 저장했으면 'duplicate'), 다른 본문이면 'mismatch' */
  begin(key: string, bodyHash: string, now: number): 'new' | 'in_progress' | 'duplicate' | 'mismatch' | RemoteResponse {
    const found = this.items.get(key)
    if (found && now - found.at <= IDEMPOTENCY_TTL_MS) {
      if (found.hash !== bodyHash) return 'mismatch'
      if (!found.isDone) return 'in_progress'
      return found.response ?? 'duplicate'
    }
    this.sweep(now)
    this.items.set(key, { hash: bodyHash, at: now, response: null, isDone: false })
    return 'new'
  }

  finish(key: string, response: RemoteResponse, size: number) {
    const found = this.items.get(key)
    if (found) this.items.set(key, { ...found, isDone: true, response: size <= IDEMPOTENCY_STORE_MAX ? response : null })
  }

  /** 처리 전에 거절된 요청은 자리를 비운다 (같은 키로 다시 보낼 수 있게) */
  cancel(key: string) {
    this.items.delete(key)
  }
}

// ── 오류 응답 ────────────────────────────────────────────

const V2_MESSAGE: Record<string, string> = {
  invalid_request: '요청 내용을 확인해 주세요',
  invalid_args: '요청 내용이 맞지 않아요',
  confirm_required: '이 휴대폰의 연결이 끊어져요. 확인한 뒤 다시 보내 주세요',
  use_upload: '파일은 올리기 경로로 보내 주세요',
  invalid_attachment: '첨부를 다시 올려 주세요',
  unknown_method: '없는 기능이에요. 앱이나 PC를 업데이트해 주세요',
  already_decided: '이미 처리됐어요',
  in_progress: '아직 처리 중이에요',
  duplicate_call: '이미 처리한 요청이에요',
  response_too_large: '결과가 너무 커요. 범위를 좁혀 주세요',
  pc_only: 'PC에서 해 주세요',
  blocked: '그 자리에는 놓을 수 없어요',
  rate_limited: '요청이 너무 잦아요. 잠시 뒤에 다시 시도하세요',
  call_failed: 'PC에서 처리하지 못했어요',
  call_timeout: 'PC에서 오래 걸리고 있어요. 결과는 화면이 새로 고쳐질 때 보여요',
  payload_too_large: '보낼 내용이 너무 커요',
  unsupported_media_type: '지원하지 않는 형식이에요',
  length_required: '파일 크기를 알 수 없어요',
  file_not_found: '파일을 찾을 수 없어요',
  not_found: '없는 기능이에요',
  method_not_allowed: '지원하지 않는 방식이에요',
}

const V2_STATUS: Record<string, number> = {
  invalid_request: 400,
  invalid_args: 400,
  confirm_required: 400,
  use_upload: 400,
  invalid_attachment: 400,
  unknown_method: 404,
  file_not_found: 404,
  not_found: 404,
  method_not_allowed: 405,
  already_decided: 409,
  in_progress: 409,
  duplicate_call: 409,
  length_required: 411,
  payload_too_large: 413,
  response_too_large: 413,
  unsupported_media_type: 415,
  pc_only: 422,
  blocked: 422,
  rate_limited: 429,
  call_failed: 500,
  call_timeout: 504,
}

export function v2Fail(code: keyof typeof V2_STATUS & string, extra: { method?: string; message?: string; alternative?: PcOnlyAlternative; retryAfterSec?: number; allow?: string; reason?: string } = {}): RemoteResponse {
  const headers: Record<string, string> = {}
  if (extra.retryAfterSec !== undefined) headers['Retry-After'] = String(extra.retryAfterSec)
  if (extra.allow) headers.Allow = extra.allow
  const body: Record<string, unknown> = { protocolVersion: V2_PROTOCOL_VERSION, error: code, message: extra.message ?? V2_MESSAGE[code] ?? '' }
  if (extra.method) body.method = extra.method
  if (extra.alternative) body.alternative = extra.alternative
  if (extra.reason) body.reason = extra.reason
  if (extra.retryAfterSec !== undefined) body.retryAfterSec = extra.retryAfterSec
  return { status: V2_STATUS[code] ?? 500, headers, body }
}

/** PC 화면이 보이던 오류 문장을 첫 줄만, 경로·토큰처럼 보이는 낱말은 가려서 (스택·절대 경로는 보내지 않는다) */
export function safeErrorMessage(e: unknown) {
  const first = String(e instanceof Error ? e.message : e).split('\n')[0]
  return first
    .replace(/(?:[A-Za-z]:)?[\\/][^\s'"]*/g, '…')
    .replace(/[A-Za-z0-9_-]{32,}/g, '…')
    .slice(0, MESSAGE_MAX)
}

// ── 처리 ────────────────────────────────────────────────

export interface V2CallDeps {
  /** PC 화면과 같은 처리 함수 표 (officeHandlers) */
  call(method: OfficeMethod, args: unknown[]): unknown
  attachment: AttachmentLookup
  /** 매뉴얼 경로 검사용: 지금 있는 매뉴얼의 path 목록 */
  manualPaths(): Promise<string[]>
  /** 원격 설정: 지금 포트 (포트를 바꾸는 setRemoteEnabled인지 판단) */
  currentPort(): number
  now: number
  timeoutMs?: number
}

export interface V2CallResult {
  response: RemoteResponse
  /** 응답을 보낸 뒤에 할 일 (연결이 끊기는 설정 변경은 응답이 폰에 닿은 다음에) */
  after?: () => unknown
}

const ok = (result: unknown, now: number): RemoteResponse => ({ status: 200, headers: {}, body: { protocolVersion: V2_PROTOCOL_VERSION, serverTime: now, ok: true, result: result === undefined ? null : result } })

/** 포트를 바꾸기 전 알릴 말 (PC 화면의 확인 창과 같은 내용) — 바꾼 포트는 저장되어 앱을 다시 켜도 그대로다 */
export const PORT_CHANGE_NOTICE = '포트를 바꾸면 연결된 휴대폰이 끊기고, 새 QR을 다시 찍어야 해요. 바꾼 포트는 앱을 다시 켜도 그대로예요. 공유기에서 직접 포트포워딩했다면 공유기 설정도 바꿔야 해요.'

const isPortChange = (method: OfficeMethod, args: unknown[], currentPort: number) => {
  const [isEnabled, port] = args as [boolean, number | undefined | null]
  return method === 'setRemoteEnabled' && isEnabled && port !== undefined && port !== null && port !== currentPort
}

/** 연결이 끊기는 호출인지 (규격 4-4절): QR 다시 만들기는 항상, 원격 설정은 끄기·포트 바꾸기만 */
function needsConfirm(method: OfficeMethod, args: unknown[], currentPort: number) {
  if (method === 'regenerateRemoteQr') return true
  if (method !== 'setRemoteEnabled') return false
  const [isEnabled, port] = args as [boolean, number | undefined | null]
  return !isEnabled || (port !== undefined && port !== null && port !== currentPort)
}

/** /v2/call 본문을 검사하고 메서드를 부른다 (인증·잠금·속도 제한은 앞에서 끝났다) */
export async function handleV2Call(body: unknown, deps: V2CallDeps): Promise<V2CallResult> {
  if (!isPlainObject(body) || typeof body.method !== 'string') return { response: v2Fail('invalid_request') }
  const method = body.method
  if (!Object.hasOwn(V2_METHODS, method)) return { response: v2Fail('unknown_method') }
  const name = method as OfficeMethod
  const spec = V2_METHODS[name]
  const rawArgs = body.args === undefined ? [] : body.args
  if (!Array.isArray(rawArgs)) return { response: v2Fail('invalid_args', { method, message: 'args는 배열이어야 해요' }) }
  if (body.confirm !== undefined && typeof body.confirm !== 'boolean') return { response: v2Fail('invalid_request', { method }) }

  if (spec.cls === 'P') return { response: v2Fail('pc_only', { method, alternative: spec.alternative, message: '휴대폰에서는 할 수 없어요. PC에서 해 주세요' }) }
  if (spec.cls === 'U') return { response: v2Fail('use_upload', { method }) }
  const bad = checkArgs(spec.args, rawArgs)
  if (bad) return { response: v2Fail('invalid_args', { method, message: `${bad}의 값이 맞지 않아요` }) }
  // 객체 인자는 메서드별 허용 필드만 (첨부는 그다음 id로 저장소 값으로 바꾼다)
  const resolved = resolveAttachments(pickFields(name, rawArgs), spec, deps.attachment)
  if ('bad' in resolved) return { response: v2Fail('invalid_attachment', { method, message: `${resolved.bad}의 첨부를 다시 올려 주세요` }) }
  const args = resolved.args

  // 매뉴얼은 지금 있는 매뉴얼의 경로만 (폰이 아무 파일 경로나 지우거나 덮어쓰지 못하게)
  if (name === 'deleteManual' || (name === 'saveManual' && typeof args[1] === 'string')) {
    const target = name === 'deleteManual' ? args[0] : args[1]
    if (!(await deps.manualPaths()).includes(target as string)) return { response: v2Fail('invalid_args', { method, message: `args[${name === 'deleteManual' ? 0 : 1}]의 매뉴얼을 찾을 수 없어요` }) }
  }

  if (spec.cls === 'C' && needsConfirm(name, args, deps.currentPort())) {
    if (body.confirm !== true) return { response: v2Fail('confirm_required', { method, ...(isPortChange(name, args, deps.currentPort()) ? { message: PORT_CHANGE_NOTICE } : {}) }) }
    // 응답을 먼저 보낸 뒤 바꾼다 (이 폰에 응답이 닿도록). 결과는 지금 상태
    const status = await deps.call('remoteStatus', [])
    return { response: ok(stripAttachmentPaths(status), deps.now), after: () => deps.call(name, args) }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), deps.timeoutMs ?? V2_CALL_TIMEOUT_MS)
    timer.unref?.()
  })
  try {
    const result = await Promise.race([Promise.resolve(deps.call(name, args)), timeout])
    if (result === 'timeout') return { response: v2Fail('call_timeout', { method }) }
    if (DECISION_METHODS.has(name) && result === false) return { response: v2Fail('already_decided', { method }) }
    // decide·answerQuestion·reviewPlan은 Office가 처리 여부(boolean)를 돌려준다 — PC 화면처럼 결과는 비운다
    const out = DECISION_METHODS.has(name) ? null : stripAttachmentPaths(result)
    return { response: ok(out, deps.now) }
  } catch (e) {
    // 처리 함수가 "입력이 잘못됐다"(InvalidArgsError)를 던지면 500이 아니라 400 invalid_args로 (예: setAutoApprove 잘못된 기간)
    if (isInvalidArgs(e)) return { response: v2Fail('invalid_args', { method, message: safeErrorMessage(e) || V2_MESSAGE.invalid_args }) }
    // 칸 배치를 놓기 검사가 막으면 422 blocked + 이유 (out_of_bounds·fixed_tile·overlap·not_owned·level_locked·blocks_path, 예전 placeItem은 no_space)
    if (isBlocked(e)) return { response: v2Fail('blocked', { method, reason: e.reason, message: safeErrorMessage(e) || V2_MESSAGE.blocked }) }
    return { response: v2Fail('call_failed', { method, message: safeErrorMessage(e) || V2_MESSAGE.call_failed }) }
  } finally {
    clearTimeout(timer)
  }
}

/** 응답을 보낼 JSON 문자열 (16MB를 넘으면 response_too_large로 바꾼다) */
export function encodeV2Response(r: RemoteResponse, method?: string): { response: RemoteResponse; text: string } {
  const text = JSON.stringify(r.body)
  if (Buffer.byteLength(text) <= V2_RESPONSE_MAX) return { response: r, text }
  const big = v2Fail('response_too_large', method ? { method } : {})
  return { response: big, text: JSON.stringify(big.body) }
}
