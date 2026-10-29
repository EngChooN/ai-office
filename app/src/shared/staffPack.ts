import { READ_ONLY_BASH, RISKY_BASH } from './bashPolicy.ts'
import { AVATAR_LIMIT, canonicalAvatar } from './look.ts'
import { ROLE_PRESETS, type AiProvider, type ApprovalMode, type Equipment, type ModelChoice } from './types.ts'
import { t } from './i18n/index.ts'
import type { TKey } from './i18n/dict/index.ts'

// 직원·랩 묶음 파일 (내보내기/가져오기, 기본 직원 마켓). 순수 함수만 둔다 — 파일 입출력·채용은 main/staffPack*.ts
// 파일에는 작업 폴더·참고 문서 같은 이 컴퓨터의 경로를 넣지 않고, 가져올 때 경로 필드가 있으면 통째로 거절한다
// 결재 설정(허용 도구·결재 방식)은 파일로 옮기지 않는다 — 남이 만든 파일로 결재를 건너뛰지 못하게 가져올 때 늘 안전한 값으로 맞춘다

export const PACK_FORMAT = 'claude-office-pack'
export const PACK_VERSION = 1
export const PACK_MAX_BYTES = 1024 * 1024

export const PACK_LIMITS = {
  staff: 50,
  nameMax: 40,
  descMax: 300,
  promptMax: 8000,
  manualsPerStaff: 20,
  manualBodyMax: 20000,
  listItems: 100,
  listItemMax: 200,
  budgetMax: 100000,
} as const

const MODELS: readonly ModelChoice[] = ['default', 'opus', 'sonnet', 'haiku']
const GPT_MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/
const ROLES: ReadonlySet<string> = new Set(ROLE_PRESETS)
// 매뉴얼 이름 규칙은 main/manuals.ts의 NAME_RE와 같다 (main 쪽은 파일을 쓰므로 여기서 따로 둔다)
const MANUAL_NAME_RE = /^[a-z0-9][a-z0-9-]{1,62}$/
const COLOR_RE = /^#[0-9a-fA-F]{6}$/
// 경로를 뜻하는 키 — 하나라도 있으면 파일 전체를 거절한다
const PATH_KEYS: ReadonlySet<string> = new Set(['cwd', 'owncwd', 'refdocs', 'path', 'projectdir', 'dir', 'folder', 'workdir', 'filepath'])

export interface PackManual {
  name: string
  description: string
  body: string
}

export interface PackEquipment {
  mcpServers: string[]
  /** 'all'이면 그 컴퓨터에서 쓸 수 있는 스킬 전부 */
  skills: string[] | 'all'
  allowedTools: string[]
  disallowedTools: string[]
  monthlyBudgetUsd: number
  lightModelOff?: boolean
}

export interface PackStaff {
  name: string
  role: string
  avatar: number
  /** 엔진 — 예전 파일에는 없고, 없으면 claude */
  provider: AiProvider
  model: ModelChoice
  /** 가져온 직원은 늘 결재를 받는다 */
  approvalMode: 'ask'
  systemPrompt: string
  equipment: PackEquipment
  manuals: PackManual[]
}

/** 내보내는 파일의 직원 — 결재 방식과 허용 도구는 넣지 않는다 */
type PackStaffOut = Omit<PackStaff, 'approvalMode' | 'equipment'> & { equipment: Omit<PackEquipment, 'allowedTools'> }

export interface PackLab {
  name: string
  color: string
  goal: string
  /** staff 배열 안의 번호 (리드가 없으면 null). 파일의 직원은 모두 이 랩 소속이다 */
  leader: number | null
}

export interface PackFile {
  format: typeof PACK_FORMAT
  version: typeof PACK_VERSION
  staff: PackStaff[]
  lab?: PackLab
}

/** 사용자에게 보일 이유. 문구는 i18n 키로 돌려 주고 화면 쪽에서 t()로 바꾼다 */
export interface PackReason {
  key: string
  vars?: Record<string, string | number>
}

/** 화면이 받는 결과 문구는 이미 이 언어로 번역돼 있다 */
export interface PackResult {
  ok: boolean
  message: string
  staffIds: string[]
}

export interface PackMarketItem {
  id: string
  name: string
  role: string
  desc: string
}

/** PC 앱 전용 채널(pack:*) — 원격 v2 목록과 무관하다. 취소하면 null */
/** 파일이 필요한 것만 (PC 전용 — 모바일 빌드에는 없다). 마켓 채용은 파일이 없어 OfficeApi.hireMarket으로 */
export interface OfficePackApi {
  importFile(): Promise<PackResult | null>
  exportStaff(ids: string[]): Promise<PackResult | null>
  exportLab(labId: string): Promise<PackResult | null>
}

/** 이 컴퓨터에 있는 장비 이름. 없는 이름은 가져올 때 빼고 알려 준다 */
export interface PackKnown {
  mcpServers: ReadonlySet<string>
  skills: ReadonlySet<string>
}

export type PackCheck = { ok: true; pack: PackFile; excluded: string[] } | { ok: false; reason: PackReason }

class PackFail extends Error {
  readonly key: string
  readonly vars?: Record<string, string | number>

  constructor(key: string, vars?: Record<string, string | number>) {
    super(key)
    this.key = key
    this.vars = vars
  }
}

const fail = (key: string, vars?: Record<string, string | number>): never => {
  throw new PackFail(key, vars)
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 글자 필드: 문자열이고 다듬은 뒤 길이가 범위 안이어야 한다 */
function text(v: unknown, key: string, max: number, min = 0): string {
  if (typeof v !== 'string') return fail(key)
  const s = v.trim()
  if (s.length < min || s.length > max) return fail(key)
  return s
}

/** 글자 목록: 없으면 빈 목록, 개수·길이 상한, 같은 값은 한 번만 */
function list(v: unknown, key: string): string[] {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > PACK_LIMITS.listItems) return fail(key)
  const out = new Set<string>()
  for (const item of v) out.add(text(item, key, PACK_LIMITS.listItemMax, 1))
  return [...out]
}

function assertNoPaths(v: unknown, depth = 0): void {
  if (depth > 12) return fail('pack.err.shape')
  if (Array.isArray(v)) {
    for (const x of v) assertNoPaths(x, depth + 1)
  } else if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) {
      if (PATH_KEYS.has(k.toLowerCase())) fail('pack.err.path')
      assertNoPaths(x, depth + 1)
    }
  }
}

function readManual(raw: unknown): PackManual {
  if (!isObj(raw)) return fail('pack.err.shape')
  if (typeof raw.name !== 'string' || !MANUAL_NAME_RE.test(raw.name)) return fail('pack.err.manualName')
  return {
    name: raw.name,
    description: raw.description === undefined ? '' : text(raw.description, 'pack.err.shape', PACK_LIMITS.descMax),
    body: text(raw.body, 'pack.err.manualBody', PACK_LIMITS.manualBodyMax, 1),
  }
}

/** 가져온 장비의 결재 관련 값을 안전하게 맞춘다: 허용 도구는 "읽기 명령 자율"만 남기고, "위험 명령 금지"는 늘 켠다 */
export function importSafeEquipment<T extends Pick<PackEquipment, 'allowedTools' | 'disallowedTools'>>(eq: T): T {
  return {
    ...eq,
    allowedTools: eq.allowedTools.includes(READ_ONLY_BASH) ? [READ_ONLY_BASH] : [],
    disallowedTools: eq.disallowedTools.includes(RISKY_BASH) ? [...eq.disallowedTools] : [...eq.disallowedTools, RISKY_BASH],
  }
}

/** 원격(휴대폰)이 바꾼 장비 값: 허용 도구는 "읽기 명령 자율"만 남기고 그 밖의 Bash는 걸러 내며, 이미 켜 둔 "위험 명령 금지"는 원격에서 못 뺀다 */
export function remoteSafeEquipment<E extends { allowedTools: string[]; disallowedTools: string[] }>(current: E, incoming: Partial<E>): E {
  const isBash = (t: string) => /^bash(\(|$)/i.test(t.trim())
  const wanted = incoming.allowedTools ?? current.allowedTools
  const allowed = wanted.filter((t) => !isBash(t))
  const disallowed = incoming.disallowedTools ?? current.disallowedTools
  return {
    ...current,
    ...incoming,
    allowedTools: allowed,
    disallowedTools: current.disallowedTools.includes(RISKY_BASH) && !disallowed.includes(RISKY_BASH) ? [...disallowed, RISKY_BASH] : [...disallowed],
  }
}

function readEquipment(raw: unknown): PackEquipment {
  if (raw === undefined) return importSafeEquipment({ mcpServers: [], skills: [], allowedTools: [], disallowedTools: [], monthlyBudgetUsd: 0 })
  if (!isObj(raw)) return fail('pack.err.equipment')
  const { mcpServers, skills, allowedTools, disallowedTools, monthlyBudgetUsd, lightModelOff } = raw
  let budget = 0
  if (monthlyBudgetUsd !== undefined) {
    if (typeof monthlyBudgetUsd !== 'number' || !Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd < 0 || monthlyBudgetUsd > PACK_LIMITS.budgetMax) return fail('pack.err.budget')
    budget = monthlyBudgetUsd
  }
  if (lightModelOff !== undefined && typeof lightModelOff !== 'boolean') return fail('pack.err.equipment')
  const out: PackEquipment = {
    mcpServers: list(mcpServers, 'pack.err.equipment'),
    skills: skills === 'all' ? 'all' : list(skills, 'pack.err.equipment'),
    allowedTools: list(allowedTools, 'pack.err.equipment'),
    disallowedTools: list(disallowedTools, 'pack.err.equipment'),
    monthlyBudgetUsd: budget,
  }
  if (lightModelOff !== undefined) out.lightModelOff = lightModelOff
  return importSafeEquipment(out)
}

function readStaff(raw: unknown): PackStaff {
  if (!isObj(raw)) return fail('pack.err.shape')
  if (typeof raw.role !== 'string' || !ROLES.has(raw.role.trim())) return fail('pack.err.role', { role: String(raw.role ?? '').slice(0, 30) })
  if (raw.provider !== undefined && raw.provider !== 'claude' && raw.provider !== 'codex') return fail('pack.err.model', { model: String(raw.provider).slice(0, 30) })
  const provider: AiProvider = raw.provider === 'codex' ? 'codex' : 'claude'
  // Claude는 별칭만, GPT는 모델 이름 모양만 본다 (실제로 쓸 수 있는지는 엔진이 정한다)
  const modelOk = typeof raw.model === 'string' && (provider === 'codex' ? raw.model === 'default' || GPT_MODEL_RE.test(raw.model) : MODELS.includes(raw.model as ModelChoice))
  if (!modelOk) return fail('pack.err.model', { model: String(raw.model ?? '').slice(0, 30) })
  if (typeof raw.avatar !== 'number' || !Number.isInteger(raw.avatar) || raw.avatar < 0 || raw.avatar >= AVATAR_LIMIT) return fail('pack.err.avatar')
  if (raw.manuals !== undefined && (!Array.isArray(raw.manuals) || raw.manuals.length > PACK_LIMITS.manualsPerStaff)) return fail('pack.err.manualCount')
  return {
    name: text(raw.name, 'pack.err.staffName', PACK_LIMITS.nameMax, 1),
    role: raw.role.trim(),
    avatar: raw.avatar,
    provider,
    model: raw.model as ModelChoice,
    // 파일에 적힌 결재 방식은 따르지 않는다
    approvalMode: 'ask',
    systemPrompt: raw.systemPrompt === undefined ? '' : text(raw.systemPrompt, 'pack.err.prompt', PACK_LIMITS.promptMax),
    equipment: readEquipment(raw.equipment),
    manuals: ((raw.manuals as unknown[] | undefined) ?? []).map(readManual),
  }
}

function readLab(raw: unknown, staffCount: number): PackLab {
  if (!isObj(raw)) return fail('pack.err.lab')
  const color = typeof raw.color === 'string' && COLOR_RE.test(raw.color) ? raw.color : fail('pack.err.lab')
  if (raw.leader !== null && (typeof raw.leader !== 'number' || !Number.isInteger(raw.leader) || raw.leader < 0 || raw.leader >= staffCount)) return fail('pack.err.leader')
  return {
    name: text(raw.name, 'pack.err.lab', PACK_LIMITS.nameMax, 1),
    color,
    goal: raw.goal === undefined ? '' : text(raw.goal, 'pack.err.lab', PACK_LIMITS.descMax),
    leader: raw.leader,
  }
}

function readPack(raw: unknown, known: PackKnown): Omit<Extract<PackCheck, { ok: true }>, 'ok'> {
  assertNoPaths(raw)
  if (!isObj(raw)) return fail('pack.err.shape')
  if (raw.format !== PACK_FORMAT) return fail('pack.err.format')
  if (raw.version !== PACK_VERSION) return fail('pack.err.version')
  if (!Array.isArray(raw.staff) || raw.staff.length < 1 || raw.staff.length > PACK_LIMITS.staff) return fail('pack.err.staffCount')

  const staff = raw.staff.map(readStaff)

  // 같은 이름의 매뉴얼은 한 파일 안에서 내용이 같아야 한다
  const manualByName = new Map<string, PackManual>()
  for (const s of staff) {
    for (const m of s.manuals) {
      const prev = manualByName.get(m.name)
      if (prev && prev.body !== m.body) return fail('pack.err.manualConflict', { name: m.name })
      manualByName.set(m.name, m)
    }
  }

  // 장비: 이 컴퓨터에 없는 MCP 서버·스킬은 뺀다 (파일의 매뉴얼은 같이 만들어지므로 스킬로 인정)
  const excluded = new Set<string>()
  const keep = (names: string[], isKnown: (name: string) => boolean) => names.filter((name) => {
    if (isKnown(name)) return true
    excluded.add(name)
    return false
  })
  for (const s of staff) {
    const eq = s.equipment
    eq.mcpServers = keep(eq.mcpServers, (name) => known.mcpServers.has(name))
    if (eq.skills !== 'all') eq.skills = keep(eq.skills, (name) => known.skills.has(name) || manualByName.has(name))
  }

  const lab = raw.lab === undefined ? undefined : readLab(raw.lab, staff.length)
  return { pack: { format: PACK_FORMAT, version: PACK_VERSION, staff, ...(lab ? { lab } : {}) }, excluded: [...excluded] }
}

/** 파일 글(JSON 문자열)을 검증한다. 크기 → 파싱 → 구조·값·경로 순서. 실패하면 이유만 돌려주고 아무것도 만들지 않는다 */
export function validatePackText(content: string, known: PackKnown): PackCheck {
  if (new TextEncoder().encode(content).length > PACK_MAX_BYTES) return { ok: false, reason: { key: 'pack.err.size' } }
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    return { ok: false, reason: { key: 'pack.err.parse' } }
  }
  return validatePackObject(raw, known)
}

/** 이미 읽은 값을 검증한다 (마켓 항목도 이 길을 탄다) */
export function validatePackObject(raw: unknown, known: PackKnown): PackCheck {
  try {
    return { ok: true, ...readPack(raw, known) }
  } catch (e) {
    if (e instanceof PackFail) return { ok: false, reason: { key: e.key, vars: e.vars } }
    throw e
  }
}

export interface PackExportStaff {
  name: string
  role: string
  avatar: number
  provider?: AiProvider
  model: ModelChoice
  approvalMode: ApprovalMode
  systemPrompt: string
  equipment: Equipment
  manuals: PackManual[]
}

/** 내보낼 파일 글을 만든다. 경로 필드는 넣지 않고, 1MB를 넘으면 이유를 돌려준다 */
export function buildPackText(staff: PackExportStaff[], lab?: PackLab): { ok: true; text: string } | { ok: false; reason: PackReason } {
  const file: Omit<PackFile, 'staff'> & { staff: PackStaffOut[] } = {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    staff: staff.map((s) => ({
      name: s.name,
      role: s.role,
      avatar: canonicalAvatar(s.avatar),
      provider: s.provider ?? 'claude',
      model: s.model,
      systemPrompt: s.systemPrompt,
      equipment: {
        mcpServers: [...s.equipment.mcpServers],
        skills: s.equipment.skills === 'all' ? 'all' : [...s.equipment.skills],
        disallowedTools: [...s.equipment.disallowedTools],
        monthlyBudgetUsd: s.equipment.monthlyBudgetUsd,
        ...(s.equipment.lightModelOff ? { lightModelOff: true } : {}),
      },
      manuals: s.manuals.map((m) => ({ name: m.name, description: m.description, body: m.body })),
    })),
    ...(lab ? { lab } : {}),
  }
  const content = JSON.stringify(file, null, 2)
  if (new TextEncoder().encode(content).length > PACK_MAX_BYTES) return { ok: false, reason: { key: 'pack.err.exportTooBig' } }
  // 내보낸 파일이 다시 검증을 통과하는지 확인 (장비 이름은 파일 안의 것으로 맞춘다)
  const names = new Set(file.staff.flatMap((s) => [...s.equipment.mcpServers, ...(s.equipment.skills === 'all' ? [] : s.equipment.skills)]))
  const check = validatePackObject(file, { mcpServers: names, skills: names })
  if (!check.ok) return { ok: false, reason: check.reason }
  return { ok: true, text: content }
}

/** 기본 제공 직원 마켓 항목. 이름·설명은 i18n 키(`pack.market.<id>.name|desc`)로 화면에 보인다 */
export interface MarketTemplate {
  id: string
  role: string
  model: ModelChoice
  approvalMode: ApprovalMode
  systemPrompt: string
}

export const STAFF_MARKET: readonly MarketTemplate[] = [
  {
    id: 'planner',
    role: '기획자',
    model: 'default',
    approvalMode: 'ask',
    systemPrompt: '당신은 기획자입니다. 요청을 받으면 목표, 사용자, 범위, 완료 기준을 먼저 정리하고 빠진 정보는 질문으로 확인합니다. 보고는 짧은 항목으로 합니다.',
  },
  {
    id: 'frontend',
    role: '프론트엔드 개발자',
    model: 'default',
    approvalMode: 'ask',
    systemPrompt: '당신은 화면과 사용자 경험을 맡은 프론트엔드 개발자입니다. 기존 코드 스타일을 따르고, 바꾼 파일과 확인 방법을 함께 보고합니다.',
  },
  {
    id: 'backend',
    role: '백엔드 개발자',
    model: 'default',
    approvalMode: 'ask',
    systemPrompt: '당신은 서버와 데이터 처리를 맡은 백엔드 개발자입니다. 데이터가 사라질 수 있는 변경은 먼저 알리고, 바꾼 범위를 보고합니다.',
  },
  {
    id: 'reviewer',
    role: '코드 리뷰어',
    model: 'default',
    approvalMode: 'ask',
    systemPrompt: '당신은 코드 리뷰어입니다. 변경된 코드에서 버그, 빠진 예외 처리, 테스트 빈틈을 찾고 심각도 순으로 적습니다. 코드는 직접 고치지 않습니다.',
  },
  {
    id: 'qa',
    role: 'QA',
    model: 'default',
    approvalMode: 'ask',
    systemPrompt: '당신은 QA 담당입니다. 기능이 요구대로 동작하는지 시나리오를 만들어 확인하고, 재현 순서·기대 결과·실제 결과를 나눠 보고합니다.',
  },
  {
    id: 'researcher',
    role: '리서처',
    model: 'default',
    approvalMode: 'ask',
    systemPrompt: '당신은 리서처입니다. 자료를 찾아 읽고 요약합니다. 출처를 함께 적고, 확실하지 않은 내용은 확인 필요로 표시합니다.',
  },
]

/** 마켓 목록 (지금 언어의 이름·설명) — 순수 데이터라 PC를 거치지 않고 화면에서 바로 만든다 */
export function marketItems(): PackMarketItem[] {
  return STAFF_MARKET.map((m) => ({ id: m.id, name: t(`pack.market.${m.id}.name` as TKey), role: m.role, desc: t(`pack.market.${m.id}.desc` as TKey) }))
}
