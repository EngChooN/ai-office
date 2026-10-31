// dbArtifacts.test.mts가 따로 띄우는 자식 프로세스: 같은 DB 파일에 쓰거나(write) 읽는다(read)
// 쓰는 프로세스가 끝난 뒤 읽는 프로세스가 새로 파일을 열어야 '닫았다 다시 열기'가 된다
import { register } from 'node:module'

register('./dbLoaderHooks.mjs', import.meta.url)
const g = globalThis as unknown as { __testUserData: string }
g.__testUserData = process.env.DB_DIR!
const dbm = await import('../src/main/db.ts')
const ref = (id: string, version: number) => ({ id, title: id, kind: 'html', version })
const base = { title: 't', detail: '', status: 'todo', assigneeId: null, teamId: null, labId: null, result: '', createdAt: 1, updatedAt: 1, parentId: null, plan: null, meetingId: null }

dbm.openDb()
const mode = process.argv[2]
if (mode === 'write') {
  dbm.upsertTask({ ...base, id: 't1', artifacts: [ref('a1', 1), ref('a2', 1)] } as never)
} else if (mode === 'replace') {
  const t = dbm.loadTasks().find((x) => x.id === 't1')!
  dbm.upsertTask({ ...t, artifacts: t.artifacts!.map((a) => (a.id === 'a1' ? ref('a1', 2) : a)) } as never)
} else if (mode === 'clear') {
  const t = dbm.loadTasks().find((x) => x.id === 't1')!
  dbm.upsertTask({ ...t, artifacts: [] } as never)
} else if (mode === 'read') {
  console.log(JSON.stringify(dbm.loadTasks().map((x) => ({ id: x.id, artifacts: x.artifacts ?? null }))))
}
dbm.closeDb()
