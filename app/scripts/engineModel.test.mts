import test from 'node:test'
import assert from 'node:assert/strict'
import { engineGuide, fitEngineModel, isEngineMismatch } from '../src/shared/engineModel.ts'

test('Claude 엔진에 GPT 모델이 오면 GPT 엔진으로 맞춘다', () => {
  assert.deepEqual(fitEngineModel('claude', 'gpt-6-sol'), { provider: 'codex', model: 'gpt-6-sol' })
  assert.deepEqual(fitEngineModel(undefined, 'sonnet'), { provider: 'claude', model: 'sonnet' })
  assert.deepEqual(fitEngineModel('claude', 'whatever'), { provider: 'claude', model: 'default' })
})
test('GPT 엔진에 Claude 별칭이 오면 기본 모델', () => {
  assert.deepEqual(fitEngineModel('codex', 'opus'), { provider: 'codex', model: 'default' })
  assert.deepEqual(fitEngineModel('codex', 'gpt-6-sol'), { provider: 'codex', model: 'gpt-6-sol' })
})
test('어긋난 저장 값 판별', () => {
  assert.equal(isEngineMismatch('claude', 'gpt-6-sol'), true)
  assert.equal(isEngineMismatch('codex', 'haiku'), true)
  assert.equal(isEngineMismatch('codex', 'default'), false)
})
test('엔진 안내는 GPT가 연결됐을 때만', () => {
  const st = (state: string) => ({ claude: {}, codex: { state, models: ['gpt-6-sol'], defaultModel: 'gpt-6-sol' } }) as never
  assert.equal(engineGuide(st('notInstalled')), '')
  assert.match(engineGuide(st('ready')), /"gpt-6-sol"/)
})

import { defaultProvider } from '../src/shared/engineModel.ts'
test('Codex만 연결되면 기본 엔진은 codex', () => {
  const st = (c: string, x: string) => ({ claude: { state: c }, codex: { state: x } }) as never
  assert.equal(defaultProvider(st('notInstalled', 'ready')), 'codex')
  assert.equal(defaultProvider(st('ready', 'ready')), 'claude')
  assert.equal(defaultProvider(null), 'claude')
})
