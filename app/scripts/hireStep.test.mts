// 직원 추가 3단계 — 단계마다 '다음'을 누를 수 있는 조건 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hireStepValid } from '../src/shared/staffCard.ts'

test('직무를 골라야 1단계를 넘어간다 (직접 입력에서 비워 두면 못 넘어감)', () => {
  assert.equal(hireStepValid(0, { name: '', role: '디자이너' }, false), true)
  assert.equal(hireStepValid(0, { name: '', role: '  ' }, true), false)
})

test('이름이 있어야 2단계를 넘어간다', () => {
  assert.equal(hireStepValid(1, { name: '', role: 'QA' }, true), false)
  assert.equal(hireStepValid(1, { name: '김큐에이', role: 'QA' }, false), true)
})

test('마지막 단계는 고른 AI가 준비돼야 일을 시작할 수 있다', () => {
  assert.equal(hireStepValid(2, { name: '김큐에이', role: 'QA' }, false), false)
  assert.equal(hireStepValid(2, { name: '김큐에이', role: 'QA' }, true), true)
  assert.equal(hireStepValid(2, { name: '', role: 'QA' }, true), false)
})
