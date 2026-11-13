// 원격(휴대폰)에서 막은 설정이 비서 확인 카드로 바뀌는 빈틈: 카드 만들기·실행 모두 원격에서 막은 목록과 같게 막는다

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SecretaryDesk, type DeskDeps } from '../src/main/secretaryCore.ts'
import { REMOTE_BLOCKED_SETTINGS } from '../src/main/remoteGuard.ts'
import { runAsRemote } from '../src/main/remoteContext.ts'
import { V2_FIELDS, pickFields } from '../src/main/remote/v2.ts'

function setup(over: Partial<DeskDeps> = {}) {
  const calls: { method: string; args: unknown[] }[] = []
  let n = 0
  const desk = new SecretaryDesk({
    call: (method, args) => {
      calls.push({ method, args })
      return undefined
    },
    now: () => 1_800_000_000_000,
    newId: () => `card-${++n}`,
    currentText: () => '',
    applyEdit: () => ({ method: 'updateStaff', args: [] }),
    cardChanged: () => {},
    ...over,
  })
  return { desk, calls }
}

test('v2 허용 필드는 막는 목록과 같은 곳에서 온다', () => {
  const kept = pickFields('updateSettings', [Object.fromEntries([...REMOTE_BLOCKED_SETTINGS, 'language'].map((k) => [k, 1]))])[0] as Record<string, unknown>
  assert.deepEqual(Object.keys(kept), ['language'])
  assert.ok(V2_FIELDS.updateSettings)
})

for (const key of REMOTE_BLOCKED_SETTINGS) {
  test(`원격 질문: ${key} 카드를 만들지 않는다 (PC 앞 안내)`, () => {
    const { desk } = setup({ isRemote: () => true })
    const r = desk.propose({ title: '설정', steps: [{ method: 'updateSettings', args: [{ [key]: true }] }] })
    assert.ok('error' in r && r.error.includes('PC'))
  })
}

test('원격 질문: 묶음 안의 막힌 설정도 막는다', () => {
  const { desk } = setup({ isRemote: () => true })
  const r = desk.propose({ title: '설정', steps: [{ method: 'batch', items: [{ method: 'updateSettings', args: [{ isStaffCaptureOn: true }] }] }] })
  assert.ok('error' in r)
})

test('원격 질문이어도 막히지 않은 설정은 카드가 만들어진다', () => {
  const { desk } = setup({ isRemote: () => true })
  assert.ok('card' in desk.propose({ title: '설정', steps: [{ method: 'updateSettings', args: [{ language: 'ko' }] }] }))
})

test('PC 앞: 화면 캡처 허용 카드를 만들고 실행하면 그대로 바뀐다 (기존 동작)', async () => {
  const { desk, calls } = setup({ isRemote: () => false })
  const r = desk.propose({ title: '설정', steps: [{ method: 'updateSettings', args: [{ isStaffCaptureOn: true }] }] })
  assert.ok('card' in r)
  const done = await desk.run((r as { card: { id: string } }).card.id)
  assert.equal(done?.status, 'done')
  assert.deepEqual(calls, [{ method: 'updateSettings', args: [{ isStaffCaptureOn: true }] }])
})

test('PC에서 만든 카드를 원격에서 [실행]해도 막힌 설정은 실행되지 않는다', async () => {
  const { desk, calls } = setup()
  const r = desk.propose({ title: '설정', steps: [{ method: 'updateSettings', args: [{ defaultCwd: '/' }] }] })
  assert.ok('card' in r)
  const done = await runAsRemote(() => desk.run((r as { card: { id: string } }).card.id))
  assert.equal(done?.status, 'failed')
  assert.equal(calls.length, 0)
})
