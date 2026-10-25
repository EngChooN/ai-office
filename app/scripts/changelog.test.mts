// 변경 기록은 4개 파일(CHANGELOG.md·.en·.ja·.zh)에 함께 쓴다 — 번역이 빠진 채 릴리스되면 여기서 실패한다
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { parseChangelog } from '../src/shared/changelogParse.ts'

const root = path.join(import.meta.dirname, '..', '..')
const read = (f: string) => parseChangelog(fs.readFileSync(path.join(root, f), 'utf8'))
const ko = read('CHANGELOG.md')
const bullets = (body: string) => body.split('\n').filter((l) => /^- /.test(l)).length

for (const lang of ['en', 'ja', 'zh']) {
  test(`CHANGELOG.${lang}.md: 한국어와 버전 목록·섹션 종류·항목 수가 같다`, () => {
    const other = read(`CHANGELOG.${lang}.md`)
    assert.deepEqual(other.map((r) => r.version), ko.map((r) => r.version), '버전 목록이 다릅니다 — 번역이 빠졌어요')
    for (const [i, r] of ko.entries()) {
      const o = other[i]
      assert.equal(o.date, r.date, `${r.version} 날짜`)
      assert.deepEqual(o.sections.map((s) => s.kind), r.sections.map((s) => s.kind), `${r.version} 섹션 종류`)
      assert.ok(!o.sections.some((s) => s.kind === 'other' && s.title), `${r.version} 알 수 없는 섹션 제목`)
      assert.deepEqual(o.sections.map((s) => bullets(s.body)), r.sections.map((s) => bullets(s.body)), `${r.version} 항목 수`)
    }
  })
}

test('한국어 변경 기록의 섹션 제목은 모두 종류로 읽힌다', () => {
  assert.ok(ko.length > 0)
  for (const r of ko) assert.ok(!r.sections.some((s) => s.kind === 'other' && s.title), `${r.version} 알 수 없는 섹션 제목`)
})
