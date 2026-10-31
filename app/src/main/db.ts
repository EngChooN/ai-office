import { DatabaseSync } from 'node:sqlite'
import type { AutoApproveConfig } from '../shared/autoApprove'
import type { ApprovalRule } from '../shared/approvalRules'
import type { KnowledgeEntry } from '../shared/knowledge'
import type { GalleryEntry, Praise } from '../shared/gallery'
import type { UnreadReports } from '../shared/unreadReports'
import type { I18nArg } from '../shared/i18n/index.ts'
import { app } from 'electron'
import path from 'node:path'
import {
  DEFAULT_EQUIPMENT,
  type Attachment,
  type SecretaryCard,
  type SecretaryMessage,
  type AutoApproveState,
  type AutoHandled,
  withSettingsDefaults,
  type Equipment,
  type Lab,
  type ProcessRun,
  type ChatApproval,
  type ChatMessage,
  type HireInput,
  type LogEntry,
  type LogType,
  type Meeting,
  type ModelChoice,
  type PlanUsage,
  type Schedule,
  type Settings,
  type Staff,
  type Task,
  type Team,
} from '../shared/types'
import { EMPTY_SHOP, type LedgerEntry, type LedgerKind, type ShopState } from '../shared/economy'
import type { RemoteConfig } from './remote/service.ts'
import { settleGrid } from './shopGrid.ts'
import { createWorkBaseStore } from './workBaseStore.ts'
import { grantedLevels, grantedZones, runIsoMigration, runLevelGrants } from './isoMigrate.ts'

// 사무실의 모든 영속 데이터는 사용자 데이터 폴더의 office.db 한 파일에 둔다
let db: DatabaseSync
let workBaseStore: ReturnType<typeof createWorkBaseStore>

export function openDb() {
  db = new DatabaseSync(path.join(app.getPath('userData'), 'office.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, avatar INTEGER NOT NULL,
      model TEXT NOT NULL, cwd TEXT NOT NULL, system_prompt TEXT NOT NULL, approval_mode TEXT NOT NULL,
      session_id TEXT, desk_index INTEGER NOT NULL, hired_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT NOT NULL, ts INTEGER NOT NULL, type TEXT NOT NULL, text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS log_staff_ts ON log (staff_id, ts);
    CREATE INDEX IF NOT EXISTS log_ts ON log (ts);
    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT NOT NULL, ts INTEGER NOT NULL,
      cost_usd REAL NOT NULL, tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS saving (
      id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT NOT NULL, ts INTEGER NOT NULL, tokens INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS team (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, lead_id TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, status TEXT NOT NULL,
      assignee_id TEXT, team_id TEXT, result TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meeting (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS schedule (
      id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, label TEXT NOT NULL, time TEXT NOT NULL, weekdays TEXT NOT NULL,
      instruction TEXT NOT NULL, enabled INTEGER NOT NULL, last_run_date TEXT
    );
    CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS translation (key TEXT PRIMARY KEY, text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS lab (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS knowledge (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS gallery (id TEXT PRIMARY KEY, data TEXT NOT NULL, finished_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS run (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS secretary_message (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, card TEXT, target TEXT, tokens INTEGER, is_error INTEGER
    );
    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, amount INTEGER NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL, key TEXT UNIQUE
    );
  `)
  workBaseStore = createWorkBaseStore(db)
  const staffCols = (db.prepare('PRAGMA table_info(staff)').all() as { name: string }[]).map((c) => c.name)
  const logCols = (db.prepare('PRAGMA table_info(log)').all() as { name: string }[]).map((c) => c.name)
  if (!logCols.includes('text_i18n')) db.exec('ALTER TABLE log ADD COLUMN text_i18n TEXT')
  if (!staffCols.includes('team_id')) db.exec('ALTER TABLE staff ADD COLUMN team_id TEXT')
  if (!staffCols.includes('equipment')) db.exec('ALTER TABLE staff ADD COLUMN equipment TEXT')
  // 참고 문서(JSON 배열). 랩은 data JSON 안에 함께 저장된다
  if (!staffCols.includes('ref_docs')) db.exec('ALTER TABLE staff ADD COLUMN ref_docs TEXT')
  // 튜토리얼 연습 회사 표시 (1 = 연습 — 정리할 때 이 표시로 지운다). 직원·팀·카드는 열, 랩·회의는 data JSON 안에
  if (!staffCols.includes('is_practice')) db.exec('ALTER TABLE staff ADD COLUMN is_practice INTEGER')
  // 모델 공급자 ('claude' | 'codex'). 기존 행은 자동으로 'claude'
  if (!staffCols.includes('provider')) db.exec("ALTER TABLE staff ADD COLUMN provider TEXT NOT NULL DEFAULT 'claude'")
  const taskCols = (db.prepare('PRAGMA table_info(task)').all() as { name: string }[]).map((c) => c.name)
  if (!taskCols.includes('lab_id')) db.exec('ALTER TABLE task ADD COLUMN lab_id TEXT')
  if (!taskCols.includes('parent_id')) db.exec('ALTER TABLE task ADD COLUMN parent_id TEXT')
  if (!taskCols.includes('plan')) db.exec('ALTER TABLE task ADD COLUMN plan TEXT')
  if (!taskCols.includes('meeting_id')) db.exec('ALTER TABLE task ADD COLUMN meeting_id TEXT')
  // 카드별 토큰·비용 (JSON)
  if (!taskCols.includes('usage')) db.exec('ALTER TABLE task ADD COLUMN usage TEXT')
  if (!taskCols.includes('is_practice')) db.exec('ALTER TABLE task ADD COLUMN is_practice INTEGER')
  if (!taskCols.includes('is_autonomous')) db.exec('ALTER TABLE task ADD COLUMN is_autonomous INTEGER')
  if (!taskCols.includes('artifacts')) db.exec('ALTER TABLE task ADD COLUMN artifacts TEXT')
  // 첨부(JSON 배열)는 로그·단체방·업무 카드에 붙는다
  const teamCols = (db.prepare('PRAGMA table_info(team)').all() as { name: string }[]).map((c) => c.name)
  if (!teamCols.includes('manuals')) db.exec('ALTER TABLE team ADD COLUMN manuals TEXT')
  if (!teamCols.includes('ref_docs')) db.exec('ALTER TABLE team ADD COLUMN ref_docs TEXT')
  // 팀 자리가 있는 층 (NULL = 1층)
  if (!teamCols.includes('floor')) db.exec('ALTER TABLE team ADD COLUMN floor INTEGER')
  if (!teamCols.includes('is_practice')) db.exec('ALTER TABLE team ADD COLUMN is_practice INTEGER')
  for (const table of ['log', 'chat', 'task']) {
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
    if (!cols.includes('attachments')) db.exec(`ALTER TABLE ${table} ADD COLUMN attachments TEXT`)
  }
  // 단체방 결재·질문 메시지 ↔ 결재 id·처리 결과 (JSON)
  const chatCols = (db.prepare('PRAGMA table_info(chat)').all() as { name: string }[]).map((c) => c.name)
  if (!chatCols.includes('approval')) db.exec('ALTER TABLE chat ADD COLUMN approval TEXT')
  // 대화방 (팀 id 또는 'lab:<랩 id>'). NULL·빈 값 = 전체 방 — 기존 메시지는 그대로 전체 방
  if (!chatCols.includes('room')) db.exec('ALTER TABLE chat ADD COLUMN room TEXT')
  // 직원이 대표에게 올린 업무 보고 (1) — 바탕화면 비서가 완료 카드로 보여 준다. 기존 메시지는 보고 여부를 모른다(NULL)
  if (!chatCols.includes('is_report')) db.exec('ALTER TABLE chat ADD COLUMN is_report INTEGER')
}

const run = (sql: string, ...params: (string | number | null)[]) => db.prepare(sql).run(...params)
const all = <T>(sql: string, ...params: (string | number | null)[]) => db.prepare(sql).all(...params) as unknown as T[]
const get = <T>(sql: string, ...params: (string | number | null)[]) => db.prepare(sql).get(...params) as unknown as T | undefined
/** JSON 배열 열 (NULL이면 빈 목록) */
const parseList = (raw: string | null): string[] => (raw ? (JSON.parse(raw) as string[]) : [])

// ── 직원 ────────────────────────────────────────────────

interface StaffRow {
  id: string
  name: string
  role: string
  avatar: number
  model: string
  cwd: string
  system_prompt: string
  approval_mode: string
  session_id: string | null
  desk_index: number
  hired_at: number
  team_id: string | null
  equipment: string | null
  ref_docs: string | null
  is_practice: number | null
  provider: string | null
}

export type StoredStaff = Omit<Staff, 'stats' | 'meetingId' | 'labIds' | 'statusSince' | 'todayDone'>

export function loadHiredStaff(): StoredStaff[] {
  return all<StaffRow>('SELECT * FROM staff ORDER BY hired_at').map((r) => {
    const total = usageSince(r.id, 0)
    return {
      id: r.id,
      kind: 'hired',
      name: r.name,
      role: r.role,
      avatar: r.avatar,
      provider: r.provider === 'codex' ? 'codex' : 'claude',
      model: r.model as Staff['model'],
      cwd: r.cwd,
      ownCwd: r.cwd,
      systemPrompt: r.system_prompt,
      approvalMode: r.approval_mode as Staff['approvalMode'],
      sessionId: r.session_id,
      teamId: r.team_id,
      equipment: r.equipment ? { ...DEFAULT_EQUIPMENT, ...(JSON.parse(r.equipment) as Partial<Equipment>) } : DEFAULT_EQUIPMENT,
      refDocs: parseList(r.ref_docs),
      pid: null,
      status: 'idle',
      activity: '',
      approvals: [],
      costUsd: total.costUsd,
      tokensIn: total.tokensIn,
      tokensOut: total.tokensOut,
      deskIndex: r.desk_index,
      hiredAt: r.hired_at,
      ...(r.is_practice ? { isPractice: true } : {}),
    }
  })
}

export function insertStaff(id: string, input: HireInput, deskIndex: number, hiredAt: number, isPractice = false) {
  run(
    `INSERT INTO staff (id, name, role, avatar, model, cwd, system_prompt, approval_mode, session_id, desk_index, hired_at, team_id, is_practice, provider)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    id, input.name, input.role, input.avatar, input.model, input.cwd, input.systemPrompt, input.approvalMode, deskIndex, hiredAt, input.teamId, isPractice ? 1 : null, input.provider ?? 'claude',
  )
}

export function updateStaffRow(id: string, patch: { teamId?: string | null; name?: string; role?: string; model?: ModelChoice; avatar?: number; systemPrompt?: string; cwd?: string }) {
  if (patch.teamId !== undefined) run('UPDATE staff SET team_id = ? WHERE id = ?', patch.teamId, id)
  if (patch.name !== undefined) run('UPDATE staff SET name = ? WHERE id = ?', patch.name, id)
  if (patch.role !== undefined) run('UPDATE staff SET role = ? WHERE id = ?', patch.role, id)
  if (patch.model !== undefined) run('UPDATE staff SET model = ? WHERE id = ?', patch.model, id)
  if (patch.avatar !== undefined) run('UPDATE staff SET avatar = ? WHERE id = ?', patch.avatar, id)
  if (patch.cwd !== undefined) run('UPDATE staff SET cwd = ? WHERE id = ?', patch.cwd, id)
  if (patch.systemPrompt !== undefined) run('UPDATE staff SET system_prompt = ? WHERE id = ?', patch.systemPrompt, id)
}

export function fixStaffEngine(id: string, provider: string, model: string) {
  run('UPDATE staff SET provider = ?, model = ? WHERE id = ?', provider, model, id)
}

export function saveStaffRefDocs(id: string, docs: string[]) {
  run('UPDATE staff SET ref_docs = ? WHERE id = ?', JSON.stringify(docs), id)
}

export function saveEquipment(id: string, equipment: Equipment) {
  run('UPDATE staff SET equipment = ? WHERE id = ?', JSON.stringify(equipment), id)
}

export const saveWorkBase = (...a: Parameters<typeof workBaseStore.save>) => workBaseStore.save(...a)
export const removeWorkBase = (id: string) => workBaseStore.remove(id)
export const loadWorkBases = () => workBaseStore.load()

export function deleteStaff(id: string) {
  workBaseStore.remove(id)
  run('DELETE FROM staff WHERE id = ?', id)
  run('DELETE FROM schedule WHERE staff_id = ?', id)
  run('UPDATE task SET assignee_id = NULL WHERE assignee_id = ?', id)
  run('UPDATE team SET lead_id = NULL WHERE lead_id = ?', id)
}

export function saveSessionId(id: string, sessionId: string | null) {
  run('UPDATE staff SET session_id = ? WHERE id = ?', sessionId, id)
}

// ── 로그·사용량 ─────────────────────────────────────────

interface LogRow {
  id: number
  staff_id: string
  ts: number
  type: LogType
  text: string
  text_i18n?: string | null
  attachments: string | null
}
const parseAttachments = (raw: string | null): Attachment[] | undefined => (raw ? (JSON.parse(raw) as Attachment[]) : undefined)
const parseI18n = (raw: string | null | undefined): I18nArg | undefined => {
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as I18nArg
  } catch {
    return undefined
  }
}
const toLog = (r: LogRow): LogEntry => ({ id: r.id, staffId: r.staff_id, ts: r.ts, type: r.type, text: r.text, textI18n: parseI18n(r.text_i18n), attachments: parseAttachments(r.attachments) })

export function insertLog(staffId: string, type: LogType, text: string, attachments?: Attachment[], textI18n?: I18nArg): LogEntry {
  const ts = Date.now()
  const raw = attachments?.length ? JSON.stringify(attachments) : null
  const i18nRaw = textI18n === undefined ? null : JSON.stringify(textI18n)
  const { lastInsertRowid } = run('INSERT INTO log (staff_id, ts, type, text, text_i18n, attachments) VALUES (?, ?, ?, ?, ?, ?)', staffId, ts, type, text, i18nRaw, raw)
  return { id: Number(lastInsertRowid), staffId, ts, type, text, textI18n, attachments: attachments?.length ? attachments : undefined }
}

export function logsSince(staffId: string, since: number): LogEntry[] {
  return all<LogRow>('SELECT * FROM log WHERE staff_id = ? AND ts >= ? ORDER BY ts', staffId, since).map(toLog)
}

export function allLogsBetween(since: number, until: number): LogEntry[] {
  return all<LogRow>('SELECT * FROM log WHERE ts >= ? AND ts < ? ORDER BY ts', since, until).map(toLog)
}

/** 성장 지표용: 직원별 로그 종류 개수 */
export function logCounts(): { staffId: string; type: LogType; n: number }[] {
  return all<{ staff_id: string; type: LogType; n: number }>('SELECT staff_id, type, COUNT(*) n FROM log GROUP BY staff_id, type').map((r) => ({
    staffId: r.staff_id,
    type: r.type,
    n: r.n,
  }))
}

/** 앱 구조로 아낀 토큰(추정)을 기록한다 */
export function insertSaving(staffId: string, tokens: number) {
  if (tokens > 0) run('INSERT INTO saving (staff_id, ts, tokens) VALUES (?, ?, ?)', staffId, Date.now(), Math.round(tokens))
}

export function savedTokensBetween(since: number, until: number) {
  return get<{ t: number }>('SELECT COALESCE(SUM(tokens), 0) t FROM saving WHERE ts >= ? AND ts < ?', since, until)!.t
}

export function insertUsage(staffId: string, costUsd: number, tokensIn: number, tokensOut: number) {
  run('INSERT INTO usage (staff_id, ts, cost_usd, tokens_in, tokens_out) VALUES (?, ?, ?, ?, ?)', staffId, Date.now(), costUsd, tokensIn, tokensOut)
}

export function usageSince(staffId: string, since: number, until = Number.MAX_SAFE_INTEGER) {
  const row = get<{ c: number; i: number; o: number }>(
    'SELECT COALESCE(SUM(cost_usd), 0) c, COALESCE(SUM(tokens_in), 0) i, COALESCE(SUM(tokens_out), 0) o FROM usage WHERE staff_id = ? AND ts >= ? AND ts < ?',
    staffId, since, until,
  )!
  return { costUsd: row.c, tokensIn: row.i, tokensOut: row.o }
}

/** 기간 전체(전 직원) 사용량 합계 */
export function usageTotalBetween(since: number, until: number) {
  const row = get<{ c: number; i: number; o: number }>(
    'SELECT COALESCE(SUM(cost_usd), 0) c, COALESCE(SUM(tokens_in), 0) i, COALESCE(SUM(tokens_out), 0) o FROM usage WHERE ts >= ? AND ts < ?',
    since, until,
  )!
  return { costUsd: row.c, tokensIn: row.i, tokensOut: row.o }
}

export function usageByStaffBetween(since: number, until: number) {
  return all<{ staff_id: string; c: number; i: number; o: number }>(
    'SELECT staff_id, SUM(cost_usd) c, SUM(tokens_in) i, SUM(tokens_out) o FROM usage WHERE ts >= ? AND ts < ? GROUP BY staff_id',
    since, until,
  )
}

export function resultCountBetween(staffId: string, since: number, until: number) {
  return get<{ n: number }>("SELECT COUNT(*) n FROM log WHERE staff_id = ? AND type = 'result' AND ts >= ? AND ts < ?", staffId, since, until)!.n
}

// ── 팀 ──────────────────────────────────────────────────

export function loadTeams(): Team[] {
  return all<{ id: string; name: string; color: string; lead_id: string | null; manuals: string | null; ref_docs: string | null; floor: number | null; is_practice: number | null }>('SELECT * FROM team ORDER BY created_at').map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    leadId: r.lead_id,
    kind: 'hired',
    manuals: parseList(r.manuals),
    refDocs: parseList(r.ref_docs),
    floor: r.floor ?? 1,
    ...(r.is_practice ? { isPractice: true } : {}),
  }))
}

export function insertTeam(t: Team) {
  run('INSERT INTO team (id, name, color, lead_id, created_at, is_practice) VALUES (?, ?, ?, ?, ?, ?)', t.id, t.name, t.color, t.leadId, Date.now(), t.isPractice ? 1 : null)
}

export function updateTeamRow(t: Team) {
  run(
    'UPDATE team SET name = ?, color = ?, lead_id = ?, manuals = ?, ref_docs = ?, floor = ? WHERE id = ?',
    t.name, t.color, t.leadId, JSON.stringify(t.manuals ?? []), JSON.stringify(t.refDocs ?? []), t.floor ?? 1, t.id,
  )
}

export function deleteTeamRow(id: string) {
  run('DELETE FROM team WHERE id = ?', id)
  run('UPDATE staff SET team_id = NULL WHERE team_id = ?', id)
  run('UPDATE task SET team_id = NULL WHERE team_id = ?', id)
}

// ── 업무 보드 ───────────────────────────────────────────

interface TaskRow {
  id: string
  title: string
  detail: string
  status: Task['status']
  assignee_id: string | null
  team_id: string | null
  result: string
  created_at: number
  updated_at: number
  lab_id: string | null
  attachments: string | null
  parent_id: string | null
  plan: string | null
  meeting_id: string | null
  usage: string | null
  is_practice: number | null
  is_autonomous: number | null
  artifacts: string | null
}

export function loadTasks(): Task[] {
  return all<TaskRow>('SELECT * FROM task ORDER BY created_at').map((r) => ({
    id: r.id,
    title: r.title,
    detail: r.detail,
    status: r.status,
    assigneeId: r.assignee_id,
    teamId: r.team_id,
    labId: r.lab_id,
    attachments: parseAttachments(r.attachments),
    result: r.result,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    parentId: r.parent_id,
    plan: r.plan ? (JSON.parse(r.plan) as Task['plan']) : null,
    meetingId: r.meeting_id ?? null,
    usage: r.usage ? (JSON.parse(r.usage) as Task['usage']) : undefined,
    ...(r.is_practice ? { isPractice: true } : {}),
    ...(r.is_autonomous ? { isAutonomous: true } : {}),
    ...(r.artifacts ? { artifacts: JSON.parse(r.artifacts) as Task['artifacts'] } : {}),
  }))
}

export function upsertTask(t: Task) {
  run(
    `INSERT INTO task (id, title, detail, status, assignee_id, team_id, result, created_at, updated_at, lab_id, attachments, parent_id, plan, meeting_id, usage, is_practice, is_autonomous, artifacts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, detail = excluded.detail, status = excluded.status, assignee_id = excluded.assignee_id,
       team_id = excluded.team_id, result = excluded.result, updated_at = excluded.updated_at, lab_id = excluded.lab_id, attachments = excluded.attachments,
       parent_id = excluded.parent_id, plan = excluded.plan, meeting_id = excluded.meeting_id, usage = excluded.usage, is_practice = excluded.is_practice, is_autonomous = excluded.is_autonomous,
       artifacts = excluded.artifacts`,
    t.id, t.title, t.detail, t.status, t.assigneeId, t.teamId, t.result, t.createdAt, t.updatedAt, t.labId, t.attachments?.length ? JSON.stringify(t.attachments) : null,
    t.parentId ?? null, t.plan ? JSON.stringify(t.plan) : null, t.meetingId ?? null, t.usage ? JSON.stringify(t.usage) : null, t.isPractice ? 1 : null, t.isAutonomous ? 1 : null,
    t.artifacts?.length ? JSON.stringify(t.artifacts) : null,
  )
}

export function deleteTaskRow(id: string) {
  run('DELETE FROM task WHERE id = ?', id)
}

// ── 회의 ────────────────────────────────────────────────

export function loadMeetings(limit: number): Meeting[] {
  return all<{ data: string }>('SELECT data FROM meeting ORDER BY created_at DESC LIMIT ?', limit).map((r) => JSON.parse(r.data) as Meeting)
}

export function saveMeeting(m: Meeting) {
  run('INSERT INTO meeting (id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', m.id, JSON.stringify(m), m.createdAt)
}

export function deleteMeetingRow(id: string) {
  run('DELETE FROM meeting WHERE id = ?', id)
}

// ── 튜토리얼 ────────────────────────────────────────────

/** 튜토리얼 진행 상태 (앱을 다시 켜도 이어진다) */
export function loadTutorial<T>(): T | null {
  const row = get<{ value: string }>("SELECT value FROM setting WHERE key = 'tutorial'")
  return row ? (JSON.parse(row.value) as T) : null
}

export function saveTutorial(v: unknown) {
  run("INSERT INTO setting (key, value) VALUES ('tutorial', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(v))
}

/** 연습 직원이 남긴 기록·단체방 글·사용량을 지운다 (직원 행은 deleteStaff로) */
export function deleteStaffTraces(ids: string[]) {
  for (const id of ids) {
    run('DELETE FROM log WHERE staff_id = ?', id)
    run('DELETE FROM chat WHERE sender = ?', id)
    run('DELETE FROM usage WHERE staff_id = ?', id)
  }
}

// ── 예약 업무 ───────────────────────────────────────────

export function loadSchedules(): Schedule[] {
  return all<{ id: string; staff_id: string; label: string; time: string; weekdays: string; instruction: string; enabled: number; last_run_date: string | null }>(
    'SELECT * FROM schedule ORDER BY time',
  ).map((r) => ({
    id: r.id,
    staffId: r.staff_id,
    label: r.label,
    time: r.time,
    weekdays: JSON.parse(r.weekdays) as number[],
    instruction: r.instruction,
    enabled: r.enabled === 1,
    lastRunDate: r.last_run_date,
  }))
}

export function upsertSchedule(s: Schedule) {
  run(
    `INSERT INTO schedule (id, staff_id, label, time, weekdays, instruction, enabled, last_run_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET staff_id = excluded.staff_id, label = excluded.label, time = excluded.time, weekdays = excluded.weekdays,
       instruction = excluded.instruction, enabled = excluded.enabled, last_run_date = excluded.last_run_date`,
    s.id, s.staffId, s.label, s.time, JSON.stringify(s.weekdays), s.instruction, s.enabled ? 1 : 0, s.lastRunDate,
  )
}

export function deleteScheduleRow(id: string) {
  run('DELETE FROM schedule WHERE id = ?', id)
}

// ── 단체방 ──────────────────────────────────────────────

type ChatRow = { id: number; ts: number; sender: string; text: string; attachments: string | null; approval: string | null; room: string | null; is_report?: number | null }

const toChatMessage = (r: ChatRow): ChatMessage => ({
  id: r.id,
  ts: r.ts,
  from: r.sender,
  text: r.text,
  attachments: parseAttachments(r.attachments),
  approval: r.approval ? (JSON.parse(r.approval) as ChatApproval) : undefined,
  ...(r.room ? { room: r.room } : {}),
  ...(r.is_report ? { isReport: true } : {}),
})

/** room: 팀 대화방(팀 id)·랩 대화방('lab:<랩 id>') — 비우면 전체 방 */
export function insertChat(from: string, text: string, attachments?: Attachment[], approval?: ChatApproval, room?: string, isReport = false): ChatMessage {
  const ts = Date.now()
  const raw = attachments?.length ? JSON.stringify(attachments) : null
  const { lastInsertRowid } = run(
    'INSERT INTO chat (ts, sender, text, attachments, approval, room, is_report) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ts,
    from,
    text,
    raw,
    approval ? JSON.stringify(approval) : null,
    room || null,
    isReport ? 1 : null,
  )
  return { id: Number(lastInsertRowid), ts, from, text, attachments: attachments?.length ? attachments : undefined, approval, ...(room ? { room } : {}), ...(isReport ? { isReport: true } : {}) }
}

/** 결재 처리 결과를 그 결재의 단체방 메시지에 남긴다 — 바뀐 메시지(없거나 이미 결과가 있으면 null) */
export function settleChatApproval(approval: ChatApproval): ChatMessage | null {
  const row = all<ChatRow>("SELECT * FROM chat WHERE json_extract(approval, '$.id') = ? AND json_extract(approval, '$.result') IS NULL ORDER BY id DESC LIMIT 1", approval.id)[0]
  if (!row) return null
  run('UPDATE chat SET approval = ? WHERE id = ?', JSON.stringify(approval), row.id)
  return toChatMessage({ ...row, approval: JSON.stringify(approval) })
}

/** 방마다 최근 limit개씩 (전체 방 + 팀·랩 방들) — 바쁜 팀 방이 전체 방 기록을 밀어내지 않게 */
export function recentChat(limit: number): ChatMessage[] {
  return all<ChatRow>(
    "SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY COALESCE(room, '') ORDER BY id DESC) AS rn FROM chat) WHERE rn <= ? ORDER BY id",
    limit,
  ).map(toChatMessage)
}

// ── 비서 대화 ───────────────────────────────────────────

interface SecretaryRow {
  id: number
  ts: number
  role: SecretaryMessage['role']
  text: string
  card: string | null
  target: string | null
  tokens: number | null
  is_error: number | null
}

const toSecretaryMessage = (r: SecretaryRow): SecretaryMessage & { target?: unknown } => ({
  id: r.id,
  ts: r.ts,
  role: r.role,
  text: r.text,
  ...(r.card ? { card: JSON.parse(r.card) as SecretaryCard } : {}),
  ...(r.target ? { target: JSON.parse(r.target) as unknown } : {}),
  ...(r.tokens ? { tokens: r.tokens } : {}),
  ...(r.is_error ? { isError: true } : {}),
})

export function insertSecretaryMessage(m: Omit<SecretaryMessage, 'id'>, target?: unknown): SecretaryMessage {
  const { lastInsertRowid } = run(
    'INSERT INTO secretary_message (ts, role, text, card, target, tokens, is_error) VALUES (?, ?, ?, ?, ?, ?, ?)',
    m.ts, m.role, m.text, m.card ? JSON.stringify(m.card) : null, target ? JSON.stringify(target) : null, m.tokens ?? null, m.isError ? 1 : null,
  )
  return { ...m, id: Number(lastInsertRowid) }
}

export function updateSecretaryMessage(m: SecretaryMessage) {
  run('UPDATE secretary_message SET text = ?, card = ?, tokens = ?, is_error = ? WHERE id = ?', m.text, m.card ? JSON.stringify(m.card) : null, m.tokens ?? null, m.isError ? 1 : null, m.id)
}

/** 보관 기간 안의 대화 (오래된 것은 지운다) */
export function loadSecretaryMessages(keepSince: number, limit: number) {
  run('DELETE FROM secretary_message WHERE ts < ?', keepSince)
  return all<SecretaryRow>('SELECT * FROM secretary_message ORDER BY id DESC LIMIT ?', limit).reverse().map(toSecretaryMessage)
}

export function clearSecretaryMessages() {
  run('DELETE FROM secretary_message')
}

/** 비서 세션: 이어 쓰는 세션 id와 시작 시각·질문 수(길어지면 새로), 마지막으로 본 누적 비용·토큰(차이만 쌓는다) */
export interface StoredSecretarySession {
  id: string
  startedAt: number
  turns: number
  cost: number
  tokensIn: number
  tokensOut: number
}

export function loadSecretarySession(): StoredSecretarySession | null {
  const raw = get<{ value: string }>("SELECT value FROM setting WHERE key = 'secretarySession'")?.value
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as StoredSecretarySession
    return typeof v?.id === 'string' ? v : null
  } catch {
    // 예전에는 id 글자만 저장했다 — 새 세션으로
    return null
  }
}

export function saveSecretarySession(s: StoredSecretarySession | null) {
  run("INSERT INTO setting (key, value) VALUES ('secretarySession', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", s ? JSON.stringify(s) : '')
}

// ── 설정 ────────────────────────────────────────────────

export function loadSettings(): Settings {
  const row = get<{ value: string }>("SELECT value FROM setting WHERE key = 'settings'")
  return withSettingsDefaults(row ? (JSON.parse(row.value) as Partial<Settings>) : {})
}

export function saveSettings(s: Settings) {
  run("INSERT INTO setting (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(s))
}

/** 번역 캐시 (키: 원문 해시 + 언어) — /명령 설명처럼 같은 글을 다시 번역하지 않게 */
export function loadTranslation(key: string): string | null {
  return get<{ text: string }>('SELECT text FROM translation WHERE key = ?', key)?.text ?? null
}

export function saveTranslation(key: string, text: string) {
  run('INSERT INTO translation (key, text) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET text = excluded.text', key, text)
}

/** 장비 탭에서 직접 추가한 연결 도구(MCP) — JSON 배열 그대로 (검사·복원은 shared/customMcp) */
export function loadCustomMcpRaw(): string | null {
  return get<{ value: string }>("SELECT value FROM setting WHERE key = 'customMcp'")?.value || null
}

export function saveCustomMcpRaw(json: string) {
  run("INSERT INTO setting (key, value) VALUES ('customMcp', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", json)
}

/** 업데이트 알림에서 [나중에]로 건너뛴 버전 (없으면 null) */
export function loadSkippedUpdate(): string | null {
  return get<{ value: string }>("SELECT value FROM setting WHERE key = 'skippedUpdate'")?.value || null
}

export function saveSkippedUpdate(version: string) {
  run("INSERT INTO setting (key, value) VALUES ('skippedUpdate', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", version)
}

/** 이번 기간에 이미 보낸 예산 알림 키 */
export function loadBudgetAlerts(): string[] {
  const row = get<{ value: string }>("SELECT value FROM setting WHERE key = 'budgetAlerts'")
  return row ? (JSON.parse(row.value) as string[]) : []
}

export function saveBudgetAlerts(keys: string[]) {
  run("INSERT INTO setting (key, value) VALUES ('budgetAlerts', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(keys))
}

/** 자동결재 상태 (기간 설정·이번에 대신 처리한 수·처리 목록) — 앱을 다시 켜도 이어서 세고 끝날 때 요약한다 */
export interface StoredAutoApprove {
  config: AutoApproveConfig
  counts: AutoApproveState['counts']
  /** 이번 기간에 시간대 안에 있었는지 (끝난 순간을 알아채 요약을 보낸다) */
  wasActive: boolean
  log: AutoHandled[]
}

export function loadAutoApprove(): Partial<StoredAutoApprove> {
  const row = get<{ value: string }>("SELECT value FROM setting WHERE key = 'autoApprove'")
  return row ? (JSON.parse(row.value) as Partial<StoredAutoApprove>) : {}
}

export function saveAutoApprove(v: StoredAutoApprove) {
  run("INSERT INTO setting (key, value) VALUES ('autoApprove', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(v))
}

/** "앞으로 항상 승인" 규칙 */
export function loadApprovalRules(): ApprovalRule[] {
  const row = get<{ value: string }>("SELECT value FROM setting WHERE key = 'approvalRules'")
  return row ? (JSON.parse(row.value) as ApprovalRule[]) : []
}

export function saveApprovalRules(rules: ApprovalRule[]) {
  run("INSERT INTO setting (key, value) VALUES ('approvalRules', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(rules))
}

/** 회사 지식 창고 (최근에 고친 순) */
export function loadKnowledge(): KnowledgeEntry[] {
  return all<{ data: string }>('SELECT data FROM knowledge ORDER BY updated_at DESC').map((r) => JSON.parse(r.data) as KnowledgeEntry)
}

export function saveKnowledgeRow(e: KnowledgeEntry) {
  run('INSERT INTO knowledge (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at', e.id, JSON.stringify(e), e.updatedAt)
}

export function deleteKnowledgeRow(id: string) {
  run('DELETE FROM knowledge WHERE id = ?', id)
}

// ── 결과물 갤러리·데모데이 ──────────────────────────────

export function loadGallery(): GalleryEntry[] {
  return all<{ data: string }>('SELECT data FROM gallery ORDER BY finished_at DESC').map((r) => JSON.parse(r.data) as GalleryEntry)
}

export function saveGalleryRow(e: GalleryEntry) {
  run('INSERT INTO gallery (id, data, finished_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, finished_at = excluded.finished_at', e.id, JSON.stringify(e), e.finishedAt)
}

export function deleteGalleryRow(id: string) {
  run('DELETE FROM gallery WHERE id = ?', id)
}

/** 마지막으로 데모데이를 연 날짜·시각 (같은 날 두 번 열지 않고, 다음 데모데이는 그 뒤에 끝낸 업무만 보여 준다) */
export function loadDemoDayLast(): { date: string; at: number } | null {
  const row = get<{ value: string }>("SELECT value FROM setting WHERE key = 'demoDayLast'")
  return row ? (JSON.parse(row.value) as { date: string; at: number }) : null
}

export function saveDemoDayLast(v: { date: string; at: number }) {
  run("INSERT INTO setting (key, value) VALUES ('demoDayLast', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(v))
}

/** 직원별 데모데이 칭찬 배지 (박수·MVP 누적) */
export function loadPraise(): Record<string, Praise> {
  const row = get<{ value: string }>("SELECT value FROM setting WHERE key = 'praise'")
  return row ? (JSON.parse(row.value) as Record<string, Praise>) : {}
}

export function savePraise(v: Record<string, Praise>) {
  run("INSERT INTO setting (key, value) VALUES ('praise', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(v))
}

/** 직원별 안 읽은 보고 개수 (앱을 다시 켜도 배지가 남게) */
export function loadUnreadReports(): UnreadReports {
  const row = get<{ value: string }>("SELECT value FROM setting WHERE key = 'unreadReports'")
  return row ? (JSON.parse(row.value) as UnreadReports) : {}
}

export function saveUnreadReports(v: UnreadReports) {
  run("INSERT INTO setting (key, value) VALUES ('unreadReports', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(v))
}

/** 원격 접속 설정 (토큰 해시·폐기 목록 포함 — Settings와 따로 둬서 화면으로 가지 않는다) */
export function loadRemoteConfig(): Partial<RemoteConfig> {
  const row = get<{ value: string }>("SELECT value FROM setting WHERE key = 'remote'")
  return row ? (JSON.parse(row.value) as Partial<RemoteConfig>) : {}
}

export function saveRemoteConfig(c: RemoteConfig) {
  run("INSERT INTO setting (key, value) VALUES ('remote', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(c))
}

/** Claude 플랜 사용률 — 앱을 다시 켜도 마지막 값을 보여 준다 */
export function loadPlanUsage(): PlanUsage[] {
  const row = get<{ value: string }>("SELECT value FROM setting WHERE key = 'planUsage'")
  return row ? (JSON.parse(row.value) as PlanUsage[]) : []
}

export function savePlanUsage(list: PlanUsage[]) {
  run("INSERT INTO setting (key, value) VALUES ('planUsage', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(list))
}

// ── 회사 자금·상점 ────────────────────────────────────

/** 보너스·보상·구매를 적는다. key가 같으면 한 번만 (레벨업 보상·업무 보너스 중복 방지) */
export function addLedger(amount: number, kind: LedgerKind, label: string, key: string | null = null) {
  run('INSERT OR IGNORE INTO ledger (ts, amount, kind, label, key) VALUES (?, ?, ?, ?, ?)', Date.now(), Math.round(amount), kind, label, key)
}

export function ledgerSum() {
  return get<{ s: number }>('SELECT COALESCE(SUM(amount), 0) s FROM ledger')!.s
}

export function ledgerEntries(limit: number): LedgerEntry[] {
  return all<LedgerEntry>('SELECT id, ts, amount, kind, label FROM ledger ORDER BY ts DESC LIMIT ?', limit)
}

/** 고용 직원이 지금까지 쓴 토큰 (수당 계산용) */
export function tokenTotal() {
  return get<{ t: number }>('SELECT COALESCE(SUM(tokens_in + tokens_out), 0) t FROM usage')!.t
}

/** 날짜별 토큰 사용량 (장부에 하루치 수당으로 묶어 보여 준다) */
export function tokensByDay(limit: number) {
  return all<{ day: string; t: number; ts: number }>(
    "SELECT date(ts / 1000, 'unixepoch', 'localtime') day, SUM(tokens_in + tokens_out) t, MAX(ts) ts FROM usage GROUP BY day ORDER BY day DESC LIMIT ?",
    limit,
  )
}

// ── 미션·업적용 집계 ──

export function countLogs(type: string, since: number) {
  return get<{ n: number }>('SELECT COUNT(*) n FROM log WHERE type = ? AND ts >= ?', type, since)!.n
}

export function countMeetings(since: number) {
  return get<{ n: number }>('SELECT COUNT(*) n FROM meeting WHERE created_at >= ?', since)!.n
}

/** 장부 키 접두어로 센다 (task: 업무 완료, mission: 미션 …) */
export function countLedgerKeys(prefix: string, since: number) {
  return get<{ n: number }>('SELECT COUNT(*) n FROM ledger WHERE key LIKE ? AND ts >= ?', `${prefix}%`, since)!.n
}

export function countLedgerKind(kind: LedgerKind, since: number) {
  return get<{ n: number }>('SELECT COUNT(*) n FROM ledger WHERE kind = ? AND ts >= ?', kind, since)!.n
}

export function tokensSince(since: number) {
  return get<{ t: number }>('SELECT COALESCE(SUM(tokens_in + tokens_out), 0) t FROM usage WHERE ts >= ?', since)!.t
}

/** 이미 받은 보상 키 */
export function ledgerKeys(prefix: string): Set<string> {
  return new Set(all<{ key: string }>('SELECT key FROM ledger WHERE key LIKE ?', `${prefix}%`).map((r) => r.key))
}

export function loadShop(): ShopState {
  const row = get<{ value: string }>("SELECT value FROM setting WHERE key = 'shop'")
  return row ? { ...EMPTY_SHOP, ...(JSON.parse(row.value) as Partial<ShopState>) } : EMPTY_SHOP
}

export function saveShop(shop: ShopState) {
  run("INSERT INTO setting (key, value) VALUES ('shop', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(shop))
}

/** 칸 배치로 옮기기 (한 번만, 트랜잭션 하나) — 옮긴 상점 상태를 돌려준다 */
export function migrateShopToGrid(level: number, legacyLevel: number): ShopState {
  return runIsoMigration(db, { level, legacyLevel })
}

/** 도달한 레벨의 기본 지급 가구 (레벨마다 한 번, 트랜잭션 하나) — 바뀌었으면 새 상점 상태, 아니면 null */
export function grantLevelItems(level: number): ShopState | null {
  return runLevelGrants(db, level)
}

/** 바닥 밖·고정 칸에 걸린 가구를 서랍으로 (settleGrid) — 저장하고 뺀 개수를 돌려준다 */
export function settleShopGrid(level: number): { shop: ShopState; count: number } {
  const cur = loadShop()
  const { shop, removed } = settleGrid(cur, level)
  if (removed.length) saveShop(shop)
  return { shop, count: removed.length }
}

/** 기본 지급을 이미 받은 레벨들 — 업적이 무료 지급분을 빼고 센다 */
export function loadGrantedLevels(): number[] {
  return grantedLevels(db)
}

/** 구역 지급을 이미 받은 구역들 */
export function loadGrantedZones(): string[] {
  return grantedZones(db)
}

/** 지금까지 오른 최고 회사 레벨 — 레벨은 내려가지 않는다 (office-iso-tech.md 5-3절). 없으면 0 */
export function loadCompanyLevelMax(): number {
  return Number(get<{ value: string }>("SELECT value FROM setting WHERE key = 'companyLevelMax'")?.value) || 0
}

export function saveCompanyLevelMax(level: number) {
  run("INSERT INTO setting (key, value) VALUES ('companyLevelMax', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(level))
}

// ── 랩 ──────────────────────────────────────────────────

export function loadLabs(): Lab[] {
  return all<{ data: string }>('SELECT data FROM lab ORDER BY created_at').map((r) => JSON.parse(r.data) as Lab)
}

export function saveLab(lab: Lab) {
  run('INSERT INTO lab (id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', lab.id, JSON.stringify(lab), Date.now())
}

export function deleteLabRow(id: string) {
  run('DELETE FROM lab WHERE id = ?', id)
  run('UPDATE task SET lab_id = NULL WHERE lab_id = ?', id)
}

// ── 프로세스 실행 ───────────────────────────────────────

export function loadRuns(limit: number): ProcessRun[] {
  return all<{ data: string }>('SELECT data FROM run ORDER BY created_at DESC LIMIT ?', limit).map((r) => JSON.parse(r.data) as ProcessRun)
}

export function saveRun(r: ProcessRun) {
  run('INSERT INTO run (id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', r.id, JSON.stringify(r), r.createdAt)
}
