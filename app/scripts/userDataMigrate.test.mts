// 개명 데이터 폴더 이전 단위 테스트 — npm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { resolveUserDataDir } from '../src/main/userDataMigrate.ts'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-mig-'))
const seed = (appData: string, name: string, db: string) => {
  const d = path.join(appData, name)
  fs.mkdirSync(path.join(d, 'remote'), { recursive: true })
  fs.writeFileSync(path.join(d, 'office.db'), db)
  fs.writeFileSync(path.join(d, 'remote', 'key.pem'), 'KEY')
  return d
}

test('옛 폴더만 있음: 새 폴더로 복사하고 옛 폴더는 그대로 둔다 (잠금 파일은 가져오지 않음)', () => {
  const ad = tmp()
  const old = seed(ad, 'Claude Office', 'OLD-DB')
  fs.writeFileSync(path.join(old, 'office.lock'), '{"pid":99999999}')
  const r = resolveUserDataDir(ad)
  assert.equal(r.status, 'copied')
  assert.equal(r.dir, path.join(ad, 'AI Office'))
  assert.equal(fs.readFileSync(path.join(r.dir, 'office.db'), 'utf8'), 'OLD-DB')
  assert.equal(fs.readFileSync(path.join(r.dir, 'remote', 'key.pem'), 'utf8'), 'KEY')
  assert.equal(fs.existsSync(path.join(r.dir, 'office.lock')), false)
  assert.equal(fs.readFileSync(path.join(old, 'office.db'), 'utf8'), 'OLD-DB')
  assert.equal(fs.existsSync(`${r.dir}.migrating`), false)
})

test('둘 다 있음: 새 폴더를 쓰고 어느 쪽도 건드리지 않는다', () => {
  const ad = tmp()
  const old = seed(ad, 'Claude Office', 'OLD-DB')
  const neu = seed(ad, 'AI Office', 'NEW-DB')
  const r = resolveUserDataDir(ad)
  assert.deepEqual([r.status, r.dir], ['already', neu])
  assert.equal(fs.readFileSync(path.join(neu, 'office.db'), 'utf8'), 'NEW-DB')
  assert.equal(fs.readFileSync(path.join(old, 'office.db'), 'utf8'), 'OLD-DB')
})

test('복사 실패(검사 불통과): 옛 폴더를 그대로 쓰고 새 폴더·임시 폴더를 남기지 않는다', () => {
  const ad = tmp()
  const old = seed(ad, 'Claude Office', 'OLD-DB')
  const r = resolveUserDataDir(ad, { verify: () => false })
  assert.equal(r.status, 'copy-failed')
  assert.equal(r.dir, old)
  assert.ok(r.error)
  assert.equal(fs.existsSync(path.join(ad, 'AI Office')), false)
  assert.equal(fs.existsSync(path.join(ad, 'AI Office.migrating')), false)
  assert.equal(fs.readFileSync(path.join(old, 'office.db'), 'utf8'), 'OLD-DB')
})

test('옛 앱이 켜져 있으면 복사하지 않고 옛 폴더를 쓴다 / 아무것도 없으면 새 폴더로 시작', () => {
  const ad = tmp()
  const old = seed(ad, 'Claude Office', 'OLD-DB')
  fs.writeFileSync(path.join(old, 'office.lock'), JSON.stringify({ pid: 4242 }))
  const r = resolveUserDataDir(ad, { isAlive: () => true })
  assert.deepEqual([r.status, r.dir], ['old-running', old])
  const empty = tmp()
  assert.deepEqual(resolveUserDataDir(empty), { dir: path.join(empty, 'AI Office'), status: 'fresh' })
})
