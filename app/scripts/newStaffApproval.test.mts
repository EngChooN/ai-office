// 새 직원 기본 결재 방식: PC는 '파일 수정만 자동', 휴대폰·외부 연동 직원은 '모두 결재' — npm test
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { newStaffApprovalMode } from '../src/shared/types.ts'

const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('새 직원 기본 결재: PC는 acceptEdits, 휴대폰은 ask', () => {
  assert.equal(newStaffApprovalMode(false), 'acceptEdits')
  assert.equal(newStaffApprovalMode(true), 'ask')
})

test('고용 폼·외부 직원 정식 채용 폼은 이 기본값으로 시작한다', () => {
  assert.match(src('src/renderer/features/HireDialog.tsx'), /approvalMode: newStaffApprovalMode\(IS_REMOTE_SCREEN\)/)
  assert.match(src('src/renderer/features/StaffPanel.tsx'), /useState<ApprovalMode>\(newStaffApprovalMode\(IS_REMOTE_SCREEN\)\)/)
})

test('외부 연동 직원·팩으로 들인 직원은 그대로 모두 결재', () => {
  assert.doesNotMatch(src('src/main/external.ts'), /approvalMode: 'acceptEdits'/)
  assert.match(src('src/main/external.ts'), /approvalMode: 'ask'/)
  assert.match(src('src/main/staffPack.ts'), /approvalMode: 'ask'/)
})
