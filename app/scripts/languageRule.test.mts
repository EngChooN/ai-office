import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setLang } from '../src/shared/i18n/index.ts'
import { withLanguageTurn, withLanguageTail, stripLanguageTurn } from '../src/main/ai/languageRule.ts'
import { t } from '../src/shared/i18n/index.ts'

test('지시마다 앱 언어 한 줄이 붙고 언어를 바꾸면 바로 따른다', () => {
  setLang('ko')
  assert.match(withLanguageTurn('Please review the PR'), /한국어/)
  setLang('en')
  assert.match(withLanguageTurn('보고해 주세요'), /English/)
  setLang('ja')
  assert.match(withLanguageTurn('x'), /日本語/)
  setLang('zh')
  assert.match(withLanguageTurn('x'), /简体中文/)
})

test('/명령은 건드리지 않고 기록에서는 알림을 뗀다', () => {
  setLang('ko')
  assert.equal(withLanguageTurn('/compact'), '/compact')
  const sent = withLanguageTurn('Review this')
  assert.equal(stripLanguageTurn(sent), 'Review this')
})

test('시스템 프롬프트 끝에도 반복되고, 규칙 본문은 도구 사이 진행 메모를 명시한다', () => {
  for (const l of ['ko', 'en', 'ja', 'zh'] as const) {
    setLang(l)
    assert.ok(withLanguageTail('BODY').endsWith(t('staff.languageTurn')))
    assert.ok(t('staff.language').length > 100)
  }
  setLang('ko')
  assert.match(t('staff.language'), /도구를 쓰는 사이/)
})
