// 변경 기록은 4개 파일(CHANGELOG.md·.en·.ja·.zh)에 함께 쓴다 — 번역이 빠진 채 릴리스되면 여기서 실패한다
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { parseChangelog, parseSections, summaryItems } from '../src/shared/changelogParse.ts'
import { compareVersions } from '../src/shared/updateCheck.ts'

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

// '한눈에 보기'(버전 맨 위 요약)는 이 버전부터 꼭 쓴다 — 그 전 버전은 요약 없이 상세만 보여 준다
const SUMMARY_FROM = '1.3.0'
const SUMMARY_LINES = { min: 3, max: 5 }
/** 요약 한 줄 길이 상한 — 한국어는 작성 규칙(35자), 번역은 느슨하게 */
const SUMMARY_MAX_CHARS: Record<string, number> = { ko: 35, en: 80, ja: 45, zh: 35 }
const needsSummary = (version: string) => (compareVersions(version, SUMMARY_FROM) ?? -1) >= 0

for (const lang of ['ko', 'en', 'ja', 'zh']) {
  test(`${lang}: ${SUMMARY_FROM}부터 '한눈에 보기'가 상세 앞에 3~5줄, 줄마다 종류 말이 붙는다`, () => {
    const list = lang === 'ko' ? ko : read(`CHANGELOG.${lang}.md`)
    for (const r of list.filter((x) => needsSummary(x.version))) {
      const titled = r.sections.filter((s) => s.title)
      assert.equal(titled[0]?.kind, 'summary', `${r.version} 요약이 첫 섹션이 아님`)
      assert.equal(r.sections.filter((s) => s.kind === 'summary').length, 1, `${r.version} 요약은 하나`)
      const items = summaryItems(titled[0].body)
      assert.ok(items.length >= SUMMARY_LINES.min && items.length <= SUMMARY_LINES.max, `${r.version} 요약 ${items.length}줄`)
      for (const item of items) {
        assert.ok(item.kind, `${r.version} 종류 말이 없는 요약 줄: ${item.text}`)
        assert.ok(item.text.length <= SUMMARY_MAX_CHARS[lang], `${r.version} 요약 줄이 김(${item.text.length}자): ${item.text}`)
        assert.ok(!/`/.test(item.text), `${r.version} 요약에 코드 서식: ${item.text}`)
      }
    }
  })
}

test('요약 줄의 종류 순서가 4개 언어에서 같다', () => {
  const kinds = (list: ReturnType<typeof read>, version: string) => summaryItems(list.find((r) => r.version === version)?.sections.find((s) => s.kind === 'summary')?.body ?? '').map((i) => i.kind)
  for (const lang of ['en', 'ja', 'zh']) {
    const other = read(`CHANGELOG.${lang}.md`)
    for (const r of ko.filter((x) => needsSummary(x.version))) assert.deepEqual(kinds(other, r.version), kinds(ko, r.version), `${lang} ${r.version}`)
  }
})

test('parseSections: 요약 제목 4개 언어·기기 안내·종류 말 읽기', () => {
  for (const title of ['한눈에 보기', 'At a glance', 'ひと目で', '一览']) assert.equal(parseSections(`### ${title}\n- **New** a`)[0].kind, 'summary', title)
  const secs = parseSections('PC 앱 전용: 무엇\n\n### 한눈에 보기\n- **새 기능** 가\n- **수정** 나\n- 표시 없음\n\n### 새 기능\n- 상세')
  assert.deepEqual(secs.map((s) => s.kind), ['other', 'summary', 'feature'])
  assert.equal(secs[0].title, '')
  assert.deepEqual(summaryItems(secs[1].body), [
    { kind: 'feature', text: '가' },
    { kind: 'fix', text: '나' },
    { kind: null, text: '표시 없음' },
  ])
  assert.deepEqual(summaryItems('- **모르는 말** 다'), [{ kind: null, text: '**모르는 말** 다' }])
})
