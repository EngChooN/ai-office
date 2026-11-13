// 토큰 절약: 이번 주 아끼기 Top 3 고르기 · 토큰 절약 모드 고용 기본값 — npm test
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { hireDefaults, pickSavers, saverFor } from '../src/shared/tokenSaving.ts'
import { SECRETARY_ID, type PayslipRow, type Staff } from '../src/shared/types.ts'

type S = Parameters<typeof pickSavers>[1][number]
const staff = (id: string, patch: Partial<S> = {}): S => ({ id, kind: 'hired', provider: 'claude', model: 'sonnet', ...patch })
const row = (staffId: string, tokens: number): PayslipRow => ({ staffId, name: staffId, role: '', avatar: 0, costUsd: 0, tokensIn: tokens, tokensOut: 0, tasksDone: 0 })
const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('토큰 많이 쓴 순으로 3명만', () => {
  const list = ['a', 'b', 'c', 'd'].map((id) => staff(id, { model: 'opus' }))
  const top = pickSavers([row('a', 10), row('b', 40), row('c', 30), row('d', 20)], list)
  assert.deepEqual(
    top.map((s) => s.staffId),
    ['b', 'c', 'd'],
  )
  assert.equal(top[0].tokens, 40)
})

test('토큰은 입력+출력 합', () => {
  const [s] = pickSavers([{ ...row('a', 5), tokensOut: 7 }], [staff('a', { model: 'opus' })])
  assert.equal(s.tokens, 12)
})

test('이유는 실제 값: Opus → Sonnet 한 단계, 기억 최대·길게 → 보통', () => {
  assert.deepEqual(saverFor(staff('a', { model: 'opus' })), { reason: 'opus', action: { kind: 'model', from: 'opus', to: 'sonnet' } })
  assert.deepEqual(saverFor(staff('a', { memory: 'full' })), { reason: 'memoryFull', action: { kind: 'memory', from: 'full', to: 'normal' } })
  assert.deepEqual(saverFor(staff('a', { memory: 'long' })), { reason: 'memoryLong', action: { kind: 'memory', from: 'long', to: 'normal' } })
})

test('Fable → Opus 한 단계 (Opus → Sonnet은 그대로), Codex는 제외', () => {
  assert.deepEqual(saverFor(staff('a', { model: 'fable' })), { reason: 'fable', action: { kind: 'model', from: 'fable', to: 'opus' } })
  assert.deepEqual(saverFor(staff('a', { model: 'fable', memory: 'full' }))?.action, { kind: 'model', from: 'fable', to: 'opus' })
  assert.equal(saverFor(staff('a', { provider: 'codex', model: 'fable' })), null)
})

test('[아끼기] 안내 문구는 낮출 모델 이름을 변수로 받는다 (Fable → Opus가 Sonnet으로 안내되지 않게)', () => {
  assert.match(src('src/shared/i18n/dict/tokenSaving.ts'), /'tokenSaver\.hint\.model'[\s\S]*?\{to\}/)
  assert.match(src('src/renderer/features/TokenSaverTop3.tsx'), /tokenSaver\.hint\.model', \{ to:/)
})

test('둘 다 해당하면 모델 먼저, 바꿀 것은 하나', () => {
  assert.deepEqual(saverFor(staff('a', { model: 'opus', memory: 'full' }))?.action, { kind: 'model', from: 'opus', to: 'sonnet' })
})

test('default 모델·Codex는 모델 낮추기를 숨기고 기억만 본다', () => {
  assert.equal(saverFor(staff('a', { model: 'default' })), null)
  assert.equal(saverFor(staff('a', { provider: 'codex', model: 'opus' })), null)
  assert.equal(saverFor(staff('a', { provider: 'codex', model: 'gpt-5' })), null)
  assert.equal(saverFor(staff('a', { provider: 'codex', model: 'default', memory: 'long' }))?.action.kind, 'memory')
})

test('이미 Haiku·Sonnet이고 기억이 보통·짧게면 숨김', () => {
  assert.equal(saverFor(staff('a', { model: 'haiku' })), null)
  assert.equal(saverFor(staff('a', { model: 'sonnet', memory: 'normal' })), null)
  assert.equal(saverFor(staff('a', { model: 'haiku', memory: 'short' })), null)
  assert.equal(saverFor(staff('a', { memory: undefined })), null)
})

test('빈 데이터·비서·퇴사자·외부·0토큰은 빠진다', () => {
  assert.deepEqual(pickSavers([], []), [])
  assert.deepEqual(pickSavers([row('a', 10)], []), [])
  const list = [staff('x', { kind: 'external', model: 'opus' }), staff('z', { model: 'opus' })]
  assert.deepEqual(pickSavers([row(SECRETARY_ID, 99), row('x', 50), row('z', 0), row('gone', 30)], list), [])
})

test('토큰 절약 모드 기본값: 켜면 Haiku + 짧게, Codex는 기억만, 끄면 없음', () => {
  assert.deepEqual(hireDefaults(true, 'claude'), { model: 'haiku', memory: 'short' })
  assert.deepEqual(hireDefaults(true, 'codex'), { memory: 'short' })
  assert.deepEqual(hireDefaults(false, 'claude'), {})
  assert.deepEqual(hireDefaults(undefined, 'codex'), {})
})

test('절약 모드는 고용 창 초기값과 office.hire의 빈 값에만 쓰인다 (기존 직원 updateStaff는 그대로)', () => {
  assert.match(src('src/renderer/features/HireDialog.tsx'), /hireDefaults\(settings\.tokenSaverMode, provider\)/)
  const office = src('src/main/office.ts')
  assert.match(office, /input\.model \|\| \(saver\.model \?\? 'default'\)/)
  assert.match(office, /input\.memory \?\? saver\.memory/)
  assert.equal(office.match(/tokenSaverMode/g)?.length, 1)
})
