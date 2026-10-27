import type { DatabaseSync } from 'node:sqlite'

// 작업 전 되돌리기 기록(직원별 "일을 시작한 시점"과 직접 고친 파일)을 office.db에 저장한다 — 앱을 다시 켜도 마지막 작업을 되돌릴 수 있게

export type WorkBase = { cwd: string; root: string; tree: string; at: number; state?: { head: string; branch: string; snap: string } }
export type StoredWorkBase = WorkBase & { touched: string[] }

export function createWorkBaseStore(db: DatabaseSync) {
  db.exec('CREATE TABLE IF NOT EXISTS work_base (staff_id TEXT PRIMARY KEY, data TEXT NOT NULL)')
  return {
    save(staffId: string, base: WorkBase, touched: Iterable<string> = []) {
      db.prepare('INSERT INTO work_base (staff_id, data) VALUES (?, ?) ON CONFLICT(staff_id) DO UPDATE SET data = excluded.data').run(
        staffId,
        JSON.stringify({ ...base, touched: [...touched] }),
      )
    },
    remove(staffId: string) {
      db.prepare('DELETE FROM work_base WHERE staff_id = ?').run(staffId)
    },
    load(): Map<string, StoredWorkBase> {
      const out = new Map<string, StoredWorkBase>()
      for (const row of db.prepare('SELECT staff_id, data FROM work_base').all() as { staff_id: string; data: string }[]) {
        try {
          const v = JSON.parse(row.data) as StoredWorkBase
          if (typeof v.cwd === 'string' && typeof v.root === 'string' && typeof v.tree === 'string' && typeof v.at === 'number') out.set(row.staff_id, { ...v, touched: Array.isArray(v.touched) ? v.touched : [] })
        } catch {
          // 깨진 기록은 건너뛴다
        }
      }
      return out
    },
  }
}
