// 비서 파일 열기: 원격에서는 카드를 만들 때도, PC에서 만든 카드를 휴대폰에서 [실행]할 때도 막힌다 (한리뷰 6-1)

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SecretaryDesk } from '../src/main/secretaryCore.ts'
import { REMOTE_BLOCKED_METHODS } from '../src/main/remoteGuard.ts'
import { runAsRemote } from '../src/main/remoteContext.ts'
import { V2_METHODS } from '../src/main/remote/v2.ts'
import { stepRisk, describeLines } from '../src/main/secretaryDescribe.ts'

function setup(isRemote = false) {
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
    isRemote: () => isRemote,
  })
  return { desk, calls }
}
const step = { method: 'openFoundFile' as const, args: ['ff_abc', 'open'] }

test('원격 차단 목록에 파일 열기가 있고, v2에서도 PC 전용이다', () => {
  assert.ok((REMOTE_BLOCKED_METHODS as readonly string[]).includes('openFoundFile'))
  assert.equal(V2_METHODS.openFoundFile.cls, 'P')
})
test('원격 질문: 파일 열기 카드를 만들지 않는다', () => {
  const r = setup(true).desk.propose({ title: '열기', steps: [step] })
  assert.ok('error' in r && r.error.includes('PC'))
})
test('원격 질문: 묶음 안의 파일 열기도 막는다', () => {
  const r = setup(true).desk.propose({ title: '열기', steps: [{ method: 'batch', items: [step] }] })
  assert.ok('error' in r)
})
test('PC에서 만든 카드를 휴대폰에서 [실행]하면 실패하고 아무것도 열리지 않는다', async () => {
  const { desk, calls } = setup(false)
  const r = desk.propose({ title: '열기', steps: [step] })
  assert.ok('card' in r)
  const done = await runAsRemote(() => desk.run((r as { card: { id: string } }).card.id))
  assert.notEqual(done?.status, 'done')
  assert.deepEqual(calls, [])
})
test('PC 앞: 카드를 거쳐 실행하면 연다', async () => {
  const { desk, calls } = setup(false)
  const r = desk.propose({ title: '열기', steps: [step] })
  assert.ok('card' in r)
  assert.equal((r as { card: { status: string } }).card.status, 'pending')
  assert.deepEqual(calls, [])
  const done = await desk.run((r as { card: { id: string } }).card.id)
  assert.equal(done?.status, 'done')
  assert.deepEqual(calls, [step])
})
test('확인 카드: 위험도는 주의, 폴더 보기와 열기 문구가 갈린다', () => {
  assert.equal(stepRisk('openFoundFile', ['x', 'open']).risk, 'caution')
  const text = (how: string) => JSON.stringify(describeLines('openFoundFile', ['x', how], () => 'a.pdf (첨부 파일)'))
  assert.ok(text('open').includes('secretary.d.openFile'))
  assert.ok(text('reveal').includes('secretary.d.revealFile'))
})
