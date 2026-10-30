import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { t } from '../shared/i18n/index.ts'
import type { TKey } from '../shared/i18n/dict/index.ts'
import { encodeLook, randomLook } from '../shared/look.ts'
import {
  PACK_FORMAT,
  PACK_LIMITS,
  PACK_VERSION,
  STAFF_MARKET,
  buildPackText,
  importSafeEquipment,
  validatePackObject,
  validatePackText,
  type PackExportStaff,
  type PackFile,
  type PackKnown,
  type PackReason,
  type PackResult,
  type PackStaff,
} from '../shared/staffPack.ts'
import { defaultProvider, fitEngineModel } from '../shared/engineModel.ts'
import type { Staff } from '../shared/types.ts'
import { equipmentCatalog } from './equipment'
import type { Office } from './office'
import { lastProviderStatus } from './setup'
import { readPackFile, writePackFile } from './staffPackFile.ts'

// 직원·랩 파일 채널 (pack:*). PC 화면에서만 쓰므로 OfficeApi·원격 v2 목록에는 넣지 않는다.
// 가져오기는 검증을 다 통과한 뒤에만 매뉴얼·직원·랩을 만든다. 실패하면 아무것도 만들지 않는다.

const failed = (reason: PackReason): PackResult => ({ ok: false, message: t(reason.key as TKey, reason.vars), staffIds: [] })

/** 이 컴퓨터에서 쓸 수 있는 장비 이름 (기본 작업 폴더 기준 — 홈 폴더면 홈) */
function packKnown(office: Office): PackKnown {
  const cwd = office.snapshot().settings.defaultCwd || os.homedir()
  const catalog = equipmentCatalog(cwd)
  return { mcpServers: new Set(catalog.mcpServers.filter((m) => m.status !== 'unsupported').map((m) => m.name)), skills: new Set(catalog.skills.map((s) => s.name)) }
}

/** 검증된 파일을 실제로 만든다: 없는 매뉴얼 → 직원 채용 → 랩 꾸리기 (있는 매뉴얼 파일은 덮지 않는다) */
function applyPack(office: Office, pack: PackFile, excluded: string[]): PackResult {
  const cwd = office.snapshot().settings.defaultCwd
  const existing = new Set(equipmentCatalog(cwd || os.homedir()).skills.map((s) => s.name))
  for (const s of pack.staff) {
    for (const m of s.manuals) {
      if (existing.has(m.name)) continue
      office.saveManual({ name: m.name, description: m.description, kind: 'personal', scope: 'user', projectDir: null, body: m.body, steps: [] })
      existing.add(m.name)
    }
  }
  const hired: Staff[] = pack.staff.map((s) => {
    const staff = office.hire({ name: s.name, role: s.role, avatar: s.avatar, provider: s.provider, model: s.model, cwd, systemPrompt: s.systemPrompt, approvalMode: 'ask', teamId: null, labIds: [] })
    // 검증에서 이미 맞췄지만, 결재를 건너뛰는 값이 들어가지 않게 채용 직전에 한 번 더 맞춘다
    office.setEquipment(staff.id, importSafeEquipment(s.equipment))
    return staff
  })
  if (pack.lab) {
    const lab = pack.lab
    const leadId = lab.leader === null ? null : hired[lab.leader].id
    office.createLab({ name: lab.name, color: lab.color, goal: lab.goal, cwd: null, leadId, memberIds: hired.map((s) => s.id) })
  }
  const names = hired.map((s) => s.name).join(', ')
  const head = pack.lab ? t('pack.done.lab', { lab: pack.lab.name, names }) : t('pack.done.hired', { names })
  const tail = excluded.length > 0 ? ` ${t('pack.done.excluded', { list: excluded.join(', ') })}` : ''
  return { ok: true, message: head + tail, staffIds: hired.map((s) => s.id) }
}

/** 마켓 항목도 파일과 같은 검증·채용 길을 탄다. 엔진은 claude·codex만 받고, 없으면 준비된 엔진으로 정한다.
 * 파일이 필요 없어 OfficeApi.hireMarket으로 PC 화면·휴대폰(원격 v2) 모두 부른다 (officeHandlers) */
export function hireMarket(office: Office, id: string, provider: unknown): PackResult {
  const tpl = STAFF_MARKET.find((m) => m.id === id)
  if (!tpl) return failed({ key: 'pack.err.marketMissing' })
  if (provider !== undefined && provider !== 'claude' && provider !== 'codex') return failed({ key: 'pack.err.provider' })
  const status = lastProviderStatus()
  const fit = fitEngineModel(provider ?? defaultProvider(status), tpl.model, status?.codex.models ?? [])
  const entry: PackStaff = {
    name: t(`pack.market.${tpl.id}.name` as TKey),
    role: tpl.role,
    avatar: encodeLook(randomLook(tpl.role)),
    provider: fit.provider,
    model: fit.model,
    approvalMode: 'ask',
    systemPrompt: tpl.systemPrompt,
    equipment: { mcpServers: [], skills: [], allowedTools: [], disallowedTools: [], monthlyBudgetUsd: 0 },
    manuals: [],
  }
  const check = validatePackObject({ format: PACK_FORMAT, version: PACK_VERSION, staff: [entry] }, packKnown(office))
  if (!check.ok) return failed(check.reason)
  return applyPack(office, check.pack, check.excluded)
}

function toExportStaff(office: Office, s: Staff): PackExportStaff {
  const manuals = office
    .listManuals()
    .filter((m) => m.kind === 'personal' && (s.equipment.skills === 'all' || s.equipment.skills.includes(m.name)))
    .map((m) => ({ name: m.name, description: m.description, body: m.body }))
  return { name: s.name, role: s.role, avatar: s.avatar, provider: s.provider, model: s.model, approvalMode: s.approvalMode, systemPrompt: s.systemPrompt, equipment: s.equipment, manuals }
}

/** 저장 대화상자 → 파일 쓰기. 취소하면 null */
async function saveFile(getWin: () => BrowserWindow | null, baseName: string, text: string, doneMessage: string): Promise<PackResult | null> {
  const win = getWin()
  const options = {
    title: t('pack.dialog.save'),
    defaultPath: path.join(app.getPath('documents'), `${baseName.replace(/[\\/:*?"<>|]/g, '_') || 'staff'}.json`),
    filters: [{ name: t('pack.dialog.filter'), extensions: ['json'] }],
  }
  const r = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (r.canceled || !r.filePath) return null
  const err = writePackFile(r.filePath, text)
  if (err) return failed(err)
  return { ok: true, message: doneMessage, staffIds: [] }
}

function exportStaff(office: Office, ids: string[]): PackExportStaff[] | PackReason {
  const snap = office.snapshot()
  const staff = ids.map((id) => snap.staff.find((s) => s.kind === 'hired' && s.id === id)).filter((s): s is Staff => Boolean(s))
  if (staff.length === 0) return { key: 'pack.err.noStaff' }
  return staff.map((s) => toExportStaff(office, s))
}

export function registerPack(getOffice: () => Office, getWin: () => BrowserWindow | null) {
  ipcMain.handle('pack:import', async (): Promise<PackResult | null> => {
    const office = getOffice()
    const win = getWin()
    const options = { title: t('pack.dialog.open'), properties: ['openFile' as const], filters: [{ name: t('pack.dialog.filter'), extensions: ['json'] }] }
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (r.canceled || !r.filePaths[0]) return null
    const file = readPackFile(r.filePaths[0])
    if (!file.ok) return failed(file.reason)
    const check = validatePackText(file.text, packKnown(office))
    if (!check.ok) return failed(check.reason)
    return applyPack(office, check.pack, check.excluded)
  })

  ipcMain.handle('pack:exportStaff', async (_e, ids: unknown): Promise<PackResult | null> => {
    const office = getOffice()
    const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
    const entries = exportStaff(office, list)
    if (!Array.isArray(entries)) return failed(entries)
    const built = buildPackText(entries)
    if (!built.ok) return failed(built.reason)
    const name = entries.length === 1 ? entries[0].name : 'staff'
    return saveFile(getWin, name, built.text, t('pack.done.exported', { count: entries.length }))
  })

  ipcMain.handle('pack:exportLab', async (_e, labId: unknown): Promise<PackResult | null> => {
    const office = getOffice()
    const snap = office.snapshot()
    const lab = snap.labs.find((l) => l.id === labId)
    if (!lab) return failed({ key: 'pack.err.labMissing' })
    const members = lab.memberIds.map((id) => snap.staff.find((s) => s.kind === 'hired' && s.id === id)).filter((s): s is Staff => Boolean(s))
    if (members.length === 0) return failed({ key: 'pack.err.labNoMembers' })
    const leader = lab.leadId ? members.findIndex((m) => m.id === lab.leadId) : -1
    const built = buildPackText(
      members.map((s) => toExportStaff(office, s)),
      // 입력칸 한도가 생기기 전에 저장된 긴 이름·목표 때문에 내보내기가 막히지 않게 파일 한도에 맞춰 자른다
      { name: lab.name.trim().slice(0, PACK_LIMITS.nameMax), color: lab.color, goal: lab.goal.trim().slice(0, PACK_LIMITS.descMax), leader: leader >= 0 ? leader : null },
    )
    if (!built.ok) return failed(built.reason)
    return saveFile(getWin, lab.name, built.text, t('pack.done.exportedLab', { lab: lab.name, count: members.length }))
  })
}
