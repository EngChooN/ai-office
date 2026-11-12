// 장비 카드 [막기·결재 받기·결재 없이] — 저장 형식이 예전 권한 묶음 칩과 같은지 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { changedRows, levelOf, POLICY_ROWS, policyLevels, policyRow, withLevel, type PolicyRow } from '../src/shared/toolPolicyRows.ts'
import { READ_ONLY_BASH, RISKY_BASH } from '../src/shared/bashPolicy.ts'

type Lists = { allowedTools: string[]; disallowedTools: string[] }
const eq = (allowedTools: string[] = [], disallowedTools: string[] = []): Lists => ({ allowedTools, disallowedTools })
const sorted = (e: Lists) => ({ allowedTools: [...e.allowedTools].sort(), disallowedTools: [...e.disallowedTools].sort() })

// 1.2.0 EquipmentTab의 togglePreset 그대로 (켤 때 반대 묶음을 함께 푼다)
function oldToggle(e: Lists, p: { allow?: readonly string[]; deny?: readonly string[] }): Lists {
  const on = (p.allow ?? []).every((x) => e.allowedTools.includes(x)) && (p.deny ?? []).every((x) => e.disallowedTools.includes(x))
  return {
    allowedTools: on ? e.allowedTools.filter((x) => !p.allow?.includes(x)) : [...new Set([...e.allowedTools.filter((x) => !p.deny?.includes(x)), ...(p.allow ?? [])])],
    disallowedTools: on ? e.disallowedTools.filter((x) => !p.deny?.includes(x)) : [...new Set([...e.disallowedTools.filter((x) => !p.allow?.includes(x)), ...(p.deny ?? [])])],
  }
}

test('행마다 고를 수 있는 칸: 묶음이 없는 칸은 뺀다', () => {
  assert.deepEqual(policyLevels(policyRow('web')), ['block', 'ask', 'auto'])
  assert.deepEqual(policyLevels(policyRow('shell')), ['block', 'ask', 'auto'])
  // 파일 수정·화면 찍기·보기만 하는 실행은 '막기' 묶음이 없다 (새 기능을 만들지 않는다)
  assert.deepEqual(policyLevels(policyRow('edit')), ['ask', 'auto'])
  assert.deepEqual(policyLevels(policyRow('capture')), ['ask', 'auto'])
  assert.deepEqual(policyLevels(policyRow('readOnly')), ['ask', 'auto'])
  assert.deepEqual(policyLevels(policyRow('risky')), ['block', 'ask'])
})

test('칸을 고른 결과가 예전 칩을 켠 결과와 같다 (저장 형식 불변)', () => {
  const start = eq(['mcp__notion', 'Bash'], ['WebSearch', RISKY_BASH])
  for (const row of POLICY_ROWS) {
    if (row.allow) {
      const before = withLevel(start, row, row.deny ? 'block' : 'ask')
      assert.deepEqual(sorted(withLevel(before, row, 'auto')), sorted(oldToggle(before, { allow: row.allow })), `${row.id} 결재 없이`)
    }
    if (row.deny) {
      const before = withLevel(start, row, row.allow ? 'auto' : 'ask')
      assert.deepEqual(sorted(withLevel(before, row, 'block')), sorted(oldToggle(before, { deny: row.deny })), `${row.id} 막기`)
    }
  }
})

test('칸 고르기 ↔ levelOf 왕복, 다른 행·연결 서비스 값은 그대로', () => {
  const base = eq(['mcp__notion', READ_ONLY_BASH], [RISKY_BASH])
  for (const row of POLICY_ROWS) {
    for (const level of policyLevels(row)) {
      const next = withLevel(base, row, level)
      assert.equal(levelOf(next, row), level, `${row.id} ${level}`)
      assert.ok(next.allowedTools.includes('mcp__notion'))
      for (const other of POLICY_ROWS.filter((r: PolicyRow) => r.id !== row.id)) assert.equal(levelOf(next, other), levelOf(base, other), `${row.id}→${other.id}`)
    }
  }
})

test('옛 값이 칸 하나로 안 정해지면 직접 고름 — 누르기 전엔 바꾸지 않는다', () => {
  assert.equal(levelOf(eq(['Edit']), policyRow('edit')), 'custom')
  assert.equal(levelOf(eq(['WebSearch'], ['WebFetch']), policyRow('web')), 'custom')
  assert.equal(levelOf(eq(['Bash'], ['Bash']), policyRow('shell')), 'custom')
  assert.equal(levelOf(eq(), policyRow('web')), 'ask')
  // 누르면 그 칸으로 정리된다
  assert.deepEqual(withLevel(eq(['WebSearch'], ['WebFetch']), policyRow('web'), 'ask'), eq())
})

test('바꾼 행 수', () => {
  const a = eq()
  const b = withLevel(withLevel(a, policyRow('web'), 'block'), policyRow('edit'), 'auto')
  assert.equal(changedRows(a, b), 2)
  assert.equal(changedRows(b, b), 0)
})

test('같은 칸을 다시 고르면 장비를 그대로 돌려준다 (저장 버튼이 켜지지 않게)', () => {
  for (const row of POLICY_ROWS) {
    for (const level of policyLevels(row)) {
      const once = withLevel({ allowedTools: ['X'], disallowedTools: ['Y'] }, row, level)
      if (levelOf(once, row) !== level) continue
      assert.equal(withLevel(once, row, level), once)
    }
  }
})
