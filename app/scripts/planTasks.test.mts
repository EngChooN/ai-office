// 기획안이 묶을 보드 카드 찾기 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decisionSections } from '../src/shared/meetingDecisions.ts'
import { isAbsorbedOpen, matchAbsorbed, meetingCardItems, meetingResultCard, pickPlanCard, uniqueById } from '../src/shared/planTasks.ts'

const card = (id: string, title: string, status: 'todo' | 'doing' | 'review' | 'done' = 'todo', parentId: string | null = null) => ({ id, title, status, parentId })

test('제목이 같거나 포함되면 묶고(정확히 같은 제목이 우선), 못 찾으면 알려 준다', () => {
  const cards = [card('a', '층 타입 공유 및 레벨 테이블 설계'), card('b', '외관 에셋 제작'), card('c', 'QA 시나리오 작성'), card('d', 'QA 시나리오 작성 (2차)')]
  const r = matchAbsorbed(['층 타입 공유 및 레벨 테이블 설계', '외관 에셋', 'QA 시나리오 작성', '없는 카드', ' '], cards, 'self')
  assert.deepEqual(r.ids, ['a', 'b', 'c'])
  assert.deepEqual(r.unmatched, ['없는 카드'])
})

test('여러 장이 걸리면 정확히 같은 제목만 인정한다', () => {
  const r = matchAbsorbed(['QA'], [card('c', 'QA 시나리오'), card('d', 'QA 체크리스트')], 'self')
  assert.deepEqual(r, { ids: [], unmatched: ['QA'] })
})

test('시작했거나 이미 하위인 카드, 기획 카드 자신은 묶지 않는다', () => {
  const cards = [card('self', '사무실 개편'), card('x', '사무실 개편 설계', 'doing'), card('y', '사무실 개편 디자인', 'todo', 'other'), card('z', '사무실 개편 QA')]
  assert.deepEqual(matchAbsorbed(['사무실 개편 설계', '사무실 개편 디자인', '사무실 개편 QA', '사무실 개편'], cards, 'self'), { ids: ['z'], unmatched: ['사무실 개편 설계', '사무실 개편 디자인'] })
})

test('같은 카드를 두 번 적어도 한 번만', () => {
  assert.deepEqual(matchAbsorbed(['외관', '외관 에셋'], [card('b', '외관 에셋 제작')], 'self').ids, ['b'])
})

test('묶인 카드는 끝나기 전까지 보드에서 숨긴다', () => {
  const parent = { plan: { absorbedIds: ['a'] } } as never
  assert.equal(isAbsorbedOpen({ id: 'a', status: 'todo', parentId: 'p' }, parent), true)
  assert.equal(isAbsorbedOpen({ id: 'a', status: 'done', parentId: 'p' }, parent), false)
  assert.equal(isAbsorbedOpen({ id: 'b', status: 'todo', parentId: 'p' }, parent), false)
  assert.equal(isAbsorbedOpen({ id: 'a', status: 'todo', parentId: null }, undefined), false)
})

test('회의 결과 카드: 주제 첫 줄로 제목, 할 일 번호 목록과 회의록을 담는다', () => {
  const card = meetingResultCard('안드로이드 앱 출시 회의이고, 랩 인원중에 개발에 필요한 사람만 업무를 할당하면 됨\n자세한 구상', '결론: APK로 배포', [
    { title: '기획서 작성', assignee: '김기획' },
    { title: '시안 제작', assignee: null },
  ])
  const head = '안드로이드 앱 출시 회의이고, 랩 인원중에 개발에 필요한 사람만 업무를 할당하면 됨'
  assert.equal(card.title, `회의 결과: ${head.slice(0, 40)}…`)
  assert.equal(meetingResultCard('짧은 회의', '', []).title, '회의 결과: 짧은 회의')
  assert.match(card.detail, /1\. 기획서 작성 \(담당 제안: 김기획\)\n2\. 시안 제작/)
  assert.match(card.detail, /## 회의록\n결론: APK로 배포/)
  assert.match(card.detail, /propose_plan/)
})

const received = (id: string, title: string, plan: unknown = null) => ({ id, title, plan })

test('같은 카드가 두 번 들어와도 받은 업무는 한 장이다 (제목이 같아도 id 기준)', () => {
  const a = received('a', '회의 결과: 협업 흐름')
  assert.deepEqual(uniqueById([a, a, received('b', '회의 결과: 협업 흐름')]).map((t) => t.id), ['a', 'b'])
  // 중복으로 쌓였던 카드 한 장 → 기획안은 그 카드로 들어간다 ("업무를 여러 개 받았습니다"로 막히지 않음)
  assert.deepEqual(pickPlanCard([a, a], {}), { card: a })
  assert.deepEqual(pickPlanCard([a, a], { title: '새 기획' }), { card: a })
})

test('title만 주면 여러 업무를 받았어도 새 카드로 올린다', () => {
  const a = received('a', '업무 A')
  const b = received('b', '업무 B')
  assert.deepEqual(pickPlanCard([a, b], { title: '전혀 다른 새 업무' }), { card: null })
  assert.deepEqual(pickPlanCard([a, b], { title: '업무 B' }), { card: b })
  assert.deepEqual(pickPlanCard([], { title: '새 업무' }), { card: null })
  // 같은 턴에 먼저 올린 기획 카드는 덮어쓰지 않는다
  assert.deepEqual(pickPlanCard([received('a', '업무 A', { status: 'waiting' })], { title: '두 번째 기획' }), { card: null })
  // 대표가 "다시"를 누른 뒤 제목을 바꿔 고쳐 올려도 같은 카드에 들어간다
  const revised = received('a', '업무 A', { status: 'revise' })
  assert.deepEqual(pickPlanCard([revised], { title: '완전히 다른 제목' }), { card: revised })
})

test('task로 카드를 고르고, 여러 업무인데 가리키지 않으면 물어본다', () => {
  const a = received('a', '업무 A')
  const b = received('b', '업무 B')
  assert.deepEqual(pickPlanCard([a, b], { task: '업무 A' }), { card: a })
  assert.match((pickPlanCard([a, b], { task: '없는 업무' }) as { error: string }).error, /하나로 찾지 못했습니다/)
  assert.match((pickPlanCard([a, b], {}) as { error: string }).error, /업무를 여러 개 받았습니다: "업무 A", "업무 B"/)
  assert.deepEqual(pickPlanCard([a], {}), { card: a })
  assert.deepEqual(pickPlanCard([], {}), { card: null })
})

test('회의 결과 카드에 든 할 일 제목을 뽑는다 (낱장 카드가 없어 absorbs로 찾지 않는다)', () => {
  const card = meetingResultCard('협업 흐름', '결론: 진행', [
    { title: '결정 원문 저장', assignee: '박패턴' },
    { title: '위임 라벨 (주황)', assignee: null },
  ])
  assert.deepEqual(meetingCardItems(card.detail), ['결정 원문 저장', '위임 라벨 (주황)'])
  assert.match(card.detail, /absorbs에 적지 않아도/)
  assert.deepEqual(meetingCardItems('그냥 카드 설명'), [])
})

test('회의 결과 카드 = 기획안 초안: 결정 세 섹션 → 할 일(담당 제안) → 회의록 순서, 빈 것은 "없음"', () => {
  const card = meetingResultCard('협업 흐름', '결론: 진행', [{ title: '저장 구조', assignee: '강백엔' }], decisionSections({ status: 'done', decisions: [] }))
  const heads = card.detail.split('\n').filter((l) => l.startsWith('## '))
  assert.deepEqual(heads, ['## 결정 사항(직접)', '## 위임 결정', '## 답하지 않음', '## 할 일 (담당 제안)', '## 회의록'])
  assert.match(card.detail, /## 답하지 않음\n- 없음/)
  assert.match(card.detail, /원본으로 다시 덮어써요/)
  assert.deepEqual(meetingCardItems(card.detail), ['저장 구조'])
  const empty = meetingResultCard('빈 회의', '', [], decisionSections({ status: 'done', decisions: [] }))
  assert.match(empty.detail, /## 할 일 \(담당 제안\)\n- 없음/)
  assert.match(empty.detail, /## 회의록\n- 없음/)
})

test('옛 결과 카드의 "## 할 일" 목록도 읽는다', () => {
  assert.deepEqual(meetingCardItems('안내\n\n## 할 일\n1. 옛 할 일 (담당 제안: 김기획)\n\n## 회의록\n결론'), ['옛 할 일'])
})
