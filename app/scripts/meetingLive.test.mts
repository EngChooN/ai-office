// 회의실 개편 — 바퀴·차례 계산, 결과 고르기, 회의 기획안, 예전 결과물 판정 (docs/design/meeting-live/decision.md)
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { meetingChairId, meetingProgress, roundBreakAt } from '../src/shared/meetingProgress.ts'
import { buildMeetingPlan, isOutcomeChoice, minutesMarkdown, needsOutcome, outcomeTaskId, parseActionItems, shouldOpenOutcome } from '../src/shared/meetingOutcome.ts'
import { isLegacyEntry } from '../src/shared/gallery.ts'
import { listArtifacts, saveArtifact } from '../src/main/artifactStore.ts'
import type { Meeting } from '../src/shared/types.ts'

const msg = (staffId: string) => ({ staffId, name: staffId, text: '…', ts: 0 })
const live = (n: number, extra: Partial<Meeting> = {}): Meeting => ({
  id: 'm',
  topic: '주제',
  participantIds: ['a', 'b', 'c'],
  rounds: 2,
  status: 'running',
  messages: ['a', 'b', 'c', 'a', 'b', 'c'].slice(0, n).map(msg),
  summary: '',
  createdAt: 0,
  ...extra,
})

test('바퀴·차례: 발언 수로 지금 바퀴·말하는 사람·다음 사람을 센다', () => {
  assert.deepEqual(meetingProgress(live(0)), { round: 1, rounds: 2, spokenInRound: 0, doneIds: [], speakingId: 'a', nextId: 'b', state: 'speaking' })
  // 한 바퀴 직전: c 차례, 다음은 2바퀴의 a
  assert.deepEqual(meetingProgress(live(2)), { round: 1, rounds: 2, spokenInRound: 2, doneIds: ['a', 'b'], speakingId: 'c', nextId: 'a', state: 'speaking' })
  // 한 바퀴 직후: 2바퀴째, 막대는 비고 ✓도 새로
  assert.deepEqual(meetingProgress(live(3)), { round: 2, rounds: 2, spokenInRound: 0, doneIds: [], speakingId: 'a', nextId: 'b', state: 'speaking' })
  // 마지막 발언자는 다음이 없다
  assert.equal(meetingProgress(live(5))?.nextId, null)
})

test('결정 대기: 말하는 사람은 없고, 답이 오면 이어 말할 사람이 다음', () => {
  const p = meetingProgress(live(1, { status: 'waiting' }))
  assert.equal(p?.state, 'decision')
  assert.equal(p?.speakingId, null)
  assert.equal(p?.nextId, 'b')
})

test('마지막 발언의 결정 요청: 회의록이 아니라 결정 대기, 다음 차례는 없다', () => {
  assert.deepEqual(meetingProgress(live(6, { status: 'waiting' })), { round: 2, rounds: 2, spokenInRound: 3, doneIds: ['a', 'b', 'c'], speakingId: null, nextId: null, state: 'decision' })
  // 끝내기 신호 뒤엔 회의록 쓰는 중
  assert.equal(meetingProgress(live(6, { status: 'waiting', phase: 'minutes' }))?.state, 'minutes')
})

test('회의록 쓰는 중: 끝내기 신호(phase)나 모든 발언이 끝나면 말하는 사람 없이 그 바퀴 그대로', () => {
  const stopped = meetingProgress(live(4, { phase: 'minutes' }))
  assert.deepEqual(stopped, { round: 2, rounds: 2, spokenInRound: 1, doneIds: ['a'], speakingId: null, nextId: null, state: 'minutes' })
  const full = meetingProgress(live(6))
  assert.equal(full?.state, 'minutes')
  assert.equal(full?.spokenInRound, 3)
})

test('연습 회의·데모데이·끝난 회의·참석자 없음은 계산하지 않는다 (기존 화면)', () => {
  assert.equal(meetingProgress(live(1, { isPractice: true })), null)
  assert.equal(meetingProgress(live(1, { kind: 'demo' })), null)
  assert.equal(meetingProgress(live(1, { status: 'done' })), null)
  assert.equal(meetingProgress(live(0, { participantIds: [] })), null)
})

test('바퀴 구분 줄은 2바퀴째부터 바퀴가 바뀌는 발언 앞에만', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((i) => roundBreakAt(i, 3)), [null, null, null, 2, null, null, 3])
  assert.equal(roundBreakAt(3, 0), null)
})

test('진행자: 리드인 참석자, 없으면 첫 참석자', () => {
  assert.equal(meetingChairId(['a', 'b'], (id) => id === 'b'), 'b')
  assert.equal(meetingChairId(['a', 'b'], () => false), 'a')
  assert.equal(meetingChairId([], () => false), null)
})

test('결과 고르기 창: 이 화면이 본 진행 중 → 끝남+고르기 전일 때만 저절로 연다', () => {
  const pending = { status: 'done' as const, outcome: { state: 'pending' as const, at: 1 } }
  assert.equal(shouldOpenOutcome({ status: 'running' }, pending), true)
  assert.equal(shouldOpenOutcome({ status: 'waiting' }, pending), true)
  // 앱을 다시 켜서 처음부터 끝난 회의
  assert.equal(shouldOpenOutcome(undefined, pending), false)
  assert.equal(shouldOpenOutcome({ status: 'done', outcome: pending.outcome }, pending), false)
  // 정리 없이 끝냄·예전 회의(outcome 없음)
  assert.equal(shouldOpenOutcome({ status: 'running' }, { status: 'stopped' }), false)
  assert.equal(shouldOpenOutcome({ status: 'running' }, { status: 'done' }), false)
})

test("'결과 고르기' 단추: 고르기 전만, outcome 없는 예전 회의는 처리된 것으로", () => {
  assert.equal(needsOutcome({ status: 'done', outcome: { state: 'pending', at: 1 } }), true)
  assert.equal(needsOutcome({ status: 'done', outcome: { state: 'plan', at: 1 } }), false)
  assert.equal(needsOutcome({ status: 'done' }), false)
})

const minutes = `결론: 회의실을 나눈다.
합의 사항:
- 없음
할 일:
- [할 일] **회의 화면 만들기** (담당: 박개발)
- [ ] 문구 다듬기 (담당 제안: 모름)
- 시안 정리
대표 결정:
- 바퀴 막대를 쓴다`

test('할 일 뽑기: "할 일:" 아래 글머리표만, 담당은 따로', () => {
  assert.deepEqual(parseActionItems(minutes), [
    { title: '회의 화면 만들기', assignee: '박개발' },
    { title: '문구 다듬기', assignee: '모름' },
    { title: '시안 정리', assignee: null },
  ])
  assert.deepEqual(parseActionItems('할 일: 없음\n- 무시'), [])
})

test('회의 기획안: 할 일마다 하위 업무, 담당 이름이 맞으면 그 사람 · 아니면 진행자, 할 일이 없으면 주제 하나', () => {
  const people = [
    { id: 'p1', name: '박개발' },
    { id: 'p2', name: '이디자' },
  ]
  const chair = { id: 'c', name: '정리드' }
  const labels = { spec: '머리말', itemDetail: '회의에서 나온 할 일' }
  const plan = buildMeetingPlan({ topic: '회의실 개편', summary: minutes }, people, chair, labels)
  assert.equal(plan.title, '회의실 개편')
  assert.ok(plan.spec.startsWith('머리말\n\n결론:'))
  assert.ok(plan.spec.includes('대표 결정:'))
  assert.deepEqual(
    plan.subtasks.map((s) => [s.title, s.assigneeId]),
    [
      ['회의 화면 만들기', 'p1'],
      ['문구 다듬기', 'c'],
      ['시안 정리', 'c'],
    ],
  )
  const empty = buildMeetingPlan({ topic: '짧은 회의', summary: '결론: 없음\n할 일: 없음' }, people, chair, labels)
  assert.deepEqual(empty.subtasks, [{ title: '짧은 회의', detail: '회의에서 나온 할 일', assigneeId: 'c', assigneeName: '정리드' }])
})

test('예전 결과물: 표시(origin)가 없는 갤러리 항목', () => {
  assert.equal(isLegacyEntry({}), true)
  assert.equal(isLegacyEntry({ origin: 'owner' }), false)
  assert.equal(isLegacyEntry({ origin: 'meeting' }), false)
})

test('결과물 표시 저장: 새로 올리면 붙고, 예전 결과물은 새 버전이 올라올 때 붙는다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-live-'))
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-live-src-'))
  const file = path.join(src, 'note.md')
  const owner = { staffId: 's1', staffName: '정리드', taskId: null }
  fs.writeFileSync(file, '# v1')
  // 예전 방식(표시 없음)으로 올린 것
  assert.equal(saveArtifact(root, { title: '노트', source: file, ...owner }).ok, true)
  assert.equal(listArtifacts(root)[0].origin, undefined)
  // 같은 내용을 다시 올리면 버전도 표시도 그대로
  saveArtifact(root, { title: '노트', source: file, ...owner, origin: 'owner' })
  assert.equal(listArtifacts(root)[0].origin, undefined)
  // 새 버전이 올라오면 그때부터 표시
  fs.writeFileSync(file, '# v2')
  saveArtifact(root, { title: '노트', source: file, ...owner, origin: 'meeting' })
  const [a] = listArtifacts(root)
  assert.equal(a.version, 2)
  assert.equal(a.origin, 'meeting')
})

test('고르기 값 검사: 세 종류와 문서 형식(md·html)만', () => {
  for (const ok of [{ kind: 'plan' }, { kind: 'skip' }, { kind: 'artifact', format: 'md' }, { kind: 'artifact', format: 'html' }]) assert.equal(isOutcomeChoice(ok), true, JSON.stringify(ok))
  for (const bad of [{}, null, [], 'plan', { kind: 'artifact' }, { kind: 'artifact', format: 'pdf' }, { kind: 'other' }]) assert.equal(isOutcomeChoice(bad), false, JSON.stringify(bad))
})

test("'결과 보기': 결재 올림·결과물 맡김만 그 업무 카드로, 건너뜀·처리 중·고르기 전·예전 회의는 없음", () => {
  assert.equal(outcomeTaskId({ state: 'plan', at: 0, ref: 't1' }), 't1')
  assert.equal(outcomeTaskId({ state: 'artifact', at: 0, ref: 't2' }), 't2')
  for (const o of [{ state: 'skipped' as const, at: 0 }, { state: 'working' as const, at: 0 }, { state: 'pending' as const, at: 0 }, { state: 'plan' as const, at: 0 }, undefined]) assert.equal(outcomeTaskId(o), null)
})

test('회의록 그리기: 글머리표 다음 제목 줄 앞에 빈 줄을 넣어 앞 항목에 붙지 않게, 이어지는 글머리표·들여쓴 줄은 그대로', () => {
  const src = '결론: 나눈다\n합의 사항:\n- 전용 화면\n할 일:\n- [할 일] 화면 (담당: 박개발)\n  자세히\n- 문구'
  assert.equal(minutesMarkdown(src), '결론: 나눈다\n합의 사항:\n- 전용 화면\n\n할 일:\n- [할 일] 화면 (담당: 박개발)\n  자세히\n- 문구')
  assert.equal(parseActionItems(minutesMarkdown('합의 사항:\n- 전용 화면\n할 일:\n- [할 일] 화면 (담당: 박개발)\n- 문구')).length, 2)
})
