// 페이블 모델: 화면 모델 목록(고용 창·직원 패널)의 순서·누락 방지와 실제 호출 이름 — npm test
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { CLAUDE_MODEL_ROWS, claudeModelName, usageDotsText, USAGE_DOTS } from '../src/renderer/features/modelOptions.ts'
import { CLAUDE_MODEL_CHOICES } from '../src/shared/slashCommands.ts'

const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('화면 목록 순서: 기본 → Fable → Opus → Sonnet → Haiku, 앱이 아는 Claude 모델이 하나도 빠지지 않는다', () => {
  assert.deepEqual(
    CLAUDE_MODEL_ROWS.map((r) => r.value),
    ['default', 'fable', 'opus', 'sonnet', 'haiku'],
  )
  assert.deepEqual([...CLAUDE_MODEL_ROWS.map((r) => r.value)].sort(), [...CLAUDE_MODEL_CHOICES].sort())
})

test('사용량 점: 기본은 점 없음, 나머지는 1~5칸이고 위에서 아래로 줄어든다, NEW는 Fable만', () => {
  const dots = CLAUDE_MODEL_ROWS.map((r) => r.dots)
  assert.equal(dots[0], 0)
  for (let i = 2; i < dots.length; i++) assert.ok(dots[i] <= dots[i - 1], `${i}`)
  for (const d of dots.slice(1)) assert.ok(d >= 1 && d <= USAGE_DOTS)
  assert.deepEqual(CLAUDE_MODEL_ROWS.filter((r) => r.isNew).map((r) => r.value), ['fable'])
  assert.equal(usageDotsText(3), '●●●○○')
  assert.equal(usageDotsText(0), '')
})

test('표기 이름: Fable(버전 숫자 없음), 모르는 값은 그대로', () => {
  assert.equal(claudeModelName('fable'), 'Fable')
  assert.equal(claudeModelName('gpt-6-sol'), 'gpt-6-sol')
})

test('실제 호출 이름은 claude-fable-5-1로 고정, 저장 규칙 목록(엔진·팩·불러오기)에 fable', () => {
  assert.match(src('src/main/ai/claude.ts'), /fable: 'claude-fable-5-1'/)
  assert.match(src('src/shared/engineModel.ts'), /CLAUDE_MODELS = new Set\(\['default', 'fable',/)
  assert.match(src('src/shared/staffPack.ts'), /'fable'/)
  assert.match(src('src/main/agents.ts'), /'fable'/)
})

test('고용 창·직원 패널은 같은 목록(modelOptions)을 쓴다 — 목록이 두 벌로 갈라지지 않게', () => {
  assert.match(src('src/renderer/features/ModelCards.tsx'), /from '\.\/modelOptions'/)
  assert.match(src('src/renderer/features/HireDialog.tsx'), /<ModelCards /)
  assert.match(src('src/renderer/features/StaffPanel.tsx'), /CLAUDE_MODEL_ROWS\.map/)
  assert.doesNotMatch(src('src/renderer/features/StaffPanel.tsx'), /\['default', 'opus'/)
})
