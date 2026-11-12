// 매뉴얼 표시 이름(title) 저장·읽기, 내부 이름 자동 생성, 옛 매뉴얼 호환
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { isValidManualName, listManuals, saveManual, slugFromTitle } from '../src/main/manuals.ts'
import type { ManualInput } from '../src/shared/types.ts'

const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-title-'))
const base = (o: Partial<ManualInput>): ManualInput => ({ name: '', description: '설명', kind: 'personal', scope: 'project', projectDir: proj, body: '본문', steps: [], ...o })

test('한글 표시 이름 저장·읽기 — 따옴표·콜론도 안전', () => {
  const m = saveManual(base({ title: '주간 "보고": 정리', autoName: true, name: 'weekly-report' }))
  assert.equal(m.name, 'weekly-report')
  assert.equal(m.title, '주간 "보고": 정리')
  assert.equal(listManuals([proj]).find((x) => x.name === 'weekly-report')?.title, '주간 "보고": 정리')
})

test('한글뿐인 이름은 manual-무작위 이름, 겹치면 -2·-3', () => {
  assert.match(slugFromTitle('주간 보고'), /^manual-[a-z0-9]{6}$/)
  assert.equal(slugFromTitle('Weekly Report!'), 'weekly-report')
  const a = saveManual(base({ name: 'weekly-report', autoName: true, title: '둘째' }))
  const b = saveManual(base({ name: 'weekly-report', autoName: true, title: '셋째' }))
  assert.equal(a.name, 'weekly-report-2')
  assert.equal(b.name, 'weekly-report-3')
  const c = saveManual(base({ name: '', title: '아무거나' }))
  assert.ok(isValidManualName(c.name))
})

test('직접 쓴 이름이 겹치면 지금처럼 오류, title 없는 매뉴얼은 title 없이 저장', () => {
  assert.throws(() => saveManual(base({ name: 'weekly-report' })), /이미 있어요/)
  const m = saveManual(base({ name: 'plain-one', title: '  ' }))
  assert.equal(m.title, undefined)
  assert.ok(!fs.readFileSync(m.path, 'utf8').includes('title:'))
})

test('title 없는 옛 파일도 읽힌다, 고칠 때 폴더는 그대로', () => {
  const dir = path.join(proj, '.claude', 'skills', 'legacy-one')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: legacy-one\ndescription: "옛 것"\n---\n본문\n')
  const old = listManuals([proj]).find((x) => x.name === 'legacy-one')!
  assert.equal(old.title, undefined)
  const edited = saveManual(base({ name: 'legacy-one', autoName: true, title: '새 이름' }), old.path)
  assert.equal(edited.name, 'legacy-one')
  assert.equal(edited.title, '새 이름')
})
