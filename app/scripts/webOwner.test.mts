// 안드로이드 셸의 PC 전환: 다른 PC 설정은 지우고 글은 PC별로 남긴다 (lib/webOwner)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanForOwner, draftKey, ownerFromSearch, OWNER_KEY } from '../src/renderer/lib/webOwner.ts'

function fakeStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return {
    m,
    get length() { return m.size },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

test('주소의 pc·pcs를 읽고, 없으면 데스크톱 키', () => {
  assert.deepEqual(ownerFromSearch('?pc=a&pcs=a,b'), { pc: 'a', pcs: ['a', 'b'] })
  assert.equal(draftKey(''), 'ai-office:drafts:v1')
  assert.equal(draftKey('a'), 'ai-office:drafts:v1:a')
})

test('A→B→A: 설정은 PC마다 초기화되고 A의 글은 돌아온다', () => {
  const s = fakeStore({ 'ai-office:drafts:v1:a': 'A글', 'ui:theme': 'dark', [OWNER_KEY]: 'a' })
  cleanForOwner(s, 'b', ['a', 'b'])
  assert.equal(s.getItem('ui:theme'), null)
  assert.equal(s.getItem('ai-office:drafts:v1:a'), 'A글')
  s.setItem('ai-office:drafts:v1:b', 'B글')
  cleanForOwner(s, 'a', ['a', 'b'])
  assert.equal(s.getItem('ai-office:drafts:v1:a'), 'A글')
  assert.equal(s.getItem('ai-office:drafts:v1:b'), 'B글')
})

test('같은 PC로 다시 열면 설정을 지우지 않고, 끊은 PC의 글은 지운다', () => {
  const s = fakeStore({ 'ai-office:drafts:v1:a': 'A', 'ai-office:drafts:v1:x': 'X', 'ui:theme': 'dark', [OWNER_KEY]: 'a' })
  cleanForOwner(s, 'a', ['a'])
  assert.equal(s.getItem('ui:theme'), 'dark')
  assert.equal(s.getItem('ai-office:drafts:v1:x'), null)
  assert.equal(s.getItem('ai-office:drafts:v1:a'), 'A')
})

test('pc가 없으면(데스크톱) 아무것도 지우지 않는다', () => {
  const s = fakeStore({ 'ui:theme': 'dark' })
  cleanForOwner(s, '', [])
  assert.equal(s.getItem('ui:theme'), 'dark')
})
