// task.artifacts 열: 옛 DB 마이그레이션, NULL·깨진 JSON, 저장 → 다시 열기 → 버전 교체 (src/main/db.ts)
// db.ts는 electron의 app.getPath만 쓰므로 가짜 app으로 임시 폴더의 실제 sqlite 파일을 연다

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { replaceArtifactRef } from '../src/shared/artifact.ts'
import type { ArtifactRef, Task } from '../src/shared/types.ts'

register('./dbLoaderHooks.mjs', import.meta.url)
const g = globalThis as unknown as { __testUserData: string }
const dbm = await import('../src/main/db.ts')

const freshDir = () => {
  g.__testUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'db-artifacts-'))
  return path.join(g.__testUserData, 'office.db')
}
const ref = (version: number, over: Partial<ArtifactRef> = {}): ArtifactRef => ({ id: 'a1', title: '시안', kind: 'html', version, ...over }) as ArtifactRef
const task = (id: string, artifacts?: ArtifactRef[]): Task =>
  ({ id, title: id, detail: '', status: 'todo', assigneeId: null, teamId: null, labId: null, result: '', createdAt: 1, updatedAt: 1, parentId: null, plan: null, meetingId: null, ...(artifacts ? { artifacts } : {}) }) as unknown as Task
const taskCols = (file: string) => {
  const raw = new DatabaseSync(file)
  const cols = (raw.prepare('PRAGMA table_info(task)').all() as { name: string }[]).map((c) => c.name)
  raw.close()
  return cols
}

test('artifacts 열이 없는 옛 DB를 열면 열이 추가되고 기존 행은 빈 목록으로 읽힌다', () => {
  const file = freshDir()
  const old = new DatabaseSync(file)
  old.exec(`CREATE TABLE task (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, status TEXT NOT NULL,
    assignee_id TEXT, team_id TEXT, result TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`)
  old.prepare("INSERT INTO task VALUES ('old1', '옛 카드', '', 'done', NULL, NULL, '', 1, 1)").run()
  old.close()
  assert.ok(!taskCols(file).includes('artifacts'))

  dbm.openDb()
  assert.ok(taskCols(file).includes('artifacts'))
  const [t] = dbm.loadTasks()
  assert.equal(t.id, 'old1')
  assert.equal(t.artifacts, undefined)
  // 한 번 더 열어도 열 추가가 중복 실패하지 않는다
  dbm.openDb()
  assert.equal(dbm.loadTasks().length, 1)
})

test('NULL·빈 목록 저장은 NULL이고, 깨진 JSON 행은 카드 목록 전체를 막지 않는다', () => {
  const file = freshDir()
  dbm.openDb()
  dbm.upsertTask(task('none'))
  dbm.upsertTask(task('empty', []))
  dbm.upsertTask(task('ok', [ref(1)]))
  dbm.upsertTask(task('bad', [ref(1)]))
  const raw = new DatabaseSync(file)
  const n = (id: string) => (raw.prepare('SELECT artifacts FROM task WHERE id = ?').get(id) as { artifacts: string | null }).artifacts
  assert.equal(n('none'), null)
  assert.equal(n('empty'), null)
  raw.prepare("UPDATE task SET artifacts = '{깨진' WHERE id = 'bad'").run()
  raw.close()

  const byId = Object.fromEntries(dbm.loadTasks().map((t) => [t.id, t]))
  assert.equal(Object.keys(byId).length, 4)
  assert.equal(byId.none.artifacts, undefined)
  assert.equal(byId.empty.artifacts, undefined)
  assert.deepEqual(byId.ok.artifacts, [ref(1)])
  assert.equal(byId.bad.artifacts, undefined)
})

test('결과물 저장 → DB 다시 열기 → 그대로 읽히고, 버전 교체·재시작 후에도 유지된다', () => {
  freshDir()
  dbm.openDb()
  const t = task('t1', [ref(1), ref(1, { id: 'a2', title: '보고서', kind: 'md' })])
  dbm.upsertTask(t)
  dbm.openDb() // 재시작 흉내
  assert.deepEqual(dbm.loadTasks()[0].artifacts, t.artifacts)

  const replaced = replaceArtifactRef(dbm.loadTasks()[0].artifacts, ref(2))
  assert.ok(replaced)
  dbm.upsertTask({ ...dbm.loadTasks()[0], artifacts: replaced })
  dbm.openDb()
  const after = dbm.loadTasks()[0].artifacts!
  assert.equal(after.length, 2)
  assert.equal(after.find((a) => a.id === 'a1')!.version, 2)
  assert.equal(after.find((a) => a.id === 'a2')!.version, 1)

  // 결과물을 모두 비우면 NULL로 돌아가 빈 목록으로 읽힌다
  dbm.upsertTask({ ...dbm.loadTasks()[0], artifacts: [] })
  assert.equal(dbm.loadTasks()[0].artifacts, undefined)
})
