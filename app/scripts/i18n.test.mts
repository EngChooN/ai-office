// 다국어 사전 검사 — 4개 언어 누락·빈 번역·{변수} 불일치, 코드에서 쓰는 키가 사전에 있는지 — pnpm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { DICT, DICT_PARTS } from '../src/shared/i18n/dict/index.ts'
import { ACHIEVEMENTS, DAILY_POOL, SHOP_ITEMS, SHOP_SETS } from '../src/shared/economy.ts'
import { LEVEL_TABLE } from '../src/shared/officeLevel.ts'
import { ART_ITEM_IDS } from '../src/renderer/map/iso/isoArt.ts'
import { fill, langFromLocale, LANGS, resolveLang, setLang, t } from '../src/shared/i18n/index.ts'

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

test('모든 키에 ko·en·ja·zh 번역이 있고 비어 있지 않다', () => {
  for (const [key, e] of Object.entries(DICT)) {
    for (const l of LANGS) assert.ok(typeof e[l] === 'string' && e[l].trim() !== '', `${key}: ${l} 번역이 없어요`)
  }
})

test('번역마다 {변수} 이름이 한국어와 같다', () => {
  for (const [key, e] of Object.entries(DICT)) {
    for (const l of LANGS) assert.equal(vars(e[l]), vars(e.ko), `${key}: ${l}의 {변수}가 한국어와 달라요`)
  }
})

test('코드에서 t("키")로 쓴 키는 모두 사전에 있다', () => {
  const root = path.join(import.meta.dirname, '../src')
  const files: string[] = []
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory()) walk(path.join(d, f.name))
      else if (/\.(ts|tsx)$/.test(f.name) && !f.name.endsWith('.d.ts') && !d.includes(`${path.sep}i18n`)) files.push(path.join(d, f.name))
    }
  }
  walk(root)
  const missing: string[] = []
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) {
      if (!(m[1] in DICT)) missing.push(`${path.relative(root, f)}: ${m[1]}`)
    }
  }
  assert.deepEqual(missing, [])
})

test('기기 언어: 지원 언어면 따르고 아니면 영어, 설정이 있으면 설정이 먼저', () => {
  assert.equal(langFromLocale('ja-JP'), 'ja')
  assert.equal(langFromLocale('zh-Hans-CN'), 'zh')
  assert.equal(langFromLocale('ko_KR'), 'ko')
  assert.equal(langFromLocale('fr-FR'), 'en')
  assert.equal(langFromLocale(undefined), 'en')
  assert.equal(resolveLang('auto', 'ja-JP'), 'ja')
  assert.equal(resolveLang('zh', 'ko-KR'), 'zh')
  assert.equal(resolveLang(undefined, 'de'), 'en')
})

test('t()는 현재 언어로 바꾸고 {변수}를 채우며, 없는 키는 키 이름을 보여 준다', () => {
  setLang('en')
  assert.equal(t('common.cancel'), 'Cancel')
  assert.equal(t('common.cancel', undefined, 'ja'), 'キャンセル')
  setLang('ko')
  assert.equal(t('common.cancel'), '취소')
  assert.equal(fill('Lv.{n} {name}', { n: 3, name: 'A' }), 'Lv.3 A')
  assert.equal(t('nope.key' as never), 'nope.key')
})

test('가구·세트·미션·레벨 이름처럼 id로 찾는 번역도 모두 사전에 있다', () => {
  const need = [
    ...SHOP_ITEMS.flatMap((i) => [`item.${i.id}.name`, `item.${i.id}.desc`, ...(i.season ? [] : [])]),
    ...ART_ITEM_IDS.map((id) => `item.${id}.name`),
    ...SHOP_SETS.map((s) => `set.${s.id}`),
    ...[...DAILY_POOL, ...ACHIEVEMENTS].map((m) => `mission.${m.id}`),
    ...LEVEL_TABLE.flatMap((_, i) => [`level.${i + 1}`, `level.${i + 1}.unlock`]),
  ]
  assert.deepEqual(need.filter((k) => !(k in DICT)), [])
})

test('영어로 바꾸면 가구·레벨 이름도 영어로 나온다', () => {
  setLang('en')
  assert.equal(SHOP_ITEMS.find((i) => i.id === 'wall-cream')?.name, 'Cream paint')
  setLang('ko')
  assert.equal(SHOP_ITEMS.find((i) => i.id === 'wall-cream')?.name, '크림 페인트')
})

test('영역별 사전 파일끼리 같은 키를 두 번 쓰지 않는다', () => {
  const seen = new Map<string, string>()
  const dup: string[] = []
  for (const [part, d] of Object.entries(DICT_PARTS)) {
    for (const k of Object.keys(d)) {
      if (seen.has(k)) dup.push(`${k} (${seen.get(k)} · ${part})`)
      seen.set(k, part)
    }
  }
  assert.deepEqual(dup, [])
})
