// 직무 표시 이름 — 프리셋만 번역하고 직접 입력한 직무와 저장값은 그대로 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roleLabel } from '../src/shared/roleLabel.ts'
import { ROLE_PRESETS } from '../src/shared/types.ts'
import { LANGS, setLang, t } from '../src/shared/i18n/index.ts'

test('프리셋 8개는 언어마다 번역되고 ko는 저장값과 같다', () => {
  for (const lang of LANGS) {
    setLang(lang)
    for (const r of ROLE_PRESETS) assert.ok(roleLabel(r), `${lang}: ${r}`)
    // 비개발자용 설명을 덧붙여 보여 주는 직무·이름을 바꿔 보여 주는 직무(팀장 → 리더, v1.3.2)는 저장값과 표시가 다르다
    const EXPLAINED = new Set(['QA', '리서처', '팀장'])
    if (lang === 'ko') for (const r of ROLE_PRESETS) if (!EXPLAINED.has(r)) assert.equal(roleLabel(r), r)
  }
  setLang('en')
  assert.equal(roleLabel('프론트엔드 개발자'), 'Frontend developer')
  setLang('ko')
})

test('팀장은 조직도 카드의 리더 표시(orgCard.face.lead)와 같다', () => {
  for (const lang of LANGS) {
    setLang(lang)
    assert.equal(roleLabel('팀장'), t('orgCard.face.lead'))
  }
  setLang('ko')
})

test('직접 입력한 직무는 그대로 보여 준다', () => {
  setLang('ja')
  assert.equal(roleLabel('데이터 엔지니어'), '데이터 엔지니어')
  assert.equal(roleLabel(''), '')
  setLang('ko')
})
