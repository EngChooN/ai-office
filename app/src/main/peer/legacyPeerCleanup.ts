// 다른 PC 직원 빌려주기·데려오기(1.3.1까지) 없앤 뒤의 1회 정리 — 앱을 켤 때 DB를 연 직후, 직원·랩을 읽기 전에 부른다
// 남기는 것: 짝지은 PC 기록(peer 표)·토큰 파일(userData/peers)·B컴 열쇠(원격 설정)·워크스페이스 목록 — 워크스페이스가 그대로 쓴다
// 지우는 것: 데려온 직원·일·보낼 것·받은 일·올린 첨부 기록·파일 복사본 표와 폴더, 랩 멤버·카드 담당·기록의 데려온 직원 id(p:…)
// 옛 표가 없으면 DB는 건드리지 않아 몇 번 불러도 같다(따로 '했음' 표시를 두지 않는다 — 옛 표가 남아 있는 것이 '아직 덜 함' 표시)
// 그래서 옛 표는 앞 단계(세기·랩·카드·기록)가 모두 성공했을 때만 지운다. 하나라도 실패하면 표를 남겨 다음 실행에서 처음부터 다시 한다
// 단계 하나가 실패해도 나머지 단계는 계속하고, 랩은 한 줄씩 따로 고쳐 한 줄의 실패가 다른 랩을 막지 않는다

import fs from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

/** 1.3.1까지의 표 — peer(짝 기록)는 빠져 있다 */
export const LEGACY_PEER_TABLES = ['peer_staff', 'peer_job', 'peer_outbox', 'peer_inbox', 'peer_upload', 'peer_workspace', 'peer_changeset'] as const
/** 파일 복사본·받은 변경 묶음 폴더 (userData 아래) — 바로 지운다 */
export const LEGACY_PEER_DIRS = ['peer-workspaces', 'peer-blobs', 'peer-staging'] as const
/** 반영할 때 남긴 되돌리기·충돌 사본 — 사용자 파일 사본이 있을 수 있어 예전 규칙대로 14일 지난 것만 지운다 (폴더가 비면 폴더도) */
export const LEGACY_PEER_KEEP_DIRS = ['peer-undo', 'peer-conflicts'] as const
export const LEGACY_PEER_KEEP_MS = 14 * 24 * 60 * 60_000
/** 데려온 직원 id 접두사 (p:<peerId>:<remoteId>) */
const PEER_STAFF_PREFIX = 'p:'
const ACTIVE_JOB_STATES = new Set(['queued', 'sending', 'accepted', 'running'])

export interface LegacyPeerCleanupResult {
  /** 끝나지 않고 닫힌 일 수 (A컴에서 보내던·진행 중이던 일) */
  closedJobs: number
  /** 그 일을 맡았던 데려온 직원 이름 (겹치지 않게) */
  staffNames: string[]
  /** 반영하지 않은 채 닫힌 파일 변경 묶음 수 */
  closedChanges: number
  /** 정리하다 실패한 단계 (오류 기록용 — 다음 실행에서 다시 시도한다) */
  errors: string[]
}

const hasTable = (db: DatabaseSync, name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))

const rowsOf = (db: DatabaseSync, table: string): Record<string, unknown>[] => {
  if (!hasTable(db, table)) return []
  return (db.prepare(`SELECT data FROM ${table}`).all() as { data: string }[]).flatMap((r) => {
    try {
      const v = JSON.parse(r.data)
      return v && typeof v === 'object' ? [v as Record<string, unknown>] : []
    } catch {
      return []
    }
  })
}

export function cleanupLegacyPeerData(db: DatabaseSync, userDataDir: string, now = Date.now()): LegacyPeerCleanupResult {
  const result: LegacyPeerCleanupResult = { closedJobs: 0, staffNames: [], closedChanges: 0, errors: [] }
  const step = (name: string, fn: () => void) => {
    try {
      fn()
    } catch (e) {
      result.errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 옛 표가 하나도 없으면(새로 설치·이미 정리함) DB는 건드리지 않는다 — 켤 때마다 기록 표를 훑지 않게
  const hasLegacy = LEGACY_PEER_TABLES.some((t) => hasTable(db, t))

  // 1. 알릴 것을 먼저 센다 (표를 지우기 전에)
  if (hasLegacy) step('count', () => {
    const names = new Map(rowsOf(db, 'peer_staff').map((s) => [String(s.id), String(s.name ?? '')]))
    const active = rowsOf(db, 'peer_job').filter((j) => ACTIVE_JOB_STATES.has(String(j.state)))
    result.closedJobs = active.length
    result.staffNames = [...new Set(active.map((j) => names.get(`${PEER_STAFF_PREFIX}${j.peerId}:${j.remoteStaffId}`) ?? '').filter(Boolean))]
    result.closedChanges = rowsOf(db, 'peer_changeset').filter((c) => c.side === 'a' && c.state === 'pending').length
  })

  // 2. 랩 멤버·리드에서 데려온 직원 id를 뺀다 — 한 줄씩 따로. 읽을 수 없는 줄(JSON이 아님)은 고칠 id도 없으니 건너뛰고, 고쳐 쓰다 실패한 줄만 실패로 센다
  if (hasLegacy) step('labs', () => {
    if (!hasTable(db, 'lab')) return
    const isPeerId = (id: unknown) => typeof id === 'string' && id.startsWith(PEER_STAFF_PREFIX)
    const failed: string[] = []
    for (const r of db.prepare('SELECT id, data FROM lab').all() as { id: string; data: string }[]) {
      let lab: { memberIds?: unknown; leadId?: unknown }
      try {
        const v = JSON.parse(r.data)
        if (!v || typeof v !== 'object') continue
        lab = v
      } catch {
        continue
      }
      const members = Array.isArray(lab.memberIds) ? lab.memberIds : []
      if (!members.some(isPeerId) && !isPeerId(lab.leadId)) continue
      const next = { ...lab, memberIds: members.filter((id) => !isPeerId(id)), ...(isPeerId(lab.leadId) ? { leadId: null } : {}) }
      try {
        db.prepare('UPDATE lab SET data = ? WHERE id = ?').run(JSON.stringify(next), r.id)
      } catch (e) {
        failed.push(`${r.id} (${e instanceof Error ? e.message : String(e)})`)
      }
    }
    if (failed.length) throw new Error(failed.join(', '))
  })

  // 3. 카드 담당·기록에 남은 데려온 직원 id
  if (hasLegacy) step('tasks', () => {
    if (hasTable(db, 'task')) db.prepare("UPDATE task SET assignee_id = NULL WHERE assignee_id LIKE 'p:%'").run()
  })
  // LIKE는 색인을 못 써서 범위 조건으로 (p: 로 시작 = 'p:' 이상 'p;' 미만)
  if (hasLegacy) step('logs', () => {
    if (hasTable(db, 'log')) db.prepare("DELETE FROM log WHERE staff_id >= 'p:' AND staff_id < 'p;'").run()
  })

  // 4. 옛 표 — 앞 단계가 모두 성공했을 때만 (실패분이 있으면 표를 남겨 다음 실행에서 다시 한다)
  if (hasLegacy && result.errors.length === 0) step('tables', () => {
    for (const t of LEGACY_PEER_TABLES) db.exec(`DROP TABLE IF EXISTS ${t}`)
  })
  // 5. 복사본 폴더 — DB와 상관없어 늘 한다 (몇 번 해도 같다)
  step('dirs', () => {
    for (const d of LEGACY_PEER_DIRS) fs.rmSync(path.join(userDataDir, d), { recursive: true, force: true })
    for (const d of LEGACY_PEER_KEEP_DIRS) {
      const base = path.join(userDataDir, d)
      if (!fs.existsSync(base)) continue
      for (const name of fs.readdirSync(base)) if (fs.statSync(path.join(base, name)).mtimeMs < now - LEGACY_PEER_KEEP_MS) fs.rmSync(path.join(base, name), { recursive: true, force: true })
      if (fs.readdirSync(base).length === 0) fs.rmdirSync(base)
    }
  })
  return result
}
