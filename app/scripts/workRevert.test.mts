// 작업 전 되돌리기: git 스냅샷·차이·복원 단위 테스트 — npm test
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { repoRoot, restoreFiles, snapshotTree, treeDiff } from '../src/main/review.ts'

const sh = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' })

function makeRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'co-revert-')))
  sh(dir, 'init', '-q')
  sh(dir, 'config', 'user.email', 't@t')
  sh(dir, 'config', 'user.name', 't')
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a1\n')
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b1\n')
  fs.mkdirSync(path.join(dir, 'sub'))
  fs.writeFileSync(path.join(dir, 'sub', 'c.txt'), 'c1\n')
  sh(dir, 'add', '-A')
  sh(dir, 'commit', '-qm', 'init')
  return dir
}

test('스냅샷 → 수정·추가·삭제 → 차이 → 선택한 파일만 복원', async () => {
  const dir = makeRepo()
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b-dirty-before\n') // 일 시작 전부터 있던 변경은 기준에 포함
  const base = await snapshotTree(dir)
  assert.ok(base)
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a2\n')
  fs.writeFileSync(path.join(dir, 'new.txt'), 'n\n')
  fs.rmSync(path.join(dir, 'sub', 'c.txt'))
  const now = await snapshotTree(dir)
  const files = await treeDiff(dir, base!, now!)
  assert.deepEqual(files.map((f) => `${f.status}:${f.path}`).sort(), ['A:new.txt', 'D:sub/c.txt', 'M:a.txt'])
  // 다른 직원이 고친 것으로 치고 a.txt는 제외
  const r = await restoreFiles(dir, base!, ['new.txt', 'sub/c.txt'])
  assert.deepEqual([r.restored, r.failed], [2, []])
  assert.equal(fs.existsSync(path.join(dir, 'new.txt')), false)
  assert.equal(fs.readFileSync(path.join(dir, 'sub', 'c.txt'), 'utf8'), 'c1\n')
  assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'a2\n')
  assert.equal(fs.readFileSync(path.join(dir, 'b.txt'), 'utf8'), 'b-dirty-before\n')
  // 스냅샷은 브랜치·스테이징을 건드리지 않는다
  assert.equal(sh(dir, 'diff', '--cached', '--name-only').trim(), '')
})

test('하위 폴더에서도 저장소 맨 위 기준 경로, 작업 폴더 밖 경로는 거부', async () => {
  const dir = makeRepo()
  const sub = path.join(dir, 'sub')
  assert.equal(await repoRoot(sub), dir)
  const base = await snapshotTree(sub)
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x\n')
  const files = await treeDiff(dir, base!, (await snapshotTree(sub))!)
  assert.deepEqual(files.map((f) => f.path), ['a.txt'])
  const r = await restoreFiles(dir, base!, ['../outside.txt'])
  assert.deepEqual([r.restored, r.failed], [0, ['../outside.txt']])
})

test('git 폴더가 아니면 null', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'co-nogit-'))
  assert.equal(await snapshotTree(dir), null)
  assert.equal(await repoRoot(dir), null)
})
