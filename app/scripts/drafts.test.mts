// 작성 중인 글 임시 보관 (lib/drafts) — 페이지 이동 뒤 복원, 키 분리, 처음 값이면 지우기, 접두사 비우기
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setSyncSave, attachDraftStorage, flushDrafts, persistable, clearDraft, draftCount, draftState, fixInitial, ifUnchanged, keepNewer, pruneDrafts, readDraft, selectDraft, writeDraft } from '../src/renderer/lib/drafts.ts'

test('쓴 값은 같은 키로 다시 읽으면 돌아오고, 다른 키와 섞이지 않는다', () => {
  clearDraft('')
  writeDraft('chat:team-a:draft', '안녕', '')
  assert.equal(readDraft('chat:team-a:draft', ''), '안녕')
  assert.equal(readDraft('chat:team-b:draft', ''), '')
})

test('함수형 갱신은 보관된 값을 이어받는다 (채우기 신호가 쓰는 방식)', () => {
  clearDraft('')
  writeDraft('staff:s1:draft', '첫 줄', '')
  writeDraft<string>('staff:s1:draft', (prev) => `${prev}\n둘째 줄`, '')
  assert.equal(readDraft('staff:s1:draft', ''), '첫 줄\n둘째 줄')
})

test('처음 값으로 돌아가면 항목을 지운다 — 빈 글·빈 파일 목록·처음과 같은 폼·null', () => {
  clearDraft('')
  writeDraft('a', '글', '')
  writeDraft('a', '', '')
  writeDraft<unknown[]>('b', [1], [])
  writeDraft<unknown[]>('b', [], [])
  writeDraft('c', { x: 1 }, { x: 0 })
  writeDraft('c', { x: 0 }, { x: 0 })
  writeDraft<string | null>('d', '고치는 중', null)
  writeDraft<string | null>('d', null, null)
  assert.equal(draftCount(), 0)
})

test('고치는 중에 글을 다 지운 빈 칸은 처음 값(null)과 달라서 남는다', () => {
  clearDraft('')
  writeDraft<string | null>('staff:s1:guide', '', null)
  assert.equal(readDraft<string | null>('staff:s1:guide', null), '')
})

test('접두사로 비우면 그 대상의 글·첨부만 함께 지워진다', () => {
  clearDraft('')
  writeDraft('staff:s1:draft', '지시', '')
  writeDraft<unknown[]>('staff:s1:files', ['파일'], [])
  writeDraft('staff:s10:draft', '다른 직원', '')
  clearDraft('staff:s1:')
  assert.equal(readDraft('staff:s1:draft', ''), '')
  assert.deepEqual(readDraft<unknown[]>('staff:s1:files', []), [])
  assert.equal(readDraft('staff:s10:draft', ''), '다른 직원')
})

test('파일 객체는 복사하지 않고 그대로 보관한다 (보낼 때 그대로 올린다)', () => {
  clearDraft('')
  const file = new File(['abc'], 'a.txt', { type: 'text/plain' })
  writeDraft<File[]>('board:new:files', [file], [])
  assert.equal(readDraft<File[]>('board:new:files', [])[0], file)
})

test('처음 값은 같은 키에서 고정되고, 비어 있는 칸은 매번 같은 참조를 돌려준다 (끝없는 다시 그리기 방지)', () => {
  clearDraft('')
  const first = fixInitial({ key: 'k', initial: { a: 1 } }, 'k', { a: 1 })
  const again = fixInitial(first, 'k', { a: 1 })
  assert.equal(again, first)
  const pick = selectDraft('k', again.initial)
  assert.equal(pick(draftState()), pick(draftState()))
})

test('키가 바뀌면 처음 값을 새로 받고, 다시 그려도(재마운트) 키별 값이 돌아온다', () => {
  clearDraft('')
  writeDraft('chat:a:draft', 'A방 글', '')
  const fixed = fixInitial({ key: 'chat:a:draft', initial: '' }, 'chat:b:draft', '')
  assert.equal(fixed.key, 'chat:b:draft')
  assert.equal(selectDraft(fixed.key, fixed.initial)(draftState()), '')
  assert.equal(selectDraft('chat:a:draft', '')(draftState()), 'A방 글')
})

test('보내기 실패 되돌리기: 그새 새로 쓴 글·첨부·매뉴얼은 덮어쓰지 않는다', () => {
  assert.equal(keepNewer('', '보낸 글'), '보낸 글')
  assert.equal(keepNewer('새 글', '보낸 글'), '새 글')
  assert.deepEqual(keepNewer([], ['보낸 파일']), ['보낸 파일'])
  assert.deepEqual(keepNewer(['새 파일'], ['보낸 파일']), ['새 파일'])
  assert.deepEqual(keepNewer<{ name: string } | null>(null, { name: '보낸 매뉴얼' }), { name: '보낸 매뉴얼' })
})

test('직원 목록에서 빠진 직원의 칸만 정리하고, 다른 종류의 칸은 남긴다', () => {
  clearDraft('')
  writeDraft('staff:alive:draft', '남는 글', '')
  writeDraft('staff:gone:draft', '지울 글', '')
  writeDraft<unknown[]>('staff:gone:files', [1], [])
  writeDraft('chat:all:draft', '대화 글', '')
  pruneDrafts('staff', ['alive'])
  assert.equal(readDraft('staff:alive:draft', ''), '남는 글')
  assert.equal(readDraft('staff:gone:draft', ''), '')
  assert.equal(draftCount(), 2)
})

test('저장 대기 중 화면을 나갔다 와서 새로 쓰면, 늦게 끝난 저장이 새 글을 지우지 않는다', () => {
  clearDraft('')
  writeDraft('staff:s1:commit', '첫 메시지', '')
  const sent = readDraft('staff:s1:commit', '')
  // 저장을 기다리는 사이 다시 들어와 새로 쓴다
  writeDraft('staff:s1:commit', '새 메시지', '')
  writeDraft('staff:s1:commit', ifUnchanged(sent, ''), '')
  assert.equal(readDraft('staff:s1:commit', ''), '새 메시지')
  // 그대로였으면 비운다 (폼 객체도 내용으로 비교)
  writeDraft('schedule:form', { editingId: null, draft: { label: 'A' } }, null)
  const form = readDraft<unknown>('schedule:form', null)
  writeDraft<unknown>('schedule:form', ifUnchanged(structuredClone(form), null), null)
  assert.equal(readDraft('schedule:form', null), null)
  // 편집창(null = 닫힘)은 그새 더 고쳤으면 열린 채로
  writeDraft<string | null>('staff:s1:guide', '지침 v1', null)
  writeDraft<string | null>('staff:s1:guide', '지침 v2', null)
  writeDraft<string | null>('staff:s1:guide', ifUnchanged<string | null>('지침 v1', null), null)
  assert.equal(readDraft<string | null>('staff:s1:guide', null), '지침 v2')
})

function fakeStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

test('저장 대상은 비어 있지 않은 글뿐 — 첨부·폼·불리언·null은 빠진다', () => {
  const file = { name: 'a.png' }
  assert.deepEqual(persistable({ a: '글', b: '', c: [file], d: { x: 1 }, e: true, f: null, g: 'x'.repeat(200_001) }), { a: '글' })
})

test('글은 저장소에 적히고, 새로 켠 것처럼 불러오면 돌아온다 (첨부는 안 돌아온다)', () => {
  clearDraft('')
  const st = fakeStore()
  attachDraftStorage(st)
  writeDraft('staff:s1:draft', '쓰던 글', '')
  writeDraft<unknown[]>('staff:s1:files', [{ name: 'a.png' }], [])
  flushDrafts()
  const saved = JSON.parse(st.m.get('ai-office:drafts:v1')!)
  assert.deepEqual(saved, { 'staff:s1:draft': '쓰던 글' })
  clearDraft('')
  flushDrafts()
  assert.equal(st.m.size, 0)
  attachDraftStorage(fakeStore({ 'ai-office:drafts:v1': JSON.stringify(saved) }))
  assert.equal(readDraft('staff:s1:draft', ''), '쓰던 글')
  assert.equal(readDraft<unknown[]>('staff:s1:files', []).length, 0)
  clearDraft('')
  attachDraftStorage(null)
})

test('깨진 저장값·막힌 저장소여도 멈추지 않고, 이미 쓰는 값이 저장값보다 우선한다', () => {
  clearDraft('')
  attachDraftStorage(fakeStore({ 'ai-office:drafts:v1': '{깨짐' }))
  assert.equal(draftCount(), 0)
  writeDraft('a', '지금 글', '')
  attachDraftStorage(fakeStore({ 'ai-office:drafts:v1': JSON.stringify({ a: '옛 글', b: '다른 글' }) }))
  assert.equal(readDraft('a', ''), '지금 글')
  assert.equal(readDraft('b', ''), '다른 글')
  attachDraftStorage({ getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } })
  writeDraft('c', '글', '')
  flushDrafts()
  assert.equal(readDraft('c', ''), '글')
  clearDraft('')
  attachDraftStorage(null)
})

test('폰: 입력 이벤트 안에서 바로 저장 — 수동 flush 없이 입력 직후 전환해도 글이 남는다', () => {
  const st = fakeStore()
  attachDraftStorage(st)
  setSyncSave(true)
  writeDraft('staff:y:draft', '방금 쓴 글', '')
  assert.ok((st.getItem('ai-office:drafts:v1') ?? '').includes('방금 쓴 글'))
  clearDraft('staff:y:')
  setSyncSave(false)
  flushDrafts()
})
