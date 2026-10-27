// 되돌리기 기록 저장: 다시 시작(같은 DB 파일을 새로 열기)해도 남고, 해고하면 지워진다 — npm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { folderState, repoRoot, snapshotTree, workBaseStillValid } from '../src/main/review.ts'
import { createWorkBaseStore } from '../src/main/workBaseStore.ts'

test('되돌리기 기록은 다시 시작한 뒤에도 남고, 지우면 사라진다', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'co-wb-')), 'office.db')
  const first = new DatabaseSync(file)
  const store1 = createWorkBaseStore(first)
  store1.save('s1', { cwd: '/p', root: '/p', tree: 'abc', at: 123 }, ['a.txt', 'sub/b.txt'])
  store1.save('s2', { cwd: '/q', root: '/q', tree: 'def', at: 456 })
  first.close()

  const store2 = createWorkBaseStore(new DatabaseSync(file)) // 앱을 다시 켠 것
  const loaded = store2.load()
  assert.deepEqual(loaded.get('s1'), { cwd: '/p', root: '/p', tree: 'abc', at: 123, touched: ['a.txt', 'sub/b.txt'] })
  assert.equal(loaded.size, 2)

  store2.remove('s1') // 해고
  assert.deepEqual([...store2.load().keys()], ['s2'])
})

const sh = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' })

// 저장 → 같은 DB를 다시 열어 불러온 기록이 지금 폴더에서도 유효한가
async function saveAndReopen() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'co-wb-repo-')))
  sh(dir, 'init', '-q', '-b', 'main')
  sh(dir, 'config', 'user.email', 't@t')
  sh(dir, 'config', 'user.name', 't')
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a1\n')
  sh(dir, 'add', '-A')
  sh(dir, 'commit', '-qm', 'init')
  const tree = (await snapshotTree(dir))!
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'co-wb-')), 'office.db')
  const db1 = new DatabaseSync(file)
  createWorkBaseStore(db1).save('s1', { cwd: dir, root: (await repoRoot(dir))!, tree, at: 1, state: (await folderState(dir))! })
  db1.close()
  const loaded = createWorkBaseStore(new DatabaseSync(file)).load().get('s1')!
  return { dir, loaded }
}

test('다시 열었을 때 폴더가 그대로면 기록을 복원한다', async () => {
  const { loaded } = await saveAndReopen()
  assert.equal(await workBaseStillValid(loaded), true)
})

test('꺼져 있는 동안 파일 수정·커밋·브랜치 변경·폴더 삭제가 있으면 기록을 버린다', async () => {
  const edit = await saveAndReopen()
  // 크기를 바꿔 쓴다 — 같은 크기로 1초 안에 고치면 git 인덱스 캐시가 변경을 못 알아봐 테스트가 들쭉날쭉해진다
  fs.writeFileSync(path.join(edit.dir, 'a.txt'), 'a2 edited\n')
  assert.equal(await workBaseStillValid(edit.loaded), false)

  const commit = await saveAndReopen()
  sh(commit.dir, 'commit', '-q', '--allow-empty', '-m', 'x')
  assert.equal(await workBaseStillValid(commit.loaded), false)

  const branch = await saveAndReopen()
  sh(branch.dir, 'checkout', '-q', '-b', 'other')
  assert.equal(await workBaseStillValid(branch.loaded), false)

  const gone = await saveAndReopen()
  fs.rmSync(gone.dir, { recursive: true, force: true })
  assert.equal(await workBaseStillValid(gone.loaded), false)
})
