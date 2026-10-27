// 회사 지식 창고: 입력 다듬기·관련 지식 고르기·짧은 안내 단위 테스트 — npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { KNOWLEDGE_BRIEF_MAX, KNOWLEDGE_PICK, knowledgeBrief, normalizeKnowledge, pickKnowledge, terms, type KnowledgeEntry } from '../src/shared/knowledge.ts'
import { setLang } from '../src/shared/i18n/index.ts'

setLang('ko')

const entry = (id: string, over: Partial<KnowledgeEntry> = {}): KnowledgeEntry => ({ id, kind: 'learning', title: id, body: '', tags: [], staffId: null, staffName: '', docPath: null, createdAt: 0, updatedAt: 0, ...over })

test('입력 다듬기: 빈 제목·내용·틀린 종류는 거절, 태그는 중복·# 정리', () => {
  assert.equal(normalizeKnowledge({ kind: 'learning', title: ' ', body: 'x' }), null)
  assert.equal(normalizeKnowledge({ kind: 'nope' as 'learning', title: 'a', body: 'b' }), null)
  const n = normalizeKnowledge({ kind: 'feedback', title: ' 제목 ', body: '내용', tags: ['#빌드', '빌드', ' ', 'a', 'b', 'c', 'd', 'e'] })
  assert.deepEqual(n, { kind: 'feedback', title: '제목', body: '내용', tags: ['빌드', 'a', 'b', 'c', 'd'], docPath: null })
})

test('낱말: 한글은 두 글자씩 겹치게, 영문은 2글자 이상', () => {
  assert.deepEqual([...terms('빌드가 a Build')], ['빌드', '드가', 'build'])
})

test('고르기: 관련 있는 것만 점수 순(같으면 최근), 상위 몇 개', () => {
  const list = [
    entry('old', { title: '윈도우 빌드 주의', body: '서명 없이 빌드하면 경고', updatedAt: 1 }),
    entry('new', { title: '윈도우 빌드 순서', body: 'npm run make 전에 정리', updatedAt: 2 }),
    entry('tag', { title: '무관한 제목', body: '내용', tags: ['윈도우', '빌드'], updatedAt: 0 }),
    entry('off', { title: '안드로이드 연결', body: 'QR로 붙인다', updatedAt: 9 }),
  ]
  const picked = pickKnowledge(list, '윈도우 빌드 고치기')
  assert.deepEqual(
    picked.map((e) => e.id),
    ['tag', 'new', 'old'],
  )
  assert.ok(picked.length <= KNOWLEDGE_PICK)
  assert.deepEqual(pickKnowledge(list, '전혀 다른 일'), [])
  assert.deepEqual(pickKnowledge(list, ''), [])
})

test('짧은 안내: 없으면 빈 문자열, 길이 상한, 연결 문서는 경로만', () => {
  assert.equal(knowledgeBrief([]), '')
  const long = Array.from({ length: 10 }, (_, i) => entry(`e${i}`, { title: `제목${i}`, body: '가'.repeat(500), docPath: i === 0 ? '/p/SPEC.md' : null }))
  const brief = knowledgeBrief(long)
  assert.ok(brief.length <= KNOWLEDGE_BRIEF_MAX, String(brief.length))
  assert.ok(brief.includes('[회사 지식 창고]'))
  assert.ok(brief.includes('`/p/SPEC.md`'))
  assert.ok(!brief.includes('가'.repeat(200)), '내용은 한 줄로 줄인다')
})
